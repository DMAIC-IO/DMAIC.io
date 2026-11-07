import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { from0, isValidResult, normalizeResult } from '../../js/modules/resampling/domain/migrations.js';
import { State } from '../../js/modules/resampling/domain/model.js';
import { loadModel } from '../../js/core/initial-model.js';

const ref = { instanceId: 'w', sheetId: 's', columnId: 'a' };
const iv = { percentile: [1, 2], bca: [1.1, 2.1], bcaFallback: false };
const RESULT = {
  inputsHash: 'abcd1234', mode: 'one', statisticId: 'mean', contrast: 'difference', direction: 'two-sided',
  confidence: 0.95, B: 1000, seed: 42, labels: ['A'], n: [12],
  boot: { estimate: 1.5, se: 0.1, bias: 0, ci: iv, bins: [{ x0: 1, x1: 2, count: 3 }] }, perm: null, k: null,
};

suite('resampling: Migration 0→1.0', () => {
  test('gültiger Altstand mit Ergebnis bleibt', () => {
    const out = from0({ mode: 'one', statisticId: 'median', colRef1: ref, B: 2000, seed: 7, confidence: 0.9, ciMethod: 'percentile', result: RESULT });
    assertEqual(out.statisticId, 'median');
    assertDeepEqual(out.result, RESULT);
    const m = loadModel(State, out);
    assertEqual(m.result.boot.estimate, 1.5);
  });
  test('ungültiges Ergebnis wird null', () => {
    assertEqual(from0({ result: { inputsHash: 1 } }).result, null);
    assertEqual(from0({ result: { ...RESULT, mode: 'zz' } }).result, null);
  });
  test('Altlasten wie State.fromJSON', () => {
    const out = from0({ mode: 'zz', statisticId: 'ppk', B: -3, seed: -1, confidence: 2, ciMethod: 'x', contrast: 'x', direction: 'x', target: 5, colRef1: { instanceId: null }, colRefsK: [ref, { columnId: null }], statParams: { trim: 'x', p: 0.9, lsl: 9.5, usl: {} }, exampleWorksheetId: 3 });
    const m = loadModel(State, out);
    assertEqual(m.mode, 'one');
    assertEqual(m.statisticId, 'ppk');
    assertEqual(m.B, 10000);
    assertEqual(m.seed, 42);
    assertEqual(m.confidence, 0.95);
    assertEqual(m.ciMethod, 'bca');
    assertEqual(m.target, '');
    assertEqual(m.colRef1, null);
    assertEqual(m.colRefsK.length, 1);
    assertDeepEqual({ ...m.statParams }, { trim: 0.1, p: 0.9, lsl: '9.5', usl: '' });
    assertEqual(m.exampleWorksheetId, null);
  });
  test('Statistik, die der Modus nicht erlaubt, fällt weg', () => {
    assertEqual(loadModel(State, from0({ mode: 'paired', statisticId: 'ppk' })).statisticId, 'mean');
  });
  test('normalizeResult nimmt fremde Schlüssel heraus', () => {
    const r = normalizeResult({ ...RESULT, boot: { ...RESULT.boot, decision: 'reject' }, extra: 1 });
    assertEqual('extra' in r, false);
    assertEqual('decision' in r.boot, false);
    assertEqual(isValidResult(r), true);
  });
});
