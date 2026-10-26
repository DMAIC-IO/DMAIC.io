/**
 * D.Mike — Übergabe an einen neuen Worksheet (worksheet-handoff.js)
 *
 * Drei Datenwerkzeuge (data-import, data-transformation, random-generator)
 * legen für ihre Ergebnisse einen neuen Worksheet an. Der Weg stand dreimal
 * wortgleich in den Modulen; hier steht er einmal, und er ist ABWARTBAR:
 * eine `@agent`-Aktion kehrt erst zurück, wenn der Worksheet aktiv ist und
 * die Spalten empfangen kann (`instance.call` wartet das Ergebnis ab).
 *
 * 🔴 CROSS-MODULE CONTRACT: Ereignisnamen und Nutzlasten sind die der
 * bisherigen Modulkopien, Feld für Feld. Die `worksheet:appendColumn`-
 * Ereignisse senden die Module selbst, nach dem `await`.
 *
 * Rein: kein DOM, kein `window`.
 */
import { uid } from './uid.js';
import { uniqueSheetName, buildInitialWorksheetState } from './worksheet-sheets.js';

/**
 * Die Phase, in der eine Instanz registriert ist.
 * @param {object} stateManager der StateManager aus `module._context`
 * @param {string} instanceId die eigene Instanz-id
 * @returns {string} die Phasen-id, `'data'`, wenn die Instanz nirgends steht
 */
export function findOwnPhase(stateManager, instanceId) {
  for (const p of Object.keys(stateManager.get('phases') || {})) {
    const items = stateManager.get(`phases.${p}`) ?? [];
    if (items.some(i => i.instanceId === instanceId)) return p;
  }
  return 'data';
}

/**
 * Obergrenze für das Warten auf `module:activated`. Wechselt der Nutzer
 * während des Einhängens den Tab, meldet die Workspace die Aktivierung nie
 * (`_activateTab` schweigt, wenn ein anderer Tab vorn ist) — ohne Frist hinge
 * das Versprechen und mit ihm jede wartende `@agent`-Aktion. 20 s wie
 * `MOUNT_TIMEOUT_MS` in `ui/workspace.js`: großzügig genug für einen
 * Chunk-Load auf kaltem, langsamem Netz, kurz genug als Riegel gegen den
 * Dauerhänger.
 */
const OPEN_TIMEOUT_MS = 20000;

/**
 * Einen neuen Worksheet in der eigenen Phase anlegen und öffnen.
 * @param {object} context `module._context` (stateManager, eventBus, instanceId)
 * @param {{ sheetName: string, timeoutMs?: number }} opts gewünschter
 *   Blattname (wird eindeutig gemacht) und Frist für die Aktivierung
 * @returns {Promise<string>} die id des neuen Worksheets, sobald er aktiv ist
 * @throws {Error} (abgelehnt) wenn die Aktivierung innerhalb der Frist ausbleibt
 */
export function openNewWorksheet(context, { sheetName, timeoutMs = OPEN_TIMEOUT_MS }) {
  const sm = context.stateManager;
  const eb = context.eventBus;
  const phase = findOwnPhase(sm, context.instanceId);
  const wsId = `worksheet_${uid()}`;

  const existing = sm.get(`phases.${phase}`) ?? [];
  sm.set(`phases.${phase}`, [
    ...existing,
    { instanceId: wsId, moduleId: 'worksheet', order: existing.length, state: {} },
  ]);
  sm.setModuleState(wsId, buildInitialWorksheetState(uniqueSheetName(sm, sheetName)));

  const active = new Promise((resolve, reject) => {
    let timer = null;
    const onActivated = ({ instanceId }) => {
      if (instanceId !== wsId) return;
      eb.off('module:activated', onActivated);
      clearTimeout(timer);
      resolve(wsId);
    };
    eb.on('module:activated', onActivated);
    timer = setTimeout(() => {
      eb.off('module:activated', onActivated);
      reject(new Error(
        context.i18n?.t?.('modules.worksheet.openTimeout') || 'The new worksheet did not open in time',
      ));
    }, timeoutMs);
  });
  eb.emit('module:added', { moduleId: 'worksheet', phase, instanceId: wsId });
  return active;
}
