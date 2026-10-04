/**
 * ColumnPicker — additive `filter` option (ColumnInfo → boolean).
 */
import { suite, test, assertEqual, afterEach } from '../test-utils.js';
import { ColumnPicker } from '../../js/ui/column-picker.js';

function makeContext() {
  const ws = {
    sheets: [
      { id: 's1', name: 'Eins', state: { columns: [
        { id: 'a', shortName: 'C1', type: 'numeric', values: [1, 2] },
        { id: 'b', shortName: 'C2', type: 'text', values: ['x', 'y'] },
      ] } },
      { id: 's2', name: 'Zwei', state: { columns: [
        { id: 'c', shortName: 'C1', type: 'numeric', values: [3] },
      ] } },
    ],
  };
  const phases = { data: [{ moduleId: 'worksheet', instanceId: 'ws-1' }] };
  return {
    stateManager: {
      get(path) {
        if (path === 'phases') return phases;
        if (path.startsWith('phases.')) return phases[path.slice(7)] ?? [];
        return undefined;
      },
      getModuleState: (id) => (id === 'ws-1' ? ws : null),
    },
    eventBus: { on() {}, off() {} },
    i18n: { t: (k) => k },
  };
}

let host;
const optionValues = () => [...host.querySelectorAll('option')].map(o => o.value).filter(Boolean);

suite('ColumnPicker — filter option', () => {
  afterEach(() => { if (host) { host.remove(); host = null; } });

  test('without a filter every column is offered', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const p = new ColumnPicker(host, makeContext(), { mode: 'select' });
    assertEqual(optionValues().length, 3);
    p.destroy();
  });

  test('the filter limits the options, e.g. to one sheet', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const p = new ColumnPicker(host, makeContext(), { mode: 'select', filter: (c) => c.sheetId === 's1' });
    assertEqual(JSON.stringify(optionValues()), JSON.stringify(['ws-1|s1|a', 'ws-1|s1|b']));
    p.destroy();
  });

  test('the filter is re-evaluated on refresh', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    let sheet = 's1';
    const p = new ColumnPicker(host, makeContext(), { mode: 'select', filter: (c) => c.sheetId === sheet });
    sheet = 's2';
    p.refresh();
    assertEqual(JSON.stringify(optionValues()), JSON.stringify(['ws-1|s2|c']));
    p.destroy();
  });
});
