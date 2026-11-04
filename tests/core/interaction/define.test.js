/**
 * Tests for core/interaction/define.js — defineGesture prüft die
 * Definition (Spec C §5) und mischt die Vorgaben der Art darunter.
 */
import { suite, test, assertEqual, assertTrue, assertThrows } from '../../test-utils.js';
import { defineGesture, isGesture } from '../../../js/core/interaction/define.js';
import { reorder } from '../../../js/core/interaction/gestures/reorder.js';

const moveDef = () => ({
  kind: 'move',
  handle: '.h',
  start(el) { return { id: el.dataset.id }; },
  locate(point, ctx, from) { return from; },
  step(pos) { return pos; },
  preview(pos) { this.p = pos; },
  toCommand(from, to) { return ['move', to]; },
});

suite('interaction/define — gültige Definitionen', () => {
  test('Ergebnis ist eingefroren und erkennbar', () => {
    const g = defineGesture(moveDef());
    assertTrue(Object.isFrozen(g));
    assertTrue(isGesture(g));
    assertTrue(!isGesture(moveDef()));
  });

  test('reorder bekommt die Vorgaben', () => {
    const g = defineGesture({ kind: 'reorder', handle: '.h', preview(p) { this.p = p; }, toCommand: (f, t) => ['m', t] });
    assertEqual(g.locate, reorder.locate);
    assertEqual(g.step, reorder.step);
    assertEqual(g.axis, 'y');
  });

  test('Modul überschreibt Vorgaben', () => {
    const own = function step() { return null; };
    const g = defineGesture({ kind: 'reorder', handle: '.h', axis: 'x', step: own, preview(p) { this.p = p; }, toCommand: () => ['m', {}] });
    assertEqual(g.step, own);
    assertEqual(g.axis, 'x');
  });

  test('move ohne clamp → clamp unverändert', () => {
    const g = defineGesture(moveDef());
    const pos = { a: 1 };
    assertEqual(g.clamp(pos), pos);
  });

  test('resize ergänzt edge aus data-edge, this = Host', () => {
    const g = defineGesture({ ...moveDef(), kind: 'resize', start(el) { return { id: el.dataset.id, who: this.name }; } });
    const host = { name: 'host' };
    assertEqual(g.start.call(host, { dataset: { id: 'k', edge: 'start' } }).edge, 'start');
    const end = g.start.call(host, { dataset: { id: 'k' } });
    assertEqual(end.edge, 'end');
    assertEqual(end.who, 'host');
  });

  test('draw mit toAction', () => {
    const g = defineGesture({ kind: 'draw', handle: '.s', start: () => ({}), locate: () => ({}), preview(p) { this.p = p; }, toAction(f, t) { this.open(f, t); } });
    assertTrue(isGesture(g));
  });
});

suite('interaction/define — Ablehnung', () => {
  test('unbekanntes kind', () => {
    assertThrows(() => defineGesture({ ...moveDef(), kind: 'fling' }), /unknown gesture kind "fling"; available: reorder, move, resize, draw/);
  });
  test('fehlender handle', () => {
    const d = moveDef(); delete d.handle;
    assertThrows(() => defineGesture(d), /missing key "handle" of defineGesture\(move\); expected: a CSS selector/);
  });
  for (const key of ['start', 'locate', 'step', 'preview', 'toCommand']) {
    test(`move ohne ${key}`, () => {
      const d = moveDef(); delete d[key];
      assertThrows(() => defineGesture(d), new RegExp(`missing key "${key}" of defineGesture\\(move\\); expected: a function`));
    });
  }
  test('draw ohne toAction', () => {
    assertThrows(() => defineGesture({ kind: 'draw', handle: '.s', start: () => ({}), locate: () => ({}), preview(p) { this.p = p; } }),
      /missing key "toAction" of defineGesture\(draw\)/);
  });
  test('toCommand an draw', () => {
    assertThrows(() => defineGesture({ kind: 'draw', handle: '.s', start: () => ({}), locate: () => ({}), preview(p) { this.p = p; }, toAction() {}, toCommand: () => [] }),
      /invalid toCommand of defineGesture\(draw\); allowed: toAction/);
  });
  test('toAction an move', () => {
    assertThrows(() => defineGesture({ ...moveDef(), toAction() {} }), /invalid toAction of defineGesture\(move\); allowed: toCommand/);
  });
  test('Pfeilfunktion als preview', () => {
    assertThrows(() => defineGesture({ ...moveDef(), preview: (pos) => pos }), /invalid preview of defineGesture\(move\); allowed: a method or function/);
  });
  test('Pfeilfunktion als toAction', () => {
    assertThrows(() => defineGesture({ kind: 'draw', handle: '.s', start: () => ({}), locate: () => ({}), preview(p) { this.p = p; }, toAction: () => {} }),
      /invalid toAction of defineGesture\(draw\); allowed: a method or function/);
  });
  test('Callback ist keine Funktion', () => {
    assertThrows(() => defineGesture({ ...moveDef(), clamp: 3 }), /invalid clamp of defineGesture\(move\); allowed: a function/);
  });
  test('ungültige Achse', () => {
    assertThrows(() => defineGesture({ kind: 'reorder', handle: '.h', axis: 'z', preview(p) { this.p = p; }, toCommand: () => [] }),
      /invalid axis "z" of defineGesture\(reorder\); allowed: x, y/);
  });
});
