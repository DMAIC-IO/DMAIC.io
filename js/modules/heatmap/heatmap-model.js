/**
 * D.Mike — Heatmap Chart Model (heatmap-model.js)
 *
 * Pure state container + cross-tab / aggregation logic for the heatmap module.
 * Holds only persisted user inputs: the column column-ref (X → columns), the row
 * column-ref (G → rows), the optional numeric value column-ref (V), the
 * chart-config block, and the id of any worksheet provisioned by an example load.
 *
 * Contains NO view logic, NO i18n and NO chartManager / DOM calls. The two-axis
 * category extraction + per-cell aggregation (count / mean / sum) is the business
 * logic the model owns; `buildChartData` receives a column-value accessor and the
 * aggregation mode as arguments so it stays free of state-manager dependencies.
 * Color domain and normalization live in the `heatmap` chart type, not here.
 *
 * The persisted JSON shape matches the legacy module's getState() verbatim
 * (xRef, gRef, vRef, chartConfig) plus an additive `exampleWorksheetId`
 * (sibling-parity, defaults to null) used by loadExample for worksheet cleanup.
 */

/** Default chart-config block — identical to the legacy `_chartConfig`. */
const CONFIG_DEFAULTS = {
  title: '',
  showTitle: true,
  aggregation: 'mean',   // 'mean' | 'sum' (only used when vRef present)
  showCellLabels: true,
  cellGap: 1,
  valueDecimals: 1,
  colorScheme: 'viridis',
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

/** Mirror legacy `toNum`: parseFloat, NaN for empty/invalid. */
function toNum(v) {
  if (v == null || v === '') return NaN;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
}

export class State {
  /** Column column ref (X axis → columns). */
  xRef = null;

  /** Row column ref (G axis → rows). */
  gRef = null;

  /** Value column ref (V, numeric — optional). */
  vRef = null;

  /** Chart-config block (styling + aggregation mode). */
  chartConfig = { ...CONFIG_DEFAULTS };

  /** Instance id of a worksheet provisioned by loadExample (for cleanup). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if BOTH the X and G columns are selected. */
  hasContent() {
    return Boolean(this.xRef && this.gRef);
  }

  /**
   * Build the heatmap chart data from the selected columns.
   *
   * Two modes, driven by whether V is filled:
   *   - X + G       → frequency count per (X, G) cell
   *   - X + G + V   → mean / sum of V per (X, G) cell
   *
   * X drives the column axis, G drives the row axis. Categories are emitted in
   * first-seen order; rows where the X or G cell is blank are dropped entirely.
   * Empty cells are `NaN` in value mode (no V data fell into the cell) and `0`
   * in count mode (mirrors the legacy `_buildChartData`).
   *
   * @param {(ref:object|null)=>any[]|null} getValues - raw values for a column ref
   * @param {'mean'|'sum'} aggregation - aggregation mode when V is present
   * @returns {{xCategories:Array<string>, yCategories:Array<string>, cells:number[][]}}
   */
  buildChartData(getValues, aggregation) {
    const empty = { xCategories: [], yCategories: [], cells: [] };
    if (!this.xRef || !this.gRef) return empty;

    const xVals = getValues(this.xRef);
    const gVals = getValues(this.gRef);
    if (!xVals || !gVals) return empty;

    const vVals = this.vRef ? getValues(this.vRef) : null;

    const n = Math.min(xVals.length, gVals.length, vVals ? vVals.length : Infinity);

    const xLevels = [];
    const xSeen = new Set();
    const yLevels = [];
    const ySeen = new Set();
    for (let i = 0; i < n; i++) {
      const xc = cleanCat(xVals[i]);
      const gc = cleanCat(gVals[i]);
      if (xc === '' || gc === '') continue;
      if (!xSeen.has(xc)) { xSeen.add(xc); xLevels.push(xc); }
      if (!ySeen.has(gc)) { ySeen.add(gc); yLevels.push(gc); }
    }
    if (xLevels.length === 0 || yLevels.length === 0) return empty;

    // accum[yi][xi] = { sum, count } when vVals; otherwise count only.
    const accum = yLevels.map(() => xLevels.map(() => ({ sum: 0, count: 0 })));
    const xIdx = new Map(xLevels.map((v, i) => [v, i]));
    const yIdx = new Map(yLevels.map((v, i) => [v, i]));

    for (let i = 0; i < n; i++) {
      const xi = xIdx.get(cleanCat(xVals[i]));
      const yi = yIdx.get(cleanCat(gVals[i]));
      if (xi === undefined || yi === undefined) continue;
      if (vVals) {
        const v = toNum(vVals[i]);
        if (!Number.isFinite(v)) continue;
        accum[yi][xi].sum += v;
        accum[yi][xi].count += 1;
      } else {
        accum[yi][xi].count += 1;
      }
    }

    const useMean = Boolean(vVals) && aggregation === 'mean';
    const useSum = Boolean(vVals) && aggregation === 'sum';
    const cells = accum.map((row) => row.map((cell) => {
      if (useMean) return cell.count > 0 ? cell.sum / cell.count : NaN;
      if (useSum) return cell.count > 0 ? cell.sum : NaN;
      return cell.count;
    }));

    return { xCategories: xLevels, yCategories: yLevels, cells };
  }

  toJSON() {
    return {
      xRef: this.xRef ? { ...this.xRef } : null,
      gRef: this.gRef ? { ...this.gRef } : null,
      vRef: this.vRef ? { ...this.vRef } : null,
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
    s.vRef = refFromJSON(d.vRef);

    s.chartConfig = { ...CONFIG_DEFAULTS };
    if (d.chartConfig && typeof d.chartConfig === 'object') {
      Object.assign(s.chartConfig, d.chartConfig);
    }
    // Sanitize aggregation to a known enum value (legacy: 'sum' else 'mean').
    s.chartConfig.aggregation = s.chartConfig.aggregation === 'sum' ? 'sum' : 'mean';

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
