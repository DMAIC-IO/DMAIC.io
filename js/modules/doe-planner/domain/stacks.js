/**
 * D.Mike — DoE Planner: stacks for a bound datasheet (domain/stacks.js)
 *
 * Pure. The planner changes its datasheet only through stacks of worksheet
 * actions, sent in one go (all or nothing, one undo step):
 * - `augmentStack` appends the runs of an augmented design. Writing into
 *   locked columns lifts their lock first and sets the old meta again at
 *   the end — the worksheet rejects every write into a locked column.
 * - `responseSyncStack` carries renamed, added and removed responses into
 *   the sheet.
 */
import { aggregateFormula } from './columns.js';

/**
 * @typedef {import('./experiment.js').WorksheetBinding} WorksheetBinding
 * @typedef {{ id: string, name: string, meta: { lock?: 'hard'|'soft', reason?: string }|null }} SheetColumn
 *   a column as the worksheet reads it (`read().columns[]`)
 * @typedef {{ op: 'instance.call', id?: string, module: 'worksheet', instance: string, method: string,
 *   args: any[] }} WorksheetCall
 */

/**
 * @param {string} instance worksheet instance
 * @returns {(method: string, args: any[], id?: string) => WorksheetCall}
 */
function caller(instance) {
  return (method, args, id) => (id === undefined
    ? { op: 'instance.call', module: 'worksheet', instance, method, args }
    : { op: 'instance.call', id, module: 'worksheet', instance, method, args });
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
    const { lock, ...rest } = copy(c.meta);
    return call('setColumnMeta', [sheet, c.id, rest]);
  });
  stack.push(call('addRows', [sheet, n]));

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
        formulas.push(call('setFormula', [sheet, col.id, rowCount + i, aggregateFormula(h.kind, stdName, respName, rowCount + i + 1)]));
      }
    }
    if (values) stack.push(call('setCells', [sheet, col.id, rowCount, [...values]]));
  }
  stack.push(...formulas);
  stack.push(...locked.map((c) => call('setColumnMeta', [sheet, c.id, copy(/** @type {object} */ (c.meta))])));
  return stack;
}

/**
 * Column reference to the column a stack entry with `id` wrote.
 * @typedef {{ $from: string, path: string }} StackRef
 */

/**
 * @typedef {object} ResponseSyncPlan
 * @property {WorksheetCall[]} stack the actions, [] when nothing changed
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
 * What it takes to bring the response columns of a bound datasheet from
 * `before` (the responses the sheet was written with) to `after` (the
 * planner's responses). The lists are walked together: a response with
 * the same name stays. Otherwise the `before` one was removed (its column
 * and its helper columns go) when the `after` one comes later in `before`,
 * or else when `before` has more left; the `after` one was added (a column
 * is appended, without meta and without helper columns) when the `before`
 * one comes later in `after`, or else when `after` has more left; with as
 * many left on both sides it was renamed.
 *
 * @param {WorksheetBinding} ref the binding of the datasheet
 * @param {Array<{ name: string }>} before responses of the sheet
 * @param {Array<{ name: string, unit?: string }>} after responses of the planner
 * @returns {ResponseSyncPlan}
 */
export function responseSyncPlan(ref, before, after) {
  const call = caller(ref.instanceId);
  const sheet = ref.sheetId;
  /** @type {WorksheetCall[]} */
  const stack = [];
  /** @type {Array<string|StackRef>} */
  const responseColumnIds = [];
  /** @type {Array<string|null>} */
  const meanColumnIds = [];
  /** @type {Array<string|null>} */
  const lnVarColumnIds = [];
  const keep = (/** @type {number} */ i) => {
    responseColumnIds.push(ref.responseColumnIds[i]);
    meanColumnIds.push(ref.meanColumnIds?.[i] ?? null);
    lnVarColumnIds.push(ref.lnVarColumnIds?.[i] ?? null);
  };

  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    const leftBefore = before.length - i;
    const leftAfter = after.length - j;
    const nameBefore = leftBefore > 0 ? columnName(before[i], i) : null;
    const nameAfter = leftAfter > 0 ? columnName(after[j], j) : null;
    const removed = nameAfter !== null && before.slice(i + 1).some((r, k) => columnName(r, i + 1 + k) === nameAfter);
    const added = !removed && nameBefore !== null && after.slice(j + 1).some((r, k) => columnName(r, j + 1 + k) === nameBefore);
    if (nameBefore !== null && nameBefore === nameAfter) {
      keep(i); i++; j++;
    } else if (removed || (!added && leftBefore > leftAfter)) {
      stack.push(call('removeColumn', [sheet, ref.responseColumnIds[i]]));
      for (const id of [ref.meanColumnIds?.[i], ref.lnVarColumnIds?.[i]]) {
        if (id) stack.push(call('removeColumn', [sheet, id]));
      }
      i++;
    } else if (added || leftBefore < leftAfter) {
      const r = after[j];
      const id = `response:${j}`;
      /** @type {{ to: 'append', name: string, type: 'numeric', values: any[], format: object, unit?: string }} */
      const entry = { to: 'append', name: columnName(r, j), type: 'numeric', values: [], format: { decimals: 4 } };
      if (r.unit) entry.unit = r.unit;
      stack.push(call('writeColumns', [sheet, [entry]], id));
      const written = { $from: id, path: 'value.0' };
      stack.push(call('setColumnRole', [sheet, written, 'continuous']));
      responseColumnIds.push(written);
      meanColumnIds.push(null);
      lnVarColumnIds.push(null);
      j++;
    } else {
      stack.push(call('renameColumn', [sheet, ref.responseColumnIds[i], columnName(after[j], j)]));
      keep(i); i++; j++;
    }
  }
  return { stack, responseColumnIds, meanColumnIds, lnVarColumnIds };
}

/**
 * The stack of `responseSyncPlan`.
 * @param {WorksheetBinding} ref the binding of the datasheet
 * @param {Array<{ name: string }>} before responses of the sheet
 * @param {Array<{ name: string, unit?: string }>} after responses of the planner
 * @returns {WorksheetCall[]|null} null when the response columns already match
 */
export function responseSyncStack(ref, before, after) {
  const { stack } = responseSyncPlan(ref, before, after);
  return stack.length ? stack : null;
}
