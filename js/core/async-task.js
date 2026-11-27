/**
 * D.Mike — Asynchrone Abläufe eines Moduls (async-task.js)
 *
 * `asyncTask({ params, auto, blocked, run })` beschreibt einen Ablauf, der
 * dauert, Fortschritt meldet und abgebrochen werden kann. `createAsyncTasks`
 * führt je Instanz den Laufzustand `{ running, progress, error, value }`:
 * Start (Parameter, dann `blocked()`), Sperre gegen Doppelstart, Abbruch über
 * `AbortController`, Fehler, Fortschritt. Ein `auto`-Task startet selbst —
 * beim Aufbau und wenn sich ein Wert ändert, den `run` vor dem ersten
 * `await` reaktiv gelesen hat; ein Neustart bricht den laufenden Lauf ab.
 * Ergebnisse abgelöster Läufe (Neustart, Abbruch, Abbau) werden verworfen.
 * Rein: die Reaktivität (`effect`, `release`) kommt von außen.
 */

const ASYNC_TASK = Symbol('asyncTask');

/**
 * @typedef {Readonly<{ params: Record<string, object>, auto: boolean,
 *   blocked: ((this: any) => string|null)|null,
 *   run: (this: any, args: any, ctl: { signal: AbortSignal, progress: (p: number) => void }) => any }>} AsyncTaskDef
 * @typedef {{ status: 'done', value: any } | { status: 'cancelled' } | { status: 'failed', error: Error } | { status: 'rejected', reason: string }} TaskOutcome
 * @typedef {{ running: boolean, progress: number|null, error: string|null, value: any }} TaskStatus
 */

/**
 * Einen asynchronen Ablauf deklarieren. `run(args, { signal, progress })`:
 * `this` ist das Viewmodel; ein `AbortError` gilt als Abbruch.
 * `blocked()` (nur manuell) liefert einen Grund, warum nicht gestartet
 * werden kann, sonst `null`.
 * @param {{ params?: Record<string, object>, auto?: boolean, blocked?: (this: any) => string|null,
 *   run: (this: any, args: any, ctl: { signal: AbortSignal, progress: (p: number) => void }) => any }} def
 * @returns {AsyncTaskDef}
 */
export function asyncTask(def) {
  if (typeof def?.run !== 'function') throw new Error('asyncTask: run must be a function');
  if (def.auto !== undefined && typeof def.auto !== 'boolean') throw new Error('asyncTask: auto must be a boolean');
  if (def.blocked !== undefined && typeof def.blocked !== 'function') throw new Error('asyncTask: blocked must be a function');
  const auto = def.auto === true;
  if (auto && def.params && Object.keys(def.params).length > 0) throw new Error('asyncTask: auto takes no params');
  if (auto && def.blocked) throw new Error('asyncTask: auto takes no blocked');
  return Object.freeze({
    [ASYNC_TASK]: true,
    params: Object.freeze({ ...(def.params ?? {}) }),
    auto,
    blocked: def.blocked ?? null,
    run: def.run,
  });
}

/** @param {any} x @returns {boolean} ein Ergebnis von `asyncTask()` */
export const isAsyncTask = (x) => Boolean(x && x[ASYNC_TASK]);

/**
 * Deklarationen prüfen; wirft mit `where`.
 * @param {string} where @param {Record<string, unknown>} defs
 * @param {Record<string, string>} taken Name → Art eines schon vergebenen Namens
 * @returns {void}
 */
export function checkAsyncTasks(where, defs, taken) {
  for (const [name, def] of Object.entries(defs)) {
    if (!isAsyncTask(def)) throw new Error(`${where}: asyncTasks.${name} is not an asyncTask()`);
    if (Object.hasOwn(taken, name)) throw new Error(`${where}: asyncTask ${name} collides with ${taken[name]}`);
  }
}

/**
 * Status und Nur-Lese-Getter anlegen, bevor Alpine die Komponente reaktiv macht.
 * @param {object} comp @param {string[]} names @returns {void}
 */
export function defineAsyncTaskSlots(comp, names) {
  Object.defineProperty(comp, '_asyncTasks', {
    value: Object.fromEntries(names.map((n) => [n, { running: false, progress: null, error: null, value: null }])),
    enumerable: false,
    configurable: true,
    writable: false,
  });
  Object.defineProperty(comp, 'asyncTasks', {
    get() { return this._asyncTasks; },
    set() { throw new TypeError('asyncTasks is read-only'); },
    enumerable: true,
    configurable: true,
  });
  for (const name of names) {
    Object.defineProperty(comp, name, {
      get() { return this._asyncTasks[name].value; },
      set() { throw new TypeError(`asyncTask ${name} is read-only`); },
      enumerable: true,
      configurable: true,
    });
  }
}

/** @param {unknown} err @returns {boolean} */
const isAbort = (err) => /** @type {any} */ (err)?.name === 'AbortError';
/** @param {unknown} err @returns {Error} */
const asError = (err) => (err instanceof Error ? err : new Error(String(err)));
/** @param {any} v @returns {any} */
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

/**
 * Den Laufzustand der Tasks einer Instanz führen.
 * @param {{ defs: Record<string, AsyncTaskDef>, vm: any,
 *   reactivity: { effect: (fn: () => void) => any, release: (handle: any) => void },
 *   checkArgs: (name: string, params: Record<string, object>, args: any) => object,
 *   notify?: (message: string) => void }} opts
 * @returns {AsyncTaskHost}
 */
export function createAsyncTasks({ defs, vm, reactivity, checkArgs, notify = () => {} }) {
  /** @type {Record<string, TaskStatus>} */
  const statuses = vm._asyncTasks;
  /** @type {Record<string, { token: number, controller: AbortController, outcome: Promise<TaskOutcome>, resolve: (o: TaskOutcome) => void }>} */
  const live = {};
  const handles = [];
  let gen = 0;
  let released = false;

  /** @param {string} name @returns {AsyncTaskDef} */
  function defOf(name) {
    if (!Object.hasOwn(defs, name)) throw new Error(`invalid asyncTask ${name}; allowed: ${Object.keys(defs).join(', ')}`);
    return defs[name];
  }

  /**
   * @param {string} name
   * @param {boolean} [restart] ein neuer Lauf folgt sofort: der Laufzustand bleibt stehen
   * @returns {boolean} ob ein Lauf abgelöst wurde
   */
  function stop(name, restart = false) {
    const run = live[name];
    if (!run) return false;
    delete live[name];
    run.controller.abort();
    if (!restart) {
      statuses[name].running = false;
      statuses[name].progress = null;
    }
    run.resolve({ status: 'cancelled' });
    return true;
  }

  /** @param {string} name @param {number} token @param {TaskOutcome} out */
  function finish(name, token, out) {
    const run = live[name];
    if (!run || run.token !== token) return;
    delete live[name];
    const st = statuses[name];
    st.running = false;
    st.progress = null;
    if (out.status === 'done') {
      st.value = out.value === undefined ? null : out.value;
      st.error = null;
    } else if (out.status === 'failed') {
      st.value = null;
      st.error = out.error.message;
      console.error(`[asyncTask] ${name}:`, out.error);
      if (!defs[name].auto) notify(out.error.message);
    }
    run.resolve(out);
  }

  /**
   * `run` synchron aufrufen — nur so liest ein auto-Effect seine Abhängigkeiten.
   * Aus dem auto-Effect (`fromEffect`) schreibt der Start den Laufzustand erst
   * nach Alpines Durchlauf: Ein Schreiben im Effect ginge an Lesern vorbei, die
   * im selben Durchlauf schon liefen (Alpines Warteschlange verwirft ihren
   * Weckruf), und ein `computed` über dem Zustand bliebe für sie veraltet.
   * @param {string} name @param {object} args @param {boolean} [fromEffect]
   */
  function launch(name, args, fromEffect = false) {
    const def = defs[name];
    stop(name, fromEffect);
    const controller = new AbortController();
    const token = ++gen;
    let resolve;
    const outcome = new Promise((r) => { resolve = r; });
    live[name] = { token, controller, outcome, resolve };
    const st = statuses[name];
    const markRunning = () => {
      if (live[name]?.token !== token) return;
      st.running = true;
      st.progress = null;
    };
    if (fromEffect) queueMicrotask(markRunning);
    else markRunning();
    const progress = (p) => {
      if (live[name]?.token !== token || typeof p !== 'number') return;
      st.progress = Number.isNaN(p) ? 0 : Math.min(1, Math.max(0, p));
    };
    let pending;
    try {
      pending = Promise.resolve(def.run.call(vm, args, { signal: controller.signal, progress }));
    } catch (err) {
      pending = Promise.reject(err);
    }
    pending.then(
      (value) => finish(name, token, { status: 'done', value }),
      (err) => finish(name, token, isAbort(err) ? { status: 'cancelled' } : { status: 'failed', error: asError(err) }),
    );
    return outcome;
  }

  /** @param {string} name @returns {string|null} */
  function blockedReason(name) {
    const def = defOf(name);
    if (!def.blocked) return null;
    try {
      const reason = def.blocked.call(vm);
      return typeof reason === 'string' && reason !== '' ? reason : null;
    } catch (err) {
      console.error(`[asyncTask] ${name} blocked():`, err);
      return asError(err).message;
    }
  }

  /** @param {string} reason @returns {Promise<TaskOutcome>} */
  const rejected = (reason) => Promise.resolve({ status: 'rejected', reason });

  for (const [name, def] of Object.entries(defs)) {
    if (!def.auto) continue;
    // Jeder Wurf wird gefangen: ein werfender Effect hielte Alpines Flush an.
    handles.push(reactivity.effect(() => {
      if (released) return;
      try { launch(name, {}, true); } catch (err) { console.error(`[asyncTask] ${name}:`, err); }
    }));
  }

  return {
    names: Object.keys(defs),
    isAuto: (name) => defOf(name).auto,
    params: (name) => defOf(name).params,
    start(name, args) {
      const def = defOf(name);
      if (def.auto) throw new Error(`asyncTask ${name} is an auto task; it starts on its own`);
      if (released) return rejected(`asyncTask ${name} is no longer available`);
      if (live[name]) return rejected(`asyncTask ${name} is already running`);
      let checked;
      try {
        checked = checkArgs(name, def.params, args);
      } catch (err) {
        return rejected(asError(err).message);
      }
      const reason = blockedReason(name);
      if (reason !== null) return rejected(reason);
      return launch(name, checked);
    },
    cancel(name) { defOf(name); return stop(name); },
    blockedReason,
    readStatus() {
      return Object.fromEntries(Object.keys(defs).map((name) => {
        const st = statuses[name];
        const base = { running: st.running, progress: st.progress, error: st.error };
        return [name, defs[name].auto ? { ...base, value: plain(st.value) } : base];
      }));
    },
    async settle(timeoutMs) {
      let timer;
      const deadline = new Promise((r) => { timer = setTimeout(() => r(false), timeoutMs); });
      const drain = async () => {
        for (;;) {
          // Erst abgeben: ein anstehender Neustart (Microtask-Flush der Reaktivität) läuft vorher.
          await Promise.resolve();
          const pending = Object.keys(live).filter((n) => defs[n].auto).map((n) => live[n].outcome);
          if (pending.length === 0) return true;
          await Promise.all(pending);
        }
      };
      try {
        return await Promise.race([drain(), deadline]);
      } finally {
        clearTimeout(timer);
      }
    },
    release() {
      released = true;
      for (const h of handles) reactivity.release(h);
      handles.length = 0;
      for (const name of Object.keys(live)) stop(name);
    },
  };
}
/**
 * @typedef {{ names: string[], isAuto: (name: string) => boolean, params: (name: string) => Record<string, object>,
 *   start: (name: string, args?: any) => Promise<TaskOutcome>, cancel: (name: string) => boolean,
 *   blockedReason: (name: string) => string|null,
 *   readStatus: () => Record<string, { running: boolean, progress: number|null, error: string|null, value?: any }>,
 *   settle: (timeoutMs: number) => Promise<boolean>, release: () => void }} AsyncTaskHost
 */
