/**
 * D.Mike — DoE Planner: Design Evaluation & Analysis (doe-planner-analysis.js)
 *
 * Pure functions for:
 *   - Evaluating a design BEFORE running experiments (evaluation badges)
 *   - Analyzing results AFTER running experiments (analysis section)
 * No DOM, no side effects.
 *
 * Features:
 *   - Alias structure computation
 *   - Variance Inflation Factors (VIF)
 *   - Design efficiency metrics (D, A, G)
 *   - Power analysis
 *   - OLS regression model fitting
 *   - ANOVA table generation
 *   - Effect estimation and significance testing
 *   - Residual diagnostics
 */

import {
  buildModelMatrix,
  fDistQuantile, fDistCDF, normalCDF,
  olsRegression, typeIIISS,
  normalInv as inverseNormalCDF,
  normalOrderStatistics,
} from '../../engines/regression-engine.js';

import { GENERATORS } from './doe-planner-designs.js';

// ─── Alias Structure ────────────────────────────────────────────────

/**
 * Compute the alias structure for a fractional factorial design.
 * Shows which effects are confounded (aliased) with each other.
 *
 * @param {number} k - Total number of factors
 * @param {number} p - Number of generators
 * @param {string} designType - 'full', 'frac', 'pb', 'ccd'
 * @returns {{ aliases: { term: string, aliasedWith: string[] }[], generatorStrings: string[], definingRelation: string[] }}
 */
export function computeAliasStructure(k, p, designType) {
  // Full factorial: no aliases
  if (designType === 'full' || p === 0) {
    return { aliases: [], generatorStrings: [], definingRelation: [] };
  }

  const letters = Array.from({ length: k }, (_, i) => String.fromCharCode(65 + i));
  const base = k - p;
  const key = `${k}-${p}`;
  const gens = GENERATORS[key];

  if (!gens) {
    return { aliases: [], generatorStrings: ['(unknown generators)'], definingRelation: [] };
  }

  // Build generator strings: e.g. "E = ABC" means column E is generated from A*B*C
  const generatorStrings = gens.map((cols, gi) => {
    const genLetter = letters[base + gi];
    const baseCols = cols.map(c => letters[c]).join('');
    return `${genLetter} = ${baseCols}`;
  });

  // Defining relation words: I = (generator letter)(base columns)
  // e.g. if E = ABC, then defining word is ABCE
  const definingRelation = gens.map((cols, gi) => {
    const allCols = [...cols, base + gi].sort((a, b) => a - b);
    return allCols.map(c => letters[c]).join('');
  });

  // Compute aliases for main effects
  // A main effect X is aliased with any interaction that contains X in the defining relation
  const aliases = [];

  for (let i = 0; i < k; i++) {
    const mainEffect = letters[i];
    const aliasedWith = [];

    for (const word of definingRelation) {
      // "Multiply" the main effect by the defining word
      // XOR operation: if letter is in both, it cancels out
      const wordLetters = new Set(word.split(''));
      if (wordLetters.has(mainEffect)) {
        // Remove this letter from the word → the alias
        wordLetters.delete(mainEffect);
        if (wordLetters.size > 0) {
          aliasedWith.push([...wordLetters].sort().join(''));
        }
      } else {
        // Add this letter to the word → the alias
        const alias = [...new Set([...word.split(''), mainEffect])].sort().join('');
        aliasedWith.push(alias);
      }
    }

    if (aliasedWith.length > 0) {
      aliases.push({ term: mainEffect, aliasedWith });
    }
  }

  // Compute aliases for 2-factor interactions
  for (let a = 0; a < k; a++) {
    for (let b = a + 1; b < k; b++) {
      const ixName = letters[a] + letters[b];
      const aliasedWith = [];

      for (const word of definingRelation) {
        const wordSet = new Set(word.split(''));
        const ixSet = new Set([letters[a], letters[b]]);

        // XOR: letters in one but not both
        const result = new Set();
        for (const l of wordSet) { if (!ixSet.has(l)) result.add(l); }
        for (const l of ixSet) { if (!wordSet.has(l)) result.add(l); }

        if (result.size > 0 && result.size <= 3) {
          const alias = [...result].sort().join('');
          if (alias !== ixName) {
            aliasedWith.push(alias);
          }
        }
      }

      if (aliasedWith.length > 0) {
        aliases.push({ term: ixName, aliasedWith });
      }
    }
  }

  return { aliases, generatorStrings, definingRelation };
}

// ─── Variance Inflation Factors ─────────────────────────────────────
// Delegated to the shared engine (js/engines/vif-engine.js).
// Re-exported here for backwards compatibility.

import { computeVIF } from '../../engines/vif-engine.js';
export { computeVIF };

// ─── Design Efficiency Metrics ──────────────────────────────────────
// Delegated to the shared engine (js/engines/design-efficiency-engine.js).
// Re-exported here for backwards compatibility.

import { computeDesignEfficiency } from '../../engines/design-efficiency-engine.js';
export { computeDesignEfficiency };

// ─── Power Analysis ─────────────────────────────────────────────────

/**
 * @typedef {object} PowerResult
 * @property {number} power - Statistical power (0–1)
 * @property {number} effectSize - Standardized effect size (delta/sigma)
 * @property {number} alpha - Significance level
 * @property {number} n - Number of runs
 * @property {number} dfEffect - Degrees of freedom for the effect
 * @property {number} dfError - Degrees of freedom for error
 */

/**
 * Compute the statistical power to detect an effect of a given size.
 *
 * Uses the non-central F-distribution approximation:
 *   λ = n × (delta/sigma)^2 / 4   (non-centrality parameter for one main effect)
 *   Power = P(F > F_crit | F ~ F(df1, df2, λ))
 *
 * Approximated via the shifted central F method.
 *
 * @param {number} n - Number of runs
 * @param {number} k - Number of factors
 * @param {number} effectSizes - Array of effect sizes (delta/sigma) to evaluate
 * @param {number} [alpha=0.05] - Significance level
 * @returns {PowerResult[]}
 */
export function computePowerAnalysis(n, k, effectSizes = [0.5, 1.0, 1.5, 2.0], alpha = 0.05) {
  // For a main effect in a 2^k design:
  // SS_effect = n × effect^2 / 4
  // df_effect = 1 (for each main effect)
  // df_error = n - p (where p = number of model terms)
  // F = MS_effect / MS_error

  const { termNames } = buildModelMatrix(
    Array.from({ length: n }, () => new Array(k).fill(0)),
    { interactions: true }
  );
  const p = termNames.length;
  const dfEffect = 1;
  const dfError = Math.max(n - p, 1);

  const fCrit = fDistQuantile(alpha, dfEffect, dfError);

  return effectSizes.map(es => {
    // Non-centrality parameter
    const lambda = n * es * es / 4;

    // Approximate power using the shifted-F method:
    // P(F_nc > F_crit) ≈ P(F_central > F_crit / (1 + lambda/df1))
    // More accurate: use the Patnaik two-moment approximation
    const shiftedCrit = fCrit / (1 + lambda / dfEffect);

    // Power = 1 - P(F ≤ shiftedCrit | F(df1, df2))
    // But this is the central F, so:
    const power = 1 - fDistCDF(shiftedCrit, dfEffect, dfError);

    return {
      power: Math.min(Math.max(power, 0), 1),
      effectSize: es,
      alpha,
      n,
      dfEffect,
      dfError,
    };
  });
}

// ─── Full Evaluation Facade ─────────────────────────────────────────

/**
 * @typedef {object} DesignEvaluation
 * @property {{ aliases: object[], generatorStrings: string[], definingRelation: string[] }} aliasStructure
 * @property {{ term: string, vif: number }[]} vif
 * @property {DesignEfficiency} efficiency
 * @property {PowerResult[]} power
 */

/**
 * Run the complete design evaluation.
 *
 * @param {number[][]} codedMatrix - Coded design matrix
 * @param {number} k - Number of factors
 * @param {number} p - Number of generators (for alias computation)
 * @param {string} designType - 'full', 'frac', 'pb', 'ccd'
 * @param {number} [alpha=0.05] - Significance level for power analysis
 * @returns {DesignEvaluation}
 */
export function evaluateDesign(codedMatrix, k, p, designType, alpha = 0.05) {
  const aliasStructure = computeAliasStructure(k, p, designType);
  const vif = computeVIF(codedMatrix);
  const efficiency = computeDesignEfficiency(codedMatrix);
  const power = computePowerAnalysis(codedMatrix.length, k, [0.5, 1.0, 1.5, 2.0, 3.0], alpha);

  return { aliasStructure, vif, efficiency, power };
}

// ═══════════════════════════════════════════════════════════════════════
// Post-Experiment Analysis
// ═══════════════════════════════════════════════════════════════════════

// ─── ANOVA Table ──────────────────────────────────────────────────────

/**
 * @typedef {object} ANOVARow
 * @property {string} term - Term name (e.g. 'A', 'B', 'A×B')
 * @property {number} SS - Sum of squares
 * @property {number} df - Degrees of freedom
 * @property {number} MS - Mean square
 * @property {number} F - F-statistic
 * @property {number} p - p-value
 * @property {boolean} significant - p < alpha
 */

/**
 * @typedef {object} CoefficientRow
 * @property {string} term - Term name
 * @property {number} coefficient - Regression coefficient (half-effect for coded ±1)
 * @property {number} effect - Full effect (2 × coefficient for main effects)
 * @property {number} se - Standard error
 * @property {number} t - t-statistic
 * @property {number} p - p-value
 * @property {boolean} significant - p < alpha
 */

/**
 * @typedef {object} AnalysisResult
 * @property {ANOVARow[]} anova - ANOVA table rows (one per term, excluding intercept)
 * @property {{ SS: number, df: number, MS: number }} anovaError - Error (residual) row
 * @property {{ SS: number, df: number }} anovaTotal - Total row
 * @property {CoefficientRow[]} coefficients - Coefficient table (including intercept)
 * @property {number} rSquared - R²
 * @property {number} rSquaredAdj - Adjusted R²
 * @property {number} sigma - Root MSE
 * @property {number} fStatistic - Overall F
 * @property {number} fPValue - Overall F p-value
 * @property {number[]} predicted - Fitted values
 * @property {number[]} residuals - Residuals
 * @property {number[]} stdResiduals - Standardized residuals
 * @property {string[]} termNames - Term names (including intercept)
 */

/**
 * Fit a regression model and produce the full analysis for a DoE.
 *
 * @param {number[][]} codedMatrix - n×k coded design matrix
 * @param {number[]} y - Response values (length n)
 * @param {string[]} [factorNames] - Factor names (default: A, B, C, ...)
 * @param {number} [alpha=0.05] - Significance level
 * @returns {AnalysisResult|null} null if model is singular or insufficient data
 */
export function analyzeResponse(codedMatrix, y, factorNames, alpha = 0.05) {
  const n = codedMatrix.length;
  const k = codedMatrix[0].length;

  if (n < k + 2) return null; // Need at least p+1 observations

  // Build model matrix with intercept and 2FI
  const { X, termNames } = buildModelMatrix(codedMatrix, { interactions: true });
  const p = termNames.length;

  // If n ≤ p, drop interactions to avoid singular matrix
  let Xfit = X;
  let termsFit = termNames;
  if (n <= p) {
    const result = buildModelMatrix(codedMatrix, { interactions: false });
    Xfit = result.X;
    termsFit = result.termNames;
  }

  // Fit OLS
  const ols = olsRegression(Xfit, y);
  if (!ols) return null;

  // Type III SS for ANOVA
  const t3 = typeIIISS(ols);

  // Build factor name map
  const names = factorNames || Array.from({ length: k }, (_, i) => String.fromCharCode(65 + i));
  const resolveTermName = (raw) => {
    // Replace single letters with factor names
    if (raw === 'Intercept') return raw;
    // e.g. 'A' → 'Temperature', 'A×B' → 'Temperature×Pressure'
    return raw.replace(/[A-Z]/g, (ch) => {
      const idx = ch.charCodeAt(0) - 65;
      return idx < names.length ? names[idx] : ch;
    });
  };

  // ANOVA rows (skip intercept)
  const anova = [];
  for (let j = 0; j < t3.termSS.length; j++) {
    anova.push({
      term: resolveTermName(termsFit[j + 1]),
      SS: t3.termSS[j],
      df: t3.termDF[j],
      MS: t3.termMS[j],
      F: t3.termF[j],
      p: t3.termP[j],
      significant: t3.termP[j] < alpha,
    });
  }

  const anovaError = {
    SS: ols.SSE,
    df: ols.dfError,
    MS: ols.MSE,
  };

  const anovaTotal = {
    SS: ols.SST,
    df: n - 1,
  };

  // Coefficient table
  const coefficients = termsFit.map((raw, j) => {
    const isIntercept = j === 0;
    const coeff = ols.beta[j];
    // For coded ±1 designs, effect = 2 × coefficient (except intercept)
    const effect = isIntercept ? coeff : 2 * coeff;
    return {
      term: resolveTermName(raw),
      coefficient: coeff,
      effect,
      se: ols.seBeta[j],
      t: ols.tValues[j],
      p: ols.pValues[j],
      significant: !isIntercept && ols.pValues[j] < alpha,
    };
  });

  // Standardized residuals
  const stdResiduals = ols.residuals.map(r =>
    ols.sigma > 0 ? r / ols.sigma : 0
  );

  return {
    anova,
    anovaError,
    anovaTotal,
    coefficients,
    rSquared: ols.rSquared,
    rSquaredAdj: ols.rSquaredAdj,
    sigma: ols.sigma,
    fStatistic: ols.fStatistic,
    fPValue: ols.fPValue,
    predicted: ols.predicted,
    residuals: ols.residuals,
    stdResiduals,
    termNames: termsFit.map(resolveTermName),
  };
}

// ─── Main Effect Means ────────────────────────────────────────────────

/**
 * Compute mean response at each level of each factor.
 * Used for main-effect plots.
 *
 * @param {number[][]} codedMatrix - n×k coded design matrix
 * @param {number[]} y - Response values
 * @returns {{ factor: number, levels: { coded: number, mean: number, count: number }[] }[]}
 */
export function mainEffectMeans(codedMatrix, y) {
  const k = codedMatrix[0].length;
  const results = [];

  for (let j = 0; j < k; j++) {
    // Collect unique levels for this factor
    const levelMap = new Map();
    for (let i = 0; i < codedMatrix.length; i++) {
      const lv = codedMatrix[i][j];
      const key = Math.round(lv * 1000) / 1000; // avoid float issues
      if (!levelMap.has(key)) levelMap.set(key, { sum: 0, count: 0 });
      levelMap.get(key).sum += y[i];
      levelMap.get(key).count++;
    }

    const levels = [...levelMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([coded, { sum, count }]) => ({
        coded,
        mean: sum / count,
        count,
      }));

    results.push({ factor: j, levels });
  }

  return results;
}

// ─── Interaction Means ────────────────────────────────────────────────

/**
 * Compute mean response at each level combination for a pair of factors.
 * Used for interaction plots.
 *
 * @param {number[][]} codedMatrix - n×k coded design matrix
 * @param {number[]} y - Response values
 * @param {number} fa - Factor A index
 * @param {number} fb - Factor B index
 * @returns {{ levelA: number, levelB: number, mean: number, count: number }[]}
 */
export function interactionMeans(codedMatrix, y, fa, fb) {
  const map = new Map();

  for (let i = 0; i < codedMatrix.length; i++) {
    const a = Math.round(codedMatrix[i][fa] * 1000) / 1000;
    const b = Math.round(codedMatrix[i][fb] * 1000) / 1000;
    const key = `${a}|${b}`;
    if (!map.has(key)) map.set(key, { a, b, sum: 0, count: 0 });
    const entry = map.get(key);
    entry.sum += y[i];
    entry.count++;
  }

  return [...map.values()]
    .map(({ a, b, sum, count }) => ({
      levelA: a, levelB: b, mean: sum / count, count,
    }))
    .sort((x, y) => x.levelA - y.levelA || x.levelB - y.levelB);
}

// ─── Normal Order Statistics ──────────────────────────────────────────
// Re-exported from regression-engine via import above.
export { normalOrderStatistics };

// ─── EVOP Cumulative Effect Tracking ─────────────────────────────

/**
 * @typedef {object} EVOPCycleData
 * @property {number} cycleNumber - 1-based cycle number
 * @property {number[][]} codedMatrix - Coded design matrix for this cycle
 * @property {number[]} y - Response values for this cycle
 * @property {string[]} factorNames - Factor names
 */

/**
 * @typedef {object} EVOPEffectEntry
 * @property {string} term - Effect name (e.g. 'A', 'B', 'A×B')
 * @property {number} cumulativeEffect - Running cumulative effect estimate
 * @property {number} errorLimit - 2σ error limit (Box method)
 * @property {boolean} significant - Whether |effect| > errorLimit
 */

/**
 * @typedef {object} EVOPResult
 * @property {EVOPEffectEntry[]} effects - Per-term cumulative effects
 * @property {number} cycleMean - Overall mean of all cycles
 * @property {number} cycleCount - Number of cycles processed
 * @property {number} totalRuns - Total number of runs across all cycles
 * @property {string} overallRecommendation - 'repeat' | 'recenter' | 'stop'
 * @property {string} bestPointDescription - Description of the best operating point
 * @property {number[]} bestPointCoded - Coded coordinates of the best point
 */

/**
 * Compute cumulative EVOP effect table from multiple cycles.
 * Uses Box's method: running averages and 2σ error limits.
 *
 * @param {EVOPCycleData[]} cycles - Array of completed cycles
 * @returns {EVOPResult}
 */
export function computeEVOPEffects(cycles) {
  if (!cycles || cycles.length === 0) {
    return { effects: [], cycleMean: 0, cycleCount: 0, totalRuns: 0,
             overallRecommendation: 'repeat', bestPointDescription: '', bestPointCoded: [] };
  }

  const allY = [];
  const allCoded = [];
  for (const cycle of cycles) {
    for (let i = 0; i < cycle.y.length; i++) {
      if (cycle.y[i] != null && !isNaN(cycle.y[i])) {
        allY.push(cycle.y[i]);
        allCoded.push(cycle.codedMatrix[i]);
      }
    }
  }

  const n = allY.length;
  if (n === 0) {
    return { effects: [], cycleMean: 0, cycleCount: cycles.length, totalRuns: 0,
             overallRecommendation: 'repeat', bestPointDescription: '', bestPointCoded: [] };
  }

  const cycleMean = allY.reduce((s, v) => s + v, 0) / n;
  const factorNames = cycles[0].factorNames;
  const k = allCoded[0].length;

  // Compute main effects (average at +1 minus average at -1)
  const rawEffects = [];
  for (let fi = 0; fi < k; fi++) {
    const hiVals = [];
    const loVals = [];
    for (let i = 0; i < n; i++) {
      if (allCoded[i][fi] >= 0.5) hiVals.push(allY[i]);
      else if (allCoded[i][fi] <= -0.5) loVals.push(allY[i]);
    }
    const hiMean = hiVals.length > 0 ? hiVals.reduce((s, v) => s + v, 0) / hiVals.length : 0;
    const loMean = loVals.length > 0 ? loVals.reduce((s, v) => s + v, 0) / loVals.length : 0;
    rawEffects.push({ term: factorNames[fi] || String.fromCharCode(65 + fi), effect: hiMean - loMean });
  }

  // Compute 2-factor interactions
  for (let a = 0; a < k; a++) {
    for (let b = a + 1; b < k; b++) {
      const groups = { pp: [], pm: [], mp: [], mm: [] };
      for (let i = 0; i < n; i++) {
        const va = allCoded[i][a] >= 0.5 ? '+' : allCoded[i][a] <= -0.5 ? '-' : '0';
        const vb = allCoded[i][b] >= 0.5 ? '+' : allCoded[i][b] <= -0.5 ? '-' : '0';
        if (va === '0' || vb === '0') continue;
        const key = (va === '+' ? 'p' : 'm') + (vb === '+' ? 'p' : 'm');
        groups[key].push(allY[i]);
      }
      const avg = (arr) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
      const effect = (avg(groups.pp) + avg(groups.mm)) / 2 - (avg(groups.pm) + avg(groups.mp)) / 2;
      const nameA = factorNames[a] || String.fromCharCode(65 + a);
      const nameB = factorNames[b] || String.fromCharCode(65 + b);
      rawEffects.push({ term: `${nameA}\u00d7${nameB}`, effect });
    }
  }

  // Pooled error estimate (Box method: within-cycle variance)
  let pooledSS = 0;
  let dfTotal = 0;
  for (const cycle of cycles) {
    const vals = cycle.y.filter(v => v != null && !isNaN(v));
    if (vals.length < 2) continue;
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    pooledSS += vals.reduce((s, v) => s + (v - mean) ** 2, 0);
    dfTotal += vals.length - 1;
  }
  const sigma = dfTotal > 0 ? Math.sqrt(pooledSS / dfTotal) : 0;

  // Error limit: 2σ√(2/n_per_level)
  const nPerLevel = Math.max(1, Math.floor(n / 2));
  const errorLimit = sigma > 0 ? 2 * sigma * Math.sqrt(2 / nPerLevel) : Infinity;

  const effects = rawEffects.map(e => ({
    term: e.term,
    cumulativeEffect: e.effect,
    errorLimit,
    significant: sigma > 0 && Math.abs(e.effect) > errorLimit,
  }));

  // Find best operating point
  let bestIdx = 0;
  let bestVal = -Infinity;
  for (let i = 0; i < n; i++) {
    if (allY[i] > bestVal) { bestVal = allY[i]; bestIdx = i; }
  }
  const bestPointCoded = allCoded[bestIdx] ? [...allCoded[bestIdx]] : [];
  const bestParts = bestPointCoded.map((v, fi) => {
    const name = factorNames[fi] || String.fromCharCode(65 + fi);
    return `${name}=${v > 0 ? '+' : v < 0 ? '\u2212' : '0'}`;
  });

  // Overall recommendation
  const anySignificant = effects.some(e => e.significant);
  let overallRecommendation = 'repeat';
  if (anySignificant) {
    overallRecommendation = 'recenter';
  } else if (cycles.length >= 3 && !anySignificant) {
    overallRecommendation = 'stop';
  }

  return {
    effects,
    cycleMean,
    cycleCount: cycles.length,
    totalRuns: n,
    overallRecommendation,
    bestPointDescription: bestParts.join(', '),
    bestPointCoded,
  };
}

/**
 * Compute re-centered factor levels for the next EVOP cycle.
 * The best point becomes the new center; step sizes remain the same.
 *
 * @param {object[]} currentFactors - Factor definitions [{name, unit, levels}]
 * @param {number[]} bestPointCoded - Coded coordinates of the best point
 * @returns {object[]} New factor definitions with re-centered levels
 */
export function recenteredFactors(currentFactors, bestPointCoded) {
  return currentFactors.map((f, fi) => {
    const lo = parseFloat(f.levels[0]) || -1;
    const hi = parseFloat(f.levels[f.levels.length - 1]) || 1;
    const halfRange = (hi - lo) / 2;
    const oldCenter = (lo + hi) / 2;
    const coded = bestPointCoded[fi] ?? 0;
    const newCenter = oldCenter + coded * halfRange;
    const newLo = newCenter - halfRange;
    const newHi = newCenter + halfRange;

    const newLevels = [...f.levels];
    newLevels[0] = String(Number(newLo.toFixed(4)));
    newLevels[newLevels.length - 1] = String(Number(newHi.toFixed(4)));
    for (let i = 1; i < newLevels.length - 1; i++) {
      const frac = i / (newLevels.length - 1);
      newLevels[i] = String(Number((newLo + frac * (newHi - newLo)).toFixed(4)));
    }

    return { ...f, levels: newLevels };
  });
}

// ─── Dispersion Analysis (Dual Response) ────────────────────────────

/**
 * Dispersion DoE: groups replicated runs by design point, computes
 * mean (ȳ) and ln(s²) per group, then fits an OLS model on each.
 *
 * Identifies factor settings that minimize variability independently
 * of the mean — the dual-response approach (Vining & Myers 1990,
 * Bartlett & Kendall 1946 for log-variance).
 *
 * Requires at least 2 replicates per design point.
 *
 * @param {object} design - Design with codedMatrix and stdOrder
 * @param {number[]} y - Response values aligned with codedMatrix rows
 * @param {string[]} factorNames
 * @param {number} [alpha=0.05]
 * @returns {{
 *   ok: true,
 *   groups: { point: number, n: number, mean: number, sd: number, variance: number, lnVariance: number|null }[],
 *   meanModel: ReturnType<typeof analyzeResponse>|null,
 *   dispersionModel: ReturnType<typeof analyzeResponse>|null,
 *   minReplicates: number,
 *   maxReplicates: number,
 *   zeroVarPoints: number,
 *   significantDispersion: { term: string, coefficient: number, effect: number, p: number, prefer: 'low'|'high'|'mid' }[]
 * } | { ok: false, reason: 'no-replicates'|'invalid-input'|'insufficient-data', details?: object }}
 */
export function computeDispersionAnalysis(design, y, factorNames, alpha = 0.05) {
  if (!design || !Array.isArray(y) || y.length === 0) {
    return { ok: false, reason: 'invalid-input' };
  }
  const { codedMatrix, stdOrder } = design;
  if (!Array.isArray(codedMatrix) || !Array.isArray(stdOrder)) {
    return { ok: false, reason: 'invalid-input' };
  }
  if (codedMatrix.length !== stdOrder.length || codedMatrix.length !== y.length) {
    return { ok: false, reason: 'invalid-input' };
  }

  // Group by std order — replicates of the same design point share a stdOrder
  /** @type {Map<number, { coded: number[], y: number[] }>} */
  const groups = new Map();
  for (let i = 0; i < y.length; i++) {
    const v = y[i];
    if (v == null || typeof v !== 'number' || !isFinite(v)) continue;
    const key = stdOrder[i];
    if (!groups.has(key)) groups.set(key, { coded: codedMatrix[i], y: [] });
    groups.get(key).y.push(v);
  }

  if (groups.size < 2) {
    return { ok: false, reason: 'insufficient-data' };
  }

  // Per-group statistics
  const allGroups = [];
  let minN = Infinity;
  let maxN = 0;
  for (const [point, g] of groups) {
    const n = g.y.length;
    if (n < minN) minN = n;
    if (n > maxN) maxN = n;
    if (n < 2) {
      return {
        ok: false,
        reason: 'no-replicates',
        details: { point, n },
      };
    }
    const mean = g.y.reduce((s, v) => s + v, 0) / n;
    const variance = g.y.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
    allGroups.push({
      point,
      n,
      mean,
      variance,
      sd: Math.sqrt(variance),
      coded: g.coded,
    });
  }

  allGroups.sort((a, b) => a.point - b.point);

  // Fit mean model on all unique design points
  const meanMatrix = allGroups.map(g => g.coded);
  const meanY = allGroups.map(g => g.mean);
  const meanModel = analyzeResponse(meanMatrix, meanY, factorNames, alpha);

  // Fit dispersion model only on points with non-zero variance
  const usable = allGroups.filter(g => g.variance > 0);
  let dispersionModel = null;
  if (usable.length >= 2) {
    const dispMatrix = usable.map(g => g.coded);
    const dispY = usable.map(g => Math.log(g.variance));
    dispersionModel = analyzeResponse(dispMatrix, dispY, factorNames, alpha);
  }

  // Identify significant dispersion drivers and the preferred level
  const significantDispersion = [];
  if (dispersionModel?.coefficients) {
    for (const c of dispersionModel.coefficients) {
      if (!c.significant || c.term === 'Intercept') continue;
      // Negative coefficient on ln(s²) means raising that term reduces variance.
      // For a single coded factor (term contains no '×'), the sign maps to a level.
      let prefer = 'mid';
      if (!c.term.includes('×')) {
        prefer = c.coefficient < 0 ? 'high' : 'low';
      }
      significantDispersion.push({
        term: c.term,
        coefficient: c.coefficient,
        effect: c.effect,
        p: c.p,
        prefer,
      });
    }
  }

  return {
    ok: true,
    groups: allGroups.map(g => ({
      point: g.point,
      n: g.n,
      mean: g.mean,
      sd: g.sd,
      variance: g.variance,
      lnVariance: g.variance > 0 ? Math.log(g.variance) : null,
    })),
    meanModel,
    dispersionModel,
    minReplicates: minN === Infinity ? 0 : minN,
    maxReplicates: maxN,
    zeroVarPoints: allGroups.length - usable.length,
    significantDispersion,
  };
}
