/**
 * Tests for dmaic-calendar/interaction — Bindung der Kern-Gesten draw, move,
 * resize (reine Callbacks mit Attrappen für Host, Element und ctx).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { draw } from '../../js/modules/dmaic-calendar/interaction/draw.js';
import { move } from '../../js/modules/dmaic-calendar/interaction/move.js';
import { resize } from '../../js/modules/dmaic-calendar/interaction/resize.js';

const host = () => ({
  model: { axisFrom: 6, axisTo: 22 },
  state: { drawPreview: null, movePreview: null, resizePreview: null },
  ranges: [],
  newEventInRange(date, lo, hi) { this.ranges.push([date, lo, hi]); },
});
const col = (date, left) => ({ dataset: { date }, getBoundingClientRect: () => ({ left, right: left + 100, top: 100, bottom: 1060 }) });
const COLS = [col('2026-11-02', 0), col('2026-11-03', 100)];
const ctx = (origin = { x: 10, y: 400 }) => ({
  root: {
    querySelector: (sel) => COLS.find((c) => sel.includes(c.dataset.date)) ?? null,
    querySelectorAll: () => COLS,
  },
  origin,
  snap: (v, step) => Math.round(v / step) * step || 0,
  columnAt: (x) => { const i = COLS.findIndex((c) => x >= c.getBoundingClientRect().left && x < c.getBoundingClientRect().right); return i < 0 ? null : i; },
});
const block = { dataset: { id: 'e1', date: '2026-11-02', time: '09:00', duration: '60' } };
const handle = (dataset = {}) => ({ dataset, closest: () => block });

suite('dmaic-calendar: draw', () => {
  test('aufziehen in der Tagesspalte öffnet den Dialog mit dem Bereich', () => {
    const h = host();
    const from = draw.start.call(h, { dataset: { date: '2026-11-02', min: '480' } });
    assertDeepEqual(from, { date: '2026-11-02', min: 480 });
    const to = draw.locate.call(h, { x: 10, y: 250 }, ctx(), from);
    assertDeepEqual(to, { date: '2026-11-02', min: 510 });
    draw.preview.call(h, from);
    draw.preview.call(h, to);
    assertDeepEqual(h.state.drawPreview, { date: '2026-11-02', from: 480, to: 510 });
    draw.toAction.call(h, from, to);
    assertDeepEqual(h.ranges, [['2026-11-02', 480, 540]]);
    draw.preview.call(h, null);
    assertEqual(h.state.drawPreview, null);
  });
  test('nach oben aufgezogen: Bereich wird sortiert', () => {
    const h = host();
    draw.toAction.call(h, { date: '2026-11-02', min: 600 }, { date: '2026-11-02', min: 540 });
    assertDeepEqual(h.ranges, [['2026-11-02', 540, 630]]);
  });
});

suite('dmaic-calendar: move', () => {
  test('über Tage verschieben, im Raster, Kommando updateEvent', () => {
    const h = host();
    const from = move.start.call(h, handle());
    assertDeepEqual(from, { id: 'e1', date: '2026-11-02', min: 540, duration: 60 });
    const raw = move.locate.call(h, { x: 150, y: 431 }, ctx(), from);
    const to = move.clamp.call(h, raw, ctx(), from);
    assertDeepEqual(to, { id: 'e1', date: '2026-11-03', min: 570, duration: 60 });
    assertDeepEqual(move.toCommand.call(h, from, to), ['updateEvent', { id: 'e1', date: '2026-11-03', time: '09:30' }]);
    move.preview.call(h, to);
    assertDeepEqual(h.state.movePreview, { id: 'e1', date: '2026-11-03', min: 570 });
  });
  test('Tastatur: 15 Minuten je Schritt, Tag über links/rechts, Rand → null', () => {
    const h = host();
    const pos = { id: 'e1', date: '2026-11-02', min: 540, duration: 60 };
    assertEqual(move.step.call(h, pos, { x: 0, y: 1 }, ctx(null), pos).min, 555);
    assertEqual(move.step.call(h, pos, { x: 1, y: 0 }, ctx(null), pos).date, '2026-11-03');
    assertEqual(move.step.call(h, pos, { x: -1, y: 0 }, ctx(null), pos), null);
  });
  test('clamp hält den Termin in der Achse', () => {
    const h = host();
    assertEqual(move.clamp.call(h, { id: 'e1', date: 'x', min: 1300, duration: 60 }).min, 1260);
  });
});

suite('dmaic-calendar: resize', () => {
  test('untere Kante: Dauer, Kommando mit Zeit und Dauer', () => {
    const h = host();
    const from = resize.start.call(h, handle({ edge: 'end' }));
    assertDeepEqual(from, { id: 'e1', start: 540, end: 600, edge: 'end' });
    const to = resize.clamp.call(h, resize.locate.call(h, { x: 10, y: 445 }, ctx(), from), ctx(), from);
    assertEqual(to.end, 645);
    assertDeepEqual(resize.toCommand.call(h, from, to), ['updateEvent', { id: 'e1', time: '09:00', duration: 105 }]);
  });
  test('obere Kante: nie hinter das Ende minus 5 Minuten', () => {
    const h = host();
    const from = resize.start.call(h, handle({ edge: 'start' }));
    const to = resize.clamp.call(h, resize.locate.call(h, { x: 10, y: 520 }, ctx(), from), ctx(), from);
    assertEqual(to.start, 595);
    assertDeepEqual(resize.toCommand.call(h, from, to), ['updateEvent', { id: 'e1', time: '09:55', duration: 5 }]);
  });
  test('Tastatur: nur hoch/runter', () => {
    const h = host();
    const pos = { id: 'e1', start: 540, end: 600, edge: 'end' };
    assertEqual(resize.step.call(h, pos, { x: 0, y: -1 }).end, 595);
    assertEqual(resize.step.call(h, pos, { x: 1, y: 0 }), null);
  });
});
