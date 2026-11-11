import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/opportunity-flowchart/domain/model.js';
import { from0 } from '../../../js/modules/opportunity-flowchart/domain/migrations.js';

suite('Opportunity-Flowchart Migration 0→1.0', () => {
  const legacy = () => ({
    steps: [
      { id: 'o1', title: 'A', description: '', side: 'nva', expanded: true, substeps: [] },
      { id: 'o2', side: '??', expanded: false, extra: 1 },
    ],
  });

  test('from0: expanded wandert in die Liste, Seite und Fremdfelder werden bereinigt', () => {
    const out = from0(legacy());
    assertDeepEqual(out.expanded, ['o1']);
    assertEqual('expanded' in out.steps[0], false);
    assertEqual(out.steps[1].side, 'va');
    assertEqual('extra' in out.steps[1], false);
    assertDeepEqual(out.steps[1], { id: 'o2', title: '', description: '', side: 'va', substeps: [] });
  });

  test('fromJSON hebt den Altstand: _schema, expanded, strikt geladen', () => {
    const m = State.fromJSON(legacy());
    const json = m.toJSON();
    assertDeepEqual(json._schema, { version: '1.0' });
    assertDeepEqual(json.expanded, ['o1']);
    assertEqual(json.steps[1].side, 'va');
    assertEqual('extra' in json.steps[1], false);
  });

  test('Beispiel Angebotsprozess lädt ohne Reparatur', async () => {
    const res = await fetch(new URL('../../../examples/projects/opportunity-flowchart-angebotsprozess.json', import.meta.url), { cache: 'no-cache' });
    const data = await res.json();
    const reports = [];
    const m = State.fromJSON(data, { onRepair: (name) => reports.push(name) });
    assertEqual(m.steps.length, 5);
    assertDeepEqual(reports, []);
    assertDeepEqual(m.expanded, []);
  });
});
