/**
 * D.Mike — Rare-Event Control Chart Model (rare-event-chart-model.js)
 *
 * Pure state container for the rare-event control chart module. Holds the
 * persisted user inputs only: the chart type ('g' | 't'), the referenced data
 * column, and the id of any worksheet provisioned by an example load.
 *
 * Contains NO view logic, NO i18n and NO chartManager calls. The SPC analysis
 * (g/t control limits) lives in the shared engine
 * `js/engines/rare-event-chart-engine.js` and is computed transiently in the
 * view layer, so it is intentionally NOT persisted here.
 *
 * The persisted JSON shape matches the legacy module's getState()
 * ({ chartTypeId, columnRef }) plus an additive `exampleWorksheetId` field
 * (the legacy module held this on the module instance, not in getState();
 * persisting it lets loadExample clean up a prior worksheet across reloads;
 * it defaults safely to null on old projects).
 */

const TYPES = ['g', 't'];

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
  /** Chart type: 'g' (count between events) | 't' (time between events). */
  chartTypeId = 'g';

  /** Referenced data worksheet column, or null. */
  columnRef = null;

  /** Instance id of a worksheet provisioned by loadExample (for cleanup on re-load). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if a data column is selected (drives confirmPopout). */
  hasContent() {
    return Boolean(this.columnRef);
  }

  /**
   * Count points that fall strictly outside the control limits. Nulls are
   * skipped. Mirrors the legacy `_countSignals`.
   * @param {Array<number|null>} values
   * @param {number} ucl
   * @param {number} lcl
   * @returns {number}
   */
  countSignals(values, ucl, lcl) {
    let s = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null) continue;
      if (v > ucl || v < lcl) s++;
    }
    return s;
  }

  toJSON() {
    return {
      chartTypeId: this.chartTypeId,
      columnRef: this.columnRef ? { ...this.columnRef } : null,
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

    s.chartTypeId = TYPES.includes(d.chartTypeId) ? d.chartTypeId : 'g';
    s.columnRef = columnRefFromJSON(d.columnRef);
    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
