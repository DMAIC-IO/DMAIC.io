/**
 * Tabelle aus dem Model eines Moduls. Zwei Formen:
 *
 * **Über `table()`** (P7, F1.14): `table` ist die `TableData` des Models
 * (nur Art und Identität geprüft, kein Kopieren), `columns` die Spaltenköpfe in
 * Model-Form (Sperre in `meta.lock/reason/managedBy`), `formulas` die Formeln
 * je Spalten-Id und Zeile, `rev` der Zähler `model.$tableRev`. `config` trägt
 * `readOnly`, `features`, `commands` (Rolle → Kommando des Moduls; fehlt eine
 * Rolle, ist ihr Merkmal aus), `commandArgs` (wird in jedes gemeldete
 * Args-Objekt gemischt, z. B. `{ sheetId }`), `contextMenu` (Zusatzeinträge,
 * `labelKey` unter `modules.<moduleId>.`) und `view` (gespeicherter
 * Ansichtszustand: Spaltenbreiten und Auswahl).
 *
 * **Altweg** (bis F1.14f): `config.columns` und `config.rows` (Zellwerte als
 * Text, Zahlen wandelt das Widget nach `type`); `onCell` bekommt
 * `{ row, column, value }`, `onPaste` `{ row, column, values }`, ein Eintrag aus
 * `contextMenu` sein Kommando `id` mit `{ row }`. `reason` ist der Sperrgrund wie
 * im Arbeitsblatt (`ui.datagrid.lockReason.<reason>`), `unit` steht im Kopf.
 */
import { defineWidget, list, object, text, oneOf, number, boolean, map, table } from '../../core/model.js';

const opt = { optional: true };
const optBool = () => boolean(opt);

export default defineWidget({
  name: 'datagrid',
  props: {
    table: table(opt),
    columns: list(object({
      id: text(),
      name: text(),
      shortName: text(opt),
      type: text(),
      unit: text({ nullable: true, optional: true }),
      role: text({ nullable: true, optional: true }),
      roleManual: boolean(opt),
      format: object({
        decimals: number({ integer: true, nullable: true, optional: true }),
        dateFormat: text(opt),
        timeFormat: text(opt),
        currencySymbol: text(opt),
      }, { nullable: true, optional: true }),
      meta: object({
        lock: oneOf(['hard', 'soft'], opt),
        reason: text(opt),
        managedBy: text(opt),
        managedRef: text(opt),
        categoricalCoding: map(text(), number(), opt),
      }, { nullable: true, optional: true }),
    }), opt),
    formulas: map(text(), map(text(), text()), opt),
    rev: number(opt),
    config: object({
      readOnly: boolean(),
      features: object({
        formulas: optBool(), roles: optBool(), structure: optBool(), sort: optBool(), fill: optBool(), clipboard: optBool(),
        stats: optBool(), scan: optBool(), formulaEditor: optBool(),
      }, opt),
      commands: map(text(), text(), opt),
      commandArgs: map(text(), text(), opt),
      contextMenu: list(object({ id: text(), labelKey: text() }), opt),
      view: object({
        colWidths: map(text(), number(), opt),
        selection: object({
          startCol: number(), startRow: number(), endCol: number(), endRow: number(),
          activeCol: number(), activeRow: number(), extraCols: list(number(), opt),
        }, { nullable: true, optional: true }),
      }, opt),
      // Altweg
      columns: list(object({
        key: text(),
        name: text(),
        type: text(),
        lock: oneOf(['hard', 'soft'], { nullable: true }),
        format: object({ decimals: number({ integer: true, nullable: true }) }, { nullable: true }),
        reason: text({ nullable: true, optional: true }),
        unit: text({ nullable: true, optional: true }),
      }), opt),
      rows: list(list(text({ nullable: true })), opt),
    }),
    onCell: text(opt),
    onPaste: text(opt),
  },
});
