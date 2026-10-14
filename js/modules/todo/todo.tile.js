/**
 * D.Mike — Todo dashboard tile (todo.tile.js)
 *
 * Status counts, a status bar and the next due open items. Imports only the
 * pure todo model; the markup lives in todo.tile.html. Contract: docs/DASHBOARD.md.
 */

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

  template: 'js/modules/todo/todo.tile.html',

  /**
   * Status counts, status bar and the next due open items.
   * @param {{state: object, settings: {topN: number, showDone: boolean}, i18n: object}} args
   * @returns {object} view model for todo.tile.html
   */
  viewModel({ state, settings, i18n }) {
    const model = State.fromJSON(state);
    if (model.items.length === 0) {
      return { empty: i18n.t('dashboard.todoEmpty'), summary: [], segments: [], nextLabel: null, next: [] };
    }
    const today = todayISO();
    const counts = statusCounts(model.items);
    const shown = STATUSES.filter(s => settings.showDone || s !== 'done');
    const total = shown.reduce((sum, s) => sum + counts[s], 0);
    const label = (s) => i18n.t(`modules.todo.status_${s}`);
    const next = nextDueItems(model.items, settings.topN);
    return {
      empty: null,
      summary: shown.map(s => ({ status: s, label: `${label(s)}: `, count: String(counts[s]) })),
      segments: shown.filter(s => counts[s] > 0).map(s => ({
        status: s,
        style: `width:${counts[s] / total * 100}%;background:${STATUS_COLOR[s]}`,
        title: `${label(s)}: ${counts[s]}`,
      })),
      nextLabel: next.length ? i18n.t('dashboard.todoNextDue') : null,
      next: next.map(item => {
        const overdue = isOverdue(item, today);
        return {
          modifier: overdue ? 'dashboard-todo__overdue' : '',
          title: overdue ? i18n.t('dashboard.todoOverdue') : null,
          text: item.text || '—',
          owner: item.owner || null,
          due: item.due || '—',
        };
      }),
    };
  },
};
