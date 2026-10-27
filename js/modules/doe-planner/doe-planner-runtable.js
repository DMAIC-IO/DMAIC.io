/**
 * D.Mike — DoE Planner: run table (doe-planner-runtable.js)
 *
 * Pure. The one place where the design matrix, the preview edits
 * (model.previewEdits) and the source-worksheet seeds
 * (design.sourceResponseSeeds) meet: the embedded grid's columns, the
 * edits read back from it, the edits applied to the design before a
 * datasheet is created, and the runs as plain rows for the agent.
 *
 * Spec: docs/superpowers/specs/2026-10-25-doe-planner-teil-viewmodels-design.md (E4)
 */
import { formatValue, codedToActual } from '../../engines/doe-planner-engine.js';
import { letter } from './doe-planner-model.js';

/** Index of the first factor column (after run, std, block, replicate). */
export const FACTOR_OFFSET = 4;

/**
 * Coded rows → actual values: categorical factors give their level label,
 * two-level continuous factors a linear map, more levels the nearest level.
 * @param {number[][]} codedRows
 * @param {Array<{kind: string, levels: string[]}>} factors
 * @returns {Array<Array<number|string>>}
 */
export function codedToActualRows(codedRows, factors) {
  return codedRows.map((row) => row.map((c, fi) => {
    const f = factors[fi];
    const nLv = f.levels.length;
    if (f.kind === 'categorical') {
      const idx = Math.round((c + 1) * (nLv - 1) / 2);
      const clamped = Math.max(0, Math.min(nLv - 1, idx));
      return f.levels[clamped] ?? '';
    }
    if (nLv <= 2) {
      const lo = parseFloat(f.levels[0]) || -1;
      const hi = parseFloat(f.levels[nLv - 1]) || 1;
      return formatValue(codedToActual(c, lo, hi));
    }
    const idx = Math.round((c + 1) * (nLv - 1) / 2);
    const clamped = Math.max(0, Math.min(nLv - 1, idx));
    const val = parseFloat(f.levels[clamped]);
    return isFinite(val)
      ? formatValue(val)
      : formatValue(codedToActual(c, parseFloat(f.levels[0]) || -1, parseFloat(f.levels[nLv - 1]) || 1));
  }));
}

/**
 * Columns of the embedded preview grid: locked order columns, factors
 * (preview edits on continuous ones), responses (seeds, then edits).
 * @param {object} model a State
 * @param {function(string): string} t module translation
 * @returns {object[]} DataGrid columns; [] without a design
 */
export function buildRunTable(model, t) {
  const design = model.design;
  if (!design || !design.actualMatrix || !design.actualMatrix.length) return [];
  const nRuns = design.actualMatrix.length;
  const order = design.runOrder || design.actualMatrix.map((_, i) => i + 1);
  const stdOrder = design.stdOrder || design.actualMatrix.map((_, i) => i + 1);
  const replicateIds = design.replicateIds || new Array(nRuns).fill(1);
  const lockMeta = (reason) => ({ lock: 'hard', managedBy: 'doe-planner', reason });
  const cols = [
    { id: '__run', name: t('colRunOrder'), type: 'numeric', values: [...order], format: { decimals: 0 }, meta: lockMeta('run-order') },
    { id: '__std', name: t('colStdOrder'), type: 'numeric', values: [...stdOrder], format: { decimals: 0 }, meta: lockMeta('group-id') },
    { id: '__blk', name: t('colBlock'), type: 'numeric', values: new Array(nRuns).fill(1), format: { decimals: 0 }, meta: lockMeta('block-column') },
    { id: '__rep', name: t('colReplicate'), type: 'numeric', values: [...replicateIds], format: { decimals: 0 }, meta: lockMeta('replicate-id') },
  ];
  const edits = model.previewEdits;
  const factorEdits = edits && edits.factors ? edits.factors : null;
  const responseEdits = edits && edits.responses ? edits.responses : null;
  model.factors.forEach((f, fi) => {
    const isCategorical = f.kind === 'categorical';
    const values = design.actualMatrix.map((row, i) => {
      if (!isCategorical && factorEdits && factorEdits[fi] && factorEdits[fi][i] != null) return factorEdits[fi][i];
      return row[fi];
    });
    cols.push({
      id: `__f${fi}`,
      name: f.name || `${t('factor')} ${letter(fi)}`,
      type: isCategorical ? 'text' : 'numeric',
      unit: isCategorical ? '' : (f.unit || ''),
      values,
      format: isCategorical ? null : { decimals: 2 },
      meta: isCategorical ? lockMeta('design-factor') : null,
    });
  });
  const sourceSeeds = Array.isArray(design.sourceResponseSeeds) ? design.sourceResponseSeeds : null;
  const seedRows = Number.isFinite(design.sourceRowCount) ? design.sourceRowCount : 0;
  model.responses.forEach((r, ri) => {
    const values = new Array(nRuns).fill(null);
    if (sourceSeeds && sourceSeeds[ri] && seedRows > 0) {
      const limit = Math.min(seedRows, sourceSeeds[ri].length, nRuns);
      for (let i = 0; i < limit; i++) {
        const v = sourceSeeds[ri][i];
        if (v != null && Number.isFinite(v)) values[i] = v;
      }
    }
    if (responseEdits && responseEdits[ri]) {
      for (let i = 0; i < nRuns; i++) {
        const v = responseEdits[ri][i];
        if (v != null && Number.isFinite(v)) values[i] = v;
      }
    }
    cols.push({
      id: `__r${ri}`,
      name: r.name || `Y${ri + 1}`,
      type: 'numeric',
      unit: r.unit || '',
      values,
      format: { decimals: 4 },
      meta: null,
    });
  });
  return cols;
}

/**
 * Reads the preview edits back from the grid's columns.
 * @param {object} model a State
 * @param {object[]} gridColumns DataGrid.getData()
 * @returns {?{edits: {factors: Array<Array<?number>>, responses: Array<Array<?number>>}, dirty: boolean}} null without a design
 */
export function captureEdits(model, gridColumns) {
  if (!model.design) return null;
  const nFactors = model.factors.length;
  const nResp = model.responses.length;
  const nRuns = model.design.actualMatrix.length;
  const factorEdits = Array.from({ length: nFactors }, () => new Array(nRuns).fill(null));
  const responseEdits = Array.from({ length: nResp }, () => new Array(nRuns).fill(null));
  let dirty = false;
  for (let fi = 0; fi < nFactors; fi++) {
    const col = gridColumns[FACTOR_OFFSET + fi];
    if (!col) continue;
    if (model.factors[fi].kind === 'categorical') continue;
    for (let i = 0; i < nRuns; i++) {
      const v = col.values[i];
      const orig = model.design.actualMatrix[i][fi];
      if (v != null && Number.isFinite(v)) {
        factorEdits[fi][i] = v;
        if (Math.abs(v - orig) > 1e-9) dirty = true;
      }
    }
  }
  for (let ri = 0; ri < nResp; ri++) {
    const col = gridColumns[FACTOR_OFFSET + nFactors + ri];
    if (!col) continue;
    for (let i = 0; i < nRuns; i++) {
      const v = col.values[i];
      if (v != null && Number.isFinite(v)) responseEdits[ri][i] = v;
    }
  }
  return { edits: { factors: factorEdits, responses: responseEdits }, dirty };
}

/**
 * Applies model.previewEdits to the design: factor edits into actualMatrix,
 * response edits into sourceResponseSeeds. Mutates model.design.
 * @param {object} model a State
 * @returns {void}
 */
export function applyEdits(model) {
  const m = model;
  const edits = m.previewEdits;
  if (!edits || !m.design || !m.design.actualMatrix || !m.design.actualMatrix.length) return;
  const nRuns = m.design.actualMatrix.length;
  if (Array.isArray(edits.factors)) {
    m.factors.forEach((f, fi) => {
      if (f.kind === 'categorical') return;
      const colEdits = edits.factors[fi];
      if (!Array.isArray(colEdits)) return;
      for (let i = 0; i < nRuns; i++) {
        const v = colEdits[i];
        if (v != null && Number.isFinite(v)) m.design.actualMatrix[i][fi] = v;
      }
    });
  }
  if (Array.isArray(edits.responses)) {
    const seeds = Array.isArray(m.design.sourceResponseSeeds)
      ? m.design.sourceResponseSeeds.map((col) => (Array.isArray(col) ? [...col] : new Array(nRuns).fill(null)))
      : m.responses.map(() => new Array(nRuns).fill(null));
    let touched = false;
    m.responses.forEach((_, ri) => {
      while (seeds[ri].length < nRuns) seeds[ri].push(null);
      const colEdits = edits.responses[ri];
      if (!Array.isArray(colEdits)) return;
      for (let i = 0; i < nRuns; i++) {
        const v = colEdits[i];
        if (v != null && Number.isFinite(v)) { seeds[ri][i] = v; touched = true; }
      }
    });
    if (touched) { m.design.sourceResponseSeeds = seeds; m.design.sourceRowCount = nRuns; }
  }
}

/**
 * Column names of the run rows: trimmed factor name or letter; trimmed response name or Y<n>.
 * @param {object} model a State
 * @returns {{factors: string[], responses: string[]}}
 */
export function columnNames(model) {
  return {
    factors: model.factors.map((f, fi) => (f.name && f.name.trim()) || letter(fi)),
    responses: model.responses.map((r, ri) => (r.name && r.name.trim()) || `Y${ri + 1}`),
  };
}

/**
 * @param {object} model a State
 * @param {string} name a key of runRows()[i].factors or .responses
 * @returns {?{kind: 'factor'|'response', index: number}}
 */
export function resolveColumn(model, name) {
  const names = columnNames(model);
  const fi = names.factors.indexOf(name);
  if (fi >= 0) return { kind: 'factor', index: fi };
  const ri = names.responses.indexOf(name);
  if (ri >= 0) return { kind: 'response', index: ri };
  return null;
}

/**
 * The runs as rows, keyed by column name.
 * @param {object} model a State
 * @param {?number[][]} [responseValues] values per response from a linked datasheet
 * @returns {Array<{run: number, std: number, block: number, replicate: number, factors: object, responses: object}>}
 */
export function runRows(model, responseValues = null) {
  const cols = buildRunTable(model, (key) => key);
  if (!cols.length) return [];
  const k = model.factors.length;
  const names = columnNames(model);
  const n = cols[0].values.length;
  return Array.from({ length: n }, (_, i) => ({
    run: cols[0].values[i],
    std: cols[1].values[i],
    block: cols[2].values[i],
    replicate: cols[3].values[i],
    factors: Object.fromEntries(names.factors.map((name, fi) => [name, cols[FACTOR_OFFSET + fi].values[i]])),
    responses: Object.fromEntries(names.responses.map((name, ri) => [
      name,
      responseValues ? (responseValues[ri]?.[i] ?? null) : cols[FACTOR_OFFSET + k + ri].values[i],
    ])),
  }));
}

/**
 * True when a continuous factor edit differs from the design.
 * @param {object} model a State with a design
 * @param {{factors: Array<Array<?number>>}} edits
 * @returns {boolean}
 */
export function editsDirty(model, edits) {
  const matrix = model.design.actualMatrix;
  return model.factors.some((f, fi) => f.kind !== 'categorical'
    && (edits.factors[fi] || []).some((v, i) => v != null && Number.isFinite(v) && Math.abs(v - matrix[i][fi]) > 1e-9));
}

/**
 * The preview edits with one cell set.
 * @param {object} model a State with a design
 * @param {number} rowIdx row index in design order
 * @param {{kind: 'factor'|'response', index: number}} column
 * @param {?number} value null reverts the cell
 * @returns {{edits: {factors: Array<Array<?number>>, responses: Array<Array<?number>>}, dirty: boolean}}
 */
export function withEdit(model, rowIdx, column, value) {
  const n = model.design.actualMatrix.length;
  const base = model.previewEdits || {};
  const copy = (list, i) => (Array.isArray(list?.[i]) ? [...list[i]] : new Array(n).fill(null));
  const factors = model.factors.map((_, fi) => copy(base.factors, fi));
  const responses = model.responses.map((_, ri) => copy(base.responses, ri));
  (column.kind === 'factor' ? factors : responses)[column.index][rowIdx] = value;
  const edits = { factors, responses };
  return { edits, dirty: editsDirty(model, edits) };
}
