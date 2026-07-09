/**
 * D.Mike — Correlation Model (correlation-model.js)
 *
 * Holds only persistence state (selected columns, confidence level, matrix
 * method, filters, example-worksheet id) + thin orchestration helpers that
 * read the live worksheet data via a stateManager and delegate ALL statistics
 * to the unchanged correlation-engine. No DOM, no i18n, no CSS, no view flags.
 *
 * The computed result / matrixResult are NOT persisted — they are derived
 * deterministically from (selection + worksheet data + confidence) and
 * recomputed transiently in the view (see correlation.js).
 */

import {
  runCorrelationAnalysis, pearsonR, spearmanR, kendallTau,
  fisherCI, kendallCI, pFromT, kendallPValue,
} from '../../engines/correlation-engine.js';
import { getColumnName } from '../../ui/column-picker.js';
import { resolveColumnRef } from '../../core/worksheet-columns.js';

const METHODS = ['pearson', 'spearman', 'kendall'];

/** Accepted column types for correlation (everything except plain text). */
const CORR_TYPES = new Set(['numeric', 'currency', 'percent', 'date', 'time']);

/** Build a pipe-delimited ref key string. */
function refKey(ref) {
  return ref ? `${ref.instanceId}|${ref.sheetId}|${ref.columnId}` : '';
}

/**
 * Parse a free-text confidence-level entry into a decimal in (0, 1).
 * Accepts "95", "95 %", "95%", "0.95", "0,95", "97,5 %", …
 * @param {string} raw
 * @returns {number | null}
 */
export function parseConfPercent(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace('%', '').replace(',', '.').trim();
  if (cleaned === '') return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  const dec = n > 1 ? n / 100 : n;
  if (dec <= 0 || dec >= 1) return null;
  return dec;
}

/**
 * Format a decimal confidence level as a percent string (trailing zeros
 * stripped). 0.95 → "95", 0.975 → "97.5".
 * @param {number} dec
 * @returns {string}
 */
export function formatConfPercent(dec) {
  return `${Number((dec * 100).toFixed(2))}`;
}

export class State {
  /** @type {Array<{ instanceId: string, sheetId: string, columnId: string }>} */
  colRefs = [];
  /**
   * Confidence level as a decimal in (0, 1). Defaults to `null` on a fresh
   * model so `init()` can resolve the app-settings default (`settings.
   * confidenceLevel`, legacy behaviour). `fromJSON` only overrides this when a
   * valid persisted value is present.
   * @type {number|null}
   */
  confidenceLevel = null;
  /** @type {'pearson'|'spearman'|'kendall'} */
  matrixMethod = 'pearson';
  /** @type {number|null} */
  filterMinR = null;
  /** @type {number|null} */
  filterMaxP = null;
  /** @type {string|null} */
  exampleWorksheetId = null;

  // ── Persistence ───────────────────────────────────────────────

  /** True when at least one column is selected (drives loadExample gate). */
  hasContent() {
    return this.colRefs.length > 0;
  }

  toJSON() {
    return {
      // Deep-copy every ref so the persisted snapshot never shares references
      // with the (reactive Alpine proxy) live model → structuredClone-safe.
      colRefs: this.colRefs.map(r => ({ ...r })),
      confidenceLevel: this.confidenceLevel,
      matrixMethod: this.matrixMethod,
      filterMinR: this.filterMinR,
      filterMaxP: this.filterMaxP,
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d) return s;

    if (Array.isArray(d.colRefs)) {
      s.colRefs = d.colRefs.filter(Boolean).map(r => ({ ...r }));
    } else if (d.colRefX || d.colRefY) {
      // Legacy format: two named refs.
      s.colRefs = [d.colRefX, d.colRefY].filter(Boolean).map(r => ({ ...r }));
    }

    if (typeof d.confidenceLevel === 'number'
        && d.confidenceLevel > 0 && d.confidenceLevel < 1) {
      s.confidenceLevel = d.confidenceLevel;
    }
    s.matrixMethod = METHODS.includes(d.matrixMethod) ? d.matrixMethod : 'pearson';
    s.filterMinR = (typeof d.filterMinR === 'number' && Number.isFinite(d.filterMinR))
      ? d.filterMinR : null;
    s.filterMaxP = (typeof d.filterMaxP === 'number' && Number.isFinite(d.filterMaxP))
      ? d.filterMaxP : null;
    s.exampleWorksheetId = (typeof d.exampleWorksheetId === 'string')
      ? d.exampleWorksheetId : null;
    // legacy d.result / d.matrixResult are intentionally dropped (derived).
    return s;
  }

  // ── Selection ─────────────────────────────────────────────────

  isSelected(ref) {
    const key = refKey(ref);
    return this.colRefs.some(r => refKey(r) === key);
  }

  /** Toggle a column ref in/out of the selection. */
  toggleColumn(ref) {
    const key = refKey(ref);
    const idx = this.colRefs.findIndex(r => refKey(r) === key);
    if (idx >= 0) {
      this.colRefs.splice(idx, 1);
    } else {
      this.colRefs.push({
        instanceId: ref.instanceId, sheetId: ref.sheetId, columnId: ref.columnId,
      });
    }
  }

  // ── Type-aware numeric coercion ───────────────────────────────

  _dateToNum(str) {
    if (typeof str !== 'string') return null;
    const t = Date.parse(str);
    return Number.isFinite(t) ? t : null;
  }

  _timeToNum(str) {
    if (typeof str !== 'string') return null;
    const m = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + (m[3] ? parseInt(m[3]) : 0);
  }

  /** Convert a single cell value to a number, respecting column type. */
  toNumeric(val, colType) {
    if (val == null) return null;
    if (colType === 'date') return this._dateToNum(val);
    if (colType === 'time') return this._timeToNum(val);
    return (typeof val === 'number' && !isNaN(val)) ? val : null;
  }

  // ── Worksheet discovery (type-aware, >= 5 numeric values) ─────

  /**
   * Discover all worksheet columns suitable for correlation, grouped by
   * sheet order. Preserves the legacy behaviour: type must be in CORR_TYPES
   * and at least 5 values must convert to a number.
   * @param {object} sm — stateManager
   * @returns {Array<object>}
   */
  discoverColumns(sm) {
    if (!sm) return [];
    const columns = [];
    for (const phase of Object.keys(sm.get('phases') || {})) {
      const instances = sm.get(`phases.${phase}`) ?? [];
      for (const inst of instances) {
        if (inst.moduleId !== 'worksheet') continue;
        const ws = sm.getModuleState(inst.instanceId);
        if (!ws?.sheets) continue;
        for (const sheet of ws.sheets) {
          if (!sheet.state?.columns) continue;
          for (const col of sheet.state.columns) {
            if (!CORR_TYPES.has(col.type)) continue;
            const numericCount = (col.values || [])
              .filter(v => this.toNumeric(v, col.type) !== null).length;
            if (numericCount < 5) continue;
            columns.push({
              instanceId: inst.instanceId,
              sheetId: sheet.id,
              sheetName: sheet.name,
              columnId: col.id,
              columnName: col.name || '',
              shortName: col.shortName || '?',
              valueCount: numericCount,
              colType: col.type,
            });
          }
        }
      }
    }
    return columns;
  }

  /** Group discovered columns into ordered {sheetName, columns[]} blocks. */
  columnGroups(sm) {
    const groups = [];
    let current = null;
    for (const col of this.discoverColumns(sm)) {
      if (!current || current.sheetName !== col.sheetName) {
        current = { sheetName: col.sheetName, columns: [] };
        groups.push(current);
      }
      current.columns.push(col);
    }
    return groups;
  }

  hasWorksheet(sm) {
    if (!sm) return false;
    for (const phase of Object.keys(sm.get('phases') || {})) {
      const instances = sm.get(`phases.${phase}`) ?? [];
      if (instances.some(i => i.moduleId === 'worksheet')) return true;
    }
    return false;
  }

  _resolveColumn(sm, ref) {
    return resolveColumnRef(sm, ref);
  }

  /** Converted, null-filtered values for one column. */
  getColumnValues(sm, ref) {
    const col = this._resolveColumn(sm, ref);
    if (!col) return [];
    return (col.values || [])
      .map(v => this.toNumeric(v, col.type))
      .filter(v => v !== null);
  }

  /** Converted values (nulls preserved) for row-aligned pairing. */
  getRawColumnValues(sm, ref) {
    const col = this._resolveColumn(sm, ref);
    if (!col) return [];
    return (col.values || []).map(v => this.toNumeric(v, col.type));
  }

  getColumnName(sm, ref) {
    return getColumnName(sm, ref);
  }

  /** Align two columns by row index, dropping rows where either is null. */
  getPairedValues(sm, refA, refB) {
    if (!refA || !refB) return null;
    const valsA = this.getRawColumnValues(sm, refA);
    const valsB = this.getRawColumnValues(sm, refB);
    const len = Math.min(valsA.length, valsB.length);
    const a = [], b = [];
    for (let i = 0; i < len; i++) {
      const va = valsA[i], vb = valsB[i];
      if (va !== null && vb !== null) { a.push(va); b.push(vb); }
    }
    return { x: a, y: b };
  }

  // ── Compute orchestration (delegates to engine) ───────────────

  /**
   * Lightweight fingerprint over the inputs that should trigger a re-run.
   */
  inputFingerprint(sm) {
    const parts = [`c=${this.confidenceLevel}`];
    for (const ref of this.colRefs) {
      const vals = this.getRawColumnValues(sm, ref);
      let sum = 0, n = 0;
      for (const v of vals) { if (v != null) { sum += v; n++; } }
      parts.push(`${ref.instanceId}|${ref.columnId}|len=${vals.length}|n=${n}|s=${sum}`);
    }
    return parts.join('::');
  }

  /**
   * Run the pairwise analysis for the (exactly two) selected columns.
   * Returns { …engineResult, _x, _y, _nameX, _nameY } or an
   * { error } object ('errMin4' | 'errZeroVariance') for the view to surface.
   */
  computePairwise(sm) {
    const paired = this.getPairedValues(sm, this.colRefs[0], this.colRefs[1]);
    if (!paired) return null;
    const { x, y } = paired;
    if (x.length < 4) return { error: 'errMin4', n: x.length };
    const result = runCorrelationAnalysis(x, y, this.confidenceLevel);
    if (isNaN(result.pearson.r)) return { error: 'errZeroVariance' };
    result._x = x;
    result._y = y;
    result._nameX = this.getColumnName(sm, this.colRefs[0]);
    result._nameY = this.getColumnName(sm, this.colRefs[1]);
    return result;
  }

  /**
   * Build the full k×k correlation matrices (pearson/spearman/kendall) plus
   * CI / p / n matrices and the upper-triangle paired data for scatter plots.
   */
  computeMatrix(sm) {
    const refs = this.colRefs;
    const k = refs.length;
    const names = refs.map(r => this.getColumnName(sm, r));
    const alpha = 1 - this.confidenceLevel;

    const matrix = { pearson: [], spearman: [], kendall: [] };
    const ciMatrix = { pearson: [], spearman: [], kendall: [] };
    const pMatrix = { pearson: [], spearman: [], kendall: [] };
    const nMatrix = [];
    const pairs = [];

    for (let i = 0; i < k; i++) {
      for (const m of METHODS) { matrix[m][i] = []; ciMatrix[m][i] = []; pMatrix[m][i] = []; }
      nMatrix[i] = [];
      for (let j = 0; j < k; j++) {
        if (i === j) {
          for (const m of METHODS) { matrix[m][i][j] = 1; ciMatrix[m][i][j] = null; pMatrix[m][i][j] = null; }
          nMatrix[i][j] = this.getColumnValues(sm, refs[i]).length;
          continue;
        }
        const paired = this.getPairedValues(sm, refs[i], refs[j]);
        if (!paired || paired.x.length < 4) {
          for (const m of METHODS) { matrix[m][i][j] = NaN; ciMatrix[m][i][j] = null; pMatrix[m][i][j] = null; }
          nMatrix[i][j] = paired ? paired.x.length : 0;
        } else if (i < j) {
          const n = paired.x.length;
          const df = n - 2;
          const pR = Math.max(-1, Math.min(1, pearsonR(paired.x, paired.y)));
          const sR = Math.max(-1, Math.min(1, spearmanR(paired.x, paired.y)));
          const kRes = kendallTau(paired.x, paired.y);
          matrix.pearson[i][j] = pR;
          matrix.spearman[i][j] = sR;
          matrix.kendall[i][j] = kRes.tau;
          const pPerfect = Math.abs(pR) >= 1;
          const sPerfect = Math.abs(sR) >= 1;
          ciMatrix.pearson[i][j] = pPerfect ? [pR, pR] : fisherCI(pR, n, alpha);
          ciMatrix.spearman[i][j] = sPerfect ? [sR, sR] : fisherCI(sR, n, alpha);
          ciMatrix.kendall[i][j] = kendallCI(kRes.tau, n, alpha);
          const pT = pPerfect ? Infinity : pR * Math.sqrt(df) / Math.sqrt(1 - pR * pR);
          const sT = sPerfect ? Infinity : sR * Math.sqrt(df) / Math.sqrt(1 - sR * sR);
          pMatrix.pearson[i][j] = pPerfect ? 0 : pFromT(pT, df);
          pMatrix.spearman[i][j] = sPerfect ? 0 : pFromT(sT, df);
          pMatrix.kendall[i][j] = kendallPValue(kRes.tau, n).p;
          nMatrix[i][j] = n;
          pairs.push({ i, j, x: paired.x, y: paired.y });
        } else {
          // Lower triangle mirrors upper.
          for (const m of METHODS) {
            matrix[m][i][j] = matrix[m][j][i];
            ciMatrix[m][i][j] = ciMatrix[m][j][i];
            pMatrix[m][i][j] = pMatrix[m][j][i];
          }
          nMatrix[i][j] = nMatrix[j][i];
        }
      }
    }

    return { names, matrix, ciMatrix, pMatrix, nMatrix, pairs };
  }
}
