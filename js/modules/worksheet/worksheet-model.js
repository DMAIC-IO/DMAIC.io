/**
 * D.Mike — Worksheet Model (worksheet-model.js)
 *
 * Holds the multi-sheet workbook metadata plus the opaque per-sheet DataGrid
 * state blobs. The per-sheet `state` is whatever `DataGrid.getState()` returns —
 * it is stored opaquely and never reactified.
 *
 * Persistence shape (FROZEN — consumed by other modules via
 * stateManager.getModuleState):
 *   { sheets: [{ id, name, state }], activeSheetId, sheetCounter }
 *
 * Business logic only: no DOM, no i18n, no view concerns. Sheet names that are
 * i18n-derived (default name, "(Copy)" suffix) are passed in by the caller.
 */

/** @typedef {{ id: string, name: string, state: object|null }} Sheet */

export class State {
  /** @type {Sheet[]} */
  sheets = [];
  /** @type {string|null} */
  activeSheetId = null;
  /** @type {number} */
  sheetCounter = 0;

  /**
   * Append a new sheet. The first sheet is normally seeded by the view with the
   * translated default name. `copyFrom` deep-copies the source sheet's state.
   * @param {string} [name] Sheet name (caller resolves i18n / numbering)
   * @param {string} [copyFrom] Source sheet id to deep-copy state from
   * @returns {Sheet}
   */
  addSheet(name, copyFrom) {
    this.sheetCounter++;
    const id = `sheet_${  this.sheetCounter}`;
    const sheetName = name || `Sheet ${this.sheetCounter}`;
    /** @type {Sheet} */
    const sheet = { id, name: sheetName, state: null };

    if (copyFrom) {
      const src = this.sheets.find(s => s.id === copyFrom);
      if (src && src.state) {
        sheet.state = JSON.parse(JSON.stringify(src.state));
      }
    }

    this.sheets.push(sheet);
    this.activeSheetId = id;
    return sheet;
  }

  /**
   * Remove a sheet. Refuses to remove the last remaining sheet.
   * Re-points `activeSheetId` if the removed sheet was active.
   * @param {string} id
   * @returns {boolean} true if removed, false if it was the last sheet / unknown
   */
  removeSheet(id) {
    if (this.sheets.length <= 1) return false;
    const idx = this.sheets.findIndex(s => s.id === id);
    if (idx === -1) return false;

    this.sheets.splice(idx, 1);

    if (this.activeSheetId === id) {
      const newIdx = Math.min(idx, this.sheets.length - 1);
      this.activeSheetId = this.sheets[newIdx].id;
    }
    return true;
  }

  /**
   * Set the active sheet id (no-op for unknown ids).
   * @param {string} id
   */
  setActive(id) {
    if (this.sheets.some(s => s.id === id)) this.activeSheetId = id;
  }

  /**
   * Rename a sheet (trims; empty / whitespace keeps the old name).
   * @param {string} id
   * @param {string} newName
   */
  renameSheet(id, newName) {
    const sheet = this.sheets.find(s => s.id === id);
    if (!sheet) return;
    sheet.name = (typeof newName === 'string' ? newName.trim() : '') || sheet.name;
  }

  /**
   * Duplicate a sheet (deep-copies state) and make the copy active.
   * @param {string} id Source sheet id
   * @param {string} copyWord Translated word for the "(Copy)" suffix
   * @returns {Sheet|null}
   */
  duplicateSheet(id, copyWord) {
    const src = this.sheets.find(s => s.id === id);
    if (!src) return null;
    return this.addSheet(`${src.name} (${copyWord})`, id);
  }

  /**
   * Insert a blank sheet immediately before the given sheet and make it active.
   * @param {string} id Anchor sheet id
   * @param {string} [name] Optional name (caller resolves i18n / numbering)
   * @returns {Sheet|null}
   */
  insertSheetBefore(id, name) {
    const idx = this.sheets.findIndex(s => s.id === id);
    if (idx === -1) return null;
    this.sheetCounter++;
    const newId = `sheet_${  this.sheetCounter}`;
    const sheetName = name || `Sheet ${this.sheetCounter}`;
    /** @type {Sheet} */
    const sheet = { id: newId, name: sheetName, state: null };
    this.sheets.splice(idx, 0, sheet);
    this.activeSheetId = newId;
    return sheet;
  }

  /** @returns {Sheet|undefined} */
  getActiveSheet() {
    return this.sheets.find(s => s.id === this.activeSheetId);
  }

  /**
   * True if the workbook contains any user data. A fresh workbook (one sheet
   * with empty default columns) is treated as "no content"; more than one sheet
   * counts as content.
   * @returns {boolean}
   */
  hasContent() {
    if (this.sheets.length === 0) return false;
    if (this.sheets.length > 1) return true;
    const cols = this.sheets[0]?.state?.columns || [];
    return cols.some(col =>
      Array.isArray(col.values) && col.values.some(v => v != null && v !== ''),
    );
  }

  toJSON() {
    return {
      // Deep-clone the opaque per-sheet state to a PLAIN object. When this model
      // lives inside an Alpine reactive component, `s.state` (the DataGrid blob
      // we stored) is wrapped in a reactive Proxy; the persistence layer
      // structured-clones the snapshot and Proxies are not cloneable. The
      // round-trip strips the Proxy and decouples the snapshot (matching the
      // legacy Workbook.getState() semantics).
      sheets: this.sheets.map(s => ({
        id: s.id,
        name: s.name,
        state: s.state ? JSON.parse(JSON.stringify(s.state)) : null,
      })),
      activeSheetId: this.activeSheetId,
      sheetCounter: this.sheetCounter,
    };
  }

  /**
   * @param {object|null|undefined} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object' || !Array.isArray(d.sheets)) return s;

    s.sheets = d.sheets.map(sh => ({
      id: sh && typeof sh.id === 'string' ? sh.id : `sheet_${  Math.random().toString(36).slice(2)}`,
      name: sh && typeof sh.name === 'string' ? sh.name : '',
      state: sh && sh.state && typeof sh.state === 'object' ? sh.state : null,
    }));

    s.sheetCounter = Number.isInteger(d.sheetCounter) ? d.sheetCounter : s.sheets.length;
    s.activeSheetId = (typeof d.activeSheetId === 'string' && s.sheets.some(x => x.id === d.activeSheetId))
      ? d.activeSheetId
      : (s.sheets[0]?.id || null);

    return s;
  }
}
