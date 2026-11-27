/**
 * Attributtest: Eingaben prüfen und zählen (domain/normalize.js) und der
 * Ereigniswert (domain/event.js). Fälle der Altform, die Zusammenfassung
 * jetzt als Zahlen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  parseCount, normalizeSummary, normalizeColumns, withColumnLabels,
} from '../../../js/modules/attribute-test/domain/normalize.js';
import { distinctValues, effectiveEvent, isMissing } from '../../../js/modules/attribute-test/domain/event.js';

const table2 = () => ({ rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[null, null], [null, null]] });
/** Ein Stand wie das Model, Zusammenfassung als Zahlen. */
const st = (over = {}, summary = {}) => ({
  testKind: 'one',
  p0: 0.5,
  eventValue: null,
  exposurePerRow: 1,
  equiv: { samples: 2, symmetric: true, delta: null, lower: null, upper: null },
  ...over,
  summary: {
    x: null, n: null, x1: null, n1: null, x2: null, n2: null, t: null, t1: null, t2: null,
    lambda0: null, diff0: 0,
    pairs: { labels: { before: '', after: '' }, counts: [[null, null], [null, null]] },
    table: table2(),
    ...summary,
  },
});
const noCols = { response: null, group: null, rowVar: null, colVar: null, counts: null, before: null, after: null };

suite('attribute-test: Werte und Ereignis', () => {
  test('parseCount nimmt ganze Zahlen mit Leerzeichen, sonst null', () => {
    assertEqual(parseCount(' 12 '), 12);
    assertEqual(parseCount('1 200'), 1200);
    assertEqual(parseCount(7), 7);
    for (const v of ['3.5', '12,0', '-1', 'abc', '', null, 2.5]) assertEqual(parseCount(v), null, String(v));
  });
  test('distinctValues sortiert natürlich und überspringt Fehlendes', () => {
    assertDeepEqual(distinctValues([1, 0, null, '', 1, 10, 2]), ['0', '1', '2', '10']);
    assertDeepEqual(distinctValues([1, 0, null, 1, '', 1]), ['0', '1']);
    assertTrue(isMissing(NaN) && isMissing('  ') && !isMissing(0));
  });
  test('effectiveEvent: gespeicherter Wert, wenn vorhanden, sonst der letzte; ohne Werte der gespeicherte', () => {
    assertEqual(effectiveEvent('i.O.', ['i.O.', 'n.i.O.']), 'i.O.');
    assertEqual(effectiveEvent('defekt', ['i.O.', 'n.i.O.']), 'n.i.O.');
    assertEqual(effectiveEvent(null, ['0', '1']), '1');
    assertEqual(effectiveEvent('x', []), 'x');
    assertEqual(effectiveEvent(null, []), null);
  });
});

suite('attribute-test: Zusammenfassung', () => {
  test('leere Eingabe eines Anteils ist ein Hinweis, kein Fehler', () => {
    assertDeepEqual(normalizeSummary(st()), { ok: false, error: 'hintEnterCounts', hint: true });
  });
  test('ein Anteil gültig', () => {
    assertDeepEqual(normalizeSummary(st({ p0: 0.1 }, { x: 3, n: 40 })),
      { ok: true, kind: 'one', x: 3, n: 40, p0: 0.1, missing: 0 });
  });
  test('ein Anteil: Fehler', () => {
    assertEqual(normalizeSummary(st({}, { x: 5, n: 4 })).error, 'errXGreaterN');
    assertEqual(normalizeSummary(st({}, { x: 0, n: 0 })).error, 'errNZero');
    assertEqual(normalizeSummary(st({}, { x: 2, n: null })).error, 'errCountInvalid');
    assertEqual(normalizeSummary(st({}, { x: 2.5, n: 10 })).error, 'errCountInvalid');
    assertEqual(normalizeSummary(st({ p0: null }, { x: 2, n: 10 })).error, 'errP0Range');
    assertEqual(normalizeSummary(st({ p0: 1 }, { x: 2, n: 10 })).error, 'errP0Range');
  });
  test('zwei Anteile gültig und x2 > n2', () => {
    assertDeepEqual(normalizeSummary(st({ testKind: 'two' }, { x1: 46, n1: 1200, x2: 21, n2: 1150 })),
      { ok: true, kind: 'two', x1: 46, n1: 1200, x2: 21, n2: 1150, groups: null, missing: 0 });
    assertEqual(normalizeSummary(st({ testKind: 'two' }, { x1: 1, n1: 10, x2: 11, n2: 10 })).error, 'errXGreaterN');
  });
  test('Kreuztabelle: leer ist ein Hinweis, Lücken in einer begonnenen Tabelle ein Fehler', () => {
    assertEqual(normalizeSummary(st({ testKind: 'assoc' })).error, 'hintEnterCounts');
    const t = table2();
    t.counts = [[4, null], [2, 7]];
    assertEqual(normalizeSummary(st({ testKind: 'assoc' }, { table: t })).error, 'errCountInvalid');
    t.counts = [[4, 0], [2, 7]];
    assertDeepEqual(normalizeSummary(st({ testKind: 'assoc' }, { table: t })),
      { ok: true, kind: 'assoc', rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[4, 0], [2, 7]], missing: 0 });
  });
  test('eine Rate: gültig, Bruch als Anzahl, Umfang 0, λ₀ fehlt', () => {
    assertDeepEqual(normalizeSummary(st({ testKind: 'rate1' }, { x: 37, t: 12.5, lambda0: 2 })),
      { ok: true, kind: 'rate1', x: 37, t: 12.5, lambda0: 2, missing: 0 });
    assertEqual(normalizeSummary(st({ testKind: 'rate1' }, { x: 3.5, t: 1, lambda0: 2 })).error, 'errCountInvalid');
    assertEqual(normalizeSummary(st({ testKind: 'rate1' }, { x: 3, t: 0, lambda0: 2 })).error, 'errExposure');
    assertEqual(normalizeSummary(st({ testKind: 'rate1' }, { x: 3, t: 1, lambda0: null })).error, 'errLambda0');
    assertEqual(normalizeSummary(st({ testKind: 'rate1' })).hint, true);
  });
  test('zwei Raten: gültig, leeres Δ₀ zählt als 0, Umfang 0 ist ein Fehler', () => {
    assertDeepEqual(normalizeSummary(st({ testKind: 'rate2' }, { x1: 10, t1: 2, x2: 4, t2: 3.5 })),
      { ok: true, kind: 'rate2', x1: 10, t1: 2, x2: 4, t2: 3.5, diff0: 0, groups: null, missing: 0 });
    assertEqual(normalizeSummary(st({ testKind: 'rate2' }, { x1: 10, t1: 2, x2: 4, t2: 3.5, diff0: null })).diff0, 0);
    assertEqual(normalizeSummary(st({ testKind: 'rate2' }, { x1: 10, t1: 2, x2: 4, t2: 0 })).error, 'errExposure');
  });
  test('McNemar: Hinweis, Lücke, gültige Tafel mit Bezeichnung', () => {
    assertEqual(normalizeSummary(st({ testKind: 'mcnemar' })).hint, true);
    const pairs = { labels: { before: 'vorher', after: '' }, counts: [[10, 5], [null, 20]] };
    assertEqual(normalizeSummary(st({ testKind: 'mcnemar' }, { pairs })).error, 'errCountInvalid');
    pairs.counts = [[10, 5], [2, 20]];
    assertDeepEqual(normalizeSummary(st({ testKind: 'mcnemar' }, { pairs })), {
      ok: true, kind: 'mcnemar', table: [[10, 5], [2, 20]], labels: { before: 'vorher', after: '' }, missing: 0,
    });
    pairs.counts = [[0, 0], [0, 0]];
    assertEqual(normalizeSummary(st({ testKind: 'mcnemar' }, { pairs })).error, 'errNZero');
  });
});

suite('attribute-test: Äquivalenz', () => {
  const two = { x1: 5, n1: 100, x2: 6, n2: 100 };
  test('symmetrische Grenze ±δ in Prozentpunkten', () => {
    const s = st({ testKind: 'equiv', equiv: { samples: 2, symmetric: true, delta: 1, lower: null, upper: null } }, two);
    assertDeepEqual(normalizeSummary(s), {
      ok: true, kind: 'equiv', samples: 2, x1: 5, n1: 100, x2: 6, n2: 100, lower: -0.01, upper: 0.01,
      groups: null, missing: 0,
    });
  });
  test('getrennte Grenzen: leer, Reihenfolge, Einschluss', () => {
    const eq = { samples: 2, symmetric: false, delta: null, lower: null, upper: null };
    assertDeepEqual(normalizeSummary(st({ testKind: 'equiv', equiv: eq }, two)), { ok: false, error: 'hintEnterBounds', hint: true });
    assertEqual(normalizeSummary(st({ testKind: 'equiv', equiv: { ...eq, lower: 2, upper: 1 } }, two)).error, 'errBoundsOrder');
    assertEqual(normalizeSummary(st({ testKind: 'equiv', equiv: { ...eq, lower: 0.5, upper: 1 } }, two)).error, 'errBoundsContain');
    assertEqual(normalizeSummary(st({ testKind: 'equiv', equiv: { ...eq, lower: -0.5, upper: 1 } }, two)).lower, -0.005);
  });
  test('eine Stichprobe: Einschlussfehler nennt p₀, gültige Eingabe, p₀ außerhalb', () => {
    const eq = { samples: 1, symmetric: false, delta: null, lower: 1, upper: 2 };
    assertEqual(normalizeSummary(st({ testKind: 'equiv', p0: 0.1, equiv: eq }, { x: 8, n: 100 })).error, 'errBoundsContainOne');
    const sym = { samples: 1, symmetric: true, delta: 2, lower: null, upper: null };
    assertDeepEqual(normalizeSummary(st({ testKind: 'equiv', p0: 0.1, equiv: sym }, { x: 8, n: 100 })),
      { ok: true, kind: 'equiv', samples: 1, x: 8, n: 100, p0: 0.1, lower: -0.02, upper: 0.02, missing: 0 });
    assertEqual(normalizeSummary(st({ testKind: 'equiv', p0: null, equiv: sym }, { x: 8, n: 100 })).error, 'errP0Range');
  });
});

suite('attribute-test: Spalten', () => {
  test('ohne Spalte ein Hinweis', () => {
    assertDeepEqual(normalizeColumns(st(), noCols), { ok: false, error: 'hintPickColumns', hint: true });
  });
  test('ein Anteil aus 0/1 mit Lücken; Ereignis gewählt oder der letzte', () => {
    const response = [1, 0, null, 1, '', 1];
    assertDeepEqual(normalizeColumns(st({ eventValue: '1' }), { ...noCols, response }),
      { ok: true, kind: 'one', x: 3, n: 4, p0: 0.5, missing: 2 });
    assertDeepEqual(normalizeColumns(st(), { ...noCols, response }),
      { ok: true, kind: 'one', x: 3, n: 4, p0: 0.5, missing: 2 });
    assertEqual(normalizeColumns(st({ eventValue: 'a' }), { ...noCols, response: ['a', 'b', 'c'] }).error, 'errResponseLevels');
    const stale = normalizeColumns(st({ eventValue: 'gone' }), { ...noCols, response: ['a', 'b', 'b', 'a', 'b'] });
    assertEqual(stale.x, 3);
  });
  test('zwei Anteile je Gruppe; drei Gruppen abgelehnt', () => {
    const s = st({ testKind: 'two', eventValue: 'n.i.O.' });
    const response = ['i.O.', 'n.i.O.', 'n.i.O.', 'i.O.', 'i.O.', null];
    const group = ['Früh', 'Früh', 'Spät', 'Spät', 'Spät', 'Spät'];
    assertDeepEqual(normalizeColumns(s, { ...noCols, response, group }),
      { ok: true, kind: 'two', x1: 1, n1: 2, x2: 1, n2: 3, groups: ['Früh', 'Spät'], missing: 1 });
    assertEqual(normalizeColumns(st({ testKind: 'two', eventValue: 'b' }),
      { ...noCols, response: ['a', 'b', 'a'], group: ['x', 'y', 'z'] }).error, 'errGroupLevels');
  });
  test('Kreuztabelle aus zwei Spalten', () => {
    const r = normalizeColumns(st({ testKind: 'assoc' }), {
      ...noCols, rowVar: ['Früh', 'Spät', 'Früh', 'Nacht', null], colVar: ['ok', 'nok', 'nok', 'ok', 'ok'],
    });
    assertDeepEqual(r, {
      ok: true, kind: 'assoc', rows: ['Früh', 'Nacht', 'Spät'], cols: ['nok', 'ok'],
      counts: [[1, 1], [0, 1], [1, 0]], missing: 1,
    });
  });
  test('eine Rate: Umfang = Zeilen × Umfang je Zeile, Lücken übersprungen, Fehler', () => {
    const s = st({ testKind: 'rate1', exposurePerRow: 2.5 }, { lambda0: 1 });
    assertDeepEqual(normalizeColumns(s, { ...noCols, counts: [2, '', 0, 3] }),
      { ok: true, kind: 'rate1', x: 5, t: 7.5, lambda0: 1, missing: 1 });
    assertEqual(normalizeColumns(s, { ...noCols, counts: [2, -1] }).error, 'errCountInvalid');
    assertEqual(normalizeColumns(s, { ...noCols, counts: ['', null] }).error, 'errExposure');
    assertEqual(normalizeColumns(st({ testKind: 'rate1', exposurePerRow: null }, { lambda0: 1 }),
      { ...noCols, counts: [2, 1] }).error, 'errExposure');
  });
  test('zwei Raten: Anzahlen je Gruppe; leeres Δ₀ zählt als 0', () => {
    const s = st({ testKind: 'rate2', exposurePerRow: 2 }, { diff0: null });
    assertDeepEqual(normalizeColumns(s, { ...noCols, counts: [1, 2, 3, '', 4], group: ['A', 'A', 'B', 'B', 'B'] }),
      { ok: true, kind: 'rate2', x1: 3, t1: 4, x2: 7, t2: 4, diff0: 0, groups: ['A', 'B'], missing: 1 });
    assertEqual(normalizeColumns(s, { ...noCols, counts: [1, 2, 3], group: ['A', 'B', 'C'] }).error, 'errGroupLevels');
  });
  test('McNemar: Längen, Leerzeilen am Ende, zwei Stufen über beide Spalten', () => {
    const s = st({ testKind: 'mcnemar' });
    assertEqual(normalizeColumns(s, { ...noCols, before: ['a', 'b', 'a'], after: ['a', 'b'] }).error, 'errPairsLength');
    const trimmed = normalizeColumns(st({ testKind: 'mcnemar', eventValue: 'a' }),
      { ...noCols, before: ['a', 'b', 'a', ''], after: ['a', 'b', 'b'] });
    assertDeepEqual(trimmed.table, [[1, 1], [0, 1]]);
    assertDeepEqual(normalizeColumns(st({ testKind: 'mcnemar', eventValue: 'i.O.' }), {
      ...noCols, before: ['n.i.O.', 'n.i.O.', 'n.i.O.', 'n.i.O.'], after: ['i.O.', 'n.i.O.', '', 'i.O.'],
    }), { ok: true, kind: 'mcnemar', table: [[0, 0], [2, 1]], labels: { before: '', after: '' }, missing: 1 });
    assertEqual(normalizeColumns(s, { ...noCols, before: ['a', 'b'], after: ['c', 'a'] }).error, 'errPairLevels');
  });
  test('Äquivalenz nimmt die Regeln eines bzw. zweier Anteile', () => {
    const eq = { samples: 2, symmetric: true, delta: 10, lower: null, upper: null };
    const r = normalizeColumns(st({ testKind: 'equiv', eventValue: 'b', equiv: eq }),
      { ...noCols, response: ['a', 'b', 'b', 'a'], group: ['x', 'x', 'y', 'y'] });
    assertDeepEqual(r, {
      ok: true, kind: 'equiv', samples: 2, x1: 1, n1: 2, x2: 1, n2: 2, lower: -0.1, upper: 0.1,
      groups: ['x', 'y'], missing: 0,
    });
    const r1 = normalizeColumns(st({ testKind: 'equiv', eventValue: 'b', equiv: { ...eq, samples: 1 } }),
      { ...noCols, response: ['a', 'b', 'b', 'a'] });
    assertEqual(r1.samples, 1);
    assertEqual(r1.x, 2);
  });
  test('withColumnLabels: Spaltennamen füllen leere Bezeichnungen, eigene gewinnen', () => {
    const norm = { ok: true, kind: 'mcnemar', table: [[1, 2], [3, 4]], labels: { before: '', after: 'X' }, missing: 0 };
    assertDeepEqual(withColumnLabels(norm, { before: 'Col A', after: 'Col B' }).labels, { before: 'Col A', after: 'X' });
    assertEqual(withColumnLabels({ error: 'e' }, { before: 'a', after: 'b' }).error, 'e');
  });
});
