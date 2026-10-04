/**
 * D.Mike — Algorithm Lab: VIF fixtures through the Lab execution path.
 *
 * The Validation tab calls `fn(...mapArgs(algo, prepareInputs(tc.inputs)))`:
 * every `signature.parameters[].name` is looked up as a top-level key of the
 * fixture inputs. vif.json 1.1.0 named its second parameter `opts.terms`
 * while the fixtures carried `inputs.terms`, so the Lab passed `undefined`
 * as `opts`, silently dropped the term list and computed main + 2FI instead
 * (CCD quadratic case red in tests/global/algorithm-lab.spec.js). The engine
 * unit test called `computeVIF` directly and stayed green.
 *
 * This suite runs every VIF fixture case exactly like the Validation tab and
 * additionally pins the number of returned terms. (At the time, the Lab
 * compared only the expected prefix, so a dropped term list on a
 * main-effects-only case still passed; `checkExpected` now requires equal
 * array lengths, see lab-check-expected.test.js.)
 */
import { suite, test, assertTrue, assertEqual } from '../test-utils.js';
import { ALGOS, FIXTURES } from '../../js/algorithm-lab/lab-data.generated.js';
import { buildFunction, prepareInputs, mapArgs, compare }
  from '../../js/algorithm-lab/lab-exec.js';

suite('Algorithm Lab: VIF fixtures via mapArgs', () => {
  test('every signature parameter is a top-level fixture input key', () => {
    const params = ALGOS.vif.source.signature.parameters.map(p => p.name);
    const keys = new Set(FIXTURES.vif.test_cases.flatMap(tc => Object.keys(tc.inputs)));
    for (const name of params) {
      assertTrue(keys.has(name),
        `vif: parameter "${name}" never appears in the fixture inputs — mapArgs passes undefined`);
    }
  });

  test('all fixture cases match, with the expected number of terms', async () => {
    const algo = ALGOS.vif;
    const fx = FIXTURES.vif;
    const fn = await buildFunction(algo);
    for (const tc of fx.test_cases) {
      const tol = tc.tolerance_override
        ? fx.tolerances.overrides[tc.tolerance_override]
        : fx.tolerances.default;
      const result = fn(...mapArgs(algo, prepareInputs(tc.inputs)));
      assertEqual(result.length, tc.expected.length, `${tc.id}: number of terms`);
      tc.expected.forEach((exp, i) => {
        assertEqual(result[i].term, exp.term, `${tc.id}: term[${i}]`);
        assertTrue(compare(result[i].vif, exp.vif, tol),
          `${tc.id}: vif[${i}] = ${result[i].vif}, expected ${exp.vif}`);
      });
    }
  });
});
