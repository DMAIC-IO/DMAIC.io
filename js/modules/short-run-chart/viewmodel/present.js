/**
 * D.Mike — Kurzserien-Regelkarte (Z-MR): Anzeige (viewmodel/present.js).
 *
 * Macht aus dem Rohergebnis der Engine KPI-Leiste, Teiletabelle, Kopfzeilen
 * mit Abzeichen und die Konfiguration des Regelkarten-Widgets je Teilkarte
 * (z-Karte und MR-Karte der z-Werte): übersetzte Texte, Zahlen in der Sprache
 * der Oberfläche (drei Nachkommastellen, „–“ für nicht endlich) und
 * Darstellungsklassen. Rechnet nichts.
 */
import { formatNumber } from '../../../core/number-format.js';
import { stageBoundariesOf } from '../domain/analyze.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */
/** @typedef {Extract<Analysis, { status: 'ok' }>} Ok */
/** @typedef {(key: string, params?: Record<string, unknown>) => string} Translate */

/** Die Teilkarten in Zeichenreihenfolge (Schlüssel von `model.charts`). */
export const SUBCHARTS = Object.freeze(['z', 'mr']);

/**
 * Schlüssel der Editor-Einstellungen je Teilkarte in den alten `chartEdits`
 * (die Id der Zeichenfläche).
 */
export const LEGACY_EDIT_KEYS = Object.freeze({ z: 'z', mr: 'mr' });

/** Beschriftung der y-Achse je Teilkarte (Textschlüssel). */
const Y_LABEL_KEYS = Object.freeze({ z: 'yLabel_z', mr: 'yLabel_mrZ' });

/**
 * Zahl mit drei Nachkommastellen, „–“ für leer oder nicht endlich.
 * @param {unknown} v @param {string} lang @returns {string}
 */
export function fmt(v, lang) {
  return typeof v === 'number' && Number.isFinite(v) ? formatNumber(v, lang, { decimals: 3 }) : '–';
}

/**
 * Die Signalpunkte einer Teilkarte.
 * @param {Ok} a @param {string} key Teilkarte (`z` oder `mr`)
 * @returns {number[]}
 */
function signalsOf(a, key) {
  return key === 'z' ? a.fit.signalsZ : a.fit.signalsMR;
}

/**
 * Die drei Kacheln der KPI-Leiste: Teile (mit Zahl der Messwerte), MR̄ der
 * z-Werte (mit UCL der MR-Karte), Signale beider Karten zusammen.
 * @param {Ok} a Ergebnis
 * @param {Translate} t
 * @param {string} lang
 * @returns {{ groups: number, totalText: string, mrBarText: string, uclMrText: string, signals: number,
 *   ofText: string, signalsClass: string }}
 */
export function kpiOf(a, t, lang) {
  const fit = a.fit;
  const signals = fit.signalsZ.length + fit.signalsMR.length;
  return {
    groups: fit.groups.length,
    totalText: t('statTotal', { total: a.n }),
    mrBarText: fmt(fit.mrBarZ, lang),
    uclMrText: t('statUclMr', { v: fmt(fit.uclMR, lang) }),
    signals,
    ofText: t('statOf', { total: a.n }),
    signalsClass: signals === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad',
  };
}

/**
 * Die Zeilen der Teiletabelle in Reihenfolge des Auftretens: Teil als Text,
 * Anzahl, Mittelwert, σ̂ und MR̄ auf drei Stellen.
 * @param {Ok} a @param {string} lang
 * @returns {Array<{ group: string, count: number, mean: string, sigma: string, mrBar: string }>}
 */
export function groupRowsOf(a, lang) {
  return a.fit.groups.map((g) => ({
    group: String(g.group),
    count: g.count,
    mean: fmt(g.mean, lang),
    sigma: fmt(g.sigma, lang),
    mrBar: fmt(g.mrBar, lang),
  }));
}

/**
 * Das Abzeichen einer Kopfzeile: stabil ohne Signal, sonst die Zahl der Signale.
 * @param {number} count Signale der Teilkarte @param {Translate} t
 * @returns {{ text: string, cls: string, icon: string }}
 */
export function badgeOf(count, t) {
  return count === 0
    ? { text: t('stable'), cls: 'src__badge--stable', icon: 'status.ok' }
    : { text: t('unstable', { count }), cls: 'src__badge--unstable', icon: 'status.warning' };
}

/**
 * Konfiguration des Regelkarten-Widgets für eine Teilkarte. z-Karte: die
 * z-Werte, CL 0, UCL 3, LCL −3, σ 1, mit Zonen. MR-Karte: die gleitenden
 * Spannweiten der z-Werte (ohne Wert in der ersten Zeile), MR̄, UCL und LCL
 * der MR-Karte, σ als ein Drittel des Abstands UCL − MR̄, ohne Zonen. Grenzen
 * als einelementige Listen, die Signale sortiert, Trennlinien zwischen den
 * Teilen in beiden Karten gleich. Farben sind Vorgaben des Typs.
 * @param {Ok} a @param {string} key Teilkarte (`z` oder `mr`) @param {Translate} t
 * @returns {object}
 */
export function chartConfig(a, key, t) {
  const fit = a.fit;
  const z = key === 'z';
  return {
    title: '',
    showTitle: false,
    showLegend: false,
    xLabel: t('xLabelSample'),
    yLabel: t(Y_LABEL_KEYS[key]),
    values: [...(z ? fit.z : fit.mr)],
    cl: [z ? fit.clZ : fit.mrBarZ],
    ucl: [z ? fit.uclZ : fit.uclMR],
    lcl: [z ? fit.lclZ : fit.lclMR],
    sigma: [z ? 1 : (fit.uclMR - fit.mrBarZ) / 3],
    violationIndices: [...new Set(signalsOf(a, key))].sort((x, y) => x - y),
    usl: null,
    lsl: null,
    showZones: z,
    stageBoundaries: stageBoundariesOf(fit),
  };
}

/**
 * Je Teilkarte Kopfzeile, Abzeichen, Konfiguration und Altschlüssel, als
 * Objekt in Zeichenreihenfolge `{ z, mr }`.
 * @param {Ok} a @param {string} col Name der Messwertspalte @param {Translate} t
 * @returns {Record<string, { title: string, badge: ReturnType<typeof badgeOf>, config: object, legacyEditKey: string }>}
 */
export function chartViewsOf(a, col, t) {
  return Object.fromEntries(SUBCHARTS.map((key) => [key, {
    title: t(`chartTitle_${key}`, { col }),
    badge: badgeOf(signalsOf(a, key).length, t),
    config: chartConfig(a, key, t),
    legacyEditKey: LEGACY_EDIT_KEYS[key],
  }]));
}
