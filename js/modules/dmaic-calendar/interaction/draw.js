/**
 * D.Mike — Projektkalender: Bereich in der Woche aufziehen.
 *
 * Griff: Halbstundenfeld der Wochenansicht. Abschluss öffnet den
 * Termindialog mit dem Bereich als Startwerten (`newEventInRange`).
 */
import { defineGesture } from '../../../core/interaction/define.js';
import { SLOT, slotAt } from '../domain/layout.js';

export const draw = defineGesture({
  kind: 'draw',
  handle: '.module-calendar__week-slot',
  /** @param {HTMLElement} el */
  start(el) { return { date: el.dataset.date, min: Number(el.dataset.min) }; },
  locate(point, ctx, from) {
    const col = ctx.root.querySelector(`.module-calendar__week-day-col[data-date="${from.date}"]`);
    if (!col) return null;
    return { date: from.date, min: slotAt(point.y - col.getBoundingClientRect().top, this.model.axisFrom, this.model.axisTo) };
  },
  preview(pos) {
    if (pos === null) { this.state.drawPreview = null; return; }
    const p = this.state.drawPreview;
    this.state.drawPreview = p ? { ...p, to: pos.min } : { date: pos.date, from: pos.min, to: pos.min };
  },
  toAction(from, to) {
    const lo = Math.min(from.min, to.min);
    const hi = Math.max(from.min, to.min);
    this.newEventInRange(from.date, lo, hi + SLOT);
  },
});
