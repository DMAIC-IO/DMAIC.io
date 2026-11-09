import { suite, test, assert, assertEqual, assertDeepEqual, assertAlmostEqual } from '../../test-utils.js';
import { buildDataArrays, computeAnalysis } from '../../../js/modules/msa-typ2/domain/data.js';

async function exampleData() {
  const ws = await (await fetch(new URL('../../../examples/worksheets/msa-typ2-akzeptabel.json', import.meta.url))).json();
  const col = Object.fromEntries(ws.sheets[0].state.columns.map(c => [c.id, c.values]));
  return { parts: col['c-teil'], operators: col['c-operator'], measurements: col['c-messwert'] };
}

suite('MSA Typ 2 — buildDataArrays', () => {
  test('Komma als Dezimaltrenner: "2,5" zählt als 2,5', () => {
    const d = buildDataArrays({ parts: ['a'], operators: ['x'], measurements: ['2,5'] });
    assertDeepEqual(d, { parts: ['a'], operators: ['x'], measurements: [2.5] });
  });
  test('null-Zellen fallen zeilenweise', () => {
    const d = buildDataArrays({ parts: ['a', null, 'c'], operators: ['x', 'y', null], measurements: [1, 2, 3] });
    assertDeepEqual(d, { parts: ['a'], operators: ['x'], measurements: [1] });
  });
  test('nicht numerische Messwerte fallen', () => {
    const d = buildDataArrays({ parts: ['a', 'b'], operators: ['x', 'x'], measurements: ['abc', 4] });
    assertDeepEqual(d.measurements, [4]);
  });
  test('ohne Prüfer: operators ist null (Typ 3)', () => {
    const d = buildDataArrays({ parts: ['a', 'b'], operators: null, measurements: [1, 2] });
    assertDeepEqual(d, { parts: ['a', 'b'], operators: null, measurements: [1, 2] });
  });
  test('ungleiche Längen: Minimum', () => {
    const d = buildDataArrays({ parts: ['a', 'b', 'c'], operators: ['x', 'y'], measurements: [1, 2, 3, 4] });
    assertEqual(d.parts.length, 2);
    assertEqual(d.operators.length, 2);
    assertEqual(d.measurements.length, 2);
  });
  test('alles leer: null', () => {
    assertEqual(buildDataArrays({ parts: [], operators: [], measurements: [] }), null);
    assertEqual(buildDataArrays({ parts: [null], operators: ['x'], measurements: [1] }), null);
  });
});

suite('MSA Typ 2 — computeAnalysis', () => {
  const OPTS = { alpha: 0.05, studyVarMultiplier: 6, lsl: 6, usl: 14 };

  test('null ohne Daten', () => {
    assertEqual(computeAnalysis(null, OPTS), null);
  });
  test('zu wenig Teile: invalid mit Schlüssel und Variablen', () => {
    const r = computeAnalysis({ parts: ['a', 'a'], operators: ['x', 'y'], measurements: [1, 2] }, OPTS);
    assertEqual(r.invalid.key, 'modules.msa-typ2.errTooFewParts');
    assertDeepEqual(r.invalid.vars, { n: 1 });
  });
  test('gültige Daten aus msa-typ2-akzeptabel: Typ 2, %GRR', async () => {
    const r = computeAnalysis(buildDataArrays(await exampleData()), OPTS);
    assertEqual(r.mode, 'typ2');
    assert(r.varComp.grr.pctStudyVar > 0 && r.varComp.grr.pctStudyVar < 30, 'pctStudyVar plausibel');
    assertAlmostEqual(r.varComp.grr.pctStudyVar, EXPECTED_STUDY, 1e-9);
  });
  test('null-Grenzen werden NaN, ohne Grenzen keine Toleranz', async () => {
    const r = computeAnalysis(buildDataArrays(await exampleData()), { alpha: 0.05, studyVarMultiplier: 6, lsl: null, usl: null });
    assertEqual(r.varComp.grr.pctTolerance, null);
  });
  test('σ_hist liefert %Process', async () => {
    const r = computeAnalysis(buildDataArrays(await exampleData()), { ...OPTS, historicalSigma: 0.004 });
    assert(r.varComp.grr.pctProcess != null);
  });
  test('werfende Analyse: { error }', () => {
    const engine = { validate: () => ({ valid: true }), analyze: () => { throw new Error('boom'); } };
    const r = computeAnalysis({ parts: ['a'], operators: ['x'], measurements: [1] }, OPTS, engine);
    assertDeepEqual(r, { error: 'boom' });
  });
});

// %GRR (Studienstreuung) des Beispiels; der E2E erwartet dort Status "pass".
const EXPECTED_STUDY = 5.410077863184201;
