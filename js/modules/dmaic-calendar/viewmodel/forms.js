/**
 * D.Mike — Projektkalender: Termin-Formular.
 *
 * Der Dialog zeigt Beginn und Ende; das Kommando kennt Beginn und Dauer.
 */
import { defineForm, text, date, time, phase } from '../../../core/model.js';
import { requireForm } from '../../../core/validate.js';
import { mtt, ttm } from '../domain/layout.js';

export const EventForm = defineForm({
  fields: {
    title: text({ trim: true, nonEmpty: true }),
    date: date(),
    time: time({ step: 5, default: '09:00' }),
    end: time({ step: 5, default: '10:00' }),
    desc: text(),
    phase: phase(),
  },
  fromParams({ title = '', date: day = '', time: start = '09:00', duration = 60, desc = '', phase: p }) {
    return { title, date: day, time: start, end: mtt(Math.min(ttm(start) + duration, 1435)), desc, ...(p === undefined ? {} : { phase: p }) };
  },
  toParams({ title, date: day, time: start, end, desc, phase: p }) {
    const duration = ttm(end) - ttm(start);
    requireForm('end', end, duration > 0, `a time after ${start}`);
    return { title, date: day, time: start, duration, desc, phase: p };
  },
});
