/**
 * D.Mike — Boxplot: Boxen aus den Datensätzen. Rein.
 */

/** @param {unknown} v @returns {v is number} */
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);

/**
 * @typedef {{ value: object|null, group: object|null }} DatasetRow
 * @typedef {{ values: (ref: object) => any[]|null, name: (ref: object) => string|null }} ColumnReader
 * @typedef {{ name: string, values: number[] }} Group
 */

/**
 * Die Boxen aller Zeilen. Ohne Gruppenspalte bildet eine Zeile eine Box und
 * braucht mindestens zwei Werte, sonst bricht die ganze Zeichnung mit
 * `errTooFew` ab. Mit Gruppenspalte eine Box je Gruppenwert („Spalte — A“)
 * in der Reihenfolge des ersten Auftretens; gelesen wird bis zur kürzeren
 * Spalte, Zeilen mit fehlendem Wert oder Gruppenwert fallen heraus, Gruppen
 * mit weniger als zwei Werten still ebenso. Es zählen nur Zahlen (kein
 * Text, kein NaN). Zeilen ohne Wertespalte zählen nicht.
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
    if (!ds.group) {
      const values = raw.filter(isNum);
      if (values.length < 2) return { error: 'errTooFew', params: { col } };
      groups.push({ name: col, values });
      continue;
    }
    const rawGroups = read.values(ds.group) ?? [];
    const len = Math.min(raw.length, rawGroups.length);
    /** @type {Map<string, number[]>} */
    const buckets = new Map();
    for (let j = 0; j < len; j++) {
      const v = raw[j];
      const g = rawGroups[j];
      if (!isNum(v) || g == null) continue;
      const key = String(g);
      if (!buckets.has(key)) buckets.set(key, []);
      /** @type {number[]} */ (buckets.get(key)).push(v);
    }
    for (const [key, values] of buckets) {
      if (values.length >= 2) groups.push({ name: `${col} — ${key}`, values });
    }
  }
  if (groups.length === 0) return { error: 'errNoData', params: {} };
  return { groups };
}
