/**
 * Tests for js/modules/doe-planner/domain/experiment.js — the snapshot of a
 * datasheet and the experiment built from it, against the records the
 * planner wrote before (without createdAt and experimentId).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { snapshotOf, experimentOf } from '../../../js/modules/doe-planner/domain/experiment.js';
import { loadCases, legacyExperiments } from './cases.js';

suite('doe-planner domain — experimentOf', () => {
  test('gleicher Versuch wie der bisherige Eintrag, je Beispielplan', async () => {
    const frozen = await legacyExperiments();
    const cases = await loadCases();
    for (const c of cases) {
      const { worksheetRef, record } = frozen[c.name];
      const ref = { ...worksheetRef, snapshot: snapshotOf(c.model, c.design) };
      assertDeepEqual(experimentOf(ref), record, c.name);
    }
  });

  test('ohne Bindung oder ohne Momentaufnahme null', async () => {
    const frozen = await legacyExperiments();
    assertEqual(experimentOf(null), null);
    assertEqual(experimentOf({ ...frozen.seeded.worksheetRef }), null);
    assertEqual(experimentOf({ ...frozen.seeded.worksheetRef, snapshot: null }), null);
  });

  test('die Momentaufnahme ist reines JSON und hängt nicht am Model', async () => {
    const [c] = await loadCases();
    const snap = snapshotOf(c.model, c.design);
    assertDeepEqual(JSON.parse(JSON.stringify(snap)), snap);
    assertDeepEqual(Object.keys(snap).sort(), ['aliasing', 'centerPointRows', 'designType', 'factors', 'name', 'plannedTerms', 'replicateGroups', 'responses']);
    const before = snap.factors[0].levels[0];
    c.model.factors[0].levels[0] = 'changed';
    c.model.responses[0].name = 'changed';
    assertEqual(snap.factors[0].levels[0], before);
    assertEqual(snap.responses[0].name, 'Ausbeute');
  });

  test('Wiederholungsgruppen aus gleichen Zeilen der kodierten Matrix', async () => {
    const cases = await loadCases();
    const heli = cases.find((c) => c.name === 'doe-planner-hubschrauber-flyer');
    const snap = snapshotOf(heli.model, heli.design);
    assertEqual(snap.replicateGroups.length, 9);
    for (const g of snap.replicateGroups) assertEqual(g.length, 2);
  });

  test('ohne kodierte Matrix keine Wiederholungsgruppen', async () => {
    const [c] = await loadCases();
    const design = { ...c.design, codedMatrix: undefined, actualMatrix: [[1, 2], [1, 2]] };
    assertDeepEqual(snapshotOf(c.model, design).replicateGroups, []);
  });
});
