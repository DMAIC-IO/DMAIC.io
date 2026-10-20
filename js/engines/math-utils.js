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

/** Iteration cap for gammainc; the series needs ~8·√a terms near x ≈ a. */
const GAMMAINC_MAX_ITER = 100000;

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
    for (let n = 1; n < GAMMAINC_MAX_ITER; n++) {
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
  for (let n = 1; n < GAMMAINC_MAX_ITER; n++) {
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

// ─── Noncentral F and t ─────────────────────────────────────

/**
 * Noncentral F CDF: P(F ≤ x) for F ~ F(df1, df2, λ).
 *
 * Poisson mixture of central beta CDFs:
 *   Σ_j Pois(j; λ/2) · I_y(df1/2 + j, df2/2),  y = df1·x / (df1·x + df2).
 * Summed outward from the Poisson mode so large λ does not underflow.
 *
 * @param {number} x
 * @param {number} df1 — Numerator df
 * @param {number} df2 — Denominator df
 * @param {number} lambda — Noncentrality parameter λ ≥ 0
 * @returns {number}
 */
export function noncentralFCDF(x, df1, df2, lambda) {
  if (x <= 0) return 0;
  if (df1 <= 0 || df2 <= 0 || lambda < 0) return NaN;
  if (lambda === 0) return fCDF(x, df1, df2);
  const y = df1 * x / (df1 * x + df2);
  const mu = lambda / 2;
  const mode = Math.floor(mu);
  const weight = j => Math.exp(-mu + j * Math.log(mu) - lnGamma(j + 1));
  const term = (j, w) => w * betaIncomplete(y, df1 / 2 + j, df2 / 2);

  const wMode = weight(mode);
  let sum = term(mode, wMode);
  // Upward: weights and beta CDFs both shrink, so stop once terms vanish.
  for (let j = mode + 1, w = wMode; j < mode + 10000; j++) {
    w *= mu / j;
    const t = term(j, w);
    sum += t;
    if (t <= 1e-16 * sum && w < 1e-16) break;
  }
  // Downward: finite, stop once the remaining Poisson mass is negligible.
  for (let j = mode - 1, w = wMode; j >= 0; j--) {
    w *= (j + 1) / mu;
    sum += term(j, w);
    if (w < 1e-17) break;
  }
  return Math.min(Math.max(sum, 0), 1);
}

/**
 * Upper normal tail Φ(−z) at full double precision, via
 * erfc(z/√2) = Q(½, z²/2). normalCDF uses A&S 7.1.26 (±1.5e-7), which is
 * too coarse for the noncentral t series.
 * @param {number} z
 * @returns {number}
 */
export function normalUpperTail(z) {
  const p = gammainc(0.5, z * z / 2);
  return z >= 0 ? 0.5 * (1 - p) : 0.5 * (1 + p);
}

/**
 * Noncentral t CDF: P(T ≤ t) for T ~ t(df, δ).
 *
 * Lenth (1989), algorithm AS 243, with Guenther's twin series over the
 * incomplete beta. t < 0 goes through the symmetry F(t; δ) = 1 − F(−t; −δ).
 * For δ beyond ≈ 37.6 the Poisson weights underflow; there the normal
 * approximation of Abramowitz & Stegun 26.7.10 is used (as R's pnt does).
 *
 * @param {number} t
 * @param {number} df — Degrees of freedom (> 0)
 * @param {number} delta — Noncentrality parameter δ
 * @returns {number}
 */
export function noncentralTCDF(t, df, delta) {
  if (!(df > 0)) return NaN;
  let tt = t, del = delta, negdel = false;
  if (t < 0) { negdel = true; tt = -t; del = -delta; }

  let tnc;
  if (del > 37.62) {
    const s = 1 / (4 * df);
    tnc = normalCDF((tt * (1 - s) - del) / Math.sqrt(1 + tt * tt * 2 * s));
    return negdel ? 1 - tnc : tnc;
  }

  tnc = 0;
  const x = tt * tt / (tt * tt + df);
  if (x > 0) {
    const lambda = del * del;
    let p = 0.5 * Math.exp(-0.5 * lambda);
    let q = Math.sqrt(2 / Math.PI) * p * del;
    let s = 0.5 - p;
    let a = 0.5;
    const b = 0.5 * df;
    const rxb = Math.pow(1 - x, b);
    const lnBetaAB = 0.5 * Math.log(Math.PI) + lnGamma(b) - lnGamma(a + b);
    let xodd = betaIncomplete(x, a, b);
    let godd = 2 * rxb * Math.exp(a * Math.log(x) - lnBetaAB);
    let xeven = 1 - rxb;
    let geven = b * x * rxb;
    tnc = p * xodd + q * xeven;
    for (let en = 1; en <= 1000; en++) {
      a += 1;
      xodd -= godd;
      xeven -= geven;
      godd *= x * (a + b - 1) / a;
      geven *= x * (a + b - 0.5) / (a + 0.5);
      p *= lambda / (2 * en);
      q *= lambda / (2 * en + 1);
      s -= p;
      tnc += p * xodd + q * xeven;
      if (2 * s * (xodd - godd) <= 1e-12) break;
    }
  }
  tnc += normalUpperTail(del);
  if (negdel) tnc = 1 - tnc;
  return Math.min(Math.max(tnc, 0), 1);
}

// ─── Studentized Range Distribution ─────────────────────────

/**
 * Standard normal tails [Φ(x), 1 − Φ(x)] to full double precision — Cody
 * (1969), as in R's pnorm_both. The exported normalCDF (A&S 7.1.26, error
 * ≈ 1.5e-7) is too coarse for the studentized range integrals.
 * @param {number} x
 * @returns {[number, number]} [lower tail, upper tail]
 */
function pnormBoth(x) {
  const y = Math.abs(x);
  if (y <= 0.67448975) {
    const a = [2.2352520354606839287, 161.02823106855587881, 1067.6894854603709582,
      18154.981253343561249, 0.065682337918207449113];
    const b = [47.20258190468824187, 976.09855173777669322, 10260.932208618978205,
      45507.789335026729956];
    let xnum = 0, xden = 0;
    if (y > 1.1102230246251565e-16) {
      const xsq = x * x;
      xnum = a[4] * xsq; xden = xsq;
      for (let i = 0; i < 3; i++) { xnum = (xnum + a[i]) * xsq; xden = (xden + b[i]) * xsq; }
    }
    const temp = x * (xnum + a[3]) / (xden + b[3]);
    return [0.5 + temp, 0.5 - temp];
  }
  if (y >= 50) return x > 0 ? [1, 0] : [0, 1];
  let temp;
  if (y <= 5.656854249492380195206754896838) {          // √32
    const c = [0.39894151208813466764, 8.8831497943883759412, 93.506656132177855979,
      597.27027639480026226, 2494.5375852903726711, 6848.1904505362823326,
      11602.651437647350124, 9842.7148383839780218, 1.0765576773720192317e-8];
    const d = [22.266688044328115691, 235.38790178262499861, 1519.377599407554805,
      6485.558298266760755, 18615.571640885098091, 34900.952721145977266,
      38912.003286093271411, 19685.429676859990727];
    let xnum = c[8] * y, xden = y;
    for (let i = 0; i < 7; i++) { xnum = (xnum + c[i]) * y; xden = (xden + d[i]) * y; }
    temp = (xnum + c[7]) / (xden + d[7]);
  } else {
    const p = [0.21589853405795699, 0.1274011611602473639, 0.022235277870649807,
      0.001421619193227893466, 2.9112874951168792e-5, 0.02307344176494017303];
    const q = [1.28426009614491121, 0.468238212480865118, 0.0659881378689285515,
      0.00378239633202758244, 7.29751555083966205e-5];
    const xsq = 1 / (x * x);
    let xnum = p[5] * xsq, xden = xsq;
    for (let i = 0; i < 4; i++) { xnum = (xnum + p[i]) * xsq; xden = (xden + q[i]) * xsq; }
    temp = xsq * (xnum + p[4]) / (xden + q[4]);
    temp = (0.398942280401432677939946059934 - temp) / y;   // 1/√(2π)
  }
  // exp(−y²/2) split so that its leading factor is exact (Cody's do_del)
  const ysq = Math.trunc(y * 16) / 16;
  const del = (y - ysq) * (y + ysq);
  const tail = Math.exp(-ysq * ysq * 0.5) * Math.exp(-del * 0.5) * temp;
  return x > 0 ? [1 - tail, tail] : [tail, 1 - tail];
}

// 12-point Gauss-Legendre half nodes/weights (inner integral, R's wprob)
const SR_XLEG = [0.981560634246719250690549090149, 0.904117256370474856678465866119,
  0.769902674194304687036893833213, 0.587317954286617447296702418941,
  0.367831498998180193752691536644, 0.125233408511468915472441369464];
const SR_ALEG = [0.047175336386511827194615961485, 0.106939325995318430960254718194,
  0.160078328543346226334652529543, 0.203167426723065921749064455810,
  0.233492536538354808760849898925, 0.249147045813402785000562436043];
// 16-point Gauss-Legendre half nodes/weights (outer integral, R's ptukey)
const SR_XLEGQ = [0.989400934991649932596154173450, 0.944575023073232576077988415535,
  0.865631202387831743880467897712, 0.755404408355003033895101194847,
  0.617876244402643748446671764049, 0.458016777657227386342419442984,
  0.281603550779258913230460501460, 0.950125098376374401853193354250e-1];
const SR_ALEGQ = [0.271524594117540948517805724560e-1, 0.622535239386478928628438369944e-1,
  0.951585116824927848099251076022e-1, 0.124628971255533872052476282192,
  0.149595988816576732081501730547, 0.169156519395002538189312079030,
  0.182603415044923588866763667969, 0.189450610455068496285396723208];

/**
 * Range distribution of k standard normals, P(R ≤ w) — R's wprob (Copenhaver
 * & Holland 1988), Hartley's form: (2Φ(w/2) − 1)^k + 2k ∫_{w/2}^{8} φ(z)
 * (Φ(z) − Φ(z − w))^{k−1} dz by 12-point Gauss-Legendre on equal intervals.
 *
 * Deviation from R: 6 intervals for w ≤ 3 and 4 for w > 3 (R: 3 and 2).
 * R's schedule loses up to ≈ 3.5e-8 relative at k = 20; the doubled schedule
 * matches SciPy to ≈ 4e-13 over the fixture grid.
 * @param {number} w — Range (> 0)
 * @param {number} k — Number of means
 * @returns {number}
 */
function rangeProb(w, k) {
  const half = w * 0.5;
  if (half >= 8) return 1;
  let pr = 2 * pnormBoth(half)[0] - 1;
  pr = pr >= Math.exp(-50 / k) ? pr ** k : 0;
  const nInt = w > 3 ? 4 : 6;
  const binc = (8 - half) / nInt;
  const k1 = k - 1;
  const minTerm = Math.exp(-30 / k1);
  let lo = half, sum = 0;
  for (let i = 0; i < nInt; i++, lo += binc) {
    const mid = lo + 0.5 * binc, hw = 0.5 * binc;
    let s = 0;
    for (let jj = 0; jj < 12; jj++) {
      const j = jj < 6 ? jj : 11 - jj;
      const z = mid + hw * (jj < 6 ? -SR_XLEG[j] : SR_XLEG[j]);
      if (z * z > 60) break;
      // Φ(z) − Φ(z − w), from the upper tails when both are close to 1
      const [lo1, up1] = pnormBoth(z);
      const [lo2, up2] = pnormBoth(z - w);
      const diff = z - w > 0 ? up2 - up1 : lo1 - lo2;
      if (diff >= minTerm) s += SR_ALEG[j] * Math.exp(-0.5 * z * z) * diff ** k1;
    }
    sum += s * (2 * hw * k) / SQRT2PI;
  }
  pr += sum;
  if (pr <= Math.exp(-30)) return 0;
  return pr >= 1 ? 1 : pr;
}

/**
 * Studentized range CDF P(Q ≤ q) for k means and df error degrees of freedom
 * (Tukey HSD, Games-Howell). After R's ptukey (Copenhaver & Holland 1988):
 * the range probability rangeProb(q·s, k) is averaged over s² ~ χ²_df / df,
 * and df > 25000 is treated as ∞.
 *
 * Deviation from R: the outer integral runs over y = ln s² (16-point
 * Gauss-Legendre panels of width min(1, √(2/df)), marched out from the mode
 * y = 0 until the remaining mass is below 1e-16) instead of R's fixed
 * schedule over 2s². This keeps the integrand smooth for df < 2, where R's
 * s^(df−2) endpoint singularity breaks the quadrature (R refuses df < 2).
 *
 * @param {number} q — Studentized range statistic
 * @param {number} k — Number of means (≥ 2)
 * @param {number} df — Error degrees of freedom (> 0, may be Infinity)
 * @returns {number} — 0 for q ≤ 0, NaN for invalid k or df
 */
export function ptukey(q, k, df) {
  if (Number.isNaN(q) || !(k >= 2) || !(df > 0)) return NaN;
  if (q <= 0) return 0;
  if (q === Infinity) return 1;
  if (df > 25000) return rangeProb(q, k);
  const f2 = df / 2;
  const c0 = f2 * Math.log(f2) - lnGamma(f2);
  const lnDens = (y) => c0 + f2 * (y - Math.exp(y));      // log density of y = ln s²
  const h = Math.min(1, Math.sqrt(2 / df));
  const panel = (y0) => {
    const mid = y0 + h / 2, hw = h / 2;
    let s = 0;
    for (let j = 0; j < 8; j++) {
      for (const y of [mid - hw * SR_XLEGQ[j], mid + hw * SR_XLEGQ[j]]) {
        const ld = lnDens(y);
        if (ld >= -40) s += SR_ALEGQ[j] * Math.exp(ld) * rangeProb(q * Math.exp(y / 2), k);
      }
    }
    return s * hw;
  };
  let sum = 0;
  // Right of the mode: remaining mass beyond y1 ≤ dens(y1) / (f2·(e^y1 − 1)).
  for (let y0 = 0; ; y0 += h) {
    sum += panel(y0);
    const y1 = y0 + h;
    if (lnDens(y1) - Math.log(f2 * (Math.exp(y1) - 1)) < -38) break;
  }
  // Left of the mode: the integrand falls monotonically; the remainder below y0
  // is ≤ dens(y0) / (f2·(1 − e^y0)) · rangeProb at y0.
  for (let y1 = 0; ; y1 -= h) {
    const y0 = y1 - h;
    sum += panel(y0);
    const rest = Math.exp(lnDens(y0)) / (f2 * (1 - Math.exp(y0))) * rangeProb(q * Math.exp(y0 / 2), k);
    if (rest <= 1e-16 * sum || rest < 1e-300) break;
  }
  return sum >= 1 ? 1 : sum;
}

/**
 * Studentized range quantile: the q with ptukey(q, k, df) = p.
 * Brackets by doubling from q = 1, then Brent-Dekker on ptukey − p until
 * |Δp| ≤ 1e-12 (not R's secant with eps = 1e-4).
 * @param {number} p — Probability (0 < p < 1)
 * @param {number} k — Number of means (≥ 2)
 * @param {number} df — Error degrees of freedom (> 0, may be Infinity)
 * @returns {number} — 0 for p ≤ 0, Infinity for p ≥ 1
 */
export function qtukey(p, k, df) {
  if (Number.isNaN(p) || !(k >= 2) || !(df > 0)) return NaN;
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  let a = 0, b = 1, fa = -p, fb = ptukey(b, k, df) - p;
  while (fb < 0) {
    a = b; fa = fb; b *= 2;
    if (b > 1e12) return Infinity;
    fb = ptukey(b, k, df) - p;
  }
  let c = a, fc = fa, d = b - a, e = d;
  for (let it = 0; it < 200; it++) {
    if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const tol = 2 * Number.EPSILON * Math.abs(b) + 1e-15;
    const m = 0.5 * (c - b);
    if (Math.abs(fb) <= 1e-12 || Math.abs(m) <= tol) return b;
    if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
      // inverse quadratic interpolation, or secant when only two points differ
      const s = fb / fa;
      let pp, qq;
      if (a === c) { pp = 2 * m * s; qq = 1 - s; }
      else {
        const r1 = fa / fc, r2 = fb / fc;
        pp = s * (2 * m * r1 * (r1 - r2) - (b - a) * (r2 - 1));
        qq = (r1 - 1) * (r2 - 1) * (s - 1);
      }
      if (pp > 0) qq = -qq; else pp = -pp;
      if (2 * pp < Math.min(3 * m * qq - Math.abs(tol * qq), Math.abs(e * qq))) { e = d; d = pp / qq; }
      else { d = m; e = m; }
    } else { d = m; e = m; }
    a = b; fa = fb;
    b += Math.abs(d) > tol ? d : (m > 0 ? tol : -tol);
    fb = ptukey(b, k, df) - p;
  }
  return b;
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
