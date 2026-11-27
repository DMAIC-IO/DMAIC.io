/**
 * D.Mike — Zielgrößenoptimierung: Viewmodel.
 *
 * Vorgaben, Prüfungen und Ableitungen liegen im Model (domain/); die
 * Agentenfläche entsteht aus dessen Schema. Hier bleiben die Anzeige in der
 * App-Sprache (Modellzeilen, Sperrgründe, Kennzahl, Tabellen, Wirkungsfläche),
 * die Handler der Vorgabefelder (Kästchen, Auswahl, Zahlen mit Dezimalkomma →
 * `setSpec`, Ablehnung am Feld), die Achsen und Festwerte der Wirkungsfläche
 * (flüchtig wie in der Altform) und der Lauf `runOptimize`: er liest die
 * Modelle fremder Instanzen und schreibt das Optimum ins eigene Model. Beim
 * Einhängen lädt die Ansicht die Module der Besitzer nach, deren Modell noch
 * nicht lesbar ist.
 */
import { createModule } from '../../../core/template-module.js';
import { asyncTask } from '../../../core/async-task.js';
import { setFields } from '../../../core/model.js';
import { markRejection, clearRejection } from '../../../core/param-input.js';
import { formatNumber, parseNumber } from '../../../core/number-format.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { readOwners, selectedIdsOf, OWNER_MODULES } from '../domain/models.js';
import { diagnose, reasonText } from '../domain/diagnose.js';
import { optimize, contourOf } from '../domain/optimize.js';
import { exampleParts } from '../domain/example.js';
import { provisionInstance } from '../../../core/examples-registry.js';
import { UiState } from './state.js';
import { modelRows, dClass, optimumRows, predictionRows, contourChartConfig, fixed } from './present.js';

/** @typedef {import('../domain/model.js').ModelRef} ModelRef */
/** @typedef {import('../domain/model.js').Spec} Spec */
/** @typedef {import('../domain/model.js').Result} Result */
/** @typedef {import('../domain/optimize.js').Contour} Contour */

/** @param {any} v @returns {any} eine schlichte Kopie */
const plain = (v) => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));

/** @param {unknown} v @returns {any[]} die Liste oder leer (eine Ableitung kann `{ error }` sein) */
const listOr = (v) => (Array.isArray(v) ? v : []);

/** Die Wunschfunktionen und ihre Texte. */
const KIND_LABELS = Object.freeze({ max: 'goalMax', min: 'goalMin', target: 'goalTarget' });

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  /**
   * Beispiel mit Modellen: je Datensatz aus `data.models` eine
   * Regressions-Instanz in der Phase dieser Instanz (Reiter = Modellname);
   * trägt schon eine Besitzer-Instanz dieselbe Modell-id, bleibt sie der
   * Besitzer. Das Optimum steht danach im eigenen Zustand. Gelesen wird über
   * `ctx.instances` (wie `readOwners`): ein Besitzer, dessen Modul noch nicht
   * geladen ist, zählt nicht — die Ansicht lädt ungelesene Besitzer gleich
   * beim Einhängen nach, und eine Doppelung löst `readOwners` (die erste gilt).
   * @this {any}
   * @param {Record<string, any>} data
   * @returns {Record<string, any>} der eigene Zustand
   */
  beforeLoadExample(data) {
    const ctx = this._context;
    const { owners, state } = exampleParts(data);
    const all = ctx.instances?.list() ?? [];
    const phase = all.find((/** @type {any} */ r) => r.instanceId === ctx.instanceId)?.phase ?? descriptor.phase;
    const { records } = readOwners({ list: () => all, read: (id, o) => ctx.instances.readSync(id, o), ensureLoaded: async () => false });
    const taken = new Set(records.map((r) => r.id));
    for (const owner of owners) {
      if (taken.has(owner.id)) continue;
      provisionInstance(ctx, { moduleId: 'regression', phase, state: owner.state, customName: owner.name });
    }
    return state;
  },
  asyncTasks: {
    runOptimize: asyncTask({
      blocked() {
        if (this.canOptimize === true) return null;
        if (listOr(this.unreadOwners).length > 0) return this.t('modelsLoading');
        return this.reasonTexts.map((/** @type {{ text: string }} */ r) => r.text).join('; ') || this.t('noModelSelected');
      },
      async run() {
        // Stand vor dem ersten Schreiben: Model, Modelle, Vorgaben und Texte.
        const model = this.model;
        const { records } = readOwners(this.reader);
        const ids = selectedIdsOf(plain(model.specs), records.map((r) => r.id));
        const specs = /** @type {Record<string, Spec>} */ (plain(this.effectiveSpecs));
        const notify = this._ui.notify;
        const lang = this.lang;
        const failText = this.t('optimizeFailed');
        const models = ids.map((id) => records.find((r) => r.id === id)).filter((r) => r !== undefined);
        if (models.length === 0) throw new Error(this.t('noModelSelected'));
        try {
          // Auch das Schreiben: ein nicht endliches Ergebnis (Modell ohne
          // Koeffizienten, Überlauf der Link-Umkehr) lehnt das Schema ab.
          setFields(model, { optimization: optimize(models, specs) });
        } catch (err) {
          console.warn('[response-optimization] runOptimize failed', err);
          throw new Error(failText, { cause: err });
        }
        const optimization = model.optimization;
        this.state.contourXId = null;
        this.state.contourYId = null;
        this.state.contourFixings = {};
        notify(this.t('optimizeSuccess', { D: formatNumber(optimization.result.D, lang, { decimals: 3 }) }), 'success');
        return optimization.result.D;
      },
    }),
  },
  /** @type {import('./state.types.js').ResponseOptimizationViewFn} */
  view(ctx) {
    const lang = () => ctx.i18n.getLanguage();
    /** Besitzer, deren Laden schon angestoßen ist. */
    const loading = new Set();
    return {
      /** Die Module der Besitzer nachladen, deren Modell noch nicht lesbar ist. */
      init() {
        this.$watch(() => listOr(this.unreadOwners).join(','), () => this.loadOwners());
        this.loadOwners();
      },

      /** Je ungelesenem Besitzer das Modul einmal laden. */
      loadOwners() {
        for (const inst of ctx.source.list()) {
          if (!OWNER_MODULES.includes(inst.moduleId) || loading.has(inst.instanceId)) continue;
          if (!listOr(this.unreadOwners).includes(inst.instanceId)) continue;
          loading.add(inst.instanceId);
          const id = inst.instanceId;
          ctx.source.ensureLoaded(id).catch((err) => {
            // Beim nächsten Anstoß erneut versuchen.
            loading.delete(id);
            console.warn('[response-optimization] loading a model owner failed', err);
          });
        }
      },

      /** Die App-Sprache. */
      get lang() { return lang(); },
      /** Der Leser fremder Instanzen (für den Lauf). */
      get reader() { return ctx.source; },

      computed: {
        /** Die Wirkungsfläche des ersten Modells des Optimums; `null` ohne. */
        contour() {
          const opt = this.model.optimization;
          if (!opt || this.resultStale === true) return null;
          const first = opt.modelRefs[0];
          const record = readOwners(ctx.source).records.find((r) => r.id === first);
          return contourOf(record, /** @type {any} */ (opt.result), {
            xId: this.state.contourXId, yId: this.state.contourYId, fixings: { ...this.state.contourFixings },
          });
        },
      },

      // ── Modelle ─────────────────────────────────────────────
      /** Die gespeicherten Modelle (Ableitung, ohne Fehlerobjekt). */
      get modelList() { return /** @type {ModelRef[]} */ (listOr(this.models)); },
      /** Es gibt gespeicherte Modelle. */
      get hasModels() { return this.modelList.length > 0; },
      /** Noch nicht gelesene Besitzer und keine Modelle: Hinweis statt Leerzustand. */
      get showLoading() { return !this.hasModels && listOr(this.unreadOwners).length > 0; },
      /** Weder Modelle noch ungelesene Besitzer. */
      get showEmpty() { return !this.hasModels && !this.showLoading; },
      /** Die Modellzeilen mit den wirksamen Vorgaben. */
      get rows() {
        const specs = /** @type {Record<string, Spec>} */ (this.effectiveSpecs && typeof this.effectiveSpecs === 'object' ? this.effectiveSpecs : {});
        return modelRows(this.modelList, specs, this.t, lang());
      },
      /** Die Optionen der Wunschfunktion. */
      get kindOptions() {
        return Object.entries(KIND_LABELS).map(([value, key]) => ({ value, label: this.t(key) }));
      },
      /**
       * Ein Kästchen „einbeziehen“ wurde umgeschaltet.
       * @param {string} id @param {Event} event
       */
      toggleModel(id, event) {
        this.model.setSpec({ modelId: id, key: 'selected', value: /** @type {HTMLInputElement} */ (event.target).checked });
      },
      /**
       * Die Wunschfunktion wurde gewählt.
       * @param {string} id @param {Event} event
       */
      setKind(id, event) {
        this.model.setSpec({ modelId: id, key: 'kind', value: /** @type {HTMLSelectElement} */ (event.target).value });
      },
      /**
       * Ein Zahlenfeld der Vorgabe übernehmen; Unlesbares, ein Gewicht ≤ 0
       * und eine verletzte Grenzenfolge werden abgewiesen, das Feld zeigt
       * wieder den wirksamen Wert.
       * @param {string} id @param {'lower'|'upper'|'target'|'weight'} key @param {Event} event
       */
      commitNumber(id, key, event) {
        const el = /** @type {HTMLInputElement} */ (event.target);
        const row = this.rows.find((r) => r.id === id);
        const v = parseNumber(el.value);
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          markRejection(el, this.t('specRejected'));
          el.value = row?.[key] ?? '';
          return;
        }
        try {
          this.model.setSpec({ modelId: id, key, value: v });
          clearRejection(el);
        } catch (err) {
          markRejection(el, /** @type {any} */ (err)?.invariant === 'specBounds' ? this.t('invariants.specBounds') : this.t('specRejected'));
          el.value = row?.[key] ?? '';
          return;
        }
        el.value = this.rows.find((r) => r.id === id)?.[key] ?? '';
      },
      /**
       * Enter verlässt das Feld (übernimmt über `change`).
       * @param {KeyboardEvent} event
       */
      numberKeydown(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          /** @type {HTMLInputElement} */ (event.target).blur();
        }
      },
      /**
       * Ist eine Wunschfunktion die gewählte?
       * @param {{ kind: string }} row @param {string} kind @returns {boolean}
       */
      isKind(row, kind) { return row.kind === kind; },

      // ── Sperrgründe ─────────────────────────────────────────
      /** Die Sperrgründe in der App-Sprache. */
      get reasonTexts() {
        const models = this.modelList;
        const ids = selectedIdsOf(plain(this.model.specs), models.map((m) => m.id));
        return diagnose(ids, models).map((r, i) => ({ key: `${i}:${r.type}:${r.name}`, text: reasonText(r, this.t, lang()) }));
      },
      /** Es gibt Sperrgründe. */
      get hasReasons() { return this.reasonTexts.length > 0; },
      /** Beschriftung über den Gründen. */
      get blockedLabel() { return `${this.t('diagnosticBlocked')}:`; },
      /** Hinweis auf Vorgaben ohne Modell; leer ohne. */
      get missingText() {
        const ids = listOr(this.missingModels);
        return ids.length > 0 ? this.t('missingModels', { ids: ids.join(', ') }) : '';
      },

      // ── Ergebnis ────────────────────────────────────────────
      /** Das gespeicherte Optimum; `null` ohne. */
      get resultValue() {
        const r = this.result;
        return r && typeof r === 'object' && !('error' in r) ? /** @type {Result} */ (r) : null;
      },
      /** Es gibt ein Optimum. */
      get hasResult() { return this.resultValue !== null; },
      /** Ein Modell des Optimums fehlt. */
      get staleText() { return this.resultStale === true ? this.t('resultStale') : ''; },
      /** Klasse der Kennzahl D. */
      get dClassName() { return dClass(this.resultValue?.D); },
      /** D mit drei Stellen. */
      get dText() { return fixed(this.resultValue?.D, lang(), 3); },
      /** Tabelle des optimalen Faktorpunkts. */
      get optimumTable() { return this.resultValue ? optimumRows(this.resultValue, lang()) : []; },
      /** Tabelle der Vorhersagen. */
      get predictionTable() { return this.resultValue ? predictionRows(this.resultValue, lang()) : []; },

      // ── Wirkungsfläche ──────────────────────────────────────
      /** Es gibt eine Wirkungsfläche. */
      get hasContour() { return this.contour !== null && typeof this.contour === 'object' && !('error' in this.contour); },
      /** Die Fläche oder `null`. */
      get contourValue() { return this.hasContour ? /** @type {Contour} */ (this.contour) : null; },
      /** Konfiguration des Diagramms. */
      get contourChart() {
        const c = this.contourValue;
        if (!c) return { grid: [] };
        return contourChartConfig(c, this.resultValue?.modelNames?.[0] ?? '', this.t);
      },
      /** Achsenwahl erst ab drei stetigen Faktoren. */
      get showAxisControls() { return (this.contourValue?.continuous.length ?? 0) > 2; },
      /** Die stetigen Faktoren für die Achsenwahl. */
      get axisFactors() { return this.contourValue?.continuous ?? []; },
      /** Die kategorialen Faktoren mit ihrer Stufe. */
      get fixingRows() { return this.contourValue?.fixings ?? []; },
      /**
       * Ist der Faktor auf der Achse?
       * @param {'x'|'y'} axis @param {string} id @returns {boolean}
       */
      isAxis(axis, id) { return (axis === 'x' ? this.contourValue?.xId : this.contourValue?.yId) === id; },
      /**
       * Eine Achse der Wirkungsfläche gewählt.
       * @param {'x'|'y'} axis @param {Event} event
       */
      setContourAxis(axis, event) {
        const v = /** @type {HTMLSelectElement} */ (event.target).value;
        if (axis === 'x') this.state.contourXId = v;
        else this.state.contourYId = v;
      },
      /**
       * Eine Stufe eines kategorialen Faktors gewählt.
       * @param {string} id @param {Event} event
       */
      setContourFix(id, event) {
        this.state.contourFixings = { ...this.state.contourFixings, [id]: /** @type {HTMLSelectElement} */ (event.target).value };
      },
      /**
       * Ist die Stufe die gezeichnete?
       * @param {{ value: string }} fix @param {string} level @returns {boolean}
       */
      isLevel(fix, level) { return fix.value === level; },
    };
  },
});
