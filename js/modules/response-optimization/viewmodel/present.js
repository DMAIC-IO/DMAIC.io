/**
 * D.Mike — Zielgrößenoptimierung: Anzeige in der App-Sprache.
 *
 * Modellzeilen mit R²-Abzeichen und Vorgabefeldern, Kennzahl D, die Tabellen
 * des Optimums und die Konfiguration der Wirkungsfläche. Zahlen über
 * `formatNumber` mit den Stellen der Altform (R² und d drei, Werte vier).
 */
import { formatNumber } from '../../../core/number-format.js';
import { legendModel, gridRange } from '../../../core/chart/color-legend.js';
import { CONTOUR_DEFAULTS } from '../../../core/chart/contour-defaults.js';

/** Farbschema der Wirkungsfläche: blau → rot wie die Altform (`hsl(220 − 210·t, 70 %, 55 %)`). */
export const CONTOUR_SCHEME = 'hue';

/** @typedef {(key: string, params?: object) => string} T */
/** @typedef {import('../domain/model.js').ModelRef} ModelRef */
/** @typedef {import('../domain/model.js').Spec} Spec */
/** @typedef {import('../domain/model.js').Result} Result */
/** @typedef {import('../domain/optimize.js').Contour} Contour */

/**
 * Eine Zahl für ein Eingabefeld (ohne Gruppierung); leer ohne Zahl.
 * @param {unknown} v @param {string} lang @returns {string}
 */
export const inputText = (v, lang) => (typeof v === 'number' && Number.isFinite(v) ? formatNumber(v, lang, { profile: 'input' }) : '');

/**
 * Eine Zahl mit festen Stellen; leer ohne Zahl.
 * @param {unknown} v @param {string} lang @param {number} decimals @returns {string}
 */
export const fixed = (v, lang, decimals) => (typeof v === 'number' && Number.isFinite(v) ? formatNumber(v, lang, { decimals }) : '');

/**
 * Klasse des R²-Abzeichens: grün ab 0,8, gelb ab 0,5, sonst rot.
 * @param {number|null} v @returns {string}
 */
export function r2Class(v) {
  const r = v ?? 0;
  if (r >= 0.8) return 'ro__r2 ro__r2--good';
  if (r >= 0.5) return 'ro__r2 ro__r2--warn';
  return 'ro__r2 ro__r2--bad';
}

/**
 * Eine Zeile je Modell mit der wirksamen Vorgabe als Texte.
 * @param {ModelRef[]} models
 * @param {Record<string, Spec>} specs
 * @param {T} t
 * @param {string} lang
 */
export function modelRows(models, specs, t, lang) {
  return models.map((m) => {
    const s = specs[m.id];
    return {
      id: m.id,
      name: m.name,
      selected: s?.selected === true,
      kind: s?.kind ?? 'max',
      isTarget: s?.kind === 'target',
      lower: inputText(s?.lower, lang),
      upper: inputText(s?.upper, lang),
      target: inputText(s?.target, lang),
      weight: inputText(s?.weight, lang),
      r2Class: r2Class(m.rSqAdj),
      r2Text: `${t('common.sym.r2adj')} ${m.rSqAdj != null ? fixed(m.rSqAdj, lang, 3) : '—'}`,
    };
  });
}

/**
 * Klasse der Kennzahl D: grün ab 0,8, gelb ab 0,5, sonst rot.
 * @param {number|undefined} d @returns {string}
 */
export function dClass(d) {
  const v = d ?? 0;
  if (v >= 0.8) return 'dmike-kpi dmike-kpi--good';
  if (v >= 0.5) return 'dmike-kpi dmike-kpi--warn';
  return 'dmike-kpi dmike-kpi--bad';
}

/**
 * Die Tabelle des optimalen Faktorpunkts.
 * @param {Result} r @param {string} lang
 * @returns {Array<{ key: string, name: string, value: string }>}
 */
export function optimumRows(r, lang) {
  return (r.factorNames ?? []).map((name, i) => {
    const v = r.xOpt[i];
    return { key: `${i}:${name}`, name, value: typeof v === 'number' ? fixed(v, lang, 4) : String(v ?? '') };
  });
}

/**
 * Die Tabelle der Vorhersagen am Optimum.
 * @param {Result} r @param {string} lang
 * @returns {Array<{ key: string, model: string, prediction: string, d: string }>}
 */
export function predictionRows(r, lang) {
  return (r.modelNames ?? []).map((model, i) => ({
    key: `${i}:${model}`,
    model,
    prediction: fixed(r.yPredictions[i], lang, 4),
    d: fixed(r.dPerResponse[i], lang, 3),
  }));
}

/**
 * Konfiguration des Widgets `contour-chart`: Raster, Bereiche, Optimum als
 * Messpunkt, das Modell als z-Beschriftung, die Faktoren als Achsen.
 * @param {Contour} c @param {string} modelName @param {T} t
 * @returns {object}
 */
export function contourChartConfig(c, modelName, t) {
  return {
    grid: c.grid,
    xRange: c.xRange,
    yRange: c.yRange,
    zLabel: modelName,
    points: c.point ? [c.point] : [],
    title: t('contourTitle'),
    colorScheme: CONTOUR_SCHEME,
    xLabel: c.xId,
    yLabel: c.yId,
    fileName: 'response-optimization',
    ...(c.point ? { showDataPoints: true } : {}),
  };
}

/**
 * Farblegende der Wirkungsfläche (Widget `color-legend`): dieselbe Skala wie
 * das Diagramm (Editor-Wahl vor `hue`), Stufen wie die Konturlinien
 * (höchstens zehn), Werte mit zwei Stellen wie die Altleiste; `null` ohne
 * endlichen Wert.
 * @param {Contour} c @param {string} modelName
 * @param {{ colorScheme?: string, numLevels?: number }|undefined} edits
 * @param {string} lang
 * @returns {{ title: string, helpKey: string, items: { color: string, value: string }[] }|null}
 */
export function contourLegend(c, modelName, edits, lang) {
  const r = gridRange(c.grid);
  if (!r) return null;
  const m = legendModel(r.zMin, r.zMax, edits?.numLevels ?? CONTOUR_DEFAULTS.numLevels,
    edits?.colorScheme ?? CONTOUR_SCHEME, undefined, modelName, (v) => formatNumber(v, lang, { decimals: 2 }));
  return { ...m, helpKey: 'modules.response-optimization.fields.contour.help' };
}
