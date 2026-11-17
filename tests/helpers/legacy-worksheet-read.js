/**
 * Test-Helfer: die Lesefläche des Arbeitsblatts über einen gespeicherten Stand
 * der Altform (`{ sheets: [{ id, name, state }] }`, `state` = Rasterstand mit
 * `columns[].values`/`formulas`, `rowCount`), wie das Arbeitsblatt sie vor der
 * Umstellung auf die Zielform las. Viele Unit-Tests bauen ihre Arbeitsblätter
 * in dieser Form; ein Stand der Zielform (`_schema` 1.0) liest
 * `readWorksheetStored` des Moduls. Nur für Tests.
 */
import { requireKnownId } from '../../js/core/agent/agent-argcheck.js';
import {
  headerOf, valuesOf, selectColumns, projectWorksheetRead, readWorksheetStored,
} from '../../js/modules/worksheet/domain/read.js';

/**
 * Der Abzug eines gespeicherten Stands der Altform (wie das Arbeitsblatt vor
 * der Umstellung ihn las). Bezug für die Migrationstests (gleiche Lesefläche
 * vor und nach der Migration).
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
  // Ältere oder von Hand gebaute Stände ohne `rowCount` behalten ihre Daten:
  // dann zählt die längste Spalte.
  const rowCount = typeof state.rowCount === 'number'
    ? state.rowCount
    : Math.max(0, ...all.map(c => (Array.isArray(c.values) ? c.values.length : 0)));

  const wanted = options?.columns;
  const selected = selectColumns(all, wanted).map(i => all[i]);

  const heads = selected.map(headerOf);
  const columns = wanted === undefined
    ? heads
    : heads.map((head, i) => ({
      ...head,
      values: valuesOf(selected[i].values, rowCount),
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
  // Formel zerstören, die er nicht sieht. Die Liste nur auf Nachfrage (wie
  // `rows`): der Umfangs-Deskriptor braucht nur die Anzahl, und die
  // Formel-Arrays sind dicht (eine Zelle je Zeile, meist `null`).
  let formulas;
  if (options?.fields?.includes('formulas')) {
    formulas = [];
    for (const c of selected) {
      (c.formulas ?? []).forEach((formula, row) => {
        if (formula) formulas.push({ columnId: c.id, row, formula });
      });
    }
  } else {
    let count = 0;
    for (const c of selected) {
      const f = c.formulas;
      if (!Array.isArray(f)) continue;
      for (let r = 0; r < f.length; r++) if (f[r]) count++;
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
 * Die Lesefläche aus einem gespeicherten Stand: Altform über `worksheetSnapshot`,
 * Zielform (`_schema`) über `readWorksheetStored`.
 * @param {object|null} saved
 * @param {object} [options] siehe `worksheetSnapshot`
 * @returns {object} `AgentRead`
 */
export function readWorksheetState(saved, options) {
  if (saved && typeof saved === 'object' && saved._schema) return readWorksheetStored(saved, options);
  return projectWorksheetRead(worksheetSnapshot(saved, options), options);
}
