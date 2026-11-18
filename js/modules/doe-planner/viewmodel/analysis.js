/**
 * D.Mike — DoE Planner: view part "analysis" (viewmodel/analysis.js)
 *
 * The dispersion analysis of a replicated design: once every response cell
 * of the bound datasheet holds a number (derivations `progress` and
 * `dispersion`, read through `ctx.source`), the points with mean and
 * variance, the models of the mean and of ln(s²) and the factors that
 * affect the spread. Numbers are shown in the app language.
 */
import { formatNumber } from '../../../core/number-format.js';

/**
 * One fitted model of the dispersion analysis.
 * @typedef {object} DispersionModelView
 * @property {string} title
 * @property {boolean} fitted
 * @property {string} r2Text
 * @property {Array<{ term: string, coefficient: string, effect: string, p: string, cls: string }>} rows
 */

/**
 * The dispersion analysis as the output side shows it.
 * @typedef {object} DispersionView
 * @property {string} lead
 * @property {Array<{ point: string, n: string, mean: string, sd: string, variance: string, lnVariance: string }>} groups
 * @property {string} zeroVarText empty without points of zero variance
 * @property {DispersionModelView[]} models
 * @property {{ none: boolean, items: string[], cls: string }|null} conclusion
 */

/** @type {import('./state.types.js').DoePlannerViewFn} */
export const analysisView = (ctx) => ({
  /** @returns {boolean} the dispersion section shows */
  get showDispersion() { return Boolean(this.dispersion); },

  /** @returns {boolean} the design has replicates, but too few per point */
  get dispersionNoReplicates() { return Boolean(this.dispersion && this.dispersion.noReplicates); },

  /** @returns {DispersionView|null} the analysis to show; null without one */
  get shownDispersion() {
    const v = this.dispersionView;
    return v && !(/** @type {any} */ (v).error) ? v : null;
  },

  /** @returns {string} */
  get conclusionLabel() { return `${this.t('dispersionConclusion')}:`; },

  /** @returns {string} */
  get conclusionNoneText() { return ` ${this.t('dispersionConclusionNone')}`; },

  computed: {
    /**
     * The dispersion analysis in display form; null without a result.
     * @returns {DispersionView|null}
     */
    dispersionView() {
      const r = /** @type {any} */ (this.dispersion);
      if (!r || r.noReplicates) return null;
      const lang = ctx.context.language;
      const num = (/** @type {number} */ v, /** @type {number} */ d) => formatNumber(v, lang, { decimals: d });
      const model = (/** @type {any} */ fit, /** @type {string} */ titleKey) => {
        if (!fit || !fit.coefficients) return { title: this.t(titleKey), fitted: false, r2Text: '', rows: [] };
        return {
          title: this.t(titleKey),
          fitted: true,
          r2Text: `R² = ${num(fit.rSquared * 100, 1)}%, R²adj = ${num(fit.rSquaredAdj * 100, 1)}%`,
          rows: fit.coefficients
            .filter((/** @type {any} */ c) => c.term !== 'Intercept')
            .map((/** @type {any} */ c) => ({
              term: c.term,
              coefficient: num(c.coefficient, 4),
              effect: num(c.effect, 4),
              p: num(c.p, 4),
              cls: c.significant ? 'doe__dispersion-sig' : '',
            })),
        };
      };
      /** @type {DispersionView['conclusion']} */
      let conclusion = null;
      if (r.dispersionModel) {
        conclusion = r.significantDispersion.length === 0
          ? { none: true, items: [], cls: 'doe__dispersion-conclusion--none' }
          : {
            none: false,
            cls: '',
            items: r.significantDispersion.map((/** @type {any} */ d) => {
              const prefer = d.prefer === 'low' || d.prefer === 'high'
                ? this.t(`dispersionPrefer_${d.prefer}`)
                : this.t('dispersionPreferInteraction');
              return `${d.term}: ${prefer} (β = ${num(d.coefficient, 3)}, p = ${num(d.p, 4)})`;
            }),
          };
      }
      return {
        lead: this.t('dispersionLead', {
          response: r.responseName, min: r.minReplicates, max: r.maxReplicates, points: r.groups.length,
        }),
        groups: r.groups.map((/** @type {any} */ g) => ({
          point: formatNumber(g.point, lang),
          n: formatNumber(g.n, lang),
          mean: num(g.mean, 4),
          sd: num(g.sd, 4),
          variance: num(g.variance, 6),
          lnVariance: g.lnVariance === null || g.lnVariance === undefined ? '—' : num(g.lnVariance, 4),
        })),
        zeroVarText: r.zeroVarPoints > 0 ? this.t('dispersionZeroVar', { n: r.zeroVarPoints }) : '',
        models: [model(r.meanModel, 'dispersionMeanModel'), model(r.dispersionModel, 'dispersionLogVarModel')],
        conclusion,
      };
    },
  },
});
