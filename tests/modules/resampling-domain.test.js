import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { State, STATS_BY_MODE, STATISTIC_IDS, SEED_MAX } from '../../js/modules/resampling/domain/model.js';
import { STATISTIC_IDS as ENGINE_IDS } from '../../js/engines/resampling-engine.js';
import { readInputs, buildJobs, computeInputsHash, summarize } from '../../js/modules/resampling/domain/analyze.js';
import { runJobSync } from '../../js/engines/resampling-engine.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const sheet = { a: [9.8, 10.1, 10.0, 9.9, 10.2, 10.05, 9.95, 10.15, 9.85, 10.0, 10.1, 9.9], b: [10.3, 10.4, 10.2, 10.5, 10.35, 10.45, 10.25, 10.4, 10.3, 10.5, 10.2, 10.6], c: [11, 11.2, 10.9, 11.1, 11.3, 11, 10.8, 11.2, 11.1, 11, 10.9, 11.15] };
const values = (r) => sheet[r.columnId] ?? null;

/** Ein echtes Ergebnis je Modus (kleines B, schnell). */
function resultFor(fields) {
  const m = new State();
  Object.assign(m, { B: 1000, ...fields });
  const snap = JSON.parse(JSON.stringify(m.toJSON()));
  const inputs = readInputs(snap, values);
  const jobs = buildJobs(snap, inputs);
  const outcomes = jobs.map((j) => ({ role: j.role, result: runJobSync(j.job) }));
  return JSON.parse(JSON.stringify(summarize(snap, inputs, outcomes, computeInputsHash(snap, inputs), ['A', 'B', 'C'].slice(0, inputs.groups ? 3 : (inputs.y ? 2 : 1)))));
}

suite('resampling: Model', () => {
  test('Vorgaben wie die alte Form', () => {
    const m = new State();
    assertEqual(m.mode, 'one');
    assertEqual(m.statisticId, 'mean');
    assertDeepEqual({ ...m.statParams }, { trim: 0.1, p: 0.95, lsl: '', usl: '' });
    assertEqual(m.contrast, 'difference');
    assertEqual(m.direction, 'two-sided');
    assertEqual(m.target, '');
    assertEqual(m.colRef1, null);
    assertDeepEqual([...m.colRefsK], []);
    assertEqual(m.B, 10000);
    assertEqual(m.seed, 42);
    assertEqual(m.confidence, 0.95);
    assertEqual(m.ciMethod, 'bca');
    assertEqual(m.result, null);
    assertEqual(m.hasContent(), false);
  });
  test('Statistik-Listen gleich der Engine', () => {
    assertDeepEqual([...STATISTIC_IDS], [...ENGINE_IDS]);
    assertDeepEqual([...STATS_BY_MODE.paired], ['mean', 'median', 'trimmedMean']);
    assertTrue(!STATS_BY_MODE.k.includes('ppk'));
  });
  test('Grenzen der Felder', () => {
    const m = new State();
    assertThrows(() => { m.confidence = 1; });
    assertThrows(() => { m.B = 0; });
    assertThrows(() => { m.B = 1.5; });
    assertThrows(() => { m.seed = SEED_MAX + 1; });
    assertThrows(() => { m.statParams = { ...m.statParams, trim: 0.5 }; });
    m.B = 500;
    assertEqual(m.B, 500, 'B unter 1000 ist ein Hinweis, keine Ablehnung');
  });
  test('Invariante statisticForMode und setMode', () => {
    const m = new State();
    m.statisticId = 'ppk';
    assertThrows(() => { m.mode = 'paired'; }, /statisticForMode/);
    m.setMode({ mode: 'paired' });
    assertEqual(m.mode, 'paired');
    assertEqual(m.statisticId, 'mean');
    m.statisticId = 'median';
    m.setMode({ mode: 'two' });
    assertEqual(m.statisticId, 'median');
  });
  test('rollSeed: 1…SEED_MAX', () => {
    const m = new State();
    const s = m.rollSeed({});
    assertTrue(Number.isInteger(s) && s >= 1 && s <= SEED_MAX);
    assertEqual(m.seed, s);
  });
  test('result nimmt echte Ergebnisse aller Modi an', () => {
    const m = new State();
    for (const fields of [
      { mode: 'one', colRef1: ref('a') },
      { mode: 'one', statisticId: 'ppk', colRef1: ref('a'), statParams: { trim: 0.1, p: 0.95, lsl: '9.5', usl: '10.5' } },
      { mode: 'two', colRef1: ref('a'), colRef2: ref('b') },
      { mode: 'paired', colRef1: ref('a'), colRef2: ref('b') },
      { mode: 'k', colRefsK: [ref('a'), ref('b'), ref('c')] },
    ]) {
      m.result = resultFor(fields);
      assertEqual(m.result.mode, fields.mode);
    }
  });
  test('Ansicht zählt nicht als Inhalt', () => {
    const m = new State();
    m.bootChartEdits = { title: 'X' };
    assertEqual(m.hasContent(), false);
  });
});
