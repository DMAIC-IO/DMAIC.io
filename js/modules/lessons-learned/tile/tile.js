/**
 * D.Mike — Lessons-Learned-Kachel
 *
 * Zahl der Erfahrungen je Kategorie, offene Maßnahmen und die Erfahrungen mit
 * hoher Wirkung, die noch offene Maßnahmen haben. Form: createTile
 * (core/template-tile.js); Einstellungen in settings.js, Markup in
 * resources/tile.html.
 */

import { createTile } from '../../../core/template-tile.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { statsOf, openHighImpact } from '../domain/lessons.js';
import { Settings } from './settings.js';

export default createTile({
  descriptor,
  Model: State,
  Settings,
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },

  /** @type {import('./settings.types.js').LessonsLearnedTileViewFn} */
  view(ctx) {
    /** @param {string} key @returns {string} */
    const g = (key) => ctx.i18n.t(`dashboard.${key}`);
    return {
      /** Leertext ohne Erfahrungen, sonst null. */
      get empty() {
        return this.model.lessons.length === 0 ? g('lessonsEmpty') : null;
      },
      /** Zahl je Kategorie und offene Maßnahmen, je mit Beschriftung. */
      get statItems() {
        const s = statsOf(this.model.lessons);
        /** @param {'success'|'problem'|'improve'|'openActions'} key @param {string} label @param {string} [modifier] */
        const item = (key, label, modifier = '') => ({ key, label: `${label}: `, value: String(s[key]), modifier });
        return [
          item('success', this.t('cat_success')),
          item('problem', this.t('cat_problem')),
          item('improve', this.t('cat_improve')),
          item('openActions', g('lessonsOpenActions'), s.openActions > 0 ? 'dashboard-lessons__open--alert' : ''),
        ];
      },
      /** Die Erfahrungen mit hoher Wirkung und offenen Maßnahmen, höchstens topN. */
      get top() {
        return openHighImpact(this.model.lessons, this.settings.topN).map((l) => ({
          title: l.title || '—',
          open: String(l.actions.filter((a) => !a.done).length),
        }));
      },
      /** Überschrift der Liste oder null. */
      get topLabel() {
        return this.top.length > 0 ? g('lessonsHighOpen') : null;
      },
    };
  },
});
