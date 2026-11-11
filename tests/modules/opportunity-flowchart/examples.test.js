import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/opportunity-flowchart/domain/model.js';

const BASE = new URL('../../../js/modules/opportunity-flowchart/resources/examples/', import.meta.url);

suite('Opportunity-Flowchart Beispiele', () => {
  test('examples.json listet das Angebotsprozess-Beispiel', async () => {
    const res = await fetch(new URL('examples.json', BASE), { cache: 'no-cache' });
    const cat = await res.json();
    const ex = cat.examples.find((e) => e.id === 'opportunity-flowchart-angebotsprozess');
    assertEqual(ex.type, 'project');
    assertEqual(ex.file, 'projects/opportunity-flowchart-angebotsprozess.json');
  });

  test('Beispiel Angebotsprozess lädt ohne Reparatur', async () => {
    const res = await fetch(new URL('projects/opportunity-flowchart-angebotsprozess.json', BASE), { cache: 'no-cache' });
    const data = await res.json();
    const reports = [];
    const m = State.fromJSON(data, { onRepair: (name) => reports.push(name) });
    assertEqual(m.steps.length, 5);
    assertDeepEqual(reports, []);
    assertDeepEqual(m.expanded, []);
    assertEqual(m.steps.filter((s) => s.side === 'va').length, 3);
    assertEqual(m.steps.filter((s) => s.side === 'nva').length, 2);
  });
});
