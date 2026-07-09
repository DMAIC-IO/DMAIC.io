/**
 * D.Mike — Model Data Generator — Model (model-data-generator-model.js)
 *
 * Pure state + business logic for the synthetic-data generator: factor
 * definitions, interaction terms with beta coefficients, sampling methods
 * (Monte Carlo, Latin Hypercube, full factorial), noise injection and a
 * seeded PRNG for reproducibility.
 *
 * Contains NO i18n, NO CSS and NO DOM access — view concerns live in the
 * module's data-fn (model-data-generator.js).
 */

// ═══════════════════════════════════════════════════════════════
// Seeded PRNG — Mulberry32
// ═══════════════════════════════════════════════════════════════

/** @param {number} seed */
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller transform for normal variates. */
function boxMuller(rng) {
  let u1;
  do { u1 = rng(); } while (u1 === 0);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
}

// ═══════════════════════════════════════════════════════════════
// Term builder — all interaction terms up to maxOrder
// ═══════════════════════════════════════════════════════════════

/**
 * Build all interaction terms from `nFactors` factors up to `maxOrder`.
 * Each term is an array of factor indices.
 * @param {number} nFactors
 * @param {number} maxOrder
 * @returns {number[][]}
 */
export function buildTerms(nFactors, maxOrder) {
  const results = [];
  const mo = Math.min(maxOrder, nFactors);
  function recurse(start, cur) {
    if (cur.length > 0 && cur.length <= mo) results.push([...cur]);
    if (cur.length >= mo) return;
    for (let i = start; i < nFactors; i++) {
      cur.push(i);
      recurse(i + 1, cur);
      cur.pop();
    }
  }
  recurse(0, []);
  return results;
}

/**
 * Human-readable label for a term (e.g. "A" or "A × B").
 * @param {number[]} indices
 * @param {{ name: string }[]} factors
 * @returns {string}
 */
export function termLabel(indices, factors) {
  if (indices.length === 1) return factors[indices[0]]?.name || `X${indices[0] + 1}`;
  return indices.map(i => factors[i]?.name || `X${i + 1}`).join(' × ');
}

// ═══════════════════════════════════════════════════════════════
// Sampling methods (pure)
// ═══════════════════════════════════════════════════════════════

/** Evaluate the model response for a normalised factor vector `xn`. */
function evalResponse(terms, intercept, xn, rng, noiseStd) {
  let y = intercept;
  terms.forEach(term => {
    if (term.beta === 0) { return; }
    y += term.beta * term.indices.reduce((a, fi) => a * xn[fi], 1);
  });
  return y + boxMuller(rng) * noiseStd;
}

function sampleRandom(factors, terms, intercept, yName, n, noiseStd, rng) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = {};
    const xn = [];
    factors.forEach(f => {
      const v = f.min + rng() * (f.max - f.min);
      row[f.name] = v;
      xn.push(f.max !== f.min ? (v - f.min) / (f.max - f.min) : 0);
    });
    row[yName] = evalResponse(terms, intercept, xn, rng, noiseStd);
    rows.push(row);
  }
  return rows;
}

function sampleLHS(factors, terms, intercept, yName, n, noiseStd, rng) {
  const k = factors.length;
  const perms = [];
  for (let fi = 0; fi < k; fi++) {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    perms.push(p);
  }
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = {};
    const xn = [];
    factors.forEach((f, fi) => {
      const lo = perms[fi][i] / n;
      const hi = (perms[fi][i] + 1) / n;
      const u = lo + rng() * (hi - lo);
      const v = f.min + u * (f.max - f.min);
      row[f.name] = v;
      xn.push(f.max !== f.min ? (v - f.min) / (f.max - f.min) : 0);
    });
    row[yName] = evalResponse(terms, intercept, xn, rng, noiseStd);
    rows.push(row);
  }
  return rows;
}

function sampleFullFactorial(factors, terms, intercept, yName, n, noiseStd, rng) {
  const levels = factors.length <= 4 ? 3 : 2;
  const lvlVals = factors.map(f => {
    const a = [];
    for (let l = 0; l < levels; l++) {
      a.push(f.min + (l / (levels - 1)) * (f.max - f.min));
    }
    return a;
  });

  function cartesian(arrs) {
    return arrs.reduce((acc, arr) => acc.flatMap(x => arr.map(y => [...x, y])), [[]]);
  }

  const combos = cartesian(lvlVals);
  const reps = Math.max(1, Math.round(n / combos.length));
  const rows = [];
  combos.forEach(combo => {
    for (let r = 0; r < reps; r++) {
      const row = {};
      const xn = [];
      combo.forEach((v, fi) => {
        row[factors[fi].name] = v;
        xn.push(factors[fi].max !== factors[fi].min
          ? (v - factors[fi].min) / (factors[fi].max - factors[fi].min) : 0);
      });
      row[yName] = evalResponse(terms, intercept, xn, rng, noiseStd);
      rows.push(row);
    }
  });
  return rows;
}

// ═══════════════════════════════════════════════════════════════
// Domain classes
// ═══════════════════════════════════════════════════════════════

/** Toggleable input factor with a numeric range. */
export class Factor {
  name = '';
  min = 0;
  max = 0;

  constructor(name = '', min = 0, max = 0) {
    this.name = name;
    this.min = min;
    this.max = max;
  }

  toJSON() { return { name: this.name, min: this.min, max: this.max }; }

  static fromJSON(d) {
    const f = new Factor();
    if (d) {
      f.name = typeof d.name === 'string' ? d.name : '';
      f.min = Number.isFinite(d.min) ? d.min : 0;
      f.max = Number.isFinite(d.max) ? d.max : 0;
    }
    return f;
  }
}

/** One model term: a set of factor indices and its beta coefficient. */
export class Term {
  indices = [];
  beta = 0;

  constructor(indices = [], beta = 0) {
    this.indices = indices;
    this.beta = beta;
  }
}

const SAMPLING_METHODS = ['random', 'lhs', 'fullfactorial'];

/** Default factor set — also used as the baseline for `hasContent()`. */
function defaultFactors() {
  return [
    new Factor('Temperatur', 150, 250),
    new Factor('Druck', 1, 10),
    new Factor('Zeit', 5, 60),
  ];
}

export class State {
  static VERSION = '1.0';
  static ID = 'model-data-generator';

  _schema = { name: State.ID, version: State.VERSION };

  factors = defaultFactors();
  maxOrder = 3;
  intercept = 50;
  yName = 'Y';
  samplingMethod = 'random';
  sampleSize = 100;
  noiseStd = 2;
  seed = 42;
  terms = [];

  constructor() {
    this.rebuildTerms();
  }

  /** Rebuild the term list from the current factors/maxOrder, resetting all betas. */
  rebuildTerms() {
    this.terms = buildTerms(this.factors.length, this.maxOrder)
      .map(indices => new Term(indices, 0));
  }

  /** Effective, clamped sample size. */
  effectiveSize() {
    return Math.min(100000, Math.max(10, this.sampleSize));
  }

  /**
   * Generate synthetic data rows. Pure — does not mutate or store the result.
   * @returns {Object[]}
   */
  generate() {
    const rng = mulberry32(this.seed);
    const n = this.effectiveSize();
    const args = [this.factors, this.terms, this.intercept, this.yName, n, this.noiseStd, rng];
    switch (this.samplingMethod) {
      case 'lhs': return sampleLHS(...args);
      case 'fullfactorial': return sampleFullFactorial(...args);
      case 'random':
      default: return sampleRandom(...args);
    }
  }

  /** Whether the user has deviated from the pristine default configuration. */
  hasContent() {
    if (this.intercept !== 50) return true;
    if (this.yName !== 'Y') return true;
    if (this.terms.some(t => t.beta !== 0)) return true;
    const def = defaultFactors();
    if (this.factors.length !== def.length) return true;
    return this.factors.some((f, i) =>
      f.name !== def[i].name || f.min !== def[i].min || f.max !== def[i].max);
  }

  toJSON() {
    const betas = {};
    this.terms.forEach((t, i) => { if (t.beta !== 0) betas[i] = t.beta; });
    return {
      _schema: { ...this._schema },
      factors: this.factors.map(f => f.toJSON()),
      maxOrder: this.maxOrder,
      intercept: this.intercept,
      yName: this.yName,
      samplingMethod: this.samplingMethod,
      sampleSize: this.sampleSize,
      noiseStd: this.noiseStd,
      seed: this.seed,
      betas,
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d) return s;

    if (Array.isArray(d.factors) && d.factors.length) {
      s.factors = d.factors.map(Factor.fromJSON);
    }
    if (Number.isFinite(d.maxOrder)) s.maxOrder = d.maxOrder;
    s.intercept = Number.isFinite(d.intercept) ? d.intercept : 0;
    s.yName = typeof d.yName === 'string' && d.yName ? d.yName : 'Y';
    s.samplingMethod = SAMPLING_METHODS.includes(d.samplingMethod) ? d.samplingMethod : 'random';
    s.sampleSize = Number.isFinite(d.sampleSize) ? d.sampleSize : 100;
    s.noiseStd = Number.isFinite(d.noiseStd) ? d.noiseStd : 2;
    s.seed = Number.isFinite(d.seed) ? d.seed : 42;

    s.rebuildTerms();
    if (d.betas && typeof d.betas === 'object') {
      for (const [idx, beta] of Object.entries(d.betas)) {
        const i = parseInt(idx, 10);
        if (s.terms[i] && Number.isFinite(beta)) s.terms[i].beta = beta;
      }
    }
    return s;
  }
}
