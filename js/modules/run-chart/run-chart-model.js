/**
 * D.Mike — Run Chart Model (run-chart-model.js)
 *
 * Pure state container for the run chart module. Holds the persisted user
 * inputs only: the referenced data column, the significance level alpha, and
 * the id of any worksheet provisioned by an example load.
 *
 * Contains NO view logic, NO i18n and NO chartManager calls. The runs-test
 * analysis (median, runs counts, the four Minitab p-values) lives in the shared
 * engine `js/engines/run-chart-engine.js` and is computed transiently in the
 * view layer, so it is intentionally NOT persisted here.
 *
 * The persisted JSON shape matches the legacy module's getState()
 * ({ columnRef, alpha }) plus an additive `exampleWorksheetId` field (the legacy
 * module held this on the module instance, not in getState(); persisting it lets
 * loadExample clean up a prior worksheet across reloads; it defaults safely to
 * null on old projects).
 */

const DEFAULT_ALPHA = 0.05;

/**
 * Restore a worksheet column reference from persisted JSON, or null.
 * @param {*} d
 * @returns {{instanceId:string,sheetId:string,columnId:string}|null}
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
  /** Referenced data worksheet column, or null. */
  columnRef = null;

  /** Significance level α — a test is flagged when its p-value < alpha. */
  alpha = DEFAULT_ALPHA;

  /** Instance id of a worksheet provisioned by loadExample (for cleanup on re-load). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if a data column is selected (drives confirmPopout). */
  hasContent() {
    return Boolean(this.columnRef);
  }

  /**
   * Count how many of the four runs-test p-values fall strictly below alpha.
   * Mirrors the legacy `_renderStats` flagged-count computation.
   * @param {{pClustering:number,pMixtures:number,pTrends:number,pOscillation:number}} result
   * @param {number} alpha
   * @returns {number}
   */
  flaggedCount(result, alpha) {
    return [
      result.pClustering, result.pMixtures, result.pTrends, result.pOscillation,
    ].filter(p => p < alpha).length;
  }

  toJSON() {
    return {
      columnRef: this.columnRef ? { ...this.columnRef } : null,
      alpha: this.alpha,
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State, even for
   * null/undefined/malformed input.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    s.columnRef = columnRefFromJSON(d.columnRef);
    s.alpha = Number.isFinite(d.alpha) ? d.alpha : DEFAULT_ALPHA;
    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
