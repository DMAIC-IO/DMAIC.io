/**
 * Verlauf je Modulinstanz (core/module-history.js) — reine Klasse.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
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
