/**
 * D.Mike — DoE Planner: signatures (domain/signatures.js)
 *
 * Pure. Two identities of a planner:
 * - `configSignature`: everything the design matrix depends on. A change
 *   means the design must be generated again.
 * - `designSignature`: the generated design and its factors. A bound
 *   datasheet whose stored signature differs is stale. Responses do not
 *   count: renaming, adding or removing one is carried into the sheet.
 */
import { isOptimal } from './design.js';

/**
 * A freshly added factor that nobody has touched yet.
 * @param {{ name: string, unit: string, kind: string, levels: string[] }} f
 * @returns {boolean}
 */
function isBlankFactor(f) {
  return f.name.trim() === '' && f.unit === '' && f.kind === 'continuous'
    && f.levels.length === 2 && f.levels.every((l) => l === '');
}

/**
 * Identity of everything the design matrix depends on: factors, design
 * type, type parameters, options, seed and the source worksheet. A blank
 * new factor does not count. The response names count only for an optimal
 * design built on a source worksheet: its response seeds are matched to
 * the source columns by name.
 * @param {any} m planner model
 * @returns {string}
 */
export function configSignature(m) {
  const o = m.options;
  const withSource = isOptimal(m) && Boolean(m.sourceWorksheet);
  return JSON.stringify({
    factors: m.factors.filter((f) => !isBlankFactor(f)).map((f) => [f.name, f.unit, f.kind, f.levels]),
    designType: m.designType,
    selectedRes: m.selectedRes ? [m.selectedRes.k, m.selectedRes.runs] : null,
    selectedPBIdx: m.selectedPBIdx,
    options: [o.randomize, o.centerPoints, o.replicates, o.alphaType, o.ccdCenterPoints, o.bbCenterPoints,
      o.taguchiArray, o.optimalRuns, o.optimalActiveTerms, o.forbiddenVertices],
    source: m.sourceWorksheet ? `${m.sourceWorksheet.instanceId}::${m.sourceWorksheet.sheetId}` : null,
    seed: m.seed ?? 0,
    responses: withSource ? m.responses.map((r) => r.name) : null,
  });
}

/**
 * Identity of the generated design and its factors (name, unit, kind,
 * levels — they make the factor columns of the sheet). The coded matrix is
 * reproducible for the same input, so it identifies the runs.
 * @param {any} m planner model
 * @returns {string|null} null without a design
 */
export function designSignature(m) {
  if (!m.design) return null;
  return JSON.stringify({
    designType: m.design.designType,
    factors: m.factors.filter((f) => !isBlankFactor(f)).map((f) => [f.name, f.unit, f.kind, f.levels]),
    coded: m.design.codedMatrix,
  });
}

/**
 * The design signature of the earlier planner, responses included. Only
 * for migrating stored bindings: a stored value equal to this one for the
 * stored design is replaced by `designSignature`.
 * @param {any} m planner model
 * @returns {string|null} null without a design
 */
export function legacyDesignSignature(m) {
  if (!m.design) return null;
  return [
    m.design.designType,
    m.design.codedMatrix.length,
    m.responses.length,
    m.responses.map((r) => `${r.name}|${r.unit}`).join('||'),
    m.design.codedMatrix.map((r) => r.join(',')).join(';'),
  ].join('#');
}
