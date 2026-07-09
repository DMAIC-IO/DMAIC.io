/**
 * D.Mike — SIPOC Model (sipoc-model.js)
 *
 * Pure state + business logic for the five-column SIPOC board. No DOM, no i18n,
 * no CSS, no view flags. Persistence shape: { columns: { suppliers, inputs,
 * process, outputs, customers } } — identical to the legacy getState() output and
 * to the catalog example files (examples/projects/sipoc-*.json → data.columns).
 */

/** @type {{ key: string, letter: string }[]} */
export const COLUMNS = [
  { key: 'suppliers', letter: 'S' },
  { key: 'inputs', letter: 'I' },
  { key: 'process', letter: 'P' },
  { key: 'outputs', letter: 'O' },
  { key: 'customers', letter: 'C' },
];

/** Ordered list of column keys. */
export const COL_KEYS = COLUMNS.map(c => c.key);

/** @returns {Record<string, string[]>} fresh empty column map */
function emptyColumns() {
  const cols = {};
  for (const key of COL_KEYS) cols[key] = [];
  return cols;
}

export class State {
  static VERSION = '1.0';
  static ID = 'sipoc';

  /** @type {Record<string, string[]>} */
  columns = emptyColumns();

  /** @returns {boolean} true if any column holds at least one entry */
  hasContent() {
    return COL_KEYS.some(key => this.columns[key].length > 0);
  }

  /**
   * Append a trimmed entry to a column.
   * @param {string} colKey
   * @param {string} text
   * @returns {boolean} true if the item was added
   */
  addItem(colKey, text) {
    if (!this.columns[colKey]) return false;
    const val = String(text ?? '').trim();
    if (!val) return false;
    this.columns[colKey].push(val);
    return true;
  }

  /**
   * Replace the entry at the given index (rejects empty values).
   * @param {string} colKey
   * @param {number} idx
   * @param {string} text
   * @returns {boolean} true if the item was changed
   */
  setItem(colKey, idx, text) {
    const col = this.columns[colKey];
    if (!col || idx < 0 || idx >= col.length) return false;
    const val = String(text ?? '').trim();
    if (!val) return false;
    col[idx] = val;
    return true;
  }

  /**
   * Remove the entry at the given index.
   * @param {string} colKey
   * @param {number} idx
   * @returns {boolean} true if an item was removed
   */
  deleteItem(colKey, idx) {
    const col = this.columns[colKey];
    if (!col || idx < 0 || idx >= col.length) return false;
    col.splice(idx, 1);
    return true;
  }

  /**
   * Move an entry from one position to another (same or different column).
   * Mirrors the legacy drop logic: when staying in the same column and dropping
   * after the source position, the drop index is decremented to account for the
   * removed source element.
   * @param {string} sourceCol
   * @param {number} sourceIdx
   * @param {string} targetCol
   * @param {number} dropIdx
   * @returns {boolean} true if a move happened
   */
  moveItem(sourceCol, sourceIdx, targetCol, dropIdx) {
    const src = this.columns[sourceCol];
    const tgt = this.columns[targetCol];
    if (!src || !tgt) return false;
    if (sourceIdx < 0 || sourceIdx >= src.length) return false;

    const [moved] = src.splice(sourceIdx, 1);
    let idx = dropIdx;
    if (sourceCol === targetCol && idx > sourceIdx) idx--;
    if (idx < 0) idx = 0;
    if (idx > tgt.length) idx = tgt.length;
    tgt.splice(idx, 0, moved);
    return true;
  }

  /** @returns {{ columns: Record<string, string[]> }} */
  toJSON() {
    const columns = {};
    for (const key of COL_KEYS) columns[key] = [...this.columns[key]];
    return { columns };
  }

  /**
   * Deserialize, validating shape. Accepts both the canonical { columns: {...} }
   * shape and a bare {...} column map (legacy import). Always returns a valid
   * default for null/undefined/malformed input.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;
    const cols = d.columns && typeof d.columns === 'object' ? d.columns : d;
    for (const key of COL_KEYS) {
      const arr = cols[key];
      if (Array.isArray(arr)) {
        s.columns[key] = arr.filter(v => typeof v === 'string');
      }
    }
    return s;
  }
}
