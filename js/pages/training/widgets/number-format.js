/**
 * D.Mike — Number format of the course widgets (widgets/number-format.js)
 *
 * The widgets' tables follow the active language like the chart axes and the
 * lesson text: "500,00" in German, "500.00" in English. The language is read
 * on every call, so a switch shows on the next re-evaluation.
 */

import { formatNum } from '../../../core/chart/chart-core.js';

/**
 * Formatter bound to the page context's language.
 * @param {{i18n: {getLanguage?: Function}}} ctx page context
 * @returns {(v: number, digits?: number|null) => string} fixed `digits`
 *   (default 2, null = automatic precision); '–' for a non-finite value
 */
export function numberFormatter(ctx) {
  const locale = () => (ctx.i18n.getLanguage && ctx.i18n.getLanguage() === 'de' ? 'de' : 'en');
  return (v, digits = 2) => (Number.isFinite(v) ? formatNum(v, digits, locale()) : '–');
}
