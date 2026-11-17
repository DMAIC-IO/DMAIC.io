/**
 * D.Mike — Worksheet: Lesefläche (worksheet-read.js)
 *
 * Die Lesefläche des Arbeitsblatts (`AgentRead`, Form aus F1.14a P3) als
 * reine Projektion, ohne Viewmodel und ohne Raster:
 *
 * - Zielform: `readWorksheetModel(model, options)` über das Model (eingehängt
 *   `vm.read`, ohne Mount `readDetached`) und `readWorksheetStored(saved,
 *   options)` über einen gespeicherten Stand der Version 1.0, ohne ein Model zu
 *   bauen (`readStored`, `core/instances.js`). Beide teilen den Abzug aus
 *   `domain/read.js` und liefern dieselbe Form.
 * - Altform (`{ sheets: [{ id, name, state }] }`): `worksheetSnapshot` und
 *   `readWorksheetState`. Übergang, bis das Arbeitsblatt in Task 13 auf die
 *   Zielform umgestellt ist.
 *
 * Rein: kein DOM, kein `window`.
 */
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireKnownId } from '../../core/agent/agent-argcheck.js';
import { headerOf, valuesOf, selectColumns, worksheetSheetsSnapshot } from './domain/read.js';

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
 * Den Abzug zur Lesefläche projizieren. Mit `columns` bekommt die Projektion
 * nur die Köpfe: die `values` des Abzugs sind schon eigene Kopien, sie klonte
 * sonst ein zweites Mal samt aller Zellwerte. Die Werte kommen danach an
 * dieselbe Stelle (Schlüsselreihenfolge wie im Abzug: `values` zuletzt).
 * @param {any} snap Abzug (`worksheetSnapshot` oder `worksheetSheetsSnapshot`)
 * @param {object} [options]
 * @returns {object} `AgentRead`
 */
function project(snap, options) {
  if (options?.columns === undefined) return readAgentState('worksheet', snap, options);
  const values = snap.columns.map((/** @type {any} */ c) => c.values);
  const heads = snap.columns.map(({ values: _values, ...head }) => head);
  const out = readAgentState('worksheet', { ...snap, columns: heads }, options);
  out.columns?.forEach((/** @type {any} */ c, /** @type {number} */ i) => { c.values = values[i]; });
  return out;
}

/**
 * Die Lesefläche aus einem gespeicherten Stand der Altform (Übergang bis Task 13).
 *
 * @param {{ sheets: Array<{ id: string, name: string, state: object|null }> }|null} saved
 * @param {object} [options]  siehe `worksheetSnapshot`
 * @returns {object} `AgentRead`
 */
export function readWorksheetState(saved, options) {
  return project(worksheetSnapshot(saved, options), options);
}

/**
 * Die Lesefläche über das Model der Zielform (`vm.read`, `readDetached`).
 *
 * @param {{ sheets: any[] }} model `WorksheetModel`
 * @param {{ sheetId?: string, fields?: string[], rows?: { from: number, to: number }, columns?: string[] }} [options]
 * @returns {object} `AgentRead`
 * @throws {Error} siehe `worksheetSheetsSnapshot`
 */
export function readWorksheetModel(model, options) {
  return project(worksheetSheetsSnapshot(model.sheets, options), options);
}

/**
 * Die Lesefläche aus einem gespeicherten Stand der Version 1.0, ohne Model:
 * der Stand ist vom Model geschrieben und gilt als geprüft. Einen
 * Stand älterer Version migriert `core/instances.js` vorher über
 * `loadDetached` und schreibt ihn einmal zurück.
 *
 * @param {{ sheets: any[] }} saved gespeicherter Stand der Version 1.0
 * @param {object} [options] siehe `readWorksheetModel`
 * @returns {object} `AgentRead`
 */
export function readWorksheetStored(saved, options) {
  return project(worksheetSheetsSnapshot(saved?.sheets ?? [], options), options);
}
