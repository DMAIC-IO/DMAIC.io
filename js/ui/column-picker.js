/**
 * D.Mike — Column Picker Component (column-picker.js)
 *
 * Shared UI widget for selecting worksheet columns.
 * Two modes: single-select (<select> dropdown) and multi-select (checkbox list).
 * Filters by column type and minimum non-null value count.
 *
 * Usage:
 *   import { ColumnPicker, discoverColumns, getColumnValues, refToKey, keyToRef } from '../../ui/column-picker.js';
 *
 *   // Single-select
 *   const picker = new ColumnPicker(wrapEl, context, {
 *     mode: 'single',
 *     types: ['numeric'],
 *     minCount: 2,
 *     onChange: (ref) => { ... },
 *   });
 *
 *   // Multi-select
 *   const picker = new ColumnPicker(wrapEl, context, {
 *     mode: 'multi',
 *     types: ['numeric', 'currency', 'percent'],
 *     minCount: 5,
 *     onChange: (refs) => { ... },
 *   });
 */

/**
 * Iterate every phase that currently exists in state. Cycle-agnostic — the
 * keys reflect whatever phases the active project's cycle defines (incl.
 * `data`, `extras`, and any future methodology phases like `design` / `verify`).
 * @param {object} stateManager
 * @returns {string[]}
 */
function _allPhaseKeys(stateManager) {
  return Object.keys(stateManager.get('phases') || {});
}

// ── Pure utility functions (exported for use without widget) ──────────

/**
 * Serialize a column reference to a pipe-delimited key.
 * @param {{ instanceId: string, sheetId: string, columnId: string }} ref
 * @returns {string}
 */
export function refToKey(ref) {
  return ref ? `${ref.instanceId}|${ref.sheetId}|${ref.columnId}` : '';
}

/**
 * Deserialize a pipe-delimited key to a column reference.
 * @param {string} key
 * @returns {{ instanceId: string, sheetId: string, columnId: string }|null}
 */
export function keyToRef(key) {
  if (!key) return null;
  const [instanceId, sheetId, columnId] = key.split('|');
  return { instanceId, sheetId, columnId };
}

/**
 * @typedef {Object} ColumnInfo
 * @property {string} instanceId
 * @property {string} sheetId
 * @property {string} sheetName
 * @property {string} columnId
 * @property {string} columnName
 * @property {string} shortName
 * @property {string} type
 * @property {number} valueCount
 */

/**
 * Discover all worksheet columns, optionally filtered.
 * @param {Object} stateManager
 * @param {Object} [filter]
 * @param {Set<string>|string[]} [filter.types] — Allowed types. Omit for all.
 * @param {number} [filter.minCount=0] — Minimum non-null values.
 * @param {number} [filter.maxCount=Infinity] — Maximum non-null values. Use 0 to show only empty columns.
 * @returns {ColumnInfo[]}
 */
export function discoverColumns(stateManager, filter) {
  const typeSet = filter?.types
    ? (filter.types instanceof Set ? filter.types : new Set(filter.types))
    : null;
  const minCount = filter?.minCount || 0;
  const maxCount = filter?.maxCount ?? Infinity;
  const columns = [];

  for (const phase of _allPhaseKeys(stateManager)) {
    const instances = stateManager.get(`phases.${phase}`) ?? [];
    for (const inst of instances) {
      if (inst.moduleId !== 'worksheet') continue;
      const ws = stateManager.getModuleState(inst.instanceId);
      if (!ws?.sheets) continue;
      for (const sheet of ws.sheets) {
        if (!sheet.state?.columns) continue;
        for (const col of sheet.state.columns) {
          if (typeSet && !typeSet.has(col.type)) continue;
          const nonNull = (col.values || []).filter(v => v != null).length;
          if (nonNull < minCount || nonNull > maxCount) continue;
          columns.push({
            instanceId: inst.instanceId,
            sheetId: sheet.id,
            sheetName: sheet.name,
            columnId: col.id,
            columnName: col.name || '',
            shortName: col.shortName || '?',
            type: col.type,
            valueCount: nonNull,
          });
        }
      }
    }
  }
  return columns;
}

/**
 * Generate a unique sheet name by appending a number if necessary.
 * Collects all existing sheet names across all worksheets and ensures
 * the returned name does not collide.
 * @param {Object} stateManager
 * @param {string} baseName — Desired name (e.g. "Tabelle" or "Sheet")
 * @returns {string} — e.g. "Tabelle", "Tabelle 1", "Tabelle 2", …
 */
export function uniqueSheetName(stateManager, baseName) {
  const existing = new Set();
  for (const phase of _allPhaseKeys(stateManager)) {
    const instances = stateManager.get(`phases.${phase}`) ?? [];
    for (const inst of instances) {
      if (inst.moduleId !== 'worksheet') continue;
      const ws = stateManager.getModuleState(inst.instanceId);
      if (!ws?.sheets) continue;
      for (const sheet of ws.sheets) {
        existing.add(sheet.name);
      }
    }
  }
  if (!existing.has(baseName)) return baseName;
  let i = 1;
  while (existing.has(`${baseName} ${i}`)) i++;
  return `${baseName} ${i}`;
}

/**
 * Build an initial worksheet state object with one empty sheet.
 * Useful for pre-populating a worksheet before it is activated.
 * @param {string} sheetName
 * @returns {Object}
 */
export function buildInitialWorksheetState(sheetName) {
  return {
    sheets: [{ id: 'sheet_1', name: sheetName, state: null }],
    activeSheetId: 'sheet_1',
    sheetCounter: 1,
  };
}

/**
 * Read raw values from a column reference.
 * @param {Object} stateManager
 * @param {{ instanceId: string, sheetId: string, columnId: string }} ref
 * @returns {any[]}
 */
export function getColumnValues(stateManager, ref) {
  if (!ref) return [];
  const ws = stateManager.getModuleState(ref.instanceId);
  if (!ws?.sheets) return [];
  const sheet = ws.sheets.find(s => s.id === ref.sheetId);
  if (!sheet?.state?.columns) return [];
  const col = sheet.state.columns.find(c => c.id === ref.columnId);
  return col ? (col.values || []) : [];
}

/**
 * Get the display name of a column.
 * @param {Object} stateManager
 * @param {{ instanceId: string, sheetId: string, columnId: string }} ref
 * @returns {string}
 */
export function getColumnName(stateManager, ref) {
  if (!ref) return '?';
  const ws = stateManager.getModuleState(ref.instanceId);
  if (!ws?.sheets) return '?';
  const sheet = ws.sheets.find(s => s.id === ref.sheetId);
  if (!sheet?.state?.columns) return '?';
  const col = sheet.state.columns.find(c => c.id === ref.columnId);
  return col ? (col.name || col.shortName || '?') : '?';
}

// ── Focus guard ─────────────────────────────────────────────────────

/**
 * Returns true if a SELECT or INPUT inside `container` is focused.
 * Use this to skip DOM rebuilds that would destroy an open dropdown.
 * @param {HTMLElement} container
 * @returns {boolean}
 */
export function isPickerFocused(container) {
  const active = document.activeElement;
  return !!(active && container?.contains(active) &&
    (active.tagName === 'SELECT' || active.tagName === 'INPUT'));
}

import { esc } from '../core/html-utils.js';

// ── ColumnPicker class ───────────────────────────────────────────────

export class ColumnPicker {
  /**
   * @param {HTMLElement} container — DOM element to render into
   * @param {Object} context — { eventBus, stateManager, i18n }
   * @param {Object} options
   * @param {'single'|'multi'} options.mode
   * @param {string[]|Set<string>} [options.types] — Allowed column types
   * @param {number} [options.minCount=0] — Minimum non-null values
   * @param {number} [options.maxCount=Infinity] — Maximum non-null values (0 = empty columns only)
   * @param {function} [options.onChange] — Callback: single → (ref|null), multi → (refs[])
   * @param {boolean} [options.allowCreateWorksheet=false] — Show "New worksheet…" option in single mode
   */
  constructor(container, context, options) {
    this._container = container;
    this._ctx = context;
    this._mode = options.mode || 'single';
    this._types = options.types
      ? (options.types instanceof Set ? options.types : new Set(options.types))
      : null;
    this._minCount = options.minCount || 0;
    this._maxCount = options.maxCount ?? Infinity;
    this._onChange = options.onChange || null;
    this._allowCreateWorksheet = !!options.allowCreateWorksheet;

    // Selection state
    this._selectedKey = null;            // single mode
    this._selectedKeys = new Set();      // multi mode

    // EventBus subscriptions
    this._unsubs = [];
    const refresh = () => this.refresh();
    const eb = context.eventBus;
    eb.on('state:saved', refresh);
    this._unsubs.push(() => eb.off('state:saved', refresh));
    const onMod = ({ moduleId }) => { if (moduleId === 'worksheet') refresh(); };
    eb.on('module:added', onMod);
    this._unsubs.push(() => eb.off('module:added', onMod));
    eb.on('module:removed', onMod);
    this._unsubs.push(() => eb.off('module:removed', onMod));
    eb.on('worksheet:dataChanged', refresh);
    this._unsubs.push(() => eb.off('worksheet:dataChanged', refresh));

    this._render();
  }

  /** Sentinel value returned when "new worksheet" is selected. */
  static NEW_WORKSHEET = '__create_worksheet__';

  /** Column ID used for "new column in existing sheet" entries. */
  static NEW_COLUMN = '__new__';

  /** Current selection — returns a ref, NEW_WORKSHEET sentinel, or null. */
  get value() {
    if (this._mode === 'single') {
      if (this._selectedKey === ColumnPicker.NEW_WORKSHEET) return ColumnPicker.NEW_WORKSHEET;
      return this._selectedKey ? keyToRef(this._selectedKey) : null;
    }
    return [...this._selectedKeys].map(k => keyToRef(k));
  }

  /** Programmatically set selection. */
  set value(refs) {
    if (this._mode === 'single') {
      if (refs && !refs.instanceId && Array.isArray(refs)) refs = refs[0] || null;
      this._selectedKey = refs ? refToKey(refs) : null;
    } else {
      this._selectedKeys = new Set(
        (Array.isArray(refs) ? refs : (refs ? [refs] : [])).map(r => refToKey(r))
      );
    }
    this._render();
  }

  /** Re-scan columns and re-render, preserving valid selections. */
  refresh() {
    if (isPickerFocused(this._container)) return;

    const cols = this._discover();
    const validKeys = new Set(cols.map(c => refToKey(c)));

    let changed = false;
    if (this._mode === 'single') {
      if (this._selectedKey && this._selectedKey !== ColumnPicker.NEW_WORKSHEET
          && !validKeys.has(this._selectedKey)) {
        // Preserve "new column" keys if the sheet still exists
        const isNewCol = this._selectedKey.endsWith(`|${ColumnPicker.NEW_COLUMN}`);
        const sheetExists = isNewCol && cols.some(c =>
          `${c.instanceId}|${c.sheetId}` === this._selectedKey.replace(`|${ColumnPicker.NEW_COLUMN}`, ''));
        if (!sheetExists) {
          this._selectedKey = null;
          changed = true;
        }
      }
    } else {
      for (const k of this._selectedKeys) {
        if (!validKeys.has(k)) {
          this._selectedKeys.delete(k);
          changed = true;
        }
      }
    }

    this._render();
    if (changed && this._onChange) this._onChange(this.value);
  }

  /** Clean up. */
  destroy() {
    for (const fn of this._unsubs) fn();
    this._unsubs = [];
    this._container.innerHTML = '';
  }

  // ── Private ────────────────────────────────────────────────────

  _discover() {
    return discoverColumns(this._ctx.stateManager, {
      types: this._types,
      minCount: this._minCount,
      maxCount: this._maxCount,
    });
  }

  _t(key, vars) {
    return this._ctx.i18n.t(`ui.columnPicker.${key}`, vars);
  }

  _render() {
    const cols = this._discover();
    if (this._mode === 'single') {
      this._renderSingle(cols);
    } else {
      this._renderMulti(cols);
    }
  }

  // ── Single-select (dropdown) ───────────────────────────────────

  _renderSingle(cols) {
    if (cols.length === 0 && !this._allowCreateWorksheet) {
      this._container.innerHTML = `<div class="col-picker col-picker--single">
        <select class="field col-picker__select" disabled>
          <option>${esc(this._t('noColumns'))}</option>
        </select>
      </div>`;
      return;
    }

    // Group by unique sheet key (instanceId|sheetId) to keep same-named sheets separate
    const groupOrder = [];
    const grouped = {};
    for (const c of cols) {
      const gk = `${c.instanceId}|${c.sheetId}`;
      if (!grouped[gk]) {
        grouped[gk] = [];
        groupOrder.push(gk);
      }
      grouped[gk].push(c);
    }

    let opts = `<option value="">${esc(this._t('placeholder'))}</option>`;

    // "New worksheet…" option
    if (this._allowCreateWorksheet) {
      const nwSel = this._selectedKey === ColumnPicker.NEW_WORKSHEET ? ' selected' : '';
      opts += `<option value="__create_worksheet__"${nwSel}>+ ${esc(this._t('newWorksheet'))}</option>`;
    }

    for (const gk of groupOrder) {
      const items = grouped[gk];
      const group = items[0].sheetName;
      opts += `<optgroup label="${esc(group)}">`;
      for (const c of items) {
        const key = refToKey(c);
        const sel = key === this._selectedKey ? ' selected' : '';
        opts += `<option value="${key}"${sel}>${esc(c.shortName)} ${esc(c.columnName)} (n=${c.valueCount})</option>`;
      }
      // "+ new column" at end of each sheet group
      if (this._allowCreateWorksheet) {
        const first = items[0];
        const ncKey = `${first.instanceId}|${first.sheetId}|${ColumnPicker.NEW_COLUMN}`;
        const ncSel = ncKey === this._selectedKey ? ' selected' : '';
        opts += `<option value="${ncKey}"${ncSel}>+ ${esc(this._t('newColumn'))}</option>`;
      }
      opts += '</optgroup>';
    }

    this._container.innerHTML = `<div class="col-picker col-picker--single">
      <select class="field col-picker__select">${opts}</select>
    </div>`;

    const sel = this._container.querySelector('.col-picker__select');
    sel.addEventListener('change', () => {
      this._selectedKey = sel.value || null;
      if (this._onChange) this._onChange(this.value);
    });
  }

  // ── Multi-select (checkbox list) ───────────────────────────────

  _renderMulti(cols) {
    if (cols.length === 0) {
      this._container.innerHTML = `<div class="col-picker col-picker--multi">
        <div class="col-picker__hint">${esc(this._t('noColumns'))}</div>
      </div>`;
      return;
    }

    // Group by unique sheet key (instanceId|sheetId) to keep same-named sheets separate
    const groupOrder = [];
    const grouped = {};
    for (const c of cols) {
      const gk = `${c.instanceId}|${c.sheetId}`;
      if (!grouped[gk]) {
        grouped[gk] = [];
        groupOrder.push(gk);
      }
      grouped[gk].push(c);
    }

    let html = '<div class="col-picker col-picker--multi">';
    for (const gk of groupOrder) {
      const items = grouped[gk];
      const group = items[0].sheetName;
      html += `<div class="col-picker__group">`;
      html += `<div class="col-picker__group-label">${esc(group)}</div>`;
      for (const c of items) {
        const key = refToKey(c);
        const chk = this._selectedKeys.has(key) ? ' checked' : '';
        html += `<label class="col-picker__item">
          <input type="checkbox" data-col-key="${key}"${chk}>
          <span class="col-picker__name">${esc(c.shortName)} – ${esc(c.columnName)}</span>
          <span class="col-picker__count">n=${c.valueCount}</span>
        </label>`;
      }
      html += '</div>';
    }
    html += '</div>';

    this._container.innerHTML = html;

    this._container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const key = cb.dataset.colKey;
        if (cb.checked) this._selectedKeys.add(key);
        else this._selectedKeys.delete(key);
        if (this._onChange) this._onChange(this.value);
      });
    });
  }
}
