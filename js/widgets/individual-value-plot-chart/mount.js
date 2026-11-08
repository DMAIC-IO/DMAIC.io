/** Einzelwertdiagramm: Gruppenfarben als Farbliste des Typs. */
import widget from './schema.js';
import { chartMount } from '../chart-mount.js';

/** @param {any} c @returns {any} */
function toChart(c) {
  const out = { ...c };
  if (Array.isArray(out.groups) && out.groups.some((/** @type {any} */ g) => g.color)) out.pointColors = out.groups.map((/** @type {any} */ g) => g.color);
  return out;
}

export const mount = chartMount(widget, toChart);
