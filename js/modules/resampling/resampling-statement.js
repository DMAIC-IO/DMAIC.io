/**
 * D.Mike — Resampling key statement (resampling-statement.js)
 * Pure mapping from the persisted summary to the plain-language key statement:
 * a list of i18n sentence keys with their placeholder values. Significance uses
 * α = 1 − confidence so the verdict always matches the shown interval level.
 * No DOM; translation happens in `renderStatement` through an injected `t`.
 */

import { pickCI, decision, parseOptionalNumber } from './resampling-analysis.js';
import { fmt, statisticKey } from './resampling-presenter.js';

/**
 * @typedef {{key: string, params: object}} StatementPart
 * `params.stat`, when present, is itself an i18n key: the statistic's in-sentence
 * name (`stmtStat…`, lower case in English).
 */

const DIRECTION_SUFFIX = { 'two-sided': '', greater: 'Greater', less: 'Less' };

/** Number without trailing zeros, e.g. 0.05 or 95. */
const plain = (v) => String(Number(v.toFixed(4)));

/** "p = 0.0312" or "p < 0.0001". */
const pText = (p) => (p < 1e-4 ? 'p < 0.0001' : `p = ${p.toFixed(4)}`);

/** Verdict part from a p-value, or null when the p-value is missing. */
function verdict(prefix, p, alpha, params) {
  if (!Number.isFinite(p)) return null;
  const sig = p < alpha ? 'Sig' : 'Not';
  return { key: `${prefix}${sig}`, params: { ...params, p: pText(p), alpha: plain(alpha) } };
}

/** Interval sentence, or null without an interval. */
function intervalPart(key, interval, conf) {
  if (!interval) return null;
  return { key, params: { lo: fmt(interval[0]), hi: fmt(interval[1]), conf } };
}

function twoParts(summary, interval, alpha, conf, stat) {
  const [a, b] = summary.labels;
  const suffix = DIRECTION_SUFFIX[summary.direction] || '';
  const p = summary.perm ? summary.perm.pValue : null;
  const head = verdict('stmtTwo', p, alpha, { a, b, stat });
  if (head) head.key += suffix;
  const est = summary.boot ? summary.boot.estimate : null;
  let size = null;
  if (Number.isFinite(est)) {
    if (summary.contrast === 'ratio') size = { key: 'stmtRatio', params: { a, b, ratio: fmt(est) } };
    else if (est > 0) size = { key: 'stmtDiffAbove', params: { a, b, diff: fmt(est) } };
    else if (est < 0) size = { key: 'stmtDiffBelow', params: { a, b, diff: fmt(-est) } };
    else size = { key: 'stmtDiffEqual', params: { a, b } };
  }
  const ivKey = summary.contrast === 'ratio' ? 'stmtIntervalRatio' : 'stmtIntervalDiff';
  return [head, size, intervalPart(ivKey, interval, conf)];
}

function pairedParts(summary, interval, alpha, conf, stat) {
  const [a, b] = summary.labels;
  const p = summary.perm ? summary.perm.pValue : null;
  const head = verdict('stmtPaired', p, alpha, { a, b, stat });
  if (head) head.key += DIRECTION_SUFFIX[summary.direction] || '';
  const est = summary.boot ? summary.boot.estimate : null;
  const size = Number.isFinite(est) ? { key: 'stmtPairedEstimate', params: { a, b, est: fmt(est) } } : null;
  return [head, size, intervalPart('stmtIntervalDiff', interval, conf)];
}

function oneParts(summary, interval, conf, stat, target) {
  const est = summary.boot ? summary.boot.estimate : null;
  if (!Number.isFinite(est) || !interval) return [];
  const parts = [{
    key: 'stmtOneEstimate',
    params: { a: summary.labels[0], stat, est: fmt(est), lo: fmt(interval[0]), hi: fmt(interval[1]), conf },
  }];
  const tgt = parseOptionalNumber(target);
  const result = Number.isFinite(tgt) ? decision(interval, tgt) : null;
  if (result) parts.push({ key: result === 'reject' ? 'stmtOneReject' : 'stmtOneRetain', params: { target: String(tgt) } });
  return parts;
}

function kParts(summary, alpha, stat) {
  const k = summary.k;
  const head = verdict('stmtK', k.pValue, alpha, { groups: summary.labels.join(', '), stat });
  if (!head || head.key !== 'stmtKSig') return [head];
  const pairs = k.posthoc
    .filter((h) => Number.isFinite(h.pHolm) && h.pHolm < alpha)
    .map((h) => `${summary.labels[h.i]} – ${summary.labels[h.j]} (${fmt(h.contrast)})`);
  return [head, pairs.length ? { key: 'stmtKPairs', params: { pairs: pairs.join(', ') } } : { key: 'stmtKNoPair', params: {} }];
}

/**
 * Sentence parts of the key statement.
 * @param {object|null} summary persisted `state.result`
 * @param {{ciMethod: 'bca'|'percentile', target: string}} opts
 * @returns {StatementPart[]}
 */
export function statementParts(summary, { ciMethod, target }) {
  if (!summary) return [];
  const alpha = 1 - summary.confidence;
  const conf = plain(summary.confidence * 100);
  const stat = `stmt${statisticKey(summary.statisticId).replace(/^stat/, 'Stat')}`;
  const interval = summary.boot ? pickCI(summary.boot.ci, ciMethod) : null;
  let parts;
  if (summary.mode === 'two') parts = twoParts(summary, interval, alpha, conf, stat);
  else if (summary.mode === 'paired') parts = pairedParts(summary, interval, alpha, conf, stat);
  else if (summary.mode === 'k') parts = summary.k ? kParts(summary, alpha, stat) : [];
  else parts = oneParts(summary, interval, conf, stat, target);
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
