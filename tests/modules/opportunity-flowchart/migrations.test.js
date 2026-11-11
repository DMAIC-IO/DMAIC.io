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

  test('from0: Schritte und Unterschritte ohne id bekommen eindeutige Ersatz-ids', () => {
    const out = from0({ steps: [
      { title: 'A', substeps: [{ title: 'x' }, { title: 'y' }] },
      { title: 'B' },
      { id: 's0m0', title: 'C' },
    ] });
    const ids = out.steps.map((x) => x.id);
    assertEqual(new Set(ids).size, 3);
    assertEqual(out.steps[2].id, 's0m0');
    assertEqual(State.fromJSON({ steps: out.steps, expanded: [] }).steps.length, 3);
    const subs = out.steps[0].substeps.map((x) => x.id);
    assertEqual(new Set(subs).size, 2);
    assertEqual(State.fromJSON({ steps: [{ title: 'A' }, { title: 'B' }] }).steps.length, 2);
  });

  test('from0: eine vorhandene id gleich dem Ersatzmuster bleibt unverändert', () => {
    const out = from0({ steps: [{ id: 'a', substeps: [{ id: 'ss0m0_0', title: '' }, { title: '' }] }] });
    assertDeepEqual(out.steps[0].substeps.map((x) => x.id), ['ss0m0_0', 'ss0m0_1']);
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
