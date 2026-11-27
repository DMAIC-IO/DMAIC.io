/**
 * D.Mike — Farblegende zu Heat-/Konturbildern (color-legend.js). Rein; die
 * Farbe kommt über `getColor` aus `color-schemes.js`. Gezeichnet wird sie vom
 * Widget `color-legend` (js/widgets/color-legend/), genutzt von
 * `contour-plot` und `response-optimization`.
 */
import { getColor as schemeColor } from './color-schemes.js';

/**
 * Gleichmäßig verteilte Stufen über [zMin, zMax] (höchstens 10), jede Stufe
 * gefärbt über `getColor(t, scheme)` und beschriftet über `format`.
 *
 * @param {number} zMin Kleinster z-Wert.
 * @param {number} zMax Größter z-Wert.
 * @param {number} n Gewünschte Stufenzahl (höchstens 10).
 * @param {string} scheme Schlüssel des Farbschemas.
 * @param {(t:number, scheme:string)=>number[]} getColor Liefert `[r,g,b]`.
 * @param {string} title Titel der Legende.
 * @param {(v:number)=>string} format Text eines Stufenwerts.
 * @returns {{title:string, items:{color:string, value:string}[]}}
 */
export function legendModel(zMin, zMax, n, scheme, getColor = schemeColor, title = '', format = String) {
  const steps = Math.min(n, 10);
  const items = [];
  for (let k = 0; k < steps; k++) {
    const t = steps === 1 ? 0 : k / (steps - 1);
    const v = zMin + t * (zMax - zMin);
    const c = getColor(t, scheme);
    items.push({ color: `rgb(${c[0]},${c[1]},${c[2]})`, value: format(v) });
  }
  return { title, items };
}

/**
 * Kleinster und größter endlicher Wert eines Rasters; `null` ohne Wert.
 * @param {Array<Array<number|null>>} grid
 * @returns {{ zMin: number, zMax: number }|null}
 */
export function gridRange(grid) {
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const row of grid ?? []) {
    for (const z of row ?? []) {
      if (typeof z !== 'number' || !Number.isFinite(z)) continue;
      if (z < zMin) zMin = z;
      if (z > zMax) zMax = z;
    }
  }
  return Number.isFinite(zMin) ? { zMin, zMax } : null;
}
