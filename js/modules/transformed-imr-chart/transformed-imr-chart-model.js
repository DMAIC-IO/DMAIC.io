/**
 * D.Mike — Transformed I-MR Control Chart Model (transformed-imr-chart-model.js)
 *
 * Pure state container. Holds column selection, Box-Cox lambda configuration,
 * and the optional provisioned-worksheet id from loadExample.
 * Contains no view logic, no i18n, no analysis — those live in the data-Fn.
 *
 * Persistence shape matches the legacy getState() shape exactly:
 *   { columnRef, lambdaMode, lambdaManual }
 * `exampleWorksheetId` is additive and safely defaulted to null for legacy saves.
 */

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
  /** @type {{instanceId:string, sheetId:string, columnId:string}|null} */
  columnRef = null;

  /** @type {'auto'|'manual'} */
  lambdaMode = 'auto';

  /** @type {number} */
  lambdaManual = 0;

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
   * @returns {{columnRef: object|null, lambdaMode: string, lambdaManual: number, exampleWorksheetId: string|null}}
   */
  toJSON() {
    return {
      columnRef: this.columnRef ? { ...this.columnRef } : null,
      lambdaMode: this.lambdaMode,
      lambdaManual: this.lambdaManual,
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

    s.columnRef = columnRefFromJSON(d.columnRef);
    s.lambdaMode = d.lambdaMode === 'manual' ? 'manual' : 'auto';
    s.lambdaManual = Number.isFinite(d.lambdaManual) ? d.lambdaManual : 0;
    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
