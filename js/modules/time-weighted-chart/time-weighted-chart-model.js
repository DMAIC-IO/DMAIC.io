/**
 * D.Mike — Time-Weighted Control Chart Model (time-weighted-chart-model.js)
 *
 * Pure state container for the EWMA / CUSUM chart module. Holds the chart type,
 * column selection, sigma-estimation method, baseline count, target/sigma
 * overrides, and the EWMA (λ/L) and CUSUM (k/h) parameters plus the optional
 * provisioned-worksheet id from loadExample.
 *
 * Contains no view logic, no i18n, no analysis — those live in the data-Fn.
 * EWMA / CUSUM math lives in the engine (time-weighted-chart-engine.js).
 *
 * Persistence shape matches the legacy getState() shape exactly:
 *   { chartTypeId, columnRef, sigmaMethod, baselineCount, targetOverride,
 *     sigmaOverride, lambda, L, kSigma, hSigma }
 * `exampleWorksheetId` is additive and safely defaulted to null for legacy saves.
 */

/** Default values, mirroring the legacy DEFAULTS constant. */
export const DEFAULTS = {
  chartTypeId: 'ewma',
  sigmaMethod: 'mr',     // 'mr' | 'sd'
  baselineCount: null,   // null = full series
  targetOverride: null,  // null = use baseline mean
  sigmaOverride: null,   // null = use estimateSigma
  // EWMA
  lambda: 0.2,
  L: 3,
  // CUSUM
  kSigma: 0.5,
  hSigma: 4,
};

/**
 * Validate a single column reference object.
 * @param {*} d
 * @returns {{instanceId:string, sheetId:string, columnId:string}|null}
 */
function columnRefFromJSON(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.instanceId == null || d.sheetId == null || d.columnId == null) return null;
  return {
    instanceId: String(d.instanceId),
    sheetId: String(d.sheetId),
    columnId: String(d.columnId),
  };
}

export class State {
  /** @type {'ewma'|'cusum'} */
  chartTypeId = DEFAULTS.chartTypeId;

  /** @type {{instanceId:string, sheetId:string, columnId:string}|null} */
  columnRef = null;

  /** @type {'mr'|'sd'} */
  sigmaMethod = DEFAULTS.sigmaMethod;

  /** Baseline point count, or null for "all". @type {number|null} */
  baselineCount = DEFAULTS.baselineCount;

  /** Target override μ₀, or null for auto (baseline mean). @type {number|null} */
  targetOverride = DEFAULTS.targetOverride;

  /** Sigma override σ (≥0), or null for auto. @type {number|null} */
  sigmaOverride = DEFAULTS.sigmaOverride;

  /** EWMA smoothing λ (0 < λ ≤ 1). @type {number} */
  lambda = DEFAULTS.lambda;

  /** EWMA limit width L (>0). @type {number} */
  L = DEFAULTS.L;

  /** CUSUM reference value k in σ (>0). @type {number} */
  kSigma = DEFAULTS.kSigma;

  /** CUSUM decision interval h in σ (>0). @type {number} */
  hSigma = DEFAULTS.hSigma;

  /**
   * Instance id of a worksheet provisioned by loadExample (for cleanup on re-load).
   * @type {string|null}
   */
  exampleWorksheetId = null;

  /**
   * Returns true when a column has been selected.
   * Drives the confirmPopout gate in loadExample.
   * @returns {boolean}
   */
  hasContent() {
    return this.columnRef != null;
  }

  /**
   * Serialise to plain object. Matches the legacy getState() shape.
   * `exampleWorksheetId` is additive: old saves without it are safely
   * defaulted by fromJSON.
   * @returns {object}
   */
  toJSON() {
    return {
      chartTypeId: this.chartTypeId,
      columnRef: this.columnRef ? { ...this.columnRef } : null,
      sigmaMethod: this.sigmaMethod,
      baselineCount: this.baselineCount,
      targetOverride: this.targetOverride,
      sigmaOverride: this.sigmaOverride,
      lambda: this.lambda,
      L: this.L,
      kSigma: this.kSigma,
      hSigma: this.hSigma,
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * Deserialise and validate. Always returns a valid State, even for
   * null / undefined / malformed input. Sanitisation mirrors the legacy
   * _loadState(): invalid numeric params fall back to their defaults.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    s.chartTypeId = d.chartTypeId === 'cusum' ? 'cusum' : 'ewma';
    s.columnRef = columnRefFromJSON(d.columnRef);
    s.sigmaMethod = d.sigmaMethod === 'sd' ? 'sd' : 'mr';

    // baselineCount: positive int or null (legacy used `?? DEFAULTS`, but the
    // input only ever yields finite ints or null — match that)
    s.baselineCount = Number.isFinite(d.baselineCount) ? d.baselineCount : DEFAULTS.baselineCount;

    // targetOverride: any finite number or null
    s.targetOverride = Number.isFinite(d.targetOverride) ? d.targetOverride : DEFAULTS.targetOverride;

    // sigmaOverride: finite ≥0 or null
    s.sigmaOverride = (Number.isFinite(d.sigmaOverride) && d.sigmaOverride >= 0)
      ? d.sigmaOverride : DEFAULTS.sigmaOverride;

    // lambda: 0 < λ ≤ 1 else default
    s.lambda = (Number.isFinite(d.lambda) && d.lambda > 0 && d.lambda <= 1)
      ? d.lambda : DEFAULTS.lambda;

    // L: >0 else default
    s.L = (Number.isFinite(d.L) && d.L > 0) ? d.L : DEFAULTS.L;

    // kSigma: >0 else default
    s.kSigma = (Number.isFinite(d.kSigma) && d.kSigma > 0) ? d.kSigma : DEFAULTS.kSigma;

    // hSigma: >0 else default
    s.hSigma = (Number.isFinite(d.hSigma) && d.hSigma > 0) ? d.hSigma : DEFAULTS.hSigma;

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
