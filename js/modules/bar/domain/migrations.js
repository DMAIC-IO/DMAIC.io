/**
 * D.Mike — Balkendiagramm: Migrationen. Rein.
 */
import { checkValue } from '../../../core/model.js';
import barChart from '../../../widgets/bar-chart/schema.js';

/** Vorgabe des alten `chartConfig.titleSize`: gleich → entfällt. */
const OLD_TITLE_SIZE = 15;

/** Grenzen der Schriftgrößen im `edits()`-Feld. */
const SIZE_MIN = 6;
const SIZE_MAX = 48;

/** Feldbeschreibungen des `edits()`-Felds. */
const CHART_SHAPE = /** @type {Record<string, any>} */ (barChart.edits().shape);

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
 * alten Vorgaben. Ein Titel mit Text bringt `showTitle: true` mit, außer er
 * war ausgeblendet; `titleSize` auf 6–48 geklemmt; `showLegend` nur als
 * `false`. Was danach nicht zum `edits()`-Feld passt, entfällt einzeln.
 * `barGap`, `categoryGap`, `legendTitle`, `aggregation`, `stacked` und
 * fremde Schlüssel entfallen.
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
  if (nonEmpty(cfg.xLabel)) chart.xLabel = cfg.xLabel;
  if (nonEmpty(cfg.yLabel)) chart.yLabel = cfg.yLabel;
  if (finite(cfg.titleSize)) {
    const v = Math.min(SIZE_MAX, Math.max(SIZE_MIN, cfg.titleSize));
    if (v !== OLD_TITLE_SIZE) chart.titleSize = v;
  }
  if (cfg.showLegend === false) chart.showLegend = false;
  if (nonEmpty(cfg.bgColor)) chart.bgColor = cfg.bgColor;
  for (const [k, v] of Object.entries(chart)) {
    try { checkValue(CHART_SHAPE[k], k, v); } catch { delete chart[k]; }
  }
  return chart;
}

/**
 * '0→1.0': Altstände ohne `_schema` (`xRef`/`yRef`/`gRef`, `chartConfig`),
 * auch die Vorbelegung aus der Diagrammempfehlung. Die Bezüge werden eine
 * Zeile der Datensätze, Aggregation und Stapeln eigene Felder, die
 * Darstellungsfelder wandern in `chart`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  const x = refOrNull(json.xRef);
  const y = refOrNull(json.yRef);
  const g = refOrNull(json.gRef);
  if (x || y || g) out.datasets = [{ x, y, g }];
  const cfg = json.chartConfig && typeof json.chartConfig === 'object' ? json.chartConfig : {};
  if (cfg.aggregation === 'sum') out.aggregation = 'sum';
  if (cfg.stacked === true) out.stacked = true;
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  out.chart = chartFrom(json.chartConfig);
  return out;
}
