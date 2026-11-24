/**
 * D.Mike — Messverlaufsdiagramm: Model.
 *
 * Gespeichert werden die Teile-, Prüfer- und Messwertspalte, der Bezugswert
 * (`null` = Gesamtmittel), die Teile je Streifen, die zwei Schalter der
 * Darstellung und die Kopfzeile des Messmittels. Ansicht: die
 * Editor-Einstellungen je Streifen und das Beispielblatt. Ergebnis und Punkte
 * liefern die Ableitungen aus Model und Arbeitsblatt; die Engine läuft je
 * Datenänderung einmal (Merker in `analyze.js`).
 */
import { defineModel, text, number, boolean, record, map, columnRef } from '../../../core/model.js';
import { sourceColumns } from '../../../core/source-columns.js';
import GageRunChart from '../../../widgets/gage-run-chart/schema.js';
import { inputColumns, analyze, resultOf, pointsOf } from './analyze.js';
import { from0 } from './migrations.js';

/** @typedef {import('./analyze.js').Result} Result */
/** @typedef {import('./analyze.js').Point} Point */

/** Kleinste Zahl Teile je Streifen. */
export const MIN_PARTS_PER_ROW = 1;

/** Größte Zahl Teile je Streifen; darüber sind die Felder nicht mehr lesbar. */
export const MAX_PARTS_PER_ROW = 20;

/** Vorgabe der Teile je Streifen. */
export const DEFAULT_PARTS_PER_ROW = 7;

/** Die Schlüssel der Kopfzeile, in Anzeigereihenfolge. */
export const GAGE_INFO_KEYS = Object.freeze(['name', 'date', 'reporter', 'tolerance', 'misc']);

/** Die Spaltenfelder in der Reihenfolge der Oberfläche. */
const COLUMN_SLOTS = Object.freeze(['part', 'operator', 'measurement']);

/** Die Parameterfelder; alle wirken immer. */
const PARAMS = Object.freeze(['refValue', 'partsPerRow', 'connectWithin', 'showOperatorMean', 'gageInfo']);

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    part: columnRef(),
    operator: columnRef(),
    // Attributive Studien erfassen 0/1-Ergebnisse, darum gehört `binary` dazu.
    measurement: columnRef({ types: ['numeric', 'binary', 'percent', 'currency'] }),
    refValue: number({ nullable: true }),
    partsPerRow: number({
      integer: true, min: MIN_PARTS_PER_ROW, max: MAX_PARTS_PER_ROW, default: DEFAULT_PARTS_PER_ROW,
    }),
    connectWithin: boolean({ default: true }),
    showOperatorMean: boolean({ default: true }),
    gageInfo: record(GAGE_INFO_KEYS, text()),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    runStripEdits: map(number({ integer: true, min: 0 }), GageRunChart.edits()),
  },
  derived: {
    /**
     * Gruppierung je Teil und Prüfer, Gesamtmittel, Bezugslinie und Hinweise;
     * `null` ohne Teile- oder Messwertspalte, bei einer nicht lesbaren
     * (gelöschten) Spalte, auch der Prüferspalte, und ohne verwertbare
     * Messwerte.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result(src) {
      return resultOf(analyze(inputColumns(this, sourceColumns(src))), this);
    },
    /**
     * Je Messwert eine Zeile `{ part, operator, value }` in Feldfolge; leer
     * ohne Ergebnis.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Point[]}
     */
    points(src) {
      return pointsOf(analyze(inputColumns(this, sourceColumns(src))));
    },
    /**
     * Die Parameterfelder, die im aktuellen Stand wirken (immer alle).
     * @returns {string[]}
     */
    activeParams() { return [...PARAMS]; },
    /**
     * Die Spaltenfelder, die im aktuellen Stand wirken.
     * @returns {string[]}
     */
    activeColumnSlots() { return [...COLUMN_SLOTS]; },
  },
  derivedBulk: ['points'],
});
