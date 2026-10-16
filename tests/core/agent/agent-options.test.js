/**
 * Tests for core/agent/agent-options.js — pickableColumnList mit `filter`, targetColumnList.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { pickableColumnList, targetColumnList } from '../../../js/core/agent/agent-options.js';

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

suite('agent-options targetColumnList', () => {
  test('nennt je Blatt seine Spalten und danach die neue Spalte', () => {
    const keys = targetColumnList(smWithTwoColumns()).map(c => c.key);
    assertDeepEqual(keys, ['ws-1|s1|a', 'ws-1|s1|b', 'ws-1|s1|__new__']);
  });
  test('ein Blatt ohne wählbare Spalte bietet keine neue Spalte, wie der Wähler', () => {
    assertDeepEqual(targetColumnList(smWithTwoColumns(), { maxCount: 0 }), []);
  });
  test('die neue Spalte trägt den Blattnamen', () => {
    const entry = targetColumnList(smWithTwoColumns()).at(-1);
    assertEqual(entry.name, 'Blatt');
  });
});
