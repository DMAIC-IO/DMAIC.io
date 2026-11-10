/**
 * D.Mike — Resampling: Formatierung und Urteil (rein, ohne DOM und i18n).
 */

import { pickCI, decision, parseOptionalNumber } from './analyze.js';
import { formatNumber } from '../../../core/number-format.js';

/**
 * Fixed-decimal number in the app language, '–' when not finite.
 * @param {number|null} v
 * @param {string} lang 'de' | 'en'
 * @param {number} [d]
 * @returns {string}
 */
export function fmt(v, lang, d = 4) {
  return Number.isFinite(v) ? formatNumber(v, lang, { decimals: d }) : '–';
}

/**
 * p-value with four decimals, '< 0.0001' (in the app language) below that.
 * @param {number|null} p
 * @param {string} lang
 * @returns {string}
 */
export function fmtP(p, lang) {
  if (!Number.isFinite(p)) return '–';
  return p < 1e-4 ? `< ${formatNumber(1e-4, lang, { decimals: 4 })}` : formatNumber(p, lang, { decimals: 4 });
}

/**
 * @param {number[]|null} iv
 * @param {string} lang
 * @returns {string}
 */
export function fmtInterval(iv, lang) {
  return iv ? `[${fmt(iv[0], lang)}; ${fmt(iv[1], lang)}]` : '–';
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

