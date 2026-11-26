/**
 * FMEA: Skalenschlüssel (domain/scales.js) — das Literal gleicht der
 * Erzeugung der Altform (`buildScaleKeys` in fmea.js).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { SCALE_KEYS, RPN_ROWS, RPN_SECOND, scaleRow, isScaleKey } from '../../../js/modules/fmea/domain/scales.js';

/** Die Erzeugung der Altform, wörtlich. */
function buildScaleKeys() {
  const keys = new Set();
  const rpn = {
    sev: ['sevNone', 'sevLow', 'sevMod', 'sevHigh', 'sevVHigh'],
    occ: ['occUnlikely', 'occLow', 'occMod', 'occHigh', 'occVHigh'],
    det: ['detCertain', 'detHigh', 'detMod', 'detLow', 'detVLow'],
  };
  for (const k of rpn.sev) { keys.add(k); keys.add(`${k}Desc`); }
  for (const k of rpn.occ) { keys.add(k); keys.add(`${k}Rate`); }
  for (const k of rpn.det) { keys.add(k); keys.add(`${k}Desc`); }
  for (const type of ['process', 'design']) {
    for (const dim of ['sev', 'occ', 'det']) {
      for (let v = 1; v <= 10; v++) {
        keys.add(`ap.${type}.${dim}.${v}.meaning`);
        keys.add(`ap.${type}.${dim}.${v}.criterion`);
      }
    }
  }
  return keys;
}

suite('fmea Skalen', () => {
  test('SCALE_KEYS gleicht buildScaleKeys der Altform, in derselben Reihenfolge', () => {
    assertDeepEqual([...SCALE_KEYS], [...buildScaleKeys()]);
    assertEqual(SCALE_KEYS.length, 150);
  });
  test('RPN_ROWS: fünf Zeilen, Schlüssel samt zweiter Spalte aus SCALE_KEYS', () => {
    assertDeepEqual(RPN_ROWS.map((r) => r.label), ['1', '2–3', '4–6', '7–8', '9–10']);
    for (const row of RPN_ROWS) {
      for (const dim of ['sev', 'occ', 'det']) {
        assertTrue(isScaleKey(row[dim]), row[dim]);
        assertTrue(isScaleKey(`${row[dim]}${RPN_SECOND[dim]}`), `${row[dim]}${RPN_SECOND[dim]}`);
      }
    }
    assertEqual(RPN_ROWS.length * 3 * 2, 30);
  });
  test('scaleRow: Stufe → Zeile', () => {
    assertDeepEqual([1, 2, 3, 4, 6, 7, 8, 9, 10].map(scaleRow), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  test('isScaleKey lehnt Fremdes ab', () => {
    assertEqual(isScaleKey('legacyNote'), false);
    assertEqual(isScaleKey('ap.process.sev.11.meaning'), false);
    assertEqual(isScaleKey(7), false);
  });
});
