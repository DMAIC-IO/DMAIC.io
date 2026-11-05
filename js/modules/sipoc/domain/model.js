/**
 * D.Mike — SIPOC: Model (Spec E1 §5.2).
 *
 * Fünf Spalten mit Texteinträgen. Gespeichert: `{ _schema, columns }`.
 * `moveItem.toIdx` ist der ENDINDEX (Position nach dem Verschieben), wie die
 * Geste reorder (interaction/reorder.js): in der eigenen Spalte bis
 * `länge − 1`, in einer fremden bis `länge`. Den ersten Fall kann der Pfad
 * von `index` nicht ausdrücken; `run` prüft ihn nach.
 */
import { defineModel, record, list, text, oneOf, index, command } from '../../../core/model.js';
import { requireIndex } from '../../../core/validate.js';
import { from0 } from './migrations.js';

export const COL_KEYS = ['suppliers', 'inputs', 'process', 'outputs', 'customers'];

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    columns: record(COL_KEYS, list(text())),
  },
  view: {},
  commands: {
    addItem: command({
      params: { col: oneOf(COL_KEYS), text: text({ trim: true, nonEmpty: true }) },
      returns: index('columns[col]'),
      run({ col, text }) {
        this.columns[col].push(text);
        return this.columns[col].length - 1;
      },
    }),
    setItem: command({
      params: {
        col: oneOf(COL_KEYS),
        idx: index('columns[col]', { existing: true }),
        text: text({ trim: true, nonEmpty: true }),
      },
      run({ col, idx, text }) {
        this.columns[col][idx] = text;
      },
    }),
    removeItem: command({
      params: { col: oneOf(COL_KEYS), idx: index('columns[col]', { existing: true }) },
      run({ col, idx }) {
        this.columns[col].splice(idx, 1);
      },
    }),
    moveItem: command({
      params: {
        fromCol: oneOf(COL_KEYS),
        fromIdx: index('columns[fromCol]', { existing: true }),
        toCol: oneOf(COL_KEYS),
        toIdx: index('columns[toCol]'),
      },
      run({ fromCol, fromIdx, toCol, toIdx }) {
        if (fromCol === toCol) requireIndex('toIdx', toIdx, this.columns[toCol].length, { existing: true });
        const [moved] = this.columns[fromCol].splice(fromIdx, 1);
        this.columns[toCol].splice(toIdx, 0, moved);
      },
    }),
  },
});
