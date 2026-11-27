/**
 * MSA Typ 6: Spalten paaren, Studie rechnen und Driftachse als reine Funktionen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { readInputs, engineInputs, analyzeTyp6, driftAxis } from '../../../js/modules/msa-typ6/domain/analyze.js';
import { analyze } from '../../../js/engines/msa-typ6-engine.js';
import { sheetSource } from '../../helpers/sheet-source.js';

const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });
const cols = (value, timestamp = null, subgroup = null) => ({ columns: { value, timestamp, subgroup } });
/** 30 Werte um 10, leicht schwankend. */
const VALUES = Array.from({ length: 30 }, (_, i) => 10 + (((i * 7) % 11) - 5) * 0.01);
const P = { chartType: 'i-mr', limitsMode: 'from-study', baselineK: 20, mu0: null, sigma0: null, enabledRules: [1, 2, 3, 4, 5, 6], alpha: 0.05 };

suite('MSA Typ 6 analyze — readInputs', () => {
  test('ohne Messwertspalte null', () => {
    assertEqual(readInputs(cols(null), sheetSource({ v: [1, 2] })), null);
  });
  test('gelöschte Messwertspalte null', () => {
    assertEqual(readInputs(cols(ref('weg')), sheetSource({ v: [1, 2] })), null);
  });
  test('Paarbildung: Zeilen ohne lesbaren Messwert entfallen samt Zeitstempel und Untergruppe', () => {
    const src = sheetSource({
      v: [1, '2,5', null, '', 'abc', true, 4],
      t: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      g: [1, 1, 2, 2, 3, 3, 4],
    });
    assertDeepEqual(readInputs(cols(ref('v'), ref('t'), ref('g')), src),
      { values: [1, 2.5, 4], timestamps: ['a', 'b', 'g'], subgroups: [1, 1, 4] });
  });
  test('ohne Zeit- und Untergruppenspalte null in beiden', () => {
    assertDeepEqual(readInputs(cols(ref('v')), sheetSource({ v: [3, 4] })), { values: [3, 4], timestamps: null, subgroups: null });
  });
  test('gelöschte Zeitspalte: Zeitstempel leer je Zeile (wie die Altform)', () => {
    assertDeepEqual(readInputs(cols(ref('v'), ref('weg')), sheetSource({ v: [3, 4] })).timestamps, [null, null]);
  });
  test('keine lesbaren Werte: null', () => {
    assertEqual(readInputs(cols(ref('v')), sheetSource({ v: ['x', null] })), null);
  });
});

suite('MSA Typ 6 analyze — analyzeTyp6', () => {
  test('ohne Eingaben null', () => {
    assertEqual(analyzeTyp6(P, null), null);
  });
  test('gleich der Engine mit der Eingabe der Altform', () => {
    const inputs = { values: VALUES, timestamps: null, subgroups: null };
    assertDeepEqual(analyzeTyp6(P, inputs), analyze({
      chartType: 'i-mr', values: VALUES, subgroups: null, timestamps: null, limitsMode: 'from-study',
      baselineK: 20, mu0: NaN, sigma0: NaN, enabledRules: [1, 2, 3, 4, 5, 6], alpha: 0.05,
    }));
  });
  test('Untergruppen gehen nur bei x̄-R an die Engine', () => {
    const inputs = { values: [1, 2], timestamps: null, subgroups: [1, 1] };
    assertEqual(engineInputs(P, inputs).subgroups, null);
    assertDeepEqual(engineInputs({ ...P, chartType: 'xbar-r' }, inputs).subgroups, [1, 1]);
  });
  test('vorgegebene Grenzen ohne σ₀: invalid E_SIGMA0_MISSING', () => {
    const r = analyzeTyp6({ ...P, limitsMode: 'given', mu0: 10, sigma0: null }, { values: VALUES, timestamps: null, subgroups: null });
    assertDeepEqual(r, { invalid: { code: 'E_SIGMA0_MISSING', params: null } });
  });
  test('vorgegebene Grenzen mit σ₀ ≤ 0 oder ohne μ₀: invalid E_GIVEN_LIMITS_INVALID', () => {
    const inputs = { values: VALUES, timestamps: null, subgroups: null };
    assertDeepEqual(analyzeTyp6({ ...P, limitsMode: 'given', mu0: 10, sigma0: 0 }, inputs), { invalid: { code: 'E_GIVEN_LIMITS_INVALID', params: null } });
    assertDeepEqual(analyzeTyp6({ ...P, limitsMode: 'given', mu0: null, sigma0: 0.002 }, inputs), { invalid: { code: 'E_GIVEN_LIMITS_INVALID', params: null } });
  });
  test('zu wenige Punkte: invalid mit Mindestzahl', () => {
    const r = analyzeTyp6(P, { values: VALUES.slice(0, 5), timestamps: null, subgroups: null });
    assertDeepEqual(r, { invalid: { code: 'E_TOO_FEW_POINTS', params: { min: 10 } } });
  });
  test('baselineK unter 5: invalid E_BASELINE_TOO_SMALL', () => {
    const r = analyzeTyp6({ ...P, baselineK: 4 }, { values: VALUES, timestamps: null, subgroups: null });
    assertEqual(r.invalid.code, 'E_BASELINE_TOO_SMALL');
  });
  test('baselineK über den Daten: invalid mit k und available', () => {
    const r = analyzeTyp6({ ...P, baselineK: 40 }, { values: VALUES, timestamps: null, subgroups: null });
    assertDeepEqual(r.invalid, { code: 'E_BASELINE_EXCEEDS_DATA', params: { k: 40, available: 30 } });
  });
  test('leere Regelauswahl prüft keine Regel', () => {
    const r = analyzeTyp6({ ...P, enabledRules: [] }, { values: [...VALUES.slice(0, 20), 20, ...VALUES.slice(20)], timestamps: null, subgroups: null });
    assertEqual(r.ruleViolations.length, 0);
    assertTrue(Array.isArray(r.primary.violations), 'violations');
  });
});

suite('MSA Typ 6 analyze — driftAxis', () => {
  test('gleich lange Zeitstempel: Text über Date.parse, sonst Zahl', () => {
    assertDeepEqual(driftAxis({ values: [1, 2], timestamps: ['2026-01-01', '2026-01-02'], subgroups: null }, 2),
      [Date.parse('2026-01-01'), Date.parse('2026-01-02')]);
    assertDeepEqual(driftAxis({ values: [1, 2], timestamps: [5, '7'], subgroups: null }, 2), [5, Date.parse('7')]);
  });
  test('ohne Zeitstempel oder andere Länge (x̄-R): laufende Nummer ab 1', () => {
    assertDeepEqual(driftAxis({ values: [1, 2, 3], timestamps: null, subgroups: null }, 3), [1, 2, 3]);
    assertDeepEqual(driftAxis({ values: [1, 2, 3, 4], timestamps: [1, 2, 3, 4], subgroups: [1, 1, 2, 2] }, 2), [1, 2]);
    assertDeepEqual(driftAxis(null, 2), [1, 2]);
  });
});
