/**
 * D.Mike — Aufgabenliste: Viewmodel.
 *
 * Inhalt, Kommandos und die Invariante liegen im Model (domain/model.js);
 * die Agentenfläche entsteht aus dessen Schema. Text, Verantwortlicher und
 * Zieldatum binden `x-model`, Status und Statusfilter `x-field`, Löschen und
 * Sortieren laufen über `x-command`, Umsortieren über die Geste `reorder`.
 * Hier bleiben die Anzeige (angezeigte Folge, Zeilenklassen, Sortierpfeile,
 * Zähler), die beiden Kästchen-Handler und ob das Projekt einen Kalender hat
 * (Kalenderspalte); dazu der Fokus auf den Text einer neuen Aufgabe.
 */
import { createModule } from '../../../core/template-module.js';
import { todayISO } from '../../../core/local-date.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { STATUSES, isOverdue, owners, visibleItems } from '../domain/list.js';
import { fromExample } from '../io/example.js';
import { reorder } from '../interaction/reorder.js';
import { UiState } from './state.js';

/** @typedef {import('../domain/model.types.js').StateFields['items'][number]} Item */

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  gestures: [reorder],
  fromExample,
  config: {
    actions: [
      { icon: 'action.add', title: 'addTodo', variant: 'primary', command: 'addTodo' },
    ],
  },
  /** @type {import('./state.types.js').TodoViewFn} */
  view(ctx) {
    /** @type {((e: { instanceId?: string, command?: string, result?: any }) => void)|null} */
    let onCommand = null;
    /** @type {((e: { moduleId?: string }) => void)|null} */
    let onModules = null;
    return {
      init() {
        this.checkCalendar();
        onModules = (e) => { if (!e || e.moduleId === 'dmaic-calendar') this.checkCalendar(); };
        ctx.eventBus?.on?.('module:added', onModules);
        ctx.eventBus?.on?.('module:removed', onModules);
        onCommand = (e) => this.afterCommand(e);
        ctx.eventBus?.on?.('command:executed', onCommand);
      },
      destroy() {
        if (onModules) {
          ctx.eventBus?.off?.('module:added', onModules);
          ctx.eventBus?.off?.('module:removed', onModules);
        }
        if (onCommand) ctx.eventBus?.off?.('command:executed', onCommand);
        onModules = null;
        onCommand = null;
      },

      /** Hat das Projekt einen Kalender? Dann zeigt die Liste die Kalenderspalte. */
      checkCalendar() {
        this.state.hasCalendar = ctx.instances.list({ modules: ['dmaic-calendar'] }).length > 0;
      },

      /**
       * Nach `addTodo` dieser Instanz den Text der neuen Zeile fokussieren.
       * @param {{ instanceId?: string, command?: string, result?: any }} e
       */
      afterCommand(e) {
        if (!e || e.instanceId !== ctx.instanceId || e.command !== 'addTodo' || typeof e.result !== 'string') return;
        const id = e.result;
        this.$nextTick(() => {
          const row = Array.from(this.$root.querySelectorAll('tr[data-id]')).find((r) => /** @type {HTMLElement} */ (r).dataset.id === id);
          /** @type {HTMLInputElement|null} */ (row?.querySelector('[data-field="text"]') ?? null)?.focus();
        });
      },

      // ─── Anzeige ──────────────────────────────────────────
      /** Die vier Status in Listenreihenfolge. @returns {ReadonlyArray<string>} */
      get statuses() { return STATUSES; },
      /** Die angezeigten Einträge (dieselben Objekte) nach Filter, Suche und Sortierung. @returns {Item[]} */
      get shownItems() { return visibleItems(this.model.items, this.model); },
      /** Die Verantwortlichen der Liste für den Filter. @returns {string[]} */
      get owners() { return owners(this.model.items); },
      /** „angezeigt / gesamt“. */
      get counterText() { return this.t('counterText', { shown: this.shownItems.length, total: this.model.items.length }); },
      /** „Filter:“ */
      get filterLabel() { return `${this.t('filter')}:`; },
      /** Keine Aufgaben. */
      get isEmpty() { return this.model.items.length === 0; },
      /** Aufgaben, aber keine passt zu Filter und Suche. */
      get noMatch() { return this.model.items.length > 0 && this.shownItems.length === 0; },
      /** Die Tabelle steht, sobald eine Aufgabe angezeigt wird. */
      get hasShown() { return this.shownItems.length > 0; },
      /** @param {string} s @returns {string} der übersetzte Name eines Status */
      statusName(s) { return this.t(`status_${s}`); },
      /** @param {Item} item @returns {boolean} */
      isDone(item) { return item.status === 'done'; },
      /**
       * Zeilenklassen: erledigt, überfällig und Einfügemarke der Geste.
       * @param {Item} item @param {number} idx @returns {string}
       */
      rowClass(item, idx) {
        const cls = [];
        if (item.status === 'done') cls.push('todo__row--done');
        if (isOverdue(item, todayISO())) cls.push('todo__row--overdue');
        const p = this.state.dropPreview;
        if (p && p.index === idx) cls.push('dmike-table__row--drop-target');
        return cls.join(' ');
      },
      /** @param {string} col @returns {string} das Pfeilsymbol der Sortierspalte */
      sortArrowIcon(col) {
        if (this.model.sortCol !== col) return 'action.sort';
        return this.model.sortAsc ? 'nav.arrow-up' : 'nav.arrow-down';
      },
      /** @param {string} col @returns {string} die Hervorhebung der Sortierspalte */
      sortArrowClass(col) { return this.model.sortCol === col ? 'todo__sort-arrow--active' : ''; },
      /** @param {Item} item @returns {string} `true`/`false` für `aria-pressed` */
      calPressed(item) { return item.cal ? 'true' : 'false'; },
      /** @param {Item} item @returns {string} */
      calClass(item) { return item.cal ? 'todo__cal-btn--active' : ''; },

      // ─── Kästchen ─────────────────────────────────────────
      /**
       * Das Kästchen „erledigt“ setzt den Status auf erledigt bzw. offen.
       * @param {Item} item @param {Event} event
       */
      doneChanged(item, event) {
        const done = /** @type {HTMLInputElement} */ (event.target).checked;
        this.model.setTodoStatus({ itemId: item.id, status: done ? 'done' : 'open' });
      },
      /** @param {Item} item @param {string} s @returns {boolean} */
      isStatus(item, s) { return item.status === s; },
      /**
       * Die Statusauswahl einer Zeile. Die Zeilen laufen über die angezeigte
       * Folge (Getter), dort bindet `x-field` nicht; darum das Kommando.
       * @param {Item} item @param {Event} event
       */
      statusChanged(item, event) {
        const status = /** @type {HTMLSelectElement} */ (event.target).value;
        this.model.setTodoStatus({ itemId: item.id, status: /** @type {any} */ (status) });
      },
      /** Der Kalenderknopf schaltet die Marke um. @param {Item} item */
      calendarToggled(item) {
        this.model.setTodoCalendar({ itemId: item.id, inCalendar: !item.cal });
      },
    };
  },
});
