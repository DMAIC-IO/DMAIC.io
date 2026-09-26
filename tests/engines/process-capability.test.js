/**
 * D.Mike — Process Capability Engine Fixture Validation
 * Validates Cp/Cpk/Pp/Ppk analysis against SciPy reference values.
 * Consumes three fixture files: cpk, cp, ppk (all driven by the same engine).
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { analyze, capabilityAnalyze } from '../../js/engines/process-capability-engine.js';

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
  sigma_within: 'sigmaWithin',
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
          if (tc.inputs.subgroup_size !== undefined) params.subgroupSize = tc.inputs.subgroup_size;
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
            // Error cases check the strict adapter contract the Algorithm Lab calls.
            capabilityAnalyze(tc.inputs.data, tc.inputs.lsl, tc.inputs.usl);
          } catch {
            threw = true;
          }
          if (!threw) throw new Error(`${tc.id}: expected error but none thrown`);
        });
      }
    }
  });
}

// ── Within vs. overall σ (Minitab/AIAG semantics) ─────────────────────────
//
// Cp/Cpk use σ_within: MR̄/d2 for individuals, pooled SD/c4(d+1) for
// subgroups. Pp/Ppk use the overall sample SD (n − 1). Reference: piston-ring
// data (Montgomery Table 6.3 = qcc::pistonrings), see gold-standards/capability.

const pistonData = await loadFixture('../gold-standards/capability/dataset-pistonrings.json');
const pistonExpected = await loadFixture('../gold-standards/capability/expected-pistonrings.json');

suite('Process Capability — σ within vs. overall (piston rings)', () => {
  const { lsl, usl, values, subgroupSize } = pistonData;
  const rel = 1e-9;
  const near = (actual, expected, label) =>
    assertAlmostEqual(actual, expected, Math.abs(expected) * rel, label);

  test('subgroups of 5: Cp/Cpk from pooled SD / c4 reproduce qcc', () => {
    const r = analyze({ lsl, usl, subgroupSize }, values);
    const e = pistonExpected.withinPooled;
    near(r.sigmaWithin, e.sigma, 'sigmaWithin');
    near(r.Cp, e.cp, 'Cp');
    near(r.Cpk, e.cpk, 'Cpk');
    const q = pistonExpected.published_qcc;
    assertAlmostEqual(r.sigmaWithin, q.stddev, 5e-10, 'qcc StdDev');
    assertAlmostEqual(r.Cp, q.cp, 5e-4, 'qcc Cp');
    assertAlmostEqual(r.Cpk, q.cpk, 5e-4, 'qcc Cpk');
  });

  test('individuals (no subgroup size): Cp/Cpk from MR̄ / 1.128', () => {
    const r = analyze({ lsl, usl }, values);
    const e = pistonExpected.withinMovingRange;
    near(r.sigmaWithin, e.sigma, 'sigmaWithin');
    near(r.Cp, e.cp, 'Cp');
    near(r.Cpk, e.cpk, 'Cpk');
  });

  test('Pp/Ppk use the overall sample SD (n − 1), independent of subgrouping', () => {
    const e = pistonExpected.overall;
    for (const subgroupSize of [1, 5]) {
      const r = analyze({ lsl, usl, subgroupSize }, values);
      near(r.sigmaOverall, e.sigma, `sigmaOverall (n=${subgroupSize})`);
      near(r.Pp, e.pp, `Pp (n=${subgroupSize})`);
      near(r.Ppk, e.ppk, `Ppk (n=${subgroupSize})`);
    }
  });
});

suite('Process Capability — σ within edge cases', () => {
  test('a drifting process shows Pp < Cp', () => {
    // Linear drift plus a small alternating wobble: short-term spread is tiny,
    // the overall spread is dominated by the drift.
    const values = Array.from({ length: 30 }, (_, i) => 10 + 0.01 * i + (i % 2 ? 0.005 : -0.005));
    const r = analyze({ lsl: 9.5, usl: 10.8 }, values);
    assertEqual(r.Pp < r.Cp, true, `Pp ${r.Pp} should be below Cp ${r.Cp}`);
    assertEqual(r.Ppk < r.Cpk, true, `Ppk ${r.Ppk} should be below Cpk ${r.Cpk}`);
  });

  test('a trailing partial subgroup still contributes to the pooled SD', () => {
    // Subgroups [1,2,3] [4,6,8] [10,11]; SS = 2 + 8 + 0.5, d = 2 + 2 + 1.
    const values = [1, 2, 3, 4, 6, 8, 10, 11];
    const r = analyze({ lsl: -20, usl: 30, subgroupSize: 3 }, values);
    const sp = Math.sqrt(10.5 / 5);
    // c4(6) = sqrt(2/5) · Γ(3) / Γ(2.5)
    const c4 = Math.sqrt(2 / 5) * 2 / (0.75 * Math.sqrt(Math.PI));
    assertAlmostEqual(r.sigmaWithin, sp / c4, 1e-12, 'pooled / c4(d+1)');
    assertEqual(r.withinMethod, 'pooled');
  });

  test('individuals report the moving-range method', () => {
    const r = analyze({ lsl: 0, usl: 10 }, [4, 5, 6, 5]);
    assertEqual(r.withinMethod, 'movingRange');
    // MR = 1,1,1 → MR̄/1.128
    assertAlmostEqual(r.sigmaWithin, 1 / 1.128, 1e-12);
  });

  test('an invalid subgroup size is rejected', () => {
    for (const subgroupSize of [0, -2, 2.5, NaN]) {
      let threw = false;
      try { analyze({ lsl: 0, usl: 10, subgroupSize }, [4, 5, 6, 5]); } catch { threw = true; }
      assertEqual(threw, true, `subgroupSize ${subgroupSize} should throw`);
    }
  });
});
