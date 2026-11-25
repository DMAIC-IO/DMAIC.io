/**
 * D.Mike — Ressourcen-Checkliste (TRIZ): Viewmodel.
 *
 * System und Notizen liegen im Model (domain/model.js) und binden im
 * Template über `x-model`; der Statusknopf schaltet den Füllstand über das
 * Model-Kommando `cycleStatus` weiter. Hier bleiben nur Anzeigeentscheidungen:
 * Reihenfolge, Icons, Namen, Platzhalter, Farbklasse und Beschriftung des
 * Statusknopfs und die ids je Instanz.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { CATEGORIES, LEVELS } from '../domain/resources.js';

/** @typedef {import('../domain/model.types.js').CycleStatusCommand['catKey']} CatKey */
/** @typedef {import('../domain/model.types.js').CycleStatusCommand['lvlKey']} LvlKey */

/**
 * Kategorie → Icon-Name. Steht hier und nicht in i18n: das Icon ist keine
 * Übersetzung, und zwei Sprachdateien müssten sonst denselben Wert pflegen.
 * @type {Record<string, string>}
 */
const CATEGORY_ICONS = {
  substance: 'domain.substance',
  field: 'domain.field',
  space: 'domain.geometry',
  time: 'domain.time',
  info: 'domain.info',
  function: 'domain.function',
};

/** Füllstand → Icon-Name. @type {Record<string, string>} */
const FILL_ICONS = {
  unknown: 'fill.0',
  unused: 'fill.25',
  partial: 'fill.50',
  full: 'fill.100',
};

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    return {
      /** Die sechs Kategorien in Anzeigereihenfolge (Zeilen). @returns {ReadonlyArray<string>} */
      get categories() { return CATEGORIES; },

      /** Die drei Systemebenen in Anzeigereihenfolge (Spalten). @returns {ReadonlyArray<string>} */
      get levels() { return LEVELS; },

      /** Icon einer Kategorie. @param {string} k @returns {string} */
      catIcon(k) { return CATEGORY_ICONS[k]; },

      /** Übersetzter Name einer Kategorie. @param {string} k @returns {string} */
      catName(k) { return this.t(`category.${k}.name`); },

      /** Übersetzter Platzhalter der Notizen einer Kategorie. @param {string} k @returns {string} */
      catPrompt(k) { return this.t(`category.${k}.prompt`); },

      /** Übersetzter Name einer Systemebene. @param {string} l @returns {string} */
      levelName(l) { return this.t(`level.${l}`); },

      /** Farbklasse des Statusknopfs einer Zelle. @param {CatKey} catKey @param {LvlKey} lvlKey @returns {string} */
      statusClass(catKey, lvlKey) { return `triz-res__status--${this.model.cells[catKey][lvlKey].status}`; },

      /** Icon des Füllstands einer Zelle. @param {CatKey} catKey @param {LvlKey} lvlKey @returns {string} */
      fillIcon(catKey, lvlKey) { return FILL_ICONS[this.model.cells[catKey][lvlKey].status]; },

      /** Übersetzte Beschriftung des Statusknopfs einer Zelle. @param {CatKey} catKey @param {LvlKey} lvlKey @returns {string} */
      statusLabel(catKey, lvlKey) { return this.t(`status.${this.model.cells[catKey][lvlKey].status}`); },

      /**
       * id eines Eingabefelds, eindeutig je Instanz: `<label for>` zeigt so
       * auch bei mehreren offenen Instanzen auf das eigene Feld.
       * @param {string} name Kurzname des Felds
       * @returns {string}
       */
      fieldId(name) { return `triz-res-${name}-${ctx.instanceId}`; },
    };
  },
});
