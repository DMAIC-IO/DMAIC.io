/**
 * D.Mike — Inline resampling runner: contract + inline specifics.
 */

import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { defineRunnerContract } from './resampling-runner-contract.js';
import { createInlineRunner } from '../../js/engines/resampling-runner.js';

defineRunnerContract('inline', (chunkSize) => createInlineRunner({ chunkSize }));

suite('resampling-runner — inline specifics', () => {
  const job = {
    kind: 'bootstrapOne', data: { x: [1, 2, 3, 4, 5, 6] }, statistic: { id: 'mean' },
    options: { B: 1000, seed: 1, confidence: 0.95 },
  };
  test('yields to the event loop once per progress tick', async () => {
    let yields = 0;
    let ticks = 0;
    const runner = createInlineRunner({ chunkSize: 250, yieldToEventLoop: async () => { yields++; } });
    await runner.run(job, { onProgress: () => { ticks++; } });
    assertEqual(ticks, 4);
    assertEqual(yields, 4);
  });
  test('default chunk size is 500', async () => {
    const done = [];
    await createInlineRunner().run(job, { onProgress: (d) => done.push(d) });
    assertEqual(done.join(','), '500,1000');
  });
  test('works without options', async () => {
    const r = await createInlineRunner().run(job);
    assertEqual(r.replicates.length, 1000);
    assertTrue(Number.isFinite(r.estimate));
  });
});
