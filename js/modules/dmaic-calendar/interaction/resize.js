/**
 * D.Mike — Projektkalender: Beginn oder Ende eines Termins ziehen.
 *
 * Griffe: obere Kante (`data-resize-edge="start"`), untere Kante (`data-resize-edge="end"`).
 * Raster 5 Minuten, kürzeste Dauer 5 Minuten, innerhalb der Achse.
 */
import { defineGesture } from '../../../core/interaction/define.js';
import { MIN_DUR, SNAP, mtt, ttm } from '../domain/layout.js';

export const resize = defineGesture({
  kind: 'resize',
  handle: '.module-calendar__ev-handle',
  /** @param {HTMLElement} el */
  start(el) {
    const b = /** @type {HTMLElement} */ (el.closest('[data-id]'));
    const s = ttm(b.dataset.time);
    return { id: b.dataset.id, start: s, end: s + Number(b.dataset.duration) };
  },
  locate(point, ctx, from) {
    const d = ctx.snap(point.y - ctx.origin.y, SNAP);
    return from.edge === 'start' ? { ...from, start: from.start + d } : { ...from, end: from.end + d };
  },
  step(pos, dir) {
    if (dir.y === 0) return null;
    const d = dir.y * SNAP;
    return pos.edge === 'start' ? { ...pos, start: pos.start + d } : { ...pos, end: pos.end + d };
  },
  clamp(pos) {
    const lo = this.model.axisFrom * 60;
    const hi = this.model.axisTo * 60;
    return pos.edge === 'start'
      ? { ...pos, start: Math.max(lo, Math.min(pos.start, pos.end - MIN_DUR)) }
      : { ...pos, end: Math.min(hi, Math.max(pos.end, pos.start + MIN_DUR)) };
  },
  preview(pos) {
    this.state.resizePreview = pos ? { id: pos.id, start: pos.start, end: pos.end } : null;
  },
  toCommand(from, to) {
    return ['updateEvent', { id: from.id, time: mtt(to.start), duration: to.end - to.start }];
  },
});
