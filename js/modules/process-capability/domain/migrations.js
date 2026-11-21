/**
 * D.Mike — Process Capability: Migrationen. Rein.
 */
import { parseDecimalInput, decimalOr } from '../../../core/parse-decimal.js';
import { columnRefFromJSON } from '../../../core/chart/chart-data-prep.js';
import { WITHIN_METHODS } from '../../../engines/sigma-within-engine.js';

/**
 * Grenze des alten Stands: Zahl bleibt, lesbarer Text wird Zahl, alles andere
 * (leer, `NaN`, unlesbar) wird `null`.
 * @param {unknown} v
 * @returns {number|null}
 */
function limitFrom(v) {
  const n = parseDecimalInput(/** @type {any} */ (v));
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Konfidenz in Prozent: Anteil ≤ 1 wird mal 100, leer, unlesbar oder ≤ 0
 * wird 95; auf zwei Stellen gerundet.
 * @param {unknown} v
 * @returns {number}
 */
function confidenceFrom(v) {
  if (v == null || v === '') return 95;
  const n = decimalOr(/** @type {any} */ (v), NaN);
  if (!Number.isFinite(n) || n <= 0) return 95;
  const pct = n <= 1 ? n * 100 : n;
  return Number(pct.toFixed(2));
}

/**
 * Untergruppengröße: ganze Zahl ≥ 1, sonst 1.
 * @param {unknown} v
 * @returns {number}
 */
function subgroupSizeFrom(v) {
  const n = Math.trunc(typeof v === 'number' ? v : parseFloat(String(v ?? '').trim()));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Spannweite der gleitenden Spannweiten: ganze Zahl 2 … 100, sonst 2.
 * @param {unknown} v
 * @returns {number}
 */
function mrSpanFrom(v) {
  const s = String(v ?? '').trim();
  if (!/^\d+$/.test(s)) return 2;
  const n = Number(s);
  return n >= 2 && n <= 100 ? n : 2;
}

/**
 * Spaltenbezug: unvollständig → `null`.
 * @param {unknown} v
 * @returns {{ instanceId: string, sheetId: string, columnId: string }|null}
 */
function refFrom(v) {
  return columnRefFromJSON(v);
}

/**
 * Stand ohne Versionsangabe auf die aktuelle Form heben.
 * @param {any} json gespeicherter Zustand
 * @returns {any}
 */
export function from0(json) {
  const d = json && typeof json === 'object' ? json : {};
  const p = d.params && typeof d.params === 'object' ? d.params : {};
  const embedded = Array.isArray(d.embeddedValues)
    && d.embeddedValues.every((v) => typeof v === 'number' && !Number.isNaN(v))
    ? [...d.embeddedValues] : null;
  const { lastResult: _dropped, ...rest } = d;
  return {
    ...rest,
    params: {
      name: typeof p.name === 'string' ? p.name : '',
      unit: typeof p.unit === 'string' && p.unit ? p.unit : 'mm',
      lsl: limitFrom(p.lsl),
      target: limitFrom(p.target),
      usl: limitFrom(p.usl),
      confidence: confidenceFrom(p.confidence),
      subgroupMode: p.subgroupMode === 'column' ? 'column' : 'size',
      subgroupSize: subgroupSizeFrom(p.subgroupSize),
      withinMethod: WITHIN_METHODS.includes(p.withinMethod) ? p.withinMethod : '',
      unbiased: typeof p.unbiased === 'boolean' ? p.unbiased : true,
      mrSpan: mrSpanFrom(p.mrSpan),
    },
    columnRef: embedded ? null : refFrom(d.columnRef),
    subgroupColumnRef: refFrom(d.subgroupColumnRef),
    embeddedValues: embedded,
    embeddedLabel: typeof d.embeddedLabel === 'string' ? d.embeddedLabel : '',
  };
}
