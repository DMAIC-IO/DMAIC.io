/**
 * D.Mike — Projektkalender: Aufgabentermine der Aufgabenlisten.
 *
 * Die Aufgaben gehören der Aufgabenliste (`todo`). Dieser Teil liest sie über
 * den Instanzen-Dienst in den UI-State `todoReads` — beim Einhängen, wenn eine
 * Aufgabenliste dazukommt oder entfällt und wenn sich der Stand einer
 * Aufgabenliste ändert — und zeigt jede vorgemerkte Aufgabe als Termin
 * (`domain/todo-appointments.js`). Gespeichert wird im Kalender nichts davon.
 *
 * Bearbeiten, Ziehen und Löschen eines Aufgabentermins schreiben über einen
 * Stapel an `ctx.instances.interact` in die Aufgabenliste; das Viewmodel-
 * Kommando wartet nicht auf das Ergebnis (gebilligte Ausnahme von der
 * asyncTask-Regel: nach dem Abschicken schreibt der Kalender nichts ins
 * eigene Model). Bis zum Neulesen zeigt der Termin schon die neuen Werte.
 */
import { todoAppointments } from '../domain/todo-appointments.js';

/** @typedef {import('../domain/todo-appointments.js').TodoAppointment} TodoAppointment */
/** @typedef {import('./state.types.js').UiState['todoReads'][number]} TodoRead */

/**
 * Nur die Angaben einer Aufgabe, die der Kalender braucht.
 * @param {unknown} items
 * @returns {TodoRead['items']}
 */
function pickItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter((i) => i && typeof i === 'object' && typeof i.id === 'string')
    .map((i) => ({
      id: i.id,
      text: typeof i.text === 'string' ? i.text : '',
      due: typeof i.due === 'string' ? i.due : '',
      cal: i.cal === true,
      ...(typeof i.time === 'string' ? { time: i.time } : {}),
      ...(Number.isInteger(i.duration) ? { duration: i.duration } : {}),
    }));
}

/** @type {import('./state.types.js').DmaicCalendarViewFn} */
export function todosView(ctx) {
  /** Zähler der Lesevorgänge: ein älterer überschreibt keinen neueren. */
  let readSeq = 0;
  /** @type {((e: { moduleId?: string }) => void)|null} */
  let onModules = null;
  /** @type {((path: unknown) => void)|null} */
  let onData = null;
  return {
    init() {
      this.reloadTodos();
      onModules = (e) => { if (!e || e.moduleId === 'todo') this.reloadTodos(); };
      onData = (path) => {
        const m = typeof path === 'string' ? /^module:([^:]+)$/.exec(path) : null;
        if (m && (ctx.instances?.list({ modules: ['todo'] }) ?? []).some((i) => i.instanceId === m[1])) this.reloadTodos();
      };
      ctx.eventBus.on('module:added', onModules);
      ctx.eventBus.on('module:removed', onModules);
      ctx.eventBus.on('data:changed', onData);
    },
    destroy() {
      if (onModules) {
        ctx.eventBus.off('module:added', onModules);
        ctx.eventBus.off('module:removed', onModules);
      }
      if (onData) ctx.eventBus.off('data:changed', onData);
      onModules = null;
      onData = null;
      readSeq += 1;
    },

    /** Die Aufgaben aller Aufgabenlisten neu lesen. */
    reloadTodos() {
      const seq = ++readSeq;
      const instances = ctx.instances;
      if (!instances) return;
      const lists = instances.list({ modules: ['todo'] });
      Promise.all(lists.map((inst) => instances.read(inst.instanceId, { fields: ['items'] })
        .then((r) => ({ instanceId: inst.instanceId, phase: inst.phase, items: pickItems(/** @type {any} */ (r)?.items) }))
        .catch((err) => { console.warn('[dmaic-calendar] reading todo failed', inst.instanceId, err); return null; })))
        .then((reads) => {
          if (seq !== readSeq) return;
          this.state.todoReads = reads.filter((r) => r !== null);
        });
    },

    /** Die Aufgabentermine. @returns {TodoAppointment[]} */
    get todoEvents() { return todoAppointments(this.state.todoReads); },
    /** Eigene Termine und Aufgabentermine. */
    get allEvents() { return [...this.model.events, ...this.todoEvents]; },
    /** @param {{ todo?: unknown }} ev @returns {boolean} ein Aufgabentermin */
    isTodoEvent(ev) { return Boolean(ev && ev.todo); },
    /** @param {{ todo?: unknown }} ev @returns {boolean} ein eigener Termin */
    isOwnEvent(ev) { return !this.isTodoEvent(ev); },

    /**
     * Der Aufgabentermin zu Aufgabenliste und Aufgabe.
     * @param {string} instanceId @param {string} itemId
     * @returns {TodoAppointment}
     * @throws {Error} unbekannte Aufgabe
     */
    todoEventOf(instanceId, itemId) {
      const ev = this.todoEvents.find((e) => e.todo.instanceId === instanceId && e.todo.itemId === itemId);
      if (!ev) throw Object.assign(new Error(`itemId: unknown task ${itemId} in ${instanceId}`), { param: 'itemId' });
      return ev;
    },

    /**
     * Die Aufgabe im gelesenen Stand ändern, bis das Neulesen sie bestätigt.
     * @param {string} instanceId @param {string} itemId
     * @param {Record<string, unknown>|null} changes `null` entfernt die Aufgabe
     */
    patchTodoRead(instanceId, itemId, changes) {
      // Ein vor dem Ändern gestarteter Lesevorgang kennt die Änderung nicht
      // und darf die vorläufige Anzeige nicht zurücksetzen.
      readSeq += 1;
      this.state.todoReads = this.state.todoReads.map((r) => (r.instanceId !== instanceId ? r : {
        ...r,
        items: changes === null
          ? r.items.filter((i) => i.id !== itemId)
          : r.items.map((i) => (i.id === itemId ? { ...i, ...changes } : i)),
      }));
    },

    /**
     * Einen Aufruf an eine Aufgabenliste schicken, ohne zu warten; danach neu
     * lesen, bei einer Ablehnung ein Hinweis.
     * @param {string} instanceId @param {'updateTodo'|'removeTodo'} method @param {object} args
     */
    sendTodoCall(instanceId, method, args) {
      if (!ctx.instances) return;
      ctx.instances.interact([{ op: 'instance.call', module: 'todo', instance: instanceId, method, args: [args] }])
        .then((res) => {
          if (/** @type {any} */ (res)?.ok !== true) {
            console.warn('[dmaic-calendar] writing todo failed', res);
            ctx.notify(this.t('todoWriteFailed'), 'error');
          }
        }, (err) => {
          console.warn('[dmaic-calendar] writing todo failed', err);
          ctx.notify(this.t('todoWriteFailed'), 'error');
        })
        .finally(() => this.reloadTodos());
    },
  };
}
