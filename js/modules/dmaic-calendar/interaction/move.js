/**
 * D.Mike — Projektkalender: Termin verschieben (auch über Tage).
 *
 * Griff: Inhalt des Terminblocks. Zeiger: Tag aus der Spalte unter dem
 * Zeiger, Beginn im 5-Minuten-Raster. Tastatur: hoch/runter 15 Minuten,
 * links/rechts ein sichtbarer Tag. Ein Aufgabentermin (`data-todo-instance`,
 * `data-todo-item` am Block) ändert Zieldatum und Beginn der Aufgabe.
 */
import { defineGesture } from '../../../core/interaction/define.js';
import { SNAP, clampStart, mtt, ttm } from '../domain/layout.js';

const COLUMN = '.module-calendar__week-day-col';
/** Minuten je Tastaturschritt. */
const KEY_STEP = 3 * SNAP;

/**
 * Aufgabenliste und Aufgabe eines Aufgabentermins (`data-todo-instance`,
 * `data-todo-item` am Block), sonst nichts.
 * @param {HTMLElement} b @returns {{ todoInstance?: string, todoItem?: string }}
 */
const todoOf = (b) => (b.dataset.todoInstance && b.dataset.todoItem
  ? { todoInstance: b.dataset.todoInstance, todoItem: b.dataset.todoItem } : {});

export const move = defineGesture({
  kind: 'move',
  handle: '.module-calendar__week-ev-content',
  /** @param {HTMLElement} el */
  start(el) {
    const b = /** @type {HTMLElement} */ (el.closest('[data-id]'));
    return { id: b.dataset.id, date: b.dataset.date, min: ttm(b.dataset.time), duration: Number(b.dataset.duration), ...todoOf(b) };
  },
  locate(point, ctx, from) {
    const i = ctx.columnAt(point.x, COLUMN);
    const cols = [...ctx.root.querySelectorAll(COLUMN)];
    return { ...from, date: i === null ? from.date : cols[i].dataset.date, min: from.min + ctx.snap(point.y - ctx.origin.y, SNAP) };
  },
  step(pos, dir, ctx) {
    if (dir.y !== 0) return { ...pos, min: pos.min + dir.y * KEY_STEP };
    const dates = [...ctx.root.querySelectorAll(COLUMN)].map((c) => c.dataset.date);
    const i = dates.indexOf(pos.date) + dir.x;
    return i < 0 || i >= dates.length ? null : { ...pos, date: dates[i] };
  },
  clamp(pos) {
    return { ...pos, min: clampStart(pos.min, pos.duration, this.model.axisFrom, this.model.axisTo) };
  },
  preview(pos) {
    this.state.movePreview = pos ? { id: pos.id, date: pos.date, min: pos.min } : null;
  },
  toCommand(from, to) {
    if (from.todoInstance) return ['editTodoEvent', { instanceId: from.todoInstance, itemId: from.todoItem, date: to.date, time: mtt(to.min) }];
    return ['updateEvent', { id: from.id, date: to.date, time: mtt(to.min) }];
  },
});
