/**
 * D.Mike — Konturdiagramm: Antwortfläche auswerten und abtasten. Rein.
 *
 * Das Raster und seine Kennzahlen, eine Quelle für das Zeichnen und die
 * Ableitung `surface` im Model.
 */
import { evalFormula } from './formula.js';
import { CONTOUR_DEFAULTS } from '../../../core/chart/contour-defaults.js';

/**
 * Die Modellfunktion an einem Punkt. `quadratic` und `interaction` rechnen
 * dasselbe Polynom b0 + b1·x + b2·y + b3·x² + b4·y² + b5·x·y; `custom`
 * wertet die eigene Formel aus (ungültig → 0).
 * @param {{ modelType: string, b: number[], customFormula: string }} model
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function evalModel(model, x, y) {
  if (model.modelType === 'custom') return evalFormula(model.customFormula, x, y);
  const b = model.b;
  return b[0] + b[1] * x + b[2] * y + b[3] * x * x + b[4] * y * y + b[5] * x * y;
}

/**
 * Die Fläche auf einem res×res-Raster auswerten.
 * @param {(x: number, y: number) => number} evalAt die Modellfunktion
 * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} range
 * @param {number} res Rasterpunkte je Achse
 * @returns {{ grid: number[][], zMin: number, zMax: number, optimum: { x: number, y: number, z: number } }}
 */
export function scanSurface(evalAt, range, res) {
  const { xMin, xMax, yMin, yMax } = range;
  const grid = [];
  let zMinG = Infinity, zMaxG = -Infinity;
  let optX = 0, optY = 0;
  for (let j = 0; j < res; j++) {
    grid[j] = [];
    for (let i = 0; i < res; i++) {
      const x = xMin + (xMax - xMin) * i / (res - 1);
      const y = yMax - (yMax - yMin) * j / (res - 1);
      const z = evalAt(x, y);
      grid[j][i] = z;
      if (z < zMinG) zMinG = z;
      if (z > zMaxG) { zMaxG = z; optX = x; optY = y; }
    }
  }
  return { grid, zMin: zMinG, zMax: zMaxG, optimum: { x: optX, y: optY, z: zMaxG } };
}

/**
 * Die Fläche eines Models abtasten: über seinem Achsenbereich, in der
 * Rasterauflösung seiner Editor-Einstellungen. Auch bei einem Fehler der
 * eigenen Formel (ungültige Werte zählen als 0).
 * @param {{ modelType: string, b: number[], customFormula: string, xMin: number, xMax: number,
 *   yMin: number, yMax: number, chartEdits?: { gridRes?: number } }} model
 * @returns {{ grid: number[][], zMin: number, zMax: number, optimum: { x: number, y: number, z: number } }}
 */
export function sampleSurface(model) {
  const res = model.chartEdits?.gridRes ?? CONTOUR_DEFAULTS.gridRes;
  const { xMin, xMax, yMin, yMax } = model;
  return scanSurface((x, y) => evalModel(model, x, y), { xMin, xMax, yMin, yMax }, res);
}
