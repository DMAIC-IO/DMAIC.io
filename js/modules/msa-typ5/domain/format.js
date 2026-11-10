/**
 * D.Mike — MSA Typ 5: Zahlenformatierung und Ampelklassen.
 */
import { formatNumber } from '../../../core/number-format.js';
import { kappaLevel } from '../../../engines/msa-typ5-engine.js';

/**
 * Zahl mit fester Stellenzahl; Strich für nicht endliche Werte.
 * @param {number|null|undefined} v @param {number} d Nachkommastellen @param {string} lang App-Sprache
 * @returns {string}
 */
export function fmt(v, d, lang) {
  return Number.isFinite(v) ? formatNumber(v, lang, { decimals: d }) : '—';
}

/**
 * p-Wert: unter 0,001 als „< 0,001“, sonst drei Stellen.
 * @param {number} p @param {string} lang @returns {string}
 */
export function fmtP(p, lang) {
  if (!Number.isFinite(p)) return '—';
  return p < 0.001 ? `< ${formatNumber(0.001, lang, { decimals: 3 })}` : formatNumber(p, lang, { decimals: 3 });
}

/**
 * Anteil (0…1) als Prozent mit einer Stelle.
 * @param {number} rate @param {string} lang @returns {string}
 */
export function fmtPct(rate, lang) {
  return Number.isFinite(rate) ? `${fmt(rate * 100, 1, lang)} %` : '—';
}

/**
 * Konfidenzintervall „[lo, hi]“; deutsch mit „;“, weil „,“ das Dezimalzeichen ist.
 * @param {number[]} ci @param {string} lang @returns {string}
 */
export function fmtCI(ci, lang) {
  return `[${fmt(ci[0], 3, lang)}${lang === 'de' ? ';' : ','} ${fmt(ci[1], 3, lang)}]`;
}

/**
 * Wert der Kriterientabelle: κ mit drei Stellen, Raten als Prozent.
 * @param {string} id Kriterium @param {number} v @param {string} lang @returns {string}
 */
export function fmtCriterion(id, v, lang) {
  return (id === 'fleissKappa' || id === 'minKappa') ? fmt(v, 3, lang) : fmtPct(v, lang);
}

/**
 * Urteil → Modifier-Klasse der Kennzahl.
 * @param {string} level @returns {string}
 */
export function verdictClass(level) {
  if (level === 'good') return 'dmike-kpi--good';
  if (level === 'marginal') return 'dmike-kpi--warn';
  return 'dmike-kpi--bad';
}

/**
 * Urteil → Ampelklasse der Tabellenpunkte.
 * @param {string} level @returns {string}
 */
export function levelClass(level) {
  if (level === 'good') return 'dmike-kpi--good';
  if (level === 'marginal') return 'dmike-kpi--warn';
  if (level === 'unacceptable') return 'dmike-kpi--bad';
  return '';
}

/**
 * κ → Ampelklasse nach den Grenzen des Regelwerks.
 * @param {number} k @param {'aiag'|'bosch'} ruleSet @returns {string}
 */
export function kappaClass(k, ruleSet) {
  return levelClass(kappaLevel(k, ruleSet));
}
