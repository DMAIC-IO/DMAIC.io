/**
 * D.Mike — Process Capability Engine Fixture Validation
 * Validates Cp/Cpk/Pp/Ppk analysis against SciPy reference values.
 * Consumes three fixture files: cpk, cp, ppk (all driven by the same engine).
 */

import { suite, test, assertAlmostEqual } from '../test-utils.js';
import { analyze } from '../../js/engines/process-capability-engine.js';

// Map fixture field name → engine result field name
const FIELD_MAP = {
  cp: 'Cp',
  cpk: 'Cpk',
  cpu: 'CPU',
  cpl: 'CPL',
  pp: 'Pp',
  ppk: 'Ppk',
  ppu: 'PPU',
  ppl: 'PPL',
  mean: 'xbar',
  stddev: 's',
  sigma: 'sigma',
};

async function loadFixture(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.json();
}

function getTol(tc, tolerances) {
  const key = tc.tolerance_override;
  return key && tolerances.overrides?.[key]
    ? tolerances.overrides[key]
    : tolerances.default;
}

for (const name of ['cpk', 'cp', 'ppk']) {
  const data = await loadFixture(`../fixtures/capability/${name}.fixtures.json`);

  suite(`Process Capability — ${name} (fixture validation)`, () => {
    for (const tc of data.test_cases) {
      if (tc.expected && Object.keys(tc.expected).length > 0) {
        test(`${tc.id}: ${tc.description}`, () => {
          const params = { lsl: tc.inputs.lsl, usl: tc.inputs.usl };
          if (tc.inputs.target !== undefined) params.target = tc.inputs.target;
          const result = analyze(params, tc.inputs.data);
          const tol = getTol(tc, data.tolerances);

          for (const [key, val] of Object.entries(tc.expected)) {
            if (typeof val !== 'number') continue;
            const engineKey = FIELD_MAP[key] ?? key;
            const actual = result[engineKey];
            assertAlmostEqual(actual, val, tol,
              `${tc.id}: ${key} (engine.${engineKey}) = ${actual}, expected ${val}`);
          }
        });
      }

      if (tc.expected_error) {
        test(`${tc.id}: should throw — ${tc.description}`, () => {
          let threw = false;
          try {
            const params = { lsl: tc.inputs.lsl, usl: tc.inputs.usl };
            analyze(params, tc.inputs.data);
          } catch {
            threw = true;
          }
          if (!threw) throw new Error(`${tc.id}: expected error but none thrown`);
        });
      }
    }
  });
}
