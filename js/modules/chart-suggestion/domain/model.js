/**
 * D.Mike — Diagramm-Vorschlag: Model.
 *
 * Gespeichert werden die gewählten Spalten als Bezüge und die Wahl des
 * Nutzers; Namen, Rollen, Rangliste und Vorschau kommen live aus dem
 * Arbeitsblatt.
 */
import { defineModel, list, text, columnRef } from '../../../core/model.js';
import { getSuggestionsFor } from '../../../core/chart-suggestions/chart-suggestions.js';
import { from0 } from './migrations.js';
import { liveColumns, shownType } from './columns.js';
import { prefillFor } from './prefill.js';

/**
 * Die Auswahl, wie `read().selection` sie liefert — ohne Werte, die stehen im Worksheet.
 *
 * @typedef {object} Selection
 * @property {string} sourceInstanceId  worksheet instance the columns come from
 * @property {string} sourceSheetId  sheet of that worksheet
 * @property {SelectedColumn[]} columns  the selected columns in selection order
 */

/**
 * Eine gewählte Spalte.
 *
 * @typedef {object} SelectedColumn
 * @property {string} id  column id in the sheet
 * @property {string} name  display name of the column
 * @property {string} role  role that drives the ranking: continuous, categorical, ordinal or date
 * @property {boolean} roleConfirmed  true when the role was set or confirmed by hand in the worksheet
 */

/**
 * Ein Diagrammvorschlag ohne Texte: Schlüssel statt Übersetzung.
 *
 * @typedef {object} SuggestionEntry
 * @property {string} chartType  chart type, the value pickChart accepts
 * @property {number} score  rank score, higher first
 * @property {string} titleKey  translation key of the title
 * @property {string|null} noteKey  translation key of the note, or null without one
 * @property {object} vars  placeholder values for the translation keys
 */

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    columns: list(columnRef({ nullable: false }), { default: [] }),
    pick: text({ nullable: true }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
  },
  derived: {
    /**
     * Die gewählten Spalten mit Rolle und Quelle; null ohne auflösbare Spalte.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser der Arbeitsblätter
     * @this {import('./model.types.js').StateModel}
     * @returns {Selection|null}
     */
    selection(src) {
      const cols = liveColumns(this.columns, src);
      if (cols.length === 0) return null;
      const first = this.columns[0];
      return {
        sourceInstanceId: first.instanceId,
        sourceSheetId: first.sheetId ?? '',
        columns: cols.map((c) => ({ id: c.id, name: c.name, role: c.role, roleConfirmed: c.roleConfirmed })),
      };
    },
    /**
     * Die passenden Diagramme in Rangfolge; Titel und Hinweis als Übersetzungsschlüssel
     * (`charts.<titleKey>`, `notes.<noteKey>`), `vars` für deren Platzhalter.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser der Arbeitsblätter
     * @this {import('./model.types.js').StateModel}
     * @returns {SuggestionEntry[]}
     */
    suggestions(src) {
      return getSuggestionsFor(liveColumns(this.columns, src)).map((s) => ({
        chartType: s.type,
        score: s.score,
        titleKey: `charts.${s.i18nKey}`,
        noteKey: s.notesKey ? `notes.${s.notesKey}` : null,
        vars: {},
      }));
    },
    /**
     * Die gezeigte Wahl: die des Nutzers, wenn vorgeschlagen, sonst der Spitzenreiter.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser der Arbeitsblätter
     * @param {any} d Ableitungen
     * @this {import('./model.types.js').StateModel}
     * @returns {string|null}
     */
    selectedChartType(src, d) {
      return shownType(d.suggestions.map((/** @type {{ chartType: string }} */ s) => ({ type: s.chartType })), this.pick);
    },
    /**
     * Das Modul, das openInModule anlegt, oder null.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser der Arbeitsblätter
     * @param {any} d Ableitungen
     * @this {import('./model.types.js').StateModel}
     * @returns {string|null}
     */
    openTarget(src, d) {
      return prefillFor(this.columns, d.selectedChartType, liveColumns(this.columns, src))?.target ?? null;
    },
  },
  invariants: {
    oneSheet: {
      fields: ['columns'],
      test(m) { return new Set(m.columns.map((r) => `${r.instanceId}\u0000${r.sheetId ?? ''}`)).size <= 1; },
    },
    distinct: {
      fields: ['columns'],
      test(m) { return new Set(m.columns.map((r) => `${r.instanceId}\u0000${r.sheetId ?? ''}\u0000${r.columnId}`)).size === m.columns.length; },
    },
  },
});
