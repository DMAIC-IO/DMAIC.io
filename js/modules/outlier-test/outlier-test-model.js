/**
 * D.Mike — Outlier Test Model (outlier-test-model.js)
 *
 * Pure state container for the Outlier Test module. Holds all user-configurable
 * parameters, the referenced worksheet column, and the example worksheet id.
 *
 * The analysis result is computed transiently in the view layer — it is NOT
 * persisted here.
 *
 * Persistence shape matches the legacy getState() exactly:
 *   colRef, alpha, side, tukeyFactor, hampelK, zThreshold, modZThreshold,
 *   esdMaxOutliers, enabled (Array), chartMethod, exampleWorksheetId
 */

/** All supported outlier-detection method ids, in display order. */
export const ALL_METHODS = [
  'grubbs',
  'dixon-q',
  'generalized-esd',
  'tukey-iqr',
  'hampel',
  'z-score',
  'modified-z',
];

const VALID_SIDES = ['two-sided', 'upper', 'lower'];

/**
 * Deserialize a column reference object.
 * @param {*} d
 * @returns {{ instanceId: string, sheetId: string, columnId: string }|null}
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

/**
 * Coerce a value to a number, returning a fallback if it is not finite.
 * @param {*} v
 * @param {number} fallback
 * @returns {number}
 */
function numOrDefault(v, fallback) {
  if (v == null) return fallback;
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

export class State {
  /** Referenced worksheet column, or null. */
  colRef = null;

  /**
   * Significance level (0 < alpha < 1).
   * null = not yet resolved; init() reads from global settings (1 - confidence/100).
   */
  alpha = null;

  /** 'two-sided' | 'upper' | 'lower' */
  side = 'two-sided';

  /** Tukey IQR multiplier (default 1.5). */
  tukeyFactor = 1.5;

  /** Hampel identifier threshold in MAD units (default 3). */
  hampelK = 3;

  /** Z-score threshold (default 3). */
  zThreshold = 3;

  /** Modified Z-score threshold (Iglewicz-Hoaglin, default 3.5). */
  modZThreshold = 3.5;

  /**
   * Maximum number of outliers for Generalized ESD.
   * null = auto (floor(n/4), capped at 10).
   */
  esdMaxOutliers = null;

  /**
   * Enabled methods as an Array of method ids.
   * All 7 methods are enabled by default.
   */
  enabled = [...ALL_METHODS];

  /** Which method the chart highlights — 'all' = union of all enabled methods. */
  chartMethod = 'all';

  /** Instance id of a worksheet provisioned by loadExample (for cleanup on re-load). */
  exampleWorksheetId = null;

  /**
   * Returns true if the module has meaningful content (drives confirmPopout).
   * @returns {boolean}
   */
  hasContent() {
    return this.colRef !== null;
  }

  /**
   * Serialize to a plain object. Shape matches legacy getState() exactly.
   * @returns {object}
   */
  toJSON() {
    return {
      colRef: this.colRef ? { ...this.colRef } : null,
      alpha: this.alpha,
      side: this.side,
      tukeyFactor: this.tukeyFactor,
      hampelK: this.hampelK,
      zThreshold: this.zThreshold,
      modZThreshold: this.modZThreshold,
      esdMaxOutliers: this.esdMaxOutliers,
      enabled: [...this.enabled],
      chartMethod: this.chartMethod,
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State.
   * Accepts null/undefined/malformed input by returning sensible defaults.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    s.colRef = columnRefFromJSON(d.colRef);

    // alpha: null means "not yet resolved from global settings"
    s.alpha = (d.alpha != null && isFinite(Number(d.alpha))) ? Number(d.alpha) : null;

    s.side = VALID_SIDES.includes(d.side) ? d.side : 'two-sided';

    s.tukeyFactor = numOrDefault(d.tukeyFactor, 1.5);
    s.hampelK = numOrDefault(d.hampelK, 3);
    s.zThreshold = numOrDefault(d.zThreshold, 3);
    s.modZThreshold = numOrDefault(d.modZThreshold, 3.5);

    // esdMaxOutliers: null = auto; must be a positive integer when set
    if (d.esdMaxOutliers != null) {
      const n = parseInt(d.esdMaxOutliers, 10);
      s.esdMaxOutliers = isFinite(n) && n > 0 ? n : null;
    } else {
      s.esdMaxOutliers = null;
    }

    // enabled: must be an Array of known method ids
    if (Array.isArray(d.enabled) && d.enabled.length > 0) {
      s.enabled = d.enabled.filter((id) => ALL_METHODS.includes(id));
      if (s.enabled.length === 0) s.enabled = [...ALL_METHODS];
    } else {
      s.enabled = [...ALL_METHODS];
    }

    s.chartMethod = typeof d.chartMethod === 'string' && d.chartMethod ? d.chartMethod : 'all';

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
