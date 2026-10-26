/**
 * D.Mike — DoE Planner: Taguchi orthogonal arrays (designs/taguchi.js)
 */
import { TAGUCHI } from '../doe-planner-designs.js';
import { taguchiCandidates } from '../../../engines/doe-planner-engine.js';
import { OK, fail } from './check.js';

/** @type {import('./index.js').DesignType} */
const taguchi = {
  id: 'taguchi',
  centerPoints: false,
  twoLevelOnly: false,
  dispersion: false,
  /** @param {object} model @returns {{ok: boolean, reason: ?string}} */
  check(model) { return model.options.taguchiArray ? OK : fail('noTaguchiArray'); },
  /** @param {object} model @param {{sourceRowCount: number}} env @returns {boolean} */
  isValid(model, env) { return taguchi.check(model, env).ok; },
  /** @param {object} model @returns {number|'?'} runs of the selected array */
  runs(model) {
    const sel = model.options.taguchiArray;
    const oa = sel ? Object.values(TAGUCHI).find((x) => x.name === sel) : null;
    return oa ? oa.runs : '?';
  },
  /** @param {object} model @returns {string} the array name, 'OA' without */
  resolution(model) { return model.options.taguchiArray || 'OA'; },

  /** @param {object} model @returns {number[]} level count per factor */
  levelCounts(model) { return model.factors.map((f) => f.levels.length); },
  /** @param {object} model @returns {Array<{name: string, runs: number, maxFactors: number}>} arrays that fit */
  candidates(model) { return taguchiCandidates(taguchi.levelCounts(model)); },
  /** @param {object} model @returns {string} the chosen array, else the first candidate, else '' */
  selected(model) {
    const cands = taguchi.candidates(model);
    return model.options.taguchiArray || (cands.length > 0 ? cands[0].name : '');
  },
  /** @param {object} model @returns {'taguchiLevels2'|'taguchiLevels3'|'taguchiLevelsMixed'} i18n key */
  levelsKey(model) {
    const lc = taguchi.levelCounts(model);
    const sameLevels = lc.length > 0 && lc.every((n) => n === lc[0]);
    if (!sameLevels) return 'taguchiLevelsMixed';
    return lc[0] === 3 ? 'taguchiLevels3' : 'taguchiLevels2';
  },
};

export default taguchi;
