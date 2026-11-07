/**
 * D.Mike — Resampling-Präsentation (present.js)
 * Reine Abbildung der gespeicherten Zusammenfassung (`summarize`) auf Anzeigetexte
 * und Histogramm-Konfigurationen. Kein DOM, keine i18n-Abfrage außer über das
 * übergebene `t` für Diagrammbeschriftungen.
 */

import { pickCI } from '../domain/analyze.js';
import { fmt, fmtP, fmtInterval, statisticKey, bootDecision } from '../domain/format.js';

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
  const verdict = bootDecision(summary, { ciMethod, target });
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

/** Title key suffix per mode; mode two splits by contrast. */
function titleVariant(summary) {
  if (summary.mode === 'two') return summary.contrast === 'ratio' ? 'Ratio' : 'Diff';
  return { one: 'One', paired: 'Paired', k: 'K' }[summary.mode];
}

/**
 * Chart title naming what the histogram shows: statistic and compared samples.
 * @param {string} prefix 'chartBootTitle' | 'chartPermTitle'
 * @param {object} summary
 * @param {(key: string, params?: object) => string} t
 * @returns {string}
 */
function chartTitle(prefix, summary, t) {
  const variant = titleVariant(summary);
  if (variant === 'K') return t(`${prefix}K`, { groups: summary.labels.join(', ') });
  const [a, b] = summary.labels;
  const stat = t(statisticKey(summary.statisticId));
  return t(`${prefix}${variant}`, variant === 'One' ? { stat, a } : { stat, a, b });
}

/**
 * Histogram config of the bootstrap distribution, or null without one.
 * @param {object|null} summary
 * @param {'bca'|'percentile'} ciMethod
 * @param {(key: string, params?: object) => string} t
 */
export function bootChartConfig(summary, ciMethod, t) {
  if (!summary || !summary.boot || !summary.boot.bins.length) return null;
  const boot = summary.boot;
  const iv = pickCI(boot.ci, ciMethod);
  return {
    data: [],
    bins: copyBins(boot.bins),
    title: chartTitle('chartBootTitle', summary, t),
    xLabel: t('chartBootX'),
    showLegend: false,
    refAreas: iv ? [{ dir: 'x', min: iv[0], max: iv[1], color: 'var(--color-accent-light)', label: t('ciLabel') }] : [],
    refLines: Number.isFinite(boot.estimate)
      ? [{ dir: 'v', value: boot.estimate, color: 'var(--color-chart-2)', label: 'θ̂', showLabel: true }]
      : [],
  };
}

/**
 * Histogram config of the permutation distribution (two, paired, k), or null.
 * Marks the observed statistic T, and −T for two-sided two-sample/paired tests.
 * @param {object|null} summary
 * @param {(key: string, params?: object) => string} t
 */
export function permChartConfig(summary, t) {
  const part = summary ? (summary.perm || summary.k) : null;
  if (!part || !part.bins.length) return null;
  const line = (value) => ({ dir: 'v', value, color: 'var(--color-error)', label: t('observedT'), showLabel: true });
  const refLines = [];
  if (Number.isFinite(part.observed)) {
    refLines.push(line(part.observed));
    const twoSided = summary.mode !== 'k' && summary.direction === 'two-sided';
    if (twoSided && part.observed !== 0) refLines.push(line(-part.observed));
  }
  return {
    data: [],
    bins: copyBins(part.bins),
    title: chartTitle('chartPermTitle', summary, t),
    xLabel: t('chartPermX'),
    showLegend: false,
    refAreas: [],
    refLines,
  };
}
