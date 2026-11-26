/**
 * D.Mike — Leser-Registrierung (source-reader.js)
 *
 * Alpine-freier Teil des Lesers `Source` (`core/source.js`): die Registrierung
 * des Lesers je `stateManager`, der Abhängigkeits-Haken und `createSource`.
 * Er ist von `source.js` getrennt, damit die DOM-freien Unit-Tests der Fassade
 * (`worksheet-columns.js`) in Node laufen, ohne Alpine zu laden. Die reaktiven
 * Zähler und den Haken setzt `source.js` beim Import; ohne diesen Import
 * (etwa in Node-Tests) bleibt der Haken `null`, und der Leser ist nicht reaktiv.
 * Produktivcode importiert `registerReader`/`createSource` aus `core/source.js`.
 */

/**
 * Leser je `stateManager`: `readSync` des Instanzen-Dienstes und sein `load`,
 * in Tests ein Doppel.
 * @type {WeakMap<object, { readSync: (id: string, options?: object) => object, load: ((id: string) => Promise<boolean>)|null }>}
 */
const readers = new WeakMap();

/** @type {((key: string) => void)|null} liest den reaktiven Zähler `key` (`'#list'` oder eine Instanz-Id) */
let touchHook = null;

/**
 * Das rohe Objekt hinter einem reaktiven Proxy. Ein Viewmodel reicht den
 * `stateManager` oft über Alpine weiter; Alpines Reaktivität verpackt ihn dabei
 * in einen Proxy, der über `__v_raw` auf das rohe Objekt zeigt. Ohne das fände
 * die `WeakMap` den Leser nicht.
 * @param {object} obj
 * @returns {object}
 */
function rawOf(obj) {
  let o = obj;
  while (o && typeof o === 'object' && o.__v_raw) o = o.__v_raw;
  return o;
}

/**
 * Den Abhängigkeits-Haken setzen (nur `source.js`, beim Import).
 * @param {((key: string) => void)|null} fn
 * @returns {((key: string) => void)|null} der bisherige Haken (zum Wiederherstellen in Tests)
 */
export function setTouchHook(fn) { const prev = touchHook; touchHook = fn; return prev; }

/**
 * Den Leser für einen `stateManager` hinterlegen. Die App ruft das direkt nach
 * `createInstances` mit `instances.readSync` und `instances.load`.
 * @param {object} stateManager
 * @param {(id: string, options?: object) => object} readSync
 * @param {(id: string) => Promise<boolean>} [load]  lädt das Modul einer Instanz; `true`, wenn es erst jetzt geladen wurde
 * @returns {void}
 */
export function registerReader(stateManager, readSync, load) {
  readers.set(rawOf(stateManager), { readSync, load: typeof load === 'function' ? load : null });
}

/**
 * Ein Fehler `not_loaded` für eine Instanz.
 * @param {string} instanceId
 * @returns {Error & { code: string }}
 */
function notLoaded(instanceId) {
  return Object.assign(new Error(`not_loaded: ${instanceId}`), { code: 'not_loaded' });
}

/**
 * @typedef {{ instanceId: string, moduleId: string, phase: string }} SourceInstance
 * @typedef {Readonly<{
 *   read: (instanceId: string, options?: object) => object,
 *   list: () => SourceInstance[],
 *   ensureLoaded: (instanceId: string) => Promise<boolean>,
 * }>} Source
 */

/**
 * Der Leser für einen `stateManager`. `read` ist `readSync` des
 * Instanzen-Dienstes und wirft wie dieser (`not_loaded`, `unknown_instance`,
 * `unknown_sheet`, `unknown_column`). `list` nennt die Instanzen des Projekts
 * aus `phases` samt Phase. `ensureLoaded` lädt das Modul einer Instanz, danach
 * wirft `read` kein `not_loaded` mehr; es liefert `true`, wenn das Modul erst
 * jetzt geladen wurde, und lehnt ab, wenn kein Lader registriert ist oder das
 * Laden scheitert. Mit dem Haken aus `source.js` hängt `read` zuerst an den Zähler
 * der Instanz und `list` an `'#list'`.
 * @param {{ get: (path: string) => any }} stateManager  mit registriertem Leser
 * @returns {Source}
 * @throws {Error} `worksheet reader not registered` — Programmierfehler, soll laut sein
 */
export function createSource(stateManager) {
  const lookup = () => {
    const entry = readers.get(rawOf(stateManager));
    if (!entry) throw new Error('worksheet reader not registered');
    return entry;
  };
  lookup();
  return Object.freeze({
    // Der Leser wird je Aufruf nachgeschlagen: eine Neuregistrierung gilt auch für eine zwischengespeicherte Source.
    read(instanceId, options) {
      const { readSync } = lookup();
      touchHook?.(instanceId);
      return readSync(instanceId, options);
    },
    list() {
      touchHook?.('#list');
      const out = [];
      for (const [phase, insts] of Object.entries(stateManager.get('phases') || {})) {
        for (const inst of Array.isArray(insts) ? insts : []) {
          if (inst && typeof inst.instanceId === 'string') out.push({ instanceId: inst.instanceId, moduleId: inst.moduleId, phase });
        }
      }
      return out;
    },
    async ensureLoaded(instanceId) {
      const { load } = lookup();
      if (!load) throw notLoaded(instanceId);
      return (await load(instanceId)) === true;
    },
  });
}

/**
 * Ein Leser ohne Arbeitsblätter: `read` wirft `not_loaded`, `list` ist leer,
 * `ensureLoaded` lehnt mit `not_loaded` ab.
 * Für Kacheln ohne `stateManager` (Tests).
 * @type {Source}
 */
export const NO_SOURCE = Object.freeze({
  read(instanceId) { throw notLoaded(instanceId); },
  list() { return []; },
  ensureLoaded(instanceId) { return Promise.reject(notLoaded(instanceId)); },
});

/**
 * Wie `createSource`, aber erst beim ersten Lesen gebaut: der Leser muss beim
 * Erzeugen noch nicht registriert sein (Template-Modul, Kachel). Ohne
 * registrierten Leser wirft erst `read`/`list`.
 * @param {{ get: (path: string) => any }} stateManager
 * @returns {Source}
 */
export function deferredSource(stateManager) {
  /** @type {Source|null} */
  let src = null;
  const get = () => (src ??= createSource(stateManager));
  return Object.freeze({
    read: (instanceId, options) => get().read(instanceId, options),
    list: () => get().list(),
    ensureLoaded: async (instanceId) => get().ensureLoaded(instanceId),
  });
}
