/**
 * D.Mike — Math Utilities (math-utils.js)
 *
 * Single source of truth for low-level mathematical functions used across
 * all engine modules: error function, normal distribution, gamma/beta
 * functions, and distribution CDFs/quantiles.
 *
 * Every engine imports from here — no local copies.
 */

// ─── Constants ──────────────────────────────────────────────

const LN_SQRT2PI = 0.5 * Math.log(2 * Math.PI);
const SQRT2PI    = Math.sqrt(2 * Math.PI);

// ─── Error Function ─────────────────────────────────────────

/**
 * Error function erf(x) — Abramowitz & Stegun 7.1.26.
 * Maximum absolute error ≈ 1.5 × 10⁻⁷.
 * @param {number} x
 * @returns {number}
 */
export function erf(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const s = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + p * ax);
  return s * (1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax));
}

/**
 * Complementary error function erfc(x) — Horner form (Chebyshev).
 * Better tail precision than 1 − erf(x).
 * @param {number} x
 * @returns {number}
 */
export function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 +
    t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 +
    t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

// ─── Gamma Function ─────────────────────────────────────────

/**
 * Natural log of the gamma function — Lanczos approximation (g = 7, n = 9).
 * @param {number} z
 * @returns {number}
 */
export function lnGamma(z) {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  const zz = z - 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (zz + i);
  const t = zz + 7.5;
  return LN_SQRT2PI + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Gamma function Γ(z).
 * @param {number} z
 * @returns {number}
 */
export function gammaFn(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  return Math.exp(lnGamma(z));
}

/**
 * Digamma function ψ(x) = d/dx ln Γ(x).
 *
 * Strategy: reflection for x ≤ 0, recurrence ψ(x) = ψ(x+1) − 1/x to push
 * x ≥ 10, then asymptotic Stirling series:
 *   ψ(x) ≈ ln x − 1/(2x) − Σ B_{2n} / (2n · x^{2n})
 * with Bernoulli numbers B₂=1/6, B₄=−1/30, B₆=1/42, B₈=−1/30.
 *
 * Accuracy < 2e-12 for x > 0; reflection adds the standard pole at integers ≤ 0.
 * @param {number} x
 * @returns {number}
 */
export function digamma(x) {
  if (x <= 0) {
    if (x === Math.floor(x)) return NaN;
    return digamma(1 - x) - Math.PI / Math.tan(Math.PI * x);
  }
  let r = 0;
  let xv = x;
  while (xv < 10) { r -= 1 / xv; xv += 1; }
  const xx = 1 / (xv * xv);
  r += Math.log(xv) - 0.5 / xv
     - xx * (1 / 12 - xx * (1 / 120 - xx * (1 / 252 - xx * (1 / 240))));
  return r;
}

// ─── Incomplete Gamma ───────────────────────────────────────

/**
 * Regularized lower incomplete gamma P(a, x) — series + Lentz CF.
 * Uses series expansion for x < a + 1, continued fraction otherwise.
 * @param {number} a
 * @param {number} x
 * @returns {number}
 */
export function gammainc(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    // Series expansion
    let s = 1 / a, t = 1 / a;
    for (let n = 1; n < 300; n++) {
      t *= x / (a + n);
      s += t;
      if (Math.abs(t) < Math.abs(s) * 1e-14) break;
    }
    return s * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  // Lentz continued fraction for upper tail Q(a, x), return P = 1 − Q
  let D = 1 / (x + 1 - a);
  if (Math.abs(D) < 1e-30) D = 1e-30;
  let C = 1e30, h = D;
  for (let n = 1; n < 300; n++) {
    const an = -n * (n - a), bn = x + 2 * n + 1 - a;
    D = bn + an * D; if (Math.abs(D) < 1e-30) D = 1e-30;
    C = bn + an / C; if (Math.abs(C) < 1e-30) C = 1e-30;
    D = 1 / D;
    const delta = C * D;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return 1 - h * Math.exp(-x + a * Math.log(x) - lnGamma(a));
}

// ─── Incomplete Beta ────────────────────────────────────────

/**
 * Log-beta function ln B(a, b).
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function lnBeta(a, b) {
  return lnGamma(a) + lnGamma(b) - lnGamma(a + b);
}

/**
 * Regularized incomplete beta I_x(a, b) — Lentz continued fraction
 * with symmetry relation for convergence.
 * @param {number} x
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function betaIncomplete(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - betaIncomplete(1 - x, b, a);
  }
  const bt = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta(a, b));
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, D = 1 - qab * x / qap;
  if (Math.abs(D) < 1e-30) D = 1e-30;
  D = 1 / D;
  let h = D;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    D = 1 + aa * D; if (Math.abs(D) < 1e-30) D = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    D = 1 / D; h *= D * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    D = 1 + aa * D; if (Math.abs(D) < 1e-30) D = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    D = 1 / D; h *= D * c;
    if (Math.abs(D * c - 1) < 1e-14) break;
  }
  return bt * h / a;
}

// ─── Normal Distribution ────────────────────────────────────

/**
 * Standard normal CDF Φ(x) with optional location/scale.
 * @param {number} x
 * @param {number} [mu=0] — Mean
 * @param {number} [sigma=1] — Standard deviation
 * @returns {number}
 */
export function normalCDF(x, mu = 0, sigma = 1) {
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
}

/**
 * Standard normal PDF φ(x) with optional location/scale.
 * @param {number} x
 * @param {number} [mu=0] — Mean
 * @param {number} [sigma=1] — Standard deviation
 * @returns {number}
 */
export function normalPDF(x, mu = 0, sigma = 1) {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * SQRT2PI);
}

/**
 * Inverse normal CDF (quantile) — Beasley-Springer-Moro / Acklam algorithm.
 * @param {number} p — Probability (0 < p < 1)
 * @returns {number}
 */
export function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00,
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01,
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
    4.374664141464968e+00, 2.938163982698783e+00,
  ];
  const d = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00,
  ];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } if (p <= pHigh) {
    q = p - 0.5;
    const r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) * q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } 
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  
}

// ─── Chi-Squared Distribution ───────────────────────────────

/**
 * Chi-squared CDF: P(X ≤ x).
 * @param {number} x
 * @param {number} df — Degrees of freedom
 * @returns {number}
 */
export function chi2CDF(x, df) {
  return x <= 0 ? 0 : gammainc(df / 2, x / 2);
}

/**
 * Chi-squared PDF.
 * @param {number} x
 * @param {number} df
 * @returns {number}
 */
export function chi2PDF(x, df) {
  if (x <= 0) return 0;
  return Math.exp((df / 2 - 1) * Math.log(x) - x / 2 - (df / 2) * Math.log(2) - lnGamma(df / 2));
}

/**
 * Chi-squared inverse (quantile) — Newton-Raphson with Wilson-Hilferty start.
 * @param {number} p
 * @param {number} df
 * @returns {number}
 */
export function chi2Inv(p, df) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  let x = Math.max(0.01, df * Math.pow(1 - 2 / (9 * df) + normalQuantile(p) * Math.sqrt(2 / (9 * df)), 3));
  for (let i = 0; i < 60; i++) {
    const c = chi2CDF(x, df), pd = chi2PDF(x, df);
    if (pd < 1e-30) break;
    const dx = (c - p) / pd;
    x = Math.max(1e-6, x - dx);
    if (Math.abs(dx) < 1e-10) break;
  }
  return x;
}

// ─── Student's t Distribution ───────────────────────────────

/**
 * Student's t PDF.
 * @param {number} x
 * @param {number} df
 * @returns {number}
 */
export function tPDF(x, df) {
  return Math.exp(lnGamma((df + 1) / 2) - lnGamma(df / 2)) /
    (Math.sqrt(df * Math.PI) * Math.pow(1 + x * x / df, (df + 1) / 2));
}

/**
 * Student's t CDF: P(T ≤ t).
 * @param {number} t
 * @param {number} df
 * @returns {number}
 */
export function tCDF(t, df) {
  if (df <= 0) return NaN;
  const w = df / (df + t * t);
  const ib = betaIncomplete(w, df / 2, 0.5);
  return t >= 0 ? 0.5 + 0.5 * (1 - ib) : 0.5 * ib;
}

/**
 * Student's t inverse (quantile) — Newton-Raphson.
 * @param {number} p
 * @param {number} df
 * @returns {number}
 */
export function tInv(p, df) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  let x = normalQuantile(p);
  for (let i = 0; i < 80; i++) {
    const c = tCDF(x, df), pd = tPDF(x, df);
    if (pd < 1e-30) break;
    const dx = (c - p) / pd;
    x -= dx;
    if (Math.abs(dx) < 1e-12) break;
  }
  return x;
}

/**
 * Two-tailed p-value from t-statistic: P(|T| > |t|).
 * @param {number} t
 * @param {number} df
 * @returns {number}
 */
export function tPValue(t, df) {
  const x = df / (df + t * t);
  return betaIncomplete(x, df / 2, 0.5);
}

// ─── F Distribution ─────────────────────────────────────────

/**
 * F-distribution CDF: P(F ≤ f).
 * @param {number} f
 * @param {number} d1 — Numerator df
 * @param {number} d2 — Denominator df
 * @returns {number}
 */
export function fCDF(f, d1, d2) {
  if (f <= 0) return 0;
  if (d1 <= 0 || d2 <= 0) return NaN;
  return betaIncomplete(d1 * f / (d1 * f + d2), d1 / 2, d2 / 2);
}

/**
 * F-distribution PDF.
 * @param {number} f
 * @param {number} d1
 * @param {number} d2
 * @returns {number}
 */
export function fPDF(f, d1, d2) {
  if (f <= 0) return 0;
  return Math.exp(
    (d1 / 2) * Math.log(d1) + (d2 / 2) * Math.log(d2) +
    (d1 / 2 - 1) * Math.log(f) - ((d1 + d2) / 2) * Math.log(d1 * f + d2) -
    lnBeta(d1 / 2, d2 / 2)
  );
}

/**
 * F-distribution upper-tail p-value: P(F > f).
 * @param {number} f
 * @param {number} d1
 * @param {number} d2
 * @returns {number}
 */
export function fPValue(f, d1, d2) {
  if (f <= 0) return 1;
  const x = d2 / (d2 + d1 * f);
  return betaIncomplete(x, d2 / 2, d1 / 2);
}

/**
 * F-distribution inverse (quantile) — bisection.
 * @param {number} p — CDF probability (e.g. 0.95)
 * @param {number} d1
 * @param {number} d2
 * @returns {number}
 */
export function fQuantile(p, d1, d2) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  let lo = 1e-10, hi = 1;
  while (fCDF(hi, d1, d2) < p) { hi *= 5; if (hi > 1e12) return hi; }
  while (fCDF(lo, d1, d2) > p) { lo /= 5; if (lo < 1e-15) return lo; }
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (hi - lo < 1e-12 * mid) break;
    if (fCDF(mid, d1, d2) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Unified dispatcher for Algorithm Lab and fixture replay.
 * Routes {function, ...args} to the corresponding math-utils function
 * and returns {result}. Mirrors tests/engines/math-utils.test.js DISPATCH.
 *
 * @param {{function: string, [key: string]: any}} inputs
 * @returns {{result: number}}
 */
export function evaluate(inputs) {
  if (!inputs || typeof inputs.function !== 'string') {
    throw new Error('evaluate: inputs.function (string) is required');
  }
  const fn = inputs.function;
  let result;
  switch (fn) {
    case 'erf':            result = erf(inputs.x); break;
    case 'normalCDF':      result = normalCDF(inputs.x, inputs.mu, inputs.sigma); break;
    case 'normalQuantile': result = normalQuantile(inputs.p); break;
    case 'lnGamma':        result = lnGamma(inputs.x); break;
    case 'chi2CDF':        result = chi2CDF(inputs.x, inputs.df); break;
    case 'chi2Inv':        result = chi2Inv(inputs.p, inputs.df); break;
    case 'tCDF':           result = tCDF(inputs.t, inputs.df); break;
    case 'tInv':           result = tInv(inputs.p, inputs.df); break;
    case 'fCDF':           result = fCDF(inputs.x, inputs.dfn, inputs.dfd); break;
    case 'fPValue':        result = fPValue(inputs.f, inputs.d1, inputs.d2); break;
    case 'fQuantile':      result = fQuantile(inputs.p, inputs.d1, inputs.d2); break;
    default:
      throw new Error(`evaluate: unknown function '${fn}'`);
  }
  return { result };
}
