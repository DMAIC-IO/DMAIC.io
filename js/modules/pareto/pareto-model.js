/**
 * D.Mike — Pareto Chart Model (pareto-model.js)
 *
 * Pure state container + Pareto computation for the Pareto chart module.
 * Holds only persisted user inputs: the category column (X), the optional value
 * column (Y), the optional grouping column (G), the chart-config block, and the
 * id of any worksheet provisioned by an example load.
 *
 * Contains NO view logic, NO i18n and NO chartManager / DOM calls. The Pareto
 * aggregation (count / sum / mean per category, group cross-tab) and the
 * descending-sort + cumulative-percentage stats rows are the business logic the
 * model owns; `buildChartData` receives a column-value accessor and the
 * aggregation mode as arguments so it stays free of state-manager dependencies.
 *
 * The persisted JSON shape matches the legacy module's getState() verbatim
 * (xRef, yRef, gRef, chartConfig) plus an additive `exampleWorksheetId`
 * (sibling-parity, defaults to null) used by loadExample for worksheet cleanup.
 */

import { PALETTE, refFromJSON, crossTabMatrix } from '../../core/chart/chart-data-prep.js';

/** Re-export the shared series palette for parity with legacy consumers/tests. */
export { PALETTE };

/** Default chart-config block — identical to the legacy `_chartConfig`. */
const CONFIG_DEFAULTS = {
  title: '',
  showTitle: true,
  aggregation: 'sum',   // 'sum' | 'mean' (only used when yRef present)
  maxItems: 20,
  otherBucket: true,
  refLineValue: 80,
  barOpacity: 0.75,
  bgColor: null,
};

export class State {
  /** Category column ref (X axis). */
  xRef = null;

  /** Value column ref (Y, numeric — optional). */
  yRef = null;

  /** Grouping column ref (G — optional, stacked Pareto). */
  gRef = null;

  /** Chart-config block (styling + aggregation mode). */
  chartConfig = { ...CONFIG_DEFAULTS };

  /** Instance id of a worksheet provisioned by loadExample (for cleanup). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if a category column (X) is selected. */
  hasContent() {
    return Boolean(this.xRef);
  }

  /**
   * Build the Pareto chart data from the selected columns.
   *
   * Four modes, driven by which slots are filled:
   *   - X only      → frequency count per category          → items[]
   *   - X + Y       → sum/mean of Y per X-level             → items[]
   *   - X + G       → cross-tab count → stacked Pareto       → categories + groups
   *   - X + Y + G   → sum/mean of Y per (X, G) → stacked     → categories + groups
   *
   * Bars are NOT sorted here — the chart type sorts internally (and
   * `computeStatsRows` sorts for the stats table). Levels are emitted in
   * first-seen order; blank category / group cells are dropped.
   *
   * @param {(ref:object|null)=>any[]|null} getValues - raw values for a column ref
   * @param {'sum'|'mean'} aggregation - aggregation mode when Y is present
   * @returns {{items:Array, categories:Array<string>, groups:Array}}
   */
  buildChartData(getValues, aggregation) {
    const empty = { items: [], categories: [], groups: [] };

    const gVals = this.gRef ? getValues(this.gRef) : null;
    const grid = crossTabMatrix(getValues, {
      xRef: this.xRef,
      yRef: this.yRef,
      gRef: this.gRef,
    });
    if (!grid) return empty;
    const { xLevels, groupNames, matrix } = grid;
    const yVals = this.yRef ? getValues(this.yRef) : null;

    const useMean = Boolean(yVals) && aggregation === 'mean';
    const useSum = Boolean(yVals) && aggregation === 'sum';
    const cellValue = (cell) => {
      if (useMean) return cell.count > 0 ? cell.sum / cell.count : 0;
      if (useSum) return cell.sum;
      return cell.count;
    };

    // Stacked mode → categories + groups (chart sorts internally).
    if (gVals) {
      const groups = groupNames.map((gName, gi) => ({
        name: gName,
        values: xLevels.map((xLvl) => cellValue(matrix[xLvl][gName])),
        color: PALETTE[gi % PALETTE.length],
      }));
      return { items: [], categories: xLevels, groups };
    }

    // Single-series mode → items[].
    const items = xLevels.map((xLvl, i) => ({
      name: xLvl,
      value: cellValue(matrix[xLvl].__single__),
      color: PALETTE[i % PALETTE.length],
    }));
    return { items, categories: [], groups: [] };
  }

  /**
   * Build the sorted (descending by total) stats rows with cumulative
   * percentages. Mirrors legacy `_renderStats` math 1:1 (negative values
   * clamped to 0 in the cumulative running total, stable sort).
   *
   * @param {{items:Array, categories:Array<string>, groups:Array}} data
   * @returns {{rows:Array<{name:string, value:number, color:string, cumPct:number}>, grandTotal:number}}
   */
  static computeStatsRows(data) {
    let rows = [];
    if (data.items && data.items.length > 0) {
      rows = data.items.map((it) => ({ name: it.name, value: it.value, color: it.color }));
    } else if (data.categories && data.categories.length > 0) {
      rows = data.categories.map((c, ci) => {
        const total = (data.groups || []).reduce((s, g) => s + (g.values[ci] || 0), 0);
        return { name: c, value: total, color: PALETTE[ci % PALETTE.length] };
      });
    }
    rows.sort((a, b) => b.value - a.value);

    const grandTotal = rows.reduce((s, r) => s + Math.max(0, r.value), 0);
    let cum = 0;
    for (const r of rows) {
      cum += Math.max(0, r.value);
      r.cumPct = grandTotal > 0 ? (cum / grandTotal) * 100 : 0;
    }
    return { rows, grandTotal };
  }

  toJSON() {
    return {
      xRef: this.xRef ? { ...this.xRef } : null,
      yRef: this.yRef ? { ...this.yRef } : null,
      gRef: this.gRef ? { ...this.gRef } : null,
      chartConfig: { ...this.chartConfig },
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

    s.xRef = refFromJSON(d.xRef);
    s.yRef = refFromJSON(d.yRef);
    s.gRef = refFromJSON(d.gRef);

    s.chartConfig = { ...CONFIG_DEFAULTS };
    if (d.chartConfig && typeof d.chartConfig === 'object') {
      Object.assign(s.chartConfig, d.chartConfig);
    }
    // Sanitize aggregation to a known enum value (legacy: 'mean' else 'sum').
    s.chartConfig.aggregation = s.chartConfig.aggregation === 'mean' ? 'mean' : 'sum';

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
