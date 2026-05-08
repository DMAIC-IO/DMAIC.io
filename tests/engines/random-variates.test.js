/**
 * D.Mike — Random Variates Fixture Validation
 * Validates deterministic PRNG output: correct length, metadata, determinism, and error handling.
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { generateRandomVariates } from '../../js/modules/random-generator/random-generator.js';

async function loadFixture(path) {
  const resp = await fetch(path);
  return resp.json();
}

const data = await loadFixture('../fixtures/distributions/random-variates.fixtures.json');

suite('Random Variates — generateRandomVariates (fixture validation)', () => {
  for (const tc of data.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const { distribution, params, n, seed } = tc.inputs;
        const result = generateRandomVariates(distribution, params, n, seed);

        // Validate metadata
        assertEqual(result.n, tc.expected.n, `${tc.id}: n mismatch`);
        assertEqual(result.seed, tc.expected.seed, `${tc.id}: seed mismatch`);
        assertEqual(result.distribution, tc.expected.distribution, `${tc.id}: distribution mismatch`);

        // Validate values array length
        assertEqual(result.values.length, tc.expected.n, `${tc.id}: values.length mismatch`);

        // Validate all values are finite numbers
        for (let i = 0; i < result.values.length; i++) {
          if (!Number.isFinite(result.values[i])) {
            throw new Error(`${tc.id}: values[${i}] is not finite: ${result.values[i]}`);
          }
        }

        // Determinism check: run again with same inputs, expect identical output
        const result2 = generateRandomVariates(distribution, params, n, seed);
        for (let i = 0; i < result.values.length; i++) {
          assertAlmostEqual(result.values[i], result2.values[i], 0,
            `${tc.id}: determinism failed at index ${i}`);
        }
      });
    }

    if (tc.expected_error) {
      test(`${tc.id}: should throw — ${tc.description}`, () => {
        let threw = false;
        try {
          const { distribution, params, n, seed } = tc.inputs;
          generateRandomVariates(distribution, params, n, seed);
        } catch {
          threw = true;
        }
        if (!threw) throw new Error(`${tc.id}: expected error but none thrown`);
      });
    }
  }
});
