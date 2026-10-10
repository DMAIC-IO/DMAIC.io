/**
 * D.Mike — DMAIC calendar dashboard tile (dmaic-calendar.tile.js)
 *
 * Upcoming events within a selectable horizon. Imports only the pure
 * calendar model. Contract: docs/DASHBOARD.md.
 */

import { h } from '../../core/dom.js';
import { todayISO } from '../../core/local-date.js';
import { State, upcomingEvents } from './dmaic-calendar-model.js';

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  settings: {
    topN: { type: 'number', min: 1, max: 10, step: 1, default: 5, label: 'dashboard.tileSettings.topN' },
    horizon: { type: 'select', options: ['7', '14', '30'], default: '14', label: 'dashboard.tileSettings.horizon',
      optionLabels: { 7: 'dashboard.tileSettings.horizon7', 14: 'dashboard.tileSettings.horizon14', 30: 'dashboard.tileSettings.horizon30' } },
  },

  /**
   * @param {HTMLElement} host
   * @param {{state: object, settings: {topN: number, horizon: string}, i18n: object}} args
   */
  render(host, { state, settings, i18n }) {
    const model = State.fromJSON(state);
    if (model.events.length === 0) {
      host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.calendarEmpty')));
      return;
    }
    const days = Number(settings.horizon);
    const upcoming = upcomingEvents(model.events, todayISO(), days);
    const summary = h('div', { class: 'dashboard-fmea__summary' },
      i18n.t('dashboard.calendarSummary', { count: upcoming.length, days }));
    if (upcoming.length === 0) {
      host.replaceChildren(summary, h('p', { class: 'dashboard-calendar__none' }, i18n.t('dashboard.calendarNone')));
      return;
    }
    host.replaceChildren(summary, h('ol', { class: 'dashboard-fmea__top-list' },
      ...upcoming.slice(0, settings.topN).map(e => h('li', { class: 'dashboard-fmea__top-item' },
        h('span', { class: 'dashboard-calendar__when' }, `${e.date} ${e.time}`),
        h('span', { class: 'dashboard-fmea__top-desc' }, e.title || '—'),
        h('span', { class: 'dashboard-calendar__phase' }, i18n.t(`phases.${e.phase}`))))));
  },
};
