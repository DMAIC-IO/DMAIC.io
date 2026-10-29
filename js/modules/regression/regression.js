/**
 * D.Mike — Regression Analysis Module (regression.js)
 *
 * Improve phase: fits regression models and provides prediction. Migrated to
 * createModule + Alpine CSP. The Model (regression-model.js) holds the
 * persistent configuration + function-stripped fit result(s) + worksheet reads
 * + analysis orchestration. ALL regression statistics stay in
 * `engines/regression-engine.js` — nothing is reimplemented here. View
 * transforms (formatting, i18n, CSS classes, ANOVA/coef/predict view-models)
 * live in the data-Fn; the table/KPI markup is declarative in regression.html.
 * The only imperative widgets are the ColumnPicker and the chartManager charts
 * (sanctioned chart tier) plus the SS-pie composite (POM asserts its markup).
 *
 * Cross-module: `saveAsModel()` writes the fitted polynomial to the
 * project-central models-store (`saveModel`) with the exact legacy record shape
 * so the response-optimization module can reference it.
 *
 * Supports:
 *   - Polynomial (degree 1–3) with all X in one combined model + interactions
 *   - Exponential, Logarithmic, Power (single-X per predictor)
 *
 * @agent  Steuerbar über das Viewmodel: X und Y wählen (setColumns,
 *   setColumn), Typ, Grad, Konfidenz und α setzen (setParam), Terme ein-
 *   und ausschließen (setTerm), einen DoE-Versuch übernehmen
 *   (importExperiment), rechnen (autoRun, runAnalysis), bei Einzel-X-Modellen
 *   das gezeigte wählen (setActiveX) und als Projektmodell speichern
 *   (saveAsModel). Diagramme, Tabs und die Anzeigeschalter bleiben der
 *   Oberfläche vorbehalten; gelesen wird über read() (AgentRead).
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireBoolean, requireEnum, requireKnownId, requireNumber } from '../../core/agent/agent-argcheck.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { finiteOrNull } from '../../core/agent/agent-results.js';
import {
  State, keyToRef, refToKey, predictorsOf, predictAt, REG_TYPES, DEGREES,
} from './regression-model.js';
import {
  regressionCurvePoints, confidenceBand, predictionBand, normalQuantile, predictMulti,
} from '../../engines/regression-engine.js';
import { ColumnPicker, isPickerFocused } from '../../ui/column-picker.js';
import { provisionWorksheet as _provisionWorksheet, removeProvisionedWorksheet as _removeProvisionedWorksheet } from '../../core/examples-registry.js';
import { saveModel, buildDataSnapshot, computeDataHash } from '../../core/models-store.js';
import { getChartColors } from '../../core/chart/chart-core.js';
import { decimalOr } from '../../core/parse-decimal.js';

// ── Glyphs carried over from the legacy innerHTML (kept out of x-text literals
// — Alpine CSP would emit \u-escapes verbatim). ───────────────────────
const EN_DASH = '–';       // –
const Y_HAT = 'Ŷ';         // Ŷ

/** @param {number} v @param {number} d */
function fmt(v, d = 4) {
  if (v == null || !isFinite(v)) return EN_DASH;
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(d);
  return v.toFixed(d);
}
function fmtP(p) { return p < 0.0001 ? '< 0.0001' : p.toFixed(4); }

/** Präfix der Typedef-Sätze; die Kennzahlen hängen ihren Schlüssel an. */
const HELP = 'modules.regression.types.';

/**
 * Die ANOVA-Zerlegung eines Fits als Rohzahlen — Quelle für die Tabelle der
 * Oberfläche und für `read().result.anova`.
 * @param {object|null} r  `model.activeResult`
 * @returns {{ regression: object, terms: object[], error: object, total: object }|null}
 */
function anovaOf(r) {
  if (!r || typeof r.SSR !== 'number') return null;
  const terms = [];
  if (Array.isArray(r.blocks) && r.blocks.length > 0) {
    for (const b of r.blocks) {
      if (b.id === 'Intercept') continue;
      terms.push({ term: b.id, ss: b.ss, df: b.df, ms: b.ms, f: b.fStat, p: b.pValue });
    }
  } else {
    for (const c of (r.coefDetails || [])) {
      if (c.term === 'Intercept' || c.t == null) continue;
      const ss = c.t ** 2 * r.MSE;
      terms.push({ term: c.term, ss, df: 1, ms: ss, f: r.MSE > 0 ? ss / r.MSE : 0, p: c.pval });
    }
  }
  return {
    regression: { ss: r.SSR, df: r.dfReg, ms: r.MSR, f: r.Fstat, p: r.fPVal },
    terms,
    error: { ss: r.SSE, df: r.dfRes, ms: r.MSE },
    total: { ss: r.SST, df: r.dfTot },
  };
}

/** Die vier Parameter, die `setParam` annimmt (flach am Model). */
const PARAM_KEYS = ['regType', 'polyDegree', 'confLevel', 'alpha'];
/** Die Einzelspalten-Slots: die Zielgröße Y. */
const COLUMN_SLOTS = ['y'];
/** Die Mehrfachspalten-Slots: die Einflussgrößen X, geordnet. */
const MULTI_SLOTS = ['x'];
/** Die Spaltentypen beider Slots (dieselben für Wähler, Y-Auswahl und Lesefläche). */
const COLUMN_TYPES = { types: ['numeric', 'currency', 'percent', 'date', 'time'], minCount: 1 };
/** Je Slot der Filter seines Wählers. */
const SLOT_FILTERS = { x: COLUMN_TYPES, y: COLUMN_TYPES };

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

/**
 * Die Schlüsselfläche von `setParam`. Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {'polynomial'|'exponential'|'logarithmic'|'power'} regType  Modellform
 * @property {1|2|3} [polyDegree]  Polynomgrad, nur bei polynomial
 * @property {number} confLevel  Konfidenzniveau als Anteil
 * @property {number} alpha  Signifikanzniveau als Anteil
 */

/**
 * Das gerechnete Ergebnis (`_agentResult()`), wie `read().result` es liefert.
 *
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
 * @typedef {object} DesignNotice
 * @property {AliasedTerm[]} aliased  vermengte Terme
 * @property {string[]} saturated  Terme ohne Restfreiheitsgrad
 */

/**
 * @typedef {object} AliasedTerm
 * @property {string} term  Term
 * @property {string[]} with  vermengt mit
 */

/**
 * Die Agenten-Lesefläche der Regression.
 *
 * Das Ergebnis liegt im Model **und** als Anzeigeobjekt im Viewmodel; nach
 * einem Fehlschlag behält das Model den alten Fit. Die Lesefläche zeigt
 * deshalb nur dann ein Ergebnis, wenn auch die Oberfläche eines zeigt, und
 * nur Zahlen — keine Residuen-, Matrix- oder Vorhersagevektoren.
 *
 * @typedef {object} AgentRead
 * @property {Array<{ instanceId: string, sheetId: string, columnId: string }>} colRefs  the predictor columns X, in order
 * @property {string|null} yKey  the response column Y as key `instanceId|sheetId|columnId`
 * @property {string} regType  one of `regTypes`
 * @property {string[]} regTypes  all regression types
 * @property {number} polyDegree  polynomial degree
 * @property {number[]} activeDegrees  the degrees `setParam('polyDegree')` accepts now
 * @property {number} confLevel  confidence level as a fraction
 * @property {number} alpha  significance level as a fraction
 * @property {string[]} excludedTerms  the terms left out of the polynomial
 * @property {string[]} terms  the term ids `setTerm` accepts now
 * @property {Array<{ key: string, label: string }>} experimentImports  the DoE responses `importExperiment` accepts
 * @property {{ experimentId: string, sourceColumn: string, transform: string }|null} activeImportSource  the DoE response the model came from
 * @property {DesignNotice|null} designNotice  the note left by a DoE preset, null without one
 * @property {string[]} perXKeys  the single-X models `setActiveX` accepts
 * @property {string|null} activeXKey  the single-X model the result shows
 * @property {string[]} activeParams  the keys `setParam` accepts now
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {string[]} activeMultiSlots  the slots `setColumns` accepts
 * @property {object} pickableColumns  per slot the columns `setColumn`/`setColumns` accept, each `{ key, name }`
 * @property {Result|null} result  the fitted model as numbers, null without X or Y or when the fit fails (errorMsg gives the reason)
 * @property {string} errorMsg  the message the module shows, '' without error
 * @property {Array<{ id: string, label: string, kind: string, levels?: string[] }>} predictors  the inputs `predict` takes
 * @property {{ yHat: number, piLow: number|null, piHigh: number|null }|null} prediction  the last prediction, null without one; piLow/piHigh are null where the model gives no prediction interval
 * @property {boolean} canSaveModel  saveAsModel would store a model now
 * @property {string|null} savedModelId  id of the model saved last in the project models
 */
const mod = createModule({
  config: {
    id: 'regression',
    engine: 'alpine',
    phase: 'improve',
    allowedPhases: ['measure', 'analyze', 'improve', 'control'],
    icon: 'module.regression',
    version: '2.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (never persisted) ───────────────
      /** Full result view-model (KPIs/tabs/equation/flags) or null. */
      result: null,
      /** Error message text (plain, may be multi-line). */
      _errorText: '',
      /** Aliased terms from the last failed fit ({ term }), for the exclude buttons. */
      _aliased: [],
      /** Predict inputs view-model (stable objects for x-model). */
      _predictForm: [],
      /** Predict output. */
      _predictText: '',
      _predictInterval: '',
      /** Last prediction { yHat, piLow, piHigh } or null. */
      _prediction: null,
      /** Cached degree availability { n, options }. */
      _degree: { n: 0, options: DEGREES.map(deg => ({ deg, terms: deg === 1 ? 2 : 0, disabled: false })) },
      _picker: null,
      _charts: [],
      _unsubs: [],
      _renderGen: 0,
      /** SS-pie per-item visibility (transient). */
      _ssPieState: null,
      /** SS-pie legend rows (reactive — drives the declarative <template x-for>). */
      ssPieItems: [],
      /** SS-pie transient render context (chart instances + rebuild closures). */
      _ssPie: null,

      /** @noagent helper */
      sm() { return module._context?.stateManager; },

      // ── Agent surface ────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Eingaben, wählbare Mengen und das gerechnete Modell als Zahlen
       */
      read(options) {
        const m = this.model;
        return readAgentState('regression', {
          colRefs: m.colRefs, yKey: m.yKey, regType: m.regType, regTypes: REG_TYPES,
          polyDegree: m.polyDegree, activeDegrees: this.activeDegrees(),
          confLevel: m.confLevel, alpha: m.alpha, excludedTerms: m.excludedTerms,
          terms: this.terms(), experimentImports: this.experimentImports(),
          activeImportSource: m.activeImportSource, designNotice: m.designNotice,
          perXKeys: this.perXKeys(), activeXKey: m.activeXKey,
          activeParams: this.activeParams(), activeColumnSlots: COLUMN_SLOTS,
          activeMultiSlots: MULTI_SLOTS, pickableColumns: this.pickableColumns(),
          result: this.result ? this._agentResult(m.activeResult) : null,
          errorMsg: this._errorText,
          predictors: this.result ? predictorsOf(m.activeResult) : [],
          prediction: this._prediction ?? null,
          canSaveModel: Boolean(this.result?.canSaveModel),
          savedModelId: m.savedModelId,
        }, options);
      },

      /** Das aktive Modell als Zahlenzusammenfassung (ohne Vektoren). */
      _agentResult(r) {
        if (!r) return null;
        const vifByName = {};
        if (Array.isArray(r.vif) && Array.isArray(r.xNames)) {
          r.xNames.forEach((name, i) => { vifByName[name] = r.vif[i] ?? null; });
        }
        const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
        return {
          type: r.multiX || this.model.isPolynomial ? 'polynomial' : this.model.regType,
          equation: r.equation ?? null,
          n: num(r.n), R2: num(r.R2), adjR2: num(r.adjR2), R2pred: num(r.R2pred), Se: num(r.Se),
          Fstat: num(r.Fstat), fPVal: num(r.fPVal), dw: num(r.dw),
          coefficients: (r.coefDetails ?? []).map(c => {
            const term = c.columnName ?? c.term;
            return {
              term, coeff: num(c.coeff), se: num(c.se), t: num(c.t), pval: num(c.pval),
              ciLow: num(c.ciLow), ciHigh: num(c.ciHigh), vif: vifByName[term] ?? null,
            };
          }),
          excludedTerms: [...(r.excludeTerms ?? [])],
          anova: (() => {
            const a = anovaOf(r);
            if (!a) return null;
            const fin = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? finiteOrNull(v) : v]));
            return { regression: fin(a.regression), terms: a.terms.map(fin), error: fin(a.error), total: fin(a.total) };
          })(),
        };
      },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        return this.model.isPolynomial ? PARAM_KEYS : PARAM_KEYS.filter(k => k !== 'polyDegree');
      },
      /** @noagent derived set; der Agent liest sie über read().activeDegrees */
      activeDegrees() { return DEGREES.filter(d => !this.degreeDisabled(d)); },
      /** @noagent derived set; der Agent liest sie über read().terms */
      terms() {
        const r = this.result ? this.model.activeResult : null;
        const fitted = (r?.allTerms ?? []).filter(t => t !== 'Intercept');
        return [...new Set([...fitted, ...this._aliased.map(a => a.term)])];
      },
      /** @noagent derived set; der Agent liest sie über read().experimentImports */
      experimentImports() { return this.importOptions().map(o => ({ key: o.key, label: o.label })); },
      /** @noagent derived set; der Agent liest sie über read().perXKeys */
      perXKeys() { return this.result ? Object.keys(this.model.perXResults ?? {}) : []; },
      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = this.sm();
        if (!sm) return { x: [], y: [] };
        const xKeys = new Set(this.model.colRefs.map(refToKey));
        return {
          x: pickableColumnList(sm, SLOT_FILTERS.x),
          y: pickableColumnList(sm, SLOT_FILTERS.y).filter(c => !xKeys.has(c.key)),
        };
      },
      /** @noagent derived set; der Agent liest sie über read().activeMultiSlots */
      activeMultiSlots() { return MULTI_SLOTS; },

      /**
       * Die Einflussgrößen X ersetzen; die Reihenfolge bleibt, Doppelte zählen
       * einmal. Steht die Zielgröße Y unter den neuen X, wird Y geleert. Danach
       * wird gerechnet; ohne X oder Y wird das Ergebnis verworfen.
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
        this.model.clearDesignPreset();
        this.model.colRefs = clean;
        if (this.model.yKey && clean.some(r => refToKey(r) === this.model.yKey)) this.model.yKey = null;
        this._picker?.syncValue(clean);
        this.refreshDegree();
        this.autoRun();
      },

      /**
       * Die Zielgröße Y setzen oder mit null leeren. Danach wird gerechnet;
       * ohne X oder Y wird das Ergebnis verworfen.
       * @agent
       * @param {'y'} slot der Slot; dieses Modul führt nur `y`
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte (`pickableColumns.y`, ohne die X), oder null zum Leeren
       * @returns {void}
       * @throws {Error} wenn `slot` unbekannt ist oder die Spalte nicht wählbar
       */
      setColumn(slot, ref) {
        requireEnum('slot', slot, COLUMN_SLOTS);
        if (ref != null) requireKnownId('ref', refToKey(ref), this.pickableColumns()[slot].map(c => c.key));
        this.model.clearDesignPreset();
        this.model.yKey = ref == null ? null : refToKey(ref);
        this.refreshDegree();
        this.autoRun();
      },

      /**
       * Einen Parameter setzen und neu rechnen.
       * @agent
       * @param {keyof Params} key welche Option; die im Zustand zulässigen nennt `activeParams`
       * @param {string|number} value der Wert; Bereich je Schlüssel siehe `Params`
       * @returns {void}
       * @throws {Error} wenn `key` jetzt nicht gilt oder `value` außerhalb seiner Menge liegt
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        if (key === 'regType') {
          requireEnum('value', value, REG_TYPES);
          this.model.clearDesignPreset();
          this.model.regType = value;
        } else if (key === 'polyDegree') {
          requireEnum('value', value, this.activeDegrees());
          this.model.clearDesignPreset();
          this.model.polyDegree = value;
        } else {
          this.model[key] = requireFraction(value);
        }
        this.autoRun();
      },

      /**
       * Einen Term des Polynoms ein- oder ausschließen und neu rechnen.
       * @agent
       * @param {string} term eine Term-id aus `terms`
       * @param {boolean} included true schließt den Term ein, false aus
       * @returns {void}
       * @throws {Error} wenn `term` nicht in `terms` steht oder `included` kein Wahrheitswert ist
       */
      setTerm(term, included) {
        requireKnownId('term', term, this.terms());
        requireBoolean('included', included);
        this.model.clearDesignPreset();
        const rest = this.model.excludedTerms.filter(t => t !== term);
        this.model.excludedTerms = included ? rest : [...rest, term];
        this.runAnalysis();
      },

      /**
       * Faktoren und Antwort eines DoE-Versuchs als X und Y übernehmen und
       * rechnen; null löst die Übernahme und lässt die Spalten stehen.
       * @agent
       * @param {string|null} key ein Schlüssel aus `experimentImports`, oder null
       * @returns {void}
       * @throws {Error} wenn `key` nicht in `experimentImports` steht
       */
      importExperiment(key) {
        if (key == null) {
          this.model.activeImportSource = null;
          this.model.clearDesignPreset();
          return;
        }
        requireKnownId('key', key, this.experimentImports().map(o => o.key));
        if (this.model.applyExperimentImport(this.sm(), key)) {
          if (this._picker) this._picker.value = this.model.colRefs;
          this.refreshDegree();
          this.autoRun();
        }
      },

      // ── Number / i18n display helpers ────────────────────────
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
      /** @noagent view transform */
      errorText() { return this._errorText; },

      // ── DoE import options ───────────────────────────────────
      /** @noagent derived set; der Agent liest sie über read().experimentImports */
      importOptions() {
        const sm = this.sm();
        return sm ? this.model.listExperimentImports(sm) : [];
      },

      // ── Column option lists (Y dropdown; not x-model-bound) ──
      /** @noagent derived set; der Agent liest sie über read().pickableColumns.y */
      yOptions() { return this.pickableColumns().y; },

      // ── Selected-info hint ───────────────────────────────────
      /** @noagent view transform */
      selectedInfoText() {
        const xCount = this.model.colRefs.length;
        if (xCount === 0) return _t('selectColumns');
        if (!this.model.yKey) return _t('selectYHint');
        if (xCount === 1) return _t('singleMode');
        return _t('multiMode', { n: xCount });
      },
      /** @noagent view transform */
      selectedInfoClass() {
        const xCount = this.model.colRefs.length;
        return (xCount === 0 || !this.model.yKey) ? 'reg__hint' : 'reg__info';
      },

      // ── Degree options ───────────────────────────────────────
      /** @noagent view transform */
      degreeDisabled(deg) {
        const o = this._degree.options.find(x => x.deg === deg);
        return Boolean(o && o.disabled);
      },
      /** @noagent view transform */
      degreeOptionTitle(deg) {
        const o = this._degree.options.find(x => x.deg === deg);
        if (!o || !o.disabled) return '';
        return _t('degreeDisabledHint', { deg, terms: o.terms, n: this._degree.n });
      },
      /** @noagent view transform */
      degreeHint() {
        const first = this._degree.options.find(o => o.disabled);
        if (!first) return '';
        return _t('degreeDisabledHint', { deg: first.deg, terms: first.terms, n: this._degree.n });
      },
      /** @noagent view transform; die Optionen der Typauswahl (eine Quelle: REG_TYPES) */
      regTypeOptions() {
        return REG_TYPES.map(v => ({ value: v, label: _t(`type${v[0].toUpperCase()}${v.slice(1)}`) }));
      },
      /** @noagent view transform; die Optionen der Gradauswahl (eine Quelle: DEGREES) */
      degreeOptions() {
        return DEGREES.map(d => ({
          value: d, label: _t(`degree${d}`), disabled: this.degreeDisabled(d), title: this.degreeOptionTitle(d),
        }));
      },
      /** @noagent helper */
      refreshDegree() {
        const sm = this.sm();
        if (sm) this._degree = this.model.degreeAvailability(sm);
      },

      // ── Algorithm Lab link ───────────────────────────────────
      /** @noagent navigation */
      algoNavigate(algoId) {
        if (algoId && module._context.eventBus) {
          module._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
        }
      },

      // ── X-selector (per-X single models) ─────────────────────
      /** @noagent view transform */
      xSelectorButtons() {
        if (!this.model.perXResults) return [];
        const keys = Object.keys(this.model.perXResults);
        if (keys.length <= 1) return [];
        return keys.map(key => ({
          key, label: this.model.perXResults[key]._nameX,
          active: key === this.model.activeXKey,
        }));
      },
      /**
       * Bei Einzel-X-Modellen (exponentiell, logarithmisch, Potenz mit
       * mehreren X) das Modell wählen, das `result` zeigt.
       * @agent
       * @param {string} key ein Schlüssel aus `perXKeys`
       * @returns {void}
       * @throws {Error} wenn `key` nicht in `perXKeys` steht
       */
      setActiveX(key) {
        requireKnownId('key', key, this.perXKeys());
        this.model.activeXKey = key;
        this.rebuildResult();
        this.$nextTick(() => this.renderActiveChart());
      },

      // ── ANOVA view-model ─────────────────────────────────────
      /** @noagent view transform */
      anovaHeader: () => 'SS',
      /** @noagent view transform */
      anova() {
        const a = anovaOf(this.model.activeResult);
        if (!a) return { termRows: [] };
        const alpha = this.model.alpha;
        const regSig = a.regression.p < alpha;
        const prefix = this.model.activeResult.blocks?.length > 0 ? 'b' : 'c';
        return {
          regRowClass: regSig ? 'reg__tr--sig' : 'reg__tr--not-sig',
          pSig: regSig ? 'reg__td--sig' : 'reg__td--not-sig',
          ssr: fmt(a.regression.ss), dfReg: a.regression.df, msr: fmt(a.regression.ms),
          fstat: fmt(a.regression.f), fp: fmtP(a.regression.p),
          sse: fmt(a.error.ss), dfRes: a.error.df, mse: fmt(a.error.ms),
          sst: fmt(a.total.ss), dfTot: a.total.df,
          termRows: a.terms.map(row => {
            const hasP = Number.isFinite(row.p);
            const sig = hasP && row.p < alpha;
            return {
              id: `${prefix}-${row.term}`, label: row.term,
              ss: fmt(row.ss), df: row.df, ms: fmt(row.ms), f: fmt(row.f),
              p: hasP ? fmtP(row.p) : EN_DASH,
              pSig: sig ? 'reg__td--sig' : (hasP ? 'reg__td--not-sig' : ''),
              trClass: sig ? 'reg__tr--sig' : (hasP ? 'reg__tr--not-sig' : ''),
            };
          }),
        };
      },

      // ── Coefficient view-model ───────────────────────────────
      /** @noagent view transform */
      coefView() {
        const r = this.model.activeResult;
        if (!r) return { rows: [], canExclude: false, hasDetails: false, hasVIF: false };
        const alpha = this.model.alpha;
        const hasDetails = r.coefDetails[0]?.se != null;
        const hasVIF = Boolean(r.vif && r.vif.length > 0);
        const hasVIFFull = Boolean(r.vifFull && r.vifFull.length > 0);
        const canExclude = Boolean(r.allTerms);
        const excluded = new Set(r.excludeTerms || []);
        const hasBlocks = Array.isArray(r.blockMap) && r.blockMap.length > 0;
        const sortByP = this.model.coefSortByP;

        const vifMap = {}, vifFullMap = {};
        if (hasVIF && r.xNames) for (let i = 0; i < r.xNames.length; i++) vifMap[r.xNames[i]] = r.vif[i];
        if (hasVIFFull && r.xNames) for (let i = 0; i < r.xNames.length; i++) vifFullMap[r.xNames[i]] = r.vifFull[i];

        const detailCells = (c) => {
          const isSig = c?.pval != null && c.pval < alpha;
          const isNotSig = c?.pval != null && !isSig;
          return {
            se: fmt(c?.se), t: fmt(c?.t),
            p: c?.pval != null ? fmtP(c.pval) : EN_DASH,
            pSig: isSig ? 'reg__td--sig' : (isNotSig ? 'reg__td--not-sig' : ''),
            trClass: isNotSig ? 'reg__tr--not-sig' : (isSig ? 'reg__tr--sig' : ''),
          };
        };
        const vifCells = (label) => {
          const v = vifMap[label] ?? null;
          const vf = vifFullMap[label] ?? null;
          const vifClass = v != null && v > 10 ? 'reg__td--not-sig' : (v != null && v > 5 ? 'reg__td--vif-warn' : '');
          const vif = v != null ? fmt(v, 2) : EN_DASH;
          let vifFull = '';
          if (vf != null && v != null && Math.abs(vf - v) > 0.005) vifFull = `(${fmt(vf, 2)})`;
          return { vif, vifFull, vifClass };
        };
        const coefCell = (c) => {
          let ci = '';
          if (hasDetails && c?.ciLow != null && c?.ciHigh != null) ci = `[${fmt(c.ciLow)}, ${fmt(c.ciHigh)}]`;
          return { coef: fmt(c?.coeff), ci };
        };

        const mkRow = (label, c, opts = {}) => {
          const { isIntercept = false, blockTermId = null, indented = false, key } = opts;
          const dc = hasDetails ? detailCells(c) : {};
          const cc = coefCell(c);
          const vc = hasVIF ? vifCells(label) : {};
          return {
            key, label, dataTerm: blockTermId ?? label,
            checked: true, cbDisabled: Boolean(isIntercept || indented), noCheckbox: false,
            trClass: dc.trClass || '', termClass: indented ? 'reg__td--term-indent' : '',
            blockHeader: false,
            coef: cc.coef, ci: cc.ci,
            se: dc.se, t: dc.t, p: dc.p, pSig: dc.pSig,
            vif: vc.vif, vifFull: vc.vifFull, vifClass: vc.vifClass,
          };
        };
        const mkExcluded = (termId) => ({
          key: `ex-${  termId}`, label: termId, dataTerm: termId,
          checked: false, cbDisabled: false, noCheckbox: false,
          trClass: 'reg__tr--excluded', termClass: '', blockHeader: false,
          coef: '', ci: '', se: '', t: '', p: '', pSig: '', vif: '', vifFull: '', vifClass: '',
        });

        const rows = [];

        if (hasBlocks) {
          const coefsByBlock = new Map();
          coefsByBlock.set('Intercept', [r.coefDetails[0]]);
          for (const cd of r.coefDetails.slice(1)) {
            if (!coefsByBlock.has(cd.blockId)) coefsByBlock.set(cd.blockId, []);
            coefsByBlock.get(cd.blockId).push(cd);
          }
          const allTerms = r.allTerms || [];
          const activeGroups = [];
          const excludedGroups = [];
          const blockById = new Map(r.blockMap.map(b => [b.id, b]));
          const blockSummaryById = new Map((r.blocks || []).map(b => [b.id, b]));

          for (const termId of allTerms) {
            if (termId !== 'Intercept' && excluded.has(termId)) { excludedGroups.push({ termId }); continue; }
            const coefs = coefsByBlock.get(termId) || [];
            if (coefs.length === 0) continue;
            if (coefs.length === 1) activeGroups.push({ kind: 'single', termId, coef: coefs[0], isIntercept: termId === 'Intercept' });
            else activeGroups.push({ kind: 'block', termId, coefs, block: blockById.get(termId), summary: blockSummaryById.get(termId) });
          }

          if (sortByP && hasDetails) {
            const sortKey = (g) => {
              if (g.kind === 'single' && g.isIntercept) return -Infinity;
              if (g.kind === 'block') return g.summary?.pValue ?? -1;
              return g.coef?.pval ?? -1;
            };
            activeGroups.sort((a, b) => {
              if (a.kind === 'single' && a.isIntercept) return -1;
              if (b.kind === 'single' && b.isIntercept) return 1;
              return sortKey(b) - sortKey(a);
            });
          }

          for (const g of activeGroups) {
            if (g.kind === 'single') {
              rows.push(mkRow(g.termId, g.coef, { isIntercept: g.isIntercept, key: `s-${  g.termId}` }));
            } else {
              const s = g.summary;
              const sig = s && Number.isFinite(s.pValue) && s.pValue < alpha;
              rows.push({
                key: `bh-${  g.termId}`, label: g.termId, dataTerm: g.termId,
                checked: true, cbDisabled: false, noCheckbox: false,
                trClass: `reg__tr--block ${  sig ? 'reg__tr--sig' : (s && Number.isFinite(s.pValue) ? 'reg__tr--not-sig' : '')}`,
                termClass: 'reg__td--block-header', blockHeader: true,
                blockDf: `df=${  g.block?.df ?? g.coefs.length}`,
                coef: EN_DASH, ci: '',
                se: '', t: s ? fmt(s.fStat) : '',
                p: s && Number.isFinite(s.pValue) ? fmtP(s.pValue) : EN_DASH,
                pSig: sig ? 'reg__td--sig' : (s && Number.isFinite(s.pValue) ? 'reg__td--not-sig' : ''),
                vif: '', vifFull: '', vifClass: '',
              });
              for (const cd of g.coefs) {
                rows.push(mkRow(cd.columnName ?? cd.term, cd, { blockTermId: g.termId, indented: true, key: `sub-${  g.termId  }-${  cd.columnName ?? cd.term}` }));
              }
            }
          }
          for (const g of excludedGroups) rows.push(mkExcluded(g.termId));
        } else {
          const coefMap = new Map(r.coefDetails.map(c => [c.term, c]));
          const allTerms = r.allTerms || r.coefDetails.map(c => c.term);
          const list = allTerms.map(term => ({
            term, isExcluded: excluded.has(term), isIntercept: term === 'Intercept', coef: coefMap.get(term) || null,
          }));
          if (sortByP && hasDetails) {
            list.sort((a, b) => {
              if (a.isIntercept) return -1;
              if (b.isIntercept) return 1;
              if (a.isExcluded !== b.isExcluded) return a.isExcluded ? 1 : -1;
              return (b.coef?.pval ?? -1) - (a.coef?.pval ?? -1);
            });
          }
          for (const row of list) {
            if (row.isExcluded) rows.push(mkExcluded(row.term));
            else rows.push(mkRow(row.term, row.coef, { isIntercept: row.isIntercept, key: `l-${  row.term}` }));
          }
        }

        return { rows, canExclude, hasDetails, hasVIF };
      },

      // ── Build the full result view-model ─────────────────────
      /** @noagent view transform */
      buildResultView(r) {
        const r2class = r.R2 >= 0.8 ? 'dmike-kpi--good' : r.R2 >= 0.5 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
        const r2pVal = r.R2pred ?? null;
        const r2pClass = r2pVal != null ? (r2pVal >= 0.8 ? 'dmike-kpi--good' : r2pVal >= 0.5 ? 'dmike-kpi--warn' : 'dmike-kpi--bad') : '';
        const alpha = this.model.alpha;
        const pClass = r.fPVal < alpha ? 'dmike-kpi--good' : r.fPVal < alpha * 2 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';

        const kpis = [
          { label: _t('common.sym.r2'), value: fmt(r.R2), mod: r2class, tip: _t('tipR2'), help: `${HELP}Result.R2` },
          { label: _t('adjR2'), value: fmt(r.adjR2), mod: r2class, tip: _t('tipAdjR2'), help: `${HELP}Result.adjR2` },
        ];
        if (r2pVal != null) kpis.push({ label: _t('predR2'), value: fmt(r2pVal), mod: r2pClass, tip: _t('tipPredR2'), help: `${HELP}Result.R2pred` });
        kpis.push({ label: _t('stdError'), value: fmt(r.Se), mod: '', tip: _t('tipStdError'), help: `${HELP}Result.Se` });
        kpis.push({ label: _t('fStat'), value: fmt(r.Fstat, 2), mod: '', tip: _t('tipFStat'), help: `${HELP}Result.Fstat` });
        kpis.push({ label: _t('pValueF'), value: fmtP(r.fPVal), mod: pClass, tip: _t('tipPValueF'), help: `${HELP}Result.fPVal` });
        kpis.push({ label: _t('durbinWatson'), value: fmt(r.dw, 3), mod: '', tip: _t('tipDurbinWatson'), help: `${HELP}Result.dw` });

        const isMultiX = r.multiX && r.xCount > 1;
        const tabs = [
          { id: 'scatter', label: isMultiX ? _t('tabActualVsPredicted') : _t('tabRegression') },
          { id: 'residuals', label: _t('tabResiduals') },
          { id: 'order', label: _t('tabOrder') },
          { id: 'qq', label: _t('tabQQ') },
          { id: 'histogram', label: _t('tabHistogram') },
          { id: 'ss-pie', label: _t('tabSSPie') },
        ];
        if (isMultiX) {
          tabs.push({ id: 'main-effects', label: _t('tabMainEffects') });
          tabs.push({ id: 'interaction', label: _t('tabInteraction') });
        }

        return {
          equation: r.equation,
          kpis, tabs,
          canSaveModel: Boolean(r.multiX && this.model.isPolynomial),
        };
      },

      /** @noagent helper; Rebuild transient result view + predict inputs from the active result. */
      rebuildResult() {
        const r = this.model.activeResult;
        if (!r) { this.result = null; this._predictForm = []; this._clearPrediction(); return; }
        this.result = this.buildResultView(r);
        this.buildPredictForm(r);
        // Reset stale active tab if the current tab is not available for this result.
        if (!this.result.tabs.some(tb => tb.id === this.model.activeTab)) {
          this.model.activeTab = 'scatter';
        }
        this._clearPrediction();
      },

      /** @noagent helper; Die angezeigte Vorhersage verwerfen. */
      _clearPrediction() {
        this._predictText = '';
        this._predictInterval = '';
        this._prediction = null;
      },

      // ── Predict inputs ───────────────────────────────────────
      /** @noagent helper */
      buildPredictForm(r) {
        this._predictForm = predictorsOf(r).map(p => ({
          ...p,
          label: p.kind === 'single' ? _t('predictXValue') : p.label,
          value: p.kind === 'categorical' ? ((p.levels && p.levels[0]) || '') : '',
        }));
      },
      /** @noagent view transform */
      predictForm() { return this._predictForm; },
      /** @noagent view transform */
      predictText() { return this._predictText; },
      /** @noagent view transform */
      predictInterval() { return this._predictInterval; },

      /** @noagent DOM event handler; the agent uses predict() */
      onPredictInput() {
        this._showPrediction();
      },

      /**
       * Die Vorhersage für die Werte der Eingabefelder rechnen und anzeigen.
       * @returns {{ yHat: number, piLow: number|null, piHigh: number|null }|null} null bei fehlender Eingabe
       */
      _showPrediction() {
        // Nach einem Fehlschlag hält das Model noch den alten Fit: gerechnet
        // wird nur auf dem gezeigten Ergebnis.
        const r = this.result ? this.model.activeResult : null;
        this._clearPrediction();
        if (!r) return null;

        const values = Object.fromEntries(this._predictForm.map(f => [
          f.id, f.kind === 'categorical' ? (f.value || (f.levels && f.levels[0])) : f.value,
        ]));
        const out = predictAt(r, values);
        if (!out) return null;
        this._prediction = out;
        const parts = this._predictForm.map(f => {
          if (f.kind === 'single') return fmt(parseFloat(f.value), 3);
          const name = r.spec ? f.id : f.label;
          return `${name}=${f.kind === 'categorical' ? values[f.id] : fmt(parseFloat(f.value), 3)}`;
        });
        this._predictText = `${Y_HAT}(${parts.join(', ')}) = ${fmt(out.yHat)}`;
        if (out.piLow != null && out.piHigh != null) {
          this._predictInterval = `${_t('predictionInterval', { level: (r.confLevel * 100).toFixed(0) })}: [${fmt(out.piLow)}, ${fmt(out.piHigh)}]`;
        }
        return out;
      },

      /**
       * Die Zielgröße für Werte der Einflussgrößen vorhersagen.
       * @agent
       * @param {object} values je Prädiktor-id aus predictors ein Wert (Zahl, bei kategorialen Prädiktoren eine Stufe)
       * @returns {{ yHat: number, piLow: number|null, piHigh: number|null }|null} null, wenn ein Prädiktor ohne Wert bleibt oder kein Ergebnis gezeigt wird
       */
      predict(values) {
        if (values == null || typeof values !== 'object' || Array.isArray(values)) {
          throw new Error(`invalid values ${JSON.stringify(values)}; allowed: an object with one value per predictor id`);
        }
        const preds = this.result ? predictorsOf(this.model.activeResult) : [];
        for (const key of Object.keys(values)) requireKnownId('values', key, preds.map(p => p.id));
        for (const p of preds) {
          if (!(p.id in values)) continue;
          if (p.kind === 'categorical') requireEnum(p.id, values[p.id], p.levels);
          else requireNumber(p.id, values[p.id]);
        }
        for (const f of this._predictForm) {
          if (f.id in values) f.value = String(values[f.id]);
        }
        // Ein Prädiktor ohne Wert ist „nicht bereit“: keine Vorhersage aus alten Feldwerten.
        if (preds.some(p => !(p.id in values))) {
          this._clearPrediction();
          return null;
        }
        return this._showPrediction();
      },

      // ── Event handlers ───────────────────────────────────────
      /** @noagent DOM event handler; the agent uses importExperiment() */
      onImportChange(event) {
        const key = event.target.value;
        if (key) this.importExperiment(key);
      },
      /** @noagent DOM event handler; the agent uses setColumn() */
      onYChange(event) {
        this.setColumn('y', event.target.value ? keyToRef(event.target.value) : null);
      },
      /** @noagent DOM event handler; the agent uses setParam() */
      onRegTypeSelect(event) {
        this._selectParam(event, 'regType', event.target.value, () => this.model.regType);
      },
      /** @noagent DOM event handler; the agent uses setParam() */
      onDegreeSelect(event) {
        this._selectParam(event, 'polyDegree', Number(event.target.value), () => this.model.polyDegree);
      },
      /** Eine Auswahl durch setParam; eine Absage stellt die Auswahl auf den Model-Wert zurück. */
      _selectParam(event, key, value, stored) {
        try {
          this.setParam(key, value);
        } catch {
          event.target.value = String(stored());
        }
      },
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
        const v = decimalOr(event.target.value, NaN);
        if (Number.isFinite(v) && v > 0 && v < 100) {
          try { this.setParam(key, v / 100); } catch { /* das Feld zeigt unten wieder den Model-Wert */ }
        }
        event.target.value = Number((this.model[key] * 100).toFixed(2));
      },
      /** @noagent view toggle (Anzeige) */
      toggleCI() { this.model.showCI = !this.model.showCI; this.autoRun(); },
      /** @noagent view toggle (Anzeige) */
      togglePI() { this.model.showPI = !this.model.showPI; this.autoRun(); },
      /** @noagent view toggle (Anzeige) */
      toggleSort() { this.model.coefSortByP = !this.model.coefSortByP; },
      /** @noagent DOM event handler; the agent uses setTerm() */
      toggleTerm(term, event) {
        this.setTerm(term, Boolean(event.target.checked));
      },

      /** @noagent view transform; Localised lines of the design-term preset notice (CSP-safe). */
      designNoticeLines() {
        const n = this.model.designNotice;
        if (!n) return [];
        const lines = n.aliased.map(a => _t('designNoticeAliased', { term: a.term, with: a.with.join(', ') }));
        if (n.saturated.length > 0) lines.push(_t('designNoticeSaturated', { terms: n.saturated.join(', ') }));
        return lines;
      },
      /** @noagent view transform */
      hasDesignNotice() { return this.designNoticeLines().length > 0; },
      /** @noagent view transform; Aliased terms from the last failed fit, for the exclude buttons. */
      aliasedRows() { return this._aliased; },
      /** @noagent DOM event handler; the agent uses setTerm() */
      excludeAliased(term) { this.setTerm(term, false); },

      // ── Auto-run gate ────────────────────────────────────────
      /**
       * Rechnet, wenn X und Y gewählt sind, sonst verwirft es das Ergebnis.
       * @agent
       * @returns {void}
       */
      autoRun() {
        if (this.model.colRefs.length === 0 || !this.model.yKey) {
          if (this.model.result || this.model.perXResults) {
            this.model.clearResults();
            this.result = null;
            this._clearPrediction();
            this._errorText = '';
            this._renderGen++;
            this.destroyCharts();
          }
          return;
        }
        this.runAnalysis();
      },

      /**
       * Das Modell mit den aktuellen Eingaben rechnen. Schlägt der Fit fehl,
       * ist `result` null und `errorMsg` nennt den Grund; bei Aliasing nennt
       * `terms` die Terme, die `setTerm` dann ausschließen kann.
       * @agent
       * @returns {void}
       */
      runAnalysis() {
        const sm = this.sm();
        if (!sm) return;
        this._renderGen++;
        this.destroyCharts();
        this._errorText = '';
        this._aliased = [];

        const res = this.model.runAnalysis(sm);
        if (!res.ok) {
          if (res.errors && res.errors.length > 0) {
            this._errorText = res.errors.map(e => this.formatPerXError(e)).join('\n');
          } else if (res.errorKey) {
            this._errorText = _t(res.errorKey, res.errorParams || undefined);
            this._aliased = Array.isArray(res.aliased) ? res.aliased.map(a => ({ term: a.term })) : [];
          }
          this.result = null;
          this._clearPrediction();
          return;
        }
        // Per-X path may carry partial errors alongside a result.
        if (res.errors && res.errors.length > 0) {
          this._errorText = res.errors.map(e => this.formatPerXError(e)).join('\n');
        }
        this.rebuildResult();
        this.$nextTick(() => this.renderActiveChart());
      },

      /** @noagent view transform */
      formatPerXError(e) {
        return `${e.name  }: ${  _t(e.key, e.params || undefined)}`;
      },

      // ── Save as model (models-store WRITE — cross-module) ────
      /**
       * Speichert das Polynommodell (ein oder mehrere X) in die Projektmodelle (neu
       * oder als Aktualisierung des zuletzt gespeicherten). Gibt die id zurück,
       * oder null, wenn kein speicherbares Modell vorliegt (`read().canSaveModel`).
       * @agent
       * @returns {string|null} die id des gespeicherten Modells, oder null
       */
      saveAsModel() {
        const r = this.model.result;
        // Nach einem Fehlschlag hält das Model noch den alten Fit; gespeichert
        // wird nur, was auch angezeigt wird (dieselbe Bedingung wie canSaveModel).
        if (!this.result?.canSaveModel || !r || !r.multiX || !this.model.isPolynomial) return null;
        const sm = this.sm();
        const m = this.model;

        const xCols = m.colRefs.map(ref => m.getRawNumericValues(sm, ref));
        const yRaw = m.getRawNumericValues(sm, keyToRef(m.yKey));
        const n = Math.min(yRaw.length, ...xCols.map(c => c.length));
        const X = [], y = [];
        const originalToFiltered = new Map();
        for (let i = 0; i < n; i++) {
          if (yRaw[i] == null) continue;
          const row = xCols.map(c => c[i]);
          if (row.some(v => v == null)) continue;
          originalToFiltered.set(i, y.length);
          X.push(row); y.push(yRaw[i]);
        }

        const xNames = m.colRefs.map(ref => m.columnDisplayName(sm, ref));
        const yName = m.columnDisplayName(sm, keyToRef(m.yKey));
        const factorSpec = xNames.map((name, j) => {
          let lo = Infinity, hi = -Infinity;
          for (const row of X) { const v = row[j]; if (v < lo) lo = v; if (v > hi) hi = v; }
          if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return { name, low: -1, high: 1 };
          return { name, low: lo, high: hi };
        });

        const dataSnapshot = buildDataSnapshot({
          X, y, factorSpec,
          termSet: r._termNames ? [...r._termNames] : [],
          experimentId: m.activeImportSource?.experimentId ?? null,
          responseColumn: m.activeImportSource?.sourceColumn ?? m.yKey,
        });

        const lofPValue = m.computeLoFPValue(sm, r, y, originalToFiltered);
        const specSnapshot = r.spec ? JSON.parse(JSON.stringify(r.spec)) : null;

        const record = {
          id: m.savedModelId ?? undefined,
          name: m.savedModelName || `${yName} — Modell`,
          experimentId: m.activeImportSource?.experimentId ?? null,
          responseSpec: {
            sourceColumn: m.activeImportSource?.sourceColumn ?? m.yKey,
            transform: m.activeImportSource?.transform ?? 'identity',
            aggregateOver: null,
          },
          termSet: r._termNames ? [...r._termNames] : [],
          coef: r._coefficients ?? null,
          vcov: null,
          sigma2: r.Se != null ? r.Se * r.Se : null,
          df: r.df ?? null,
          rSqAdj: r.adjR2 ?? null,
          lofPValue,
          factorSpec,
          spec: specSnapshot,
          dataSnapshot,
          dataHash: computeDataHash(X, y),
          createdFromInstanceId: module._context.instanceId,
        };

        const id = saveModel(sm, record);
        m.savedModelId = id;
        m.savedModelName = record.name;
        module._context.notify(_t('modelSaved'), 'success');
        return id;
      },

      // ── Imperative widgets: ColumnPicker ─────────────────────
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

      // ── Charts ───────────────────────────────────────────────
      /** @noagent lifecycle */
      destroyCharts() {
        for (const ch of this._charts) {
          if (ch && typeof ch.destroy === 'function') { try { ch.destroy(); } catch { /* ignore */ } }
        }
        this._charts = [];
        // Drop the stale SS-pie chart handles; the declarative legend keeps its
        // last items until the next renderSSPieChart re-populates them.
        this._ssPie = null;
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
        const r = this.model.activeResult;
        if (!r) return;
        const gen = this._renderGen;
        switch (this.model.activeTab) {
          case 'scatter': await this.renderScatterChart(r, gen); break;
          case 'residuals': await this.renderResidualChart(r, gen); break;
          case 'order': await this.renderOrderChart(r, gen); break;
          case 'qq': await this.renderQQChart(r, gen); break;
          case 'histogram': await this.renderHistogramChart(r, gen); break;
          case 'ss-pie': await this.renderSSPieChart(r, gen); break;
          case 'main-effects': await this.renderMainEffectsChart(r, gen); break;
          case 'interaction': await this.renderInteractionChart(r, gen); break;
        }
      },

      async _create(el, type, config, gen) {
        const keyed = config.editKey ? config : { editKey: `${this.model.activeTab}:${type}`, ...config };
        const chart = await module._context.chartManager.create(el, type, keyed);
        if (!chart) return null;
        if (gen !== this._renderGen) { try { chart.destroy(); } catch { /* ignore */ } return null; }
        this._charts.push(chart);
        return chart;
      },

      /** @noagent chart rendering */
      async renderScatterChart(r, gen) {
        const plotEl = await this._whenAnchor('[data-ref="chart-scatter"]', gen);
        if (!plotEl) return;
        plotEl.replaceChildren();

        if (r.multiX && r.xCount > 1) {
          const nameY = r._nameY || 'Y';
          await this._create(plotEl, 'scatter', {
            title: _t('tabActualVsPredicted'),
            xLabel: `${nameY} (${_t('fittedValues')})`,
            yLabel: `${nameY} (${_t('dataPoints')})`,
            showLegend: true,
            series: [
              {
                name: '', color: 'rgba(0,0,0,0)', markerSize: 0,
                x: [Math.min(...r.yHat, ...r.ys), Math.max(...r.yHat, ...r.ys)],
                y: [Math.min(...r.yHat, ...r.ys), Math.max(...r.yHat, ...r.ys)],
                connectLine: { show: true, dash: 'dash', width: 1.5, color: 'var(--color-chart-2)' },
                hideLegend: true,
              },
              {
                name: _t('dataPoints'), color: 'var(--color-chart-1)', markerSize: 4, strokeWidth: 0.75,
                x: r.yHat, y: r.ys, symbol: 'circle',
              },
            ],
          }, gen);
          return;
        }

        const nameX = r._nameX || (r._xNames ? r._xNames[0] : 'X');
        const nameY = r._nameY || 'Y';
        const xs = r.multiX ? r.xMatrix[0] : r.xs;
        const ys = r.ys;
        const series = [{
          name: _t('dataPoints'), color: 'var(--color-chart-1)', markerSize: 4, strokeWidth: 0.75,
          x: xs, y: ys, symbol: 'circle',
        }];

        const curvePts = regressionCurvePoints(r);
        if (curvePts.length > 0) {
          series.push({
            name: _t('regressionLine'), color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0,
            x: curvePts.map(p => p.x), y: curvePts.map(p => p.y),
            connectLine: { show: true, dash: 'solid', width: 2, color: 'var(--color-error)', foreground: true },
          });
          if (this.model.showCI && r.multiX) {
            const upper = [], lower = [];
            for (const pt of curvePts) {
              const band = confidenceBand(r, pt.x);
              if (band) { upper.push({ x: pt.x, y: band.upper }); lower.push({ x: pt.x, y: band.lower }); }
            }
            if (upper.length > 0) {
              series.push({ name: `CI ${(r.confLevel * 100).toFixed(0)}%`, color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0, x: upper.map(p => p.x), y: upper.map(p => p.y), connectLine: { show: true, dash: 'dash', width: 1.2, color: 'var(--color-chart-2)' } });
              series.push({ name: '', color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0, x: lower.map(p => p.x), y: lower.map(p => p.y), connectLine: { show: true, dash: 'dash', width: 1.2, color: 'var(--color-chart-2)' }, hideLegend: true });
            }
          }
          if (this.model.showPI && r.multiX) {
            const upper = [], lower = [];
            for (const pt of curvePts) {
              const band = predictionBand(r, pt.x);
              if (band) { upper.push({ x: pt.x, y: band.upper }); lower.push({ x: pt.x, y: band.lower }); }
            }
            if (upper.length > 0) {
              series.push({ name: `PI ${(r.confLevel * 100).toFixed(0)}%`, color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0, x: upper.map(p => p.x), y: upper.map(p => p.y), connectLine: { show: true, dash: 'dot', width: 1.2, color: 'var(--color-chart-4)' } });
              series.push({ name: '', color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0, x: lower.map(p => p.x), y: lower.map(p => p.y), connectLine: { show: true, dash: 'dot', width: 1.2, color: 'var(--color-chart-4)' }, hideLegend: true });
            }
          }
        }

        await this._create(plotEl, 'scatter', {
          title: `${nameX} → ${nameY}`, xLabel: nameX, yLabel: nameY, showLegend: true, series,
        }, gen);
      },

      /** @noagent chart rendering */
      async renderResidualChart(r, gen) {
        const plotEl = await this._whenAnchor('[data-ref="chart-residuals"]', gen);
        if (!plotEl) return;
        plotEl.replaceChildren();
        await this._create(plotEl, 'scatter', {
          title: _t('residualsVsFitted'), xLabel: _t('fittedValues'), yLabel: _t('residuals'), showLegend: false,
          refLines: [{ dir: 'h', value: 0, dash: 'dash', width: 1, color: 'var(--color-error)', label: '0' }],
          series: [{ name: _t('residuals'), color: 'var(--color-chart-3)', markerSize: 4, strokeWidth: 0.75, x: r.yHat, y: r.residuals, symbol: 'circle' }],
        }, gen);
      },

      /** @noagent chart rendering */
      async renderOrderChart(r, gen) {
        const plotEl = await this._whenAnchor('[data-ref="chart-order"]', gen);
        if (!plotEl) return;
        plotEl.replaceChildren();
        const indices = r.residuals.map((_, i) => i + 1);
        await this._create(plotEl, 'scatter', {
          title: _t('residualsVsOrder'), xLabel: _t('observationNr'), yLabel: _t('residuals'), showLegend: false,
          refLines: [{ dir: 'h', value: 0, dash: 'dash', width: 1, color: 'var(--color-error)', label: '0' }],
          series: [{ name: _t('residuals'), color: 'var(--color-chart-4)', markerSize: 4, strokeWidth: 0.75, x: indices, y: r.residuals, symbol: 'circle', connectLine: { show: true, dash: 'solid', width: 1, color: 'var(--color-chart-4)' } }],
        }, gen);
      },

      /** @noagent chart rendering */
      async renderQQChart(r, gen) {
        const plotEl = await this._whenAnchor('[data-ref="chart-qq"]', gen);
        if (!plotEl) return;
        plotEl.replaceChildren();
        const sorted = [...r.residuals].sort((a, b) => a - b);
        const n = sorted.length;
        const resMean = sorted.reduce((s, v) => s + v, 0) / n;
        const resStd = Math.sqrt(sorted.reduce((s, v) => s + (v - resMean) ** 2, 0) / (n - 1));
        const theoretical = sorted.map((_, i) => normalQuantile((i + 0.5) / n));
        const standardized = sorted.map(v => resStd > 0 ? (v - resMean) / resStd : 0);
        const lo = Math.min(Math.min(...theoretical), Math.min(...standardized));
        const hi = Math.max(Math.max(...theoretical), Math.max(...standardized));
        await this._create(plotEl, 'scatter', {
          title: _t('qqTitle'), xLabel: _t('theoreticalQuantiles'), yLabel: _t('standardizedResiduals'), showLegend: false,
          series: [
            { name: '', color: 'rgba(0,0,0,0)', markerSize: 0, x: [lo, hi], y: [lo, hi], connectLine: { show: true, dash: 'dash', width: 1.5, color: 'var(--color-chart-2)' }, hideLegend: true },
            { name: _t('residuals'), color: 'var(--color-chart-5)', markerSize: 4, strokeWidth: 0.75, x: theoretical, y: standardized, symbol: 'circle' },
          ],
        }, gen);
      },

      /** @noagent chart rendering */
      async renderHistogramChart(r, gen) {
        const plotEl = await this._whenAnchor('[data-ref="chart-histogram"]', gen);
        if (!plotEl) return;
        plotEl.replaceChildren();
        await this._create(plotEl, 'histogram', {
          title: _t('histTitle'), xLabel: _t('residuals'), yLabel: _t('frequency'), showLegend: false, showNormalCurve: true, data: r.residuals,
        }, gen);
      },

      /** @noagent chart rendering */
      async renderSSPieChart(r, gen) {
        const items = [];
        const coefs = r.coefDetails || [];
        for (let j = 0; j < coefs.length; j++) {
          const c = coefs[j];
          if (c.term === 'Intercept') continue;
          const ss = c.t != null ? c.t ** 2 * r.MSE : 0;
          items.push({ label: c.term, ss });
        }
        items.push({ label: _t('sourceResiduals'), ss: r.SSE });

        const colors = getChartColors();
        if (!this._ssPieState || this._ssPieState.length !== items.length) this._ssPieState = items.map(() => true);

        const fmtNum = (v) => v.toLocaleString(module._context.language === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: 2 });

        // Legend rows are rendered declaratively by the Alpine template
        // (regression.html → <template x-for="(item, i) in ssPieItems">).
        // Each row carries pre-formatted RAW text (x-text escapes structurally),
        // the swatch colour and the checkbox state.
        this.ssPieItems = items.map((it, i) => ({
          label: it.label,
          val: fmtNum(it.ss),
          color: colors[i % colors.length],
          checked: this._ssPieState[i],
        }));

        const buildSlices = () => items.map((it, i) => ({ name: it.label, value: it.ss, color: colors[i % colors.length] })).filter((_, i) => this._ssPieState[i]);
        const buildBarConfig = () => {
          const visible = items.map((it, i) => ({ it, color: colors[i % colors.length], visible: this._ssPieState[i] })).filter(v => v.visible).sort((a, b) => b.it.ss - a.it.ss);
          return {
            categories: visible.map(v => v.it.label),
            groups: [{ name: _t('ssLabel'), values: visible.map(v => v.it.ss), colors: visible.map(v => v.color) }],
            yLabel: _t('ssLabel'), showLegend: false, categoryGap: 0.35,
          };
        };

        // The pie + bar charts stay imperative chartManager mounts into the
        // templated [data-ref] hosts (sanctioned chart tier). The hosts live
        // inside the ss-pie tab's x-if block — resolve via the bounded rAF-poll.
        const chartEl = await this._whenAnchor('[data-ref="ss-pie-chart"]', gen);
        if (!chartEl) return;
        chartEl.replaceChildren();
        const barEl = module._container.querySelector('[data-ref="ss-pie-bars"]');
        if (!barEl) return;
        barEl.replaceChildren();

        const chart = await this._create(chartEl, 'pie', { slices: buildSlices(), showLegend: false, showTitle: false }, gen);
        const barChart = await this._create(barEl, 'bar', buildBarConfig(), gen);
        if (!chart || !barChart) return;

        // Stash the live chart instances + rebuild closures so the declarative
        // legend's @change handler (toggleSSPie) can re-plot.
        this._ssPie = { chart, barChart, buildSlices, buildBarConfig };
      },

      /**
       * @noagent view toggle (Diagramm)
       * SS-pie legend checkbox @change handler — toggles a term's visibility
       * and re-plots the pie + bar charts. Replaces the legacy post-render
       * addEventListener delegate.
       * @param {number} i legend item index
       * @param {Event} event
       */
      toggleSSPie(i, event) {
        const checked = event && event.target ? event.target.checked : !this._ssPieState[i];
        this._ssPieState[i] = checked;
        if (this.ssPieItems[i]) this.ssPieItems[i].checked = checked;
        if (!this._ssPie) return;
        module._context.chartManager.update(this._ssPie.chart, { slices: this._ssPie.buildSlices() });
        module._context.chartManager.update(this._ssPie.barChart, this._ssPie.buildBarConfig());
      },

      _getXMeans(r) { return r.xMatrix.map(col => col.reduce((s, v) => s + v, 0) / col.length); },
      _getActivePredictorIndices(r) {
        const excluded = new Set(r.excludeTerms || []);
        const xNames = r._xNames || [];
        const allTerms = r.allTerms || [];
        const active = [];
        for (let xi = 0; xi < xNames.length; xi++) {
          const name = xNames[xi];
          const hasActive = allTerms.some(term => term !== 'Intercept' && term.includes(name) && !excluded.has(term));
          if (hasActive) active.push(xi);
        }
        return active;
      },
      _getInteractionPredictorIndices(r) {
        const excluded = new Set(r.excludeTerms || []);
        const xNames = r._xNames || [];
        const allTerms = r.allTerms || [];
        const result = new Set();
        for (const term of allTerms) {
          if (term === 'Intercept' || excluded.has(term)) continue;
          if (!term.includes('·')) continue;
          for (let xi = 0; xi < xNames.length; xi++) if (term.includes(xNames[xi])) result.add(xi);
        }
        return result;
      },

      /** @noagent chart rendering */
      async renderMainEffectsChart(r, gen) {
        const plotEl = await this._whenAnchor('[data-ref="chart-main-effects"]', gen);
        if (!plotEl || !r.multiX) return;
        plotEl.replaceChildren();
        const xMeans = this._getXMeans(r);
        const yMean = r.ys.reduce((s, v) => s + v, 0) / r.ys.length;
        const xNames = r._xNames || [];
        const STEPS = 50;
        const activeIndices = new Set(this._getActivePredictorIndices(r));
        const interactionIndices = this._getInteractionPredictorIndices(r);
        const grid = document.createElement('div');
        grid.className = 'reg__effects-grid';
        plotEl.appendChild(grid);
        for (let xi = 0; xi < r.xCount; xi++) {
          if (!activeIndices.has(xi)) continue;
          if (interactionIndices.has(xi)) continue;
          const col = r.xMatrix[xi];
          const xMin = Math.min(...col), xMax = Math.max(...col);
          const step = (xMax - xMin) / (STEPS - 1);
          const lineX = [], lineY = [];
          for (let s = 0; s < STEPS; s++) {
            const xVal = xMin + s * step;
            const xVals = [...xMeans]; xVals[xi] = xVal;
            const pred = predictMulti(r, xVals);
            lineX.push(xVal); lineY.push(pred.yHat);
          }
          const cell = document.createElement('div');
          cell.className = 'reg__effects-cell';
          grid.appendChild(cell);
          await this._create(cell, 'scatter', {
            title: xNames[xi] || `X${xi + 1}`, xLabel: xNames[xi] || `X${xi + 1}`, yLabel: _t('meanResponse'),
            titleSize: 13, labelSize: 11, tickSize: 10, showLegend: false,
            refLines: [{ dir: 'h', value: yMean, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)', label: '' }],
            series: [{ name: xNames[xi], color: 'var(--color-chart-1)', markerSize: 0, x: lineX, y: lineY, connectLine: { show: true, dash: 'solid', width: 2.5, color: 'var(--color-chart-1)' } }],
          }, gen);
        }
      },

      /** @noagent chart rendering */
      async renderInteractionChart(r, gen) {
        const plotEl = await this._whenAnchor('[data-ref="chart-interaction"]', gen);
        if (!plotEl || !r.multiX || r.xCount < 2) return;
        plotEl.replaceChildren();
        const xMeans = this._getXMeans(r);
        const xNames = r._xNames || [];
        const STEPS = 50;
        const levelColors = ['var(--color-chart-1)', 'var(--color-chart-3)', 'var(--color-error)'];
        const activeIndices = new Set(this._getActivePredictorIndices(r));
        const grid = document.createElement('div');
        grid.className = 'reg__effects-grid';
        plotEl.appendChild(grid);
        for (let i = 0; i < r.xCount; i++) {
          if (!activeIndices.has(i)) continue;
          for (let j = 0; j < r.xCount; j++) {
            if (i === j) continue;
            if (!activeIndices.has(j)) continue;
            const colI = r.xMatrix[i], colJ = r.xMatrix[j];
            const xiMin = Math.min(...colI), xiMax = Math.max(...colI);
            const xjMin = Math.min(...colJ), xjMean = xMeans[j], xjMax = Math.max(...colJ);
            const step = (xiMax - xiMin) / (STEPS - 1);
            const levels = [
              { val: xjMin, label: `${xNames[j]} ${_t('levelLow')}` },
              { val: xjMean, label: `${xNames[j]} ${_t('levelMid')}` },
              { val: xjMax, label: `${xNames[j]} ${_t('levelHigh')}` },
            ];
            const series = levels.map((lev, li) => {
              const lineX = [], lineY = [];
              for (let s = 0; s < STEPS; s++) {
                const xVal = xiMin + s * step;
                const xVals = [...xMeans]; xVals[i] = xVal; xVals[j] = lev.val;
                const pred = predictMulti(r, xVals);
                lineX.push(xVal); lineY.push(pred.yHat);
              }
              return { name: lev.label, color: levelColors[li], markerSize: 0, x: lineX, y: lineY, connectLine: { show: true, dash: 'solid', width: 2, color: levelColors[li] } };
            });
            const cell = document.createElement('div');
            cell.className = 'reg__effects-cell';
            grid.appendChild(cell);
            await this._create(cell, 'scatter', {
              title: `${xNames[i]} × ${xNames[j]}`, xLabel: xNames[i], yLabel: _t('meanResponse'),
              titleSize: 13, labelSize: 11, tickSize: 10, showLegend: true, series,
            }, gen);
          }
        }
      },

      // ── Lifecycle ────────────────────────────────────────────
      /** @noagent lifecycle */
      init() {
        const ctx = module._context;
        const globalConf = (ctx.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
        if (this.model.confLevel == null) this.model.confLevel = globalConf;
        if (this.model.alpha == null) this.model.alpha = Number((1 - globalConf).toFixed(4));

        this.$nextTick(() => {
          this.initPicker();
          this.refreshDegree();
          if (this.model.activeResult) {
            this.rebuildResult();
            this.$nextTick(() => this.renderActiveChart());
          } else {
            // Fresh hand-off (DOE transfer, example) arrives without a result.
            this.autoRun();
          }
        });

        const eb = ctx.eventBus;
        const onAct = ({ instanceId }) => {
          if (instanceId === ctx.instanceId && this._picker) this._picker.refresh();
        };
        eb.on('module:activated', onAct);
        this._unsubs.push(() => eb.off('module:activated', onAct));

        const onDataChange = () => {
          if (isPickerFocused(module._container)) return;
          this.refreshDegree();
          this.autoRun();
        };
        eb.on('state:saved', onDataChange);
        eb.on('worksheet:dataChanged', onDataChange);
        this._unsubs.push(
          () => eb.off('state:saved', onDataChange),
          () => eb.off('worksheet:dataChanged', onDataChange),
        );

        const onTheme = () => {
          if (this.model.activeResult) { this._renderGen++; this.destroyCharts(); this.$nextTick(() => this.renderActiveChart()); }
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

      },

      /**
       * Generic route hook — called by createModule whenever this instance is
       * the routed one and the route sub-path changes.
       *
       * Adopts the sub-path head as the active tab when it names a real,
       * currently-available tab. Empty sub ⇒ keep the persisted activeTab.
       *
       * @param {string[]} sub  Route sub-path array from the route store.
       * @noagent navigation
       */
      onRouteChanged(sub) {
        const key = Array.isArray(sub) && sub.length > 0 ? sub[0] : null;
        if (!key || key === this.model.activeTab) return;
        // Guard against navigating to a tab the current result doesn't expose.
        if (this.result?.tabs && !this.result.tabs.some(tb => tb.id === key)) return;
        this._renderGen++;
        this.destroyCharts();
        this.model.activeTab = key;
        this.$nextTick(() => this.renderActiveChart());
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
 * Custom loadExample: regression examples ship a worksheet snapshot
 * (`sourceWorksheetData`) plus colRefs/yKey using the `__source__` placeholder
 * instanceId. We provision the worksheet (replacing any prior example-provisioned
 * one), rewrite the placeholder refs to the new instance, then apply via
 * setState — which rebuilds the Alpine tree; init() then re-runs the analysis.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = async function loadExample(payload) {
  if (!payload || !payload.data) return;
  const ctx = this._context;
  const t = (k) => ctx.i18n.t(k);

  const curJson = this.getState();
  const cur = curJson ? State.fromJSON(curJson) : null;
  const hasContent = cur ? cur.hasContent() : false;
  if (hasContent && ctx?.dialog) {
    const ok = await ctx.dialog.confirm({ message: t('moduleHelp.confirmOverwrite'), danger: true });
    if (!ok) return;
  }

  const data = { ...payload.data };
  // Carry forward the example-worksheet id so we can remove the old sheet.
  const prevExampleWs = cur?.exampleWorksheetId ?? null;

  if (data.sourceWorksheetData) {
    const wsState = data.sourceWorksheetData;
    delete data.sourceWorksheetData;
    if (prevExampleWs) _removeProvisionedWorksheet(ctx, prevExampleWs);
    const ref = _provisionWorksheet(ctx, wsState);
    if (ref) {
      data.exampleWorksheetId = ref.instanceId;
      data.colRefs = (data.colRefs || []).map(r =>
        r?.instanceId === '__source__' ? { ...r, instanceId: ref.instanceId } : r);
      if (typeof data.yKey === 'string' && data.yKey.startsWith('__source__|')) {
        data.yKey = data.yKey.replace('__source__', ref.instanceId);
      }
    }
  }
  // Drop any persisted derived result — the fresh worksheet refits.
  delete data.result;
  delete data.perXResults;

  this.setState(data);
  ctx.stateManager.setModuleState(ctx.instanceId, this.getState());

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  ctx.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
};

export default mod;
