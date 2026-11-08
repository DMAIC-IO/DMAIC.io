/** Heatmap: fehlende Zellen (`null`) als `NaN`. */
import widget from './schema.js';
import { chartMount } from '../chart-mount.js';

/** @param {any} c @returns {any} */
function toChart(c) {
  const out = { ...c };
  if (Array.isArray(out.cells)) out.cells = out.cells.map((/** @type {any[]} */ row) => row.map((v) => (v === null ? NaN : v)));
  return out;
}

export const mount = chartMount(widget, toChart);
