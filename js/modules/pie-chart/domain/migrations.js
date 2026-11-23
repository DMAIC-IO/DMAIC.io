/**
 * D.Mike — Tortendiagramm: Migrationen. Rein.
 */
import { checkValue } from '../../../core/model.js';
import pieChart from '../../../widgets/pie-chart/schema.js';

/** Vorgaben des alten `chartConfig`: gleich → entfällt. */
const CHART_DEFAULTS = {
  showTitle: true, showLegend: true, showLabels: true,
  labelMode: 'both', labelSize: 11,
  innerRadius: 0, padAngle: 0.8, startAngle: -90, explodeDistance: 12, strokeWidth: 2,
  sortSlices: 'none',
};
const TEXTS = /** @type {const} */ (['title', 'centerLabel', 'centerSub', 'bgColor']);
const SWITCHES = /** @type {const} */ (['showTitle', 'showLegend', 'showLabels']);
/** @type {Record<'labelMode'|'sortSlices', readonly string[]>} */
const ENUMS = { labelMode: ['percent', 'value', 'name', 'both'], sortSlices: ['none', 'asc', 'desc'] };
const NON_NEGATIVE = /** @type {const} */ (['innerRadius', 'padAngle', 'explodeDistance', 'strokeWidth']);

/** Feldbeschreibungen des `edits()`-Felds. */
const CHART_SHAPE = /** @type {Record<string, any>} */ (pieChart.edits().shape);

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
 * alten Vorgaben, Größen geklemmt wie im Editor. Was danach nicht zum
 * `edits()`-Feld passt, entfällt einzeln. `titleSize`, `strokeColor`,
 * `slices` und fremde Schlüssel entfallen.
 * @param {unknown} raw
 * @returns {Record<string, any>}
 */
function chartFrom(raw) {
  /** @type {Record<string, any>} */
  const chart = {};
  if (!raw || typeof raw !== 'object') return chart;
  const cfg = /** @type {Record<string, any>} */ (raw);
  for (const k of TEXTS) if (nonEmpty(cfg[k])) chart[k] = cfg[k];
  for (const k of SWITCHES) if (typeof cfg[k] === 'boolean' && cfg[k] !== CHART_DEFAULTS[k]) chart[k] = cfg[k];
  for (const [k, values] of Object.entries(ENUMS)) {
    if (values.includes(cfg[k]) && cfg[k] !== CHART_DEFAULTS[/** @type {'labelMode'|'sortSlices'} */ (k)]) chart[k] = cfg[k];
  }
  if (finite(cfg.labelSize)) {
    const v = Math.min(48, Math.max(6, cfg.labelSize));
    if (v !== CHART_DEFAULTS.labelSize) chart.labelSize = v;
  }
  for (const k of NON_NEGATIVE) {
    if (!finite(cfg[k])) continue;
    const v = Math.max(0, cfg[k]);
    if (v !== CHART_DEFAULTS[k]) chart[k] = v;
  }
  if (finite(cfg.startAngle) && cfg.startAngle !== CHART_DEFAULTS.startAngle) chart.startAngle = cfg.startAngle;
  for (const [k, v] of Object.entries(chart)) {
    try { checkValue(CHART_SHAPE[k], k, v); } catch { delete chart[k]; }
  }
  return chart;
}

/**
 * '0→1.0': Altstände ohne `_schema` (`valueRef`/`labelRef`, `chartConfig`,
 * ältere auch `slices`). Die Bezüge werden eine Zeile der Datensätze, die
 * Darstellungsfelder wandern in `chart`.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  const value = refOrNull(json.valueRef);
  const label = refOrNull(json.labelRef);
  if (value || label) out.datasets = [{ value, label }];
  if (typeof json.exampleWorksheetId === 'string') out.exampleWorksheetId = json.exampleWorksheetId;
  out.chart = chartFrom(json.chartConfig);
  return out;
}
