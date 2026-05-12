/**
 * D.Mike — DoE Planner: Design Generation Engine (doe-planner-engine.js)
 *
 * Pure functions for generating experiment design matrices.
 * No DOM, no side effects — only math and arrays.
 *
 * Supported design types:
 *   - Full Factorial (2^k, general k-level)
 *   - Fractional Factorial 2^(k-p)
 *   - Plackett-Burman
 *   - Central Composite Design (CCD)
 *   - Box-Behnken
 *   - Taguchi Orthogonal Arrays (L4–L27)
 *   - D-Optimal (coordinate exchange, maximizes |X'X|)
 *   - A-Optimal (coordinate exchange, minimizes tr((X'X)⁻¹))
 *   - G-Optimal (coordinate exchange, minimizes max leverage)
 */

import { GENERATORS, PB_SEEDS, BOX_BEHNKEN, TAGUCHI } from '../modules/doe-planner/doe-planner-designs.js';
import {
  matTranspose, matMul, matInverse, matDeterminant,
  matTrace, buildModelMatrix,
} from './regression-engine.js';

// ─── Full Factorial ────────────────────────────────────────────────

/**
 * Generate a full 2^k factorial design (coded levels: -1 / +1).
 * @param {number} k - Number of factors
 * @returns {number[][]} Array of run rows, each row is coded levels
 */
export function fullFactorial2k(k) {
  const n = 1 << k;
  const runs = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < k; j++) {
      row.push((i >> (k - 1 - j)) & 1 ? 1 : -1);
    }
    runs.push(row);
  }
  return runs;
}

/**
 * Generate a general full factorial design for factors with arbitrary level counts.
 * Coded levels are evenly spaced from -1 to +1.
 * @param {number[]} levelCounts - Array of level counts per factor (e.g. [2, 3, 2])
 * @returns {number[][]} Array of run rows with coded levels
 */
export function fullFactorialGeneral(levelCounts) {
  const k = levelCounts.length;
  const totalRuns = levelCounts.reduce((p, c) => p * c, 1);
  const runs = [];

  for (let i = 0; i < totalRuns; i++) {
    const row = [];
    let remainder = i;
    for (let j = k - 1; j >= 0; j--) {
      const nLevels = levelCounts[j];
      const levelIdx = remainder % nLevels;
      remainder = Math.floor(remainder / nLevels);
      // Code levels evenly from -1 to +1
      const coded = nLevels === 1 ? 0 : -1 + (2 * levelIdx) / (nLevels - 1);
      row.unshift(coded);
    }
    runs.push(row);
  }
  return runs;
}

// ─── Fractional Factorial ──────────────────────────────────────────

/**
 * Look up generator columns for a fractional factorial design.
 * @param {number} k - Total number of factors
 * @param {number} p - Number of generators (aliased factors)
 * @param {number} base - Number of base factors (k - p)
 * @returns {number[][]} Generator column-index arrays
 */
function getGenerators(k, p, base) {
  const key = `${k}-${p}`;
  if (GENERATORS[key]) return GENERATORS[key];
  // Fallback: construct from highest-order interactions
  const gens = [];
  for (let g = 0; g < p; g++) {
    const cols = [];
    for (let c = 0; c < Math.min(base, 3); c++) {
      cols.push((c + g) % base);
    }
    gens.push([...new Set(cols)]);
  }
  return gens;
}

/**
 * Generate a fractional factorial 2^(k-p) design.
 * @param {number} k - Number of factors
 * @param {number} p - Number of generators
 * @returns {number[][]} Array of run rows (coded -1/+1)
 */
export function fractionalFactorial(k, p) {
  if (p === 0) return fullFactorial2k(k);
  const base = k - p;
  const baseRuns = fullFactorial2k(base);
  const gens = getGenerators(k, p, base);

  return baseRuns.map(row => {
    const full = [...row];
    for (let g = 0; g < p; g++) {
      let v = 1;
      gens[g].forEach(c => { v *= row[c]; });
      full.push(v);
    }
    return full;
  });
}

// ─── Plackett-Burman ───────────────────────────────────────────────

/**
 * Get the first row (seed) for a PB design of size n.
 * @param {number} n - Number of runs (must be multiple of 4)
 * @returns {number[]} Seed row of length n-1
 */
function pbFirstRow(n) {
  if (PB_SEEDS[n]) return PB_SEEDS[n];
  // Fallback: alternating pattern
  const row = [];
  for (let i = 0; i < n - 1; i++) {
    row.push(i % 2 === 0 ? 1 : -1);
  }
  return row;
}

/**
 * Generate a Plackett-Burman design.
 * @param {number} k - Number of factors
 * @returns {number[][]} Array of run rows (coded -1/+1)
 */
export function plackettBurman(k) {
  let n = Math.ceil((k + 1) / 4) * 4;
  if (n <= k) n += 4;
  const first = pbFirstRow(n);
  const runs = [];

  for (let i = 0; i < n - 1; i++) {
    const row = [];
    for (let j = 0; j < k; j++) {
      row.push(first[(i + j) % (n - 1)]);
    }
    runs.push(row);
  }
  // Add the all-low row
  runs.push(Array(k).fill(-1));
  return runs;
}

// ─── Central Composite Design (CCD) ───────────────────────────────

/**
 * Compute the alpha (star point distance) for a CCD.
 * @param {number} k - Number of factors
 * @param {'rotatable'|'face-centered'|'spherical'} type - Alpha type
 * @returns {number}
 */
export function ccdAlpha(k, type = 'rotatable') {
  switch (type) {
    case 'face-centered': return 1;
    case 'spherical':     return Math.sqrt(k);
    case 'rotatable':
    default:              return Math.pow(1 << k, 0.25);
  }
}

/**
 * Generate a Central Composite Design.
 * @param {number} k - Number of factors
 * @param {object} [opts]
 * @param {'rotatable'|'face-centered'|'spherical'} [opts.alphaType='rotatable']
 * @param {number} [opts.centerPoints=3] - Number of center points
 * @returns {number[][]} Array of run rows (coded)
 */
export function centralComposite(k, opts = {}) {
  const alphaType = opts.alphaType || 'rotatable';
  const nCenter = opts.centerPoints ?? 3;
  const alpha = ccdAlpha(k, alphaType);

  // Factorial part
  const fact = fullFactorial2k(k);

  // Star (axial) points
  const star = [];
  for (let i = 0; i < k; i++) {
    const lo = Array(k).fill(0); lo[i] = -alpha;
    const hi = Array(k).fill(0); hi[i] = alpha;
    star.push(lo, hi);
  }

  // Center points
  const center = Array.from({ length: nCenter }, () => Array(k).fill(0));

  return [...fact, ...star, ...center];
}

// ─── Box-Behnken Design ──────────────────────────────────────────────

/**
 * Generate a Box-Behnken design.
 * Uses pair templates from BOX_BEHNKEN: for each pair (i,j), generates
 * a 2^2 factorial in those two factors with all others at center (0).
 * @param {number} k - Number of factors (3–7)
 * @param {object} [opts]
 * @param {number} [opts.centerPoints=3] - Number of center points
 * @returns {number[][]} Array of run rows (coded -1/0/+1)
 */
export function boxBehnken(k, opts = {}) {
  const nCenter = opts.centerPoints ?? 3;
  const pairs = BOX_BEHNKEN[k];
  if (!pairs) throw new Error(`Box-Behnken not available for k=${k} (supported: 3–7)`);

  const runs = [];
  // For each pair, generate 4 corner combinations
  for (const [i, j] of pairs) {
    for (const vi of [-1, 1]) {
      for (const vj of [-1, 1]) {
        const row = Array(k).fill(0);
        row[i] = vi;
        row[j] = vj;
        runs.push(row);
      }
    }
  }

  // Center points
  for (let c = 0; c < nCenter; c++) {
    runs.push(Array(k).fill(0));
  }

  return runs;
}

// ─── Mixed-kind RSM wrapper ─────────────────────────────────────────

/**
 * Cross a continuous-only RSM design (CCD, Box-Behnken) with the cartesian
 * product of categorical factor levels.
 *
 * Mathematically: for every categorical-level combination, run a full copy of
 * the continuous RSM design and slot the categorical level codes into the
 * categorical columns. The continuous slots keep their RSM values (corner,
 * axial, center). Categorical slots use evenly-spaced coded values
 * −1, …, +1 (matching `categoricalCoding` in the worksheet column meta).
 *
 * @param {number[][]} contMatrix - coded design over continuous factors only
 * @param {Factor[]} factors      - full factor list (mix of kinds)
 * @returns {number[][]} coded matrix over all factors
 */
function crossContinuousWithCategorical(contMatrix, factors) {
  const contIdx = factors.map((f, i) => f.kind === 'categorical' ? -1 : i).filter(i => i >= 0);
  const catIdx  = factors.map((f, i) => f.kind === 'categorical' ?  i : -1).filter(i => i >= 0);
  const k = factors.length;

  // Cartesian product of categorical-level coded vectors.
  const codedLevelsPerCatFactor = catIdx.map(i => {
    const n = factors[i].levels.length;
    if (n < 2) return [0];
    return Array.from({ length: n }, (_, j) => -1 + (2 * j) / (n - 1));
  });
  const catCombos = codedLevelsPerCatFactor.reduce((acc, levels) => {
    const next = [];
    for (const partial of acc) for (const lv of levels) next.push([...partial, lv]);
    return next;
  }, [[]]);

  const out = [];
  for (const combo of catCombos) {
    for (const contRow of contMatrix) {
      const row = new Array(k);
      contIdx.forEach((idx, c) => { row[idx] = contRow[c]; });
      catIdx.forEach((idx, c)  => { row[idx] = combo[c]; });
      out.push(row);
    }
  }
  return out;
}

// ─── Taguchi Orthogonal Array ────────────────────────────────────────

/**
 * Per-column level count for a Taguchi OA. Uniform OAs synthesise a flat
 * array; mixed-level OAs (e.g. L18 = 2¹·3⁷) carry an explicit `levelStructure`.
 */
function oaLevelStructure(oa) {
  if (Array.isArray(oa.levelStructure)) return oa.levelStructure;
  return new Array(oa.maxFactors).fill(oa.levels);
}

/**
 * Coded value for a 0-indexed level cell in a column with `nLevels` levels.
 *   nLevels === 2 → 0 → -1, 1 → +1
 *   nLevels === 3 → 0 → -1, 1 → 0, 2 → +1
 *   general       → evenly-spaced -1 … +1
 */
function codeTaguchiCell(v, nLevels) {
  if (nLevels === 2) return v === 0 ? -1 : 1;
  if (nLevels === 3) return v - 1;
  if (nLevels <= 1) return 0;
  return -1 + (2 * v) / (nLevels - 1);
}

/**
 * Match user-supplied factor level counts to OA columns of matching level
 * counts. Each factor consumes the next available column with its level
 * count; throws if no such assignment exists.
 *
 * @param {number[]} factorLevelCounts - per-factor level count, in user order
 * @param {number[]} oaLevelStruct - per-column level count of the OA
 * @returns {number[]} for each factor, the OA column index it occupies
 */
function assignFactorsToOAColumns(factorLevelCounts, oaLevelStruct) {
  const used = new Array(oaLevelStruct.length).fill(false);
  const cols = [];
  for (const need of factorLevelCounts) {
    let pick = -1;
    for (let c = 0; c < oaLevelStruct.length; c++) {
      if (!used[c] && oaLevelStruct[c] === need) { pick = c; break; }
    }
    if (pick < 0) {
      throw new Error(`No remaining OA column with ${need} levels for factor`);
    }
    used[pick] = true;
    cols.push(pick);
  }
  return cols;
}

/**
 * List Taguchi orthogonal arrays compatible with the given factor structure.
 *
 * For uniform-level factors: the OA's `levels` must match and have enough
 * columns. For mixed factors: the OA's `levelStructure` must host every
 * factor's level count (one column per factor, each matching the count).
 * The result is sorted ascending by run count.
 *
 * @param {number[]} factorLevelCounts - per-factor level counts
 * @returns {Array<{name: string, runs: number, maxFactors: number, levels: number|'mixed'}>}
 */
export function taguchiCandidates(factorLevelCounts) {
  if (!Array.isArray(factorLevelCounts) || factorLevelCounts.length === 0) return [];
  const sameLevels = factorLevelCounts.every(n => n === factorLevelCounts[0]);
  return Object.values(TAGUCHI)
    .filter(oa => {
      if (sameLevels && typeof oa.levels === 'number' && oa.levels === factorLevelCounts[0]) {
        return oa.maxFactors >= factorLevelCounts.length;
      }
      // Either mixed factors, or a mixed-level OA — try the assignment.
      try {
        assignFactorsToOAColumns(factorLevelCounts, oaLevelStructure(oa));
        return true;
      } catch {
        return false;
      }
    })
    .map(oa => ({ name: oa.name, runs: oa.runs, maxFactors: oa.maxFactors, levels: oa.levels }))
    .sort((a, b) => a.runs - b.runs);
}

/**
 * Select the best-fitting Taguchi OA for the given factor structure.
 *
 * For uniform-level factors (all 2-level or all 3-level), this picks the
 * smallest matching OA. For mixed factors (2-level + 3-level mix), it
 * selects an OA whose `levelStructure` covers the user's level counts
 * (currently L18 for ≤ 1 two-level + ≤ 7 three-level; L36 will join the
 * roster when it is added).
 *
 * @param {number[] | number} factorLevelsOrCount - per-factor level counts
 *   array, or a legacy uniform `nLevels` number paired with a separate `k`.
 * @param {number} [k] - factor count (legacy uniform calls only)
 * @param {string} [arrayName] - explicit OA name; auto-selected if omitted
 * @returns {{ name: string, matrix: number[][], columnAssignment: number[] }}
 *   The OA matrix trimmed to the user's columns (in user-factor order) and
 *   the original-column indices each factor was assigned to.
 */
export function selectTaguchiArray(arg1, arg2, arg3) {
  // Normalise to factorLevelCounts. Two call conventions are supported:
  //   New:    selectTaguchiArray([3, 3, 2], arrayName?)
  //   Legacy: selectTaguchiArray(k, nLevels, arrayName?)  // uniform-level shorthand
  let factorLevelCounts, arrayName;
  if (Array.isArray(arg1)) {
    factorLevelCounts = arg1;
    arrayName = typeof arg2 === 'string' ? arg2 : arg3;
  } else {
    factorLevelCounts = new Array(arg1).fill(arg2);
    arrayName = arg3;
  }
  const kFactors = factorLevelCounts.length;
  const sameLevels = factorLevelCounts.every(n => n === factorLevelCounts[0]);

  // Explicit array requested.
  if (arrayName && TAGUCHI[arrayName]) {
    const oa = TAGUCHI[arrayName];
    const struct = oaLevelStructure(oa);
    const cols = assignFactorsToOAColumns(factorLevelCounts, struct);
    const matrix = oa.matrix.map(row => cols.map(c => row[c]));
    return { name: oa.name, matrix, columnAssignment: cols };
  }

  // Auto-select. Two regimes:
  //   - Uniform: pick smallest OA whose `levels` matches and has enough columns.
  //   - Mixed:   pick smallest OA whose levelStructure can host every factor.
  let candidates;
  if (sameLevels) {
    candidates = Object.values(TAGUCHI)
      .filter(oa => oa.levels === factorLevelCounts[0] && oa.maxFactors >= kFactors)
      .sort((a, b) => a.runs - b.runs);
  } else {
    candidates = Object.values(TAGUCHI)
      .filter(oa => {
        const struct = oaLevelStructure(oa);
        try {
          assignFactorsToOAColumns(factorLevelCounts, struct);
          return true;
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.runs - b.runs);
  }

  if (candidates.length === 0) {
    throw new Error(`No Taguchi OA found for level counts [${factorLevelCounts.join(', ')}]`);
  }
  const best = candidates[0];
  const struct = oaLevelStructure(best);
  const cols = assignFactorsToOAColumns(factorLevelCounts, struct);
  const matrix = best.matrix.map(row => cols.map(c => row[c]));
  return { name: best.name, matrix, columnAssignment: cols };
}

/**
 * Generate a Taguchi design matrix in coded form. Each factor's column is
 * encoded according to its own level count (matched to the OA via
 * `selectTaguchiArray`). Mixed-level arrays (e.g. L18 = 2¹·3⁷) carry a
 * per-factor coding so the regression downstream sees ±1 for binary
 * factors and -1/0/+1 for three-level factors in the same row.
 *
 * @param {number[]|number} factorLevelsOrCount - either a per-factor level
 *   count array or a legacy uniform `nLevels` number.
 * @param {number} [k] - factor count (legacy uniform calls only)
 * @param {string} [arrayName] - explicit OA name
 * @returns {{ codedMatrix: number[][], arrayName: string }}
 */
export function taguchiDesign(arg1, arg2, arg3) {
  // Two call conventions:
  //   New:    taguchiDesign([3, 3, 2], arrayName?)
  //   Legacy: taguchiDesign(k, nLevels, arrayName?)
  let factorLevelCounts, arrayName;
  if (Array.isArray(arg1)) {
    factorLevelCounts = arg1;
    arrayName = typeof arg2 === 'string' ? arg2 : arg3;
  } else {
    factorLevelCounts = new Array(arg1).fill(arg2);
    arrayName = arg3;
  }
  const { name, matrix } = selectTaguchiArray(factorLevelCounts, arrayName);
  const coded = matrix.map(row => row.map((v, j) => codeTaguchiCell(v, factorLevelCounts[j])));
  return { codedMatrix: coded, arrayName: name };
}

// ─── Optimal Designs (Coordinate Exchange) ────────────────────────

/**
 * Candidate levels for coordinate exchange.
 *
 * Coordinate exchange is only used for second-order (quadratic) models
 * where interior points between factor levels are needed.  The 5-level
 * grid [-1, -0.5, 0, 0.5, 1] gives the algorithm enough freedom to
 * express the differences between D-, A-, and G-optimality.
 *
 * First-order models (with or without multi-level factors) use point
 * exchange on the actual factorial candidate set instead.
 *
 * @param {boolean} quadratic - true for second-order models
 * @returns {number[]}
 */
function candidateLevels(quadratic) {
  return quadratic ? [-1, -0.5, 0, 0.5, 1] : [-1, 1];
}

/**
 * Simple LCG PRNG for reproducible random numbers.
 * @param {number} seed
 * @returns {() => number} Random function returning [0, 1)
 */
function lcgRng(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

/**
 * Generate a random starting design for coordinate exchange.
 * @param {number} n - Number of runs
 * @param {number} k - Number of factors
 * @param {number[][]} levelsPerFactor - Candidate levels for each factor
 *   (length k; entry j lists the valid coded values for factor j)
 * @param {() => number} rng - Random number generator
 * @returns {number[][]}
 */
function randomStartDesign(n, k, levelsPerFactor, rng) {
  return Array.from({ length: n }, () =>
    Array.from({ length: k }, (_, j) => {
      const lv = levelsPerFactor[j];
      return lv[Math.floor(rng() * lv.length)];
    })
  );
}

/**
 * Compute D-criterion: det(X'X) for a coded design matrix.
 * @param {number[][]} coded - n×k coded design
 * @param {Array<[number, number]>} [excluded] - 2FI pairs to omit from the model
 * @returns {number}
 */
function dCriterion(coded, excluded) {
  const { X } = buildModelMatrix(coded, { interactions: true, excludedInteractions: excluded });
  const Xt = matTranspose(X);
  const XtX = matMul(Xt, X);
  return matDeterminant(XtX);
}

/**
 * Compute A-criterion: tr((X'X)⁻¹) for a coded design matrix.
 * Lower is better, so we return -trace for maximization.
 * @param {number[][]} coded
 * @param {Array<[number, number]>} [excluded] - 2FI pairs to omit from the model
 * @returns {number}
 */
function aCriterion(coded, excluded) {
  const { X } = buildModelMatrix(coded, { interactions: true, excludedInteractions: excluded });
  const Xt = matTranspose(X);
  const XtX = matMul(Xt, X);
  const inv = matInverse(XtX);
  if (!inv) return -Infinity;
  return -matTrace(inv);
}

/**
 * Compute G-criterion: max leverage h_ii.
 * Lower is better, so we return -maxLev for maximization.
 * @param {number[][]} coded
 * @param {Array<[number, number]>} [excluded] - 2FI pairs to omit from the model
 * @returns {number}
 */
function gCriterion(coded, excluded) {
  const { X } = buildModelMatrix(coded, { interactions: true, excludedInteractions: excluded });
  const n = X.length;
  const p = X[0].length;
  const Xt = matTranspose(X);
  const XtX = matMul(Xt, X);
  const inv = matInverse(XtX);
  if (!inv) return -Infinity;

  let maxLev = 0;
  for (let i = 0; i < n; i++) {
    let h = 0;
    for (let a = 0; a < p; a++) {
      for (let b = 0; b < p; b++) {
        h += X[i][a] * inv[a][b] * X[i][b];
      }
    }
    if (h > maxLev) maxLev = h;
  }
  return -maxLev;
}

/**
 * Point-exchange algorithm (Fedorov-type) for optimal designs.
 *
 * Selects the best n-row subset from a finite candidate set.
 * Works for any candidate set: 2^k vertices, general full factorial,
 * or any custom set.  Row-level swaps escape local optima that
 * coordinate-level flips cannot.
 *
 * @param {number} k - Number of factors
 * @param {number} nRuns - Desired number of runs (must be ≤ candidate count)
 * @param {(coded: number[][]) => number} criterion - Criterion function (higher = better)
 * @param {object} [opts]
 * @param {number[][]} [opts.candidates] - Candidate set (default: fullFactorial2k)
 * @param {number} [opts.maxIter=50] - Maximum exchange iterations
 * @param {number} [opts.nStarts=10] - Number of random restarts
 * @param {number} [opts.seed] - Seed for reproducibility
 * @returns {number[][]} Best coded design matrix found
 */
function pointExchange(k, nRuns, criterion, opts = {}) {
  const maxIter = opts.maxIter ?? 50;
  const nStarts = opts.nStarts ?? 10;
  const baseSeed = opts.seed ?? Date.now();

  const candidates = opts.candidates || fullFactorial2k(k);
  const nCand = candidates.length;

  let bestDesign = null;
  let bestVal = -Infinity;

  for (let start = 0; start < nStarts; start++) {
    const rng = lcgRng(baseSeed + start * 7919);

    // Random starting subset (Fisher-Yates on indices, take first nRuns)
    const allIdx = Array.from({ length: nCand }, (_, i) => i);
    for (let i = nCand - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [allIdx[i], allIdx[j]] = [allIdx[j], allIdx[i]];
    }
    const designIdx = allIdx.slice(0, nRuns);
    const inDesign = new Set(designIdx);
    let design = designIdx.map(i => [...candidates[i]]);
    let val = criterion(design);

    for (let iter = 0; iter < maxIter; iter++) {
      let improved = false;

      for (let di = 0; di < nRuns; di++) {
        const currentIdx = designIdx[di];
        let bestCi = -1;
        let bestSwapVal = val;

        // Evaluate ALL candidates, keep the best swap (not first improvement)
        for (let ci = 0; ci < nCand; ci++) {
          if (inDesign.has(ci)) continue;

          design[di] = [...candidates[ci]];
          const newVal = criterion(design);

          if (newVal > bestSwapVal) {
            bestSwapVal = newVal;
            bestCi = ci;
          }
        }

        if (bestCi >= 0) {
          design[di] = [...candidates[bestCi]];
          val = bestSwapVal;
          inDesign.delete(currentIdx);
          inDesign.add(bestCi);
          designIdx[di] = bestCi;
          improved = true;
        } else {
          design[di] = [...candidates[currentIdx]];
        }
      }

      if (!improved) break;
    }

    if (val > bestVal || bestDesign === null) {
      bestVal = val;
      bestDesign = design.map(row => [...row]);
    }
  }

  return bestDesign;
}

/**
 * Coordinate-exchange algorithm for optimal design generation.
 *
 * Best suited for second-order models where interior points (between
 * factor levels) are needed.  For discrete candidate sets, prefer
 * pointExchange() which uses row-level swaps.
 *
 * @param {number} k - Number of factors
 * @param {number} nRuns - Desired number of runs
 * @param {(coded: number[][]) => number} criterion - Criterion function (higher = better)
 * @param {object} [opts]
 * @param {number} [opts.maxIter=20] - Maximum exchange iterations
 * @param {number} [opts.nStarts=10] - Number of random restarts
 * @param {number} [opts.seed] - Seed for reproducibility
 * @returns {number[][]} Best coded design matrix found
 */
function coordinateExchange(k, nRuns, criterion, opts = {}) {
  const maxIter = opts.maxIter ?? 20;
  const nStarts = opts.nStarts ?? 10;
  // Per-factor candidate levels. Default: the same 5-level grid for every
  // factor (the historical behaviour). Callers that mix factor kinds pass a
  // per-factor list so categorical columns stay on their discrete level set.
  const defaultLevels = candidateLevels(true);
  const levelsPerFactor = opts.levelsPerFactor
    ?? Array.from({ length: k }, () => defaultLevels);
  const baseSeed = opts.seed ?? Date.now();

  let bestDesign = null;
  let bestVal = -Infinity;

  for (let start = 0; start < nStarts; start++) {
    const rng = lcgRng(baseSeed + start * 7919);
    let design = randomStartDesign(nRuns, k, levelsPerFactor, rng);
    let val = criterion(design);

    for (let iter = 0; iter < maxIter; iter++) {
      let improved = false;

      for (let i = 0; i < nRuns; i++) {
        for (let j = 0; j < k; j++) {
          const original = design[i][j];

          for (const lv of levelsPerFactor[j]) {
            if (lv === original) continue;
            design[i][j] = lv;
            const newVal = criterion(design);
            if (newVal > val) {
              val = newVal;
              improved = true;
            } else {
              design[i][j] = original;
            }
          }
        }
      }

      if (!improved) break;
    }

    if (val > bestVal || bestDesign === null) {
      bestVal = val;
      bestDesign = design.map(row => [...row]);
    }
  }

  return bestDesign;
}

/**
 * Dispatch to the appropriate exchange algorithm based on model type.
 *
 * - Pure 2-level, first-order → point exchange on 2^k vertices
 * - Multi-level, first-order → point exchange on the general factorial
 *   candidate set (respects actual level counts per factor)
 * - Quadratic (second-order) → coordinate exchange with 5-level grid
 *
 * @param {number} k - Number of factors
 * @param {number} nRuns - Desired number of runs
 * @param {(coded: number[][]) => number} criterion - Criterion function
 * @param {object} [opts]
 * @param {boolean} [opts.quadratic=false] - Second-order model
 * @param {number[]} [opts.levelCounts] - Level count per factor (e.g. [3, 3, 2, 2])
 * @param {number} [opts.seed]
 * @returns {number[][]}
 */
function optimalDesign(k, nRuns, criterion, opts = {}) {
  const quadratic = opts.quadratic ?? false;
  const levelCounts = opts.levelCounts;
  const categoricalFlags = opts.categoricalFlags;
  const excluded = opts.excludedInteractions;

  // Wrap the criterion so the exchange algorithms can keep their (coded) → number signature
  // while we still pass the excluded-interactions list down to buildModelMatrix.
  const wrapped = (coded) => criterion(coded, excluded);

  // Per-factor candidate levels for coordinate exchange. Continuous factors
  // get the dense 5-level grid (so the optimiser can explore interior points
  // for the quadratic terms). Categorical factors are restricted to their
  // discrete level set — fractional values would be meaningless.
  const buildLevelsPerFactor = () => Array.from({ length: k }, (_, j) => {
    const isCategorical = !!categoricalFlags?.[j];
    if (isCategorical) {
      const n = levelCounts?.[j] ?? 2;
      if (n <= 1) return [0];
      return Array.from({ length: n }, (_, i) => -1 + (2 * i) / (n - 1));
    }
    return candidateLevels(quadratic);
  });

  if (quadratic) {
    return coordinateExchange(k, nRuns, wrapped, {
      ...opts,
      levelsPerFactor: buildLevelsPerFactor(),
    });
  }

  // Build candidate set from factor level counts
  let candidates;
  if (levelCounts && levelCounts.some(l => l > 2)) {
    candidates = fullFactorialGeneral(levelCounts);
  } else {
    candidates = fullFactorial2k(k);
  }

  if (nRuns <= candidates.length) {
    return pointExchange(k, nRuns, wrapped, { ...opts, candidates });
  }

  return coordinateExchange(k, nRuns, wrapped, {
    ...opts,
    levelsPerFactor: buildLevelsPerFactor(),
  });
}

/**
 * Generate a D-optimal design (maximizes |X'X|).
 * @param {number} k - Number of factors
 * @param {number} nRuns - Desired number of runs
 * @param {object} [opts] - Options (quadratic, maxIter, nStarts, seed)
 * @returns {number[][]} Coded design matrix
 */
export function dOptimalDesign(k, nRuns, opts = {}) {
  return optimalDesign(k, nRuns, dCriterion, opts);
}

/**
 * Generate an A-optimal design (minimizes tr((X'X)⁻¹)).
 * @param {number} k - Number of factors
 * @param {number} nRuns - Desired number of runs
 * @param {object} [opts] - Options (quadratic, maxIter, nStarts, seed)
 * @returns {number[][]} Coded design matrix
 */
export function aOptimalDesign(k, nRuns, opts = {}) {
  return optimalDesign(k, nRuns, aCriterion, opts);
}

/**
 * Generate a G-optimal design (minimizes max prediction variance).
 * @param {number} k - Number of factors
 * @param {number} nRuns - Desired number of runs
 * @param {object} [opts] - Options (quadratic, maxIter, nStarts, seed)
 * @returns {number[][]} Coded design matrix
 */
export function gOptimalDesign(k, nRuns, opts = {}) {
  return optimalDesign(k, nRuns, gCriterion, opts);
}

/**
 * Compute the minimum number of runs required for a model with k factors.
 * For main effects + 2FI: p = 1 + k + k*(k-1)/2 − |excluded|
 * @param {number} k - Number of factors
 * @param {boolean} [quadratic=false] - Include squared terms
 * @param {Array<[number, number]>} [excludedInteractions] - 2FI pairs to omit
 * @returns {number}
 */
export function minRunsForModel(k, quadratic = false, excludedInteractions) {
  const allPairs = k * (k - 1) / 2;
  let excludedCount = 0;
  if (Array.isArray(excludedInteractions)) {
    const seen = new Set();
    for (const pair of excludedInteractions) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const a = Math.min(pair[0], pair[1]);
      const b = Math.max(pair[0], pair[1]);
      if (a === b || a < 0 || b >= k) continue;
      const key = a + '_' + b;
      if (!seen.has(key)) { seen.add(key); excludedCount++; }
    }
  }
  let p = 1 + k + (allPairs - excludedCount);
  if (quadratic) p += k;
  return p;
}

// ─── Deterministic Seed ───────────────────────────────────────────

/**
 * Derive a deterministic integer seed from the design configuration so that
 * identical inputs always produce identical designs.
 * @param {Factor[]} factors
 * @param {object} opts
 * @returns {number}
 */
function deterministicSeed(factors, opts) {
  let h = 0x811c9dc5; // FNV-1a offset basis (32-bit)
  const feed = (n) => { h ^= n & 0xff; h = Math.imul(h, 0x01000193); };
  const feedStr = (s) => { for (let i = 0; i < s.length; i++) feed(s.charCodeAt(i)); };

  feed(factors.length);
  for (const f of factors) {
    feedStr(f.name);
    feed(f.levels.length);
    for (const lv of f.levels) feedStr(String(lv));
  }
  feedStr(opts.designType || '');
  feed(opts.optimalRuns || 0);
  feed(opts.optimalQuadratic ? 1 : 0);
  if (Array.isArray(opts.optimalExcludedInteractions)) {
    // Sort canonically so [[0,1],[2,3]] and [[3,2],[1,0]] hash the same
    const normalized = opts.optimalExcludedInteractions
      .filter(p => Array.isArray(p) && p.length === 2)
      .map(p => [Math.min(p[0], p[1]), Math.max(p[0], p[1])])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    feed(normalized.length);
    for (const [a, b] of normalized) { feed(a); feed(b); }
  }
  feed(opts.replicates || 1);
  feed(opts.centerPoints ? 1 : 0);
  feed(opts.ccdCenterPoints || 3);
  feed(opts.bbCenterPoints || 3);
  feedStr(opts.alphaType || '');
  feedStr(opts.taguchiArray || '');
  feed(opts.selectedRes?.p || 0);
  feed(opts.selectedRes?.runs || 0);

  return h >>> 0;
}

// ─── Post-Processing ───────────────────────────────────────────────

/**
 * Add center points to a design matrix.
 * @param {number[][]} matrix - Coded design matrix
 * @param {number} count - Number of center points to add
 * @returns {number[][]} Extended matrix (new array, original unchanged)
 */
export function addCenterPoints(matrix, count) {
  if (count <= 0 || matrix.length === 0) return [...matrix];
  const k = matrix[0].length;
  const centers = Array.from({ length: count }, () => Array(k).fill(0));
  return [...matrix, ...centers];
}

/**
 * Randomize run order using Fisher-Yates shuffle.
 * @param {number[][]} matrix - Design matrix
 * @param {number} [seed] - Optional seed for reproducibility (simple LCG)
 * @returns {number[][]} Shuffled copy (original unchanged)
 */
export function randomizeDesign(matrix, seed) {
  const result = matrix.map(row => [...row]);
  let rng;
  if (seed != null) {
    // Simple LCG for reproducibility
    let s = seed;
    rng = () => {
      s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
      return (s >>> 0) / 0xFFFFFFFF;
    };
  } else {
    rng = Math.random;
  }

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── Coded → Actual Value Conversion ───────────────────────────────

/**
 * Convert a coded level to a real-world value.
 * @param {number} coded - Coded value (e.g. -1, 0, +1, ±alpha)
 * @param {number} lo - Low level (real)
 * @param {number} hi - High level (real)
 * @returns {number} Actual value
 */
export function codedToActual(coded, lo, hi) {
  const mid = (lo + hi) / 2;
  const half = (hi - lo) / 2;
  return mid + coded * half;
}

/**
 * Format an actual value to a reasonable number of decimals.
 * @param {number} value
 * @param {number} [decimals=2]
 * @returns {string}
 */
export function formatValue(value, decimals = 2) {
  return Number(value.toFixed(decimals));
}

// ─── Design Generation Facade ──────────────────────────────────────

/**
 * @typedef {object} Factor
 * @property {number} id
 * @property {string} name
 * @property {string} unit
 * @property {string[]} levels - At least 2 values (lo, hi, optionally intermediate)
 */

/**
 * @typedef {object} DesignResult
 * @property {number[][]} codedMatrix - Coded design matrix (-1/+1 or CCD values)
 * @property {number[][]} actualMatrix - Real-value design matrix
 * @property {number[]} stdOrder - Standard order indices (1-based)
 * @property {number[]} runOrder - Run order indices (1-based, possibly randomized)
 * @property {number[]} replicateIds - Replicate number for each run (1-based)
 * @property {string} resolution - Resolution label (e.g. 'Full', 'IV', 'III', 'CCD')
 * @property {number} p - Number of generators (for fractional)
 * @property {string} designType - Design type key
 */

/**
 * Generate a complete design from factors and options.
 * @param {Factor[]} factors
 * @param {object} opts
 * @param {'full'|'frac'|'pb'|'ccd'|'bb'|'taguchi'|'dopt'|'aopt'|'gopt'} opts.designType
 * @param {{ k: number, runs: number, res: string, p: number }|null} [opts.selectedRes]
 * @param {boolean} [opts.randomize=true]
 * @param {boolean} [opts.centerPoints=false]
 * @param {number} [opts.replicates=1] - Number of full replicates (1 = no replication)
 * @param {'rotatable'|'face-centered'|'spherical'} [opts.alphaType='rotatable']
 * @param {number} [opts.ccdCenterPoints=3]
 * @param {number} [opts.bbCenterPoints=3] - Center points for Box-Behnken
 * @param {string} [opts.taguchiArray] - Explicit Taguchi OA name (e.g. 'L8')
 * @param {number} [opts.optimalRuns] - Number of runs for optimal designs
 * @param {boolean} [opts.optimalQuadratic=false] - Include quadratic terms for optimal designs
 * @param {number} [opts.seed]
 * @returns {DesignResult}
 */
export function generateDesign(factors, opts) {
  const k = factors.length;
  let coded;
  let resLabel = '';
  let p = 0;

  // Deterministic seed derived from design parameters so identical inputs
  // always produce identical outputs.  Uses a simple hash: the seed only
  // needs to be "different enough" across configs, not cryptographic.
  const seed = opts.seed ?? deterministicSeed(factors, opts);

  switch (opts.designType) {
    case 'full': {
      // Check if all factors have exactly 2 levels → classic 2^k
      const allTwo = factors.every(f => f.levels.length === 2);
      if (allTwo) {
        coded = fullFactorial2k(k);
      } else {
        coded = fullFactorialGeneral(factors.map(f => f.levels.length));
      }
      resLabel = 'Full';
      break;
    }

    case 'frac': {
      if (!opts.selectedRes) throw new Error('No resolution selected');
      p = opts.selectedRes.p;
      coded = opts.selectedRes.res === 'Full'
        ? fullFactorial2k(k)
        : fractionalFactorial(k, p);
      resLabel = opts.selectedRes.res;
      break;
    }

    case 'pb': {
      coded = plackettBurman(k);
      resLabel = 'III';
      break;
    }

    case 'ccd': {
      // For mixed CCD: run the RSM portion only on continuous factors and
      // cartesian-product with the categorical levels. Pure-continuous case
      // falls through to the original generator unchanged.
      const contFactors = factors.filter(f => f.kind !== 'categorical');
      const hasCategorical = contFactors.length !== k;
      if (hasCategorical) {
        if (contFactors.length < 2) {
          throw new Error('CCD with categorical factors requires at least 2 continuous factors');
        }
        const contMatrix = centralComposite(contFactors.length, {
          alphaType: opts.alphaType || 'rotatable',
          centerPoints: opts.ccdCenterPoints ?? 3,
        });
        coded = crossContinuousWithCategorical(contMatrix, factors);
      } else {
        coded = centralComposite(k, {
          alphaType: opts.alphaType || 'rotatable',
          centerPoints: opts.ccdCenterPoints ?? 3,
        });
      }
      resLabel = 'CCD';
      break;
    }

    case 'bb': {
      const contFactors = factors.filter(f => f.kind !== 'categorical');
      const hasCategorical = contFactors.length !== k;
      if (hasCategorical) {
        if (contFactors.length < 3) {
          throw new Error('Box-Behnken with categorical factors requires at least 3 continuous factors');
        }
        const contMatrix = boxBehnken(contFactors.length, { centerPoints: opts.bbCenterPoints ?? 3 });
        coded = crossContinuousWithCategorical(contMatrix, factors);
      } else {
        coded = boxBehnken(k, { centerPoints: opts.bbCenterPoints ?? 3 });
      }
      resLabel = 'BB';
      break;
    }

    case 'taguchi': {
      // Per-factor level counts route mixed 2/3-level factor sets to L18
      // (2¹·3⁷) automatically; uniform factor sets pick the smallest fitting
      // L4 / L8 / L9 / L12 / L16 / L27 as before.
      const lc = factors.map(f => f.levels.length);
      const result = taguchiDesign(lc, opts.taguchiArray);
      coded = result.codedMatrix;
      resLabel = result.arrayName;
      break;
    }

    case 'dopt': {
      const ex = opts.optimalExcludedInteractions;
      const nRuns = opts.optimalRuns || minRunsForModel(k, opts.optimalQuadratic, ex) + 2;
      const lc = factors.map(f => f.levels.length);
      const cf = factors.map(f => f.kind === 'categorical');
      coded = dOptimalDesign(k, nRuns, { quadratic: opts.optimalQuadratic, levelCounts: lc, categoricalFlags: cf, seed, excludedInteractions: ex });
      resLabel = 'D-Opt';
      break;
    }

    case 'aopt': {
      const ex = opts.optimalExcludedInteractions;
      const nRuns = opts.optimalRuns || minRunsForModel(k, opts.optimalQuadratic, ex) + 2;
      const lc = factors.map(f => f.levels.length);
      const cf = factors.map(f => f.kind === 'categorical');
      coded = aOptimalDesign(k, nRuns, { quadratic: opts.optimalQuadratic, levelCounts: lc, categoricalFlags: cf, seed, excludedInteractions: ex });
      resLabel = 'A-Opt';
      break;
    }

    case 'gopt': {
      const ex = opts.optimalExcludedInteractions;
      const nRuns = opts.optimalRuns || minRunsForModel(k, opts.optimalQuadratic, ex) + 2;
      const lc = factors.map(f => f.levels.length);
      const cf = factors.map(f => f.kind === 'categorical');
      coded = gOptimalDesign(k, nRuns, { quadratic: opts.optimalQuadratic, levelCounts: lc, categoricalFlags: cf, seed, excludedInteractions: ex });
      resLabel = 'G-Opt';
      break;
    }

    default:
      coded = fullFactorial2k(k);
      resLabel = 'Full';
  }

  // Add center points (except types that already include them or don't support them)
  if (opts.centerPoints && !['ccd', 'bb', 'taguchi', 'dopt', 'aopt', 'gopt'].includes(opts.designType)) {
    coded = addCenterPoints(coded, 3);
  }

  // Replicate the design (duplicate the entire matrix n times)
  const nReplicates = Math.max(1, opts.replicates || 1);
  const baseRunCount = coded.length;
  const replicateIds = [];
  if (nReplicates > 1) {
    const baseCoded = coded.map(row => [...row]);
    coded = [];
    for (let rep = 1; rep <= nReplicates; rep++) {
      for (const row of baseCoded) {
        coded.push([...row]);
        replicateIds.push(rep);
      }
    }
  } else {
    for (let i = 0; i < coded.length; i++) replicateIds.push(1);
  }

  // Standard order (before randomization) — cycles through 1..baseRunCount per replicate
  const stdOrder = coded.map((_, i) => (i % baseRunCount) + 1);

  // Randomize
  if (opts.randomize) {
    const paired = coded.map((row, i) => ({ row, std: stdOrder[i], rep: replicateIds[i] }));
    const shuffled = randomizeDesign(
      paired.map(p => [...p.row, p.std, p.rep]),
      seed
    );
    coded = shuffled.map(r => r.slice(0, k));
    const newStd = shuffled.map(r => r[k]);
    const newRep = shuffled.map(r => r[k + 1]);
    stdOrder.splice(0, stdOrder.length, ...newStd);
    replicateIds.splice(0, replicateIds.length, ...newRep);
  }

  // Convert coded → actual values
  // For each factor, map coded value back to the user-defined level.
  // Coded levels are evenly spaced: -1 + 2*i/(n-1) for i=0..n-1.
  // We reverse this to find the level index and use the actual value.
  const actualMatrix = coded.map(row =>
    row.map((c, fi) => {
      const f = factors[fi];
      const nLevels = f.levels.length;
      if (nLevels <= 2) {
        const lo = parseFloat(f.levels[0]) || -1;
        const hi = parseFloat(f.levels[nLevels - 1]) || 1;
        return formatValue(codedToActual(c, lo, hi));
      }
      // Multi-level: recover index from coded value, use user's actual level
      const idx = Math.round((c + 1) * (nLevels - 1) / 2);
      const clamped = Math.max(0, Math.min(nLevels - 1, idx));
      const val = parseFloat(f.levels[clamped]);
      return isFinite(val) ? formatValue(val) : formatValue(codedToActual(c, parseFloat(f.levels[0]) || -1, parseFloat(f.levels[nLevels - 1]) || 1));
    })
  );

  const runOrder = coded.map((_, i) => i + 1);

  return {
    codedMatrix: coded,
    actualMatrix,
    stdOrder,
    runOrder,
    replicateIds,
    resolution: resLabel,
    p,
    designType: opts.designType,
  };
}

// ─── Unified Dispatcher for Algorithm Lab / Fixture Replay ────────

/**
 * Structural design dispatcher. Mirrors the Python fixture generator 1:1
 * so fixture replay works without transformation. Produces only the
 * structural fields (runCount, factorCount, resolution, codedMatrix,
 * alpha) — no actualMatrix, no randomisation. Use generateDesign(…) for
 * the full planner workflow including actual values and randomisation.
 *
 * Dispatches on `inputs.designType`:
 *   - "full2k" → full factorial 2^k
 *   - "frac"   → fractional factorial 2^(k-p); resolution is echoed back
 *   - "ccd"    → central composite design (alphaType, centerPoints)
 *   - "bb"     → Box-Behnken (centerPoints)
 *
 * @param {Object} inputs
 * @param {"full2k"|"frac"|"ccd"|"bb"} inputs.designType
 * @param {number} inputs.k
 * @param {number} [inputs.p]
 * @param {"rotatable"|"spherical"|"face-centered"} [inputs.alphaType]
 * @param {number} [inputs.centerPoints]
 * @param {string} [inputs.resolution]
 * @returns {{runCount:number, factorCount:number, resolution:string, codedMatrix:number[][], alpha?:number}}
 */
export function analyze(inputs) {
  if (!inputs || typeof inputs.designType !== 'string') {
    throw new Error('analyze: inputs.designType (string) is required');
  }
  const { designType, k } = inputs;
  if (!Number.isFinite(k) || k <= 0) {
    throw new Error('analyze: inputs.k (positive number) is required');
  }

  let matrix;
  let alpha = null;
  let resolution = '';

  if (designType === 'full2k') {
    matrix = fullFactorial2k(k);
    resolution = 'Full';
  } else if (designType === 'frac') {
    const p = inputs.p;
    if (!Number.isFinite(p)) throw new Error('analyze: inputs.p is required for designType "frac"');
    matrix = fractionalFactorial(k, p);
    resolution = inputs.resolution || '';
  } else if (designType === 'ccd') {
    const alphaType = inputs.alphaType || 'rotatable';
    const centerPoints = inputs.centerPoints ?? 3;
    matrix = centralComposite(k, { alphaType, centerPoints });
    alpha = ccdAlpha(k, alphaType);
    resolution = 'CCD';
  } else if (designType === 'bb') {
    const centerPoints = inputs.centerPoints ?? 3;
    matrix = boxBehnken(k, { centerPoints });
    resolution = 'BB';
  } else {
    throw new Error(`analyze: unknown designType '${designType}'`);
  }

  const result = {
    runCount: matrix.length,
    factorCount: matrix[0]?.length ?? 0,
    resolution,
    codedMatrix: matrix,
  };
  if (alpha !== null) result.alpha = alpha;
  return result;
}
