/**
 * multi-vari-engine.js — Grouping for the multi-vari chart.
 *
 * This engine computes **no** statistics. It sorts individual measurements
 * into the box the chart draws them in: strip (factor 4) → panel (factor 3)
 * → group (factor 1) → series (factor 2). The variance decomposition lives
 * in `variance-components-engine.js` and, conversely, knows nothing about
 * multi-vari; the separation keeps both parts independently verifiable.
 *
 * The order of the factors passed in carries meaning: it determines layout
 * **and** nesting at once, so the picture and the model never drift apart.
 * See `docs/superpowers/specs/2026-08-31-multi-vari-design.md`.
 */

import { MIN_FACTORS, MAX_FACTORS, KEY_SEP, expectedCellCount } from './variance-components-engine.js';

export { MIN_FACTORS, MAX_FACTORS, KEY_SEP };

/** More levels than this make the X axis unreadable. */
export const MAX_AXIS_LEVELS = 30;

/** More series than this overwhelm the color palette and the legend. */
export const MAX_SERIES_LEVELS = 12;

/** More panels than this no longer fit legibly on one screen. */
export const MAX_PANELS = 48;

/** Placeholder level used when there is no panel or strip factor. */
export const NO_LEVEL = '';

/**
 * Level key of a cell: trimmed string, empty for null/undefined.
 * @param {*} value
 * @returns {string}
 */
export function levelKey(value) {
  return value == null ? '' : String(value).trim();
}

/**
 * Order levels numeric-aware — `3, 4, 10, 15` instead of `10, 15, 3, 4`.
 * Same approach as `orderParts()` in `gage-run-chart-engine`.
 * @param {string[]} keys
 * @returns {string[]}
 */
export function orderLevels(keys) {
  const allNumeric = keys.every(k => k !== '' && Number.isFinite(Number(k)));
  const sorted = keys.slice();
  if (allNumeric) sorted.sort((a, b) => Number(a) - Number(b));
  else sorted.sort((a, b) => a.localeCompare(b));
  return sorted;
}

/** Arithmetic mean; NaN for an empty array. */
function mean(values) {
  if (!values.length) return NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Filter rows: only rows with a finite measurement and an occupied level in
 * **every selected** factor column survive.
 *
 * @param {Array<*>} measurements
 * @param {Array<{name: string, values: Array<*>}>} factors
 * @returns {{rows: Array<{y: number, keys: string[]}>, droppedRows: number}}
 */
export function cleanRows(measurements, factors) {
  const lengths = [measurements.length, ...factors.map(f => f.values.length)];
  const n = Math.max(...lengths);
  const rows = [];
  let droppedRows = 0;

  for (let i = 0; i < n; i++) {
    const raw = measurements[i];
    const y = typeof raw === 'number' ? raw : parseFloat(raw);
    const keys = factors.map(f => levelKey(f.values[i]));
    const complete = Number.isFinite(y) && keys.every(k => k !== '');
    if (complete) rows.push({ y, keys });
    else droppedRows++;
  }
  return { rows, droppedRows };
}

/**
 * Check the balance of the occupied cells.
 *
 * Two distinct findings, named differently in the UI too:
 * `uneven` — the occupied cells differ in size;
 * `missing` — at least one factor combination is missing entirely.
 *
 * The denominator for `missing` depends on the model form. Under a crossed
 * plan every factor level meets every other, so the raw product of the level
 * counts is reachable. Under a nested plan it is not: a lower factor whose
 * labels are globally unique (P1…P6 rather than P1/P2 repeated inside each
 * parent) has six "levels" but only two per parent, and the raw product would
 * declare a perfectly balanced design incomplete. `expectedCellCount()` from
 * the variance-components engine counts what the model form can actually
 * reach, so both engines agree on the same verdict.
 *
 * @param {Map<string, number[]>} cells
 * @param {string[][]} factorValues — cleaned level keys per selected factor
 * @param {'nested'|'crossed'} modelForm
 * @returns {{balanced: boolean, uneven: boolean, missing: boolean}}
 */
function balanceOf(cells, factorValues, modelForm) {
  const sizes = [...cells.values()].map(v => v.length);
  if (!sizes.length) return { balanced: false, uneven: false, missing: false };

  const expected = expectedCellCount(factorValues, factorValues.map((_, j) => j), modelForm);
  const uneven = sizes.some(s => s !== sizes[0]);
  const missing = sizes.length < expected;
  return { balanced: !uneven && !missing, uneven, missing };
}

/**
 * Grouping for the multi-vari chart.
 *
 * @param {{measurements: Array<*>, factors: Array<{name: string, values: Array<*>}>,
 *          modelForm?: 'nested'|'crossed'}} input
 *        2 to 4 factors, every value list the same length as `measurements`.
 *        `modelForm` only steers the balance verdict (see `balanceOf`); it
 *        defaults to `'crossed'`, the stricter of the two.
 * @returns {object} see spec section "Grouping engine"
 */
export function computeMultiVari({ measurements, factors, modelForm = 'crossed' }) {
  const list = Array.isArray(factors) ? factors : [];
  if (list.length < MIN_FACTORS) {
    throw new Error('computeMultiVari: needs at least two factor columns');
  }
  if (list.length > MAX_FACTORS) {
    throw new Error('computeMultiVari: at most four factor columns are supported');
  }

  const { rows, droppedRows } = cleanRows(measurements || [], list);

  const levels = list.map((_, j) => orderLevels([...new Set(rows.map(r => r.keys[j]))]));
  const axisLevels = levels[0];
  const seriesLevels = levels[1];
  const panelLevels = list.length >= 3 ? levels[2] : [NO_LEVEL];
  const rowLevels = list.length >= 4 ? levels[3] : [NO_LEVEL];

  // Sort every row into its (strip, panel, group, series) cell. The
  // placeholders keep the key the same length at 2 and 3 factors.
  const cells = new Map();
  for (const r of rows) {
    const key = [
      list.length >= 4 ? r.keys[3] : NO_LEVEL,
      list.length >= 3 ? r.keys[2] : NO_LEVEL,
      r.keys[0],
      r.keys[1],
    ].join(KEY_SEP);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(r.y);
  }

  const strips = rowLevels.map(rowLevel => ({
    rowLevel,
    panels: panelLevels.map(panelLevel => ({
      panelLevel,
      // Every axis level gets its group, including an empty one: only then
      // do the panels of every strip line up at the same X positions.
      groups: axisLevels.map((level) => {
        const series = [];
        const all = [];
        for (const s of seriesLevels) {
          const values = cells.get([rowLevel, panelLevel, level, s].join(KEY_SEP));
          if (!values) continue;
          series.push({ level: s, values: values.slice(), mean: mean(values) });
          for (const v of values) all.push(v);
        }
        return { level, mean: all.length ? mean(all) : null, series };
      }),
    })),
  }));

  const values = rows.map(r => r.y);
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const v of values) {
    if (v < yMin) yMin = v;
    if (v > yMax) yMax = v;
  }
  if (!values.length) { yMin = 0; yMax = 1; }

  // The chart consumes `strips`; the variance-components engine must run on
  // exactly the same surviving rows, so hand back the cleaned data too —
  // otherwise the picture and the statistics could silently describe
  // different data.
  const cleaned = {
    response: rows.map(r => r.y),
    factorValues: list.map((_, j) => rows.map(r => r.keys[j])),
  };

  const { balanced, uneven, missing } = balanceOf(cells, cleaned.factorValues, modelForm);
  const panelCount = strips.length * panelLevels.length;

  const warnings = [];
  if (uneven) warnings.push('unbalanced');
  if (missing) warnings.push('emptyCells');

  // Size limits are hard limits, not advice: past them the chart is no longer
  // readable, so the spec has it not drawn at all. Each entry carries the
  // column that blew the budget plus the numbers, so the message can name it
  // instead of leaving the user to guess which of four factors is at fault.
  const limits = [];
  if (axisLevels.length > MAX_AXIS_LEVELS) {
    limits.push({
      code: 'tooManyAxisLevels', column: list[0].name,
      count: axisLevels.length, max: MAX_AXIS_LEVELS,
    });
  }
  if (seriesLevels.length > MAX_SERIES_LEVELS) {
    limits.push({
      code: 'tooManySeriesLevels', column: list[1].name,
      count: seriesLevels.length, max: MAX_SERIES_LEVELS,
    });
  }
  if (panelCount > MAX_PANELS) {
    limits.push({
      code: 'tooManyPanels',
      column: list.slice(2).map(f => f.name).join(', '),
      count: panelCount, max: MAX_PANELS,
    });
  }
  for (const l of limits) warnings.push(l.code);

  return {
    factors: list.map((f, j) => ({ name: f.name, levels: levels[j] })),
    strips,
    seriesLevels,
    grandMean: values.length ? mean(values) : NaN,
    n: values.length,
    droppedRows,
    yMin,
    yMax,
    balanced,
    panelCount,
    warnings,
    limits,
    // The chart is drawn only when every size limit holds — the module must
    // not render `strips` while this is false.
    renderable: limits.length === 0,
    cleaned,
  };
}
