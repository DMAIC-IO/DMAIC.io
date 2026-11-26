/** Diagramm-Widget `scatter`: Tick-Beschriftung, Datumsachse und Lücken in y für den Typ aufbereiten. */
import widget from './schema.js';
import { chartMount } from '../chart-mount.js';

/**
 * `xTickLabels`, `xAxis` und `xDateFormat` sind Eingaben des Widgets; der Typ kennt nur `xTickFormat`.
 * Die Datumsachse beschriftet ISO (`2026-01-05`), mit `xDateFormat: 'short'` kurz nach der
 * App-Sprache (`05.01.26` bzw. `05/01/26`).
 * @param {any} c geprüfte Konfiguration
 * @param {any} [services] Dienste des Widgets (`i18n.getLanguage()` für `short`)
 * @returns {any} Konfiguration in der Form des Typs
 */
export function toChart(c, services) {
  const { xTickLabels, xAxis, xDateFormat, ...out } = c;
  if (Array.isArray(xTickLabels)) {
    out.xTickFormat = (/** @type {number} */ v) => xTickLabels[Math.round(v)] ?? '';
  } else if (xAxis === 'date' && xDateFormat === 'short') {
    const locale = services?.i18n?.getLanguage?.() === 'de' ? 'de-DE' : 'en-GB';
    out.xTickFormat = (/** @type {number} */ v) => {
      const d = new Date(v);
      return Number.isFinite(d.getTime()) ? d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
    };
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
