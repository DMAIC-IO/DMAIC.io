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
