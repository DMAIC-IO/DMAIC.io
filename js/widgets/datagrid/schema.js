/**
 * Tabelle aus dem Model eines Moduls (DataGrid). Zellwerte kommen als Text, Zahlen
 * wandelt das Widget nach `type`; Änderungen gehen als Kommandos an das Modul:
 * `onCell` bekommt `{ row, column, value }`, `onPaste` `{ row, column, values }`,
 * ein Eintrag aus `contextMenu` sein Kommando `id` mit `{ row }`.
 */
import { defineWidget, list, object, text, oneOf, number, boolean } from '../../core/model.js';

export default defineWidget({
  name: 'datagrid',
  props: {
    config: object({
      columns: list(object({
        key: text(),
        name: text(),
        type: text(),
        lock: oneOf(['hard', 'soft'], { nullable: true }),
        format: object({ decimals: number({ integer: true, nullable: true }) }, { nullable: true }),
      })),
      rows: list(list(text({ nullable: true }))),
      readOnly: boolean(),
      contextMenu: list(object({ id: text(), labelKey: text() })),
    }),
    onCell: text({ optional: true }),
    onPaste: text({ optional: true }),
  },
});
