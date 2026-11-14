/**
 * D.Mike — DoE Planner: view part "evaluation" (viewmodel/evaluation.js)
 *
 * The design summary of the input side (planned runs, resolution, the
 * generated design or why there is none yet) and the evaluation of the
 * design on the output side: D-, A- and G-efficiency, condition number,
 * leverage, VIF, alias structure and power. Everything is read from the
 * derivations `summary`, `valid`, `pending` and `evaluation`; while the
 * design does not belong to the configuration a note stands instead of
 * numbers, and an evaluation that cannot be computed says so. Numbers are
 * shown in the app language.
 */
import { formatNumber } from '../../../core/number-format.js';
import { powerDisplay } from '../domain/analysis.js';

/**
 * One efficiency card.
 * @typedef {object} EffCard
 * @property {string} key which efficiency: dEff, aEff or gEff
 * @property {string} label
 * @property {string} value percent, rounded
 * @property {string} cls rating class
 * @property {number} barWidth
 */

/**
 * One row of the power table.
 * @typedef {object} PowerRow
 * @property {string} effectSize
 * @property {string} power percent or a dash
 * @property {string} rating class
 * @property {number} width bar width in percent
 */

/**
 * The evaluation as the output side shows it.
 * @typedef {object} Assessment
 * @property {EffCard[]} cards
 * @property {string} condNum
 * @property {string} maxLeverage
 * @property {Array<{ term: string, vif: string, rating: string }>} vifMain
 * @property {Array<{ term: string, vif: string, rating: string }>} vifInter
 * @property {boolean} hasAlias
 * @property {string[]} aliasGenerators
 * @property {Array<{ term: string, aliasedWith: string }>} aliasRows
 * @property {PowerRow[]} powerRows
 * @property {boolean} powerSaturated
 * @property {string} powerDesc
 */

/** @param {number} v @returns {string} rating class of an efficiency in percent */
const effClass = (v) => {
  if (v >= 80) return 'dmike-kpi--good';
  return v >= 50 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
};

/** @param {number} v @returns {string} rating class of a VIF */
const vifClass = (v) => {
  if (v <= 1.01) return 'doe__vif-perfect';
  if (v <= 5) return 'doe__vif-ok';
  return v <= 10 ? 'doe__vif-warn' : 'doe__vif-bad';
};

/** @type {import('./state.types.js').DoePlannerViewFn} */
export const evaluationView = (ctx) => ({
  // ── Summary (input side) ──────────────────────────────────

  /** @returns {number|string} planned runs, '?' while unknown */
  get summaryRuns() { return this.summary.runs === null ? '?' : this.summary.runs; },

  /** @returns {string} */
  get summaryRes() { return this.summary.resolution; },

  /** @returns {boolean} a design exists (also while a new one is pending, as before) */
  get hasDesign() { return Boolean(this.model.design); },

  /** @returns {string} */
  get generatedText() { return this.t('generated', { runs: this.model.design ? this.model.design.actualMatrix.length : 0 }); },

  /** @returns {string} */
  get configStateText() { return this.valid ? this.t('configReady') : this.t('configIncomplete'); },

  /** @returns {string} */
  get factorsLabel() { return `${this.t('factors')}: `; },

  /** @returns {string} */
  get runsLabel() { return `${this.t('runs')}: `; },

  /** @returns {string} */
  get resolutionLabel() { return `${this.t('resolution')}: `; },

  /** @returns {string} */
  get responsesLabel() { return `${this.t('responses')}: `; },

  // ── Output side ───────────────────────────────────────────

  /** Nothing to show yet: no design and a configuration that gives none. @returns {boolean} */
  get showPlaceholder() { return !this.model.design && !this.valid; },

  /** @returns {boolean} the design waits for its regeneration */
  get evaluationPending() { return Boolean(this.model.design) && this.pending; },

  /** @returns {boolean} the evaluation could not be computed */
  get evaluationFailed() { return !this.evaluationPending && Boolean(this.assessment?.error); },

  /** @returns {Assessment|null} the evaluation to show; null while pending or failed */
  get shownAssessment() {
    if (this.evaluationPending) return null;
    const a = this.assessment;
    return a && !a.error ? a : null;
  },

  /** @returns {boolean} */
  get hasVif() { return Boolean(this.shownAssessment && (this.shownAssessment.vifMain.length || this.shownAssessment.vifInter.length)); },

  /** @returns {boolean} */
  get hasPower() { return Boolean(this.shownAssessment && this.shownAssessment.powerRows.length); },

  /** @returns {string} */
  get generatorsLabel() { return `${this.t('generators')}:`; },

  /** @param {EffCard} c @param {string} key @returns {boolean} the card shows this efficiency */
  isCard(c, key) { return c.key === key; },

  /** @param {number} w @returns {string} inline width of a bar */
  barStyle(w) { return `width:${w}%`; },

  computed: {
    /**
     * The evaluation of the current design in display form; null without one.
     * @returns {Assessment|null}
     */
    assessment() {
      const ev = this.evaluation;
      if (!ev) return null;
      const lang = ctx.context.language;
      const num = (/** @type {number} */ v, /** @type {number} */ d) => formatNumber(v, lang, { decimals: d });
      const eff = ev.efficiency;
      const card = (/** @type {string} */ key, /** @type {number} */ v) => ({
        key, label: this.t(key), value: `${num(Math.round(v), 0)}%`, cls: effClass(v), barWidth: Math.min(100, v),
      });
      const vifRow = (/** @type {{ term: string, vif: number }} */ v) => ({ term: v.term, vif: num(v.vif, 2), rating: vifClass(v.vif) });
      const al = ev.alias;
      const power = ev.power;
      const runs = this.model.design ? this.model.design.runOrder.length : '?';
      return {
        cards: eff ? [card('dEff', eff.dEfficiency), card('aEff', eff.aEfficiency), card('gEff', eff.gEfficiency)] : [],
        condNum: eff ? num(eff.conditionNumber, 1) : '',
        maxLeverage: eff ? num(eff.maxLeverage, 3) : '',
        vifMain: ev.vif.filter((v) => !v.term.includes('*')).map(vifRow),
        vifInter: ev.vif.filter((v) => v.term.includes('*')).map(vifRow),
        hasAlias: Boolean(al && (al.aliases.length > 0 || al.generators.length > 0)),
        aliasGenerators: al ? [...al.generators] : [],
        aliasRows: al ? al.aliases.map((a) => ({ term: a.term, aliasedWith: a.aliasedWith.join(', ') })) : [],
        powerRows: power.map((row) => {
          const d = powerDisplay(row.power);
          return { effectSize: formatNumber(row.effectSize, lang), power: d.text, rating: d.rating, width: d.width };
        }),
        powerSaturated: power.length > 0 && power[0].power === null,
        powerDesc: this.t('powerDesc', {
          n: runs,
          dfError: power[0] && power[0].dfError !== null && power[0].dfError !== undefined ? power[0].dfError : '?',
          alpha: formatNumber(0.05, lang),
        }),
      };
    },
  },
});
