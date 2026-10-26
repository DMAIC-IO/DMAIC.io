/**
 * Tests for js/modules/gage-run-chart/gage-run-chart-model.js — Bezugswert.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/gage-run-chart/gage-run-chart-model.js';

function withRef(refValue) {
  const s = new State();
  s.refValue = refValue;
  return s;
}

suite('Gage Run Chart Model: resolveRefValue', () => {
  test('Dezimalkomma wird gelesen', () => {
    assertEqual(withRef('3,5').resolveRefValue(18), 3.5);
  });

  test('ganze Zahl', () => {
    assertEqual(withRef('20').resolveRefValue(18), 20);
  });

  test('leer oder ungültig → Gesamtmittel', () => {
    for (const raw of ['', '-', '3,5x']) {
      assertEqual(withRef(raw).resolveRefValue(18), 18, `Eingabe ${JSON.stringify(raw)}`);
    }
  });
});
