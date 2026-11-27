/**
 * D.Mike — Regression: Viewmodel.
 *
 * Eingaben, Prüfungen und Ableitungen liegen im Model (domain/); die
 * Agentenfläche entsteht aus dessen Schema. X, Y, Typ und Grad binden mit
 * `x-field`, Bänder mit `x-model`, Reiter und gezeigtes Einzelmodell mit
 * `x-set`. Hier bleiben die Anzeige in der App-Sprache (Kennzahlen, Tabellen,
 * Diagrammkonfiguration), die Handler der Prozentfelder (Prozenttext →
 * Anteil, das bildet `x-field` nicht ab), die Prognose (flüchtig wie in der
 * Altform: UI-State und das Viewmodel-Kommando `predict`), der Lauf
 * `saveAsModel` (Momentaufnahme ins eigene Model) und das Leeren von Y, wenn
 * Y unter die X gerät.
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
import { analyze, activeResultOf, degreeAvailability, predictAt, DEGREES } from '../domain/analyze.js';
import { refKey } from '../domain/columns.js';
import { plannerExperiments, buildRecord } from '../domain/record.js';
import { UiState } from './state.js';
import { kpisOf, tabsOf, anovaView, coefView, designNoticeLines, predictLine, fmt } from './present.js';
import {
  scatterConfig, residualsConfig, orderConfig, qqConfig, histogramConfig,
  ssItemsOf, pieConfig, barConfig, mainEffectsCells, interactionCells,
} from './charts.js';

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
 * Zellen der Effektdiagramme als Objekt nach Schlüssel: `x-for` liefert so
 * den Schlüssel als Bezeichner für den Feldpfad des Edit-Felds.
 * @param {import('./charts.js').Cell[]} cells @returns {Record<string, import('./charts.js').Cell>}
 */
const cellsByKey = (cells) => Object.fromEntries(cells.map((c) => [c.key, c]));

/**
 * Der Fehler, mit dem ein Lauf endet: der eigene Text; die Ursache geht an die Konsole.
 * @param {string} message übersetzter Text @param {unknown} cause @returns {Error}
 */
function failure(message, cause) {
  console.warn('[regression] saveAsModel failed', cause);
  return new Error(message, { cause });
}

/**
 * Wurde der Lauf abgelöst, endet er hier ohne zu schreiben.
 * @param {AbortSignal} signal
 */
function throwIfAborted(signal) {
  if (signal.aborted) throw signal.reason ?? new DOMException('aborted', 'AbortError');
}

/**
 * Eine Prozenteingabe als Anteil in (0; 1); `null`, wenn sie nicht gilt.
 * @param {string} raw @returns {number|null}
 */
function percentToFraction(raw) {
  const v = parseNumber(String(raw).replace('%', '').trim());
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v >= 100) return null;
  return roundTo(v / 100, 8);
}

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  commands: {
    /**
     * Die Zielgröße für Werte der Einflussgrößen vorhersagen. Schreibt die
     * Werte in die Prognosefelder; fehlt ein Prädiktor, gibt es keine
     * Vorhersage. Die Prognose ist flüchtig wie in der Altform: sie gehört
     * zur Ansicht und steht nicht im Model.
     */
    predict: command({
      params: { values: map(text(), cell()) },
      returns: object({ yHat: number(), piLow: number({ nullable: true }), piHigh: number({ nullable: true }) }, { nullable: true }),
      run({ values }) {
        const preds = /** @type {Array<{ id: string, kind: string, levels?: string[] }>} */ (this.predictorList);
        const ids = preds.map((p) => p.id);
        for (const key of Object.keys(values)) requireEnum('values', key, ids);
        /** @type {Record<string, string>} */
        const typed = {};
        for (const p of preds) {
          if (!Object.hasOwn(values, p.id)) continue;
          const v = values[p.id];
          if (p.kind === 'categorical') {
            typed[p.id] = String(requireEnum(p.id, v, p.levels ?? []));
          } else {
            const n = typeof v === 'number' ? v : parseNumber(typeof v === 'string' ? v : '');
            if (typeof n !== 'number' || !Number.isFinite(n)) {
              throw new Error(`invalid ${p.id} ${JSON.stringify(v)}; allowed: a number`);
            }
            typed[p.id] = formatNumber(n, this.lang, { profile: 'input' });
          }
        }
        this.state.predictInputs = { ...this.state.predictInputs, ...typed };
        if (preds.length === 0 || preds.some((p) => !Object.hasOwn(values, p.id))) return null;
        return this.prediction;
      },
    }),
  },
  asyncTasks: {
    saveAsModel: asyncTask({
      blocked() { return this.canSaveModel ? null : this.t('saveBlocked'); },
      async run(_args, { signal }) {
        // Stand vor dem ersten await: Model, Leser, Ergebnis und Texte.
        const model = this.model;
        const src = this.reader;
        const r = this.fit;
        const notify = this._ui.notify;
        const name = model.savedModelName || this.t('defaultModelName', { y: r?._nameY || 'Y' });
        const doneText = this.t('modelSaved');
        const failText = this.t('saveFailed');
        const inputs = {
          colRefs: plain(model.colRefs), yRef: plain(model.yRef),
          activeImportSource: plain(model.activeImportSource), modelRecord: plain(model.modelRecord),
        };
        const plannerId = inputs.activeImportSource?.experimentId;
        if (plannerId) {
          // Der Planer liefert den Lack-of-Fit; fehlt er, bleibt der Wert leer.
          try { await src.ensureLoaded(plannerId); } catch { /* ohne Planer */ }
          throwIfAborted(signal);
        }
        let record;
        try {
          record = buildRecord(inputs, src, r, plannerExperiments(src), new Date().toISOString());
        } catch (err) {
          throw failure(failText, err);
        }
        if (!record) throw failure(failText, new Error('the columns are not readable'));
        const id = model.savedModelId ?? uid();
        setFields(model, { savedModelId: id, savedModelName: name, modelRecord: record });
        notify(doneText, 'success');
        return id;
      },
    }),
  },
  /** @type {import('./state.types.js').RegressionViewFn} */
  view(ctx) {
    const lang = () => ctx.i18n.getLanguage();
    return {
      /**
       * Gerät Y unter die X, wird Y geleert, im Schritt der Änderung an den X.
       * Ändert sich Y im selben Durchgang mit (Rückgängig, Laden), bleibt alles.
       * Der Reiterwechsel steht in der Adresse, wenn diese Instanz angezeigt ist.
       */
      init() {
        this.$watch(
          () => [this.model.colRefs.map(keyOf).join(','), keyOf(this.model.yRef)],
          (now, before) => {
            if (now[0] === before[0] || now[1] !== before[1]) return;
            const stale = () => this.model.yRef != null && this.model.colRefs.some((r) => keyOf(r) === keyOf(this.model.yRef));
            if (!stale()) return;
            queueMicrotask(() => {
              if (!stale()) return;
              ctx.history?.amend(() => setFields(this.model, { yRef: null }));
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
       * Route unterhalb des Moduls: der erste Abschnitt wählt den Reiter, ein
       * unbekannter oder beim Ergebnis fehlender Reiter ändert nichts.
       * @param {string[]} sub
       */
      onRouteChanged(sub) {
        const tab = Array.isArray(sub) ? sub[0] : undefined;
        if (!tab || !TABS.includes(tab) || tab === this.model.activeTab) return;
        // Der Reiter wird über die Reiterleiste gewählt (`x-set`), wie mit der
        // Maus; ohne Ergebnis gibt es keine Leiste und nichts zu wählen.
        this.$nextTick(() => {
          const btn = /** @type {HTMLElement|null} */ (this.$root.querySelector(`[data-ref="tabs"] [role="tab"][data-tab="${tab}"]`));
          btn?.click();
        });
      },

      /** Die App-Sprache. */
      get lang() { return lang(); },
      /** Der Leser des Projekts (Arbeitsblatt, Planer); für den Lauf. */
      get reader() { return ctx.source; },
      /** Die Rechnung zum Stand. @returns {Analysis} */
      get analysis() { return analyze(this.model, ctx.source); },
      /** Das gezeigte volle Ergebnis (Polynom oder gewähltes Einzelmodell), sonst `null`. */
      get fit() { return activeResultOf(this.analysis, this.model.activeXKey); },
      /** Es gibt ein gezeigtes Ergebnis. */
      get hasFit() { return this.fit != null; },
      /** Die Form ist ein Polynom. */
      get isPolynomial() { return this.model.regType === 'polynomial'; },
      /** Die Prädiktoren der Prognose (Ableitung, ohne Fehlerobjekt). */
      get predictorList() { return Array.isArray(this.predictors) ? this.predictors : []; },

      // ── Datenquelle ─────────────────────────────────────────
      /** Es gibt kein Arbeitsblatt im Projekt. */
      get showNoWorksheet() { return !ctx.source.list().some((i) => i.moduleId === 'worksheet'); },
      /** Die X schließen sich im Y-Wähler aus. */
      get yExclude() { return this.model.colRefs.map((r) => plain(r)); },
      /** Hinweis zur Spaltenwahl. */
      get selectedInfoText() {
        const n = this.model.colRefs.length;
        if (n === 0) return this.t('selectColumns');
        if (!this.model.yRef) return this.t('selectYHint');
        return n === 1 ? this.t('singleMode') : this.t('multiMode', { n });
      },
      /** Klasse des Hinweises. */
      get selectedInfoClass() { return this.model.colRefs.length === 0 || !this.model.yRef ? 'reg__hint' : 'reg__info'; },

      // ── Versuchsplan ────────────────────────────────────────
      /** Die Versuche, die die Übernahme anbietet. */
      get importOptions() { return Array.isArray(this.experimentImports) ? this.experimentImports : []; },
      /** Der Block „Aus Versuchsplan importieren“ steht da. */
      get showImport() { return this.importOptions.length > 0 || this.importMissing === true; },
      /** Die Auswahl hat Optionen. */
      get hasImportOptions() { return this.importOptions.length > 0; },
      /** Die übernommene Quelle fehlt. */
      get showImportMissing() { return this.importMissing === true; },
      /**
       * Auswahl eines Versuchs: die Auswahl springt zurück auf den Platzhalter,
       * die Übernahme läuft über `importChoice`.
       * @param {Event} event
       */
      onImportChange(event) {
        const el = /** @type {HTMLSelectElement} */ (event.target);
        const key = el.value;
        el.value = '';
        if (key) void this.importChoice(key);
      },
      /**
       * Die eine Stelle der Versuchsübernahme aus der Oberfläche. Der Lauf
       * `importExperiment` folgt mit der Planer-Übergabe; bis dahin übernimmt
       * die Auswahl nichts.
       * @param {string} _key ein Schlüssel aus `experimentImports`
       * @returns {Promise<void>}
       */
      async importChoice(_key) {},

      // ── Einstellungen ───────────────────────────────────────
      computed: {
        /** Welche Grade die Daten tragen. */
        degrees() { return degreeAvailability(this.model, ctx.source); },
      },
      /**
       * Ein Grad ist gesperrt.
       * @param {number} deg @returns {boolean}
       */
      degreeDisabled(deg) { return Boolean(this.degrees.options.find((/** @type {any} */ o) => o.deg === deg)?.disabled); },
      /**
       * Titel einer gesperrten Gradoption.
       * @param {number} deg @returns {string}
       */
      degreeTitle(deg) {
        const o = this.degrees.options.find((/** @type {any} */ x) => x.deg === deg);
        return o && o.disabled ? this.t('degreeDisabledHint', { deg, terms: o.terms, n: this.degrees.n }) : '';
      },
      /** Hinweis zum ersten gesperrten Grad; leer ohne. */
      get degreeHint() {
        const first = DEGREES.find((d) => this.degreeDisabled(d));
        return first ? this.degreeTitle(first) : '';
      },
      /** Die Konfidenz in Prozent. */
      get confDisplay() { return formatNumber(roundTo(this.model.confLevel * 100, 2), lang(), { profile: 'input' }); },
      /** α in Prozent. */
      get alphaDisplay() { return formatNumber(roundTo(this.model.alpha * 100, 2), lang(), { profile: 'input' }); },
      /**
       * Ein Prozentfeld übernehmen; außerhalb von (0; 100) abgewiesen, das
       * Feld springt auf den gespeicherten Wert zurück. Gleicher Wert schreibt nicht.
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
        if (v !== this.model[field]) setFields(this.model, { [field]: v });
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

      // ── Fehler und vermengte Terme ──────────────────────────
      /** Grund ohne (volles) Ergebnis als Text; leer ohne Grund. */
      get errorText() {
        const e = /** @type {any} */ (this.error);
        return e && typeof e.message === 'string' ? e.message : '';
      },
      /** Es gibt einen Grund. */
      get hasError() { return this.errorText !== ''; },
      /** Die vermengten Terme eines gescheiterten Polynoms. */
      get aliasedRows() { return Array.isArray(this.aliased) ? this.aliased : []; },

      // ── Prognose ────────────────────────────────────────────
      /** Die Felder der Prognose mit den getippten Werten. */
      get predictFields() {
        const inputs = this.state.predictInputs;
        return this.predictorList.map((/** @type {any} */ p) => ({
          ...p,
          label: p.kind === 'single' ? this.t('predictXValue') : p.label,
          value: inputs[p.id] ?? (p.kind === 'categorical' ? (p.levels?.[0] ?? '') : ''),
        }));
      },
      /**
       * Ein Prognosefeld wurde geändert.
       * @param {string} id Prädiktor-id @param {Event} event
       */
      onPredictInput(id, event) {
        const el = /** @type {HTMLInputElement} */ (event.target);
        this.state.predictInputs = { ...this.state.predictInputs, [id]: el.value };
      },
      /**
       * Ist die Stufe die gewählte?
       * @param {{ value: string }} field @param {string} level @returns {boolean}
       */
      isLevel(field, level) { return field.value === level; },
      /** Die Werte der Prognose je Prädiktor-id (kategorial ohne Eingabe: erste Stufe). */
      get predictValues() {
        return Object.fromEntries(this.predictFields.map((/** @type {any} */ f) => [f.id, f.value]));
      },
      /** Die Vorhersage zu den Feldern; `null`, solange ein Wert fehlt. */
      get prediction() {
        const r = this.fit;
        if (!r || this.predictorList.length === 0) return null;
        return predictAt(r, this.predictValues);
      },
      /** Die Zeile „Ŷ(…) = …“; leer ohne Vorhersage. */
      get predictText() {
        const out = this.prediction;
        if (!out) return '';
        const values = Object.fromEntries(this.predictFields.map((/** @type {any} */ f) => [
          f.id, f.kind === 'categorical' ? f.value : parseNumber(f.value),
        ]));
        return predictLine(this.predictorList, values, out.yHat, lang());
      },
      /** Das Prognoseintervall; leer ohne. */
      get predictInterval() {
        const out = this.prediction;
        if (!out || out.piLow == null || out.piHigh == null) return '';
        const level = formatNumber(this.fit.confLevel * 100, lang(), { decimals: 0 });
        return `${this.t('predictionInterval', { level })}: [${fmt(out.piLow, lang())}; ${fmt(out.piHigh, lang())}]`;
      },
      /** Es gibt eine Vorhersage. */
      get hasPrediction() { return this.predictText !== ''; },
      /** Es gibt ein Prognoseintervall. */
      get hasPredictInterval() { return this.predictInterval !== ''; },

      // ── Ergebnis ────────────────────────────────────────────
      /** Knöpfe der Einzelmodelle; leer bei nur einem. */
      get xButtons() {
        const keys = Array.isArray(this.perXKeys) ? this.perXKeys : [];
        if (keys.length <= 1) return [];
        const perX = this.analysis.perX ?? {};
        return keys.map((key) => ({ key, label: perX[key]?._nameX ?? key }));
      },
      /**
       * Klasse eines X-Knopfs.
       * @param {string} key @returns {string}
       */
      xButtonClass(key) { return this.activeX === key ? 'reg__x-btn--active' : ''; },
      /** Die Kennzahlen. */
      get kpis() { return this.fit ? kpisOf(this.fit, this.model.alpha, this.t, lang()) : null; },
      /**
       * Eine Kennzahl (Wert, Klasse, Tooltip) oder leer.
       * @param {string} key @returns {{ value: string, mod: string, tip: string }}
       */
      kpi(key) { return this.kpis?.[key] ?? { value: '', mod: '', tip: '' }; },
      /**
       * Klasse einer Kennzahl.
       * @param {string} key @returns {string}
       */
      kpiClass(key) { return `dmike-kpi ${this.kpi(key).mod}`.trim(); },
      /** Es gibt ein vorhergesagtes R². */
      get hasR2pred() { return Boolean(this.kpis?.r2pred); },
      /** Die Modellgleichung. */
      get equation() { return this.fit?.equation ?? ''; },
      /** Der Knopf „Als Modell speichern“ steht da. */
      get showSave() { return this.hasFit && this.canSaveModel === true; },
      /** Beschriftung des Speicherknopfs. */
      get saveLabel() { return this.model.savedModelId ? this.t('updateModel') : this.t('saveAsModel'); },
      /** Status neben dem Knopf. */
      get modelStatusText() { return this.model.savedModelId ? this.t('modelSaved') : ''; },
      /** Gespeichertes Modell ohne gezeigtes Ergebnis: die Statuszeile mit Namen. */
      get orphanModelText() {
        if (this.hasFit || !this.model.savedModelId || !this.model.modelRecord) return '';
        return this.t('savedModelStatus', { name: this.model.savedModelName ?? '' });
      },

      // ── Reiter ──────────────────────────────────────────────
      /** Die Reiter zum Ergebnis. */
      get tabs() { return this.fit ? tabsOf(this.fit, this.t) : []; },
      /** Der wirksame Reiter: der gespeicherte, wenn das Ergebnis ihn hat, sonst der erste. */
      get shownTab() {
        const tabs = this.tabs;
        return tabs.some((/** @type {{ id: string }} */ x) => x.id === this.model.activeTab) ? this.model.activeTab : (tabs[0]?.id ?? 'scatter');
      },
      /**
       * Ist der Reiter der gezeigte?
       * @param {string} id @returns {boolean}
       */
      isTab(id) { return this.shownTab === id; },
      /**
       * Klasse eines Reiters.
       * @param {string} id @returns {string}
       */
      tabClass(id) { return this.isTab(id) ? 'dmike-tab--active' : ''; },

      // ── Diagramme ───────────────────────────────────────────
      /** Reiter „Regression“ bzw. „Ist vs. Soll“. */
      get scatterChart() {
        return this.fit ? scatterConfig(this.fit, { showCI: this.model.showCI, showPI: this.model.showPI, t: this.t, lang: lang() }) : { series: [] };
      },
      /** Reiter „Residuen“. */
      get residualsChart() { return this.fit ? residualsConfig(this.fit, this.t) : { series: [] }; },
      /** Reiter „Reihenfolge“. */
      get orderChart() { return this.fit ? orderConfig(this.fit, this.t) : { series: [] }; },
      /** Reiter „Q-Q-Plot“. */
      get qqChart() { return this.fit ? qqConfig(this.fit, this.t) : { series: [] }; },
      /** Reiter „Histogramm“. */
      get histogramChart() { return this.fit ? histogramConfig(this.fit, this.t) : { data: [] }; },
      /** Die Einträge des SS-Kreises. */
      get ssEntries() { return this.fit ? ssItemsOf(this.fit, this.t) : []; },
      /** Die Legende des SS-Kreises mit Kästchen. */
      get ssItems() {
        const hidden = this.state.ssPieHidden;
        return this.ssEntries.map((/** @type {any} */ it, /** @type {number} */ i) => ({
          label: it.label,
          val: formatNumber(roundTo(it.ss, 2), lang()),
          swatchStyle: `background:${it.color}`,
          checked: !hidden.includes(i),
        }));
      },
      /**
       * Einen Eintrag des SS-Kreises ein- oder ausblenden.
       * @param {number} i @param {Event} event
       */
      toggleSSPie(i, event) {
        const on = /** @type {HTMLInputElement} */ (event.target).checked;
        const rest = this.state.ssPieHidden.filter((/** @type {number} */ x) => x !== i);
        this.state.ssPieHidden = on ? rest : [...rest, i];
      },
      /** Der SS-Kreis. */
      get pieChart() { return pieConfig(this.ssEntries, this.state.ssPieHidden); },
      /** Die SS-Balken. */
      get barChart() { return barConfig(this.ssEntries, this.state.ssPieHidden, this.t); },
      /** Die Zellen der Haupteffekte nach Schlüssel (`'0'`, `'1'`, …; Schlüssel des Edit-Felds). */
      get mainEffects() { return cellsByKey(this.fit ? mainEffectsCells(this.fit, this.t) : []); },
      /** Die Zellen der Wechselwirkungen nach Schlüssel. */
      get interactions() { return cellsByKey(this.fit ? interactionCells(this.fit, this.t) : []); },

      // ── Tabellen ────────────────────────────────────────────
      /** Die ANOVA-Tabelle. */
      get anova() { return (this.fit && anovaView(this.fit, this.model.alpha, lang())) || { termRows: [] }; },
      /** Die Koeffiziententabelle. */
      get coefs() { return coefView(this.fit, this.model.alpha, this.model.coefSortByP, lang()); },
      /** Klasse des Sortierschalters. */
      get sortClass() { return this.model.coefSortByP ? 'reg__sort-btn--active' : ''; },
      /**
       * Einen Term über sein Kästchen ein- oder ausschließen.
       * @param {string} term @param {Event} event
       */
      toggleTerm(term, event) {
        this.model.setTerm({ term, included: /** @type {HTMLInputElement} */ (event.target).checked });
      },
      /**
       * Klassen einer Koeffizientenzeile.
       * @param {{ trClass: string }} row @returns {string}
       */
      rowClass(row) { return row.trClass; },
      /** Zeilen des Hinweises einer Versuchsvorgabe. */
      get noticeLines() { return designNoticeLines(/** @type {any} */ (this.effectiveDesignNotice), this.t); },
      /** Es gibt einen Hinweis. */
      get hasNotice() { return this.noticeLines.length > 0; },
    };
  },
});
