/**
 * D.Mike — Resampling presenter (resampling-presenter.js)
 * Pure mapping from the persisted summary (resampling-analysis.js `summarize`)
 * to display strings and histogram configs. No DOM, no i18n lookups except
 * through the injected `t` for chart labels.
 */

import { pickCI, decision, parseOptionalNumber } from './resampling-analysis.js';

/**
 * Fixed-decimal number, '–' when not finite.
 * @param {number|null} v
 * @param {number} [d]
 * @returns {string}
 */
export function fmt(v, d = 4) {
  return Number.isFinite(v) ? v.toFixed(d) : '–';
}

/**
 * p-value with four decimals, '< 0.0001' below that.
 * @param {number|null} p
 * @returns {string}
 */
export function fmtP(p) {
  if (!Number.isFinite(p)) return '–';
  return p < 1e-4 ? '< 0.0001' : p.toFixed(4);
}

/**
 * @param {number[]|null} iv
 * @returns {string}
 */
export function fmtInterval(iv) {
  return iv ? `[${fmt(iv[0])}; ${fmt(iv[1])}]` : '–';
}

/**
 * i18n key of a statistic id.
 * @param {string} id
 * @returns {string}
 */
export function statisticKey(id) {
  return `stat${id.charAt(0).toUpperCase()}${id.slice(1)}`;
}

const DECISION_KEYS = { reject: 'decisionReject', retain: 'decisionRetain' };

/**
 * Display data for the result panel.
 * @param {object|null} summary persisted `state.result`
 * @param {{ciMethod: 'bca'|'percentile', target: string}} opts
 * @returns {object|null}
 */
export function resultView(summary, { ciMethod, target }) {
  if (!summary) return null;
  const boot = summary.boot;
  const test = summary.perm || summary.k;
  const interval = boot ? pickCI(boot.ci, ciMethod) : null;
  const tgt = parseOptionalNumber(target);
  const verdict = summary.mode === 'one' && Number.isFinite(tgt) ? decision(interval, tgt) : null;
  let estimate = null;
  if (boot) estimate = boot.estimate;
  else if (summary.k) estimate = summary.k.estimate;
  const label = (i) => summary.labels[i];
  return {
    mode: summary.mode,
    hasBoot: Boolean(boot),
    hasTest: Boolean(test),
    isK: summary.mode === 'k',
    estimate: fmt(estimate),
    se: fmt(boot ? boot.se : null),
    bias: fmt(boot ? boot.bias : null),
    interval: fmtInterval(interval),
    bcaFallback: Boolean(boot && ciMethod === 'bca' && boot.ci.bcaFallback),
    decisionKey: verdict ? DECISION_KEYS[verdict] : null,
    test: test ? {
      observed: fmt(test.observed),
      pValue: fmtP(test.pValue),
      methodKey: test.exact ? 'exact' : 'monteCarlo',
      permutations: String(test.permutations),
    } : null,
    groups: summary.k ? summary.k.groups.map((g, i) => ({
      label: label(i), n: String(summary.n[i]), estimate: fmt(g.estimate),
      interval: fmtInterval(pickCI(g.ci, ciMethod)),
    })) : [],
    posthoc: summary.k ? summary.k.posthoc.map((h) => ({
      pair: `${label(h.i)} – ${label(h.j)}`, contrast: fmt(h.contrast),
      interval: fmtInterval(pickCI(h.ci, ciMethod)),
      pRaw: fmtP(h.pRaw), pHolm: fmtP(h.pHolm), methodKey: h.exact ? 'exact' : 'monteCarlo',
    })) : [],
  };
}

const copyBins = (bins) => bins.map((b) => ({ x0: b.x0, x1: b.x1, count: b.count }));

/**
 * Histogram config of the bootstrap distribution, or null without one.
 * @param {object|null} summary
 * @param {'bca'|'percentile'} ciMethod
 * @param {(key: string) => string} t
 */
export function bootChartConfig(summary, ciMethod, t) {
  if (!summary || !summary.boot || !summary.boot.bins.length) return null;
  const boot = summary.boot;
  const iv = pickCI(boot.ci, ciMethod);
  return {
    data: [],
    bins: copyBins(boot.bins),
    xLabel: t('chartBootX'),
    showLegend: false,
    refAreas: iv ? [{ dir: 'x', min: iv[0], max: iv[1], color: 'var(--color-accent-light)', label: t('ciLabel') }] : [],
    refLines: Number.isFinite(boot.estimate)
      ? [{ value: boot.estimate, color: 'var(--color-chart-2)', label: 'θ̂', showLabel: true }]
      : [],
  };
}

/**
 * Histogram config of the permutation distribution (two, paired, k), or null.
 * Marks the observed statistic T, and −T for two-sided two-sample/paired tests.
 * @param {object|null} summary
 * @param {(key: string) => string} t
 */
export function permChartConfig(summary, t) {
  const part = summary ? (summary.perm || summary.k) : null;
  if (!part || !part.bins.length) return null;
  const line = (value) => ({ value, color: 'var(--color-error)', label: t('observedT'), showLabel: true });
  const refLines = [];
  if (Number.isFinite(part.observed)) {
    refLines.push(line(part.observed));
    const twoSided = summary.mode !== 'k' && summary.direction === 'two-sided';
    if (twoSided && part.observed !== 0) refLines.push(line(-part.observed));
  }
  return {
    data: [],
    bins: copyBins(part.bins),
    xLabel: t('chartPermX'),
    showLegend: false,
    refAreas: [],
    refLines,
  };
}
