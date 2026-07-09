/**
 * D.Mike — Response Optimization Engine (response-optimization-engine.js)
 *
 * Pure-math toolbox for the Response Optimization module:
 *   - Derringer–Suich desirability functions (max / min / target) and the
 *     geometric-mean composite D over multiple responses with weights.
 *   - Polynomial / GLM / mixed model evaluation (`predictFromModel`) — handles
 *     three model shapes: pre-Phase-3 polynomial models (term-name strings),
 *     spec-based polynomial models (V0.4 Phase 3+) where `model.spec`
 *     describes effect-coded predictors, and GLM models where `model.family`
 *     specifies the inverse link to apply to η = Xβ.
 *   - Multi-start Nelder–Mead with box projection — derivative-free, no
 *     external dependencies, sufficient for the smooth desirability surface
 *     produced by polynomial regression in the Improve phase.
 *   - Hybrid optimisation: when a model carries a spec with categorical
 *     predictors, enumerate the Cartesian product of level combinations and
 *     run Nelder–Mead over the continuous predictors inside each cell.
 *   - Pareto-frontier filter (naïve O(n²)) for visualising trade-offs between
 *     competing responses.
 *
 * The engine does NOT reach into the worksheet or stateManager. Callers feed
 * it model objects (matching state.models[id]) and factor bound arrays.
 */

import { compileModelSpec } from './regression-engine.js';

// ─── Desirability functions ───────────────────────────────────────

/**
 * Larger-the-better desirability d(y) ∈ [0, 1].
 *   d = 0           if y ≤ lower
 *   d = ((y-lo)/(up-lo))^shape   if lower < y < upper
 *   d = 1           if y ≥ upper
 *
 * @param {number} y
 * @param {number} lower — value below which the response is unacceptable
 * @param {number} upper — value at or above which the response is fully satisfactory
 * @param {number} [shape=1] — concavity exponent (s in Derringer-Suich); shape>1 makes the function more demanding near `upper`
 */
export function desirabilityMax(y, lower, upper, shape = 1) {
  if (!Number.isFinite(y)) return 0;
  if (upper <= lower) return y >= lower ? 1 : 0;
  if (y <= lower) return 0;
  if (y >= upper) return 1;
  return ((y - lower) / (upper - lower)) ** shape;
}

/**
 * Wrapper that dispatches to max / min / target based on the `kind` argument.
 * Convenient for the Algorithm Lab Try-It UI, where the user picks the goal
 * type from a dropdown.
 *
 * @param {number} y
 * @param {'max'|'min'|'target'} kind
 * @param {number} lower
 * @param {number} target — only used when kind='target' (otherwise pass anything)
 * @param {number} upper
 * @param {number} [shapeS=1] — shape parameter (kind='max'|'min': single exponent; kind='target': lower-side exponent)
 * @param {number} [shapeT=1] — only used when kind='target' (upper-side exponent)
 */
export function desirabilityIndividual(y, kind, lower, target, upper, shapeS = 1, shapeT = 1) {
  switch (kind) {
    case 'max':    return desirabilityMax(y, lower, upper, shapeS);
    case 'min':    return desirabilityMin(y, lower, upper, shapeS);
    case 'target': return desirabilityTarget(y, lower, target, upper, shapeS, shapeT);
    default:       return 0;
  }
}

/** Smaller-the-better. Mirror of desirabilityMax. */
export function desirabilityMin(y, lower, upper, shape = 1) {
  if (!Number.isFinite(y)) return 0;
  if (upper <= lower) return y <= upper ? 1 : 0;
  if (y >= upper) return 0;
  if (y <= lower) return 1;
  return ((upper - y) / (upper - lower)) ** shape;
}

/**
 * Target-is-best desirability with an asymmetric two-sided shape.
 *   d = 0                                   if y ≤ lower or y ≥ upper
 *   d = ((y-lo)/(target-lo))^shapeS         if lower < y < target
 *   d = ((up-y)/(up-target))^shapeT         if target < y < upper
 *   d = 1                                   if y == target
 */
export function desirabilityTarget(y, lower, target, upper, shapeS = 1, shapeT = 1) {
  if (!Number.isFinite(y)) return 0;
  if (y <= lower || y >= upper) return 0;
  if (y === target) return 1;
  if (y < target) return ((y - lower) / (target - lower)) ** shapeS;
  return ((upper - y) / (upper - target)) ** shapeT;
}

/**
 * Geometric-mean composite desirability with weights.
 *   D = (∏ d_i^w_i) ^ (1 / Σw_i)
 * Returns 0 the moment any individual desirability hits 0 — a hard veto, not a soft penalty.
 *
 * @param {number[]} individuals
 * @param {number[]} [weights]
 * @returns {number}
 */
export function combinedDesirability(individuals, weights) {
  if (individuals.length === 0) return 0;
  const w = weights ?? individuals.map(() => 1);
  let logSum = 0;
  let weightSum = 0;
  for (let i = 0; i < individuals.length; i++) {
    const d = individuals[i];
    const wi = w[i];
    if (d <= 0) return 0;
    logSum += wi * Math.log(d);
    weightSum += wi;
  }
  if (weightSum <= 0) return 0;
  return Math.exp(logSum / weightSum);
}

// ─── Term evaluator ───────────────────────────────────────────────

/**
 * Evaluate a single term name (as produced by buildPolyDesignMatrix) at a
 * factor vector x.
 *
 * Recognised forms:
 *   'Intercept' or '1'        → 1
 *   '<factor>'                → x[index(factor)]
 *   '<factor>²' / '<factor>³' → x[…]^n
 *   'A·B' or 'A·B²'           → product of components, exponent applies per component
 *
 * @param {string} term
 * @param {number[]} x — factor vector in factor-spec order
 * @param {Map<string, number>} factorIndex — factor name → index
 */
function evalTerm(term, x, factorIndex) {
  if (!term || term === 'Intercept' || term === '1') return 1;
  let value = 1;
  // Split product factors at the middle-dot (·). Each part may carry a unicode exponent.
  for (const part of term.split('·')) {
    const m = part.match(/^(.+?)(²|³)?$/u);
    if (!m) return 0;
    const name = m[1].trim();
    const exp = m[2] === '²' ? 2 : m[2] === '³' ? 3 : 1;
    const idx = factorIndex.get(name);
    if (idx == null) return 0;
    value *= x[idx] ** exp;
  }
  return value;
}

/**
 * Evaluate a GLM-style term name at a factor value map.
 *
 * GLM design matrices (see `buildGLMDesignMatrix`) are dummy-coded, so a
 * categorical predictor with k levels contributes k − 1 columns named
 * `colName[level]` — `1` when the input matches that level, `0` otherwise
 * (reference level → all indicators are 0). Continuous predictors keep their
 * raw value; interactions are products of components.
 *
 * Recognised forms:
 *   'Intercept' / '1'      → 1
 *   '<colName>'            → raw numeric value
 *   '<colName>[<level>]'   → 1 if factor equals <level>, else 0
 *   'A·B' / 'A[L1]·B[L2]'  → product of components
 *
 * @param {string} term
 * @param {Map<string, number|string>} factorValueByName
 */
function evalGLMTerm(term, factorValueByName) {
  if (!term || term === 'Intercept' || term === '1') return 1;
  let value = 1;
  for (const part of term.split('·')) {
    const m = part.match(/^(.+?)(?:\[(.+)\])?$/);
    if (!m) return 0;
    const name = m[1].trim();
    const level = m[2];
    const v = factorValueByName.get(name);
    if (level !== undefined) {
      // Dummy indicator: only the active non-reference level contributes 1.
      if (String(v) !== String(level)) return 0;
    } else {
      const num = Number(v);
      if (!Number.isFinite(num)) return 0;
      value *= num;
    }
  }
  return value;
}

/**
 * Apply the inverse link of a GLM family to the linear predictor η.
 * Identity for OLS-shaped models (no family) and unknown links — keep the
 * existing behaviour where ŷ = η.
 *
 * @param {number} eta
 * @param {{link?: string}} [family]
 */
function applyInverseLink(eta, family) {
  if (!family) return eta;
  switch (family.link) {
    case 'logit':  return 1 / (1 + Math.exp(-eta));
    case 'log':    return Math.exp(eta);
    case 'identity':
    default:       return eta;
  }
}

/**
 * Predict the response value from a stored regression model.
 *
 * Three paths:
 *
 *   1. GLM models: `model.family` is present (e.g. `{name:'binomial', link:'logit'}`).
 *      Coefficients are calibrated for a dummy-coded design (per
 *      `buildGLMDesignMatrix`); we rebuild a one-row design from the input,
 *      compute η = Xβ, then apply the inverse link so the optimiser sees the
 *      natural response scale (probability for logit, rate for log, …).
 *
 *   2. Spec-based polynomial models (V0.4 Phase 3+): `model.spec` is present
 *      and describes both continuous and categorical predictors. The input `x`
 *      may be either an array (positional, in spec.predictors order — number
 *      for continuous, label string for categorical) or an object keyed by
 *      predictor id. We compile a one-row design matrix and dot-product
 *      with `model.coef`.
 *
 *   3. Legacy polynomial models: `model.termSet` carries term-name strings
 *      and `x` is a positional number array; this is the pre-spec path used
 *      for ad-hoc continuous fits.
 *
 * @param {object} model — record matching state.models[id]
 * @param {number[]|Record<string, number|string>} x
 * @returns {number} predicted ŷ
 */
export function predictFromModel(model, x) {
  if (!model?.coef) return NaN;

  if (model.family && Array.isArray(model.terms)) {
    // GLM path: dummy-coded design driven by model.terms[] + factorSpec[].
    const factorValueByName = new Map();
    const specs = model.factorSpec ?? [];
    if (Array.isArray(x)) {
      specs.forEach((f, i) => factorValueByName.set(f.name, x[i]));
    } else {
      for (const f of specs) factorValueByName.set(f.name, x[f.name]);
    }
    let eta = 0;
    for (let i = 0; i < model.terms.length; i++) {
      eta += model.coef[i] * evalGLMTerm(model.terms[i], factorValueByName);
    }
    return applyInverseLink(eta, model.family);
  }

  if (model.spec) {
    // Build a 1-row column dict in the predictor order required by compileModelSpec.
    const columns = {};
    if (Array.isArray(x)) {
      model.spec.predictors.forEach((p, i) => { columns[p.id] = [x[i]]; });
    } else {
      for (const p of model.spec.predictors) columns[p.id] = [x[p.id]];
    }
    let compiled;
    try {
      compiled = compileModelSpec(model.spec, { columns });
    } catch {
      return NaN;
    }
    const row = compiled.X[0];
    let s = 0;
    for (let i = 0; i < row.length; i++) s += row[i] * model.coef[i];
    return s;
  }

  // Legacy path: term-name parser (continuous polynomial only).
  if (!model.termSet) return NaN;
  const factorIndex = new Map();
  (model.factorSpec ?? []).forEach((f, i) => factorIndex.set(f.name, i));
  let sum = 0;
  for (let t = 0; t < model.termSet.length; t++) {
    sum += model.coef[t] * evalTerm(model.termSet[t], x, factorIndex);
  }
  return sum;
}

// ─── Nelder–Mead (box-projected) ──────────────────────────────────

/**
 * Project a point onto a hyper-rectangle defined by per-coordinate bounds.
 * @param {number[]} x
 * @param {Array<[number, number]>} bounds — [lo, hi] per dimension
 */
function boxProject(x, bounds) {
  return x.map((v, i) => {
    const [lo, hi] = bounds[i];
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  });
}

/**
 * Single-start Nelder–Mead minimisation with box projection at every move.
 *
 * Standard parameters: α=1, γ=2, ρ=0.5, σ=0.5. Termination on the simplex
 * fitting inside an L∞ ball of radius `tol` *or* exhausting maxIter.
 *
 * @param {(x: number[]) => number} fn — objective; smaller is better
 * @param {number[]} x0 — start point
 * @param {Array<[number, number]>} bounds
 * @param {{maxIter?: number, tol?: number, initStep?: number}} [opts]
 * @returns {{x: number[], fx: number, iter: number}}
 */
export function nelderMead(fn, x0, bounds, opts = {}) {
  const maxIter  = opts.maxIter ?? 400;
  const tol      = opts.tol ?? 1e-6;
  const initStep = opts.initStep ?? 0.05;
  const n = x0.length;

  // Build initial simplex: x0 plus n vertices offset along each axis (scaled
  // to the per-dimension bound width so the simplex spans the search box).
  const simplex = [boxProject(x0.slice(), bounds)];
  for (let i = 0; i < n; i++) {
    const v = x0.slice();
    const [lo, hi] = bounds[i];
    const span = hi - lo;
    v[i] = v[i] + initStep * span;
    simplex.push(boxProject(v, bounds));
  }
  const fvals = simplex.map(fn);

  const order = () => {
    const idx = simplex.map((_, i) => i).sort((a, b) => fvals[a] - fvals[b]);
    return { best: idx[0], second: idx[idx.length - 2], worst: idx[idx.length - 1] };
  };

  for (let iter = 0; iter < maxIter; iter++) {
    const { best, second, worst } = order();

    // Convergence: max range across coordinates
    let maxRange = 0;
    for (let d = 0; d < n; d++) {
      let lo =  Infinity, hi = -Infinity;
      for (const v of simplex) { if (v[d] < lo) lo = v[d]; if (v[d] > hi) hi = v[d]; }
      if (hi - lo > maxRange) maxRange = hi - lo;
    }
    if (maxRange < tol) {
      return { x: simplex[best].slice(), fx: fvals[best], iter };
    }

    // Centroid of all vertices except the worst
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < simplex.length; i++) {
      if (i === worst) continue;
      for (let d = 0; d < n; d++) centroid[d] += simplex[i][d];
    }
    for (let d = 0; d < n; d++) centroid[d] /= n;

    // Reflection
    const xr = boxProject(centroid.map((c, d) => c + (c - simplex[worst][d])), bounds);
    const fr = fn(xr);

    if (fr < fvals[best]) {
      // Expansion
      const xe = boxProject(centroid.map((c, d) => c + 2 * (c - simplex[worst][d])), bounds);
      const fe = fn(xe);
      if (fe < fr) { simplex[worst] = xe; fvals[worst] = fe; }
      else         { simplex[worst] = xr; fvals[worst] = fr; }
      continue;
    }
    if (fr < fvals[second]) {
      simplex[worst] = xr; fvals[worst] = fr;
      continue;
    }
    // Contraction
    const xc = boxProject(centroid.map((c, d) => c + 0.5 * (simplex[worst][d] - c)), bounds);
    const fc = fn(xc);
    if (fc < fvals[worst]) {
      simplex[worst] = xc; fvals[worst] = fc;
      continue;
    }
    // Shrink toward best
    for (let i = 0; i < simplex.length; i++) {
      if (i === best) continue;
      simplex[i] = boxProject(simplex[i].map((v, d) => simplex[best][d] + 0.5 * (v - simplex[best][d])), bounds);
      fvals[i] = fn(simplex[i]);
    }
  }
  const { best } = order();
  return { x: simplex[best].slice(), fx: fvals[best], iter: maxIter };
}

/**
 * Multi-start Nelder–Mead. Runs `nStarts` searches from quasi-random points
 * scattered across the box, returns the best one. Deterministic given a seed.
 *
 * @param {(x: number[]) => number} fn
 * @param {Array<[number, number]>} bounds
 * @param {{nStarts?: number, seed?: number, maxIter?: number, tol?: number}} [opts]
 */
export function multiStartNelderMead(fn, bounds, opts = {}) {
  const nStarts = opts.nStarts ?? 8;
  const seed    = opts.seed ?? 42;
  // Tiny LCG so tests stay reproducible without bringing in a PRNG dep.
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };

  let best = null;
  for (let k = 0; k < nStarts; k++) {
    const x0 = bounds.map(([lo, hi]) => lo + rand() * (hi - lo));
    const res = nelderMead(fn, x0, bounds, opts);
    if (!best || res.fx < best.fx) best = res;
  }
  return best;
}

// ─── Multi-response optimisation ──────────────────────────────────

/**
 * Optimise multiple responses through their desirability functions.
 *
 * Routes to the hybrid path when any selected model has categorical
 * predictors (detected via `model.spec.predictors[*].kind`); otherwise
 * runs the legacy continuous-only multi-start Nelder–Mead.
 *
 * @param {Array} models — list of model records (state.models[id] shape)
 * @param {Array<{kind:'max'|'min'|'target', lower:number, upper:number, target?:number, weight?:number, shape?:number, shapeS?:number, shapeT?:number}>} desirSpecs — one per model, in the same order
 * @param {Array<[number, number]>} factorBounds — per-factor [lo, hi] in the order of model.factorSpec (assumed common across models). For categorical positions the bounds are nominal and ignored — the level set is derived from `model.spec`.
 * @param {{nStarts?: number, seed?: number, maxIter?: number, tol?: number}} [opts]
 * @returns {{xOpt: Array<number|string>, xOptByName: Record<string, number|string>, yPredictions: number[], dPerResponse: number[], D: number, iter: number, isHybrid: boolean}}
 */
export function optimizeResponses(models, desirSpecs, factorBounds, opts = {}) {
  if (models.length !== desirSpecs.length) {
    throw new Error(`models (${models.length}) and desirSpecs (${desirSpecs.length}) must have the same length`);
  }
  const weights = desirSpecs.map(s => s.weight ?? 1);
  const spec = models[0]?.spec;
  const hasCategorical = Boolean(spec?.predictors?.some(p => p.kind === 'categorical'));

  if (hasCategorical) {
    return optimizeResponsesHybrid(models, desirSpecs, factorBounds, weights, opts);
  }

  // Continuous-only path (fast).
  const objective = (x) => {
    const ds = [];
    for (let i = 0; i < models.length; i++) {
      const yhat = predictFromModel(models[i], x);
      ds.push(individualDesirability(yhat, desirSpecs[i]));
    }
    return -combinedDesirability(ds, weights);
  };
  const best = multiStartNelderMead(objective, factorBounds, opts);
  const xOpt = best.x;
  const yPredictions = models.map(m => predictFromModel(m, xOpt));
  const dPerResponse = yPredictions.map((y, i) => individualDesirability(y, desirSpecs[i]));
  const D = combinedDesirability(dPerResponse, weights);
  // xOptByName mirrors xOpt — for continuous-only the names come from the
  // first model's factorSpec when available, else fall back to numeric keys.
  const xOptByName = {};
  const names = (models[0]?.factorSpec ?? []).map(f => f.name);
  xOpt.forEach((v, i) => { xOptByName[names[i] ?? String(i)] = v; });
  return { xOpt, xOptByName, yPredictions, dPerResponse, D, iter: best.iter, isHybrid: false };
}

/**
 * Hybrid optimisation: enumerate the Cartesian product of categorical level
 * combinations, run multi-start Nelder–Mead on the continuous slots inside
 * each cell, return the global best.
 *
 * Internal — called by `optimizeResponses` when a spec with categorical
 * predictors is detected. Assumes every model in `models` shares the same
 * predictor structure (the diagnostic gate in the optimizer module enforces
 * this before this function is reached).
 */
function optimizeResponsesHybrid(models, desirSpecs, factorBounds, weights, opts) {
  const spec = models[0].spec;
  const predictors = spec.predictors;
  const catIdx  = predictors.map((p, i) => p.kind === 'categorical' ? i : -1).filter(i => i >= 0);
  const contIdx = predictors.map((p, i) => p.kind === 'continuous'  ? i : -1).filter(i => i >= 0);

  // Cartesian product of level combinations across all categorical predictors.
  const catCombos = catIdx.reduce((acc, idx) => {
    const levels = predictors[idx].levels;
    if (!Array.isArray(levels) || levels.length === 0) return acc;
    const next = [];
    for (const partial of acc) for (const lv of levels) next.push([...partial, lv]);
    return next;
  }, [[]]);

  // Continuous-only bounds vector aligned to contIdx.
  const contBounds = contIdx.map(i => factorBounds[i] ?? [-1, 1]);

  let bestD = -Infinity;
  let bestX = null;          // full positional vector incl. categorical labels
  let bestIter = 0;

  for (const combo of catCombos) {
    // Build a partial-row template: categorical values fixed, continuous
    // values to be filled in by the optimiser's x.
    const template = new Array(predictors.length);
    catIdx.forEach((idx, k) => { template[idx] = combo[k]; });

    const objective = (xCont) => {
      // Splice continuous values into their positions.
      const x = template.slice();
      contIdx.forEach((idx, k) => { x[idx] = xCont[k]; });
      const ds = [];
      for (let i = 0; i < models.length; i++) {
        const yhat = predictFromModel(models[i], x);
        ds.push(individualDesirability(yhat, desirSpecs[i]));
      }
      return -combinedDesirability(ds, weights);
    };

    let cellResult;
    if (contIdx.length === 0) {
      // Pure-categorical model — just evaluate the combination and compare.
      const D = -objective([]);
      cellResult = { x: [], fx: -D, iter: 0 };
    } else {
      cellResult = multiStartNelderMead(objective, contBounds, opts);
    }
    const D = -cellResult.fx;
    if (D > bestD) {
      bestD = D;
      const x = template.slice();
      contIdx.forEach((idx, k) => { x[idx] = cellResult.x[k]; });
      bestX = x;
      bestIter += cellResult.iter || 0;
    } else {
      bestIter += cellResult.iter || 0;
    }
  }

  const yPredictions = models.map(m => predictFromModel(m, bestX));
  const dPerResponse = yPredictions.map((y, i) => individualDesirability(y, desirSpecs[i]));
  const D = combinedDesirability(dPerResponse, weights);
  const xOptByName = {};
  predictors.forEach((p, i) => { xOptByName[p.id] = bestX[i]; });
  return { xOpt: bestX, xOptByName, yPredictions, dPerResponse, D, iter: bestIter, isHybrid: true };
}

/** Dispatch a single desirability spec to the right function. */
function individualDesirability(y, spec) {
  switch (spec.kind) {
    case 'max':
      return desirabilityMax(y, spec.lower, spec.upper, spec.shape ?? 1);
    case 'min':
      return desirabilityMin(y, spec.lower, spec.upper, spec.shape ?? 1);
    case 'target':
      return desirabilityTarget(y, spec.lower, spec.target, spec.upper, spec.shapeS ?? 1, spec.shapeT ?? 1);
    default:
      return 0;
  }
}

// ─── Response-surface grid ────────────────────────────────────────

/**
 * Compute a 2D grid of predicted ŷ values for visualisation. Sweeps two
 * continuous predictors (`xId`, `yId`) over their bounds at a fixed
 * resolution; every other predictor is held at the value supplied in
 * `fixings` (categorical predictors must be fixed to one of their levels).
 *
 * Returns the grid plus axis-tick arrays so callers can render an SVG
 * heatmap or contour. Grid value at (i, j) corresponds to (xTicks[j], yTicks[i]).
 *
 * @param {object} model - state.models[id] record (must carry `spec`)
 * @param {object} opts
 * @param {string} opts.xId - predictor id swept on the X axis
 * @param {string} opts.yId - predictor id swept on the Y axis
 * @param {Record<string, number|string>} [opts.fixings] - values for every
 *   other predictor; defaults to factorSpec midpoints / first level
 * @param {[number, number]} [opts.xRange] - override [lo, hi] for X
 * @param {[number, number]} [opts.yRange] - override [lo, hi] for Y
 * @param {number} [opts.gridSize=32]
 * @returns {{ grid: number[][], xTicks: number[], yTicks: number[],
 *            xRange: [number, number], yRange: [number, number] }}
 */
export function buildResponseSurface(model, opts) {
  if (!model?.spec) throw new Error('buildResponseSurface needs a model with a spec');
  const { xId, yId } = opts;
  const xPred = model.spec.predictors.find(p => p.id === xId);
  const yPred = model.spec.predictors.find(p => p.id === yId);
  if (!xPred || !yPred) throw new Error(`Unknown predictor id (${xId}, ${yId})`);
  if (xPred.kind !== 'continuous' || yPred.kind !== 'continuous') {
    throw new Error('buildResponseSurface only sweeps continuous predictors');
  }

  const factorBounds = (model.factorSpec ?? []).reduce((acc, f) => {
    acc[f.name] = [f.low ?? -1, f.high ?? 1];
    return acc;
  }, {});
  const xRange = opts.xRange ?? factorBounds[xId] ?? [-1, 1];
  const yRange = opts.yRange ?? factorBounds[yId] ?? [-1, 1];
  const N = Math.max(2, opts.gridSize ?? 32);

  // Default fixings: continuous → midpoint of factor bounds, categorical →
  // first level (the reference). Caller can override per predictor.
  const fixings = { ...(opts.fixings ?? {}) };
  for (const p of model.spec.predictors) {
    if (p.id === xId || p.id === yId) continue;
    if (fixings[p.id] !== undefined) continue;
    if (p.kind === 'categorical') {
      fixings[p.id] = p.reference ?? p.levels?.[0] ?? null;
    } else {
      const b = factorBounds[p.id] ?? [-1, 1];
      fixings[p.id] = (b[0] + b[1]) / 2;
    }
  }

  const xTicks = Array.from({ length: N }, (_, i) => xRange[0] + (i / (N - 1)) * (xRange[1] - xRange[0]));
  const yTicks = Array.from({ length: N }, (_, i) => yRange[0] + (i / (N - 1)) * (yRange[1] - yRange[0]));
  const grid = Array.from({ length: N }, () => new Array(N).fill(NaN));

  // Use `predictFromModel` per grid point so GLM models pick up the inverse
  // link (logit → probability, log → rate) instead of returning η. The cost
  // is N² evaluations instead of N batched compilations — negligible for the
  // default grid size and worth the consistency.
  const xInput = {};
  for (const p of model.spec.predictors) {
    if (p.id === xId || p.id === yId) continue;
    xInput[p.id] = fixings[p.id];
  }
  for (let i = 0; i < N; i++) {
    xInput[yId] = yTicks[i];
    for (let j = 0; j < N; j++) {
      xInput[xId] = xTicks[j];
      grid[i][j] = predictFromModel(model, xInput);
    }
  }

  return { grid, xTicks, yTicks, xRange, yRange };
}

// ─── Pareto front ─────────────────────────────────────────────────

/**
 * Filter to the non-dominated subset. Each entry in `points` is a vector of
 * objective values where smaller is better (use `-y` for maximisation).
 *
 * Returns the indices of non-dominated points, in input order.
 *
 * @param {number[][]} points
 * @returns {number[]} indices
 */
export function paretoFrontier(points) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    let dominated = false;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (dominates(points[j], points[i])) { dominated = true; break; }
    }
    if (!dominated) out.push(i);
  }
  return out;
}

/** True iff `a` dominates `b`: a ≤ b in every coordinate, strictly less in at least one. */
function dominates(a, b) {
  let strict = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i]) return false;
    if (a[i] < b[i]) strict = true;
  }
  return strict;
}
