/**
 * D.Mike — Ishikawa-Kachel
 *
 * Problemzeile, Zahl der Hypothesen und Experten, Verteilung nach Kategorie
 * und Status und die am höchsten bewerteten Ursachen. Eine Kachel je Instanz.
 * Form: createTile (core/template-tile.js); Einstellungen in settings.js,
 * Markup in resources/tile.html. Kategoriefarben kommen als `--ishikawa-cat-*`
 * vom Wurzelelement `.ishikawa-tile`.
 */

import { createTile } from '../../../core/template-tile.js';
import { distribution } from '../../../ui/tile-kit.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { CAT_KEYS, STATUS_KEYS } from '../domain/constants.js';
import { effCat } from '../domain/tree.js';
import { paretoItems } from '../domain/scores.js';
import { Settings } from './settings.js';

const STATUS_COLORS = {
  open: 'var(--color-text-tertiary)', testing: 'var(--color-info)',
  confirmed: 'var(--color-success)', rejected: 'var(--color-error)',
};

/** @param {string} key @returns {string} */
const catColor = (key) => `var(--ishikawa-cat-${key})`;

export default createTile({
  descriptor,
  Model: State,
  Settings,
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefixKey: 'modules.ishikawa.tileTitlePrefix',

  /** @type {import('./settings.types.js').IshikawaTileViewFn} */
  view() {
    return {
      /** Keine Ursache erfasst. */
      get empty() { return this.model.rows.length === 0; },
      /** Problemtext oder leer. */
      get problem() { return this.empty ? '' : this.model.problem; },
      /** Zahl der Hypothesen und der Experten. */
      get summary() {
        return [
          { label: `${this.t('tileHypotheses')}: `, value: String(this.model.rows.length) },
          { label: `${this.t('tileExperts')}: `, value: String(this.model.experts.length) },
        ];
      },
      /** Anzeigename einer Kategorie: eigener Name, sonst der Vorgabetext. @param {string} key @returns {string} */
      catLabel(key) {
        const own = (this.model.catLabels[key] ?? '').trim();
        return own || this.t(`cat.${key}`);
      },
      /** Zahl der Ursachen je Kategorie und je Status, Verteilung für Balken und Legenden. */
      get cats() {
        const counts = Object.fromEntries(CAT_KEYS.map((k) => [k, 0]));
        const status = Object.fromEntries(STATUS_KEYS.map((k) => [k, 0]));
        for (const r of this.model.rows) {
          const cat = effCat(this.model.rows, r);
          if (Object.hasOwn(counts, cat)) counts[cat]++;
          status[r.status]++;
        }
        return {
          cats: distribution(CAT_KEYS.map((key) => ({ key, label: this.catLabel(key), count: counts[key], color: catColor(key) }))),
          status: distribution(STATUS_KEYS.map((key) => ({
            key, label: this.t(`status.${key}`), count: status[key], color: STATUS_COLORS[key],
          }))).legend,
        };
      },
      /** Balkensegmente je Kategorie. */
      get segments() { return this.cats.cats.segments; },
      /** Legende der Kategorien oder `null`. */
      get legend() { return this.settings.showLegend ? this.cats.cats.legend : null; },
      /** Legende der Status oder `null`. */
      get statusLegend() {
        const l = this.cats.status;
        return this.settings.showLegend && l.length ? l : null;
      },
      /** Die topN am höchsten bewerteten Ursachen. */
      get top() {
        const byStable = new Map(this.model.rows.map((r) => [r.stableId, r]));
        return paretoItems(this.model.rows).slice(0, this.settings.topN).map((p) => ({
          name: byStable.get(p.stableId)?.name || '—',
          score: p.score.toFixed(1),
          style: `color:${p.category ? catColor(p.category) : 'var(--color-text-secondary)'}`,
        }));
      },
      /** Überschrift der Liste oder leer. */
      get topLabel() { return this.top.length ? this.t('tileTopScored') : ''; },
    };
  },
});
