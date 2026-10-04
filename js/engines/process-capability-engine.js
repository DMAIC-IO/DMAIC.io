/**
 * D.Mike — Process Capability Engine (process-capability-engine.js)
 * Pure computation functions for Process Capability Analysis.
 * No DOM access — this module is testable in isolation.
 *
 * Computes: Cp, Cpk, CPU, CPL, Pp, Ppk, PPM (observed, expected within/overall), Z.bench.
 * Supports two-sided (USL + LSL) and one-sided (only USL or only LSL) specs.
 *
 * σ follows Minitab / AIAG SPC: Cp/Cpk use σ_within from the chosen
 * estimator (sigma-within-engine.js; default MR̄/d2 for individuals, pooled
 * SD/c4(d+1) for subgroups), Pp/Ppk use the overall sample SD (n − 1).
 */

import { mean, stddev, stddevPop } from './stats-utils.js';
import { erfc, normalQuantile, chi2Inv } from './math-utils.js';
import { splitSubgroups, estimateSigmaWithin, isIndividuals, c4 } from './sigma-within-engine.js';
export { mean, stddev, stddevPop, c4 };

/** d2 for moving ranges of span 2 (Minitab table value). */
export const D2_SPAN2 = 1.128;

/**
 * σ_within from the average moving range of span 2: MR̄ / d2.
 * The values must be in production order.
 * @param {number[]} values
 * @returns {number} NaN for fewer than two values
 */
export function sigmaWithinMovingRange(values) {
  if (values.length < 2) return NaN;
  return estimateSigmaWithin(splitSubgroups(values, { size: 1 }), { method: 'averageMR' }).sigma;
}

/**
 * σ_within from the pooled standard deviation of consecutive subgroups:
 * S_p / c4(d + 1) with d = Σ(nᵢ − 1). A trailing partial subgroup is kept.
 * @param {number[]} values - in production order
 * @param {number} subgroupSize - integer ≥ 2
 * @returns {number} NaN when no subgroup has two or more values
 */
export function sigmaWithinPooled(values, subgroupSize) {
  const groups = splitSubgroups(values, { size: subgroupSize });
  if (isIndividuals(groups)) return NaN;
  return estimateSigmaWithin(groups, { method: 'pooled' }).sigma;
}

/**
 * Normal CDF approximation (Abramowitz & Stegun, max error ~1.5e-7).
 * @param {number} x
 * @returns {number} P(Z ≤ x)
 */
export function normalCdf(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * z);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

/**
 * Inverse normal CDF (rational approximation, Peter Acklam's algorithm).
 * @param {number} p - probability (0 < p < 1)
 * @returns {number} z such that P(Z ≤ z) = p
 */
export function normalInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
     4.374664141464968e+00, 2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q, r;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } 
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  
}

/**
 * Upper-tail probability Q(z) = P(Z > z) of the standard normal.
 * Uses erfc so far tails stay finite; 1 − Φ(z) rounds to 0 beyond z ≈ 8.
 * @param {number} z
 * @returns {number}
 */
export function normalUpperTail(z) {
  return 0.5 * erfc(z / Math.SQRT2);
}

/**
 * Benchmark Z: the standard normal quantile of the total out-of-spec fraction
 * (both tails), as in Minitab's capability report.
 * @param {number} p - total fraction outside the spec limits
 * @returns {number} −Φ⁻¹(p); Infinity when p is 0, NaN when p is undefined
 *   (e.g. σ = 0 with the mean on a limit)
 */
export function zBench(p) {
  if (p === 0) return Infinity;
  return p > 0 ? -normalQuantile(p) : NaN;
}

/**
 * Validate input parameters.
 * @param {object} params
 * @param {number|null} params.lsl - Lower spec limit (null = one-sided upper)
 * @param {number|null} params.usl - Upper spec limit (null = one-sided lower)
 * @param {number|null} params.target - Target value (optional)
 * @param {number[]} values
 * @returns {{ valid: boolean, errorKey: string|null, errorVars: object|null }}
 */
export function validate(params, values) {
  const hasLsl = params.lsl != null && !isNaN(params.lsl);
  const hasUsl = params.usl != null && !isNaN(params.usl);

  if (!hasLsl && !hasUsl) {
    return { valid: false, errorKey: 'modules.process-capability.errNoLimits', errorVars: null };
  }
  if (hasLsl && hasUsl && params.usl <= params.lsl) {
    return { valid: false, errorKey: 'modules.process-capability.errUslLeqLsl', errorVars: null };
  }
  if (values.length < 2) {
    return { valid: false, errorKey: 'modules.process-capability.errTooFewValues', errorVars: { n: values.length } };
  }
  return { valid: true, errorKey: null, errorVars: null };
}

/**
 * Run the full process capability analysis.
 * @param {object} params
 * @param {number|null} params.lsl - Lower spec limit (null = one-sided)
 * @param {number|null} params.usl - Upper spec limit (null = one-sided)
 * @param {number|null} params.target - Target value (optional, defaults to midpoint)
 * @param {number} [params.confidence=0.95] - Confidence level for CIs (0 < c < 1)
 * @param {number} [params.subgroupSize=1] - 1 = individuals (σ_within from MR̄/d2),
 *   ≥ 2 = consecutive subgroups of that size (σ_within from pooled SD/c4)
 * @param {any[]} [params.subgroupIds] - one ID per value; a new subgroup starts
 *   whenever the ID changes. Takes precedence over subgroupSize.
 * @param {string} [params.withinMethod] - σ within estimator (sigma-within-engine
 *   WITHIN_METHODS); default pooled for subgroups, averageMR for individuals
 * @param {boolean} [params.unbiased=true] - c4 / c4′ for pooled, S̄, √MSSD
 * @param {number} [params.mrSpan=2] - moving-range span w
 * @param {number[]} values - in production order
 * @returns {object} Analysis results
 * @throws {SigmaWithinError} when the estimator does not fit the data or a
 *   table limit is exceeded
 */
export function analyze(params, values) {
  if (!Array.isArray(values)) {
    throw new TypeError('values must be an array');
  }
  if (values.length < 2) {
    throw new Error(`Insufficient data: n < 2 (got ${values.length})`);
  }
  const {
    lsl, usl, target, confidence = 0.95, subgroupSize = 1, subgroupIds = null,
    withinMethod: requestedMethod = null, unbiased = true, mrSpan = 2,
  } = params;
  if (!subgroupIds && (!Number.isInteger(subgroupSize) || subgroupSize < 1)) {
    throw new Error(`subgroupSize must be a positive integer (got ${subgroupSize})`);
  }
  const hasLsl = lsl != null && !isNaN(lsl);
  const hasUsl = usl != null && !isNaN(usl);
  if (!hasLsl && !hasUsl) {
    throw new Error('At least one spec limit (LSL or USL) is required');
  }
  if (hasLsl && hasUsl && usl <= lsl) {
    throw new Error('USL must be greater than LSL');
  }
  const twoSided = hasLsl && hasUsl;

  const n = values.length;
  const xbar = mean(values);
  const groups = subgroupIds
    ? splitSubgroups(values, { ids: subgroupIds })
    : splitSubgroups(values, { size: subgroupSize });
  const within = estimateSigmaWithin(groups, { method: requestedMethod || undefined, unbiased, mrSpan });
  const sigmaWithin = within.sigma;       // → Cp/Cpk
  const withinMethod = within.method;
  const withinDf = within.df;             // ν → Cp/Cpk CIs
  const s = stddev(values);               // overall sample SD (n−1) → Pp/Ppk, PPM
  const sigmaOverall = s;
  const xmin = Math.min(...values);
  const xmax = Math.max(...values);

  // Tolerance
  const T = twoSided ? usl - lsl : null;
  const mid = twoSided ? (usl + lsl) / 2 : null;
  const targetVal = target != null && !isNaN(target) ? target : mid;

  // ─── Short-term (within) indices ─────────────
  let Cp = null, CPU = null, CPL = null, Cpk;

  if (twoSided) {
    Cp = T / (6 * sigmaWithin);
  }
  if (hasUsl) {
    CPU = (usl - xbar) / (3 * sigmaWithin);
  }
  if (hasLsl) {
    CPL = (xbar - lsl) / (3 * sigmaWithin);
  }
  if (twoSided) {
    Cpk = Math.min(CPU, CPL);
  } else if (hasUsl) {
    Cpk = CPU;
  } else {
    Cpk = CPL;
  }

  // ─── Long-term (overall) indices ─────────────
  let Pp = null, PPU = null, PPL = null, Ppk;

  if (twoSided) {
    Pp = T / (6 * sigmaOverall);
  }
  if (hasUsl) {
    PPU = (usl - xbar) / (3 * sigmaOverall);
  }
  if (hasLsl) {
    PPL = (xbar - lsl) / (3 * sigmaOverall);
  }
  if (twoSided) {
    Ppk = Math.min(PPU, PPL);
  } else if (hasUsl) {
    Ppk = PPU;
  } else {
    Ppk = PPL;
  }

  // ─── Out-of-spec fractions (PPM) ─────────────
  // Expected fractions come from the normal model as upper tails Q(z), so a
  // tiny tail stays finite. A missing limit contributes nothing (null per side).
  // σ = 0 puts z at ±Infinity: Q gives 0 or 1, never NaN.
  const tails = (sd) => ({
    below: hasLsl ? normalUpperTail((xbar - lsl) / sd) : null,
    above: hasUsl ? normalUpperTail((usl - xbar) / sd) : null,
  });
  const toPpm = (p) => (p == null ? null : p * 1e6);
  const sumTails = (t) => (t.below ?? 0) + (t.above ?? 0);

  const pOverall = tails(s);             // expected overall (x̄, s)
  const pWithin = tails(sigmaWithin);    // expected within (x̄, σ within)
  const ppmBelowLsl = toPpm(pOverall.below);
  const ppmAboveUsl = toPpm(pOverall.above);
  const ppmTotal = sumTails(pOverall) * 1e6;
  const ppmWithinBelowLsl = toPpm(pWithin.below);
  const ppmWithinAboveUsl = toPpm(pWithin.above);
  const ppmWithinTotal = sumTails(pWithin) * 1e6;

  // Observed: values strictly outside the limits.
  const ppmObservedBelowLsl = hasLsl ? values.filter(v => v < lsl).length / n * 1e6 : null;
  const ppmObservedAboveUsl = hasUsl ? values.filter(v => v > usl).length / n * 1e6 : null;
  const ppmObservedTotal = (ppmObservedBelowLsl ?? 0) + (ppmObservedAboveUsl ?? 0);

  // ─── Sigma level (benchmark Z) ───────────────
  // Z.bench counts both tails; 3·Cpk looks at the nearer limit only and
  // overstates a two-sided process. +1.5 is the Six Sigma shift convention.
  const zBenchWithin = zBench(sumTails(pWithin));
  const zBenchOverall = zBench(sumTails(pOverall));
  const sigmaLevel = zBenchWithin;
  const sigmaLevelShifted = zBenchOverall + 1.5;

  // ─── Status evaluation ───────────────────────
  const cpkStatus = Cpk >= 1.33 ? 'pass' : Cpk >= 1.0 ? 'warn' : 'fail';
  const cpStatus = Cp != null ? (Cp >= 1.33 ? 'pass' : Cp >= 1.0 ? 'warn' : 'fail') : null;
  const overall = cpkStatus;

  // ─── Confidence intervals ────────────────────
  const alpha = 1 - confidence;
  const df = n - 1;           // overall SD → Pp/Ppk
  const nu = withinDf;        // σ within estimator → Cp/Cpk CIs

  // CI for Cp: χ² with ν degrees of freedom
  // Cp_lower = Cp · √(χ²(α/2, ν) / ν), Cp_upper = Cp · √(χ²(1−α/2, ν) / ν)
  let CpCI = null;
  if (Cp != null && nu > 0) {
    const chi2Lo = chi2Inv(alpha / 2, nu);
    const chi2Hi = chi2Inv(1 - alpha / 2, nu);
    CpCI = [
      Cp * Math.sqrt(chi2Lo / nu),
      Cp * Math.sqrt(chi2Hi / nu),
    ];
  }

  // CI for Cpk: normal approximation, Bissell (1990)
  // SE(Cpk) = √(1/(9n) + Cpk²/(2ν))
  let CpkCI = null;
  if (Cpk != null && nu > 0) {
    const zCI = normalInv(1 - alpha / 2);
    const se = Math.sqrt(1 / (9 * n) + (Cpk * Cpk) / (2 * nu));
    CpkCI = [
      Cpk - zCI * se,
      Cpk + zCI * se,
    ];
  }

  // CI for Pp: χ² with n − 1 degrees of freedom
  let PpCI = null;
  if (Pp != null && df > 0) {
    const chi2Lo = chi2Inv(alpha / 2, df);
    const chi2Hi = chi2Inv(1 - alpha / 2, df);
    PpCI = [
      Pp * Math.sqrt(chi2Lo / df),
      Pp * Math.sqrt(chi2Hi / df),
    ];
  }

  // CI for Ppk: Bissell (1990) with n − 1 degrees of freedom
  let PpkCI = null;
  if (Ppk != null && df > 0) {
    const zCI = normalInv(1 - alpha / 2);
    const se = Math.sqrt(1 / (9 * n) + (Ppk * Ppk) / (2 * df));
    PpkCI = [
      Ppk - zCI * se,
      Ppk + zCI * se,
    ];
  }

  return {
    n, xbar, s, sigmaWithin, sigmaOverall, withinMethod, withinDf, subgroupSize, xmin, xmax,
    subgroupCount: within.k, nBar: within.nBar, unbiased: within.unbiased, mrSpan: within.mrSpan,
    T, mid, targetVal,
    hasLsl, hasUsl, twoSided,
    lsl: hasLsl ? lsl : null,
    usl: hasUsl ? usl : null,
    Cp, CPU, CPL, Cpk,
    Pp, PPU, PPL, Ppk,
    CpCI, CpkCI, PpCI, PpkCI,
    confidence,
    ppmAboveUsl, ppmBelowLsl, ppmTotal,
    ppmWithinBelowLsl, ppmWithinAboveUsl, ppmWithinTotal,
    ppmObservedBelowLsl, ppmObservedAboveUsl, ppmObservedTotal,
    zBenchWithin, zBenchOverall, sigmaLevel, sigmaLevelShifted,
    cpkStatus, cpStatus, overall,
  };
}

/**
 * Flat-signature adapter for the Algorithm Lab validation fixtures.
 * Wraps {@link analyze} so it can be called as
 * `capabilityAnalyze(data, lsl, usl, confidence?, subgroupSize?)` and returns
 * fields under lowercase Minitab-style names (`cp`, `cpk`, `cpu`, `cpl`, `pp`,
 * `ppk`, `ppu`, `ppl`, `mean`, `stddev`, `sigma_within`) used by the
 * capability fixtures.
 * The original {@link analyze} API and field names remain unchanged.
 *
 * Unlike {@link analyze}, which handles invalid input gracefully by returning
 * `null` fields, this adapter enforces an explicit contract and throws on
 * garbage input. Use `null` (not `undefined`) to declare an intentionally
 * one-sided spec.
 * @param {number[]} data
 * @param {number|null} lsl
 * @param {number|null} usl
 * @param {number} [confidence=0.95]
 * @param {number} [subgroupSize=1]
 * @param {{withinMethod?: string, unbiased?: boolean, mrSpan?: number}} [options]
 * @returns {object}
 */
export function capabilityAnalyze(data, lsl, usl, confidence, subgroupSize, options) {
  if (!Array.isArray(data)) throw new TypeError('data must be an array');
  if (data.length < 2) throw new Error('Insufficient data: n < 2');
  if (usl === undefined) throw new Error('USL must be provided (use null for one-sided LSL specs)');
  if (lsl === undefined) throw new Error('LSL must be provided (use null for one-sided USL specs)');
  if (usl !== null && (typeof usl !== 'number' || Number.isNaN(usl))) {
    throw new Error('USL must be a number or null');
  }
  if (lsl !== null && (typeof lsl !== 'number' || Number.isNaN(lsl))) {
    throw new Error('LSL must be a number or null');
  }
  if (lsl !== null && usl !== null && usl <= lsl) {
    throw new Error('USL must be greater than LSL');
  }

  const params = { lsl, usl };
  if (confidence != null) params.confidence = confidence;
  if (subgroupSize != null) params.subgroupSize = subgroupSize;
  if (options?.withinMethod) params.withinMethod = options.withinMethod;
  if (options?.unbiased != null) params.unbiased = options.unbiased;
  if (options?.mrSpan != null) params.mrSpan = options.mrSpan;
  const r = analyze(params, data);
  return {
    cp: r.Cp,
    cpk: r.Cpk,
    cpu: r.CPU,
    cpl: r.CPL,
    pp: r.Pp,
    ppk: r.Ppk,
    ppu: r.PPU,
    ppl: r.PPL,
    mean: r.xbar,
    stddev: r.s,
    sigma_within: r.sigmaWithin,
    n: r.n,
    CpCI: r.CpCI,
    CpkCI: r.CpkCI,
    PpCI: r.PpCI,
    PpkCI: r.PpkCI,
    ppmTotal: r.ppmTotal,
    ppmWithinTotal: r.ppmWithinTotal,
    ppmObservedTotal: r.ppmObservedTotal,
    zBenchWithin: r.zBenchWithin,
    zBenchOverall: r.zBenchOverall,
    sigmaLevel: r.sigmaLevel,
    sigmaLevelShifted: r.sigmaLevelShifted,
  };
}

/**
 * Generate example data for process capability.
 * 100 values from a slightly off-center process with known Cpk ≈ 1.2.
 * @returns {{ params: object, values: number[] }}
 */
export function generateExampleData() {
  const target = 50.0;
  const lsl = 49.8;
  const usl = 50.2;
  // Process centered at 50.02 with σ ≈ 0.055 → Cpk ≈ (50.2-50.02)/(3*0.055) ≈ 1.09
  const values = [];
  for (let i = 0; i < 100; i++) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    values.push(parseFloat((target + 0.02 + z * 0.055).toFixed(4)));
  }
  return {
    params: {
      name: '',
      lsl,
      usl,
      target,
      unit: 'mm',
    },
    values,
  };
}
