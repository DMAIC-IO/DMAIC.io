/**
 * D.Mike — SIPOC-Kachel
 *
 * „Wie ist der Prozess gerahmt?“ — kompaktes Fünf-Spalten-Brett mit der
 * Anzahl und den ersten Einträgen je Spalte; leere Spalten sind als Lücke
 * markiert. Eine Kachel je Instanz; Quelle und Kopien über den Host.
 * Form: createTile (core/template-tile.js); Einstellungen in settings.js,
 * Markup in resources/tile.html.
 */

import { createTile } from '../../../core/template-tile.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { columnSummary } from '../domain/summary.js';
import { Settings } from './settings.js';

export default createTile({
  descriptor,
  Model: State,
  Settings,
  size: { defaultW: 6, defaultH: 10, minW: 4, minH: 6 },
  titlePrefix: 'SIPOC',

  /** @type {import('./settings.types.js').SipocTileViewFn} */
  view() {
    return {
      /** Je Spalte Anzahl, die ersten topN Einträge und der Rest. */
      get columns() { return columnSummary(this.model, this.settings.topN); },
      /** Anzahl der Spalten mit mindestens einem Eintrag. */
      get filled() { return this.columns.filter((c) => c.count > 0).length; },
      /** Keine Spalte hat einen Eintrag. */
      get empty() { return !this.model.hasContent(); },
      /** „x von 5 gefüllt“, solange nicht alle Spalten gefüllt sind; sonst leer. */
      get filledText() {
        if (this.empty || this.filled === this.columns.length) return '';
        return this.t('tileFilled', { filled: this.filled, total: this.columns.length });
      },
      /** Lückenklasse einer leeren Spalte. @param {{ count: number }} col @returns {string} */
      colClass(col) { return col.count === 0 ? 'dashboard-sipoc__col--gap' : ''; },
      /** „+ n weitere“ oder leer. @param {{ more: number }} col @returns {string} */
      moreText(col) { return col.more > 0 ? this.t('tileMore', { n: col.more }) : ''; },
    };
  },
});
