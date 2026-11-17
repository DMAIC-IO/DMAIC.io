/**
 * D.Mike — TableData (table-data.js)
 *
 * Spaltenweiser Zellspeicher für große Arbeitsblätter. Die inneren Arrays
 * bleiben roh (kein Proxy); `Object.preventExtensions` hält Alpines
 * Reaktivität fern, `rev` bleibt beschreibbar. Wer Zellen ändert, ruft danach
 * `markTableChanged` (core/model.js).
 */

/**
 * Ist `v` ein gültiger Zellwert: endliche Zahl, Text, Wahrheitswert oder `null`?
 * @param {unknown} v @returns {boolean}
 */
export function isCell(v) {
  return v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
}

export class TableData {
  /**
   * @param {number} rowCount Anzahl Zeilen
   * @param {any[][]} columns Spalten, je `rowCount` Zellen lang
   */
  constructor(rowCount, columns) {
    /** @type {number} */ this.rowCount = rowCount;
    /** @type {any[][]} */ this.columns = columns;
    /** @type {number} */ this.rev = 0;
    Object.preventExtensions(this);
  }

  /** @param {number} [columnCount] @returns {TableData} Tabelle ohne Zeilen mit leeren Spalten */
  static empty(columnCount = 0) {
    return new TableData(0, Array.from({ length: columnCount }, () => []));
  }

  /**
   * Übernimmt die Arrays ohne Kopie und füllt fehlende Zellen mit `null` auf `rowCount`.
   * @param {{ rowCount: number, columns: any[][] }} json @returns {TableData}
   */
  static fromJSON({ rowCount, columns }) {
    for (const col of columns) while (col.length < rowCount) col.push(null);
    return new TableData(rowCount, columns);
  }

  /** @returns {{ rowCount: number, columns: any[][] }} Form mit Kopien der Spaltenarrays */
  toJSON() {
    return { rowCount: this.rowCount, columns: this.columns.map((c) => c.slice()) };
  }

  /** @param {number} c Spalte @param {number} r Zeile @returns {any} der Zellwert */
  get(c, r) {
    return this.columns[c][r];
  }
}
