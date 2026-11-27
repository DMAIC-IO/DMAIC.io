/**
 * D.Mike — GLM-Regression: Model.
 *
 * Gespeichert werden die Einflussgrößen X, die Zielgröße Y, die optionale
 * Versuchszahl, die Erfolgsklasse, das Verfahren, Konfidenz und α als Anteil
 * (gekoppelt, nur über die Kommandos), die Klassifikationsschwelle und das
 * gespeicherte Modell (id, Name, Momentaufnahme mit Familie und Termen).
 * Ansicht: Reiter, Beispielblatt und die Editor-Einstellungen der Diagramme.
 * Ergebnis, Fehlergrund, automatische Wahl, Konfusionstafel, Terme der
 * Vorhersage und das Modell für andere Module liefern die Ableitungen aus
 * Model und Arbeitsblatt; die Engine läuft je Änderung einmal (Merker in
 * `analyze.js`).
 */
import { defineModel, command, text, number, oneOf, list, object, columnRef } from '../../../core/model.js';
import { roundTo } from '../../../core/number-format.js';
import scatterChart from '../../../widgets/scatter-chart/schema.js';
import {
  analyze, agentResult, classificationOf, predictionTermsOf, complement,
} from './analyze.js';
import { from0 } from './migrations.js';

/**
 * Ein Anteil der Kontextvorgabe, auf (0; 1) geklemmt.
 * @param {number} v @returns {number}
 */
const clampFraction = (v) => Math.min(0.9999, Math.max(0.0001, v));

/** Ein Faktorbereich: stetig mit Grenzen, kategorial mit Stufen und Referenz. */
const factorRange = () => object({
  name: text(),
  kind: text({ optional: true }),
  low: number({ nullable: true, optional: true }),
  high: number({ nullable: true, optional: true }),
  levels: list(text(), { optional: true }),
  reference: text({ optional: true }),
});

/**
 * Die Form der Modell-Momentaufnahme (Altform `state.models[id]` ohne id,
 * Name und Besitzer), gegenüber der Regression mit Familie und Termen.
 */
const MODEL_RECORD = {
  experimentId: text({ nullable: true, optional: true }),
  responseSpec: object({
    sourceColumn: text({ nullable: true }),
    transform: text(),
    aggregateOver: text({ nullable: true }),
  }, { optional: true }),
  family: object({
    name: text(),
    link: text(),
    theta: number({ optional: true }),
  }, { optional: true }),
  terms: list(text(), { optional: true }),
  termSet: list(text(), { optional: true }),
  coef: list(number({ nullable: true }), { nullable: true, optional: true }),
  vcov: list(list(number({ nullable: true })), { nullable: true, optional: true }),
  sigma2: number({ nullable: true, optional: true }),
  df: number({ nullable: true, optional: true }),
  rSqAdj: number({ nullable: true, optional: true }),
  lofPValue: number({ nullable: true, optional: true }),
  factorSpec: list(factorRange(), { optional: true }),
  spec: object({
    predictors: list(object({ id: text(), kind: text(), levels: list(text(), { optional: true }), reference: text({ optional: true }) })),
    terms: list(object({ id: text(), factors: list(object({ id: text(), degree: number() })) })),
  }, { nullable: true, optional: true }),
  dataSnapshot: object({
    X: list(list(number({ nullable: true }))),
    y: list(number({ nullable: true })),
    factorSpec: list(factorRange()),
    termSet: list(text()),
    trainedAt: text({ optional: true }),
    sourceFingerprint: object({
      experimentId: text({ nullable: true }),
      responseColumn: text({ nullable: true }),
      workbookHash: text({ nullable: true }),
    }, { optional: true }),
  }, { nullable: true, optional: true }),
  dataHash: text({ nullable: true, optional: true }),
  createdAt: text({ optional: true }),
  updatedAt: text({ optional: true }),
};

/**
 * Das angepasste Modell als Zahlen.
 * @typedef {object} Result
 * @property {Family} family  Verteilung und Linkfunktion
 * @property {boolean} quasi  Quasi-Poisson aktiv
 * @property {string|null} autoReason  Grund der automatischen Wahl
 * @property {number|null} n  verwertete Zeilen
 * @property {number|null} iterations  IRLS-Iterationen
 * @property {number|null} aic  Akaike-Informationskriterium
 * @property {number|null} bic  Bayes-Informationskriterium
 * @property {number|null} deviance  Residualdevianz
 * @property {number|null} nullDeviance  Nulldevianz
 * @property {number|null} logLikelihood  Log-Likelihood
 * @property {PseudoR2} pseudoR2  Pseudo-Bestimmtheitsmaße
 * @property {GlmCoefficient[]} coefficients  Koeffiziententabelle
 * @property {number|null} auc  Fläche unter der ROC-Kurve, nur binomial
 * @property {HosmerLemeshow|null} hosmerLemeshow  Anpassungstest, nur binomial
 * @property {number|null} overdispersionRatio  Pearson-χ² je Freiheitsgrad, nur Poisson
 * @property {Overdispersion|null} overdispersion  Überdispersionsprüfung, nur Poisson
 * @property {Array<number|null>|null} vif  Varianzinflationsfaktoren je Prädiktor, Reihenfolge wie in vifTerms
 * @property {string[]|null} vifTerms  Terme zu den Werten in vif, gleiche Reihenfolge
 * @property {string[]} warnings  Warnungen
 * @property {Warning[]} warningDetails  die Warnungen als Codes mit Zahlen, gleiche Reihenfolge wie warnings
 * @property {string} equation  Modellgleichung
 */

/**
 * @typedef {object} Warning
 * @property {string} code  Kennung der Warnung, gleich dem Textschlüssel
 * @property {Record<string, number|null>} values  eingesetzte Zahlen
 */

/**
 * @typedef {object} Family
 * @property {'binomial'|'poisson'|'negbin'} name  Verteilungsfamilie
 * @property {'logit'|'log'} link  Linkfunktion
 * @property {number|null} theta  Formparameter, nur negbin
 */

/**
 * @typedef {object} PseudoR2
 * @property {number|null} mcfadden  McFadden
 * @property {number|null} nagelkerke  Nagelkerke
 * @property {number|null} coxSnell  Cox-Snell
 */

/**
 * @typedef {object} GlmCoefficient
 * @property {string} term  Term
 * @property {number|null} estimate  Schätzwert
 * @property {number|null} se  Standardfehler
 * @property {number|null} z  Wald-z
 * @property {number|null} p  p-Wert
 * @property {number|null} ciLower  untere Konfidenzgrenze
 * @property {number|null} ciUpper  obere Konfidenzgrenze
 * @property {Ratio|null} ratio  Odds bzw. Rate Ratio
 */

/**
 * @typedef {object} Ratio
 * @property {number|null} value  Verhältnis
 * @property {number|null} lower  untere Grenze
 * @property {number|null} upper  obere Grenze
 */

/**
 * @typedef {object} HosmerLemeshow
 * @property {number|null} statistic  χ²-Statistik
 * @property {number|null} pValue  p-Wert
 */

/**
 * @typedef {object} Overdispersion
 * @property {number|null} pearsonChi2  Pearson-χ²
 * @property {number|null} df  Freiheitsgrade
 * @property {number|null} ratio  χ² je Freiheitsgrad
 * @property {boolean} overdispersed  überdispers
 */

/**
 * @typedef {object} Classification
 * @property {number} cutoff  Schwelle
 * @property {number} tp  richtig positiv
 * @property {number} fn  falsch negativ
 * @property {number} fp  falsch positiv
 * @property {number} tn  richtig negativ
 * @property {number|null} sensitivity  Sensitivität
 * @property {number|null} specificity  Spezifität
 * @property {number|null} accuracy  Trefferquote
 * @property {number|null} precision  Präzision
 */

/**
 * @typedef {object} FitError
 * @property {string} reason  Grund als Schlüssel
 * @property {Record<string, any>|null} params  Angaben zum Grund
 * @property {string} message  der Grund als Text in der App-Sprache
 */

/**
 * @typedef {object} Detection
 * @property {string} reason  Grund als Schlüssel
 * @property {'binomial'|'poisson'|'negbin'} family  gewählte Familie
 * @property {string} message  der Grund als Text in der App-Sprache
 */

/**
 * @typedef {object} SuccessClassInfo
 * @property {number} success  Stufe, die als Erfolg zählt
 * @property {number} failure  die andere Stufe
 */

/**
 * @typedef {object} SavedModel
 * @property {string} id  Kennung des Modells
 * @property {string} name  Name des Modells
 * @property {string|null} [experimentId]  Quellversuch
 * @property {object} [responseSpec]  Quelle der Zielgröße
 * @property {object} [family]  Familie und Link
 * @property {string[]} [terms]  Terme
 * @property {string[]} [termSet]  Terme
 * @property {Array<number|null>|null} [coef]  Koeffizienten
 * @property {number|null} [df]  Restfreiheitsgrade
 * @property {number|null} [rSqAdj]  Nagelkerke-R²
 * @property {object[]} [factorSpec]  Faktorbereiche
 * @property {object|null} [spec]  Modellspezifikation
 * @property {object|null} [dataSnapshot]  Trainingsdaten
 * @property {string|null} [dataHash]  Prüfsumme der Daten
 * @property {string} [createdAt]  angelegt
 * @property {string} [updatedAt]  zuletzt gespeichert
 */

/** @typedef {import('../../../core/source-reader.js').Source} Source */
/** @typedef {(key: string, params?: object) => string} T */

/** Zahlen in den Texten von `read()` (Gleichung, Warnungen) wie die Altform mit Punkt. */
const READ_LANG = 'en';

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    colRefs: list(columnRef({ nullable: false, types: ['numeric', 'currency', 'percent', 'text'], minCount: 1 }), { default: [] }),
    yRef: columnRef({ minCount: 1 }),
    trialsRef: columnRef({ minCount: 1 }),
    successClass: number({ nullable: true }),
    method: oneOf(['auto', 'binomial', 'poisson', 'negbin'], { default: 'auto' }),
    confLevel: number({ exclusiveMin: 0, exclusiveMax: 1, agentWrite: false, default: (c) => clampFraction(roundTo(c.confidenceLevel / 100, 4)) }),
    alpha: number({ exclusiveMin: 0, exclusiveMax: 1, agentWrite: false, default: (c) => clampFraction(roundTo(1 - c.confidenceLevel / 100, 4)) }),
    cutoff: number({ min: 0, max: 1, default: 0.5 }),
    savedModelId: text({ nullable: true, agentWrite: false }),
    savedModelName: text({ nullable: true, agentWrite: false }),
    modelRecord: object(MODEL_RECORD, { nullable: true, agentWrite: false, omitOnRead: true }),
  },
  view: {
    activeTab: oneOf(['model', 'diagnostics', 'roc', 'prediction'], { default: 'model' }),
    exampleWorksheetId: text({ nullable: true }),
    residualsEdits: scatterChart.edits(),
    qqEdits: scatterChart.edits(),
    cooksEdits: scatterChart.edits(),
    rocEdits: scatterChart.edits(),
  },
  commands: {
    setConfLevel: command({
      params: { value: number({ exclusiveMin: 0, exclusiveMax: 1 }) },
      /**
       * Das Konfidenzniveau setzen; α wird 1 minus diesem Wert.
       * @param {{ value: number }} p
       */
      run({ value }) {
        this.confLevel = value;
        this.alpha = complement(value);
      },
    }),
    setAlpha: command({
      params: { value: number({ exclusiveMin: 0, exclusiveMax: 1 }) },
      /**
       * Das Signifikanzniveau setzen; das Konfidenzniveau wird 1 minus diesem Wert.
       * @param {{ value: number }} p
       */
      run({ value }) {
        this.alpha = value;
        this.confLevel = complement(value);
      },
    }),
  },
  derived: {
    /**
     * Das angepasste Modell als Zahlen; `null` ohne X oder Y oder wenn die
     * Anpassung scheitert (`error` nennt den Grund).
     * @param {Source} src Leser des Arbeitsblatts
     * @param {unknown} _d
     * @param {T} t Übersetzer des Moduls
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result(src, _d, t) {
      return agentResult(analyze(this, src), t, READ_LANG);
    },
    /**
     * Warum es kein Ergebnis gibt, mit dem Text in der App-Sprache; `null`
     * ohne Grund.
     * @param {Source} src Leser des Arbeitsblatts
     * @param {unknown} _d
     * @param {T} t Übersetzer des Moduls
     * @this {import('./model.types.js').StateModel}
     * @returns {FitError|null}
     */
    error(src, _d, t) {
      const e = analyze(this, src).error;
      if (!e) return null;
      const message = e.reason === 'errorFit' ? `${t('errorFit')}: ${e.params?.message ?? ''}` : t(e.reason);
      return { reason: e.reason, params: e.params ? { ...e.params } : null, message };
    },
    /**
     * Die automatische Wahl der Familie mit ihrem Grund; `null` bei festem
     * Verfahren oder ohne genug Zeilen.
     * @param {Source} src Leser des Arbeitsblatts
     * @param {unknown} _d
     * @param {T} t Übersetzer des Moduls
     * @this {import('./model.types.js').StateModel}
     * @returns {Detection|null}
     */
    detection(src, _d, t) {
      const auto = analyze(this, src).auto;
      if (!auto) return null;
      return { reason: auto.reasonKey, family: /** @type {Detection['family']} */ (auto.familyName), message: t(auto.reasonKey) };
    },
    /**
     * Bei binärer Zielgröße ohne Versuchszahl die Stufe, die als Erfolg
     * zählt, und die andere; `null` sonst.
     * @param {Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {SuccessClassInfo|null}
     */
    successClassInfo(src) {
      const a = analyze(this, src);
      return a.kind === 'fit' && a.successInfo ? { ...a.successInfo } : null;
    },
    /**
     * Die Konfusionstafel bei der Schwelle; `null` ohne binomiales Ergebnis.
     * @param {Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Classification|null}
     */
    classification(src) {
      return classificationOf(analyze(this, src), this.cutoff);
    },
    /**
     * Die Terme, die eine Vorhersage nimmt, in Modellreihenfolge.
     * @param {Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    predictionTerms(src) {
      return predictionTermsOf(analyze(this, src));
    },
    /**
     * Der Reiter, der wirkt: ROC nur bei binomialem Ergebnis, sonst Modell.
     * @param {Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {'model'|'diagnostics'|'roc'|'prediction'}
     */
    effectiveTab(src) {
      if (this.activeTab !== 'roc') return this.activeTab;
      return analyze(this, src).fit?.family.name === 'binomial' ? 'roc' : 'model';
    },
    /**
     * Die Parameterfelder, die im Stand wirken; die Schwelle nur bei
     * binomialem Ergebnis.
     * @param {Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams(src) {
      const binomial = analyze(this, src).fit?.family.name === 'binomial';
      return binomial ? ['method', 'confLevel', 'alpha', 'cutoff'] : ['method', 'confLevel', 'alpha'];
    },
    /**
     * Das Speichern als Modell ist möglich: eine konvergierte Anpassung.
     * @param {Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {boolean}
     */
    canSaveModel(src) {
      const a = analyze(this, src);
      return a.kind === 'fit' && (a.data?.y.length ?? 0) > 0;
    },
    /**
     * Das gespeicherte Modell als Momentaufnahme, wie andere Module es lesen;
     * `null`, solange keines gespeichert ist.
     * @this {import('./model.types.js').StateModel}
     * @returns {SavedModel|null}
     */
    savedModel() {
      if (!this.savedModelId || !this.modelRecord) return null;
      return /** @type {SavedModel} */ ({
        id: this.savedModelId,
        name: this.savedModelName ?? '',
        ...JSON.parse(JSON.stringify(this.modelRecord)),
      });
    },
  },
}) {
  /**
   * Inhalt hat die Instanz mit einer Spalte oder einem gespeicherten Modell.
   * @returns {boolean}
   */
  hasContent() {
    return this.colRefs.length > 0 || this.yRef != null || this.trialsRef != null || this.modelRecord != null;
  }
}
