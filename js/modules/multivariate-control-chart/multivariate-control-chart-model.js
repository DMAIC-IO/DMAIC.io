/**
 * D.Mike — Multivariate Control Chart Model (multivariate-control-chart-model.js)
 *
 * Pure state container. Holds column selections, alpha, baseline count and the
 * optional provisioned-worksheet id from loadExample. Contains no view logic,
 * no i18n, no analysis — those live in the data-Fn.
 *
 * Persistence shape matches the legacy getState() exactly:
 *   { columnRefs, alpha, baselineCount, exampleWorksheetId }
 * `exampleWorksheetId` is additive and safely defaulted to null for legacy saves.
 */

/** Default false-alarm probability (3-sigma equivalent). */
export const ALPHA_DEFAULT = 0.0027;

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
  /** @type {Array<{instanceId:string, sheetId:string, columnId:string}>} */
  columnRefs = [];

  /** False-alarm probability for the UCL. */
  alpha = ALPHA_DEFAULT;

  /** Number of baseline observations for Phase I (null = use all rows). */
  baselineCount = null;

  /**
   * Instance id of a worksheet provisioned by loadExample (for cleanup on re-load).
   * @type {string|null}
   */
  exampleWorksheetId = null;

  /**
   * Returns true when any meaningful column selection has been made.
   * Drives the confirmPopout gate in loadExample.
   * @returns {boolean}
   */
  hasContent() {
    return Array.isArray(this.columnRefs) && this.columnRefs.length > 0;
  }

  /**
   * Serialise to plain object. Matches the legacy getState() shape.
   * @returns {{columnRefs: Array, alpha: number, baselineCount: number|null, exampleWorksheetId: string|null}}
   */
  toJSON() {
    return {
      columnRefs: Array.isArray(this.columnRefs)
        ? this.columnRefs.map(r => ({ ...r }))
        : [],
      alpha: this.alpha,
      baselineCount: this.baselineCount,
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * Deserialise and validate. Always returns a valid State, even for
   * null / undefined / malformed input. Safely handles legacy saves that
   * lack `exampleWorksheetId`.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    // columnRefs
    if (Array.isArray(d.columnRefs)) {
      s.columnRefs = d.columnRefs
        .map(columnRefFromJSON)
        .filter(Boolean);
    }

    // alpha — must be finite, >0, <1
    const a = d.alpha;
    s.alpha = (Number.isFinite(a) && a > 0 && a < 1) ? a : ALPHA_DEFAULT;

    // baselineCount — null or positive integer
    const bc = d.baselineCount;
    if (bc != null) {
      const n = parseInt(bc, 10);
      s.baselineCount = Number.isFinite(n) && n > 0 ? n : null;
    }

    // exampleWorksheetId — string or null
    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
