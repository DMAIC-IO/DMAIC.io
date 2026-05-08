/**
 * D.Mike — Generalized Linear Models Engine (glm-engine.js)
 *
 * Pure-math library for GLM regression (no DOM, no side effects).
 * Supports binomial (logit), Poisson (log), negative binomial (log).
 *
 * Uses IRLS (Iteratively Reweighted Least Squares) as universal solver.
 * Reuses linear algebra primitives from regression-engine.js.
 *
 * @module glm-engine
 */

import { matInverse } from './regression-engine.js';
import { normalCDF, normalQuantile, chi2CDF, lnGamma, digamma } from './math-utils.js';
import { mean } from './stats-utils.js';

// ── Numerical helpers ─────────────────────────────────────────────

const EPSILON = 1e-10;
const ETA_CLIP = 30;

function clip(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function sum(arr) { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i]; return s; }
function logSafe(x) { return Math.log(Math.max(x, 1e-300)); }

// ── GLM Families ──────────────────────────────────────────────────

/**
 * @typedef {Object} GLMFamily
 * @property {string} name
 * @property {string} link
 * @property {(mu: number) => number} variance
 * @property {(mu: number) => number} linkFn
 * @property {(eta: number) => number} linkInv
 * @property {(eta: number) => number} dLinkInv
 * @property {(y: number, mu: number, weight?: number) => number} devResidUnit
 *   Weight defaults to 1; for proportion/grouped binomial, pass the trial count.
 * @property {(y: number[], mu: number[], weights?: number[]) => number} logLik
 *   Weights default to 1; aggregated/grouped data scale per-observation contributions.
 */

export function binomial(link = 'logit') {
  if (link !== 'logit') {
    // The variance / linkInv / linkFn formulas below are hard-coded for the
    // logit link. Other links (probit, cloglog) need their own implementations
    // before they can be exposed — fail loudly rather than silently misuse logit.
    throw new Error(`binomial(link='${link}') not supported — only 'logit' is implemented`);
  }
  return {
    name: 'binomial',
    link,
    variance(mu) { return mu * (1 - mu); },
    linkFn(mu) { return Math.log(clip(mu, EPSILON, 1 - EPSILON) / (1 - clip(mu, EPSILON, 1 - EPSILON))); },
    linkInv(eta) { const e = clip(eta, -ETA_CLIP, ETA_CLIP); return 1 / (1 + Math.exp(-e)); },
    dLinkInv(eta) { const mu = this.linkInv(eta); return mu * (1 - mu); },
    devResidUnit(y, mu, weight = 1) {
      const mc = clip(mu, EPSILON, 1 - EPSILON);
      let d = 0;
      if (y > 0) d += y * logSafe(y / mc);
      if (y < 1) d += (1 - y) * logSafe((1 - y) / (1 - mc));
      return 2 * weight * d;
    },
    logLik(y, mu, weights) {
      // Grouped binomial log-likelihood. For weights[i] = n_i trials with
      // y_i = successes/n_i, we include the binomial coefficient
      // log C(n_i, n_i·y_i) = lnΓ(n+1) − lnΓ(s+1) − lnΓ(n−s+1) so AIC/BIC
      // match the standard glm(cbind(s, n−s) ~ x) formulation. For n_i = 1
      // (Bernoulli) the coefficient vanishes.
      let ll = 0;
      for (let i = 0; i < y.length; i++) {
        const w = weights ? weights[i] : 1;
        const mc = clip(mu[i], EPSILON, 1 - EPSILON);
        ll += w * (y[i] * logSafe(mc) + (1 - y[i]) * logSafe(1 - mc));
        if (weights && w > 1) {
          const s = w * y[i];
          ll += lnGamma(w + 1) - lnGamma(s + 1) - lnGamma(w - s + 1);
        }
      }
      return ll;
    },
  };
}

export function poisson(link = 'log') {
  return {
    name: 'poisson',
    link,
    variance(mu) { return mu; },
    linkFn(mu) { return Math.log(Math.max(mu, EPSILON)); },
    linkInv(eta) { return Math.exp(clip(eta, -ETA_CLIP, ETA_CLIP)); },
    dLinkInv(eta) { return Math.exp(clip(eta, -ETA_CLIP, ETA_CLIP)); },
    devResidUnit(y, mu, weight = 1) {
      const mc = Math.max(mu, EPSILON);
      if (y === 0) return 2 * weight * mc;
      return 2 * weight * (y * logSafe(y / mc) - (y - mc));
    },
    logLik(y, mu, weights) {
      let ll = 0;
      for (let i = 0; i < y.length; i++) {
        const w = weights ? weights[i] : 1;
        const mc = Math.max(mu[i], EPSILON);
        ll += w * (y[i] * logSafe(mc) - mc - lnGamma(y[i] + 1));
      }
      return ll;
    },
  };
}

export function negbin(link = 'log', theta = null) {
  return {
    name: 'negbin',
    link,
    theta,
    variance(mu) { const t = this.theta || 1; return mu + mu * mu / t; },
    linkFn(mu) { return Math.log(Math.max(mu, EPSILON)); },
    linkInv(eta) { return Math.exp(clip(eta, -ETA_CLIP, ETA_CLIP)); },
    dLinkInv(eta) { return Math.exp(clip(eta, -ETA_CLIP, ETA_CLIP)); },
    devResidUnit(y, mu, weight = 1) {
      const t = this.theta || 1;
      const mc = Math.max(mu, EPSILON);
      let d = 0;
      if (y > 0) d += y * logSafe(y / mc);
      d -= (y + t) * logSafe((y + t) / (mc + t));
      return 2 * weight * d;
    },
    logLik(y, mu, weights) {
      const t = this.theta || 1;
      let ll = 0;
      for (let i = 0; i < y.length; i++) {
        const w = weights ? weights[i] : 1;
        const mc = Math.max(mu[i], EPSILON);
        ll += w * (lnGamma(y[i] + t) - lnGamma(t) - lnGamma(y[i] + 1)
                + t * logSafe(t / (mc + t)) + y[i] * logSafe(mc / (mc + t)));
      }
      return ll;
    },
  };
}

export const families = { binomial, poisson, negbin };

// ── Weighted OLS sub-step ─────────────────────────────────────────

/**
 * Solve weighted least squares: (X'WX)β = X'Wz
 * @param {number[][]} X - n×p design matrix
 * @param {number[]} z - n-vector pseudo-response
 * @param {number[]} w - n-vector IRLS weights (> 0)
 * @returns {{ beta: number[], XtWX: number[][], invXtWX: number[][]|null }}
 */
function weightedOLS(X, z, w) {
  const n = X.length;
  const p = X[0].length;

  const XtWX = Array.from({ length: p }, () => new Float64Array(p));
  const XtWz = new Float64Array(p);

  for (let i = 0; i < n; i++) {
    const wi = w[i];
    if (wi <= 0) continue;
    for (let j = 0; j < p; j++) {
      const xw = X[i][j] * wi;
      XtWz[j] += xw * z[i];
      for (let k = j; k < p; k++) {
        XtWX[j][k] += xw * X[i][k];
      }
    }
  }
  for (let j = 0; j < p; j++) {
    for (let k = 0; k < j; k++) {
      XtWX[j][k] = XtWX[k][j];
    }
  }

  const XtWXArr = Array.from(XtWX, row => Array.from(row));
  const inv = matInverse(XtWXArr);
  if (!inv) return { beta: null, XtWX: XtWXArr, invXtWX: null };

  const beta = new Array(p);
  for (let j = 0; j < p; j++) {
    let s = 0;
    for (let k = 0; k < p; k++) s += inv[j][k] * XtWz[k];
    beta[j] = s;
  }
  return { beta, XtWX: XtWXArr, invXtWX: inv };
}

// ── IRLS Solver ───────────────────────────────────────────────────

/**
 * Fit a GLM using Iteratively Reweighted Least Squares.
 *
 * @param {number[][]} X - n×p design matrix (with intercept column)
 * @param {number[]} y - n-vector response
 * @param {Object} opts
 * @param {GLMFamily} opts.family
 * @param {number} [opts.maxIter=50]
 * @param {number} [opts.tol=1e-8]
 * @param {number[]} [opts.startBeta]
 * @param {number[]} [opts.priorWeights] - optional prior weights (e.g. trial
 *   counts for grouped binomial). Multiplies into the IRLS weight: w_i =
 *   priorWeight_i · (dμ/dη)² / Var(μ_i). Defaults to 1 per observation.
 * @returns {Object} GLM fit result
 */
function irlsSolve(X, y, { family, maxIter = 50, tol = 1e-8, startBeta = null, priorWeights = null }) {
  const n = X.length;
  const p = X[0].length;

  let beta = startBeta ? [...startBeta] : new Array(p).fill(0);

  if (!startBeta && family.name === 'binomial') {
    const yBar = clip(mean(y), 0.01, 0.99);
    beta[0] = family.linkFn(yBar);
  } else if (!startBeta && (family.name === 'poisson' || family.name === 'negbin')) {
    // For very small means (many zeros), log(mean) drops near −∞ and the
    // first IRLS step overshoots. log(mean + 0.5) is the standard small-count
    // smoothing (Anscombe / Cox correction).
    const yMean = mean(y);
    const yBar = yMean < 0.1 ? yMean + 0.5 : Math.max(yMean, 0.01);
    beta[0] = family.linkFn(yBar);
  }

  let devOld = Infinity;
  let converged = false;
  let iterations = 0;
  let lastInv = null;
  let lastXtWX = null;
  let lastW = null;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;

    const eta = new Array(n);
    const mu = new Array(n);
    const w = new Array(n);
    const z = new Array(n);

    for (let i = 0; i < n; i++) {
      let e = 0;
      for (let j = 0; j < p; j++) e += X[i][j] * beta[j];
      eta[i] = e;
      mu[i] = family.linkInv(e);
      const dmu = family.dLinkInv(e);
      const v = family.variance(mu[i]);
      const pw = priorWeights ? priorWeights[i] : 1;
      w[i] = pw * (dmu * dmu) / Math.max(v, EPSILON);
      z[i] = e + (y[i] - mu[i]) / Math.max(dmu, EPSILON);
    }

    const { beta: betaNew, XtWX, invXtWX } = weightedOLS(X, z, w);
    if (!betaNew || !invXtWX) {
      return { converged: false, iterations, error: 'singular', beta, invXtWX: lastInv, XtWX: lastXtWX, weights: lastW };
    }

    let dev = 0;
    for (let i = 0; i < n; i++) {
      let eNew = 0;
      for (let j = 0; j < p; j++) eNew += X[i][j] * betaNew[j];
      const muNew = family.linkInv(eNew);
      const pw = priorWeights ? priorWeights[i] : 1;
      dev += family.devResidUnit(y[i], muNew, pw);
    }

    // Convergence: deviance change AND coefficient change must both be small.
    // Deviance alone can plateau while β still drifts (Wood 2017, §3.1.2);
    // β alone can flag convergence on a flat likelihood ridge.
    const relChangeDev = Math.abs(dev - devOld) / (Math.abs(devOld) + 0.1);
    let maxBetaChange = 0;
    for (let j = 0; j < p; j++) {
      const d = Math.abs(betaNew[j] - beta[j]) / (Math.abs(beta[j]) + 1e-8);
      if (d > maxBetaChange) maxBetaChange = d;
    }

    beta = betaNew;
    lastInv = invXtWX;
    lastXtWX = XtWX;
    lastW = w;
    devOld = dev;

    if (relChangeDev < tol && maxBetaChange < tol) {
      converged = true;
      break;
    }
    // Plateau bypass: deviance is essentially flat. Happens for degenerate
    // data (constant y) and at the η-clip boundary, where β keeps drifting
    // but the model is already at its asymptote — no information left to
    // fit. Without this, the AND criterion above would loop until maxIter.
    if (relChangeDev < 1e-12) {
      converged = true;
      break;
    }
  }

  return { converged, iterations, beta, invXtWX: lastInv, XtWX: lastXtWX, deviance: devOld, weights: lastW };
}

// ── Negative Binomial theta estimation ────────────────────────────

/**
 * Estimate the NegBin dispersion θ via score-equation bisection within an
 * outer IRLS loop on β. Returns convergence info so callers can flag
 * unreliable θ estimates.
 *
 * Failure modes flagged with `converged: false`:
 *  - score has the same sign at both bracket endpoints (data are near-Poisson
 *    so the score is monotone over the search interval, or extreme over-
 *    dispersion that exceeds the upper bound)
 *  - inner IRLS fails to converge for the trial θ
 *  - outer loop exhausts maxOuter without θ-stability
 *
 * @returns {{ theta: number, converged: boolean, iterations: number, reason?: string }}
 */
function estimateTheta(X, y, betaInit, maxOuter = 20) {
  const THETA_LO = 0.01;
  const THETA_HI = 1000;
  let theta = 1;
  let betaCurr = betaInit ? [...betaInit] : null;
  let outerIter = 0;

  // Build a scoreTheta closure parameterised by the current μ vector. The
  // sum is the standard NB2 score equation
  //   ∂ℓ/∂θ = Σ [ψ(y+θ) − ψ(θ) + log(θ/(μ+θ)) + (μ−y)/(μ+θ)]
  // (R MASS::theta.ml, statsmodels). Sign on (μ−y) matters: an earlier
  // version of this code had it flipped, which biased θ̂ by ~3% in the
  // moderate-overdispersion regime.
  const n = y.length;
  const buildScore = (mu) => (th) => {
    let s = 0;
    const psiTh = digamma(th);
    for (let i = 0; i < n; i++) {
      s += digamma(y[i] + th) - psiTh + logSafe(th / (mu[i] + th)) + (mu[i] - y[i]) / (mu[i] + th);
    }
    return s;
  };

  // One-shot bracket check using the Poisson-fitted μ (stable, no NB-θ bias).
  // If the score has the same sign at both ends, the MLE is outside the
  // search interval and bisection would silently return a boundary value.
  if (betaInit) {
    const muPois = new Array(n);
    for (let i = 0; i < n; i++) {
      let e = 0;
      for (let j = 0; j < X[i].length; j++) e += X[i][j] * betaInit[j];
      muPois[i] = Math.exp(clip(e, -ETA_CLIP, ETA_CLIP));
    }
    const sLo = buildScore(muPois)(THETA_LO);
    const sHi = buildScore(muPois)(THETA_HI);
    // Tolerance: only flag when both ends are clearly the same sign. The
    // score asymptotes to 0 as θ → ∞, so a small positive value at hi is
    // expected even when the MLE is finite — require |sHi| > tol.
    const tolHi = 0.1;
    if (sLo > tolHi && sHi > tolHi) {
      return { theta: THETA_HI, converged: false, iterations: 0, reason: 'theta unbracketed: data are near-Poisson, MLE θ → ∞' };
    }
    if (sLo < -tolHi && sHi < -tolHi) {
      return { theta: THETA_LO, converged: false, iterations: 0, reason: 'theta unbracketed: extreme overdispersion, MLE θ → 0' };
    }
  }

  for (let outer = 0; outer < maxOuter; outer++) {
    outerIter = outer + 1;
    const fam = negbin('log', theta);
    const fit = irlsSolve(X, y, { family: fam, maxIter: 30, startBeta: betaCurr });
    if (!fit.converged && fit.iterations >= 30) {
      return { theta, converged: false, iterations: outerIter, reason: 'inner IRLS did not converge' };
    }
    betaCurr = fit.beta;

    const mu = new Array(n);
    for (let i = 0; i < n; i++) {
      let e = 0;
      for (let j = 0; j < X[i].length; j++) e += X[i][j] * betaCurr[j];
      mu[i] = Math.exp(clip(e, -ETA_CLIP, ETA_CLIP));
    }
    const scoreTheta = buildScore(mu);

    let lo = THETA_LO, hi = THETA_HI;
    for (let bisect = 0; bisect < 60; bisect++) {
      const mid = (lo + hi) / 2;
      if (scoreTheta(mid) > 0) lo = mid; else hi = mid;
      if (hi - lo < 1e-6) break;
    }
    const newTheta = (lo + hi) / 2;

    if (Math.abs(newTheta - theta) / (theta + 0.1) < 1e-4) {
      return { theta: newTheta, converged: true, iterations: outerIter };
    }
    theta = newTheta;
  }

  return { theta, converged: false, iterations: outerIter, reason: 'outer loop exhausted without theta stability' };
}

// ── Public API: fitGLM ────────────────────────────────────────────

/**
 * Fit a Generalized Linear Model.
 *
 * @param {number[][]} X - n×p design matrix (must include intercept column)
 * @param {number[]} y - n-vector response
 * @param {Object} opts
 * @param {'binomial'|'poisson'|'negbin'} opts.familyName
 * @param {'logit'|'log'} [opts.link]
 * @param {number} [opts.theta] - NegBin dispersion (auto-estimated if omitted)
 * @param {number} [opts.maxIter=50]
 * @param {number} [opts.tol=1e-8]
 * @param {string[]} [opts.terms] - Term labels
 * @param {number} [opts.confLevel=0.95]
 * @returns {Object} GLM fit result
 */
export function fitGLM(X, y, opts = {}) {
  const n = X.length;
  const p = X[0].length;
  const confLevel = opts.confLevel ?? 0.95;

  // Prior weights (e.g. trial counts for grouped binomial). Default 1 per obs.
  const priorWeights = opts.weights && opts.weights.length === n ? opts.weights : null;

  let family;
  let thetaEstimated = false;
  let thetaConverged = true;
  let thetaReason = null;
  if (opts.familyName === 'binomial') {
    family = binomial(opts.link || 'logit');
  } else if (opts.familyName === 'poisson') {
    family = poisson(opts.link || 'log');
  } else if (opts.familyName === 'negbin') {
    if (opts.theta != null) {
      family = negbin(opts.link || 'log', opts.theta);
    } else {
      const poisFit = irlsSolve(X, y, { family: poisson('log'), maxIter: 30, priorWeights });
      const tEst = estimateTheta(X, y, poisFit.beta);
      family = negbin(opts.link || 'log', tEst.theta);
      thetaEstimated = true;
      thetaConverged = tEst.converged;
      thetaReason = tEst.reason || null;
    }
  } else {
    throw new Error(`Unknown family: ${opts.familyName}`);
  }

  const fit = irlsSolve(X, y, {
    family,
    maxIter: opts.maxIter ?? 50,
    tol: opts.tol ?? 1e-8,
    priorWeights,
  });

  if (!fit.converged && !fit.invXtWX) {
    return {
      converged: false,
      iterations: fit.iterations,
      error: fit.error || 'convergence',
      family: { name: family.name, link: family.link },
    };
  }

  const beta = fit.beta;
  const eta = new Array(n);
  const mu = new Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = 0; j < p; j++) e += X[i][j] * beta[j];
    eta[i] = e;
    mu[i] = family.linkInv(e);
  }

  const deviance = fit.deviance;

  // Null model: weighted mean of y for grouped binomial; otherwise simple mean.
  const nullMu = priorWeights
    ? (() => {
        let sumWY = 0, sumW = 0;
        for (let i = 0; i < n; i++) { sumWY += priorWeights[i] * y[i]; sumW += priorWeights[i]; }
        return sumW > 0 ? sumWY / sumW : mean(y);
      })()
    : mean(y);
  let nullDeviance = 0;
  for (let i = 0; i < n; i++) {
    const pw = priorWeights ? priorWeights[i] : 1;
    nullDeviance += family.devResidUnit(y[i], Math.max(nullMu, EPSILON), pw);
  }

  const logLik = family.logLik(y, mu, priorWeights);
  const nullLogLik = family.logLik(y, new Array(n).fill(Math.max(nullMu, EPSILON)), priorWeights);

  // AIC/BIC: count θ as a free parameter when it was estimated, not when
  // the caller fixed it. For binomial / Poisson / fixed-θ NegBin the model
  // has p coefficients; estimated-θ NegBin adds one.
  const kParams = p + (thetaEstimated ? 1 : 0);
  const aic = -2 * logLik + 2 * kParams;
  const bic = -2 * logLik + Math.log(n) * kParams;

  const pseudo = pseudoR2(deviance, nullDeviance, logLik, nullLogLik, n, p);

  // Pearson + deviance residuals (needed for dispersion estimation).
  // For grouped binomial: variance becomes Var(y) = μ(1−μ)/w, so the Pearson
  // residual is √w·(y−μ)/√(μ(1−μ)). Deviance residuals carry the √w factor
  // through the unit-deviance formula.
  const devianceResid = new Array(n);
  const pearsonResid = new Array(n);
  for (let i = 0; i < n; i++) {
    const pw = priorWeights ? priorWeights[i] : 1;
    const d = family.devResidUnit(y[i], mu[i], pw);
    devianceResid[i] = Math.sign(y[i] - mu[i]) * Math.sqrt(Math.max(d, 0));
    const v = family.variance(mu[i]);
    pearsonResid[i] = Math.sqrt(pw) * (y[i] - mu[i]) / Math.sqrt(Math.max(v, EPSILON));
  }

  // Dispersion: φ = 1 by default for all families. When opts.estimateDispersion
  // is set (quasi-likelihood), we estimate φ_hat = Σ r_p² / df from the Pearson
  // residuals and rescale SE / z / p / CI accordingly. NegBin already absorbs
  // overdispersion via θ, so opts.estimateDispersion has no effect there.
  let dispersion = 1;
  if (opts.estimateDispersion && family.name !== 'negbin') {
    const df = n - p;
    if (df > 0) {
      let chi2 = 0;
      for (let i = 0; i < n; i++) chi2 += pearsonResid[i] * pearsonResid[i];
      dispersion = chi2 / df;
    }
  }
  const seScale = Math.sqrt(Math.max(dispersion, 0));

  const inv = fit.invXtWX;
  const stdErrors = new Array(p);
  const zValues = new Array(p);
  const pValues = new Array(p);

  for (let j = 0; j < p; j++) {
    stdErrors[j] = Math.sqrt(Math.max(inv[j][j], 0)) * seScale;
    zValues[j] = stdErrors[j] > 0 ? beta[j] / stdErrors[j] : 0;
    pValues[j] = 2 * (1 - normalCDF(Math.abs(zValues[j])));
  }

  const zCrit = normalQuantile((1 + confLevel) / 2);
  const ciLower = beta.map((b, j) => b - zCrit * stdErrors[j]);
  const ciUpper = beta.map((b, j) => b + zCrit * stdErrors[j]);

  let oddsRatios = null;
  let rateRatios = null;
  if (family.name === 'binomial' && family.link === 'logit') {
    oddsRatios = beta.map((b, j) => ({
      or: Math.exp(b),
      lower: Math.exp(ciLower[j]),
      upper: Math.exp(ciUpper[j]),
    }));
  }
  if ((family.name === 'poisson' || family.name === 'negbin') && family.link === 'log') {
    rateRatios = beta.map((b, j) => ({
      rr: Math.exp(b),
      lower: Math.exp(ciLower[j]),
      upper: Math.exp(ciUpper[j]),
    }));
  }

  const terms = opts.terms || Array.from({ length: p }, (_, i) => i === 0 ? 'Intercept' : `X${i}`);

  const separationDetected = family.name === 'binomial' && (
    fit.iterations >= (opts.maxIter ?? 50) - 1 ||
    beta.some(b => Math.abs(b) > 15)
  );

  // Stronger separation flag: η drove against the ETA_CLIP boundary AND the
  // IRLS weights span > 8 orders of magnitude. The first heuristic catches
  // intercept-driven cases; this catches genuine perfect/quasi-complete
  // separation where one or more |η_i| pegs at the clip and W spreads.
  let etaMaxAbs = 0;
  for (let i = 0; i < n; i++) if (Math.abs(eta[i]) > etaMaxAbs) etaMaxAbs = Math.abs(eta[i]);
  let weightRatio = 1;
  if (fit.weights && fit.weights.length > 0) {
    let wMin = Infinity, wMax = 0;
    for (let i = 0; i < fit.weights.length; i++) {
      const w = fit.weights[i];
      if (w > 0 && w < wMin) wMin = w;
      if (w > wMax) wMax = w;
    }
    weightRatio = wMin > 0 ? wMax / wMin : Infinity;
  }
  const separationStrong = family.name === 'binomial' &&
    etaMaxAbs > 25 &&
    (fit.iterations >= 5) &&
    (weightRatio > 1e8 || fit.iterations >= (opts.maxIter ?? 50) - 1);

  return {
    converged: fit.converged,
    iterations: fit.iterations,
    coefficients: beta,
    stdErrors,
    zValues,
    pValues,
    ciLower,
    ciUpper,
    confLevel,
    oddsRatios,
    rateRatios,
    deviance,
    nullDeviance,
    logLikelihood: logLik,
    aic,
    bic,
    pseudoR2: pseudo,
    dispersion,
    fittedValues: mu,
    linearPredictor: eta,
    devianceResiduals: devianceResid,
    pearsonResiduals: pearsonResid,
    terms,
    family: { name: family.name, link: family.link, theta: family.theta || null },
    n,
    p,
    X,
    y,
    invXtWX: inv,
    XtWX: fit.XtWX,
    irlsWeights: fit.weights,
    separationDetected,
    separationStrong,
    thetaEstimated,
    thetaConverged,
    thetaReason,
  };
}

// ── Pseudo-R² ─────────────────────────────────────────────────────

function pseudoR2(deviance, nullDeviance, logLik, nullLogLik, n, p) {
  const mcfadden = nullLogLik !== 0 ? 1 - logLik / nullLogLik : 0;
  const coxSnell = 1 - Math.exp(-(2 / n) * (logLik - nullLogLik));
  const maxCS = 1 - Math.exp((2 / n) * nullLogLik);
  const nagelkerke = maxCS > 0 ? coxSnell / maxCS : 0;
  return { mcfadden, coxSnell, nagelkerke };
}

// ── Diagnostics ───────────────────────────────────────────────────

/**
 * Compute hat (leverage) values: h_ii = w_i · x_i' (X'WX)⁻¹ x_i
 * @param {number[][]} X - design matrix
 * @param {number[][]} invXtWX - (X'WX)⁻¹
 * @param {number[]} [irlsWeights] - final IRLS weights (if null, unweighted)
 */
export function hatValues(X, invXtWX, irlsWeights) {
  const n = X.length;
  const p = X[0].length;
  const h = new Array(n);

  for (let i = 0; i < n; i++) {
    let hii = 0;
    for (let a = 0; a < p; a++) {
      for (let b = 0; b < p; b++) {
        hii += X[i][a] * invXtWX[a][b] * X[i][b];
      }
    }
    if (irlsWeights) hii *= irlsWeights[i];
    h[i] = clip(hii, 0, 1 - EPSILON);
  }
  return h;
}

/**
 * Cook's distance for GLM.
 *   D_i = h_i · r_p_i² / (p · φ · (1 − h_i)²)
 * The φ scaling matters for quasi-likelihood fits; pass result.dispersion
 * so quasi-Poisson fits don't inflate Cook's distance by sqrt(φ)².
 *
 * @param {number[]} pearsonResid
 * @param {number[]} hat
 * @param {number} p
 * @param {number} [dispersion=1]
 */
export function cookDistance(pearsonResid, hat, p, dispersion = 1) {
  const n = pearsonResid.length;
  const cook = new Array(n);
  const phi = Math.max(dispersion, 1e-12);
  for (let i = 0; i < n; i++) {
    const hi = hat[i];
    cook[i] = (pearsonResid[i] * pearsonResid[i] * hi) / (p * phi * (1 - hi) * (1 - hi));
  }
  return cook;
}

/**
 * VIF for GLM predictors (excluding intercept column).
 *
 * Generalized VIF for non-Gaussian GLMs: regress each predictor on the
 * others using IRLS-weighted least squares (X'WX), so the result is the
 * variance-inflation in the link-scale tangent space rather than the raw
 * predictor space. R `car::vif.glm` and Fox & Weisberg use this form.
 *
 * If `irlsWeights` is omitted the function falls back to plain OLS — useful
 * for early-screening checks before a model is fit.
 *
 * @param {number[][]} X
 * @param {number[]} [irlsWeights]
 */
export function computeGLMVIF(X, irlsWeights = null) {
  const n = X.length;
  const p = X[0].length;
  if (p <= 2) return [1];

  const vifs = [];
  for (let j = 1; j < p; j++) {
    const yj = X.map(row => row[j]);
    const otherCols = [];
    for (let k = 0; k < p; k++) {
      if (k === j) continue;
      otherCols.push(k);
    }
    const Xsub = X.map(row => otherCols.map(k => row[k]));
    const coeffs = solveWeightedOLSCols(Xsub, yj, irlsWeights);
    if (!coeffs) { vifs.push(Infinity); continue; }
    const yHat = Xsub.map(row => sum(row.map((v, idx) => v * coeffs[idx])));
    if (irlsWeights) {
      let sumW = 0, sumWY = 0;
      for (let i = 0; i < n; i++) { sumW += irlsWeights[i]; sumWY += irlsWeights[i] * yj[i]; }
      const yMean = sumW > 0 ? sumWY / sumW : 0;
      let sst = 0, sse = 0;
      for (let i = 0; i < n; i++) {
        sst += irlsWeights[i] * (yj[i] - yMean) ** 2;
        sse += irlsWeights[i] * (yj[i] - yHat[i]) ** 2;
      }
      const R2j = sst > 0 ? 1 - sse / sst : 0;
      vifs.push(R2j < 1 ? 1 / (1 - R2j) : Infinity);
    } else {
      const yMean = mean(yj);
      const SST = sum(yj.map(v => (v - yMean) ** 2));
      const SSE = sum(yj.map((v, i) => (v - yHat[i]) ** 2));
      const R2j = SST > 0 ? 1 - SSE / SST : 0;
      vifs.push(R2j < 1 ? 1 / (1 - R2j) : Infinity);
    }
  }
  return vifs;
}

function solveWeightedOLSCols(X, y, weights) {
  const n = X.length;
  const p = X[0].length;
  const XtWX = Array.from({ length: p }, () => new Array(p).fill(0));
  const XtWy = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    const w = weights ? weights[i] : 1;
    for (let j = 0; j < p; j++) {
      XtWy[j] += w * X[i][j] * y[i];
      for (let k = 0; k < p; k++) XtWX[j][k] += w * X[i][j] * X[i][k];
    }
  }
  const inv = matInverse(XtWX);
  if (!inv) return null;
  const beta = new Array(p);
  for (let j = 0; j < p; j++) {
    let s = 0;
    for (let k = 0; k < p; k++) s += inv[j][k] * XtWy[k];
    beta[j] = s;
  }
  return beta;
}

// ── ROC Curve & AUC ───────────────────────────────────────────────

/**
 * Compute ROC curve data and AUC.
 *
 * Tied probabilities are collapsed into a single curve step (sklearn /
 * statsmodels convention). Without this, AUC depends on sort stability when
 * many observations share the same predicted probability — common with
 * discrete predictors.
 *
 * @param {number[]} yTrue - Binary 0/1 values
 * @param {number[]} probs - Predicted probabilities
 * @returns {{ fpr: number[], tpr: number[], thresholds: number[], auc: number }}
 */
export function computeROC(yTrue, probs) {
  const n = yTrue.length;
  // Stable descending sort with secondary key on index, so ties remain
  // adjacent regardless of host sort behaviour.
  const indices = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => probs[b] - probs[a] || a - b);

  const P = sum(yTrue);
  const N = n - P;
  if (P === 0 || N === 0) return { fpr: [0, 1], tpr: [0, 1], thresholds: [1, 0], auc: 0.5 };

  const fpr = [0];
  const tpr = [0];
  const thresholds = [Infinity];
  let tp = 0, fp = 0;

  // Walk the sorted list and emit one ROC point per *distinct* probability:
  // accumulate tp / fp across all observations sharing the current threshold,
  // then push a single (fpr, tpr) step.
  let i = 0;
  while (i < n) {
    const pCurr = probs[indices[i]];
    let j = i;
    while (j < n && probs[indices[j]] === pCurr) {
      if (yTrue[indices[j]] === 1) tp++;
      else fp++;
      j++;
    }
    fpr.push(fp / N);
    tpr.push(tp / P);
    thresholds.push(pCurr);
    i = j;
  }

  let auc = 0;
  for (let i = 1; i < fpr.length; i++) {
    auc += (fpr[i] - fpr[i - 1]) * (tpr[i] + tpr[i - 1]) / 2;
  }

  return { fpr, tpr, thresholds, auc };
}

// ── Classification Table ──────────────────────────────────────────

/**
 * @param {number[]} yTrue
 * @param {number[]} probs
 * @param {number} [cutoff=0.5]
 */
export function classificationTable(yTrue, probs, cutoff = 0.5) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const pred = probs[i] >= cutoff ? 1 : 0;
    if (pred === 1 && yTrue[i] === 1) tp++;
    else if (pred === 1 && yTrue[i] === 0) fp++;
    else if (pred === 0 && yTrue[i] === 0) tn++;
    else fn++;
  }
  const n = yTrue.length;
  return {
    tp, fp, tn, fn,
    sensitivity: tp + fn > 0 ? tp / (tp + fn) : 0,
    specificity: tn + fp > 0 ? tn / (tn + fp) : 0,
    accuracy: n > 0 ? (tp + tn) / n : 0,
    precision: tp + fp > 0 ? tp / (tp + fp) : 0,
  };
}

// ── Hosmer-Lemeshow Test ──────────────────────────────────────────

/**
 * Hosmer-Lemeshow goodness-of-fit test for binary regression.
 *
 * Tied predicted probabilities are kept in the same group: a group boundary
 * never bisects a tie cluster. With many ties the realized number of groups
 * may fall below the requested g; we report it via `result.groups`.
 *
 * Skipped when n is too small for the test to be meaningful (n < 4·g and
 * adaptive g < 4).
 *
 * @param {number[]} yTrue
 * @param {number[]} probs
 * @param {number} [g=10] requested group count; auto-reduced for small n
 * @returns {{ statistic, df, pValue, groups, skipped?: boolean, reason?: string }}
 */
export function hosmerLemeshow(yTrue, probs, g = 10) {
  const n = yTrue.length;

  // Auto-reduce groups when n is too small (Hosmer & Lemeshow recommend ≥5
  // expected per cell). Skip entirely if even g = 4 would leave < 5 obs/group.
  let gEff = g;
  if (n < 5 * gEff) gEff = Math.max(4, Math.floor(n / 5));
  if (n < 5 * gEff) {
    return { statistic: 0, df: 0, pValue: 1, groups: 0, skipped: true, reason: 'sample too small for HL test' };
  }

  // Stable ascending sort with secondary key on index — pair tied probs by
  // original order for reproducibility across runtimes.
  const indices = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => probs[a] - probs[b] || a - b);
  const targetSize = n / gEff;

  // Build groups, never splitting a tie cluster across the boundary.
  const groups = [];
  let i = 0;
  while (i < n && groups.length < gEff - 1) {
    const targetEnd = Math.round((groups.length + 1) * targetSize);
    let end = Math.max(targetEnd, i + 1);
    // Advance end past any tie that crosses the boundary.
    while (end < n && probs[indices[end - 1]] === probs[indices[end]]) end++;
    groups.push([i, end]);
    i = end;
  }
  if (i < n) groups.push([i, n]);

  const groupsActual = groups.length;
  let stat = 0;
  for (const [start, end] of groups) {
    const nj = end - start;
    let obs = 0, exp = 0;
    for (let k = start; k < end; k++) {
      obs += yTrue[indices[k]];
      exp += probs[indices[k]];
    }
    const expNeg = nj - exp;
    if (exp > EPSILON && expNeg > EPSILON) {
      stat += (obs - exp) ** 2 / exp + ((nj - obs) - expNeg) ** 2 / expNeg;
    }
  }

  const df = Math.max(groupsActual - 2, 1);
  const pValue = 1 - chi2CDF(stat, df);
  return { statistic: stat, df, pValue, groups: groupsActual };
}

// ── Overdispersion Check ──────────────────────────────────────────

/**
 * Pearson chi-squared / df as overdispersion indicator.
 */
export function overdispersionCheck(pearsonResid, n, p) {
  const chi2 = sum(pearsonResid.map(r => r * r));
  const df = n - p;
  const ratio = df > 0 ? chi2 / df : 0;
  return {
    pearsonChi2: chi2,
    df,
    ratio,
    overdispersed: ratio > 1.5,
    severe: ratio > 3,
  };
}

// ── Prediction ────────────────────────────────────────────────────

/**
 * Predict for new observations.
 * @param {Object} result - GLM fit result
 * @param {number[][]} newX - m×p design matrix (with intercept)
 * @returns {{ linear: number[], response: number[], ciLower: number[], ciUpper: number[] }}
 */
export function predictGLM(result, newX) {
  const { coefficients: beta, invXtWX: inv, confLevel, family: fam } = result;
  const p = beta.length;
  const zCrit = normalQuantile((1 + confLevel) / 2);
  const phi = Math.max(result.dispersion ?? 1, 0);

  const fObj = fam.name === 'binomial' ? binomial(fam.link)
             : fam.name === 'poisson' ? poisson(fam.link)
             : negbin(fam.link, fam.theta);

  const m = newX.length;
  const linear = new Array(m);
  const response = new Array(m);
  const ciLower = new Array(m);
  const ciUpper = new Array(m);
  const ciValid = inv != null;

  for (let i = 0; i < m; i++) {
    let eta = 0;
    for (let j = 0; j < p; j++) eta += newX[i][j] * beta[j];
    linear[i] = eta;
    response[i] = fObj.linkInv(eta);

    if (ciValid) {
      let se2 = 0;
      for (let a = 0; a < p; a++) {
        for (let b = 0; b < p; b++) {
          se2 += newX[i][a] * inv[a][b] * newX[i][b];
        }
      }
      // Var(η̂) = φ · x' (X'WX)⁻¹ x — quasi-likelihood scales the prediction CI.
      const se = Math.sqrt(Math.max(phi * se2, 0));
      // Compute CI bounds on the η scale before clipping; only the back-transform
      // through linkInv applies ETA_CLIP. This keeps very large |η| from
      // collapsing the CI through the same clip.
      ciLower[i] = fObj.linkInv(eta - zCrit * se);
      ciUpper[i] = fObj.linkInv(eta + zCrit * se);
    } else {
      // Singular X'WX → CI undefined. Surface as NaN and let the UI render
      // it as "—" rather than silently producing point-estimate CIs.
      ciLower[i] = NaN;
      ciUpper[i] = NaN;
    }
  }

  return { linear, response, ciLower, ciUpper, ciValid };
}

// ── Auto-Detect ───────────────────────────────────────────────────

/**
 * Detect the most suitable GLM family based on the response variable.
 * @param {number[]} y
 * @returns {{ familyName: string, link: string, reason: string, reasonKey: string }}
 */
export function autoDetect(y) {
  const unique = new Set(y);
  const vals = [...unique];

  if (unique.size === 2) {
    return { familyName: 'binomial', link: 'logit', reason: 'binary', reasonKey: 'autoDetectBinary' };
  }

  const allNonNeg = y.every(v => v >= 0);
  const allInteger = y.every(v => Number.isInteger(v));

  if (allNonNeg && allInteger) {
    const yBar = mean(y);
    const yVar = sum(y.map(v => (v - yBar) ** 2)) / (y.length - 1);
    const dispRatio = yBar > 0 ? yVar / yBar : 1;

    if (dispRatio > 2) {
      return { familyName: 'negbin', link: 'log', reason: 'overdispersed counts', reasonKey: 'autoDetectNegbin' };
    }
    return { familyName: 'poisson', link: 'log', reason: 'count data', reasonKey: 'autoDetectPoisson' };
  }

  // Proportions in [0,1] used to be auto-routed to binomial/logit, but the
  // module then rejected them as non-binary. Without an accompanying trials
  // column the binomial likelihood is malformed for fractional y, so we now
  // surface the ambiguity instead: the caller should pick a method explicitly
  // and supply opts.weights with the trial counts (grouped binomial).
  if (allNonNeg && y.every(v => v >= 0 && v <= 1)) {
    return { familyName: 'binomial', link: 'logit', reason: 'proportions need trials', reasonKey: 'autoDetectProportionAmbiguous', requiresWeights: true };
  }

  return { familyName: 'poisson', link: 'log', reason: 'non-negative', reasonKey: 'autoDetectDefault' };
}

// ── Design Matrix Builder ─────────────────────────────────────────

/**
 * Build a design matrix with intercept and optional interactions.
 * Supports both numeric and categorical predictors.
 *
 * @param {Object[]} columns - Array of { values: number[], name: string, categorical?: boolean, levels?: string[] }
 * @param {Object} [opts]
 * @param {boolean} [opts.interactions=false]
 * @returns {{ X: number[][], terms: string[], categoricalMaps: Object[] }}
 */
export function buildGLMDesignMatrix(columns, opts = {}) {
  const n = columns[0].values.length;
  const terms = ['Intercept'];
  const Xcols = [new Array(n).fill(1)];
  const categoricalMaps = [];

  for (const col of columns) {
    if (col.categorical) {
      const levels = col.levels || [...new Set(col.values)].sort();
      const ref = levels[0];
      categoricalMaps.push({ name: col.name, reference: ref, levels });
      for (let l = 1; l < levels.length; l++) {
        terms.push(`${col.name}[${levels[l]}]`);
        Xcols.push(col.values.map(v => v === levels[l] ? 1 : 0));
      }
    } else {
      terms.push(col.name);
      Xcols.push([...col.values]);
      categoricalMaps.push(null);
    }
  }

  if (opts.interactions) {
    const numericIndices = [];
    let idx = 1;
    for (const col of columns) {
      if (col.categorical) {
        const lvls = (col.levels || [...new Set(col.values)].sort()).length - 1;
        idx += lvls;
      } else {
        numericIndices.push(idx);
        idx++;
      }
    }

    for (let i = 0; i < numericIndices.length; i++) {
      for (let j = i + 1; j < numericIndices.length; j++) {
        const ci = numericIndices[i];
        const cj = numericIndices[j];
        terms.push(`${terms[ci]}·${terms[cj]}`);
        Xcols.push(Xcols[ci].map((v, r) => v * Xcols[cj][r]));
      }
    }
  }

  const X = Array.from({ length: n }, (_, r) => Xcols.map(col => col[r]));
  return { X, terms, categoricalMaps };
}

// ── Demo Datasets ─────────────────────────────────────────────────

export const DEMO_DATASETS = {
  solder: {
    nameKey: 'demoSolder',
    family: 'binomial',
    y: [0,0,1,0,0,1,0,1,0,0,1,1,0,0,0,1,1,1,0,0,1,0,1,1,0,1,1,1,0,0,
        1,0,0,0,1,1,0,1,1,0,0,0,1,1,1,1,0,0,0,1],
    x: {
      temperature: [220,225,230,235,240,245,250,255,220,225,230,235,240,245,250,255,220,225,230,235,
                    240,245,250,255,220,225,230,235,240,245,250,255,220,225,230,235,240,245,250,255,
                    220,225,230,235,240,245,250,255,220,225],
      pressure: [2.0,2.0,2.5,2.5,3.0,3.0,3.5,3.5,2.0,2.0,2.5,2.5,3.0,3.0,3.5,3.5,2.0,2.0,2.5,2.5,
                 3.0,3.0,3.5,3.5,2.0,2.0,2.5,2.5,3.0,3.0,3.5,3.5,2.0,2.0,2.5,2.5,3.0,3.0,3.5,3.5,
                 2.0,2.0,2.5,2.5,3.0,3.0,3.5,3.5,2.0,2.0],
    },
    yName: 'Defect',
    xNames: { temperature: 'Temperature', pressure: 'Pressure' },
  },
  defects: {
    nameKey: 'demoDefects',
    family: 'poisson',
    y: [2,3,1,5,4,7,2,8,3,1,6,5,3,2,9,4,7,1,3,5,6,2,4,8,3,1,5,7,2,4],
    x: {
      speed: [10,12,10,15,14,18,11,20,12,10,16,15,12,11,22,14,18,10,12,15,16,11,14,20,12,10,15,18,11,14],
      lineAge: [1,2,1,3,3,5,1,5,2,1,4,3,2,1,5,3,4,1,2,3,4,1,3,5,2,1,3,5,1,3],
    },
    yName: 'Defects',
    xNames: { speed: 'Speed', lineAge: 'Line Age' },
  },
  complaints: {
    nameKey: 'demoComplaints',
    family: 'negbin',
    y: [0,8,5,45,0,3,12,0,30,1,18,0,6,70,2,0,55,1,3,15,25,0,4,40,0,7,20,35,1,10],
    x: {
      batchSize: [50,100,40,120,80,30,150,60,110,45,140,70,35,160,90,55,130,42,95,75,170,85,48,115,65,38,155,100,58,125],
      supplier: [1,2,1,2,1,1,2,1,2,1,2,1,1,2,2,1,2,1,2,1,2,2,1,2,1,1,2,2,1,2],
    },
    yName: 'Complaints',
    xNames: { batchSize: 'Batch Size', supplier: 'Supplier' },
  },
};

// ── Algorithm Lab wrappers ────────────────────────────────────────

/**
 * @param {number[][]} xColumns - Array of predictor column vectors
 * @param {number[]} y - Binary response (0/1)
 * @param {number} [confLevel=0.95]
 */
export function runLogisticRegression(xColumns, y, confLevel = 0.95) {
  if (!xColumns || xColumns.length === 0) {
    const X = y.map(() => [1]);
    return fitGLM(X, y, { familyName: 'binomial', terms: ['Intercept'], confLevel });
  }
  const cols = (xColumns[0] && Array.isArray(xColumns[0]))
    ? xColumns.map((col, i) => ({ values: [...col], name: `X${i + 1}`, categorical: false }))
    : [{ values: [...xColumns], name: 'X1', categorical: false }];
  const { X, terms } = buildGLMDesignMatrix(cols);
  return fitGLM(X, y, { familyName: 'binomial', terms, confLevel });
}

/**
 * @param {number[][]} xColumns - Array of predictor column vectors
 * @param {number[]} y - Count response (non-negative integers)
 * @param {number} [confLevel=0.95]
 */
export function runPoissonRegression(xColumns, y, confLevel = 0.95) {
  if (!xColumns || xColumns.length === 0) {
    const X = y.map(() => [1]);
    return fitGLM(X, y, { familyName: 'poisson', terms: ['Intercept'], confLevel });
  }
  const cols = (xColumns[0] && Array.isArray(xColumns[0]))
    ? xColumns.map((col, i) => ({ values: [...col], name: `X${i + 1}`, categorical: false }))
    : [{ values: [...xColumns], name: 'X1', categorical: false }];
  const { X, terms } = buildGLMDesignMatrix(cols);
  return fitGLM(X, y, { familyName: 'poisson', terms, confLevel });
}

/**
 * @param {number[][]} xColumns - Array of predictor column vectors
 * @param {number[]} y - Count response (overdispersed)
 * @param {number} [confLevel=0.95]
 */
export function runNegBinRegression(xColumns, y, confLevel = 0.95) {
  const cols = (xColumns[0] && Array.isArray(xColumns[0]))
    ? xColumns.map((col, i) => ({ values: [...col], name: `X${i + 1}`, categorical: false }))
    : [{ values: [...xColumns], name: 'X1', categorical: false }];
  const { X, terms } = buildGLMDesignMatrix(cols);
  return fitGLM(X, y, { familyName: 'negbin', terms, confLevel });
}

// ── Normal order statistics (for Q-Q plot) ────────────────────────

export function normalOrderStats(n) {
  const q = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = (i + 0.5) / n;
    q[i] = normalQuantile(p);
  }
  return q;
}
