/**
 * Activity-Flowchart: das Beispiel „Anfrage-zu-Angebot“ lädt ohne Reparatur,
 * `derived bands` gleicht dem `read()` der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/activity-flowchart/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';

const FILE = new URL('../../../js/modules/activity-flowchart/resources/examples/projects/activity-flowchart-anfrage-zu-angebot.json', import.meta.url);
const T = (key, p) => ({ mainPath: 'Hauptpfad', unnamedDecision: '(ohne Frage)', bandLabel: `Nein: ${p?.q}` })[key] ?? key;

suite('Activity-Flowchart Beispiel', () => {
  test('Anfrage-zu-Angebot lädt ohne Reparatur; Bänder wie die Altform', async () => {
    const data = await (await fetch(FILE, { cache: 'no-cache' })).json();
    const reports = [];
    const m = State.fromJSON(data, { repair: true, onRepair: (name) => reports.push(name) });
    assertDeepEqual(reports, []);
    assertEqual(m.steps.length, 7);
    assertDeepEqual(m.steps.map((s) => s.branchId), ['main', 'main', 'main', 'main', 'no:s4', 'main', 'main']);
    assertEqual(m.steps[3].decision.noTarget, 's3');
    assertDeepEqual([...m.expanded], []);
    assertDeepEqual(evaluateDerived(m, null, undefined, T).bands, [
      { id: 'main', ownerId: null, label: 'Hauptpfad', depth: 0 },
      { id: 'no:s4', ownerId: 's4', label: 'Nein: Angebot freigegeben?', depth: 1 },
    ]);
  });
});
