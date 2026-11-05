/**
 * Tests for core/validate.js — die zwei Prüfer für Objektargumente und die
 * Weiterleitung aus core/agent/agent-argcheck.js.
 */
import { suite, test, assertEqual, assertThrows } from '../test-utils.js';
import * as validate from '../../js/core/validate.js';
import * as legacy from '../../js/core/agent/agent-argcheck.js';

const { requireKeys, requireForm } = validate;

suite('validate requireKeys', () => {
  const params = [{ name: 'sourceCol' }, { name: 'sourceIdx' }, { name: 'note', optional: true }];

  test('vollständiges Objekt besteht, optionaler Schlüssel darf fehlen', () => {
    requireKeys('moveItem', { sourceCol: 'a', sourceIdx: 0 }, params);
  });

  test('fehlender Pflichtschlüssel: Meldung wie requireArity', () => {
    let msg = '';
    try { requireKeys('moveItem', { sourceCol: 'a' }, params); } catch (e) { msg = e.message; }
    assertEqual(msg, 'missing argument "sourceIdx" of moveItem; expected: sourceCol, sourceIdx, [note]');
  });

  test('eigenes Nomen für Schlüssel eines Feldes', () => {
    assertThrows(() => requireKeys('columns', {}, [{ name: 'a' }], 'key'),
      /^missing key "a" of columns; expected: a$/);
  });
});

suite('validate requireForm', () => {
  test('gibt den Wert zurück, wenn die Form passt', () => {
    const v = [1];
    assertEqual(requireForm('items', v, true, 'a list'), v);
  });

  test('wirft mit allowed:-Satz', () => {
    let msg = '';
    try { requireForm('items', 'x', false, 'a list'); } catch (e) { msg = e.message; }
    assertEqual(msg, 'invalid items "x"; allowed: a list');
  });

  test('undefined erscheint lesbar', () => {
    assertThrows(() => requireForm('cmd', undefined, false, 'an object'), /^invalid cmd undefined; allowed: an object$/);
  });
});

suite('validate Weiterleitung', () => {
  test('agent-argcheck.js liefert dieselben Funktionen', () => {
    for (const name of ['requireEnum', 'requireKnownId', 'requireIndex', 'requireBoolean',
      'requireNumericText', 'requireArity', 'requireText', 'requireNumber', 'requireConfLevel']) {
      assertEqual(legacy[name], validate[name], name);
    }
  });
});

/** Das `param` eines geworfenen Fehlers, sonst 'no throw'. */
const paramOf = (fn) => { try { fn(); } catch (e) { return e.param; } return 'no throw'; };

suite('validate err.param', () => {
  test('Prüfer setzen den obersten Namen', () => {
    assertEqual(paramOf(() => validate.requireEnum('mode', 'x', ['a'])), 'mode');
    assertEqual(paramOf(() => validate.requireKnownId('columns key', 'x', ['a'])), 'columns');
    assertEqual(paramOf(() => validate.requireIndex('idx', 9, 2)), 'idx');
    assertEqual(paramOf(() => validate.requireBoolean('on', 'ja')), 'on');
    assertEqual(paramOf(() => validate.requireNumericText('v', null)), 'v');
    assertEqual(paramOf(() => validate.requireText('columns.suppliers[1]', 7)), 'columns');
    assertEqual(paramOf(() => validate.requireNumber('alpha', 'x')), 'alpha');
    assertEqual(paramOf(() => validate.requireNumber('alpha', 5, { max: 1 })), 'alpha');
    assertEqual(paramOf(() => validate.requireForm('items', 'x', false, 'a list')), 'items');
  });

  test('fehlender Schlüssel: der fehlende Parameter, beim Nomen key das Feld', () => {
    assertEqual(paramOf(() => validate.requireKeys('moveItem', {}, [{ name: 'col' }])), 'col');
    assertEqual(paramOf(() => validate.requireKeys('columns', {}, [{ name: 'a' }], 'key')), 'columns');
    assertEqual(paramOf(() => validate.requireArity('setCells', [], [{ name: 'columnId' }])), 'columnId');
  });

  test('Meldungstexte bleiben unverändert', () => {
    assertThrows(() => validate.requireText('columns.suppliers[1]', 7), /^invalid columns\.suppliers\[1\] 7; allowed: any string, "" clears it$/);
    assertThrows(() => validate.requireKeys('moveItem', {}, [{ name: 'col' }]), /^missing argument "col" of moveItem; expected: col$/);
  });
});
