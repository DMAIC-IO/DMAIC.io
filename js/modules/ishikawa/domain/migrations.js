/**
 * D.Mike — Ishikawa: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration nicht).
 */
import { decimalOr } from '../../../core/number-format.js';

/** Kategorien im Formatstand 1.0. */
const CAT_KEYS_1_0 = ['man', 'machine', 'environment', 'material', 'measurement', 'method'];

/**
 * Farben der Experten in Vergabereihenfolge im Formatstand 1.0 (gleich
 * `EXP_COLS` in constants.js; ein Unit-Test hält beide gleich).
 */
export const EXP_COLS = Object.freeze([
  '#6366f1', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#2563eb', '#84cc16', '#f97316',
]);

/** @param {unknown} v @returns {v is Record<string, any>} */
function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** @param {unknown} v @returns {any[]} die Liste, sonst leer */
function arr(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * Eine Kostenangabe wie die Altform sie beim Bearbeiten normalisierte:
 * fehlend oder leer → `null`, Text mit Dezimalkomma oder -punkt → Zahl,
 * unlesbarer Text → `null`, sonst unverändert.
 * @param {unknown} v @returns {unknown}
 */
function cost(v) {
  if (v === undefined) return null;
  return typeof v === 'string' ? decimalOr(v, null) : v;
}

/** @param {unknown} id @returns {number} laufende Nummer aus `H-007`, sonst 0 */
function stableNumber(id) {
  const n = parseInt(String(id ?? '').split('-')[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Experten: Einträge ohne `color` bekommen die Farbe nach Index.
 * @param {unknown} list @returns {object[]}
 */
function experts(list) {
  return arr(list).filter(isObj).map((e, i) => (
    typeof e.color === 'string' && e.color !== '' ? { ...e } : { ...e, color: EXP_COLS[i % EXP_COLS.length] }
  ));
}

/**
 * Zeilen: Altform-Zeilen (id keine Zahl) entfallen, fehlende Felder bekommen
 * ihre Vorgabe, Waisen werden Hauptursachen ohne Kategorie. Die stableId
 * vergibt `fillStable` danach.
 * @param {unknown} list @returns {object[]}
 */
function rows(list) {
  const out = arr(list).filter((r) => isObj(r) && typeof r.id === 'number').map((r) => ({
    ...r,
    parentId: r.parentId ?? null,
    category: r.category ?? '',
    name: r.name ?? '',
    description: r.description ?? '',
    ratings: isObj(r.ratings) ? { ...r.ratings } : {},
    status: r.status ?? 'open',
  }));
  const ids = new Set(out.map((r) => r.id));
  for (const r of out) {
    if (r.parentId !== null && !ids.has(r.parentId)) {
      r.parentId = null;
      r.category = '';
    }
  }
  return out;
}

/**
 * Zeilen ohne stableId bekommen `H-<n>` in Reihenfolge (erst die Zeilen,
 * dann die Snapshot-Zeilen), fortlaufend hinter der größten vorhandenen Nummer.
 * @param {object[][]} groups
 */
function fillStable(groups) {
  let max = 0;
  for (const g of groups) for (const r of g) max = Math.max(max, stableNumber(r.stableId));
  for (const g of groups) {
    for (const r of g) {
      if (typeof r.stableId === 'string' && r.stableId !== '') continue;
      max += 1;
      r.stableId = `H-${String(max).padStart(3, '0')}`;
    }
  }
}

/**
 * '0→1.0': Altstände ohne `_schema` (Form des alten `toJSON`).
 * - Experten ohne `color` bekommen `EXP_COLS[i]`.
 * - Zeilen der Altform `{ id: 'r1', cat, text, votes }` entfallen; fehlende
 *   Zeilenfelder bekommen ihre Vorgabe (`ratings: {}`, Texte `''`, Status
 *   `'open'`); Waisen werden Hauptursachen ohne Kategorie; fehlende
 *   stableIds werden `H-001` … über Zeilen und Snapshot-Zeilen ohne Doppel.
 * - Snapshots: `data` wie Problem, Experten und Zeilen oben.
 * - `catLabels` nur mit den sechs Kategorien (fehlend `''`), `images` mit
 *   `inScope`/`outScope` (fehlend oder als Array: leer).
 * - Kosten der Experimente als Text werden Zahl, leer `null`; Verweise
 *   `hypothesisIds` auf stableIds, die es unter den Zeilen nicht gibt,
 *   entfallen (der alte `loadSnapshot` ließ sie stehen).
 * @param {Record<string, any>} json Kopie des gespeicherten Zustands
 * @returns {object}
 */
export function from0(json) {
  const out = { ...json };
  if (Object.hasOwn(json, 'experts')) out.experts = experts(json.experts);
  out.rows = rows(json.rows);
  const snapshots = arr(json.snapshots).filter(isObj).map((s) => {
    const data = isObj(s.data) ? s.data : {};
    return { ...s, data: { ...data, problem: data.problem ?? '', experts: experts(data.experts), rows: rows(data.rows) } };
  });
  fillStable([out.rows, ...snapshots.map((s) => s.data.rows)]);
  if (Object.hasOwn(json, 'snapshots')) out.snapshots = snapshots;
  const labels = isObj(json.catLabels) ? json.catLabels : {};
  out.catLabels = Object.fromEntries(CAT_KEYS_1_0.map((k) => [k, typeof labels[k] === 'string' ? labels[k] : '']));
  const images = isObj(json.images) ? json.images : {};
  out.images = { inScope: arr(images.inScope), outScope: arr(images.outScope) };
  if (Object.hasOwn(json, 'experiments')) {
    const known = new Set(out.rows.map((r) => r.stableId));
    out.experiments = arr(json.experiments).map((x) => (isObj(x)
      ? {
        ...x,
        costMoney: cost(x.costMoney),
        costHours: cost(x.costHours),
        ...(Array.isArray(x.hypothesisIds) ? { hypothesisIds: x.hypothesisIds.filter((sid) => known.has(sid)) } : {}),
      }
      : x));
  }
  return out;
}
