/**
 * Tests for core/agent/agent-options.js — pickableColumnList mit `filter`.
 */
import { suite, test, assertEqual } from '../../test-utils.js';
import { pickableColumnList } from '../../../js/core/agent/agent-options.js';

/** StateManager-Attrappe in der Form, die discoverColumns liest. */
function smWithTwoColumns() {
  const ws = { sheets: [{ id: 's1', name: 'Blatt', state: { columns: [
    { id: 'a', shortName: 'C1', type: 'numeric', values: [1, 2, 3] },
    { id: 'b', shortName: 'C2', type: 'numeric', values: [4, 5, 6] },
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

suite('agent-options pickableColumnList', () => {
  test('wendet filter nach den Typen an, wie der Wähler', () => {
    const sm = smWithTwoColumns();
    const all = pickableColumnList(sm, { types: ['numeric'] });
    const onlyB = pickableColumnList(sm, { types: ['numeric'], filter: (c) => c.columnId === 'b' });
    assertEqual(all.length, 2);
    assertEqual(onlyB.length, 1);
    assertEqual(onlyB[0].name, 'C2');
  });
});
