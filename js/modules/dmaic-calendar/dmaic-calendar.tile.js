/**
 * D.Mike — DMAIC calendar dashboard tile (dmaic-calendar.tile.js)
 *
 * Upcoming events within a selectable horizon. Imports only the pure
 * calendar model; the markup lives in dmaic-calendar.tile.html. Contract: docs/DASHBOARD.md.
 */

import { todayISO } from '../../core/local-date.js';
import { State, upcomingEvents } from './dmaic-calendar-model.js';

export default {
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  settings: {
    topN: { type: 'number', min: 1, max: 10, step: 1, default: 5, label: 'dashboard.tileSettings.topN' },
    horizon: { type: 'select', options: ['7', '14', '30'], default: '14', label: 'dashboard.tileSettings.horizon',
      optionLabels: { 7: 'dashboard.tileSettings.horizon7', 14: 'dashboard.tileSettings.horizon14', 30: 'dashboard.tileSettings.horizon30' } },
  },

  template: 'js/modules/dmaic-calendar/dmaic-calendar.tile.html',

  /**
   * Upcoming events within the selected horizon.
   * @param {{state: object, settings: {topN: number, horizon: string}, i18n: object}} args
   * @returns {object} view model for dmaic-calendar.tile.html
   */
  viewModel({ state, settings, i18n }) {
    const model = State.fromJSON(state);
    if (model.events.length === 0) {
      return { empty: i18n.t('dashboard.calendarEmpty'), summary: null, none: null, events: [] };
    }
    const days = Number(settings.horizon);
    const upcoming = upcomingEvents(model.events, todayISO(), days);
    return {
      empty: null,
      summary: i18n.t('dashboard.calendarSummary', { count: upcoming.length, days }),
      none: upcoming.length === 0 ? i18n.t('dashboard.calendarNone') : null,
      events: upcoming.slice(0, settings.topN).map(e => ({
        when: `${e.date} ${e.time}`,
        title: e.title || '—',
        phase: i18n.t(`phases.${e.phase}`),
      })),
    };
  },
};
