/**
 * D.Mike — Bar Chart Model (bar-model.js)
 *
 * Pure state container + aggregation/cross-tab logic for the bar chart module.
 * Holds only persisted user inputs: the X column-ref (categories, required), the
 * optional Y column-ref (numeric values), the optional G column-ref (grouping),
 * the chart-config block (incl. the `aggregation` mode and the `stacked` flag),
 * and the id of any worksheet provisioned by an example load.
 *
 * Contains NO view logic, NO i18n and NO chartManager / DOM / chart-editor calls.
 * The aggregation + grouping/stacking DATA preparation (the legacy three-pass
 * `_buildChartData`) is the business logic the model owns; `buildChartData`
 * receives a column-value accessor and an `opts` object (aggregation mode +
 * resolved column names for the single-series name) so it stays free of
 * state-manager and i18n dependencies. The bar GEOMETRY (bar widths, gaps,
 * stacking offsets) is computed by the `bar` chart type from the raw `groups`
 * values produced here — NOT in the model.
 *
 * Input modes (driven by which column slots are filled), mirroring the legacy:
 *   - X only            → frequency count per category (single series)
 *   - X + Y             → mean/sum of Y per X-level     (single series)
 *   - X + G             → cross-tab count               (one series per G-level)
 *   - X + Y + G         → mean/sum of Y per (X, G)      (one series per G-level)
 *
 * The chart-editor the user interacts with lives INSIDE the bar chart type
 * (`core/chart/types/bar.js`); the legacy module only imported `esc` from
 * chart-editor.js and never read editor edits back into `chartConfig`, so this
 * model persists only the config the module sets.
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
  showTitle: true,
  title: '',
  titleSize: 15,
  showLegend: true,
  stacked: false,
  aggregation: 'mean', // 'mean' | 'sum' (only used when yRef present)
  barGap: 4,
  categoryGap: 0.3,
  bgColor: null,
  xLabel: '',
  yLabel: '',
};

export class State {
  /** X column ref (category axis, required). */
  xRef = null;

  /** Y column ref (numeric values, optional → mean/sum aggregation). */
  yRef = null;

  /** G column ref (grouping, optional → one series per G-level). */
  gRef = null;

  /** Chart-config block (data-shape + styling). */
  chartConfig = { ...CONFIG_DEFAULTS };

  /** Instance id of a worksheet provisioned by loadExample (for cleanup). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if the X column is selected (legacy hasContent). */
  hasContent() {
    return Boolean(this.xRef);
  }

  /**
   * Build the bar chart data from the selected columns. Mirrors the legacy
   * `_buildChartData` 1:1 (three passes: discover ordered X/G levels, aggregate
   * sum/count into a matrix, project to {categories, groups[]}).
   *
   * @param {(ref:object|null)=>any[]|null} getValues - raw values for a column ref
   * @param {{aggregation:string, xColumnName?:string, yColumnName?:string}} opts
   *   aggregation mode and the resolved column names used for the single-series
   *   `name` (count → xColumnName, mean/sum → yColumnName).
   * @returns {{categories:Array<string>, groups:Array<{name:string, values:number[], color:string}>}}
   */
  buildChartData(getValues, opts) {
    const empty = { categories: [], groups: [] };

    const yVals = this.yRef ? getValues(this.yRef) : null;
    const gVals = this.gRef ? getValues(this.gRef) : null;

    // ── Pass 1 + Pass 2: discover ordered X/G levels and aggregate into
    //    matrix[x][g] = { sum, count } (shared cross-tab helper).
    const grid = crossTabMatrix(getValues, {
      xRef: this.xRef,
      yRef: this.yRef,
      gRef: this.gRef,
    });
    if (!grid) return empty;
    const { xLevels, groupNames, matrix } = grid;

    // ── Pass 3: project to {categories, groups[]}.
    const aggregation = opts && opts.aggregation;
    const useMean = Boolean(yVals) && aggregation === 'mean';
    const useSum = Boolean(yVals) && aggregation === 'sum';

    const groups = groupNames.map((gName, gi) => {
      const values = xLevels.map((xLvl) => {
        const cell = matrix[xLvl][gName];
        if (useMean) return cell.count > 0 ? cell.sum / cell.count : 0;
        if (useSum) return cell.sum;
        return cell.count;
      });
      const seriesName = gVals
        ? gName
        : (yVals ? ((opts && opts.yColumnName) || '') : ((opts && opts.xColumnName) || ''));
      return {
        name: seriesName,
        values,
        color: PALETTE[gi % PALETTE.length],
      };
    });

    return { categories: xLevels, groups };
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

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
