/**
 * Tortendiagramm: Segmente (domain/slices.js) gegen Werte von Hand.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { buildSlices, sliceStats } from '../../../js/modules/pie-chart/domain/slices.js';
import { PALETTE } from '../../../js/core/chart/chart-data-prep.js';

const REF_V = { instanceId: 'i1', sheetId: 's1', columnId: 'cv' };
const REF_L = { instanceId: 'i1', sheetId: 's1', columnId: 'cl' };

/** Spaltenleser über `{ value, label }`; andere Bezüge sind nicht lesbar. */
function reader(map) {
  return {
    values: (ref) => (ref.columnId === 'cv' ? map.value ?? null : ref.columnId === 'cl' ? map.label ?? null : null),
    name: (ref) => ref.columnId,
  };
}

const names = (slices) => slices.map((s) => s.name);
const values = (slices) => slices.map((s) => s.value);

suite('pie-chart: Segmente — Häufigkeit (nur Wertespalte)', () => {
  const ROW = { value: REF_V, label: null };

  test('zählt verschiedene Werte in der Reihenfolge des ersten Auftretens, Farben aus der Palette', () => {
    const s = buildSlices(ROW, reader({ value: [10, 20, 10, 30, 20] }));
    assertDeepEqual(names(s), ['10', '20', '30']);
    assertDeepEqual(values(s), [2, 2, 1]);
    assertDeepEqual(s.map((x) => x.color), [PALETTE[0], PALETTE[1], PALETTE[2]]);
  });

  test('leere Zellen fallen heraus', () => {
    const s = buildSlices(ROW, reader({ value: ['A', '', null, 'B', 'A'] }));
    assertDeepEqual(names(s), ['A', 'B']);
    assertDeepEqual(values(s), [2, 1]);
  });

  test('Farben reihum über die Palette', () => {
    const many = Array.from({ length: PALETTE.length + 1 }, (_, i) => `k${i}`);
    const s = buildSlices(ROW, reader({ value: many }));
    assertEqual(s[PALETTE.length].color, PALETTE[0]);
  });

  test('leer: ohne Zeile, ohne Wertespalte, leere oder nicht lesbare Spalte', () => {
    assertDeepEqual(buildSlices(undefined, reader({ value: [1] })), []);
    assertDeepEqual(buildSlices({ value: null, label: REF_L }, reader({ value: [1], label: ['A'] })), []);
    assertDeepEqual(buildSlices(ROW, reader({ value: [] })), []);
    assertDeepEqual(buildSlices(ROW, reader({})), []);
  });
});

suite('pie-chart: Segmente — Summe je Beschriftung', () => {
  const ROW = { value: REF_V, label: REF_L };

  test('summiert je Beschriftung in der Reihenfolge des ersten Auftretens', () => {
    const s = buildSlices(ROW, reader({ value: [10, 20, 10, 30, 20], label: ['A', 'B', 'A', 'B', 'C'] }));
    // A: 10+10=20, B: 20+30=50, C: 20
    assertDeepEqual(names(s), ['A', 'B', 'C']);
    assertDeepEqual(values(s), [20, 50, 20]);
    assertEqual(s[0].color, PALETTE[0]);
  });

  test('NaN und negative Werte fallen heraus', () => {
    const s = buildSlices(ROW, reader({ value: [10, 'x', -5, 20, null, ''], label: ['A', 'A', 'A', 'B', 'B', 'B'] }));
    assertDeepEqual(names(s), ['A', 'B']);
    assertDeepEqual(values(s), [10, 20]);
  });

  test('Text „2,5“ zählt als Zahl, ein Wahrheitswert nicht', () => {
    const s = buildSlices(ROW, reader({ value: ['2,5', '1.5', true], label: ['A', 'A', 'B'] }));
    assertDeepEqual(names(s), ['A']);
    assertDeepEqual(values(s), [4]);
  });

  test('fehlende Beschriftung → Zeilennummer', () => {
    const s = buildSlices(ROW, reader({ value: [10, 20, 30], label: ['A'] }));
    assertDeepEqual(names(s), ['A', '2', '3']);
    assertDeepEqual(values(s), [10, 20, 30]);
  });

  test('nicht lesbare Beschriftungsspalte → keine Segmente', () => {
    assertDeepEqual(buildSlices({ value: REF_V, label: { ...REF_L, columnId: 'weg' } }, reader({ value: [1, 2], label: ['A', 'B'] })), []);
  });
});

suite('pie-chart: Segmente — sliceStats', () => {
  test('Summe und Anteile', () => {
    const st = sliceStats([{ name: 'A', value: 20 }, { name: 'B', value: 50 }, { name: 'C', value: 30 }]);
    assertEqual(st.total, 100);
    assertDeepEqual(st.slices, [
      { name: 'A', value: 20, share: 0.2 },
      { name: 'B', value: 50, share: 0.5 },
      { name: 'C', value: 30, share: 0.3 },
    ]);
  });

  test('Summe 0 → Anteile 0; leere Liste', () => {
    assertDeepEqual(sliceStats([{ name: 'A', value: 0 }]), { slices: [{ name: 'A', value: 0, share: 0 }], total: 0 });
    assertDeepEqual(sliceStats([]), { slices: [], total: 0 });
  });
});
