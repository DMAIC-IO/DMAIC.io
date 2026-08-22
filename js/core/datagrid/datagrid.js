/**
 * D.Mike — DataGrid (datagrid.js)
 * Main spreadsheet component: rendering, editing, selection, clipboard, I/O.
 * Column-oriented data model with formula support.
 */

import { History } from './datagrid-history.js';
import { isFormula, evaluateFormula, recalcAllFormulas } from './datagrid-formula.js';
import { detectPattern, generateFill, shiftFormulaRefs, withCtrlModifier } from './datagrid-fill.js';
import {
  uid, clamp, parseNumeric, formatNumber,
  COLUMN_TYPES, isNumericType, formatCellValue, renderColTypeBadge,
  parseCellInput, detectInputType, analyzeColumn,
  DATE_FORMATS, TIME_FORMATS,
} from './datagrid-utils.js';
import {
  ROLE, ALL_ROLES, inferRole, defaultRoleForType, isRoleValidForType, validRolesForType,
} from './datagrid-roles.js';
import { shortcutRegistry } from '../shortcut-registry.js';
import { h } from '../dom.js';
import { icon } from '../icon.js';

export { isFormula, evaluateFormula } from './datagrid-formula.js';
import { ensureXLSX as _ensureXLSX, XLSX } from '../export-utils.js';
export { COLUMN_TYPES, isNumericType, formatCellValue, uid } from './datagrid-utils.js';
export { ROLE, ALL_ROLES } from './datagrid-roles.js';

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
    // Additional non-contiguous columns selected via Ctrl/Cmd+click on the
    // column header. `selection` still holds the most-recently-clicked column
    // as the "anchor" for cell-level operations; this set holds the others.
    this._extraSelectedCols = new Set();

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
    this.columns = columnData.map((c, i) => {
      const col = {
        id: c.id || uid(),
        name: c.name || '',
        shortName: c.shortName || `C${i + 1}`,
        type: c.type || 'numeric',
        unit: c.unit || null,
        values: [...c.values],
        formulas: c.formulas ? [...c.formulas] : new Array(c.values.length).fill(null),
        format: c.format || {},
        meta: c.meta ? { ...c.meta } : null,
        role: c.role || null,
        roleManual: c.roleManual === true,
      };
      // Infer role from data when not provided (covers both fresh imports
      // and legacy worksheets restored via setState → setData paths).
      if (!col.role) col.role = inferRole(col);
      return col;
    });
    this.rowCount = Math.max(0, ...this.columns.map(c => c.values.length));
    for (const col of this.columns) {
      while (col.values.length < this.rowCount) col.values.push(null);
      while (col.formulas.length < this.rowCount) col.formulas.push(null);
    }
    this._reassignShortNames();
    this.selection = null;
    this._extraSelectedCols.clear();
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
    const type = opts.type || 'numeric';
    const col = {
      id: uid(),
      name: opts.name || '',
      shortName: '',
      type,
      unit: opts.unit || null,
      values: new Array(this.rowCount).fill(null),
      formulas: new Array(this.rowCount).fill(null),
      format: opts.format || {},
      meta: opts.meta ? { ...opts.meta } : null,
      role: opts.role || defaultRoleForType(type),
      roleManual: opts.roleManual === true,
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
    // Indices in the additive set are positional, so column removal can
    // shift them. Drop them rather than try to remap.
    this._extraSelectedCols.clear();
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

  /**
   * Set the analytical role of a column. Marks `roleManual = true` so the
   * heuristic will not override the user's choice on subsequent type changes
   * (unless the chosen role becomes invalid for the new storage type).
   *
   * @param {string} columnId
   * @param {string} role — one of ALL_ROLES
   * @param {{ auto?: boolean }} [options] — `auto: true` is reserved for
   *   internal re-inference and leaves `roleManual` untouched.
   */
  setColumnRole(columnId, role, options = {}) {
    const col = this.getColumn(columnId);
    if (!col) return;
    if (!ALL_ROLES.includes(role)) return;
    if (!isRoleValidForType(role, col.type)) return;
    if (col.meta?.lock && options.auto !== true && !options.bypassLock) {
      this.emit('column:edit-blocked', {
        columnId, action: 'role-change', lock: col.meta.lock, reason: col.meta.reason,
      });
      return;
    }
    const oldRole = col.role;
    if (oldRole === role && (options.auto === true || col.roleManual)) return;
    col.role = role;
    if (options.auto !== true) col.roleManual = true;
    if (options.auto !== true) this.render();
    this.emit('column:role-changed', {
      columnId, oldRole, newRole: role, auto: options.auto === true,
    });
  }

  /**
   * Merge a display-format patch into `col.format` and re-render.
   * Recognized keys: `decimals` (number|null), `dateFormat` (string|null),
   * `timeFormat` (string|null), `currencySymbol` (string).
   * `null` removes the key, restoring the type's built-in default.
   *
   * @param {string} columnId
   * @param {Object} patch
   */
  setColumnFormat(columnId, patch, options = {}) {
    const col = this.getColumn(columnId);
    if (!col || !patch || typeof patch !== 'object') return;
    if (col.meta?.lock && !options.bypassLock) {
      this.emit('column:edit-blocked', {
        columnId, action: 'format-change', lock: col.meta.lock, reason: col.meta.reason,
      });
      return;
    }
    const oldFormat = { ...col.format };
    const next = { ...col.format };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) delete next[k];
      else next[k] = v;
    }
    col.format = next;
    this.render();
    this.emit('column:format-changed', { columnId, oldFormat, newFormat: { ...next } });
  }

  /**
   * Re-evaluate the role after a storage-type change. Respects `roleManual`
   * as long as the manual role is still valid for the new type; otherwise
   * resets the manual flag and falls back to the heuristic.
   * @private
   */
  _reinferRoleAfterTypeChange(col) {
    if (col.roleManual && isRoleValidForType(col.role, col.type)) return;
    const oldRole = col.role;
    const newRole = inferRole(col);
    if (col.roleManual && !isRoleValidForType(col.role, col.type)) {
      col.roleManual = false;
    }
    if (newRole !== oldRole) {
      col.role = newRole;
      this.emit('column:role-changed', {
        columnId: col.id, oldRole, newRole, auto: true,
      });
    }
  }

  renameColumn(columnId, newName, options = {}) {
    const col = this.getColumn(columnId);
    if (!col) return;
    if (col.meta?.lock && !options.bypassLock) {
      this.emit('column:edit-blocked', {
        columnId, action: 'rename', lock: col.meta.lock, reason: col.meta.reason,
      });
      return;
    }
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
    } else if (col.type === 'binary') {
      // Strict binary: only 0 or 1 are accepted; everything else becomes null.
      col.values[rowIndex] = parseCellInput(col, value);
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
            this._reinferRoleAfterTypeChange(col);
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
      } else if (detectedType && detectedType !== col.type) {
          this._switchColumnType(col, columnId, rowIndex, detected);
        } else {
          col.values[rowIndex] = parseCellInput(col, value);
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
    this._reinferRoleAfterTypeChange(col);
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
    this.columns = state.columns.map(c => {
      const col = {
        ...c,
        values: [...c.values],
        formulas: c.formulas ? [...c.formulas] : null,
        format: c.format ? { ...c.format } : {},
        roleManual: c.roleManual === true,
      };
      // Migration for worksheets saved before column.role existed: infer
      // from current type + values rather than leaving the field undefined.
      if (!col.role) col.role = inferRole(col);
      return col;
    });
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
    // Any explicit selection replacement also drops the additive
    // column set — Ctrl+click paths re-populate it AFTER calling us.
    this._extraSelectedCols.clear();
    this._renderSelection();
    let activeCell = null;
    if (range
      && range.startCol === range.endCol
      && range.startRow === range.endRow) {
      const col = this.columns[range.startCol];
      if (col) {
        activeCell = {
          value:   col.values?.[range.startRow]   ?? null,
          formula: col.formulas?.[range.startRow] ?? null,
        };
      }
    }
    this.emit('selection:changed', { range: this.selection, activeCell });
  }

  selectColumn(colIdx) {
    this.setSelection({
      startCol: colIdx, startRow: 0,
      endCol: colIdx, endRow: this.rowCount - 1,
      activeCol: colIdx, activeRow: 0,
    });
  }

  /**
   * Ctrl/Cmd+click on a column header: toggle the column in the current
   * multi-selection. The anchor (main range) tracks the most-recently-
   * clicked column for cell-level operations; remaining columns live in
   * `_extraSelectedCols`. When the toggle empties the union, the selection
   * clears entirely.
   */
  toggleColumnSelection(colIdx) {
    if (colIdx < 0 || colIdx >= this.columns.length) return;
    const union = new Set();
    if (this.selection) {
      const a = Math.min(this.selection.startCol, this.selection.endCol);
      const b = Math.max(this.selection.startCol, this.selection.endCol);
      for (let i = a; i <= b; i++) union.add(i);
    }
    this._extraSelectedCols.forEach(i => union.add(i));

    if (union.has(colIdx)) union.delete(colIdx);
    else union.add(colIdx);

    if (union.size === 0) {
      this.setSelection(null);
      return;
    }

    // Prefer the just-clicked column as the new anchor; fall back to the
    // smallest remaining index when the toggle removed the click target.
    const anchor = union.has(colIdx) ? colIdx : Math.min(...union);
    union.delete(anchor);
    // setSelection clears _extraSelectedCols, so re-populate afterwards.
    this.setSelection({
      startCol: anchor, startRow: 0,
      endCol: anchor, endRow: this.rowCount - 1,
      activeCol: anchor, activeRow: 0,
    });
    union.forEach(i => this._extraSelectedCols.add(i));
    this._renderSelection();
    this.emit('selection:changed', { range: this.selection });
  }

  /**
   * Sorted union of column indices in the current selection: range columns
   * plus additive columns from Ctrl/Cmd+click. Used by callers (worksheet,
   * chart-suggestion) to drive multi-column features.
   */
  getSelectedColumnIndices() {
    const set = new Set();
    if (this.selection) {
      const a = Math.min(this.selection.startCol, this.selection.endCol);
      const b = Math.max(this.selection.startCol, this.selection.endCol);
      for (let i = a; i <= b; i++) {
        if (i >= 0 && i < this.columns.length) set.add(i);
      }
    }
    this._extraSelectedCols.forEach(i => {
      if (i >= 0 && i < this.columns.length) set.add(i);
    });
    return [...set].sort((a, b) => a - b);
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
      case 'fill': {
        // Restore each (col, row) we touched to its pre-fill value & formula.
        for (const colIdx of Object.keys(action.oldData)) {
          const col = this.columns[parseInt(colIdx)];
          if (!col) continue;
          const valMap = action.oldData[colIdx];
          const fmlMap = action.oldFormulas?.[colIdx] || {};
          for (const rowIdx of Object.keys(valMap)) {
            const r = parseInt(rowIdx);
            col.values[r] = valMap[rowIdx];
            if (col.formulas) col.formulas[r] = fmlMap[rowIdx] ?? null;
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
      case 'fill': {
        for (const colIdx of Object.keys(action.newData)) {
          const col = this.columns[parseInt(colIdx)];
          if (!col) continue;
          const valMap = action.newData[colIdx];
          const fmlMap = action.newFormulas?.[colIdx] || {};
          for (const rowIdx of Object.keys(valMap)) {
            const r = parseInt(rowIdx);
            col.values[r] = valMap[rowIdx];
            if (col.formulas) col.formulas[r] = fmlMap[rowIdx] ?? null;
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

    // Paste path: type changed silently above. Re-infer role from the
    // now-populated values so a freshly pasted column gets a meaningful role.
    this._reinferRoleAfterTypeChange(col);
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
          s = `"${  s.replace(/"/g, '""')  }"`;
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
        role: ROLE.CONTINUOUS,
        roleManual: false,
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

    // Fill-handle drag preview overlay (Excel-like dashed marquee).
    // Lives inside scrollDiv so it auto-scrolls with the content.
    this.fillPreviewEl = document.createElement('div');
    this.fillPreviewEl.className = 'datagrid__fill-preview';
    this.fillPreviewEl.style.display = 'none';
    this.scrollDiv.appendChild(this.fillPreviewEl);

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
    this.container.style.setProperty('--datagrid-row-header-width', `${width  }px`);
  }

  _renderHeader() {
    const cols = this.columns;

    // Rebuild the shared <colgroup> with one <col> per column (plus the
    // row-header col). Widths are inline styles, not user content.
    const existing = this.tableEl.querySelector('colgroup');
    if (existing) existing.remove();
    const colgroup = h('colgroup',
      null,
      h('col', { style: 'width:var(--datagrid-row-header-width)' }),
      ...cols.map((col) => h('col', { style: `width:${this._getColWidth(col)}px` })),
    );
    this.tableEl.prepend(colgroup);

    // ── Corner cell: export button (+ optional "open in worksheet") ──
    const exportBtn = h('button',
      { class: 'datagrid__export-btn', type: 'button', title: 'Export' },
      icon('action.download'),
    );
    const cornerBtns = h('div', { class: 'datagrid__corner-btns' }, exportBtn);
    if (this.options.openInWorksheet) {
      cornerBtns.append(h('button',
        {
          class: 'datagrid__open-in-ws-btn',
          type: 'button',
          title: this._t('ui.datagrid.openInWorksheet'),
        },
        icon('nav.external'),
      ));
    }
    const cornerTh = h('th', { class: 'datagrid__row-header datagrid__corner' }, cornerBtns);

    // ── One header cell per column ──
    const tr = h('tr', { class: 'datagrid__column-header' }, cornerTh);
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const roleKey = col.role || defaultRoleForType(col.type);
      const manualMark = col.roleManual ? ' col-type-badge--role-manual' : '';
      let badgeTitle = `${this._typeLabel(col.type)} · ${this._roleLabel(roleKey)}`;
      if (col.roleManual) {
        const suffix = this._t('ui.datagrid.roleManualSuffix');
        badgeTitle += ` ${  (suffix && suffix !== 'roleManualSuffix') ? suffix : '(manual)'}`;
      }
      const typeTag = h('span', {
        class: `col-type-badge col-role-${roleKey}${manualMark}`,
        'data-col-idx': i,
        title: badgeTitle,
      }, renderColTypeBadge(col.type));

      const sortClass = this.sortCol === i ? (this.sortDir === 'asc' ? ' sorted-asc' : ' sorted-desc') : '';
      const lockClass = col.meta?.lock ? ` col-locked col-locked--${col.meta.lock}` : '';

      const th = h('th', {
        'data-col-idx': i,
        class: `${sortClass}${lockClass}`,
      });
      th.append(
        h('span', { class: 'col-id' }, col.shortName),
        ' ',
        typeTag,
        ' ',
      );

      if (col.meta?.lock) {
        th.append(h('span',
          { class: 'col-lock-icon', title: this._lockTooltip(col) },
          icon(col.meta.lock === 'hard' ? 'action.lock' : 'action.unlock'),
        ));
      }

      if (col.name) {
        const nameSpan = h('span', { class: 'col-name' }, col.name);
        if (col.unit) {
          nameSpan.append(' ', h('span', { class: 'col-unit' }, `[${col.unit}]`));
        }
        th.append(nameSpan);
      }

      th.append(h('div', { class: 'col-resize-handle', 'data-col-idx': i }));
      tr.append(th);
    }

    this.theadEl.replaceChildren(tr);
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
              td.title = `${formula  } \u2192 ${  error}`;
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

    this.tbodyEl.replaceChildren(frag);
  }

  _renderSelection() {
    this.bodyDiv.querySelectorAll('.cell-selected, .cell-active, .cell-fill-anchor').forEach(el => {
      el.classList.remove('cell-selected', 'cell-active', 'cell-fill-anchor');
    });
    this.headerDiv.querySelectorAll('.col-selected').forEach(el => el.classList.remove('col-selected'));
    this.bodyDiv.querySelectorAll('.row-header-selected').forEach(el => el.classList.remove('row-header-selected'));
    // Detach the fill handle whenever selection changes — gets re-attached
    // at the bottom-right of the new selection below.
    if (this.fillHandleEl?.parentNode) this.fillHandleEl.parentNode.removeChild(this.fillHandleEl);
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

    // Additive columns from Ctrl/Cmd+click — highlight header AND every cell
    // in the column, mirroring the way the range columns above appear.
    if (this._extraSelectedCols.size > 0) {
      this._extraSelectedCols.forEach(c => {
        if (c < 0 || c >= this.columns.length) return;
        if (c >= c1 && c <= c2) return;
        thRow?.children[c + 1]?.classList.add('col-selected');
        for (let r = 0; r < rows.length; r++) {
          rows[r].children[c + 1]?.classList.add('cell-selected');
        }
      });
    }

    // Fill handle on the bottom-right cell of the selection bounding box.
    // Anchor cell needs overflow:visible so the handle can extend slightly
    // past the cell edge — that's what .cell-fill-anchor enables in CSS.
    if (!this.editingCell) {
      const anchorTd = rows[r2]?.children[c2 + 1];
      if (anchorTd) {
        anchorTd.classList.add('cell-fill-anchor');
        if (!this.fillHandleEl) {
          this.fillHandleEl = document.createElement('div');
          this.fillHandleEl.className = 'datagrid__fill-handle';
          this.fillHandleEl.addEventListener('mousedown', (e) => this._onFillHandleMouseDown(e));
        }
        anchorTd.appendChild(this.fillHandleEl);
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
        if (!isNaN(colIdx)) this._showColumnAttrPicker(colIdx, badge);
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
    if (this._fillDrag) {
      this._updateFillDrag(e);
      return;
    }

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
    if (this._fillDrag) { this._finishFillDrag(); return; }
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

  // ─── Fill-handle drag (Excel-like) ──────────────────────────

  _onFillHandleMouseDown(e) {
    if (!this.selection) return;
    e.preventDefault();
    e.stopPropagation();
    const s = this.selection;
    this._fillDrag = {
      // Original (source) selection bounds — frozen for the duration of the drag.
      srcC1: Math.min(s.startCol, s.endCol),
      srcC2: Math.max(s.startCol, s.endCol),
      srcR1: Math.min(s.startRow, s.endRow),
      srcR2: Math.max(s.startRow, s.endRow),
      // Current target range (defaults to source = no-op).
      tgtC1: Math.min(s.startCol, s.endCol),
      tgtC2: Math.max(s.startCol, s.endCol),
      tgtR1: Math.min(s.startRow, s.endRow),
      tgtR2: Math.max(s.startRow, s.endRow),
      axis: null, // 'v' | 'h' — locked once movement starts
      ctrl: Boolean(e.ctrlKey || e.metaKey), // Excel's Ctrl modifier — refreshed on each move
    };
    this.container.classList.add('datagrid--fill-dragging');
    this._renderFillPreview();
  }

  _updateFillDrag(e) {
    const fd = this._fillDrag;
    // Refresh Ctrl/Cmd state on every move so toggling mid-drag works.
    fd.ctrl = Boolean(e.ctrlKey || e.metaKey);
    this.container.classList.toggle('datagrid--fill-ctrl', fd.ctrl);
    const cell = this._getCellFromEvent(e);
    if (!cell) return;

    // Decide axis on first meaningful move (sticky once chosen).
    if (fd.axis == null) {
      const dC = Math.max(0, cell.colIdx - fd.srcC2, fd.srcC1 - cell.colIdx);
      const dR = Math.max(0, cell.rowIdx - fd.srcR2, fd.srcR1 - cell.rowIdx);
      if (dC === 0 && dR === 0) {
        // Still on source — no axis lock yet, leave target = source.
        fd.tgtC1 = fd.srcC1; fd.tgtC2 = fd.srcC2;
        fd.tgtR1 = fd.srcR1; fd.tgtR2 = fd.srcR2;
        this._renderFillPreview();
        return;
      }
      fd.axis = dR >= dC ? 'v' : 'h';
    }

    if (fd.axis === 'v') {
      // Vertical fill: extend rows above or below source, columns stay = source columns.
      fd.tgtC1 = fd.srcC1; fd.tgtC2 = fd.srcC2;
      if (cell.rowIdx > fd.srcR2) {
        fd.tgtR1 = fd.srcR1; fd.tgtR2 = cell.rowIdx;
      } else if (cell.rowIdx < fd.srcR1) {
        fd.tgtR1 = cell.rowIdx; fd.tgtR2 = fd.srcR2;
      } else {
        fd.tgtR1 = fd.srcR1; fd.tgtR2 = fd.srcR2;
      }
    } else {
      // Horizontal fill
      fd.tgtR1 = fd.srcR1; fd.tgtR2 = fd.srcR2;
      if (cell.colIdx > fd.srcC2) {
        fd.tgtC1 = fd.srcC1; fd.tgtC2 = cell.colIdx;
      } else if (cell.colIdx < fd.srcC1) {
        fd.tgtC1 = cell.colIdx; fd.tgtC2 = fd.srcC2;
      } else {
        fd.tgtC1 = fd.srcC1; fd.tgtC2 = fd.srcC2;
      }
    }
    this._renderFillPreview();
  }

  _renderFillPreview() {
    const fd = this._fillDrag;
    if (!fd || !this.fillPreviewEl) return;
    const rows = this.tbodyEl.children;
    const tlTd = rows[fd.tgtR1]?.children[fd.tgtC1 + 1];
    const brTd = rows[fd.tgtR2]?.children[fd.tgtC2 + 1];
    if (!tlTd || !brTd) { this.fillPreviewEl.style.display = 'none'; return; }
    const sRect = this.scrollDiv.getBoundingClientRect();
    const tl = tlTd.getBoundingClientRect();
    const br = brTd.getBoundingClientRect();
    const left = (tl.left - sRect.left) + this.scrollDiv.scrollLeft;
    const top  = (tl.top  - sRect.top)  + this.scrollDiv.scrollTop;
    this.fillPreviewEl.style.left   = `${left  }px`;
    this.fillPreviewEl.style.top    = `${top  }px`;
    this.fillPreviewEl.style.width  = `${br.right - tl.left  }px`;
    this.fillPreviewEl.style.height = `${br.bottom - tl.top  }px`;
    this.fillPreviewEl.style.display = 'block';
  }

  _cancelFillDrag() {
    this._fillDrag = null;
    if (this.fillPreviewEl) this.fillPreviewEl.style.display = 'none';
    this.container.classList.remove('datagrid--fill-dragging');
    this.container.classList.remove('datagrid--fill-ctrl');
  }

  _finishFillDrag() {
    const fd = this._fillDrag;
    this._cancelFillDrag();
    if (!fd) return;
    // No-op if user released inside source range.
    const sameAsSrc = fd.tgtC1 === fd.srcC1 && fd.tgtC2 === fd.srcC2
                   && fd.tgtR1 === fd.srcR1 && fd.tgtR2 === fd.srcR2;
    if (sameAsSrc) return;
    this._applyFill(fd);
  }

  /**
   * Apply an Excel-like fill from `srcR1..srcR2 × srcC1..srcC2` to the
   * extended target rectangle `tgtR1..tgtR2 × tgtC1..tgtC2`. Honours column
   * locks (skipping them and emitting `cell:edit-blocked`), pushes a single
   * 'fill' history action, then re-renders.
   *
   * @param {{srcC1:number,srcC2:number,srcR1:number,srcR2:number,
   *          tgtC1:number,tgtC2:number,tgtR1:number,tgtR2:number,axis:'v'|'h'}} fd
   */
  _applyFill(fd) {
    const { axis } = fd;
    const isVertical = axis === 'v';
    // Direction: forward (down/right) when target extends past source end,
    // backward (up/left) when target extends before source start.
    const dir = isVertical
      ? (fd.tgtR2 > fd.srcR2 ? 1 : -1)
      : (fd.tgtC2 > fd.srcC2 ? 1 : -1);

    const numCols = this.columns.length;
    const blockedCols = new Set();
    const oldData = {};      // colIdx → { rowIdx → oldValue }
    const oldFormulas = {};  // colIdx → { rowIdx → oldFormula }
    const newData = {};
    const newFormulas = {};

    const recordOld = (colIdx, rowIdx) => {
      const col = this.columns[colIdx];
      if (!col) return;
      (oldData[colIdx] ||= {})[rowIdx] = col.values[rowIdx];
      (oldFormulas[colIdx] ||= {})[rowIdx] = col.formulas?.[rowIdx] ?? null;
    };
    const writeNew = (colIdx, rowIdx, value, formula) => {
      const col = this.columns[colIdx];
      if (!col) return;
      col.values[rowIdx] = value;
      if (col.formulas) col.formulas[rowIdx] = formula ?? null;
      (newData[colIdx] ||= {})[rowIdx] = value;
      (newFormulas[colIdx] ||= {})[rowIdx] = formula ?? null;
    };

    if (isVertical) {
      // For each column in the source range, build a source vector (rows) and
      // generate values for the rows above/below.
      for (let c = fd.srcC1; c <= fd.srcC2; c++) {
        const col = this.columns[c];
        if (!col) continue;
        if (col.meta?.lock) { blockedCols.add(c); continue; }
        const srcLen = fd.srcR2 - fd.srcR1 + 1;
        const sourceCells = [];
        for (let r = fd.srcR1; r <= fd.srcR2; r++) {
          sourceCells.push({ value: col.values[r], formula: col.formulas?.[r] || null });
        }
        const pattern = withCtrlModifier(detectPattern(sourceCells, col.type), fd.ctrl);

        if (dir === 1) {
          const count = fd.tgtR2 - fd.srcR2;
          if (count <= 0) continue;
          while (fd.tgtR2 >= this.rowCount) this.addRows(1);
          const filled = generateFill(pattern, count, 1);
          for (let i = 0; i < count; i++) {
            const targetRow = fd.srcR2 + 1 + i;
            const f = filled[i];
            recordOld(c, targetRow);
            // If source cell had a formula, propagate it with row shift.
            const srcIdx = f.sourceIdx != null ? f.sourceIdx : (i % srcLen);
            const srcRow = fd.srcR1 + srcIdx;
            const srcFormula = col.formulas?.[srcRow];
            if (srcFormula) {
              const shifted = shiftFormulaRefs(srcFormula, targetRow - srcRow, 0, numCols);
              writeNew(c, targetRow, null, shifted);
            } else {
              writeNew(c, targetRow, f.value, null);
            }
          }
        } else {
          const count = fd.srcR1 - fd.tgtR1;
          if (count <= 0) continue;
          const filled = generateFill(pattern, count, -1);
          for (let i = 0; i < count; i++) {
            const targetRow = fd.srcR1 - 1 - i;
            if (targetRow < 0) break;
            const f = filled[i];
            recordOld(c, targetRow);
            // For 'repeat' / 'copy' kinds, sourceIdx walks the reversed sequence;
            // formulas should be picked from that same source row.
            const srcIdx = f.sourceIdx != null ? (srcLen - 1 - f.sourceIdx) : ((srcLen - 1) - (i % srcLen));
            const srcRow = fd.srcR1 + srcIdx;
            const srcFormula = col.formulas?.[srcRow];
            if (srcFormula) {
              const shifted = shiftFormulaRefs(srcFormula, targetRow - srcRow, 0, numCols);
              writeNew(c, targetRow, null, shifted);
            } else {
              writeNew(c, targetRow, f.value, null);
            }
          }
        }
      }
    } else {
      // Horizontal fill: for each row in the source range, build a source vector
      // across columns and fill columns left or right.
      for (let r = fd.srcR1; r <= fd.srcR2; r++) {
        const srcLen = fd.srcC2 - fd.srcC1 + 1;
        const sourceCells = [];
        for (let c = fd.srcC1; c <= fd.srcC2; c++) {
          const col = this.columns[c];
          if (!col) continue;
          sourceCells.push({ value: col.values[r], formula: col.formulas?.[r] || null });
        }
        // Use the source row's first column type for pattern classification —
        // horizontal fills typically span homogeneous columns.
        const refType = this.columns[fd.srcC1]?.type || 'text';
        const pattern = withCtrlModifier(detectPattern(sourceCells, refType), fd.ctrl);

        const writeAt = (targetCol, value, formula) => {
          const col = this.columns[targetCol];
          if (!col) return;
          if (col.meta?.lock) { blockedCols.add(targetCol); return; }
          recordOld(targetCol, r);
          writeNew(targetCol, r, value, formula);
        };

        if (dir === 1) {
          const count = fd.tgtC2 - fd.srcC2;
          if (count <= 0) continue;
          const filled = generateFill(pattern, count, 1);
          for (let i = 0; i < count; i++) {
            const targetCol = fd.srcC2 + 1 + i;
            if (targetCol >= numCols) break;
            const f = filled[i];
            const srcIdx = f.sourceIdx != null ? f.sourceIdx : (i % srcLen);
            const srcCol = fd.srcC1 + srcIdx;
            const srcFormula = this.columns[srcCol]?.formulas?.[r];
            if (srcFormula) {
              const shifted = shiftFormulaRefs(srcFormula, 0, targetCol - srcCol, numCols);
              writeAt(targetCol, null, shifted);
            } else {
              writeAt(targetCol, f.value, null);
            }
          }
        } else {
          const count = fd.srcC1 - fd.tgtC1;
          if (count <= 0) continue;
          const filled = generateFill(pattern, count, -1);
          for (let i = 0; i < count; i++) {
            const targetCol = fd.srcC1 - 1 - i;
            if (targetCol < 0) break;
            const f = filled[i];
            const srcIdx = f.sourceIdx != null ? (srcLen - 1 - f.sourceIdx) : ((srcLen - 1) - (i % srcLen));
            const srcCol = fd.srcC1 + srcIdx;
            const srcFormula = this.columns[srcCol]?.formulas?.[r];
            if (srcFormula) {
              const shifted = shiftFormulaRefs(srcFormula, 0, targetCol - srcCol, numCols);
              writeAt(targetCol, null, shifted);
            } else {
              writeAt(targetCol, f.value, null);
            }
          }
        }
      }
    }

    // Lock-blocked feedback: emit one event per locked column touched.
    for (const c of blockedCols) {
      const col = this.columns[c];
      if (!col) continue;
      this.emit('cell:edit-blocked', {
        action: 'fill',
        columnId: col.id,
        lock: col.meta.lock,
        reason: col.meta.reason,
      });
    }

    // Nothing actually changed (everything we touched was locked) — bail.
    if (Object.keys(newData).length === 0) return;

    // Convert maps → column-keyed payload for compact undo storage.
    const colIds = Object.keys(newData).map(idx => ({
      idx: parseInt(idx),
      colId: this.columns[parseInt(idx)]?.id,
    })).filter(x => x.colId);

    const action = {
      type: 'fill',
      colIds,
      oldData,
      oldFormulas,
      newData,
      newFormulas,
    };
    this.history.push(action);
    this.metadata.modified = new Date().toISOString();

    // Update the underlying selection state to cover the new range, then
    // render the body — setSelection only updates classes, but the cell
    // values themselves changed and need a full body re-render.
    this.selection = {
      startCol: fd.tgtC1, startRow: fd.tgtR1,
      endCol: fd.tgtC2, endRow: fd.tgtR2,
      activeCol: fd.srcC1, activeRow: fd.srcR1,
    };
    this.render();
    this.emit('selection:changed', { range: this.selection });
    this.emit('data:filled', { range: { ...fd } });
  }

  // ─── Row Drag & Drop ────────────────────────────────

  _startRowDrag(rowIdx, e) {
    this._rowDragPending = null;
    const ghost = document.createElement('div');
    ghost.className = 'row-drag-ghost';
    ghost.textContent = `Row ${rowIdx + 1}`;
    ghost.style.left = `${e.clientX + 12  }px`;
    ghost.style.top = `${e.clientY - 10  }px`;
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
    drag.ghost.style.left = `${e.clientX + 12  }px`;
    drag.ghost.style.top = `${e.clientY - 10  }px`;

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
      drag.indicator.style.top = `${rows[targetIdx].offsetTop  }px`;
    } else if (rows.length > 0) {
      const last = rows[rows.length - 1];
      drag.indicator.style.top = `${last.offsetTop + last.offsetHeight  }px`;
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
    ghost.textContent = col.shortName + (col.name ? ` · ${  col.name}` : '');
    ghost.style.left = `${e.clientX + 12  }px`;
    ghost.style.top = `${e.clientY - 10  }px`;
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
    drag.ghost.style.left = `${e.clientX + 12  }px`;
    drag.ghost.style.top = `${e.clientY - 10  }px`;

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
    drag.indicator.style.top = `${indicatorTop  }px`;
    drag.indicator.style.height = `${indicatorHeight  }px`;
    if (targetIdx < ths.length) {
      drag.indicator.style.left = `${ths[targetIdx].offsetLeft  }px`;
    } else if (ths.length > 0) {
      const last = ths[ths.length - 1];
      drag.indicator.style.left = `${last.offsetLeft + last.offsetWidth  }px`;
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
    if (col.meta?.lock) {
      this.emit('column:edit-blocked', {
        columnId: col.id, action: 'rename', lock: col.meta.lock, reason: col.meta.reason,
      });
      return;
    }

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
      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd+click: additive (toggle) column selection — lets the
        // user pick non-contiguous columns for chart suggestions etc.
        e.preventDefault();
        this._commitEdit();
        this.toggleColumnSelection(colIdx);
      } else if (e.shiftKey) {
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

    if (this._fillDrag && e.key === 'Escape') {
      e.preventDefault();
      this._cancelFillDrag();
      return;
    }

    if (shortcutRegistry.matches(e, 'datagrid.undo')) {
      e.preventDefault(); this.undo(); return;
    }
    if (shortcutRegistry.matches(e, 'datagrid.redo')) {
      e.preventDefault(); this.redo(); return;
    }
    if (shortcutRegistry.matches(e, 'datagrid.selectAll')) {
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

    if (shortcutRegistry.matches(e, 'datagrid.editCell')) {
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

    this.emit('edit:start', { colIdx, rowIdx, initialChar, formula: Boolean(formula) });
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
    const isLocked = Boolean(col.meta?.lock);
    const isHardLocked = col.meta?.lock === 'hard';
    const items = [];
    if (!isLocked) {
      items.push({ label: t('renameColumn'), action: () => this._promptRenameColumn(colIdx) });
      items.push({ type: 'sep' });
    }
    items.push({ label: t('sortAsc'), action: () => { this.sortCol = null; this.sortDir = null; this.sortByColumn(colIdx); } });
    items.push({ label: t('sortDesc'), action: () => { this.sortCol = colIdx; this.sortDir = 'asc'; this.sortByColumn(colIdx); } });
    items.push({ type: 'sep' });
    items.push({ label: t('insertColLeft'), action: () => this.addColumn({ position: colIdx }) });
    items.push({ label: t('insertColRight'), action: () => this.addColumn({ position: colIdx + 1 }) });
    items.push({ type: 'sep' });
    items.push({ label: t('columnStats'), action: () => this._showColumnStats(colIdx) });
    items.push({ label: t('columnScan'), action: () => this._showColumnScan(colIdx) });
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

    // Allow embedding modules to inject extra row-level actions (e.g. the
    // DoE-Planer preview adds "Diesen Punkt verbieten"). The hook receives
    // the cell info and returns either an array of items or null/undefined.
    if (typeof this.options.extraRowMenuItems === 'function') {
      try {
        const extras = this.options.extraRowMenuItems(cell);
        if (Array.isArray(extras) && extras.length) {
          menuItems.push({ type: 'sep' });
          for (const it of extras) menuItems.push(it);
        }
      } catch { /* host's problem; ignore */ }
    }

    this._showContextMenu(e.clientX, e.clientY, menuItems);
  }

  _showContextMenu(x, y, items) {
    this._closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${x  }px`;
    menu.style.top = `${y  }px`;

    for (const item of items) {
      if (item.type === 'sep') {
        const sep = document.createElement('div');
        sep.className = 'context-menu__sep';
        menu.appendChild(sep);
        continue;
      }
      const el = document.createElement('div');
      el.className = `context-menu__item${  item.danger ? ' context-menu__item--danger' : ''}`;
      el.append(h('span', null, item.label));
      if (item.shortcut) {
        el.append(h('span', { class: 'context-menu__shortcut' }, item.shortcut));
      }
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
      if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8  }px`;
      if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8  }px`;
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

  _setColumnType(colIdx, type, options = {}) {
    const col = this.columns[colIdx];
    if (!col || col.type === type) return;
    if (col.meta?.lock && !options.bypassLock) {
      this.emit('column:edit-blocked', {
        columnId: col.id, action: 'type-change', lock: col.meta.lock, reason: col.meta.reason,
      });
      return;
    }
    const oldType = col.type;
    col.type = type;

    if (type === 'binary') {
      col.values = col.values.map(v => {
        if (v == null) return null;
        if (v === 0 || v === 1) return v;
        const n = parseNumeric(v);
        if (n === 0) return 0;
        if (n === 1) return 1;
        return null;
      });
    } else if (isNumericType(type)) {
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

    this._reinferRoleAfterTypeChange(col);
    this.render();
    this.emit('column:type-changed', { columnId: col.id, oldType, newType: type });
  }

  /**
   * Unified type+role picker. The two columns stay in sync: changing the
   * storage type re-runs role inference and refreshes the role column
   * (auto-reset if the previous manual role is no longer valid).
   */
  _showColumnAttrPicker(colIdx, anchorEl) {
    this._closeColumnAttrPicker();
    const col = this.columns[colIdx];
    if (!col) return;

    const picker = document.createElement('div');
    picker.className = 'attr-picker';
    if (col.meta?.lock) picker.classList.add(`attr-picker--locked-${col.meta.lock}`);

    const title = document.createElement('div');
    title.className = 'attr-picker__title';
    const colLabel = col.name ? `${col.shortName} · ${col.name}` : col.shortName;
    title.textContent = colLabel;
    picker.appendChild(title);

    if (col.meta?.lock) {
      const note = document.createElement('div');
      note.className = 'attr-picker__lock-note';
      note.textContent = this._lockTooltip(col);
      picker.appendChild(note);
    }

    const cols = document.createElement('div');
    cols.className = 'attr-picker__columns';
    picker.appendChild(cols);

    // Anchor rect is captured once on open. After a type change the
    // header is re-rendered (render() rebuilds theadEl.innerHTML) and
    // the original anchor element becomes detached — its bounding rect
    // would be all zeros, sending the picker to (0,0). Keeping the
    // initial position avoids that jump.
    const anchorRect = anchorEl.getBoundingClientRect();

    const renderBody = () => {
      cols.replaceChildren();
      cols.appendChild(this._renderAttrPickerTypeColumn(colIdx));
      cols.appendChild(this._renderAttrPickerRoleColumn(colIdx, () => {
        renderBody();
      }, () => {
        renderBody();
      }));
      const formatCol = this._renderAttrPickerFormatColumn(colIdx, () => renderBody());
      if (formatCol) cols.appendChild(formatCol);
    };

    const positionPicker = () => {
      const pickerRect = picker.getBoundingClientRect();
      let top = anchorRect.bottom + 4;
      let left = anchorRect.left;
      if (left + pickerRect.width > window.innerWidth) left = window.innerWidth - pickerRect.width - 8;
      if (top + pickerRect.height > window.innerHeight) top = anchorRect.top - pickerRect.height - 4;
      picker.style.left = `${left  }px`;
      picker.style.top = `${top  }px`;
    };

    renderBody();
    document.body.appendChild(picker);
    this._attrPicker = picker;
    requestAnimationFrame(positionPicker);

    const closeHandler = (ev) => {
      if (!picker.contains(ev.target)) {
        this._closeColumnAttrPicker();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  }

  _renderAttrPickerTypeColumn(colIdx) {
    const col = this.columns[colIdx];
    const isLocked = Boolean(col.meta?.lock);
    const colEl = document.createElement('div');
    colEl.className = `attr-picker__col attr-picker__col--type${  isLocked ? ' attr-picker__col--disabled' : ''}`;

    const colTitle = document.createElement('div');
    colTitle.className = 'attr-picker__col-title';
    const typeHeading = this._t('ui.datagrid.typeMenuTitle');
    colTitle.textContent = (typeHeading && typeHeading !== 'typeMenuTitle')
      ? typeHeading : 'Column type';
    colEl.appendChild(colTitle);

    for (const typeKey of Object.keys(COLUMN_TYPES)) {
      const item = document.createElement('div');
      item.className = `attr-picker__item${
         col.type === typeKey ? ' active' : ''
         }${isLocked ? ' attr-picker__item--disabled' : ''}`;
      item.dataset.type = typeKey;

      const badge = document.createElement('span');
      badge.className = 'attr-picker__badge';
      badge.append(renderColTypeBadge(typeKey));

      const label = document.createElement('span');
      label.className = 'attr-picker__label';
      label.textContent = this._typeLabel(typeKey);

      item.appendChild(badge);
      item.appendChild(label);
      if (col.type === typeKey) {
        item.appendChild(icon('action.confirm', { size: 'sm', cls: 'attr-picker__item-check' }));
      }
      colEl.appendChild(item);
    }
    return colEl;
  }

  _renderAttrPickerRoleColumn(colIdx, onRoleClick, onTypeClick) {
    const col = this.columns[colIdx];
    const isLocked = Boolean(col.meta?.lock);
    const colEl = document.createElement('div');
    colEl.className = `attr-picker__col attr-picker__col--role${  isLocked ? ' attr-picker__col--disabled' : ''}`;

    const colTitle = document.createElement('div');
    colTitle.className = 'attr-picker__col-title';
    const roleHeading = this._t('ui.datagrid.roleMenuTitle');
    colTitle.textContent = (roleHeading && roleHeading !== 'roleMenuTitle')
      ? roleHeading : 'Column role';
    colEl.appendChild(colTitle);

    const validRoles = validRolesForType(col.type);
    for (const role of validRoles) {
      const item = document.createElement('div');
      item.className = `attr-picker__item${
         col.role === role ? ' active' : ''
         }${isLocked ? ' attr-picker__item--disabled' : ''}`;
      item.dataset.role = role;
      const tip = this._roleTooltip(role);
      if (tip) item.title = tip;

      const dot = document.createElement('span');
      dot.className = `attr-picker__role-dot col-role-${role}`;

      const label = document.createElement('span');
      label.className = 'attr-picker__label';
      label.textContent = this._roleLabel(role);

      item.appendChild(dot);
      item.appendChild(label);
      if (col.role === role) {
        item.appendChild(icon('action.confirm', { size: 'sm', cls: 'attr-picker__item-check' }));
      }

      if (!isLocked) {
        item.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.setColumnRole(col.id, role);
          onRoleClick();
        });
      }

      colEl.appendChild(item);
    }

    // Wire up type-column items here so the role column can re-render
    // when the type changes — both rendering helpers share `onTypeClick`.
    requestAnimationFrame(() => {
      const root = this._attrPicker;
      if (!root) return;
      if (isLocked) return;
      const typeItems = root.querySelectorAll('.attr-picker__col--type .attr-picker__item');
      for (const item of typeItems) {
        item.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const typeKey = item.dataset.type;
          if (!typeKey || this.columns[colIdx].type === typeKey) return;
          this._setColumnType(colIdx, typeKey);
          onTypeClick();
        });
      }
    });

    return colEl;
  }

  /**
   * Render the contextual Format column for the attribute picker.
   * Numeric/currency/percent → decimal places. Date → date pattern.
   * Time → time pattern. Other types → no format column (returns null).
   *
   * @param {number} colIdx
   * @param {() => void} onChange — re-render the picker body to update the
   *        active marker without closing the popup.
   * @returns {HTMLElement|null}
   */
  _renderAttrPickerFormatColumn(colIdx, onChange) {
    const col = this.columns[colIdx];
    if (!col) return null;
    const isLocked = Boolean(col.meta?.lock);

    const colEl = document.createElement('div');
    colEl.className = `attr-picker__col attr-picker__col--format${  isLocked ? ' attr-picker__col--disabled' : ''}`;

    const colTitle = document.createElement('div');
    colTitle.className = 'attr-picker__col-title';
    const heading = this._t('ui.datagrid.formatMenuTitle');
    colTitle.textContent = (heading && heading !== 'formatMenuTitle') ? heading : 'Format';
    colEl.appendChild(colTitle);

    const addItem = ({ label, isActive, onClick }) => {
      const item = document.createElement('div');
      item.className = `attr-picker__item${
         isActive ? ' active' : ''
         }${isLocked ? ' attr-picker__item--disabled' : ''}`;
      const labelEl = document.createElement('span');
      labelEl.className = 'attr-picker__label';
      labelEl.textContent = label;
      item.appendChild(labelEl);
      if (isActive) {
        item.appendChild(icon('action.confirm', { size: 'sm', cls: 'attr-picker__item-check' }));
      }
      if (!isLocked) {
        item.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onClick();
          onChange();
        });
      }
      colEl.appendChild(item);
    };

    if (col.type === 'numeric' || col.type === 'currency' || col.type === 'percent') {
      const current = col.format.decimals;
      const autoLabel = this._t('ui.datagrid.decimalsAuto');
      addItem({
        label: (autoLabel && autoLabel !== 'decimalsAuto') ? autoLabel : 'Auto',
        isActive: current == null,
        onClick: () => this.setColumnFormat(col.id, { decimals: null }),
      });
      for (const d of [0, 1, 2, 3, 4, 5, 6]) {
        addItem({
          label: String(d),
          isActive: current === d,
          onClick: () => this.setColumnFormat(col.id, { decimals: d }),
        });
      }
      return colEl;
    }

    if (col.type === 'date') {
      const current = col.format.dateFormat || 'dd.MM.yyyy';
      for (const [pattern, example] of Object.entries(DATE_FORMATS)) {
        addItem({
          label: `${pattern}  ·  ${example}`,
          isActive: current === pattern,
          onClick: () => this.setColumnFormat(col.id, { dateFormat: pattern }),
        });
      }
      return colEl;
    }

    if (col.type === 'time') {
      const current = col.format.timeFormat || 'HH:mm';
      for (const [pattern, example] of Object.entries(TIME_FORMATS)) {
        addItem({
          label: `${pattern}  ·  ${example}`,
          isActive: current === pattern,
          onClick: () => this.setColumnFormat(col.id, { timeFormat: pattern }),
        });
      }
      return colEl;
    }

    return null;
  }

  _closeColumnAttrPicker() {
    if (this._attrPicker) {
      this._attrPicker.remove();
      this._attrPicker = null;
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

    // Build a stats table DOM node from [label, value] rows (null = separator).
    const statsTable = (rows) => {
      const table = h('table', { class: 'column-stats__table' });
      for (const row of rows) {
        if (!row) {
          table.append(h('tr', { class: 'column-stats__sep' }, h('td', { colspan: '2' })));
        } else {
          table.append(h('tr',
            null,
            h('td', { class: 'column-stats__label' }, row[0]),
            h('td', { class: 'column-stats__value' }, row[1]),
          ));
        }
      }
      return table;
    };

    let bodyNode;

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
          [`\u0078\u0304 (${  t('statsMean')  })`, mean.toFixed(4)],
          [`s (${  t('statsStddev')  })`, stddev.toFixed(4)],
          ['Min', min],
          ['Median', median.toFixed(4)],
          ['Max', max],
          [`\u03A3 (${  t('statsSum')  })`, sum.toFixed(4)],
        ];
        bodyNode = statsTable(rows);
      } else {
        bodyNode = h('div', { class: 'column-scan__overview' }, h('span', null, t('statsNoNumeric')));
      }
    } else {
      const unique = new Set(vals.map(v => String(v)));
      const rows = [
        ['n', vals.length],
        [t('statsEmpty'), this.rowCount - vals.length],
        [t('statsUnique'), unique.size],
      ];
      bodyNode = statsTable(rows);
    }

    panel.append(
      h('div', { class: 'column-scan__header' },
        h('div', { class: 'column-scan__title' }, t('columnStats')),
        h('div', { class: 'column-scan__subtitle' }, `${colLabel} — ${this._typeLabel(col.type)}`),
        h('button', { class: 'column-scan__close' }, '×'),
      ),
      h('div', { class: 'column-scan__body' }, bodyNode),
    );

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

    const t = (k) => this._t(`ui.datagrid.${k}`);

    // ── Build popout overlay (reuses dmike-chart-popout CSS) ──
    const overlay = document.createElement('div');
    overlay.className = 'dmike-chart-popout-overlay';

    const win = document.createElement('div');
    win.className = 'dmike-chart-popout';
    win.style.width = '440px';
    win.style.height = 'auto';
    win.style.maxHeight = '80vh';
    win.style.left = 'calc(50% - 220px)';
    win.style.top = '60px';

    const titleBar = document.createElement('div');
    titleBar.className = 'dmike-chart-popout-titlebar';
    const titleText = document.createElement('span');
    titleText.textContent = t('scanTitle');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dmike-chart-popout-close';
    closeBtn.appendChild(icon('action.close'));
    titleBar.append(titleText, closeBtn);

    const body = document.createElement('div');
    body.className = 'dmike-chart-popout-body';
    const scanBody = document.createElement('div');
    scanBody.className = 'column-scan__body';
    scanBody.style.height = '100%';
    body.appendChild(scanBody);

    win.append(titleBar, body);
    overlay.appendChild(win);
    document.body.appendChild(overlay);

    // ── Drag title bar ──
    let dragX = 0, dragY = 0, isDragging = false;
    const onDragStart = (e) => {
      if (closeBtn.contains(e.target)) return;
      isDragging = true;
      dragX = e.clientX - win.offsetLeft;
      dragY = e.clientY - win.offsetTop;
      win.style.transition = 'none';
    };
    const onDragMove = (e) => {
      if (!isDragging) return;
      win.style.left = `${e.clientX - dragX  }px`;
      win.style.top = `${e.clientY - dragY  }px`;
    };
    const onDragEnd = () => { isDragging = false; win.style.transition = ''; };
    titleBar.addEventListener('mousedown', onDragStart);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);

    const onKeyDown = (e) => { if (e.key === 'Escape') this._closeColumnScan(); };
    window.addEventListener('keydown', onKeyDown);
    closeBtn.addEventListener('click', () => this._closeColumnScan());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeColumnScan(); });

    this._columnScanState = {
      colIdx, overlay, titleText, scanBody,
      teardown: () => {
        window.removeEventListener('mousemove', onDragMove);
        window.removeEventListener('mouseup', onDragEnd);
        window.removeEventListener('keydown', onKeyDown);
      },
    };
    this._refreshColumnScan();

    this._columnScanRenderHandler = () => {
      if (this._columnScanState) this._refreshColumnScan();
    };
    this.on('render', this._columnScanRenderHandler);
  }

  _refreshColumnScan() {
    const { colIdx, titleText, scanBody } = this._columnScanState;
    const col = this.columns[colIdx];
    if (!col) { this._closeColumnScan(); return; }

    const t = (k) => this._t(`ui.datagrid.${k}`);
    const scan = analyzeColumn(col, this.rowCount);
    const colLabel = col.name ? `${col.shortName} · ${col.name}` : col.shortName;
    const filled = scan.total - scan.empty;
    const dominantLabel = scan.dominantType
      ? this._typeLabel(scan.dominantType)
      : '—';

    titleText.textContent = `${t('scanTitle')} — ${colLabel} (${t('scanDominant')}: ${dominantLabel})`;

    // Column-scan badges reuse the same COLUMN_TYPES badge definitions as the
    // header/attr-picker badges (see renderColTypeBadge in datagrid-utils.js)
    // instead of keeping a third, separately-maintained copy of the mapping.
    const typeBadge = (type) => (COLUMN_TYPES[type] ? renderColTypeBadge(type) : type);

    const frag = document.createDocumentFragment();

    frag.append(h('div', { class: 'column-scan__overview' },
      h('span', null, `${t('scanTotal')}: `, h('strong', null, scan.total)),
      h('span', null, `${t('scanFilled')}: `, h('strong', null, filled)),
      h('span', null, `${t('scanEmpty')}: `, h('strong', null, scan.empty)),
    ));

    if (filled > 0) {
      const bar = h('div', { class: 'column-scan__bar' });
      for (const [type, info] of Object.entries(scan.types)) {
        const pct = (info.count / filled * 100).toFixed(1);
        bar.append(h('div', {
          class: `column-scan__bar-seg column-scan__bar-seg--${type}`,
          title: `${type}: ${info.count} (${pct}%)`,
          style: `width:${pct}%`,
        }, typeBadge(type)));
      }
      frag.append(bar);

      const types = h('div', { class: 'column-scan__types' });
      for (const [type, info] of Object.entries(scan.types)) {
        const pct = (info.count / filled * 100).toFixed(1);
        const isDominant = type === scan.dominantType;
        types.append(h('div', {
          class: `column-scan__type-row${isDominant ? ' column-scan__type-row--dominant' : ''}`,
        },
          h('span', { class: `column-scan__type-badge column-scan__type-badge--${type}` }, typeBadge(type)),
          h('span', { class: 'column-scan__type-label' }, this._typeLabel(type)),
          h('span', { class: 'column-scan__type-count' }, info.count),
          h('span', { class: 'column-scan__type-pct' }, `${pct}%`),
        ));
      }
      frag.append(types);
    }

    if (scan.textClusters && scan.textClusters.length > 0) {
      const list = h('div', { class: 'column-scan__clusters-list' });
      const maxClusters = 20;
      const clustersShown = Math.min(scan.textClusters.length, maxClusters);
      for (let ci = 0; ci < clustersShown; ci++) {
        const cluster = scan.textClusters[ci];
        const summary = t('scanVariantsGroupSummary')
          .replace('{n}', cluster.variants.length)
          .replace('{total}', cluster.total);
        const variants = h('div', { class: 'column-scan__cluster-variants' });
        const maxVariants = 30;
        const variantsShown = Math.min(cluster.variants.length, maxVariants);
        for (let vi = 0; vi < variantsShown; vi++) {
          const v = cluster.variants[vi];
          const fuzzyClass = v.viaFuzzy ? ' column-scan__cluster-variant--fuzzy' : '';
          const fuzzyMark = v.viaFuzzy
            ? h('span', { class: 'column-scan__cluster-fuzzy', title: t('scanVariantFuzzy') }, '≈')
            : h('span', { class: 'column-scan__cluster-fuzzy column-scan__cluster-fuzzy--placeholder' });
          variants.append(h('div', {
            class: `column-scan__cluster-variant${fuzzyClass}`,
            'data-row': v.firstRow,
            'data-col': colIdx,
            title: t('scanVariantJump'),
          },
            fuzzyMark,
            h('span', { class: 'column-scan__cluster-value' }, `"${v.value}"`),
            h('span', { class: 'column-scan__cluster-count' }, `×${v.count}`),
          ));
        }
        if (cluster.variants.length > maxVariants) {
          variants.append(h('div', { class: 'column-scan__mismatch-more' },
            `… ${t('scanMore').replace('{n}', cluster.variants.length - maxVariants)}`));
        }
        list.append(h('div', { class: 'column-scan__cluster' },
          h('div', { class: 'column-scan__cluster-summary' }, summary),
          variants,
        ));
      }
      if (scan.textClusters.length > maxClusters) {
        list.append(h('div', { class: 'column-scan__mismatch-more' },
          `… ${t('scanMore').replace('{n}', scan.textClusters.length - maxClusters)}`));
      }
      frag.append(h('div', { class: 'column-scan__clusters' },
        h('div', { class: 'column-scan__clusters-header' },
          t('scanVariantsHeader').replace('{n}', scan.textClusters.length)),
        list,
      ));
    }

    if (scan.outliers.count > 0) {
      const mlist = h('div', { class: 'column-scan__mismatch-list' });
      const maxShow = 50;
      const showCount = Math.min(scan.outliers.count, maxShow);
      for (let i = 0; i < showCount; i++) {
        const row = scan.outliers.rows[i];
        const val = scan.outliers.values[i];
        const oType = scan.outliers.types[i];
        const badge = typeBadge(oType);
        const display = val.length > 30 ? `${val.substring(0, 27)  }…` : val;
        mlist.append(h('div', {
          class: 'column-scan__mismatch-row',
          'data-row': row,
          'data-col': colIdx,
        },
          h('span', { class: 'column-scan__mismatch-rownum' }, `${t('scanRow')} ${row + 1}`),
          h('span', { class: `column-scan__type-badge column-scan__type-badge--sm column-scan__type-badge--${oType}` }, badge),
          h('span', { class: 'column-scan__mismatch-val' }, display),
        ));
      }
      if (scan.outliers.count > maxShow) {
        mlist.append(h('div', { class: 'column-scan__mismatch-more' },
          `… ${t('scanMore').replace('{n}', scan.outliers.count - maxShow)}`));
      }
      frag.append(h('div', { class: 'column-scan__mismatch' },
        h('div', { class: 'column-scan__mismatch-header' },
          t('scanOutliers').replace('{n}', scan.outliers.count)),
        mlist,
      ));
    } else if (filled > 0) {
      frag.append(h('div', { class: 'column-scan__ok' },
        icon('status.ok', { size: 'sm' }), ` ${t('scanAllMatch')}`));
    }

    scanBody.replaceChildren(frag);

    scanBody.querySelectorAll('.column-scan__mismatch-row').forEach(el => {
      el.addEventListener('click', () => {
        const r = parseInt(el.dataset.row);
        const c = parseInt(el.dataset.col);
        this.setSelection({ startCol: c, startRow: r, endCol: c, endRow: r, activeCol: c, activeRow: r });
        this.render();
        const cell = this.container.querySelector(`td[data-col-idx="${c}"][data-row-idx="${r}"]`);
        if (cell) cell.scrollIntoView({ block: 'center', behavior: 'smooth' });

        scanBody.querySelectorAll('.column-scan__mismatch-row').forEach(rowEl => rowEl.classList.remove('column-scan__mismatch-row--active'));
        el.classList.add('column-scan__mismatch-row--active');
      });
    });

    scanBody.querySelectorAll('.column-scan__cluster-variant').forEach(el => {
      el.addEventListener('click', () => {
        const r = parseInt(el.dataset.row);
        const c = parseInt(el.dataset.col);
        this.setSelection({ startCol: c, startRow: r, endCol: c, endRow: r, activeCol: c, activeRow: r });
        this.render();
        const cell = this.container.querySelector(`td[data-col-idx="${c}"][data-row-idx="${r}"]`);
        if (cell) cell.scrollIntoView({ block: 'center', behavior: 'smooth' });

        scanBody.querySelectorAll('.column-scan__cluster-variant').forEach(v => v.classList.remove('column-scan__cluster-variant--active'));
        el.classList.add('column-scan__cluster-variant--active');
      });
    });
  }

  _closeColumnScan() {
    if (this._columnScanRenderHandler) {
      this.off('render', this._columnScanRenderHandler);
      this._columnScanRenderHandler = null;
    }
    if (this._columnScanState) {
      this._columnScanState.teardown?.();
      this._columnScanState.overlay.remove();
      this._columnScanState = null;
    }
  }

  _typeLabel(type) {
    const key = `type${  type.charAt(0).toUpperCase()  }${type.slice(1)}`;
    const translated = this._t(`ui.datagrid.${key}`);
    if (translated !== key && !translated.endsWith(key)) return translated;
    return COLUMN_TYPES[type]?.label || type;
  }

  _roleLabel(role) {
    const key = `role${  role.charAt(0).toUpperCase()  }${role.slice(1)}`;
    const translated = this._t(`ui.datagrid.${key}`);
    if (translated !== key && !translated.endsWith(key)) return translated;
    // English fallback used when no i18n entry is registered.
    const fallback = {
      continuous:  'Continuous',
      categorical: 'Categorical',
      ordinal:     'Ordinal',
      date:        'Date / time',
      identifier:  'Identifier',
      freeText:    'Free text',
    };
    return fallback[role] || role;
  }

  _roleTooltip(role) {
    const key = `role${  role.charAt(0).toUpperCase()  }${role.slice(1)  }Tooltip`;
    const translated = this._t(`ui.datagrid.${key}`);
    if (translated !== key && !translated.endsWith(key)) return translated;
    const fallback = {
      continuous:  'Numeric values on a continuous scale (e.g. length, weight, temperature). Used for mean, standard deviation, regression, capability analysis.',
      categorical: 'Discrete groups without order (e.g. Machine A/B/C, Shift Day/Night). Used for frequencies, Pareto, chi-square tests, group comparisons.',
      ordinal:     'Ordered categories with ranking but no uniform spacing (e.g. small/medium/large, grades 1–6). Used for rank-based tests.',
      date:        'Date or time for time series, trend charts, and control charts with a time axis.',
      identifier:  'Unique identifier of a record (e.g. sample ID, serial number, batch). Used as the row label in result tables and drill-downs (e.g. flagged outliers) so a finding can be traced back to the physical sample. Excluded from statistical calculations.',
      freeText:    'Unstructured text such as notes or comments. Excluded from calculations.',
    };
    return fallback[role] || '';
  }

  // ═══════════════════════════════════════════════════════════
  //  FILE IMPORT
  // ═══════════════════════════════════════════════════════════

  _handleFileImport(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv' || ext === 'tsv') {
      this._importCSV(file);
    } else {
      this._toast(`Unsupported format: ${  ext}`, 'error');
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
      } else if (ch === '"') { inQuotes = true; }
        else if (ch === delim) { result.push(current); current = ''; }
        else { current += ch; }
    }
    result.push(current);
    return result;
  }

  // ═══════════════════════════════════════════════════════════
  //  EXPORT
  // ═══════════════════════════════════════════════════════════

  downloadCSV() {
    const csv = this.exportToCSV();
    const blob = new Blob([`\ufeff${  csv}`], { type: 'text/csv;charset=utf-8' });
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
    this._closeColumnAttrPicker();
    this._closeColumnScan();
    this._closeColumnStats();
    this.container.replaceChildren();
  }
}
