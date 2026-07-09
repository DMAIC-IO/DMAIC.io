/**
 * D.Mike — Contour Plot Model (contour-plot-model.js)
 *
 * Pure state container for the Contour Plot module. Holds the regression
 * model spec (type, coefficients / custom formula), axis ranges and labels,
 * the contour display options (levels / colors / lines / data points), the
 * worksheet column references, and the shared chart-editor config
 * (chartConfig / refLines / refAreas).
 *
 * No view logic, no i18n, no DOM and no contour math — the marching-squares
 * rendering lives in contour-plot-render.js, the editor panel in
 * contour-plot-editor.js. The levels/colors/marker editor state belongs here
 * because it is persisted.
 *
 * toJSON() reproduces the exact legacy getState() shape (note: the model type
 * is persisted under the key `model`, matching the legacy module).
 */

const MODEL_TYPES = ['quadratic', 'interaction', 'custom'];
const COLOR_SCHEMES = ['viridis', 'plasma', 'thermal', 'green', 'grayscale'];

const DEFAULT_B = [50, 8, 5, -3, -2, 1.5];
const DEFAULT_FORMULA = '50 + 8*x + 5*y - 3*x*x - 2*y*y + 1.5*x*y';

/** Shared chart-editor config defaults (mirrors the legacy _chartConfig seed). */
export const DEFAULT_CHART_CONFIG = {
  showTitle: true, title: '',
  titleSize: 15, labelSize: 13, tickSize: 11,
  showXLabel: true, showYLabel: true,
  showXTicks: true, showYTicks: true,
  bgColor: '',
  // Data point styling
  markerSymbol: 'circle',
  markerSize: 10,
  markerColor: '',
  markerStroke: 'rgba(255,255,255,1)',
  markerStrokeWidth: 2,
  markerStrokeDash: 'solid',
};

/** @param {*} v @param {number} fallback @returns {number} */
function num(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/** @param {*} v @param {string[]} options @param {string} fallback @returns {string} */
function oneOf(v, options, fallback) {
  const s = v == null ? '' : String(v);
  return options.includes(s) ? s : fallback;
}

/** @param {*} v @param {boolean} fallback @returns {boolean} */
function bool(v, fallback) {
  return typeof v === 'boolean' ? v : fallback;
}

/** Coerce an array of 6 coefficients (pads with 0, truncates extras). */
function coeffs(v) {
  if (!Array.isArray(v)) return [...DEFAULT_B];
  const out = [];
  for (let i = 0; i < 6; i++) out.push(num(v[i], 0));
  return out;
}

/** @param {*} d @returns {{instanceId:string,sheetId:string,columnId:string}|null} */
function colRefFromJSON(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.instanceId == null || d.sheetId == null || d.columnId == null) return null;
  return {
    instanceId: String(d.instanceId),
    sheetId: String(d.sheetId),
    columnId: String(d.columnId),
  };
}

export class State {
  // ── Model spec ──
  modelType = 'quadratic';
  b = [...DEFAULT_B];
  customFormula = DEFAULT_FORMULA;

  // ── Axes / labels ──
  xLabel = '';
  yLabel = '';
  zLabel = '';
  xMin = -3;
  xMax = 3;
  yMin = -3;
  yMax = 3;

  // ── Display options ──
  numLevels = 10;
  gridRes = 100;
  colorScheme = 'viridis';
  showLines = true;
  showLabels = true;
  showDataPoints = false;

  // ── Worksheet column refs ──
  colRefX = null;
  colRefY = null;
  colRefZ = null;

  // ── Shared chart-editor config ──
  chartConfig = { ...DEFAULT_CHART_CONFIG };
  refLines = [];
  refAreas = [];

  /**
   * The contour plot always has a drawable model (defaults are present), so
   * loadExample never needs an overwrite-confirm — matching the legacy module,
   * whose state is purely a model spec with no measurements to protect.
   * @returns {boolean}
   */
  hasContent() {
    return true;
  }

  toJSON() {
    return {
      model: this.modelType,
      b: [...this.b],
      customFormula: this.customFormula,
      xLabel: this.xLabel,
      yLabel: this.yLabel,
      zLabel: this.zLabel,
      xMin: this.xMin,
      xMax: this.xMax,
      yMin: this.yMin,
      yMax: this.yMax,
      numLevels: this.numLevels,
      gridRes: this.gridRes,
      colorScheme: this.colorScheme,
      showLines: this.showLines,
      showLabels: this.showLabels,
      showDataPoints: this.showDataPoints,
      colRefX: this.colRefX ? { ...this.colRefX } : null,
      colRefY: this.colRefY ? { ...this.colRefY } : null,
      colRefZ: this.colRefZ ? { ...this.colRefZ } : null,
      chartConfig: { ...this.chartConfig },
      refLines: this.refLines.map(r => ({ ...r })),
      refAreas: this.refAreas.map(a => ({ ...a })),
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State, even for
   * null/undefined/malformed input. Reads the model type from the legacy
   * `model` key.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    s.modelType = oneOf(d.model, MODEL_TYPES, 'quadratic');
    s.b = coeffs(d.b);
    s.customFormula = typeof d.customFormula === 'string' ? d.customFormula : DEFAULT_FORMULA;

    s.xLabel = typeof d.xLabel === 'string' ? d.xLabel : '';
    s.yLabel = typeof d.yLabel === 'string' ? d.yLabel : '';
    s.zLabel = typeof d.zLabel === 'string' ? d.zLabel : '';
    s.xMin = num(d.xMin, -3);
    s.xMax = num(d.xMax, 3);
    s.yMin = num(d.yMin, -3);
    s.yMax = num(d.yMax, 3);

    s.numLevels = num(d.numLevels, 10);
    s.gridRes = num(d.gridRes, 100);
    s.colorScheme = oneOf(d.colorScheme, COLOR_SCHEMES, 'viridis');
    s.showLines = bool(d.showLines, true);
    s.showLabels = bool(d.showLabels, true);
    s.showDataPoints = bool(d.showDataPoints, false);

    s.colRefX = colRefFromJSON(d.colRefX);
    s.colRefY = colRefFromJSON(d.colRefY);
    s.colRefZ = colRefFromJSON(d.colRefZ);

    s.chartConfig = {
      ...DEFAULT_CHART_CONFIG,
      ...(d.chartConfig && typeof d.chartConfig === 'object' ? d.chartConfig : {}),
    };
    s.refLines = Array.isArray(d.refLines) ? d.refLines.map(r => ({ ...r })) : [];
    s.refAreas = Array.isArray(d.refAreas) ? d.refAreas.map(a => ({ ...a })) : [];

    return s;
  }
}
