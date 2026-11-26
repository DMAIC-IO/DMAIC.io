/**
 * D.Mike — Stichprobenumfang: Darstellung des Ergebnisses.
 *
 * Satz, Kennzahlen und die Konfiguration der Power-Kurve aus der Rechnung
 * (`domain/calc.js`). Rein: Übersetzer und Sprache kommen herein.
 */
import { formatNumber } from '../../../core/number-format.js';
import { N_CAP } from '../domain/calc.js';

/** @typedef {import('../domain/calc.js').Analysis} Analysis */
/** @typedef {(key: string, params?: Record<string, unknown>) => string} T */

/**
 * Erreicht die Suche den Deckel?
 * @param {Analysis} a @returns {boolean}
 */
export const isOverflow = (a) => a.nRequired >= N_CAP;

/**
 * Ziel-Power in ganzen Prozent.
 * @param {number} power @param {string} lang @returns {string}
 */
const powerPct = (power, lang) => formatNumber(power * 100, lang, { decimals: 0 });

/**
 * „ (je Gruppe)“ bei zwei Stichproben, sonst leer.
 * @param {Analysis} a @param {T} t @returns {string}
 */
const perGroup = (a, t) => (a.isTwo ? ` (${t('perGroup')})` : '');

/**
 * Das erforderliche n als Text; am Deckel „> 5.000“.
 * @param {Analysis} a @param {string} lang @returns {string}
 */
export function nText(a, lang) {
  return isOverflow(a) ? `> ${formatNumber(N_CAP, lang)}` : formatNumber(a.nRequired, lang);
}

/**
 * Der Gesamtumfang als Text; am Deckel „> 10.000“.
 * @param {Analysis} a @param {string} lang @returns {string}
 */
export function totalText(a, lang) {
  return isOverflow(a) ? `> ${formatNumber(2 * N_CAP, lang)}` : formatNumber(a.totalN, lang);
}

/**
 * Kopfzeile des Satzes: „Erforderliches n (je Gruppe): 42“.
 * @param {Analysis} a @param {T} t @param {string} lang @returns {string}
 */
export function summaryStrong(a, t, lang) {
  return `${t('requiredN')}${perGroup(a, t)}: ${nText(a, lang)}`;
}

/**
 * Der erklärende Satz; am Deckel der Hinweis.
 * @param {Analysis} a @param {T} t @param {string} lang @returns {string}
 */
export function summaryText(a, t, lang) {
  if (isOverflow(a)) return t('nOverflow');
  return t('resultSummary', {
    n: formatNumber(a.nRequired, lang),
    power: powerPct(a.power, lang),
    alpha: formatNumber(a.alpha, lang),
  });
}

/**
 * Die Werte und Beschriftungen der Kennzahlzellen.
 * @param {Analysis} a @param {T} t @param {string} lang
 * @returns {{ n: string, nLabel: string, power: string, alpha: string, effect: string, effectLabel: string, total: string }}
 */
export function kpiOf(a, t, lang) {
  return {
    n: nText(a, lang),
    nLabel: `${t('requiredN')}${perGroup(a, t)}`,
    power: `${powerPct(a.power, lang)}%`,
    alpha: formatNumber(a.alpha, lang),
    effect: formatNumber(a.effectValue, lang, { decimals: 3 }),
    effectLabel: t(a.effectKey),
    total: totalText(a, lang),
  };
}

/**
 * Die Konfiguration der Power-Kurve für das Widget `scatter-chart`, wie die
 * Altform sie zeichnete.
 * @param {Analysis} a @param {T} t @param {string} lang
 * @returns {object}
 */
export function powerChartOf(a, t, lang) {
  const pct = powerPct(a.power, lang);
  const solution = !isOverflow(a);
  return {
    title: t('sectionCurve'),
    xLabel: `n${perGroup(a, t)}`,
    yLabel: `${t('power')} (%)`,
    showLegend: false,
    xMin: 0,
    yMin: 0,
    yMax: 100,
    yDec: 0,
    xDec: 0,
    moduleRefLines: [{
      dir: 'h',
      value: a.power * 100,
      label: `${t('targetPower')}: ${pct}%`,
      dash: 'dash',
      width: 1.5,
      color: 'var(--color-error)',
    }],
    series: [
      {
        name: t('power'),
        color: 'var(--color-chart-1)',
        markerSize: 3,
        strokeWidth: 0.5,
        x: a.curve.map((p) => p.n),
        y: a.curve.map((p) => p.power * 100),
        symbol: 'circle',
        connectLine: { show: true, dash: 'solid', width: 2, color: 'var(--color-chart-1)' },
      },
      ...(solution ? [{
        name: `n = ${a.nRequired}`,
        color: 'var(--color-accent)',
        markerSize: 8,
        strokeWidth: 2,
        x: [a.nRequired],
        y: [a.power * 100],
        symbol: 'diamond',
      }] : []),
    ],
  };
}
