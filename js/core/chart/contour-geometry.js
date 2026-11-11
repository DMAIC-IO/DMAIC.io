/**
 * contour-geometry.js — Reine Geometrie für Konturdiagramme (ohne DOM).
 *
 * Stufen, Marching Squares, Rasterfarben und bilineare Interpolation.
 * Das Gitter ist `grid[j][i]`; Zeile 0 liegt oben (größtes y).
 * Zellen mit `null` oder nicht endlichem Wert bleiben ohne Linie und Farbe.
 */

import { getColor } from './color-schemes.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Höhenstufen: die Mitten von n gleich breiten Bändern zwischen zMin und zMax.
 * @param {number} zMin
 * @param {number} zMax
 * @param {number} n - Anzahl der Stufen
 * @returns {number[]}
 */
export function contourLevels(zMin, zMax, n) {
  const levels = [];
  for (let k = 0; k < n; k++) levels.push(zMin + (zMax - zMin) * (k + 0.5) / n);
  return levels;
}

const LINES = {
  1: ['T', 'L'], 2: ['T', 'R'], 3: ['L', 'R'], 4: ['R', 'B'], 5: ['T', 'R'], 6: ['T', 'B'],
  7: ['L', 'B'], 8: ['L', 'B'], 9: ['T', 'B'], 10: ['T', 'L'], 11: ['R', 'B'], 12: ['L', 'R'],
  13: ['T', 'R'], 14: ['T', 'L'],
};

/**
 * Marching Squares für eine Zelle, in Zellkoordinaten (0…1).
 * @param {number|null} z00 - links oben
 * @param {number|null} z10 - rechts oben
 * @param {number|null} z01 - links unten
 * @param {number|null} z11 - rechts unten
 * @param {number} lv - Höhenstufe
 * @returns {number[]|null} `[x1, y1, x2, y2]` oder `null` ohne Linie
 */
export function marchCell(z00, z10, z01, z11, lv) {
  if (!isNum(z00) || !isNum(z10) || !isNum(z01) || !isNum(z11)) return null;
  const idx = (z00 >= lv ? 1 : 0) | ((z10 >= lv ? 1 : 0) << 1)
    | ((z11 >= lv ? 1 : 0) << 2) | ((z01 >= lv ? 1 : 0) << 3);
  const e = LINES[idx];
  if (!e) return null;
  const vMap = { T: [z00, z10], R: [z10, z11], B: [z01, z11], L: [z00, z01] };
  const point = (edge) => {
    const [v1, v2] = vMap[edge];
    const t = (lv - v1) / (v2 - v1 || 1);
    switch (edge) {
      case 'T': return [t, 0];
      case 'R': return [1, t];
      case 'B': return [t, 1];
      default: return [0, t];
    }
  };
  const p1 = point(e[0]);
  const p2 = point(e[1]);
  return [p1[0], p1[1], p2[0], p2[1]];
}

/**
 * Alle Segmente einer Höhenstufe in Gitterkoordinaten (x = i + sx, y = j + sy).
 * Abgetastet wird Zeile für Zeile (j außen, i innen).
 * @param {Array<Array<number|null>>} grid
 * @param {number} lv
 * @returns {Array<{i: number, j: number, seg: number[]}>}
 */
export function contourSegments(grid, lv) {
  const out = [];
  for (let j = 0; j < grid.length - 1; j++) {
    for (let i = 0; i < grid[j].length - 1; i++) {
      const s = marchCell(grid[j][i], grid[j][i + 1], grid[j + 1][i], grid[j + 1][i + 1], lv);
      if (s) out.push({ i, j, seg: [i + s[0], j + s[1], i + s[2], j + s[3]] });
    }
  }
  return out;
}

/**
 * Das Segment, an dem die Stufenbeschriftung steht: das erste im mittleren
 * Bereich (30 % bis 70 % in beide Richtungen).
 * @param {Array<{i: number, j: number, seg: number[]}>} segments
 * @param {number} res - Gitterauflösung
 * @returns {{i: number, j: number, seg: number[]}|null}
 */
export function labelSegment(segments, res) {
  const lo = res * 0.3, hi = res * 0.7;
  return segments.find((s) => s.i > lo && s.i < hi && s.j > lo && s.j < hi) ?? null;
}

/**
 * Bilinear interpolierter Wert an einer Position; Zeile 0 liegt bei `yRange[1]`.
 * @param {Array<Array<number|null>>} grid
 * @param {number[]} xRange - `[min, max]`
 * @param {number[]} yRange - `[min, max]`
 * @param {number} x
 * @param {number} y
 * @returns {number|null} `null` außerhalb oder bei fehlender Ecke
 */
export function bilinear(grid, xRange, yRange, x, y) {
  const rows = grid.length, cols = grid[0]?.length ?? 0;
  if (rows < 2 || cols < 2) return null;
  const [x0, x1] = xRange, [y0, y1] = yRange;
  if (!(x >= x0 && x <= x1 && y >= y0 && y <= y1)) return null;
  const gx = x1 === x0 ? 0 : (x - x0) / (x1 - x0) * (cols - 1);
  const gy = y1 === y0 ? 0 : (y1 - y) / (y1 - y0) * (rows - 1);
  const i = Math.min(Math.floor(gx), cols - 2);
  const j = Math.min(Math.floor(gy), rows - 2);
  const fx = gx - i, fy = gy - j;
  const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i], d = grid[j + 1][i + 1];
  if (!isNum(a) || !isNum(b) || !isNum(c) || !isNum(d)) return null;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/**
 * Pixeldaten des Flächenbilds (ein Pixel je Gitterpunkt).
 * @param {Array<Array<number|null>>} grid
 * @param {string} scheme - Farbschema
 * @param {number} zMin
 * @param {number} zMax
 * @returns {Uint8ClampedArray} RGBA, Länge Zeilen·Spalten·4
 */
export function rasterRGBA(grid, scheme, zMin, zMax) {
  const rows = grid.length, cols = grid[0]?.length ?? 0;
  const px = new Uint8ClampedArray(rows * cols * 4);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const z = grid[j][i];
      if (!isNum(z)) continue;
      const t = zMax === zMin ? 0.5 : (z - zMin) / (zMax - zMin);
      const [r, g, b] = getColor(t, scheme);
      const o = (j * cols + i) * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
    }
  }
  return px;
}

/**
 * Strichfarbe der Höhenlinien: die Schemafarbe, aufgehellt.
 * @param {number[]} rgb - `[r, g, b]`
 * @returns {string} CSS-Farbe
 */
export function lineColor([r, g, b]) {
  return `rgba(${Math.min(255, r + 80)},${Math.min(255, g + 80)},${Math.min(255, b + 80)},0.65)`;
}
