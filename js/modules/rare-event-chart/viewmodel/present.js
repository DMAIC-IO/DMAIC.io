/**
 * D.Mike — Regelkarte seltener Ereignisse: Anzeige (viewmodel/present.js).
 *
 * Macht aus dem Rohergebnis der Engine KPI-Leiste, Abzeichen, Kopfzeile und
 * die Konfiguration des Regelkarten-Widgets: übersetzte Texte, Zahlen in der
 * Sprache der Oberfläche (drei Nachkommastellen, „–“ für nicht endlich) und
 * Darstellungsklassen. Rechnet nichts.
 */
import { formatNumber } from '../../../core/number-format.js';
import { resultOf, plottedOf, signalIndices } from '../domain/analyze.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */
/** @typedef {Extract<Analysis, { status: 'ok' }>} Ok */
/** @typedef {(key: string, params?: Record<string, unknown>) => string} Translate */

/**
 * Zahl mit drei Nachkommastellen, „–“ für leer oder nicht endlich.
 * @param {unknown} v @param {string} lang @returns {string}
 */
export function fmt(v, lang) {
  return typeof v === 'number' && Number.isFinite(v) ? formatNumber(v, lang, { decimals: 3 }) : '–';
}

/**
 * Die drei Kacheln der KPI-Leiste: CL (mit σ̂), UCL (mit LCL), Signale. Bei
 * der t-Karte CL, UCL und LCL auf der Originalskala, σ̂ auf der
 * transformierten.
 * @param {Ok} a Ergebnis
 * @param {Translate} t
 * @param {string} lang
 * @returns {{ clText: string, sigmaText: string, uclText: string, lclText: string, signals: number,
 *   ofText: string, signalsClass: string, transformed: boolean }}
 */
export function kpiOf(a, t, lang) {
  const r = /** @type {import('../domain/analyze.js').Result} */ (resultOf(a));
  const signals = r.signals.length;
  return {
    clText: fmt(r.cl, lang),
    sigmaText: t('statSigmaHat', { v: fmt(r.sigma, lang) }),
    uclText: fmt(r.ucl, lang),
    lclText: fmt(r.lcl, lang),
    signals,
    ofText: t('statOf', { total: r.n }),
    signalsClass: signals === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad',
    transformed: r.transformed,
  };
}

/**
 * Das Abzeichen der Kopfzeile: stabil ohne Signal, sonst die Zahl der Signale.
 * @param {number} count Signale @param {Translate} t
 * @returns {{ text: string, cls: string, icon: string }}
 */
export function badgeOf(count, t) {
  return count === 0
    ? { text: t('stable'), cls: 'rec__badge--stable', icon: 'status.ok' }
    : { text: t('unstable', { count }), cls: 'rec__badge--unstable', icon: 'status.warning' };
}

/**
 * Kopfzeile des Diagrammabschnitts mit dem Spaltennamen.
 * @param {'g'|'t'} type @param {string} col Name der Spalte @param {Translate} t
 * @returns {string}
 */
export function chartTitleOf(type, col, t) {
  return t(`chartTitle_${type}`, { col });
}

/**
 * Konfiguration des Regelkarten-Widgets: die gezeichneten Werte (t-Karte mit
 * `null` an den Lücken), Mittellinie, Grenzen und σ der gezeichneten Skala als
 * einelementige Listen, die Signale sortiert. Farben sind Vorgaben des Typs.
 * @param {Ok} a @param {Translate} t
 * @returns {object}
 */
export function chartConfig(a, t) {
  const p = /** @type {import('../domain/analyze.js').Plotted} */ (plottedOf(a));
  return {
    title: '',
    showTitle: false,
    showLegend: false,
    xLabel: t('xLabelSample'),
    yLabel: t(`yLabel_${a.type}`),
    values: [...p.values],
    cl: [p.cl],
    ucl: [p.ucl],
    lcl: [p.lcl],
    sigma: [p.sigma],
    violationIndices: [...signalIndices(a)].sort((x, y) => x - y),
    usl: null,
    lsl: null,
    showZones: false,
  };
}
