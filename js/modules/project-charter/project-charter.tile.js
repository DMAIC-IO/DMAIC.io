/**
 * D.Mike — Project charter dashboard tile (project-charter.tile.js)
 *
 * Loaded by the dashboard via the manifest's `loadTile`. Exports an array of
 * three singleton tiles with fixed ids: `project-charter`, `project-goals`
 * and `org-chart`; each exists only while a charter instance exists.
 * Contract: docs/DASHBOARD.md.
 */

import { h, svg, s } from '../../core/dom.js';
import { markdownToFragment } from './project-charter-richtext.js';
import { ORG_NW, ORG_NH, orgPositions } from './project-charter-org-layout.js';

/**
 * Render the charter problem-statement dashboard tile. Distinguishes "no
 * instance" (charterEmpty) from "instance, no problem statement"
 * (charterNoProblem). The problem statement is stored as the RTE Markdown
 * subset and rendered sink-free via markdownToFragment (NOT as a raw string —
 * h() would otherwise show literal `**bold**`).
 * @param {HTMLElement} host
 * @param {{state: object, i18n: object}} args
 */
export function renderDashboardTile(host, { state, i18n }) {
  if (!state) {
    host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.charterEmpty')));
    return;
  }
  if (!state.problemStatement) {
    host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.charterNoProblem')));
    return;
  }
  host.replaceChildren(
    h('div', { class: 'dashboard-charter__problem-label' }, i18n.t('dashboard.charterProblem')),
    h('div', { class: 'dashboard-charter__problem' }, markdownToFragment(state.problemStatement)),
  );
}

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
 * Render the goals list with clamped achievement bars.
 * @param {HTMLElement} host
 * @param {{state: object|null, i18n: object}} args
 */
function renderGoals(host, { state, i18n }) {
  const goals = (state && state.goals) || [];
  if (goals.length === 0) {
    host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.charterNoGoals')));
    return;
  }
  const ol = h('ol', { class: 'dashboard-charter__goals' });
  goals.forEach((g, i) => {
    const zeg = Math.max(0, Math.min(100, g.achievementLevel ?? 0));
    const color = zegColor(zeg);
    const desc = g.description || i18n.t('dashboard.charterGoalUnnamed', { n: i + 1 });
    ol.append(
      h('li', { class: 'dashboard-charter__goal' },
        h('div', { class: 'dashboard-charter__goal-head' },
          h('span', { class: 'dashboard-charter__goal-desc' }, desc),
          h('span', { class: 'dashboard-charter__goal-zeg', style: `color:${color}` }, `${zeg}%`),
        ),
        h('div', { class: 'dashboard-charter__goal-bar' },
          h('div', { class: 'dashboard-charter__goal-bar-fill', style: `width:${zeg}%; background:${color}` }),
        ),
      ),
    );
  });
  host.replaceChildren(ol);
}

/**
 * Render the org chart as an SVG tree.
 * @param {HTMLElement} host
 * @param {{state: object|null, i18n: object}} args
 */
function renderOrgChart(host, { state, i18n }) {
  const nodes = (state && Array.isArray(state.orgChart)) ? state.orgChart : [];
  if (!nodes.length) {
    host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.orgChartEmpty')));
    return;
  }

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

  const orgSvg = svg('svg', {
    class: 'dashboard-org__svg', viewBox: `0 0 ${vbW} ${vbH}`,
    preserveAspectRatio: 'xMidYMid meet',
  },
    svg('g', { class: 'dashboard-org__edges' }, edges),
    svg('g', { class: 'dashboard-org__nodes' }, rects),
  );
  host.replaceChildren(h('div', { class: 'dashboard-area__org' }, orgSvg));
}

/**
 * Singleton tile bound to the first charter instance. Its tile id equals its
 * kind; `titleKey` is also the title of copies and re-bound tiles.
 * @param {string} kind  tile id and kind
 * @param {string} titleKey  i18n key of the tile title
 * @param {object} size
 * @param {function} render
 * @returns {object} tile object
 */
function singletonTile(kind, titleKey, size, render) {
  return {
    kind,
    titleKey,
    size,
    enumerate(ctx) {
      const inst = ctx.findInstances('project-charter')[0] || null;
      return inst ? [{ tileId: kind, instanceId: inst.instanceId, title: ctx.i18n.t(titleKey) }] : [];
    },
    render,
  };
}

/** Problem-statement tile. */
export const charterTile = singletonTile('project-charter', 'dashboard.charterTitle',
  { defaultW: 3, defaultH: 10, minW: 2, minH: 6 }, renderDashboardTile);

/** Goals tile (achievement per goal). */
export const goalsTile = singletonTile('project-goals', 'dashboard.goalsTitle',
  { defaultW: 3, defaultH: 10, minW: 2, minH: 6 }, renderGoals);

/** Org chart tile. */
export const orgTile = singletonTile('org-chart', 'dashboard.orgChartTitle',
  { defaultW: 6, defaultH: 10, minW: 3, minH: 6 }, renderOrgChart);

export default [charterTile, goalsTile, orgTile];
