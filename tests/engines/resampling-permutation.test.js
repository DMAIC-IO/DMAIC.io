/**
 * D.Mike — Permutation jobs vs. full enumeration in R (permutation.json from
 * tests/fixtures/resampling/generate-permutation.R), Monte Carlo fallback,
 * k groups with post-hoc Holm.
 */

import { suite, test, assertAlmostEqual, assertEqual, assertTrue } from '../test-utils.js';
import {
  runJobSync, executeJob, holm, ge, countAssignments, STATISTICS,
} from '../../js/engines/resampling-engine.js';

async function loadFixture(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.json();
}

const fixture = await loadFixture('../fixtures/resampling/permutation.json');
const TOL = { absolute: 1e-10, relative: 1e-10 };

function permJob(kind, data, statisticId, options = {}) {
  return {
    kind, data, statistic: { id: statisticId },
    options: { B: 999, seed: 7, confidence: 0.95, ...options },
  };
}

/** Number of permutations at least as extreme as observed (exact mode). */
function hitsOf(test) {
  return Math.round(test.pValue * test.permutations);
}

suite('resampling-permutation — helpers', () => {
  test('ge tolerates rounding noise only', () => {
    assertTrue(ge(1, 1));
    assertTrue(ge(1 - 1e-12, 1));
    assertTrue(!ge(1 - 1e-6, 1));
    assertTrue(ge(1e6 - 1e-6, 1e6));
    assertTrue(ge(Infinity, Infinity));
    assertTrue(ge(-Infinity, -Infinity));
    assertTrue(!ge(1, Infinity));
  });
  test('countAssignments: exact counts and early abort', () => {
    assertEqual(countAssignments([5, 6], 20000), 462);
    assertEqual(countAssignments([3, 3, 4], 20000), 4200);
    assertEqual(countAssignments([3, 3, 4], 4199), Infinity);
    assertEqual(countAssignments([30, 30], 20000), Infinity);
    assertEqual(countAssignments([500, 500, 500], 1e9), Infinity);
  });
  test('holm = R p.adjust(method = "holm")', () => {
    const adj = holm(fixture.holm.p);
    for (let i = 0; i < adj.length; i++) assertAlmostEqual(adj[i], fixture.holm.adjusted[i], 1e-15, `p[${i}]`);
    assertEqual(holm([]).length, 0);
    assertEqual(holm([0.5, 0.5, 0.5]).join(','), '1,1,1');
  });
});

suite('resampling-permutation — exact vs. R enumeration', () => {
  for (const c of fixture.two) {
    test(`two: ${c.id}`, () => {
      const r = runJobSync(permJob('permutationTwo', { x: c.x, y: c.y }, c.statistic,
        { contrast: c.contrast, direction: c.direction }));
      assertEqual(r.test.exact, true);
      assertEqual(r.test.permutations, c.total);
      assertEqual(r.test.distribution.length, c.total);
      assertAlmostEqual(r.test.observed, c.observed, TOL);
      assertEqual(hitsOf(r.test), c.count);
      assertAlmostEqual(r.test.pValue, c.pValue, 1e-15);
      const fx = STATISTICS[c.statistic](c.x);
      const fy = STATISTICS[c.statistic](c.y);
      assertAlmostEqual(r.estimate, c.contrast === 'ratio' ? fx / fy : fx - fy, TOL);
      assertEqual(r.se, null);
      assertEqual(r.bias, null);
      assertEqual(r.ci.percentile, null);
      assertEqual(r.ci.bca, null);
    });
  }
  for (const c of fixture.paired) {
    test(`paired: ${c.id}`, () => {
      const r = runJobSync(permJob('permutationPaired', { x: c.x, y: c.y }, c.statistic,
        { direction: c.direction }));
      assertEqual(r.test.exact, true);
      assertEqual(r.test.permutations, c.total);
      assertAlmostEqual(r.test.observed, c.observed, TOL);
      assertAlmostEqual(r.estimate, c.observed, TOL);
      assertEqual(hitsOf(r.test), c.count);
      assertAlmostEqual(r.test.pValue, c.pValue, 1e-15);
    });
  }
  for (const c of fixture.k) {
    test(`k: ${c.id}`, () => {
      const r = runJobSync(permJob('permutationK', { groups: c.groups }, c.statistic));
      assertEqual(r.test.exact, true);
      assertEqual(r.test.permutations, c.total);
      assertAlmostEqual(r.test.observed, c.observed, TOL);
      assertEqual(hitsOf(r.test), c.count);
      assertAlmostEqual(r.test.pValue, c.pValue, 1e-15);
      if (c.ssb !== undefined) assertAlmostEqual(r.test.observed, c.ssb, TOL, 'T = ANOVA SSB');
      assertAlmostEqual(r.estimate, STATISTICS[c.statistic](c.groups.flat()), TOL);
    });
  }
});

suite('resampling-permutation — k groups: per-group intervals and post-hoc', () => {
  const kc = fixture.k.find((c) => c.statistic === 'mean');
  const r = runJobSync(permJob('permutationK', { groups: kc.groups }, 'mean', { B: 1000 }));

  test('one bootstrap summary per group', () => {
    assertEqual(r.groups.length, 3);
    r.groups.forEach((g, i) => {
      assertAlmostEqual(g.estimate, STATISTICS.mean(kc.groups[i]), 1e-12);
      assertTrue(Array.isArray(g.ci.percentile) && Array.isArray(g.ci.bca));
    });
  });
  test('post-hoc pairs i < j, exact pair p = exact permutationTwo p, Holm applied', () => {
    assertEqual(r.posthoc.map((h) => `${h.i}-${h.j}`).join(','), '0-1,0-2,1-2');
    for (const h of r.posthoc) {
      const solo = runJobSync(permJob('permutationTwo',
        { x: kc.groups[h.i], y: kc.groups[h.j] }, 'mean', { direction: 'two-sided' }));
      assertEqual(h.exact, true);
      assertEqual(h.pRaw, solo.test.pValue);
      assertAlmostEqual(h.contrast, STATISTICS.mean(kc.groups[h.i]) - STATISTICS.mean(kc.groups[h.j]), 1e-12);
      assertTrue(Array.isArray(h.ci.bca));
    }
    const adj = holm(r.posthoc.map((h) => h.pRaw));
    r.posthoc.forEach((h, idx) => assertEqual(h.pHolm, adj[idx]));
  });
  test('progress total = exact count + k·B + Σ pairs (count + B)', () => {
    // sizes 3, 3, 4 → 4200 + 3·1000 + (20 + 1000) + (35 + 1000) + (35 + 1000)
    const it = executeJob(permJob('permutationK', { groups: kc.groups }, 'mean', { B: 1000 }), { chunkSize: 1000 });
    let last = null;
    let s = it.next();
    while (!s.done) { last = s.value; s = it.next(); }
    assertEqual(last.total, 10290);
    assertEqual(last.done, 10290);
  });
});

suite('resampling-permutation — Monte Carlo', () => {
  const c2 = fixture.two.find((c) => c.id === 'two-mean-two-sided');
  test('exactThreshold 0 → MC, p = (1 + hits) / (B + 1), close to the exact p', () => {
    const B = 19999;
    const r = runJobSync(permJob('permutationTwo', { x: c2.x, y: c2.y }, 'mean', { B, exactThreshold: 0 }));
    assertEqual(r.test.exact, false);
    assertEqual(r.test.permutations, B);
    assertEqual(r.test.distribution.length, B);
    const k = r.test.pValue * (B + 1);
    assertAlmostEqual(k, Math.round(k), 1e-6, 'p is a multiple of 1/(B+1)');
    assertTrue(r.test.pValue > 0 && r.test.pValue <= 1);
    const sd = Math.sqrt(c2.pValue * (1 - c2.pValue) / B);
    assertTrue(Math.abs(r.test.pValue - c2.pValue) < 4 * sd + 1 / (B + 1),
      `MC p ${r.test.pValue} vs exact ${c2.pValue}`);
  });
  test('MC is seeded: same seed identical, other seed different distribution', () => {
    const opts = { B: 500, exactThreshold: 0 };
    const a = runJobSync(permJob('permutationTwo', { x: c2.x, y: c2.y }, 'mean', opts));
    const b = runJobSync(permJob('permutationTwo', { x: c2.x, y: c2.y }, 'mean', opts));
    const d = runJobSync(permJob('permutationTwo', { x: c2.x, y: c2.y }, 'mean', { ...opts, seed: 8 }));
    assertEqual(Array.from(a.test.distribution).join(','), Array.from(b.test.distribution).join(','));
    assertTrue(Array.from(a.test.distribution).join(',') !== Array.from(d.test.distribution).join(','));
  });
  test('paired MC sign flips', () => {
    const cp = fixture.paired[0];
    const r = runJobSync(permJob('permutationPaired', { x: cp.x, y: cp.y }, cp.statistic,
      { B: 999, exactThreshold: 0, direction: cp.direction }));
    assertEqual(r.test.exact, false);
    assertEqual(r.test.permutations, 999);
    assertTrue(r.test.pValue > 0 && r.test.pValue <= 1);
  });

  // Review Focus 5: large samples fall back to MC without overflow or hang.
  test('paired n = 40 → MC even with a huge exactThreshold (no 32-bit bitmask)', () => {
    const x = Array.from({ length: 40 }, (_, i) => 50 + Math.sin(i) * 3);
    const y = x.map((v, i) => v - 0.4 - Math.cos(i));
    const r = runJobSync(permJob('permutationPaired', { x, y }, 'mean',
      { B: 200, exactThreshold: Number.MAX_SAFE_INTEGER }));
    assertEqual(r.test.exact, false);
    assertEqual(r.test.permutations, 200);
    assertTrue(r.test.pValue > 0 && r.test.pValue <= 1);
  });
  test('two groups of 30 → MC, C(60, 30) never enumerated', () => {
    const x = Array.from({ length: 30 }, (_, i) => 10 + Math.sin(i));
    const y = Array.from({ length: 30 }, (_, i) => 10.5 + Math.cos(i));
    const r = runJobSync(permJob('permutationTwo', { x, y }, 'median', { B: 200 }));
    assertEqual(r.test.exact, false);
    assertEqual(r.test.permutations, 200);
  });
});

suite('resampling-permutation — degenerate observed statistic', () => {
  function degenerateCode(job) {
    try { runJobSync(job); } catch (err) { return err.code; }
    return null;
  }
  const ppkJob = (extra) => ({
    kind: 'permutationTwo',
    data: { x: [5, 5, 5, 5, 5, 5], y: [4.1, 5.2, 4.8, 5.5, 4.9, 5.3] },
    statistic: { id: 'ppk', params: { lsl: 4, usl: 6 } },
    options: { B: 99, seed: 1, confidence: 0.95, ...extra },
  });
  test('two-sample Ppk with a constant group: exact mode throws', () => {
    assertEqual(degenerateCode(ppkJob({})), 'degenerate-statistic');
  });
  test('two-sample Ppk with a constant group: Monte Carlo mode throws', () => {
    assertEqual(degenerateCode(ppkJob({ exactThreshold: 0 })), 'degenerate-statistic');
  });
  test('k groups with cv and pooled mean 0 throws', () => {
    assertEqual(degenerateCode({
      kind: 'permutationK',
      data: { groups: [[-1, 1], [-2, 2], [-3, 3]] },
      statistic: { id: 'cv' },
      options: { B: 99, seed: 1, confidence: 0.95 },
    }), 'degenerate-statistic');
  });
});
