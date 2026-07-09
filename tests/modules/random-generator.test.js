import { suite, test, assertEqual, assertAlmostEqual, assertThrows, assertInRange } from '../test-utils.js';
import {
  State,
  DISTRIBUTIONS,
  ATTRIBUTIVE_KEY,
  mulberry32,
  generateRandomVariates,
  generateSamples,
  generateAttributive,
  attrProbabilities,
  resolveParams,
  clampCount,
  frequency,
  csvEscape,
} from '../../js/modules/random-generator/random-generator-model.js';

// ═══════════════════════════════════════════════════════════════
// PRNG — Mulberry32 (deterministic, seedable)
// ═══════════════════════════════════════════════════════════════

suite('Random Generator — mulberry32 PRNG', () => {
  test('is deterministic for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 20; i++) assertEqual(a(), b());
  });

  test('produces different sequences for different seeds', () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    if (a === b) throw new Error('seeds 1 and 2 produced identical first value');
  });

  test('returns values in [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const v = rng();
      assertInRange(v, 0, 1);
      if (v >= 1) throw new Error('value >= 1');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// DISTRIBUTIONS registry
// ═══════════════════════════════════════════════════════════════

suite('Random Generator — DISTRIBUTIONS registry', () => {
  test('contains the expected distribution keys', () => {
    const keys = Object.keys(DISTRIBUTIONS);
    const expected = [
      'normal', 'chisquare', 'f_dist', 't_dist', 'uniform', 'beta', 'cauchy',
      'exponential', 'gamma_dist', 'laplace', 'gumbel_max', 'logistic',
      'loglogistic', 'lognormal', 'gumbel_min', 'triangular', 'weibull', 'mvnormal',
      'bernoulli', 'binomial', 'geometric', 'negbinomial', 'hypergeometric', 'integer', 'poisson',
    ];
    for (const k of expected) {
      if (!keys.includes(k)) throw new Error('missing distribution: ' + k);
    }
  });

  test('each distribution has nameKey, categoryKey, formula, params, generate', () => {
    for (const [key, d] of Object.entries(DISTRIBUTIONS)) {
      if (typeof d.nameKey !== 'string') throw new Error(key + ' missing nameKey');
      if (typeof d.categoryKey !== 'string') throw new Error(key + ' missing categoryKey');
      if (typeof d.formula !== 'string') throw new Error(key + ' missing formula');
      if (!Array.isArray(d.params)) throw new Error(key + ' missing params array');
      if (typeof d.generate !== 'function') throw new Error(key + ' missing generate fn');
    }
  });

  test('each param has id, label, labelEn, default', () => {
    for (const [key, d] of Object.entries(DISTRIBUTIONS)) {
      for (const p of d.params) {
        if (!p.id) throw new Error(key + ' param missing id');
        if (typeof p.label !== 'string') throw new Error(key + '.' + p.id + ' missing label');
        if (typeof p.labelEn !== 'string') throw new Error(key + '.' + p.id + ' missing labelEn');
        if (!Number.isFinite(p.default)) throw new Error(key + '.' + p.id + ' default not finite');
      }
    }
  });

  test('discrete distributions are flagged discrete', () => {
    const discrete = ['bernoulli', 'binomial', 'geometric', 'negbinomial', 'hypergeometric', 'integer', 'poisson'];
    for (const k of discrete) {
      if (!DISTRIBUTIONS[k].discrete) throw new Error(k + ' should be discrete');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// generateRandomVariates (Algorithm-Lab API — keep signature)
// ═══════════════════════════════════════════════════════════════

suite('Random Generator — generateRandomVariates', () => {
  test('returns { values, n, seed, distribution }', () => {
    const r = generateRandomVariates('normal', { mu: 0, sigma: 1, epsilon: 0, delta: 1 }, 50, 42);
    assertEqual(r.n, 50);
    assertEqual(r.seed, 42);
    assertEqual(r.distribution, 'normal');
    assertEqual(r.values.length, 50);
  });

  test('is deterministic for same seed', () => {
    const p = { mu: 0, sigma: 1, epsilon: 0, delta: 1 };
    const a = generateRandomVariates('normal', p, 30, 99).values;
    const b = generateRandomVariates('normal', p, 30, 99).values;
    for (let i = 0; i < 30; i++) assertEqual(a[i], b[i]);
  });

  test('throws on unknown distribution', () => {
    assertThrows(() => generateRandomVariates('nope', {}, 10, 1));
  });

  test('throws on invalid n', () => {
    assertThrows(() => generateRandomVariates('normal', {}, 0, 1));
  });

  test('throws on non-finite seed', () => {
    assertThrows(() => generateRandomVariates('normal', {}, 10, NaN));
  });

  test('throws on empty distribution name', () => {
    assertThrows(() => generateRandomVariates('', {}, 10, 1));
  });
});

// ═══════════════════════════════════════════════════════════════
// generateSamples — structure / count / bounds (NOT exact values)
// ═══════════════════════════════════════════════════════════════

suite('Random Generator — generateSamples', () => {
  test('produces the requested count', () => {
    const v = generateSamples('uniform', { a: 0, b: 1 }, 200, 42);
    assertEqual(v.length, 200);
  });

  test('uniform values stay within [a, b]', () => {
    const v = generateSamples('uniform', { a: 10, b: 20 }, 500, 7);
    for (const x of v) assertInRange(x, 10, 20);
  });

  test('bernoulli produces only 0 or 1', () => {
    const v = generateSamples('bernoulli', { p: 0.5 }, 300, 3);
    for (const x of v) {
      if (x !== 0 && x !== 1) throw new Error('bernoulli value not 0/1: ' + x);
    }
  });

  test('integer dist stays within [a, b] and is integral', () => {
    const v = generateSamples('integer', { a: 1, b: 6 }, 400, 11);
    for (const x of v) {
      assertInRange(x, 1, 6);
      if (!Number.isInteger(x)) throw new Error('integer dist non-integer: ' + x);
    }
  });

  test('binomial stays within [0, n] and is integral', () => {
    const v = generateSamples('binomial', { n: 10, p: 0.5 }, 400, 17);
    for (const x of v) {
      assertInRange(x, 0, 10);
      if (!Number.isInteger(x)) throw new Error('binomial dist non-integer: ' + x);
    }
  });

  test('geometric is a non-negative integer', () => {
    const v = generateSamples('geometric', { p: 0.3 }, 400, 23);
    for (const x of v) {
      if (!Number.isInteger(x)) throw new Error('geometric dist non-integer: ' + x);
      if (x < 0) throw new Error('geometric dist negative: ' + x);
    }
  });

  test('negbinomial is a non-negative integer', () => {
    const v = generateSamples('negbinomial', { r: 5, p: 0.5 }, 400, 29);
    for (const x of v) {
      if (!Number.isInteger(x)) throw new Error('negbinomial dist non-integer: ' + x);
      if (x < 0) throw new Error('negbinomial dist negative: ' + x);
    }
  });

  test('hypergeometric stays within [0, n] and is integral', () => {
    const v = generateSamples('hypergeometric', { N: 100, K: 30, n: 10 }, 400, 31);
    for (const x of v) {
      assertInRange(x, 0, 10);
      if (!Number.isInteger(x)) throw new Error('hypergeometric dist non-integer: ' + x);
    }
  });

  test('poisson uses normal-approx path for large lambda without throwing', () => {
    const v = generateSamples('poisson', { lambda: 50 }, 100, 5);
    assertEqual(v.length, 100);
    for (const x of v) if (x < 0) throw new Error('poisson negative');
  });

  test('gamma handles shape < 1', () => {
    const v = generateSamples('gamma_dist', { alpha: 0.5, beta: 1 }, 100, 13);
    assertEqual(v.length, 100);
    for (const x of v) if (x < 0) throw new Error('gamma negative');
  });

  test('is deterministic for same seed', () => {
    const a = generateSamples('exponential', { lambda: 1 }, 50, 21);
    const b = generateSamples('exponential', { lambda: 1 }, 50, 21);
    for (let i = 0; i < 50; i++) assertEqual(a[i], b[i]);
  });
});

// ═══════════════════════════════════════════════════════════════
// generateAttributive — categorical sampling by weight
// ═══════════════════════════════════════════════════════════════

suite('Random Generator — generateAttributive', () => {
  test('produces the requested count from valid attributes', () => {
    const v = generateAttributive([{ name: 'A', weight: 1 }, { name: 'B', weight: 1 }], 100, 42);
    assertEqual(v.length, 100);
  });

  test('only emits names of valid attributes', () => {
    const v = generateAttributive([{ name: 'A', weight: 1 }, { name: 'B', weight: 3 }], 200, 1);
    for (const x of v) {
      if (x !== 'A' && x !== 'B') throw new Error('unexpected category: ' + x);
    }
  });

  test('ignores attributes with empty name or non-positive weight', () => {
    const v = generateAttributive(
      [{ name: '', weight: 5 }, { name: 'Zero', weight: 0 }, { name: 'Valid', weight: 10 }],
      50, 2,
    );
    assertEqual(v.length, 50);
    for (const x of v) assertEqual(x, 'Valid');
  });

  test('returns empty array when no valid attributes', () => {
    const v = generateAttributive([{ name: '', weight: 0 }], 50, 2);
    assertEqual(v.length, 0);
  });

  test('higher weight yields higher frequency', () => {
    const v = generateAttributive([{ name: 'rare', weight: 1 }, { name: 'common', weight: 9 }], 2000, 42);
    const common = v.filter(x => x === 'common').length;
    if (common <= v.length / 2) throw new Error('weighted category not dominant');
  });

  test('is deterministic for same seed', () => {
    const attrs = [{ name: 'A', weight: 1 }, { name: 'B', weight: 2 }, { name: 'C', weight: 7 }];
    const a = generateAttributive(attrs, 100, 42);
    const b = generateAttributive(attrs, 100, 42);
    for (let i = 0; i < 100; i++) assertEqual(a[i], b[i]);
  });
});

// ═══════════════════════════════════════════════════════════════
// attrProbabilities
// ═══════════════════════════════════════════════════════════════

suite('Random Generator — attrProbabilities', () => {
  test('computes percentage shares from weights', () => {
    const p = attrProbabilities([{ name: 'A', weight: 1 }, { name: 'B', weight: 3 }]);
    assertAlmostEqual(p[0], 25, 1e-9);
    assertAlmostEqual(p[1], 75, 1e-9);
  });

  test('treats negative/zero weights as 0%', () => {
    const p = attrProbabilities([{ name: 'A', weight: -5 }, { name: 'B', weight: 10 }]);
    assertEqual(p[0], 0);
    assertAlmostEqual(p[1], 100, 1e-9);
  });

  test('all-zero weights yield 0% each (no divide-by-zero)', () => {
    const p = attrProbabilities([{ name: 'A', weight: 0 }, { name: 'B', weight: 0 }]);
    assertEqual(p[0], 0);
    assertEqual(p[1], 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// resolveParams / clampCount
// ═══════════════════════════════════════════════════════════════

suite('Random Generator — resolveParams', () => {
  test('parses numeric strings', () => {
    const p = resolveParams('uniform', { a: '5', b: '15' });
    assertEqual(p.a, 5);
    assertEqual(p.b, 15);
  });

  test('falls back to param default on NaN input', () => {
    const p = resolveParams('normal', { mu: 'abc', sigma: 2, epsilon: 0, delta: 1 });
    assertEqual(p.mu, 0); // normal mu default is 0
    assertEqual(p.sigma, 2);
  });

  test('uses defaults for missing inputs', () => {
    const p = resolveParams('uniform', {});
    assertEqual(p.a, 0);
    assertEqual(p.b, 1);
  });
});

suite('Random Generator — clampCount', () => {
  test('clamps to [1, 100000]', () => {
    assertEqual(clampCount(200000), 100000);
    assertEqual(clampCount(0), 1);
    assertEqual(clampCount(-5), 1);
    assertEqual(clampCount(500), 500);
  });

  test('NaN falls back to provided default', () => {
    assertEqual(clampCount(NaN, 1000), 1000);
    assertEqual(clampCount('abc', 50), 50);
  });
});

// ═══════════════════════════════════════════════════════════════
// frequency / csvEscape
// ═══════════════════════════════════════════════════════════════

suite('Random Generator — frequency', () => {
  test('tallies and sorts descending by count', () => {
    const f = frequency(['A', 'B', 'A', 'C', 'A', 'B']);
    assertEqual(f[0][0], 'A');
    assertEqual(f[0][1], 3);
    assertEqual(f[1][0], 'B');
    assertEqual(f[1][1], 2);
    assertEqual(f[2][0], 'C');
    assertEqual(f[2][1], 1);
  });

  test('empty input yields empty array', () => {
    assertEqual(frequency([]).length, 0);
  });
});

suite('Random Generator — csvEscape', () => {
  test('leaves plain values untouched', () => {
    assertEqual(csvEscape('Normal'), 'Normal');
  });

  test('quotes values with commas', () => {
    assertEqual(csvEscape('Has, comma'), '"Has, comma"');
  });

  test('escapes embedded quotes', () => {
    assertEqual(csvEscape('Has "quote"'), '"Has ""quote"""');
  });

  test('handles null/undefined', () => {
    assertEqual(csvEscape(null), '');
    assertEqual(csvEscape(undefined), '');
  });
});

// ═══════════════════════════════════════════════════════════════
// State — persistence shape & defaults
// ═══════════════════════════════════════════════════════════════

suite('Random Generator — State model', () => {
  test('constructor sets defaults', () => {
    const s = new State();
    assertEqual(s.currentDist, null);
    assertEqual(s.seed, 42);
    assertEqual(s.count, 1000);
    assertEqual(s.attrCount, 50);
    assertEqual(s.attrSeed, 42);
    assertEqual(Array.isArray(s.attributes), true);
    assertEqual(s.attributes.length, 3);
    assertEqual(s.attributes[0].name, 'A');
    assertEqual(s.attributes[2].weight, 7);
  });

  test('toJSON returns persistence shape', () => {
    const s = new State();
    s.currentDist = 'uniform';
    s.seed = 7;
    s.count = 200;
    s.params = { a: 50, b: 60 };
    const j = s.toJSON();
    assertEqual(j.currentDist, 'uniform');
    assertEqual(j.seed, 7);
    assertEqual(j.count, 200);
    assertEqual(j.params.a, 50);
    assertEqual(j.attrCount, 50);
    assertEqual(j.attrSeed, 42);
    assertEqual(j.attributes.length, 3);
  });

  test('fromJSON(null) yields valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.currentDist, null);
    assertEqual(s.seed, 42);
    assertEqual(s.attributes.length, 3);
  });

  test('fromJSON(undefined) yields valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.count, 1000);
    assertEqual(s.attrCount, 50);
  });

  test('fromJSON restores saved data', () => {
    const s = State.fromJSON({
      currentDist: 'normal', seed: 13, count: 500, params: { mu: 2, sigma: 3 },
      attributes: [{ name: 'X', weight: 4 }], attrCount: 20, attrSeed: 9,
    });
    assertEqual(s.currentDist, 'normal');
    assertEqual(s.seed, 13);
    assertEqual(s.count, 500);
    assertEqual(s.params.mu, 2);
    assertEqual(s.attributes.length, 1);
    assertEqual(s.attributes[0].name, 'X');
    assertEqual(s.attrCount, 20);
    assertEqual(s.attrSeed, 9);
  });

  test('fromJSON sanitizes malformed fields back to defaults', () => {
    const s = State.fromJSON({
      currentDist: 123, seed: 'x', count: 'y', params: 'nope',
      attributes: 'bad', attrCount: NaN, attrSeed: undefined,
    });
    assertEqual(s.currentDist, null);
    assertEqual(s.seed, 42);
    assertEqual(s.count, 1000);
    assertEqual(typeof s.params, 'object');
    assertEqual(s.attributes.length, 3); // bad attributes → default A/B/C
    assertEqual(s.attrCount, 50);
    assertEqual(s.attrSeed, 42);
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const s = new State();
    s.currentDist = ATTRIBUTIVE_KEY;
    s.attributes = [{ name: 'Pass', weight: 8 }, { name: 'Fail', weight: 2 }];
    s.attrCount = 120;
    s.attrSeed = 77;
    const r = State.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    assertEqual(r.currentDist, ATTRIBUTIVE_KEY);
    assertEqual(r.attributes.length, 2);
    assertEqual(r.attributes[1].name, 'Fail');
    assertEqual(r.attrCount, 120);
    assertEqual(r.attrSeed, 77);
  });

  test('hasContent true when a distribution is selected', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
    s.currentDist = 'normal';
    assertEqual(s.hasContent(), true);
  });

  test('hasContent false on fresh default state', () => {
    assertEqual(new State().hasContent(), false);
  });
});
