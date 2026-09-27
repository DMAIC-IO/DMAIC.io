/**
 * D.Mike — Process Capability Engine Fixture Validation
 * Validates Cp/Cpk/Pp/Ppk analysis against SciPy reference values.
 * Consumes three fixture files: cpk, cp, ppk (all driven by the same engine).
 */

import { suite, test, assert, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { analyze, capabilityAnalyze, normalUpperTail, zBench } from '../../js/engines/process-capability-engine.js';

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
  ppm_total: 'ppmTotal',
  ppm_within_total: 'ppmWithinTotal',
  ppm_observed_total: 'ppmObservedTotal',
  z_bench_within: 'zBenchWithin',
  z_bench_overall: 'zBenchOverall',
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

  test('Z.bench and PPM kinds (pooled within, subgroups of 5)', () => {
    const r = analyze({ lsl, usl, subgroupSize }, values);
    const e = pistonExpected.zBench;
    const close = (a, x, label) => assertAlmostEqual(a, x, { relative: 1e-6 }, label);
    close(r.ppmWithinTotal, e.ppmWithinTotal, 'ppm within');
    close(r.ppmTotal, e.ppmOverallTotal, 'ppm overall');
    close(r.zBenchWithin, e.zBenchWithin, 'Z.bench within');
    close(r.zBenchOverall, e.zBenchOverall, 'Z.bench overall');
    assertEqual(r.ppmObservedTotal, e.ppmObservedTotal, 'ppm observed');
  });

  test('capabilityAnalyze passes the new fields through', () => {
    const r = capabilityAnalyze(values, lsl, usl, 0.95, subgroupSize);
    const a = analyze({ lsl, usl, subgroupSize }, values);
    for (const k of ['ppmWithinTotal', 'ppmObservedTotal', 'zBenchWithin', 'zBenchOverall', 'sigmaLevelShifted']) {
      assertEqual(r[k], a[k], k);
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

// Reference values: spec 2026-09-27 (Python statistics.NormalDist / SciPy).
const ZIGZAG = Array.from({ length: 31 }, (_, i) => 55 + ((7 * i) % 31));
const ASCENDING = Array.from({ length: 31 }, (_, i) => 55 + i);

suite('Process Capability — Z.bench and PPM kinds', () => {
  const rel = (a, e, r, label) => assertAlmostEqual(a, e, { relative: r }, label);

  test('two-sided, both tails inside: Z.bench from the total fraction', () => {
    const r = analyze({ lsl: 40, usl: 100 }, ZIGZAG);
    rel(r.ppmTotal, 968.365, 1e-5, 'ppm overall');
    rel(r.zBenchOverall, 3.09977, 1e-5, 'Z.bench overall');
    rel(r.ppmWithinTotal, 1138.54, 1e-5, 'ppm within');
    rel(r.zBenchWithin, 3.05149, 1e-5, 'Z.bench within');
    assertEqual(r.sigmaLevel, r.zBenchWithin);
    rel(r.sigmaLevelShifted, 4.59977, 1e-5, 'Six Sigma convention');
    assertEqual(r.ppmObservedTotal, 0);
    // 3·Cpk = 3.2538 overstates the level: the far tail is not negligible.
    assert(r.zBenchWithin < 3 * r.Cpk, 'Z.bench within < 3·Cpk');
  });

  test('observed PPM counts values strictly outside', () => {
    const r = analyze({ lsl: 57, usl: 100 }, ZIGZAG);
    rel(r.ppmTotal, 76870.05, 1e-6, 'ppm overall');
    rel(r.zBenchOverall, 1.42644, 1e-5, 'Z.bench overall');
    rel(r.ppmWithinTotal, 79839.11, 1e-6, 'ppm within');
    rel(r.zBenchWithin, 1.40615, 1e-5, 'Z.bench within');
    rel(r.ppmObservedBelowLsl, 2 / 31 * 1e6, 1e-12, 'observed < LSL (55, 56)');
    assertEqual(r.ppmObservedAboveUsl, 0);
    rel(r.ppmObservedTotal, 64516.13, 1e-6, 'observed total');
  });

  test('a value exactly on a limit is not nonconforming', () => {
    const r = analyze({ lsl: 55, usl: 85 }, ZIGZAG);   // min 55, max 85
    assertEqual(r.ppmObservedBelowLsl, 0);
    assertEqual(r.ppmObservedAboveUsl, 0);
  });

  test('far tail stays finite (no rounding to 0)', () => {
    const r = analyze({ lsl: 40, usl: 100 }, ASCENDING);
    rel(r.ppmWithinTotal, 5.0924e-245, 1e-4, 'ppm within');
    rel(r.zBenchWithin, 33.8195, 1e-5, 'Z.bench within');
    assert(Number.isFinite(r.zBenchWithin), 'finite');
  });

  test('one-sided USL: missing side is null, total = present side', () => {
    const r = analyze({ usl: 100 }, ZIGZAG);
    assertEqual(r.ppmBelowLsl, null);
    assertEqual(r.ppmWithinBelowLsl, null);
    assertEqual(r.ppmObservedBelowLsl, null);
    assertEqual(r.ppmWithinTotal, r.ppmWithinAboveUsl);
    assertEqual(r.ppmTotal, r.ppmAboveUsl);
    rel(r.zBenchWithin, (100 - 70) / r.sigmaWithin, 1e-6, 'one tail: Z.bench = 3·Cpk');
  });

  test('one-sided LSL mirrors USL', () => {
    const r = analyze({ lsl: 40 }, ZIGZAG);
    assertEqual(r.ppmAboveUsl, null);
    assertEqual(r.ppmWithinAboveUsl, null);
    assertEqual(r.ppmObservedAboveUsl, null);
    rel(r.zBenchOverall, (70 - 40) / r.s, 1e-6, 'Z.bench overall');
  });

  test('constant data inside the spec: PPM 0, Z.bench Infinity, no NaN', () => {
    const r = analyze({ lsl: 4, usl: 6 }, [5, 5, 5, 5]);
    assertEqual(r.ppmWithinTotal, 0);
    assertEqual(r.ppmTotal, 0);
    assertEqual(r.ppmObservedTotal, 0);
    assertEqual(r.zBenchWithin, Infinity);
    assertEqual(r.zBenchOverall, Infinity);
    assertEqual(r.sigmaLevelShifted, Infinity);
  });

  test('zShortTerm / zLongTerm are gone', () => {
    const r = analyze({ lsl: 40, usl: 100 }, ZIGZAG);
    assertEqual('zShortTerm' in r, false);
    assertEqual('zLongTerm' in r, false);
  });

  test('helpers', () => {
    rel(normalUpperTail(3), 0.0013498980, 1e-6, 'Q(3)');
    rel(normalUpperTail(-3), 0.9986501020, 1e-9, 'Q(-3)');
    assertEqual(zBench(0), Infinity);
    rel(zBench(0.0013498980), 3, 1e-6, 'zBench(Q(3))');
  });

  test('constant data on a limit: Z.bench is NaN, not ∞', () => {
    // σ = 0 and x̄ = LSL → z = 0/0; the fraction is undefined, so is Z.bench.
    const r = analyze({ lsl: 5, usl: 6 }, [5, 5, 5, 5]);
    assertEqual(Number.isNaN(r.zBenchWithin), true, 'within');
    assertEqual(Number.isNaN(r.zBenchOverall), true, 'overall');
    assertEqual(Number.isNaN(zBench(NaN)), true, 'zBench(NaN)');
  });

  test('mean far outside the spec: Z.bench is −∞', () => {
    const r = analyze({ lsl: 100, usl: 200 }, [1, 2, 3, 2, 1, 2]);
    assertEqual(r.zBenchWithin, -Infinity);
  });
});

suite('Process Capability — Cp/Pp CI from the exact χ² quantile', () => {
  test('df = 1: lower bound uses χ²(0.025; 1) = 0.000982, not 0', () => {
    const r = analyze({ lsl: 0, usl: 10 }, [4, 6]);
    assertAlmostEqual(r.CpCI[0], r.Cp * Math.sqrt(0.000982069), { relative: 1e-5 }, 'Cp lower');
    assertAlmostEqual(r.CpCI[1], r.Cp * Math.sqrt(5.023886), { relative: 1e-5 }, 'Cp upper');
    assertAlmostEqual(r.PpCI[0], r.Pp * Math.sqrt(0.000982069), { relative: 1e-5 }, 'Pp lower');
  });

  test('df = 29: lower bound uses χ²(0.025; 29) = 16.047', () => {
    const r = analyze({ lsl: 40, usl: 100 }, ZIGZAG.slice(0, 30));
    assertAlmostEqual(r.CpCI[0], r.Cp * Math.sqrt(16.047071 / 29), { relative: 1e-5 }, 'Cp lower');
  });
});
