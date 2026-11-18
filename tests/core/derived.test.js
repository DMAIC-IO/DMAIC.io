/**
 * core/derived.js — evaluateDerived, derivedNames, derivedAccessor.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { defineModel, number } from '../../js/core/model.js';
import { storedSource } from '../helpers/stored-source.js';
import { derivedNames, derivedAccessor, evaluateDerived } from '../../js/core/derived.js';

const stub = Object.freeze({ read: () => ({}), list: () => [] });

suite('derived', () => {
  test('unbekannter Name in names wirft', () => {
    const M = defineModel({ derived: { a() { return 1; } } });
    assertThrows(() => evaluateDerived(new M(), stub, ['nope']), /unknown derived: nope/);
  });

  test('src wird unverändert als erstes Argument durchgereicht', () => {
    const src = Object.freeze({ read: () => ({}), list: () => [] });
    const seen = [];
    const M = defineModel({ derived: { a(s) { seen.push(s); return 1; }, b(s, d) { seen.push(s); return d.a; } } });
    evaluateDerived(new M(), src);
    assertEqual(seen.length, 2);
    assertTrue(seen.every((s) => s === src));
  });

  test('derivedNames: Namen in Deklarationsreihenfolge', () => {
    const M = defineModel({ derived: { b() { return 1; }, a() { return 2; } } });
    assertDeepEqual(derivedNames(M), ['b', 'a']);
  });

  test('this ist das Model, src der Leser', () => {
    const M = defineModel({ fields: { n: number({ default: 4 }) }, derived: { total(src) { return this.n + src.read('w', { sheetId: 's' }).rowCount; } } });
    const src = storedSource({ w: { sheets: [{ id: 's', name: 'S', state: { rowCount: 3, columns: [] } }] } });
    assertDeepEqual(evaluateDerived(new M(), src), { total: 7 });
  });

  test('Verkettung: d.a liefert a, a läuft einmal', () => {
    let calls = 0;
    const M = defineModel({ derived: {
      a() { calls += 1; return 10; },
      b(src, d) { return d.a + 1; },
      c(src, d) { return d.a + d.b; },
    } });
    assertDeepEqual(evaluateDerived(new M(), stub), { a: 10, b: 11, c: 21 });
    assertEqual(calls, 1);
  });

  test('ein Fehler wird { error }, die anderen liefern ihre Werte', () => {
    const M = defineModel({ derived: { ok() { return 1; }, bad() { throw new Error('x'); } } });
    assertDeepEqual(evaluateDerived(new M(), stub), { ok: 1, bad: { error: 'x' } });
  });

  test('Fehler pflanzt sich in einen lesenden Eintrag fort', () => {
    const M = defineModel({ derived: { bad() { throw new Error('x'); }, next(src, d) { return d.bad; } } });
    assertDeepEqual(evaluateDerived(new M(), stub), { bad: { error: 'x' }, next: { error: 'x' } });
  });

  test('Zyklus a → b → a: beide { error } mit cycle', () => {
    const M = defineModel({ derived: { a(src, d) { return d.b; }, b(src, d) { return d.a; } } });
    const r = evaluateDerived(new M(), stub);
    assertTrue(r.a.error.includes('cycle'), r.a.error);
    assertTrue(r.b.error.includes('cycle'), r.b.error);
    assertTrue(r.a.error.includes('a → b → a') || r.a.error.includes('b → a → b'), r.a.error);
  });

  test('names begrenzt die Auswertung', () => {
    let calls = 0;
    const M = defineModel({ derived: { a() { return 1; }, b() { calls += 1; return 2; } } });
    assertDeepEqual(evaluateDerived(new M(), stub, ['a']), { a: 1 });
    assertEqual(calls, 0);
  });

  test('names mit Verkettung auf einen nicht genannten Eintrag wertet ihn mit', () => {
    const M = defineModel({ derived: { a() { return 1; }, b(src, d) { return d.a + 1; } } });
    assertDeepEqual(evaluateDerived(new M(), stub, ['b']), { b: 2 });
  });

  test('derivedAccessor: eingefroren, ein Getter je Name', () => {
    const d = derivedAccessor(['x', 'y'], (n) => n.toUpperCase());
    assertTrue(Object.isFrozen(d));
    assertEqual(d.x, 'X');
    assertDeepEqual(Object.keys(d), ['x', 'y']);
  });
});
