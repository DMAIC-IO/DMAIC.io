/**
 * D.Mike — Wahrscheinlichkeitsnetz: Reihen aus Datensätzen. Rein.
 */

/**
 * Wie der alte Reihenbau: jede Zahl außer `NaN` zählt, Text („2,5“) nicht.
 * @param {unknown} v @returns {v is number}
 */
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);

/**
 * Je Datensatz eine Gruppe, mit Gruppenspalte eine je Stufe (mindestens zwei
 * Werte, Reihenfolge des ersten Auftretens). Zeilen ohne Wertespalte zählen
 * nicht; eine fehlende Spalte zählt wie eine leere.
 * @param {{ valueRef: object|null, groupRef: object|null }[]} datasets
 * @param {{ values: (ref: object) => any[]|null, name: (ref: object) => string|null }} read
 * @returns {{ groups: { col: string, level: string|null, values: number[] }[] } | { error: 'errNoGroupLevels'|'errTooFew', params: Record<string, any> }}
 */
export function buildGroups(datasets, read) {
  const groups = [];
  for (let i = 0; i < datasets.length; i++) {
    const ds = datasets[i];
    if (!ds.valueRef) continue;
    const raw = read.values(ds.valueRef) ?? [];
    const col = read.name(ds.valueRef) ?? '?';
    if (!ds.groupRef) {
      const values = raw.filter(isNum);
      if (values.length < 2) return { error: 'errTooFew', params: { col } };
      groups.push({ col, level: null, values });
      continue;
    }
    const levels = read.values(ds.groupRef) ?? [];
    /** @type {Map<string, number[]>} */
    const buckets = new Map();
    for (let r = 0; r < Math.min(raw.length, levels.length); r++) {
      const v = raw[r];
      const g = levels[r];
      if (!isNum(v) || g == null || g === '') continue;
      const key = String(g);
      if (!buckets.has(key)) buckets.set(key, []);
      /** @type {number[]} */ (buckets.get(key)).push(v);
    }
    if (buckets.size === 0) return { error: 'errNoGroupLevels', params: { n: i + 1 } };
    const kept = [...buckets].filter(([, vs]) => vs.length >= 2);
    if (kept.length === 0) return { error: 'errTooFew', params: { col } };
    for (const [level, values] of kept) groups.push({ col, level, values });
  }
  return { groups };
}

/**
 * Name einer Reihe: die Spalte, mit Gruppenspalte „Spalte — Stufe“ (in jeder
 * Sprache derselbe Text).
 * @param {{ col: string, level: string|null }} g
 * @returns {string}
 */
export const seriesName = (g) => (g.level === null ? g.col : `${g.col} — ${g.level}`);

/**
 * Reihen zum Zeichnen, mit den Einstellungen alter Stände je Index (samt
 * `name`). Keine Farben: der Diagrammtyp nimmt die Palette je Index.
 * @param {{ datasets: { valueRef: object|null, groupRef: object|null }[], legacySeries: readonly object[] }} model
 * @param {{ values: (ref: object) => any[]|null, name: (ref: object) => string|null }} read
 * @returns {{ series: Record<string, any>[] } | { error: 'errNoGroupLevels'|'errTooFew', params: Record<string, any> }}
 */
export function buildSeries(model, read) {
  const out = buildGroups(model.datasets, read);
  if ('error' in out) return out;
  return {
    series: out.groups.map((g, i) => ({
      name: seriesName(g), values: g.values, visible: true,
      ...(model.legacySeries[i] ?? {}),
    })),
  };
}
