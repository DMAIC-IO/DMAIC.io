/**
 * D.Mike — Distribution Fit Model (distribution-fit-model.js)
 *
 * Pure state container for the Distribution Fit module.
 * Holds the selected column reference, data-type preference, and the id of
 * any worksheet provisioned by an example load.
 *
 * No view logic, no i18n, no DOM operations.
 * The analysis result is derived transiently in the view (data-Fn) from the
 * live worksheet column values — intentionally NOT persisted here.
 */

/** Allowed data-type values. */
const DATA_TYPES = ['auto', 'continuous', 'discrete'];

/**
 * Validate and coerce a column reference object.
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

export class State {
  /** @type {{ instanceId: string, sheetId: string, columnId: string }|null} */
  columnRef = null;

  /** @type {'auto'|'continuous'|'discrete'} */
  dataType = 'auto';

  /** @type {string|null} — instance id of a worksheet provisioned by loadExample */
  exampleWorksheetId = null;

  /**
   * True if any meaningful content is present (drives confirmPopout check).
   * @returns {boolean}
   */
  hasContent() {
    return this.columnRef !== null;
  }

  /**
   * Serialize to a plain JSON-compatible object.
   * Shape MUST match the legacy getState() output for project import/export compat.
   * @returns {{ columnRef: object|null, dataType: string, exampleWorksheetId: string|null }}
   */
  toJSON() {
    return {
      columnRef: this.columnRef ? { ...this.columnRef } : null,
      dataType: this.dataType,
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

    const dt = d.dataType;
    s.dataType = DATA_TYPES.includes(dt) ? dt : 'auto';

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string'
      ? d.exampleWorksheetId
      : null;

    return s;
  }
}
