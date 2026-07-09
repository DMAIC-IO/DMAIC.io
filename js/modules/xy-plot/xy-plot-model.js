/**
 * D.Mike — XY-Plot Model (xy-plot-model.js)
 *
 * Pure state container for the XY-Plot module.
 * Holds the selected dataset references (each with its own X / Y / optional
 * grouping / optional size column), per-series visual overrides, reference
 * lines/areas, global marker/line toggles, display settings, and the id of
 * any worksheet provisioned by an example load.
 *
 * No view logic, no i18n, no DOM operations. The plot itself is rendered
 * imperatively in the view (data-Fn) via chartManager — its result is
 * intentionally NOT persisted here.
 */

import { columnRefFromJSON } from '../../core/chart/chart-data-prep.js';

/**
 * Coerce a single dataset entry. Each entry has an X and Y column ref plus
 * an optional grouping and size ref. All are either valid refs or null.
 * @param {*} d
 * @returns {{ xRef: object|null, yRef: object|null, groupRef: object|null, sizeRef: object|null }}
 */
function datasetFromJSON(d) {
  if (!d || typeof d !== 'object') {
    return { xRef: null, yRef: null, groupRef: null, sizeRef: null };
  }
  return {
    xRef: columnRefFromJSON(d.xRef),
    yRef: columnRefFromJSON(d.yRef),
    groupRef: columnRefFromJSON(d.groupRef),
    sizeRef: columnRefFromJSON(d.sizeRef),
  };
}

function emptyDataset() {
  return { xRef: null, yRef: null, groupRef: null, sizeRef: null };
}

export class State {
  /**
   * Array of dataset entries. Each dataset has its own X/Y column — datasets
   * need not share an X axis. Optional group (split into sub-series) and size
   * (bubble plot) columns per dataset.
   * @type {{ xRef: object|null, yRef: object|null, groupRef: object|null, sizeRef: object|null }[]}
   */
  datasets = [emptyDataset()];

  /** Global toggle: connect markers with lines. @type {boolean} */
  showLines = false;

  /** Global toggle: draw point markers. @type {boolean} */
  showMarkers = true;

  /**
   * Per-series visual overrides (parallel to last produced series).
   * @type {object[]}
   */
  seriesOverrides = [];

  /** Reference lines for the chart. @type {object[]} */
  refLines = [];

  /** Reference areas for the chart. @type {object[]} */
  refAreas = [];

  /** Optional background color override for the chart. @type {string|null} */
  bgColor = null;

  /** Whether to show the statistics panel below the chart. @type {boolean} */
  showStats = true;

  /** Confidence level for the stats panel (e.g. 95 for 95%). @type {number} */
  confLevel = 95;

  /**
   * Instance id of a worksheet provisioned by loadExample (for cleanup on
   * re-load).
   * @type {string|null}
   */
  exampleWorksheetId = null;

  /**
   * True if any dataset has an X or Y column selected (drives the
   * confirmPopout check in loadExample — matches the legacy
   * `d.xRef || d.yRef` predicate).
   * @returns {boolean}
   */
  hasContent() {
    return Array.isArray(this.datasets)
      && this.datasets.some(d => d.xRef !== null || d.yRef !== null);
  }

  /**
   * Map non-negative raw sizes to a 6–28 px diameter range via
   * sqrt-normalisation, so that bubble AREA stays proportional to the raw
   * value. Pure helper — no DOM, no i18n.
   * @param {number[]} rawSizes
   * @param {string} label
   * @returns {{ sizes: number[], rawSizes: number[], label: string }}
   */
  static buildBubble(rawSizes, label) {
    const D_MIN = 6, D_MAX = 28;
    const sqrtVals = rawSizes.map(Math.sqrt);
    const sMin = Math.min(...sqrtVals);
    const sMax = Math.max(...sqrtVals);
    const span = sMax - sMin;
    const sizes = sqrtVals.map(sv => {
      const t = span > 0 ? (sv - sMin) / span : 0.5;
      return D_MIN + t * (D_MAX - D_MIN);
    });
    return { sizes, rawSizes, label };
  }

  /**
   * Serialize to a plain JSON-compatible object.
   * Shape MUST match the legacy getState() output for project import/export
   * compatibility.
   * @returns {object}
   */
  toJSON() {
    return {
      datasets: this.datasets.map(d => ({
        xRef: d.xRef ? { ...d.xRef } : null,
        yRef: d.yRef ? { ...d.yRef } : null,
        groupRef: d.groupRef ? { ...d.groupRef } : null,
        sizeRef: d.sizeRef ? { ...d.sizeRef } : null,
      })),
      showLines: this.showLines,
      showMarkers: this.showMarkers,
      seriesOverrides: this.seriesOverrides.slice(),
      refLines: this.refLines.slice(),
      refAreas: this.refAreas.slice(),
      bgColor: this.bgColor,
      showStats: this.showStats,
      confLevel: this.confLevel,
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State, even for
   * null/undefined/malformed input.
   *
   * Backward-compatible:
   *   - `d.datasets` present → per-dataset X/Y/group/size shape (v2+).
   *   - else `d.colRefX && d.seriesRefs` (v1) → shared X becomes per-dataset X,
   *     one dataset per series Y.
   *
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    if (Array.isArray(d.datasets)) {
      s.datasets = d.datasets.map(datasetFromJSON);
      if (s.datasets.length === 0) s.datasets = [emptyDataset()];
    } else if (d.colRefX && Array.isArray(d.seriesRefs)) {
      // Migrate v1 → v2: shared X becomes per-dataset X.
      const xRef = columnRefFromJSON(d.colRefX);
      s.datasets = d.seriesRefs.map(yRef => ({
        xRef,
        yRef: columnRefFromJSON(yRef),
        groupRef: null,
        sizeRef: null,
      }));
      if (s.datasets.length === 0) s.datasets = [emptyDataset()];
    }

    s.showLines = typeof d.showLines === 'boolean' ? d.showLines : false;
    s.showMarkers = typeof d.showMarkers === 'boolean' ? d.showMarkers : true;

    s.seriesOverrides = Array.isArray(d.seriesOverrides) ? d.seriesOverrides.slice() : [];
    s.refLines = Array.isArray(d.refLines) ? d.refLines.slice() : [];
    s.refAreas = Array.isArray(d.refAreas) ? d.refAreas.slice() : [];

    s.bgColor = (typeof d.bgColor === 'string') ? d.bgColor : null;
    s.showStats = typeof d.showStats === 'boolean'
      ? d.showStats
      : (d.showStats == null ? true : Boolean(d.showStats));
    s.confLevel = (typeof d.confLevel === 'number' && isFinite(d.confLevel)) ? d.confLevel : 95;

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string'
      ? d.exampleWorksheetId
      : null;

    return s;
  }
}
