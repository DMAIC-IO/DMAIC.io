/**
 * Tests for modules/ce-matrix/domain/matrix.js — Skalen, Zellschlüssel,
 * gewichtete Summen, Prüfung gegen die Skala, Pareto-Einträge und die Lage im
 * Farbverlauf (Fälle der Altform: Summen, Skalen, Buchbeispiel).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  RATING_SCALES, SCALE_IDS, DEFAULT_SCALE, WEIGHTS, HEAT_STOPS, cellKey, allowedScores, scoreOf,
  rowSum, colSum, grandTotal, isOnScale, offScaleCount, paretoItems, heat,
} from '../../../js/modules/ce-matrix/domain/matrix.js';
import { State } from '../../../js/modules/ce-matrix/domain/model.js';

/**
 * Ein Stand aus Namen, Gewichten und Bewertungen je Position.
 * @param {string[]} inputs @param {number[]} weights @param {Record<string, number>} byPos `"r-c"`
 * @param {string} [scale]
 */
function matrix(inputs, weights, byPos = {}, scale = '0-10') {
  const ins = inputs.map((name, r) => ({ id: `i${r + 1}`, name }));
  const outs = weights.map((weight, c) => ({ id: `o${c + 1}`, name: `Y${c + 1}`, weight }));
  const scores = {};
  for (const [k, v] of Object.entries(byPos)) {
    const [r, c] = k.split('-').map(Number);
    scores[cellKey(ins[r].id, outs[c].id)] = v;
  }
  return { inputs: ins, outputs: outs, scores, scale };
}

suite('ce-matrix matrix — Skalen', () => {
  test('die drei Skalen mit ihren Werten, Vorgabe 0-10', () => {
    assertDeepEqual(SCALE_IDS, ['0-10', '0-1-3-9', '0-3-7-10']);
    assertDeepEqual(RATING_SCALES['0-10'], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assertDeepEqual(RATING_SCALES['0-1-3-9'], [0, 1, 3, 9]);
    assertDeepEqual(RATING_SCALES['0-3-7-10'], [0, 3, 7, 10]);
    assertEqual(DEFAULT_SCALE, '0-10');
    assertDeepEqual(WEIGHTS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  test('die Skalen-Literale im Schema gleichen SCALE_IDS', () => {
    assertDeepEqual([...State.schema.fields.scale.values], [...SCALE_IDS]);
    assertEqual(State.schema.fields.scale.default, DEFAULT_SCALE);
  });
  test('allowedScores: unbekannte Skala gilt als 0-10', () => {
    assertDeepEqual(allowedScores('0-1-3-9'), [0, 1, 3, 9]);
    assertDeepEqual(allowedScores('0-5'), RATING_SCALES['0-10']);
  });
  test('cellKey verbindet mit Doppelpunkt', () => {
    assertEqual(cellKey('i1', 'o2'), 'i1:o2');
  });
});

suite('ce-matrix matrix — gewichtete Summen', () => {
  const m = matrix(['A', 'B', 'C'], [5, 10, 2], { '0-0': 9, '0-1': 3, '0-2': 1, '1-1': 9, '1-2': 9 });
  test('scoreOf: ohne Eintrag 0', () => {
    assertEqual(scoreOf(m, 'i1', 'o1'), 9);
    assertEqual(scoreOf(m, 'i3', 'o1'), 0);
  });
  test('rowSum = Σ Bewertung·Gewicht über die Spalten', () => {
    assertEqual(rowSum(m, 'i1'), 77);
    assertEqual(rowSum(m, 'i2'), 108);
    assertEqual(rowSum(m, 'i3'), 0);
  });
  test('colSum = Σ Bewertung·Gewicht über die Zeilen', () => {
    assertEqual(colSum(m, 'o1'), 45);
    assertEqual(colSum(m, 'o2'), 120);
    assertEqual(colSum(m, 'o3'), 20);
  });
  test('grandTotal = Σ der Zeilensummen', () => {
    assertEqual(grandTotal(m), 185);
  });
  test('leere Matrix: alle Summen 0', () => {
    const e = matrix(['A'], [1]);
    assertEqual(rowSum(e, 'i1'), 0);
    assertEqual(colSum(e, 'o1'), 0);
    assertEqual(grandTotal(matrix([], [])), 0);
  });
  test('Buchbeispiel (Melzer Abb. 3.2): eine 10 hält „Größe Halter“ vorn', () => {
    const b = matrix(['Größe Halter', 'Form der Substrate'], [7, 10, 5, 3], {
      '0-0': 10, '0-1': 7, '0-2': 10, '0-3': 3, '1-0': 10, '1-1': 7, '1-2': 7, '1-3': 7,
    });
    assertEqual(rowSum(b, 'i1'), 199);
    assertEqual(rowSum(b, 'i2'), 196);
  });
});

suite('ce-matrix matrix — Prüfung gegen die Skala', () => {
  test('Skalenwechsel lässt die Werte stehen und zählt die fremden', () => {
    const m = matrix(['A', 'B'], [1, 1], { '0-0': 10, '0-1': 7, '1-0': 5 }, '0-3-7-10');
    assertEqual(isOnScale(m, 'i2', 'o1'), false);
    assertEqual(isOnScale(m, 'i1', 'o1'), true);
    assertEqual(isOnScale(m, 'i2', 'o2'), true);
    assertEqual(offScaleCount(m), 1);
    assertEqual(rowSum(m, 'i2'), 5);
  });
  test('Bruch und Wert über 10 sind auf keiner Skala', () => {
    const m = matrix(['A'], [1, 1], { '0-0': 2.5, '0-1': 15 });
    assertEqual(offScaleCount(m), 2);
  });
});

suite('ce-matrix matrix — Pareto-Einträge', () => {
  test('Name der Zeile, leer → Input <Position>, Wert nie unter 0', () => {
    const m = matrix(['Ofen', '  ', ''], [2], { '0-0': 3 });
    m.scores[cellKey('i2', 'o1')] = -4;
    assertDeepEqual(paretoItems(m), [
      { name: 'Ofen', value: 6 }, { name: 'Input 2', value: 0 }, { name: 'Input 3', value: 0 },
    ]);
  });
  test('Name wird getrimmt', () => {
    assertDeepEqual(paretoItems(matrix([' X '], [1])), [{ name: 'X', value: 0 }]);
  });
});

suite('ce-matrix matrix — Farbverlauf', () => {
  test('Stopps wie die Altform', () => {
    assertDeepEqual(HEAT_STOPS, [0, 0.35, 0.55, 0.75, 1]);
  });
  test('ohne Spannweite null', () => {
    assertEqual(heat(5, 5, 5), null);
  });
  test('Ränder und Stopps', () => {
    assertDeepEqual(heat(0, 0, 100), { segment: 0, t: 0 });
    assertDeepEqual(heat(100, 0, 100), { segment: 3, t: 1 });
    assertDeepEqual(heat(35, 0, 100), { segment: 0, t: 1 });
    assertDeepEqual(heat(55, 0, 100), { segment: 1, t: 1 });
  });
  test('Anteil im Abschnitt', () => {
    const h = heat(45, 0, 100);
    assertEqual(h.segment, 1);
    assertTrue(Math.abs(h.t - 0.5) < 1e-12);
    const k = heat(87.5, 0, 100);
    assertEqual(k.segment, 3);
    assertTrue(Math.abs(k.t - 0.5) < 1e-12);
  });
});
