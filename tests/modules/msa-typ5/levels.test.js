import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { effectiveLevels, engineLevels, ratingValues } from '../../../js/modules/msa-typ5/domain/levels.js';

const none = { positiveLevel: null };

suite('MSA Typ 5 — effectiveLevels', () => {
  test('Zahlen zahlenbewusst, Text alphabetisch', () => {
    assertDeepEqual(effectiveLevels(none, ['2', '10', '1']).all, ['1', '2', '10']);
    assertDeepEqual(effectiveLevels(none, ['b', 'a']).all, ['a', 'b']);
  });
  test('gespeicherte positive Stufe fehlt: häufigste', () => {
    const l = effectiveLevels({ positiveLevel: 'x' }, ['a', 'b', 'b']);
    assertEqual(l.positive, 'b');
    assertEqual(l.negative, 'a');
  });
  test('gespeicherte positive Stufe vorhanden', () => {
    const l = effectiveLevels({ positiveLevel: 'b' }, ['a', 'a', 'b']);
    assertEqual(l.positive, 'b');
    assertEqual(l.negative, 'a');
  });
  test('nur eine Stufe: negative null', () => {
    const l = effectiveLevels(none, ['i.O.', 'i.O.']);
    assertEqual(l.positive, 'i.O.');
    assertEqual(l.negative, null);
  });
  test('null und leere Werte', () => {
    assertDeepEqual(effectiveLevels(none, null), { all: [], positive: null, negative: null });
    assertDeepEqual(effectiveLevels(none, ['', null]), { all: [], positive: null, negative: null });
  });
  test('ratingValues: lang, breit, ohne Spalte', () => {
    assertDeepEqual(ratingValues('long', ['a'], []), ['a']);
    assertDeepEqual(ratingValues('wide', null, [['a'], ['b']]), ['a', 'b']);
    assertEqual(ratingValues('wide', null, []), null);
    assertEqual(ratingValues('long', null, []), null);
  });
});

suite('MSA Typ 5 — engineLevels', () => {
  const rows = ['1', '10', '2'].map((value) => ({ value }));
  test('nominal: sort() ohne Vergleicher', () => {
    assertDeepEqual(engineLevels('nominal', rows, null), ['1', '10', '2']);
  });
  test('ordinal: zahlenbewusst', () => {
    assertDeepEqual(engineLevels('ordinal', rows, null), ['1', '2', '10']);
  });
  test('binär: positive Stufe zuerst', () => {
    const r = ['i.O.', 'n.i.O.', 'i.O.'].map((value) => ({ value }));
    assertDeepEqual(engineLevels('binary', r, 'n.i.O.'), ['n.i.O.', 'i.O.']);
    assertDeepEqual(engineLevels('binary', r, 'fehlt'), ['i.O.', 'n.i.O.']);
  });
});
