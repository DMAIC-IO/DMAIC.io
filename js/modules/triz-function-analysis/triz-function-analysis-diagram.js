/**
 * D.Mike — TRIZ function analysis: start layout and node-diagram builder.
 *
 * Pure functions. The module positions HTML boxes from resolvePositions()
 * and hands buildFunctionDiagram().links to a links-only node-diagram
 * overlay; the export uses nodes and links together.
 */

import { straightEndpoints, viaEndpoints } from '../../core/chart/types/node-diagram.js';
import { pairKey, isComplete } from './triz-function-analysis-model.js';

export const NODE_W = 140;
export const NODE_H = 44;
export const STEP_X = NODE_W + 80;
export const STEP_Y = NODE_H + 40;
const MAX_COLS = 3;
const PARALLEL_GAP = 14;
const EXPORT_NAME_MAX = 20;

const NODE_STYLE = {
  target: {
    shape: 'ellipse', fill: 'var(--color-node-target-fill)',
    stroke: 'var(--color-node-target-stroke)', strokeWidth: 2,
  },
  system: {},
  supersystem: {
    shape: 'hexagon', fill: 'var(--color-node-supersystem-fill)',
    stroke: 'var(--color-node-supersystem-stroke)', strokeWidth: 2,
  },
};
const TEXT_COLOR = {
  target: 'var(--color-node-target-text)',
  supersystem: 'var(--color-node-supersystem-text)',
};
/** Both deviations are dashed; the width tells insufficient (thin) from excessive (thick). */
const LEVEL_STYLE = { adequate: 'solid', insufficient: 'dashed', excessive: 'dashed' };
const LEVEL_WIDTH = { adequate: 2, insufficient: 1, excessive: 3 };

/**
 * Hops from the target to every component over the given pairs (BFS).
 * @param {string|undefined} targetId
 * @param {Array<{a:string,b:string}>} pairs
 * @returns {Map<string, number>} unreachable components are missing
 */
function hopsFromTarget(targetId, pairs) {
  const dist = new Map();
  if (!targetId) return dist;
  dist.set(targetId, 0);
  const queue = [targetId];
  while (queue.length) {
    const id = queue.shift();
    for (const { a, b } of pairs) {
      const next = a === id ? b : b === id ? a : null;
      if (next != null && !dist.has(next)) {
        dist.set(next, dist.get(id) + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}

/**
 * Deterministic start layout: system components in a grid (max. 3 columns)
 * starting one row down and filled from the target side, the target right of
 * the grid and vertically centred, supersystem elements alternating between
 * a top and a bottom row. System components are ordered by their hops from
 * the target, so a link to the target never runs through a chain of boxes.
 * @param {Array<Object>} components
 * @param {Array<{a:string,b:string}>} [pairs] - interacting pairs (interactions, functions)
 * @returns {Object<string, {x:number,y:number}>}
 */
export function autoLayout(components, pairs = []) {
  const target = components.find((c) => c.kind === 'target');
  const hops = hopsFromTarget(target?.id, pairs);
  const rank = (c) => hops.get(c.id) ?? Infinity;
  const system = components.filter((c) => c.kind === 'system')
    .map((c, i) => ({ c, i }))
    .sort((p, q) => rank(p.c) - rank(q.c) || p.i - q.i)
    .map((p) => p.c);
  const supers = components.filter((c) => c.kind === 'supersystem');
  const cols = Math.min(MAX_COLS, Math.max(1, system.length));
  const rows = Math.max(1, Math.ceil(system.length / cols));
  const out = {};
  system.forEach((c, i) => {
    out[c.id] = { x: (cols - 1 - (i % cols)) * STEP_X, y: STEP_Y + Math.floor(i / cols) * STEP_Y };
  });
  if (target) out[target.id] = { x: cols * STEP_X, y: STEP_Y + ((rows - 1) * STEP_Y) / 2 };
  supers.forEach((c, j) => {
    out[c.id] = { x: Math.floor(j / 2) * STEP_X, y: j % 2 === 0 ? 0 : STEP_Y + rows * STEP_Y };
  });
  return out;
}

/**
 * Position of every component: stored (dragged) position, else auto slot.
 * @param {{components: Array, positions: Object, interactions?: Array, functions?: Array}} state
 * @returns {Object<string, {x:number,y:number}>}
 */
export function resolvePositions(state) {
  const pairs = [
    ...(state.interactions ?? []),
    ...(state.functions ?? []).map((f) => ({ a: f.carrier, b: f.object })),
  ];
  const auto = autoLayout(state.components, pairs);
  const out = {};
  for (const c of state.components) {
    const p = state.positions[c.id] ?? auto[c.id];
    out[c.id] = { x: p.x, y: p.y };
  }
  return out;
}

/** @param {Object} fn @returns {{style: string, width?: number, color?: string}} */
function linkStyle(fn) {
  if (fn.type === 'harmful') return { style: 'wave', color: 'var(--color-error)' };
  const level = LEVEL_STYLE[fn.level] ? fn.level : 'adequate';
  return { style: LEVEL_STYLE[level], width: LEVEL_WIDTH[level] };
}

const shorten = (s) => (s.length > EXPORT_NAME_MAX ? `${s.slice(0, EXPORT_NAME_MAX - 1)}…` : s);

/**
 * node-diagram config for the function model.
 * @param {{components: Array, functions: Array, positions: Object, labels?: Object}} state
 * @param {{selectedId?: string|null, rankLabels?: Map<string,string>}} [opts] - rankLabels:
 *   rank code per function id, appended to the verb
 * @returns {{nodes: Array<Object>, links: Array<Object>}}
 */
export function buildFunctionDiagram(state, { selectedId = null, rankLabels = null } = {}) {
  const pos = resolvePositions(state);
  const boxes = new Map(state.components.map((c) => [c.id, {
    x: pos[c.id].x, y: pos[c.id].y, w: NODE_W, h: NODE_H, shape: NODE_STYLE[c.kind].shape,
  }]));
  const nodes = state.components.map((c) => ({
    id: c.id, ...boxes.get(c.id), ...NODE_STYLE[c.kind], padY: 14, align: 'center',
    lines: [{ text: shorten(c.name), weight: c.kind === 'system' ? null : 600, color: TEXT_COLOR[c.kind] }],
    highlight: selectedId != null && selectedId === c.id,
  }));

  const complete = state.functions.filter((f) => isComplete(f) && boxes.has(f.carrier) && boxes.has(f.object));
  const groups = new Map();
  for (const f of complete) {
    const k = pairKey(f.carrier, f.object);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }

  const links = complete.map((f) => {
    const group = groups.get(pairKey(f.carrier, f.object));
    const frameOffset = (group.indexOf(f) - (group.length - 1) / 2) * PARALLEL_GAP;
    // The frame runs from the lower to the higher id; links against it flip sides.
    const offset = f.carrier < f.object ? frameOffset : -frameOffset;
    const via = state.labels?.[f.id];
    const ends = via
      ? { via: { x: via.x, y: via.y }, ...viaEndpoints(boxes.get(f.carrier), boxes.get(f.object), via) }
      : straightEndpoints(boxes.get(f.carrier), boxes.get(f.object), offset);
    const rank = rankLabels?.get(f.id);
    return {
      id: f.id, from: f.carrier, to: f.object, shape: 'straight', arrow: 'end',
      label: rank ? [f.verb, rank].filter(Boolean).join(' · ') : f.verb,
      ...ends,
      ...linkStyle(f),
      highlight: selectedId != null && (selectedId === f.id || selectedId === f.carrier || selectedId === f.object),
    };
  });
  return { nodes, links };
}
