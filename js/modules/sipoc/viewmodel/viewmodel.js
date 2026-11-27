/**
 * D.Mike — SIPOC: Viewmodel.
 *
 * Inhalt und Kommandos liegen im Model (domain/model.js); die Agentenfläche
 * entsteht aus dessen Schema. Der UI-State (Vorschau der Geste) steht in
 * viewmodel/state.js. Eingabezeile, Bearbeiten-Dialog und Löschknopf lösen
 * ihre Kommandos im Template aus (`x-command-form`, `x-dialog`, `x-command`).
 * Exporte: Mapper nach Datenform, Menü und Dateien baut der Kern.
 * Hier bleiben: Spalten und Einfügemarke.
 */
import { createModule } from '../../../core/template-module.js';
import { columnsToSVG } from '../../../core/export-utils.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { COLUMNS } from '../domain/summary.js';
import { reorder } from '../interaction/reorder.js';
import { toJSONObject, toRows, toImageColumns } from '../io/export.js';
import { UiState } from './state.js';

/** @typedef {import('../domain/model.types.js').AddItemCommand['col']} ColKey */

const COLOR_VARS = { suppliers: '--color-sipoc-s', inputs: '--color-sipoc-i', process: '--color-sipoc-p', outputs: '--color-sipoc-o', customers: '--color-sipoc-c' };

export default createModule({
  descriptor,
  Model: State,
  history: true,
  State: UiState,
  gestures: [reorder],
  /** @type {import('./state.types.js').SipocViewFn} */
  view() {
    return {
      /** Spalten in Anzeigereihenfolge. */
      get columnDefs() { return COLUMNS; },

      /**
       * Ansichtsklasse für die Einfügemarke der Geste.
       * @param {ColKey} col @param {number} idx @returns {string}
       */
      itemClass(col, idx) {
        const p = this.state.dropPreview;
        return p && p.group === col && p.index === idx ? 'sipoc__item--drop-at' : '';
      },
    };
  },

  /** @type {import('./state.types.js').SipocExports} */
  exports: {
    fileName: 'sipoc',
    table() { return toRows(this.model, this.t); },
    tree() { return toJSONObject(this.model); },
    image() { return columnsToSVG(toImageColumns(this.model, this.t, this.cssVars(COLOR_VARS))); },
  },
});
