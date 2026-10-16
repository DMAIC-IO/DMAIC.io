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
 * Einen neuen Worksheet in der eigenen Phase anlegen und öffnen.
 * @param {object} context `module._context` (stateManager, eventBus, instanceId)
 * @param {{ sheetName: string }} opts gewünschter Blattname; wird eindeutig gemacht
 * @returns {Promise<string>} die id des neuen Worksheets, sobald er aktiv ist
 */
export function openNewWorksheet(context, { sheetName }) {
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

  const active = new Promise((resolve) => {
    const onActivated = ({ instanceId }) => {
      if (instanceId !== wsId) return;
      eb.off('module:activated', onActivated);
      resolve(wsId);
    };
    eb.on('module:activated', onActivated);
  });
  eb.emit('module:added', { moduleId: 'worksheet', phase, instanceId: wsId });
  return active;
}
