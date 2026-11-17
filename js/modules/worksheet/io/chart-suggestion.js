/**
 * D.Mike — Arbeitsblatt: Übergabe an `chart-suggestion` (io/chart-suggestion.js)
 *
 * Öffnet `chart-suggestion` in der Phase des Arbeitsblatts und übergibt die
 * gewählten Spalten, wie die Altform: gibt es dort schon eine Instanz, bekommt
 * sie die Auswahl und wird aktiviert; sonst legt `openInstance` eine neue an.
 * Beide Wege senden `chart-suggestion:load`.
 *
 * Kein DOM, kein Alpine.
 */
import { findOwnPhase, openInstance } from '../../../core/instance-handoff.js';

const TARGET = 'chart-suggestion';

/**
 * Die Auswahl an `chart-suggestion` übergeben.
 * @param {{ stateManager: any, eventBus: any, instanceId: string }} services Dienste der Arbeitsblatt-Instanz
 * @param {{ sourceInstanceId: string, sourceSheetId: string, ts: number, columns: object[] }} selection
 * @returns {string} die Instanz von `chart-suggestion`
 */
export function openChartSuggestion(services, selection) {
  const { stateManager, eventBus } = services;
  const state = { selection, selectedChartType: null };
  const phase = findOwnPhase(stateManager, services.instanceId);
  const items = stateManager.get(`phases.${phase}`) || [];
  const existing = items.find((/** @type {{ moduleId: string }} */ i) => i.moduleId === TARGET)?.instanceId;
  if (existing) {
    stateManager.setModuleState(existing, state);
    eventBus.emit('chart-suggestion:load', { instanceId: existing, selection });
    eventBus.emit('module:activated', { instanceId: existing });
    return existing;
  }
  const { instanceId } = openInstance(services, { moduleId: TARGET, state });
  eventBus.emit('chart-suggestion:load', { instanceId, selection });
  return instanceId;
}
