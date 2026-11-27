/**
 * D.Mike — Konturdiagramm: Darstellung. Rein.
 *
 * Aus der abgetasteten Fläche, dem Model und den Texten: der Fehlertext der
 * Formel, die Infokarten, die Legende, die Konfiguration des Diagramms und
 * die Zeilen des Tabellen-Exports.
 */
import { formatNumber, roundTo } from '../../../core/number-format.js';
import { getColor } from '../../../core/chart/color-schemes.js';
import { CONTOUR_DEFAULTS } from '../../../core/chart/contour-defaults.js';
import { legendModel } from '../../../core/chart/color-legend.js';

/** @typedef {(key: string, params?: Record<string, unknown>) => string} T */
/** @typedef {{ grid: number[][], zMin: number, zMax: number, optimum: { x: number, y: number, z: number } }} SurfaceGrid */

/** Textschlüssel je Fehlerart der Formel. */
const FORMULA_ERROR_KEY = {
  UNKNOWN_FUNCTION: 'formulaErrFn',
  UNKNOWN_IDENTIFIER: 'formulaErrVar',
  UNEXPECTED_CHAR: 'formulaErrChar',
  INVALID_NUMBER: 'formulaErrNum',
  EMPTY: 'formulaErrEmpty',
  SYNTAX: 'formulaErrSyntax',
  TRAILING: 'formulaErrSyntax',
};

/** Die Bezeichnungen der sechs Koeffizienten. */
const BETA = ['β₀', 'β₁', 'β₂', 'β₃', 'β₄', 'β₅'];

/**
 * Bezeichnung eines Koeffizienten.
 * @param {number} i 0 bis 5
 * @returns {string}
 */
export function betaLabel(i) {
  return BETA[i] ?? '';
}

/**
 * Der übersetzte Fehler der eigenen Formel; leer ohne Fehler.
 * @param {{ code: string, token?: string }|null} err
 * @param {T} t
 * @returns {string}
 */
export function formulaErrorText(err, t) {
  if (!err) return '';
  return t(FORMULA_ERROR_KEY[err.code] ?? 'formulaErrSyntax', { name: err.token ?? '' });
}

/**
 * Die Zahl der Konturstufen aus den Editor-Einstellungen.
 * @param {{ numLevels?: number }|undefined} edits
 * @returns {number}
 */
export function levelCount(edits) {
  return edits?.numLevels ?? CONTOUR_DEFAULTS.numLevels;
}

/**
 * Texte der vier Infokarten.
 * @param {SurfaceGrid} s
 * @param {number} levels Zahl der Konturstufen
 * @param {T} t
 * @param {string} lang
 * @returns {{ zMin: string, zMax: string, range: string, rangeSub: string, opt: string, optPos: string }}
 */
export function surfaceInfo(s, levels, t, lang) {
  const f = (/** @type {number} */ v) => formatNumber(v, lang, { decimals: 2 });
  return {
    zMin: f(s.zMin),
    zMax: f(s.zMax),
    range: f(s.zMax - s.zMin),
    rangeSub: `${levels} ${t('levels')}`,
    opt: f(s.zMax),
    optPos: `x=${f(s.optimum.x)}, y=${f(s.optimum.y)}`,
  };
}

/**
 * Die Farblegende.
 * @param {SurfaceGrid} s
 * @param {{ numLevels?: number, colorScheme?: string }|undefined} edits
 * @param {T} t
 * @param {string} lang
 * @returns {{ title: string, items: { color: string, value: string }[] }}
 */
export function legendView(s, edits, t, lang) {
  const scheme = edits?.colorScheme ?? CONTOUR_DEFAULTS.colorScheme;
  return legendModel(s.zMin, s.zMax, levelCount(edits), scheme, getColor, t('legend'),
    (v) => formatNumber(v, lang, { decimals: 1 }));
}

/**
 * Konfiguration des Diagramms. Titel und Achsentitel sind Vorgaben, die die
 * Editor-Einstellungen überschreiben; Messpunkte zeigt das Diagramm, sobald
 * alle drei Spalten gesetzt sind. Nicht endliche Werte gehen als Lücke ein.
 * @param {SurfaceGrid} s
 * @param {{ xLabel: string, yLabel: string, zLabel: string, xMin: number, xMax: number, yMin: number, yMax: number,
 *   datasets: Array<{ x: object|null, y: object|null, z: object|null }> }} m
 * @param {{ x: number, y: number, z: number }[]} points
 * @param {T} t
 * @returns {object}
 */
export function chartConfig(s, m, points, t) {
  const zLabel = m.zLabel || t('zLabelDefault');
  const row = m.datasets[0];
  const allColumns = Boolean(row?.x && row?.y && row?.z);
  return {
    grid: s.grid.map((r) => r.map((z) => (Number.isFinite(z) ? z : null))),
    xRange: [m.xMin, m.xMax],
    yRange: [m.yMin, m.yMax],
    zLabel,
    points,
    title: `${t('title')}: ${zLabel}`,
    xLabel: m.xLabel || t('xLabelDefault'),
    yLabel: m.yLabel || t('yLabelDefault'),
    fileName: 'contour-plot',
    ...(allColumns ? { showDataPoints: true } : {}),
  };
}

/**
 * Zeilen des Tabellen-Exports: Kopf x, y, z, dann je Rasterpunkt eine Zeile
 * mit vier Nachkommastellen, Zeile für Zeile von oben (y = yMax).
 * @param {SurfaceGrid} s
 * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} range
 * @returns {(string|number)[][]}
 */
export function surfaceTable(s, range) {
  /** @type {(string|number)[][]} */
  const rows = [['x', 'y', 'z']];
  const { xMin, xMax, yMin, yMax } = range;
  const res = s.grid.length;
  const r4 = (/** @type {number} */ v) => (Number.isFinite(v) ? roundTo(v, 4) : v);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = xMin + (xMax - xMin) * i / (res - 1);
      const y = yMax - (yMax - yMin) * j / (res - 1);
      rows.push([r4(x), r4(y), r4(s.grid[j][i])]);
    }
  }
  return rows;
}
