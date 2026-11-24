/**
 * DatasetPicker — row extension: an extra per-row value with its own controls.
 */
import { suite, test, assertEqual, assertDeepEqual, afterEach } from '../test-utils.js';
import { DatasetPicker } from '../../js/ui/dataset-picker.js';
import { registerWorksheetReader } from '../../js/core/worksheet-columns.js';
import { readWorksheetState } from '../helpers/legacy-worksheet-read.js';

function makeContext() {
  const ws = { sheets: [{ id: 's1', name: 'One', state: { columns: [
    { id: 'a', shortName: 'C1', type: 'numeric', values: [1, 2, 3] },
  ] } }] };
  const phases = { data: [{ moduleId: 'worksheet', instanceId: 'ws-1' }] };
  const stateManager = {
    get(path) {
      if (path === 'phases') return phases;
      if (path.startsWith('phases.')) return phases[path.slice(7)] ?? [];
      return undefined;
    },
    getModuleState: (id) => (id === 'ws-1' ? ws : null),
  };
  registerWorksheetReader(stateManager, (id, options) => readWorksheetState(stateManager.getModuleState(id), options));
  return {
    stateManager,
    eventBus: { on() {}, off() {} },
    i18n: { t: (k) => k },
  };
}

let host;
const mount = (options) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  return new DatasetPicker(host, makeContext(), options);
};

/** An extension that records its render calls and exposes `update` per row. */
function recordingExtension() {
  const calls = [];
  return {
    calls,
    ext: {
      key: 'extra',
      empty: () => ({ v: 0 }),
      render(container, value, update, rowIdx) {
        calls.push({ container, value, update, rowIdx });
        container.textContent = `v=${value.v}`;
      },
    },
  };
}

suite('DatasetPicker — row extension', () => {
  afterEach(() => { if (host) { host.remove(); host = null; } });

  test('without rowExtension value has slot keys only', () => {
    const p = mount({ multi: true, slots: [{ key: 'x', label: 'X' }] });
    assertDeepEqual(Object.keys(p.value[0]), ['x']);
    assertEqual(host.querySelector('.ds-picker__extension'), null);
    p.destroy();
  });

  test('rowExtension renders once per row and seeds empty()', () => {
    const { calls, ext } = recordingExtension();
    const p = mount({ multi: true, slots: [{ key: 'x', label: 'X' }], rowExtension: ext });
    p.value = [{ x: null }, { x: null }];
    assertEqual(host.querySelectorAll('.ds-picker__extension').length, 2);
    const last = calls.slice(-2);
    assertDeepEqual(last.map(c => c.rowIdx), [0, 1]);
    assertDeepEqual(p.value.map(r => r.extra), [{ v: 0 }, { v: 0 }]);
    const ext0 = host.querySelector('[data-ds-idx="0"] .ds-picker__extension');
    assertEqual(ext0.previousElementSibling.classList.contains('ds-picker__slots'), true);
    p.destroy();
  });

  test('update stores value and fires onChange', () => {
    const { calls, ext } = recordingExtension();
    const seen = [];
    const p = mount({ multi: true, slots: [{ key: 'x', label: 'X' }], rowExtension: ext,
      onChange: (rows) => seen.push(rows) });
    calls[calls.length - 1].update({ v: 7 });
    assertDeepEqual(p.value[0].extra, { v: 7 });
    assertEqual(seen.length, 1);
    assertDeepEqual(seen[0][0].extra, { v: 7 });
    assertEqual(host.querySelector('.ds-picker__extension').textContent, 'v=7');
    p.destroy();
  });

  test('extension value survives removing an earlier row', () => {
    const { ext } = recordingExtension();
    const p = mount({ multi: true, slots: [{ key: 'x', label: 'X' }], rowExtension: ext });
    p.value = [{ x: null, extra: { v: 'A' } }, { x: null, extra: { v: 'B' } }];
    host.querySelector('[data-action="remove-dataset"][data-ds-idx="0"]').click();
    assertEqual(p.value.length, 1);
    assertDeepEqual(p.value[0].extra, { v: 'B' });
    p.destroy();
  });

  test('value setter keeps given extension values', () => {
    const { ext } = recordingExtension();
    const p = mount({ multi: true, slots: [{ key: 'x', label: 'X' }], rowExtension: ext });
    p.value = [{ x: null, extra: { v: 3 } }, { x: null }];
    assertDeepEqual(p.value.map(r => r.extra), [{ v: 3 }, { v: 0 }]);
    p.destroy();
  });
});
