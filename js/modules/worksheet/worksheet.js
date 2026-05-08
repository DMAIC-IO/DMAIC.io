/**
 * D.Mike — Worksheet Module (worksheet.js)
 * DMAIC-independent data table using DataGrid + Workbook + FormulaEditor.
 * Phase: 'data' (above DMAIC in sidebar).
 */

import { DataGrid, isFormula, evaluateFormula, COLUMN_TYPES, uid } from '../../core/datagrid/datagrid.js';
import { History } from '../../core/datagrid/datagrid-history.js';
import { parseCellInput } from '../../core/datagrid/datagrid-utils.js';

// ═══════════════════════════════════════════════════════════
//  WORKBOOK (multi-sheet management)
// ═══════════════════════════════════════════════════════════

class Workbook {
  /** @param {DataGrid} grid @param {HTMLElement} tabBarEl @param {Function} t i18n helper @param {Function} toast */
  constructor(grid, tabBarEl, t, toast) {
    this.grid = grid;
    this.tabBarEl = tabBarEl;
    this._t = t;
    this._toast = toast;
    this.sheets = [];
    this.activeSheetId = null;
    this._sheetCounter = 0;
    this._handlers = {};

    this._buildTabBar();
    this.addSheet(this._t('modules.worksheet.defaultSheetName'));
  }

  on(event, fn) { (this._handlers[event] ||= []).push(fn); }
  emit(event, payload) { (this._handlers[event] || []).forEach(fn => fn(payload)); }

  addSheet(name, copyFrom) {
    this._sheetCounter++;
    const id = 'sheet_' + this._sheetCounter;
    const sheetName = name || `${this._t('modules.worksheet.defaultSheetName')} ${this._sheetCounter}`;

    this._saveActiveSheet();

    const sheet = { id, name: sheetName, state: null };
    this.sheets.push(sheet);

    if (copyFrom) {
      const src = this.sheets.find(s => s.id === copyFrom);
      if (src && src.state) {
        sheet.state = JSON.parse(JSON.stringify(src.state));
      }
    }

    this.activeSheetId = id;

    if (sheet.state) {
      this.grid.setState(sheet.state);
    } else {
      this.grid.clearAll();
    }

    this._renderTabs();
    this.emit('sheet:added', { id, name: sheetName });
    return sheet;
  }

  removeSheet(id) {
    if (this.sheets.length <= 1) {
      this._toast(this._t('modules.worksheet.lastSheetError'), 'error');
      return;
    }
    const idx = this.sheets.findIndex(s => s.id === id);
    if (idx === -1) return;

    this.sheets.splice(idx, 1);

    if (this.activeSheetId === id) {
      const newIdx = Math.min(idx, this.sheets.length - 1);
      this.activeSheetId = this.sheets[newIdx].id;
      const st = this.sheets[newIdx].state;
      if (st) this.grid.setState(st);
      else this.grid.clearAll();
    }

    this._renderTabs();
    this.emit('sheet:removed', { id });
  }

  switchToSheet(id) {
    if (id === this.activeSheetId) return;
    const sheet = this.sheets.find(s => s.id === id);
    if (!sheet) return;

    this._saveActiveSheet();

    this.activeSheetId = id;
    if (sheet.state) {
      this.grid.setState(sheet.state);
    } else {
      this.grid.clearAll();
    }
    this._renderTabs();
    this.emit('sheet:switched', { id });
  }

  renameSheet(id, newName) {
    const sheet = this.sheets.find(s => s.id === id);
    if (!sheet) return;
    sheet.name = newName.trim() || sheet.name;
    this._renderTabs();
    this.emit('sheet:renamed', { id, name: sheet.name });
  }

  duplicateSheet(id) {
    const src = this.sheets.find(s => s.id === id);
    if (!src) return;
    if (id === this.activeSheetId) this._saveActiveSheet();
    this.addSheet(src.name + ` (${this._t('modules.worksheet.sheetCopy')})`, id);
  }

  getActiveSheet() {
    return this.sheets.find(s => s.id === this.activeSheetId);
  }

  _saveActiveSheet() {
    const active = this.sheets.find(s => s.id === this.activeSheetId);
    if (active) {
      active.state = this.grid.getState();
    }
  }

  /** Get full workbook state for persistence */
  getState() {
    this._saveActiveSheet();
    return {
      sheets: this.sheets.map(s => ({ id: s.id, name: s.name, state: s.state })),
      activeSheetId: this.activeSheetId,
      sheetCounter: this._sheetCounter,
    };
  }

  /** Restore workbook from saved state */
  setState(data) {
    if (!data || !data.sheets) return;
    this.sheets = data.sheets.map(s => ({ id: s.id, name: s.name, state: s.state }));
    this._sheetCounter = data.sheetCounter || this.sheets.length;
    this.activeSheetId = data.activeSheetId || this.sheets[0]?.id;

    const active = this.sheets.find(s => s.id === this.activeSheetId);
    if (active?.state) {
      this.grid.setState(active.state);
    } else {
      this.grid.clearAll();
    }
    this._renderTabs();
  }

  // ─── Tab Bar ──────────────────────────────────────────

  _buildTabBar() {
    this.tabBarEl.addEventListener('contextmenu', (e) => this._onTabContextMenu(e));
    this.tabBarEl.addEventListener('dblclick', (e) => this._onTabDblClick(e));
  }

  _renderTabs() {
    let html = '';
    for (const sheet of this.sheets) {
      const active = sheet.id === this.activeSheetId ? ' active' : '';
      html += `<button class="sheet-tab${active}" data-sheet-id="${sheet.id}">
        <span class="sheet-tab__name">${sheet.name}</span>
      </button>`;
    }
    html += `<button class="sheet-tab-add" title="${this._t('modules.worksheet.addSheet')}">+</button>`;
    html += `<span class="sheet-tabs__spacer"></span>`;
    html += `<span class="sheet-tabs__status" data-ref="status-selection"></span>`;
    html += `<span class="sheet-tabs__status" data-ref="status-dims"></span>`;
    this.tabBarEl.innerHTML = html;

    this.tabBarEl.querySelectorAll('.sheet-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchToSheet(tab.dataset.sheetId));
    });

    this.tabBarEl.querySelector('.sheet-tab-add').addEventListener('click', () => this.addSheet());
  }

  _onTabDblClick(e) {
    const tab = e.target.closest('.sheet-tab');
    if (!tab) return;
    this._startTabRename(tab.dataset.sheetId, tab);
  }

  _startTabRename(sheetId, tabEl) {
    const sheet = this.sheets.find(s => s.id === sheetId);
    if (!sheet) return;

    const nameEl = tabEl.querySelector('.sheet-tab__name');
    const oldName = sheet.name;

    const input = document.createElement('input');
    input.className = 'sheet-tab__editor';
    input.value = oldName;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const newName = input.value.trim() || oldName;
      this.renameSheet(sheetId, newName);
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') {
        e.preventDefault();
        input.removeEventListener('blur', commit);
        this._renderTabs();
      }
      e.stopPropagation();
    });
  }

  _onTabContextMenu(e) {
    const tab = e.target.closest('.sheet-tab');
    if (!tab) return;
    e.preventDefault();
    const sheetId = tab.dataset.sheetId;
    const t = this._t;

    this.grid._showContextMenu(e.clientX, e.clientY, [
      { label: t('modules.worksheet.renameSheet'), action: () => {
        const tEl = this.tabBarEl.querySelector(`[data-sheet-id="${sheetId}"]`);
        if (tEl) this._startTabRename(sheetId, tEl);
      }},
      { label: t('modules.worksheet.duplicateSheet'), action: () => this.duplicateSheet(sheetId) },
      { type: 'sep' },
      { label: t('modules.worksheet.insertSheetBefore'), action: () => {
        const idx = this.sheets.findIndex(s => s.id === sheetId);
        this._sheetCounter++;
        const newId = 'sheet_' + this._sheetCounter;
        const newSheet = { id: newId, name: `${t('modules.worksheet.defaultSheetName')} ${this._sheetCounter}`, state: null };
        this._saveActiveSheet();
        this.sheets.splice(idx, 0, newSheet);
        this.activeSheetId = newId;
        this.grid.clearAll();
        this._renderTabs();
      }},
      { type: 'sep' },
      { label: t('modules.worksheet.deleteSheet'), danger: true, action: () => this.removeSheet(sheetId) },
    ]);
  }

  destroy() {
    // no persistent listeners outside tabBarEl
  }
}

// ═══════════════════════════════════════════════════════════
//  FORMULA EDITOR (popup)
// ═══════════════════════════════════════════════════════════

class FormulaEditor {
  /** @param {DataGrid} grid @param {HTMLElement} overlayEl @param {Function} t @param {Function} toast */
  constructor(grid, overlayEl, t, toast) {
    this.grid = grid;
    this.overlay = overlayEl;
    this._t = t;
    this._toast = toast;
    this._targetCell = null;
    this._open = false;

    this.textarea = overlayEl.querySelector('.formula-editor__textarea');
    this.previewVal = overlayEl.querySelector('.formula-editor__preview-value');
    this.cellLabel = overlayEl.querySelector('.formula-editor__title-sub');
    this.colsBar = overlayEl.querySelector('.formula-editor__cols-bar');

    this._bindUI();
  }

  get isOpen() { return this._open; }

  open(colIdx, rowIdx, initialFormula) {
    this.grid._cancelEdit();

    this._targetCell = { colIdx, rowIdx };
    this._open = true;

    const col = this.grid.columns[colIdx];
    const shortName = col ? col.shortName : `C${colIdx + 1}`;
    const cellRef = `${col ? col.shortName : 'C?'}[${rowIdx + 1}]`;
    const hasCustomName = col && col.name && col.name !== col.shortName;

    this.cellLabel.textContent = hasCustomName
      ? `${this._t('modules.worksheet.feCell')} ${cellRef} · ${col.name}`
      : `${this._t('modules.worksheet.feCell')} ${cellRef}`;
    const existingFormula = col?.formulas?.[rowIdx];
    this.textarea.value = initialFormula != null
      ? initialFormula
      : (existingFormula || '=');

    this._renderColPills();

    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      this.textarea.focus();
      const len = this.textarea.value.length;
      this.textarea.setSelectionRange(len, len);
      this._updatePreview();
    });
  }

  close() {
    this._open = false;
    this._targetCell = null;
    this.overlay.style.display = 'none';
    // Return focus to body so grid keyboard shortcuts work immediately
    document.activeElement?.blur();
  }

  _bindUI() {
    this.overlay.querySelector('.formula-editor__close').addEventListener('click', () => this.close());
    this.overlay.querySelector('[data-action="fe-cancel"]').addEventListener('click', () => this.close());
    this.overlay.querySelector('[data-action="fe-apply"]').addEventListener('click', () => this._apply());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    this.textarea.addEventListener('input', () => this._updatePreview());
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this._apply(); }
      e.stopPropagation();
    });

    // Simple chips (no dropdown)
    this.overlay.querySelectorAll('.fn-chip:not(.fn-chip--has-menu)').forEach(chip => {
      chip.addEventListener('click', () => {
        const insert = chip.dataset.insert || '';
        const cursorOffset = parseInt(chip.dataset.cursor ?? '-1');
        const selectLen = parseInt(chip.dataset.selectLen ?? '0');
        this._insertAtCursor(insert, cursorOffset, selectLen);
      });
    });

    // Chip-group dropdowns
    const closeAllMenus = () => {
      this.overlay.querySelectorAll('.fn-chip-group--open').forEach(g => g.classList.remove('fn-chip-group--open'));
    };

    this.overlay.querySelectorAll('.fn-chip--has-menu').forEach(trigger => {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const group = trigger.closest('.fn-chip-group');
        const wasOpen = group.classList.contains('fn-chip-group--open');
        closeAllMenus();
        if (!wasOpen) {
          group.classList.add('fn-chip-group--open');
          const menu = group.querySelector('.fn-chip-group__menu');
          const chipRect = trigger.getBoundingClientRect();
          menu.style.top = (chipRect.bottom + 4) + 'px';
          menu.style.left = chipRect.left + 'px';
          menu.style.right = '';
          // Flip to left-align with right edge if it overflows
          requestAnimationFrame(() => {
            const menuRect = menu.getBoundingClientRect();
            if (menuRect.right > window.innerWidth - 8) {
              menu.style.left = 'auto';
              menu.style.right = (window.innerWidth - chipRect.right) + 'px';
            }
          });
        }
      });
    });

    this.overlay.querySelectorAll('.fn-chip-group__item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const insert = item.dataset.insert || '';
        const cursorOffset = parseInt(item.dataset.cursor ?? '-1');
        const selectLen = parseInt(item.dataset.selectLen ?? '0');
        closeAllMenus();
        this._insertAtCursor(insert, cursorOffset, selectLen);
      });
    });

    // Close menus when clicking anywhere else in the overlay
    this.overlay.addEventListener('click', closeAllMenus);
  }

  _renderColPills() {
    this.colsBar.querySelectorAll('.col-ref-pill').forEach(p => p.remove());
    this.colsBar.querySelectorAll('.col-pills-empty').forEach(p => p.remove());

    const cols = this.grid.columns;
    if (cols.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'col-pills-empty';
      empty.style.cssText = 'font-size:11px;color:var(--color-text-tertiary);font-style:italic';
      empty.textContent = this._t('modules.worksheet.feNoCols');
      this.colsBar.appendChild(empty);
      return;
    }

    for (const col of cols) {
      const insertText = col.name ? `'${col.name}'` : col.shortName;
      const pill = document.createElement('span');
      pill.className = 'col-ref-pill';
      pill.title = `${this._t('modules.worksheet.feInsertAs')} ${insertText}  (${col.shortName} · ${col.type})`;
      pill.innerHTML = col.name
        ? `<span>${col.name}</span><span class="col-ref-pill__short">${col.shortName}</span>`
        : `<span>${col.shortName}</span>`;
      pill.addEventListener('click', () => this._insertAtCursor(insertText));
      this.colsBar.appendChild(pill);
    }
  }

  _insertAtCursor(text, cursorBack, selectLen) {
    const ta = this.textarea;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + text + ta.value.substring(end);

    let pos;
    if (cursorBack != null && cursorBack !== -1 && !isNaN(cursorBack)) {
      pos = start + cursorBack;
    } else {
      pos = text.endsWith(')') ? start + text.length - 1 : start + text.length;
    }
    ta.focus();
    const selEnd = selectLen > 0 ? pos + selectLen : pos;
    ta.setSelectionRange(pos, selEnd);
    this._updatePreview();
  }

  _updatePreview() {
    const raw = this.textarea.value.trim();
    const pv = this.previewVal;

    if (!raw || raw === '=') {
      pv.textContent = '\u2014';
      pv.className = 'formula-editor__preview-value empty';
      this.textarea.classList.remove('has-error');
      return;
    }

    if (!isFormula(raw)) {
      pv.textContent = raw;
      pv.className = 'formula-editor__preview-value ok';
      this.textarea.classList.remove('has-error');
      return;
    }

    const { result, error } = evaluateFormula(raw, this.grid);
    if (error) {
      pv.textContent = error;
      pv.className = 'formula-editor__preview-value error';
      this.textarea.classList.add('has-error');
    } else {
      pv.textContent = result == null ? `(${this._t('modules.worksheet.feEmpty')})` : String(result);
      pv.className = 'formula-editor__preview-value ok';
      this.textarea.classList.remove('has-error');
    }
  }

  _apply() {
    if (!this._targetCell) { this.close(); return; }
    const { colIdx, rowIdx } = this._targetCell;
    const raw = this.textarea.value.trim();

    const col = this.grid.columns[colIdx];
    if (!col) { this.close(); return; }

    try {
      const oldFormula = col.formulas?.[rowIdx] || null;
      const oldValue = col.values[rowIdx];

      if (isFormula(raw)) {
        if (!col.formulas) col.formulas = new Array(this.grid.rowCount).fill(null);
        col.formulas[rowIdx] = raw;
        const { result, error } = evaluateFormula(raw, this.grid);
        col.values[rowIdx] = error ? null : result;
      } else if (raw !== '') {
        if (col.formulas) col.formulas[rowIdx] = null;
        col.values[rowIdx] = parseCellInput(col, raw);
      } else {
        if (col.formulas) col.formulas[rowIdx] = null;
        col.values[rowIdx] = null;
      }

      this.grid.history.push({
        type: 'cell-edit', columnId: col.id, rowIndex: rowIdx,
        oldValue, newValue: col.values[rowIdx],
        oldFormula, newFormula: col.formulas?.[rowIdx] || null,
      });
    } finally {
      this.close();
      this.grid.render();

      this.grid.setSelection({
        startCol: colIdx, startRow: rowIdx,
        endCol: colIdx, endRow: rowIdx,
        activeCol: colIdx, activeRow: rowIdx,
      });
    }

    this._toast(this._t('modules.worksheet.formulaApplied'), 'success');
  }

  destroy() {
    // all listeners are on elements inside overlay, will be GC'd
  }
}

// ═══════════════════════════════════════════════════════════
//  SVG ICON STRINGS
// ═══════════════════════════════════════════════════════════

const ICONS = {
  undo:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 10h10a5 5 0 0 1 0 10H9"/><path d="M3 10l4-4"/><path d="M3 10l4 4"/></svg>',
  redo:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 10H11a5 5 0 0 0 0 10h4"/><path d="M21 10l-4-4"/><path d="M21 10l-4 4"/></svg>',
  plus:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  import:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  export:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  trash:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  formula: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 7c0-1.1.9-2 2-2h3l2 4-2 4H6a2 2 0 0 1-2-2V7z"/><path d="M20 7c0-1.1-.9-2-2-2h-3l-2 4 2 4h3a2 2 0 0 0 2-2V7z"/></svg>',
  check:   '<svg style="width:13px;height:13px;margin-right:4px;vertical-align:middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
};

// ═══════════════════════════════════════════════════════════
//  MODULE EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  id: 'worksheet',
  phase: 'data',
  icon: 'table',
  i18nKey: 'modules.worksheet',
  version: '1.0.0',
  help: () => import('./worksheet-help.js'),

  _grid: null,
  _workbook: null,
  _formulaEditor: null,
  _container: null,
  _context: null,
  _boundKeyDown: null,

  async init(container, context) {
    this._container = container;
    this._context = context;
    const t = (key, vars) => context.i18n.t(key, vars);
    this._t = t;

    // ─── Build DOM ─────────────────────────────────────
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.height = '100%';
    container.style.overflow = 'hidden';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'worksheet-toolbar';
    toolbar.innerHTML = this._buildToolbarHTML(t);
    container.appendChild(toolbar);

    // DataGrid container
    const gridWrap = document.createElement('div');
    gridWrap.className = 'datagrid dmike-embedded-grid dmike-embedded-grid--fill';
    const dropzone = document.createElement('div');
    dropzone.className = 'datagrid__dropzone';
    dropzone.innerHTML = `<div class="datagrid__dropzone-text">${t('modules.worksheet.dropzoneText')}</div>`;
    gridWrap.appendChild(dropzone);
    container.appendChild(gridWrap);

    // Sheet tabs
    const sheetTabs = document.createElement('div');
    sheetTabs.className = 'sheet-tabs';
    container.appendChild(sheetTabs);

    // Formula editor overlay
    const feOverlay = document.createElement('div');
    feOverlay.className = 'formula-editor-overlay';
    feOverlay.style.display = 'none';
    feOverlay.setAttribute('role', 'dialog');
    feOverlay.setAttribute('aria-modal', 'true');
    feOverlay.innerHTML = this._buildFormulaEditorHTML(t);
    container.appendChild(feOverlay);

    // Hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.tsv,.xlsx,.xls';
    fileInput.style.display = 'none';
    fileInput.dataset.ref = 'file-input';
    container.appendChild(fileInput);

    // ─── Instantiate components ──────────────────────────

    const toast = (msg, type) => {
      if (context.notify) {
        context.notify(msg, type);
      } else {
        this._showToast(msg, type);
      }
    };

    this._grid = new DataGrid(gridWrap, { toast, t });
    this._grid.setDropzone(dropzone);
    this._workbook = new Workbook(this._grid, sheetTabs, t, toast);
    this._formulaEditor = new FormulaEditor(this._grid, feOverlay, t, toast);

    // ─── Wire toolbar buttons ────────────────────────────

    const btn = (sel) => toolbar.querySelector(sel);
    btn('[data-action="undo"]').addEventListener('click', () => this._grid.undo());
    btn('[data-action="redo"]').addEventListener('click', () => this._grid.redo());
    btn('[data-action="add-col"]').addEventListener('click', () => this._grid.addColumn());
    btn('[data-action="add-rows"]').addEventListener('click', () => this._grid.addRows(10));
    btn('[data-action="delete"]').addEventListener('click', () => this._grid._clearSelection());
    // Export dropdown
    const exportDropdown = toolbar.querySelector('[data-action="export-dropdown"]');
    const exportToggle = exportDropdown.querySelector('.toolbar__btn');
    const exportMenu = exportDropdown.querySelector('.toolbar__dropdown-menu');
    exportToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle('open');
    });
    exportMenu.querySelector('[data-action="export-xlsx"]').addEventListener('click', () => { exportMenu.classList.remove('open'); this._grid.downloadXLSX(); });
    exportMenu.querySelector('[data-action="export-csv"]').addEventListener('click', () => { exportMenu.classList.remove('open'); this._grid.downloadCSV(); });
    exportMenu.querySelector('[data-action="export-json"]').addEventListener('click', () => { exportMenu.classList.remove('open'); this._grid.downloadJSON(); });
    document.addEventListener('click', () => exportMenu.classList.remove('open'));

    btn('[data-action="formula-editor"]').addEventListener('click', () => {
      const sel = this._grid.selection;
      if (!sel) { toast(t('modules.worksheet.selectCellFirst'), 'error'); return; }
      this._formulaEditor.open(sel.activeCol, sel.activeRow);
    });

    btn('[data-action="import"]').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this._grid._handleFileImport(file);
      e.target.value = '';
    });

    // ─── Update toolbar & status on grid render ──────────

    // ─── Auto-save worksheet state ─────
    const autoSave = this._debounce(() => {
      try {
        if (this._context?.stateManager && this._context?.instanceId) {
          this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
        }
      } catch { /* ignore — prevent persistence errors from breaking the grid */ }
    }, 2000);

    // ─── Fast persist + notify on data mutations ─────
    // Consumers (DoE Planner, Regression, Process Capability, …) read
    // worksheet data via stateManager.getModuleState and refresh on
    // `worksheet:dataChanged`. The render-based autoSave above only
    // fires after 2 s and emits nothing, so without this the consumers
    // see stale data when the user edits cells directly.
    const persistAndNotify = this._debounce(() => {
      try {
        if (this._context?.stateManager && this._context?.instanceId) {
          this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
          this._context.eventBus.emit('worksheet:dataChanged', { instanceId: this._context.instanceId });
        }
      } catch { /* ignore */ }
    }, 150);

    const dataMutationEvents = [
      'cell:changed', 'data:pasted', 'data:imported',
      'column:added', 'column:removed', 'column:renamed',
      'column:type-changed', 'column:moved',
      'rows:added', 'rows:removed', 'rows:moved',
      'undo', 'redo',
    ];
    for (const evt of dataMutationEvents) {
      this._grid.on(evt, persistAndNotify);
    }

    const updateStatusBar = () => {
      const selEl = sheetTabs.querySelector('[data-ref="status-selection"]');
      const dimsEl = sheetTabs.querySelector('[data-ref="status-dims"]');
      if (dimsEl) {
        dimsEl.textContent = t('modules.worksheet.statusDims', {
          cols: this._grid.columns.length,
          rows: this._grid.rowCount,
        });
      }
      if (selEl && this._grid.selection) {
        const s = this._grid.selection;
        const rows = Math.abs(s.endRow - s.startRow) + 1;
        const cols = Math.abs(s.endCol - s.startCol) + 1;
        selEl.textContent = rows * cols > 1
          ? t('modules.worksheet.statusSelection', { rows, cols })
          : `${this._grid.columns[s.activeCol]?.shortName || '?'}[${s.activeRow + 1}]`;
      }
    };

    this._grid.on('render', () => {
      autoSave();
      const undoBtn = btn('[data-action="undo"]');
      const redoBtn = btn('[data-action="redo"]');
      if (undoBtn) undoBtn.disabled = !this._grid.history.canUndo();
      if (redoBtn) redoBtn.disabled = !this._grid.history.canRedo();
      updateStatusBar();
    });

    this._grid.on('selection:changed', updateStatusBar);

    // ─── Persist initial state immediately so column pickers see it ──
    // Only write if no state exists yet (avoids overwriting pre-populated
    // data written by other modules before this worksheet was opened).
    try {
      const existing = context.stateManager.getModuleState(context.instanceId);
      if (!existing || !existing.sheets) {
        context.stateManager.setModuleState(context.instanceId, this.getState());
      }
      context.eventBus.emit('worksheet:dataChanged', { instanceId: context.instanceId });
    } catch { /* ignore */ }

    // ─── F4 shortcut for formula editor ──────────────────

    this._boundKeyDown = (e) => {
      if (!container.closest('.app-workspace')) return;
      if (e.key === 'F4' && !this._formulaEditor.isOpen) {
        e.preventDefault();
        const sel = this._grid.selection;
        if (!sel) return;
        if (this._grid.editingCell && this._grid.editorEl) {
          const val = this._grid.editorEl.value;
          this._grid._cancelEdit();
          this._formulaEditor.open(sel.activeCol, sel.activeRow, val);
        } else {
          this._formulaEditor.open(sel.activeCol, sel.activeRow);
        }
      }
    };
    document.addEventListener('keydown', this._boundKeyDown, true);

    // ─── Listen for external appendColumn requests ───────
    this._onAppendColumn = ({ instanceId, sheetId, colId, name, values, discrete, type }) => {
      if (instanceId !== context.instanceId) return;

      const colType = type === 'text' ? 'text' : 'numeric';
      const isText = colType === 'text';
      const format = isText ? {} : { decimals: discrete ? 0 : 6 };

      const isActiveSheet = sheetId === this._workbook.activeSheetId;
      // __first__ = overwrite first existing column
      let resolvedColId = colId;
      if (colId === '__first__') {
        if (isActiveSheet) {
          resolvedColId = this._grid.columns[0]?.id;
        } else {
          const sh = this._workbook.sheets.find(s => s.id === sheetId);
          resolvedColId = sh?.state?.columns?.[0]?.id;
        }
      }
      const isNewCol = !resolvedColId || resolvedColId === '__new__';

      if (isActiveSheet) {
        if (isNewCol) {
          // Append new column to the live grid
          const col = this._grid.addColumn({ name, type: colType, format });
          const needed = values.length - this._grid.rowCount;
          if (needed > 0) this._grid.addRows(needed);
          for (let i = 0; i < values.length; i++) col.values[i] = values[i];
        } else {
          // Overwrite existing column in the live grid
          const col = this._grid.columns.find(c => c.id === resolvedColId);
          if (!col) return;
          if (isText && col.type !== 'text') {
            col.type = 'text';
            col.format = {};
          }
          const needed = values.length - this._grid.rowCount;
          if (needed > 0) this._grid.addRows(needed);
          for (let i = 0; i < this._grid.rowCount; i++) {
            col.values[i] = i < values.length ? values[i] : null;
          }
        }
        this._grid.render();
      } else {
        // Target is a non-active sheet — modify stored state
        this._workbook._saveActiveSheet();
        const sheet = this._workbook.sheets.find(s => s.id === sheetId);
        if (!sheet) return;
        if (!sheet.state) sheet.state = { columns: [], rowCount: 0, colWidths: {}, sortCol: null, sortDir: null, selection: null };
        const cols = sheet.state.columns || [];

        if (isNewCol) {
          const nextIdx = cols.length + 1;
          cols.push({
            id: crypto.randomUUID(),
            name,
            shortName: 'C' + nextIdx,
            type: colType,
            unit: '',
            values,
            formulas: new Array(values.length).fill(null),
            format,
          });
          sheet.state.columns = cols;
        } else {
          const col = cols.find(c => c.id === resolvedColId);
          if (!col) return;
          if (isText) {
            col.type = 'text';
            col.format = {};
          }
          col.values = values;
          col.formulas = new Array(values.length).fill(null);
        }
        sheet.state.rowCount = Math.max(sheet.state.rowCount || 0, values.length);
      }

      // Flush state to stateManager so other modules see the updated data immediately
      try {
        context.stateManager.setModuleState(instanceId, this.getState());
      } catch { /* ignore */ }

      // Notify other modules (e.g. column pickers) that worksheet data changed
      context.eventBus.emit('worksheet:dataChanged', { instanceId });
    };
    context.eventBus.on('worksheet:appendColumn', this._onAppendColumn);

    // ─── Show formula-editor expand hint when editing a formula cell

    this._grid.on('edit:start', ({ colIdx, rowIdx, initialChar, formula }) => {
      if (initialChar === '=' || formula) {
        _showFormulaExpandHint(this._grid, this._formulaEditor, colIdx, rowIdx);
      }
    });
  },

  async destroy() {
    if (this._boundKeyDown) {
      document.removeEventListener('keydown', this._boundKeyDown, true);
    }
    if (this._onAppendColumn && this._context?.eventBus) {
      this._context.eventBus.off('worksheet:appendColumn', this._onAppendColumn);
    }
    this._grid?.destroy();
    this._workbook?.destroy();
    this._formulaEditor?.destroy();
    this._container.innerHTML = '';
  },

  onLanguageChange(lang) {
    // Full re-render would be needed for toolbar labels;
    // for now the grid content is language-agnostic.
  },

  onThemeChange(theme) {
    // CSS custom properties handle theme changes automatically
  },

  getState() {
    if (!this._workbook) return {};
    return this._workbook.getState();
  },

  setState(data) {
    if (!this._workbook || !data) return;
    this._workbook.setState(data);
  },

  // ─── Helpers ──────────────────────────────────────────

  _buildToolbarHTML(t) {
    return `
      <button class="toolbar__btn" data-action="undo" title="${t('modules.worksheet.undo')}" disabled>
        ${ICONS.undo}
      </button>
      <button class="toolbar__btn" data-action="redo" title="${t('modules.worksheet.redo')}" disabled>
        ${ICONS.redo}
      </button>
      <div class="toolbar__sep"></div>
      <button class="toolbar__btn" data-action="add-col" title="${t('modules.worksheet.addColumn')}">
        ${ICONS.plus} ${t('modules.worksheet.column')}
      </button>
      <button class="toolbar__btn" data-action="add-rows" title="${t('modules.worksheet.addRows')}">
        ${ICONS.plus} ${t('modules.worksheet.rows')}
      </button>
      <div class="toolbar__sep"></div>
      <button class="toolbar__btn toolbar__btn--accent" data-action="import" title="${t('modules.worksheet.importFile')}">
        ${ICONS.import} Import
      </button>
      <div class="toolbar__dropdown" data-action="export-dropdown">
        <button class="toolbar__btn" title="${t('modules.worksheet.export')}">
          ${ICONS.export} ${t('modules.worksheet.export')}
          <svg class="toolbar__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="toolbar__dropdown-menu">
          <button class="toolbar__dropdown-item" data-action="export-xlsx">Excel (.xlsx)</button>
          <button class="toolbar__dropdown-item" data-action="export-csv">CSV (.csv)</button>
          <button class="toolbar__dropdown-item" data-action="export-json">JSON (.json)</button>
        </div>
      </div>
      <div class="toolbar__sep"></div>
      <button class="toolbar__btn" data-action="delete" title="${t('modules.worksheet.deleteSelection')}">
        ${ICONS.trash}
      </button>
      <div class="toolbar__sep"></div>
      <button class="toolbar__btn toolbar__btn--accent" data-action="formula-editor" title="${t('modules.worksheet.formulaEditor')} (F4)">
        ${ICONS.formula} ${t('modules.worksheet.formula')}
      </button>
      <div class="toolbar__spacer"></div>
    `;
  },

  _buildFormulaEditorHTML(t) {
    return `
    <div class="formula-editor">
      <div class="formula-editor__header">
        <div class="formula-editor__icon">\u0192</div>
        <div class="formula-editor__title">
          <div class="formula-editor__title-main">${t('modules.worksheet.formulaEditor')}</div>
          <div class="formula-editor__title-sub">${t('modules.worksheet.feCell')} \u2014</div>
        </div>
        <button class="formula-editor__close" title="${t('common.close')} (Esc)">\u00D7</button>
      </div>

      <div class="formula-editor__fn-bar">
        <div class="formula-editor__fn-label">${t('modules.worksheet.feFunctions')}</div>
        <span class="fn-chip fn-chip--stat" data-insert="SUM()" data-cursor="-1" title="${t('modules.worksheet.fnSum')}">SUM</span>
        <span class="fn-chip fn-chip--stat" data-insert="AVERAGE()" data-cursor="-1" title="${t('modules.worksheet.fnAvg')}">AVG</span>
        <span class="fn-chip-group">
          <span class="fn-chip fn-chip--stat fn-chip--has-menu">COUNT <span class="fn-chip__arrow">\u25BE</span></span>
          <span class="fn-chip-group__menu">
            <span class="fn-chip-group__item" data-insert="COUNT()" data-cursor="-1">COUNT &mdash; ${t('modules.worksheet.fnCount')}</span>
            <span class="fn-chip-group__item" data-insert="COUNTA()" data-cursor="-1">COUNTA &mdash; ${t('modules.worksheet.fnCounta')}</span>
            <span class="fn-chip-group__item" data-insert="COUNTIF(col; > x)" data-cursor="8" data-select-len="3">COUNTIF &mdash; ${t('modules.worksheet.fnCountif')}</span>
            <span class="fn-chip-group__item" data-insert="SUMIF(col; > x)" data-cursor="6" data-select-len="3">SUMIF &mdash; ${t('modules.worksheet.fnSumif')}</span>
          </span>
        </span>
        <span class="fn-chip fn-chip--stat" data-insert="MIN()" data-cursor="-1" title="${t('modules.worksheet.fnMin')}">MIN</span>
        <span class="fn-chip fn-chip--stat" data-insert="MAX()" data-cursor="-1" title="${t('modules.worksheet.fnMax')}">MAX</span>
        <span class="fn-chip fn-chip--sigma" data-insert="STDEV()" data-cursor="-1" title="${t('modules.worksheet.fnStdev')}">STDEV</span>
        <span class="fn-chip fn-chip--sigma" data-insert="VAR()" data-cursor="-1" title="${t('modules.worksheet.fnVar')}">VAR</span>
        <span class="fn-chip fn-chip--sigma" data-insert="MEDIAN()" data-cursor="-1" title="${t('modules.worksheet.fnMedian')}">MEDIAN</span>
        <span class="fn-chip fn-chip--sigma" data-insert="MODE()" data-cursor="-1" title="${t('modules.worksheet.fnMode')}">MODE</span>
        <span class="fn-chip-group">
          <span class="fn-chip fn-chip--sigma fn-chip--has-menu">QUANTILE <span class="fn-chip__arrow">\u25BE</span></span>
          <span class="fn-chip-group__menu">
            <span class="fn-chip-group__item" data-insert="PERCENTILE(col; p)" data-cursor="11" data-select-len="3">PERCENTILE &mdash; ${t('modules.worksheet.fnPercentile')}</span>
            <span class="fn-chip-group__item" data-insert="QUARTILE(col; q)" data-cursor="9" data-select-len="3">QUARTILE &mdash; ${t('modules.worksheet.fnQuartile')}</span>
            <span class="fn-chip-group__item" data-insert="IQR()" data-cursor="-1">IQR &mdash; ${t('modules.worksheet.fnIqr')}</span>
            <span class="fn-chip-group__item" data-insert="RANGE()" data-cursor="-1">RANGE &mdash; ${t('modules.worksheet.fnRange')}</span>
            <span class="fn-chip-group__item" data-insert="SKEW()" data-cursor="-1">SKEW &mdash; ${t('modules.worksheet.fnSkew')}</span>
            <span class="fn-chip-group__item" data-insert="KURT()" data-cursor="-1">KURT &mdash; ${t('modules.worksheet.fnKurt')}</span>
          </span>
        </span>
        <span class="fn-chip-group">
          <span class="fn-chip fn-chip--sigma fn-chip--has-menu">Cp/Cpk <span class="fn-chip__arrow">\u25BE</span></span>
          <span class="fn-chip-group__menu">
            <span class="fn-chip-group__item" data-insert="CP(col; LSL; USL)" data-cursor="3" data-select-len="3">CP &mdash; ${t('modules.worksheet.fnCp')}</span>
            <span class="fn-chip-group__item" data-insert="CPK(col; LSL; USL)" data-cursor="4" data-select-len="3">CPK &mdash; ${t('modules.worksheet.fnCpk')}</span>
            <span class="fn-chip-group__item" data-insert="CPKUP(col; USL)" data-cursor="6" data-select-len="3">CPKUP &mdash; ${t('modules.worksheet.fnCpkUp')}</span>
            <span class="fn-chip-group__item" data-insert="CPKLO(col; LSL)" data-cursor="6" data-select-len="3">CPKLO &mdash; ${t('modules.worksheet.fnCpkLo')}</span>
          </span>
        </span>
        <span class="fn-chip fn-chip--logic" data-insert="IF(cond; then; else)" data-cursor="3" data-select-len="4" title="${t('modules.worksheet.fnIf')}">IF</span>
        <span class="fn-chip fn-chip--logic" data-insert="AND(a; b)" data-cursor="4" data-select-len="1" title="${t('modules.worksheet.fnAnd')}">AND</span>
        <span class="fn-chip fn-chip--logic" data-insert="OR(a; b)" data-cursor="3" data-select-len="1" title="${t('modules.worksheet.fnOr')}">OR</span>
        <span class="fn-chip fn-chip--logic" data-insert="NOT()" data-cursor="-1" title="${t('modules.worksheet.fnNot')}">NOT</span>
        <span class="fn-chip fn-chip--math" data-insert="ABS()" data-cursor="-1" title="${t('modules.worksheet.fnAbs')}">ABS</span>
        <span class="fn-chip fn-chip--math" data-insert="MOD(x; n)" data-cursor="4" data-select-len="1" title="${t('modules.worksheet.fnMod')}">MOD</span>
        <span class="fn-chip fn-chip--math" data-insert="SIGN()" data-cursor="-1" title="${t('modules.worksheet.fnSign')}">SIGN</span>
        <span class="fn-chip fn-chip--math" data-insert="CONCAT(a; b)" data-cursor="7" data-select-len="1" title="${t('modules.worksheet.fnConcat')}">CONCAT</span>
        <span class="fn-chip-group">
          <span class="fn-chip fn-chip--math fn-chip--has-menu">ROUND <span class="fn-chip__arrow">\u25BE</span></span>
          <span class="fn-chip-group__menu">
            <span class="fn-chip-group__item" data-insert="ROUND(x; n)" data-cursor="6" data-select-len="1">ROUND &mdash; ${t('modules.worksheet.fnRound')}</span>
            <span class="fn-chip-group__item" data-insert="ROUNDUP(x; n)" data-cursor="8" data-select-len="1">ROUNDUP &mdash; ${t('modules.worksheet.fnRoundUp')}</span>
            <span class="fn-chip-group__item" data-insert="ROUNDDOWN(x; n)" data-cursor="10" data-select-len="1">ROUNDDOWN &mdash; ${t('modules.worksheet.fnRoundDown')}</span>
          </span>
        </span>
        <span class="fn-chip fn-chip--math" data-insert="SQRT()" data-cursor="-1" title="${t('modules.worksheet.fnSqrt')}">\u221A</span>
        <span class="fn-chip fn-chip--math" data-insert="POWER(base; exp)" data-cursor="6" data-select-len="4" title="${t('modules.worksheet.fnPower')}">x\u207F</span>
        <span class="fn-chip fn-chip--math" data-insert="PI()" data-cursor="-1" title="${t('modules.worksheet.fnPi')}">\u03C0</span>
        <span class="fn-chip-group">
          <span class="fn-chip fn-chip--math fn-chip--has-menu">LOG <span class="fn-chip__arrow">\u25BE</span></span>
          <span class="fn-chip-group__menu">
            <span class="fn-chip-group__item" data-insert="LN()" data-cursor="-1">LN &mdash; ${t('modules.worksheet.fnLn')}</span>
            <span class="fn-chip-group__item" data-insert="LOG(x; base)" data-cursor="4" data-select-len="1">LOG &mdash; ${t('modules.worksheet.fnLog')}</span>
            <span class="fn-chip-group__item" data-insert="EXP()" data-cursor="-1">EXP &mdash; ${t('modules.worksheet.fnExp')}</span>
          </span>
        </span>
        <span class="fn-chip-group">
          <span class="fn-chip fn-chip--trig fn-chip--has-menu">SIN <span class="fn-chip__arrow">\u25BE</span></span>
          <span class="fn-chip-group__menu">
            <span class="fn-chip-group__item" data-insert="SIN()" data-cursor="-1">SIN &mdash; ${t('modules.worksheet.fnSin')}</span>
            <span class="fn-chip-group__item" data-insert="SIND()" data-cursor="-1">SIND &mdash; ${t('modules.worksheet.fnSind')}</span>
            <span class="fn-chip-group__item" data-insert="ASIN()" data-cursor="-1">ASIN &mdash; ${t('modules.worksheet.fnAsin')}</span>
            <span class="fn-chip-group__item" data-insert="ASIND()" data-cursor="-1">ASIND &mdash; ${t('modules.worksheet.fnAsind')}</span>
          </span>
        </span>
        <span class="fn-chip-group">
          <span class="fn-chip fn-chip--trig fn-chip--has-menu">COS <span class="fn-chip__arrow">\u25BE</span></span>
          <span class="fn-chip-group__menu">
            <span class="fn-chip-group__item" data-insert="COS()" data-cursor="-1">COS &mdash; ${t('modules.worksheet.fnCos')}</span>
            <span class="fn-chip-group__item" data-insert="COSD()" data-cursor="-1">COSD &mdash; ${t('modules.worksheet.fnCosd')}</span>
            <span class="fn-chip-group__item" data-insert="ACOS()" data-cursor="-1">ACOS &mdash; ${t('modules.worksheet.fnAcos')}</span>
            <span class="fn-chip-group__item" data-insert="ACOSD()" data-cursor="-1">ACOSD &mdash; ${t('modules.worksheet.fnAcosd')}</span>
          </span>
        </span>
        <span class="fn-chip-group">
          <span class="fn-chip fn-chip--trig fn-chip--has-menu">TAN <span class="fn-chip__arrow">\u25BE</span></span>
          <span class="fn-chip-group__menu">
            <span class="fn-chip-group__item" data-insert="TAN()" data-cursor="-1">TAN &mdash; ${t('modules.worksheet.fnTan')}</span>
            <span class="fn-chip-group__item" data-insert="TAND()" data-cursor="-1">TAND &mdash; ${t('modules.worksheet.fnTand')}</span>
            <span class="fn-chip-group__item" data-insert="ATAN()" data-cursor="-1">ATAN &mdash; ${t('modules.worksheet.fnAtan')}</span>
            <span class="fn-chip-group__item" data-insert="ATAND()" data-cursor="-1">ATAND &mdash; ${t('modules.worksheet.fnAtand')}</span>
            <span class="fn-chip-group__item" data-insert="ATAN2(y; x)" data-cursor="6" data-select-len="1">ATAN2 &mdash; ${t('modules.worksheet.fnAtan2')}</span>
          </span>
        </span>
        <span class="fn-chip fn-chip--trig" data-insert="RAD()" data-cursor="-1" title="${t('modules.worksheet.fnRad')}">RAD</span>
        <span class="fn-chip fn-chip--trig" data-insert="DEG()" data-cursor="-1" title="${t('modules.worksheet.fnDeg')}">DEG</span>
      </div>

      <div class="formula-editor__cols-bar">
        <div class="formula-editor__cols-label">${t('modules.worksheet.feColumnRefs')}</div>
      </div>

      <div class="formula-editor__body">
        <div class="formula-editor__textarea-wrap">
          <textarea
            class="formula-editor__textarea"
            placeholder="${t('modules.worksheet.fePlaceholder')}"
            spellcheck="false"
            autocomplete="off"
          ></textarea>
        </div>
        <div class="formula-editor__preview">
          <span class="formula-editor__preview-label">${t('modules.worksheet.fePreview')}</span>
          <span class="formula-editor__preview-value empty">\u2014</span>
        </div>
        <div class="formula-editor__ref-guide">
          <div class="formula-editor__ref-guide-title">${t('modules.worksheet.feRefGuideTitle')}</div>
          <table class="formula-editor__ref-table">
            <tr><td class="fe-ref-syntax"><code>C2</code> <code>'${t('modules.worksheet.feRefExampleName')}'</code></td><td>${t('modules.worksheet.feRefCol')}</td></tr>
            <tr><td class="fe-ref-syntax"><code>C2[5]</code> <code>'${t('modules.worksheet.feRefExampleName')}'[5]</code></td><td>${t('modules.worksheet.feRefCell')}</td></tr>
            <tr><td class="fe-ref-syntax"><code>C1:C3</code> <code>'A':'C'</code></td><td>${t('modules.worksheet.feRefRange')}</td></tr>
            <tr><td class="fe-ref-syntax"><code>C1[2]:C3[5]</code> <code>'A'[2]:'C'[5]</code></td><td>${t('modules.worksheet.feRefCellRange')}</td></tr>
          </table>
          <table class="formula-editor__ref-table formula-editor__ref-table--sep">
            <tr><td class="fe-ref-syntax"><code>SUM(C1; C3)</code> <code>IF(C1 > 10; "${t('modules.worksheet.feRefYes')}"; "${t('modules.worksheet.feRefNo')}")</code></td><td>${t('modules.worksheet.feRefSep')}</td></tr>
          </table>
        </div>
        <div class="formula-editor__help">
          <kbd>Ctrl+Enter</kbd> ${t('modules.worksheet.feApply')} &nbsp;\u00B7&nbsp;
          <kbd>Esc</kbd> ${t('common.cancel')}
        </div>
      </div>

      <div class="formula-editor__footer">
        <div class="formula-editor__footer-btns">
          <button class="btn" data-action="fe-cancel">${t('common.cancel')}</button>
          <button class="btn btn--primary" data-action="fe-apply">
            ${ICONS.check} ${t('modules.worksheet.feApply')}
          </button>
        </div>
      </div>
    </div>
    `;
  },


  _debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  },

  _showToast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `datagrid-toast datagrid-toast--${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  },
};

// ─── Formula expand hint helper ──────────────────────────

function _showFormulaExpandHint(grid, fe, colIdx, rowIdx) {
  grid.container.querySelectorAll('.fe-expand-hint').forEach(h => h.remove());

  const rows = grid.bodyDiv.querySelectorAll('tbody tr');
  const td = rows[rowIdx]?.children[colIdx + 1];
  if (!td) return;

  const hint = document.createElement('button');
  hint.className = 'fe-expand-hint';
  hint.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`;
  hint.title = 'Formula Editor (F4)';
  hint.style.cssText = `
    position:absolute; z-index:20;
    right:-1px; top:-1px;
    width:20px; height:20px;
    background:var(--color-accent); border:none; border-radius:0 0 0 4px;
    color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center;
    padding:0; font-size:10px;
    box-shadow: -2px 2px 6px rgba(0,0,0,.3);
  `;
  td.style.position = 'relative';
  td.appendChild(hint);

  hint.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const currentVal = grid.editorEl ? grid.editorEl.value : '=';
    grid._cancelEdit();
    hint.remove();
    fe.open(colIdx, rowIdx, currentVal);
  });

  const cleanup = () => {
    hint.remove();
    grid.container.removeEventListener('click', cleanup, true);
  };
  setTimeout(() => grid.container.addEventListener('click', cleanup, true), 50);
}
