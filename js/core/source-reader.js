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

/** Leser je `stateManager`: `readSync` des Instanzen-Dienstes, in Tests ein Doppel. */
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
 * `createInstances` mit `instances.readSync`.
 * @param {object} stateManager
 * @param {(id: string, options?: object) => object} readSync
 * @returns {void}
 */
export function registerReader(stateManager, readSync) {
  readers.set(rawOf(stateManager), readSync);
}

/**
 * @typedef {{ instanceId: string, moduleId: string }} SourceInstance
 * @typedef {Readonly<{
 *   read: (instanceId: string, options?: object) => object,
 *   list: () => SourceInstance[],
 * }>} Source
 */

/**
 * Der Leser für einen `stateManager`. `read` ist `readSync` des
 * Instanzen-Dienstes und wirft wie dieser (`not_loaded`, `unknown_instance`,
 * `unknown_sheet`, `unknown_column`). `list` nennt die Instanzen des Projekts
 * aus `phases`. Mit dem Haken aus `source.js` hängt `read` zuerst an den Zähler
 * der Instanz und `list` an `'#list'`.
 * @param {{ get: (path: string) => any }} stateManager  mit registriertem Leser
 * @returns {Source}
 * @throws {Error} `worksheet reader not registered` — Programmierfehler, soll laut sein
 */
export function createSource(stateManager) {
  const lookup = () => {
    const readSync = readers.get(rawOf(stateManager));
    if (!readSync) throw new Error('worksheet reader not registered');
    return readSync;
  };
  lookup();
  return Object.freeze({
    // Der Leser wird je Aufruf nachgeschlagen: eine Neuregistrierung gilt auch für eine zwischengespeicherte Source.
    read(instanceId, options) {
      const readSync = lookup();
      touchHook?.(instanceId);
      return readSync(instanceId, options);
    },
    list() {
      touchHook?.('#list');
      const out = [];
      for (const insts of Object.values(stateManager.get('phases') || {})) {
        for (const inst of Array.isArray(insts) ? insts : []) {
          if (inst && typeof inst.instanceId === 'string') out.push({ instanceId: inst.instanceId, moduleId: inst.moduleId });
        }
      }
      return out;
    },
  });
}
