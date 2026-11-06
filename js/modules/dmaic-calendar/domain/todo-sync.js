/**
 * D.Mike — Projektkalender: Spiegel der Aufgabenliste.
 *
 * Die Aufgabenliste meldet ihre Einträge mit Fälligkeit
 * (`todo:calendar-sync`); hier werden die gespiegelten Termine ersetzt. Keine
 * Bedienung dieses Moduls, kein Kommando und nicht im Katalog. Neue
 * Spiegeltermine bekommen die erste Phase des aktiven Zyklus.
 */
import { getPhaseIds } from '../../../core/cycles/cycles.js';
import { isIsoDate } from '../../../core/local-date.js';

/**
 * @param {any} model das Kalender-Model (`State`)
 * @param {unknown} items `{ id, title, date, status }[]` aus der Aufgabenliste
 * @returns {void}
 */
export function applyTodoSync(model, items) {
  const phase = getPhaseIds(model.context.cycle)[0];
  const kept = model.events.filter((e) => e.source !== 'todo');
  const mirrored = (Array.isArray(items) ? items : [])
    .filter((t) => t && typeof t.title === 'string' && t.title.trim() !== '' && isIsoDate(t.date))
    .map((t) => ({ id: `todo-${t.id}`, title: t.title.trim(), date: t.date, time: '09:00', duration: 30, desc: '', phase, source: 'todo' }));
  model.events = [...kept, ...mirrored];
}
