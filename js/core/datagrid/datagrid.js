/**
 * D.Mike — DataGrid (datagrid.js)
 * Main spreadsheet component: rendering, editing, selection, clipboard, I/O.
 * Column-oriented data model with formula support.
 */

import { History } from './datagrid-history.js';
import { isFormula, evaluateFormula, recalcAllFormulas } from './datagrid-formula.js';
import {
  uid, clamp, parseNumeric, formatNumber,
  COLUMN_TYPES, isNumericType, formatCellValue,
  parseCellInput, detectInputType, analyzeColumn,
} from './datagrid-utils.js';

export { isFormula, evaluateFormula } from './datagrid-formula.js';
import { ensureXLSX as _ensureXLSX } from '../export-utils.js';
export { COLUMN_TYPES, isNumericType, formatCellValue, uid } from './datagrid-utils.js';

// Inline SVG icons for column locks. 12×12 — placed inside a .col-lock-icon span;
// `currentColor` lets CSS theme-tinting (Pastellblau / Pastellgrau) drive both states.
const LOCK_ICON_CLOSED =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

const LOCK_ICON_OPEN =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-1.7"/></svg>';

export class DataGrid {
  /**
   * @param {HTMLElement} container
   * @param {object} [options]
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this._t = options.t || ((key) => key.split('.').pop());

    // Data model (column-oriented)
    this.columns = [];
    this.rowCount = 0;
    this.metadata = { created: new Date().toISOString(), modified: null, source: null };

    // Selection
    this.selection = null;
    this.isSelecting = false;

    // Editing
    this.editingCell = null;
    this.editorEl = null;

    // History
    this.history = new History(50);

    // Column widths (map: colId → px)
    this.colWidths = {};

    // Sort state
    this.sortCol = null;
    this.sortDir = null;

    // Resize state
    this._resizing = null;

    // Row drag state
    this._rowDrag = null;

    // Column drag state
    this._colDrag = null;
    this._colDragPending = null;

    // Event handlers
    this._handlers = {};

    // Toast callback (set by worksheet module)
    this._toast = options.toast || (() => {});

    // Build DOM
    this._buildDOM();
    this._bindEvents();

    // Initial empty grid
    this._initEmptyGrid();
  }

  // ─── Simple event emitter ─────────────────────────────────

  on(event, fn) {
    (this._handlers[event] ||= []).push(fn);
    return this;
  }

  off(event, fn) {
    const list = this._handlers[event];
    if (list) this._handlers[event] = list.filter(f => f !== fn);
    return this;
  }

  emit(event, payload) {
    (this._handlers[event] || []).forEach(fn => fn(payload));
  }

  // ═══════════════════════════════════════════════════════════
  //  DATA API
  // ═══════════════════════════════════════════════════════════

  setData(columnData) {
    this.columns = columnData.map((c, i) => ({
      id: c.id || uid(),
      name: c.name || '',
      shortName: c.shortName || `C${i + 1}`,
      type: c.type || 'numeric',
      unit: c.unit || null,
      values: [...c.values],
      formulas: c.formulas ? [...c.formulas] : new Array(c.values.length).fill(null),
      format: c.format || {},
      meta: c.meta ? { ...c.meta } : null,
    }));
    this.rowCount = Math.max(0, ...this.columns.map(c => c.values.length));
    for (const col of this.columns) {
      while (col.values.length < this.rowCount) col.values.push(null);
      while (col.formulas.length < this.rowCount) col.formulas.push(null);
    }
    this._reassignShortNames();
    this.selection = null;
    this.editingCell = null;
    this.sortCol = null;
    this.sortDir = null;
    this.history.clear();
    this.render();
    this.emit('data:imported', { source: 'setData', columnCount: this.columns.length, rowCount: this.rowCount });
  }

  getData() {
    return this.columns.map(c => ({ ...c, values: [...c.values] }));
  }

  getColumn(columnId) { return this.columns.find(c => c.id === columnId) || null; }
  getColumnByIndex(idx) { return this.columns[idx] || null; }
  getColumnValues(columnId) { const c = this.getColumn(columnId); return c ? [...c.values] : []; }
  getColumnCount() { return this.columns.length; }
  getRowCount() { return this.rowCount; }

  addColumn(opts = {}) {
    const idx = opts.position != null ? opts.position : this.columns.length;
    const col = {
      id: uid(),
      name: opts.name || '',
      shortName: '',
      type: opts.type || 'numeric',
      unit: opts.unit || null,
      values: new Array(this.rowCount).fill(null),
      formulas: new Array(this.rowCount).fill(null),
      format: opts.format || {},
      meta: opts.meta ? { ...opts.meta } : null,
    };
    this.columns.splice(idx, 0, col);
    this._reassignShortNames();
    this.history.push({ type: 'column-add', column: col, index: idx });
    this.render();
    this.emit('column:added', { column: col });
    return col;
  }

  removeColumn(columnId, options = {}) {
    const idx = this.columns.findIndex(c => c.id === columnId);
    if (idx === -1) return;
    const col = this.columns[idx];
    if (col.meta?.lock === 'hard' && !options.bypassLock) {
      this.emit('column:edit-blocked', { columnId, action: 'remove', lock: 'hard', reason: col.meta.reason });
      return;
    }
    this.columns.splice(idx, 1);
    this._reassignShortNames();
    this.history.push({ type: 'column-remove', column: col, index: idx });
    this.render();
    this.emit('column:removed', { columnId });
  }

  /**
   * Set or clear the lock metadata on a column.
   * @param {string} columnId
   * @param {{lock: 'hard'|'soft', managedBy?: string, managedRef?: string, reason?: string} | null} spec
   *   Pass `null` to clear the lock.
   */
  setColumnLock(columnId, spec) {
    const col = this.getColumn(columnId);
    if (!col) return;
    if (spec == null) {
      col.meta = null;
    } else {
      col.meta = {
        lock: spec.lock || 'soft',
        managedBy:  spec.managedBy  ?? null,
        managedRef: spec.managedRef ?? null,
        reason:     spec.reason     ?? null,
      };
    }
    this.render();
    this.emit('column:lock-changed', { columnId, meta: col.meta });
  }

  /**
   * Returns the lock kind ('hard' | 'soft') for a column, or null if unlocked.
   * @param {object|string} colOrId — column object or column id
   */
  _isColumnLocked(colOrId) {
    const col = typeof colOrId === 'string' ? this.getColumn(colOrId) : colOrId;
    return col?.meta?.lock || null;
  }

  /** Build the tooltip text shown on the lock icon and on locked cells. */
  _lockTooltip(col) {
    if (!col.meta?.lock) return '';
    const t = (k) => this._t(`ui.datagrid.${k}`);
    const head = col.meta.lock === 'hard' ? t('lockHardTitle') : t('lockSoftTitle');
    const reasonKey = col.meta.reason ? `lockReason.${col.meta.reason}` : null;
    const reason = reasonKey ? this._t(`ui.datagrid.${reasonKey}`) : null;
    const managed = col.meta.managedBy ? `${t('lockManagedBy')}: ${col.meta.managedBy}` : null;
    return [head, reason, managed].filter(Boolean).join(' — ');
  }

  renameColumn(columnId, newName) {
    const col = this.getColumn(columnId);
    if (!col) return;
    const oldName = col.name;
    const uniqueName = this._uniqueColumnName(newName, columnId);
    col.name = uniqueName;
    const rewrittenFormulas = oldName ? this._rewriteFormulasOnRename(oldName, uniqueName, col.shortName) : [];
    this.history.push({ type: 'column-rename', columnId, oldName, newName: uniqueName, rewrittenFormulas });
    this.render();
    this.emit('column:renamed', { columnId, oldName, newName: uniqueName });
  }

  _rewriteFormulasOnRename(oldName, newName, shortName) {
    if (!oldName) return [];
    const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`'${escaped}'`, 'g');
    const replacement = newName ? `'${newName}'` : (shortName || '');
    const rewritten = [];
    for (const col of this.columns) {
      if (!col.formulas) continue;
      for (let r = 0; r < col.formulas.length; r++) {
        const formula = col.formulas[r];
        if (!formula) continue;
        if (pattern.test(formula)) {
          pattern.lastIndex = 0;
          rewritten.push({ colId: col.id, rowIndex: r, oldFormula: formula });
          col.formulas[r] = formula.replace(pattern, replacement);
        }
        pattern.lastIndex = 0;
      }
    }
    return rewritten;
  }

  _uniqueColumnName(name, excludeId) {
    if (!name) return name;
    const others = this.columns.filter(c => c.id !== excludeId).map(c => c.name).filter(Boolean);
    if (!others.includes(name)) return name;
    let n = 2;
    while (others.includes(`${name} (${n})`)) n++;
    return `${name} (${n})`;
  }

  addRows(count = 1, position) {
    const pos = position != null ? position : this.rowCount;
    for (const col of this.columns) {
      const empty = new Array(count).fill(null);
      col.values.splice(pos, 0, ...empty);
      if (col.formulas) col.formulas.splice(pos, 0, ...new Array(count).fill(null));
    }
    this.rowCount += count;
    this.history.push({ type: 'rows-add', startIndex: pos, count });
    this.render();
    this.emit('rows:added', { startIndex: pos, count });
  }

  removeRows(rowIndices) {
    const sorted = [...new Set(rowIndices)].sort((a, b) => b - a);
    const removedData = {};
    for (const col of this.columns) {
      removedData[col.id] = sorted.map(i => ({ index: i, value: col.values[i], formula: col.formulas?.[i] }));
      for (const i of sorted) {
        col.values.splice(i, 1);
        if (col.formulas) col.formulas.splice(i, 1);
      }
    }
    this.rowCount -= sorted.length;
    this.history.push({ type: 'rows-remove', rows: removedData, indices: sorted });
    this.selection = null;
    this.render();
    this.emit('rows:removed', { rowIndices: sorted });
  }

  moveRow(fromIdx, toIdx) {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= this.rowCount || toIdx >= this.rowCount) return;
    for (const col of this.columns) {
      const val = col.values.splice(fromIdx, 1)[0];
      col.values.splice(toIdx, 0, val);
      if (col.formulas) {
        const f = col.formulas.splice(fromIdx, 1)[0];
        col.formulas.splice(toIdx, 0, f);
      }
    }
    this.history.push({ type: 'row-move', fromIdx, toIdx });
    if (this.selection) {
      this.setSelection({
        startCol: this.selection.startCol, startRow: toIdx,
        endCol: this.selection.endCol, endRow: toIdx,
        activeCol: this.selection.activeCol, activeRow: toIdx,
      });
    }
    this.render();
    this.emit('rows:moved', { fromIdx, toIdx });
  }

  moveColumn(fromIdx, toIdx) {
    const n = this.columns.length;
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= n || toIdx >= n) return;
    const col = this.columns.splice(fromIdx, 1)[0];
    this.columns.splice(toIdx, 0, col);
    this._reassignShortNames();
    this.history.push({ type: 'column-move', fromIdx, toIdx });
    if (this.selection) {
      this.setSelection({
        startCol: toIdx, startRow: this.selection.startRow,
        endCol: toIdx, endRow: this.selection.endRow,
        activeCol: toIdx, activeRow: this.selection.activeRow,
      });
    }
    if (this.sortCol === fromIdx) this.sortCol = toIdx;
    this.render();
    this.emit('column:moved', { fromIdx, toIdx });
  }

  setCellValue(columnId, rowIndex, value, options = {}) {
    const col = this.getColumn(columnId);
    if (!col || rowIndex < 0) return;
    if (col.meta?.lock && !options.bypassLock) {
      this.emit('cell:edit-blocked', {
        columnId, rowIndex, lock: col.meta.lock, reason: col.meta.reason,
      });
      return;
    }
    while (rowIndex >= this.rowCount) this.addRows(1);
    const oldValue = col.values[rowIndex];

    if (value === '' || value == null) {
      col.values[rowIndex] = null;
    } else {
      const detected = detectInputType(value);
      const detectedType = detected ? detected.type : null;

      if (isNumericType(col.type)) {
        if (detectedType && detectedType !== col.type && detectedType !== 'numeric') {
          this._switchColumnType(col, columnId, rowIndex, detected);
        } else if (detectedType === col.type || detectedType === 'numeric') {
          col.values[rowIndex] = detected.value;
        } else {
          const parsed = parseCellInput(col, value);
          if (parsed !== null && typeof parsed === 'number') {
            col.values[rowIndex] = parsed;
          } else {
            const oldType = col.type;
            col.type = 'text';
            col.values = col.values.map(v => v == null ? null : String(v));
            col.values[rowIndex] = String(value);
            this._typeChanged = true;
            this.emit('column:type-changed', { columnId, oldType, newType: 'text' });
          }
        }
      } else if (col.type === 'text') {
        const hasExistingData = col.values.some((v, i) => v != null && i !== rowIndex);
        if (!hasExistingData && detectedType && detectedType !== 'numeric') {
          this._switchColumnType(col, columnId, rowIndex, detected);
        } else {
          col.values[rowIndex] = parseCellInput(col, value);
        }
      } else {
        if (detectedType && detectedType !== col.type) {
          this._switchColumnType(col, columnId, rowIndex, detected);
        } else {
          col.values[rowIndex] = parseCellInput(col, value);
        }
      }
    }

    const newValue = col.values[rowIndex];
    this.history.push({ type: 'cell-edit', columnId, rowIndex, oldValue, newValue });
    this.metadata.modified = new Date().toISOString();
    this.emit('cell:changed', { columnId, rowIndex, oldValue, newValue });
  }

  _switchColumnType(col, columnId, rowIndex, detected) {
    const oldType = col.type;
    col.type = detected.type;
    col.values[rowIndex] = detected.value;
    if (detected.type === 'currency' && !col.format.decimals) col.format.decimals = 2;
    if (detected.type === 'percent' && !col.format.decimals) col.format.decimals = 1;
    this._typeChanged = true;
    this.emit('column:type-changed', { columnId, oldType, newType: detected.type });
  }

  // ─── State save/restore ───────────────────────────────

  getState() {
    // Undo/redo history is session-scoped and must NOT be persisted.
    return {
      columns: this.columns.map(c => ({
        ...c,
        values: [...c.values],
        formulas: c.formulas ? [...c.formulas] : null,
      })),
      rowCount: this.rowCount,
      colWidths: { ...this.colWidths },
      sortCol: this.sortCol,
      sortDir: this.sortDir,
      selection: this.selection ? { ...this.selection } : null,
    };
  }

  setState(state) {
    this.columns = state.columns.map(c => ({
      ...c,
      values: [...c.values],
      formulas: c.formulas ? [...c.formulas] : null,
    }));
    this.rowCount = state.rowCount;
    this.colWidths = { ...state.colWidths };
    this.sortCol = state.sortCol;
    this.sortDir = state.sortDir;
    this.selection = state.selection;
    this.history = new History(50);
    this.editingCell = null;
    this.editorEl = null;
    this.render();
  }

  clearAll() {
    this.columns = [];
    this.rowCount = 0;
    this.colWidths = {};
    this.sortCol = null;
    this.sortDir = null;
    this.selection = null;
    this.history.clear();
    this._initEmptyGrid();
  }

  // ═══════════════════════════════════════════════════════════
  //  SELECTION
  // ═══════════════════════════════════════════════════════════

  setSelection(range) {
    this.selection = range ? { ...range } : null;
    this._renderSelection();
    this.emit('selection:changed', { range: this.selection });
  }

  selectColumn(colIdx) {
    this.setSelection({
      startCol: colIdx, startRow: 0,
      endCol: colIdx, endRow: this.rowCount - 1,
      activeCol: colIdx, activeRow: 0,
    });
  }

  selectRow(rowIdx) {
    this.setSelection({
      startCol: 0, startRow: rowIdx,
      endCol: this.columns.length - 1, endRow: rowIdx,
      activeCol: 0, activeRow: rowIdx,
    });
  }

  selectAll() {
    if (this.columns.length === 0 || this.rowCount === 0) return;
    this.setSelection({
      startCol: 0, startRow: 0,
      endCol: this.columns.length - 1, endRow: this.rowCount - 1,
      activeCol: 0, activeRow: 0,
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  SORT
  // ═══════════════════════════════════════════════════════════

  sortByColumn(colIdx) {
    if (colIdx < 0 || colIdx >= this.columns.length) return;
    const col = this.columns[colIdx];

    if (this.sortCol === colIdx) {
      if (this.sortDir === 'asc') this.sortDir = 'desc';
      else { this.sortCol = null; this.sortDir = null; this.render(); return; }
    } else {
      this.sortCol = colIdx;
      this.sortDir = 'asc';
    }

    const indices = Array.from({ length: this.rowCount }, (_, i) => i);
    const vals = col.values;
    const dir = this.sortDir === 'asc' ? 1 : -1;

    indices.sort((a, b) => {
      const va = vals[a], vb = vals[b];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });

    const oldData = this.columns.map(c => [...c.values]);
    const oldFormulas = this.columns.map(c => c.formulas ? [...c.formulas] : null);

    for (const c of this.columns) {
      c.values = indices.map(i => c.values[i]);
      if (c.formulas) c.formulas = indices.map(i => c.formulas[i]);
    }

    this.history.push({ type: 'sort', columnId: col.id, direction: this.sortDir, oldData, oldFormulas });
    this.render();
  }

  // ═══════════════════════════════════════════════════════════
  //  UNDO / REDO
  // ═══════════════════════════════════════════════════════════

  undo() {
    const action = this.history.undo();
    if (!action) return;
    this._applyUndo(action);
    this.emit('undo', { action });
  }

  redo() {
    const action = this.history.redo();
    if (!action) return;
    this._applyRedo(action);
    this.emit('redo', { action });
  }

  canUndo() { return this.history.canUndo(); }
  canRedo() { return this.history.canRedo(); }

  _applyUndo(action) {
    switch (action.type) {
      case 'cell-edit': {
        const col = this.getColumn(action.columnId);
        if (col) {
          col.values[action.rowIndex] = action.oldValue;
          if (col.formulas && action.oldFormula !== undefined) {
            col.formulas[action.rowIndex] = action.oldFormula || null;
          }
        }
        break;
      }
      case 'column-add': {
        const idx = this.columns.findIndex(c => c.id === action.column.id);
        if (idx >= 0) this.columns.splice(idx, 1);
        this._reassignShortNames();
        break;
      }
      case 'column-remove': {
        this.columns.splice(action.index, 0, action.column);
        this._reassignShortNames();
        break;
      }
      case 'column-rename': {
        const col = this.getColumn(action.columnId);
        if (col) col.name = action.oldName;
        if (action.rewrittenFormulas) {
          for (const entry of action.rewrittenFormulas) {
            const fc = this.getColumn(entry.colId);
            if (fc && fc.formulas) fc.formulas[entry.rowIndex] = entry.oldFormula;
          }
        }
        break;
      }
      case 'rows-add': {
        for (const col of this.columns) {
          col.values.splice(action.startIndex, action.count);
          if (col.formulas) col.formulas.splice(action.startIndex, action.count);
        }
        this.rowCount -= action.count;
        break;
      }
      case 'rows-remove': {
        for (const col of this.columns) {
          const entries = action.rows[col.id] || [];
          for (const e of [...entries].reverse()) {
            col.values.splice(e.index, 0, e.value);
            if (col.formulas) col.formulas.splice(e.index, 0, e.formula || null);
          }
        }
        this.rowCount += action.indices.length;
        break;
      }
      case 'paste': {
        const { startCol, startRow, oldData } = action;
        for (let ci = 0; ci < oldData.length; ci++) {
          const col = this.columns[startCol + ci];
          if (!col) continue;
          for (let ri = 0; ri < oldData[ci].length; ri++) {
            col.values[startRow + ri] = oldData[ci][ri];
          }
        }
        break;
      }
      case 'clear': {
        const { startCol, startRow, oldData, oldFormulas } = action;
        for (let ci = 0; ci < oldData.length; ci++) {
          const col = this.columns[startCol + ci];
          if (!col) continue;
          for (let ri = 0; ri < oldData[ci].length; ri++) {
            col.values[startRow + ri] = oldData[ci][ri];
            if (oldFormulas && oldFormulas[ci] && col.formulas) {
              col.formulas[startRow + ri] = oldFormulas[ci][ri];
            }
          }
        }
        break;
      }
      case 'sort': {
        for (let i = 0; i < this.columns.length; i++) {
          this.columns[i].values = action.oldData[i];
          if (action.oldFormulas && action.oldFormulas[i]) {
            this.columns[i].formulas = action.oldFormulas[i];
          }
        }
        this.sortCol = null;
        this.sortDir = null;
        break;
      }
      case 'import': {
        this.columns = action.oldColumns;
        this.rowCount = action.oldRowCount;
        break;
      }
      case 'row-move': {
        for (const col of this.columns) {
          const val = col.values.splice(action.toIdx, 1)[0];
          col.values.splice(action.fromIdx, 0, val);
          if (col.formulas) {
            const f = col.formulas.splice(action.toIdx, 1)[0];
            col.formulas.splice(action.fromIdx, 0, f);
          }
        }
        break;
      }
      case 'column-move': {
        const col = this.columns.splice(action.toIdx, 1)[0];
        this.columns.splice(action.fromIdx, 0, col);
        this._reassignShortNames();
        break;
      }
    }
    this.render();
  }

  _applyRedo(action) {
    switch (action.type) {
      case 'cell-edit': {
        const col = this.getColumn(action.columnId);
        if (col) {
          col.values[action.rowIndex] = action.newValue;
          if (col.formulas && action.newFormula !== undefined) {
            col.formulas[action.rowIndex] = action.newFormula || null;
          }
        }
        break;
      }
      case 'column-add': {
        this.columns.splice(action.index, 0, action.column);
        this._reassignShortNames();
        break;
      }
      case 'column-remove': {
        const idx = this.columns.findIndex(c => c.id === action.column.id);
        if (idx >= 0) this.columns.splice(idx, 1);
        this._reassignShortNames();
        break;
      }
      case 'column-rename': {
        const col = this.getColumn(action.columnId);
        if (col) col.name = action.newName;
        break;
      }
      case 'rows-add': {
        for (const col of this.columns) {
          const empty = new Array(action.count).fill(null);
          col.values.splice(action.startIndex, 0, ...empty);
          if (col.formulas) col.formulas.splice(action.startIndex, 0, ...new Array(action.count).fill(null));
        }
        this.rowCount += action.count;
        break;
      }
      case 'paste': {
        const { startCol, startRow, newData } = action;
        for (let ci = 0; ci < newData.length; ci++) {
          const col = this.columns[startCol + ci];
          if (!col) continue;
          for (let ri = 0; ri < newData[ci].length; ri++) {
            col.values[startRow + ri] = newData[ci][ri];
          }
        }
        break;
      }
      case 'row-move': {
        for (const col of this.columns) {
          const val = col.values.splice(action.fromIdx, 1)[0];
          col.values.splice(action.toIdx, 0, val);
          if (col.formulas) {
            const f = col.formulas.splice(action.fromIdx, 1)[0];
            col.formulas.splice(action.toIdx, 0, f);
          }
        }
        break;
      }
      case 'column-move': {
        const col = this.columns.splice(action.fromIdx, 1)[0];
        this.columns.splice(action.toIdx, 0, col);
        this._reassignShortNames();
        break;
      }
    }
    this.render();
  }

  // ═══════════════════════════════════════════════════════════
  //  CLIPBOARD
  // ═══════════════════════════════════════════════════════════

  importFromClipboard(tsvString) {
    const rows = tsvString.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const data = rows.map(r => r.split('\t')).filter(r => r.some(c => c.trim() !== ''));
    if (data.length === 0) return;

    const firstRow = data[0];
    const rest = data.slice(1);
    let hasHeader = false;
    if (rest.length > 0) {
      const firstRowNumeric = firstRow.every(v => parseNumeric(v) !== null);
      const restHasNumeric = rest[0].some(v => parseNumeric(v) !== null);
      if (!firstRowNumeric && restHasNumeric) hasHeader = true;
    }

    const headerRow = hasHeader ? data[0] : null;
    const valueRows = hasHeader ? data.slice(1) : data;
    const numCols = Math.max(...data.map(r => r.length));

    const sel = this.selection;
    const startCol = sel ? Math.min(sel.startCol, sel.endCol) : 0;
    const startRow = sel ? Math.min(sel.startRow, sel.endRow) : 0;

    while (this.columns.length < startCol + numCols) this.addColumn();
    const neededRows = startRow + valueRows.length;
    if (neededRows > this.rowCount) this.addRows(neededRows - this.rowCount);

    // Block paste entirely if any target column is locked — partial pastes corrupt the grid.
    for (let ci = 0; ci < numCols; ci++) {
      const targetCol = this.columns[startCol + ci];
      if (targetCol?.meta?.lock) {
        this.emit('cell:edit-blocked', {
          action: 'paste', columnId: targetCol.id,
          lock: targetCol.meta.lock, reason: targetCol.meta.reason,
        });
        return;
      }
    }

    const oldData = [];
    const newData = [];
    for (let ci = 0; ci < numCols; ci++) {
      const col = this.columns[startCol + ci];
      const oldCol = [];
      const newCol = [];
      for (let ri = 0; ri < valueRows.length; ri++) {
        const rowIdx = startRow + ri;
        oldCol.push(col.values[rowIdx]);
        const raw = valueRows[ri][ci] || '';
        const val = raw.trim() || null;
        col.values[rowIdx] = val;
        newCol.push(val);
      }
      oldData.push(oldCol);
      newData.push(newCol);

      if (headerRow && headerRow[ci] && !col.name) {
        col.name = this._uniqueColumnName(headerRow[ci].trim(), col.id);
      }
    }

    for (let ci = 0; ci < numCols; ci++) {
      this._autoDetectType(this.columns[startCol + ci]);
    }

    this.history.push({ type: 'paste', startCol, startRow, oldData, newData });
    this.render();
    this.emit('data:pasted', { range: { startCol, startRow, cols: numCols, rows: valueRows.length }, data: newData });
  }

  _autoDetectType(col) {
    const vals = col.values.filter(v => v != null);
    if (vals.length === 0) return;

    const counts = { numeric: 0, currency: 0, percent: 0, date: 0, time: 0, text: 0 };

    for (const v of vals) {
      const detected = detectInputType(String(v));
      if (detected) counts[detected.type]++;
      else counts.text++;
    }

    const total = vals.length;
    let bestType = 'text';
    let bestRatio = 0;

    for (const [type, count] of Object.entries(counts)) {
      if (type === 'text') continue;
      const ratio = count / total;
      if (ratio > bestRatio && ratio >= 0.7) {
        bestType = type;
        bestRatio = ratio;
      }
    }

    if (bestType === 'text') {
      const numericCount = vals.filter(v => typeof v === 'number' || parseNumeric(v) !== null).length;
      if (numericCount / total >= 0.7) bestType = 'numeric';
    }

    col.type = bestType;

    if (isNumericType(bestType)) {
      col.values = col.values.map(v => {
        if (v == null) return null;
        const d = detectInputType(String(v));
        if (d && typeof d.value === 'number') return d.value;
        const n = parseNumeric(v);
        return n !== null ? n : null;
      });
      if (bestType === 'currency' && !col.format.decimals) col.format.decimals = 2;
      if (bestType === 'percent' && !col.format.decimals) col.format.decimals = 1;
    } else if (bestType === 'date' || bestType === 'time') {
      col.values = col.values.map(v => {
        if (v == null) return null;
        return parseCellInput({ type: bestType }, String(v));
      });
    } else {
      col.values = col.values.map(v => v == null ? null : String(v));
    }
  }

  exportToCSV(options = {}) {
    const delim = options.delimiter || ';';
    const decimal = options.decimalSeparator || '.';
    const lineEnd = '\r\n';
    const lines = [];

    const headers = this.columns.map(c => c.name || c.shortName);
    lines.push(headers.join(delim));

    for (let r = 0; r < this.rowCount; r++) {
      const cells = this.columns.map(col => {
        const v = col.values[r];
        if (v == null) return '';
        if (typeof v === 'number') {
          let s = formatNumber(v, col.format.decimals);
          if (decimal === ',') s = s.replace('.', ',');
          return s;
        }
        let s = String(v);
        if (s.includes(delim) || s.includes('"') || s.includes('\n')) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      });
      lines.push(cells.join(delim));
    }
    return lines.join(lineEnd);
  }

  exportToTSV() {
    const sel = this.selection;
    if (!sel) return '';
    const c1 = Math.min(sel.startCol, sel.endCol);
    const c2 = Math.max(sel.startCol, sel.endCol);
    const r1 = Math.min(sel.startRow, sel.endRow);
    const r2 = Math.max(sel.startRow, sel.endRow);

    const lines = [];
    for (let r = r1; r <= r2; r++) {
      const cells = [];
      for (let c = c1; c <= c2; c++) {
        const col = this.columns[c];
        const v = col ? col.values[r] : '';
        cells.push(v != null ? String(v) : '');
      }
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  }

  // ═══════════════════════════════════════════════════════════
  //  INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════

  _initEmptyGrid() {
    this.columns = [];
    for (let i = 0; i < 5; i++) {
      this.columns.push({
        id: uid(),
        name: '',
        shortName: `C${i + 1}`,
        type: 'numeric',
        unit: null,
        values: new Array(30).fill(null),
        formulas: new Array(30).fill(null),
        format: {},
      });
    }
    this.rowCount = 30;
    this.render();
  }

  _reassignShortNames() {
    this.columns.forEach((c, i) => c.shortName = `C${i + 1}`);
  }

  _getColWidth(col) {
    return this.colWidths[col.id] || parseInt(getComputedStyle(document.documentElement).getPropertyValue('--datagrid-default-col-width')) || 130;
  }

  // ═══════════════════════════════════════════════════════════
  //  DOM BUILDING
  // ═══════════════════════════════════════════════════════════

  _buildDOM() {
    this.scrollDiv = document.createElement('div');
    this.scrollDiv.className = 'datagrid__scroll';
    this.tableEl = document.createElement('table');
    this.tableEl.className = 'datagrid__table';
    this.theadEl = document.createElement('thead');
    this.tbodyEl = document.createElement('tbody');
    this.tableEl.appendChild(this.theadEl);
    this.tableEl.appendChild(this.tbodyEl);
    this.scrollDiv.appendChild(this.tableEl);
    this.container.appendChild(this.scrollDiv);

    // Aliases for backward compat with event binding / selection code
    this.headerDiv = this.theadEl;
    this.bodyDiv = this.scrollDiv;
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════

  render() {
    if (this._rendering) return;
    this._rendering = true;
    try {
      this._commitEdit();
      recalcAllFormulas(this);
      this._updateRowHeaderWidth();
      this._renderHeader();
      this._renderBody();
      this._renderSelection();
      this.emit('render', {});
    } finally {
      this._rendering = false;
    }
  }

  /** Calculate row-header width based on the number of digits in the largest row number */
  _updateRowHeaderWidth() {
    const digits = String(this.rowCount || 1).length;
    // ~9px per digit + 24px padding for the buttons area
    const width = Math.max(36, digits * 9 + 24);
    this.container.style.setProperty('--datagrid-row-header-width', width + 'px');
  }

  _renderHeader() {
    const cols = this.columns;

    // Update shared colgroup
    let cg = '<col style="width:var(--datagrid-row-header-width)">';
    for (const col of cols) cg += `<col style="width:${this._getColWidth(col)}px">`;
    // Replace or create colgroup
    const existing = this.tableEl.querySelector('colgroup');
    if (existing) existing.remove();
    const colgroup = document.createElement('colgroup');
    colgroup.innerHTML = cg;
    this.tableEl.prepend(colgroup);

    // Single header row: shortName + type badge + column name
    const openInWsTitle = this._t('ui.datagrid.openInWorksheet');
    const openInWsBtn = this.options.openInWorksheet
      ? '<button class="datagrid__open-in-ws-btn" type="button" title="' + openInWsTitle + '">'
        + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>'
        + '</button>'
      : '';
    let html = '<tr class="datagrid__column-header"><th class="datagrid__row-header datagrid__corner">'
      + '<div class="datagrid__corner-btns">'
      + '<button class="datagrid__export-btn" type="button" title="Export">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
      + '</button>'
      + openInWsBtn
      + '</div></th>';
    const lockTitle = (col) => this._lockTooltip(col);
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const typeDef = COLUMN_TYPES[col.type] || COLUMN_TYPES.text;
      const typeTag = `<span class="col-type-badge col-type-${col.type}" data-col-idx="${i}" title="${this._typeLabel(col.type)}">${typeDef.badge}</span>`;
      const sortClass = this.sortCol === i ? (this.sortDir === 'asc' ? ' sorted-asc' : ' sorted-desc') : '';
      const lockClass = col.meta?.lock ? ` col-locked col-locked--${col.meta.lock}` : '';
      const lockIcon = col.meta?.lock
        ? `<span class="col-lock-icon" title="${lockTitle(col)}">${col.meta.lock === 'hard' ? LOCK_ICON_CLOSED : LOCK_ICON_OPEN}</span>`
        : '';
      const unit = col.unit ? ` <span class="col-unit">[${col.unit}]</span>` : '';
      const nameHtml = col.name ? `<span class="col-name">${col.name}${unit}</span>` : '';
      html += `<th data-col-idx="${i}" class="${sortClass}${lockClass}">`;
      html += `<span class="col-id">${col.shortName}</span> ${typeTag} ${lockIcon}${nameHtml}`;
      html += `<div class="col-resize-handle" data-col-idx="${i}"></div></th>`;
    }
    html += '</tr>';
    this.theadEl.innerHTML = html;
  }

  _renderBody() {
    const cols = this.columns;
    const frag = document.createDocumentFragment();

    for (let r = 0; r < this.rowCount; r++) {
      const tr = document.createElement('tr');
      const th = document.createElement('td');
      th.className = 'datagrid__row-header';
      th.textContent = r + 1;
      th.dataset.rowIdx = r;
      tr.appendChild(th);

      for (let c = 0; c < cols.length; c++) {
        const col = cols[c];
        const td = document.createElement('td');
        td.dataset.colIdx = c;
        td.dataset.rowIdx = r;
        const val = col.values[r];
        const formula = col.formulas?.[r];

        let cls = 'datagrid__cell';
        if (isNumericType(col.type)) cls += ' cell-numeric';
        if (col.meta?.lock) {
          cls += ` cell-locked cell-locked--${col.meta.lock}`;
          td.title = this._lockTooltip(col);
        }

        if (formula) {
          if (val != null) {
            cls += ' cell-formula';
            td.textContent = formatCellValue(col, val);
            td.title = formula;
          } else {
            const { result, error } = evaluateFormula(formula, this);
            if (error) {
              cls += ' cell-formula-error';
              td.textContent = error;
              td.title = formula + ' \u2192 ' + error;
            } else {
              cls += ' cell-formula';
              td.textContent = formatCellValue(col, result);
              td.title = formula;
            }
          }
        } else if (val != null) {
          td.textContent = formatCellValue(col, val);
        }

        td.className = cls;
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }

    this.tbodyEl.innerHTML = '';
    this.tbodyEl.appendChild(frag);
  }

  _renderSelection() {
    this.bodyDiv.querySelectorAll('.cell-selected, .cell-active').forEach(el => {
      el.classList.remove('cell-selected', 'cell-active');
    });
    this.headerDiv.querySelectorAll('.col-selected').forEach(el => el.classList.remove('col-selected'));
    this.bodyDiv.querySelectorAll('.row-header-selected').forEach(el => el.classList.remove('row-header-selected'));

    if (!this.selection) return;
    const s = this.selection;
    const c1 = Math.min(s.startCol, s.endCol);
    const c2 = Math.max(s.startCol, s.endCol);
    const r1 = Math.min(s.startRow, s.endRow);
    const r2 = Math.max(s.startRow, s.endRow);

    const rows = this.bodyDiv.querySelectorAll('tbody tr');
    for (let r = r1; r <= r2 && r < rows.length; r++) {
      const tr = rows[r];
      for (let c = c1; c <= c2; c++) {
        const td = tr.children[c + 1];
        if (td) td.classList.add('cell-selected');
      }
      if (c1 === 0 && c2 === this.columns.length - 1) {
        tr.children[0]?.classList.add('row-header-selected');
      }
    }

    if (s.activeRow >= 0 && s.activeRow < rows.length) {
      const activeTd = rows[s.activeRow]?.children[s.activeCol + 1];
      if (activeTd) activeTd.classList.add('cell-active');
    }

    const thRow = this.theadEl.querySelector('tr');
    if (thRow) {
      for (let c = c1; c <= c2; c++) {
        thRow.children[c + 1]?.classList.add('col-selected');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  EVENT BINDING
  // ═══════════════════════════════════════════════════════════

  _bindEvents() {
    this.bodyDiv.addEventListener('mousedown', (e) => this._onBodyMouseDown(e));
    this._boundMouseMove = (e) => this._onMouseMove(e);
    this._boundMouseUp = (e) => this._onMouseUp(e);
    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('mouseup', this._boundMouseUp);
    this.bodyDiv.addEventListener('dblclick', (e) => this._onBodyDblClick(e));
    this.headerDiv.addEventListener('dblclick', (e) => this._onHeaderDblClick(e));
    this.headerDiv.addEventListener('mousedown', (e) => this._onHeaderMouseDown(e));

    this.headerDiv.addEventListener('click', (e) => {
      const badge = e.target.closest('.col-type-badge');
      if (badge) {
        e.stopPropagation();
        const colIdx = parseInt(badge.dataset.colIdx);
        if (!isNaN(colIdx)) this._showTypePicker(colIdx, badge);
        return;
      }
      const exportBtn = e.target.closest('.datagrid__export-btn');
      if (exportBtn) {
        e.stopPropagation();
        this._showExportMenu(exportBtn);
        return;
      }
      const openInWsBtn = e.target.closest('.datagrid__open-in-ws-btn');
      if (openInWsBtn && typeof this.options.openInWorksheet === 'function') {
        e.stopPropagation();
        this.options.openInWorksheet(this);
      }
    });

    this._boundKeyDown = (e) => this._onKeyDown(e);
    this._boundPaste = (e) => this._onPaste(e);
    this._boundCopy = (e) => this._onCopy(e);
    this._boundCut = (e) => this._onCut(e);
    this._boundClick = () => this._closeContextMenu();

    document.addEventListener('keydown', this._boundKeyDown);
    document.addEventListener('paste', this._boundPaste);
    document.addEventListener('copy', this._boundCopy);
    document.addEventListener('cut', this._boundCut);
    this.bodyDiv.addEventListener('contextmenu', (e) => this._onBodyContextMenu(e));
    this.headerDiv.addEventListener('contextmenu', (e) => this._onHeaderContextMenu(e));
    document.addEventListener('click', this._boundClick);

    // Column hover highlight
    this._hoverColIdx = -1;
    this.scrollDiv.addEventListener('mouseover', (e) => {
      const td = e.target.closest('td, th');
      if (!td) return;
      const idx = td.cellIndex;
      if (idx === this._hoverColIdx) return;
      this._clearColHover();
      if (idx <= 0) { this._hoverColIdx = -1; return; }   // skip row-header col
      this._hoverColIdx = idx;
      for (const row of this.tableEl.rows) {
        const cell = row.cells[idx];
        if (cell && !cell.classList.contains('datagrid__row-header')) {
          cell.classList.add('col-hover');
        }
      }
    });
    this.scrollDiv.addEventListener('mouseleave', () => this._clearColHover());

    // File drag & drop
    this.container.addEventListener('dragover', (e) => {
      e.preventDefault();
      this._dropzone?.classList.add('active');
    });
    this.container.addEventListener('dragleave', (e) => {
      if (!this.container.contains(e.relatedTarget)) {
        this._dropzone?.classList.remove('active');
      }
    });
    this.container.addEventListener('drop', (e) => {
      e.preventDefault();
      this._dropzone?.classList.remove('active');
      const file = e.dataTransfer.files[0];
      if (file) this._handleFileImport(file);
    });
  }

  _clearColHover() {
    if (this._hoverColIdx < 0) return;
    const els = this.tableEl.querySelectorAll('.col-hover');
    for (let i = 0; i < els.length; i++) els[i].classList.remove('col-hover');
    this._hoverColIdx = -1;
  }

  /** Set the dropzone element (created by the worksheet module). */
  setDropzone(el) {
    this._dropzone = el;
  }

  _getCellFromEvent(e) {
    const td = e.target.closest('td[data-col-idx]');
    if (!td) return null;
    return { colIdx: parseInt(td.dataset.colIdx), rowIdx: parseInt(td.dataset.rowIdx) };
  }

  _onBodyMouseDown(e) {
    if (e.target.classList.contains('datagrid__row-header')) {
      const rowIdx = parseInt(e.target.dataset.rowIdx);
      if (!isNaN(rowIdx)) {
        this._commitEdit();
        this.selectRow(rowIdx);
        this._rowDragPending = { rowIdx, startX: e.clientX, startY: e.clientY };
      }
      return;
    }

    const cell = this._getCellFromEvent(e);
    if (!cell) return;
    this._commitEdit();

    if (e.shiftKey && this.selection) {
      this.selection.endCol = cell.colIdx;
      this.selection.endRow = cell.rowIdx;
      this._renderSelection();
      this.emit('selection:changed', { range: this.selection });
    } else if (
      this.selection &&
      this.selection.activeCol === cell.colIdx &&
      this.selection.activeRow === cell.rowIdx &&
      this.selection.startCol === this.selection.endCol &&
      this.selection.startRow === this.selection.endRow
    ) {
      this.setSelection(null);
    } else {
      this.setSelection({
        startCol: cell.colIdx, startRow: cell.rowIdx,
        endCol: cell.colIdx, endRow: cell.rowIdx,
        activeCol: cell.colIdx, activeRow: cell.rowIdx,
      });
      this.isSelecting = true;
    }
  }

  _onMouseMove(e) {
    if (this._resizing) {
      const dx = e.clientX - this._resizing.startX;
      const newWidth = Math.max(50, this._resizing.startWidth + dx);
      const col = this.columns[this._resizing.colIdx];
      if (col) {
        this.colWidths[col.id] = newWidth;
        this.render();
      }
      return;
    }

    if (this._rowDragPending && !this._rowDrag) {
      const dx = e.clientX - this._rowDragPending.startX;
      const dy = e.clientY - this._rowDragPending.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        this._startRowDrag(this._rowDragPending.rowIdx, e);
      }
      return;
    }

    if (this._rowDrag) {
      this._updateRowDrag(e);
      return;
    }

    if (this._colDragPending && !this._colDrag) {
      const dx = e.clientX - this._colDragPending.startX;
      const dy = e.clientY - this._colDragPending.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        this._startColDrag(this._colDragPending.colIdx, e);
      }
      return;
    }

    if (this._colDrag) {
      this._updateColDrag(e);
      return;
    }

    if (!this.isSelecting || !this.selection) return;
    const cell = this._getCellFromEvent(e);
    if (!cell) return;
    this.selection.endCol = cell.colIdx;
    this.selection.endRow = cell.rowIdx;
    this._renderSelection();
  }

  _onMouseUp() {
    this._rowDragPending = null;
    this._colDragPending = null;
    if (this._rowDrag) { this._finishRowDrag(); return; }
    if (this._colDrag) { this._finishColDrag(); return; }
    if (this._resizing) {
      this._resizing.handle.classList.remove('active');
      this._resizing = null;
      return;
    }
    if (this.isSelecting) {
      this.isSelecting = false;
    }
  }

  // ─── Row Drag & Drop ────────────────────────────────

  _startRowDrag(rowIdx, e) {
    this._rowDragPending = null;
    const ghost = document.createElement('div');
    ghost.className = 'row-drag-ghost';
    ghost.textContent = `Row ${rowIdx + 1}`;
    ghost.style.left = (e.clientX + 12) + 'px';
    ghost.style.top = (e.clientY - 10) + 'px';
    document.body.appendChild(ghost);

    const indicator = document.createElement('div');
    indicator.className = 'row-drag-indicator';
    this.bodyDiv.style.position = 'relative';
    this.bodyDiv.appendChild(indicator);

    const rows = this.bodyDiv.querySelectorAll('tbody tr');
    if (rows[rowIdx]) rows[rowIdx].classList.add('row-dragging');

    this._rowDrag = { fromIdx: rowIdx, ghost, indicator, toIdx: rowIdx };
  }

  _updateRowDrag(e) {
    const drag = this._rowDrag;
    drag.ghost.style.left = (e.clientX + 12) + 'px';
    drag.ghost.style.top = (e.clientY - 10) + 'px';

    const rows = this.bodyDiv.querySelectorAll('tbody tr');
    const bodyRect = this.bodyDiv.getBoundingClientRect();
    const scrollTop = this.bodyDiv.scrollTop;
    const mouseY = e.clientY - bodyRect.top + scrollTop;

    let targetIdx = this.rowCount;
    for (let i = 0; i < rows.length; i++) {
      const rowTop = rows[i].offsetTop;
      const rowMid = rowTop + rows[i].offsetHeight / 2;
      if (mouseY < rowMid) { targetIdx = i; break; }
    }

    drag.toIdx = targetIdx;
    if (targetIdx < rows.length) {
      drag.indicator.style.top = rows[targetIdx].offsetTop + 'px';
    } else if (rows.length > 0) {
      const last = rows[rows.length - 1];
      drag.indicator.style.top = (last.offsetTop + last.offsetHeight) + 'px';
    }
    drag.indicator.style.display = 'block';

    const edgeThreshold = 30;
    if (e.clientY - bodyRect.top < edgeThreshold) this.bodyDiv.scrollTop -= 5;
    else if (bodyRect.bottom - e.clientY < edgeThreshold) this.bodyDiv.scrollTop += 5;
  }

  _finishRowDrag() {
    const drag = this._rowDrag;
    if (!drag) return;
    drag.ghost.remove();
    drag.indicator.remove();
    const rows = this.bodyDiv.querySelectorAll('tbody tr');
    if (rows[drag.fromIdx]) rows[drag.fromIdx].classList.remove('row-dragging');

    let toIdx = drag.toIdx;
    if (toIdx > drag.fromIdx) toIdx--;
    if (toIdx !== drag.fromIdx && toIdx >= 0 && toIdx < this.rowCount) {
      this.moveRow(drag.fromIdx, toIdx);
    }
    this._rowDrag = null;
  }

  // ─── Column Drag & Drop ─────────────────────────────

  _startColDrag(colIdx, e) {
    this._colDragPending = null;
    const col = this.columns[colIdx];
    if (!col) return;

    const ghost = document.createElement('div');
    ghost.className = 'col-drag-ghost';
    ghost.textContent = col.shortName + (col.name ? ' · ' + col.name : '');
    ghost.style.left = (e.clientX + 12) + 'px';
    ghost.style.top = (e.clientY - 10) + 'px';
    document.body.appendChild(ghost);

    const indicator = document.createElement('div');
    indicator.className = 'col-drag-indicator';
    this.bodyDiv.style.position = 'relative';
    this.bodyDiv.appendChild(indicator);

    const ths = this.theadEl.querySelectorAll('tr.datagrid__column-header th[data-col-idx]');
    if (ths[colIdx]) ths[colIdx].classList.add('col-dragging');

    this._colDrag = { fromIdx: colIdx, ghost, indicator, toIdx: colIdx };
  }

  _updateColDrag(e) {
    const drag = this._colDrag;
    drag.ghost.style.left = (e.clientX + 12) + 'px';
    drag.ghost.style.top = (e.clientY - 10) + 'px';

    const ths = this.theadEl.querySelectorAll('tr.datagrid__column-header th[data-col-idx]');
    const bodyRect = this.bodyDiv.getBoundingClientRect();
    const scrollLeft = this.bodyDiv.scrollLeft;
    const mouseX = e.clientX - bodyRect.left + scrollLeft;

    let targetIdx = this.columns.length;
    for (let i = 0; i < ths.length; i++) {
      const left = ths[i].offsetLeft;
      const mid = left + ths[i].offsetWidth / 2;
      if (mouseX < mid) { targetIdx = i; break; }
    }

    drag.toIdx = targetIdx;
    const indicatorTop = 0;
    const indicatorHeight = this.bodyDiv.scrollHeight;
    drag.indicator.style.top = indicatorTop + 'px';
    drag.indicator.style.height = indicatorHeight + 'px';
    if (targetIdx < ths.length) {
      drag.indicator.style.left = ths[targetIdx].offsetLeft + 'px';
    } else if (ths.length > 0) {
      const last = ths[ths.length - 1];
      drag.indicator.style.left = (last.offsetLeft + last.offsetWidth) + 'px';
    }
    drag.indicator.style.display = 'block';

    const edgeThreshold = 40;
    if (e.clientX - bodyRect.left < edgeThreshold) this.bodyDiv.scrollLeft -= 8;
    else if (bodyRect.right - e.clientX < edgeThreshold) this.bodyDiv.scrollLeft += 8;
  }

  _finishColDrag() {
    const drag = this._colDrag;
    if (!drag) return;
    drag.ghost.remove();
    drag.indicator.remove();
    const ths = this.theadEl.querySelectorAll('tr.datagrid__column-header th[data-col-idx]');
    if (ths[drag.fromIdx]) ths[drag.fromIdx].classList.remove('col-dragging');

    let toIdx = drag.toIdx;
    if (toIdx > drag.fromIdx) toIdx--;
    if (toIdx !== drag.fromIdx && toIdx >= 0 && toIdx < this.columns.length) {
      this.moveColumn(drag.fromIdx, toIdx);
    }
    this._colDrag = null;
  }

  _onBodyDblClick(e) {
    const cell = this._getCellFromEvent(e);
    if (!cell) return;
    const col = this.columns[cell.colIdx];
    if (col?.formulas?.[cell.rowIdx] && this._formulaEditorOpen) {
      this._formulaEditorOpen(cell.colIdx, cell.rowIdx);
    } else {
      this._startEdit(cell.colIdx, cell.rowIdx);
    }
  }

  _onHeaderDblClick(e) {
    const th = e.target.closest('.datagrid__column-header th[data-col-idx]');
    if (!th) return;
    const colIdx = parseInt(th.dataset.colIdx);
    this._startHeaderEdit(colIdx, th);
  }

  _startHeaderEdit(colIdx, th) {
    if (this._editingHeader) return;
    const col = this.columns[colIdx];
    if (!col) return;

    this._editingHeader = true;
    const oldName = col.name || '';

    const input = document.createElement('input');
    input.className = 'col-name-editor';
    input.type = 'text';
    input.value = oldName;
    input.placeholder = 'Name…';

    // Replace or append after the badge
    const nameEl = th.querySelector('.col-name');
    if (nameEl) {
      nameEl.replaceWith(input);
    } else {
      th.querySelector('.col-resize-handle')?.before(input);
    }
    input.focus();
    input.select();

    const commit = () => {
      this._editingHeader = false;
      const newName = input.value.trim();
      if (newName !== oldName) {
        this.renameColumn(col.id, newName);
      } else {
        this.render();
      }
    };

    const cancel = () => {
      this._editingHeader = false;
      this.render();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { ev.preventDefault(); input.removeEventListener('blur', commit); cancel(); }
      ev.stopPropagation();
    });
  }

  _onHeaderMouseDown(e) {
    const handle = e.target.closest('.col-resize-handle');
    if (handle) {
      e.preventDefault();
      const colIdx = parseInt(handle.dataset.colIdx);
      const col = this.columns[colIdx];
      if (!col) return;
      handle.classList.add('active');
      this._resizing = {
        colIdx,
        startX: e.clientX,
        startWidth: this._getColWidth(col),
        handle,
      };
      return;
    }

    const th = e.target.closest('.datagrid__column-header th[data-col-idx]');
    if (th) {
      const colIdx = parseInt(th.dataset.colIdx);
      if (e.shiftKey) {
        this.sortByColumn(colIdx);
      } else {
        this._commitEdit();
        this.selectColumn(colIdx);
        // Dragging the "C1" label starts a column reorder
        if (e.target.closest('.col-id')) {
          e.preventDefault();
          this._colDragPending = { colIdx, startX: e.clientX, startY: e.clientY };
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  KEYBOARD
  // ═══════════════════════════════════════════════════════════

  _onKeyDown(e) {
    // Check if focus is inside our container or on document level
    const active = document.activeElement;
    if (active && active !== document.body && !this.container.contains(active) && active.tagName !== 'BODY') {
      return; // Don't intercept keys meant for other UI
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault(); this.undo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault(); this.redo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault(); this.selectAll(); return;
    }

    if (this.editingCell) {
      this._onEditKeyDown(e);
      return;
    }

    if (!this.selection) return;
    const s = this.selection;

    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      let dc = 0, dr = 0;
      if (e.key === 'ArrowLeft') dc = -1;
      if (e.key === 'ArrowRight') dc = 1;
      if (e.key === 'ArrowUp') dr = -1;
      if (e.key === 'ArrowDown') dr = 1;

      if (e.shiftKey) {
        s.endCol = clamp(s.endCol + dc, 0, this.columns.length - 1);
        s.endRow = clamp(s.endRow + dr, 0, this.rowCount - 1);
      } else {
        const nc = clamp(s.activeCol + dc, 0, this.columns.length - 1);
        const nr = clamp(s.activeRow + dr, 0, this.rowCount - 1);
        this.setSelection({
          startCol: nc, startRow: nr, endCol: nc, endRow: nr,
          activeCol: nc, activeRow: nr,
        });
        return;
      }
      this._renderSelection();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const dc = e.shiftKey ? -1 : 1;
      const nc = clamp(s.activeCol + dc, 0, this.columns.length - 1);
      this.setSelection({
        startCol: nc, startRow: s.activeRow, endCol: nc, endRow: s.activeRow,
        activeCol: nc, activeRow: s.activeRow,
      });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const nr = clamp(s.activeRow + (e.shiftKey ? -1 : 1), 0, this.rowCount - 1);
      this.setSelection({
        startCol: s.activeCol, startRow: nr, endCol: s.activeCol, endRow: nr,
        activeCol: s.activeCol, activeRow: nr,
      });
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this._clearSelection();
      return;
    }

    if (e.key === 'F2') {
      e.preventDefault();
      this._startEdit(s.activeCol, s.activeRow);
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this._startEdit(s.activeCol, s.activeRow, e.key);
      e.preventDefault();
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  EDITING
  // ═══════════════════════════════════════════════════════════

  _startEdit(colIdx, rowIdx, initialChar) {
    if (colIdx < 0 || colIdx >= this.columns.length || rowIdx < 0 || rowIdx >= this.rowCount) return;
    const col = this.columns[colIdx];
    if (col.meta?.lock) {
      this.emit('cell:edit-blocked', {
        columnId: col.id, rowIndex: rowIdx, lock: col.meta.lock, reason: col.meta.reason,
      });
      return;
    }
    this._commitEdit();

    this.editingCell = { colIdx, rowIdx };
    const rows = this.bodyDiv.querySelectorAll('tbody tr');
    const td = rows[rowIdx]?.children[colIdx + 1];
    if (!td) return;

    td.classList.add('cell-editing');
    const val = col.values[rowIdx];
    const formula = col.formulas?.[rowIdx];

    const input = document.createElement('input');
    input.className = 'cell-editor';
    input.type = 'text';
    if (initialChar) {
      input.value = initialChar;
    } else if (formula) {
      input.value = formula;
    } else {
      input.value = val != null ? String(val) : '';
    }
    td.textContent = '';
    td.appendChild(input);
    this.editorEl = input;
    input.focus();
    if (initialChar) {
      input.setSelectionRange(1, 1);
    } else {
      input.select();
    }

    input.addEventListener('blur', () => {
      if (this.editorEl === input && this.editingCell) {
        this._commitEdit();
      }
    });

    this.emit('edit:start', { colIdx, rowIdx, initialChar, formula: !!formula });
  }

  _commitEdit() {
    if (!this.editingCell || !this.editorEl) return;
    const { colIdx, rowIdx } = this.editingCell;
    const col = this.columns[colIdx];
    const rawVal = this.editorEl.value;
    this._typeChanged = false;

    if (isFormula(rawVal)) {
      if (!col.formulas) col.formulas = new Array(this.rowCount).fill(null);
      const oldFormula = col.formulas[rowIdx];
      const oldValue = col.values[rowIdx];
      col.formulas[rowIdx] = rawVal.trim();
      const { result, error } = evaluateFormula(rawVal, this);
      col.values[rowIdx] = error ? null : result;
      this.history.push({
        type: 'cell-edit', columnId: col.id, rowIndex: rowIdx,
        oldValue, newValue: col.values[rowIdx],
        oldFormula, newFormula: col.formulas[rowIdx],
      });
    } else {
      const oldFormula = col.formulas?.[rowIdx] || null;
      if (col.formulas && col.formulas[rowIdx]) col.formulas[rowIdx] = null;
      this.setCellValue(col.id, rowIdx, rawVal);
      if (oldFormula && this.history._stack.length > 0) {
        const lastEntry = this.history._stack[this.history._index];
        if (lastEntry) {
          lastEntry.oldFormula = oldFormula;
          lastEntry.newFormula = null;
        }
      }
    }

    this.editingCell = null;
    this.editorEl = null;

    if (this._typeChanged) {
      this._typeChanged = false;
    }

    if (!this._rendering) {
      this.render();
    }
  }

  _cancelEdit() {
    if (!this.editingCell) return;
    const { colIdx, rowIdx } = this.editingCell;
    const col = this.columns[colIdx];
    const rows = this.bodyDiv.querySelectorAll('tbody tr');
    const td = rows[rowIdx]?.children[colIdx + 1];
    if (td) {
      td.classList.remove('cell-editing');
      const val = col.values[rowIdx];
      td.textContent = val != null ? formatCellValue(col, val) : '';
    }
    this.editingCell = null;
    this.editorEl = null;
  }

  _onEditKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this._commitEdit();
      const nr = clamp(this.selection.activeRow + 1, 0, this.rowCount - 1);
      this.setSelection({
        startCol: this.selection.activeCol, startRow: nr,
        endCol: this.selection.activeCol, endRow: nr,
        activeCol: this.selection.activeCol, activeRow: nr,
      });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      this._commitEdit();
      const nc = clamp(this.selection.activeCol + (e.shiftKey ? -1 : 1), 0, this.columns.length - 1);
      this.setSelection({
        startCol: nc, startRow: this.selection.activeRow,
        endCol: nc, endRow: this.selection.activeRow,
        activeCol: nc, activeRow: this.selection.activeRow,
      });
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this._cancelEdit();
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  CLEAR SELECTION
  // ═══════════════════════════════════════════════════════════

  _clearSelection() {
    if (!this.selection) return;
    const s = this.selection;
    const c1 = Math.min(s.startCol, s.endCol), c2 = Math.max(s.startCol, s.endCol);
    const r1 = Math.min(s.startRow, s.endRow), r2 = Math.max(s.startRow, s.endRow);

    let blockedAny = false;
    const oldData = [];
    const oldFormulas = [];
    for (let c = c1; c <= c2; c++) {
      const col = this.columns[c];
      const oldVals = [];
      const oldFmls = [];
      if (col.meta?.lock) {
        // Skip locked columns — preserve current values for undo round-trip but record nothing changed.
        blockedAny = true;
        for (let r = r1; r <= r2; r++) {
          oldVals.push(col.values[r]);
          oldFmls.push(col.formulas?.[r] || null);
        }
      } else {
        for (let r = r1; r <= r2; r++) {
          oldVals.push(col.values[r]);
          oldFmls.push(col.formulas?.[r] || null);
          col.values[r] = null;
          if (col.formulas) col.formulas[r] = null;
        }
      }
      oldData.push(oldVals);
      oldFormulas.push(oldFmls);
    }
    if (blockedAny) {
      this.emit('cell:edit-blocked', { action: 'clear', startCol: c1, endCol: c2 });
    }
    this.history.push({ type: 'clear', startCol: c1, startRow: r1, oldData, oldFormulas });
    this.render();
  }

  // ═══════════════════════════════════════════════════════════
  //  CLIPBOARD
  // ═══════════════════════════════════════════════════════════

  _onCopy(e) {
    if (!this.selection || this.editingCell) return;
    if (!this.container.contains(document.activeElement) && document.activeElement !== document.body) return;
    e.preventDefault();
    const tsv = this.exportToTSV();
    e.clipboardData.setData('text/plain', tsv);
  }

  _onCut(e) {
    if (!this.selection || this.editingCell) return;
    if (!this.container.contains(document.activeElement) && document.activeElement !== document.body) return;
    e.preventDefault();
    const tsv = this.exportToTSV();
    e.clipboardData.setData('text/plain', tsv);
    this._clearSelection();
  }

  _onPaste(e) {
    if (this.editingCell) return;
    if (!this.container.contains(document.activeElement) && document.activeElement !== document.body) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (text) this.importFromClipboard(text);
  }

  // ═══════════════════════════════════════════════════════════
  //  CONTEXT MENUS
  // ═══════════════════════════════════════════════════════════

  _onHeaderContextMenu(e) {
    e.preventDefault();
    const th = e.target.closest('th[data-col-idx]');
    if (!th) return;
    const colIdx = parseInt(th.dataset.colIdx);
    const col = this.columns[colIdx];
    if (!col) return;

    const t = (k) => this._t(`ui.datagrid.${k}`);
    const isHardLocked = col.meta?.lock === 'hard';
    const items = [
      { label: t('renameColumn'), action: () => this._promptRenameColumn(colIdx) },
      { type: 'sep' },
      { label: t('sortAsc'), action: () => { this.sortCol = null; this.sortDir = null; this.sortByColumn(colIdx); } },
      { label: t('sortDesc'), action: () => { this.sortCol = colIdx; this.sortDir = 'asc'; this.sortByColumn(colIdx); } },
      { type: 'sep' },
      { label: t('insertColLeft'), action: () => this.addColumn({ position: colIdx }) },
      { label: t('insertColRight'), action: () => this.addColumn({ position: colIdx + 1 }) },
      { type: 'sep' },
      { label: t('columnStats'), action: () => this._showColumnStats(colIdx) },
      { label: t('columnScan'), action: () => this._showColumnScan(colIdx) },
    ];
    if (!isHardLocked) {
      items.push({ type: 'sep' });
      items.push({ label: t('deleteColumn'), danger: true, action: () => this.removeColumn(col.id) });
    }
    this._showContextMenu(e.clientX, e.clientY, items);
  }

  _onBodyContextMenu(e) {
    e.preventDefault();
    const t = (k) => this._t(`ui.datagrid.${k}`);
    if (e.target.classList.contains('datagrid__row-header')) {
      const rowIdx = parseInt(e.target.dataset.rowIdx);
      this._showContextMenu(e.clientX, e.clientY, [
        { label: t('insertRowAbove'), action: () => this.addRows(1, rowIdx) },
        { label: t('insertRowBelow'), action: () => this.addRows(1, rowIdx + 1) },
        { type: 'sep' },
        { label: t('deleteRow'), danger: true, action: () => this.removeRows([rowIdx]) },
      ]);
      return;
    }

    const cell = this._getCellFromEvent(e);
    if (!cell) return;
    const menuItems = [
      { label: t('editCell'), action: () => this._startEdit(cell.colIdx, cell.rowIdx) },
      { label: t('clearSelection'), action: () => this._clearSelection() },
      { type: 'sep' },
      { label: t('insertRowAbove'), action: () => this.addRows(1, cell.rowIdx) },
      { label: t('insertRowBelow'), action: () => this.addRows(1, cell.rowIdx + 1) },
      { type: 'sep' },
      { label: t('deleteSelectedRows'), danger: true, action: () => {
        if (!this.selection) return;
        const r1 = Math.min(this.selection.startRow, this.selection.endRow);
        const r2 = Math.max(this.selection.startRow, this.selection.endRow);
        const indices = [];
        for (let r = r1; r <= r2; r++) indices.push(r);
        this.removeRows(indices);
      }},
    ];
    this._showContextMenu(e.clientX, e.clientY, menuItems);
  }

  _showContextMenu(x, y, items) {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    for (const item of items) {
      if (item.type === 'sep') {
        const sep = document.createElement('div');
        sep.className = 'context-menu__sep';
        menu.appendChild(sep);
        continue;
      }
      const el = document.createElement('div');
      el.className = 'context-menu__item' + (item.danger ? ' context-menu__item--danger' : '');
      el.innerHTML = `<span>${item.label}</span>` +
        (item.shortcut ? `<span class="context-menu__shortcut">${item.shortcut}</span>` : '');
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this._closeContextMenu();
        item.action();
      });
      menu.appendChild(el);
    }

    document.body.appendChild(menu);
    this._contextMenu = menu;

    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
      if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
    });
  }

  _showExportMenu(btn) {
    const rect = btn.getBoundingClientRect();
    this._showContextMenu(rect.left, rect.bottom + 2, [
      { label: 'Excel (.xlsx)', action: () => this.downloadXLSX() },
      { label: 'CSV (.csv)', action: () => this.downloadCSV() },
      { label: 'JSON (.json)', action: () => this.downloadJSON() },
    ]);
  }

  _closeContextMenu() {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  COLUMN ACTIONS
  // ═══════════════════════════════════════════════════════════

  _promptRenameColumn(colIdx) {
    const col = this.columns[colIdx];
    const name = prompt('Column name:', col.name || '');
    if (name !== null) this.renameColumn(col.id, name);
  }

  _setColumnType(colIdx, type) {
    const col = this.columns[colIdx];
    if (!col || col.type === type) return;
    if (col.meta?.lock) {
      this.emit('column:edit-blocked', {
        columnId: col.id, action: 'type-change', lock: col.meta.lock, reason: col.meta.reason,
      });
      return;
    }
    col.type = type;

    if (isNumericType(type)) {
      col.values = col.values.map(v => {
        if (v == null) return null;
        const n = parseNumeric(v);
        return n !== null ? n : null;
      });
      if (type === 'currency' && !col.format.decimals) col.format.decimals = 2;
      if (type === 'percent' && !col.format.decimals) col.format.decimals = 1;
    } else if (type === 'text') {
      col.values = col.values.map(v => v == null ? null : String(v));
    } else if (type === 'date') {
      col.values = col.values.map(v => v == null ? null : parseCellInput({ type: 'date' }, String(v)));
    } else if (type === 'time') {
      col.values = col.values.map(v => v == null ? null : parseCellInput({ type: 'time' }, String(v)));
    }

    this.render();
    this.emit('column:type-changed', { columnId: col.id, newType: type });
  }

  _showTypePicker(colIdx, anchorEl) {
    this._closeTypePicker();
    const col = this.columns[colIdx];
    if (!col) return;

    const picker = document.createElement('div');
    picker.className = 'type-picker';

    const title = document.createElement('div');
    title.className = 'type-picker__title';
    title.textContent = `Column type: ${col.shortName}`;
    picker.appendChild(title);

    for (const [typeKey, typeDef] of Object.entries(COLUMN_TYPES)) {
      const item = document.createElement('div');
      item.className = 'type-picker__item' + (col.type === typeKey ? ' active' : '');

      const badge = document.createElement('span');
      badge.className = `type-picker__badge col-type-${typeKey}`;
      badge.textContent = typeDef.badge;

      const label = document.createElement('span');
      label.textContent = this._typeLabel(typeKey);

      item.appendChild(badge);
      item.appendChild(label);

      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this._closeTypePicker();
        this._setColumnType(colIdx, typeKey);
      });

      picker.appendChild(item);
    }

    document.body.appendChild(picker);
    this._typePicker = picker;

    requestAnimationFrame(() => {
      const anchorRect = anchorEl.getBoundingClientRect();
      const pickerRect = picker.getBoundingClientRect();
      let top = anchorRect.bottom + 4;
      let left = anchorRect.left;
      if (left + pickerRect.width > window.innerWidth) left = window.innerWidth - pickerRect.width - 8;
      if (top + pickerRect.height > window.innerHeight) top = anchorRect.top - pickerRect.height - 4;
      picker.style.left = left + 'px';
      picker.style.top = top + 'px';
    });

    const closeHandler = (ev) => {
      if (!picker.contains(ev.target)) {
        this._closeTypePicker();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  }

  _closeTypePicker() {
    if (this._typePicker) {
      this._typePicker.remove();
      this._typePicker = null;
    }
  }

  _showColumnStats(colIdx) {
    const col = this.columns[colIdx];
    if (!col) return;
    const t = (k) => this._t(`ui.datagrid.${k}`);

    this._closeColumnStats();

    const vals = col.values.slice(0, this.rowCount).filter(v => v != null);
    const colLabel = col.name ? `${col.shortName} · ${col.name}` : col.shortName;

    const overlay = document.createElement('div');
    overlay.className = 'column-scan-overlay column-scan-overlay--modal';

    const panel = document.createElement('div');
    panel.className = 'column-scan';

    let bodyHtml = '';

    if (isNumericType(col.type)) {
      const nums = vals.filter(v => typeof v === 'number');
      if (nums.length > 0) {
        const sum = nums.reduce((a, b) => a + b, 0);
        const mean = sum / nums.length;
        const sorted = [...nums].sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const median = nums.length % 2 === 0
          ? (sorted[nums.length / 2 - 1] + sorted[nums.length / 2]) / 2
          : sorted[Math.floor(nums.length / 2)];
        const variance = nums.length > 1 ? nums.reduce((a, v) => a + (v - mean) ** 2, 0) / (nums.length - 1) : 0;
        const stddev = Math.sqrt(variance);

        const rows = [
          ['n', nums.length],
          [t('statsEmpty'), this.rowCount - vals.length],
          null,
          ['\u0078\u0304 (' + t('statsMean') + ')', mean.toFixed(4)],
          ['s (' + t('statsStddev') + ')', stddev.toFixed(4)],
          ['Min', min],
          ['Median', median.toFixed(4)],
          ['Max', max],
          ['\u03A3 (' + t('statsSum') + ')', sum.toFixed(4)],
        ];
        bodyHtml = `<table class="column-stats__table">`;
        for (const row of rows) {
          if (!row) {
            bodyHtml += `<tr class="column-stats__sep"><td colspan="2"></td></tr>`;
          } else {
            bodyHtml += `<tr><td class="column-stats__label">${row[0]}</td><td class="column-stats__value">${row[1]}</td></tr>`;
          }
        }
        bodyHtml += `</table>`;
      } else {
        bodyHtml = `<div class="column-scan__overview"><span>${t('statsNoNumeric')}</span></div>`;
      }
    } else {
      const unique = new Set(vals.map(v => String(v)));
      const rows = [
        ['n', vals.length],
        [t('statsEmpty'), this.rowCount - vals.length],
        [t('statsUnique'), unique.size],
      ];
      bodyHtml = `<table class="column-stats__table">`;
      for (const row of rows) {
        bodyHtml += `<tr><td class="column-stats__label">${row[0]}</td><td class="column-stats__value">${row[1]}</td></tr>`;
      }
      bodyHtml += `</table>`;
    }

    panel.innerHTML = `
      <div class="column-scan__header">
        <div class="column-scan__title">${t('columnStats')}</div>
        <div class="column-scan__subtitle">${colLabel} — ${this._typeLabel(col.type)}</div>
        <button class="column-scan__close">\u00D7</button>
      </div>
      <div class="column-scan__body">${bodyHtml}</div>`;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this._columnStats = overlay;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._closeColumnStats();
    });
    panel.querySelector('.column-scan__close').addEventListener('click', () => this._closeColumnStats());
  }

  _closeColumnStats() {
    if (this._columnStats) {
      this._columnStats.remove();
      this._columnStats = null;
    }
  }

  _showColumnScan(colIdx) {
    this._closeColumnScan();

    const col = this.columns[colIdx];
    if (!col) return;

    const overlay = document.createElement('div');
    overlay.className = 'column-scan-overlay';
    overlay.style.pointerEvents = 'none';

    const panel = document.createElement('div');
    panel.className = 'column-scan';
    panel.style.pointerEvents = 'auto';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    this._columnScanState = { colIdx, overlay, panel };
    this._refreshColumnScan();

    this._columnScanRenderHandler = () => {
      if (this._columnScanState) this._refreshColumnScan();
    };
    this.on('render', this._columnScanRenderHandler);
  }

  _refreshColumnScan() {
    const { colIdx, panel } = this._columnScanState;
    const col = this.columns[colIdx];
    if (!col) { this._closeColumnScan(); return; }

    const t = (k) => this._t(`ui.datagrid.${k}`);
    const scan = analyzeColumn(col, this.rowCount);
    const colLabel = col.name ? `${col.shortName} · ${col.name}` : col.shortName;
    const filled = scan.total - scan.empty;
    const dominantLabel = scan.dominantType
      ? this._typeLabel(scan.dominantType)
      : '—';

    const typeLabels = { numeric: '#', text: 'Abc', date: '\u{1F4C5}', time: '\u{1F550}', currency: '\u20AC', percent: '%' };

    let html = `
      <div class="column-scan__header">
        <div class="column-scan__title">${t('scanTitle')}</div>
        <div class="column-scan__subtitle">${colLabel} — ${t('scanDominant')}: ${dominantLabel}</div>
        <button class="column-scan__close">\u00D7</button>
      </div>
      <div class="column-scan__body">
        <div class="column-scan__overview">
          <span>${t('scanTotal')}: <strong>${scan.total}</strong></span>
          <span>${t('scanFilled')}: <strong>${filled}</strong></span>
          <span>${t('scanEmpty')}: <strong>${scan.empty}</strong></span>
        </div>`;

    if (filled > 0) {
      html += `<div class="column-scan__bar">`;
      for (const [type, info] of Object.entries(scan.types)) {
        const pct = (info.count / filled * 100).toFixed(1);
        html += `<div class="column-scan__bar-seg column-scan__bar-seg--${type}" title="${type}: ${info.count} (${pct}%)" style="width:${pct}%">${typeLabels[type] || type}</div>`;
      }
      html += `</div>`;

      html += `<div class="column-scan__types">`;
      for (const [type, info] of Object.entries(scan.types)) {
        const pct = (info.count / filled * 100).toFixed(1);
        const isDominant = type === scan.dominantType;
        html += `<div class="column-scan__type-row${isDominant ? ' column-scan__type-row--dominant' : ''}">
          <span class="column-scan__type-badge column-scan__type-badge--${type}">${typeLabels[type] || type}</span>
          <span class="column-scan__type-label">${this._typeLabel(type)}</span>
          <span class="column-scan__type-count">${info.count}</span>
          <span class="column-scan__type-pct">${pct}%</span>
        </div>`;
      }
      html += `</div>`;
    }

    if (scan.outliers.count > 0) {
      html += `<div class="column-scan__mismatch">
        <div class="column-scan__mismatch-header">${t('scanOutliers').replace('{n}', scan.outliers.count)}</div>
        <div class="column-scan__mismatch-list">`;
      const maxShow = 50;
      const showCount = Math.min(scan.outliers.count, maxShow);
      for (let i = 0; i < showCount; i++) {
        const row = scan.outliers.rows[i];
        const val = scan.outliers.values[i];
        const oType = scan.outliers.types[i];
        const badge = typeLabels[oType] || oType;
        const display = val.length > 30 ? val.substring(0, 27) + '\u2026' : val;
        html += `<div class="column-scan__mismatch-row" data-row="${row}" data-col="${colIdx}">
          <span class="column-scan__mismatch-rownum">${t('scanRow')} ${row + 1}</span>
          <span class="column-scan__type-badge column-scan__type-badge--sm column-scan__type-badge--${oType}">${badge}</span>
          <span class="column-scan__mismatch-val">${this._escHtml(display)}</span>
        </div>`;
      }
      if (scan.outliers.count > maxShow) {
        html += `<div class="column-scan__mismatch-more">\u2026 ${t('scanMore').replace('{n}', scan.outliers.count - maxShow)}</div>`;
      }
      html += `</div></div>`;
    } else if (filled > 0) {
      html += `<div class="column-scan__ok">\u2714 ${t('scanAllMatch')}</div>`;
    }

    html += `</div>`;
    panel.innerHTML = html;

    panel.querySelector('.column-scan__close').addEventListener('click', () => this._closeColumnScan());

    panel.querySelectorAll('.column-scan__mismatch-row').forEach(el => {
      el.addEventListener('click', () => {
        const r = parseInt(el.dataset.row);
        const c = parseInt(el.dataset.col);
        this.setSelection({ startCol: c, startRow: r, endCol: c, endRow: r, activeCol: c, activeRow: r });
        this.render();
        const cell = this.container.querySelector(`td[data-col-idx="${c}"][data-row-idx="${r}"]`);
        if (cell) cell.scrollIntoView({ block: 'center', behavior: 'smooth' });

        panel.querySelectorAll('.column-scan__mismatch-row').forEach(r => r.classList.remove('column-scan__mismatch-row--active'));
        el.classList.add('column-scan__mismatch-row--active');
      });
    });
  }

  _closeColumnScan() {
    if (this._columnScanRenderHandler) {
      this.off('render', this._columnScanRenderHandler);
      this._columnScanRenderHandler = null;
    }
    if (this._columnScanState) {
      this._columnScanState.overlay.remove();
      this._columnScanState = null;
    }
  }

  _escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  _typeLabel(type) {
    const key = 'type' + type.charAt(0).toUpperCase() + type.slice(1);
    const translated = this._t(`ui.datagrid.${key}`);
    if (translated !== key && !translated.endsWith(key)) return translated;
    return COLUMN_TYPES[type]?.label || type;
  }

  // ═══════════════════════════════════════════════════════════
  //  FILE IMPORT
  // ═══════════════════════════════════════════════════════════

  _handleFileImport(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv' || ext === 'tsv') {
      this._importCSV(file);
    } else {
      this._toast('Unsupported format: ' + ext, 'error');
    }
  }

  async _importCSV(file) {
    const text = await file.text();
    const delim = this._detectDelimiter(text);
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
    const rows = lines.map(l => this._parseCSVLine(l, delim));
    if (rows.length === 0) return;

    const first = rows[0];
    const rest = rows.slice(1);
    let hasHeader = false;
    if (rest.length > 0) {
      const firstNumeric = first.every(v => parseNumeric(v) !== null);
      if (!firstNumeric) hasHeader = true;
    }

    // Direct import (no preview modal in module context — use context.showModal for that)
    const header = hasHeader ? rows[0] : null;
    const data = hasHeader ? rows.slice(1) : rows;
    const numCols = Math.max(...rows.map(r => r.length));

    const oldColumns = this.columns.map(c => ({ ...c, values: [...c.values] }));
    const oldRowCount = this.rowCount;

    const columns = [];
    for (let c = 0; c < numCols; c++) {
      const col = {
        id: uid(),
        name: header ? (header[c] || '').trim() : '',
        shortName: `C${c + 1}`,
        type: 'numeric',
        unit: null,
        values: data.map(row => {
          const raw = (row[c] || '').trim();
          if (raw === '') return null;
          const n = parseNumeric(raw);
          return n !== null ? n : raw;
        }),
        format: {},
      };
      this._autoDetectType(col);
      columns.push(col);
    }

    this.history.push({ type: 'import', oldColumns, oldRowCount });
    this.setData(columns);
    this.metadata.source = 'csv-import';
    this._toast(`${file.name}: ${columns.length} cols \u00D7 ${data.length} rows`, 'success');
  }

  _detectDelimiter(text) {
    const sample = text.split('\n').slice(0, 5).join('\n');
    const counts = { ',': 0, ';': 0, '\t': 0 };
    for (const ch of sample) {
      if (ch in counts) counts[ch]++;
    }
    if (counts['\t'] > 0) return '\t';
    if (counts[';'] >= counts[',']) return ';';
    return ',';
  }

  _parseCSVLine(line, delim) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === delim) { result.push(current); current = ''; }
        else { current += ch; }
      }
    }
    result.push(current);
    return result;
  }

  // ═══════════════════════════════════════════════════════════
  //  EXPORT
  // ═══════════════════════════════════════════════════════════

  downloadCSV() {
    const csv = this.exportToCSV();
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    this._downloadBlob(blob, 'data.csv');
  }

  async downloadXLSX() {
    try {
      await _ensureXLSX();
    } catch {
      this._toast('XLSX library not loaded', 'error');
      return;
    }
    const wb = XLSX.utils.book_new();
    const headers = this.columns.map(c => c.name || c.shortName);
    const rows = [];
    for (let r = 0; r < this.rowCount; r++) {
      const row = {};
      this.columns.forEach((col, ci) => {
        row[headers[ci]] = col.values[r];
      });
      rows.push(row);
    }
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, 'data.xlsx');
  }

  downloadJSON() {
    const headers = this.columns.map(c => c.name || c.shortName);
    const rows = [];
    for (let r = 0; r < this.rowCount; r++) {
      const row = {};
      this.columns.forEach((col, ci) => {
        row[headers[ci]] = col.values[r];
      });
      rows.push(row);
    }
    const json = JSON.stringify(rows, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    this._downloadBlob(blob, 'data.json');
  }

  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ═══════════════════════════════════════════════════════════
  //  LIFECYCLE
  // ═══════════════════════════════════════════════════════════

  destroy() {
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('mouseup', this._boundMouseUp);
    document.removeEventListener('keydown', this._boundKeyDown);
    document.removeEventListener('paste', this._boundPaste);
    document.removeEventListener('copy', this._boundCopy);
    document.removeEventListener('cut', this._boundCut);
    document.removeEventListener('click', this._boundClick);
    this._closeContextMenu();
    this._closeTypePicker();
    this._closeColumnScan();
    this._closeColumnStats();
    this.container.innerHTML = '';
  }
}
