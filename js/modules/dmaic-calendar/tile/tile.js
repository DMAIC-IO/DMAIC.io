/**
 * D.Mike — Kalender-Kachel
 *
 * „Was steht an?“ — die anstehenden Termine im gewählten Zeitraum mit Datum,
 * Zeit und Phase. Form: createTile (core/template-tile.js); Einstellungen in
 * settings.js, Markup in resources/tile.html.
 */
import { createTile } from '../../../core/template-tile.js';
import { todayISO } from '../../../core/local-date.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { upcomingEvents } from '../domain/layout.js';
import { Settings } from './settings.js';

export default createTile({
  descriptor,
  Model: State,
  Settings,
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },

  /** @type {import('./settings.types.js').DmaicCalendarTileViewFn} */
  view(ctx) {
    return {
      /** @returns {number} */
      get days() { return Number(this.settings.horizon); },
      get upcoming() { return upcomingEvents(this.model.events, todayISO(), this.days); },
      /** Keine Termine erfasst. */
      get empty() { return this.model.events.length === 0; },
      /** Termine erfasst, aber keiner im Zeitraum. */
      get none() { return !this.empty && this.upcoming.length === 0; },
      get summary() { return this.t('tileSummary', { count: this.upcoming.length, days: this.days }); },
      /** Die ersten topN Termine als Anzeigezeilen. */
      get shown() {
        return this.upcoming.slice(0, this.settings.topN).map((e) => ({
          id: e.id, when: `${e.date} ${e.time}`, title: e.title, phase: ctx.i18n.t(`phases.${e.phase}`),
        }));
      },
    };
  },
});
