/**
 * D.Mike — Mosaic Chart Model (mosaic-model.js)
 *
 * Pure state container + cross-tab logic for the mosaic plot module. Holds only
 * persisted user inputs: the X column-ref (drives the plot columns), the G
 * column-ref (drives the segments within a column), the chart-config block, and
 * the id of any worksheet provisioned by an example load.
 *
 * Contains NO view logic, NO i18n and NO chartManager / DOM / chart-editor calls.
 * The X×G cross-tab (count per (X, G) cell, first-seen levels, blank-drop, group
 * color assignment) is the business logic the model owns; `buildChartData`
 * receives a column-value accessor as its argument so it stays free of
 * state-manager dependencies. The geometry (column widths ∝ marginal X count,
 * segment heights ∝ P(G | X)) is computed by the `mosaic` chart type from the
 * raw `groups` counts produced here — NOT in the model.
 *
 * The chart-editor the user interacts with lives INSIDE the mosaic chart type
 * (`core/chart/types/mosaic.js`); the legacy module never read its edits back
 * into `chartConfig`, so this model persists only the config the module sets.
 *
 * The persisted JSON shape matches the legacy module's getState() verbatim
 * (xRef, gRef, chartConfig) plus an additive `exampleWorksheetId`
 * (sibling-parity, defaults to null) used by loadExample for worksheet cleanup.
 */

/** Segment colors — mirrors the legacy PALETTE 1:1. */
export const PALETTE = [
  'rgba(44,95,138,1)', 'rgba(39,174,96,1)', 'rgba(231,76,60,1)',
  'rgba(243,156,18,1)', 'rgba(142,68,173,1)', 'rgba(52,152,219,1)',
  'rgba(230,126,34,1)', 'rgba(26,188,156,1)', 'rgba(241,196,15,1)',
  'rgba(192,57,43,1)', 'rgba(44,62,80,1)', 'rgba(127,140,141,1)',
];

/** Default chart-config block — identical to the legacy `_chartConfig`. */
const CONFIG_DEFAULTS = {
  title: '',
  showTitle: true,
  showLegend: true,
  showCellLabels: true,
  columnGap: 2,
  segmentGap: 1,
  bgColor: null,
};

/** Restore a worksheet column reference verbatim (clone), or null. */
function refFromJSON(d) {
  return d && typeof d === 'object' ? { ...d } : null;
}

/** Mirror legacy `cleanCat`: null/'' → '' else String(v). */
function cleanCat(v) {
  return v == null || v === '' ? '' : String(v);
}

export class State {
  /** X column ref (drives the mosaic columns). */
  xRef = null;

  /** G column ref (drives the segments within each column). */
  gRef = null;

  /** Chart-config block (styling). */
  chartConfig = { ...CONFIG_DEFAULTS };

  /** Instance id of a worksheet provisioned by loadExample (for cleanup). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if BOTH the X and G columns are selected. */
  hasContent() {
    return Boolean(this.xRef && this.gRef);
  }

  /**
   * Build the mosaic chart data from the selected columns.
   *
   * Returns `categories` (X-levels, in first-seen order) and `groups` (G-levels,
   * each with a `values` array of the per-(G, X) count indexed by X-level, plus a
   * PALETTE color). Rows where the X or G cell is blank are dropped from both
   * axes and the counts. Mirrors the legacy `_buildChartData` 1:1.
   *
   * @param {(ref:object|null)=>any[]|null} getValues - raw values for a column ref
   * @returns {{categories:Array<string>, groups:Array<{name:string, values:number[], color:string}>}}
   */
  buildChartData(getValues) {
    const empty = { categories: [], groups: [] };
    if (!this.xRef || !this.gRef) return empty;

    const xVals = getValues(this.xRef);
    const gVals = getValues(this.gRef);
    if (!xVals || !gVals || xVals.length === 0 || gVals.length === 0) return empty;

    const xLevels = [];
    const xSeen = new Set();
    const gLevels = [];
    const gSeen = new Set();
    const n = Math.min(xVals.length, gVals.length);

    for (let i = 0; i < n; i++) {
      const xc = cleanCat(xVals[i]);
      const gc = cleanCat(gVals[i]);
      if (xc === '' || gc === '') continue;
      if (!xSeen.has(xc)) { xSeen.add(xc); xLevels.push(xc); }
      if (!gSeen.has(gc)) { gSeen.add(gc); gLevels.push(gc); }
    }
    if (xLevels.length === 0 || gLevels.length === 0) return empty;

    const matrix = {};
    for (const x of xLevels) {
      matrix[x] = {};
      for (const g of gLevels) matrix[x][g] = 0;
    }
    for (let i = 0; i < n; i++) {
      const x = cleanCat(xVals[i]);
      const g = cleanCat(gVals[i]);
      if (matrix[x] && matrix[x][g] !== undefined) matrix[x][g] += 1;
    }

    const groups = gLevels.map((gName, gi) => ({
      name: gName,
      values: xLevels.map((xLvl) => matrix[xLvl][gName]),
      color: PALETTE[gi % PALETTE.length],
    }));

    return { categories: xLevels, groups };
  }

  toJSON() {
    return {
      xRef: this.xRef ? { ...this.xRef } : null,
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
    s.gRef = refFromJSON(d.gRef);

    s.chartConfig = { ...CONFIG_DEFAULTS };
    if (d.chartConfig && typeof d.chartConfig === 'object') {
      Object.assign(s.chartConfig, d.chartConfig);
    }

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
