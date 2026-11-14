/**
 * D.Mike — DoE Planner: reading a generated design (domain/design.js)
 *
 * Pure. The stored design keeps its actual matrix as text; every reader
 * takes the rows from `actualRows`, which gives numbers for continuous
 * factors and the level label for categorical ones. The model terms of a
 * design live here too, so the snapshot and the model compute them alike.
 */
import { defaultActiveTerms, parseTermId, designModelTerms } from '../../../engines/doe-terms.js';

/** Design types whose runs come from an optimality criterion. */
export const OPTIMAL_TYPES = Object.freeze(['dopt', 'aopt', 'gopt']);

/**
 * @param {{ designType: string }} model
 * @returns {boolean} the design type is optimal (dopt, aopt, gopt)
 */
export function isOptimal(model) {
  return OPTIMAL_TYPES.includes(model.designType);
}

/**
 * One cell of the actual matrix as the worksheet wants it.
 * @param {any} v stored cell (number or text)
 * @param {boolean} categorical the factor is categorical
 * @returns {number|string|null}
 */
function actualCell(v, categorical) {
  if (categorical) return v;
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return null;
  return Number(v);
}

/**
 * Rows of the actual matrix: numbers for continuous factors, level labels
 * for categorical ones. Works on numbers and on text cells alike.
 * @param {{ actualMatrix?: Array<Array<number|string>> }|null} design
 * @param {Array<{ kind?: string }>} factors
 * @returns {Array<Array<number|string|null>>} [] without a design
 */
export function actualRows(design, factors) {
  if (!design || !Array.isArray(design.actualMatrix)) return [];
  return design.actualMatrix.map((row) => row.map((v, fi) => actualCell(v, factors[fi]?.kind === 'categorical')));
}

/**
 * The active model terms of an optimal design, cleaned of unknown ids,
 * terms of missing factors and duplicates; the default terms when none
 * are set.
 * @param {{ factors: object[], options: { optimalActiveTerms?: string[]|null } }} model
 * @returns {string[]}
 */
export function activeTerms(model) {
  const k = model.factors.length;
  if (k < 1) return [];
  let list = model.options.optimalActiveTerms;
  if (!Array.isArray(list)) list = defaultActiveTerms(k);
  const seen = new Set();
  const cleaned = [];
  for (const id of list) {
    const parsed = parseTermId(id);
    if (!parsed) continue;
    if (parsed.factors.some((f) => f < 0 || f >= k)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    cleaned.push(id);
  }
  return cleaned;
}

/**
 * Canonical model terms of a design.
 * @param {{ designType: string, factors: Array<{ kind?: string }>, options: object }} model
 * @param {{ codedMatrix: number[][] }} design
 * @returns {string[]}
 */
export function modelTerms(model, design) {
  return designModelTerms(design.codedMatrix, {
    activeTerms: isOptimal(model) ? activeTerms(model) : undefined,
    categoricalFlags: model.factors.map((f) => f.kind === 'categorical'),
  });
}
