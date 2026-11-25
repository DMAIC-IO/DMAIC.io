/**
 * D.Mike — TRIZ 9-Windows: Model.
 *
 * Ein Arbeitsblatt aus Freitexten: der Titel des betrachteten Systems, je drei
 * Beschriftungen der Zeitachse (Spalten) und der Systemebenen (Zeilen) und ein
 * Raster aus 3×3 Fenstern, jedes mit einem Text und höchstens einem Bild.
 * Gespeichert: `{ _schema, systemTitle, colLabels, rowLabels, cells }`.
 */
import { defineModel, command, text, list, object, number, image } from '../../../core/model.js';
import { from0 } from './migrations.js';

/** Die drei Systemebenen (Zeilen): Subsystem, System, Supersystem. */
export const ROWS = 3;
/** Die drei Zeitfenster (Spalten): Vergangenheit, Gegenwart, Zukunft. */
export const COLS = 3;

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** der Titel des betrachteten Systems */
    systemTitle: text(),
    /** die Beschriftungen der drei Zeitfenster (Vergangenheit, Gegenwart, Zukunft); leer zeigt die Vorgabe */
    colLabels: list(text(), { default: ['', '', ''] }),
    /** die Beschriftungen der drei Systemebenen (Subsystem, System, Supersystem); leer zeigt die Vorgabe */
    rowLabels: list(text(), { default: ['', '', ''] }),
    /** die neun Fenster je Systemebene (Zeile) und Zeitfenster (Spalte), jedes mit einem Text und höchstens einem Bild */
    cells: list(list(object({ text: text(), image: image({ nullable: true }) })), {
      bulk: true,
      default: [
        [{ text: '', image: null }, { text: '', image: null }, { text: '', image: null }],
        [{ text: '', image: null }, { text: '', image: null }, { text: '', image: null }],
        [{ text: '', image: null }, { text: '', image: null }, { text: '', image: null }],
      ],
    }),
  },
  view: {},
  commands: {
    setCellText: command({
      params: {
        row: number({ integer: true, min: 0, max: 2 }),
        col: number({ integer: true, min: 0, max: 2 }),
        text: text(),
      },
      run({ row, col, text: value }) {
        this.cells[row][col].text = value;
      },
    }),
    clearImage: command({
      params: {
        row: number({ integer: true, min: 0, max: 2 }),
        col: number({ integer: true, min: 0, max: 2 }),
      },
      run({ row, col }) {
        this.cells[row][col].image = null;
      },
    }),
    setCellImage: command({
      params: {
        row: number({ integer: true, min: 0, max: 2 }),
        col: number({ integer: true, min: 0, max: 2 }),
        dataUrl: image(),
      },
      run({ row, col, dataUrl }) {
        this.cells[row][col].image = dataUrl;
      },
    }),
  },
  invariants: {
    colLabelCount: {
      fields: ['colLabels'],
      test(m) { return m.colLabels.length === 3; },
    },
    rowLabelCount: {
      fields: ['rowLabels'],
      test(m) { return m.rowLabels.length === 3; },
    },
    cellGrid: {
      fields: ['cells'],
      test(m) { return m.cells.length === 3 && m.cells.every((row) => row.length === 3); },
      repair(m) {
        const rows = m._v.cells;
        if (rows.length !== 3) return;
        m._v.cells = rows.map((row) => [0, 1, 2].map((c) => row[c] ?? { text: '', image: null }));
      },
    },
  },
});
