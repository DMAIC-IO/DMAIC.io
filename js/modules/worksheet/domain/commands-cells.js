/**
 * D.Mike — Arbeitsblatt: Kommandos für Zellen und Formeln (domain/commands-cells.js)
 *
 * `setCells`, `setFormula`, `writeColumns`, `importCsv` (heutige Agenten-
 * aktionen, Gründe und Meldungen wörtlich aus `worksheet.js`) und die
 * Kommandos des Rasters `pasteBlock`, `fillRange`, `clearRange`, `moveCells`
 * (Verhalten aus `DataGrid.importFromClipboard`, `_applyFill`,
 * `_clearSelection`, `moveCells`).
 *
 * Jedes Kommando prüft alles, bevor es schreibt (ganz oder gar nicht), und
 * beschreibt seine Wirkung als Änderung (`Change`): Zeilen- und Spaltenzahl
 * danach und je Spalte Kopf, ein zusammenhängender Zellbereich und Formeln.
 * `applyChange` schreibt sie und liefert die Gegenänderung; die geht als
 * Umkehrung `restoreCells` (nur Umkehrung, nicht für Agenten) in den Verlauf.
 * Danach `recalcFormulas` und genau einmal `markTableChanged`.
 *
 * Exportiert sind die Hilfen, die auch `commands-structure.js` braucht
 * (`sheetOf`, `columnIndex`, `requireUnlocked`, `copyHead`, `changedRun`,
 * `commit`, `HEAD_SPEC`).
 *
 * Rein: kein DOM, kein i18n.
 */
import {
  command, text, number, boolean, list, object, map, cell, unchecked, checkValue,
  recordInverse, markTableChanged,
} from '../../../core/model.js';
import { requireKnownId, requireIndex, requireForm } from '../../../core/validate.js';
import { isCell } from '../../../core/table-data.js';
import { COLUMN_TYPES, detectInputType, parseCellInput, isNumericType, parseNumeric } from '../../../core/datagrid/datagrid-utils.js';
import { isFormula, moveCellRefs } from '../../../core/datagrid/datagrid-formula.js';
import { recalcFormulas } from '../../../core/datagrid/table/formulas.js';
import { splitHeader, fillBlock } from '../../../core/datagrid/table/paste.js';
import { detectColumnType } from '../../../core/parser/column-types.js';
import { parseCsvText } from '../../../core/parser/csv.js';
import { defaultColumnFormat, retypeForWrite, reinferRoleAfterRetype } from '../../../core/worksheet-write.js';
import { inferRole, defaultRoleForType } from '../../../core/datagrid/datagrid-roles.js';
import { uid } from '../../../core/uid.js';
import { COLUMN_SHAPE, fitsType } from './columns.js';

/**
 * @typedef {{ index: number, head?: any, start?: number, values?: any[], formulas?: Record<string, string|null> }} ColumnChange
 *   eine Spalte: Kopf (ganz), Zellen ab `start`, Formeln je Zeile (`null` löscht)
 * @typedef {{ rowCount: number, columnCount: number, cols: ColumnChange[] }} Change
 *   Zeilen- und Spaltenzahl danach (überzählige fallen weg, fehlende kommen leer
 *   dazu; neue Spalten brauchen einen Kopf in `cols`), dann die Spalten der Reihe nach
 */

/**
 * Wie weit `fillRange` das Blatt nach unten wachsen lässt. Das Raster füllt nur
 * bis zur letzten sichtbaren Zeile (es wächst praktisch nicht); ein Agent darf
 * eine Reihe fortsetzen, aber nicht mit einem Aufruf Millionen Zeilen anlegen.
 * 10 000 ist die Größe der Leistungsziele für Einfügen (§10).
 */
export const MAX_FILL_GROWTH = 10000;

/** Die Startspalten C1–C5, die `to: 'start'` füllen kann (wie `worksheet.js`). */
const START_COLUMNS = 5;

// ─── Lesen und Prüfen ────────────────────────────────────────────

/**
 * Das Blatt zu einer id.
 * @param {any} model @param {string} sheetId @returns {any}
 * @throws {Error} `unknown_sheet: <id>`
 */
export function sheetOf(model, sheetId) {
  const sheet = model.sheets.find((/** @type {{ id: string }} */ s) => s.id === sheetId);
  if (!sheet) throw new Error(`unknown_sheet: ${sheetId}`);
  return sheet;
}

/**
 * Index einer Spalte; Meldung wie heute `requireKnownId('columnId', …)`.
 * @param {any} sheet @param {string} columnId @returns {number}
 */
export function columnIndex(sheet, columnId) {
  const ids = sheet.columns.map((/** @type {{ id: string }} */ c) => c.id);
  requireKnownId('columnId', columnId, ids);
  return ids.indexOf(columnId);
}

/**
 * @param {any} head
 * @throws {Error} `column "<id>" is locked (<lock>)`
 */
export function requireUnlocked(head) {
  const lock = head.meta?.lock;
  if (lock) throw new Error(`column "${head.id}" is locked (${lock})`);
}

/**
 * Ein Spaltenkopf als eigenständige Kopie.
 * @param {any} head @returns {any}
 */
export function copyHead(head) {
  return { ...head, format: { ...head.format }, meta: head.meta ? JSON.parse(JSON.stringify(head.meta)) : null };
}

/** Prüfer eines ganzen Spaltenkopfs (Model-Form). */
export const HEAD_SPEC = object(COLUMN_SHAPE);

/**
 * Der kleinste zusammenhängende Bereich, in dem `next` von `cur` abweicht
 * (`cur` darf kürzer sein: fehlende Zellen gelten als `null`).
 * @param {any[]} cur @param {any[]} next
 * @returns {{ start: number, values: any[] }|null}
 */
export function changedRun(cur, next) {
  let a = -1;
  let b = -1;
  for (let r = 0; r < next.length; r++) {
    const old = r < cur.length ? cur[r] : null;
    if (!Object.is(old, next[r])) {
      if (a < 0) a = r;
      b = r;
    }
  }
  return a < 0 ? null : { start: a, values: next.slice(a, b + 1) };
}

/**
 * Eine Spalte auf `rows` Zellen: Kopie, mit `null` aufgefüllt.
 * @param {any[]} values @param {number} rows @returns {any[]}
 */
function padded(values, rows) {
  const out = values.slice(0, rows);
  while (out.length < rows) out.push(null);
  return out;
}

/**
 * Löscht die Formeln einer Spalte in den Zeilen `from..to` (einschließlich).
 * @param {Record<string, string>|undefined} byRow @param {number} from @param {number} to
 * @returns {Record<string, null>|undefined}
 */
function clearFormulasIn(byRow, from, to) {
  if (!byRow) return undefined;
  /** @type {Record<string, null>} */
  const out = {};
  for (const key of Object.keys(byRow)) {
    const r = Number(key);
    if (r >= from && r <= to) out[key] = null;
  }
  return Object.keys(out).length ? out : undefined;
}

// ─── Änderung schreiben ──────────────────────────────────────────

/**
 * Schreibt eine Änderung in ein Blatt und liefert die Gegenänderung.
 * Reihenfolge: überzählige Spalten, dann Zeilen entfernen; Zeilen, dann
 * Spalten anfügen; dann die Spalten der Reihe nach (Kopf, Zellen, Formeln).
 * Ändert sich die id eines Kopfs, wandern seine Formeln mit.
 * @param {any} sheet @param {Change} change @returns {Change}
 */
function applyChange(sheet, { rowCount, columnCount, cols }) {
  const { data, columns: heads, formulas } = sheet;
  const oldRows = data.rowCount;
  const oldCols = heads.length;
  /** @type {ColumnChange[]} */ const dropped = [];
  /** @type {ColumnChange[]} */ const restore = [];

  for (let c = oldCols - 1; c >= columnCount; c--) {
    const head = heads[c];
    const byRow = formulas[head.id];
    dropped.push({ index: c, head, start: 0, values: data.columns[c], ...(byRow ? { formulas: { ...byRow } } : {}) });
    delete formulas[head.id];
  }
  if (columnCount < oldCols) {
    heads.splice(columnCount);
    data.columns.splice(columnCount);
  }

  if (rowCount < oldRows) {
    for (let c = 0; c < data.columns.length; c++) {
      const tail = data.columns[c].splice(rowCount);
      const byRow = formulas[heads[c].id];
      /** @type {Record<string, string>} */ const lost = {};
      if (byRow) {
        for (const key of Object.keys(byRow)) {
          if (Number(key) >= rowCount) { lost[key] = byRow[key]; delete byRow[key]; }
        }
        if (Object.keys(byRow).length === 0) delete formulas[heads[c].id];
      }
      const hasLost = Object.keys(lost).length > 0;
      if (hasLost || tail.some((v) => v !== null)) {
        dropped.push({ index: c, start: rowCount, values: tail, ...(hasLost ? { formulas: lost } : {}) });
      }
    }
  } else if (rowCount > oldRows) {
    for (const col of data.columns) while (col.length < rowCount) col.push(null);
  }
  data.rowCount = rowCount;

  for (let c = heads.length; c < columnCount; c++) {
    const head = cols.find((e) => e.index === c && e.head)?.head;
    heads.push(copyHead(head));
    data.columns.push(new Array(rowCount).fill(null));
  }

  for (const e of cols) {
    const i = e.index;
    const existed = i < Math.min(oldCols, columnCount);
    /** @type {ColumnChange} */ const back = { index: i };
    if (e.head) {
      const old = heads[i];
      if (existed) back.head = copyHead(old);
      if (old.id !== e.head.id && formulas[old.id]) {
        formulas[e.head.id] = formulas[old.id];
        delete formulas[old.id];
      }
      heads[i] = copyHead(e.head);
    }
    if (e.values && e.values.length) {
      const start = e.start ?? 0;
      const col = data.columns[i];
      const before = col.slice(start, start + e.values.length);
      for (let k = 0; k < e.values.length; k++) col[start + k] = e.values[k];
      const keep = Math.max(0, Math.min(before.length, oldRows - start));
      if (existed && keep > 0) { back.start = start; back.values = before.slice(0, keep); }
    }
    if (e.formulas) {
      const id = heads[i].id;
      const byRow = formulas[id] ?? {};
      /** @type {Record<string, string|null>} */ const before = {};
      for (const [key, f] of Object.entries(e.formulas)) {
        before[key] = byRow[key] ?? null;
        if (f == null) delete byRow[key];
        else byRow[key] = f;
      }
      if (Object.keys(byRow).length) formulas[id] = byRow;
      else delete formulas[id];
      const kept = Object.fromEntries(Object.entries(before).filter(([key]) => Number(key) < oldRows));
      if (existed && Object.keys(kept).length) back.formulas = kept;
    }
    if (back.head || back.values || back.formulas) restore.unshift(back);
  }
  return { rowCount: oldRows, columnCount: oldCols, cols: [...dropped, ...restore] };
}

/**
 * Schreibt eine Änderung samt Umkehrung, rechnet die Formeln und meldet die
 * Tabelle genau einmal als geändert. Ohne Wirkung: nichts.
 * @param {any} model @param {any} sheet @param {Change} change
 * @param {(c: number, r: number, error: string) => void} [onError] Rechenfehler je Formelzelle
 * @returns {void}
 */
export function commit(model, sheet, change, onError) {
  const noop = change.cols.length === 0 && change.rowCount === sheet.data.rowCount
    && change.columnCount === sheet.columns.length;
  if (noop) return;
  const inverse = applyChange(sheet, change);
  recordInverse(model, { type: 'restoreCells', sheetId: sheet.id, ...inverse });
  recalcFormulas(sheet.columns, sheet.data, sheet.formulas, onError);
  markTableChanged(model, sheet.data);
}

// ─── Zelleingabe (wie DataGrid.setCellValue) ─────────────────────

/**
 * Arbeitsstand einer Spalte während einer Eingabe.
 * @typedef {{ type: string, format: any, role: any, roleManual: boolean, values: any[], nonNull: number }} Work
 */

/** @param {Work} st @param {number} row @param {any} v */
function put(st, row, v) {
  const old = st.values[row];
  if (old != null) st.nonNull--;
  if (v != null) st.nonNull++;
  st.values[row] = v;
}

/**
 * Spalte wird Text: alle Werte als Text, wie der Rückfall in `setCellValue`.
 * @param {Work} st @param {number} row @param {string} value
 */
function toText(st, row, value) {
  st.type = 'text';
  for (let r = 0; r < st.values.length; r++) if (st.values[r] != null) st.values[r] = String(st.values[r]);
  put(st, row, value);
  reinferRoleAfterRetype(st);
}

/**
 * Typwechsel nach der Erkennung (`_switchColumnType`). Hielte die Spalte
 * danach Werte, die nicht zum neuen Typ passen (Datum → Zahl), wird sie
 * stattdessen Text: das Raster ließ sie stehen, das Model verlöre sie beim
 * nächsten Laden.
 * @param {Work} st @param {number} row @param {{ type: string, value: any }} detected @param {any} raw
 */
function switchType(st, row, detected, raw) {
  if (!isCell(detected.value)) { toText(st, row, String(raw)); return; }
  const misfit = st.values.some((v, r) => r !== row && !fitsType(detected.type, v));
  if (misfit) { toText(st, row, String(raw)); return; }
  st.type = detected.type;
  put(st, row, detected.value);
  if (detected.type === 'currency' && !st.format.decimals) st.format.decimals = 2;
  if (detected.type === 'percent' && !st.format.decimals) st.format.decimals = 1;
  reinferRoleAfterRetype(st);
}

/**
 * Eine automatische Rolle `categorical` zurücknehmen, sobald die eingegebenen
 * Werte etwas anderes sagen (wie `DataGrid._reinferAutoRole`): ein Typwechsel
 * beim Tippen leitet die Rolle aus dem ersten Wert ab (ein Wert → kategorial),
 * und das blieb sonst stehen. Nur diese Richtung; manuelle Rollen bleiben.
 * @param {Work} st
 */
function withdrawAutoCategorical(st) {
  if (st.roleManual || st.role !== 'categorical') return;
  st.role = inferRole(st);
}

/**
 * Ein Eingabewert in eine Zelle, mit Typerkennung wie `DataGrid.setCellValue`.
 * @param {Work} st @param {number} row @param {any} value
 */
function enterValue(st, row, value) {
  if (value === '' || value == null) { put(st, row, null); return; }
  if (st.type === 'binary') { put(st, row, parseCellInput(st, value)); return; }
  const detected = detectInputType(value);
  const dt = detected ? detected.type : null;
  if (isNumericType(st.type)) {
    if (detected && dt !== st.type && dt !== 'numeric') { switchType(st, row, detected, value); return; }
    // Unendlich (`1e400`) ist kein Zellwert: die Eingabe bleibt als Text erhalten.
    if (detected) {
      if (isCell(detected.value)) put(st, row, detected.value);
      else toText(st, row, String(value));
      return;
    }
    const parsed = parseCellInput(st, value);
    if (typeof parsed === 'number' && Number.isFinite(parsed)) put(st, row, parsed);
    else toText(st, row, String(value));
    return;
  }
  if (st.type === 'text') {
    const others = st.nonNull - (st.values[row] != null ? 1 : 0);
    if (others === 0 && detected && dt !== 'numeric') { switchType(st, row, detected, value); return; }
    put(st, row, parseCellInput(st, value));
    return;
  }
  if (detected && dt !== st.type) { switchType(st, row, detected, value); return; }
  put(st, row, parseCellInput(st, value));
}

/**
 * Ein Wert für eine Zielspalte (Ausfüllen): passt er nicht zum Typ, wird er
 * umgerechnet wie bei der Eingabe, sonst `null` (auch Unendlich: das Ausfüllen
 * ändert den Spaltentyp nicht, anders als die Eingabe, die dann Text wird).
 * @param {string} type @param {any} v @returns {any}
 */
function coerce(type, v) {
  if (!isCell(v)) return null;
  if (fitsType(type, v)) return v;
  if (isNumericType(type) && type !== 'binary') {
    const n = parseNumeric(String(v));
    return n !== null && Number.isFinite(n) ? n : null;
  }
  if (type === 'binary') return parseCellInput({ type }, v);
  return null;
}

// ─── writeColumns (Gründe aus worksheet.js) ──────────────────────

/**
 * Prüft alle Einträge eines Schreibauftrags, bevor etwas geschrieben wird
 * (`checkWriteColumns`, worksheet.js), dazu Zellwerte und Format.
 * @param {any} columns die Einträge @param {any[]} existing die Spaltenköpfe des Zielblatts
 * @throws {Error} `unknown_type: <typ>`, `unknown_column: <id>` oder bei falscher Form eines Eintrags
 */
function checkWriteColumns(columns, existing) {
  if (!Array.isArray(columns)) throw new Error('columns must be an array');
  const ids = new Set(existing.map((c) => c.id));
  columns.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') throw new Error(`columns[${i}] must be an object`);
    if (typeof entry.to !== 'string' || entry.to === '') {
      throw new Error(`columns[${i}].to must be 'append', 'start' or a column id`);
    }
    if (!Array.isArray(entry.values)) throw new Error(`columns[${i}].values must be an array`);
    if (entry.name !== undefined && typeof entry.name !== 'string') throw new Error(`columns[${i}].name must be a string`);
    if (entry.format !== undefined && (entry.format === null || typeof entry.format !== 'object')) {
      throw new Error(`columns[${i}].format must be an object`);
    }
    if (entry.unit !== undefined && typeof entry.unit !== 'string') throw new Error(`columns[${i}].unit must be a string`);
    if (entry.type !== undefined && !Object.hasOwn(COLUMN_TYPES, entry.type)) {
      throw new Error(`unknown_type: ${entry.type}`);
    }
    if (entry.to !== 'append' && entry.to !== 'start' && !ids.has(entry.to)) {
      throw new Error(`unknown_column: ${entry.to}`);
    }
    entry.values.forEach((/** @type {any} */ v, /** @type {number} */ j) => {
      if (!isCell(v) && v !== undefined && typeof v !== 'number') {
        throw new Error(`columns[${i}].values[${j}] must be a number, text, true/false or null`);
      }
    });
    if (entry.format !== undefined) checkValue(COLUMN_SHAPE.format, `columns[${i}].format`, entry.format);
  });
}

/**
 * Ist die Spalte leer und unbenannt — ein Ziel für `to: 'start'`?
 * @param {any} sheet @param {number} i @returns {boolean}
 */
function isBlankColumn(sheet, i) {
  const head = sheet.columns[i];
  if (head.name) return false;
  const byRow = sheet.formulas[head.id];
  if (byRow && Object.keys(byRow).length) return false;
  return sheet.data.columns[i].every((/** @type {any} */ v) => v === null || v === '');
}

/**
 * Typ, Format und Rolle eines Kopfs nach geänderten Werten neu erkennen (wie
 * das Einfügen): `head` wird verändert, geliefert werden die Werte, bei
 * erkanntem Typ in dessen Form.
 * @param {any} head @param {any[]} values @returns {any[]}
 */
function retypeHead(head, values) {
  let out = values;
  const detected = detectColumnType(values, { format: head.format });
  if (detected) {
    head.type = detected.type;
    head.format = detected.format;
    out = detected.values.map((/** @type {any} */ v) => (isCell(v) ? v : null));
  }
  const col = { ...head, values: out };
  reinferRoleAfterRetype(col);
  head.role = col.role;
  head.roleManual = col.roleManual;
  return out;
}

/**
 * Wie `retypeHead`, aber für das Verschieben (Ruling F1): der Typ bleibt, solange
 * er alle Werte hält; neu erkannt wird nur, wenn er es nicht mehr kann. Dabei
 * geht kein Wert verloren (sonst wird die Spalte Text), und ein Zahlentyp wie
 * Währung oder Prozent fällt nicht auf schlichte Zahl zurück.
 * @param {any} head @param {any[]} values @returns {any[]}
 */
function retypeMovedHead(head, values) {
  let out = values;
  if (!values.every((v) => fitsType(head.type, v))) {
    const detected = detectColumnType(values, { format: head.format });
    const lost = detected && values.some((v, i) => isCell(v) && !isCell(detected.values[i]));
    if (!detected || lost) {
      head.type = 'text';
      out = values.map((v) => (isCell(v) ? String(v) : null));
    } else {
      const keep = detected.type === 'numeric' && isNumericType(head.type) && head.type !== 'binary';
      if (!keep) {
        head.type = detected.type;
        head.format = detected.format;
      }
      out = detected.values.map((/** @type {any} */ v) => (isCell(v) ? v : null));
    }
  }
  const col = { ...head, values: out };
  reinferRoleAfterRetype(col);
  head.role = col.role;
  head.roleManual = col.roleManual;
  return out;
}

// ─── Bereiche ────────────────────────────────────────────────────

/**
 * Ein Rechteck im Blatt prüfen: `c0 ≤ c1` in den Spalten, `r0 ≤ r1` bis `maxRow`.
 * @param {string} prefix Name in der Meldung (`''` oder `'source.'`)
 * @param {{ c0: number, r0: number, c1: number, r1: number }} r
 * @param {number} cols @param {number} rows
 */
function requireRect(prefix, r, cols, rows) {
  requireIndex(`${prefix}c0`, r.c0, cols, { existing: true });
  requireIndex(`${prefix}r0`, r.r0, rows, { existing: true });
  requireRange(`${prefix}c1`, r.c1, r.c0, cols - 1);
  requireRange(`${prefix}r1`, r.r1, r.r0, rows - 1);
}

/**
 * Eine ganze Zahl in `min..max`.
 * @param {string} name @param {number} v @param {number} min @param {number} max
 */
function requireRange(name, v, min, max) {
  requireForm(name, v, Number.isInteger(v) && v >= min && v <= max, `${min}..${max}`);
}

// ─── Kommandos ───────────────────────────────────────────────────

export const cellCommands = {
  /**
   * Werte in eine Spalte ab `startRow` schreiben, mit Typerkennung wie die
   * Zelleingabe. Ein einfacher Wert über einer Formelzelle löscht die Formel.
   * Über das Blattende hinaus wächst das Blatt.
   * @agent
   */
  setCells: command({
    params: { sheetId: text(), columnId: text(), startRow: number({ integer: true, min: 0 }), values: list(cell()) },
    returns: number({ integer: true }),
    run({ sheetId, columnId, startRow, values }) {
      const sheet = sheetOf(this, sheetId);
      const ci = columnIndex(sheet, columnId);
      const head = sheet.columns[ci];
      requireUnlocked(head);
      if (values.length === 0) return 0;
      const rows = Math.max(sheet.data.rowCount, startRow + values.length);
      const cur = sheet.data.columns[ci];
      const work = padded(cur, rows);
      /** @type {Work} */
      const st = {
        type: head.type, format: { ...head.format }, role: head.role, roleManual: head.roleManual,
        values: work, nonNull: work.reduce((n, v) => n + (v != null ? 1 : 0), 0),
      };
      values.forEach((v, k) => enterValue(st, startRow + k, v));
      withdrawAutoCategorical(st);
      /** @type {ColumnChange} */ const entry = { index: ci };
      if (st.type !== head.type || JSON.stringify(st.format) !== JSON.stringify(head.format)
        || st.role !== head.role || st.roleManual !== head.roleManual) {
        entry.head = { ...copyHead(head), type: st.type, format: st.format, role: st.role, roleManual: st.roleManual };
      }
      const run = changedRun(cur, st.values);
      if (run) Object.assign(entry, run);
      const fs = clearFormulasIn(sheet.formulas[head.id], startRow, startRow + values.length - 1);
      if (fs) entry.formulas = fs;
      commit(this, sheet, { rowCount: rows, columnCount: sheet.columns.length, cols: entry.head || run || fs ? [entry] : [] });
      return values.length;
    },
  }),

  /**
   * Eine Formel in eine Zelle schreiben, wie der Formel-Editor; `row` gleich
   * der Zeilenzahl hängt eine Zeile an. Liefert den berechneten Wert und den
   * Fehlercode (sonst `null`).
   * @agent
   */
  setFormula: command({
    params: { sheetId: text(), columnId: text(), row: number(), formula: text() },
    returns: object({ value: cell(), error: text({ nullable: true }) }),
    run({ sheetId, columnId, row, formula }) {
      const sheet = sheetOf(this, sheetId);
      const ci = columnIndex(sheet, columnId);
      requireUnlocked(sheet.columns[ci]);
      requireIndex('row', row, sheet.data.rowCount);
      if (!isFormula(formula)) {
        throw new Error(`invalid formula ${JSON.stringify(formula)}; allowed: a text starting with "="`);
      }
      const f = formula.trim();
      let error = null;
      commit(this, sheet, {
        rowCount: Math.max(sheet.data.rowCount, row + 1),
        columnCount: sheet.columns.length,
        cols: [{ index: ci, start: row, values: [null], formulas: { [row]: f } }],
      }, (c, r, e) => { if (c === ci && r === row) error = e; });
      return { value: sheet.data.columns[ci][row] ?? null, error: error ?? null };
    },
  }),

  /**
   * Mehrere Spalten in einem Schritt schreiben: anhängen, leere Startspalten
   * (C1–C5) füllen oder bestehende überschreiben (Formeln fallen weg, der
   * Name bleibt). Alles wird zuerst geprüft.
   * @agent
   */
  writeColumns: command({
    params: {
      sheetId: text(),
      columns: unchecked({ type: 'Array<{ to: string, values: Array<number|string|boolean|null>, name?: string, type?: string, format?: object, unit?: string, discrete?: boolean }>' }),
    },
    returns: list(text()),
    run({ sheetId, columns }) {
      const sheet = sheetOf(this, sheetId);
      checkWriteColumns(columns, sheet.columns);
      const heads = sheet.columns;
      let rows = sheet.data.rowCount;
      /** @type {Map<number, { head: any, values: any[] }>} */ const written = new Map();
      /** @type {{ head: any, values: any[] }[]} */ const appended = [];
      /** @type {string[]} */ const ids = [];
      const used = new Set();
      for (const entry of columns) {
        // Ruling R11: NaN, ±Infinity und undefined (etwa `Math.log(0)` aus einer Umrechnung) werden leer.
        const values = entry.values.map((/** @type {any} */ v) => (isCell(v) ? v : null));
        let idx = -1;
        if (entry.to === 'start') {
          const n = Math.min(START_COLUMNS, heads.length);
          for (let i = 0; i < n && idx < 0; i++) if (!used.has(i) && !written.has(i) && isBlankColumn(sheet, i)) idx = i;
        } else if (entry.to !== 'append') {
          idx = heads.findIndex((/** @type {{ id: string }} */ c) => c.id === entry.to);
        }
        let head;
        if (idx < 0) {
          const type = entry.type ?? 'numeric';
          head = {
            id: uid(), name: entry.name ?? '', shortName: '', type, unit: entry.unit ?? null, role: null, roleManual: false,
            format: entry.format !== undefined ? JSON.parse(JSON.stringify(entry.format)) : defaultColumnFormat(type, entry.discrete),
            meta: null,
          };
          head.role = inferRole({ type, values });
          appended.push({ head, values });
          idx = heads.length + appended.length - 1;
        } else {
          head = written.get(idx)?.head ?? copyHead(heads[idx]);
          if (entry.to === 'start' && entry.name) head.name = entry.name;
          const next = retypeForWrite(entry);
          if (next) { head.type = next.type; head.format = next.format; }
          if (entry.unit !== undefined) head.unit = entry.unit;
          if (next) {
            const col = { ...head, values };
            reinferRoleAfterRetype(col);
            head.role = col.role;
            head.roleManual = col.roleManual;
          }
          written.set(idx, { head, values });
        }
        used.add(idx);
        rows = Math.max(rows, values.length);
        ids.push(head.id);
      }
      /** @type {ColumnChange[]} */ const cols = [];
      for (const [i, { head, values }] of written) {
        const run = changedRun(sheet.data.columns[i], padded(values, rows));
        const byRow = sheet.formulas[heads[i].id];
        const fs = byRow ? Object.fromEntries(Object.keys(byRow).map((k) => [k, null])) : null;
        cols.push({ index: i, head, ...(run ?? {}), ...(fs ? { formulas: fs } : {}) });
      }
      appended.forEach(({ head, values }, k) => {
        head.shortName = `C${heads.length + k + 1}`;
        cols.push({ index: heads.length + k, head, start: 0, values: padded(values, rows) });
      });
      for (const e of cols) checkValue(HEAD_SPEC, 'column', e.head);
      commit(this, sheet, { rowCount: rows, columnCount: heads.length + appended.length, cols });
      return ids;
    },
  }),

  /**
   * Den Inhalt des Blatts durch CSV-Daten ersetzen (Kopfzeile erkannt, Typen
   * je Spalte). Formeln des Blatts fallen weg; die Spalten bekommen neue ids.
   * @agent
   */
  importCsv: command({
    params: { sheetId: text(), csvText: text() },
    returns: object({ columns: number(), rows: number() }),
    run({ sheetId, csvText }) {
      const sheet = sheetOf(this, sheetId);
      let parsed;
      try {
        parsed = parseCsvText(csvText, { hasHeader: 'auto' }).sheets[0];
      } catch (e) {
        if (e && /** @type {any} */ (e).code === 'errCsvEmpty') return { columns: 0, rows: 0 };
        throw e;
      }
      const rows = parsed.columns.reduce((n, c) => Math.max(n, c.values.length), 0);
      const oldCols = sheet.columns.length;
      const cols = parsed.columns.map((c, i) => {
        const values = padded(c.values.map((v) => (isCell(v) ? v : null)), rows);
        const type = c.values.every((v) => v === null) ? 'numeric' : c.type;
        const head = {
          id: uid(), name: c.name ?? '', shortName: c.shortName || `C${i + 1}`, type, unit: null,
          role: inferRole({ type, values }), roleManual: false, format: { ...(c.format ?? {}) }, meta: null,
        };
        checkValue(HEAD_SPEC, `columns[${i}]`, head);
        /** @type {ColumnChange} */ const e = { index: i, head, start: 0, values };
        if (i < oldCols) {
          const fs = clearFormulasIn(sheet.formulas[sheet.columns[i].id], 0, rows - 1);
          if (fs) e.formulas = fs;
        }
        return e;
      });
      commit(this, sheet, { rowCount: rows, columnCount: cols.length, cols });
      return { columns: cols.length, rows: parsed.rowCount };
    },
  }),

  /**
   * Einen Block aus der Zwischenablage ab einer Zelle einfügen, wie das
   * Raster: Kopfzeile benennt unbenannte Spalten, Typerkennung je Spalte,
   * fehlende Zeilen und Spalten kommen dazu. Gesperrte Spalten bleiben
   * unverändert wie bei `fillRange`; die übrigen werden geschrieben. Trifft
   * der Block nur gesperrte Spalten, wirft es. Liefert die Zahl geschriebener
   * Spalten und der Zeilen ohne Kopfzeile.
   *
   * `header`: fehlt es, wird geraten (erste Zeile Kopf, wenn jede Zelle nicht
   * leer und keine Zahl ist und die zweite Zeile eine Zahl enthält); `false`
   * nimmt alle Zeilen als Daten, `true` die erste Zeile als Kopf.
   * @agent
   */
  pasteBlock: command({
    params: {
      sheetId: text(), columnId: text(), startRow: number(), rows: list(list(text())), header: boolean({ optional: true }),
    },
    returns: object({ columns: number(), rows: number() }),
    run({ sheetId, columnId, startRow, rows, header: asHeader }) {
      const sheet = sheetOf(this, sheetId);
      const ci = columnIndex(sheet, columnId);
      requireIndex('startRow', startRow, sheet.data.rowCount);
      if (rows.length === 0) return { columns: 0, rows: 0 };
      const { header, rows: valueRows } = asHeader === undefined ? splitHeader(rows)
        : asHeader ? { header: rows[0], rows: rows.slice(1) } : { header: null, rows };
      const width = Math.max(...rows.map((r) => r.length));
      const heads = sheet.columns;
      const isLocked = (/** @type {number} */ i) => i < heads.length && Boolean(heads[i].meta?.lock);
      let free = 0;
      for (let k = 0; k < width; k++) if (!isLocked(ci + k)) free++;
      if (free === 0) requireUnlocked(heads[ci]);
      const rowCount = Math.max(sheet.data.rowCount, startRow + valueRows.length);
      const columnCount = Math.max(heads.length, ci + width);
      const names = heads.map((/** @type {{ name: string }} */ h) => h.name);
      const unique = (/** @type {string} */ name, /** @type {number} */ self) => {
        if (!name) return name;
        const others = names.filter((n, i) => i !== self && n);
        if (!others.includes(name)) return name;
        let n = 2;
        while (others.includes(`${name} (${n})`)) n++;
        return `${name} (${n})`;
      };
      /** @type {ColumnChange[]} */ const cols = [];
      for (let k = 0; k < width; k++) {
        const i = ci + k;
        if (isLocked(i)) continue;
        const existed = i < heads.length;
        const head = existed ? copyHead(heads[i]) : {
          id: uid(), name: '', shortName: `C${i + 1}`, type: 'numeric', unit: null,
          role: defaultRoleForType('numeric'), roleManual: false, format: {}, meta: null,
        };
        if (!existed) names[i] = '';
        const cur = existed ? sheet.data.columns[i] : [];
        let values = padded(cur, rowCount);
        valueRows.forEach((r, ri) => { values[startRow + ri] = (r[k] || '').trim() || null; });
        if (header && header[k] && !head.name) {
          head.name = unique(header[k].trim(), i);
          names[i] = head.name;
        }
        values = retypeHead(head, values);
        /** @type {ColumnChange} */ const e = { index: i, head };
        if (existed) {
          const run = changedRun(cur, values);
          if (run) Object.assign(e, run);
          const fs = clearFormulasIn(sheet.formulas[heads[i].id], startRow, startRow + valueRows.length - 1);
          if (fs) e.formulas = fs;
        } else {
          Object.assign(e, { start: 0, values });
        }
        cols.push(e);
      }
      commit(this, sheet, { rowCount, columnCount, cols });
      return { columns: free, rows: valueRows.length };
    },
  }),

  /**
   * Einen Bereich mit dem Ausfüllgriff fortsetzen: `target` umfasst `source`
   * und verlängert ihn in eine Richtung. Reihen, Kopien (mit `ctrl` die
   * andere Art) und Formeln mit verschobenen Bezügen; gesperrte Spalten
   * bleiben unverändert. Liefert die Zahl geschriebener Zellen.
   * @agent
   */
  fillRange: command({
    params: {
      sheetId: text(),
      source: object({
        c0: number({ integer: true, min: 0 }), r0: number({ integer: true, min: 0 }),
        c1: number({ integer: true, min: 0 }), r1: number({ integer: true, min: 0 }),
      }),
      target: object({
        c0: number({ integer: true, min: 0 }), r0: number({ integer: true, min: 0 }),
        c1: number({ integer: true, min: 0 }), r1: number({ integer: true, min: 0 }),
      }),
      ctrl: boolean({ optional: true }),
    },
    returns: number({ integer: true }),
    run({ sheetId, source: s, target: t, ctrl = false }) {
      const sheet = sheetOf(this, sheetId);
      const heads = sheet.columns;
      const numCols = heads.length;
      requireRect('source.', s, numCols, sheet.data.rowCount);
      const inside = t.c0 <= s.c0 && t.c1 >= s.c1 && t.r0 <= s.r0 && t.r1 >= s.r1 && t.c1 < numCols
        && t.r1 < sheet.data.rowCount + MAX_FILL_GROWTH;
      const growsRows = t.r0 !== s.r0 || t.r1 !== s.r1;
      const growsCols = t.c0 !== s.c0 || t.c1 !== s.c1;
      const oneSide = !(t.r0 < s.r0 && t.r1 > s.r1) && !(t.c0 < s.c0 && t.c1 > s.c1);
      requireForm('target', t, inside && oneSide && !(growsRows && growsCols),
        `a rectangle inside the sheet columns that contains source and extends it in one direction, at most ${MAX_FILL_GROWTH} rows past the last row`);
      if (!growsRows && !growsCols) return 0;
      /** @param {number} c @param {number} r */
      const srcCell = (c, r) => ({ value: sheet.data.columns[c][r], formula: sheet.formulas[heads[c].id]?.[r] ?? null });
      /** @type {ColumnChange[]} */ const cols = [];
      let written = 0;
      let rowCount = sheet.data.rowCount;
      if (growsRows) {
        const dir = t.r1 > s.r1 ? 1 : -1;
        const count = dir === 1 ? t.r1 - s.r1 : s.r0 - t.r0;
        for (let c = s.c0; c <= s.c1; c++) {
          if (heads[c].meta?.lock) continue;
          const src = [];
          for (let r = s.r0; r <= s.r1; r++) src.push(srcCell(c, r));
          const [filled] = fillBlock([src], heads[c].type, count, dir, ctrl, { axis: 'v', before: s.r0, maxCols: numCols });
          if (!filled.length) continue;
          const ordered = dir === 1 ? filled : [...filled].reverse();
          const start = dir === 1 ? s.r1 + 1 : s.r0 - filled.length;
          /** @type {Record<string, string|null>} */ const formulas = {};
          const values = ordered.map((f, k) => {
            formulas[start + k] = f.formula;
            return f.formula ? null : coerce(heads[c].type, f.value);
          });
          cols.push({ index: c, start, values, formulas });
          written += values.length;
          rowCount = Math.max(rowCount, start + values.length);
        }
      } else {
        const dir = t.c1 > s.c1 ? 1 : -1;
        const count = dir === 1 ? t.c1 - s.c1 : s.c0 - t.c0;
        /** @type {Map<number, { values: any[], formulas: Record<string, string|null> }>} */ const byCol = new Map();
        const height = s.r1 - s.r0 + 1;
        for (let r = s.r0; r <= s.r1; r++) {
          const src = [];
          for (let c = s.c0; c <= s.c1; c++) src.push(srcCell(c, r));
          const [filled] = fillBlock([src], heads[s.c0].type, count, dir, ctrl, {
            axis: 'h', before: s.c0, after: numCols - 1 - s.c1, maxCols: numCols,
          });
          filled.forEach((f, k) => {
            const c = dir === 1 ? s.c1 + 1 + k : s.c0 - 1 - k;
            if (heads[c].meta?.lock) return;
            if (!byCol.has(c)) byCol.set(c, { values: new Array(height).fill(null), formulas: {} });
            const slot = /** @type {{ values: any[], formulas: Record<string, string|null> }} */ (byCol.get(c));
            slot.values[r - s.r0] = f.formula ? null : coerce(heads[c].type, f.value);
            slot.formulas[r] = f.formula;
            written++;
          });
        }
        for (const [c, { values, formulas }] of byCol) cols.push({ index: c, start: s.r0, values, formulas });
      }
      if (written === 0) return 0;
      commit(this, sheet, { rowCount, columnCount: numCols, cols });
      return written;
    },
  }),

  /**
   * Einen Zellblock verschieben, wie das Raster beim Ziehen am Rand: Werte und
   * Formeln wandern, die Quelle wird leer, was das Ziel hielt, ist
   * überschrieben. Bezüge auf verschobene Zellen folgen ihnen; ein Bezug auf
   * eine überschriebene Zelle wird `#REF!`. Das Ziel wird in das Blatt
   * geklemmt (das Blatt wächst nicht); ist es gleich der Quelle, passiert
   * nichts. Eine gesperrte Spalte in Quelle oder Ziel verweigert alles.
   * Liefert den Zielblock (nullbasiert) oder `null`, wenn nichts geschah.
   * @agent
   */
  moveCells: command({
    params: {
      sheetId: text(),
      source: object({
        c0: number({ integer: true, min: 0 }), r0: number({ integer: true, min: 0 }),
        c1: number({ integer: true, min: 0 }), r1: number({ integer: true, min: 0 }),
      }),
      toCol: number({ integer: true, min: 0 }),
      toRow: number({ integer: true, min: 0 }),
    },
    returns: object({
      c0: number({ integer: true, min: 0 }), r0: number({ integer: true, min: 0 }),
      c1: number({ integer: true, min: 0 }), r1: number({ integer: true, min: 0 }),
    }, { nullable: true }),
    run({ sheetId, source: raw, toCol, toRow }) {
      const sheet = sheetOf(this, sheetId);
      const heads = sheet.columns;
      const rows = sheet.data.rowCount;
      const s = {
        c0: Math.min(raw.c0, raw.c1), r0: Math.min(raw.r0, raw.r1),
        c1: Math.max(raw.c0, raw.c1), r1: Math.max(raw.r0, raw.r1),
      };
      requireRect('source.', s, heads.length, rows);
      const w = s.c1 - s.c0 + 1;
      const h = s.r1 - s.r0 + 1;
      const tc = Math.min(Math.max(toCol, 0), heads.length - w);
      const tr = Math.min(Math.max(toRow, 0), rows - h);
      if (tc === s.c0 && tr === s.r0) return null;
      const dCol = tc - s.c0;
      const dRow = tr - s.r0;
      const tgt = { c0: tc, r0: tr, c1: tc + w - 1, r1: tr + h - 1 };
      for (let c = s.c0; c <= s.c1; c++) requireUnlocked(heads[c]);
      for (let c = tgt.c0; c <= tgt.c1; c++) requireUnlocked(heads[c]);

      const colName = (/** @type {number} */ n) => heads[n - 1]?.name || null;
      const colIndex = (/** @type {string} */ name) => {
        const i = heads.findIndex((/** @type {{ name: string }} */ x) => x.name === name);
        return i < 0 ? null : i + 1;
      };
      const rewrite = (/** @type {string} */ f) => moveCellRefs(f, {
        src: { c1: s.c0 + 1, c2: s.c1 + 1, r1: s.r0 + 1, r2: s.r1 + 1 }, dCol, dRow, colName, colIndex,
      });
      const inRect = (/** @type {any} */ b, /** @type {number} */ c, /** @type {number} */ r) => c >= b.c0 && c <= b.c1 && r >= b.r0 && r <= b.r1;

      // Quellzellen zuerst lesen (Quelle und Ziel dürfen sich überlappen).
      const moved = [];
      for (let c = s.c0; c <= s.c1; c++) {
        for (let r = s.r0; r <= s.r1; r++) {
          const f = sheet.formulas[heads[c].id]?.[r] ?? null;
          moved.push({ c: c + dCol, r: r + dRow, value: f ? null : sheet.data.columns[c][r], formula: f ? rewrite(f) : null });
        }
      }

      const r0 = Math.min(s.r0, tr);
      const r1 = Math.max(s.r1, tgt.r1);
      /** @type {Map<number, ColumnChange>} */ const byCol = new Map();
      const entry = (/** @type {number} */ c) => {
        if (!byCol.has(c)) byCol.set(c, { index: c, formulas: {} });
        return /** @type {ColumnChange} */ (byCol.get(c));
      };
      /** @type {number[]} */ const touched = [];
      for (let c = s.c0; c <= s.c1; c++) touched.push(c);
      for (let c = tgt.c0; c <= tgt.c1; c++) if (!touched.includes(c)) touched.push(c);

      // Formeln aller anderen Zellen: Bezüge folgen oder werden #REF!.
      for (let c = 0; c < heads.length; c++) {
        const byRow = sheet.formulas[heads[c].id];
        if (!byRow) continue;
        for (const [key, f] of Object.entries(byRow)) {
          const r = Number(key);
          if (inRect(s, c, r) || inRect(tgt, c, r)) continue;
          const next = rewrite(f);
          if (next !== f) /** @type {Record<string, string|null>} */ (entry(c).formulas)[key] = next;
        }
      }

      for (const c of touched) {
        const cur = sheet.data.columns[c];
        const e = entry(c);
        const fs = /** @type {Record<string, string|null>} */ (e.formulas);
        let values = cur.slice();
        for (let r = r0; r <= r1; r++) {
          if (inRect(s, c, r) || inRect(tgt, c, r)) {
            values[r] = null;
            if (sheet.formulas[heads[c].id]?.[r]) fs[r] = null;
          }
        }
        for (const m of moved) {
          if (m.c !== c) continue;
          values[m.r] = m.value;
          // Nur wo eine Formel hinkommt; eine alte am Ziel ist oben schon geleert.
          if (m.formula) fs[m.r] = m.formula;
        }
        // Unveränderte Spalten bleiben, wie sie sind (kein leerer Verlaufsschritt).
        if (!changedRun(cur, values)) continue;
        const head = copyHead(heads[c]);
        values = retypeMovedHead(head, values);
        if (JSON.stringify(head) !== JSON.stringify(heads[c])) e.head = head;
        const run = changedRun(cur, values);
        if (run) Object.assign(e, run);
      }

      const cols = [...byCol.values()].map((e) => {
        if (!Object.keys(/** @type {object} */ (e.formulas)).length) delete e.formulas;
        return e;
      }).filter((e) => e.head || e.values || e.formulas).sort((a, b) => a.index - b.index);
      commit(this, sheet, { rowCount: rows, columnCount: heads.length, cols });
      return tgt;
    },
  }),

  /**
   * Werte und Formeln eines Bereichs leeren, wie Entf im Raster. Gesperrte
   * Spalten bleiben unverändert. Liefert die Zahl geleerter Zellen.
   * @agent
   */
  clearRange: command({
    params: {
      sheetId: text(),
      c0: number({ integer: true, min: 0 }), r0: number({ integer: true, min: 0 }),
      c1: number({ integer: true, min: 0 }), r1: number({ integer: true, min: 0 }),
    },
    returns: number({ integer: true }),
    run({ sheetId, c0, r0, c1, r1 }) {
      const sheet = sheetOf(this, sheetId);
      requireRect('', { c0, r0, c1, r1 }, sheet.columns.length, sheet.data.rowCount);
      /** @type {ColumnChange[]} */ const cols = [];
      let cleared = 0;
      for (let c = c0; c <= c1; c++) {
        const head = sheet.columns[c];
        if (head.meta?.lock) continue;
        const cur = sheet.data.columns[c];
        const next = cur.slice(r0, r1 + 1).fill(null);
        const run = changedRun(cur.slice(r0, r1 + 1), next);
        const fs = clearFormulasIn(sheet.formulas[head.id], r0, r1);
        for (let r = r0; r <= r1; r++) if (cur[r] !== null || fs?.[r] === null) cleared++;
        if (run || fs) cols.push({ index: c, ...(run ? { start: r0 + run.start, values: run.values } : {}), ...(fs ? { formulas: fs } : {}) });
      }
      commit(this, sheet, { rowCount: sheet.data.rowCount, columnCount: sheet.columns.length, cols });
      return cleared;
    },
  }),

  /**
   * @noagent Nur Umkehrung: schreibt eine Änderung (`Change`) zurück, die ein
   * Zellkommando als Gegenänderung gesammelt hat. Die Parameter tragen
   * `agentWrite: false`, darum steht das Kommando nicht in der Agentenfläche.
   */
  restoreCells: command({
    params: {
      sheetId: text(),
      rowCount: number({ integer: true, min: 0, agentWrite: false }),
      columnCount: number({ integer: true, min: 0, agentWrite: false }),
      cols: list(object({
        index: number({ integer: true, min: 0 }),
        head: object(COLUMN_SHAPE, { optional: true }),
        start: number({ integer: true, min: 0, optional: true }),
        values: list(cell(), { optional: true }),
        formulas: map(text(), text({ nullable: true }), { optional: true }),
      }), { agentWrite: false }),
    },
    run({ sheetId, rowCount, columnCount, cols }) {
      const sheet = sheetOf(this, sheetId);
      for (let c = sheet.columns.length; c < columnCount; c++) {
        requireForm(`cols (column ${c})`, cols, cols.some((e) => e.index === c && e.head), 'a head for every new column');
      }
      cols.forEach((e, k) => {
        requireRange(`cols[${k}].index`, e.index, 0, columnCount - 1);
        requireRange(`cols[${k}].values`, (e.start ?? 0) + (e.values?.length ?? 0), 0, rowCount);
        for (const key of Object.keys(e.formulas ?? {})) requireRange(`cols[${k}].formulas row`, Number(key), 0, rowCount - 1);
      });
      commit(this, sheet, { rowCount, columnCount, cols });
    },
  }),
};
