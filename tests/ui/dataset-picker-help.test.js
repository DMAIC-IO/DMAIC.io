/**
 * DatasetPicker — Kontexthilfe-Anker an Slot-Beschriftung und Hinzufügen-Knopf.
 */
import { suite, test, assertEqual, afterEach } from '../test-utils.js';
import { DatasetPicker } from '../../js/ui/dataset-picker.js';

function makeContext() {
  const ws = { sheets: [{ id: 's1', name: 'Eins', state: { columns: [
    { id: 'a', shortName: 'C1', type: 'numeric', values: [1, 2, 3] },
  ] } }] };
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
const mount = (options) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  return new DatasetPicker(host, makeContext(), options);
};

suite('DatasetPicker — Kontexthilfe-Anker', () => {
  afterEach(() => { if (host) { host.remove(); host = null; } });

  test('ein Slot mit helpKey trägt ihn an seiner Beschriftung', () => {
    const p = mount({ slots: [
      { key: 'x', label: 'X', types: ['numeric'], helpKey: 'modules.bar.actions.setColumn.help' },
      { key: 'g', label: 'G', group: true },
    ] });
    const labels = [...host.querySelectorAll('.ds-picker__slot-label')];
    assertEqual(labels[0].getAttribute('data-help-key'), 'modules.bar.actions.setColumn.help');
    assertEqual(labels[1].hasAttribute('data-help-key'), false);
    p.destroy?.();
  });

  test('addHelpKey verankert den Hinzufügen-Knopf, ohne Option bleibt er ohne', () => {
    const p = mount({ multi: true, slots: [{ key: 'x', label: 'X' }],
      addHelpKey: 'modules.boxplot.actions.setDatasets.help' });
    assertEqual(host.querySelector('.ds-picker__add-btn').getAttribute('data-help-key'),
      'modules.boxplot.actions.setDatasets.help');
    p.destroy?.();
    host.remove();
    const q = mount({ multi: true, slots: [{ key: 'x', label: 'X' }] });
    assertEqual(host.querySelector('.ds-picker__add-btn').hasAttribute('data-help-key'), false);
    q.destroy?.();
  });
});

suite('DatasetPicker — nicht reaktiv (Bug 14)', () => {
  afterEach(() => { if (host) { host.remove(); host = null; } });

  test('eine neue Instanz ist als nicht reaktiv markiert', () => {
    const p = mount({ slots: [{ key: 'x', label: 'X', types: ['numeric'] }] });
    assertEqual(p.__v_skip, true);
    p.destroy?.();
  });
});
