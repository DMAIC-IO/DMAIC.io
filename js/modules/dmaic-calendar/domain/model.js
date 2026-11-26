/**
 * D.Mike — Projektkalender: Model.
 *
 * Termine (`events`) sind Inhalt; Ansicht, Tagesachse und Wochentage sind
 * Ansichtsfelder — gespeichert, aber nicht im Lesezustand der Agentenfläche.
 * Regeln über zwei Felder stehen als Invarianten. Die Phase eines neuen
 * Termins kommt aus dem aktiven Zyklus (`this.context`); eine Phase aus
 * einem anderen Zyklus bleibt gültig.
 */
import { defineModel, list, object, text, number, oneOf, date, time, phase, idOf, command } from '../../../core/model.js';
import { requireKnownId } from '../../../core/validate.js';
import { getPhaseIds } from '../../../core/cycles/cycles.js';
import { uid } from '../../../core/uid.js';
import { from0, from10 } from './migrations.js';

/** @param {any} m @param {string} id @returns {any} der Termin; wirft bei unbekannter id */
function eventOf(m, id) {
  requireKnownId('id', id, m.events.map((e) => e.id));
  return m.events.find((e) => e.id === id);
}

export const State = defineModel({
  version: '1.1',
  migrations: { '0→1.1': from0, '1.0→1.1': from10 },
  fields: {
    events: list(object({
      id: text(),
      title: text({ trim: true, nonEmpty: true }),
      date: date(),
      time: time({ step: 5, default: '09:00' }),
      duration: number({ integer: true, min: 5, default: 60 }),
      desc: text(),
      phase: phase(),
    })),
  },
  view: {
    viewMode: oneOf(['month', 'week']),
    axisFrom: number({ integer: true, min: 0, max: 23, default: 6 }),
    axisTo: number({ integer: true, min: 1, max: 24, default: 22 }),
    dayFrom: number({ integer: true, min: 0, max: 6, default: 0 }),
    dayTo: number({ integer: true, min: 0, max: 6, default: 6 }),
  },
  invariants: {
    axisOrder: { fields: ['axisFrom', 'axisTo'], test(m) { return m.axisFrom < m.axisTo; } },
    dayOrder: { fields: ['dayFrom', 'dayTo'], test(m) { return m.dayFrom <= m.dayTo; } },
  },
  commands: {
    addEvent: command({
      params: {
        title: text({ trim: true, nonEmpty: true }),
        date: date(),
        time: time({ step: 5, default: '09:00', optional: true }),
        duration: number({ integer: true, min: 5, default: 60, optional: true }),
        desc: text({ optional: true }),
        phase: phase({ optional: true }),
      },
      returns: text(),
      run({ title, date: day, time: start = '09:00', duration = 60, desc = '', phase: p }) {
        const id = uid();
        this.events.push({ id, title, date: day, time: start, duration, desc, phase: p ?? getPhaseIds(this.context.cycle)[0] });
        return id;
      },
    }),
    updateEvent: command({
      params: {
        id: idOf('events'),
        title: text({ trim: true, nonEmpty: true, optional: true }),
        date: date({ optional: true }),
        time: time({ step: 5, optional: true }),
        duration: number({ integer: true, min: 5, optional: true }),
        desc: text({ optional: true }),
        phase: phase({ optional: true }),
      },
      current({ id }) {
        const e = eventOf(this, id);
        return { title: e.title, date: e.date, time: e.time, duration: e.duration, desc: e.desc, phase: e.phase };
      },
      run({ id, ...changes }) {
        Object.assign(eventOf(this, id), changes);
      },
    }),
    removeEvent: command({
      params: { id: idOf('events') },
      confirm({ id }) { return { key: 'confirm.removeEvent', params: { title: eventOf(this, id).title } }; },
      run({ id }) {
        this.events.splice(this.events.findIndex((e) => e.id === id), 1);
      },
    }),
  },
});
