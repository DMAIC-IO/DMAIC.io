/**
 * Tests for the tab name provisionWorksheet() gives a new Datensammlung.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { provisionWorksheet } from '../../js/core/examples-registry.js';

function makeContext() {
  const phases = { data: [] };
  return {
    stateManager: {
      get: (key) => (key === 'phases' ? phases : phases[key.split('.')[1]] ?? []),
      set: (key, value) => { phases[key.split('.')[1]] = value; },
      setModuleState: () => {},
    },
    eventBus: { emit: () => {} },
    _phases: phases,
  };
}

const WS_STATE = { sheets: [{ id: 's-1', name: 'Daten', state: {} }], activeSheetId: 's-1' };

suite('provisionWorksheet tab name', () => {
  test('names the tab after the active sheet', () => {
    const ctx = makeContext();
    provisionWorksheet(ctx, {
      sheets: [{ id: 's-1', name: 'Erstes', state: {} }, { id: 's-2', name: 'Aktiv', state: {} }],
      activeSheetId: 's-2',
    });
    assertEqual(ctx._phases.data[0].customName, 'Aktiv');
  });

  test('numbers a name that another Datensammlung already carries', () => {
    const ctx = makeContext();
    ctx._phases.data.push({ instanceId: 'own', moduleId: 'worksheet', order: 0, state: {}, customName: 'Daten' });
    provisionWorksheet(ctx, WS_STATE);
    provisionWorksheet(ctx, WS_STATE);
    assertEqual(ctx._phases.data.map(i => i.customName).join('|'), 'Daten|Daten 2|Daten 3');
  });

  test('ignores names of other module types', () => {
    const ctx = makeContext();
    ctx._phases.data.push({ instanceId: 'x', moduleId: 'boxplot', order: 0, state: {}, customName: 'Daten' });
    provisionWorksheet(ctx, WS_STATE);
    assertEqual(ctx._phases.data[1].customName, 'Daten');
  });

  test('leaves the tab unnamed when the sheet has no name', () => {
    const ctx = makeContext();
    provisionWorksheet(ctx, { sheets: [{ id: 's-1', state: {} }], activeSheetId: 's-1' });
    assertTrue(!('customName' in ctx._phases.data[0]), 'falls back to the module name');
  });
});
