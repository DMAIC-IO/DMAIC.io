/**
 * D.Mike — Resampling module: State defaults, mode rules, sanitizing fromJSON.
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import {
  State, MODES, STATS_BY_MODE, SEED_MAX,
} from '../../js/modules/resampling/resampling-model.js';

suite('resampling-model — defaults and rules', () => {
  test('spec defaults', () => {
    const s = new State();
    assertEqual(s.mode, 'one');
    assertEqual(s.statisticId, 'mean');
    assertDeepEqual(s.statParams, { trim: 0.1, p: 0.95, lsl: '', usl: '' });
    assertEqual(s.contrast, 'difference');
    assertEqual(s.direction, 'two-sided');
    assertEqual(s.target, '');
    assertEqual(s.B, 10000);
    assertEqual(s.seed, 42);
    assertEqual(s.confidence, 0.95);
    assertEqual(s.ciMethod, 'bca');
    assertEqual(s.result, null);
    assertEqual(s.hasContent(), false);
  });
  test('statistics per mode', () => {
    assertEqual(MODES.join(','), 'one,two,paired,k');
    assertEqual(STATS_BY_MODE.paired.join(','), 'mean,median,trimmedMean');
    assertTrue(!STATS_BY_MODE.k.includes('ppk'));
    assertTrue(STATS_BY_MODE.one.includes('ppk') && STATS_BY_MODE.two.includes('ppk'));
    const s = new State();
    s.mode = 'paired';
    assertEqual(s.allowedStatistics().join(','), 'mean,median,trimmedMean');
  });
  test('setMode resets a statistic the new mode does not allow, keeps an allowed one', () => {
    const s = new State();
    s.statisticId = 'ppk';
    s.setMode('k');
    assertEqual(s.mode, 'k');
    assertEqual(s.statisticId, 'mean');
    s.statisticId = 'median';
    s.setMode('paired');
    assertEqual(s.statisticId, 'median');
    s.setMode('nonsense');
    assertEqual(s.mode, 'paired');
  });
  test('rollSeed draws 1…SEED_MAX from the injected random source', () => {
    const s = new State();
    assertEqual(s.rollSeed(() => 0), 1);
    assertEqual(s.seed, 1);
    assertEqual(s.rollSeed(() => 0.9999999999), SEED_MAX);
  });
  test('isStale and hasContent', () => {
    const s = new State();
    assertEqual(s.isStale('abc'), false);
    s.result = { inputsHash: 'abc', mode: 'one' };
    assertEqual(s.isStale('abc'), false);
    assertEqual(s.isStale('abd'), true);
    s.colRefsK = [{ instanceId: 'w', columnId: 'c' }];
    assertEqual(s.hasContent(), true);
  });
  test('toJSON / fromJSON round trip', () => {
    const s = new State();
    s.mode = 'two';
    s.statisticId = 'median';
    s.statParams = { trim: 0.2, p: 0.9, lsl: '9.7', usl: '10.3' };
    s.contrast = 'ratio';
    s.direction = 'less';
    s.target = '10';
    s.colRef1 = { instanceId: 'w1', sheetId: 's', columnId: 'a' };
    s.colRef2 = { instanceId: 'w1', sheetId: 's', columnId: 'b' };
    s.B = 2000;
    s.seed = 7;
    s.confidence = 0.9;
    s.ciMethod = 'percentile';
    s.exampleWorksheetId = 'ws-1';
    s.result = { inputsHash: '0badc0de', mode: 'two', boot: null };
    const r = State.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    assertDeepEqual(r.toJSON(), s.toJSON());
  });
});

// Review Focus 4: garbage or outdated imported state never throws.
suite('resampling-model — fromJSON sanitizes garbage', () => {
  test('non-objects → defaults', () => {
    for (const d of [null, undefined, 42, 'x', []]) {
      assertDeepEqual(State.fromJSON(d).toJSON(), new State().toJSON());
    }
  });
  test('wrong types and unknown values fall back to defaults', () => {
    const s = State.fromJSON({
      mode: 'blocks', statisticId: 'cpk', statParams: 'oops', contrast: 'sum', direction: 'up',
      target: 12, colRef1: 'col', colRef2: { columnId: 'x' }, colRefsK: 'nope',
      B: 'many', seed: -5, confidence: 'high', ciMethod: 'normal', exampleWorksheetId: 3,
      result: 'yesterday',
    });
    assertDeepEqual(s.toJSON(), new State().toJSON());
  });
  test('statParams fields are sanitized one by one', () => {
    const s = State.fromJSON({ statParams: { trim: 'x', p: 0.5, lsl: 9.7, usl: null } });
    assertDeepEqual(s.statParams, { trim: 0.1, p: 0.5, lsl: '9.7', usl: '' });
  });
  test('statistic not allowed for the stored mode → mean', () => {
    assertEqual(State.fromJSON({ mode: 'paired', statisticId: 'ppk' }).statisticId, 'mean');
    assertEqual(State.fromJSON({ mode: 'k', statisticId: 'cv' }).statisticId, 'cv');
  });
  test('result kept only with a string inputsHash and a valid mode', () => {
    assertEqual(State.fromJSON({ result: { mode: 'one' } }).result, null);
    assertEqual(State.fromJSON({ result: { inputsHash: 5, mode: 'one' } }).result, null);
    assertEqual(State.fromJSON({ result: { inputsHash: 'ab', mode: 'x' } }).result, null);
    assertEqual(State.fromJSON({ result: { inputsHash: 'ab', mode: 'k' } }).result.inputsHash, 'ab');
  });
  test('colRefsK keeps only valid references', () => {
    const s = State.fromJSON({ colRefsK: [{ instanceId: 'w', columnId: 'a' }, null, 'b', { instanceId: 'w' }] });
    assertEqual(s.colRefsK.length, 1);
    assertEqual(s.colRefsK[0].columnId, 'a');
  });
});
