/**
 * Korrelation: Konfidenz als Freitext (domain/confidence.js) und Filter der
 * Matrix (domain/filter.js).
 */
import { suite, test, assertEqual } from '../../test-utils.js';
import { parseConfPercent, confInRange, confFromSetting, CONF_RANGE } from '../../../js/modules/correlation/domain/confidence.js';
import { cellPassesFilter } from '../../../js/modules/correlation/domain/filter.js';
import { State } from '../../../js/modules/correlation/domain/model.js';

suite('correlation: Konfidenz', () => {
  test('Prozent und Anteil, Komma und Prozentzeichen', () => {
    assertEqual(parseConfPercent('95'), 0.95);
    assertEqual(parseConfPercent('97,5 %'), 0.975);
    assertEqual(parseConfPercent('0,95'), 0.95);
    assertEqual(parseConfPercent('0.9'), 0.9);
    assertEqual(parseConfPercent('abc'), null);
    assertEqual(parseConfPercent(''), null);
    assertEqual(parseConfPercent('100'), null);
    assertEqual(parseConfPercent('0'), null);
  });

  test('Bereich wie das Feld', () => {
    const f = State.schema.fields.confidenceLevel;
    assertEqual(CONF_RANGE.min, f.min);
    assertEqual(CONF_RANGE.max, f.max);
    assertEqual(confInRange(0.4), false);
    assertEqual(confInRange(0.5), true);
    assertEqual(confInRange(0.9999), true);
    assertEqual(confInRange(null), false);
  });

  test('Einstellung in Prozent, auf den Bereich geklemmt', () => {
    assertEqual(confFromSetting(90), 0.9);
    assertEqual(confFromSetting(97.5), 0.975);
    assertEqual(confFromSetting(40), 0.5);
    assertEqual(confFromSetting(99.999), 0.9999);
  });
});

suite('correlation: Filter', () => {
  test('ohne Filter besteht jede Zelle, auch eine leere', () => {
    assertEqual(cellPassesFilter(null, null, null, null), true);
  });
  test('mit Filter fällt eine leere Zelle immer', () => {
    assertEqual(cellPassesFilter(null, null, 0, null), false);
    assertEqual(cellPassesFilter(null, 0.01, null, 0.05), false);
  });
  test('|r| ≥ und p ≤', () => {
    assertEqual(cellPassesFilter(-0.6, 0.2, 0.5, null), true);
    assertEqual(cellPassesFilter(0.4, 0.01, 0.5, null), false);
    assertEqual(cellPassesFilter(0.9, 0.06, null, 0.05), false);
    assertEqual(cellPassesFilter(0.9, null, null, 0.05), false);
    assertEqual(cellPassesFilter(0.9, 0.05, 0.9, 0.05), true);
  });
});
