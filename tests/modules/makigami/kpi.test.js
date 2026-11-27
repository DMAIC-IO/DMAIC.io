/**
 * Makigami: Kennzahlen und unlesbare Dauertexte (domain/kpi.js) samt Merker
 * je Model.
 */
import { suite, test, assertEqual, assertDeepEqual, assertAlmostEqual, assertTrue } from '../../test-utils.js';
import { analyze, analysisRuns } from '../../../js/modules/makigami/domain/kpi.js';
import { createDefaultTimeUnits } from '../../../js/modules/makigami/domain/defaults.js';

const step = (id, processTime, waitTime) => ({ id, processTime, waitTime });

suite('makigami Kennzahlen', () => {
  test('Summen, Lead Time und PCE', () => {
    const r = analyze({ steps: [step('a', '30min', '1h'), step('b', '1h', '1d')], timeUnits: createDefaultTimeUnits() });
    assertDeepEqual([r.kpi.process, r.kpi.wait, r.kpi.lead], [5400, 32400, 37800]);
    assertAlmostEqual(/** @type {number} */ (r.kpi.pce), 5400 / 37800, 1e-12);
    assertDeepEqual(r.invalid, []);
  });
  test('unlesbare Texte zählen nicht und stehen je Schritt und Feld in invalid', () => {
    const r = analyze({ steps: [step('a', '20 Minuten', '1h'), step('b', '10min', 'x')], timeUnits: createDefaultTimeUnits() });
    assertDeepEqual([r.kpi.process, r.kpi.wait], [600, 3600]);
    assertDeepEqual(r.invalid, [{ stepId: 'a', field: 'processTime' }, { stepId: 'b', field: 'waitTime' }]);
  });
  test('ohne Lead Time ist die PCE null', () => {
    assertEqual(analyze({ steps: [], timeUnits: createDefaultTimeUnits() }).kpi.pce, null);
    assertEqual(analyze({ steps: [step('a', '', '')], timeUnits: createDefaultTimeUnits() }).kpi.pce, null);
  });
  test('Merker: gleiche Texte und Einheiten rechnen nicht neu, eine Änderung schon', () => {
    const m = { steps: [step('a', '1h', '')], timeUnits: createDefaultTimeUnits() };
    const first = analyze(m);
    const runs = analysisRuns();
    assertTrue(analyze(m) === first, 'gleiches Objekt');
    assertEqual(analysisRuns(), runs);
    m.steps[0].waitTime = '1h';
    const second = analyze(m);
    assertEqual(analysisRuns(), runs + 1);
    assertEqual(second.kpi.wait, 3600);
    m.timeUnits[2].factorSeconds = 60;
    assertEqual(analyze(m).kpi.process, 60);
    assertEqual(analysisRuns(), runs + 2);
  });
});
