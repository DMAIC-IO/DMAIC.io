/**
 * Verlauf je Modulinstanz (core/module-history.js) — reine Klasse.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { ModuleHistory } from '../../js/core/module-history.js';

const fresh = (opts) => { const h = new ModuleHistory(opts); h.reset('a'); return h; };

suite('ModuleHistory', () => {
  test('nach reset gibt es nichts zurückzunehmen', () => {
    const h = fresh();
    assertEqual(h.canUndo, false);
    assertEqual(h.canRedo, false);
    h.record('a');
    assertEqual(h.canUndo, false, 'gleicher Stand erzeugt keinen Schritt');
  });

  test('record, undo, redo', () => {
    const h = fresh();
    h.record('b');
    assertTrue(h.canUndo);
    assertEqual(h.undo(), 'a');
    assertTrue(h.canRedo);
    assertEqual(h.redo(), 'b');
    assertEqual(h.canRedo, false);
  });

  test('undo und redo ohne Eintrag liefern null', () => {
    const h = fresh();
    assertEqual(h.undo(), null);
    assertEqual(h.redo(), null);
  });

  test('neuer Schritt nach undo leert Wiederholen', () => {
    const h = fresh();
    h.record('b');
    h.undo();
    h.record('c');
    assertEqual(h.canRedo, false);
    assertEqual(h.undo(), 'a');
  });

  test('Tiefe 3 mit fünf Schritten: drei Stände, dann null', () => {
    const h = fresh({ depth: 3 });
    for (const s of ['b', 'c', 'd', 'e', 'f']) h.record(s);
    assertEqual(h.undo(), 'e');
    assertEqual(h.undo(), 'd');
    assertEqual(h.undo(), 'c');
    assertEqual(h.undo(), null);
  });

  test('begin, mehrere record, end: ein Schritt', () => {
    const h = fresh();
    h.begin();
    h.record('b');
    h.record('bc');
    h.end();
    assertEqual(h.undo(), 'a');
    assertEqual(h.undo(), null);
    assertEqual(h.redo(), 'bc');
  });

  test('begin/end around two records gives one undo step', () => {
    const h = fresh();
    h.begin();
    h.record('b');
    h.record('c');
    h.end();
    assertEqual(h.undo(), 'a');
    assertEqual(h.canUndo, false);
    assertEqual(h.redo(), 'c');
  });

  test('isOpen zeigt einen offenen Schritt', () => {
    const h = fresh();
    assertEqual(h.isOpen, false);
    h.begin();
    assertEqual(h.isOpen, true);
    h.end();
    assertEqual(h.isOpen, false);
  });

  test('begin und end ohne record: kein Schritt', () => {
    const h = fresh();
    h.begin();
    h.end();
    assertEqual(h.canUndo, false);
  });

  test('offener Schritt, der zum Ausgangsstand zurückkehrt, bleibt ohne Eintrag', () => {
    const h = fresh();
    h.begin();
    h.record('b');
    h.record('a');
    h.end();
    assertEqual(h.canUndo, false);
  });

  test('undo bei offenem Schritt schließt ihn zuerst (Knopf löst focusout vorher aus)', () => {
    const h = fresh();
    h.begin();
    h.record('x');
    h.end();
    assertEqual(h.undo(), 'a');
    assertEqual(h.redo(), 'x');
  });

  test('undo bei noch offenem Schritt nimmt den ganzen Schritt zurück', () => {
    const h = fresh();
    h.begin();
    h.record('x');
    h.record('xy');
    assertEqual(h.undo(), 'a');
    assertEqual(h.redo(), 'xy');
  });
});

suite('ModuleHistory — Umkehr-Kommandos', () => {
  const u = (n) => ({ type: 'u', n });
  const r = (n) => ({ type: 'r', n });
  const inv = () => { const h = new ModuleHistory(); h.reset(null); return h; };

  test('recordInverse, dann undo und redo liefern die Kommandos', () => {
    const h = inv();
    h.recordInverse([u(1)], [r(1)]);
    assertTrue(h.canUndo);
    assertDeepEqual(h.undo(), { kind: 'inverse', cmds: [u(1)] });
    assertTrue(h.canRedo);
    assertDeepEqual(h.redo(), { kind: 'inverse', cmds: [r(1)] });
    assertEqual(h.canRedo, false);
  });

  test('offener Schritt: undo neueste zuerst, redo in Reihenfolge', () => {
    const h = inv();
    h.begin();
    h.recordInverse([u(1)], [r(1)]);
    h.recordInverse([u(2)], [r(2)]);
    h.end();
    assertDeepEqual(h.undo(), { kind: 'inverse', cmds: [u(2), u(1)] });
    assertEqual(h.canUndo, false, 'ein Schritt');
    assertDeepEqual(h.redo(), { kind: 'inverse', cmds: [r(1), r(2)] });
  });

  test('Tiefe 3 mit 4 Schritten: der älteste fällt weg', () => {
    const h = new ModuleHistory({ depth: 3 });
    h.reset(null);
    for (const n of [1, 2, 3, 4]) h.recordInverse([u(n)], [r(n)]);
    assertDeepEqual(h.undo().cmds, [u(4)]);
    assertDeepEqual(h.undo().cmds, [u(3)]);
    assertDeepEqual(h.undo().cmds, [u(2)]);
    assertEqual(h.undo(), null);
  });

  test('neuer Schritt nach undo leert Wiederholen', () => {
    const h = inv();
    h.recordInverse([u(1)], [r(1)]);
    h.undo();
    h.recordInverse([u(2)], [r(2)]);
    assertEqual(h.canRedo, false);
  });

  test('replaceInverse ersetzt die Gegenrichtung des eben bewegten Schritts', () => {
    const h = inv();
    h.recordInverse([u(1)], [r(1)]);
    h.undo();
    h.replaceInverse([r(9)]);
    assertDeepEqual(h.redo().cmds, [r(9)]);
    h.replaceInverse([u(9)]);
    assertDeepEqual(h.undo().cmds, [u(9)]);
  });

  test('Abzugsschritte (record) liefern weiter Text', () => {
    const h = fresh();
    h.record('b');
    assertEqual(h.undo(), 'a');
    assertEqual(h.redo(), 'b');
  });
});
