/**
 * D.Mike — Lessons Learned: Viewmodel.
 *
 * Erfahrungen, Kommandos, Invariante und Kennzahlen liegen im Model
 * (domain/model.js); die Agentenfläche entsteht aus dessen Schema. Anlegen
 * und Bearbeiten laufen über ein verborgenes Formular im Dialog
 * (`x-command-form` mit LessonForm, viewmodel/forms.js), Abhaken und Löschen
 * über `x-command` (Löschen mit der Rückfrage des Kommandos). Filter, Suche
 * und aufgeklappte Karten sind UI-State (viewmodel/state.js). Die
 * Werkzeugleiste öffnet den Dialog und die Dateiauswahl eines verborgenen
 * `x-file-drop`; die Datei geht an das Kommando `importLessons`.
 * Hier bleiben: Anzeige der Karten, Maßnahmen im Formular, Import-Meldung.
 * Export: die Liste der Erfahrungen als JSON in der bisherigen Form.
 */
import { createModule } from '../../../core/template-module.js';
import { runUiCommand } from '../../../core/command-directives.js';
import { getPhaseIds } from '../../../core/cycles/cycles.js';
import { ALL_PHASE_IDS } from '../../../core/model.js';
import { todayISO } from '../../../core/local-date.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { shownLessons, lastPhase } from '../domain/lessons.js';
import { toExport } from '../io/export.js';
import { fromExample } from '../io/example.js';
import { UiState } from './state.js';
import * as forms from './forms.js';

/** @typedef {import('../domain/model.types.js').StateModel} LessonsModel */
/** @typedef {import('../domain/model.types.js').StateFields['lessons'][number]} Lesson */
/** @typedef {import('./forms.types.js').LessonFormValues} LessonFormValues */

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  forms,
  history: true,
  fromExample,
  config: {
    actions: [
      // Öffnet die Dateiauswahl des verborgenen x-file-drop (importFile).
      { icon: 'action.upload', title: 'importJSON', agentAction: 'importLessons', onClick: (/** @type {any} */ d) => d.openImport() },
      { icon: 'action.add', title: 'addLesson', variant: 'primary', agentAction: 'addLesson', onClick: (/** @type {any} */ d) => d.openAdd() },
    ],
  },
  /** @type {import('./state.types.js').LessonsLearnedExports} */
  exports: {
    fileName() { return `lessons-learned_${todayISO()}`; },
    tree() { return toExport(this.model.lessons); },
  },
  /** @type {import('./state.types.js').LessonsLearnedViewFn} */
  view(ctx) {
    /** @type {((e: { instanceId?: string }) => void)|null} */
    let onCommand = null;
    return {
      init() {
        // Verschwindet eine Erfahrung (Löschen, auch durch den Agenten),
        // fällt ihre Karte aus den aufgeklappten.
        onCommand = (e) => { if (e?.instanceId === ctx.instanceId) this.dropStaleCards(); };
        ctx.eventBus?.on?.('command:executed', onCommand);
      },
      destroy() {
        if (onCommand) ctx.eventBus?.off?.('command:executed', onCommand);
        onCommand = null;
      },

      /**
       * id eines Formularfelds, eindeutig je Instanz (`<label for>`).
       * @param {string} name @returns {string}
       */
      fieldId(name) { return `ll-${name}-${ctx.instanceId}`; },

      // ─── Werkzeugleiste ────────────────────────────────────
      /** „Neue Lesson“: der Dialog mit der letzten Phase des Zyklus. */
      openAdd() {
        ctx.openDialog('lessonForm', { title: this.t('addTitle'), defaults: { phase: this.defaultPhase } });
      },
      /** „Importieren“: die Dateiauswahl des verborgenen x-file-drop. */
      openImport() {
        /** @type {HTMLInputElement|null|undefined} */ (this.$refs.importDrop?.querySelector('[data-ref="file-input"]'))?.click();
      },
      /**
       * Die gewählte Datei an `importLessons`; Meldung mit der Zahl der
       * übernommenen Erfahrungen oder der Importfehler.
       * @param {{ text: () => Promise<string> }} file
       * @returns {Promise<void>}
       */
      async importFile(file) {
        let json = '';
        try { json = await file.text(); } catch (err) { console.warn('[lessons-learned] import: file unreadable', err); }
        const r = await runUiCommand(this._ui, 'importLessons', { json });
        if (r.ok) {
          ctx.notify(this.t('importSuccess', { count: r.result.count }), 'success');
          return;
        }
        if ('error' in r) console.warn('[lessons-learned] importLessons failed', r.error);
        ctx.notify(this.t('importError'), 'error');
      },

      // ─── Statistik und Liste ───────────────────────────────
      /**
       * Eine Kennzahl der Statistikleiste.
       * @param {'total'|'success'|'problem'|'improve'|'openActions'} key @returns {number}
       */
      statValue(key) {
        const s = /** @type {any} */ (this.stats);
        return s && typeof s[key] === 'number' ? s[key] : 0;
      },
      /** Die angezeigten Erfahrungen: Filter, Suche, die neueste zuerst. */
      get shown() { return shownLessons(this.model.lessons, this.state.filter, this.state.search); },
      /** Keine Karte zu zeigen. */
      get noneShown() { return this.shown.length === 0; },
      /** Leertext: ohne Erfahrungen leer, sonst „keine Treffer“. */
      get emptyText() { return this.model.lessons.length === 0 ? '' : this.t('noResults'); },
      /** @param {string} v Filterwert @returns {string} Klasse des Chips */
      chipClass(v) { return this.state.filter === v ? 'chip--active ll__filter-chip--active' : ''; },

      // ─── Karte ─────────────────────────────────────────────
      /** @param {Lesson} l @returns {boolean} */
      isOpen(l) { return this.state.openCards.includes(l.id); },
      /** Karte auf- oder zuklappen. @param {string} id */
      toggleCard(id) {
        const open = this.state.openCards;
        this.state.openCards = open.includes(id) ? open.filter((x) => x !== id) : [...open, id];
      },
      /** Aufgeklappte Karten, deren Erfahrung es nicht mehr gibt, entfallen. */
      dropStaleCards() {
        const ids = new Set(this.model.lessons.map((l) => l.id));
        const open = this.state.openCards;
        if (open.some((id) => !ids.has(id))) this.state.openCards = open.filter((id) => ids.has(id));
      },
      /** @param {Lesson} l @returns {string} */
      cardClass(l) { return this.isOpen(l) ? 'll__card--open' : ''; },
      /** @param {Lesson} l @returns {'true'|'false'} */
      ariaExpanded(l) { return this.isOpen(l) ? 'true' : 'false'; },
      /** @param {Lesson} l @returns {string} */
      chevronIcon(l) { return this.isOpen(l) ? 'nav.expand-down' : 'nav.expand-right'; },
      /** @param {Lesson} l @returns {string} */
      catDotClass(l) { return `ll__cat-dot--${l.category}`; },
      /** Farbklasse nur für Phasen der Zyklen. @param {Lesson} l @returns {string} */
      phaseClass(l) { return ALL_PHASE_IDS.includes(l.phase) ? `ll__phase-tag--${l.phase}` : ''; },
      /** @param {Lesson} l @returns {string} */
      impactClass(l) { return `ll__impact-badge--${l.impact}`; },
      /** @param {string} c @returns {string} */
      catLabel(c) { return this.t(`cat_${c}`); },
      /** @param {string} i @returns {string} */
      impactLabel(i) { return this.t(`impact_${i}`); },
      /**
       * Name einer Phase: jede Phase der Zyklen übersetzt, sonst der
       * gespeicherte Text.
       * @param {string} p @returns {string}
       */
      phaseName(p) { return ALL_PHASE_IDS.includes(p) ? ctx.i18n.t(`phases.${p}`) : p; },
      /** Die Phasen des aktiven Zyklus (Auswahl im Formular). @returns {string[]} */
      get phaseIds() { return getPhaseIds(this.model.context.cycle); },
      /** Vorgabe einer neuen Erfahrung: die letzte Phase des Zyklus. */
      get defaultPhase() { return lastPhase(this.model.context.cycle); },
      /** Zeitstempel als Datum in der Sprache der App; 0 leer. @param {number} ts @returns {string} */
      formatDate(ts) {
        if (!ts) return '';
        return new Date(ts).toLocaleDateString(ctx.i18n.getLanguage() === 'de' ? 'de-DE' : 'en-US');
      },
      /** @param {Lesson} l @returns {boolean} */
      hasActions(l) { return l.actions.length > 0; },
      /** „erledigt/alle Actions“ der Kopfzeile. @param {Lesson} l @returns {string} */
      actionsSummary(l) {
        return l.actions.length > 0
          ? this.t('actionsSummary', { done: l.actions.filter((a) => a.done).length, total: l.actions.length })
          : '';
      },
      /** @param {{ done: boolean }} a @returns {string} */
      checkClass(a) { return a.done ? 'll__action-check--done' : ''; },
      /** @param {{ done: boolean }} a @returns {string} */
      actionTextClass(a) { return a.done ? 'll__action-text--done' : ''; },
      /** Wert für `data-arg-done` des Hakens: umschalten. @param {{ done: boolean }} a @returns {'true'|'false'} */
      nextDone(a) { return a.done ? 'false' : 'true'; },

      // ─── Maßnahmen im Formular ─────────────────────────────
      /**
       * Den Text des Eingabefelds als offene Maßnahme anhängen und das Feld
       * leeren; ein leerer Text tut nichts.
       * @param {LessonFormValues} form die Werte des Formulars (Kern-Scope)
       */
      addDraftAction(form) {
        const t = String(form.actionText ?? '').trim();
        if (!t) return;
        form.actions.push({ text: t, done: false });
        form.actionText = '';
      },
      /**
       * Eine Maßnahme aus dem Formular entfernen.
       * @param {LessonFormValues} form @param {number} i
       */
      removeDraftAction(form, i) {
        form.actions.splice(i, 1);
      },
    };
  },
});
