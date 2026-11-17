/**
 * D.Mike — Arbeitsblatt: Model (domain/model.js)
 *
 * Mehrere Blätter, je Blatt Spaltenköpfe, dünn besetzte Formeln und die
 * Tabelle `data` (`table()`, spaltenweise, `core/table-data.js`). Die
 * Formelwerte stehen berechnet in `data` (Kommandos rufen `recalcFormulas`).
 *
 * Gespeichert: `{ _schema, sheets, sheetCounter, activeSheetId, gridView }`.
 * - `sheets[].columns[i]` gehört zu `sheets[].data.columns[i]`.
 * - `sheets[].formulas`: Spalten-Id → `{ "<Zeile>": "=…" }` (Zeile 0-basiert).
 * - `gridView`: Ansicht je Blatt-Id (Spaltenbreiten, Auswahl), kein Inhalt.
 *
 * Inhaltsfelder tragen `agentWrite: false`: geschrieben wird über Kommandos
 * (`commands-*.js`, ab Task 10), die ihre Umkehrung sammeln
 * (`history: { mode: 'inverse' }` in `createModule`). Ohne DOM, ohne i18n.
 */
import {
  defineModel, list, object, map, text, number, boolean, oneOf, table,
} from '../../../core/model.js';
import { TableData } from '../../../core/table-data.js';
import { uid } from '../../../core/uid.js';
import { COLUMN_TYPES, DATE_FORMATS, TIME_FORMATS, START_ROW_COUNT } from '../../../core/datagrid/datagrid-utils.js';
import { ALL_ROLES, ROLE, inferRole } from '../../../core/datagrid/datagrid-roles.js';
import { from0 } from './migrations.js';

/** Startspalten eines neuen Blatts (C1–C5). */
export const START_COLUMN_COUNT = 5;

/** Name des ersten Blatts ohne Übersetzung (das Viewmodel benennt mit `defaultSheetName`). */
const FALLBACK_SHEET_NAME = 'Sheet';

const index = () => number({ integer: true, min: 0 });

/** Ein Spaltenkopf; `meta` mit den Schlüsseln von `COLUMN_META_KEYS` (domain/columns.js). */
const columnSpec = object({
  id: text(),
  name: text(),
  shortName: text(),
  type: oneOf(Object.keys(COLUMN_TYPES)),
  unit: text({ nullable: true }),
  role: oneOf(ALL_ROLES, { nullable: true }),
  roleManual: boolean(),
  format: object({
    decimals: number({ integer: true, min: 0, optional: true }),
    dateFormat: oneOf(Object.keys(DATE_FORMATS), { optional: true }),
    timeFormat: oneOf(Object.keys(TIME_FORMATS), { optional: true }),
  }),
  meta: object({
    lock: oneOf(['hard', 'soft'], { optional: true }),
    reason: text({ optional: true }),
    managedBy: text({ optional: true }),
    managedRef: text({ optional: true }),
    categoricalCoding: map(text(), number(), { optional: true }),
  }, { nullable: true }),
});

const sheetSpec = object({
  id: text(),
  name: text(),
  columns: list(columnSpec),
  formulas: map(text(), map(text(), text())),
  data: table(),
});

/** Auswahl des Rasters; `extraCols`: Strg+Klick-Spalten (Ruling R7). */
const selectionSpec = object({
  startCol: index(), startRow: index(), endCol: index(), endRow: index(),
  activeCol: index(), activeRow: index(),
  extraCols: list(index(), { optional: true }),
}, { nullable: true });

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

/**
 * Passt der Zellwert zum Spaltentyp? `null` passt immer. Nicht strenger als
 * das Raster: Datum/Zeit dürfen Zahlen halten (Typwechsel lässt sie stehen),
 * `binary` Wahrheitswerte, `text` alles.
 * @param {string} type @param {any} v @returns {boolean}
 */
function fitsType(type, v) {
  if (v === null) return true;
  switch (type) {
    case 'numeric': case 'currency': case 'percent': return typeof v === 'number';
    case 'binary': return typeof v === 'number' || typeof v === 'boolean';
    case 'date': case 'time': return typeof v === 'string' || typeof v === 'number';
    default: return true;
  }
}

/**
 * Jede Zelle eines Blatts, die nicht zum Typ passt und keine Formelzelle ist.
 * @param {any} sheet @param {(c: number, r: number) => boolean} visit `false` bricht ab
 * @returns {void}
 */
function eachMisfit(sheet, visit) {
  const { columns, data, formulas } = sheet;
  for (let c = 0; c < columns.length; c++) {
    const type = columns[c].type;
    if (type === 'text') continue;
    const cells = data.columns[c];
    if (!cells) continue;
    const byRow = formulas[columns[c].id];
    for (let r = 0; r < cells.length; r++) {
      if (fitsType(type, cells[r])) continue;
      if (byRow && Object.hasOwn(byRow, String(r))) continue;
      if (visit(c, r) === false) return;
    }
  }
}

/**
 * True, wenn keine id leer ist und keine doppelt vorkommt.
 * @param {string[]} ids @returns {boolean}
 */
function distinct(ids) {
  return ids.every(id => id !== '') && new Set(ids).size === ids.length;
}

/**
 * Leere und doppelte ids ersetzen; die erste behält ihre id.
 * @param {Array<{ id: string }>} items @param {(taken: Set<string>) => string} fresh
 * @returns {void}
 */
function renameDuplicates(items, fresh) {
  const taken = new Set(items.map(x => x.id));
  const seen = new Set();
  for (const x of items) {
    if (x.id === '' || seen.has(x.id)) {
      x.id = fresh(taken);
      taken.add(x.id);
    }
    seen.add(x.id);
  }
}

/** @param {Set<string>} taken @returns {string} */
function freshColumnId(taken) {
  let id = uid();
  while (taken.has(id)) id = uid();
  return id;
}

/** @param {Set<string>} taken @returns {string} */
function freshSheetId(taken) {
  let n = taken.size + 1;
  while (taken.has(`sheet_${n}`)) n++;
  return `sheet_${n}`;
}

export class WorksheetModel extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    sheets: list(sheetSpec, {
      agentWrite: false,
      default: () => [newSheetState(`${FALLBACK_SHEET_NAME} 1`, 'sheet_1')],
    }),
    sheetCounter: number({ integer: true, min: 0, default: 1, agentWrite: false }),
  },
  view: {
    activeSheetId: text({ default: 'sheet_1' }),
    gridView: map(text(), object({ colWidths: map(text(), number({ exclusiveMin: 0 })), selection: selectionSpec })),
  },
  // Kommandos kommen aus `commands-*.js` (Tasks 10–12): `commands: { ...sheetCommands, ...cellCommands }`.
  commands: {},
  invariants: {
    uniqueSheetIds: {
      fields: ['sheets'],
      test(m) { return distinct(m.sheets.map(s => s.id)); },
      repair(m) { renameDuplicates(m._v.sheets, freshSheetId); },
    },
    hasSheet: {
      fields: ['sheets'],
      test(m) { return m.sheets.length > 0; },
      repair(m) { m._v.sheets = [newSheetState(`${FALLBACK_SHEET_NAME} 1`, 'sheet_1')]; },
    },
    uniqueColumnIds: {
      fields: ['sheets'],
      test(m) { return m.sheets.every(s => distinct(s.columns.map(c => c.id))); },
      repair(m) { for (const s of m._v.sheets) renameDuplicates(s.columns, freshColumnId); },
    },
    tableShape: {
      fields: ['sheets'],
      test(m) { return m.sheets.every(s => s.data.columns.length === s.columns.length); },
      repair(m) {
        for (const s of m._v.sheets) {
          const { data } = s;
          if (data.columns.length > s.columns.length) data.columns.length = s.columns.length;
          while (data.columns.length < s.columns.length) data.columns.push(new Array(data.rowCount).fill(null));
        }
      },
    },
    cellsFitType: {
      fields: ['sheets'],
      test(m) {
        let ok = true;
        for (const s of m.sheets) eachMisfit(s, () => (ok = false));
        return ok;
      },
      repair(m) {
        for (const s of m._v.sheets) eachMisfit(s, (c, r) => { s.data.columns[c][r] = null; });
      },
    },
    rolesSet: {
      fields: ['sheets'],
      test(m) { return m.sheets.every(s => s.columns.every(c => c.role !== null)); },
      repair(m) {
        for (const s of m._v.sheets) {
          s.columns.forEach((c, i) => {
            if (c.role === null) c.role = inferRole({ type: c.type, values: s.data.columns[i] });
          });
        }
      },
    },
    activeSheet: {
      fields: ['activeSheetId'],
      test(m) { return m.sheets.some(s => s.id === m.activeSheetId); },
      repair(m) { m._v.activeSheetId = m.sheets[0]?.id ?? ''; },
    },
  },
}) {
  /**
   * Ein Blatt nach id.
   * @param {string} id @returns {any} das Blatt oder `undefined`
   */
  sheetById(id) {
    return this.sheets.find((/** @type {{ id: string }} */ s) => s.id === id);
  }

  /**
   * Hat die Arbeitsmappe Inhalt? Ein frisches Blatt (leere Startspalten) zählt
   * nicht, ein zweites Blatt schon (wie die Altform `State#hasContent`);
   * dazu eine Formel.
   * @returns {boolean}
   */
  hasContent() {
    const sheets = this.sheets;
    if (sheets.length !== 1) return sheets.length > 1;
    const [sheet] = sheets;
    if (Object.values(sheet.formulas).some(byRow => Object.keys(byRow).length > 0)) return true;
    return sheet.data.columns.some((/** @type {any[]} */ col) => col.some(v => v !== null && v !== ''));
  }
}
