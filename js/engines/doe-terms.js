/**
 * D.Mike — DoE Model-Term API (doe-terms.js)
 *
 * Canonical term IDs and helpers for hierarchical model selection in
 * optimal experimental designs. The user can freely select which terms
 * the optimisation engine fits — main effects, quadratic terms, 2-way
 * and higher-order interactions — and the marginality principle is
 * enforced: activating a higher-order term automatically activates its
 * lower-order subterms; deactivating a low-order term deactivates all
 * higher-order superterms that contain it.
 *
 * Term ID grammar (canonical string form, used for storage):
 *   "M<i>"            — main effect for factor i (e.g. "M0" = A)
 *   "Q<i>"            — quadratic term for factor i (e.g. "Q0" = A²)
 *   "I<i>_<j>[_<k>…]" — interaction of factor indices (sorted ascending)
 *
 * The indices are 0-based factor positions. Factor labels (A, B, …) are
 * a display concern — keep them out of the canonical ID so renaming a
 * factor never breaks stored state.
 */

// ─── Term ID Construction & Parsing ───────────────────────────────

/** @typedef {'main'|'quad'|'ix'} TermKind */

/**
 * @typedef {object} Term
 * @property {TermKind} kind
 * @property {number[]} factors - Sorted ascending; length 1 for main/quad,
 *   ≥ 2 for ix.
 */

/**
 * Build a canonical term ID for a main effect.
 * @param {number} factorIdx
 * @returns {string}
 */
export function mainTermId(factorIdx) {
  return 'M' + factorIdx;
}

/**
 * Build a canonical term ID for a quadratic term.
 * @param {number} factorIdx
 * @returns {string}
 */
export function quadTermId(factorIdx) {
  return 'Q' + factorIdx;
}

/**
 * Build a canonical term ID for an interaction.
 * @param {number[]} factorIndices - Two or more distinct factor indices
 * @returns {string}
 */
export function interactionTermId(factorIndices) {
  if (!Array.isArray(factorIndices) || factorIndices.length < 2) {
    throw new Error('interactionTermId: need ≥ 2 factor indices');
  }
  const sorted = [...new Set(factorIndices)].sort((a, b) => a - b);
  return 'I' + sorted.join('_');
}

/**
 * Parse a canonical term ID back to its structured form.
 * @param {string} id
 * @returns {Term|null} null if the id is malformed
 */
export function parseTermId(id) {
  if (typeof id !== 'string' || id.length < 2) return null;
  const tag = id[0];
  const rest = id.slice(1);
  if (tag === 'M') {
    const i = parseInt(rest, 10);
    if (!Number.isFinite(i) || i < 0) return null;
    return { kind: 'main', factors: [i] };
  }
  if (tag === 'Q') {
    const i = parseInt(rest, 10);
    if (!Number.isFinite(i) || i < 0) return null;
    return { kind: 'quad', factors: [i] };
  }
  if (tag === 'I') {
    const parts = rest.split('_').map(s => parseInt(s, 10));
    if (parts.some(n => !Number.isFinite(n) || n < 0)) return null;
    if (parts.length < 2) return null;
    return { kind: 'ix', factors: [...new Set(parts)].sort((a, b) => a - b) };
  }
  return null;
}

/**
 * Order of a term — the number of factors involved (powers count as 1).
 *   Main / Quad → 1; 2-way → 2; 3-way → 3; …
 * @param {string} id
 * @returns {number}
 */
export function termOrder(id) {
  const t = parseTermId(id);
  if (!t) return 0;
  return t.factors.length;
}

/**
 * Display label for a term using factor names (A, B, C…).
 * @param {string} id
 * @param {string[]} [factorNames] - Optional names; falls back to A, B, C…
 * @returns {string}
 */
export function termDisplay(id, factorNames) {
  const t = parseTermId(id);
  if (!t) return id;
  const nameOf = (i) => factorNames?.[i] || String.fromCharCode(65 + i);
  if (t.kind === 'main') return nameOf(t.factors[0]);
  if (t.kind === 'quad') return nameOf(t.factors[0]) + '²';
  return t.factors.map(nameOf).join('·');
}

// ─── Enumeration ──────────────────────────────────────────────────

/**
 * Enumerate every binomial subset of {0, …, k-1} of the given size.
 * @param {number} k
 * @param {number} size
 * @returns {number[][]}
 */
function combinations(k, size) {
  const result = [];
  const combo = new Array(size);
  function rec(start, depth) {
    if (depth === size) { result.push([...combo]); return; }
    for (let i = start; i < k; i++) {
      combo[depth] = i;
      rec(i + 1, depth + 1);
    }
  }
  rec(0, 0);
  return result;
}

/**
 * Enumerate all candidate terms for `k` factors up to a given maximum
 * interaction order (default: full — interactions up to k-way).
 *
 * Returns them grouped by kind/order in the order the UI displays them:
 *   1. Main effects (order 1)
 *   2. Quadratic terms (order 1, but a separate group)
 *   3. 2-way interactions (order 2)
 *   4. 3-way interactions (order 3)
 *   …
 *
 * @param {number} k - Number of factors
 * @param {object} [opts]
 * @param {number} [opts.maxOrder] - Highest interaction order to include
 *   (defaults to k). Main effects and quadratic terms are always included.
 * @returns {{ kind: 'main'|'quad'|'ix', order: number, ids: string[] }[]}
 */
export function enumerateTerms(k, opts = {}) {
  const maxOrder = Math.min(opts.maxOrder ?? k, k);
  const groups = [];

  // Main effects
  groups.push({
    kind: 'main',
    order: 1,
    ids: Array.from({ length: k }, (_, i) => mainTermId(i)),
  });

  // Quadratic terms
  groups.push({
    kind: 'quad',
    order: 1,
    ids: Array.from({ length: k }, (_, i) => quadTermId(i)),
  });

  // Interactions of order 2 … maxOrder
  for (let order = 2; order <= maxOrder; order++) {
    const ids = combinations(k, order).map(c => interactionTermId(c));
    if (!ids.length) break;
    groups.push({ kind: 'ix', order, ids });
  }

  return groups;
}

// ─── Marginality ──────────────────────────────────────────────────

/**
 * Lower-order subterms required by `id` under the marginality principle.
 *
 *   Main effect       → no subterms
 *   Quadratic A²      → main effect A
 *   k-way interaction → all (k-1)-way down to 1-way subsets of its factors,
 *                       so AB·C activates AB, AC, BC, A, B, C
 *
 * Returns canonical term IDs (excluding `id` itself).
 *
 * @param {string} id
 * @returns {string[]}
 */
export function subterms(id) {
  const t = parseTermId(id);
  if (!t) return [];
  if (t.kind === 'main') return [];
  if (t.kind === 'quad') return [mainTermId(t.factors[0])];

  // Interaction: all proper, non-empty subsets of t.factors
  // → singletons become main effects, larger subsets become lower-order ix.
  const result = [];
  const n = t.factors.length;
  for (let size = 1; size < n; size++) {
    for (const subset of combinations(n, size)) {
      const sf = subset.map(i => t.factors[i]);
      result.push(size === 1 ? mainTermId(sf[0]) : interactionTermId(sf));
    }
  }
  return result;
}

/**
 * Return every term id in `pool` that requires `id` as a marginal
 * subterm. Used to cascade deactivation: if the user turns off a main
 * effect, all interactions and the quadratic term that depend on it must
 * follow.
 *
 * @param {string} id
 * @param {Iterable<string>} pool - Candidate ids to test
 * @returns {string[]}
 */
export function superterms(id, pool) {
  const t = parseTermId(id);
  if (!t) return [];
  const result = [];
  for (const candidate of pool) {
    if (candidate === id) continue;
    const c = parseTermId(candidate);
    if (!c) continue;

    // A main effect's superterms are: its own quadratic + every
    // interaction that contains its factor index.
    if (t.kind === 'main') {
      const fi = t.factors[0];
      if (c.kind === 'quad' && c.factors[0] === fi) result.push(candidate);
      else if (c.kind === 'ix' && c.factors.includes(fi)) result.push(candidate);
      continue;
    }

    // A quadratic term has no superterms (quadratics aren't ordered
    // under marginality the way interactions are — they're a side branch).
    if (t.kind === 'quad') continue;

    // An interaction's superterms are higher-order interactions that
    // include all of its factors as a subset.
    if (t.kind === 'ix' && c.kind === 'ix' && c.factors.length > t.factors.length) {
      if (t.factors.every(fi => c.factors.includes(fi))) result.push(candidate);
    }
  }
  return result;
}

/**
 * Activate a term and every subterm it requires.
 *
 * @param {Set<string>} active - Mutable; the active-term set to update
 * @param {string} id - Term to activate
 */
export function activateTerm(active, id) {
  active.add(id);
  for (const sub of subterms(id)) active.add(sub);
}

/**
 * Deactivate a term and every superterm that depends on it.
 *
 * @param {Set<string>} active - Mutable; the active-term set to update
 * @param {string} id - Term to deactivate
 */
export function deactivateTerm(active, id) {
  active.delete(id);
  for (const sup of superterms(id, active)) active.delete(sup);
}

/**
 * Sanity check: ensure `active` is closed under marginality, i.e. every
 * active term has all of its subterms active too. Returns a list of
 * missing subterms (empty if the set is already closed).
 *
 * Useful after loading legacy state to detect/fix non-hierarchical
 * selections.
 *
 * @param {Iterable<string>} active
 * @returns {string[]} Subterms that should be added to make `active` closed
 */
export function missingSubterms(active) {
  const set = new Set(active);
  const missing = [];
  for (const id of set) {
    for (const sub of subterms(id)) {
      if (!set.has(sub)) missing.push(sub);
    }
  }
  return [...new Set(missing)];
}

/**
 * Default starting selection: intercept + all main effects + all 2-way
 * interactions. Matches the historical behaviour (excludedInteractions
 * = [], quadratic = false) so designs without explicit term tweaking
 * keep producing the same matrix.
 *
 * @param {number} k
 * @returns {string[]}
 */
export function defaultActiveTerms(k) {
  const out = [];
  for (let i = 0; i < k; i++) out.push(mainTermId(i));
  for (let a = 0; a < k; a++) {
    for (let b = a + 1; b < k; b++) {
      out.push(interactionTermId([a, b]));
    }
  }
  return out;
}

/**
 * Migration helper: rebuild the canonical active-term list from the
 * pre-hierarchical option triple `{quadratic, excludedInteractions}` so
 * old saved projects upgrade transparently.
 *
 * @param {number} k - Factor count
 * @param {boolean} quadratic - Old "optimalQuadratic" flag
 * @param {Array<[number, number]>} [excludedInteractions] - Old exclusion list
 * @returns {string[]}
 */
export function termsFromLegacyOptions(k, quadratic, excludedInteractions) {
  const excluded = new Set();
  if (Array.isArray(excludedInteractions)) {
    for (const pair of excludedInteractions) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const a = Math.min(pair[0], pair[1]);
      const b = Math.max(pair[0], pair[1]);
      if (a === b || a < 0 || b >= k) continue;
      excluded.add(a + '_' + b);
    }
  }
  const out = [];
  for (let i = 0; i < k; i++) out.push(mainTermId(i));
  if (quadratic) for (let i = 0; i < k; i++) out.push(quadTermId(i));
  for (let a = 0; a < k; a++) {
    for (let b = a + 1; b < k; b++) {
      if (!excluded.has(a + '_' + b)) out.push(interactionTermId([a, b]));
    }
  }
  return out;
}

// ─── Model-Matrix Column Builder ──────────────────────────────────

/**
 * Produce the numeric column for a single term, given a coded design
 * row. Pure helper for buildModelMatrix-style consumers in the engines.
 *
 * @param {string} id - Canonical term id
 * @param {number[]} row - One coded design row (length ≥ max factor index)
 * @returns {number}
 */
export function termValue(id, row) {
  const t = parseTermId(id);
  if (!t) return 0;
  if (t.kind === 'main') return row[t.factors[0]];
  if (t.kind === 'quad') {
    const v = row[t.factors[0]];
    return v * v;
  }
  // ix: product across all participating factors
  let p = 1;
  for (const f of t.factors) p *= row[f];
  return p;
}

/**
 * Stable sort key for displaying / hashing a term list. Sort order:
 *   1. main effects (by factor index)
 *   2. quadratic terms (by factor index)
 *   3. interactions by order ascending, then by factor indices lexically
 *
 * @param {string} id
 * @returns {string}
 */
export function termSortKey(id) {
  const t = parseTermId(id);
  if (!t) return 'Z' + id;
  if (t.kind === 'main') return 'A' + String(t.factors[0]).padStart(4, '0');
  if (t.kind === 'quad') return 'B' + String(t.factors[0]).padStart(4, '0');
  const order = String(t.factors.length).padStart(2, '0');
  const idx = t.factors.map(f => String(f).padStart(4, '0')).join('_');
  return 'C' + order + '_' + idx;
}
