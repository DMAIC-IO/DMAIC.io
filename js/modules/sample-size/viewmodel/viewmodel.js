/**
 * D.Mike — Stichprobenumfang: Viewmodel.
 *
 * Eingaben, Prüfungen und die Rechnung liegen im Model (domain/); die
 * Agentenfläche entsteht aus dessen Schema. Hier bleiben Beschriftungen,
 * Sichtbarkeit der Effektangaben je Variante, Kennzahlen, Satz und die
 * Konfiguration der Power-Kurve.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { analyze } from '../domain/calc.js';
import { kpiOf, powerChartOf, summaryStrong, summaryText } from './present.js';

/** @typedef {import('../domain/calc.js').Analysis} Analysis */

/** Die Testrichtungen mit ihrem Zeichen. */
const DIRECTIONS = Object.freeze([
  ['two-sided', '≠', 'twoSided'],
  ['greater', '>', 'greater'],
  ['less', '<', 'less'],
]);

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** Darstellung je Rechnung und Sprache, einmal gebaut. */
    const shown = new WeakMap();
    /**
     * Ein Darstellungsteil zur Rechnung, gemerkt je Rechnung und Sprache.
     * @param {Analysis} a @param {string} key @param {(lang: string) => any} build
     */
    const cached = (a, key, build) => {
      const lang = ctx.i18n.getLanguage();
      let hit = shown.get(a);
      if (!hit || hit.lang !== lang) { hit = { lang }; shown.set(a, hit); }
      if (!(key in hit)) hit[key] = build(lang);
      return hit[key];
    };
    return {
      /** Die Rechnung zum Stand; `null` ohne vollständige Effektangaben. */
      get analysis() { return analyze(this.model); },
      /** Es gibt ein Ergebnis. */
      get hasResult() { return this.analysis !== null; },
      /** Zwei Stichproben (Kachel Gesamt-n). */
      get isTwo() { return this.model.testType === 'two'; },
      /**
       * Gilt die Effektangabe im aktuellen Stand?
       * @param {string} path z. B. `effect.mean.delta` @returns {boolean}
       */
      shows(path) { return this.activeParams.includes(path); },
      /**
       * Klasse des aktiven Kategorie-Knopfs.
       * @param {string} cat @returns {string}
       */
      catActiveClass(cat) { return this.model.category === cat ? 'btn--active' : ''; },
      /**
       * Klasse des aktiven Testtyp-Knopfs.
       * @param {string} type @returns {string}
       */
      typeActiveClass(type) { return this.model.testType === type ? 'btn--active' : ''; },

      /** „σ² Varianzen“. */
      get catVarianceLabel() { return `σ² ${this.t('catVariance')}`; },
      /** „μ Mittelwerte“. */
      get catMeanLabel() { return `μ ${this.t('catMean')}`; },
      /** „Soll-Standardabw. (σ₀)“. */
      get hypothesizedStdLabel() { return `${this.t('hypothesizedStd')} (σ₀)`; },
      /** „Erw. Standardabw. (σ₁)“. */
      get expectedStdLabel() { return `${this.t('expectedStd')} (σ₁)`; },
      /** „Varianzverhältnis (σ²₁ / σ²₂)“. */
      get varianceRatioLabel() { return `${this.t('varianceRatio')} (σ²₁ / σ²₂)`; },
      /** „Differenz (Δ)“. */
      get meanDifferenceLabel() { return `${this.t('meanDifference')} (Δ)`; },
      /** „Standardabw. (σ)“. */
      get stdDevLabel() { return `${this.t('stdDev')} (σ)`; },
      /** „Ziel-Power (1 − β)“. */
      get targetPowerLabel() { return `${this.t('targetPower')} (1 − β)`; },
      /** Die Testrichtungen für die Auswahl. */
      get directionOptions() {
        return DIRECTIONS.map(([value, sign, key]) => ({
          value, label: `${sign} ${this.t(key)}`, selected: value === this.model.direction,
        }));
      },

      /** Kopfzeile des Ergebnissatzes. */
      get summaryStrong() {
        const a = this.analysis;
        return a ? cached(a, 'strong', (lang) => summaryStrong(a, this.t, lang)) : '';
      },
      /** Erklärender Satz zum Ergebnis. */
      get summaryText() {
        const a = this.analysis;
        return a ? cached(a, 'text', (lang) => summaryText(a, this.t, lang)) : '';
      },
      /** Werte und Beschriftungen der Kennzahlzellen; `null` ohne Ergebnis. */
      get kpi() {
        const a = this.analysis;
        return a ? cached(a, 'kpi', (lang) => kpiOf(a, this.t, lang)) : null;
      },
      /** Das Verfahren für den Link ins Algorithm Lab. */
      get algoId() { return this.analysis?.algoId ?? null; },
      /** Konfiguration der Power-Kurve; `null` ohne Ergebnis. */
      get powerChart() {
        const a = this.analysis;
        return a ? cached(a, 'chart', (lang) => powerChartOf(a, this.t, lang)) : null;
      },
    };
  },
});
