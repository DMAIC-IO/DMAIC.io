/**
 * D.Mike — Einzelwertdiagramm: Gruppen aus den Datensätzen. Rein.
 */

/** Gruppenslots einer Zeile in der Reihenfolge der Verschachtelung. */
const GROUP_SLOTS = /** @type {const} */ (['group', 'group2', 'group3']);

/** @param {unknown} v @returns {v is number} */
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);

/**
 * @typedef {{ value: object|null, group: object|null, group2: object|null, group3: object|null }} DatasetRow
 * @typedef {{ values: (ref: object) => any[]|null, name: (ref: object) => string|null }} ColumnReader
 * @typedef {{ name: string, values: number[] }} Group
 */

/**
 * Die Punktgruppen aller Zeilen. Ohne Gruppenspalte bildet eine Zeile eine
 * Gruppe; mit Gruppenspalten eine je Wertetupel („Spalte — A | X“), in der
 * Reihenfolge des ersten Auftretens. Gelesen wird bis zur kürzesten Spalte;
 * Zeilen, in denen ein Gruppenwert fehlt, fallen heraus. Zeilen ohne
 * Wertespalte zählen nicht.
 *
 * @param {readonly DatasetRow[]} datasets
 * @param {ColumnReader} read
 * @returns {{ groups: Group[] } | { error: 'errTooFew'|'errNoData', params: Record<string, any> }}
 */
export function buildGroups(datasets, read) {
  const rows = datasets.filter((ds) => ds.value);
  if (rows.length === 0) return { groups: [] };
  /** @type {Group[]} */
  const groups = [];
  for (const ds of rows) {
    const raw = read.values(/** @type {object} */ (ds.value)) ?? [];
    const col = read.name(/** @type {object} */ (ds.value)) ?? '?';
    const groupRefs = GROUP_SLOTS.map((k) => ds[k]).filter(Boolean);
    if (groupRefs.length === 0) {
      const values = raw.filter(isNum);
      if (values.length < 1) return { error: 'errTooFew', params: { col } };
      groups.push({ name: col, values });
      continue;
    }
    const groupCols = groupRefs.map((g) => read.values(/** @type {object} */ (g)) ?? []);
    const len = Math.min(raw.length, ...groupCols.map((arr) => arr.length));
    /** @type {Map<string, number[]>} */
    const buckets = new Map();
    for (let j = 0; j < len; j++) {
      const v = raw[j];
      if (!isNum(v)) continue;
      const tuple = groupCols.map((arr) => arr[j]);
      if (tuple.some((x) => x == null)) continue;
      const key = tuple.map(String).join(' | ');
      if (!buckets.has(key)) buckets.set(key, []);
      /** @type {number[]} */ (buckets.get(key)).push(v);
    }
    for (const [key, values] of buckets) groups.push({ name: `${col} — ${key}`, values });
  }
  if (groups.length === 0) return { error: 'errNoData', params: {} };
  return { groups };
}
