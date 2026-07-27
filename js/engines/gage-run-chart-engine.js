/**
 * D.Mike — Gage Run Chart Engine (gage-run-chart-engine.js)
 *
 * Pure data preparation for the gage run chart (Minitab DE:
 * "Messverlaufsdiagramm", Statistik → Qualitätswerkzeuge →
 * Messsystemanalyse → Messverlaufsdiagramm).
 *
 * Groups raw measurements into one panel per part, each panel holding one
 * series per appraiser. There is no inferential statistic here — the chart is
 * a visual tool; the engine only groups, orders and averages.
 *
 * Not to be confused with `run-chart-engine.js`, which serves the *run chart*
 * (Minitab DE: "Verlaufsdiagramm") with its median line and four runs tests.
 * The two tools share nothing but part of their name.
 *
 * No DOM, no state — all functions are stateless and testable.
 */

/** Marker used when the study has no appraiser column. */
export const NO_OPERATOR = '';

/**
 * Normalize a raw cell into a group key. Numbers and strings both become
 * strings so they can key a Map; null/undefined/'' mean "missing".
 * @param {*} v
 * @returns {string|null} null when the cell is empty
 */
function groupKey(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * Order part labels numerically when every label parses as a finite number,
 * lexicographically otherwise. Without this, parts 3, 4, 10, 15 would sort
 * as "10", "15", "3", "4".
 * @param {string[]} keys
 * @returns {string[]} a new, sorted array
 */
function orderParts(keys) {
  const allNumeric = keys.every(k => k !== '' && Number.isFinite(Number(k)));
  const sorted = keys.slice();
  if (allNumeric) sorted.sort((a, b) => Number(a) - Number(b));
  else sorted.sort((a, b) => a.localeCompare(b));
  return sorted;
}

/** Arithmetic mean; returns NaN for an empty array. */
function mean(values) {
  if (!values.length) return NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * @typedef {Object} GageRunChartSeries
 * @property {string} operator — appraiser label ('' when the study has none)
 * @property {number[]} values — measurements in worksheet row order
 * @property {number} mean
 */

/**
 * @typedef {Object} GageRunChartPanel
 * @property {string} part
 * @property {GageRunChartSeries[]} series — ordered like `operators`
 */

/**
 * @typedef {Object} GageRunChartResult
 * @property {string[]} parts — panel order (numeric-aware)
 * @property {string[]} operators — first-appearance order; [''] without operators
 * @property {boolean} hasOperators
 * @property {GageRunChartPanel[]} panels
 * @property {number} grandMean — reference-line default
 * @property {number} n — number of usable measurements
 * @property {number} droppedRows — rows discarded as incomplete
 * @property {number} yMin
 * @property {number} yMax
 * @property {boolean} balanced — every part × operator cell has the same count
 * @property {string[]} warnings — i18n key stems, e.g. 'unbalanced'
 */

/**
 * Group measurements into per-part panels.
 *
 * Rows are discarded when the part label is empty or the measurement is not a
 * finite number; `droppedRows` reports how many. A missing appraiser column is
 * legitimate (single-appraiser study) and yields one series per panel keyed by
 * the empty string.
 *
 * @param {Object} input
 * @param {Array<string|number>} input.parts
 * @param {Array<string|number>|null} [input.operators]
 * @param {number[]} input.measurements
 * @returns {GageRunChartResult}
 */
export function computeGageRunChart({ parts, operators = null, measurements }) {
  if (!Array.isArray(parts) || !Array.isArray(measurements)) {
    throw new Error('computeGageRunChart: parts and measurements must be arrays');
  }
  const hasOperators = Array.isArray(operators);
  const rowCount = Math.min(
    parts.length,
    measurements.length,
    hasOperators ? operators.length : Infinity,
  );

  // cells: partKey → operatorKey → number[]
  const cells = new Map();
  const partKeys = [];
  const operatorKeys = [];
  let droppedRows = 0;
  let sum = 0;
  let n = 0;
  let yMin = Infinity;
  let yMax = -Infinity;

  for (let i = 0; i < rowCount; i++) {
    const part = groupKey(parts[i]);
    const value = measurements[i];
    if (part === null || typeof value !== 'number' || !Number.isFinite(value)) {
      droppedRows++;
      continue;
    }
    const op = hasOperators ? (groupKey(operators[i]) ?? NO_OPERATOR) : NO_OPERATOR;

    if (!cells.has(part)) { cells.set(part, new Map()); partKeys.push(part); }
    const byOp = cells.get(part);
    if (!byOp.has(op)) byOp.set(op, []);
    byOp.get(op).push(value);

    if (!operatorKeys.includes(op)) operatorKeys.push(op);

    sum += value; n++;
    if (value < yMin) yMin = value;
    if (value > yMax) yMax = value;
  }

  // Any row after the shortest column is unusable too — report it honestly.
  droppedRows += Math.max(
    parts.length,
    measurements.length,
    hasOperators ? operators.length : 0,
  ) - rowCount;

  if (n === 0) {
    return {
      parts: [], operators: [], hasOperators,
      panels: [], grandMean: NaN, n: 0, droppedRows,
      yMin: 0, yMax: 1, balanced: true,
      warnings: droppedRows > 0 ? ['droppedRows'] : [],
    };
  }

  const orderedParts = orderParts(partKeys);
  const panels = orderedParts.map((part) => {
    const byOp = cells.get(part);
    const series = operatorKeys
      .filter(op => byOp.has(op))
      .map(op => ({ operator: op, values: byOp.get(op).slice(), mean: mean(byOp.get(op)) }));
    return { part, series };
  });

  // Balanced = every part × operator cell present and of equal size.
  const expectedCells = orderedParts.length * operatorKeys.length;
  let actualCells = 0;
  let cellSize = null;
  let balanced = true;
  for (const panel of panels) {
    actualCells += panel.series.length;
    for (const s of panel.series) {
      if (cellSize === null) cellSize = s.values.length;
      else if (s.values.length !== cellSize) balanced = false;
    }
  }
  if (actualCells !== expectedCells) balanced = false;

  const warnings = [];
  if (!balanced) warnings.push('unbalanced');
  if (droppedRows > 0) warnings.push('droppedRows');

  return {
    parts: orderedParts,
    operators: operatorKeys,
    hasOperators,
    panels,
    grandMean: sum / n,
    n,
    droppedRows,
    yMin,
    yMax,
    balanced,
    warnings,
  };
}

/**
 * Build the panel structure from an already-grouped cell matrix, as the MSA
 * modules hold it (`cellData[part][operator] = number[]`).
 *
 * `computeGageRunChart` groups raw columns; this is its counterpart for
 * callers that grouped and validated the data themselves. Embedding the chart
 * in msa-typ2 / msa-typ5 must show exactly the rows their analysis used — a
 * second pass over the raw columns could include rows their own validation
 * dropped, and the picture would silently disagree with the numbers next to it.
 *
 * Empty cells are omitted (they carry no point), so an unbalanced design
 * renders as a panel with fewer series rather than an empty gap.
 *
 * @param {string[]} partLabels — panel order, taken as given
 * @param {string[]} operatorLabels — series order, taken as given
 * @param {Object<string, Object<string, number[]>>} cellData
 * @returns {{panels: GageRunChartPanel[], operators: string[], grandMean: number,
 *            n: number, yMin: number, yMax: number}}
 */
export function panelsFromCells(partLabels, operatorLabels, cellData) {
  const panels = [];
  let sum = 0;
  let n = 0;
  let yMin = Infinity;
  let yMax = -Infinity;

  for (const part of partLabels) {
    const byOp = cellData?.[part] || {};
    const series = [];
    for (const op of operatorLabels) {
      const raw = byOp[op];
      if (!Array.isArray(raw)) continue;
      const values = raw.filter(v => typeof v === 'number' && Number.isFinite(v));
      if (!values.length) continue;
      for (const v of values) {
        sum += v; n++;
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
      series.push({ operator: op, values, mean: mean(values) });
    }
    if (series.length) panels.push({ part, series });
  }

  if (n === 0) {
    return { panels: [], operators: [], grandMean: NaN, n: 0, yMin: 0, yMax: 1 };
  }
  return {
    panels,
    operators: operatorLabels.slice(),
    grandMean: sum / n,
    n,
    yMin,
    yMax,
  };
}

/**
 * Split panels into rows of at most `perRow` panels. The module renders one
 * chart instance per row; a shared y-domain keeps the rows comparable.
 * @param {GageRunChartPanel[]} panels
 * @param {number} perRow
 * @returns {GageRunChartPanel[][]}
 */
export function splitPanelRows(panels, perRow) {
  const size = Number.isFinite(perRow) && perRow >= 1 ? Math.floor(perRow) : panels.length;
  if (!panels.length) return [];
  const rows = [];
  for (let i = 0; i < panels.length; i += size) rows.push(panels.slice(i, i + size));
  return rows;
}

// ── Unified Dispatcher (Algorithm Lab / Fixture Replay) ──

/**
 * Unified dispatcher. Supports a single mode "gage-run-chart".
 * Returns a flat object so JSON fixtures can pin keys directly; `panels` is
 * included because the grouping *is* the algorithm here.
 *
 * @param {Object} inputs
 * @param {"gage-run-chart"} inputs.mode
 * @param {Array<string|number>} inputs.parts
 * @param {Array<string|number>|null} [inputs.operators]
 * @param {number[]} inputs.measurements
 * @returns {Object}
 */
export function analyze(inputs) {
  if (!inputs || typeof inputs.mode !== 'string') {
    throw new Error('analyze: inputs.mode (string) is required');
  }
  if (inputs.mode !== 'gage-run-chart') {
    throw new Error(`analyze: unknown mode '${inputs.mode}'`);
  }
  if (!Array.isArray(inputs.parts) || !Array.isArray(inputs.measurements)) {
    throw new Error('analyze: inputs.parts and inputs.measurements (arrays) are required');
  }
  const r = computeGageRunChart(inputs);
  return {
    parts: r.parts,
    operators: r.operators,
    panels: r.panels,
    grandMean: r.grandMean,
    n: r.n,
    droppedRows: r.droppedRows,
    yMin: r.yMin,
    yMax: r.yMax,
    balanced: r.balanced,
  };
}
