/**
 * D.Mike — Diagramm-Vorschlag: Model.
 *
 * Gespeichert werden die gewählten Spalten als Bezüge und die Wahl des
 * Nutzers; Namen, Rollen, Rangliste und Vorschau kommen live aus dem
 * Arbeitsblatt.
 */
import { defineModel, list, text, columnRef } from '../../../core/model.js';
import { from0 } from './migrations.js';

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
