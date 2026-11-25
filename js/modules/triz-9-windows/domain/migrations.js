/**
 * D.Mike — TRIZ 9-Windows: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js (das Schema darf sich ändern, die Migration
 * nicht).
 */

/** Systemebenen (Zeilen) und Zeitfenster (Spalten) im Formatstand 1.0. */
const ROWS_1_0 = 3;
const COLS_1_0 = 3;

/** Bild als Daten-URL im Formatstand 1.0. */
const IMAGE_DATA_URL_1_0 = /^data:image\/[\w.+-]+;base64,/;

/** @param {unknown} v @returns {string} der Text oder leer */
const textOr = (v) => (typeof v === 'string' ? v : '');

/**
 * Die Beschriftungen einer Achse wie das alte `fromJSON`: nur eine Liste
 * genau der Achsenlänge wird gelesen, je Eintrag Text oder leer; sonst lauter
 * leere Beschriftungen.
 * @param {unknown} v @param {number} n Achsenlänge @returns {string[]}
 */
function labelsOf(v, n) {
  if (!Array.isArray(v) || v.length !== n) return Array.from({ length: n }, () => '');
  return Array.from(v, textOr);
}

/**
 * Ein Fenster wie das alte `Cell.fromJSON`: kein Objekt → leer; `text` als
 * Text oder leer; `image` nur als Daten-URL, sonst `null`.
 * @param {unknown} v @returns {{ text: string, image: string|null }}
 */
function cellOf(v) {
  const o = /** @type {Record<string, any>} */ (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const image = typeof o.image === 'string' && IMAGE_DATA_URL_1_0.test(o.image) ? o.image : null;
  return { text: textOr(o.text), image };
}

/**
 * Das Raster wie das alte `fromJSON`: nur eine Liste mit genau drei Zeilen
 * wird gelesen, sonst bleibt es leer. Eine Zeile, die keine Liste ist, bleibt
 * leer; von einer Liste zählen die ersten drei Fenster, fehlende bleiben leer.
 * @param {unknown} v @returns {Array<Array<{ text: string, image: string|null }>>}
 */
function cellsOf(v) {
  const rows = Array.isArray(v) && v.length === ROWS_1_0 ? v : [];
  return Array.from({ length: ROWS_1_0 }, (_, r) => {
    const row = Array.isArray(rows[r]) ? rows[r] : [];
    return Array.from({ length: COLS_1_0 }, (_, c) => cellOf(row[c]));
  });
}

/**
 * '0→1.0': Altstände ohne `_schema` (Beispieldatei, von Hand). Wie das alte
 * `State.fromJSON`: kein Objekt → Vorgabe; der Titel als Text oder leer; die
 * Beschriftungen und das Raster nach den Regeln oben. Fremde Schlüssel
 * entfallen.
 * @param {unknown} old gespeicherter Zustand der Altform
 * @returns {{ systemTitle: string, colLabels: string[], rowLabels: string[],
 *   cells: Array<Array<{ text: string, image: string|null }>> }}
 */
export function from0(old) {
  const o = /** @type {Record<string, any>} */ (old && typeof old === 'object' && !Array.isArray(old) ? old : {});
  return {
    systemTitle: textOr(o.systemTitle),
    colLabels: labelsOf(o.colLabels, COLS_1_0),
    rowLabels: labelsOf(o.rowLabels, ROWS_1_0),
    cells: cellsOf(o.cells),
  };
}
