/**
 * D.Mike — Short-Run (Z-MR) Control Chart Model (short-run-chart-model.js)
 *
 * Pure state container. Holds column selections for the values and groups
 * columns plus the optional provisioned-worksheet id from loadExample.
 * Contains no view logic, no i18n, no analysis — those live in the data-Fn.
 *
 * Persistence shape matches the legacy getState() shape exactly:
 *   { valuesRef, groupsRef }
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
  valuesRef = null;

  /** @type {{instanceId:string, sheetId:string, columnId:string}|null} */
  groupsRef = null;

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
    return this.valuesRef != null || this.groupsRef != null;
  }

  /**
   * Serialise to plain object. Matches the legacy getState() shape.
   * `exampleWorksheetId` is additive: old saves without it are safely
   * defaulted by fromJSON.
   * @returns {{valuesRef: object|null, groupsRef: object|null, exampleWorksheetId: string|null}}
   */
  toJSON() {
    return {
      valuesRef: this.valuesRef ? { ...this.valuesRef } : null,
      groupsRef: this.groupsRef ? { ...this.groupsRef } : null,
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

    s.valuesRef = columnRefFromJSON(d.valuesRef);
    s.groupsRef = columnRefFromJSON(d.groupsRef);
    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
