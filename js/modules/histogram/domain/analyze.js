/**
 * D.Mike — Histogramm: Reihen aus Datensätzen. Rein.
 */
import { CHART_COLORS_RGBA, BORDER_COLORS } from '../../../core/chart/chart-colors.js';
import { readColumn, columnLabel } from '../../../core/source-columns.js';

/**
 * Spaltenleser für `buildGroups`/`buildSeries` über den Leser `src`: Werte und
 * Anzeigename einer Spalte; `null`, wenn sie nicht lesbar ist.
 * @param {import('../../../core/source-reader.js').Source} src
 * @returns {{ values: (ref: object) => any[]|null, name: (ref: object) => string|null }}
 */
export function sourceColumns(src) {
  return {
    values: (ref) => readColumn(src, /** @type {any} */ (ref))?.values ?? null,
    name: (ref) => { const c = readColumn(src, /** @type {any} */ (ref)); return c ? columnLabel(c) : null; },
  };
}

/** @param {unknown} v @returns {v is number} */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Je Datensatz eine Reihe, mit Gruppenspalte eine je Stufe (mindestens zwei Werte).
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
    const col = read.name(ds.valueRef) ?? '';
    if (!ds.groupRef) {
      const values = raw.filter(isNum);
      if (values.length < 2) return { error: 'errTooFew', params: { col } };
      groups.push({ col, level: null, values });
      continue;
    }
    const levels = read.values(ds.groupRef) ?? [];
    const buckets = new Map();
    for (let r = 0; r < Math.min(raw.length, levels.length); r++) {
      const v = raw[r];
      const g = levels[r];
      if (!isNum(v) || g == null || g === '') continue;
      const key = String(g);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(v);
    }
    if (buckets.size === 0) return { error: 'errNoGroupLevels', params: { n: i + 1 } };
    const kept = [...buckets].filter(([, vs]) => vs.length >= 2);
    if (kept.length === 0) return { error: 'errTooFew', params: { col } };
    for (const [level, values] of kept) groups.push({ col, level, values });
  }
  return { groups };
}

/**
 * Name einer Reihe: die Spalte, mit Gruppenspalte „Spalte — Stufe“.
 * @param {{ col: string, level: string|null }} g
 * @returns {string}
 */
export const groupSeriesName = (g) => (g.level === null ? g.col : `${g.col} — ${g.level}`);

/**
 * Reihen mit Darstellung (Farben, Rahmen, Einstellungen alter Stände je Index).
 * @param {{ datasets: { valueRef: object|null, groupRef: object|null }[], legacySeries: readonly object[] }} model
 * @param {{ values: (ref: object) => any[]|null, name: (ref: object) => string|null }} read
 * @returns {{ series: Record<string, any>[] } | { error: 'errNoGroupLevels'|'errTooFew', params: Record<string, any> }}
 */
export function buildSeries(model, read) {
  const out = buildGroups(model.datasets, read);
  if ('error' in out) return out;
  return {
    series: out.groups.map((g, i) => ({
      name: groupSeriesName(g),
      values: g.values, visible: true,
      fillColor: CHART_COLORS_RGBA[i % CHART_COLORS_RGBA.length],
      borderColor: BORDER_COLORS[i % BORDER_COLORS.length],
      borderWidth: 1, borderStyle: 'solid', pattern: '', patternColor: '', patternSolidity: 0.4,
      showNormalCurve: true,
      ...(model.legacySeries[i] ?? {}),
    })),
  };
}
