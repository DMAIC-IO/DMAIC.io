/**
 * D.Mike — Projektkalender: Monats- und Wochenrechnung.
 *
 * Reine Funktionen über Terminlisten und Ansichtswerte; kein Model, kein
 * DOM, keine Texte. In der Wochenansicht entspricht 1 px einer Minute ab
 * `axisFrom * 60`.
 */
import { addDaysISO, isIsoDate } from '../../../core/local-date.js';

/** Minutenraster der Termine. */
export const SNAP = 5;
/** Kürzeste Dauer in Minuten. */
export const MIN_DUR = 5;
/** Ziehraster der Wochenansicht in Minuten (ein Halbstundenfeld). */
export const SLOT = 30;

/** @param {number} n @returns {string} */
export const fmt2 = (n) => String(n).padStart(2, '0');
/** ISO-Datum aus Jahr, Monat (0-basiert) und Tag. @param {number} y @param {number} m @param {number} d @returns {string} */
export const dateKey = (y, m, d) => `${y}-${fmt2(m + 1)}-${fmt2(d)}`;
/** @param {Date} d @returns {string} ISO-Datum (lokal) */
export const isoOf = (d) => dateKey(d.getFullYear(), d.getMonth(), d.getDate());
/** @param {string} iso @returns {Date} 00:00 lokal */
export const dateOf = (iso) => new Date(`${iso}T00:00`);
/** Wochentag ab Montag. @param {Date} d @returns {number} 0 … 6 */
export const isoDow = (d) => (d.getDay() + 6) % 7;

/** Montag 00:00 der Woche von `d`. @param {Date} d @returns {Date} */
export function mondayOf(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - isoDow(out));
  return out;
}

/** Minuten → `HH:MM`, begrenzt auf 00:00–23:59. @param {number} m @returns {string} */
export function mtt(m) {
  const mm = Math.max(0, Math.min(1439, m));
  return `${fmt2(Math.floor(mm / 60))}:${fmt2(mm % 60)}`;
}

/** `HH:MM` → Minuten (leer → 09:00). @param {string} t @returns {number} */
export function ttm(t) {
  const [h, m] = String(t || '09:00').split(':').map(Number);
  return h * 60 + m;
}

/** Dauer als `30min`, `1h`, `1h 30min`. @param {number} m @returns {string} */
export function fmtDur(m) {
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}min` : `${h}h`;
}

/**
 * @typedef {{ id: string, title: string, date: string, time: string, duration: number, desc?: string, phase: string, todo?: { instanceId: string, itemId: string } }} CalendarEvent
 */

/** Termine einer Phase; `null` → alle. @param {CalendarEvent[]} events @param {string|null} filter @returns {CalendarEvent[]} */
export function byPhase(events, filter) {
  return filter ? events.filter((e) => e.phase === filter) : events.slice();
}

/** Termine eines Tages, nach Beginn. @param {CalendarEvent[]} events @param {string} iso @param {string|null} filter @returns {CalendarEvent[]} */
export function eventsOn(events, iso, filter) {
  return byPhase(events, filter).filter((e) => e.date === iso).sort((a, b) => a.time.localeCompare(b.time));
}

/** Die nächsten `n` Termine ab `today`. @param {CalendarEvent[]} events @param {string} today @param {number} [n] @returns {CalendarEvent[]} */
export function nextEvents(events, today, n = 5) {
  return events.filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .slice(0, n);
}

/**
 * Tageszellen eines Monats, aufgefüllt auf volle Wochen. Füllzellen tragen
 * ihr Datum, aber keine Termine.
 * @param {CalendarEvent[]} events @param {number} year @param {number} month 0-basiert @param {string|null} filter
 * @returns {{ num: number, other: boolean, iso: string, dow: number, events: CalendarEvent[] }[]}
 */
export function monthCells(events, year, month, filter) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - isoDow(first));
  const last = new Date(year, month + 1, 0);
  const count = Math.ceil((isoDow(first) + last.getDate()) / 7) * 7;
  const cells = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = isoOf(d);
    const other = d.getMonth() !== month;
    cells.push({ num: d.getDate(), other, iso, dow: isoDow(d), events: other ? [] : eventsOn(events, iso, filter) });
  }
  return cells;
}

/** `from` … `to` einschließlich. @param {number} from @param {number} to @returns {number[]} */
export function dayRange(from, to) {
  const out = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

/** Angezeigte Stunden [von, bis). @param {number} axisFrom @param {number} axisTo @returns {number[]} */
export function hourList(axisFrom, axisTo) {
  const out = [];
  for (let h = axisFrom; h < axisTo; h++) out.push(h);
  return out;
}

/** Halbstundenfelder (Startminute) der Achse. @param {number} axisFrom @param {number} axisTo @returns {number[]} */
export function slotList(axisFrom, axisTo) {
  const out = [];
  for (let m = axisFrom * 60; m < axisTo * 60; m += SLOT) out.push(m);
  return out;
}

/** Sichtbare Tage der Woche ab `weekStart` (Montag) als ISO-Datum. @param {string} weekStart @param {number} dayFrom @param {number} dayTo @returns {string[]} */
export function weekDates(weekStart, dayFrom, dayTo) {
  return dayRange(dayFrom, dayTo).map((i) => addDaysISO(weekStart, i));
}

/** @param {string} iso @param {number} weeks @returns {string} */
export const shiftWeek = (iso, weeks) => addDaysISO(iso, 7 * weeks);

/** Minuten → Abstand vom oberen Rand der Achse in px. @param {number} min @param {number} axisFrom @returns {number} */
export const minToPx = (min, axisFrom) => min - axisFrom * 60;

/** Halbstundenfeld unter `y` px (relativ zur Spalte), begrenzt auf die Achse. @param {number} y @param {number} axisFrom @param {number} axisTo @returns {number} */
export function slotAt(y, axisFrom, axisTo) {
  const m = axisFrom * 60 + Math.floor(y / SLOT) * SLOT;
  return Math.max(axisFrom * 60, Math.min(m, axisTo * 60 - SLOT));
}

/** Beginn eines Termins so begrenzen, dass er in der Achse liegt. @param {number} min @param {number} duration @param {number} axisFrom @param {number} axisTo @returns {number} */
export function clampStart(min, duration, axisFrom, axisTo) {
  return Math.max(axisFrom * 60, Math.min(min, axisTo * 60 - duration));
}

/**
 * Termine von `today` (einschließlich) bis `today + horizonDays` (ausschließlich), nach Datum und Zeit.
 * @param {CalendarEvent[]} events @param {string} today @param {number} horizonDays @returns {CalendarEvent[]}
 */
export function upcomingEvents(events, today, horizonDays) {
  const end = addDaysISO(today, horizonDays);
  return events
    .filter((e) => isIsoDate(e.date) && e.date >= today && e.date < end)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
