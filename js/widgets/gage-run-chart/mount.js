/** Diagramm-Widget `gage-run-chart`: fehlende Mittelwerte (`null`) werden für den Typ wieder zu `NaN`. */
import widget from './schema.js';
import { chartMount } from '../chart-mount.js';

/**
 * @param {any} config geprüfte Konfiguration
 * @returns {any} Konfiguration in der Form des Typs
 */
function toChart(config) {
  if (!Array.isArray(config.panels)) return config;
  return {
    ...config,
    panels: config.panels.map((p) => ({
      ...p,
      series: p.series.map((s) => ({ ...s, mean: s.mean === null ? NaN : s.mean })),
    })),
  };
}

export const mount = chartMount(widget, toChart);
