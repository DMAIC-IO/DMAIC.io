/**
 * D.Mike — Formeln über TableData (datagrid/table/formulas.js)
 *
 * Reine Funktionen. Formeln liegen dünn besetzt je Blatt:
 * `{ [columnId]: { "<Zeile>": "=…" } }`. Berechnet wird mit `evaluateFormula`
 * (datagrid-formula.js); die Tabelle ist die Datenquelle, es gibt kein
 * Abhängigkeitsverzeichnis.
 */
import { evaluateFormula } from '../datagrid-formula.js';

/**
 * @typedef {{ id: string, name?: string|null, shortName?: string }} ColumnHead
 * @typedef {Record<string, Record<string, string>>} Formulas
 */

/**
 * Adapter in der Form, die `evaluateFormula` erwartet. `values` ist die Spalte
 * der Tabelle selbst (keine Kopie).
 * @param {ColumnHead[]} columns Spaltenköpfe, parallel zu `table.columns`
 * @param {import('../../table-data.js').TableData} table
 * @param {Formulas} [_formulas] (nicht gebraucht; Signatur wie in P6)
 * @returns {{ columns: object[], rowCount: number, getColumnByIndex: (i: number) => object }}
 */
export function formulaGrid(columns, table, _formulas) {
  const cols = columns.map((h, i) => ({ ...h, values: table.columns[i] }));
  return { columns: cols, rowCount: table.rowCount, getColumnByIndex: (i) => cols[i] };
}

/**
 * Berechnet alle Formelzellen (Spalte, dann Zeile, ein Durchlauf) und schreibt
 * die Ergebnisse in die Tabelle. Fehler ergeben `null`.
 * @param {ColumnHead[]} columns
 * @param {import('../../table-data.js').TableData} table
 * @param {Formulas} formulas
 * @returns {number} Anzahl berechneter Zellen
 */
export function recalcFormulas(columns, table, formulas) {
  let n = 0;
  if (!formulas) return n;
  const grid = formulaGrid(columns, table, formulas);
  for (let c = 0; c < columns.length; c++) {
    const byRow = formulas[columns[c].id];
    if (!byRow) continue;
    const rows = Object.keys(byRow).map(Number).sort((a, b) => a - b);
    for (const r of rows) {
      const f = byRow[r];
      if (!f || r < 0 || r >= table.rowCount) continue;
      const { result, error } = evaluateFormula(f, grid);
      table.columns[c][r] = error ? null : result;
      n++;
    }
  }
  return n;
}

/**
 * Setzt die Zeilenschlüssel um (Sortieren, Verschieben, Einfügen, Löschen).
 * `mapRow(alteZeile)` liefert die neue Zeile oder `-1`/`null`: dann fällt die
 * Formel weg. Ändert `formulas` direkt.
 * @param {Formulas} formulas
 * @param {(row: number) => number|null} mapRow
 * @returns {{ columnId: string, row: number, formula: string }[]} die weggefallenen Formeln
 */
export function remapFormulaRows(formulas, mapRow) {
  const dropped = [];
  for (const columnId of Object.keys(formulas)) {
    const byRow = formulas[columnId];
    const next = {};
    for (const key of Object.keys(byRow)) {
      const old = Number(key);
      const to = mapRow(old);
      if (to == null || to < 0) dropped.push({ columnId, row: old, formula: byRow[key] });
      else next[to] = byRow[key];
    }
    if (Object.keys(next).length) formulas[columnId] = next;
    else delete formulas[columnId];
  }
  return dropped;
}

/**
 * Ersetzt `'alt'` durch `'neu'` in allen Formeln (wie `_rewriteFormulasOnRename`);
 * ohne neuen Namen tritt `shortName` an die Stelle. Ändert `formulas` direkt.
 * @param {Formulas} formulas
 * @param {string} oldName
 * @param {string|null} newName
 * @param {string} [shortName]
 * @returns {{ columnId: string, row: number, oldFormula: string }[]} Umkehrdaten
 */
export function renameInFormulas(formulas, oldName, newName, shortName) {
  if (!oldName) return [];
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`'${escaped}'`, 'g');
  const replacement = newName ? `'${newName}'` : (shortName || '');
  const rewritten = [];
  for (const columnId of Object.keys(formulas)) {
    const byRow = formulas[columnId];
    for (const key of Object.keys(byRow)) {
      const f = byRow[key];
      if (!f || !pattern.test(f)) { pattern.lastIndex = 0; continue; }
      pattern.lastIndex = 0;
      rewritten.push({ columnId, row: Number(key), oldFormula: f });
      byRow[key] = f.replace(pattern, () => replacement);
    }
  }
  return rewritten;
}
