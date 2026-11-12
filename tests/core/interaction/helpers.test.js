/**
 * Tests for core/interaction/helpers.js — reine Positionsrechnung
 * (Einfügeindex, Raster, Spalte, Tiefenvergleich, Kontext).
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { deepEqual, inside, listIndexAt, snap, columnAt, makeContext } from '../../../js/core/interaction/helpers.js';

/** Elemente mit fester Lage: Höhe/Breite 20, lückenlos ab 0. */
const rows = (n) => Array.from({ length: n }, (_, i) => ({
  getBoundingClientRect: () => ({ top: i * 20, height: 20, bottom: i * 20 + 20, left: 0, width: 100, right: 100 }),
}));
const cols = (n) => Array.from({ length: n }, (_, i) => ({
  getBoundingClientRect: () => ({ left: i * 50, width: 50, right: i * 50 + 50, top: 0, height: 300, bottom: 300 }),
}));

suite('interaction/helpers — listIndexAt', () => {
  test('vor der ersten Mitte → 0', () => assertEqual(listIndexAt(rows(3), { x: 0, y: 5 }), 0));
  test('zwischen zwei Mitten → Index dazwischen', () => assertEqual(listIndexAt(rows(3), { x: 0, y: 25 }), 1));
  test('hinter der letzten Mitte → Länge', () => assertEqual(listIndexAt(rows(3), { x: 0, y: 55 }), 3));
  test('leere Liste → 0', () => assertEqual(listIndexAt([], { x: 0, y: 99 }), 0));
  test('Achse x', () => {
    const items = cols(3);
    assertEqual(listIndexAt(items, { x: 60, y: 0 }, 'x'), 1);
    assertEqual(listIndexAt(items, { x: 140, y: 0 }, 'x'), 3);
  });
});

suite('interaction/helpers — snap, columnAt, inside', () => {
  test('snap rundet auf das Raster', () => {
    assertEqual(snap(44, 30), 30);
    assertEqual(snap(46, 30), 60);
    assertTrue(Object.is(snap(-1, 30), 0), 'kein -0');
  });
  test('columnAt liefert den Index oder null', () => {
    assertEqual(columnAt(cols(3), 10), 0);
    assertEqual(columnAt(cols(3), 120), 2);
    assertEqual(columnAt(cols(3), 150), null);
  });
  test('inside', () => {
    const r = { left: 0, top: 0, right: 10, bottom: 10 };
    assertTrue(inside(r, { x: 5, y: 5 }));
    assertTrue(!inside(r, { x: 11, y: 5 }));
  });
});

suite('interaction/helpers — deepEqual', () => {
  test('gleiche Struktur', () => assertTrue(deepEqual({ a: 1, b: [1, { c: 'x' }] }, { b: [1, { c: 'x' }], a: 1 })));
  test('abweichender Wert', () => assertTrue(!deepEqual({ a: 1 }, { a: 2 })));
  test('fehlender Schlüssel', () => assertTrue(!deepEqual({ a: 1 }, { a: 1, b: undefined })));
  test('null gegen Objekt', () => assertTrue(!deepEqual(null, {})));
  test('null gegen null', () => assertTrue(deepEqual(null, null)));
});

suite('interaction/helpers — makeContext', () => {
  test('columnAt ohne Selektor wirft', () => {
    const ctx = makeContext({ querySelectorAll: () => cols(2) });
    let threw = false;
    try { ctx.columnAt(70); } catch { threw = true; }
    assertTrue(threw, 'wirft ohne Selektor');
  });
  test('columnAt sucht im Container mit dem übergebenen Selektor', () => {
    const seen = [];
    const root = { querySelectorAll: (sel) => { seen.push(sel); return cols(2); } };
    const ctx = makeContext(root, { x: 1, y: 2 }, 'y');
    assertEqual(ctx.columnAt(70, '.pg-col'), 1);
    assertEqual(seen[0], '.pg-col');
    assertEqual(ctx.origin.y, 2);
    assertEqual(ctx.axis, 'y');
    assertTrue(Object.isFrozen(ctx));
  });
});
