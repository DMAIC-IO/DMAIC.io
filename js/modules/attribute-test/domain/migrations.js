/**
 * D.Mike — Attributtest: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js.
 */
import { parseDecimalInput } from '../../../core/parse-decimal.js';

const KINDS = ['one', 'two', 'equiv', 'mcnemar', 'rate1', 'rate2', 'assoc'];
const MODES = ['summary', 'columns'];
const DIRECTIONS = ['two-sided', 'greater', 'less'];
const COUNT_KEYS = ['x', 'n', 'x1', 'n1', 'x2', 'n2'];
const POSITIVE_KEYS = ['t', 't1', 't2', 'lambda0'];
const COL_REF_KEYS = ['response', 'group', 'rowVar', 'colVar', 'counts', 'before', 'after'];
const MIN_DIM = 2;

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Text oder Zahl als Zahl über `parseDecimalInput`; Leeres und Unlesbares
 * wird `null`.
 * @param {unknown} v @returns {number|null}
 */
function decimal(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || v.trim() === '') return null;
  const n = parseDecimalInput(v);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Eine Anzahl wie das alte `parseCount`: Leerzeichen entfernen, nur Ziffern
 * zählen; sonst `null`.
 * @param {unknown} v @returns {number|null}
 */
function countOf(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, '');
  return /^\d+$/.test(s) ? Number(s) : null;
}

/** @param {unknown} v @returns {number|null} */
const positiveOf = (v) => { const n = decimal(v); return n !== null && n > 0 ? n : null; };

/** Text wie das alte `str`: Zahl als Text, sonst `''`. @param {unknown} v @returns {string} */
const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/**
 * Die Kreuztabelle wie das alte `sanitizeTable`: ungültige Form → Vorgabe.
 * @param {unknown} t
 */
function table(t) {
  const fallback = { rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[null, null], [null, null]] };
  if (!isObj(t) || !Array.isArray(t.rows) || !Array.isArray(t.cols) || !Array.isArray(t.counts)) return fallback;
  const rows = t.rows.map(str);
  const cols = t.cols.map(str);
  if (rows.length < MIN_DIM || cols.length < MIN_DIM || t.counts.length !== rows.length) return fallback;
  const ok = t.counts.every((row) => Array.isArray(row) && row.length === cols.length);
  if (!ok) return fallback;
  return { rows, cols, counts: t.counts.map((row) => row.map((v) => countOf(str(v)))) };
}

/**
 * Die McNemar-Tafel wie das alte `sanitizePairs`: Bezeichnungen als Text,
 * Anzahlen nur in der Form 2 × 2, sonst leer.
 * @param {unknown} p
 */
function pairs(p) {
  const out = { labels: { before: '', after: '' }, counts: [[null, null], [null, null]] };
  if (!isObj(p)) return out;
  if (isObj(p.labels)) out.labels = { before: str(p.labels.before), after: str(p.labels.after) };
  const c = p.counts;
  const valid = Array.isArray(c) && c.length === 2
    && c.every((row) => Array.isArray(row) && row.length === 2
      && row.every((v) => typeof v === 'string' || typeof v === 'number'));
  if (valid) out.counts = c.map((row) => row.map(countOf));
  return out;
}

/** Ein Spaltenbezug: nur `{ instanceId, sheetId?, columnId }` als Text, sonst `null`. */
function ref(r) {
  if (!isObj(r) || typeof r.instanceId !== 'string' || typeof r.columnId !== 'string') return null;
  return typeof r.sheetId === 'string'
    ? { instanceId: r.instanceId, sheetId: r.sheetId, columnId: r.columnId }
    : { instanceId: r.instanceId, columnId: r.columnId };
}

/**
 * '0→1.0': Altstände ohne `_schema` (Eingaben als Rohtext, `alpha` `null` =
 * „aus den Einstellungen“). Nicht strenger als das alte `fromJSON`.
 *
 * - Testart, Eingabeart, Richtung außerhalb der Liste → Vorgabe; Schalter nur
 *   als Wahrheitswert; `equiv.samples` `1`, sonst `2`; `equiv.symmetric`
 *   Wahrheitswert, sonst `true`.
 * - `alpha`: fehlt → entfällt (Kontextvorgabe); `null`, keine Zahl oder
 *   außerhalb (0; 1) → 0,05.
 * - Anzahlen (auch in den Tafeln): Leerzeichen entfernen, nur Ziffern → Zahl,
 *   sonst `null`.
 * - `t`, `t1`, `t2`, `lambda0`, `exposurePerRow`: positive Zahl, sonst `null`;
 *   `p0` in (0; 1), sonst `null`; `diff0` und die Äquivalenzgrenzen endlich,
 *   sonst `null`. `p0` und `exposurePerRow` ohne Text oder Zahl entfallen
 *   (Vorgabe 0,5 bzw. 1), `diff0` ohne Text oder Zahl wird 0.
 * - Tafeln in der Form des alten `sanitizeTable`/`sanitizePairs`, sonst Vorgabe.
 * - Spaltenbezüge nur in Bezugsform; `eventValue` Text oder `null`;
 *   `exampleWorksheetId` Text oder `null`. Fremde Schlüssel entfallen.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  out.testKind = KINDS.includes(json.testKind) ? json.testKind : 'two';
  out.inputMode = MODES.includes(json.inputMode) ? json.inputMode : 'summary';
  out.direction = DIRECTIONS.includes(json.direction) ? json.direction : 'two-sided';
  if ('alpha' in json) {
    const a = json.alpha;
    out.alpha = typeof a === 'number' && Number.isFinite(a) && a > 0 && a < 1 ? a : 0.05;
  }
  if (typeof json.p0 === 'string' || typeof json.p0 === 'number') {
    const p = decimal(json.p0);
    out.p0 = p !== null && p > 0 && p < 1 ? p : null;
  }
  if (typeof json.pooled === 'boolean') out.pooled = json.pooled;
  if (typeof json.ratePooled === 'boolean') out.ratePooled = json.ratePooled;
  const eq = isObj(json.equiv) ? json.equiv : {};
  out.equiv = {
    samples: eq.samples === 1 ? 1 : 2,
    symmetric: typeof eq.symmetric === 'boolean' ? eq.symmetric : true,
    delta: decimal(eq.delta),
    lower: decimal(eq.lower),
    upper: decimal(eq.upper),
  };
  if (typeof json.exposurePerRow === 'string' || typeof json.exposurePerRow === 'number') {
    out.exposurePerRow = positiveOf(json.exposurePerRow);
  }
  const sm = isObj(json.summary) ? json.summary : {};
  /** @type {Record<string, any>} */
  const summary = {};
  for (const k of COUNT_KEYS) summary[k] = countOf(sm[k]);
  for (const k of POSITIVE_KEYS) summary[k] = positiveOf(sm[k]);
  summary.diff0 = typeof sm.diff0 === 'string' || typeof sm.diff0 === 'number' ? decimal(sm.diff0) : 0;
  summary.pairs = pairs(sm.pairs);
  summary.table = table(sm.table);
  out.summary = summary;
  const cr = isObj(json.colRefs) ? json.colRefs : {};
  out.colRefs = Object.fromEntries(COL_REF_KEYS.map((k) => [k, ref(cr[k])]));
  out.eventValue = typeof json.eventValue === 'string' ? json.eventValue : null;
  out.exampleWorksheetId = typeof json.exampleWorksheetId === 'string' ? json.exampleWorksheetId : null;
  return out;
}
