/** Regelkarte: einelementige Grenzlisten als Zahl, Indexlisten als Set. */
import widget from './schema.js';
import { chartMount } from '../chart-mount.js';

const LIMITS = ['cl', 'ucl', 'lcl', 'sigma'];

/** @param {any} c @returns {any} */
function toChart(c) {
  const out = { ...c };
  for (const k of LIMITS) if (Array.isArray(out[k]) && out[k].length === 1) out[k] = out[k][0];
  if (Array.isArray(out.violationIndices)) out.violationIndices = new Set(out.violationIndices);
  if (Array.isArray(out.excludedIndices)) out.excludedIndices = new Set(out.excludedIndices);
  return out;
}

export const mount = chartMount(widget, toChart);
