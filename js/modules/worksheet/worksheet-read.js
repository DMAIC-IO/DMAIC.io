/**
 * D.Mike — Worksheet: Lesen aus dem gespeicherten Stand (worksheet-read.js)
 *
 * `readWorksheetState` ist eine reine Projektion: sie braucht weder ein
 * Viewmodel noch ein DataGrid, nur den gespeicherten Stand
 * (`{ sheets: [{ id, name, state }] }`). Das eingehängte Viewmodel (`read`)
 * und der Haken `readStored` des Modulobjekts (`core/instances.js`) benutzen
 * dieselbe Funktion; beide liefern damit dieselbe Form (`AgentRead`).
 *
 * Rein: kein DOM, kein `window`.
 */
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireKnownId } from '../../core/agent/agent-argcheck.js';
import { inferRole } from '../../core/datagrid/datagrid-roles.js';

/**
 * Format-Schlüssel, die die Oberfläche setzt — genau die Auswahl des
 * Format-Pickers (`datagrid.js` `_renderAttrPickerFormatColumn`), je
 * Spaltentyp. `currencySymbol` bietet die Oberfläche nicht an.
 */
export const FORMAT_KEYS = ['decimals', 'dateFormat', 'timeFormat'];

/**
 * Der Spaltenkopf einer gespeicherten Spalte (ohne Zellwerte).
 * @param {object} c  gespeicherte Spalte
 * @returns {object} Spaltenkopf wie in `AgentRead.columns`
 */
function headerOf(c) {
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
  };
}

/**
 * Die Momentaufnahme des Arbeitsblatts, die `readAgentState` projiziert.
 * Genau ein `return` mit Literal: so liest der Generator die gelieferten
 * Schlüssel (`tools/build/agent-read-return.mjs`).
 *
 * @param {{ sheets: Array<{ id: string, name: string, state: object|null }> }|null} saved
 *   der gespeicherte Stand; `null` für eine Instanz ohne Stand
 * @param {{ sheetId?: string, fields?: string[], rows?: { from: number, to: number }, columns?: string[] }} [options]
 *   `columns` wählt Spalten (Reihenfolge der Liste) und liefert je Spalte `values`
 * @returns {object} `AgentRead`
 * @throws {Error} `unknown_column: <id>` (`code: 'unknown_column'`), unbekannte
 *   Blatt-id, `columns must be an array of column ids`
 */
export function worksheetSnapshot(saved, options) {
  const sheets = saved?.sheets ?? [];
  const sheetId = options?.sheetId;
  if (sheetId !== undefined) requireKnownId('sheetId', sheetId, sheets.map(s => s.id));
  const shown = sheetId === undefined ? sheets[0] : sheets.find(s => s.id === sheetId);
  const state = shown?.state ?? { columns: [], rowCount: 0 };
  const all = state.columns ?? [];
  const rowCount = state.rowCount ?? 0;

  let selected = all;
  const wanted = options?.columns;
  if (wanted !== undefined) {
    if (!Array.isArray(wanted) || wanted.some(id => typeof id !== 'string')) {
      throw new Error('columns must be an array of column ids');
    }
    selected = wanted.map(id => {
      const col = all.find(c => c.id === id);
      if (!col) {
        const err = new Error(`unknown_column: ${id}`);
        err.code = 'unknown_column';
        throw err;
      }
      return col;
    });
  }

  const heads = selected.map(headerOf);
  const columns = wanted === undefined
    ? heads
    : heads.map((head, i) => ({
      ...head,
      values: Array.from({ length: rowCount }, (_, r) => selected[i].values?.[r] ?? null),
    }));

  // Zeilen nur auf Nachfrage: der Umfangs-Deskriptor braucht nur die Länge.
  let rows;
  if (options?.fields?.includes('rows')) {
    rows = [];
    for (let r = 0; r < rowCount; r++) rows.push(selected.map(c => c.values?.[r] ?? null));
  } else {
    rows = new Array(rowCount);
  }

  // Welche Zellen GERECHNET sind: ohne dieses Feld könnte ein Agent eine
  // Formel zerstören, die er nicht sieht.
  const formulas = [];
  for (const c of selected) {
    (c.formulas ?? []).forEach((formula, row) => {
      if (formula) formulas.push({ columnId: c.id, row, formula });
    });
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
 * Die Lesefläche des Arbeitsblatts aus dem gespeicherten Stand.
 *
 * @param {{ sheets: Array<{ id: string, name: string, state: object|null }> }|null} saved
 * @param {object} [options]  siehe `worksheetSnapshot`
 * @returns {object} `AgentRead`
 */
export function readWorksheetState(saved, options) {
  return readAgentState('worksheet', worksheetSnapshot(saved, options), options);
}
