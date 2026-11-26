/**
 * D.Mike — Kalender-Kachel
 *
 * „Was steht an?“ — die anstehenden Termine im gewählten Zeitraum mit Datum,
 * Zeit und Phase: die eigenen und die Aufgabentermine der Aufgabenlisten,
 * gelesen über `ctx.source`. Ist das Modul einer Aufgabenliste noch nicht
 * geladen, stößt die Kachel das Laden an, ohne zu warten, und zeigt bis dahin
 * nur die übrigen Termine; das Dashboard zeichnet sie danach neu.
 * Form: createTile (core/template-tile.js); Einstellungen in settings.js,
 * Markup in resources/tile.html.
 */
import { createTile } from '../../../core/template-tile.js';
import { todayISO } from '../../../core/local-date.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { upcomingEvents } from '../domain/layout.js';
import { todoAppointments } from '../domain/todo-appointments.js';
import { Settings } from './settings.js';

export default createTile({
  descriptor,
  Model: State,
  Settings,
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },

  /** @type {import('./settings.types.js').DmaicCalendarTileViewFn} */
  view(ctx) {
    /** @type {ReadonlyArray<{ title: string, date: string, time: string, phase: string, id: string }>|null} je Rendern einmal gelesen */
    let all = null;
    /**
     * Die Aufgaben je Aufgabenliste. `not_loaded`: Laden anstoßen, nicht warten.
     * @returns {import('../domain/todo-appointments.js').TodoRead[]}
     */
    const todoReads = () => {
      const reads = [];
      for (const inst of ctx.source.list()) {
        if (inst.moduleId !== 'todo') continue;
        try {
          reads.push({ instanceId: inst.instanceId, phase: inst.phase, items: /** @type {any} */ (ctx.source.read(inst.instanceId, { fields: ['items'] })).items });
        } catch (err) {
          if (/** @type {any} */ (err)?.code === 'not_loaded') {
            ctx.source.ensureLoaded(inst.instanceId).catch((e) => console.warn('[dmaic-calendar] tile: loading todo failed', e));
          } else {
            console.warn('[dmaic-calendar] tile: reading todo failed', err);
          }
        }
      }
      return reads;
    };
    return {
      /** @returns {number} */
      get days() { return Number(this.settings.horizon); },
      /** Eigene Termine (ohne gespeicherte Spiegel der Altform) und Aufgabentermine. */
      get allEvents() {
        all ??= [...this.model.events.filter((e) => e.source !== 'todo'), ...todoAppointments(todoReads())];
        return all;
      },
      get upcoming() { return upcomingEvents(this.allEvents, todayISO(), this.days); },
      /** Keine Termine erfasst. */
      get empty() { return this.allEvents.length === 0; },
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
