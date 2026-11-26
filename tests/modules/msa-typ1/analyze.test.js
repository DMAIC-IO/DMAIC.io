/**
 * MSA Typ 1: Werte lesen, Studie rechnen und Spaltenkennwerte als reine Funktionen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { readValues, analyzeTyp1, columnStatsOf } from '../../../js/modules/msa-typ1/domain/analyze.js';
import { analyze, mean, stddev } from '../../../js/engines/msa-typ1-engine.js';
import { sheetSource } from '../../helpers/sheet-source.js';

const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });
const VALUES = Array.from({ length: 30 }, (_, i) => 10 + ((i % 7) - 3) * 0.001);
const P = { ref: 10, lsl: 9.9, usl: 10.1, k1: 0.2, k2: 3 };

suite('MSA Typ 1 analyze — readValues', () => {
  test('ohne Spalte leer', () => {
    assertDeepEqual(readValues({ columnRef: null }, sheetSource({ c: [1, 2] })), []);
  });
  test('gelöschte Spalte leer', () => {
    assertDeepEqual(readValues({ columnRef: ref('x') }, sheetSource({ c: [1, 2] })), []);
  });
  test('Text mit Komma zählt, Leerwerte, Text und Wahrheitswerte fallen heraus', () => {
    const src = sheetSource({ c: [1, '2,5', null, '', 'abc', true, 4] });
    assertDeepEqual(readValues({ columnRef: ref('c') }, src), [1, 2.5, 4]);
  });
});

suite('MSA Typ 1 analyze — analyzeTyp1', () => {
  test('ohne Werte null', () => {
    assertEqual(analyzeTyp1(P, []), null);
  });
  test('gleich der Engine bei gültigen Eingaben', () => {
    assertDeepEqual(analyzeTyp1(P, VALUES), analyze(P, VALUES));
  });
  test('fehlender Referenzwert: invalid errRefMissing', () => {
    assertDeepEqual(analyzeTyp1({ ...P, ref: null }, VALUES),
      { invalid: { key: 'modules.msa-typ1.errRefMissing', vars: null } });
  });
  test('keine Grenze: invalid errLimitsMissing', () => {
    assertEqual(analyzeTyp1({ ...P, lsl: null, usl: null }, VALUES).invalid.key, 'modules.msa-typ1.errLimitsMissing');
  });
  test('USG nicht unter OSG: invalid errUslLeqLsl', () => {
    assertEqual(analyzeTyp1({ ...P, lsl: 10.1, usl: 10.1 }, VALUES).invalid.key, 'modules.msa-typ1.errUslLeqLsl');
  });
  test('unter 25 Werten: invalid errTooFewValues mit n', () => {
    assertDeepEqual(analyzeTyp1(P, VALUES.slice(0, 24)).invalid,
      { key: 'modules.msa-typ1.errTooFewValues', vars: { n: 24 } });
  });
  test('eine Grenze: einseitig, ohne Cg', () => {
    const r = analyzeTyp1({ ...P, usl: null }, VALUES);
    assertEqual(r.mode, 'one-sided');
    assertEqual(r.Cg, null);
  });
  test('k₁ und k₂ wirken', () => {
    const a = analyzeTyp1(P, VALUES).Cg;
    const b = analyzeTyp1({ ...P, k2: 6 }, VALUES).Cg;
    assertTrue(Math.abs(a / b - 2) < 1e-9);
  });
});

suite('MSA Typ 1 analyze — columnStatsOf', () => {
  test('unter 2 Werten null', () => {
    assertEqual(columnStatsOf([]), null);
    assertEqual(columnStatsOf([5]), null);
  });
  test('ab 2 Werten n, Mittelwert und Standardabweichung wie die Engine', () => {
    assertDeepEqual(columnStatsOf([1, 3]), { n: 2, mean: mean([1, 3]), stdDev: stddev([1, 3]) });
    assertDeepEqual(columnStatsOf(VALUES), { n: 30, mean: mean(VALUES), stdDev: stddev(VALUES) });
  });
});
