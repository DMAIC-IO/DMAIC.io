/**
 * D.Mike — DoE Planner: fractional factorial 2^(k−p) (designs/frac.js)
 * Pure description of the design type plus the resolution-table helpers.
 */
import { FRAC } from '../doe-planner-designs.js';
import { computeAliasStructure } from '../doe-planner-analysis.js';
import { letter } from '../doe-planner-model.js';
import { OK, fail, hasMultiLevel } from './check.js';

const RES_CLASS = {
  Full: 'doe__res-full', VIII: 'doe__res-viii', VII: 'doe__res-vii',
  VI: 'doe__res-vi', V: 'doe__res-v', IV: 'doe__res-iv', III: 'doe__res-iii',
};

/** @type {import('./index.js').DesignType} */
const frac = {
  id: 'frac',
  centerPoints: true,
  twoLevelOnly: true,
  dispersion: true,
  /** @param {object} model @returns {{ok: boolean, reason: ?string}} */
  check(model) {
    if (hasMultiLevel(model)) return fail('twoLevelOnly');
    if (!model.selectedRes) return fail('noResolution');
    return OK;
  },
  /** @param {object} model @param {{sourceRowCount: number}} env @returns {boolean} */
  isValid(model, env) { return frac.check(model, env).ok; },
  /** @param {object} model @returns {number|'?'} runs of the selected resolution, +3 with center points */
  runs(model) {
    if (!model.selectedRes) return '?';
    return model.selectedRes.runs + (model.options.centerPoints ? 3 : 0);
  },
  /** @param {object} model @returns {string} 'III', 'IV', … or '' without a selection */
  resolution(model) { return model.selectedRes ? model.selectedRes.res : ''; },

  /** @param {number} k @param {number} runs @returns {?{k: number, runs: number, p: number, res: string}} */
  def(k, runs) { return FRAC.find((x) => x.k === k && x.runs === runs) || null; },

  /**
   * @param {number} k factor count of the column
   * @param {number} runs run count of the row
   * @param {object} model
   * @returns {string} CSS classes of the table cell
   */
  cellClass(k, runs, model) {
    const d = frac.def(k, runs);
    if (!d) return 'doe__res-cell--empty';
    const isActiveCol = k === model.factors.length;
    const sel = model.selectedRes && model.selectedRes.k === k && model.selectedRes.runs === runs;
    const disabledCls = isActiveCol ? '' : 'doe__res-cell--disabled';
    return [RES_CLASS[d.res] || '', disabledCls, sel ? 'doe__res-cell--selected' : ''].filter(Boolean).join(' ');
  },

  /**
   * @param {number} k
   * @param {number} runs
   * @param {'k'|'runs'|'res'|'p'} which
   * @param {object} model
   * @returns {?(number|string)} data attribute of a selectable cell, null otherwise
   */
  cellData(k, runs, which, model) {
    const d = frac.def(k, runs);
    if (!d || k !== model.factors.length) return null;
    if (which === 'k') return k;
    if (which === 'runs') return runs;
    if (which === 'res') return d.res;
    if (which === 'p') return d.p;
    return null;
  },

  /** @param {number} k @param {number} runs @param {function(string): string} t @returns {string} */
  cellLabel(k, runs, t) {
    const d = frac.def(k, runs);
    if (!d) return '';
    return d.res === 'Full' ? t('resFull') : d.res;
  },

  /**
   * Generators, defining relation and aliases of the selected resolution, in factor names.
   * @param {object} model
   * @returns {?{generators: string[], defining: string[], aliases: Array<{term: string, aliasedWith: string}>}}
   */
  aliasDetail(model) {
    const s = model.selectedRes;
    if (!s || s.res === 'Full') return null;
    const { k, p } = s;
    const alias = computeAliasStructure(k, p, 'frac');
    if (!alias || (alias.generatorStrings.length === 0 && alias.aliases.length === 0)) return null;
    const nameMap = {};
    for (let i = 0; i < k; i++) {
      const name = model.factors[i] && model.factors[i].name ? model.factors[i].name.trim() : '';
      nameMap[letter(i)] = name || letter(i);
    }
    const replaceLetters = (code) => code.split('').map((ch) => nameMap[ch] || ch).join(' · ');
    const formatGen = (gen) => {
      const [left, right] = gen.split(' = ');
      return `${nameMap[left] || left} = ${replaceLetters(right)}`;
    };
    return {
      generators: alias.generatorStrings.map(formatGen),
      defining: alias.definingRelation.map((w) => `I = ${replaceLetters(w)}`),
      aliases: alias.aliases.map((a) => ({
        term: replaceLetters(a.term),
        aliasedWith: a.aliasedWith.map((w) => replaceLetters(w)).join(', '),
      })),
    };
  },
};

export default frac;
