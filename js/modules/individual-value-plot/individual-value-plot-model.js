/**
 * D.Mike — Individual Value Plot Model (individual-value-plot-model.js)
 *
 * Pure state container + grouping logic for the individual value plot module.
 * Holds only persisted user inputs: the selected value columns (one per data
 * series), the optional per-series grouping columns, the plot option toggles,
 * point styling, reference lines/areas, and the id of any worksheet provisioned
 * by an example load.
 *
 * Contains NO view logic, NO i18n and NO chartManager / DOM calls. Descriptive
 * statistics are computed by the shared `core/stats-panel.js` engine in the view
 * layer and are intentionally NOT persisted here. The grouping algorithm
 * (`buildGroups`) is the one piece of business logic the model owns; it receives
 * column-value / column-name accessors and the error-message strings as
 * arguments so it stays free of state-manager and i18n dependencies.
 *
 * The persisted JSON shape matches the legacy module's getState() verbatim
 * (seriesRefs, groupRefs, showMean, showMedian, connectMeans, showOverallMean,
 * jitter, showStats, confLevel, refLines, refAreas, bgColor, pointColors,
 * pointSymbol, pointSize, exampleWorksheetId).
 */

const DEFAULTS = {
  showMean: true,
  showMedian: false,
  connectMeans: false,
  showOverallMean: false,
  jitter: 0.6,
  showStats: true,
  pointSymbol: 'circle',
  pointSize: 6,
};

/**
 * Restore a worksheet column reference from persisted JSON, or null.
 * Mirrors legacy behavior: a ref is any truthy object; legacy stored refs
 * verbatim, so we clone shallowly and keep them as-is.
 * @param {*} d
 * @returns {object|null}
 */
function refFromJSON(d) {
  return d && typeof d === 'object' ? { ...d } : null;
}

/**
 * Normalize one series' group entry into an always-length-3 array of refs
 * (entries may be null). Accepts the legacy single-ref / null form and the
 * new array form. Mirrors legacy `_loadState` + `_groupRefsAt`.
 * @param {*} g
 * @returns {Array<object|null>}
 */
function normalizeGroupEntry(g) {
  if (Array.isArray(g)) {
    return [refFromJSON(g[0]), refFromJSON(g[1]), refFromJSON(g[2])];
  }
  return [refFromJSON(g), null, null];
}

export class State {
  /** Value column refs — one per data series. */
  seriesRefs = [];

  /** Per-series grouping refs: each entry is `[g1, g2, g3]` (entries may be null). */
  groupRefs = [];

  showMean = DEFAULTS.showMean;
  showMedian = DEFAULTS.showMedian;
  connectMeans = DEFAULTS.connectMeans;
  showOverallMean = DEFAULTS.showOverallMean;
  jitter = DEFAULTS.jitter;
  showStats = DEFAULTS.showStats;

  /** Confidence level (%) — null until resolved from settings in the view. */
  confLevel = null;

  refLines = [];
  refAreas = [];
  bgColor = null;
  pointColors = [];
  pointSymbol = DEFAULTS.pointSymbol;
  pointSize = DEFAULTS.pointSize;

  /** Instance id of a worksheet provisioned by loadExample (for cleanup on re-load). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if at least one data series is selected. */
  hasContent() {
    return (this.seriesRefs?.length || 0) > 0;
  }

  /**
   * Always-length-3 array of group refs for series `i` (entries may be null).
   * @param {number} i
   * @returns {Array<object|null>}
   */
  groupRefsAt(i) {
    return normalizeGroupEntry(this.groupRefs[i]);
  }

  /**
   * Build the plot groups from all data series.
   *
   * Without grouping → one group (column of points) per series.
   * With grouping → one group per unique tuple of the active grouping columns,
   * in first-seen order, within that series.
   *
   * @param {(ref:object)=>any[]} getValues - returns the raw values for a column ref
   * @param {(ref:object)=>string} getName  - returns the display name for a column ref
   * @param {{errNoSeries:string, errNoData:string, errTooFew:(col:string)=>string}} msgs
   * @returns {Array<{name:string, values:number[]}>}
   * @throws {Error} when there are no series, a series has too few values, or
   *   grouping yields no buckets.
   */
  buildGroups(getValues, getName, msgs) {
    if (this.seriesRefs.length === 0) {
      throw new Error(msgs.errNoSeries);
    }

    const groups = [];
    for (let i = 0; i < this.seriesRefs.length; i++) {
      const ref = this.seriesRefs[i];
      const activeGroupRefs = this.groupRefsAt(i).filter(Boolean);
      const rawVals = getValues(ref);
      const colName = getName(ref);

      if (activeGroupRefs.length === 0) {
        const values = rawVals.filter((v) => v != null && typeof v === 'number' && !isNaN(v));
        if (values.length < 1) {
          throw new Error(msgs.errTooFew(colName));
        }
        groups.push({ name: colName, values });
      } else {
        const groupCols = activeGroupRefs.map((gr) => getValues(gr));
        const len = Math.min(rawVals.length, ...groupCols.map((arr) => arr.length));
        const buckets = new Map();
        const order = [];
        for (let j = 0; j < len; j++) {
          const v = rawVals[j];
          if (v == null || typeof v !== 'number' || isNaN(v)) continue;
          const tuple = groupCols.map((arr) => arr[j]);
          if (tuple.some((x) => x == null)) continue;
          const key = tuple.map(String).join(' | ');
          if (!buckets.has(key)) {
            buckets.set(key, []);
            order.push(key);
          }
          buckets.get(key).push(v);
        }
        for (const key of order) {
          const values = buckets.get(key);
          if (values.length < 1) continue;
          groups.push({ name: `${colName} — ${key}`, values });
        }
      }
    }

    if (groups.length === 0) throw new Error(msgs.errNoData);
    return groups;
  }

  toJSON() {
    return {
      seriesRefs: this.seriesRefs.map((r) => (r ? { ...r } : null)),
      groupRefs: this.groupRefs.map((g) => normalizeGroupEntry(g).map((r) => (r ? { ...r } : null))),
      showMean: this.showMean,
      showMedian: this.showMedian,
      connectMeans: this.connectMeans,
      showOverallMean: this.showOverallMean,
      jitter: this.jitter,
      showStats: this.showStats,
      confLevel: this.confLevel,
      refLines: this.refLines,
      refAreas: this.refAreas,
      bgColor: this.bgColor,
      pointColors: this.pointColors,
      pointSymbol: this.pointSymbol,
      pointSize: this.pointSize,
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State, even for
   * null/undefined/malformed input. Mirrors legacy `_loadState` defaults.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    s.seriesRefs = Array.isArray(d.seriesRefs) ? d.seriesRefs.map(refFromJSON).filter(Boolean) : [];
    s.groupRefs = Array.isArray(d.groupRefs) ? d.groupRefs.map(normalizeGroupEntry) : [];

    s.showMean = typeof d.showMean === 'boolean' ? d.showMean : DEFAULTS.showMean;
    s.showMedian = typeof d.showMedian === 'boolean' ? d.showMedian : DEFAULTS.showMedian;
    s.connectMeans = typeof d.connectMeans === 'boolean' ? d.connectMeans : DEFAULTS.connectMeans;
    s.showOverallMean = typeof d.showOverallMean === 'boolean' ? d.showOverallMean : DEFAULTS.showOverallMean;
    s.jitter = Number.isFinite(d.jitter) ? d.jitter : DEFAULTS.jitter;
    s.showStats = typeof d.showStats === 'boolean' ? d.showStats : DEFAULTS.showStats;
    s.confLevel = Number.isFinite(d.confLevel) ? d.confLevel : null;
    s.refLines = Array.isArray(d.refLines) ? d.refLines : [];
    s.refAreas = Array.isArray(d.refAreas) ? d.refAreas : [];
    s.bgColor = typeof d.bgColor === 'string' ? d.bgColor : null;
    s.pointColors = Array.isArray(d.pointColors) ? d.pointColors : [];
    s.pointSymbol = typeof d.pointSymbol === 'string' ? d.pointSymbol : DEFAULTS.pointSymbol;
    s.pointSize = Number.isFinite(d.pointSize) ? d.pointSize : DEFAULTS.pointSize;
    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
