/**
 * D.Mike — Reaktiver Leser `Source` (source.js)
 *
 * Kernbaustein für alles, was fremde Arbeitsblätter liest (`derived`, Kacheln,
 * Altleser). `createSource(stateManager)` liefert `{ read, list }` über den je
 * `stateManager` registrierten `readSync` (`registerReader`). Jedes Lesen hängt
 * an reaktive Zähler: `read(instanceId)` an `touch(instanceId)`, `list()` an
 * `touch('#list')`. Ein `computed` oder Getter, der so liest, rechnet neu,
 * sobald sich das Blatt ändert, nachgeladen wird oder ein Blatt dazukommt.
 * Den Zähler erhöhen die Ereignisse (ein Abonnent je Bus,
 * `installWorksheetRevisions`; der gespeicherte Stand einer Instanz, die kein
 * Arbeitsblatt ist, über `data:changed` `module:<id>` nur ihren eigenen Zähler),
 * ein frisch geladenes Modul den Zähler seiner Instanz (`ensureLoaded`) und,
 * sofort beim Kommando, das Arbeitsblatt
 * selbst (`bumpWorksheetRevision`): das Ereignis kommt erst im nächsten Frame,
 * ein `read()` direkt nach dem Kommando läse sonst den alten Stand.
 *
 * Die Registrierung und `createSource` leben Alpine-frei in `source-reader.js`
 * und werden hier re-exportiert; dieser Import setzt den Zähler-Haken.
 */
import Alpine from '@alpinejs/csp';
import { setTouchHook, setLoadedHook } from './source-reader.js';

export { registerReader, createSource, deferredSource, NO_SOURCE } from './source-reader.js';

/** Zähler je Arbeitsblatt-Instanz; `'*'` zählt Ereignisse, die alle betreffen, `'#list'` jede Änderung (Spaltenlisten). */
const rev = Alpine.reactive({ '*': 0, '#list': 0 });
const installed = new WeakSet();

/**
 * Den Zähler `key` (und `'*'`) lesen: im Effekt eines `computed` hängt der
 * Aufrufer damit an dessen Änderungen.
 * @param {string} key  Instanz-Id oder `'#list'`
 * @returns {void}
 */
export function touch(key) { void rev['*']; void rev[key]; }

// Jedes Lesen über den Leser hängt vom Zähler ab, auch für Altleser ohne `ctx.data`.
setTouchHook(touch);

/** @param {string} key */
function bump(key) { rev[key] = (rev[key] ?? 0) + 1; if (key !== '#list') rev['#list'] += 1; }

/** Arbeitsblatt-Instanzen: ihren Zähler erhöhen Kommando und Ereignis, nicht das Speichern. */
const worksheetIds = new Set();

/**
 * Nur den Zähler einer Instanz erhöhen: Leser genau dieser Instanz lesen neu,
 * Spaltenlisten (`'#list'`) bleiben.
 * @param {string} id
 */
function bumpInstance(id) { rev[id] = (rev[id] ?? 0) + 1; }

// Ein frisch geladenes Modul macht seine Instanzen lesbar: deren Leser lesen neu.
setLoadedHook(bumpInstance);

/**
 * Alle Leser neu rechnen lassen (`rev['*']`). Für das Vorladen: liefert der
 * Leser bis zum Laden des Arbeitsblatt-Moduls `null`, rechnen danach alle
 * `computed` neu.
 * @returns {void}
 */
export function bumpWorksheetRevisions() { bump('*'); }

/**
 * Den Zähler einer Arbeitsblatt-Instanz sofort erhöhen (und `'#list'`): Leser
 * dieser Instanz sind ab jetzt veraltet und lesen beim nächsten Zugriff neu.
 * Das Arbeitsblatt ruft das synchron nach jedem Kommando; sein Ereignis
 * `worksheet:dataChanged` bleibt je Frame zusammengefasst und erhöht den
 * Zähler noch einmal (harmlos, und nötig für die übrigen Sender wie das
 * Vorladen).
 * @param {string} instanceId
 * @returns {void}
 */
export function bumpWorksheetRevision(instanceId) { if (instanceId) { worksheetIds.add(instanceId); bump(instanceId); } }

/**
 * Den Zähler an den Bus hängen; je Bus nur einmal wirksam.
 * @param {{ on: (event: string, fn: Function) => void }} eventBus
 * @param {{ isWorksheet?: (instanceId: string) => boolean }} [opts]
 *   `isWorksheet` erkennt ein Arbeitsblatt auch vor seinem ersten Ereignis
 *   (nach dem Neuladen): sein Speichern (etwa nach einem Ansichtskommando)
 *   lässt die Leser dann nicht neu rechnen.
 * @returns {void}
 */
export function installWorksheetRevisions(eventBus, { isWorksheet } = {}) {
  if (installed.has(eventBus)) return;
  installed.add(eventBus);
  const sheet = (/** @type {string} */ id) => worksheetIds.has(id) || isWorksheet?.(id) === true;
  eventBus.on('worksheet:dataChanged', (p) => { if (p?.instanceId) { worksheetIds.add(p.instanceId); bump(p.instanceId); } });
  // Gespeicherter Stand einer anderen Instanz (Speichern, Schreiben ohne Mount): ihre Leser lesen neu.
  eventBus.on('data:changed', (path) => {
    const id = typeof path === 'string' && /^module:[^:]+$/.test(path) ? path.slice(7) : null;
    if (id && !sheet(id)) bumpInstance(id);
  });
  eventBus.on('module:removed', (p) => { if (p?.instanceId) bump(p.instanceId); });
  eventBus.on('state:remote-changed', (p) => { for (const id of p?.instanceIds ?? []) bump(id); });
  eventBus.on('module:added', (p) => {
    if (p?.moduleId === 'worksheet') { if (p.instanceId) worksheetIds.add(p.instanceId); bump('#list'); }
  });
  for (const ev of ['project:imported', 'project:switched', 'project:rehydrated']) eventBus.on(ev, () => bump('*'));
}
