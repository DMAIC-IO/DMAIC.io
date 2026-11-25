/**
 * D.Mike — Einfügen und Füllen (datagrid/table/paste.js)
 *
 * Reine Hilfen: TSV zerlegen und Füllreihen erzeugen.
 */
import { parseNumeric } from '../datagrid-utils.js';
import { detectPattern, generateFill, shiftFormulaRefs, withCtrlModifier } from '../datagrid-fill.js';

/**
 * Zerlegt TSV wie `DataGrid.importFromClipboard`: Zeilenenden vereinheitlicht.
 * Führende und abschließende Zeilen ohne Inhalt entfallen, Leerzeilen mitten im
 * Text bleiben. Mit `keepBlank` bleibt alles stehen (eigene Kopie des Rasters:
 * leere Zeilen im Block sind Daten).
 * @param {string} text
 * @param {{ keepBlank?: boolean }} [opts]
 * @returns {string[][]} Zeilen von Zellentexten
 */
export function parseClipboard(text, { keepBlank = false } = {}) {
  const rows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map((r) => r.split('\t'));
  if (keepBlank) return rows;
  const blank = (/** @type {string[]} */ r) => r.every((c) => c.trim() === '');
  let from = 0;
  let to = rows.length;
  while (from < to && blank(rows[from])) from++;
  while (to > from && blank(rows[to - 1])) to--;
  return rows.slice(from, to);
}

/**
 * Erkennt eine Kopfzeile: jede Zelle der ersten Zeile ist nicht leer und keine
 * Zahl, die zweite Zeile enthält eine Zahl (wie `looksLikeHeaderRow`). Eine
 * erste Zeile aus Text und Zahl gemischt sind Daten.
 * @param {string[][]} rows @returns {{ header: string[]|null, rows: string[][] }}
 */
export function splitHeader(rows) {
  if (rows.length < 2) return { header: null, rows };
  const namesOnly = rows[0].every((v) => v.trim() !== '' && parseNumeric(v) === null);
  const restNumeric = rows[1].some((v) => parseNumeric(v) !== null);
  return namesOnly && restNumeric ? { header: rows[0], rows: rows.slice(1) } : { header: null, rows };
}

/**
 * Erzeugt Füllwerte (wie `DataGrid._applyFill`). Je Quelle ein Vektor aus
 * `{ value, formula }`: lotrecht die Zellen einer Spalte, waagerecht die einer
 * Zeile (dann ist `columnType` der Typ der ersten Quellspalte). Vorwärts füllt
 * hinter der Quelle, rückwärts davor (erster Eintrag = unmittelbar vor der
 * Quelle). Formeln der Quelle wandern mit verschobenen Bezügen (lotrecht die
 * Zeile, waagerecht die Spalte); dann ist `value` `null`.
 *
 * Sperre (`meta.lock`) und das Wachsen des Blatts um Zeilen bleiben beim
 * Aufrufer; über `before`/`after` meldet er, wie viele Positionen vor bzw. nach
 * der Quelle existieren. Mehr Einträge werden abgeschnitten (wie der Abbruch
 * `targetRow < 0` bzw. `targetCol >= numCols` im Raster).
 *
 * @param {{ value: any, formula?: string|null }[][]} sourceCells
 * @param {string} columnType
 * @param {number} count gewünschte Zielzellen je Vektor
 * @param {1|-1} dir
 * @param {boolean} [ctrl]
 * @param {{ axis?: 'v'|'h', before?: number, after?: number, maxCols?: number }} [opts]
 *   `axis` (Vorgabe `'v'`), vorhandene Positionen davor/dahinter (Vorgabe unbegrenzt), `maxCols` für Spaltenbezüge
 * @returns {{ value: any, formula: string|null }[][]} je Quellvektor die Einträge in Füllreihenfolge
 */
export function fillBlock(sourceCells, columnType, count, dir, ctrl = false, opts = {}) {
  const { axis = 'v', before = Infinity, after = Infinity, maxCols = Number.MAX_SAFE_INTEGER } = opts;
  const limit = Math.max(0, Math.min(count, dir === -1 ? before : after));
  return sourceCells.map((src) => {
    const len = src.length;
    const filled = generateFill(withCtrlModifier(detectPattern(src, columnType), ctrl), count, dir).slice(0, limit);
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
      if (formula) {
        const d = target - srcIdx;
        return { value: null, formula: axis === 'h' ? shiftFormulaRefs(formula, 0, d, maxCols) : shiftFormulaRefs(formula, d, 0, maxCols) };
      }
      return { value: f.value, formula: null };
    });
  });
}
