/**
 * Tests for modules/ce-matrix/io/image.js — der Tabellen-Deskriptor für den
 * Bildexport und die Farben der Summenzellen aus den aufgelösten
 * CSS-Variablen (Mischung wie die Altform: Kanäle gerundet, Fläche 18 %).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { toTableDescriptor, heatColors, parseColor, HEAT_VARS } from '../../../js/modules/ce-matrix/io/image.js';
import { State } from '../../../js/modules/ce-matrix/domain/model.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'ce-matrix');

/** Die Werte der Altform (`ce-matrix.js` COLOR_STOPS) als aufgelöste Variablen. */
const VARS = {
  heat0: '#22c55e', heat1: '#84cc16', heat2: '#eab308', heat3: '#f97316', heat4: '#ef4444', muted: '#adb5bd',
};
const T = (key) => `T:${key}`;

suite('ce-matrix image — Farben', () => {
  test('die gelesenen Variablen', () => {
    assertDeepEqual(Object.values(HEAT_VARS), [
      '--ce-matrix-heat-0', '--ce-matrix-heat-1', '--ce-matrix-heat-2', '--ce-matrix-heat-3', '--ce-matrix-heat-4',
      '--color-text-tertiary',
    ]);
  });
  test('parseColor: #rgb, #rrggbb, rgb(), sonst null', () => {
    assertDeepEqual(parseColor('#22c55e'), [34, 197, 94]);
    assertDeepEqual(parseColor(' #fff '), [255, 255, 255]);
    assertDeepEqual(parseColor('rgb(1, 2, 3)'), [1, 2, 3]);
    assertDeepEqual(parseColor('rgba(1,2,3,.5)'), [1, 2, 3]);
    assertEqual(parseColor(''), null);
    assertEqual(parseColor('red'), null);
  });
  test('wie die Altform: Ränder, Stopp und Mitte eines Abschnitts', () => {
    const { cellBg, cellFg } = heatColors(VARS);
    assertEqual(cellFg(0, 0, 100), 'rgb(34,197,94)');
    assertEqual(cellBg(0, 0, 100), 'rgba(34,197,94,.18)');
    assertEqual(cellFg(100, 0, 100), 'rgb(239,68,68)');
    assertEqual(cellFg(55, 0, 100), 'rgb(234,179,8)');
    // Mitte zwischen #eab308 und #f97316 (65 %): Kanäle gerundet wie lerpColor.
    assertEqual(cellFg(65, 0, 100), 'rgb(242,147,15)');
  });
  test('ohne Spannweite: Fläche durchsichtig, Schrift gedämpft', () => {
    const { cellBg, cellFg } = heatColors(VARS);
    assertEqual(cellBg(3, 3, 3), 'transparent');
    assertEqual(cellFg(3, 3, 3), '#adb5bd');
  });
  test('ohne lesbare Farben: durchsichtig und gedämpft statt Fehler', () => {
    const { cellBg, cellFg } = heatColors({ ...VARS, heat2: '' });
    assertEqual(cellBg(50, 0, 100), 'transparent');
    assertEqual(cellFg(50, 0, 100), '#adb5bd');
    assertEqual(cellFg(10, 0, 100), 'rgb(62,199,73)');
  });
});

suite('ce-matrix image — Deskriptor', () => {
  test('Altprojekt: Köpfe, Gewichte, Zellen ohne Eintrag leer, Summen, Beschriftungen', () => {
    const m = State.fromJSON({
      inputs: ['A', 'B'], outputs: ['X', 'Y'], weights: [10, 7], scale: '0-1-3-9', scores: { '0-0': 9, '1-1': 5 },
    });
    const td = toTableDescriptor(m, T, VARS);
    assertDeepEqual(td.outputs, ['X', 'Y']);
    assertDeepEqual(td.inputs, ['A', 'B']);
    assertDeepEqual(td.weights, [10, 7]);
    assertDeepEqual(td.cells, [[9, ''], ['', 5]]);
    assertDeepEqual(td.rowSums, [90, 35]);
    assertDeepEqual(td.colSums, [90, 35]);
    assertEqual(td.grandTotal, 125);
    assertDeepEqual([td.weightLabel, td.rowSumLabel, td.colSumLabel], ['T:weight', 'T:rowSum', 'T:colSum']);
    assertEqual(td.cellFg(90, 35, 90), 'rgb(239,68,68)');
  });
});
