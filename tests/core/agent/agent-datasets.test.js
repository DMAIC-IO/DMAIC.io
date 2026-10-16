/**
 * Tests for core/agent/agent-datasets.js — die Lesemenge je Picker-Slot und
 * die Zeilenprüfung für setDatasets.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../../test-utils.js';
import { datasetSlotColumns, requireDatasetRows } from '../../../js/core/agent/agent-datasets.js';
import { slotFilter } from '../../../js/ui/dataset-picker.js';

/** StateManager-Attrappe: zwei Zahlenspalten, eine Textspalte. */
function smWithColumns() {
  const ws = { sheets: [{ id: 's1', name: 'Blatt', state: { columns: [
    { id: 'a', shortName: 'C1', type: 'numeric', values: [1, 2, 3] },
    { id: 'b', shortName: 'C2', type: 'numeric', values: [4] },
    { id: 'c', shortName: 'C3', type: 'text', values: ['x', 'y', 'z'] },
  ] } }] };
  const phases = { data: [{ moduleId: 'worksheet', instanceId: 'ws-1' }] };
  return {
    get(path) {
      if (path === 'phases') return phases;
      if (path.startsWith('phases.')) return phases[path.slice(7)] ?? [];
      return undefined;
    },
    getModuleState: (id) => (id === 'ws-1' ? ws : null),
  };
}

const SLOTS = [
  { key: 'value', types: ['numeric'], minCount: 2, required: true },
  { key: 'group', group: true },
];
const ref = (columnId) => ({ instanceId: 'ws-1', sheetId: 's1', columnId });

suite('dataset-picker slotFilter', () => {
  test('nimmt types, minCount, maxCount; group und required filtern nicht', () => {
    assertDeepEqual(slotFilter({ key: 'v', types: ['numeric'], minCount: 2, maxCount: 9, required: true }),
      { types: ['numeric'], minCount: 2, maxCount: 9 });
    assertDeepEqual(slotFilter({ key: 'g', group: true }), {});
  });
});

suite('agent-datasets datasetSlotColumns', () => {
  test('je Slot die Spalten, die der Picker dieses Slots zeigt', () => {
    const cols = datasetSlotColumns(smWithColumns(), SLOTS);
    assertDeepEqual(Object.keys(cols), ['value', 'group']);
    assertDeepEqual(cols.value.map(c => c.key), ['ws-1|s1|a']);            // b hat nur einen Wert, c ist Text
    assertDeepEqual(cols.group.map(c => c.key), ['ws-1|s1|a', 'ws-1|s1|b', 'ws-1|s1|c']);
  });
});

suite('agent-datasets requireDatasetRows', () => {
  const pickable = () => datasetSlotColumns(smWithColumns(), SLOTS);

  test('füllt fehlende Slots mit null und normalisiert die Bezüge', () => {
    const rows = requireDatasetRows([{ value: { ...ref('a'), extra: 1 } }], pickable());
    assertDeepEqual(rows, [{ value: ref('a'), group: null }]);
  });
  test('[] wird eine leere Zeile, wie der Picker', () => {
    assertDeepEqual(requireDatasetRows([], pickable()), [{ value: null, group: null }]);
  });
  test('null in einem Slot leert ihn', () => {
    assertDeepEqual(requireDatasetRows([{ value: null, group: ref('c') }], pickable()),
      [{ value: null, group: ref('c') }]);
  });
  test('keine Liste nennt die Form', () => {
    assertThrows(() => requireDatasetRows({ value: ref('a') }, pickable()), /allowed: a list of rows/);
    assertThrows(() => requireDatasetRows([null], pickable()), /allowed: a list of rows/);
  });
  test('ein unbekannter Slot nennt die zulässigen', () => {
    assertThrows(() => requireDatasetRows([{ x: ref('a') }], pickable()), /invalid slot "x"; allowed: value, group/);
  });
  test('eine nicht wählbare Spalte nennt die wählbaren', () => {
    assertThrows(() => requireDatasetRows([{ value: ref('b') }], pickable()), /unknown ref "ws-1\|s1\|b"; available: ws-1\|s1\|a/);
  });
  test('gibt eine neue Liste zurück, die Eingabe bleibt unverändert', () => {
    const input = [{ value: ref('a') }];
    requireDatasetRows(input, pickable());
    assertEqual(Object.keys(input[0]).length, 1);
  });
});
