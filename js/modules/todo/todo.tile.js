/**
 * D.Mike — Todo dashboard tile (todo.tile.js)
 *
 * Status counts, a status bar and the next due open items. Imports only the
 * pure todo model. Contract: docs/DASHBOARD.md.
 */

import { h } from '../../core/dom.js';
import { todayISO } from '../../core/local-date.js';
import { State, STATUSES, statusCounts, nextDueItems, isOverdue } from './todo-model.js';

const STATUS_COLOR = {
  open: 'var(--color-text-tertiary)',
  'in-progress': 'var(--color-phase-measure)',
  done: 'var(--color-phase-control)',
  blocked: 'var(--color-error)',
};

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'Todo',
  settings: {
    topN: { type: 'number', min: 1, max: 10, step: 1, default: 5, label: 'dashboard.tileSettings.topN' },
    showDone: { type: 'boolean', default: false, label: 'dashboard.tileSettings.showDone' },
  },

  /**
   * @param {HTMLElement} host
   * @param {{state: object, settings: {topN: number, showDone: boolean}, i18n: object}} args
   */
  render(host, { state, settings, i18n }) {
    const model = State.fromJSON(state);
    if (model.items.length === 0) {
      host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.todoEmpty')));
      return;
    }
    const today = todayISO();
    const counts = statusCounts(model.items);
    const shown = STATUSES.filter(s => settings.showDone || s !== 'done');
    const total = shown.reduce((sum, s) => sum + counts[s], 0);
    const label = (s) => i18n.t(`modules.todo.status_${s}`);

    const summary = h('div', { class: 'dashboard-fmea__summary' },
      ...shown.map(s => h('span', { 'data-status': s }, `${label(s)}: `, h('strong', {}, String(counts[s])))));
    const bar = h('div', { class: 'dashboard-fmea__bar' },
      ...shown.filter(s => counts[s] > 0).map(s => h('div', {
        class: 'dashboard-fmea__bar-seg', 'data-status': s,
        style: `width:${counts[s] / total * 100}%;background:${STATUS_COLOR[s]}`,
        title: `${label(s)}: ${counts[s]}` })));

    const children = [summary, bar];
    const next = nextDueItems(model.items, settings.topN);
    if (next.length) {
      children.push(h('div', { class: 'dashboard-fmea__top-label' }, i18n.t('dashboard.todoNextDue')));
      children.push(h('ol', { class: 'dashboard-fmea__top-list' },
        ...next.map(item => {
          const overdue = isOverdue(item, today);
          return h('li', { class: `dashboard-fmea__top-item${overdue ? ' dashboard-todo__overdue' : ''}`,
            title: overdue ? i18n.t('dashboard.todoOverdue') : null },
          h('span', { class: 'dashboard-fmea__top-desc' }, item.text || '—'),
          item.owner ? h('span', { class: 'dashboard-todo__owner' }, item.owner) : null,
          h('span', { class: 'dashboard-todo__due' }, item.due || '—'));
        })));
    }
    host.replaceChildren(...children);
  },
};
