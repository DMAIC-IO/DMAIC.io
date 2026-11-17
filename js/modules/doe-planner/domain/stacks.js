/**
 * D.Mike — DoE Planner: stacks for a bound datasheet (domain/stacks.js)
 *
 * Pure. The planner changes its datasheet only through stacks of worksheet
 * actions, sent in one go (all or nothing, one undo step):
 * - `augmentStack` appends the runs of an augmented design. Writing into
 *   locked columns lifts their lock first and sets the old meta again at
 *   the end — the worksheet rejects every write into a locked column.
 * - `responseSyncStack` carries a renamed, added or removed response into
 *   the sheet.
 * Metas go out without null values; the worksheet rejects them.
 */
import { aggregateFormula } from './columns.js';

/**
 * @typedef {import('./experiment.js').WorksheetBinding} WorksheetBinding
 * @typedef {{ id: string, name: string, meta: { lock?: 'hard'|'soft', reason?: string }|null }} SheetColumn
 *   a column as the worksheet reads it (`read().columns[]`)
 * @typedef {{ op: 'instance.call', id?: string, module: 'worksheet', instance: string, method: string,
 *   args: [object] }} WorksheetCall  worksheet commands take exactly one object
 */

/**
 * @param {string} instance worksheet instance
 * @returns {(method: string, cmd: object, id?: string) => WorksheetCall}
 */
function caller(instance) {
  return (method, cmd, id) => (id === undefined
    ? { op: 'instance.call', module: 'worksheet', instance, method, args: [cmd] }
    : { op: 'instance.call', id, module: 'worksheet', instance, method, args: [cmd] });
}

/**
 * @param {object} meta
 * @returns {any} a JSON copy
 */
const copy = (meta) => JSON.parse(JSON.stringify(meta));

/**
 * The stack that appends new runs to a bound datasheet: run and std order
 * continue after the last row, block and replicate are 1, the factor
 * columns get the new actual values, the response columns stay empty, the
 * helper columns get their aggregate formulas for the new rows. Columns
 * the planner does not know about only grow by empty rows.
 *
 * Order: `setColumnMeta` without `lock` for every locked column,
 * `addRows`, `setCells` per column, `setFormula` per helper cell,
 * `setColumnMeta` with the old meta for every locked column.
 *
 * @param {WorksheetBinding} ref the binding of the datasheet
 * @param {SheetColumn[]} columns the sheet's columns, in sheet order
 * @param {Array<Array<number|string>>} newRows actual values of the new runs, one row per run, factors in order
 * @param {number} rowCount rows of the sheet before appending
 * @returns {WorksheetCall[]|null} null without new rows
 */
export function augmentStack(ref, columns, newRows, rowCount) {
  if (!Array.isArray(newRows) || newRows.length === 0) return null;
  const call = caller(ref.instanceId);
  const sheet = ref.sheetId;
  const n = newRows.length;
  const numbers = Array.from({ length: n }, (_, i) => rowCount + i + 1);
  const ones = new Array(n).fill(1);
  const factorIdx = new Map(ref.factorColumnIds.map((id, i) => [id, i]));
  const nameOf = new Map(columns.map((c) => [c.id, c.name]));
  const stdName = nameOf.get(ref.stdOrderColumnId) ?? '';
  /** @type {Map<string, { kind: 'mean'|'lnVar', response: string }>} */
  const helpers = new Map();
  ref.responseColumnIds.forEach((id, i) => {
    const mean = ref.meanColumnIds?.[i];
    const lnVar = ref.lnVarColumnIds?.[i];
    if (mean) helpers.set(mean, { kind: 'mean', response: id });
    if (lnVar) helpers.set(lnVar, { kind: 'lnVar', response: id });
  });

  const locked = columns.filter((c) => c.meta && c.meta.lock);
  /** @type {WorksheetCall[]} */
  const stack = locked.map((c) => {
    const { lock, ...rest } = cleanMeta(/** @type {object} */ (c.meta));
    return call('setColumnMeta', { sheetId: sheet, columnId: c.id, meta: rest });
  });
  stack.push(call('addRows', { sheetId: sheet, count: n }));

  /** @type {WorksheetCall[]} */
  const formulas = [];
  for (const col of columns) {
    let values = null;
    if (col.id === ref.runOrderColumnId || col.id === ref.stdOrderColumnId) values = numbers;
    else if (col.meta?.reason === 'block-column' || col.meta?.reason === 'replicate-id') values = ones;
    else if (factorIdx.has(col.id)) {
      const fi = /** @type {number} */ (factorIdx.get(col.id));
      values = newRows.map((row) => row[fi]);
    } else if (helpers.has(col.id)) {
      const h = /** @type {{ kind: 'mean'|'lnVar', response: string }} */ (helpers.get(col.id));
      const respName = nameOf.get(h.response) ?? '';
      for (let i = 0; i < n; i++) {
        formulas.push(call('setFormula', { sheetId: sheet, columnId: col.id, row: rowCount + i, formula: aggregateFormula(h.kind, stdName, respName, rowCount + i + 1) }));
      }
    }
    if (values) stack.push(call('setCells', { sheetId: sheet, columnId: col.id, startRow: rowCount, values: [...values] }));
  }
  stack.push(...formulas);
  stack.push(...locked.map((c) => call('setColumnMeta', { sheetId: sheet, columnId: c.id, meta: cleanMeta(/** @type {object} */ (c.meta)) })));
  return stack;
}

/**
 * Column reference to the column a stack entry with `id` wrote.
 * @typedef {{ $from: string, path: string }} StackRef
 */

/**
 * @typedef {object} ResponseSyncPlan
 * @property {WorksheetCall[]} stack the actions, [] when nothing is to do
 * @property {Array<string|StackRef>} responseColumnIds response columns afterwards, in
 *   response order; an added one as a reference to its `writeColumns` entry
 *   (`id` `response:<index>`, the written id is `value.0` of its result)
 * @property {Array<string|null>} meanColumnIds mean helper columns afterwards; null for an added response
 * @property {Array<string|null>} lnVarColumnIds ln(variance) helper columns afterwards; null for an added response
 */

/**
 * @param {{ name: string }} r
 * @param {number} i
 * @returns {string} the column name of a response
 */
const columnName = (r, i) => r.name || `Y${i + 1}`;

/**
 * @param {{ name: string, unit?: string|null }} a
 * @param {{ name: string, unit?: string|null }} b
 * @returns {boolean} same name and unit
 */
const sameResponse = (a, b) => a.name === b.name && (a.unit || '') === (b.unit || '');

/**
 * @param {any[]} a
 * @param {any[]} b
 * @returns {boolean} the lists hold the same responses, in order
 */
const sameList = (a, b) => a.length === b.length && a.every((r, i) => sameResponse(r, b[i]));

/**
 * A meta as the worksheet takes it: keys with a null value left out.
 * @param {object} meta
 * @returns {any}
 */
function cleanMeta(meta) {
  return Object.fromEntries(Object.entries(copy(meta)).filter(([, v]) => v !== null && v !== undefined));
}

/**
 * What it takes to bring the response columns of a bound datasheet from
 * `before` (the responses the sheet was written with) to `after` (the
 * planner's responses). Only one edit at a time is carried over, compared
 * by position:
 * - same length: every position whose name differs is renamed (unless the
 *   new name is one another position had — that is a reorder), its helper
 *   columns too (`<name> <meanSuffix>`, `<name> <lnVarSuffix>`; their lock
 *   is lifted around the rename);
 * - one more and `before` is the start of `after`: the new column is
 *   appended (without meta and without helper columns);
 * - one fewer and `after` is `before` without exactly one position: that
 *   column and its helper columns are removed (fits more than one position,
 *   nothing);
 * - anything else (reordered, several changes at once): nothing.
 *
 * @param {WorksheetBinding} ref the binding of the datasheet
 * @param {Array<{ name: string, unit?: string|null }>} before responses of the sheet
 * @param {Array<{ name: string, unit?: string|null }>} after responses of the planner
 * @param {{ columns: SheetColumn[], names: { meanSuffix: string, lnVarSuffix: string } }} sheet the
 *   sheet's columns (for the meta of locked helper columns) and the helper suffixes
 * @returns {ResponseSyncPlan|null} null when the change cannot be carried over
 */
export function responseSyncPlan(ref, before, after, { columns, names }) {
  const call = caller(ref.instanceId);
  const sheet = ref.sheetId;
  const metaOf = new Map(columns.map((c) => [c.id, c.meta]));
  /** @type {WorksheetCall[]} */
  const stack = [];
  const mean = (/** @type {number} */ i) => ref.meanColumnIds?.[i] ?? null;
  const lnVar = (/** @type {number} */ i) => ref.lnVarColumnIds?.[i] ?? null;
  /** @param {number[]} keep positions of `before` that stay, in order */
  const plan = (keep) => ({
    stack,
    responseColumnIds: /** @type {Array<string|StackRef>} */ (keep.map((i) => ref.responseColumnIds[i])),
    meanColumnIds: keep.map(mean),
    lnVarColumnIds: keep.map(lnVar),
  });
  /** @param {string|null} id @param {string} name */
  const rename = (id, name) => {
    if (!id) return;
    const meta = metaOf.get(id);
    if (meta && meta.lock) {
      const { lock, ...rest } = cleanMeta(meta);
      stack.push(call('setColumnMeta', { sheetId: sheet, columnId: id, meta: rest }));
      stack.push(call('renameColumn', { sheetId: sheet, columnId: id, name }));
      stack.push(call('setColumnMeta', { sheetId: sheet, columnId: id, meta: cleanMeta(meta) }));
    } else {
      stack.push(call('renameColumn', { sheetId: sheet, columnId: id, name }));
    }
  };
  const positions = before.map((_, i) => i);

  if (after.length === before.length) {
    const changed = positions.filter((i) => columnName(after[i], i) !== columnName(before[i], i));
    // A new name that another position had before: reordered, not renamed.
    if (changed.some((i) => before.some((b, k) => k !== i && columnName(b, k) === columnName(after[i], i)))) return null;
    after.forEach((r, i) => {
      const name = columnName(r, i);
      if (name === columnName(before[i], i)) return;
      rename(ref.responseColumnIds[i], name);
      rename(mean(i), `${name} ${names.meanSuffix}`);
      rename(lnVar(i), `${name} ${names.lnVarSuffix}`);
    });
    return plan(positions);
  }

  if (after.length === before.length + 1 && sameList(before, after.slice(0, before.length))) {
    const j = before.length;
    const r = after[j];
    const id = `response:${j}`;
    /** @type {{ to: 'append', name: string, type: 'numeric', values: any[], format: object, unit?: string }} */
    const entry = { to: 'append', name: columnName(r, j), type: 'numeric', values: [], format: { decimals: 4 } };
    if (r.unit) entry.unit = r.unit;
    stack.push(call('writeColumns', { sheetId: sheet, columns: [entry] }, id));
    const written = { $from: id, path: 'value.0' };
    stack.push(call('setColumnRole', { sheetId: sheet, columnId: written, role: 'continuous' }));
    const out = plan(positions);
    out.responseColumnIds.push(written);
    out.meanColumnIds.push(null);
    out.lnVarColumnIds.push(null);
    return out;
  }

  if (after.length === before.length - 1) {
    const fits = positions.filter((k) => sameList(before.filter((_, x) => x !== k), after));
    // Two equal responses: which one went is unknown — no guess at measured data.
    if (fits.length !== 1) return null;
    const i = fits[0];
    for (const id of [ref.responseColumnIds[i], mean(i), lnVar(i)]) {
      if (id) stack.push(call('removeColumn', { sheetId: sheet, columnId: id }));
    }
    return plan(positions.filter((k) => k !== i));
  }

  return null;
}

/**
 * The stack of `responseSyncPlan`.
 * @param {WorksheetBinding} ref the binding of the datasheet
 * @param {Array<{ name: string, unit?: string|null }>} before responses of the sheet
 * @param {Array<{ name: string, unit?: string|null }>} after responses of the planner
 * @param {{ columns: SheetColumn[], names: { meanSuffix: string, lnVarSuffix: string } }} sheet the
 *   sheet's columns and the helper suffixes
 * @returns {WorksheetCall[]|null} null when nothing is to do or the change cannot be carried over
 */
export function responseSyncStack(ref, before, after, sheet) {
  const res = responseSyncPlan(ref, before, after, sheet);
  return res && res.stack.length ? res.stack : null;
}
