/**
 * Tests for the scenario API of core/examples-registry.js
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { ExamplesRegistry, parseScenarioItem } from '../../js/core/examples-registry.js';

const CATALOG = {
  version: '1.0',
  examples: [
    { id: 'ex-a', type: 'project', modules: ['sipoc'], file: 'projects/a.json', format: 'json' },
    { id: 'ex-b', type: 'dataset', modules: ['histogram', 'process-capability'], file: 'data/b.csv', format: 'csv' },
    { id: 'scn-full', type: 'scenario', cycle: 'dmaic', startPhase: 'define', items: ['ex-a', 'ex-b#histogram'] },
    { id: 'scn-starter', type: 'scenario', cycle: 'dmaic', startPhase: 'define', items: ['ex-a'] },
    { id: 'scn-other', type: 'scenario', cycle: 'dmadv', startPhase: 'define', items: ['ex-b'] },
  ],
};

function makeRegistry() {
  const reg = new ExamplesRegistry();
  reg._examples = CATALOG.examples;
  reg._initialized = true;
  return reg;
}

suite('parseScenarioItem', () => {
  test('plain id has no module', () => {
    assertDeepEqual(parseScenarioItem('ex-a'), { exampleId: 'ex-a', moduleId: null });
  });
  test('suffix selects the module', () => {
    assertDeepEqual(parseScenarioItem('ex-b#histogram'), { exampleId: 'ex-b', moduleId: 'histogram' });
  });
});

suite('ExamplesRegistry scenarios', () => {
  test('getScenarios returns every scenario entry', () => {
    assertEqual(makeRegistry().getScenarios().length, 3);
  });

  test('getScenarios filters by cycle', () => {
    const ids = makeRegistry().getScenarios({ cycle: 'dmaic' }).map(s => s.id);
    assertDeepEqual(ids, ['scn-full', 'scn-starter']);
  });

  test('getScenariosForExample matches plain and suffixed items', () => {
    const reg = makeRegistry();
    assertDeepEqual(reg.getScenariosForExample('ex-a').map(s => s.id), ['scn-full', 'scn-starter']);
    assertDeepEqual(reg.getScenariosForExample('ex-b').map(s => s.id), ['scn-full', 'scn-other']);
  });

  test('getScenariosForExample returns empty for unknown ids', () => {
    assertDeepEqual(makeRegistry().getScenariosForExample('nope'), []);
  });

  test('getForModule never returns scenarios', () => {
    const ids = makeRegistry().getForModule('sipoc').map(e => e.id);
    assertDeepEqual(ids, ['ex-a']);
  });
});
