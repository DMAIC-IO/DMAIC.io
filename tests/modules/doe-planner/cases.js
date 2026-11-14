/**
 * Shared cases of the doe-planner domain tests: the example plans with the
 * design `generateDesign` makes for them, and the frozen columns and
 * experiment records the planner wrote for the same designs before.
 */
import { generateDesign } from '../../../js/engines/doe-planner-engine.js';
import { termsFromLegacyOptions } from '../../../js/engines/doe-terms.js';
import { activeTerms, isOptimal } from '../../../js/modules/doe-planner/domain/design.js';

/** Example projects with a planner state. */
export const EXAMPLES = [
  'doe-optimal-augment-3f',
  'doe-optimal-mixed-4f',
  'doe-optimal-rsm-3f',
  'doe-optimal-screening-5f',
  'doe-planner-hubschrauber-flyer',
];

/** Column names as the caller passes them (translated there). */
export const NAMES = Object.freeze({
  runOrder: 'RunOrder',
  stdOrder: 'StdOrder',
  block: 'Block',
  replicate: 'Replicate',
  factor: 'Factor',
  meanSuffix: 'Mean',
  lnVarSuffix: 'lnVar',
});

/**
 * @param {string} path relative to this file
 * @returns {Promise<any>}
 */
async function loadJson(path) {
  const res = await fetch(new URL(path, import.meta.url));
  return res.json();
}

/**
 * A planner model from a stored example state, with the old option pair
 * turned into active terms.
 * @param {any} saved
 * @returns {any}
 */
function modelOf(saved) {
  const options = { optimalActiveTerms: null, forbiddenVertices: [], ...saved.options };
  if (!Array.isArray(options.optimalActiveTerms) && saved.factors.length >= 2
    && (options.optimalQuadratic || Array.isArray(options.optimalExcludedInteractions))) {
    options.optimalActiveTerms = termsFromLegacyOptions(saved.factors.length, Boolean(options.optimalQuadratic), options.optimalExcludedInteractions);
  }
  delete options.optimalQuadratic;
  delete options.optimalExcludedInteractions;
  return {
    doeName: saved.doeName,
    designType: saved.designType,
    factors: saved.factors.map((f) => ({ ...f, levels: [...f.levels] })),
    responses: saved.responses.map((r) => ({ ...r })),
    options,
    selectedRes: saved.selectedRes,
    selectedPBIdx: saved.selectedPBIdx,
    sourceWorksheet: null,
  };
}

/**
 * @param {any} m
 * @returns {any} the design of the model, as the planner generates it
 */
function designOf(m) {
  return generateDesign(m.factors, {
    designType: m.designType,
    selectedRes: m.selectedRes,
    randomize: m.options.randomize,
    centerPoints: m.options.centerPoints,
    replicates: m.options.replicates || 1,
    alphaType: m.options.alphaType,
    ccdCenterPoints: m.options.ccdCenterPoints,
    bbCenterPoints: m.options.bbCenterPoints,
    taguchiArray: m.options.taguchiArray || undefined,
    optimalRuns: m.options.optimalRuns || undefined,
    optimalActiveTerms: isOptimal(m) ? activeTerms(m) : undefined,
    forbiddenVertices: m.options.forbiddenVertices,
  });
}

/**
 * The five examples plus one with source seeds for the responses.
 * @returns {Promise<Array<{ name: string, model: any, design: any }>>}
 */
export async function loadCases() {
  const out = [];
  for (const file of EXAMPLES) {
    const model = modelOf(await loadJson(`../../../examples/projects/${file}.json`));
    out.push({ name: file, model, design: designOf(model) });
  }
  const model = modelOf(await loadJson('../../../examples/projects/doe-optimal-augment-3f.json'));
  const design = designOf(model);
  design.sourceRowCount = 4;
  design.sourceResponseSeeds = [[1.5, null, 3, 4.25, 9, 9]];
  out.push({ name: 'seeded', model, design });
  return out;
}

/** @returns {Promise<any>} frozen columns per case */
export function legacyColumns() { return loadJson('./fixtures/legacy-columns.json'); }

/** @returns {Promise<any>} frozen worksheet ref and experiment record per case */
export function legacyExperiments() { return loadJson('./fixtures/legacy-experiments.json'); }
