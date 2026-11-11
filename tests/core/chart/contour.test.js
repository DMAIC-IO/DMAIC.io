/**
 * D.Mike — Contour geometry — Tests
 *
 * Reine Geometrie der Konturdiagramme: Stufen, Marching Squares, Raster,
 * Interpolation. Die Segmente müssen denen der alten Canvas-Zeichnung
 * entsprechen.
 */

import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertClose } from '../../test-utils.js';
import { getColor } from '../../../js/core/chart/color-schemes.js';
import {
  contourLevels, marchCell, contourSegments, labelSegment, bilinear, rasterRGBA, lineColor,
} from '../../../js/core/chart/contour-geometry.js';

/** Wörtliche Kopie der bisherigen Canvas-Fassung (Referenz). */
function legacyMarchCell(z00, z10, z01, z11, lv, i, j, cw, ch, m) {
  const a = z00 >= lv ? 1 : 0;
  const b = z10 >= lv ? 1 : 0;
  const c = z11 >= lv ? 1 : 0;
  const d = z01 >= lv ? 1 : 0;
  const idx = a | (b << 1) | (c << 2) | (d << 3);
  if (idx === 0 || idx === 15) return null;
  const x0 = m.left + i * cw, y0 = m.top + j * ch;
  function interp(v1, v2, edge) {
    const t = (lv - v1) / (v2 - v1 || 1);
    switch (edge) {
      case 'T': return [x0 + t * cw, y0];
      case 'R': return [x0 + cw, y0 + t * ch];
      case 'B': return [x0 + t * cw, y0 + ch];
      case 'L': return [x0, y0 + t * ch];
    }
  }
  const LINES = {
    1:['T','L'],2:['T','R'],3:['L','R'],4:['R','B'],5:['T','R'],6:['T','B'],
    7:['L','B'],8:['L','B'],9:['T','B'],10:['T','L'],11:['R','B'],12:['L','R'],
    13:['T','R'],14:['T','L'],
  };
  const e = LINES[idx];
  if (!e) return null;
  const vMap = { T: [z00, z10], R: [z10, z11], B: [z01, z11], L: [z00, z01] };
  const p1 = interp(vMap[e[0]][0], vMap[e[0]][1], e[0]);
  const p2 = interp(vMap[e[1]][0], vMap[e[1]][1], e[1]);
  return [p1[0], p1[1], p2[0], p2[1]];
}

suite('Contour geometry', () => {
  test('contourLevels: Mitten der n Bänder', () => {
    assertDeepEqual(contourLevels(0, 10, 4), [1.25, 3.75, 6.25, 8.75]);
  });

  test('marchCell: senkrechte Linie, voll/leer, null-Ecke', () => {
    assertDeepEqual(marchCell(0, 1, 0, 1, 0.5), [0.5, 0, 0.5, 1]);
    assertEqual(marchCell(1, 1, 1, 1, 0.5), null);
    assertEqual(marchCell(null, 1, 0, 1, 0.5), null);
    assertEqual(marchCell(0, 1, 0, NaN, 0.5), null);
  });

  test('marchCell: gleiche Segmente wie die Altfassung in allen 16 Fällen', () => {
    for (let mask = 0; mask < 16; mask++) {
      const z = [0, 1, 2, 3].map(b => ((mask >> b) & 1) ? 1 : 0);
      // Eckenreihenfolge a=z00, b=z10, c=z11, d=z01 → Argumente (z00, z10, z01, z11)
      const args = [z[0], z[1], z[3], z[2]];
      const expected = legacyMarchCell(...args, 0.5, 0, 0, 1, 1, { left: 0, top: 0 });
      assertDeepEqual(marchCell(...args, 0.5), expected, `Fall ${mask}`);
    }
  });

  test('contourSegments: z = x + y auf 5×5', () => {
    const grid = [];
    for (let j = 0; j < 5; j++) { grid.push([]); for (let i = 0; i < 5; i++) grid[j].push(i + j); }
    const segs = contourSegments(grid, 4.5);
    assertTrue(segs.length > 0);
    for (const s of segs) {
      for (const v of s.seg) assertTrue(v >= 0 && v <= 4, `Punkt ${v}`);
    }
  });

  test('contourSegments: konstantes Gitter liefert keine Segmente', () => {
    const grid = Array.from({ length: 5 }, () => Array(5).fill(7));
    for (const lv of contourLevels(7, 7, 10)) assertDeepEqual(contourSegments(grid, lv), []);
  });

  test('labelSegment: mittlerer Bereich, sonst null', () => {
    const grid = [];
    for (let j = 0; j < 10; j++) { grid.push([]); for (let i = 0; i < 10; i++) grid[j].push(i + j); }
    const s = labelSegment(contourSegments(grid, 10.5), 10);
    assertTrue(s && s.i > 3 && s.i < 7 && s.j > 3 && s.j < 7);
    assertEqual(labelSegment(contourSegments(grid, 0.5), 10), null);
  });

  test('bilinear: Zeile 0 = oben, außerhalb = null', () => {
    const g = [[0, 1], [2, 3]];
    assertClose(bilinear(g, [0, 1], [0, 1], 0.5, 0.5), 1.5);
    assertClose(bilinear(g, [0, 1], [0, 1], 0, 1), 0);
    assertEqual(bilinear(g, [0, 1], [0, 1], 2, 0.5), null);
    assertEqual(bilinear([[0, null], [2, 3]], [0, 1], [0, 1], 0.5, 0.5), null);
  });

  test('rasterRGBA: konstant = Mitte des Schemas, null = durchsichtig', () => {
    const px = rasterRGBA([[5, 5], [5, 5]], 'viridis', 5, 5);
    const c = getColor(0.5, 'viridis');
    assertEqual(px.length, 16);
    for (let k = 0; k < 4; k++) {
      assertDeepEqual([px[k * 4], px[k * 4 + 1], px[k * 4 + 2], px[k * 4 + 3]], [c[0], c[1], c[2], 255]);
    }
    const px2 = rasterRGBA([[5, null], [5, 5]], 'viridis', 5, 5);
    assertEqual(px2[7], 0);
    assertEqual(px2[3], 255);
  });

  test('lineColor: heller, begrenzt auf 255', () => {
    assertEqual(lineColor([200, 10, 10]), 'rgba(255,90,90,0.65)');
  });
});
