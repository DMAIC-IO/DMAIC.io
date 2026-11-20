/**
 * D.Mike — XY-Plot: Reihen aus Datensätzen. Rein.
 */
import { CHART_COLORS } from '../../../core/chart/chart-colors.js';
import { sourceColumns } from '../../../core/source-columns.js';
import { buildBubble } from './bubble.js';

export { sourceColumns };

/** @typedef {{ values: (ref: object) => any[]|null, name: (ref: object) => string|null }} Read */

/** @param {unknown} v @returns {v is number} */
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);

/**
 * Eine Reihe mit Darstellung.
 * @param {number} idx
 * @param {string} name
 * @param {number[]} x
 * @param {number[]} y
 * @param {{ sizes: number[], rawSizes: number[], label: string }|null} bubble
 * @param {{ showMarkers: boolean, showLines: boolean }} model
 * @returns {Record<string, any>}
 */
function makeSeries(idx, name, x, y, bubble, model) {
  const s = {
    name,
    color: CHART_COLORS[idx % CHART_COLORS.length],
    stroke: 'var(--chart-marker-stroke)',
    strokeWidth: 1.5,
    symbol: 'circle',
    visible: true,
    x,
    y,
    markerSize: model.showMarkers ? 7 : 0,
    connectLine: { show: model.showLines, dash: 'solid', width: 2 },
  };
  if (bubble && model.showMarkers) {
    s.sizes = bubble.sizes;
    s.sizeValues = bubble.rawSizes;
    s.sizeLabel = bubble.label;
  }
  return s;
}

/**
 * Reihen je Datensatz (mit Gruppenspalte eine je Stufe, mindestens zwei Punkte),
 * dann die Einstellungen alter Stände je Index. Unvollständige Datensätze entfallen.
 * @param {{ datasets: { x: object|null, y: object|null, group: object|null, size: object|null }[], showMarkers: boolean, showLines: boolean, legacySeries: readonly (object|undefined)[] }} model
 * @param {Read} read
 * @returns {{ series: Record<string, any>[], xRef: object|null } | { error: 'errTooFew'|'errNoGroupLevels', params: Record<string, any> }}
 */
export function buildSeries(model, read) {
  /** @type {Record<string, any>[]} */
  const series = [];
  let xRef = null;
  const push = (ds, name, x, y, bubble) => {
    const s = makeSeries(series.length, name, x, y, bubble, model);
    series.push({ ...s, ...(model.legacySeries[series.length] ?? {}) });
    if (!xRef) xRef = ds.x;
  };

  for (let i = 0; i < model.datasets.length; i++) {
    const ds = model.datasets[i];
    if (!ds.x || !ds.y) continue;
    const xVals = read.values(ds.x) ?? [];
    const yVals = read.values(ds.y) ?? [];
    const yName = read.name(ds.y) ?? '';
    const gVals = ds.group ? (read.values(ds.group) ?? []) : null;
    const sVals = ds.size ? (read.values(ds.size) ?? []) : null;
    const sName = ds.size ? (read.name(ds.size) ?? '') : '';
    const len = Math.min(
      xVals.length, yVals.length,
      gVals ? gVals.length : Infinity,
      sVals ? sVals.length : Infinity,
    );

    /** @type {Map<string, { level: any, x: number[], y: number[], sizes: number[]|null }>} */
    const buckets = new Map();
    for (let r = 0; r < len; r++) {
      const vx = xVals[r];
      const vy = yVals[r];
      if (!isNum(vx) || !isNum(vy)) continue;
      let key = '';
      if (gVals) {
        const vg = gVals[r];
        if (vg == null || vg === '') continue;
        key = String(vg);
      }
      if (sVals) {
        const vs = sVals[r];
        if (!isNum(vs) || vs < 0) continue;
      }
      let b = buckets.get(key);
      if (!b) {
        b = { level: gVals ? gVals[r] : null, x: [], y: [], sizes: sVals ? [] : null };
        buckets.set(key, b);
      }
      b.x.push(vx);
      b.y.push(vy);
      if (sVals) b.sizes?.push(sVals[r]);
    }

    if (gVals && buckets.size === 0) return { error: 'errNoGroupLevels', params: { n: i + 1 } };
    if (!gVals && !buckets.has('')) buckets.set('', { level: null, x: [], y: [], sizes: sVals ? [] : null });

    let any = false;
    for (const b of buckets.values()) {
      if (b.x.length < 2) continue;
      const name = gVals ? `${yName} — ${String(b.level)}` : yName;
      push(ds, name, b.x, b.y, b.sizes ? buildBubble(b.sizes, sName) : null);
      any = true;
    }
    if (!any) return { error: 'errTooFew', params: { col: yName } };
  }
  return { series, xRef };
}

/**
 * Statistikeingabe: Y-Werte der sichtbaren Reihen.
 * @param {{ name: string, y: number[], color: string, visible?: boolean }[]} series
 * @returns {{ name: string, values: number[], color: string, visible: true }[]}
 */
export function statsInput(series) {
  return series
    .filter((s) => s.visible !== false)
    .map((s) => ({ name: s.name, values: s.y, color: s.color, visible: true }));
}
