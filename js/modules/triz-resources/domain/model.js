/**
 * D.Mike — TRIZ-Ressourcen: Model.
 *
 * Das betrachtete System und ein Raster aus sechs Ressourcenkategorien mal
 * drei Systemebenen; jede Zelle hat eine Notiz und einen Füllstand.
 * Gespeichert: `{ _schema, system, cells: { <sechs Kategorien>: { sub, sys,
 * super: { notes, status } } } }`.
 */
import { defineModel, command, text, object, record, oneOf } from '../../../core/model.js';
import { nextStatus } from './resources.js';
import { from0 } from './migrations.js';

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** das betrachtete System, dessen Ressourcen aufgenommen werden */
    system: text(),
    /**
     * das Raster der Ressourcen: je Kategorie (Stoffe, Felder, Raum, Zeit,
     * Information, Funktion) und Systemebene (Subsystem, System, Supersystem)
     * eine Notiz und ein Füllstand (unbekannt, ungenutzt, teilweise genutzt,
     * voll genutzt).
     */
    cells: record(
      ['substance', 'field', 'space', 'time', 'info', 'function'],
      record(
        ['sub', 'sys', 'super'],
        object({ notes: text(), status: oneOf(['unknown', 'unused', 'partial', 'full']) }),
      ),
    ),
  },
  view: {},
  commands: {
    cycleStatus: command({
      params: {
        catKey: oneOf(['substance', 'field', 'space', 'time', 'info', 'function']),
        lvlKey: oneOf(['sub', 'sys', 'super']),
      },
      run({ catKey, lvlKey }) {
        const cell = this.cells[catKey][lvlKey];
        cell.status = nextStatus(cell.status);
      },
    }),
    setCellStatus: command({
      params: {
        catKey: oneOf(['substance', 'field', 'space', 'time', 'info', 'function']),
        lvlKey: oneOf(['sub', 'sys', 'super']),
        status: oneOf(['unknown', 'unused', 'partial', 'full']),
      },
      run({ catKey, lvlKey, status }) {
        this.cells[catKey][lvlKey].status = status;
      },
    }),
  },
});
