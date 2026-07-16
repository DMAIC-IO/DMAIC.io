/**
 * D.Mike — Boxplot Model (boxplot-model.js)
 *
 * Pure state container for the Boxplot module. Holds the user-entered
 * dataset references (seriesRefs / groupRefs), display options and chart
 * configuration. Contains no view logic, no i18n and no DOM operations.
 *
 * The chart computation itself (buildGroups) lives in the data-Fn because it
 * needs live column values from the context (stateManager).
 */

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
  /** @type {Array<{instanceId:string,sheetId:string,columnId:string}>} */
  seriesRefs = [];

  /** @type {Array<{instanceId:string,sheetId:string,columnId:string}|null>} */
  groupRefs = [];

  showMean = true;
  showOutliers = true;
  showStats = true;
  confLevel = 95;

  /** @type {Array} — reference lines passed to chartManager */
  refLines = [];

  /** @type {Array} — reference areas passed to chartManager */
  refAreas = [];

  /** @type {string|null} — background color override for the chart */
  bgColor = null;

  /** @type {Array<string>} — per-box color overrides */
  boxColors = [];

  /** @type {string|null} — instance id of a worksheet provisioned by loadExample */
  exampleWorksheetId = null;

  /**
   * True if the module has any meaningful content (drives confirmPopout).
   * @returns {boolean}
   */
  hasContent() {
    return this.seriesRefs.length > 0;
  }

  /**
   * Serialize to a plain JSON-compatible object.
   * The shape MUST match the legacy getState() output for project import/export compat.
   * @returns {object}
   */
  toJSON() {
    return {
      seriesRefs: this.seriesRefs.map(r => r ? { ...r } : r),
      groupRefs: this.groupRefs.map(r => r ? { ...r } : r),
      showMean: this.showMean,
      showOutliers: this.showOutliers,
      showStats: this.showStats,
      confLevel: this.confLevel,
      refLines: this.refLines.map(l => ({ ...l })),
      refAreas: this.refAreas.map(a => ({ ...a })),
      bgColor: this.bgColor,
      boxColors: [...this.boxColors],
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State, even for
   * null/undefined/malformed input. Handles legacy format.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    // Backward compat: old format had single valueRef/groupRef in grouped mode
    if (d.mode === 'grouped' && d.valueRef) {
      const ref = columnRefFromJSON(d.valueRef);
      if (ref) {
        s.seriesRefs = [ref];
        s.groupRefs = [columnRefFromJSON(d.groupRef)];
      }
    } else {
      s.seriesRefs = Array.isArray(d.seriesRefs)
        ? d.seriesRefs.map(columnRefFromJSON).filter(Boolean)
        : [];
      s.groupRefs = Array.isArray(d.groupRefs)
        ? d.groupRefs.map(r => columnRefFromJSON(r))
        : [];
    }

    s.showMean = d.showMean ?? true;
    s.showOutliers = d.showOutliers ?? true;
    s.showStats = d.showStats ?? true;
    s.confLevel = (typeof d.confLevel === 'number' && d.confLevel > 0) ? d.confLevel : 95;
    s.refLines = Array.isArray(d.refLines) ? d.refLines.map(l => ({ ...l })) : [];
    s.refAreas = Array.isArray(d.refAreas) ? d.refAreas.map(a => ({ ...a })) : [];
    s.bgColor = typeof d.bgColor === 'string' ? d.bgColor : (d.bgColor || null);
    s.boxColors = Array.isArray(d.boxColors) ? [...d.boxColors] : [];
    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
