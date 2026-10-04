/**
 * D.Mike — Process Capability Model (process-capability-model.js)
 *
 * Pure state container for the Process Capability module. Holds the
 * user-entered specification parameters, the σ within estimator choice, the
 * referenced value and subgroup-ID columns and any values embedded directly
 * from a catalog example. Contains no view logic, no i18n and no statistics —
 * the analysis result is derived (transiently) in the view layer from these
 * inputs plus the live worksheet data via `engines/process-capability-engine.js`,
 * so it is intentionally NOT persisted.
 *
 * Params are stored as the raw strings the inputs show (Alpine `x-model`).
 * `fromJSON` accepts the legacy numeric persistence shape (NaN = empty) and the
 * legacy fractional `confidence` (0.95 → "95").
 */

import { WITHIN_METHODS } from '../../engines/sigma-within-engine.js';

/**
 * Coerce a persisted numeric/string spec field into the raw string the input
 * shows. Legacy projects persisted lsl/usl/target as numbers (NaN when empty).
 * @param {*} v
 * @returns {string}
 */
function numStr(v) {
  if (v == null) return '';
  if (typeof v === 'number') return isNaN(v) ? '' : String(v);
  const s = String(v).trim();
  return s;
}

/**
 * Coerce a persisted confidence value into a percent string ("95").
 * Legacy stored a fraction (0 < c <= 1); current stores a percent string.
 * @param {*} v
 * @returns {string}
 */
function confStr(v) {
  if (v == null || v === '') return '95';
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  if (!isFinite(n) || n <= 0) return '95';
  // Fractional legacy value (0 < c <= 1) → percent
  const pct = n <= 1 ? n * 100 : n;
  return String(Number(pct.toFixed(2)));
}

/**
 * Parse a subgroup size into a positive integer; anything else means 1.
 * @param {*} v
 * @returns {number}
 */
function subgroupInt(v) {
  const n = Math.trunc(typeof v === 'number' ? v : parseFloat(String(v ?? '').trim()));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Parse a moving-range span: an integer 2 … 100; anything else means 2.
 * @param {*} v
 * @returns {number}
 */
function spanInt(v) {
  const s = String(v ?? '').trim();
  if (!/^\d+$/.test(s)) return 2;
  const n = Number(s);
  return n >= 2 && n <= 100 ? n : 2;
}

/** @param {*} v @returns {string} a known estimator key or '' (engine default) */
function methodStr(v) {
  return WITHIN_METHODS.includes(v) ? v : '';
}

/** @param {*} d @returns {{instanceId:string,sheetId:string,columnId:string}|null} */
function columnRefFromJSON(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.instanceId == null || d.sheetId == null || d.columnId == null) return null;
  return {
    instanceId: String(d.instanceId),
    sheetId: String(d.sheetId),
    columnId: String(d.columnId),
  };
}

/** @param {*} arr @returns {number[]|null} */
function embeddedFromJSON(arr) {
  if (!Array.isArray(arr)) return null;
  return arr.filter(v => typeof v === 'number' && !isNaN(v));
}

export class State {
  /** User-entered specification parameters (raw strings, as typed). */
  params = {
    name: '',
    lsl: '',
    usl: '',
    target: '',
    unit: 'mm',
    confidence: '95',
    /** 1 = individuals (σ within from MR̄/d2), ≥ 2 = consecutive subgroups (pooled SD). */
    subgroupSize: '1',
    /** 'size' = fixed subgroup size, 'column' = subgroups from an ID column. */
    subgroupMode: 'size',
    /** σ within estimator key (sigma-within-engine WITHIN_METHODS); '' = engine default. */
    withinMethod: '',
    /** Use c4 / c4′ for pooled SD, S̄ and √MSSD. */
    unbiased: true,
    /** Moving-range span w (average/median moving range). */
    mrSpan: '2',
  };

  /** Referenced worksheet column, or null. */
  columnRef = null;

  /** Worksheet column holding the subgroup IDs (mode 'column'), or null. */
  subgroupColumnRef = null;

  /** Values embedded directly from an example (bypasses the worksheet), or null. */
  embeddedValues = null;

  /** Display label for embedded example data. */
  embeddedLabel = '';

  /** @returns {number} subgroup size as a positive integer (invalid input → 1). */
  subgroupSizeValue() {
    return subgroupInt(this.params.subgroupSize);
  }

  /** @returns {number} moving-range span 2 … 100 (invalid input → 2). */
  mrSpanValue() {
    return spanInt(this.params.mrSpan);
  }

  /** @returns {'size'|'column'} embedded example data always use the fixed size. */
  effectiveSubgroupMode() {
    return this.embeddedValues ? 'size' : this.params.subgroupMode;
  }

  /** @returns {boolean} value and ID column are set, on the same sheet and distinct. */
  subgroupColumnMatches() {
    const a = this.columnRef;
    const b = this.subgroupColumnRef;
    return Boolean(a && b && a.instanceId === b.instanceId && a.sheetId === b.sheetId
      && a.columnId !== b.columnId);
  }

  /** Reset embedded-example mode. */
  clearEmbedded() {
    this.embeddedValues = null;
    this.embeddedLabel = '';
  }

  /** @returns {boolean} true if any meaningful field is set (drives confirmPopout). */
  hasContent() {
    const p = this.params;
    return Boolean(this.columnRef) || Boolean(this.subgroupColumnRef)
      || (Array.isArray(this.embeddedValues) && this.embeddedValues.length > 0)
      || Boolean(p.name) || Boolean(p.lsl) || Boolean(p.usl) || Boolean(p.target);
  }

  toJSON() {
    return {
      params: {
        name: this.params.name,
        lsl: this.params.lsl,
        usl: this.params.usl,
        target: this.params.target,
        unit: this.params.unit,
        confidence: this.params.confidence,
        subgroupSize: this.params.subgroupSize,
        subgroupMode: this.params.subgroupMode,
        withinMethod: this.params.withinMethod,
        unbiased: this.params.unbiased,
        mrSpan: this.params.mrSpan,
      },
      columnRef: this.columnRef ? { ...this.columnRef } : null,
      subgroupColumnRef: this.subgroupColumnRef ? { ...this.subgroupColumnRef } : null,
      embeddedValues: this.embeddedValues ? [...this.embeddedValues] : null,
      embeddedLabel: this.embeddedLabel || '',
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State, even for
   * null/undefined/malformed input. Accepts legacy numeric params and the
   * legacy fractional confidence. The derived `lastResult` field is ignored.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    const p = d.params && typeof d.params === 'object' ? d.params : {};
    s.params.name = typeof p.name === 'string' ? p.name : '';
    s.params.lsl = numStr(p.lsl);
    s.params.usl = numStr(p.usl);
    s.params.target = numStr(p.target);
    s.params.unit = typeof p.unit === 'string' && p.unit ? p.unit : 'mm';
    s.params.confidence = confStr(p.confidence);
    s.params.subgroupSize = String(subgroupInt(p.subgroupSize));
    s.params.subgroupMode = p.subgroupMode === 'column' ? 'column' : 'size';
    s.params.withinMethod = methodStr(p.withinMethod);
    s.params.unbiased = typeof p.unbiased === 'boolean' ? p.unbiased : true;
    s.params.mrSpan = String(spanInt(p.mrSpan));

    s.columnRef = columnRefFromJSON(d.columnRef);
    s.subgroupColumnRef = columnRefFromJSON(d.subgroupColumnRef);
    s.embeddedValues = embeddedFromJSON(d.embeddedValues);
    s.embeddedLabel = typeof d.embeddedLabel === 'string' ? d.embeddedLabel : '';

    return s;
  }
}
