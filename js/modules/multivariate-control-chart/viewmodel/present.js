/**
 * D.Mike — Multivariate Regelkarte: Anzeige (viewmodel/present.js).
 *
 * Macht aus dem Rohergebnis der Engine KPI-Leiste, Abzeichen, Kopfzeile und
 * die Konfiguration des Regelkarten-Widgets: übersetzte Texte, Zahlen in der
 * Sprache der Oberfläche (UCL mit drei Nachkommastellen, „–“ für nicht
 * endlich) und Darstellungsklassen. Rechnet nichts.
 */
import { formatNumber } from '../../../core/number-format.js';

/** @typedef {import('../domain/analyze.js').Fit} Fit */
/** @typedef {(key: string, params?: Record<string, unknown>) => string} Translate */

/**
 * Zahl mit drei Nachkommastellen, „–“ für leer oder nicht endlich.
 * @param {unknown} v @param {string} lang @returns {string}
 */
export function fmt(v, lang) {
  return typeof v === 'number' && Number.isFinite(v) ? formatNumber(v, lang, { decimals: 3 }) : '–';
}

/**
 * Die drei Kacheln der KPI-Leiste: UCL mit α, Variablen mit der Länge der
 * Phase I, Signale von allen vollständigen Zeilen.
 * @param {Fit} fit Rohergebnis der Engine
 * @param {number} n vollständige Zeilen
 * @param {number} alpha eingestellte Fehlalarmrate
 * @param {Translate} t
 * @param {string} lang
 * @returns {{ uclText: string, alphaText: string, pText: string, baselineText: string, signals: number, ofText: string, signalsClass: string }}
 */
export function kpiOf(fit, n, alpha, t, lang) {
  const signals = fit.signals.length;
  return {
    uclText: fmt(fit.ucl, lang),
    alphaText: t('statAlpha', { a: formatNumber(alpha, lang) }),
    pText: String(fit.p),
    baselineText: t('statBaseline', { m: fit.m }),
    signals,
    ofText: t('statOf', { total: n }),
    signalsClass: signals === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad',
  };
}

/**
 * Das Abzeichen der Kopfzeile: stabil ohne Signal, sonst die Zahl der Signale.
 * @param {Fit} fit @param {Translate} t
 * @returns {{ text: string, cls: string, stable: boolean, unstable: boolean }}
 */
export function badgeOf(fit, t) {
  const count = fit.signals.length;
  const stable = count === 0;
  return {
    text: stable ? t('stable') : t('unstable', { count }),
    cls: stable ? 'mvcc__badge--stable' : 'mvcc__badge--unstable',
    stable,
    unstable: !stable,
  };
}

/**
 * Kopfzeile des Diagrammabschnitts mit den Namen der gewählten Spalten.
 * @param {string[]} names @param {Translate} t @returns {string}
 */
export function chartTitleOf(names, t) {
  return t('chartTitle', { vars: names.join(', ') });
}

/**
 * Konfiguration des Regelkarten-Widgets: T² je vollständiger Zeile, CL und
 * UCL als einelementige Liste („ein Wert gilt für alle Punkte“), LCL und σ 0,
 * die Signale sortiert und ohne Doppelte. Farben sind Vorgaben des Typs.
 * @param {Fit} fit @param {Translate} t
 * @returns {object}
 */
export function chartConfig(fit, t) {
  return {
    title: '',
    showTitle: false,
    showLegend: false,
    xLabel: t('xLabelSample'),
    yLabel: t('yLabel_t2'),
    values: [...fit.t2],
    cl: [fit.cl],
    ucl: [fit.ucl],
    lcl: [0],
    sigma: [0],
    violationIndices: [...new Set(fit.signals)].sort((a, b) => a - b),
    usl: null,
    lsl: null,
    showZones: false,
  };
}
