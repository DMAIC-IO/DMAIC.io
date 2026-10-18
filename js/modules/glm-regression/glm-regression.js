/**
 * D.Mike — GLM Regression Module (glm-regression.js)
 * Improve phase: Generalized Linear Models for attributive/count data.
 *
 * Migrated to createModule + Alpine CSP. The Model (glm-regression-model.js)
 * holds the persistent configuration + the slim persisted fit result + thin
 * worksheet/column helpers. ALL GLM statistics stay in `engines/glm-engine.js`
 * — nothing is reimplemented here. The full fit result is derived transiently
 * in the view (`result`) and rebuilt declaratively into a plain view-model;
 * no UI HTML is built in JS. The only imperative widgets are the ColumnPicker
 * and the chartManager residual/QQ/Cook's/ROC scatters (sanctioned chart tier).
 *
 * Cross-module: `saveAsModel()` writes the fitted GLM to the project-central
 * models-store (`saveModel`) with the exact legacy record shape so the
 * response-optimization module can reference it. The write happens at the same
 * point (the "Save as model" button) and with the same object shape as legacy.
 *
 * Supports: binary logistic (binomial/logit), Poisson (log, with quasi-Poisson
 * refit on overdispersion), negative binomial (log), and auto-detect.
 *
 * @agent  Steuerbar über das Viewmodel: X, Y und Versuchszahl wählen
 *   (setColumns, setColumn), Verfahren, Konfidenz/α und Schwelle setzen
 *   (setParam), die Erfolgsklasse tauschen (swapSuccess), rechnen (autoRun,
 *   runAnalysis), für Termwerte vorhersagen (predict) und als Projektmodell
 *   speichern (saveAsModel). Diagramme und Tabs bleiben der Oberfläche
 *   vorbehalten; gelesen wird über read() (AgentRead).
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireNumber } from '../../core/agent/agent-argcheck.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { State, keyToRef, predictFor, METHODS } from './glm-regression-model.js';
import {
  fitGLM, buildGLMDesignMatrix,
  computeROC, classificationTable, hosmerLemeshow,
  overdispersionCheck, hatValues, cookDistance, computeGLMVIF,
  normalOrderStats,
} from '../../engines/glm-engine.js';
import {
  ColumnPicker, refToKey, isPickerFocused,
} from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';
import { saveModel, buildDataSnapshot, computeDataHash } from '../../core/models-store.js';

// ── Unicode glyphs carried over from the legacy innerHTML (kept out of x-text
// literals — Alpine CSP would emit \u-escapes verbatim). ──────────────
const EN_DASH = '–';     // –
const SWAP = '↔';        // ↔
const CHI2 = 'χ²';       // χ²

/** @param {number} v @param {number} d */
function fmt(v, d = 4) {
  if (v == null || !isFinite(v)) return EN_DASH;
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(d);
  return v.toFixed(d);
}
function fmtP(p) { return p < 0.0001 ? '< 0.0001' : p.toFixed(4); }
function sigClass(p) {
  if (p < 0.001) return 'glm__sig--high';
  if (p < 0.01) return 'glm__sig--med';
  if (p < 0.05) return 'glm__sig--low';
  return 'glm__sig--none';
}
function sigStars(p) {
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

/**
 * Events per predictor for a binomial fit (Peduzzi et al. 1996): the rarer
 * of events and non-events over the coefficients without the intercept.
 * Grouped data count trials, not rows.
 * @param {number[]} y - 0/1 outcomes, or proportions when `weights` are given
 * @param {?number[]} weights - trials per row (grouped data)
 * @param {number} p - number of coefficients including the intercept
 * @returns {number} Infinity for an intercept-only model
 */
function eventsPerPredictor(y, weights, p) {
  let events = 0, total = 0;
  for (let i = 0; i < y.length; i++) {
    const w = weights ? weights[i] : 1;
    events += y[i] * w;
    total += w;
  }
  return Math.min(events, total - events) / (p - 1);
}

/** Präfix der Kontexthilfe-Sätze (`types.<Typedef>.<schlüssel>`). */
const HELP = 'modules.glm-regression.types.';
/** Die Parameter, die `setParam` annimmt (flach am Model). */
const PARAM_KEYS = ['method', 'confLevel', 'alpha', 'cutoff'];
/** i18n-Schlüssel der Verfahrensnamen, je Wert aus METHODS. */
const METHOD_LABEL_KEYS = { auto: 'methodAuto', binomial: 'methodBinomial', poisson: 'methodPoisson', negbin: 'methodNegbin' };
/** Die Einzelspalten-Slots in Reihenfolge der Oberfläche: Zielgröße, Versuchszahl. */
const COLUMN_SLOTS = ['y', 'trials'];
/** Die Mehrfachspalten-Slots: die Einflussgrößen X, geordnet. */
const MULTI_SLOTS = ['x'];
/** Je Slot der Filter seines Wählers (X: Textspalten werden kategorial). */
const SLOT_FILTERS = {
  x: { types: ['numeric', 'currency', 'percent', 'text'], minCount: 1 },
  y: { minCount: 1 },
  trials: { minCount: 1 },
};

/**
 * Ein Anteil strikt zwischen 0 und 1 (Konfidenz, α).
 * @param {any} value der übergebene Wert
 * @returns {number} der geprüfte Anteil
 * @throws {Error} wenn `value` keine Zahl in (0, 1) ist
 */
function requireFraction(value) {
  const n = requireNumber('value', value);
  if (n <= 0 || n >= 1) {
    throw new Error(`invalid value ${JSON.stringify(value)}; allowed: a number greater than 0 and less than 1`);
  }
  return n;
}

/** Welcher Model-Schlüssel ein Slot ist; Y auf die Versuchszahl leert diese. */
const COLUMN_SINKS = {
  y: (m, key) => { m.yKey = key; if (key && m.trialsKey === key) m.trialsKey = null; },
  trials: (m, key) => { m.trialsKey = key; },
};

/** Eine endliche Zahl oder null. */
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }

/**
 * Die Schlüsselfläche von `setParam`. Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {'auto'|'binomial'|'poisson'|'negbin'} method  Verteilungsfamilie
 * @property {number} confLevel  Konfidenzniveau als Anteil
 * @property {number} alpha  Signifikanzniveau als Anteil
 * @property {number} [cutoff]  Klassifikationsschwelle, nur binomial
 */

/**
 * Das gerechnete Ergebnis (`_agentResult()`), wie `read().result` es liefert.
 *
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
 * @property {Array<number|null>|null} vif  Varianzinflationsfaktoren je Prädiktor
 * @property {string[]} warnings  Warnungen
 * @property {string|null} equation  Modellgleichung
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
 * Die Konfusionstafel bei der gewählten Schwelle, nur bei binomialem Fit.
 *
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
 * Die Überdispersionsprüfung als Zahlen — dieselbe Quelle für die Lesefläche
 * und den Anzeigeblock „Überdispersion“.
 * @param {object|null|undefined} od `r._overdispersion` der Engine
 * @returns {Overdispersion|null} null ohne Poisson-Prüfung
 */
function overdispersionOf(od) {
  if (!od) return null;
  return {
    pearsonChi2: num(od.pearsonChi2), df: num(od.df), ratio: num(od.ratio),
    overdispersed: Boolean(od.overdispersed),
  };
}

/**
 * Die Agenten-Lesefläche der GLM-Regression.
 *
 * Ergebnis im Viewmodel (`_fit`) und verschlankt im Model; die Lesefläche
 * zeigt die Zahlen des Fits, wenn die Oberfläche ein Ergebnis zeigt. Ein
 * unvollständig gewordener Eingabestand lässt — wie in der Oberfläche — das
 * letzte Ergebnis stehen.
 *
 * @typedef {object} AgentRead
 * @property {Array<{ instanceId: string, sheetId: string, columnId: string }>} colRefs  the predictor columns X
 * @property {string|null} yKey  the response column as key `instanceId|sheetId|columnId`
 * @property {string|null} trialsKey  the column with the number of trials, null for none
 * @property {string} method  one of `methods`
 * @property {string[]} methods  all methods, `auto` included
 * @property {number} confLevel  confidence level as a fraction; alpha is 1 − confLevel
 * @property {number} alpha  significance level as a fraction
 * @property {number} cutoff  classification threshold of a binomial fit
 * @property {{ success: number, failure: number }|null} successClass  the levels of a binary response, null otherwise
 * @property {string[]} activeParams  the keys `setParam` accepts now
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {string[]} activeMultiSlots  the slots `setColumns` accepts
 * @property {object} pickableColumns  per slot the columns `setColumn`/`setColumns` accept, each `{ key, name }`
 * @property {Result|null} result  the fit as numbers, null without a shown result
 * @property {Classification|null} classification  confusion table and rates at `cutoff`, binomial only
 * @property {string} errorMsg  the message the module shows, '' without error
 * @property {string[]} predictionTerms  the terms `predict` takes, in model order
 * @property {{ linear: number, response: number, ciLower: number|null, ciUpper: number|null }|null} prediction  the last prediction, null without one or without a shown result
 * @property {string|null} savedModelId  id of the model saved last in the project models
 */
const mod = createModule({
  config: {
    id: 'glm-regression',
    engine: 'alpine',
    phase: 'improve',
    allowedPhases: ['analyze', 'improve'],
    icon: 'module.glm-regression',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (never persisted) ───────────────
      result: null,         // full fit view-model (or null)
      _fit: null,           // raw engine fit result (for charts/prediction)
      predictResult: null,
      predictError: null,
      predictInputs: {},    // term label -> typed text (transient)
      _prediction: null,    // last prediction as numbers (transient, read().prediction)
      _detectKey: null,     // auto-detect reason key (transient)
      _detectVisible: false,
      _classCutoff: 0.5,    // current classification cutoff (mirrors model.cutoff)
      _classCache: null,    // classification table for the current cutoff
      _errorKey: null,
      _errorText: '',
      _picker: null,
      _charts: [],
      _unsubs: [],
      _renderGen: 0,
      _successInfo: null,
      /** Per-anchor chart-render error messages (declarative — x-if/x-text). */
      chartErrors: { residuals: '', qq: '', cooks: '', roc: '' },

      /** @noagent view transform; Error message for a given chart anchor (empty string when none). */
      chartErr(key) { return this.chartErrors[key] || ''; },

      /** @noagent helper */
      sm() { return module._context?.stateManager; },

      // ── Agent surface ────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Eingaben, wählbare Mengen und der gerechnete Fit als Zahlen
       */
      read(options) {
        const m = this.model;
        const shown = Boolean(this.result);
        const binomial = shown && this._fit?.family.name === 'binomial';
        const ct = binomial ? this._classCache : null;
        return readAgentState('glm-regression', {
          colRefs: m.colRefs, yKey: m.yKey, trialsKey: m.trialsKey,
          method: m.method, methods: METHODS,
          confLevel: m.confLevel, alpha: m.alpha, cutoff: m.cutoff,
          successClass: shown ? (this._fit?._successClassInfo ?? null) : null,
          activeParams: this.activeParams(), activeColumnSlots: this.activeColumnSlots(),
          activeMultiSlots: this.activeMultiSlots(), pickableColumns: this.pickableColumns(),
          result: shown ? this._agentResult(this._fit) : null,
          classification: ct ? {
            cutoff: this._classCutoff, tp: ct.tp, fn: ct.fn, fp: ct.fp, tn: ct.tn,
            sensitivity: num(ct.sensitivity), specificity: num(ct.specificity),
            accuracy: num(ct.accuracy), precision: num(ct.precision),
          } : null,
          errorMsg: this.errorText(),
          predictionTerms: shown ? this.predictionTerms().map(t => t.label) : [],
          prediction: shown ? (this._prediction ?? null) : null,
          savedModelId: m.savedModelId,
        }, options);
      },

      /** Der Fit als Zahlenzusammenfassung (ohne Residuen- und Matrixvektoren). */
      _agentResult(r) {
        if (!r) return null;
        const isBinomial = r.family.name === 'binomial';
        const isCount = r.family.name === 'poisson' || r.family.name === 'negbin';
        const ratioOf = (j) => {
          if (j === 0) return null;
          if (isBinomial && r.oddsRatios?.[j]) {
            const o = r.oddsRatios[j];
            return { value: num(o.or), lower: num(o.lower), upper: num(o.upper) };
          }
          if (isCount && r.rateRatios?.[j]) {
            const o = r.rateRatios[j];
            return { value: num(o.rr), lower: num(o.lower), upper: num(o.upper) };
          }
          return null;
        };
        return {
          family: { name: r.family.name, link: r.family.link, theta: r.family.name === 'negbin' ? num(r.family.theta) : null },
          quasi: Boolean(r._quasiActivated),
          autoReason: this._detectKey,
          n: num(r.n), iterations: num(r.iterations), aic: num(r.aic), bic: num(r.bic),
          deviance: num(r.deviance), nullDeviance: num(r.nullDeviance), logLikelihood: num(r.logLikelihood),
          pseudoR2: {
            mcfadden: num(r.pseudoR2?.mcfadden), nagelkerke: num(r.pseudoR2?.nagelkerke),
            coxSnell: num(r.pseudoR2?.coxSnell),
          },
          coefficients: r.terms.map((term, j) => ({
            term, estimate: num(r.coefficients[j]), se: num(r.stdErrors?.[j]), z: num(r.zValues?.[j]),
            p: num(r.pValues?.[j]), ciLower: num(r.ciLower?.[j]), ciUpper: num(r.ciUpper?.[j]),
            ratio: ratioOf(j),
          })),
          auc: num(r._roc?.auc),
          hosmerLemeshow: r._hl ? { statistic: num(r._hl.statistic), pValue: num(r._hl.pValue) } : null,
          overdispersionRatio: num(r._overdispersion?.ratio),
          overdispersion: overdispersionOf(r._overdispersion),
          vif: Array.isArray(r._vifs) ? r._vifs.map(num) : null,
          warnings: [...(this.result?.warnings ?? [])],
          equation: this.buildEquation(r) ?? null,
        };
      },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        // Ein schlanker (wiederhergestellter) Fit hat keine y/fittedValues: die
        // Tafel lässt sich nicht neu rechnen, cutoff gilt dann nicht.
        const binomial = Boolean(this.result) && this._fit?.family.name === 'binomial' && !this._fit._slim;
        return binomial ? PARAM_KEYS : PARAM_KEYS.filter(k => k !== 'cutoff');
      },
      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() { return COLUMN_SLOTS; },
      /** @noagent derived set; der Agent liest sie über read().activeMultiSlots */
      activeMultiSlots() { return MULTI_SLOTS; },
      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = this.sm();
        if (!sm) return { x: [], y: [], trials: [] };
        const xKeys = new Set(this.model.colRefs.map(refToKey));
        const y = pickableColumnList(sm, SLOT_FILTERS.y).filter(c => !xKeys.has(c.key));
        return {
          x: pickableColumnList(sm, SLOT_FILTERS.x),
          y,
          trials: y.filter(c => c.key !== this.model.yKey),
        };
      },

      /**
       * Die Einflussgrößen X ersetzen; die Reihenfolge bleibt, Doppelte zählen
       * einmal, Textspalten werden kategoriale Prädiktoren. Steht die
       * Zielgröße Y unter den neuen X, wird Y geleert. Danach wird gerechnet,
       * wenn X und Y gewählt sind.
       * @agent
       * @param {'x'} slot der Slot; dieses Modul führt nur `x`
       * @param {Array<{ instanceId: string, sheetId: string, columnId: string }>} refs
       *   die Spaltenbezüge wählbarer Spalten (`pickableColumns.x`); `[]` leert die Auswahl
       * @returns {void}
       * @throws {Error} wenn `slot` unbekannt ist, `refs` keine Liste ist oder eine Spalte nicht wählbar ist
       */
      setColumns(slot, refs) {
        requireEnum('slot', slot, MULTI_SLOTS);
        requireEnum('slot', slot, this.activeMultiSlots());
        if (!Array.isArray(refs)) {
          throw new Error(`invalid refs ${JSON.stringify(refs)}; allowed: a list of column references, [] clears it`);
        }
        const keys = this.pickableColumns()[slot].map(c => c.key);
        for (const ref of refs) requireKnownId('ref', refToKey(ref), keys);
        const clean = [...new Set(refs.map(refToKey))].map(keyToRef);
        this.model.colRefs = clean;
        if (this.model.yKey && clean.some(r => refToKey(r) === this.model.yKey)) this.model.yKey = null;
        this._picker?.syncValue(clean);
        this.autoRun();
      },

      /**
       * Die Zielgröße (`y`) oder die Versuchszahl (`trials`) setzen oder mit
       * null leeren. Y auf die Spalte der Versuchszahl leert diese. Danach
       * wird gerechnet, wenn X und Y gewählt sind.
       * @agent
       * @param {'y'|'trials'} slot der Slot; `activeColumnSlots` nennt sie
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte (`pickableColumns.y` ohne die X,
       *   `pickableColumns.trials` zusätzlich ohne Y), oder null zum Leeren
       * @returns {void}
       * @throws {Error} wenn `slot` unbekannt ist oder die Spalte nicht wählbar
       */
      setColumn(slot, ref) {
        requireEnum('slot', slot, COLUMN_SLOTS);
        if (ref == null) {
          COLUMN_SINKS[slot](this.model, null);
        } else {
          requireEnum('slot', slot, this.activeColumnSlots());
          requireKnownId('ref', refToKey(ref), this.pickableColumns()[slot].map(c => c.key));
          COLUMN_SINKS[slot](this.model, refToKey(ref));
        }
        this.autoRun();
      },

      /**
       * Einen Parameter setzen. `method`, `confLevel` und `alpha` rechnen neu;
       * `cutoff` rechnet nur die Klassifikationstafel neu.
       * @agent
       * @param {keyof Params} key welcher Parameter; `activeParams` nennt die jetzt gültigen
       * @param {string|number} value der Wert, siehe `Params`
       * @returns {void}
       * @throws {Error} wenn `key` jetzt nicht gilt oder `value` außerhalb seiner Menge liegt
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        if (key === 'method') {
          requireEnum('value', value, METHODS);
          this.model.method = value;
        } else if (key === 'confLevel') {
          this.model.confLevel = requireFraction(value);
          this.model.alpha = 1 - this.model.confLevel;
        } else if (key === 'alpha') {
          this.model.alpha = requireFraction(value);
          this.model.confLevel = 1 - this.model.alpha;
        } else {
          this.model.cutoff = requireNumber('value', value, { min: 0, max: 1 });
          this._applyCutoff();
          return;
        }
        this.autoRun();
      },

      // ── Column option lists (data-driven; selects NOT x-model-bound) ──
      /** @noagent derived set; der Agent liest sie über read().pickableColumns.y */
      yOptions() { return this.pickableColumns().y; },
      /** @noagent derived set; der Agent liest sie über read().pickableColumns.trials */
      trialsOptions() { return this.pickableColumns().trials; },

      // ── Method radio ─────────────────────────────────────────
      /** @noagent view transform */
      methodRadioName() { return `glm-method-${  module._context.instanceId}`; },
      /** @noagent view transform; die Optionen der Verfahrenswahl (eine Quelle: METHODS) */
      methodOptions() {
        return METHODS.map(v => ({ value: v, label: _t(METHOD_LABEL_KEYS[v]) }));
      },

      // ── Detect-info box ──────────────────────────────────────
      /** @noagent view transform */
      detectInfoText() { return this._detectKey ? _t(this._detectKey) : ''; },
      /** @noagent view transform */
      detectInfoClass() { return this._detectVisible ? 'glm__detect-info--visible' : ''; },

      // ── Conf / alpha display ─────────────────────────────────
      /** @noagent view transform */
      confDisplay() {
        const c = this.model.confLevel;
        return c == null ? '' : String(Number((c * 100).toFixed(2)));
      },
      /** @noagent view transform */
      alphaDisplay() {
        const a = this.model.alpha;
        return a == null ? '' : String(Number((a * 100).toFixed(2)));
      },

      // ── Error box ────────────────────────────────────────────
      /** @noagent view transform */
      errorText() { return this._errorKey ? this._errorText : ''; },
      /** @noagent view transform */
      errorStyle() { return this._errorKey ? 'display:block' : 'display:none'; },
      /** @noagent view transform */
      resultsStyle() { return this.result ? '' : 'display:none'; },
      /** @noagent view transform */
      cutoffDisplay() { return this._classCutoff.toFixed(2); },

      // ── Tabs ─────────────────────────────────────────────────
      /** @noagent view transform */
      tabs() {
        const list = [
          { id: 'model', label: _t('tabModel') },
          { id: 'diagnostics', label: _t('tabDiagnostics') },
        ];
        if (this._fit && this._fit.family.name === 'binomial') list.push({ id: 'roc', label: _t('tabROC') });
        list.push({ id: 'prediction', label: _t('tabPrediction') });
        return list;
      },

      // ── Prediction inputs ────────────────────────────────────
      /** @noagent derived set; der Agent liest sie über read().predictionTerms */
      predictionTerms() {
        const r = this._fit;
        if (!r) return [];
        const out = [];
        for (let j = 1; j < r.terms.length; j++) out.push({ idx: j, label: r.terms[j] });
        return out;
      },

      // ── Classification view (recomputed at the current cutoff) ──
      /** @noagent view transform */
      classView() {
        const r = this._fit;
        if (!r || r.family.name !== 'binomial') {
          return { tp: '', fn: '', fp: '', tn: '', metrics: [] };
        }
        const ct = this._classCache || classificationTable(r.y, r.fittedValues, this._classCutoff, r.priorWeights ?? undefined);
        return {
          tp: ct.tp, fn: ct.fn, fp: ct.fp, tn: ct.tn,
          metrics: [
            { label: _t('sensitivity'), value: fmt(ct.sensitivity, 4), help: `${HELP}Classification.sensitivity` },
            { label: _t('specificity'), value: fmt(ct.specificity, 4), help: `${HELP}Classification.specificity` },
            { label: _t('accuracy'), value: fmt(ct.accuracy, 4), help: `${HELP}Classification.accuracy` },
            { label: _t('precision'), value: fmt(ct.precision, 4), help: `${HELP}Classification.precision` },
          ],
        };
      },

      // ── Event handlers ───────────────────────────────────────
      /** @noagent DOM event handler; the agent uses setColumn() */
      onYChange(event) { this._selectColumn(event, 'y', () => this.model.yKey); },
      /** @noagent DOM event handler; the agent uses setColumn() */
      onTrialsChange(event) { this._selectColumn(event, 'trials', () => this.model.trialsKey); },
      /** Eine Spaltenauswahl durch setColumn; eine Absage stellt die Auswahl auf den Model-Wert zurück. */
      _selectColumn(event, slot, stored) {
        const v = event.target.value;
        try {
          this.setColumn(slot, v ? keyToRef(v) : null);
        } catch {
          event.target.value = stored() ?? '';
        }
      },
      /** @noagent DOM event handler; the agent uses setParam() */
      onMethodChange(event) {
        if (!event.target.name?.startsWith('glm-method')) return;
        try {
          this.setParam('method', event.target.value);
        } catch {
          event.target.checked = event.target.value === this.model.method;
        }
      },
      // confLevel is the single source of truth; alpha mirrors it.
      /** @noagent DOM event handler; the agent uses setParam() */
      onConfChange(event) { this._percentParam(event, 'confLevel'); },
      /** @noagent DOM event handler; the agent uses setParam() */
      onAlphaChange(event) { this._percentParam(event, 'alpha'); },
      /**
       * Eine Prozenteingabe als Anteil durch setParam; außerhalb von (0, 100)
       * oder bei einer Absage bleibt der Model-Wert. Das Feld zeigt danach
       * immer den Model-Wert.
       */
      _percentParam(event, key) {
        const v = parseFloat(String(event.target.value).replace(',', '.'));
        if (Number.isFinite(v) && v > 0 && v < 100) {
          try { this.setParam(key, v / 100); } catch { /* das Feld zeigt unten wieder den Model-Wert */ }
        }
        event.target.value = key === 'confLevel' ? this.confDisplay() : this.alphaDisplay();
      },
      /** @noagent navigation */
      switchTab(tabId) {
        this._renderGen++;
        this.destroyCharts();
        this.model.activeTab = tabId;
        this.$nextTick(() => this.renderActiveChart());
      },
      /** @noagent navigation */
      onRouteChanged(sub) {
        const key = Array.isArray(sub) && sub.length ? sub[0] : null;
        if (!key || key === this.model.activeTab) return;
        if (!this.tabs().some(tb => tb.id === key)) return;
        this.switchTab(key);
      },
      /**
       * Bei binärer Zielgröße Erfolg und Misserfolg tauschen und neu rechnen
       * (`successClass`); ohne binären Fit geschieht nichts.
       * @agent
       * @returns {void}
       */
      swapSuccess() {
        const info = this.result ? this._fit?._successClassInfo : null;
        if (!info) return;
        this.model.successClass = info.failure;
        this.runAnalysis();
      },
      /** @noagent DOM event handler; the agent uses setParam() */
      onCutoff(event) {
        try {
          this.setParam('cutoff', parseFloat(event.target.value));
        } catch {
          event.target.value = String(this.model.cutoff);
        }
      },
      /** Die Klassifikationstafel zur Schwelle `model.cutoff` neu rechnen. */
      _applyCutoff() {
        this._classCutoff = this.model.cutoff;
        const r = this._fit;
        if (r) {
          this._classCache = classificationTable(r.y, r.fittedValues, this._classCutoff, r.priorWeights ?? undefined);
          r._classTable = this._classCache;
        }
      },

      // ── Auto-run gate ────────────────────────────────────────
      /**
       * Rechnet, wenn X und Y gewählt sind; sonst geschieht nichts — ein
       * früheres Ergebnis bleibt stehen, wie in der Oberfläche.
       * @agent
       * @returns {void}
       */
      autoRun() {
        if (this.model.canRun()) this.runAnalysis();
      },

      /**
       * Render the persisted slim fit (heavy arrays stripped) when the
       * worksheet data is unavailable for a refit. Scalar / diagnostic-summary
       * fields survive slimming, so the model/quality tables still render;
       * charts that need raw residual arrays simply stay empty — matching the
       * legacy slim-view behaviour.
       * @noagent helper
       */
      showSlimResult() {
        const r = this.model.result;
        if (!r || !r.converged) return;
        this._fit = r;
        this._classCutoff = this.model.cutoff;
        this._classCache = r._classTable || null;
        this.result = this.buildResultView(r);
        this.$nextTick(() => this.renderActiveChart());
      },

      // ── Analysis (delegates statistics to the engine) ────────
      /**
       * Jetzt rechnen. Ohne X, ohne Y oder mit weniger als drei Zeilen wird
       * das Ergebnis verworfen und `errorMsg` nennt den Grund.
       * @agent
       * @returns {void}
       */
      runAnalysis() {
        this._renderGen++;
        this.destroyCharts();
        this._errorKey = null;
        const sm = this.sm();
        if (!sm) return;

        if (this.model.colRefs.length === 0) { this.showError('errorNoX'); return; }
        if (!this.model.yKey) { this.showError('errorNoY'); return; }

        const fd = this.model.buildFitData(sm);
        const { y, xCols, xNames, xIsCat, yName, weights } = fd;
        if (y.length < 3) { this.showError('errorTooFew'); return; }

        const columns = xCols.map((vals, j) => ({ values: vals, name: xNames[j], categorical: xIsCat[j] }));
        const { X, terms } = buildGLMDesignMatrix(columns);
        this.fitAndDisplay(X, y, terms, yName, xNames, weights);
      },

      /** @noagent helper */
      showError(key) {
        this._errorKey = key;
        this._errorText = _t(key);
        this.result = null;
        this._fit = null;
        this._prediction = null;
      },
      /** @noagent helper */
      showErrorMsg(text) {
        this._errorKey = '_raw';
        this._errorText = text;
        this.result = null;
        this._fit = null;
        this._prediction = null;
      },

      /** @noagent helper */
      fitAndDisplay(X, y, terms, yName, xNames, weights) {
        const fam = this.model.resolveFamily(y);
        const familyName = fam.familyName;
        const link = fam.link;
        this._detectKey = fam.auto ? fam.reasonKey : null;
        this._detectVisible = Boolean(fam.auto);

        if (familyName === 'binomial') {
          if (weights) {
            for (let i = 0; i < y.length; i++) {
              if (y[i] < 0 || y[i] > 1) { this.showError('errorProportionRange'); return; }
              if (weights[i] < 1 || !Number.isFinite(weights[i])) { this.showError('errorTrialsInvalid'); return; }
            }
          } else {
            const unique = new Set(y);
            if (unique.size > 2 || unique.size === 1) { this.showError('errorNotBinary'); return; }
            const levels = [...unique].sort((a, b) => a - b);
            const success = (this.model.successClass !== null && unique.has(this.model.successClass))
              ? this.model.successClass : levels[1];
            const failure = success === levels[0] ? levels[1] : levels[0];
            if (!(success === 1 && failure === 0)) {
              for (let i = 0; i < y.length; i++) y[i] = y[i] === success ? 1 : 0;
            }
            this._successInfo = { success, failure };
          }
        } else {
          this._successInfo = null;
        }

        const n = y.length;
        const p = X[0].length;
        if (n <= p) { this.showError('errorTooFewForP'); return; }

        let result, quasiActivated = false;
        try {
          result = fitGLM(X, y, { familyName, link, terms, confLevel: this.model.confLevel, weights: weights ?? undefined });
          if (result.converged && familyName === 'poisson') {
            const od = overdispersionCheck(result.pearsonResiduals, result.n, result.p);
            if (od.overdispersed) {
              result = fitGLM(X, y, { familyName, link, terms, confLevel: this.model.confLevel, estimateDispersion: true, weights: weights ?? undefined });
              quasiActivated = true;
            }
          }
        } catch (err) {
          this.showErrorMsg(`${_t('errorFit')}: ${err.message}`);
          return;
        }

        if (!result.converged) { this.showError('errorNoConverge'); return; }

        result._yName = yName;
        result._xNames = xNames;
        result._quasiActivated = quasiActivated;
        if (this._successInfo) result._successClassInfo = this._successInfo;

        const hat = hatValues(X, result.invXtWX, result.irlsWeights);
        result._hat = hat;
        result._cooks = cookDistance(result.pearsonResiduals, hat, p, result.dispersion);

        if (X[0].length > 2) result._vifs = computeGLMVIF(X, result.irlsWeights);

        if (familyName === 'binomial') {
          result._roc = computeROC(y, result.fittedValues, weights ?? undefined);
          result._classTable = classificationTable(y, result.fittedValues, this.model.cutoff, weights ?? undefined);
          result._hl = hosmerLemeshow(y, result.fittedValues, 10, weights ?? undefined);
        }
        if (familyName === 'poisson') {
          result._overdispersion = overdispersionCheck(result.pearsonResiduals, n, p);
        }
        if (familyName === 'binomial') result._epv = eventsPerPredictor(y, weights, p);

        this._errorKey = null;
        this._fit = result;
        this._classCutoff = this.model.cutoff;
        this._classCache = result._classTable || null;
        this.result = this.buildResultView(result);
        this.model.result = this.model.slimResult(result);
        this.predictResult = null;
        this.predictError = null;
        this.predictInputs = {};
        this._prediction = null;

        this.$nextTick(() => this.renderActiveChart());
      },

      // ── Result view-model (no HTML; pure data) ───────────────
      /** @noagent view transform */
      buildResultView(r) {
        const isBinomial = r.family.name === 'binomial';
        const isCount = r.family.name === 'poisson' || r.family.name === 'negbin';

        // Warnings
        const warnings = [];
        if (r.separationStrong) warnings.push(_t('warnSeparationStrong'));
        else if (r.separationDetected) warnings.push(_t('warnSeparation'));
        if (isBinomial) {
          if (r._epv < 10) warnings.push(_t('warnFewEvents', { epv: fmt(r._epv, 1) }));
        } else if (r.n / r.p < 10) {
          warnings.push(_t('warnSmallN'));
        }
        if (r.iterations >= 40) warnings.push(_t('warnSlowConverge'));
        if (r._overdispersion?.overdispersed) warnings.push(_t('warnOverdispersion'));
        if (r._quasiActivated) warnings.push(_t('warnQuasiActivated', { phi: r.dispersion.toFixed(2) }));
        if (r.thetaEstimated && r.thetaConverged === false) {
          warnings.push(_t('warnThetaUnstable', { theta: r.family?.theta?.toFixed?.(2) ?? EN_DASH }));
        }

        // Summary items (family / link / n / iters / theta / success-class)
        const summaryItems = [
          { label: _t('family'), value: _t(`family_${  r.family.name}`), help: `${HELP}Family.name` },
          { label: _t('linkFunction'), value: r.family.link, help: `${HELP}Family.link` },
          { label: _t('common.sym.n'), value: String(r.n), help: `${HELP}Result.n` },
          { label: _t('iterations'), value: String(r.iterations), help: `${HELP}Result.iterations` },
        ];
        if (r.family.theta != null) {
          summaryItems.push({ label: _t('thetaDispersion'), value: fmt(r.family.theta, 3), help: `${HELP}Family.theta` });
        }
        if (r._successClassInfo) {
          summaryItems.push({
            label: _t('successClass'),
            value: String(r._successClassInfo.success),
            swap: `${SWAP} ${String(r._successClassInfo.failure)}`,
            help: 'modules.glm-regression.fields.successClass.help',
          });
        }

        // KPI strip
        const mcfR2 = r.pseudoR2.mcfadden;
        const nagR2 = r.pseudoR2.nagelkerke;
        const mcfClass = mcfR2 >= 0.4 ? 'dmike-kpi--good' : mcfR2 >= 0.2 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
        const nagClass = nagR2 >= 0.8 ? 'dmike-kpi--good' : nagR2 >= 0.5 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
        const kpis = [
          { value: fmt(mcfR2, 4), label: `McFadden ${_t('common.sym.r2')}`, mod: mcfClass, help: `${HELP}PseudoR2.mcfadden` },
          { value: fmt(nagR2, 4), label: `Nagelkerke ${_t('common.sym.r2')}`, mod: nagClass, help: `${HELP}PseudoR2.nagelkerke` },
          { value: fmt(r.aic, 2), label: _t('aic'), mod: '', help: `${HELP}Result.aic` },
          { value: fmt(r.bic, 2), label: _t('bic'), mod: '', help: `${HELP}Result.bic` },
        ];
        if (isBinomial && r._roc) {
          const aucClass = r._roc.auc >= 0.8 ? 'dmike-kpi--good' : r._roc.auc >= 0.6 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
          kpis.push({ value: fmt(r._roc.auc, 4), label: _t('common.sym.auc'), mod: aucClass, help: `${HELP}Result.auc` });
        }

        // Quality items
        const qualityItems = [
          { label: _t('deviance'), value: fmt(r.deviance, 4), help: `${HELP}Result.deviance` },
          { label: _t('nullDeviance'), value: fmt(r.nullDeviance, 4), help: `${HELP}Result.nullDeviance` },
          { label: _t('logLikelihood'), value: fmt(r.logLikelihood, 4), help: `${HELP}Result.logLikelihood` },
          { label: `Cox-Snell ${_t('common.sym.r2')}`, value: fmt(r.pseudoR2.coxSnell, 4), help: `${HELP}PseudoR2.coxSnell` },
        ];
        if (isBinomial && r._hl) {
          qualityItems.push({ label: _t('hosmerLemeshow'), value: `${CHI2} = ${fmt(r._hl.statistic, 3)}, p = ${fmtP(r._hl.pValue)}`, help: `${HELP}Result.hosmerLemeshow` });
        }
        const od = overdispersionOf(r._overdispersion);
        if (od) {
          qualityItems.push({ label: _t('overdispersionRatio'), value: fmt(od.ratio, 3), help: `${HELP}Result.overdispersionRatio` });
        }

        // Coefficient table
        const ratioHeader = isBinomial ? _t('oddsRatioShort') : (isCount ? _t('rateRatioShort') : '');
        const coefRows = [];
        for (let j = 0; j < r.terms.length; j++) {
          const sc = sigClass(r.pValues[j]);
          let ratio = '';
          if (isBinomial && r.oddsRatios) {
            ratio = j === 0 ? EN_DASH : `${fmt(r.oddsRatios[j].or, 4)} [${fmt(r.oddsRatios[j].lower, 4)}, ${fmt(r.oddsRatios[j].upper, 4)}]`;
          } else if (isCount && r.rateRatios) {
            ratio = j === 0 ? EN_DASH : `${fmt(r.rateRatios[j].rr, 4)} [${fmt(r.rateRatios[j].lower, 4)}, ${fmt(r.rateRatios[j].upper, 4)}]`;
          }
          coefRows.push({
            term: r.terms[j],
            coef: `${fmt(r.coefficients[j])} [${fmt(r.ciLower[j])}, ${fmt(r.ciUpper[j])}]`,
            se: fmt(r.stdErrors[j]),
            z: fmt(r.zValues[j]),
            p: fmtP(r.pValues[j]),
            pClass: sc,
            ratio,
            stars: sigStars(r.pValues[j]),
          });
        }

        // VIF rows
        let vifRows = null;
        if (r._vifs && r._vifs.length > 0) {
          vifRows = r._vifs.map((vif, j) => ({
            term: r.terms[j + 1],
            vif: fmt(vif, 2),
            warnIcon: vif > 10 ? 'status.warning' : null,
            warnText: vif > 10 ? '' : vif > 5 ? '!' : '',
            warnClass: vif > 10 ? 'glm__sig--high' : vif > 5 ? 'glm__sig--low' : '',
          }));
        }

        // Overdispersion block
        let overdispersion = null;
        if (od) {
          overdispersion = {
            items: [
              { label: `Pearson ${_t('symChi2')}`, value: fmt(od.pearsonChi2, 3), help: `${HELP}Overdispersion.pearsonChi2` },
              { label: _t('common.sym.df'), value: String(od.df), help: `${HELP}Overdispersion.df` },
              { label: `${_t('symChi2')}/${_t('common.sym.df')}`, value: fmt(od.ratio, 3), help: `${HELP}Overdispersion.ratio` },
            ],
            hint: od.overdispersed ? _t('overdispersionHint') : null,
          };
        }

        return {
          isBinomial,
          warnings,
          summaryItems,
          kpis,
          qualityItems,
          ratioHeader,
          coefRows,
          equation: this.buildEquation(r),
          vifRows,
          overdispersion,
          aucText: (isBinomial && r._roc) ? fmt(r._roc.auc, 4) : null,
        };
      },

      /** @noagent view transform */
      buildEquation(r) {
        const isBinomial = r.family.name === 'binomial';
        const lhs = isBinomial ? 'logit(p)' : 'log(μ)';
        let eq = `${lhs} = ${fmt(r.coefficients[0], 4)}`;
        for (let j = 1; j < r.terms.length; j++) {
          const c = r.coefficients[j];
          const term = r.terms[j];
          const rendered = term.includes('·') ? `(${term})` : term;
          eq += ` ${c >= 0 ? '+' : '−'} ${fmt(Math.abs(c), 4)}·${rendered}`;
        }
        return eq;
      },

      // ── Prediction ───────────────────────────────────────────
      /** @noagent DOM event handler (prediction inputs); the agent uses predict() */
      setPredictInput(term, text) {
        this.predictInputs = { ...this.predictInputs, [term]: text };
      },

      /** @noagent DOM event handler (prediction button); the agent uses predict() */
      runPrediction() {
        this._showPrediction();
      },

      /**
       * Die Vorhersage für die Werte in predictInputs rechnen und anzeigen.
       * Gerechnet wird nur auf dem gezeigten Ergebnis.
       * @returns {{ linear: number, response: number, ciLower: number|null, ciUpper: number|null }|null} null ohne Ergebnis oder bei fehlender Eingabe
       */
      _showPrediction() {
        this._prediction = null;
        const r = this.result ? this._fit : null;
        if (!r) return null;
        const pred = predictFor(r, this.predictInputs);
        if (!pred) { this.predictResult = null; this.predictError = _t('errorInvalidInput'); return null; }
        const isBinomial = r.family.name === 'binomial';
        const responseLabel = isBinomial ? _t('probability') : _t('expectedCount');
        const confPct = (r.confLevel * 100).toFixed(0);
        this.predictError = null;
        this._prediction = pred;
        this.predictResult = {
          linear: fmt(pred.linear, 6),
          respLabel: responseLabel,
          response: fmt(pred.response, 6),
          ciLabel: `CI ${confPct}%:`,
          ci: pred.ciLower !== null ? `[${fmt(pred.ciLower, 6)}, ${fmt(pred.ciUpper, 6)}]` : EN_DASH,
          ciHint: pred.ciLower !== null ? null : _t('predictCiUnavailable'),
        };
        return pred;
      },

      /**
       * Die Zielgröße für Werte der Terme vorhersagen.
       * @agent
       * @param {object} values je Term aus predictionTerms eine Zahl
       * @returns {{ linear: number, response: number, ciLower: number|null, ciUpper: number|null }|null} null, wenn ein Term ohne Wert bleibt oder kein Ergebnis gezeigt wird
       */
      predict(values) {
        if (values == null || typeof values !== 'object' || Array.isArray(values)) {
          throw new Error(`invalid values ${JSON.stringify(values)}; allowed: an object with one number per term`);
        }
        // Ohne gezeigtes Ergebnis gibt es keine Terme: „nicht bereit“, keine Absage.
        if (!this.result) { this._prediction = null; return null; }
        const terms = this.predictionTerms().map(t => t.label);
        for (const key of Object.keys(values)) {
          requireKnownId('values', key, terms);
          requireNumber(key, values[key]);
        }
        this.predictInputs = {
          ...this.predictInputs,
          ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])),
        };
        // Ein Term ohne Wert ist „nicht bereit“: keine Vorhersage aus alten Eingabewerten.
        if (terms.some(t => !(t in values))) {
          this._prediction = null;
          this.predictResult = null;
          this.predictError = _t('errorInvalidInput');
          return null;
        }
        return this._showPrediction();
      },

      // ── Save as model (models-store WRITE — cross-module) ────
      /**
       * Den gezeigten Fit in die Projektmodelle speichern (neu oder als
       * Aktualisierung des zuletzt gespeicherten). Gibt die id zurück, oder
       * null, wenn kein gezeigter konvergierter Fit vorliegt oder die
       * Zielgröße keine Werte hat.
       * @agent
       * @returns {string|null} die id des gespeicherten Modells, oder null
       */
      saveAsModel() {
        // Gespeichert wird nur, was auch angezeigt wird.
        const r = this.result ? this._fit : null;
        if (!r || !r.converged) return null;
        const sm = this.sm();
        const fd = this.model.buildFitData(sm);
        const { y, xCols, xNames, xIsCat, yName } = fd;
        if (y.length === 0) { module._context.notify(_t('errorTooFew'), 'error'); return null; }

        const factorSpec = xNames.map((name, j) => {
          if (xIsCat[j]) {
            const levels = [...new Set(xCols[j])].sort();
            return { name, kind: 'categorical', levels, reference: levels[0] };
          }
          let lo = Infinity, hi = -Infinity;
          for (const v of xCols[j]) { if (v < lo) lo = v; if (v > hi) hi = v; }
          if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
            return { name, kind: 'continuous', low: -1, high: 1 };
          }
          return { name, kind: 'continuous', low: lo, high: hi };
        });

        const specPredictors = factorSpec.map(f => f.kind === 'categorical'
          ? { id: f.name, kind: 'categorical', levels: f.levels, reference: f.reference }
          : { id: f.name, kind: 'continuous' });

        const columns = xCols.map((vals, j) => ({ values: vals, name: xNames[j], categorical: xIsCat[j] }));
        const { X } = buildGLMDesignMatrix(columns);

        const dataSnapshot = buildDataSnapshot({
          X, y, factorSpec, termSet: [...r.terms], experimentId: null, responseColumn: this.model.yKey,
        });

        const family = {
          name: r.family.name,
          link: r.family.link,
          ...(r.family.theta != null ? { theta: r.family.theta } : {}),
        };

        const record = {
          id: this.model.savedModelId ?? undefined,
          name: this.model.savedModelName || `${yName} — ${_t(`family_${  r.family.name}`)}`,
          experimentId: null,
          responseSpec: { sourceColumn: this.model.yKey, transform: 'identity', aggregateOver: null },
          family,
          terms: [...r.terms],
          termSet: [...r.terms],
          coef: [...r.coefficients],
          vcov: null,
          sigma2: null,
          df: r.n - r.p,
          rSqAdj: r.pseudoR2?.nagelkerke ?? 0,
          lofPValue: null,
          factorSpec,
          spec: { predictors: specPredictors, terms: [] },
          dataSnapshot,
          dataHash: computeDataHash(X, y),
          createdFromInstanceId: module._context.instanceId,
        };

        const id = saveModel(module._context.stateManager, record);
        this.model.savedModelId = id;
        this.model.savedModelName = record.name;
        module._context.notify(_t('modelSaved'), 'success');
        return id;
      },

      // ── Imperative widgets: ColumnPicker + charts ────────────
      /** @noagent lifecycle */
      initPicker() {
        const wrap = module._container.querySelector('[data-ref="picker-cols"]');
        if (!wrap) return;
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'multi',
          ...SLOT_FILTERS.x,
          onChange: (refs) => {
            // Eine veraltete gespeicherte Spalte lehnt setColumns ab: melden
            // und den Wähler auf die X des Models zurückstellen.
            try {
              this.setColumns('x', refs);
            } catch (err) {
              module._context.notify(err?.message ?? String(err), 'error');
              this._picker?.syncValue(this.model.colRefs);
            }
          },
        });
        if (this.model.colRefs.length > 0) this._picker.value = this.model.colRefs;
      },

      /** @noagent lifecycle */
      destroyCharts() {
        for (const ch of this._charts) {
          if (ch && typeof ch.destroy === 'function') { try { ch.destroy(); } catch { /* ignore */ } }
        }
        this._charts = [];
      },

      _whenAnchor(selector, gen, maxFrames = 30) {
        return new Promise((resolve) => {
          const tick = (left) => {
            if (gen !== this._renderGen) { resolve(null); return; }
            const el = module._container?.querySelector(selector);
            if (el) { resolve(el); return; }
            if (left <= 0) { resolve(null); return; }
            requestAnimationFrame(() => tick(left - 1));
          };
          tick(maxFrames);
        });
      },

      /** @noagent chart rendering */
      async renderActiveChart() {
        this.destroyCharts();
        const r = this._fit;
        if (!r || !r.converged) return;
        const gen = this._renderGen;
        switch (this.model.activeTab) {
          case 'diagnostics':
            await this.renderResidualsVsFitted(r, gen);
            await this.renderQQPlot(r, gen);
            await this.renderCooksPlot(r, gen);
            break;
          case 'roc':
            await this.renderROCChart(r, gen);
            break;
          default: break;
        }
      },

      async _mkScatter(selector, gen, config, key) {
        const el = await this._whenAnchor(selector, gen);
        if (!el) return;
        el.replaceChildren();
        this.chartErrors[key] = '';
        const chart = await module._context.chartManager.create(el, 'scatter', config);
        // A failed chart resolves null; chartManager already left its placeholder in `el`.
        if (!chart) return;
        if (gen !== this._renderGen) { try { chart.destroy(); } catch { /* ignore */ } return; }
        this._charts.push(chart);
      },

      /** @noagent chart rendering */
      async renderResidualsVsFitted(r, gen) {
        await this._mkScatter('[data-ref="chart-residuals"]', gen, {
          title: _t('residualsVsFitted'),
          xLabel: _t('fittedValues'),
          yLabel: _t('devianceResiduals'),
          series: [{
            x: r.fittedValues, y: r.devianceResiduals, name: _t('devianceResiduals'),
            color: 'var(--color-chart-1)', markerSize: 5, strokeWidth: 0.75, symbol: 'circle',
          }],
          refLines: [{ dir: 'h', value: 0, dash: 'dash', color: 'var(--color-text-secondary)', width: 1 }],
        }, 'residuals');
      },

      /** @noagent chart rendering */
      async renderQQPlot(r, gen) {
        const sorted = [...r.devianceResiduals].sort((a, b) => a - b);
        const theoretical = normalOrderStats(sorted.length);
        const lo = Math.min(theoretical[0], sorted[0]);
        const hi = Math.max(theoretical[theoretical.length - 1], sorted[sorted.length - 1]);
        await this._mkScatter('[data-ref="chart-qq"]', gen, {
          title: _t('qqTitle'),
          xLabel: _t('theoreticalQuantiles'),
          yLabel: _t('devianceResiduals'),
          series: [
            { x: theoretical, y: sorted, name: _t('devianceResiduals'), color: 'var(--color-chart-1)', markerSize: 5, strokeWidth: 0.75, symbol: 'circle' },
            { x: [lo, hi], y: [lo, hi], name: 'Reference', color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0, connectLine: { show: true, dash: 'dash', width: 1.5, color: 'var(--color-error)', foreground: true } },
          ],
        }, 'qq');
      },

      /** @noagent chart rendering */
      async renderCooksPlot(r, gen) {
        if (!r._cooks) return;
        const indices = r._cooks.map((_, i) => i + 1);
        const threshold = 4 / r.n;
        await this._mkScatter('[data-ref="chart-cooks"]', gen, {
          title: _t('cooksTitle'),
          xLabel: _t('observationNr'),
          yLabel: _t('cooksDistance'),
          yMin: 0,
          series: [{
            x: indices, y: r._cooks, name: _t('cooksDistance'),
            color: 'var(--color-chart-2)', markerSize: 4, strokeWidth: 0.75, symbol: 'circle',
          }],
          refLines: [{ dir: 'h', value: threshold, dash: 'dash', color: 'var(--color-warning)', width: 1.5, label: `4/n = ${threshold.toFixed(4)}` }],
        }, 'cooks');
      },

      /** @noagent chart rendering */
      async renderROCChart(r, gen) {
        if (r.family.name !== 'binomial') return;
        const roc = computeROC(r.y, r.fittedValues, r.priorWeights ?? undefined);
        await this._mkScatter('[data-ref="chart-roc"]', gen, {
          title: `${_t('rocCurve')} (${_t('common.sym.auc')} = ${roc.auc.toFixed(4)})`,
          xLabel: _t('falsePositiveRate'),
          yLabel: _t('truePositiveRate'),
          xMin: 0, xMax: 1, yMin: 0, yMax: 1,
          series: [
            { x: roc.fpr, y: roc.tpr, name: 'ROC', color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0, connectLine: { show: true, dash: 'solid', width: 2, color: 'var(--color-chart-1)', foreground: true } },
            { x: [0, 1], y: [0, 1], name: _t('randomClassifier'), color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0, connectLine: { show: true, dash: 'dash', width: 1.5, color: 'var(--color-text-secondary)' } },
          ],
        }, 'roc');
      },

      // ── Lifecycle ────────────────────────────────────────────
      /** @noagent lifecycle */
      init() {
        const ctx = module._context;

        // Resolve confidence / alpha defaults from app settings on a fresh model.
        const globalConf = (ctx.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
        if (this.model.confLevel == null) this.model.confLevel = globalConf;
        if (this.model.alpha == null) this.model.alpha = Number((1 - globalConf).toFixed(4));

        this._classCutoff = this.model.cutoff;

        this.$nextTick(() => {
          this.initPicker();

          // Restore a persisted slim fit: refit to repopulate residuals / hat /
          // cook arrays so the diagnostic charts have data when the tab opens.
          if (this.model.result && this.model.result._slim) {
            if (this.model.canRun()) {
              try { this.runAnalysis(); } catch { this.showSlimResult(); }
            } else {
              // Worksheet data gone — show the slim summary as legacy did
              // (scalar fields survive slimming; charts simply stay empty).
              this.showSlimResult();
            }
          } else if (this.model.canRun()) {
            this.autoRun();
          }
        });

        const eb = ctx.eventBus;
        const onAct = ({ instanceId }) => {
          if (instanceId === ctx.instanceId && this._picker) this._picker.refresh();
        };
        eb.on('module:activated', onAct);
        this._unsubs.push(() => eb.off('module:activated', onAct));

        // Only refit when a change touches our predictors / response / trials.
        const isOurColumn = (payload) => {
          if (!payload) return true;
          const refs = [...this.model.colRefs];
          if (this.model.yKey) refs.push(keyToRef(this.model.yKey));
          if (this.model.trialsKey) refs.push(keyToRef(this.model.trialsKey));
          return refs.some(r =>
            r && r.instanceId === payload.instanceId &&
            (!payload.sheetId || r.sheetId === payload.sheetId) &&
            (!payload.columnId || r.columnId === payload.columnId));
        };
        const onDataChange = (payload) => {
          if (isPickerFocused(module._container)) return;
          if (isOurColumn(payload)) this.autoRun();
        };
        eb.on('state:saved', onDataChange);
        eb.on('worksheet:dataChanged', onDataChange);
        this._unsubs.push(
          () => eb.off('state:saved', onDataChange),
          () => eb.off('worksheet:dataChanged', onDataChange),
        );

        const onTheme = () => { if (this._fit) { this._renderGen++; this.destroyCharts(); this.$nextTick(() => this.renderActiveChart()); } };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));
      },

      /** @noagent lifecycle */
      destroy() {
        for (const u of this._unsubs) u();
        this._unsubs = [];
        this._renderGen++;
        this.destroyCharts();
        if (this._picker) { try { this._picker.destroy(); } catch { /* ignore */ } this._picker = null; }
      },
    };
  },
});

/**
 * Custom loadExample: GLM examples ship a worksheet snapshot
 * (`sourceWorksheetData`, resolved from `sourceWorksheetFile` by the registry)
 * plus colRefs/yKey/trialsKey using the `__source__` placeholder instanceId.
 * We provision the worksheet (replacing any prior example-provisioned one),
 * rewrite the placeholder refs to the new instance, then apply via setState —
 * which rebuilds the Alpine tree; the init() then refits.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, instanceId) {
      data.colRefs = (data.colRefs || []).map(r =>
        (r && r.instanceId === '__source__') ? { ...r, instanceId } : r);
      if (typeof data.yKey === 'string' && data.yKey.startsWith('__source__|')) {
        data.yKey = data.yKey.replace('__source__', instanceId);
      }
      if (typeof data.trialsKey === 'string' && data.trialsKey.startsWith('__source__|')) {
        data.trialsKey = data.trialsKey.replace('__source__', instanceId);
      }
      // Drop any persisted derived result — the fresh worksheet refits.
      delete data.result;
      return data;
    },
  });
};

export default mod;
