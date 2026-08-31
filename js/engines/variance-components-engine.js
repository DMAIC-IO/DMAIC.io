/**
 * D.Mike — Variance Components Engine (variance-components-engine.js)
 *
 * Estimates variance components for a purely random-effects model with two to
 * four categorical factors, either nested or crossed, via the ANOVA/EMS
 * (Henderson I) method or REML.
 *
 * Deliberately knows nothing about multi-vari charts: it takes a response
 * vector plus factor columns and returns a decomposition. That keeps it
 * independently verifiable against gold-standard reference values and reusable
 * by a future stand-alone variance-components module.
 *
 * Both model forms reduce to one representation: a term is a SET OF FACTOR
 * INDICES. Nested gives the prefixes {0}, {0,1}, {0,1,2}; crossed gives every
 * non-empty subset. Cell keys, sequential sums of squares and EMS coefficients
 * then follow from that set alone, so there is one code path, not two.
 *
 * No DOM, no state — all functions are stateless and testable.
 */

import { matInverse } from './matrix-utils.js';

/** Model bounds, mirrored from the multi-vari engine. */
export const MIN_FACTORS = 2;
export const MAX_FACTORS = 4;

/** Letters used in machine-readable term ids: A, B, C, D. */
const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * Build the term list for a model form.
 *
 * @param {'nested'|'crossed'} modelForm
 * @param {string[]} factorNames — 2..4 names, in the user's chosen order
 * @returns {Array<{id: string, label: string, factorIndices: number[]}>}
 */
export function buildTerms(modelForm, factorNames) {
  const k = factorNames.length;
  if (k < MIN_FACTORS) throw new Error('buildTerms: needs at least two factors');
  if (k > MAX_FACTORS) throw new Error('buildTerms: at most four factors are supported');

  if (modelForm === 'nested') {
    const terms = [];
    for (let i = 0; i < k; i++) {
      const factorIndices = [];
      for (let j = 0; j <= i; j++) factorIndices.push(j);
      const id = i === 0 ? LETTERS[0] : `${LETTERS[i]}(${LETTERS.slice(0, i).join('')})`;
      const label = i === 0
        ? factorNames[0]
        : `${factorNames[i]} (in ${factorNames.slice(0, i).join(', ')})`;
      terms.push({ id, label, factorIndices });
    }
    return terms;
  }

  if (modelForm === 'crossed') {
    const subsets = [];
    for (let mask = 1; mask < (1 << k); mask++) {
      const factorIndices = [];
      for (let j = 0; j < k; j++) if (mask & (1 << j)) factorIndices.push(j);
      subsets.push(factorIndices);
    }
    subsets.sort((a, b) => {
      if (a.length !== b.length) return a.length - b.length;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
      return 0;
    });
    return subsets.map(factorIndices => ({
      id: factorIndices.map(i => LETTERS[i]).join('*'),
      label: factorIndices.map(i => factorNames[i]).join(' × '),
      factorIndices,
    }));
  }

  throw new Error(`buildTerms: unknown model form "${modelForm}"`);
}

/**
 * Separator for composite cell keys. U+001F (unit separator) is a control
 * character that cannot occur in a worksheet cell, so a level label can never
 * forge a key boundary. Built with `String.fromCharCode` on purpose: a literal
 * control character in source is invisible in diffs and gets mangled by
 * tooling.
 */
export const KEY_SEP = String.fromCharCode(31);

/**
 * Cell keys and indicator columns for one term.
 *
 * @param {number[]} factorIndices — the term's factors
 * @param {string[][]} factorValues — one array of level labels per factor, all length n
 * @returns {{keys: string[], cells: string[], columns: Float64Array[]}}
 */
export function termCells(factorIndices, factorValues) {
  const n = factorValues[factorIndices[0]].length;
  const keys = new Array(n);
  const index = new Map();
  const cells = [];

  for (let i = 0; i < n; i++) {
    let key = factorValues[factorIndices[0]][i];
    for (let j = 1; j < factorIndices.length; j++) {
      key += KEY_SEP + factorValues[factorIndices[j]][i];
    }
    keys[i] = key;
    if (!index.has(key)) {
      index.set(key, cells.length);
      cells.push(key);
    }
  }

  const columns = cells.map(() => new Float64Array(n));
  for (let i = 0; i < n; i++) columns[index.get(keys[i])][i] = 1;

  return { keys, cells, columns };
}

/** Relative tolerance below which a column counts as linearly dependent. */
export const RANK_TOL = 1e-10;

/** Euclidean norm of a vector. */
function norm(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

/**
 * Append columns to an orthonormal basis, skipping linearly dependent ones.
 *
 * Modified Gram-Schmidt with one re-orthogonalisation pass — the second pass
 * matters here because the indicator columns of a fine term are highly
 * collinear with the coarse terms already in the basis, and a single pass loses
 * orthogonality on exactly that case.
 *
 * @param {Float64Array[]} basis — extended in place
 * @param {Float64Array[]} columns
 * @param {number} [tol=RANK_TOL]
 * @returns {number} how many columns were actually added (the rank increase)
 */
export function appendBlock(basis, columns, tol = RANK_TOL) {
  let added = 0;
  for (const raw of columns) {
    const v = Float64Array.from(raw);
    const n0 = norm(v);
    if (n0 === 0) continue;

    for (let pass = 0; pass < 2; pass++) {
      for (const q of basis) {
        let d = 0;
        for (let i = 0; i < v.length; i++) d += q[i] * v[i];
        for (let i = 0; i < v.length; i++) v[i] -= d * q[i];
      }
    }

    const nv = norm(v);
    if (nv <= tol * n0) continue;          // dependent — no rank increase
    for (let i = 0; i < v.length; i++) v[i] /= nv;
    basis.push(v);
    added++;
  }
  return added;
}

/**
 * Sum of squared projections of `vector` onto basis vectors [from, to).
 *
 * With an orthonormal basis this is the squared norm of the projection onto
 * that slice — exactly a sequential sum of squares when `vector` is the
 * response, and exactly the Frobenius contribution of one indicator column to
 * an EMS coefficient.
 *
 * @param {Float64Array[]} basis
 * @param {number} from — inclusive
 * @param {number} to — exclusive
 * @param {Float64Array} vector
 * @returns {number}
 */
export function projectSquares(basis, from, to, vector) {
  let total = 0;
  for (let c = from; c < to; c++) {
    const q = basis[c];
    let d = 0;
    for (let i = 0; i < vector.length; i++) d += q[i] * vector[i];
    total += d * d;
  }
  return total;
}

/**
 * Sequential (Type I) ANOVA table for the given terms.
 *
 * Builds an orthonormal basis incrementally: intercept first, then each term's
 * indicator columns. A term's sequential sum of squares is the squared
 * projection of the response onto the basis vectors that term contributed; its
 * degrees of freedom are how many vectors that was. The error picks up whatever
 * the full model leaves.
 *
 * @param {{response: number[], factorValues: string[][],
 *          terms: Array<{id: string, factorIndices: number[]}>}} input
 * @returns {{rows: Array<{id: string, df: number, ss: number, ms: number}>,
 *            error: {df: number, ss: number, ms: number},
 *            basis: Float64Array[], ranks: number[],
 *            termColumns: Float64Array[][], n: number}}
 */
export function anovaTable({ response, factorValues, terms }) {
  const n = response.length;
  const y = Float64Array.from(response);

  const basis = [];
  const ones = new Float64Array(n).fill(1);
  appendBlock(basis, [ones]);            // intercept — occupies slot 0

  const rows = [];
  const ranks = [];
  const termColumns = [];

  for (const term of terms) {
    const { columns } = termCells(term.factorIndices, factorValues);
    termColumns.push(columns);
    const before = basis.length;
    appendBlock(basis, columns);
    const df = basis.length - before;
    const ss = projectSquares(basis, before, basis.length, y);
    rows.push({ id: term.id, df, ss, ms: df > 0 ? ss / df : NaN });
    ranks.push(basis.length);
  }

  let ySq = 0;
  for (let i = 0; i < n; i++) ySq += y[i] * y[i];
  const fitted = projectSquares(basis, 0, basis.length, y);
  const errDf = n - basis.length;
  const errSs = Math.max(0, ySq - fitted);

  return {
    rows,
    error: { df: errDf, ss: errSs, ms: errDf > 0 ? errSs / errDf : NaN },
    basis,
    ranks,
    termColumns,
    n,
  };
}

/**
 * Expected-mean-square coefficient matrix (Henderson method I).
 *
 * For term i and component j:  E[MS_i] = sum_j c_ij * var_j  with
 *
 *     c_ij = ||P_i Z_j||_F^2 / df_i
 *
 * where Z_j is term j's indicator matrix and P_i the projector onto the basis
 * vectors term i contributed. Computed column-wise via `projectSquares`, so no
 * n x n matrix is ever formed — the cost is O(n * cells).
 *
 * Deriving the coefficients numerically rather than plugging in per-design
 * textbook formulas is what makes unbalanced data work: those formulas hold
 * only under balance and silently produce wrong components otherwise.
 *
 * The last row is the error term, the last column the error variance, whose
 * coefficient is 1 in every row because the expected squared projection
 * contains var_e * df_i.
 *
 * @param {ReturnType<typeof anovaTable>} table
 * @returns {number[][]} (T+1) x (T+1)
 */
export function emsMatrix(table) {
  const { rows, error, basis, ranks, termColumns, n } = table;
  const T = rows.length;
  const C = [];

  for (let i = 0; i < T; i++) {
    const from = i === 0 ? 1 : ranks[i - 1];   // slot 0 is the intercept
    const to = ranks[i];
    const df = rows[i].df;
    const line = new Array(T + 1).fill(0);
    for (let j = 0; j < T; j++) {
      let frob = 0;
      for (const z of termColumns[j]) frob += projectSquares(basis, from, to, z);
      line[j] = df > 0 ? frob / df : 0;
    }
    line[T] = 1;
    C.push(line);
  }

  // Error row: the part of each Z_j orthogonal to the full model. For a
  // hierarchical design this is zero, but computing it keeps the matrix right
  // even when a term is aliased away.
  const errLine = new Array(T + 1).fill(0);
  for (let j = 0; j < T; j++) {
    let frob = 0;
    for (const z of termColumns[j]) {
      let sq = 0;
      for (let i = 0; i < n; i++) sq += z[i] * z[i];
      frob += sq - projectSquares(basis, 0, basis.length, z);
    }
    errLine[j] = error.df > 0 ? Math.max(0, frob) / error.df : 0;
  }
  errLine[T] = 1;
  C.push(errLine);

  return C;
}

/**
 * ANOVA/EMS variance component estimates.
 *
 * Solves C * var = MS, then clamps negatives to zero. The clamping happens
 * AFTER the solve, never during: every component is estimated from the raw mean
 * squares, so a negative estimate for one term does not silently distort its
 * neighbours. Clamped terms are flagged so the UI can say so.
 *
 * @param {ReturnType<typeof anovaTable>} table
 * @returns {{variances: number[], clamped: boolean[]}} length T+1, last = error
 */
export function anovaComponents(table) {
  const C = emsMatrix(table);
  const ms = [...table.rows.map(r => r.ms), table.error.ms];
  const T = table.rows.length;

  // A term with zero df carries no information — reduce it to a unit row so the
  // system stays solvable and its component comes out as 0.
  for (let i = 0; i <= T; i++) {
    if (!Number.isFinite(ms[i])) {
      for (let j = 0; j <= T; j++) C[i][j] = i === j ? 1 : 0;
      ms[i] = 0;
    }
  }

  const inv = matInverse(C);
  const raw = inv.map(row => row.reduce((acc, v, j) => acc + v * ms[j], 0));

  const clamped = raw.map(v => v < 0);
  const variances = raw.map(v => (v < 0 ? 0 : v));
  return { variances, clamped };
}

/**
 * Materialise the pieces REML needs: the response and one indicator block per
 * term. The fixed part is the intercept alone — every factor is random, which
 * is the modelling assumption of this tool.
 *
 * @param {{response: number[], factorValues: string[][],
 *          terms: Array<{factorIndices: number[]}>}} input
 * @returns {{y: Float64Array, Z: Float64Array[][], q: number[], n: number}}
 */
export function remlWorkspace({ response, factorValues, terms }) {
  const n = response.length;
  const Z = terms.map(t => termCells(t.factorIndices, factorValues).columns);
  return { y: Float64Array.from(response), Z, q: Z.map(b => b.length), n };
}

/**
 * The REML projector P = Vinv - Vinv X (X' Vinv X)inv X' Vinv, for X = 1.
 *
 * @param {ReturnType<typeof remlWorkspace>} ws
 * @param {number[]} theta — components, last entry the error variance
 * @returns {{P: number[][], Py: Float64Array, ok: boolean}} ok=false when V is singular
 */
export function remlP(ws, theta) {
  const { Z, n } = ws;
  const sigmaE = theta[theta.length - 1];

  const V = [];
  for (let i = 0; i < n; i++) V.push(new Array(n).fill(0));
  for (let i = 0; i < n; i++) V[i][i] = sigmaE;
  for (let j = 0; j < Z.length; j++) {
    const s = theta[j];
    if (s === 0) continue;
    for (const z of Z[j]) {
      for (let a = 0; a < n; a++) {
        if (z[a] === 0) continue;
        for (let b = 0; b < n; b++) if (z[b] !== 0) V[a][b] += s;
      }
    }
  }

  let Vinv;
  try {
    Vinv = matInverse(V);
  } catch {
    return { P: null, Py: null, ok: false };
  }
  // matInverse reports a singular matrix by returning null rather than throwing.
  if (!Vinv) return { P: null, Py: null, ok: false };

  // X = 1, so X' Vinv X is the scalar sum of all entries of Vinv.
  let total = 0;
  const rowSums = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += Vinv[i][j];
    rowSums[i] = s;
    total += s;
  }
  if (!Number.isFinite(total) || total === 0) return { P: null, Py: null, ok: false };

  const P = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n);
    for (let j = 0; j < n; j++) row[j] = Vinv[i][j] - (rowSums[i] * rowSums[j]) / total;
    P.push(row);
  }

  const Py = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += P[i][j] * ws.y[j];
    Py[i] = s;
  }

  return { P, Py, ok: true };
}

/**
 * One EM step for REML.
 *
 *   var_j <- var_j + (var_j^2 / q_j) * (||Z_j' P y||^2 - tr(Z_j' P Z_j))
 *   var_e <- var_e + (var_e^2 / n)   * (||P y||^2      - tr(P))
 *
 * Monotone in the likelihood and never leaves the non-negative orthant, which
 * is why it serves as the warm start before AI-REML takes over.
 *
 * @param {ReturnType<typeof remlWorkspace>} ws
 * @param {number[]} theta
 * @returns {number[]} the updated components
 */
export function emStep(ws, theta) {
  const { Z, q, n } = ws;
  const { P, Py, ok } = remlP(ws, theta);
  if (!ok) return theta.slice();

  const next = theta.slice();

  for (let j = 0; j < Z.length; j++) {
    let quad = 0;
    let trace = 0;
    for (const z of Z[j]) {
      let zPy = 0;
      for (let i = 0; i < n; i++) zPy += z[i] * Py[i];
      quad += zPy * zPy;

      for (let a = 0; a < n; a++) {
        if (z[a] === 0) continue;
        for (let b = 0; b < n; b++) if (z[b] !== 0) trace += P[a][b];
      }
    }
    const s = theta[j];
    next[j] = Math.max(0, s + (s * s / q[j]) * (quad - trace));
  }

  let quadE = 0;
  for (let i = 0; i < n; i++) quadE += Py[i] * Py[i];
  let trP = 0;
  for (let i = 0; i < n; i++) trP += P[i][i];
  const se = theta[theta.length - 1];
  next[next.length - 1] = Math.max(0, se + (se * se / n) * (quadE - trP));

  return next;
}

/** EM warm-up steps before AI-REML takes over. */
export const REML_EM_WARMUP = 5;
/** Hard iteration budget for the REML loop. */
export const REML_MAX_ITER = 100;
/** Relative change below which the components count as converged. */
export const REML_TOL = 1e-8;
/** Row cap — every iteration builds and inverts an n x n matrix. */
export const REML_MAX_ROWS = 500;

/**
 * One AI-REML (Fisher scoring) step.
 *
 *   score_j = -0.5 * (tr(Z_j' P Z_j) - ||Z_j' P y||^2)
 *   AI_jk   =  0.5 * u_j' P u_k        with u_j = Z_j Z_j' P y  (u_e = P y)
 *   theta  <- theta + AIinv * score
 *
 * The error component is handled as an identity design block.
 *
 * @param {ReturnType<typeof remlWorkspace>} ws
 * @param {number[]} theta
 * @returns {number[]|null} null when P or AI is singular
 */
function aiStep(ws, theta) {
  const { Z, n } = ws;
  const { P, Py, ok } = remlP(ws, theta);
  if (!ok) return null;

  const T = Z.length;

  const u = [];
  for (let j = 0; j < T; j++) {
    const acc = new Float64Array(n);
    for (const z of Z[j]) {
      let zPy = 0;
      for (let i = 0; i < n; i++) zPy += z[i] * Py[i];
      for (let i = 0; i < n; i++) acc[i] += z[i] * zPy;
    }
    u.push(acc);
  }
  u.push(Float64Array.from(Py));

  const score = new Array(T + 1).fill(0);
  for (let j = 0; j < T; j++) {
    let quad = 0;
    let trace = 0;
    for (const z of Z[j]) {
      let zPy = 0;
      for (let i = 0; i < n; i++) zPy += z[i] * Py[i];
      quad += zPy * zPy;
      for (let a = 0; a < n; a++) {
        if (z[a] === 0) continue;
        for (let b = 0; b < n; b++) if (z[b] !== 0) trace += P[a][b];
      }
    }
    score[j] = -0.5 * (trace - quad);
  }
  let quadE = 0;
  for (let i = 0; i < n; i++) quadE += Py[i] * Py[i];
  let trP = 0;
  for (let i = 0; i < n; i++) trP += P[i][i];
  score[T] = -0.5 * (trP - quadE);

  const Pu = u.map(vec => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += P[i][k] * vec[k];
      out[i] = s;
    }
    return out;
  });

  const AI = [];
  for (let j = 0; j <= T; j++) {
    const row = new Array(T + 1);
    for (let k = 0; k <= T; k++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += u[j][i] * Pu[k][i];
      row[k] = 0.5 * s;
    }
    AI.push(row);
  }

  let inv;
  try {
    inv = matInverse(AI);
  } catch {
    return null;
  }
  // matInverse returns null on a singular matrix rather than throwing.
  if (!inv) return null;

  const next = new Array(T + 1);
  for (let j = 0; j <= T; j++) {
    let delta = 0;
    for (let k = 0; k <= T; k++) delta += inv[j][k] * score[k];
    next[j] = theta[j] + delta;
    if (!Number.isFinite(next[j])) return null;
  }
  return next;
}

/**
 * REML variance components: EM warm start, then AI-REML.
 *
 * Pure EM is monotone and stays non-negative but needs hundreds of iterations,
 * each costing an n x n inversion — unusable in a browser. AI-REML converges in
 * well under twenty iterations; whenever an AI step proposes a negative
 * component, this falls back to an EM step for that iteration, which keeps the
 * estimate admissible without giving up the speed in the normal case.
 *
 * Deterministic: fixed start (the ANOVA estimate, floored to a small positive
 * value), fixed tolerance, fixed budget.
 *
 * @param {{response: number[], factorValues: string[][],
 *          terms: Array<{id: string, factorIndices: number[]}>, start?: number[]}} input
 * @returns {{variances: number[], converged: boolean, iterations: number}}
 * @throws {Error} when the design exceeds REML_MAX_ROWS
 */
export function remlComponents({ response, factorValues, terms, start }) {
  if (response.length > REML_MAX_ROWS) {
    throw new Error(`remlComponents: row cap of ${REML_MAX_ROWS} exceeded`);
  }

  const ws = remlWorkspace({ response, factorValues, terms });
  const T = terms.length;

  let theta = start
    ? start.slice()
    : anovaComponents(anovaTable({ response, factorValues, terms })).variances.slice();

  // A component pinned at exactly zero can never move again — floor the start.
  let scale = 0;
  for (const v of theta) scale += v;
  const floor = Math.max(1e-6, (scale / (T + 1)) * 1e-4);
  theta = theta.map(v => (v > 0 ? v : floor));

  let converged = false;
  let iterations = 0;

  for (let iter = 1; iter <= REML_MAX_ITER; iter++) {
    iterations = iter;
    const prev = theta;

    if (iter <= REML_EM_WARMUP) {
      theta = emStep(ws, prev);
    } else {
      const proposal = aiStep(ws, prev);
      theta = (proposal && proposal.every(v => v > 0)) ? proposal : emStep(ws, prev);
    }

    let maxRel = 0;
    for (let j = 0; j <= T; j++) {
      const denom = Math.max(Math.abs(prev[j]), 1e-12);
      maxRel = Math.max(maxRel, Math.abs(theta[j] - prev[j]) / denom);
    }
    if (maxRel < REML_TOL) { converged = true; break; }
  }

  return { variances: theta.map(v => Math.max(0, v)), converged, iterations };
}

/**
 * Is every occupied cell of the finest term the same size, with no cell missing?
 *
 * @param {string[][]} factorValues
 * @param {number[]} allIndices
 * @returns {boolean}
 */
function isBalanced(factorValues, allIndices) {
  const { keys } = termCells(allIndices, factorValues);
  const counts = new Map();
  for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1);
  const sizes = [...counts.values()];
  if (!sizes.length) return false;
  if (sizes.some(s => s !== sizes[0])) return false;
  // No cell missing: the number of occupied cells must equal the full product.
  let product = 1;
  for (const idx of allIndices) product *= new Set(factorValues[idx]).size;
  return counts.size === product;
}

/**
 * Full variance decomposition — the engine's public entry point.
 *
 * @param {{response: number[], factorValues: string[][], factorNames: string[],
 *          modelForm: 'nested'|'crossed', estimator: 'anova'|'reml'}} input
 * @returns {object} see docs/superpowers/specs/2026-08-31-multi-vari-design.md
 */
export function computeVarianceComponents({
  response, factorValues, factorNames, modelForm, estimator,
}) {
  const warnings = [];
  let terms = buildTerms(modelForm, factorNames);
  const allIndices = factorNames.map((_, i) => i);
  const balanced = isBalanced(factorValues, allIndices);
  if (!balanced) warnings.push('unbalanced');

  // No replicates: the finest term has one observation per cell and cannot be
  // separated from the error. Drop it; it becomes the error term.
  let table = anovaTable({ response, factorValues, terms });
  if (table.error.df === 0 && terms.length > 1) {
    warnings.push('noReplicates');
    terms = terms.slice(0, -1);
    table = anovaTable({ response, factorValues, terms });
  }

  let usedEstimator = estimator;
  if (estimator === 'reml' && response.length > REML_MAX_ROWS) {
    warnings.push('rowCapExceeded');
    usedEstimator = 'anova';
  }

  let variances;
  let clamped;
  let converged = null;
  let iterations = null;

  if (usedEstimator === 'reml') {
    const r = remlComponents({ response, factorValues, terms });
    variances = r.variances;
    clamped = variances.map(() => false);
    converged = r.converged;
    iterations = r.iterations;
    if (!converged) warnings.push('notConverged');
  } else {
    const r = anovaComponents(table);
    variances = r.variances;
    clamped = r.clamped;
    if (clamped.some(Boolean)) warnings.push('negativeComponent');
  }

  const totalVariance = variances.reduce((a, v) => a + v, 0);
  const isAnova = usedEstimator === 'anova';
  const rows = [
    ...terms.map(t => ({ id: t.id, label: t.label })),
    { id: 'Error', label: 'Error' },
  ];

  const out = rows.map((row, i) => ({
    id: row.id,
    label: row.label,
    df: isAnova ? (i < terms.length ? table.rows[i].df : table.error.df) : null,
    ss: isAnova ? (i < terms.length ? table.rows[i].ss : table.error.ss) : null,
    ms: isAnova ? (i < terms.length ? table.rows[i].ms : table.error.ms) : null,
    variance: variances[i],
    sd: Math.sqrt(variances[i]),
    percent: totalVariance > 0 ? (variances[i] / totalVariance) * 100 : 0,
    clamped: clamped[i],
  }));

  return {
    modelForm,
    estimator: usedEstimator,
    balanced,
    n: response.length,
    terms: out,
    totalVariance,
    converged,
    iterations,
    warnings,
  };
}
