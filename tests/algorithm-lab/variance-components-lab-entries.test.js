/**
 * D.Mike — Algorithm Lab: variance-components entries (Task 20).
 *
 * Task 20 could not exercise the Lab UI in a browser (Step 4's brief called
 * for a manual click-through). This is the programmatic stand-in: it pins
 * the "variance" category and its three algorithms (nested ANOVA, crossed
 * ANOVA, REML) in the generated lab data, and — since the brief shipped all
 * three as `"status": "validated"` without mentioning fixtures — that each
 * one actually carries inlined validation fixtures (split out of
 * tests/fixtures/variance/variance-components.fixtures.json into one file
 * per algorithm id; see tests/fixtures/variance/variance-components-*.json).
 * Without this, the Validation tab would call itself "validated" and show
 * nothing.
 */
import { suite, test, assertTrue, assertEqual } from '../test-utils.js';
import { INDEX, ALGOS, FIXTURES } from '../../js/algorithm-lab/lab-data.generated.js';

const ALGO_IDS = [
  'variance-components-nested-anova',
  'variance-components-crossed-anova',
  'variance-components-reml',
];

suite('Algorithm Lab: Kategorie "variance" mit drei Einträgen', () => {
  test('die Kategorie "variance" ist im Index registriert', () => {
    const cat = (INDEX.categories || []).find((c) => c.id === 'variance');
    assertTrue(!!cat, 'Kategorie "variance" fehlt in INDEX.categories');
    assertEqual(cat.name.de, 'Varianzkomponenten');
    assertEqual(cat.name.en, 'Variance Components');
  });

  test('alle drei Algorithmen sind im Index gelistet und in ALGOS auflösbar', () => {
    for (const id of ALGO_IDS) {
      const entry = (INDEX.algorithms || []).find((a) => a.id === id);
      assertTrue(!!entry, `Index-Eintrag fehlt: ${id}`);
      assertTrue(!!ALGOS[id], `ALGOS-Eintrag fehlt: ${id}`);
      assertEqual(ALGOS[id].category, 'variance');
      assertEqual(ALGOS[id].status, 'validated');
    }
  });

  test('jeder Algorithmus trägt Formeln, Annahmen, Grenzen und ein Try-it-Schema', () => {
    for (const id of ALGO_IDS) {
      const algo = ALGOS[id];
      const doc = algo.documentation || {};
      assertTrue(Array.isArray(doc.formulas) && doc.formulas.length > 0, `${id}: keine Formeln`);
      assertTrue(Array.isArray(doc.assumptions) && doc.assumptions.length > 0, `${id}: keine Annahmen`);
      assertTrue(Array.isArray(doc.limitations) && doc.limitations.length > 0, `${id}: keine Grenzen`);
      assertTrue(!!algo.try_it?.input_schema?.fields?.length, `${id}: kein Try-it-Eingabeschema`);
      assertTrue(!!algo.try_it?.output_schema, `${id}: kein Try-it-Ausgabeschema`);
    }
  });

  test('jeder validierte Algorithmus hat inlined Validierungs-Fixtures (nicht leer)', () => {
    for (const id of ALGO_IDS) {
      const fx = FIXTURES[id];
      assertTrue(!!fx, `FIXTURES-Eintrag fehlt für ${id} — Validierungstab wäre leer`);
      assertTrue(Array.isArray(fx.test_cases) && fx.test_cases.length > 0,
        `${id}: keine test_cases in den Fixtures`);
      assertEqual(fx.algorithm_id, id);
    }
  });

  test('REML-Fixtures enthalten beide REML-Testfälle aus der Quelldatei', () => {
    const fx = FIXTURES['variance-components-reml'];
    const ids = fx.test_cases.map((c) => c.id);
    assertTrue(ids.includes('nested-unbalanced-reml'), 'nested-unbalanced-reml fehlt');
    assertTrue(ids.includes('crossed-unbalanced-two-factor-reml'), 'crossed-unbalanced-two-factor-reml fehlt');
  });
});
