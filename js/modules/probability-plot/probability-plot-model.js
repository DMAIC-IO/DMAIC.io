/**
 * D.Mike — Probability Plot Model (probability-plot-model.js)
 *
 * Pure state container for the Probability Plot module.
 * Holds the selected dataset references, series overrides, reference
 * lines/areas, display settings, and the id of any worksheet provisioned
 * by an example load.
 *
 * No view logic, no i18n, no DOM operations.
 * The plot itself is rendered imperatively in the view (data-Fn) using
 * chartManager — the result is intentionally NOT persisted here.
 */

import { columnRefFromJSON } from '../../core/chart/chart-data-prep.js';

/**
 * Coerce a single dataset entry, ensuring both valueRef and groupRef
 * are either valid column-ref objects or null.
 * @param {*} d
 * @returns {{ valueRef: object|null, groupRef: object|null }}
 */
function datasetFromJSON(d) {
  if (!d || typeof d !== 'object') return { valueRef: null, groupRef: null };
  return {
    valueRef: columnRefFromJSON(d.valueRef),
    groupRef: columnRefFromJSON(d.groupRef),
  };
}

export class State {
  /**
   * Array of dataset entries: each entry has a value column ref and an
   * optional grouping column ref.
   * @type {{ valueRef: object|null, groupRef: object|null }[]}
   */
  datasets = [{ valueRef: null, groupRef: null }];

  /**
   * Per-series visual overrides (parallel to last produced seriesData).
   * @type {object[]}
   */
  seriesOverrides = [];

  /**
   * Reference lines for the chart (horizontal/vertical marker lines).
   * @type {object[]}
   */
  refLines = [];

  /**
   * Reference areas for the chart (shaded bands).
   * @type {object[]}
   */
  refAreas = [];

  /**
   * Optional background color override for the chart.
   * @type {string|null}
   */
  bgColor = null;

  /**
   * Whether to show the statistics panel below the chart.
   * @type {boolean}
   */
  showStats = true;

  /**
   * Confidence level for the stats panel (e.g. 95 for 95%).
   * @type {number}
   */
  confLevel = 95;

  /**
   * Instance id of a worksheet provisioned by loadExample (for cleanup
   * on re-load).
   * @type {string|null}
   */
  exampleWorksheetId = null;

  /**
   * True if any dataset has a value column selected (drives confirmPopout
   * check in loadExample).
   * @returns {boolean}
   */
  hasContent() {
    return Array.isArray(this.datasets) && this.datasets.some(d => d.valueRef !== null);
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
        valueRef: d.valueRef ? { ...d.valueRef } : null,
        groupRef: d.groupRef ? { ...d.groupRef } : null,
      })),
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
   * Backward-compatible: if `d.datasets` is absent but `d.columnRef`
   * exists, the legacy single-column format is converted to one dataset.
   *
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    // datasets — with backward-compat for pre-1.1.0 columnRef shape
    if (Array.isArray(d.datasets)) {
      s.datasets = d.datasets.map(datasetFromJSON);
      if (s.datasets.length === 0) s.datasets = [{ valueRef: null, groupRef: null }];
    } else if (d.columnRef) {
      s.datasets = [{ valueRef: columnRefFromJSON(d.columnRef), groupRef: null }];
    }

    s.seriesOverrides = Array.isArray(d.seriesOverrides) ? d.seriesOverrides.slice() : [];
    s.refLines = Array.isArray(d.refLines) ? d.refLines.slice() : [];
    s.refAreas = Array.isArray(d.refAreas) ? d.refAreas.slice() : [];

    s.bgColor = (typeof d.bgColor === 'string') ? d.bgColor : null;
    s.showStats = typeof d.showStats === 'boolean' ? d.showStats : (d.showStats == null ? true : Boolean(d.showStats));
    s.confLevel = (typeof d.confLevel === 'number' && isFinite(d.confLevel)) ? d.confLevel : 95;

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string'
      ? d.exampleWorksheetId
      : null;

    return s;
  }
}
