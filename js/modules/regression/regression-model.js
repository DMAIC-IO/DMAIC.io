/**
 * D.Mike — Regression Analysis Model (regression-model.js)
 *
 * Holds the persistent configuration (selected predictor columns, response key,
 * regression type, degree, confidence/alpha, CI/PI flags, active tab, excluded
 * terms, sort flag, DoE import source, saved models-store id/name, example
 * worksheet id) plus the (function-stripped) fit result(s). Adds the analysis
 * orchestration that reads the live worksheet via a stateManager and shapes the
 * (X, y) inputs — ALL regression statistics stay in
 * `engines/regression-engine.js` (fitFromSpec, runRegression, computeVIF,
 * generatePolynomialTerms, lackOfFitTest, …). No DOM, no i18n, no CSS, no view
 * flags.
 *
 * `result` / `perXResults` are persisted with all function-valued properties
 * stripped (the polynomial fit carries `predict` closures that are recomputed
 * on reload) — exactly as the legacy `getState()` did, so the persistence shape
 * stays byte-for-byte compatible.
 */

import {
  runRegression, computeVIF, generatePolynomialTerms, fitFromSpec, lackOfFitTest,
} from '../../engines/regression-engine.js';
import { tInv } from '../../engines/math-utils.js';
import { refToKey, keyToRef } from '../../ui/column-picker.js';

const REG_TYPES = ['polynomial', 'exponential', 'logarithmic', 'power'];
const TABS = ['scatter', 'residuals', 'order', 'qq', 'histogram', 'ss-pie', 'main-effects', 'interaction'];

/**
 * Count polynomial terms for k predictors at given degree.
 * Mirrors buildPolyDesignMatrix in regression-engine.js.
 */
export function polyTermCount(k, degree) {
  let p = 1 + k;
  if (degree >= 2) p += k + k * (k - 1) / 2;
  if (degree >= 3) p += k + k * (k - 1) + k * (k - 1) * (k - 2) / 6;
  return p;
}

/**
 * Recursively strip function-valued properties so the result can be
 * structured-cloned into the module-state cache. The polynomial fit carries
 * `predict` closures (top-level and on `fit`) — those are recomputed on reload
 * and don't need to be persisted.
 */
export function stripFunctions(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripFunctions);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'function') continue;
    out[k] = (v && typeof v === 'object') ? stripFunctions(v) : v;
  }
  return out;
}

export class State {
  /** @type {Array<{instanceId:string, sheetId:string, columnId:string}>} */
  colRefs = [];
  /** @type {string|null} Y column key (from separate dropdown). */
  yKey = null;
  /** @type {'polynomial'|'exponential'|'logarithmic'|'power'} */
  regType = 'polynomial';
  /** @type {1|2|3} */
  polyDegree = 1;
  /** Confidence level (decimal). null on a fresh model → resolved in init(). */
  confLevel = null;
  /** Alpha risk (decimal). null on a fresh model → resolved in init(). */
  alpha = null;
  showCI = true;
  showPI = false;
  /** Single combined result (polynomial), function-stripped. */
  result = null;
  /** Per-X results (exp/log/power), function-stripped. */
  perXResults = null;
  activeXKey = null;
  /** @type {string} */
  activeTab = 'scatter';
  excludedTerms = [];
  coefSortByP = false;
  /** Tracks the experiment-import preset that produced the current X/Y selection. */
  activeImportSource = null;
  /** Set after the user clicks "save as model"; subsequent clicks update in place. */
  savedModelId = null;
  savedModelName = null;
  /** Worksheet provisioned via loadExample (removed/recreated each load). */
  exampleWorksheetId = null;

  // ── Gates ─────────────────────────────────────────────────────

  /** True when there is a result or any selected column — drives loadExample confirm. */
  hasContent() {
    return (this.colRefs?.length > 0) || Boolean(this.yKey) || Boolean(this.result)
      || Boolean(this.perXResults && Object.keys(this.perXResults).length > 0);
  }

  /** True when at least one predictor and a response column are selected. */
  canRun() {
    return this.colRefs.length > 0 && Boolean(this.yKey);
  }

  /** @returns {boolean} */
  get isPolynomial() { return this.regType === 'polynomial'; }

  /** Active result selector (combined poly, or the active per-X single model). */
  get activeResult() {
    if (this.result) return this.result;
    if (this.perXResults && this.activeXKey) return this.perXResults[this.activeXKey] ?? null;
    return null;
  }

  // ── Persistence ───────────────────────────────────────────────

  toJSON() {
    return {
      colRefs: this.colRefs.map(r => ({ ...r })),
      yKey: this.yKey,
      regType: this.regType,
      polyDegree: this.polyDegree,
      confLevel: this.confLevel,
      alpha: this.alpha,
      showCI: this.showCI,
      showPI: this.showPI,
      result: stripFunctions(this.result),
      perXResults: stripFunctions(this.perXResults),
      activeXKey: this.activeXKey,
      activeTab: this.activeTab,
      excludedTerms: [...this.excludedTerms],
      coefSortByP: this.coefSortByP,
      activeImportSource: this.activeImportSource,
      savedModelId: this.savedModelId,
      savedModelName: this.savedModelName,
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d) return s;
    if (Array.isArray(d.colRefs)) s.colRefs = d.colRefs.filter(Boolean).map(r => ({ ...r }));
    s.yKey = typeof d.yKey === 'string' ? d.yKey : null;
    s.regType = REG_TYPES.includes(d.regType) ? d.regType : 'polynomial';
    s.polyDegree = (d.polyDegree === 1 || d.polyDegree === 2 || d.polyDegree === 3) ? d.polyDegree : 1;
    s.confLevel = (typeof d.confLevel === 'number' && d.confLevel > 0 && d.confLevel < 1) ? d.confLevel : null;
    s.alpha = (typeof d.alpha === 'number' && d.alpha > 0 && d.alpha < 1) ? d.alpha : null;
    s.showCI = typeof d.showCI === 'boolean' ? d.showCI : true;
    s.showPI = typeof d.showPI === 'boolean' ? d.showPI : false;
    s.result = (d.result && typeof d.result === 'object') ? stripFunctions(d.result) : null;
    s.perXResults = (d.perXResults && typeof d.perXResults === 'object') ? stripFunctions(d.perXResults) : null;
    s.activeXKey = typeof d.activeXKey === 'string' ? d.activeXKey : null;
    s.activeTab = TABS.includes(d.activeTab) ? d.activeTab : 'scatter';
    s.excludedTerms = Array.isArray(d.excludedTerms) ? d.excludedTerms.filter(t => typeof t === 'string') : [];
    s.coefSortByP = typeof d.coefSortByP === 'boolean' ? d.coefSortByP : false;
    s.activeImportSource = (d.activeImportSource && typeof d.activeImportSource === 'object') ? d.activeImportSource : null;
    s.savedModelId = typeof d.savedModelId === 'string' ? d.savedModelId : null;
    s.savedModelName = typeof d.savedModelName === 'string' ? d.savedModelName : null;
    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;
    return s;
  }

  // ── Worksheet column reads (take a stateManager) ──────────────

  /** Coerce a raw cell value to a number, honouring date/time columns. */
  toNumeric(val, colType) {
    if (val == null) return null;
    if (colType === 'date') {
      if (typeof val !== 'string') return null;
      const t = Date.parse(val);
      return Number.isFinite(t) ? t : null;
    }
    if (colType === 'time') {
      if (typeof val !== 'string') return null;
      const m = val.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (!m) return null;
      return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + (m[3] ? parseInt(m[3]) : 0);
    }
    return (typeof val === 'number' && !isNaN(val)) ? val : null;
  }

  resolveColumn(sm, ref) {
    if (!ref) return null;
    const ws = sm.getModuleState(ref.instanceId);
    if (!ws?.sheets) return null;
    const sheet = ws.sheets.find(s => s.id === ref.sheetId);
    if (!sheet?.state?.columns) return null;
    return sheet.state.columns.find(c => c.id === ref.columnId) || null;
  }

  getRawNumericValues(sm, ref) {
    const col = this.resolveColumn(sm, ref);
    if (!col) return [];
    // Categorical factor columns (written by the DoE planner) carry a
    // label → coded-value map on column.meta. Translate text values through
    // it so the regression sees a numeric design column.
    const coding = col.meta?.categoricalCoding;
    if (coding) {
      return (col.values || []).map(v => {
        if (v == null) return null;
        const c = coding[String(v)];
        return Number.isFinite(c) ? c : null;
      });
    }
    return (col.values || []).map(v => this.toNumeric(v, col.type));
  }

  columnDisplayName(sm, ref) {
    if (!ref) return '?';
    const col = this.resolveColumn(sm, ref);
    return col ? (col.name || col.shortName || '?') : '?';
  }

  /** Get paired numeric values for two column refs, aligned by row index. */
  getPairedValues(sm, refA, refB) {
    if (!refA || !refB) return null;
    const rawA = this.getRawNumericValues(sm, refA);
    const rawB = this.getRawNumericValues(sm, refB);
    const len = Math.min(rawA.length, rawB.length);
    const x = [], y = [];
    for (let i = 0; i < len; i++) {
      if (rawA[i] !== null && rawB[i] !== null) { x.push(rawA[i]); y.push(rawB[i]); }
    }
    return x.length > 0 ? { x, y } : null;
  }

  /**
   * Read a worksheet column and classify it for ModelSpec consumption.
   * Categorical detection: any column carrying `meta.categoricalCoding` (set by
   * the DoE planner) is treated as `kind: 'categorical'` with the level order
   * taken from the coding map. The reference level is the first key.
   */
  getColumnDescriptor(sm, ref) {
    const col = this.resolveColumn(sm, ref);
    const name = col ? (col.name || col.shortName || '?') : '?';
    if (!col) return { kind: 'continuous', name, values: [] };
    const coding = col.meta?.categoricalCoding;
    if (coding && Object.keys(coding).length >= 2) {
      const levels = Object.keys(coding);
      return {
        kind: 'categorical', name, levels, reference: levels[0],
        values: (col.values || []).map(v => (v == null ? null : String(v))),
      };
    }
    return {
      kind: 'continuous', name,
      values: (col.values || []).map(v => this.toNumeric(v, col.type)),
    };
  }

  // ── DoE Import ────────────────────────────────────────────────
  // Builds a flat list of "import this experiment as model X" presets, one per
  // (experiment × response × variant) combination.

  /** @returns {Array<object>} */
  listExperimentImports(sm) {
    const experiments = sm.get('experiments') ?? {};
    const out = [];
    for (const [expId, exp] of Object.entries(experiments)) {
      const wsRef = exp?.runMatrix?.worksheetRef;
      const tags = exp?.runMatrix?.columnTags;
      if (!wsRef || !tags) continue;
      const factorRefs = tags.factors.map(cid => ({ instanceId: wsRef.instanceId, sheetId: wsRef.sheetId, columnId: cid }));
      const polyDegree = exp.plannedTerms?.quadratic ? 2 : 1;
      const expLabel = exp.name || `DoE ${expId.slice(0, 6)}`;
      (exp.responseColumns || []).forEach((resp, i) => {
        const yRefRaw = { instanceId: wsRef.instanceId, sheetId: wsRef.sheetId, columnId: resp.columnId };
        out.push({
          key: `${expId}|raw|${i}`, label: `${expLabel} — ${resp.name}`,
          factorRefs, yRef: yRefRaw, polyDegree,
          experimentId: expId, sourceColumn: resp.columnId, transform: 'identity',
        });
        if (resp.meanColumnId) {
          out.push({
            key: `${expId}|mean|${i}`, label: `${expLabel} — ${resp.name} (Mean)`,
            factorRefs, yRef: { instanceId: wsRef.instanceId, sheetId: wsRef.sheetId, columnId: resp.meanColumnId },
            polyDegree, experimentId: expId, sourceColumn: resp.meanColumnId, transform: 'mean',
          });
        }
        if (resp.lnVarColumnId) {
          out.push({
            key: `${expId}|lnvar|${i}`, label: `${expLabel} — ${resp.name} (lnVar)`,
            factorRefs, yRef: { instanceId: wsRef.instanceId, sheetId: wsRef.sheetId, columnId: resp.lnVarColumnId },
            polyDegree, experimentId: expId, sourceColumn: resp.lnVarColumnId, transform: 'lnvar',
          });
        }
      });
    }
    return out;
  }

  /** Apply a preset from listExperimentImports() onto the model (no re-run). */
  applyExperimentImport(sm, key) {
    const opt = this.listExperimentImports(sm).find(o => o.key === key);
    if (!opt) return false;
    this.colRefs = opt.factorRefs.map(r => ({ ...r }));
    this.yKey = refToKey(opt.yRef);
    this.regType = 'polynomial';
    this.polyDegree = opt.polyDegree;
    this.excludedTerms = [];
    this.activeImportSource = {
      experimentId: opt.experimentId,
      sourceColumn: opt.sourceColumn,
      transform: opt.transform,
    };
    return true;
  }

  // ── Degree availability (raw data; view formats hints) ────────

  /**
   * Compute, per polynomial degree option, whether it is disabled (too few
   * paired rows) and the term count / available n that drive the hint text.
   * @returns {{n:number, options:Array<{deg:number, terms:number, disabled:boolean}>}}
   */
  degreeAvailability(sm) {
    const k = this.colRefs.length;
    let n = 0;
    if (k > 0 && this.yKey) {
      const yRef = keyToRef(this.yKey);
      const yRaw = this.getRawNumericValues(sm, yRef);
      const xCols = this.colRefs.map(r => this.getRawNumericValues(sm, r));
      const maxLen = Math.min(yRaw.length, ...xCols.map(c => c.length));
      for (let i = 0; i < maxLen; i++) {
        if (yRaw[i] === null) continue;
        let ok = true;
        for (let j = 0; j < xCols.length; j++) { if (xCols[j][i] === null) { ok = false; break; } }
        if (ok) n++;
      }
    }
    const options = [1, 2, 3].map(deg => {
      const terms = polyTermCount(k || 1, deg);
      return { deg, terms, disabled: n > 0 && n <= terms };
    });
    return { n, options };
  }

  // ── Analysis (delegates statistics to the engine) ─────────────

  /**
   * Run the analysis appropriate for the current regType. Mutates `this.result`
   * / `this.perXResults` / `this.activeXKey` on success and returns either
   * `{ ok: true }` or `{ ok: false, errorKey, errorParams }` / `{ errors }`.
   *
   * @param {object} sm — stateManager
   * @returns {{ok:boolean, errorKey?:string, errorParams?:object, errors?:string[]}}
   */
  runAnalysis(sm) {
    if (this.colRefs.length === 0 || !this.yKey) {
      return { ok: false, errorKey: 'errSelectBoth' };
    }
    const yRef = keyToRef(this.yKey);
    return this.isPolynomial ? this.runPolynomial(sm, yRef) : this.runSingleXModels(sm, yRef);
  }

  /** Clear all derived results. */
  clearResults() {
    this.result = null;
    this.perXResults = null;
    this.activeXKey = null;
  }

  runPolynomial(sm, yRefArg) {
    const yRef = yRefArg || keyToRef(this.yKey);
    const xRefs = this.colRefs;
    const yRaw = this.getRawNumericValues(sm, yRef);
    const yName = this.columnDisplayName(sm, yRef);
    const xDescs = xRefs.map(r => this.getColumnDescriptor(sm, r));
    const xNames = xDescs.map(d => d.name);

    const maxLen = Math.min(yRaw.length, ...xDescs.map(d => d.values.length));
    const yFiltered = [];
    const xFilteredRaw = xDescs.map(() => []);
    for (let i = 0; i < maxLen; i++) {
      if (yRaw[i] == null || !Number.isFinite(yRaw[i])) continue;
      let allOk = true;
      for (let j = 0; j < xDescs.length; j++) {
        const v = xDescs[j].values[i];
        if (xDescs[j].kind === 'continuous') {
          if (v == null || !Number.isFinite(v)) { allOk = false; break; }
        } else if (v == null || !xDescs[j].levels.includes(v)) { allOk = false; break; }
      }
      if (!allOk) continue;
      yFiltered.push(yRaw[i]);
      for (let j = 0; j < xDescs.length; j++) xFilteredRaw[j].push(xDescs[j].values[i]);
    }

    if (yFiltered.length < 3) {
      return { ok: false, errorKey: 'errMinData', errorParams: { n: yFiltered.length } };
    }

    const predictors = xDescs.map(d => d.kind === 'categorical'
      ? { id: d.name, kind: 'categorical', levels: d.levels, reference: d.reference }
      : { id: d.name, kind: 'continuous' });

    const allTerms = generatePolynomialTerms(predictors, this.polyDegree);
    const excludedSet = new Set(this.excludedTerms || []);
    const activeTerms = allTerms.filter(term => !excludedSet.has(term.id));
    const spec = { predictors, terms: activeTerms };

    const data = {
      columns: Object.fromEntries(predictors.map((p, j) => [p.id, xFilteredRaw[j]])),
      y: yFiltered,
    };

    let fit;
    try {
      fit = fitFromSpec(spec, data, { confLevel: this.confLevel });
    } catch (e) {
      const msg = String(e?.message || e);
      if (yFiltered.length <= activeTerms.length + 1) return { ok: false, errorKey: 'errInsufficientDf' };
      if (/singular|rank-deficient/i.test(msg)) return { ok: false, errorKey: 'errInsufficientDf' };
      return { ok: false, errorKey: 'errGeneric' };
    }

    // VIF on the continuous predictor columns only.
    const continuousIndices = xDescs.map((d, i) => d.kind === 'continuous' ? i : -1).filter(i => i >= 0);
    let vifFull = null;
    let vif = null;
    if (continuousIndices.length >= 2) {
      const contCols = continuousIndices.map(i => xFilteredRaw[i]);
      const fullVifs = computeVIF(contCols);
      vifFull = xDescs.map(() => null);
      continuousIndices.forEach((origIdx, k) => { vifFull[origIdx] = fullVifs[k]; });

      const activeXIndices = [];
      for (let xi = 0; xi < predictors.length; xi++) {
        if (predictors[xi].kind !== 'continuous') continue;
        const name = predictors[xi].id;
        const hasActiveTerm = activeTerms.some(term => term.factors.some(f => f.id === name));
        if (hasActiveTerm) activeXIndices.push(xi);
      }
      if (activeXIndices.length >= 2) {
        const reducedCols = activeXIndices.map(i => xFilteredRaw[i]);
        const reducedVifs = computeVIF(reducedCols);
        vif = xDescs.map(() => null);
        activeXIndices.forEach((origIdx, k) => { vif[origIdx] = reducedVifs[k]; });
      } else {
        vif = xDescs.map((_, i) => activeXIndices.includes(i) ? 1 : null);
      }
    }

    this.result = this.adaptFitToLegacyResult(fit, {
      spec, allTerms, predictors, xDescs, xNames, yName,
      xFilteredRaw, yFiltered, vif, vifFull,
    });
    this.perXResults = null;
    this.activeXKey = null;
    return { ok: true };
  }

  /**
   * Adapt a `FitFromSpecResult` into the shape the existing UI rendering
   * expects from `runMultiRegression`.
   */
  adaptFitToLegacyResult(fit, ctx) {
    const { spec, allTerms, predictors, xNames, yName,
            xFilteredRaw, yFiltered, vif, vifFull } = ctx;
    const ols = fit.ols;
    const tCrit = ols.dfError > 0 ? tInv((1 + this.confLevel) / 2, ols.dfError) : 0;

    const coefDetails = [{
      term: 'Intercept',
      coeff: ols.beta[0], se: ols.seBeta[0], t: ols.tValues[0], pval: ols.pValues[0],
      ciLow: ols.beta[0] - tCrit * ols.seBeta[0],
      ciHigh: ols.beta[0] + tCrit * ols.seBeta[0],
    }];
    for (const cd of fit.coefDetails) {
      coefDetails.push({
        term: cd.columnName, coeff: cd.coeff, se: cd.se, t: cd.t, pval: cd.pval,
        ciLow: cd.ciLow, ciHigh: cd.ciHigh, blockId: cd.blockId,
      });
    }

    const hasCategorical = predictors.some(p => p.kind === 'categorical');
    const predict = hasCategorical
      ? null
      : (xVals) => {
          const obj = {};
          predictors.forEach((p, i) => { obj[p.id] = xVals[i]; });
          return fit.predict(obj);
        };

    return {
      spec, blockMap: fit.blockMap, blocks: fit.blocks, fit, hasCategorical,

      type: 'polynomial', degree: this.polyDegree, multiX: true,
      xCount: predictors.length, xNames, _xNames: [...xNames], _nameY: yName,
      _termNames: ['Intercept', ...spec.terms.map(t => t.id)],
      _coefficients: ols.beta, confLevel: this.confLevel,

      R2: fit.diagnostics.R2, adjR2: fit.diagnostics.adjR2, R2pred: fit.diagnostics.R2pred,
      PRESS: fit.diagnostics.PRESS, Se: fit.diagnostics.sigma, Fstat: fit.diagnostics.fStat,
      fPVal: fit.diagnostics.fPValue, dw: fit.diagnostics.dw,

      SST: ols.SST, SSR: ols.SSR, SSE: ols.SSE,
      dfReg: ols.dfModel, dfRes: ols.dfError, dfTot: ols.dfModel + ols.dfError,
      MSR: ols.dfModel > 0 ? ols.SSR / ols.dfModel : 0, MSE: ols.MSE, df: ols.dfError,

      yHat: ols.predicted, residuals: ols.residuals, invXtX: ols.XtXinv,
      n: yFiltered.length, p: ols.beta.length, ys: [...yFiltered],
      xMatrix: xFilteredRaw.map(c => [...c]),

      coefDetails,
      allTerms: ['Intercept', ...allTerms.map(t => t.id)],
      excludeTerms: [...(this.excludedTerms || [])],
      vif, vifFull,

      reg: {
        coeffs: [...ols.beta], terms: ['Intercept', ...fit.coefDetails.map(c => c.columnName)],
        p: ols.beta.length, type: 'polynomial', predict,
      },
      equation: fit.equation,
    };
  }

  /**
   * Run single-X exp/log/power models. Returns `{ ok, errors }` — `errors` is a
   * list of per-column message descriptors `{ name, key, params }` that the view
   * formats. On at least one success, mutates `this.perXResults` / `activeXKey`.
   */
  runSingleXModels(sm, yRefArg) {
    const yRef = yRefArg || keyToRef(this.yKey);
    const xRefs = this.colRefs;
    const results = {};
    const errors = [];

    for (const xRef of xRefs) {
      const name = this.columnDisplayName(sm, xRef);
      const paired = this.getPairedValues(sm, xRef, yRef);
      if (!paired || paired.x.length < 3) {
        errors.push({ name, key: 'errMinData', params: { n: paired ? paired.x.length : 0 } });
        continue;
      }
      try {
        const result = runRegression(paired.x, paired.y, this.regType, this.confLevel);
        result._nameX = name;
        result._nameY = this.columnDisplayName(sm, yRef);
        results[refToKey(xRef)] = result;
      } catch (e) {
        if (e.message === 'MIN_DATA') errors.push({ name, key: 'errMinData', params: { n: paired.x.length } });
        else if (e.message === 'INSUFFICIENT_DF') errors.push({ name, key: 'errInsufficientDf' });
        else errors.push({ name, key: 'errGeneric' });
      }
    }

    if (Object.keys(results).length === 0) {
      return { ok: false, errors };
    }
    this.perXResults = results;
    this.result = null;
    const resultKeys = Object.keys(results);
    if (!this.activeXKey || !results[this.activeXKey]) this.activeXKey = resultKeys[0];
    return { ok: true, errors };
  }

  // ── Lack-of-fit (feeds the saved model record) ────────────────

  /**
   * Compute the lack-of-fit p-value for the just-fitted polynomial model. Uses
   * `replicateGroups` from the source experiment; null when no experiment is
   * linked or the design has no usable replicates.
   */
  computeLoFPValue(sm, r, y, originalToFiltered) {
    const expId = this.activeImportSource?.experimentId;
    if (!expId) return null;
    const exp = sm.get('experiments')?.[expId];
    const groups = exp?.replicateGroups;
    if (!Array.isArray(groups) || groups.length === 0) return null;
    if (!r || !Array.isArray(r.yHat) || !Number.isFinite(r.dfRes)) return null;

    const translated = [];
    for (const group of groups) {
      if (!Array.isArray(group)) continue;
      const mapped = [];
      for (const i of group) {
        const f = originalToFiltered.get(i);
        if (f != null) mapped.push(f);
      }
      if (mapped.length >= 2) translated.push(mapped);
    }
    if (translated.length === 0) return null;

    const lof = lackOfFitTest(y, r.yHat, translated, r.dfRes);
    return lof ? lof.pValue : null;
  }
}

export { refToKey, keyToRef };
