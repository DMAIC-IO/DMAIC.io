/**
 * D.Mike — Arbeitsblatt: Lesefläche (domain/read.js)
 *
 * Die Lesefläche des Arbeitsblatts (`AgentRead`, Felder `READ_FIELDS`) als
 * reine Projektion über die Blätter der Zielform:
 * - `readWorksheetModel(model, options)` über das Model (eingehängt
 *   `vm.read`, ohne Mount `readDetached`; Haken `read` in `createModule`),
 * - `readWorksheetStored(saved, options)` über einen gespeicherten Stand der
 *   Version 1.0, ohne ein Model zu bauen (Haken `readStored`, `core/instances.js`).
 * Beide teilen den Abzug `worksheetSheetsSnapshot`: Model und Stand haben
 * `{ id, name, columns, formulas, data: { rowCount, columns } }`, das Model
 * mit `TableData`, der Stand in schlichter Form.
 *
 * Kosten: Spaltenwerte nur für `options.columns` (je eine Kopie), Zeilen und
 * Formel-Einträge nur auf Nachfrage (`fields`). Die übrigen Spalten werden
 * nicht angefasst.
 *
 * Rein: kein DOM, kein i18n.
 */
import { requireKnownId } from '../../../core/agent/agent-argcheck.js';
import { projectReadState } from '../../../core/agent/agent-read.js';
import { inferRole } from '../../../core/datagrid/datagrid-roles.js';
import { FORMAT_KEYS } from './columns.js';

/**
 * Der Spaltenkopf einer Spalte (ohne Zellwerte), wie in `AgentRead.columns`.
 * Gilt für Altform und Zielform: die Felder heißen gleich.
 * `valueCount` zählt die Zellen ungleich `null` bis `rowCount` (fehlend =
 * `null`), O(Zeilen) ohne Kopie.
 * @param {any} c Spaltenkopf
 * @param {any[]} [cells] Zellwerte der Spalte
 * @param {number} [rowCount]
 * @returns {object}
 */
export function headerOf(c, cells, rowCount) {
  return {
    id: c.id,
    name: c.name ?? '',
    shortName: c.shortName ?? '',
    type: c.type ?? 'numeric',
    unit: c.unit ?? null,
    // Wie `DataGrid.setState`: eine Spalte ohne Rolle bekommt die abgeleitete.
    role: c.role ?? inferRole(c),
    // Dieselbe Quelle wie chart-suggestion `selection.columns[].roleConfirmed`.
    roleConfirmed: c.roleManual === true,
    // Nur die Schlüssel, die die Oberfläche setzt; eine Kopie, damit der
    // Leser kein lebendes Format-Objekt hält.
    format: Object.fromEntries(FORMAT_KEYS
      .filter(k => c.format?.[k] != null)
      .map(k => [k, c.format[k]])),
    meta: c.meta ? JSON.parse(JSON.stringify(c.meta)) : null,
    valueCount: countFilled(cells, rowCount),
  };
}

/**
 * Zahl der Zellen ungleich `null` in den ersten `rowCount` Einträgen.
 * @param {any[]|undefined} cells
 * @param {number|undefined} rowCount
 * @returns {number}
 */
function countFilled(cells, rowCount) {
  if (!Array.isArray(cells)) return 0;
  const n = rowCount > 0 ? Math.min(Math.floor(rowCount), cells.length) : 0;
  let count = 0;
  for (let r = 0; r < n; r++) if (cells[r] != null) count++;
  return count;
}

/**
 * Die Zellwerte einer Spalte als eigene Kopie: genau `n` Einträge, fehlende
 * (auch Lücken) als `null`. `slice` statt `Array.from` mit Rückruf: bei
 * 100 000 Zeilen der größte Posten eines Lesens mit `columns`.
 * @param {any[]|undefined} src
 * @param {number} rowCount
 * @returns {any[]}
 */
export function valuesOf(src, rowCount) {
  // Wie `Array.from({ length })`: keine Zahl, negativ oder NaN ergibt 0.
  const n = rowCount > 0 ? Math.floor(rowCount) : 0;
  if (!Array.isArray(src)) return new Array(n).fill(null);
  const out = src.length >= n ? src.slice(0, n) : src.slice();
  out.length = n;
  for (let r = 0; r < n; r++) if (out[r] === undefined) out[r] = null;
  return out;
}

/**
 * Die gewählten Spalten: alle, oder `columns` in dieser Reihenfolge.
 * @param {any[]} heads Spaltenköpfe des Blatts
 * @param {unknown} wanted `options.columns`
 * @returns {number[]} Indizes in `heads`
 * @throws {Error} `columns must be an array of column ids`; `unknown_column: <id>` (`code`)
 */
export function selectColumns(heads, wanted) {
  if (wanted === undefined) return heads.map((_, i) => i);
  if (!Array.isArray(wanted) || wanted.some(id => typeof id !== 'string')) {
    throw new Error('columns must be an array of column ids');
  }
  return wanted.map((id) => {
    const i = heads.findIndex(c => c.id === id);
    if (i === -1) {
      const err = /** @type {Error & { code?: string }} */ (new Error(`unknown_column: ${id}`));
      err.code = 'unknown_column';
      throw err;
    }
    return i;
  });
}

/**
 * Der Abzug der Lesefläche aus den Blättern der Zielform. Form wie
 * `worksheetSnapshot` (F1.14a P3): `sheets`, `sheetId`, `rowCount`,
 * `columns` (mit `values` nur bei `options.columns`), `rows`, `formulas`
 * (beide als Liste nur auf Nachfrage über `fields`, sonst ein leeres Array
 * der richtigen Länge), `rowsColumns`, `formulasColumns`.
 *
 * @param {Array<{ id: string, name: string, columns: any[], formulas: Record<string, Record<string, string>>, data: { rowCount: number, columns: any[][] } }>} sheets
 * @param {{ sheetId?: string, fields?: string[], columns?: string[] }} [options]
 * @returns {object}
 * @throws {Error} unbekannte Blatt-id (wie heute), `unknown_column: <id>`,
 *   `columns must be an array of column ids`
 */
export function worksheetSheetsSnapshot(sheets, options) {
  const sheetId = options?.sheetId;
  if (sheetId !== undefined) requireKnownId('sheetId', sheetId, sheets.map(s => s.id));
  const shown = sheetId === undefined ? sheets[0] : sheets.find(s => s.id === sheetId);
  const all = shown?.columns ?? [];
  const cells = shown?.data.columns ?? [];
  const rowCount = shown?.data.rowCount ?? 0;
  const wanted = options?.columns;
  const picked = selectColumns(all, wanted);

  const heads = picked.map(i => headerOf(all[i], cells[i], rowCount));
  const columns = wanted === undefined
    ? heads
    : heads.map((head, k) => ({ ...head, values: valuesOf(cells[picked[k]], rowCount) }));

  // Zeilen nur auf Nachfrage: der Umfangs-Deskriptor braucht nur die Länge.
  let rows;
  if (options?.fields?.includes('rows')) {
    rows = [];
    const src = picked.map(i => cells[i]);
    for (let r = 0; r < rowCount; r++) rows.push(src.map(col => col?.[r] ?? null));
  } else {
    rows = new Array(rowCount);
  }

  // Welche Zellen GERECHNET sind (dünn besetzt: Spalten-id → Zeile → Formel).
  const byColumn = shown?.formulas ?? {};
  let formulas;
  if (options?.fields?.includes('formulas')) {
    formulas = [];
    for (const i of picked) {
      const id = all[i].id;
      for (const [row, formula] of Object.entries(byColumn[id] ?? {})) {
        if (formula) formulas.push({ columnId: id, row: Number(row), formula });
      }
    }
  } else {
    let count = 0;
    for (const i of picked) {
      for (const formula of Object.values(byColumn[all[i].id] ?? {})) if (formula) count++;
    }
    formulas = new Array(count);
  }

  return {
    sheets: sheets.map(s => ({ id: s.id, name: s.name })),
    sheetId: shown?.id ?? null,
    rowCount,
    columns,
    rows,
    formulas,
    // Schwesterfelder der Umfangs-Deskriptoren (siehe `agent-read.js`).
    rowsColumns: heads,
    formulasColumns: [{ name: 'columnId' }, { name: 'row' }, { name: 'formula' }],
  };
}

/**
 * Die Felder der Lesefläche (`describe` und Projektion). Die Hilfetexte stehen
 * in `resources/i18n/context-help.<lang>.json` unter `fields.<name>.help`.
 * `rows` und `formulas` sind Massenfelder: ohne `fields` nur ihr Umfang.
 * @type {Readonly<Record<string, { type: string, help: string, bulk: boolean, bulkKind?: 'table'|'tree', derived: boolean }>>}
 */
export const READ_FIELDS = Object.freeze({
  sheets: { type: 'Array<{ id: string, name: string }>', help: '', bulk: false, derived: true },
  sheetId: { type: 'string|null', help: '', bulk: false, derived: true },
  rowCount: { type: 'number', help: '', bulk: false, derived: true },
  columns: {
    type: "Array<{ id: string, name: string, shortName: string, type: string, unit: string|null, role: string|null, roleConfirmed: boolean, format: { decimals?: number, dateFormat?: string, timeFormat?: string }, meta: { lock?: 'hard'|'soft', reason?: string, managedBy?: string, managedRef?: string, categoricalCoding?: object }|null, valueCount: number, values?: any[] }>",
    help: '', bulk: false, derived: true,
  },
  rows: { type: 'any[][]', help: '', bulk: true, bulkKind: 'table', derived: true },
  formulas: { type: 'Array<{ columnId: string, row: number, formula: string }>', help: '', bulk: true, bulkKind: 'table', derived: true },
});

/**
 * Einen Abzug durch `READ_FIELDS` projizieren. Mit `columns` bekommt die
 * Projektion nur die Köpfe: die `values` des Abzugs sind schon eigene Kopien,
 * sie klonte sonst ein zweites Mal samt aller Zellwerte. Die Werte kommen
 * danach an dieselbe Stelle (`values` zuletzt).
 * @param {any} snap Abzug (`worksheetSheetsSnapshot`)
 * @param {object} [options]
 * @returns {object} `AgentRead`
 * @throws {Error} bei einem kaputten Bereich (`rows: { from: 5, to: 2 }`)
 */
export function projectWorksheetRead(snap, options) {
  const values = options?.columns === undefined ? null : snap.columns.map((/** @type {any} */ c) => c.values);
  const src = values ? { ...snap, columns: snap.columns.map(({ values: _values, ...head }) => head) } : snap;
  const out = projectReadState(src, READ_FIELDS, options ?? {});
  if (out && typeof out.$invalidCall === 'string') throw new Error(out.$invalidCall);
  if (values) out.columns?.forEach((/** @type {any} */ c, /** @type {number} */ i) => { c.values = values[i]; });
  return out;
}

/**
 * Die Lesefläche über das Model (`vm.read`, `readDetached`).
 * @param {{ sheets: any[] }} model `WorksheetModel`
 * @param {{ sheetId?: string, fields?: string[], rows?: { from: number, to: number }, columns?: string[] }} [options]
 * @returns {object} `AgentRead`
 * @throws {Error} siehe `worksheetSheetsSnapshot`
 */
export function readWorksheetModel(model, options) {
  return projectWorksheetRead(worksheetSheetsSnapshot(model.sheets, options), options);
}

/**
 * Die Lesefläche aus einem gespeicherten Stand der Version 1.0, ohne Model:
 * der Stand ist vom Model geschrieben und gilt als geprüft. Einen Stand
 * älterer Version migriert `core/instances.js` vorher über `loadDetached`
 * und schreibt ihn einmal zurück.
 * @param {{ sheets: any[] }|null} saved gespeicherter Stand der Version 1.0
 * @param {object} [options] siehe `readWorksheetModel`
 * @returns {object} `AgentRead`
 */
export function readWorksheetStored(saved, options) {
  return projectWorksheetRead(worksheetSheetsSnapshot(saved?.sheets ?? [], options), options);
}
