/**
 * D.Mike — Zeitgewichtete Regelkarten: Anzeige (viewmodel/present.js).
 *
 * Macht aus dem Rohergebnis der Engine KPI-Leiste, Kopfzeilen mit Abzeichen
 * und die Konfiguration des Regelkarten-Widgets je Teilkarte: übersetzte
 * Texte, Zahlen in der Sprache der Oberfläche (vier Nachkommastellen, „–“ für
 * nicht endlich) und Darstellungsklassen. Rechnet nichts.
 */
import { formatNumber } from '../../../core/number-format.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */
/** @typedef {Extract<Analysis, { status: 'ok' }>} Ok */
/** @typedef {(key: string, params?: Record<string, unknown>) => string} Translate */

/**
 * Die Teilkarten je Kartentyp in Zeichenreihenfolge (Schlüssel von
 * `model.charts`).
 */
export const CHARTS_OF = Object.freeze({
  ewma: Object.freeze(['ewma']),
  cusum: Object.freeze(['cusum_plus', 'cusum_minus']),
});

/**
 * Schlüssel der Editor-Einstellungen je Teilkarte in den alten `chartEdits`:
 * die untere CUSUM-Karte speicherte unter `'cusum#2'` (zweite Karte
 * desselben Schlüssels).
 */
export const LEGACY_EDIT_KEYS = Object.freeze({ ewma: 'ewma', cusum_plus: 'cusum', cusum_minus: 'cusum#2' });

/** Beschriftung der y-Achse je Teilkarte (Textschlüssel). */
const Y_LABEL_KEYS = Object.freeze({ ewma: 'yLabel_ewma', cusum_plus: 'yLabel_cusumHigh', cusum_minus: 'yLabel_cusumLow' });

/**
 * Zahl mit vier Nachkommastellen, „–“ für leer oder nicht endlich.
 * @param {unknown} v @param {string} lang @returns {string}
 */
export function fmt(v, lang) {
  return typeof v === 'number' && Number.isFinite(v) ? formatNumber(v, lang, { decimals: 4 }) : '–';
}

/**
 * Die Signalpunkte einer Teilkarte.
 * @param {Ok} a @param {string} key Teilkarte
 * @returns {number[]}
 */
function signalsOf(a, key) {
  const fit = /** @type {any} */ (a.fit);
  if (key === 'ewma') return fit.signals;
  return key === 'cusum_plus' ? fit.signalsHi : fit.signalsLo;
}

/**
 * Die drei Kacheln der KPI-Leiste. EWMA: Ziel (mit σ̂), σ_z (mit λ), Signale;
 * CUSUM: Ziel (mit σ̂), h (mit k), Signale nach oben und unten zusammen.
 * @param {Ok} a Ergebnis
 * @param {number} lambda eingestelltes λ (Unterzeile der EWMA)
 * @param {Translate} t
 * @param {string} lang
 * @returns {{ type: 'ewma'|'cusum', targetText: string, sigmaHatText: string, sigmaSteadyText?: string,
 *   lambdaText?: string, hText?: string, kText?: string, signals: number, ofText: string, signalsClass: string }}
 */
export function kpiOf(a, lambda, t, lang) {
  const fit = /** @type {any} */ (a.fit);
  const signals = a.type === 'ewma' ? fit.signals.length : fit.signalsHi.length + fit.signalsLo.length;
  const common = {
    type: a.type,
    targetText: fmt(a.target, lang),
    sigmaHatText: t('statSigmaHat', { v: fmt(a.sigma, lang) }),
    signals,
    ofText: t('statOf', { total: a.n }),
    signalsClass: signals === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad',
  };
  if (a.type === 'ewma') {
    return { ...common, sigmaSteadyText: fmt(fit.sigmaSteady, lang), lambdaText: t('statLambda', { v: formatNumber(lambda, lang) }) };
  }
  return { ...common, hText: fmt(fit.h, lang), kText: t('statK', { v: fmt(fit.k, lang) }) };
}

/**
 * Das Abzeichen einer Kopfzeile: stabil ohne Signal, sonst die Zahl der Signale.
 * @param {number} count Signale der Teilkarte @param {Translate} t
 * @returns {{ text: string, cls: string, stable: boolean, unstable: boolean }}
 */
export function badgeOf(count, t) {
  const stable = count === 0;
  return {
    text: stable ? t('stable') : t('unstable', { count }),
    cls: stable ? 'twc__badge--stable' : 'twc__badge--unstable',
    stable,
    unstable: !stable,
  };
}

/**
 * Konfiguration des Regelkarten-Widgets für eine Teilkarte. EWMA: z je Punkt,
 * CL als einelementige Liste, UCL, LCL und σ als Listen je Punkt (die Grenzen
 * weiten sich anfangs). CUSUM C⁺ bzw. C⁻: CL 0, UCL h, LCL 0, σ 0, je als
 * einelementige Liste. Die Signale sortiert und ohne Doppelte. Farben sind
 * Vorgaben des Typs.
 * @param {Ok} a @param {string} key Teilkarte @param {Translate} t
 * @returns {object}
 */
export function chartConfig(a, key, t) {
  const fit = /** @type {any} */ (a.fit);
  const base = {
    title: '',
    showTitle: false,
    showLegend: false,
    xLabel: t('xLabelSample'),
    yLabel: t(Y_LABEL_KEYS[key]),
  };
  const violationIndices = [...new Set(signalsOf(a, key))].sort((x, y) => x - y);
  if (key === 'ewma') {
    return {
      ...base,
      values: [...fit.values], cl: [fit.cl], ucl: [...fit.ucl], lcl: [...fit.lcl], sigma: [...fit.sigma],
      violationIndices, usl: null, lsl: null, showZones: false,
    };
  }
  return {
    ...base,
    values: [...(key === 'cusum_plus' ? fit.cPlus : fit.cMinus)], cl: [0], ucl: [fit.h], lcl: [0], sigma: [0],
    violationIndices, usl: null, lsl: null, showZones: false,
  };
}

/**
 * Je Teilkarte des Ergebnisses Kopfzeile, Abzeichen, Konfiguration und
 * Altschlüssel, als Objekt in Zeichenreihenfolge (EWMA `{ ewma }`, CUSUM
 * `{ cusum_plus, cusum_minus }`).
 * @param {Ok} a @param {string} col Name der Spalte @param {Translate} t
 * @returns {Record<string, { title: string, badge: ReturnType<typeof badgeOf>, config: object, legacyEditKey: string }>}
 */
export function chartViewsOf(a, col, t) {
  return Object.fromEntries(CHARTS_OF[a.type].map((key) => [key, {
    title: t(`chartTitle_${key}`, { col }),
    badge: badgeOf(signalsOf(a, key).length, t),
    config: chartConfig(a, key, t),
    legacyEditKey: LEGACY_EDIT_KEYS[key],
  }]));
}
