/**
 * D.Mike — Arbeitsblatt: ein Blatt (domain/sheet.js)
 *
 * Die Form eines Blatts im Model (`SHEET_SHAPE`) und ein neues, leeres Blatt
 * (`newSheetState`). Eigene Datei, damit Model (`model.js`) und
 * Blattkommandos (`commands-sheets.js`) sie ohne Importkreis teilen.
 *
 * Rein: kein DOM, kein i18n.
 */
import { list, object, map, text, number, table } from '../../../core/model.js';
import { TableData } from '../../../core/table-data.js';
import { uid } from '../../../core/uid.js';
import { START_ROW_COUNT } from '../../../core/datagrid/datagrid-utils.js';
import { ROLE } from '../../../core/datagrid/datagrid-roles.js';
import { COLUMN_SHAPE } from './columns.js';

/** Startspalten eines neuen Blatts (C1–C5). */
export const START_COLUMN_COUNT = 5;

/** Name eines Blatts ohne Übersetzung (das Viewmodel benennt mit `defaultSheetName`). */
export const FALLBACK_SHEET_NAME = 'Sheet';

/** Zusatz einer Blattkopie ohne Übersetzung (das Viewmodel nennt `sheetCopy`). */
export const FALLBACK_COPY_WORD = 'Copy';

/** Felder eines Blatts: `columns[i]` gehört zu `data.columns[i]`. */
export const SHEET_SHAPE = Object.freeze({
  id: text(),
  name: text(),
  columns: list(object(COLUMN_SHAPE)),
  formulas: map(text(), map(text(), text())),
  data: table(),
});

/**
 * Ansicht eines Blatts in `gridView[<Blatt-id>]`: Spaltenbreiten, Auswahl des
 * Rasters (`extraCols`: Strg+Klick-Spalten, Ruling R7).
 */
export const GRID_VIEW_SHAPE = Object.freeze({
  colWidths: map(text(), number({ exclusiveMin: 0 })),
  selection: object({
    startCol: number({ integer: true, min: 0 }), startRow: number({ integer: true, min: 0 }),
    endCol: number({ integer: true, min: 0 }), endRow: number({ integer: true, min: 0 }),
    activeCol: number({ integer: true, min: 0 }), activeRow: number({ integer: true, min: 0 }),
    extraCols: list(number({ integer: true, min: 0 }), { optional: true }),
  }, { nullable: true }),
});

/**
 * Ein neues Blatt: fünf leere Zahlenspalten C1–C5 mit `START_ROW_COUNT` Zeilen.
 * @param {string} name Name des Blatts (der Aufrufer übersetzt und nummeriert)
 * @param {string} id id des Blatts
 * @returns {{ id: string, name: string, columns: object[], formulas: Record<string, Record<string, string>>, data: TableData }}
 */
export function newSheetState(name, id) {
  const columns = [];
  for (let i = 0; i < START_COLUMN_COUNT; i++) {
    columns.push({
      id: uid(), name: '', shortName: `C${i + 1}`, type: 'numeric', unit: null,
      role: ROLE.CONTINUOUS, roleManual: false, format: {}, meta: null,
    });
  }
  const data = new TableData(START_ROW_COUNT, columns.map(() => new Array(START_ROW_COUNT).fill(null)));
  return { id, name, columns, formulas: {}, data };
}
