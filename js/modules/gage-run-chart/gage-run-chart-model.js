/**
 * D.Mike — Gage Run Chart Model (gage-run-chart-model.js)
 *
 * Pure state container for the gage run chart module. Holds the persisted user
 * inputs only: the three referenced worksheet columns, the display options and
 * the free-text gage information block.
 *
 * Contains NO view logic, NO i18n and NO chartManager calls. The grouping
 * (panels, means, grand mean) lives in `js/engines/gage-run-chart-engine.js`
 * and is computed transiently in the view layer, so it is intentionally NOT
 * persisted here.
 */

/** Default number of part panels per rendered strip. */
export const DEFAULT_PARTS_PER_ROW = 7;

/** Free-text keys of the gage information block, in display order. */
export const GAGE_INFO_KEYS = ['name', 'date', 'reporter', 'tolerance', 'misc'];

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

/** Build an empty gage-info block. */
function emptyGageInfo() {
  const info = {};
  for (const key of GAGE_INFO_KEYS) info[key] = '';
  return info;
}

export class State {
  /** Referenced worksheet columns. `operator` is optional. */
  columnRefs = { part: null, operator: null, measurement: null };

  /**
   * Reference-line value as entered by the user. Empty string means "use the
   * grand mean" — kept as a string so a half-typed "-" or "0." survives.
   */
  refValue = '';

  /** Part panels per strip; the module stacks one chart instance per strip. */
  partsPerRow = DEFAULT_PARTS_PER_ROW;

  /** Draw a short mean tick per appraiser and panel. */
  showOperatorMean = true;

  /** Connect repeat measurements of the same appraiser. */
  connectWithin = true;

  /** Free-text gage documentation, rendered above the chart. */
  gageInfo = emptyGageInfo();

  /** Instance id of a worksheet provisioned by loadExample (for cleanup). */
  exampleWorksheetId = null;

  /** @returns {boolean} true once part and measurement are selected. */
  hasContent() {
    return Boolean(this.columnRefs.part && this.columnRefs.measurement);
  }

  /**
   * Resolve the reference line: the user's value when it parses as a finite
   * number, the computed grand mean otherwise.
   * @param {number} grandMean
   * @returns {number}
   */
  resolveRefValue(grandMean) {
    const v = parseFloat(this.refValue);
    return Number.isFinite(v) ? v : grandMean;
  }

  /** @returns {boolean} true if any gage-info field carries text. */
  hasGageInfo() {
    return GAGE_INFO_KEYS.some(key => String(this.gageInfo[key] || '').trim() !== '');
  }

  toJSON() {
    const refs = {};
    for (const key of ['part', 'operator', 'measurement']) {
      refs[key] = this.columnRefs[key] ? { ...this.columnRefs[key] } : null;
    }
    return {
      columnRefs: refs,
      refValue: this.refValue,
      partsPerRow: this.partsPerRow,
      showOperatorMean: this.showOperatorMean,
      connectWithin: this.connectWithin,
      gageInfo: { ...this.gageInfo },
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

    const refs = d.columnRefs && typeof d.columnRefs === 'object' ? d.columnRefs : {};
    s.columnRefs = {
      part: columnRefFromJSON(refs.part),
      operator: columnRefFromJSON(refs.operator),
      measurement: columnRefFromJSON(refs.measurement),
    };

    s.refValue = typeof d.refValue === 'string' ? d.refValue : '';
    s.partsPerRow = Number.isFinite(d.partsPerRow) && d.partsPerRow >= 1
      ? Math.floor(d.partsPerRow)
      : DEFAULT_PARTS_PER_ROW;
    s.showOperatorMean = d.showOperatorMean !== false;
    s.connectWithin = d.connectWithin !== false;

    s.gageInfo = emptyGageInfo();
    if (d.gageInfo && typeof d.gageInfo === 'object') {
      for (const key of GAGE_INFO_KEYS) {
        if (typeof d.gageInfo[key] === 'string') s.gageInfo[key] = d.gageInfo[key];
      }
    }

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
