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
import { FORMAT_KEYS } from './domain/columns.js';

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
 * Die Zellwerte einer gespeicherten Spalte als eigene Kopie: genau `n`
 * Einträge, fehlende (auch Lücken) als `null`. `slice` statt `Array.from`
 * mit Rückruf: bei 100 000 Zeilen der größte Posten eines Lesens mit `columns`.
 * @param {any[]|undefined} src
 * @param {number} rowCount
 * @returns {any[]}
 */
function valuesOf(src, rowCount) {
  // Wie `Array.from({ length })`: keine Zahl, negativ oder NaN ergibt 0.
  const n = rowCount > 0 ? Math.floor(rowCount) : 0;
  if (!Array.isArray(src)) return new Array(n).fill(null);
  const out = src.length >= n ? src.slice(0, n) : src.slice();
  out.length = n;
  for (let r = 0; r < n; r++) if (out[r] === undefined) out[r] = null;
  return out;
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
  // Ältere oder von Hand gebaute Stände ohne `rowCount` behalten ihre Daten:
  // dann zählt die längste Spalte.
  const rowCount = typeof state.rowCount === 'number'
    ? state.rowCount
    : Math.max(0, ...all.map(c => (Array.isArray(c.values) ? c.values.length : 0)));

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
 * Die Lesefläche des Arbeitsblatts aus dem gespeicherten Stand.
 *
 * @param {{ sheets: Array<{ id: string, name: string, state: object|null }> }|null} saved
 * @param {object} [options]  siehe `worksheetSnapshot`
 * @returns {object} `AgentRead`
 */
export function readWorksheetState(saved, options) {
  const snap = worksheetSnapshot(saved, options);
  if (options?.columns === undefined) return readAgentState('worksheet', snap, options);
  // Die `values` des Abzugs sind schon eigene Kopien (`Array.from`). Die
  // Projektion klonte `columns` (kein Massenfeld) sonst ein zweites Mal samt
  // aller Zellwerte; sie bekommt darum nur die Köpfe, die Werte kommen danach
  // an dieselbe Stelle (Schlüsselreihenfolge wie im Abzug: `values` zuletzt).
  const values = snap.columns.map((c) => c.values);
  const heads = snap.columns.map(({ values: _values, ...head }) => head);
  const out = readAgentState('worksheet', { ...snap, columns: heads }, options);
  out.columns?.forEach((c, i) => { c.values = values[i]; });
  return out;
}
