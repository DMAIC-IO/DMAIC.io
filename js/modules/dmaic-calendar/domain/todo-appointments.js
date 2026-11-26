/**
 * D.Mike — Projektkalender: Aufgabentermine aus den Aufgabenlisten.
 *
 * Die Aufgaben gehören der Aufgabenliste; der Kalender liest sie über den
 * Instanzen-Dienst und zeigt jede vorgemerkte Aufgabe mit Text und
 * Zieldatum als Termin. Nichts davon wird im Kalender gespeichert. Rein.
 */
import { isIsoDate } from '../../../core/local-date.js';

/**
 * @typedef {{ instanceId: string, phase: string, items: unknown }} TodoRead
 * @typedef {{ id: string, todo: { instanceId: string, itemId: string }, title: string,
 *   date: string, time: string, duration: number, phase: string }} TodoAppointment
 */

/**
 * Je vorgemerkter Aufgabe (`cal`) mit nichtleerem Text und Zieldatum
 * `JJJJ-MM-TT` ein Termin, in der Folge der Lesungen und Einträge. Beginn
 * und Dauer ohne Angabe: 09:00 und 30 Minuten; die Phase ist die der
 * Aufgabenliste.
 * @param {ReadonlyArray<TodoRead>} reads
 * @returns {TodoAppointment[]}
 */
export function todoAppointments(reads) {
  const out = [];
  for (const r of Array.isArray(reads) ? reads : []) {
    if (!r || typeof r.instanceId !== 'string') continue;
    for (const item of Array.isArray(r.items) ? r.items : []) {
      if (!item || item.cal !== true || typeof item.id !== 'string') continue;
      const title = typeof item.text === 'string' ? item.text.trim() : '';
      if (title === '' || !isIsoDate(item.due)) continue;
      out.push({
        id: `todo:${r.instanceId}:${item.id}`,
        todo: { instanceId: r.instanceId, itemId: item.id },
        title,
        date: item.due,
        time: typeof item.time === 'string' ? item.time : '09:00',
        duration: Number.isInteger(item.duration) ? item.duration : 30,
        phase: r.phase,
      });
    }
  }
  return out;
}
