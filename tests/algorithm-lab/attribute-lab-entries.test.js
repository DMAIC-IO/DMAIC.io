/**
 * D.Mike — Algorithm Lab: attribute rate entries run their fixtures through
 * the lab invocation path (buildFunction + mapArgs), as the validation tab and
 * the try-it widget do. The engine-level fixture test bypasses mapArgs and
 * would not notice an entry whose signature does not forward the options.
 */
import { suite, test, assertTrue, assertEqual } from '../test-utils.js';
import { ALGOS, FIXTURES } from '../../js/algorithm-lab/lab-data.generated.js';
import { buildFunction, prepareInputs, mapArgs, getByPath, compare }
  from '../../js/algorithm-lab/lab-exec.js';

const ALGO_IDS = ['poisson-rate-one', 'poisson-rate-two'];

suite('Algorithm Lab: attribute rate entries pass their fixtures via the lab path', () => {
  for (const id of ALGO_IDS) {
    test(`${id}: all fixture cases match`, async () => {
      const algo = ALGOS[id];
      const fx = FIXTURES[id];
      assertTrue(!!algo && !!fx && fx.test_cases.length > 0, `${id}: entry or fixtures missing`);
      const fn = await buildFunction(algo);
      for (const tc of fx.test_cases) {
        const tol = tc.tolerance_override
          ? fx.tolerances.overrides[tc.tolerance_override]
          : fx.tolerances.default;
        const result = fn(...mapArgs(algo, prepareInputs(tc.inputs)));
        for (const [key, expected] of Object.entries(tc.expected)) {
          assertTrue(compare(getByPath(result, key), expected, tol),
            `${id}/${tc.id}: ${key} differs — ${JSON.stringify(getByPath(result, key))}`);
        }
      }
    });
  }

  test('poisson-rate-two: pooled and diff0 reach the engine through mapArgs', async () => {
    const algo = ALGOS['poisson-rate-two'];
    const fn = await buildFunction(algo);
    const run = (id) => {
      const tc = FIXTURES['poisson-rate-two'].test_cases.find((c) => c.id === id);
      return fn(...mapArgs(algo, prepareInputs(tc.inputs)));
    };
    const separate = run('pr2_standard_separate');
    const pooled = run('pr2_standard_pooled');
    assertTrue(pooled.z !== separate.z, 'pooled flag was not forwarded (z identical to separate SE)');
    assertEqual(run('pr2_standard_diff0').pExactCond, null);
    assertEqual(run('pr2_standard_greater').ciUpper, Infinity);
  });
});
