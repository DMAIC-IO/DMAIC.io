/** Diagramm-Widget `scatter`: Tick-Beschriftung, Datumsachse und Lücken in y für den Typ aufbereiten. */
import widget from './schema.js';
import { chartMount } from '../chart-mount.js';

/**
 * `xTickLabels` und `xAxis` sind Eingaben des Widgets; der Typ kennt nur `xTickFormat`.
 * @param {any} c geprüfte Konfiguration
 * @returns {any} Konfiguration in der Form des Typs
 */
export function toChart(c) {
  const { xTickLabels, xAxis, ...out } = c;
  if (Array.isArray(xTickLabels)) {
    out.xTickFormat = (/** @type {number} */ v) => xTickLabels[Math.round(v)] ?? '';
  } else if (xAxis === 'date') {
    out.xTickFormat = (/** @type {number} */ v) => { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : ''; };
  }
  if (Array.isArray(out.series)) {
    out.series = out.series.map((/** @type {any} */ s) => (Array.isArray(s.y) && s.y.includes(null)
      ? { ...s, y: s.y.map((/** @type {number|null} */ v) => (v === null ? NaN : v)) } : s));
  }
  return out;
}

export const mount = chartMount(widget, toChart);
