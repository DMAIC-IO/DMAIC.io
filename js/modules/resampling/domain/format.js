/**
 * D.Mike — Resampling: Formatierung und Urteil (rein, ohne DOM und i18n).
 */

import { pickCI, decision, parseOptionalNumber } from './analyze.js';

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


/**
 * Verdict of a one-sample bootstrap against the target — the single source
 * for the decision cell and the agent read surface.
 * @param {object|null} summary persisted `state.result`
 * @param {{ciMethod: 'bca'|'percentile', target: string}} opts
 * @returns {'reject'|'retain'|null} null without bootstrap, outside mode one or without a numeric target
 */
export function bootDecision(summary, { ciMethod, target }) {
  if (!summary || !summary.boot || summary.mode !== 'one') return null;
  const tgt = parseOptionalNumber(target);
  if (!Number.isFinite(tgt)) return null;
  return decision(pickCI(summary.boot.ci, ciMethod), tgt);
}

