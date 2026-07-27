/**
 * gage-run-strips.js — Gage-Run-Chart als gestapelte Streifen rendern.
 *
 * `ChartBase` stellt genau einen Plot-Bereich bereit, der Chart-Typ
 * `gage-run-chart` zeichnet deshalb einen Streifen. Bei mehr Prüfeinheiten als
 * `perRow` entstehen mehrere Chart-Instanzen untereinander, die sich Y-Domäne,
 * Referenzlinie und Prüfer-Reihenfolge teilen — nur so bleiben die Zeilen
 * vergleichbar und die Farben stabil.
 *
 * Dieser Helfer erzeugt die Zeilen-Hosts selbst im übergebenen Container. Er
 * bedient die eingebetteten Fälle (msa-typ2, msa-typ5), wo die Zeilenzahl von
 * den Daten abhängt und nicht im Template stehen kann. Das eigenständige Modul
 * `gage-run-chart` legt seine Hosts dagegen per `x-for` an und mountet über
 * `whenAnchor` — es bleibt bewusst bei seinem eigenen Pfad.
 */

import { splitPanelRows } from '../../engines/gage-run-chart-engine.js';

/**
 * @param {object} context — Modul-Kontext (liefert `chartManager`)
 * @param {HTMLElement} host — Container; sein Inhalt wird ersetzt
 * @param {object} cfg
 * @param {Array} cfg.panels — Panels aus `panelsFromCells` / `computeGageRunChart`
 * @param {string[]} cfg.operators — vollständige Prüferliste (Farbzuordnung)
 * @param {number} cfg.refValue — Referenzlinie
 * @param {string} [cfg.refLabel]
 * @param {number} cfg.yMin
 * @param {number} cfg.yMax
 * @param {number} [cfg.perRow=10] — Prüfeinheiten je Streifen
 * @param {string} [cfg.xLabel]
 * @param {string} [cfg.yLabel]
 * @param {boolean} [cfg.showOperatorMean=false]
 * @param {boolean} [cfg.connectWithin=true]
 * @param {string} [cfg.rowClass='gage-run-strip-row']
 * @param {() => boolean} [cfg.isStale] — bricht ab und räumt auf, wenn true
 * @returns {Promise<Array>} erzeugte Chart-Instanzen (zum späteren destroy)
 */
export async function renderGageRunStrips(context, host, cfg) {
  const charts = [];
  if (!host) return charts;
  host.replaceChildren();

  const panels = cfg.panels || [];
  if (!panels.length) return charts;

  const rows = splitPanelRows(panels, cfg.perRow || 10);
  const stale = cfg.isStale || (() => false);

  for (let i = 0; i < rows.length; i++) {
    if (stale()) break;

    const rowHost = document.createElement('div');
    rowHost.className = cfg.rowClass || 'gage-run-strip-row';
    host.appendChild(rowHost);

    const isLast = i === rows.length - 1;
    const chart = await context.chartManager.create(rowHost, 'gage-run-chart', {
      title: '',
      showTitle: false,
      xLabel: isLast ? (cfg.xLabel || '') : '',
      showXLabel: isLast && Boolean(cfg.xLabel),
      yLabel: cfg.yLabel || '',
      // Legende auf jedem Streifen: nur auf dem ersten würde die Legendenbreite
      // fehlen und die Panels der Zeilen würden nicht mehr fluchten.
      showLegend: (cfg.operators || []).length > 1,
      panels: rows[i],
      operators: cfg.operators || [],
      refValue: cfg.refValue,
      refLabel: cfg.refLabel || '',
      showOperatorMean: cfg.showOperatorMean === true,
      connectWithin: cfg.connectWithin !== false,
      sharedYMin: cfg.yMin,
      sharedYMax: cfg.yMax,
    });

    if (stale()) {
      try { context.chartManager.destroy(chart); } catch { /* ignore */ }
      break;
    }
    charts.push(chart);
  }

  return charts;
}
