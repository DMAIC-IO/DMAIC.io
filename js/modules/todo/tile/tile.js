/**
 * D.Mike — Todo-Kachel
 *
 * Zahl der Aufgaben je Status, ein Statusbalken und die nächsten fälligen
 * offenen Aufgaben; überfällige rot. Eine Kachel je Instanz
 * (`todo:<instanceId>`). Form: createTile (core/template-tile.js);
 * Einstellungen in settings.js, Markup in resources/tile.html.
 */
import { createTile } from '../../../core/template-tile.js';
import { todayISO, isIsoDate } from '../../../core/local-date.js';
import { distribution } from '../../../ui/tile-kit.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { STATUSES, statusCounts, nextDueItems, isOverdue } from '../domain/list.js';
import { Settings } from './settings.js';

/** Farbe je Status für Balken und Zähler. */
const STATUS_COLOR = {
  open: 'var(--color-text-tertiary)',
  'in-progress': 'var(--color-phase-measure)',
  done: 'var(--color-phase-control)',
  blocked: 'var(--color-error)',
};

/**
 * Ein Zieldatum nach App-Sprache (Deutsch `de-DE`, sonst `en-GB` wie der Kalender); ein Text,
 * der kein Datum ist, bleibt; leer wird „—“.
 * @param {string} due @param {string} lang @returns {string}
 */
function dueLabel(due, lang) {
  if (!due) return '—';
  if (!isIsoDate(due)) return due;
  const [y, m, d] = due.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default createTile({
  descriptor,
  Model: State,
  Settings,
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'Todo',

  /** @type {import('./settings.types.js').TodoTileViewFn} */
  view(ctx) {
    /** @param {string} key @returns {string} */
    const g = (key) => ctx.i18n.t(`dashboard.${key}`);
    return {
      /** Leertext ohne Aufgaben, sonst null. */
      get empty() { return this.model.items.length === 0 ? g('todoEmpty') : null; },
      /** Die gezeigten Status: ohne `done`, außer mit showDone. */
      get shownStatuses() { return STATUSES.filter((s) => this.settings.showDone || s !== 'done'); },
      /** Zähler je gezeigtem Status. */
      get summary() {
        if (this.empty) return [];
        const counts = statusCounts(this.model.items);
        return this.shownStatuses.map((s) => ({ status: s, label: `${this.t(`status_${s}`)}: `, count: String(counts[s]) }));
      },
      /** Balkensegmente je gezeigtem Status. */
      get segments() {
        if (this.empty) return [];
        const counts = statusCounts(this.model.items);
        return distribution(this.shownStatuses.map((s) => ({ key: s, label: this.t(`status_${s}`), count: counts[s], color: STATUS_COLOR[s] }))).segments;
      },
      /** Die nächsten topN offenen Aufgaben als Anzeigezeilen. */
      get next() {
        const today = todayISO();
        const lang = ctx.i18n.getLanguage();
        return nextDueItems(this.model.items, this.settings.topN).map((item) => {
          const overdue = isOverdue(item, today);
          return {
            modifier: overdue ? 'dashboard-todo__overdue' : '',
            title: overdue ? g('todoOverdue') : null,
            text: item.text || '—',
            owner: item.owner || null,
            due: dueLabel(item.due, lang),
          };
        });
      },
      /** Überschrift der Liste oder null. */
      get nextLabel() { return !this.empty && this.next.length ? g('todoNextDue') : null; },
    };
  },
});
