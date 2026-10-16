/**
 * D.Mike — Antwortfläche abtasten (contour-plot-surface.js)
 *
 * Rein: das Raster und seine Kennzahlen, eine Quelle für das Zeichnen
 * (`_drawContour`) und die Agenten-Lesefläche (`surface`).
 */

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
