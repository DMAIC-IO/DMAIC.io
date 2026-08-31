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
