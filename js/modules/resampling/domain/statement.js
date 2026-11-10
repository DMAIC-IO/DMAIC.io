/**
 * D.Mike — Resampling: Aussagesatz (statement.js)
 * Pure mapping from the persisted summary to the plain-language key statement:
 * a list of i18n sentence keys with their placeholder values. Significance uses
 * α = 1 − confidence so the verdict always matches the shown interval level.
 * No DOM; translation happens in `renderStatement` through an injected `t`.
 */

import { pickCI, parseOptionalNumber } from './analyze.js';
import { fmt, statisticKey, bootDecision } from './format.js';
import { formatNumber, roundTo } from '../../../core/number-format.js';

/**
 * @typedef {{key: string, params: object}} StatementPart
 * `params.stat`, when present, is itself an i18n key: the statistic's in-sentence
 * name (`stmtStat…`, lower case in English).
 */

const DIRECTION_SUFFIX = { 'two-sided': '', greater: 'Greater', less: 'Less' };

/** Number without trailing zeros, e.g. 0.05 or 95. */
const plain = (v, lang) => formatNumber(roundTo(v, 4), lang);

/** "p = 0.0312" or "p < 0.0001" (decimal sign of the language). */
const pText = (p, lang) => (p < 1e-4 ? `p < ${formatNumber(1e-4, lang, { decimals: 4 })}` : `p = ${formatNumber(p, lang, { decimals: 4 })}`);

/** Verdict part from a p-value, or null when the p-value is missing. */
function verdict(prefix, p, alpha, params, lang) {
  if (!Number.isFinite(p)) return null;
  const sig = p < alpha ? 'Sig' : 'Not';
  return { key: `${prefix}${sig}`, params: { ...params, p: pText(p, lang), alpha: plain(alpha, lang) } };
}

/** Interval sentence, or null without an interval. */
function intervalPart(key, interval, conf, lang) {
  if (!interval) return null;
  return { key, params: { lo: fmt(interval[0], lang), hi: fmt(interval[1], lang), conf } };
}

function twoParts(summary, interval, alpha, conf, stat, lang) {
  const [a, b] = summary.labels;
  const suffix = DIRECTION_SUFFIX[summary.direction] || '';
  const p = summary.perm ? summary.perm.pValue : null;
  const head = verdict('stmtTwo', p, alpha, { a, b, stat }, lang);
  if (head) head.key += suffix;
  const est = summary.boot ? summary.boot.estimate : null;
  let size = null;
  if (Number.isFinite(est)) {
    if (summary.contrast === 'ratio') size = { key: 'stmtRatio', params: { a, b, ratio: fmt(est, lang) } };
    else if (est > 0) size = { key: 'stmtDiffAbove', params: { a, b, diff: fmt(est, lang) } };
    else if (est < 0) size = { key: 'stmtDiffBelow', params: { a, b, diff: fmt(-est, lang) } };
    else size = { key: 'stmtDiffEqual', params: { a, b } };
  }
  const ivKey = summary.contrast === 'ratio' ? 'stmtIntervalRatio' : 'stmtIntervalDiff';
  return [head, size, intervalPart(ivKey, interval, conf, lang)];
}

function pairedParts(summary, interval, alpha, conf, stat, lang) {
  const [a, b] = summary.labels;
  const p = summary.perm ? summary.perm.pValue : null;
  const head = verdict('stmtPaired', p, alpha, { a, b, stat }, lang);
  if (head) head.key += DIRECTION_SUFFIX[summary.direction] || '';
  const est = summary.boot ? summary.boot.estimate : null;
  const size = Number.isFinite(est) ? { key: 'stmtPairedEstimate', params: { a, b, est: fmt(est, lang) } } : null;
  return [head, size, intervalPart('stmtIntervalDiff', interval, conf, lang)];
}

function oneParts(summary, interval, conf, stat, target, ciMethod, lang) {
  const est = summary.boot ? summary.boot.estimate : null;
  if (!Number.isFinite(est) || !interval) return [];
  /** @type {StatementPart[]} */
  const parts = [{
    key: 'stmtOneEstimate',
    params: { a: summary.labels[0], stat, est: fmt(est, lang), lo: fmt(interval[0], lang), hi: fmt(interval[1], lang), conf },
  }];
  const tgt = parseOptionalNumber(target);
  const result = bootDecision(summary, { ciMethod, target });
  if (result) parts.push({ key: result === 'reject' ? 'stmtOneReject' : 'stmtOneRetain', params: { target: formatNumber(tgt, lang, { profile: 'input' }) } });
  return parts;
}

function kParts(summary, alpha, stat, lang) {
  const k = summary.k;
  const head = verdict('stmtK', k.pValue, alpha, { groups: summary.labels.join(', '), stat }, lang);
  if (!head || head.key !== 'stmtKSig') return [head];
  const pairs = k.posthoc
    .filter((h) => Number.isFinite(h.pHolm) && h.pHolm < alpha)
    .map((h) => `${summary.labels[h.i]} – ${summary.labels[h.j]} (${fmt(h.contrast, lang)})`);
  return [head, pairs.length ? { key: 'stmtKPairs', params: { pairs: pairs.join(', ') } } : { key: 'stmtKNoPair', params: {} }];
}

/**
 * Sentence parts of the key statement.
 * @param {object|null} summary persisted `state.result`
 * @param {{ciMethod: 'bca'|'percentile', target: string, lang: string}} opts
 * @returns {StatementPart[]}
 */
export function statementParts(summary, { ciMethod, target, lang }) {
  if (!summary) return [];
  const alpha = 1 - summary.confidence;
  const conf = plain(summary.confidence * 100, lang);
  const stat = `stmt${statisticKey(summary.statisticId).replace(/^stat/, 'Stat')}`;
  const interval = summary.boot ? pickCI(summary.boot.ci, ciMethod) : null;
  let parts;
  if (summary.mode === 'two') parts = twoParts(summary, interval, alpha, conf, stat, lang);
  else if (summary.mode === 'paired') parts = pairedParts(summary, interval, alpha, conf, stat, lang);
  else if (summary.mode === 'k') parts = summary.k ? kParts(summary, alpha, stat, lang) : [];
  else parts = oneParts(summary, interval, conf, stat, target, ciMethod, lang);
  return parts.filter(Boolean);
}

/**
 * Translate the parts into one paragraph.
 * @param {StatementPart[]} parts
 * @param {(key: string, params?: object) => string} t
 * @returns {string}
 */
export function renderStatement(parts, t) {
  return parts
    .map(({ key, params }) => t(key, params.stat ? { ...params, stat: t(params.stat) } : params))
    .join(' ');
}
