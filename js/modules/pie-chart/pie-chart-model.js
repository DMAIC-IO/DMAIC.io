/**
 * D.Mike — Pie Chart Model (pie-chart-model.js)
 *
 * Pure state container + slice-aggregation logic for the pie chart module.
 * Holds only persisted user inputs: the value column-ref (required, drives the
 * slices), the optional label column-ref (groups values by label → sum), the
 * chart-config block (visual config that drives the SVG output), and the id of
 * any worksheet provisioned by an example load.
 *
 * Contains NO view logic, NO i18n and NO chartManager / DOM / chart-editor calls.
 * The slice DATA preparation (the legacy `_buildSlicesFromWorksheet`) is the
 * business logic the model owns; `buildSlices` receives a column-value accessor
 * so it stays free of state-manager and i18n dependencies. The pie GEOMETRY
 * (arc angles, label placement, donut hole) is computed by the `pie` chart type
 * from the raw `slices` produced here — NOT in the model.
 *
 * Two input modes (driven by which column slots are filled), mirroring legacy:
 *   - value only   → frequency count per distinct value (first-seen order)
 *   - value+label  → sum of value per label (parseFloat; NaN/negative dropped)
 *
 * The chart-editor the user interacts with lives INSIDE the pie chart type
 * (`core/chart/types/pie.js`); the legacy module only imported `esc` from
 * chart-editor.js, so this model persists only the config the module sets.
 *
 * The persisted JSON shape matches the legacy module's getState() (valueRef,
 * labelRef, chartConfig) plus an additive `exampleWorksheetId` (sibling-parity,
 * defaults to null) used by loadExample for worksheet cleanup. The legacy also
 * persisted the derived `slices` array; that is a pure derivation of
 * (valueRef, labelRef, worksheet data) recomputed on every plot, so it is not
 * round-tripped here (matching the bar sibling, which never persisted its
 * computed categories/groups).
 */

/** Slice colors — mirrors the legacy PALETTE 1:1. */
export const PALETTE = [
  'rgba(44,95,138,1)', 'rgba(39,174,96,1)', 'rgba(231,76,60,1)',
  'rgba(243,156,18,1)', 'rgba(142,68,173,1)', 'rgba(52,152,219,1)',
  'rgba(230,126,34,1)', 'rgba(26,188,156,1)', 'rgba(241,196,15,1)',
  'rgba(192,57,43,1)', 'rgba(44,62,80,1)', 'rgba(127,140,141,1)',
];

/** Default chart-config block — identical to the legacy `_chartConfig`. */
const CONFIG_DEFAULTS = {
  showTitle: true,
  title: '',
  titleSize: 15,
  showLegend: true,
  showLabels: true,
  labelMode: 'both',
  labelSize: 11,
  innerRadius: 0,
  padAngle: 0.8,
  startAngle: -90,
  explodeDistance: 12,
  strokeColor: 'rgba(255,255,255,1)',
  strokeWidth: 2,
  sortSlices: 'none',
  centerLabel: '',
  centerSub: '',
  bgColor: null,
};

/** Restore a worksheet column reference verbatim (clone), or null. */
function refFromJSON(d) {
  return d && typeof d === 'object' ? { ...d } : null;
}

export class State {
  /** Value column ref (drives the slices, required). */
  valueRef = null;

  /** Label column ref (groups values by label → sum, optional). */
  labelRef = null;

  /** Chart-config block (visual styling that drives the SVG output). */
  chartConfig = { ...CONFIG_DEFAULTS };

  /** Instance id of a worksheet provisioned by loadExample (for cleanup). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if the value column is selected (legacy hasContent). */
  hasContent() {
    return Boolean(this.valueRef);
  }

  /**
   * Build the pie slices from the selected columns. Mirrors the legacy
   * `_buildSlicesFromWorksheet` 1:1.
   *
   *   - value+label → sum of value per label (parseFloat; NaN or negative
   *     dropped; name = label cell or 1-based row index if missing).
   *   - value only  → frequency count per distinct value key (String(raw);
   *     null/'' skipped).
   *
   * @param {(ref:object|null)=>any[]|null} getValues - raw values for a column ref
   * @returns {Array<{name:string, value:number, color:string}>}
   */
  buildSlices(getValues) {
    if (!this.valueRef) return [];
    const values = getValues(this.valueRef);
    if (!values || values.length === 0) return [];

    if (this.labelRef) {
      const labels = getValues(this.labelRef);
      const sums = new Map();
      for (let i = 0; i < values.length; i++) {
        const v = parseFloat(values[i]);
        if (isNaN(v) || v < 0) continue;
        const name = labels && labels[i] != null ? String(labels[i]) : `${i + 1}`;
        sums.set(name, (sums.get(name) || 0) + v);
      }
      const slices = [];
      for (const [name, total] of sums) {
        slices.push({ name, value: total, color: PALETTE[slices.length % PALETTE.length] });
      }
      return slices;
    }

    const counts = new Map();
    for (const raw of values) {
      if (raw == null || raw === '') continue;
      const key = String(raw);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const slices = [];
    for (const [name, count] of counts) {
      slices.push({ name, value: count, color: PALETTE[slices.length % PALETTE.length] });
    }
    return slices;
  }

  toJSON() {
    return {
      valueRef: this.valueRef ? { ...this.valueRef } : null,
      labelRef: this.labelRef ? { ...this.labelRef } : null,
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

    s.valueRef = refFromJSON(d.valueRef);
    s.labelRef = refFromJSON(d.labelRef);

    s.chartConfig = { ...CONFIG_DEFAULTS };
    if (d.chartConfig && typeof d.chartConfig === 'object') {
      Object.assign(s.chartConfig, d.chartConfig);
    }

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
