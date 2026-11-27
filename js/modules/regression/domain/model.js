/**
 * D.Mike — Regression: Model.
 *
 * Gespeichert werden die Einflussgrößen X und die Zielgröße Y, Modellform,
 * Grad, Konfidenz und α als Anteil, ausgeschlossene Terme, Hinweis, Quelle und
 * offene Vorgabe einer Versuchsübernahme (`importExperiment`) sowie das gespeicherte Modell (id, Name,
 * Momentaufnahme). Ansicht: Reiter, gezeigtes Einzelmodell, Sortierung,
 * Bänder, Beispielblatt und die Editor-Einstellungen der Diagramme.
 * Ergebnis, Fehlergrund, Terme, Grade, Übernahme-Optionen und das Modell für
 * andere Module liefern die Ableitungen aus Model und Arbeitsblatt; die
 * Engine läuft je Änderung einmal (Merker in `analyze.js`).
 */
import { defineModel, command, text, number, boolean, oneOf, list, map, object, columnRef } from '../../../core/model.js';
import { roundTo } from '../../../core/number-format.js';
import scatterChart from '../../../widgets/scatter-chart/schema.js';
import histogramChart from '../../../widgets/histogram-chart/schema.js';
import pieChart from '../../../widgets/pie-chart/schema.js';
import barChart from '../../../widgets/bar-chart/schema.js';
import { analyze, activeResultOf, activeXOf, agentResult, predictorsOf, degreeAvailability } from './analyze.js';
import { experimentOptions, importArgsOf } from './design-preset.js';
import { requireForm } from '../../../core/validate.js';
import { parseTermId } from '../../../engines/doe-terms.js';
import { plannerExperiments } from './record.js';
import { noticeBasis, refKey } from './columns.js';
import { from0 } from './migrations.js';

/**
 * Ein Anteil der Kontextvorgabe, auf (0; 1) geklemmt.
 * @param {number} v @returns {number}
 */
const clampFraction = (v) => Math.min(0.9999, Math.max(0.0001, v));

/**
 * Das gerechnete Ergebnis als Zahlen.
 * @typedef {object} Result
 * @property {'polynomial'|'exponential'|'logarithmic'|'power'} type  gerechnete Modellform
 * @property {string|null} equation  Modellgleichung
 * @property {number|null} n  verwertete Zeilen
 * @property {number|null} R2  Bestimmtheitsmaß
 * @property {number|null} adjR2  korrigiertes Bestimmtheitsmaß
 * @property {number|null} R2pred  vorhergesagtes Bestimmtheitsmaß
 * @property {number|null} Se  Standardfehler der Regression
 * @property {number|null} Fstat  F-Statistik des Modells
 * @property {number|null} fPVal  p-Wert des F-Tests
 * @property {number|null} dw  Durbin-Watson-Statistik
 * @property {Coefficient[]} coefficients  Koeffiziententabelle
 * @property {string[]} excludedTerms  ausgeschlossene Terme
 * @property {Anova|null} anova  Varianzanalyse des Modells
 */

/**
 * @typedef {object} Coefficient
 * @property {string} term  Term
 * @property {number|null} coeff  Koeffizient
 * @property {number|null} se  Standardfehler
 * @property {number|null} t  t-Wert
 * @property {number|null} pval  p-Wert
 * @property {number|null} ciLow  untere Konfidenzgrenze
 * @property {number|null} ciHigh  obere Konfidenzgrenze
 * @property {number|null} vif  Varianzinflationsfaktor
 */

/**
 * @typedef {object} Anova
 * @property {AnovaRow} regression  Zeile Regression
 * @property {AnovaRow[]} terms  Zeile je Term
 * @property {AnovaRow} error  Zeile Residuen
 * @property {AnovaRow} total  Zeile Gesamt
 */

/**
 * @typedef {object} AnovaRow
 * @property {string} [term]  Term, nur in den Termzeilen
 * @property {number|null} ss  Quadratsumme
 * @property {number|null} df  Freiheitsgrade
 * @property {number|null} [ms]  mittlere Quadratsumme, fehlt in Gesamt
 * @property {number|null} [f]  F-Wert, nur Regression und Terme
 * @property {number|null} [p]  p-Wert, nur Regression und Terme
 */

/**
 * @typedef {object} FitError
 * @property {string} reason  Grund als Schlüssel
 * @property {Record<string, any>|null} params  Angaben zum Grund
 * @property {PerXError[]} perX  Gründe je X bei Einzelmodellen
 * @property {string} message  der Grund als Text in der App-Sprache
 */

/**
 * @typedef {object} PerXError
 * @property {string} name  Spalte X
 * @property {string} reason  Grund als Schlüssel
 * @property {Record<string, any>|null} params  Angaben zum Grund
 */

/**
 * @typedef {object} AliasedTerm
 * @property {string} term  Term
 * @property {string[]} with  vermengt mit
 */

/**
 * @typedef {object} DesignNotice
 * @property {AliasedTerm[]} aliased  vermengte Terme
 * @property {string[]} saturated  Terme ohne Restfreiheitsgrad
 */

/**
 * @typedef {object} ImportChoice
 * @property {string} key  Schlüssel der Übernahme
 * @property {string} label  Versuch und Antwort
 * @property {ImportArgs} args  die Angaben für `importExperiment`
 */

/**
 * @typedef {object} Predictor
 * @property {string} id  Kennung der Eingabe
 * @property {string} label  Beschriftung
 * @property {'numeric'|'categorical'|'single'} kind  Art der Eingabe
 * @property {string[]} [levels]  Stufen, nur kategorial
 */

/**
 * @typedef {object} SavedModel
 * @property {string} id  Kennung des Modells
 * @property {string} name  Name des Modells
 * @property {string|null} [experimentId]  Quellversuch
 * @property {object|null} [responseSpec]  Quelle der Zielgröße
 * @property {string[]} [termSet]  Terme
 * @property {Array<number|null>|null} [coef]  Koeffizienten
 * @property {number|null} [sigma2]  Fehlervarianz
 * @property {number|null} [df]  Restfreiheitsgrade
 * @property {number|null} [rSqAdj]  korrigiertes Bestimmtheitsmaß
 * @property {number|null} [lofPValue]  p-Wert des Lack-of-Fit-Tests
 * @property {object[]} [factorSpec]  Faktorbereiche
 * @property {object|null} [spec]  Modellspezifikation
 * @property {object|null} [dataSnapshot]  Trainingsdaten
 * @property {string|null} [dataHash]  Prüfsumme der Daten
 * @property {string} [createdAt]  angelegt
 * @property {string} [updatedAt]  zuletzt gespeichert
 */

/**
 * Die Angaben des Kommandos `importExperiment` zu einer Übernahme-Option.
 * @typedef {object} ImportArgs
 * @property {Array<{ instanceId: string, sheetId: string, columnId: string }>} colRefs  Faktorspalten als X
 * @property {{ instanceId: string, sheetId: string, columnId: string }} yRef  Antwortspalte als Y
 * @property {string[]} designTerms  geplante Terme (kanonische ids)
 * @property {{ experimentId: string, sourceColumn: string, transform: 'identity'|'mean'|'lnvar' }} source  Planer, Antwortspalte und Variante
 */

/** @typedef {import('../../../core/source-reader.js').Source} Source */

/** Spaltenarten der Eingaben X und Y. */
const COLUMN_TYPES = ['numeric', 'currency', 'percent', 'date', 'time'];

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    colRefs: list(columnRef({ nullable: false, types: COLUMN_TYPES, minCount: 1 }), { default: [] }),
    yRef: columnRef({ types: COLUMN_TYPES, minCount: 1 }),
    regType: oneOf(['polynomial', 'exponential', 'logarithmic', 'power'], { default: 'polynomial' }),
    polyDegree: oneOf([1, 2, 3], { default: 1 }),
    confLevel: number({ exclusiveMin: 0, exclusiveMax: 1, default: (c) => clampFraction(roundTo(c.confidenceLevel / 100, 4)) }),
    alpha: number({ exclusiveMin: 0, exclusiveMax: 1, default: (c) => clampFraction(roundTo(1 - c.confidenceLevel / 100, 4)) }),
    excludedTerms: list(text(), { default: [] }),
    designNotice: object({
      aliased: list(object({ term: text(), with: list(text()) })),
      saturated: list(text()),
      basis: text(),
    }, { nullable: true, agentWrite: false }),
    activeImportSource: object({
      experimentId: text(),
      sourceColumn: text(),
      transform: oneOf(['identity', 'mean', 'lnvar']),
    }, { nullable: true, agentWrite: false }),
    pendingDesignTerms: list(text(), { default: [], agentWrite: false }),
    savedModelId: text({ nullable: true, agentWrite: false }),
    savedModelName: text({ nullable: true, agentWrite: false }),
    modelRecord: object({
      experimentId: text({ nullable: true, optional: true }),
      responseSpec: object({
        sourceColumn: text({ nullable: true }),
        transform: text(),
        aggregateOver: text({ nullable: true }),
      }, { optional: true }),
      termSet: list(text(), { optional: true }),
      coef: list(number({ nullable: true }), { nullable: true, optional: true }),
      vcov: list(list(number({ nullable: true })), { nullable: true, optional: true }),
      sigma2: number({ nullable: true, optional: true }),
      df: number({ nullable: true, optional: true }),
      rSqAdj: number({ nullable: true, optional: true }),
      lofPValue: number({ nullable: true, optional: true }),
      factorSpec: list(object({
        name: text(), low: number({ nullable: true }), high: number({ nullable: true }), kind: text({ optional: true }),
      }), { optional: true }),
      spec: object({
        predictors: list(object({ id: text(), kind: text(), levels: list(text(), { optional: true }), reference: text({ optional: true }) })),
        terms: list(object({ id: text(), factors: list(object({ id: text(), degree: number() })) })),
      }, { nullable: true, optional: true }),
      dataSnapshot: object({
        X: list(list(number({ nullable: true }))),
        y: list(number({ nullable: true })),
        factorSpec: list(object({
          name: text(), low: number({ nullable: true }), high: number({ nullable: true }), kind: text({ optional: true }),
        })),
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
    }, { nullable: true, agentWrite: false, omitOnRead: true }),
  },
  view: {
    activeTab: oneOf(['scatter', 'residuals', 'order', 'qq', 'histogram', 'ss-pie', 'main-effects', 'interaction'], { default: 'scatter' }),
    activeXKey: text({ nullable: true }),
    coefSortByP: boolean(),
    showCI: boolean({ default: true }),
    showPI: boolean(),
    exampleWorksheetId: text({ nullable: true }),
    scatterEdits: scatterChart.edits(),
    residualsEdits: scatterChart.edits(),
    orderEdits: scatterChart.edits(),
    qqEdits: scatterChart.edits(),
    histogramEdits: histogramChart.edits(),
    pieEdits: pieChart.edits(),
    barEdits: barChart.edits(),
    mainEffectsEdits: map(text(), scatterChart.edits()),
    interactionEdits: map(text(), scatterChart.edits()),
  },
  invariants: {
    pendingNeedsSource: {
      fields: ['pendingDesignTerms', 'activeImportSource'],
      /** Eine offene Vorgabe gehört zu einer Übernahme. @param {any} m */
      test(m) { return m.pendingDesignTerms.length === 0 || m.activeImportSource != null; },
      /** Ohne Übernahme entfällt die offene Vorgabe. @param {any} m */
      repair(m) { m.pendingDesignTerms = []; },
    },
  },
  commands: {
    importExperiment: command({
      params: {
        colRefs: list(columnRef({ nullable: false })),
        yRef: columnRef({ nullable: false }),
        designTerms: list(text({ nonEmpty: true })),
        source: object({
          experimentId: text({ nonEmpty: true }),
          sourceColumn: text({ nonEmpty: true }),
          transform: oneOf(['identity', 'mean', 'lnvar']),
        }),
      },
      /**
       * Eine Antwort des Versuchsplans übernehmen: Faktoren als X, Antwort
       * als Y, Polynom, keine ausgeschlossenen Terme, die Quelle und die
       * geplanten Terme als offene Vorgabe. Die Vorgabe (Grad, ausgeschlossene
       * Terme, Hinweis) rechnet die Instanz, sobald sie mit lesbaren Daten
       * angezeigt ist (`pendingPresetFields`); bis dahin rechnet sie mit Grad
       * und Termen von vorher.
       * @param {ImportArgs} p
       */
      run({ colRefs, yRef, designTerms, source }) {
        const keys = colRefs.map(refKey);
        requireForm('colRefs', colRefs, keys.length > 0 && new Set(keys).size === keys.length, 'at least one column, each once');
        requireForm('yRef', yRef, !keys.includes(refKey(yRef)), 'a column that is not among colRefs');
        const bad = designTerms.find((t) => parseTermId(t) == null);
        requireForm('designTerms', bad ?? designTerms, bad === undefined, 'term ids like M0, Q1, I0_1');
        this.colRefs = colRefs;
        this.yRef = yRef;
        this.regType = 'polynomial';
        this.excludedTerms = [];
        this.designNotice = null;
        this.activeImportSource = { ...source };
        this.pendingDesignTerms = [...new Set(designTerms)];
      },
    }),
    releaseImport: command({
      /**
       * Die Übernahme lösen: Quelle, Hinweis und offene Vorgabe entfallen;
       * Spalten und Einstellungen bleiben.
       */
      run() {
        this.activeImportSource = null;
        this.designNotice = null;
        this.pendingDesignTerms = [];
      },
    }),
    setTerm: command({
      params: { term: text({ nonEmpty: true }), included: boolean() },
      /**
       * Einen Term ein- oder ausschließen; der Hinweis einer Versuchsvorgabe
       * und eine offene Vorgabe entfallen (Altform). Ein Term, den die Daten nicht kennen, bleibt
       * gespeichert und wirkt nicht.
       * @param {{ term: string, included: boolean }} p
       */
      run({ term, included }) {
        const rest = this.excludedTerms.filter((t) => t !== term);
        this.excludedTerms = included ? rest : [...rest, term];
        this.designNotice = null;
        this.pendingDesignTerms = [];
      },
    }),
  },
  derived: {
    /**
     * Das gezeigte Modell als Zahlen: beim Polynom das Gesamtmodell, sonst
     * das gewählte Einzelmodell; `null` ohne X oder Y oder wenn der Fit
     * scheitert (`error` nennt den Grund).
     * @param {Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result(src) {
      return agentResult(activeResultOf(analyze(this, src), this.activeXKey), this.regType);
    },
    /**
     * Warum es kein (volles) Ergebnis gibt, mit dem Text in der App-Sprache;
     * `null` ohne Grund. Bei Einzelmodellen auch neben einem Ergebnis.
     * @param {Source} src Leser des Arbeitsblatts
     * @param {unknown} _d
     * @param {(key: string, params?: object) => string} t Übersetzer des Moduls
     * @this {import('./model.types.js').StateModel}
     * @returns {FitError|null}
     */
    error(src, _d, t) {
      const e = analyze(this, src).error;
      if (!e) return null;
      const one = (/** @type {string} */ reason, /** @type {any} */ params) => t(reason, params ?? undefined);
      const message = e.reason === 'perX'
        ? e.perX.map((p) => `${p.name}: ${one(p.reason, p.params)}`).join('\n')
        : one(e.reason, e.params);
      return { reason: e.reason, params: e.params, perX: e.perX.map((p) => ({ ...p })), message };
    },
    /**
     * Die vermengten Terme eines gescheiterten Polynoms; `setTerm` kann sie
     * ausschließen.
     * @param {Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {AliasedTerm[]}
     */
    aliased(src) {
      return analyze(this, src).aliased.map((a) => ({ term: a.term, with: [...a.with] }));
    },
    /**
     * Die Terme, die `setTerm` wirksam ein- oder ausschließt: die des
     * gezeigten Modells ohne Achsenabschnitt und die vermengten.
     * @param {Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    terms(src) {
      const a = analyze(this, src);
      const r = activeResultOf(a, this.activeXKey);
      const fitted = (r?.allTerms ?? []).filter((/** @type {string} */ t) => t !== 'Intercept');
      return [...new Set([...fitted, ...a.aliased.map((x) => x.term)])];
    },
    /**
     * Die Spaltenschlüssel der Einzelmodelle; leer beim Polynom.
     * @param {Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    perXKeys(src) {
      const a = analyze(this, src);
      return a.kind === 'single' && a.perX ? Object.keys(a.perX) : [];
    },
    /**
     * Das gezeigte Einzelmodell: das gewählte, sonst das erste; `null` beim
     * Polynom.
     * @param {Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {string|null}
     */
    activeX(src) {
      return activeXOf(analyze(this, src), this.activeXKey);
    },
    /**
     * Die Grade, die die Daten tragen.
     * @param {Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {number[]}
     */
    activeDegrees(src) {
      return degreeAvailability(this, src).options.filter((o) => !o.disabled).map((o) => o.deg);
    },
    /**
     * Die Parameterfelder, die im Stand wirken; der Grad nur beim Polynom.
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams() {
      return this.regType === 'polynomial' ? ['regType', 'polyDegree', 'confLevel', 'alpha'] : ['regType', 'confLevel', 'alpha'];
    },
    /**
     * Die Versuche der Planer, die die Übernahme anbietet.
     * @param {Source} src Leser der Instanzen
     * @returns {ImportChoice[]}
     */
    experimentImports(src) {
      return experimentOptions(plannerExperiments(src)).map((o) => ({ key: o.key, label: o.label, args: importArgsOf(o) }));
    },
    /**
     * Die übernommene Quelle gibt es nicht mehr: der Planer fehlt oder hat
     * keinen Versuch. Unbekannt (Planer nicht geladen) zählt nicht.
     * @param {Source} src Leser der Instanzen
     * @this {import('./model.types.js').StateModel}
     * @returns {boolean}
     */
    importMissing(src) {
      const id = this.activeImportSource?.experimentId;
      if (!id) return false;
      const p = plannerExperiments(src).find((e) => e.plannerId === id);
      if (!p) return true;
      return p.loaded && !p.experiment;
    },
    /**
     * Die Eingaben der Vorhersage zum gezeigten Modell.
     * @param {Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Predictor[]}
     */
    predictors(src) {
      return predictorsOf(activeResultOf(analyze(this, src), this.activeXKey));
    },
    /**
     * Das Speichern als Modell ist möglich: ein gerechnetes Polynom.
     * @param {Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {boolean}
     */
    canSaveModel(src) {
      return this.regType === 'polynomial' && analyze(this, src).kind === 'poly';
    },
    /**
     * Der Hinweis der Versuchsvorgabe, solange X, Y und Grad zum Stand der
     * Übernahme passen und die Form ein Polynom ist; sonst `null`.
     * @this {import('./model.types.js').StateModel}
     * @returns {DesignNotice|null}
     */
    effectiveDesignNotice() {
      const n = this.designNotice;
      if (!n || this.regType !== 'polynomial') return null;
      if (n.basis !== noticeBasis(this.colRefs, this.yRef, this.polyDegree)) return null;
      return { aliased: n.aliased.map((a) => ({ term: a.term, with: [...a.with] })), saturated: [...n.saturated] };
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
    return this.colRefs.length > 0 || this.yRef != null || this.modelRecord != null;
  }
}
