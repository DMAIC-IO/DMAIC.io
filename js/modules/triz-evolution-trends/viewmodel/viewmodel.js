/**
 * D.Mike — Evolutionstrends (TRIZ): Viewmodel.
 *
 * System und Notizen liegen im Model (domain/model.js) und binden im
 * Template über `x-model`; die Stufenwahl läuft über das Model-Kommando
 * `setTrendStage`. Hier bleiben nur Anzeigeentscheidungen: Reihenfolge,
 * Nummern, Namen, Platzhalter, Markierung der gewählten Stufe und die ids
 * und Radiogruppen je Instanz.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { TRENDS, stageCount } from '../domain/trends.js';

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    return {
      /** Die ids der acht Trends in Anzeigereihenfolge. @returns {string[]} */
      get trendIds() { return TRENDS.map((t) => t.id); },

      /** Anzeigenummer eines Trends, ab 1. @param {string} id @returns {number} */
      trendNum(id) { return TRENDS.findIndex((t) => t.id === id) + 1; },

      /** Übersetzter Name eines Trends. @param {string} id @returns {string} */
      trendName(id) { return this.t(`trend.${id}.name`); },

      /** Übersetzte Beschreibung eines Trends. @param {string} id @returns {string} */
      trendDesc(id) { return this.t(`trend.${id}.description`); },

      /** Ob der Trend eine Stufenleiter hat. @param {string} id @returns {boolean} */
      hasStages(id) { return stageCount(id) > 0; },

      /** Die Stufen eines Trends, ab 0. @param {string} id @returns {number[]} */
      stages(id) { return Array.from({ length: stageCount(id) }, (_, i) => i); },

      /** Anzeigenummer einer Stufe, ab 1. @param {number} s @returns {number} */
      stageNum(s) { return s + 1; },

      /** Übersetzter Name einer Stufe. @param {string} id @param {number} s @returns {string} */
      stageName(id, s) { return this.t(`trend.${id}.stages.${s}`); },

      /** Ob die Stufe die gewählte ist. @param {string} id @param {number} s @returns {boolean} */
      isSelected(id, s) { return this.model.trends[id].stage === s; },

      /** CSS-Klasse der Stufe. @param {string} id @param {number} s @returns {string} */
      stageClass(id, s) { return this.isSelected(id, s) ? 'is-selected' : ''; },

      /** CSS-Klasse der Karte eines Trends ohne Stufen. @param {string} id @returns {string} */
      qualClass(id) { return this.hasStages(id) ? '' : 'triz-evo__trend--qualitative'; },

      /** Platzhalter des Notizfelds. @param {string} id @returns {string} */
      notesPlaceholder(id) {
        return this.hasStages(id) ? this.t('notesPlaceholder') : this.t(`trend.${id}.notesPlaceholder`);
      },

      /**
       * id eines Eingabefelds, eindeutig je Instanz: `<label for>` zeigt so
       * auch bei mehreren offenen Instanzen auf das eigene Feld.
       * @param {string} name Kurzname des Felds
       * @returns {string}
       */
      fieldId(name) { return `triz-evo-${name}-${ctx.instanceId}`; },

      /**
       * Gruppenname der Optionsfelder eines Trends, eindeutig je Instanz:
       * sonst bildeten zwei offene Instanzen eine gemeinsame Gruppe.
       * @param {string} id
       * @returns {string}
       */
      radioName(id) { return `triz-evo-${id}-${ctx.instanceId}`; },
    };
  },
});
