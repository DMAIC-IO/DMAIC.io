/**
 * D.Mike — Process Capability Engine (process-capability-engine.js)
 * Pure computation functions for Process Capability Analysis.
 * No DOM access — this module is testable in isolation.
 *
 * Computes: Cp, Cpk, CPU, CPL, Pp, Ppk, PPM, sigma level.
 * Supports two-sided (USL + LSL) and one-sided (only USL or only LSL) specs.
 */

import { mean, stddev, stddevPop } from './stats-utils.js';
export { mean, stddev, stddevPop };

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
 * Chi-squared inverse (quantile) via Wilson-Hilferty approximation.
 * @param {number} p - probability (0 < p < 1)
 * @param {number} df - degrees of freedom (> 0)
 * @returns {number} x such that P(X ≤ x) = p for X ~ χ²(df)
 */
export function chiSquaredInv(p, df) {
  if (df <= 0) return NaN;
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  const z = normalInv(p);
  const k = 2 / (9 * df);
  const t = 1 - k + z * Math.sqrt(k);
  // Clamp to avoid negative results for very small df or extreme p
  return df * Math.max(t * t * t, 0);
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
 * @param {number[]} values
 * @returns {object} Analysis results
 */
export function analyze(params, values) {
  if (!Array.isArray(values)) {
    throw new TypeError('values must be an array');
  }
  if (values.length < 2) {
    throw new Error(`Insufficient data: n < 2 (got ${values.length})`);
  }
  const { lsl, usl, target, confidence = 0.95 } = params;
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
  const s = stddev(values);       // sample stddev (n-1) → for Cp/Cpk (within)
  const sigma = stddevPop(values); // population stddev (n) → for Pp/Ppk (overall)
  const xmin = Math.min(...values);
  const xmax = Math.max(...values);

  // Tolerance
  const T = twoSided ? usl - lsl : null;
  const mid = twoSided ? (usl + lsl) / 2 : null;
  const targetVal = target != null && !isNaN(target) ? target : mid;

  // ─── Short-term (within) indices ─────────────
  let Cp = null, CPU = null, CPL = null, Cpk;

  if (twoSided) {
    Cp = T / (6 * s);
  }
  if (hasUsl) {
    CPU = (usl - xbar) / (3 * s);
  }
  if (hasLsl) {
    CPL = (xbar - lsl) / (3 * s);
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
    Pp = T / (6 * sigma);
  }
  if (hasUsl) {
    PPU = (usl - xbar) / (3 * sigma);
  }
  if (hasLsl) {
    PPL = (xbar - lsl) / (3 * sigma);
  }
  if (twoSided) {
    Ppk = Math.min(PPU, PPL);
  } else if (hasUsl) {
    Ppk = PPU;
  } else {
    Ppk = PPL;
  }

  // ─── PPM (parts per million defective) ───────
  let ppmAboveUsl = null, ppmBelowLsl = null, ppmTotal;
  if (hasUsl) {
    ppmAboveUsl = (1 - normalCdf((usl - xbar) / s)) * 1e6;
  }
  if (hasLsl) {
    ppmBelowLsl = normalCdf((lsl - xbar) / s) * 1e6;
  }
  if (hasUsl && hasLsl) {
    ppmTotal = ppmAboveUsl + ppmBelowLsl;
  } else if (hasUsl) {
    ppmTotal = ppmAboveUsl;
  } else {
    ppmTotal = ppmBelowLsl;
  }

  // ─── Sigma level ─────────────────────────────
  // Z = Cpk * 3 (short-term sigma); long-term = Z - 1.5 shift
  const zShortTerm = Cpk * 3;
  const zLongTerm = zShortTerm - 1.5;
  const sigmaLevel = zShortTerm;

  // ─── Status evaluation ───────────────────────
  const cpkStatus = Cpk >= 1.33 ? 'pass' : Cpk >= 1.0 ? 'warn' : 'fail';
  const cpStatus = Cp != null ? (Cp >= 1.33 ? 'pass' : Cp >= 1.0 ? 'warn' : 'fail') : null;
  const overall = cpkStatus;

  // ─── Confidence intervals ────────────────────
  const alpha = 1 - confidence;
  const df = n - 1;

  // CI for Cp: exact (chi-squared based)
  // Cp_lower = Cp * sqrt(χ²(α/2, df) / df)
  // Cp_upper = Cp * sqrt(χ²(1−α/2, df) / df)
  let CpCI = null;
  if (Cp != null && df > 0) {
    const chi2Lo = chiSquaredInv(alpha / 2, df);
    const chi2Hi = chiSquaredInv(1 - alpha / 2, df);
    CpCI = [
      Cp * Math.sqrt(chi2Lo / df),
      Cp * Math.sqrt(chi2Hi / df),
    ];
  }

  // CI for Cpk: normal approximation (Kushler-Hurley)
  // SE(Cpk) = sqrt(1/(9n) + Cpk²/(2(n−1)))
  let CpkCI = null;
  if (Cpk != null && n > 1) {
    const zCI = normalInv(1 - alpha / 2);
    const se = Math.sqrt(1 / (9 * n) + (Cpk * Cpk) / (2 * df));
    CpkCI = [
      Cpk - zCI * se,
      Cpk + zCI * se,
    ];
  }

  // CI for Pp: exact (chi-squared based, same formula as Cp but using sigma/n)
  let PpCI = null;
  if (Pp != null && df > 0) {
    const chi2Lo = chiSquaredInv(alpha / 2, df);
    const chi2Hi = chiSquaredInv(1 - alpha / 2, df);
    PpCI = [
      Pp * Math.sqrt(chi2Lo / df),
      Pp * Math.sqrt(chi2Hi / df),
    ];
  }

  // CI for Ppk: same approximation as Cpk
  let PpkCI = null;
  if (Ppk != null && n > 1) {
    const zCI = normalInv(1 - alpha / 2);
    const se = Math.sqrt(1 / (9 * n) + (Ppk * Ppk) / (2 * df));
    PpkCI = [
      Ppk - zCI * se,
      Ppk + zCI * se,
    ];
  }

  return {
    n, xbar, s, sigma, xmin, xmax,
    T, mid, targetVal,
    hasLsl, hasUsl, twoSided,
    lsl: hasLsl ? lsl : null,
    usl: hasUsl ? usl : null,
    Cp, CPU, CPL, Cpk,
    Pp, PPU, PPL, Ppk,
    CpCI, CpkCI, PpCI, PpkCI,
    confidence,
    ppmAboveUsl, ppmBelowLsl, ppmTotal,
    zShortTerm, zLongTerm, sigmaLevel,
    cpkStatus, cpStatus, overall,
  };
}

/**
 * Flat-signature adapter for the Algorithm Lab validation fixtures.
 * Wraps {@link analyze} so it can be called as
 * `capabilityAnalyze(data, lsl, usl, confidence?)` and returns fields under
 * lowercase Minitab-style names (`cp`, `cpk`, `cpu`, `cpl`, `pp`, `ppk`,
 * `ppu`, `ppl`, `mean`, `stddev`, `sigma`) used by the capability fixtures.
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
 * @returns {object}
 */
export function capabilityAnalyze(data, lsl, usl, confidence) {
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
    sigma: r.sigma,
    n: r.n,
    CpCI: r.CpCI,
    CpkCI: r.CpkCI,
    PpCI: r.PpCI,
    PpkCI: r.PpkCI,
    ppmTotal: r.ppmTotal,
    sigmaLevel: r.sigmaLevel,
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
