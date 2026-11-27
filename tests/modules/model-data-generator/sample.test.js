/**
 * Tests for modules/model-data-generator/domain/sample.js — Terme, Namen der
 * Ausgabe und die erzeugten Daten je Verfahren, Wert für Wert wie die Altform
 * (`State.generate` in `model-data-generator-model.js`, Referenzzeilen dort
 * erzeugt), dazu der Merker.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertDeepClose } from '../../test-utils.js';
import {
  buildTerms, termLabel, outputNames, rowsOf, summaryOf, mulberry32,
} from '../../../js/modules/model-data-generator/domain/sample.js';

const BASE = Object.freeze({
  factors: [
    { name: 'Temperatur', min: 150, max: 250 },
    { name: 'Druck', min: 1, max: 10 },
    { name: 'Zeit', min: 5, max: 60 },
  ],
  maxOrder: 3,
  betas: {},
  intercept: 50,
  yName: 'Y',
  samplingMethod: 'random',
  sampleSize: 100,
  noiseStd: 2,
  seed: 42,
});

/** Erste und letzte Zeile als Objekt, wie die Altform sie lieferte. */
function ends(m) {
  const { names, columns } = rowsOf(m);
  const row = (r) => Object.fromEntries(names.map((n, c) => [n, columns[c][r]]));
  return { n: columns[0].length, first: row(0), last: row(columns[0].length - 1) };
}

suite('model-data-generator sample — Terme und Namen', () => {
  test('buildTerms in Tiefensuche bis zur Ordnung, nie über die Faktorzahl', () => {
    assertDeepEqual(buildTerms(3, 3), [[0], [0, 1], [0, 1, 2], [0, 2], [1], [1, 2], [2]]);
    assertDeepEqual(buildTerms(3, 1), [[0], [1], [2]]);
    assertEqual(buildTerms(4, 3).length, 14);
    assertEqual(buildTerms(2, 5).length, 3);
    assertEqual(buildTerms(3, 0).length, 0);
  });

  test('termLabel mit X<n> für leere Namen', () => {
    const f = [{ name: 'A' }, { name: '' }];
    assertEqual(termLabel([0], f), 'A');
    assertEqual(termLabel([0, 1], f), 'A × X2');
  });

  test('outputNames: leer → X<n> bzw. Y, doppelt → _2, _3, Y zuletzt', () => {
    assertDeepEqual(outputNames([{ name: 'A' }, { name: 'A' }, { name: '' }], 'Y'), ['A', 'A_2', 'X3', 'Y']);
    assertDeepEqual(outputNames([{ name: 'A' }, { name: 'A' }, { name: 'A' }], 'A'), ['A', 'A_2', 'A_3', 'A_4']);
    assertDeepEqual(outputNames([{ name: 'Y' }], ''), ['Y', 'Y_2']);
  });
});

suite('model-data-generator sample — Daten wie die Altform', () => {
  test('zufällig (Monte Carlo)', () => {
    const r = ends({ ...BASE, betas: { 0: 1.5, 1: -0.8 } });
    assertEqual(r.n, 100);
    assertDeepClose(r.first, { Temperatur: 210.11037519201636, Druck: 5.034615030977875, Zeit: 51.88561864197254, Y: 51.50095579913541 });
    assertDeepClose(r.last, { Temperatur: 221.48488785605878, Druck: 6.355641823029146, Zeit: 57.00697217602283, Y: 49.53363068444743 });
  });

  test('Latin Hypercube', () => {
    const r = ends({ ...BASE, samplingMethod: 'lhs', betas: { 0: 2, 4: 0.5, 2: 0.1 }, sampleSize: 37, seed: 9 });
    assertEqual(r.n, 37);
    assertDeepClose(r.first, { Temperatur: 174.8016144318909, Druck: 1.5331043828014486, Zeit: 29.212839159158033, Y: 51.273581702856134 });
    assertDeepClose(r.last, { Temperatur: 170.03161562103276, Druck: 5.437081912526156, Zeit: 57.74122742813307, Y: 51.41671880084426 });
  });

  test('vollfaktoriell: 3 Stufen bis 4 Faktoren, Wiederholungen gerundet', () => {
    const r = ends({ ...BASE, samplingMethod: 'fullfactorial', betas: { 3: 3 }, sampleSize: 55, noiseStd: 0 });
    assertEqual(r.n, 54);
    assertDeepEqual(r.first, { Temperatur: 150, Druck: 1, Zeit: 5, Y: 50 });
    assertDeepEqual(r.last, { Temperatur: 250, Druck: 10, Zeit: 60, Y: 53 });
  });

  test('vollfaktoriell: 2 Stufen ab 5 Faktoren, negativer Startwert', () => {
    const factors = [1, 2, 3, 4, 5].map((i) => ({ name: `F${i}`, min: 0, max: i }));
    const r = ends({ ...BASE, samplingMethod: 'fullfactorial', factors, sampleSize: 10, seed: -5, betas: { 0: 1 } });
    assertEqual(r.n, 32);
    assertDeepClose(r.first, { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, Y: 52.27772151969936 });
    assertDeepClose(r.last, { F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, Y: 52.00161603783258 });
  });

  test('doppelte Namen behalten alle Spalten (Altform: weniger Spalten)', () => {
    const { names, columns } = rowsOf({ ...BASE, factors: [{ name: 'A', min: 0, max: 1 }, { name: 'A', min: 5, max: 6 }] });
    assertDeepEqual(names, ['A', 'A_2', 'Y']);
    assertTrue(columns[1].every((v) => v >= 5 && v <= 6));
  });

  test('Merker: gleicher Stand liefert dasselbe Ergebnis, ein anderer ein neues', () => {
    const a = rowsOf({ ...BASE });
    assertTrue(rowsOf({ ...BASE, factors: BASE.factors.map((f) => ({ ...f })) }) === a);
    assertTrue(rowsOf({ ...BASE, seed: 43 }) !== a);
  });

  test('summaryOf wie die Kennzahlen der Altform; mulberry32 deterministisch', () => {
    const s = summaryOf([1, 2, 3, 4]);
    assertEqual(s.n, 4);
    assertEqual(s.mean, 2.5);
    assertEqual(s.min, 1);
    assertEqual(s.max, 4);
    assertTrue(Math.abs(s.sd - 1.2909944487358056) < 1e-12);
    const r1 = mulberry32(42); const r2 = mulberry32(42);
    assertEqual(r1(), r2());
  });
});
