/**
 * D.Mike — Project charter dashboard tile (project-charter.tile.js)
 *
 * Loaded by the dashboard via the manifest's `loadTile`. The charter tile
 * keeps its fixed id `project-charter` and is always loaded by the host
 * (temporary exception until the built-in twin is removed). Contract:
 * docs/DASHBOARD.md.
 */

import { h } from '../../core/dom.js';
import { markdownToFragment } from './project-charter-richtext.js';

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
 * Instance id of the (singleton) charter, or null.
 * @param {{stateManager: object}} ctx
 * @returns {string|null}
 */
function findCharterInstanceId(ctx) {
  const phases = ctx.stateManager.get('phases') || {};
  for (const list of Object.values(phases)) {
    for (const inst of (list || [])) {
      if (inst.moduleId === 'project-charter') return inst.instanceId;
    }
  }
  return null;
}

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },

  /**
   * Enumerate the (at most one) charter tile under its fixed id.
   * @param {{stateManager: object, i18n: object}} ctx
   * @returns {Array<{tileId: string, instanceId: string, title: string}>}
   */
  enumerate(ctx) {
    const instanceId = findCharterInstanceId(ctx);
    if (!instanceId) return [];
    return [{ tileId: 'project-charter', instanceId, title: ctx.i18n.t('dashboard.charterTitle') }];
  },

  render: renderDashboardTile,
};
