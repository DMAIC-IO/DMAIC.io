/**
 * D.Mike — Heatmap: Migrationen. Rein.
 */
import { checkValue } from '../../../core/model.js';
import heatmapChart from '../../../widgets/heatmap-chart/schema.js';

/** Alte Vorgaben in `chartConfig`: gleich → entfällt. */
const OLD_CELL_GAP = 1;
const OLD_VALUE_DECIMALS = 1;
const OLD_COLOR_SCHEME = 'viridis';

/** Grenzen der Nachkommastellen im Editor. */
const DECIMALS_MIN = 0;
const DECIMALS_MAX = 6;

/** Feldbeschreibungen des `edits()`-Felds. */
const CHART_SHAPE = /** @type {Record<string, any>} */ (heatmapChart.edits().shape);

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
 * war ausgeblendet; `cellGap` auf ≥ 0 geklemmt, `valueDecimals` gerundet und
 * auf 0–6 geklemmt; `showCellLabels` nur als `false`. Was danach nicht zum
 * `edits()`-Feld passt, entfällt einzeln. `aggregation`, `xLabel`, `yLabel`,
 * `titleSize` und fremde Schlüssel entfallen (die Altform las sie nicht).
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
  if (cfg.showCellLabels === false) chart.showCellLabels = false;
  if (finite(cfg.cellGap)) {
    const v = Math.max(0, cfg.cellGap);
    if (v !== OLD_CELL_GAP) chart.cellGap = v;
  }
  if (finite(cfg.valueDecimals)) {
    const v = Math.min(DECIMALS_MAX, Math.max(DECIMALS_MIN, Math.round(cfg.valueDecimals)));
    if (v !== OLD_VALUE_DECIMALS) chart.valueDecimals = v;
  }
  if (nonEmpty(cfg.colorScheme) && cfg.colorScheme !== OLD_COLOR_SCHEME) chart.colorScheme = cfg.colorScheme;
  if (nonEmpty(cfg.bgColor)) chart.bgColor = cfg.bgColor;
  for (const [k, v] of Object.entries(chart)) {
    try { checkValue(CHART_SHAPE[k], k, v); } catch { delete chart[k]; }
  }
  return chart;
}

/**
 * '0→1.0': Altstände ohne `_schema` (`xRef`/`gRef`/`vRef`, `chartConfig`),
 * auch die Vorbelegung aus der Diagrammempfehlung. Die Bezüge werden eine
 * Zeile der Datensätze, die Aggregation ein eigenes Feld, die
 * Darstellungsfelder wandern in `chart`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  const x = refOrNull(json.xRef);
  const g = refOrNull(json.gRef);
  const v = refOrNull(json.vRef);
  if (x || g || v) out.datasets = [{ x, g, v }];
  const cfg = json.chartConfig && typeof json.chartConfig === 'object' ? json.chartConfig : {};
  if (cfg.aggregation === 'sum') out.aggregation = 'sum';
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  out.chart = chartFrom(json.chartConfig);
  return out;
}
