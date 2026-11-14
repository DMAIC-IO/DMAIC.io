/**
 * D.Mike — DoE Planner: the experiment of a datasheet (domain/experiment.js)
 *
 * Pure. When the planner writes a datasheet it keeps a snapshot of what
 * the sheet describes (factors, terms, aliasing, center points, replicate
 * groups, responses) at the binding. The experiment that downstream
 * modules (regression, response optimization) read is built from the
 * binding and that snapshot — never from the current plan, which may have
 * moved on since the sheet was written.
 */
import { decimalOr } from '../../../core/parse-decimal.js';
import { modelTerms } from './design.js';
import { codedToActualRows } from './runtable.js';
import { designSignature } from './signatures.js';

/**
 * What a datasheet describes, kept at its binding.
 * @typedef {object} Snapshot
 * @property {string} name plan name
 * @property {string|null} designType design type of the plan
 * @property {Array<{ name: string, kind: 'continuous'|'categorical', unit: string|null, levels: string[]|null }>} factors
 * @property {{ linear: boolean, terms: string[], blockColumn: boolean }} plannedTerms model terms of the plan
 * @property {any} aliasing alias structure of the design, null without one
 * @property {number[]} centerPointRows 0-based rows that are center points
 * @property {number[][]} replicateGroups 0-based rows with equal coded factor values (groups of two or more)
 * @property {Array<{ name: string, unit: string|null }>} responses
 */

/**
 * A bound datasheet: where it lives, the ids of its tagged columns and
 * the snapshot written with it.
 * @typedef {object} WorksheetBinding
 * @property {string} instanceId worksheet instance
 * @property {string} sheetId sheet within the worksheet
 * @property {string} runOrderColumnId run-order column
 * @property {string} stdOrderColumnId std-order column
 * @property {string[]} factorColumnIds factor columns, in factor order
 * @property {string[]} responseColumnIds response columns, in response order
 * @property {string[]} [meanColumnIds] mean helper columns, parallel to the responses
 * @property {string[]} [lnVarColumnIds] ln(variance) helper columns, parallel to the responses
 * @property {Snapshot|null} [snapshot] what the sheet describes
 */

/**
 * An experiment as downstream modules read it.
 * @typedef {object} Experiment
 * @property {string} name plan name
 * @property {string|null} designType design type
 * @property {Array<{ name: string, kind: 'continuous'|'categorical', unit: string|null, levels: string[]|null,
 *   low?: number|null, high?: number|null, reference?: string|null }>} factors continuous factors
 *   carry low/high, categorical ones their reference level
 * @property {{ linear: boolean, terms: string[], blockColumn: boolean }} plannedTerms
 * @property {any} aliasing
 * @property {{ worksheetRef: { instanceId: string, sheetId: string }, columnTags: { runOrder: string,
 *   stdOrder: string, factors: string[], responses: string[], means: string[], lnVars: string[] } }} runMatrix
 * @property {number[]} centerPointRows
 * @property {number[][]} replicateGroups
 * @property {Array<{ name: string, unit: string|null, columnId: string, meanColumnId: string|null,
 *   lnVarColumnId: string|null }>} responseColumns
 */

/**
 * Rows of equal coded factor values — the pure-error replicates of any
 * design type, center points included; a center point of one categorical
 * level is no replicate of one of another level.
 * @param {{ codedMatrix?: number[][] }} design
 * @returns {number[][]} [] without a coded matrix
 */
function replicateGroupsOf(design) {
  const source = design.codedMatrix;
  if (!Array.isArray(source)) return [];
  /** @type {Map<string, number[]>} */
  const groups = new Map();
  source.forEach((row, idx) => {
    // Equal to eight decimals: float noise of the coded values does not split a group.
    const key = row.map((v) => String(Math.round(Number(v) * 1e8))).join('|');
    const list = groups.get(key) ?? [];
    list.push(idx);
    groups.set(key, list);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}

/**
 * The snapshot of a datasheet written for `design` from `model`.
 * @param {{ doeName: string, designType: string, factors: Array<{ name: string, unit?: string, kind?: string,
 *   levels?: string[] }>, responses: Array<{ name: string, unit?: string }>, options: object }} model
 * @param {{ designType?: string, codedMatrix: number[][], aliases?: any, centerPointRows?: number[] }} design
 * @returns {Snapshot}
 */
export function snapshotOf(model, design) {
  return {
    name: model.doeName,
    designType: design.designType ?? null,
    factors: model.factors.map((f) => ({
      name: f.name,
      kind: f.kind === 'categorical' ? 'categorical' : 'continuous',
      unit: f.unit ?? null,
      levels: Array.isArray(f.levels) ? [...f.levels] : null,
    })),
    plannedTerms: { linear: true, terms: [...modelTerms(/** @type {any} */ (model), design)], blockColumn: false },
    aliasing: design.aliases === undefined || design.aliases === null ? null : JSON.parse(JSON.stringify(design.aliases)),
    centerPointRows: Array.isArray(design.centerPointRows) ? [...design.centerPointRows] : [],
    replicateGroups: replicateGroupsOf(design),
    responses: model.responses.map((r) => ({ name: r.name, unit: r.unit ?? null })),
  };
}

/**
 * The experiment of a bound datasheet, from its binding and snapshot.
 * @param {WorksheetBinding|null|undefined} worksheetRef
 * @returns {Experiment|null} null without a binding or without a snapshot
 */
export function experimentOf(worksheetRef) {
  const snap = worksheetRef?.snapshot;
  if (!worksheetRef || !snap) return null;
  const ref = worksheetRef;
  return {
    name: snap.name,
    designType: snap.designType ?? null,
    factors: snap.factors.map((f) => {
      const kind = f.kind === 'categorical' ? 'categorical' : 'continuous';
      /** @type {Experiment['factors'][number]} */
      const out = {
        name: f.name,
        kind,
        unit: kind === 'categorical' ? null : (f.unit ?? null),
        levels: f.levels ? [...f.levels] : null,
      };
      if (kind === 'continuous') {
        out.low = decimalOr(f.levels?.[0], null);
        out.high = decimalOr(f.levels?.[f.levels.length - 1], null);
      } else {
        // The optimizer bounds categorical factors by their coded ±1 range;
        // low/high carry no meaning here.
        out.reference = f.levels?.[0] ?? null;
      }
      return out;
    }),
    plannedTerms: { linear: snap.plannedTerms.linear, terms: [...snap.plannedTerms.terms], blockColumn: snap.plannedTerms.blockColumn },
    aliasing: snap.aliasing ?? null,
    runMatrix: {
      worksheetRef: { instanceId: ref.instanceId, sheetId: ref.sheetId },
      columnTags: {
        runOrder: ref.runOrderColumnId,
        stdOrder: ref.stdOrderColumnId,
        factors: [...ref.factorColumnIds],
        responses: [...ref.responseColumnIds],
        means: [...(ref.meanColumnIds ?? [])],
        lnVars: [...(ref.lnVarColumnIds ?? [])],
      },
    },
    centerPointRows: [...snap.centerPointRows],
    replicateGroups: snap.replicateGroups.map((g) => [...g]),
    responseColumns: snap.responses.map((r, i) => ({
      name: r.name || `Y${i + 1}`,
      unit: r.unit ?? null,
      columnId: ref.responseColumnIds[i],
      meanColumnId: ref.meanColumnIds?.[i] ?? null,
      lnVarColumnId: ref.lnVarColumnIds?.[i] ?? null,
    })),
  };
}

/**
 * The design and binding after appending runs to the bound datasheet: the
 * design grows by the coded rows (actual values as text, run and std order
 * continue, replicate 1), the binding gets the new design signature and
 * the snapshot the new replicate groups. Pure; neither input changes.
 * @param {{ factors: Array<{ name: string, unit: string, kind: string, levels: string[] }>, design: any,
 *   worksheetRef: any, doeName: string, designType: string, responses: any[], options: object }} model
 * @param {number[][]} rows coded settings of the new runs, one value per factor
 * @returns {{ design: any, worksheetRef: any }}
 * @throws {Error} without a design and binding, or with rows of the wrong width
 */
export function appendedRuns(model, rows) {
  const k = model.factors.length;
  if (!model.design || !model.worksheetRef) throw new Error('appendedRuns: a design with a bound datasheet is needed');
  if (rows.length === 0 || rows.some((r) => r.length !== k)) throw new Error(`appendedRuns: one or more rows of ${k} coded values`);
  /** @type {any} */
  const d = JSON.parse(JSON.stringify(model.design));
  const n = d.codedMatrix.length;
  const numbers = rows.map((_, i) => n + i + 1);
  const design = {
    ...d,
    codedMatrix: [...d.codedMatrix, ...rows.map((r) => [...r])],
    actualMatrix: [...d.actualMatrix, ...codedToActualRows(rows, model.factors).map((row) => row.map((v) => String(v)))],
    runOrder: [...d.runOrder, ...numbers],
    stdOrder: [...d.stdOrder, ...numbers],
    replicateIds: [...d.replicateIds, ...rows.map(() => 1)],
  };
  const worksheetRef = JSON.parse(JSON.stringify(model.worksheetRef));
  worksheetRef.designSignature = designSignature({ design, factors: model.factors });
  if (worksheetRef.snapshot) worksheetRef.snapshot.replicateGroups = snapshotOf(model, design).replicateGroups;
  return { design, worksheetRef };
}
