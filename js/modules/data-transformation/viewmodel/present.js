/**
 * D.Mike — Datentransformation: Anzeige.
 *
 * Reine Funktionen für Kennwert-Tabelle und Normalitätszeilen in der
 * App-Sprache, die abbrechbare Pause des auto-Laufs und die Konstanten des
 * Zielwählers. Keine Rechnung (die liegt in domain/), kein DOM.
 */
import { formatNumber } from '../../../core/number-format.js';
import { ALPHA } from '../domain/analyze.js';

/** Pause vor der Rechnung nach einer Änderung (wie die Altform). */
export const RERUN_DELAY = 80;

/** Frist, in der `toWorksheet` auf das Ende der Rechnung wartet. */
export const SETTLE_MS = 20000;

/** Wert der Option „neues Arbeitsblatt“ im Zielwähler. */
export const NEW_WORKSHEET = '__create_worksheet__';

/**
 * Abbrechbare Pause.
 * @param {number} ms @param {AbortSignal} signal @returns {Promise<void>}
 */
export function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(timer); reject(signal.reason); }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Eine Kennzahl mit vier Nachkommastellen; ohne Wert ein Strich.
 * @param {number|null} v @param {string} lang @returns {string}
 */
export function fmt4(v, lang) {
  return v === null || !Number.isFinite(v) ? '—' : formatNumber(v, lang, { decimals: 4 });
}

/** @typedef {import('../domain/analyze.js').Result} Result */
/** @typedef {import('../domain/analyze.js').Descriptives} Descriptives */

/** Zeilen der Kennwert-Tabelle: Beschriftungsschlüssel und Kennzahl. */
const STAT_ROWS = Object.freeze([
  ['statMean', 'mean'], ['statStd', 'std'], ['statMedian', 'median'], ['statSkewness', 'skewness'],
  ['statKurtosis', 'kurtosis'], ['common.sym.min', 'min'], ['common.sym.max', 'max'],
]);

/**
 * Die Kennwert-Tabelle: n, dann sieben Kennzahlen je Reihe.
 * @param {Result|null} result @param {string} lang @param {(key: string) => string} t
 * @returns {{ label: string, orig: string, trans: string }[]}
 */
export function statRows(result, lang, t) {
  if (!result) return [];
  const n = formatNumber(result.n, lang);
  return [
    { label: t('common.sym.n'), orig: n, trans: n },
    ...STAT_ROWS.map(([labelKey, k]) => ({
      label: t(labelKey),
      orig: fmt4(/** @type {any} */ (result.original)[k], lang),
      trans: fmt4(/** @type {any} */ (result.transformed)[k], lang),
    })),
  ];
}

/**
 * Eine Zeile des Normalitätstests: `A² = …, p ≈ …`, Urteil und Klasse.
 * @param {Descriptives} d @param {string} lang @param {(key: string) => string} t
 * @returns {{ stat: string, badge: boolean, badgeClass: string, badgeIcon: string, badgeText: string }}
 */
export function normRow(d, lang, t) {
  const has = d.normal !== null;
  return {
    stat: has ? `A² = ${fmt4(d.adStatAdj, lang)}, p ≈ ${fmt4(d.adPValue, lang)}` : '—',
    badge: has,
    badgeClass: has ? (d.normal ? 'dt-badge dt-badge--pass' : 'dt-badge dt-badge--fail') : 'dt-badge',
    badgeIcon: d.normal ? 'status.ok' : 'status.error',
    badgeText: has ? t(d.normal ? 'normal' : 'notNormal') : '',
  };
}

/**
 * Die Zeile unter dem Normalitätstest: `α = 0.05 | H₀: …`.
 * @param {string} lang @param {(key: string) => string} t @returns {string}
 */
export function alphaLine(lang, t) {
  return `α = ${formatNumber(ALPHA, lang)} | H₀: ${t('h0Normal')}`;
}
