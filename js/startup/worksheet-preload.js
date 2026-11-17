/**
 * D.Mike — Arbeitsblatt vorladen (worksheet-preload.js)
 *
 * Die Arbeitsblatt-Fassade (`ctx.data`, `worksheet-columns`) liest über
 * `readSync`. Das liefert `not_loaded`, solange der Code des Moduls
 * `worksheet` nicht geladen ist, also auch dann, wenn ein Projekt
 * Arbeitsblätter hat, aber keines eingehängt wurde (Histogramm direkt nach
 * dem Neuladen geöffnet, Beispiel geladen). Diese Startaufgabe lädt den Code
 * deshalb vor:
 * - beim Start, wenn das Projekt ein Arbeitsblatt hat,
 * - bei `project:switched`, `project:imported` und `project:rehydrated`,
 *   wenn das Projekt ein Arbeitsblatt hat,
 * - bei `module:added` mit `moduleId === 'worksheet'`.
 * Danach `bumpWorksheetRevisions()` und je Instanz `worksheet:dataChanged`
 * (Nutzlast `{ instanceId }`), damit jeder Leser neu rechnet. War das
 * Modul schon geladen, geschieht nichts.
 *
 * `app.js` startet das direkt nach `registerWorksheetReader`, vor dem ersten
 * Mount (nicht über `startupTasks`): so ist das Fenster, in dem die Fassade
 * `not_loaded` liest, so kurz wie möglich. Das Laden blockiert den Start
 * nicht (`run` wartet nicht): die Startaufgaben, etwa der E2E-Griff, kämen
 * sonst erst nach dem Laden des Arbeitsblatt-Codes. Bis dahin liefert die
 * Fassade `null`, und `worksheetsReadable` ist `false` — wer aus einem leeren
 * Ergebnis schreibt (`ColumnPicker.refresh`), wartet darauf. Der `bump`
 * danach lässt jeden Leser neu rechnen. Scheitert das Laden, versucht es der
 * nächste Auslöser erneut. `uniqueSheetName` sieht die Blattnamen ab dem
 * Ende des Ladens.
 */
import { createStartup } from '../core/create-startup.js';
import { bumpWorksheetRevisions } from '../core/worksheet-data.js';

const WORKSHEET = 'worksheet';
const PROJECT_EVENTS = ['project:switched', 'project:imported', 'project:rehydrated'];

/**
 * Hat das aktuelle Projekt eine Arbeitsblatt-Instanz?
 * @param {{ get: (path: string) => any }} stateManager
 * @returns {boolean}
 */
function hasWorksheet(stateManager) {
  for (const phase of Object.keys(stateManager.get('phases') || {})) {
    const items = stateManager.get(`phases.${phase}`) ?? [];
    if (items.some((it) => it?.moduleId === WORKSHEET)) return true;
  }
  return false;
}

/**
 * Alle Arbeitsblatt-Instanzen des Projekts.
 * @param {{ get: (path: string) => any }} stateManager
 * @returns {string[]}
 */
function worksheetInstanceIds(stateManager) {
  const ids = [];
  for (const phase of Object.keys(stateManager.get('phases') || {})) {
    for (const it of stateManager.get(`phases.${phase}`) ?? []) {
      if (it?.moduleId === WORKSHEET && it.instanceId) ids.push(it.instanceId);
    }
  }
  return ids;
}

/**
 * Das Vorladen an den Bus hängen und für das aktuelle Projekt anstoßen.
 * @param {{ moduleRegistry: { getLoaded: (id: string) => object|null, loadModule: (id: string) => Promise<object> },
 *   eventBus: { on: (event: string, fn: Function) => void, emit: (event: string, payload?: any) => void },
 *   stateManager: { get: (path: string) => any } }} ctx
 * @param {{ bump?: () => void }} [deps] `bump` nur für Tests austauschbar
 * @returns {Promise<void>} erfüllt, wenn das Laden für das aktuelle Projekt fertig ist
 */
export function installWorksheetPreload(ctx, { bump = bumpWorksheetRevisions } = {}) {
  const { moduleRegistry, eventBus, stateManager } = ctx;
  /** @type {Promise<void>|null} */
  let pending = null;

  /** @returns {Promise<void>} */
  const ensureLoaded = () => {
    if (moduleRegistry.getLoaded(WORKSHEET)) return Promise.resolve();
    pending ??= moduleRegistry.loadModule(WORKSHEET)
      .then(() => {
        bump();
        // Ältere Leser (Korrelation, Regression, ...) rechnen nur auf dieses
        // Ereignis neu. Die Daten sind unverändert; die Hörer sind idempotent.
        for (const instanceId of worksheetInstanceIds(stateManager)) {
          eventBus.emit('worksheet:dataChanged', { instanceId });
        }
      })
      .catch((err) => { console.error('[worksheet-preload] loading worksheet failed', err); })
      .finally(() => { pending = null; });
    return pending;
  };

  for (const ev of PROJECT_EVENTS) {
    eventBus.on(ev, () => { if (hasWorksheet(stateManager)) ensureLoaded(); });
  }
  eventBus.on('module:added', (p) => { if (p?.moduleId === WORKSHEET) ensureLoaded(); });

  return hasWorksheet(stateManager) ? ensureLoaded() : Promise.resolve();
}

export default createStartup({
  id: 'worksheet-preload',

  run(ctx) {
    void installWorksheetPreload(ctx);
  },
});
