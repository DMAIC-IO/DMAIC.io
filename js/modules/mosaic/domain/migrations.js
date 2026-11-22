/**
 * D.Mike — Mosaikdiagramm: Migrationen. Rein.
 */

/** Vorgaben des alten `chartConfig`: gleich → entfällt. */
const CHART_DEFAULTS = { title: '', showTitle: true, showLegend: true, showCellLabels: true, columnGap: 2, segmentGap: 1, bgColor: null };
const SWITCHES = /** @type {const} */ (['showLegend', 'showCellLabels']);
const GAPS = /** @type {const} */ (['columnGap', 'segmentGap']);

/** @param {unknown} v @returns {{ instanceId: string, sheetId?: string, columnId: string }|null} */
function refOrNull(v) {
  const r = /** @type {any} */ (v);
  if (!r || typeof r !== 'object' || typeof r.instanceId !== 'string' || typeof r.columnId !== 'string' || !r.instanceId || !r.columnId) return null;
  return { instanceId: r.instanceId, ...(typeof r.sheetId === 'string' && r.sheetId ? { sheetId: r.sheetId } : {}), columnId: r.columnId };
}

/** @param {unknown} v @returns {v is number} */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
/** @param {unknown} v @returns {v is string} */
const nonEmpty = (v) => typeof v === 'string' && v !== '';

/**
 * Die Darstellungsfelder des alten `chartConfig`: nur Abweichungen von den
 * alten Vorgaben, Abstände auf ≥ 0 geklemmt wie im Diagrammtyp. Ein
 * sichtbarer Titel bringt `showTitle` mit, weil die Konfiguration den Titel
 * ohne eigenen Text ausblendet.
 * @param {unknown} raw
 * @returns {Record<string, any>}
 */
function chartFrom(raw) {
  /** @type {Record<string, any>} */
  const chart = {};
  if (!raw || typeof raw !== 'object') return chart;
  const cfg = /** @type {Record<string, any>} */ (raw);
  if (nonEmpty(cfg.title)) {
    chart.title = cfg.title;
    if (cfg.showTitle !== false) chart.showTitle = true;
  }
  for (const k of SWITCHES) if (typeof cfg[k] === 'boolean' && cfg[k] !== CHART_DEFAULTS[k]) chart[k] = cfg[k];
  for (const k of GAPS) {
    if (!finite(cfg[k])) continue;
    const v = Math.max(0, cfg[k]);
    if (v !== CHART_DEFAULTS[k]) chart[k] = v;
  }
  if (nonEmpty(cfg.bgColor)) chart.bgColor = cfg.bgColor;
  return chart;
}

/**
 * '0→1.0': Altstände ohne `_schema` (`xRef`/`gRef`, `chartConfig`), auch
 * die Vorbelegung aus der Diagrammempfehlung (nur `xRef`/`gRef`). Die
 * Bezüge werden eine Zeile der Datensätze, die Darstellungsfelder wandern
 * in `chart`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  const x = refOrNull(json.xRef);
  const g = refOrNull(json.gRef);
  if (x || g) out.datasets = [{ x, g }];
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  out.chart = chartFrom(json.chartConfig);
  return out;
}
