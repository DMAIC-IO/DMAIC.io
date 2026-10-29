/**
 * D.Mike — Todo Module (todo.js)
 * Aufgabenliste mit Status, Verantwortlichem und Zieldatum. DMAIC-Phase: Define.
 *
 * Das Model (todo-model.js) hält den persistierten Zustand (Einträge, die drei
 * Filter und die Sortierung); diese Datenfunktion hält die
 * Anzeigetransformationen, die Ereignis-Auspacker der Tabelle und die benannten
 * Schreibsenken, über die beide Seiten — Oberfläche und Agentenfläche —
 * schreiben.
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Aufgaben anlegen, ihren
 *   Text, Verantwortlichen, Zieldatum, Status und die Kalendermarke setzen,
 *   Aufgaben entfernen und umsortieren, die drei Filter und die Sortierung
 *   setzen. Der
 *   Oberfläche bleiben die Maus- und Tastaturgestik der Tabelle; der Abgleich
 *   mit einem Kalendermodul läuft über den Ereignisbus und ist kein
 *   Schreibweg der Fläche.
 */

import { createModule } from '../../core/template-module.js';
import { State, Item, STATUSES, SORT_COLUMNS } from './todo-model.js';
import { resolveDateOffset } from '../../core/date-offset.js';
import { todayISO, isIsoDate } from '../../core/local-date.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireBoolean, requireEnum, requireKnownId, requireText } from '../../core/agent/agent-argcheck.js';
import { draggableRows } from '../../ui/draggable-list.js';

export default createModule({
  config: {
    id: 'todo',
    engine: 'alpine',
    phase: 'define',
    icon: 'module.todo',
    version: '1.0.0',
    meta: import.meta,
    // `agentAction` nennt die Agentenmethode hinter der Leistenaktion
    // ausdrücklich; `title` ist ein Beschriftungsschlüssel und hier nur
    // zufällig gleich dem Methodennamen.
    actions: [
      { icon: 'action.add', title: 'addTodo', variant: 'primary', agentAction: 'addTodo', onClick: (d) => d.addTodo() },
    ],
  },
  Model: State,

  beforeLoadExample(data) {
    const result = JSON.parse(JSON.stringify(data));
    if (Array.isArray(result.items)) {
      result.items = result.items.map(item => ({ ...item, due: resolveDateOffset(item.due) }));
    }
    return result;
  },

  data(module, _t) {
    return {
      ...agentReadMixin(module),
      // Row reorder: grip, Alt+Arrow keys and drop = "insert before". The
      // visible order becomes the stored one, so a sorted list stays put.
      ...draggableRows({
        onMove({ group, sourceId, targetId }) {
          if (group !== 'todos') return;
          this.moveTodo(sourceId, targetId);
        },
        rowIds(group) {
          return group === 'todos' ? this.filteredItems().map(i => i.id) : [];
        },
        t: (key, params) => module._context.i18n.t(key, params),
      }),

      statuses: STATUSES,

      /** @noagent view transform: der übersetzte Name eines Status. */
      statusName: (s) => _t(`status_${  s}`),

      /** @noagent view transform: das heutige Datum für den Überfällig-Vergleich. */
      todayISO: () => todayISO(),

      hasCalendar: false,

      /** @noagent view transform: die Verantwortlichen der Liste, für die Auswahl. */
      owners() {
        const set = new Set();
        this.model.items.forEach(i => {
          if (i.owner?.trim()) set.add(i.owner.trim());
        });
        return [...set].sort();
      },

      /** @noagent view transform: die Einträge, die Filter und Suche passieren. */
      filteredItems() {
        const q = this.model.search.toLowerCase();
        return this.sortedItems(this.model.items.filter(i => {
          if (this.model.filterStatus !== 'all' && i.status !== this.model.filterStatus) return false;
          if (this.model.filterOwner !== 'all' && (i.owner || '').trim() !== this.model.filterOwner) return false;
          if (q && !i.text.toLowerCase().includes(q) && !(i.owner || '').toLowerCase().includes(q)) return false;
          return true;
        }));
      },

      /** @noagent view transform: eine Kopie der Liste in Sortierreihenfolge. */
      sortedItems(list) {
        const dir = this.model.sortAsc ? 1 : -1;
        return [...list].sort((a, b) => {
          let va, vb;
          switch (this.model.sortCol) {
            case 'text':   va = a.text.toLowerCase(); vb = b.text.toLowerCase(); break;
            case 'owner':  va = (a.owner || '').toLowerCase(); vb = (b.owner || '').toLowerCase(); break;
            case 'due':    va = a.due || '9999'; vb = b.due || '9999'; break;
            case 'status': va = STATUSES.indexOf(a.status); vb = STATUSES.indexOf(b.status); break;
            default:       return 0;
          }
          if (va < vb) return -dir;
          if (va > vb) return dir;
          return 0;
        });
      },

      /** @noagent view transform: die Zahl der sichtbaren Einträge. */
      filteredCount() {
        return this.filteredItems().length;
      },

      /** @noagent view transform: Zeilenklassen für erledigt und überfällig. */
      rowClass(item) {
        const isDone = item.status === 'done';
        const isOverdue = !isDone && item.due && item.due < todayISO();
        return {
          'todo__row--done': isDone,
          'todo__row--overdue': isOverdue,
        };
      },

      /** @noagent view transform: das Pfeilsymbol der Sortierspalte. */
      sortArrowIcon(col) {
        if (this.model.sortCol !== col) return 'action.sort';
        return this.model.sortAsc ? 'nav.arrow-up' : 'nav.arrow-down';
      },

      /** @noagent view transform: die Hervorhebung der Sortierspalte. */
      sortArrowClass(col) {
        if (this.model.sortCol !== col) return '';
        return 'todo__sort-arrow--active';
      },

      /**
       * Legt eine leere Aufgabe am Ende der Liste an.
       * @agent
       * @returns {string} die id der neuen Aufgabe, mit der alle weiteren
       *   Aufgabenaktionen sie ansprechen
       */
      addTodo() {
        const item = new Item();
        this.model.items.push(item);
        this.$nextTick(() => {
          const inputs = document.querySelectorAll('.todo__inline-input[data-field="text"]');
          inputs[inputs.length - 1]?.focus();
        });
        return item.id;
      },

      /**
       * Setzt den Text einer Aufgabe.
       * @agent
       * @param {string} itemId id der Aufgabe
       * @param {string} text der neue Text; die leere Zeichenkette löscht ihn
       * @returns {void}
       * @throws {Error} wenn keine Aufgabe diese id trägt oder `text` keine
       *   Zeichenkette ist
       */
      setTodoText(itemId, text) {
        requireKnownId('itemId', itemId, this.model.items.map(i => i.id));
        requireText('text', text);
        this._itemById(itemId).text = text;
      },

      /**
       * Setzt den Verantwortlichen einer Aufgabe.
       * @agent
       * @param {string} itemId id der Aufgabe
       * @param {string} owner der neue Verantwortliche; die leere Zeichenkette
       *   lässt die Aufgabe ohne Verantwortlichen
       * @returns {void}
       * @throws {Error} wenn keine Aufgabe diese id trägt oder `owner` keine
       *   Zeichenkette ist
       */
      setTodoOwner(itemId, owner) {
        requireKnownId('itemId', itemId, this.model.items.map(i => i.id));
        requireText('owner', owner);
        this._itemById(itemId).owner = owner;
      },

      /**
       * Setzt das Zieldatum einer Aufgabe.
       * @agent
       * @param {string} itemId id der Aufgabe
       * @param {string} isoDate das Zieldatum als `JJJJ-MM-TT`; die leere
       *   Zeichenkette löscht es
       * @returns {void}
       * @throws {Error} wenn keine Aufgabe diese id trägt oder `isoDate`
       *   weder ein Datum in dieser Schreibweise noch leer ist
       */
      setTodoDue(itemId, isoDate) {
        requireKnownId('itemId', itemId, this.model.items.map(i => i.id));
        // Ein leeres Zieldatum ist die dokumentierte Leerform (so steht eine
        // Aufgabe ohne Termin da); jeder andere nicht lesbare Wert — auch ein
        // FEHLENDES Argument (`undefined`) — wirft (Ruling 52 und 55).
        if (isoDate !== '' && !isIsoDate(isoDate)) {
          throw new Error(`invalid isoDate ${JSON.stringify(isoDate)}; allowed: YYYY-MM-DD or ""`);
        }
        this._itemById(itemId).due = isoDate;
      },

      /**
       * Setzt den Status einer Aufgabe.
       * @agent
       * @param {string} itemId id der Aufgabe
       * @param {'open'|'in-progress'|'done'|'blocked'} status der neue Status
       * @returns {void}
       * @throws {Error} wenn keine Aufgabe diese id trägt oder `status` keiner
       *   der vier Werte ist
       */
      setTodoStatus(itemId, status) {
        requireKnownId('itemId', itemId, this.model.items.map(i => i.id));
        requireEnum('status', status, STATUSES);
        this._itemById(itemId).status = status;
      },

      /**
       * Bestimmt, ob eine Aufgabe an ein Kalendermodul gemeldet wird.
       * @agent
       * @param {string} itemId id der Aufgabe
       * @param {boolean} inCalendar true meldet sie, false nicht
       * @returns {void}
       * @throws {Error} wenn keine Aufgabe diese id trägt oder `inCalendar`
       *   nicht true oder false ist
       */
      setTodoCalendar(itemId, inCalendar) {
        requireKnownId('itemId', itemId, this.model.items.map(i => i.id));
        // `requireEnum` über die zwei Wahrheitswerte statt eines `=== true`:
        // ein fehlendes Argument (`undefined`) wäre sonst stillschweigend
        // „nicht melden" statt ein Fehler (Ruling 55).
        requireBoolean('inCalendar', inCalendar);
        this._itemById(itemId).cal = inCalendar;
      },

      /**
       * Entfernt eine Aufgabe.
       * @agent
       * @param {string} itemId id der Aufgabe
       * @returns {void}
       * @throws {Error} wenn keine Aufgabe diese id trägt
       */
      removeTodo(itemId) {
        requireKnownId('itemId', itemId, this.model.items.map(i => i.id));
        this.model.items = this.model.items.filter(i => i.id !== itemId);
      },

      /**
       * Verschiebt eine Aufgabe vor eine andere und stellt die Liste auf
       * manuelle Reihenfolge. Ist die Liste sortiert, wird zuerst die
       * sichtbare Reihenfolge zur gespeicherten; ausgefilterte Aufgaben
       * folgen dahinter in ihrer bisherigen Reihenfolge.
       * @agent
       * @param {string} itemId id der Aufgabe, die verschoben wird
       * @param {string} beforeId id der Aufgabe, vor die sie kommt
       * @returns {void}
       * @throws {Error} wenn eine der beiden ids keine Aufgabe bezeichnet
       */
      moveTodo(itemId, beforeId) {
        const ids = this.model.items.map(i => i.id);
        requireKnownId('itemId', itemId, ids);
        requireKnownId('beforeId', beforeId, ids);
        this.model.moveItem(itemId, beforeId, this.filteredItems().map(i => i.id));
      },

      /**
       * Setzt den Statusfilter der Liste.
       * @agent
       * @param {'all'|'open'|'in-progress'|'done'|'blocked'} value `all` zeigt
       *   alle Aufgaben, jeder andere Wert nur die mit diesem Status
       * @returns {void}
       * @throws {Error} wenn `value` keiner der fünf Werte ist
       */
      setFilterStatus(value) {
        requireEnum('value', value, ['all', ...STATUSES]);
        this.model.filterStatus = value;
      },

      /**
       * Setzt den Filter auf einen Verantwortlichen.
       * @agent
       * @param {string} value `all` zeigt alle Aufgaben, sonst der Name eines
       *   Verantwortlichen, der in der Liste vorkommt
       * @returns {void}
       * @throws {Error} wenn `value` weder `all` noch ein vorkommender Name ist
       */
      setFilterOwner(value) {
        // `requireKnownId` statt `requireEnum`: die Wertemenge ist keine
        // Aufzählung, sondern die Menge der tatsächlich vergebenen Namen. Ein
        // Name daneben verbärge jede Aufgabe und meldete Erfolg.
        requireKnownId('value', value, ['all', ...this.owners()]);
        this.model.filterOwner = value;
      },

      /**
       * Setzt den Suchtext, der Text und Verantwortlichen durchsucht.
       * @agent
       * @param {string} text der Suchtext; die leere Zeichenkette hebt die
       *   Suche auf
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setSearch(text) {
        requireText('text', text);
        this.model.search = text;
      },

      /**
       * Setzt Sortierspalte und Richtung der Liste.
       * @agent
       * @param {'text'|'owner'|'due'|'status'} column die Spalte, nach der
       *   sortiert wird
       * @param {boolean} ascending true sortiert aufsteigend, false absteigend
       * @returns {void}
       * @throws {Error} wenn `column` keine der vier Spalten oder `ascending`
       *   nicht true oder false ist
       */
      setSort(column, ascending) {
        requireEnum('column', column, SORT_COLUMNS);
        requireBoolean('ascending', ascending);
        this.model.sortCol = column;
        this.model.sortAsc = ascending;
      },

      /**
       * @noagent Spaltenkopf-Klick: dieselbe Spalte dreht die Richtung, eine
       * andere beginnt aufsteigend. Der Ausgang hängt am Vorzustand, für einen
       * Agenten ist das keine eigene Fähigkeit — `setSort` ist der Weg. Die
       * Zuweisung selbst liegt dort, dieses Feld hat genau eine
       * Zuweisungsstelle.
       */
      sortBy(col) {
        const ascending = this.model.sortCol === col ? !this.model.sortAsc : true;
        this.setSort(col, ascending);
      },

      /**
       * @noagent Tabellenhandler: er bekommt das Eintragsobjekt aus der
       * Vorlage und schaltet zwischen zwei Werten um. Delegiert an
       * `setTodoStatus`.
       */
      toggleDone(item) {
        this.setTodoStatus(item.id, item.status === 'done' ? 'open' : 'done');
      },

      /**
       * @noagent Tabellenhandler: er bekommt das Eintragsobjekt aus der
       * Vorlage und schaltet zwischen zwei Werten um. Delegiert an
       * `setTodoCalendar`.
       */
      toggleCal(item) {
        this.setTodoCalendar(item.id, !item.cal);
      },

      /**
       * @noagent Tabellenhandler: er bekommt das Eintragsobjekt aus der
       * Vorlage, ein Agent hat nur ids. Delegiert an `removeTodo`.
       */
      deleteTodo(item) {
        this.removeTodo(item.id);
      },

      /**
       * @noagent meldet die vorgemerkten Aufgaben an eine andere
       * Modulinstanz; die Fläche hat für modulübergreifende Schreibzugriffe
       * keinen Weg.
       */
      syncCalendar() {
        if (!this.hasCalendar) return;
        const items = this.model.items
          .filter(i => i.cal && i.text && i.due)
          .map(i => ({ id: i.id, title: i.text, date: i.due, status: i.status }));
        module._context.eventBus.emit('todo:calendar-sync', items);
      },

      /**
       * @noagent fragt am Projekt ab, ob ein Kalendermodul vorhanden ist;
       * schreibt nur die Anzeigemarke am Viewmodel, keinen Zustand.
       */
      checkCalendar() {
        const phases = module._context.stateManager.get('phases') || {};
        this.hasCalendar = Object.values(phases).flat().some(m => m.moduleId === 'dmaic-calendar');
      },

      /** @noagent lifecycle, kein Zustandsweg. */
      init() {
        this.dragRowsInit();
        this.checkCalendar();

        this.$watch(
          () => this.model.toJSON(),
          () => {
            this.syncCalendar();
          }
        );

        module._context.eventBus.on('module:added', () => this.checkCalendar());
        module._context.eventBus.on('module:removed', () => this.checkCalendar());
      },

      /**
       * Die Aufgabe mit dieser id. Alle Senken prüfen die id vorher mit
       * `requireKnownId`, hier kann also nichts fehlschlagen.
       * @param {string} itemId
       * @returns {Item}
       */
      _itemById(itemId) {
        return this.model.items.find(i => i.id === itemId);
      },

      /** @noagent lifecycle */
      destroy() {
        this.dragRowsDestroy();
      },
    };
  },
});
