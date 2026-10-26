/**
 * D.Mike — Project charter dashboard tile (project-charter.tile.js)
 *
 * Loaded by the dashboard via the manifest's `loadTile`. Exports an array of
 * three singleton tiles with fixed ids: `project-charter`, `project-goals`
 * and `org-chart`; each exists only while a charter instance exists.
 * The markup lives in project-charter{,.goals,.org}.tile.html; the org chart
 * SVG is drawn in mount(). Tile contract: the lifecycle in js/pages/dashboard/tile-render.js.
 */

import { svg, s } from '../../core/dom.js';
import { markdownToFragment } from './project-charter-richtext.js';
import { ORG_NW, ORG_NH, orgPositions } from './project-charter-org-layout.js';

/**
 * ZEG colour token for an achievement percentage.
 * @param {number} zeg  0..100
 * @returns {string}
 */
function zegColor(zeg) {
  if (zeg >= 100) return 'var(--color-success)';
  if (zeg >= 75)  return 'var(--color-info)';
  if (zeg >= 25)  return 'var(--color-warning)';
  return 'var(--color-error)';
}

/**
 * Problem statement: distinguishes "no instance" (charterEmpty) from
 * "instance, no problem statement" (charterNoProblem). The statement stays
 * the stored RTE Markdown subset; mount() renders it sink-free.
 * @param {{state: object|null, i18n: object}} args
 * @returns {{empty: string|null, problemLabel: string, problem: string}}
 */
function charterViewModel({ state, i18n }) {
  const empty = !state ? i18n.t('dashboard.charterEmpty')
    : !state.problemStatement ? i18n.t('dashboard.charterNoProblem') : null;
  return { empty, problemLabel: i18n.t('dashboard.charterProblem'), problem: empty ? '' : state.problemStatement };
}

/**
 * Render the problem-statement Markdown via markdownToFragment (no HTML
 * string sink).
 * @param {HTMLElement} root  tile body
 * @param {object} vm  view model from charterViewModel()
 */
function mountCharter(root, vm) {
  if (vm.empty) return;
  root.querySelector('[data-tile-slot="problem"]').append(markdownToFragment(vm.problem));
}

/**
 * Goals with clamped achievement (0..100) and its colour.
 * @param {{state: object|null, i18n: object}} args
 * @returns {{empty: string|null, goals: Array<{desc: string, zeg: string, zegStyle: string, fillStyle: string}>}}
 */
function goalsViewModel({ state, i18n }) {
  const goals = (state && state.goals) || [];
  if (goals.length === 0) return { empty: i18n.t('dashboard.charterNoGoals'), goals: [] };
  return {
    empty: null,
    goals: goals.map((g, i) => {
      const zeg = Math.max(0, Math.min(100, g.achievementLevel ?? 0));
      const color = zegColor(zeg);
      return {
        desc: g.description || i18n.t('dashboard.charterGoalUnnamed', { n: i + 1 }),
        zeg: `${zeg}%`,
        zegStyle: `color:${color}`,
        fillStyle: `width:${zeg}%; background:${color}`,
      };
    }),
  };
}

/**
 * Org chart nodes as a plain copy of the stored flat list.
 * @param {{state: object|null, i18n: object}} args
 * @returns {{empty: string|null, nodes: object[]}}
 */
function orgViewModel({ state, i18n }) {
  const nodes = (state && Array.isArray(state.orgChart)) ? state.orgChart : [];
  if (!nodes.length) return { empty: i18n.t('dashboard.orgChartEmpty'), nodes: [] };
  return { empty: null, nodes: nodes.map(n => ({ ...n })) };
}

/**
 * Draw the org chart as an SVG tree into the org slot.
 * @param {HTMLElement} root  tile body
 * @param {object} vm  view model from orgViewModel()
 */
function mountOrgChart(root, vm) {
  if (vm.empty) return;
  const { nodes } = vm;
  const positions = orgPositions(nodes);

  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  Object.values(positions).forEach(p => {
    xMin = Math.min(xMin, p.x);
    yMin = Math.min(yMin, p.y);
    xMax = Math.max(xMax, p.x + ORG_NW);
    yMax = Math.max(yMax, p.y + ORG_NH);
  });
  const PAD = 8;
  const vbW = (xMax - xMin) + PAD * 2;
  const vbH = (yMax - yMin) + PAD * 2;
  const ox0 = PAD - xMin;
  const oy0 = PAD - yMin;

  const edges = nodes
    .filter(n => n.pid != null && positions[n.id] && positions[n.pid])
    .map(n => {
      const p = positions[n.pid];
      const c = positions[n.id];
      const x1 = p.x + ORG_NW / 2 + ox0;
      const y1 = p.y + ORG_NH + oy0;
      const x2 = c.x + ORG_NW / 2 + ox0;
      const y2 = c.y + oy0;
      const mid = y1 + (y2 - y1) / 2;
      return svg('path', { d: `M${x1} ${y1}C${x1} ${mid},${x2} ${mid},${x2} ${y2}` });
    });

  const rects = nodes.map(n => {
    const p = positions[n.id];
    if (!p) return null;
    const x = p.x + ox0;
    const y = p.y + oy0;
    const rectStyle = n.bg ? s({ fill: n.bg }) : null;
    const dash = n.borderStyle === 'dashed' ? '6 4'
               : n.borderStyle === 'dotted' ? '2 3' : null;
    const desc = n.desc || '';
    const descShort = desc.length > 38 ? `${desc.slice(0, 36)  }…` : desc;
    return svg('g', { class: 'dashboard-org__node', transform: `translate(${x},${y})` },
      svg('rect', {
        class: 'dashboard-org__node-rect', width: ORG_NW, height: ORG_NH,
        rx: 6, ry: 6, style: rectStyle,
        stroke: n.borderColor || null,
        'stroke-width': n.borderWidth ? (Number(n.borderWidth) || 1) : null,
        'stroke-dasharray': dash,
      }),
      svg('text', { class: 'dashboard-org__node-title', x: ORG_NW / 2, y: 22, 'text-anchor': 'middle' }, n.title || ''),
      desc ? svg('text', { class: 'dashboard-org__node-desc', x: ORG_NW / 2, y: 42, 'text-anchor': 'middle' }, descShort) : null,
    );
  });

  root.querySelector('[data-tile-slot="org"]').append(svg('svg', {
    class: 'dashboard-org__svg', viewBox: `0 0 ${vbW} ${vbH}`,
    preserveAspectRatio: 'xMidYMid meet',
  },
    svg('g', { class: 'dashboard-org__edges' }, edges),
    svg('g', { class: 'dashboard-org__nodes' }, rects),
  ));
}

/**
 * Singleton tile bound to the first charter instance. Its tile id equals its
 * kind; `titleKey` is also the title of copies and re-bound tiles.
 * @param {string} kind  tile id and kind
 * @param {string} titleKey  i18n key of the tile title
 * @param {object} size
 * @param {{template: string, viewModel: function, mount?: function}} parts
 * @returns {object} tile object
 */
function singletonTile(kind, titleKey, size, parts) {
  return {
    kind,
    titleKey,
    size,
    enumerate(ctx) {
      const inst = ctx.findInstances('project-charter')[0] || null;
      return inst ? [{ tileId: kind, instanceId: inst.instanceId, title: ctx.i18n.t(titleKey) }] : [];
    },
    ...parts,
  };
}

/** Problem-statement tile. */
export const charterTile = singletonTile('project-charter', 'dashboard.charterTitle',
  { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  { template: 'js/modules/project-charter/project-charter.tile.html', viewModel: charterViewModel, mount: mountCharter });

/** Goals tile (achievement per goal). */
export const goalsTile = singletonTile('project-goals', 'dashboard.goalsTitle',
  { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  { template: 'js/modules/project-charter/project-charter.goals.tile.html', viewModel: goalsViewModel });

/** Org chart tile. */
export const orgTile = singletonTile('org-chart', 'dashboard.orgChartTitle',
  { defaultW: 6, defaultH: 10, minW: 3, minH: 6 },
  { template: 'js/modules/project-charter/project-charter.org.tile.html', viewModel: orgViewModel, mount: mountOrgChart });

export default [charterTile, goalsTile, orgTile];
