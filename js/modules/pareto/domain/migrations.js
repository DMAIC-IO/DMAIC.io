/**
 * D.Mike — Pareto-Diagramm: Migrationen. Rein.
 */
import { checkValue } from '../../../core/model.js';
import paretoChart from '../../../widgets/pareto-chart/schema.js';

/** Vorgaben des alten `chartConfig`: gleich → entfällt. */
const CHART_DEFAULTS = { maxItems: 20, refLineValue: 80 };

/** Feldbeschreibungen des `edits()`-Felds. */
const CHART_SHAPE = /** @type {Record<string, any>} */ (paretoChart.edits().shape);

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
 * alten Vorgaben. `refLineValue` auf ≥ 0 geklemmt, `maxItems` gerundet
 * (0 und Negatives entfallen, der Typ las dann die Vorgabe), `otherBucket`
 * nur als `false`. Was danach nicht zum `edits()`-Feld passt, entfällt
 * einzeln. `barOpacity`, `legendTitle`, `aggregation` und fremde Schlüssel
 * entfallen.
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
    if (cfg.showTitle === false) chart.showTitle = false;
  }
  if (finite(cfg.refLineValue)) {
    const v = Math.max(0, cfg.refLineValue);
    if (v !== CHART_DEFAULTS.refLineValue) chart.refLineValue = v;
  }
  if (finite(cfg.maxItems)) {
    const v = Math.round(cfg.maxItems);
    if (v >= 1 && v !== CHART_DEFAULTS.maxItems) chart.maxItems = v;
  }
  if (cfg.otherBucket === false) chart.otherBucket = false;
  if (nonEmpty(cfg.bgColor)) chart.bgColor = cfg.bgColor;
  for (const [k, v] of Object.entries(chart)) {
    try { checkValue(CHART_SHAPE[k], k, v); } catch { delete chart[k]; }
  }
  return chart;
}

/**
 * '0→1.0': Altstände ohne `_schema` (`xRef`/`yRef`/`gRef`, `chartConfig`),
 * auch die Vorbelegung aus der Diagrammempfehlung (nur Bezüge). Die Bezüge
 * werden eine Zeile der Datensätze, die Aggregation ein eigenes Feld, die
 * Darstellungsfelder wandern in `chart`. Ein fremdes `datasets` wird nicht
 * gelesen.
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
  if (cfg.aggregation === 'mean') out.aggregation = 'mean';
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  out.chart = chartFrom(json.chartConfig);
  return out;
}
