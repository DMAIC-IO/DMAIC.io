/**
 * Deployment-Flowchart: das ausgelieferte Beispiel lädt ohne Reparatur, und
 * die Felder gleichen dem `read()` der Altform (= Beispieldatei) ohne
 * `expanded` und `order` (A6).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/deployment-flowchart/domain/model.js';

const BASE = new URL('../../../js/modules/deployment-flowchart/resources/examples/', import.meta.url);
const ID = 'deployment-flowchart-auftragsdurchlauf';

const plain = (v) => JSON.parse(JSON.stringify(v));

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

suite('Deployment-Flowchart Beispiele', () => {
  test('examples.json listet das Beispiel Auftragsdurchlauf', async () => {
    const cat = await fetchJson(new URL('examples.json', BASE));
    const ex = cat.examples.find((e) => e.id === ID);
    assertEqual(ex.type, 'project');
    assertEqual(ex.file, `projects/${ID}.json`);
  });

  test('Beispiel Auftragsdurchlauf lädt ohne Reparatur, Felder wie die Altform', async () => {
    const data = await fetchJson(new URL(`projects/${ID}.json`, BASE));
    const reports = [];
    const m = State.fromJSON(plain(data), { repair: true, onRepair: (name) => reports.push(name) });
    assertDeepEqual(reports, []);
    assertDeepEqual(plain({ steps: m.steps, lanes: m.lanes }), {
      steps: data.steps.map((s) => ({
        id: s.id, title: s.title, description: s.description, laneId: s.laneId,
        substeps: s.substeps.map((x) => ({ id: x.id, title: x.title })),
      })),
      lanes: [...data.lanes].sort((x, y) => x.order - y.order).map((l) => ({ id: l.id, name: l.name })),
    });
    assertDeepEqual(plain(m.expanded), []);
  });
});
