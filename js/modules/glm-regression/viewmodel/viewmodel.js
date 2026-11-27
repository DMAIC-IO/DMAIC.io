/**
 * D.Mike — GLM-Regression: Viewmodel.
 *
 * Eingaben, Prüfungen und Ableitungen liegen im Model (domain/); die
 * Agentenfläche entsteht aus dessen Schema. X, Y, Versuchszahl und Schwelle
 * binden mit `x-field`, Verfahren und Reiter mit `x-set`. Hier bleiben die
 * Anzeige in der App-Sprache (Zusammenfassung, Kennzahlen, Tabellen,
 * Diagrammkonfiguration), die Handler der Prozentfelder (Prozenttext →
 * Anteil über die gekoppelten Kommandos), die Prognose (flüchtig wie in der
 * Altform: UI-State und das Viewmodel-Kommando `predict`), `swapSuccess`
 * (braucht die Stufen des Fits, die ein Model-Kommando nicht kennt), der Lauf
 * `saveAsModel` (Momentaufnahme ins eigene Model) und das Leeren von Y bzw.
 * der Versuchszahl, wenn sie unter die X bzw. auf Y geraten.
 */
import { createModule } from '../../../core/template-module.js';
import { asyncTask } from '../../../core/async-task.js';
import { command, map, text, cell, object, number, setFields } from '../../../core/model.js';
import { markRejection, clearRejection } from '../../../core/param-input.js';
import { formatNumber, parseNumber, roundTo } from '../../../core/number-format.js';
import { requireEnum } from '../../../core/validate.js';
import { uid } from '../../../core/uid.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { analyze, predictFor, equationOf, warningsOf, warningText } from '../domain/analyze.js';
import { refKey } from '../domain/columns.js';
import { buildRecord } from '../domain/record.js';
import { UiState } from './state.js';
import {
  summaryOf, kpisOf, qualityOf, coefView, vifRows, overdispersionView, classView, predictView, fmt,
} from './present.js';
import { residualsConfig, qqConfig, cooksConfig, rocConfig } from './charts.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */

/** Alle Reiter (gleich dem Literal von `activeTab` im Schema). */
const TABS = /** @type {readonly string[]} */ (State.schema.view.activeTab.values);

/** @param {any} v @returns {any} eine schlichte Kopie */
const plain = (v) => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));

/**
 * Schlüssel eines Bezugs oder `''`.
 * @param {any} r @returns {string}
 */
const keyOf = (r) => (r ? refKey(r) : '');

/**
 * Eine Prozenteingabe als Anteil in (0; 1); `null`, wenn sie nicht gilt.
 * @param {string} raw @returns {number|null}
 */
function percentToFraction(raw) {
  const v = parseNumber(String(raw).replace('%', '').trim());
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v >= 100) return null;
  return roundTo(v / 100, 8);
}

/** Leere Kennzahl. */
const NO_KPI = Object.freeze({ value: '', mod: '' });

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  commands: {
    /**
     * Bei binärer Zielgröße die Erfolgsklasse tauschen; der Fit rechnet neu.
     * Nur die Ansicht kennt die Stufen des Fits (Ableitung
     * `successClassInfo`); geschrieben wird allein das Feld `successClass`.
     */
    swapSuccess: command({
      params: {},
      run() {
        const info = /** @type {{ success: number, failure: number }|null} */ (this.successClassInfo);
        if (!info) throw new Error(this.t('swapUnavailable'));
        setFields(this.model, { successClass: info.failure });
      },
    }),
    /**
     * Die Zielgröße für Werte der Terme vorhersagen. Schreibt die Werte in die
     * Prognosefelder; fehlt ein Term, gibt es keine Vorhersage. Die Prognose
     * ist flüchtig wie in der Altform: sie gehört zur Ansicht.
     */
    predict: command({
      params: { values: map(text(), cell()) },
      returns: object({
        linear: number(), response: number(), ciLower: number({ nullable: true }), ciUpper: number({ nullable: true }),
      }, { nullable: true }),
      run({ values }) {
        const terms = /** @type {string[]} */ (this.termList);
        for (const key of Object.keys(values)) requireEnum('values', key, terms);
        /** @type {Record<string, string>} */
        const typed = {};
        for (const term of terms) {
          if (!Object.hasOwn(values, term)) continue;
          const v = values[term];
          const n = typeof v === 'number' ? v : parseNumber(typeof v === 'string' ? v : '');
          if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`invalid ${term} ${JSON.stringify(v)}; allowed: a number`);
          typed[term] = formatNumber(n, this.lang, { profile: 'input' });
        }
        this.state.predictInputs = { ...this.state.predictInputs, ...typed };
        this.state.predictShown = true;
        if (terms.length === 0 || terms.some((term) => !Object.hasOwn(values, term))) return null;
        return this.prediction;
      },
    }),
  },
  asyncTasks: {
    saveAsModel: asyncTask({
      blocked() { return this.canSaveModel ? null : this.t('saveBlocked'); },
      async run() {
        // Stand vor dem ersten Schreiben: Model, Rechnung und Texte.
        const model = this.model;
        const a = /** @type {Analysis} */ (this.analysis);
        const notify = this._ui.notify;
        const r = a.fit;
        const name = model.savedModelName || `${a.data?.yName ?? 'Y'} — ${this.t(`family_${r?.family.name}`)}`;
        const inputs = { yRef: plain(model.yRef), modelRecord: plain(model.modelRecord) };
        let record;
        try {
          record = buildRecord(inputs, a, new Date().toISOString());
        } catch (err) {
          console.warn('[glm-regression] saveAsModel failed', err);
          throw new Error(this.t('saveFailed'), { cause: err });
        }
        if (!record) throw new Error(this.t('saveFailed'));
        const id = model.savedModelId ?? uid();
        setFields(model, { savedModelId: id, savedModelName: name, modelRecord: record });
        notify(this.t('modelSaved'), 'success');
        return id;
      },
    }),
  },
  /** @type {import('./state.types.js').GlmRegressionViewFn} */
  view(ctx) {
    const lang = () => ctx.i18n.getLanguage();
    return {
      /**
       * Gerät Y unter die X, wird Y geleert; gerät die Versuchszahl unter die
       * X oder auf Y, wird sie geleert — im Schritt der Änderung. Ändern sich
       * die Betroffenen im selben Durchgang mit (Rückgängig, Laden), bleibt
       * alles. Der Reiterwechsel steht in der Adresse, wenn diese Instanz
       * angezeigt ist.
       */
      init() {
        this.$watch(
          () => [this.model.colRefs.map(keyOf).join(','), keyOf(this.model.yRef), keyOf(this.model.trialsRef)],
          (now, before) => {
            const xChanged = now[0] !== before[0];
            const yChanged = now[1] !== before[1];
            const trialsChanged = now[2] !== before[2];
            if ((!xChanged && !yChanged) || (trialsChanged && yChanged)) return;
            const fix = () => {
              /** @type {Record<string, null>} */
              const out = {};
              const xs = this.model.colRefs.map(keyOf);
              const y = keyOf(this.model.yRef);
              const tr = keyOf(this.model.trialsRef);
              if (xChanged && !yChanged && y && xs.includes(y)) out.yRef = null;
              if (!trialsChanged && tr && (xs.includes(tr) || (tr === y && !('yRef' in out)))) out.trialsRef = null;
              return out;
            };
            if (Object.keys(fix()).length === 0) return;
            queueMicrotask(() => {
              const f = fix();
              if (Object.keys(f).length > 0) ctx.history?.amend(() => setFields(this.model, f));
            });
          },
        );
        this.$watch(() => this.model.activeTab, (tab) => {
          const route = this.$store.route;
          if (!route || route.instanceId !== ctx.instanceId) return;
          if (!Array.isArray(route.sub) || route.sub[0] !== tab) this.changeRoute(tab);
        });
      },

      /**
       * Route unterhalb des Moduls: der erste Abschnitt wählt den Reiter über
       * die Reiterleiste; ein unbekannter oder fehlender Reiter ändert nichts.
       * @param {string[]} sub
       */
      onRouteChanged(sub) {
        const tab = Array.isArray(sub) ? sub[0] : undefined;
        if (!tab || !TABS.includes(tab) || tab === this.model.activeTab) return;
        this.$nextTick(() => {
          const btn = /** @type {HTMLElement|null} */ (this.$root.querySelector(`[data-ref="tabs"] [role="tab"][data-tab="${tab}"]`));
          btn?.click();
        });
      },

      /** Die App-Sprache. */
      get lang() { return lang(); },
      /** Die Rechnung zum Stand. @returns {Analysis} */
      get analysis() { return analyze(this.model, ctx.source); },
      /** Der konvergierte Fit, sonst `null`. */
      get fit() { return this.analysis.fit; },
      /** Es gibt ein gezeigtes Ergebnis. */
      get hasFit() { return this.fit != null; },
      /** Der Fit ist binomial. */
      get isBinomial() { return this.fit?.family.name === 'binomial'; },
      /** Die Terme der Prognose (Ableitung, ohne Fehlerobjekt). */
      get termList() { return Array.isArray(this.predictionTerms) ? this.predictionTerms : []; },

      // ── Datenquelle ─────────────────────────────────────────
      /** Es gibt kein Arbeitsblatt im Projekt. */
      get showNoWorksheet() { return !ctx.source.list().some((i) => i.moduleId === 'worksheet'); },
      /** Die X schließen sich im Y-Wähler aus. */
      get yExclude() { return this.model.colRefs.map((r) => plain(r)); },
      /** X und Y schließen sich im Wähler der Versuchszahl aus. */
      get trialsExclude() { return [...this.model.colRefs, ...(this.model.yRef ? [this.model.yRef] : [])].map((r) => plain(r)); },
      /** Hinweis zur Spaltenwahl; leer, sobald X und Y stehen. */
      get selectedInfoText() {
        if (this.model.colRefs.length === 0) return this.t('selectColumns');
        return this.model.yRef ? '' : this.t('selectYHint');
      },

      // ── Verfahren ───────────────────────────────────────────
      /**
       * Klasse eines Verfahrensknopfs.
       * @param {string} m @returns {string}
       */
      methodClass(m) { return this.model.method === m ? 'btn--active' : ''; },
      /** Der Hinweis der automatischen Wahl; leer ohne. */
      get detectText() {
        const d = /** @type {any} */ (this.detection);
        return d && typeof d.message === 'string' ? d.message : '';
      },

      // ── Einstellungen ───────────────────────────────────────
      /** Die Konfidenz in Prozent. */
      get confDisplay() { return formatNumber(roundTo(this.model.confLevel * 100, 2), lang(), { profile: 'input' }); },
      /** α in Prozent. */
      get alphaDisplay() { return formatNumber(roundTo(this.model.alpha * 100, 2), lang(), { profile: 'input' }); },
      /**
       * Ein Prozentfeld über das gekoppelte Kommando übernehmen; außerhalb
       * von (0; 100) abgewiesen, das Feld springt auf den gespeicherten Wert
       * zurück. Gleicher Wert schreibt nicht.
       * @param {'confLevel'|'alpha'} field @param {Event} event
       */
      commitPercent(field, event) {
        const el = /** @type {HTMLInputElement} */ (event.target);
        const v = percentToFraction(el.value);
        const shown = () => (field === 'confLevel' ? this.confDisplay : this.alphaDisplay);
        if (v === null) {
          markRejection(el, this.t('confRejected'));
          el.value = shown();
          return;
        }
        clearRejection(el);
        if (v !== this.model[field]) {
          if (field === 'confLevel') this.model.setConfLevel({ value: v });
          else this.model.setAlpha({ value: v });
        }
        el.value = shown();
      },
      /** @param {Event} event */
      commitConf(event) { this.commitPercent('confLevel', event); },
      /** @param {Event} event */
      commitAlpha(event) { this.commitPercent('alpha', event); },
      /**
       * Enter verlässt das Feld (übernimmt über `change`).
       * @param {KeyboardEvent} event
       */
      percentKeydown(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          /** @type {HTMLInputElement} */ (event.target).blur();
        }
      },

      // ── Fehler ──────────────────────────────────────────────
      /** Grund ohne Ergebnis als Text; leer ohne Grund. */
      get errorText() {
        const e = /** @type {any} */ (this.error);
        return e && typeof e.message === 'string' ? e.message : '';
      },
      /** Es gibt einen Grund. */
      get hasError() { return this.errorText !== ''; },

      // ── Reiter ──────────────────────────────────────────────
      /** Die Reiter zum Ergebnis; ROC nur binomial. */
      get tabs() {
        if (!this.fit) return [];
        return [
          { id: 'model', label: this.t('tabModel') },
          { id: 'diagnostics', label: this.t('tabDiagnostics') },
          ...(this.isBinomial ? [{ id: 'roc', label: this.t('tabROC') }] : []),
          { id: 'prediction', label: this.t('tabPrediction') },
        ];
      },
      /**
       * Ist der Reiter der gezeigte?
       * @param {string} id @returns {boolean}
       */
      isTab(id) { return this.effectiveTab === id; },
      /**
       * Klasse eines Reiters.
       * @param {string} id @returns {string}
       */
      tabClass(id) { return this.isTab(id) ? 'dmike-tab--active' : ''; },

      // ── Reiter Modell ───────────────────────────────────────
      /** Die Warnungen über der Ausgabe in der App-Sprache. */
      get warnings() { return this.fit ? warningsOf(this.fit).map((w) => warningText(w, this.t, lang())) : []; },
      /** Die Modellzusammenfassung. */
      get summary() { return this.fit ? summaryOf(this.fit, this.t, lang()) : { family: '', link: '', n: '', iterations: '', theta: null }; },
      /** Die Erfolgsklasse als Text; leer ohne binäre Zielgröße. */
      get successText() {
        const info = /** @type {any} */ (this.successClassInfo);
        return info ? formatNumber(info.success, lang()) : '';
      },
      /** Beschriftung des Tauschknopfs. */
      get swapText() {
        const info = /** @type {any} */ (this.successClassInfo);
        return info ? `↔ ${formatNumber(info.failure, lang())}` : '';
      },
      /** Die Kennzahlen. */
      get kpis() { return this.fit ? kpisOf(this.fit, lang()) : null; },
      /**
       * Eine Kennzahl (Wert, Klasse) oder leer.
       * @param {string} key @returns {{ value: string, mod: string }}
       */
      kpi(key) { return this.kpis?.[key] ?? NO_KPI; },
      /**
       * Klasse einer Kennzahl.
       * @param {string} key @returns {string}
       */
      kpiClass(key) { return `dmike-kpi ${this.kpi(key).mod}`.trim(); },
      /** Es gibt die Fläche unter der ROC-Kurve. */
      get hasAuc() { return Boolean(this.kpis?.auc); },
      /** Die Modellgüte. */
      get quality() {
        return this.fit ? qualityOf(this.fit, lang()) : { deviance: '', nullDeviance: '', logLikelihood: '', coxSnell: '', hosmerLemeshow: null, overdispersionRatio: null };
      },
      /** Die Modellgleichung. */
      get equation() { return this.fit ? equationOf(this.fit, lang()) : ''; },
      /** Die Koeffiziententabelle. */
      get coefs() { return this.fit ? coefView(this.fit, this.t, lang()) : { ratioHeader: '', rows: [] }; },
      /** Beschriftung des Speicherknopfs. */
      get saveLabel() { return this.model.savedModelId ? this.t('updateModel') : this.t('saveAsModel'); },
      /** Status neben dem Knopf. */
      get modelStatusText() { return this.model.savedModelId ? this.t('modelSaved') : ''; },
      /** Gespeichertes Modell ohne gezeigtes Ergebnis: die Statuszeile mit Namen. */
      get orphanModelText() {
        if (this.hasFit || !this.model.savedModelId || !this.model.modelRecord) return '';
        return this.t('savedModelStatus', { name: this.model.savedModelName ?? '' });
      },

      // ── Reiter Diagnostik ───────────────────────────────────
      /** Residuen gegen angepasste Werte. */
      get residualsChart() { return this.fit ? residualsConfig(this.fit, this.t) : { series: [] }; },
      /** Normal-Q-Q-Plot. */
      get qqChart() { return this.fit ? qqConfig(this.fit, this.t) : { series: [] }; },
      /** Cook-Distanzen. */
      get cooksChart() { return this.fit ? cooksConfig(this.fit, this.t, lang()) : { series: [] }; },
      /** Die VIF-Tabelle; leer ohne. */
      get vif() { return this.fit ? vifRows(this.fit, lang()) : []; },
      /** Die Überdispersionsprüfung; `null` ohne. */
      get overdispersion() { return this.fit ? overdispersionView(this.fit, lang()) : null; },

      // ── Reiter ROC ──────────────────────────────────────────
      /** Die ROC-Kurve. */
      get rocChart() { return this.fit ? rocConfig(this.fit, this.t, lang()) : { series: [] }; },
      /** Die Schwelle für den Schieber. */
      get cutoffValue() { return String(this.model.cutoff); },
      /** Die Schwelle als Text mit zwei Stellen. */
      get cutoffText() { return formatNumber(this.model.cutoff, lang(), { decimals: 2 }); },
      /** Die Konfusionstafel als Texte. */
      get classTable() { return classView(/** @type {any} */ (this.classification), lang()); },
      /** Die Fläche unter der ROC-Kurve als Text; leer ohne. */
      get aucText() { return this.isBinomial && this.fit?._roc ? fmt(this.fit._roc.auc, lang()) : ''; },

      // ── Reiter Prognose ─────────────────────────────────────
      /** Die Felder der Prognose mit den getippten Werten. */
      get predictFields() {
        const inputs = this.state.predictInputs;
        return this.termList.map((term, i) => ({ term, idx: i + 1, ref: `pred-x-${i + 1}`, value: inputs[term] ?? '' }));
      },
      /**
       * Ein Prognosefeld wurde geändert.
       * @param {string} term @param {Event} event
       */
      onPredictInput(term, event) {
        const el = /** @type {HTMLInputElement} */ (event.target);
        this.state.predictInputs = { ...this.state.predictInputs, [term]: el.value };
      },
      /** „Berechnen“: die Prognose zu den Feldern zeigen. */
      runPrediction() { this.state.predictShown = true; },
      /** Die Vorhersage zu den Feldern; `null`, solange ein Wert fehlt. */
      get prediction() { return this.fit ? predictFor(this.fit, this.state.predictInputs) : null; },
      /** Die Prognose als Texte, nach „Berechnen“; `null` ohne. */
      get predictResult() {
        const p = this.prediction;
        return this.state.predictShown && p ? predictView(p, this.fit, this.t, lang()) : null;
      },
      /** Meldung bei fehlender Eingabe nach „Berechnen“; leer sonst. */
      get predictError() { return this.state.predictShown && this.hasFit && !this.prediction ? this.t('errorInvalidInput') : ''; },
      /** Der Ergebnisbereich der Prognose steht da. */
      get showPredictBox() { return this.predictResult !== null || this.predictError !== ''; },
    };
  },
});
