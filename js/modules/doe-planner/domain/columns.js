/**
 * D.Mike — DoE Planner: datasheet columns of a design (domain/columns.js)
 *
 * Pure. The one description of the datasheet a design gets: column order,
 * types, roles, formats, values, formulas and the lock meta. The entries
 * are worksheet-builder column inputs; the planner hands them to the
 * builder, the legacy writer turns them into stored columns.
 *
 * Structural columns (run order, std order, block, replicate, factors) are
 * hard-locked so nobody edits the design by accident. Replicated designs
 * get two helper columns per response (mean, ln(variance), soft-locked)
 * whose formulas aggregate over the runs with the same std order.
 */
import { ROLE } from '../../../core/datagrid/datagrid-roles.js';
import { actualRows } from './design.js';

/**
 * Translated column names; the caller passes them in the app language.
 * @typedef {object} ColumnNames
 * @property {string} runOrder name of the run-order column
 * @property {string} stdOrder name of the std-order column (the aggregate formulas name it)
 * @property {string} block name of the block column
 * @property {string} replicate name of the replicate column
 * @property {string} factor prefix of an unnamed factor ("Factor" → "Factor A")
 * @property {string} meanSuffix suffix of a mean helper column
 * @property {string} lnVarSuffix suffix of an ln(variance) helper column
 */

/**
 * Lock and management data of a column.
 * @typedef {{ lock: 'hard'|'soft', managedBy: string, managedRef?: string, reason: string,
 *   categoricalCoding?: Record<string, number> }} ColumnMeta
 */

/**
 * One datasheet column. Fits the worksheet builder's `column()` input:
 * `format: null` gives the type's default format, `meta: null` no meta,
 * `null` entries of `formulas` no formula.
 * @typedef {object} DesignColumn
 * @property {string} name column name
 * @property {'numeric'|'text'} type column type
 * @property {string} unit unit, '' without one
 * @property {Array<number|string|null>} values one value per run
 * @property {Array<string|null>} formulas one formula (or null) per run
 * @property {{ decimals: number }|null} format display format
 * @property {ColumnMeta|null} meta lock meta, null for the response columns
 * @property {string} role column role
 */

/**
 * Positions (0-based indices into `columns`) of the tagged columns. The
 * worksheet assigns the column ids when it writes; the caller maps these
 * positions to the ids it gets back.
 * @typedef {object} ColumnTags
 * @property {number} runOrder run-order column
 * @property {number} stdOrder std-order column
 * @property {number} block block column
 * @property {number} replicate replicate column
 * @property {number[]} factors factor columns, in factor order
 * @property {number[]} responses response columns, in response order
 * @property {number[]} means mean helper columns, parallel to responses; [] without replicates
 * @property {number[]} lnVars ln(variance) helper columns, parallel to responses; [] without replicates
 */

/**
 * @param {number} n
 * @param {any} v
 * @returns {any[]}
 */
const filled = (n, v) => new Array(n).fill(v);

/**
 * The datasheet columns of a design.
 *
 * Categorical factors carry their level labels and a `categoricalCoding`
 * (label → coded value) in the meta; continuous ones carry the actual
 * numbers. Response columns take the source seeds of a design built on an
 * existing worksheet (the first `sourceRowCount` rows), the rest stays empty.
 *
 * @param {{ actualMatrix: Array<Array<number|string>>, codedMatrix: number[][], runOrder: number[],
 *   stdOrder: number[], replicateIds?: number[], sourceRowCount?: number,
 *   sourceResponseSeeds?: Array<Array<number|null>> }} design a generated design
 * @param {Array<{ name: string, unit?: string, kind?: string, levels: string[] }>} factors
 * @param {Array<{ name: string, unit?: string }>} responses
 * @param {{ names: ColumnNames, managedRef: string|null }} options column names and the
 *   `managedRef` every meta carries; null leaves the key out (the worksheet
 *   takes no null values in a meta)
 * @returns {{ columns: DesignColumn[], ids: ColumnTags }}
 */
export function designColumns(design, factors, responses, { names, managedRef }) {
  const nRuns = design.actualMatrix.length;
  const hasReplicates = nRuns > 0 && Array.isArray(design.replicateIds)
    && design.replicateIds.some((v) => v > 1);
  /** @type {(lock: 'hard'|'soft', reason: string) => ColumnMeta} */
  const lockMeta = (lock, reason) => (managedRef === null || managedRef === undefined
    ? { lock, managedBy: 'doe-planner', reason }
    : { lock, managedBy: 'doe-planner', managedRef, reason });

  /** @type {DesignColumn[]} */
  const columns = [];
  /** @type {ColumnTags} */
  const ids = { runOrder: 0, stdOrder: 1, block: 2, replicate: 3, factors: [], responses: [], means: [], lnVars: [] };

  /**
   * @param {string} name
   * @param {Array<number|string|null>} values
   * @param {string} reason
   * @param {string} role
   */
  const orderColumn = (name, values, reason, role) => columns.push({
    name, type: 'numeric', unit: '', values, formulas: filled(nRuns, null),
    format: { decimals: 0 }, meta: lockMeta('hard', reason), role,
  });
  orderColumn(names.runOrder, [...design.runOrder], 'run-order', ROLE.IDENTIFIER);
  // The std order also groups the replicates of the aggregate formulas.
  orderColumn(names.stdOrder, [...design.stdOrder], 'group-id', ROLE.IDENTIFIER);
  orderColumn(names.block, filled(nRuns, 1), 'block-column', ROLE.CATEGORICAL);
  orderColumn(names.replicate, [...(design.replicateIds || filled(nRuns, 1))], 'replicate-id', ROLE.CATEGORICAL);

  const actual = actualRows(design, factors);
  factors.forEach((f, fi) => {
    const isCategorical = f.kind === 'categorical';
    let values;
    /** @type {ColumnMeta} */
    let meta = lockMeta('hard', 'design-factor');
    if (isCategorical) {
      const nLevels = f.levels.length;
      meta = {
        ...meta,
        categoricalCoding: Object.fromEntries(
          f.levels.map((label, li) => [label, nLevels === 1 ? 0 : -1 + (2 * li) / (nLevels - 1)]),
        ),
      };
      values = design.codedMatrix.map((row) => {
        const idx = Math.round((row[fi] + 1) * (nLevels - 1) / 2);
        const clamped = Math.max(0, Math.min(nLevels - 1, idx));
        return f.levels[clamped] ?? '';
      });
    } else {
      values = actual.map((row) => row[fi]);
    }
    ids.factors.push(columns.length);
    columns.push({
      name: f.name || `${names.factor} ${String.fromCharCode(65 + fi)}`,
      type: isCategorical ? 'text' : 'numeric',
      unit: isCategorical ? '' : (f.unit || ''),
      values,
      formulas: filled(nRuns, null),
      format: isCategorical ? null : { decimals: 2 },
      meta,
      role: isCategorical ? ROLE.CATEGORICAL : ROLE.CONTINUOUS,
    });
  });

  const seedRows = Number.isFinite(design.sourceRowCount) ? Number(design.sourceRowCount) : 0;
  const seeds = Array.isArray(design.sourceResponseSeeds) ? design.sourceResponseSeeds : null;
  responses.forEach((r, ri) => {
    const values = filled(nRuns, null);
    if (seeds && seeds[ri]) {
      const limit = Math.min(seedRows, seeds[ri].length, nRuns);
      for (let i = 0; i < limit; i++) {
        const v = seeds[ri][i];
        if (v != null && Number.isFinite(v)) values[i] = v;
      }
    }
    ids.responses.push(columns.length);
    columns.push({
      name: r.name || `Y${ri + 1}`,
      type: 'numeric',
      unit: r.unit || '',
      values,
      formulas: filled(nRuns, null),
      format: { decimals: 4 },
      meta: null,
      role: ROLE.CONTINUOUS,
    });
  });

  // A single observation per group has no sample variance: helper columns
  // only for replicated designs.
  if (hasReplicates) {
    responses.forEach((r, ri) => {
      const respName = r.name || `Y${ri + 1}`;
      /** @param {'mean'|'lnVar'} kind @returns {string[]} */
      const formulas = (kind) => Array.from({ length: nRuns }, (_, i) => aggregateFormula(kind, names.stdOrder, respName, i + 1));
      ids.means.push(columns.length);
      columns.push({
        name: `${respName} ${names.meanSuffix}`, type: 'numeric', unit: r.unit || '',
        values: filled(nRuns, null), formulas: formulas('mean'),
        format: { decimals: 4 }, meta: lockMeta('soft', 'replicate-aggregate'), role: ROLE.CONTINUOUS,
      });
      ids.lnVars.push(columns.length);
      columns.push({
        name: `${respName} ${names.lnVarSuffix}`, type: 'numeric', unit: '',
        values: filled(nRuns, null), formulas: formulas('lnVar'),
        format: { decimals: 4 }, meta: lockMeta('soft', 'replicate-aggregate'), role: ROLE.CONTINUOUS,
      });
    });
  }

  return { columns, ids };
}

/**
 * The aggregate formula of one row, as the datasheet writes it.
 * @param {'mean'|'lnVar'} kind helper column kind
 * @param {string} stdName name of the std-order column
 * @param {string} respName name of the response column
 * @param {number} row 1-based row
 * @returns {string}
 */
export function aggregateFormula(kind, stdName, respName, row) {
  const std = `'${stdName}'`;
  const resp = `'${respName}'`;
  return kind === 'mean'
    ? `=AVERAGEIF(${std}; ${std}[${row}]; ${resp})`
    : `=LN(VARIF(${std}; ${std}[${row}]; ${resp}))`;
}
