/**
 * Deployment-Flowchart: JSON-Export (io/export.js) gegen die Byte-Fixture der
 * Altform (`legacy-export.json`, Instanz a des Altprojekts). Zeichengleich nach den
 * zwei gebilligten Abweichungen: Bahnen nach `order` sortiert und neu
 * nummeriert, der fremde Schrittschlüssel entfällt.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/deployment-flowchart/domain/model.js';
import { toJsonTree } from '../../../js/modules/deployment-flowchart/io/export.js';

async function fetchText(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}
const plain = (v) => JSON.parse(JSON.stringify(v));

suite('Deployment-Flowchart JSON-Export', () => {
  test('Altform (expanded, order) zeichengleich mit der Byte-Fixture (Bahnen nach order, ohne Fremdschlüssel)', async () => {
    const legacy = (await fetchText('./legacy-export.json')).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(legacy);
    assertEqual(JSON.stringify(parsed, null, 2), legacy, 'Fixture: Einrückung 2, kein Zeilenende');
    const want = {
      steps: parsed.steps.map(({ owner: _owner, ...s }) => s),
      lanes: [...parsed.lanes].sort((a, b) => a.order - b.order).map((l, order) => ({ ...l, order })),
    };
    const fx = JSON.parse(await fetchText('./legacy-project.json'));
    const m = State.fromJSON(plain(Object.values(fx.moduleStates)[0]));
    assertEqual(JSON.stringify(toJsonTree(m), null, 2), JSON.stringify(want, null, 2));
  });

  test('Schlüsselfolge der Schritte und Bahnen, ohne _schema', () => {
    const m = State.fromJSON({ steps: [{ id: 'a', laneId: 'l', substeps: [{ id: 'x', title: 'X' }] }], lanes: [{ id: 'l', name: 'L', order: 5 }] });
    m.setExpanded({ id: 'a', expanded: true });
    const out = toJsonTree(m);
    assertDeepEqual(Object.keys(out), ['steps', 'lanes']);
    assertDeepEqual(Object.keys(out.steps[0]), ['id', 'title', 'description', 'laneId', 'expanded', 'substeps']);
    assertEqual(out.steps[0].expanded, true);
    assertDeepEqual(out.lanes, [{ id: 'l', name: 'L', order: 0 }]);
  });

  test('der Baum ist eine Kopie', () => {
    const m = State.fromJSON({ steps: [{ id: 'a', title: 'A', substeps: [{ id: 'x', title: 'X' }] }] });
    const out = toJsonTree(m);
    out.steps[0].substeps[0].title = 'geändert';
    assertTrue(m.steps[0].substeps[0].title === 'X');
  });
});
