/**
 * D.Mike — Einfügen und Füllen (datagrid/table/paste.js)
 *
 * Reine Hilfen: TSV zerlegen und Füllreihen erzeugen.
 */
import { parseNumeric } from '../datagrid-utils.js';
import { detectPattern, generateFill, shiftFormulaRefs, withCtrlModifier } from '../datagrid-fill.js';

/**
 * Zerlegt TSV wie `DataGrid.importFromClipboard`: Zeilenenden vereinheitlicht,
 * Zeilen ohne Inhalt entfallen.
 * @param {string} text @returns {string[][]} Zeilen von Zellentexten
 */
export function parseClipboard(text) {
  const rows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return rows.map((r) => r.split('\t')).filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Erkennt eine Kopfzeile (erste Zeile nicht rein numerisch, zweite mit Zahl).
 * @param {string[][]} rows @returns {{ header: string[]|null, rows: string[][] }}
 */
export function splitHeader(rows) {
  if (rows.length < 2) return { header: null, rows };
  const firstNumeric = rows[0].every((v) => parseNumeric(v) !== null);
  const restNumeric = rows[1].some((v) => parseNumeric(v) !== null);
  return !firstNumeric && restNumeric ? { header: rows[0], rows: rows.slice(1) } : { header: null, rows };
}

/**
 * Erzeugt Füllwerte für lotrechte Quellen. Je Spalte ein Vektor aus
 * `{ value, formula }`. Vorwärts füllt unterhalb der Quelle, rückwärts oberhalb
 * (erste Zielzeile = unmittelbar vor der Quelle). Formeln der Quelle wandern
 * mit verschobenen Bezügen; dann ist `value` `null`.
 * @param {{ value: any, formula?: string|null }[][]} sourceCells
 * @param {string} columnType
 * @param {number} count Anzahl Zielzeilen
 * @param {1|-1} dir
 * @param {boolean} [ctrl]
 * @returns {{ value: any, formula: string|null }[][]} je Quellvektor `count` Einträge in Füllreihenfolge
 */
export function fillBlock(sourceCells, columnType, count, dir, ctrl = false) {
  return sourceCells.map((src) => {
    const len = src.length;
    const filled = generateFill(withCtrlModifier(detectPattern(src, columnType), ctrl), count, dir);
    return filled.map((f, i) => {
      let srcIdx;
      let target;
      if (dir === -1) {
        srcIdx = f.sourceIdx != null ? len - 1 - f.sourceIdx : len - 1 - (i % len);
        target = -1 - i;
      } else {
        srcIdx = f.sourceIdx != null ? f.sourceIdx : i % len;
        target = len + i;
      }
      const formula = src[srcIdx]?.formula;
      if (formula) return { value: null, formula: shiftFormulaRefs(formula, target - srcIdx, 0, Number.MAX_SAFE_INTEGER) };
      return { value: f.value, formula: null };
    });
  });
}
