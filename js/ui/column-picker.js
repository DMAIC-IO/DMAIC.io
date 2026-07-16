/**
 * D.Mike — Column Picker Component (column-picker.js)
 *
 * Shared UI widget for selecting worksheet columns.
 * Modes:
 *   - 'single' — <select> dropdown (default option-label format)
 *   - 'select' — <select> dropdown, identical to 'single' but accepts an
 *                optional `optionFormat` callback so callers can customise the
 *                visible option text (e.g. a dashed "C1 – Name (n=30)" label).
 *                Strictly additive: when `optionFormat` is omitted it renders
 *                exactly like 'single'.
 *   - 'multi'  — checkbox list
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
 *   // Select-mode with a custom option label (e.g. "C1 – Name (n=30)")
 *   const picker = new ColumnPicker(wrapEl, context, {
 *     mode: 'select',
 *     types: ['numeric'],
 *     optionFormat: (c) => c.columnName
 *       ? `${c.shortName} – ${c.columnName} (n=${c.valueCount})`
 *       : `${c.shortName} (n=${c.valueCount})`,
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

import { resolveColumnRef, getColumnRawValues } from '../core/worksheet-columns.js';

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
  return getColumnRawValues(stateManager, ref);
}

/**
 * Get the display name of a column.
 * @param {Object} stateManager
 * @param {{ instanceId: string, sheetId: string, columnId: string }} ref
 * @returns {string}
 */
export function getColumnName(stateManager, ref) {
  const col = resolveColumnRef(stateManager, ref);
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
  return Boolean(active && container?.contains(active) &&
    (active.tagName === 'SELECT' || active.tagName === 'INPUT'));
}

import { h } from '../core/dom.js';

// ── ColumnPicker class ───────────────────────────────────────────────

export class ColumnPicker {
  /**
   * @param {HTMLElement} container — DOM element to render into
   * @param {Object} context — { eventBus, stateManager, i18n }
   * @param {Object} options
   * @param {'single'|'select'|'multi'} options.mode
   * @param {string[]|Set<string>} [options.types] — Allowed column types
   * @param {number} [options.minCount=0] — Minimum non-null values
   * @param {number} [options.maxCount=Infinity] — Maximum non-null values (0 = empty columns only)
   * @param {function} [options.onChange] — Callback: single/select → (ref|null), multi → (refs[])
   * @param {boolean} [options.allowCreateWorksheet=false] — Show "New worksheet…" option in single mode
   * @param {function} [options.optionFormat] — ('select' mode only) Custom option-label
   *        builder: (ColumnInfo) => string. Omit for the default format.
   */
  constructor(container, context, options) {
    this._container = container;
    this._ctx = context;
    this._mode = options.mode || 'single';
    this._optionFormat = typeof options.optionFormat === 'function' ? options.optionFormat : null;
    this._types = options.types
      ? (options.types instanceof Set ? options.types : new Set(options.types))
      : null;
    this._minCount = options.minCount || 0;
    this._maxCount = options.maxCount ?? Infinity;
    this._onChange = options.onChange || null;
    this._allowCreateWorksheet = Boolean(options.allowCreateWorksheet);

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

  /**
   * Whether this picker uses single-selection semantics (one <select>).
   * Both 'single' and the additive 'select' mode are single-selection; only
   * 'multi' uses the checkbox-set path. Keeps existing modes byte-unchanged.
   * @returns {boolean}
   */
  _isSingle() {
    return this._mode === 'single' || this._mode === 'select';
  }

  /** Current selection — returns a ref, NEW_WORKSHEET sentinel, or null. */
  get value() {
    if (this._isSingle()) {
      if (this._selectedKey === ColumnPicker.NEW_WORKSHEET) return ColumnPicker.NEW_WORKSHEET;
      return this._selectedKey ? keyToRef(this._selectedKey) : null;
    }
    return [...this._selectedKeys].map(k => keyToRef(k));
  }

  /** Programmatically set selection. */
  set value(refs) {
    if (this._isSingle()) {
      const ref = (refs && !refs.instanceId && Array.isArray(refs)) ? (refs[0] || null) : refs;
      this._selectedKey = ref ? refToKey(ref) : null;
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
    if (this._isSingle()) {
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
    this._container.replaceChildren();
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
    if (this._mode === 'single' || this._mode === 'select') {
      this._renderSingle(cols);
    } else {
      this._renderMulti(cols);
    }
  }

  // ── Single-select (dropdown) ───────────────────────────────────

  _renderSingle(cols) {
    if (cols.length === 0 && !this._allowCreateWorksheet) {
      this._container.replaceChildren(
        h('div', { class: 'col-picker col-picker--single' },
          h('select', { class: 'field col-picker__select', disabled: true },
            h('option', null, this._t('noColumns')),
          ),
        ),
      );
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

    const opts = [
      h('option', { value: '' }, this._t('placeholder')),
    ];

    // "New worksheet…" option
    if (this._allowCreateWorksheet) {
      opts.push(h('option', {
        value: '__create_worksheet__',
        selected: this._selectedKey === ColumnPicker.NEW_WORKSHEET,
      }, `+ ${this._t('newWorksheet')}`));
    }

    for (const gk of groupOrder) {
      const items = grouped[gk];
      const group = items[0].sheetName;
      const optgroup = h('optgroup', { label: group });
      for (const c of items) {
        const key = refToKey(c);
        // 'select' mode may supply a custom label builder; the default
        // (and all of 'single' mode) is byte-unchanged.
        const label = this._optionFormat
          ? this._optionFormat(c)
          : `${c.shortName} ${c.columnName} (n=${c.valueCount})`;
        optgroup.append(h('option', {
          value: key,
          selected: key === this._selectedKey,
        }, label));
      }
      // "+ new column" at end of each sheet group
      if (this._allowCreateWorksheet) {
        const first = items[0];
        const ncKey = `${first.instanceId}|${first.sheetId}|${ColumnPicker.NEW_COLUMN}`;
        optgroup.append(h('option', {
          value: ncKey,
          selected: ncKey === this._selectedKey,
        }, `+ ${this._t('newColumn')}`));
      }
      opts.push(optgroup);
    }

    const sel = h('select', { class: 'field col-picker__select' }, opts);
    this._container.replaceChildren(
      h('div', { class: 'col-picker col-picker--single' }, sel),
    );

    sel.addEventListener('change', () => {
      this._selectedKey = sel.value || null;
      if (this._onChange) this._onChange(this.value);
    });
  }

  // ── Multi-select (checkbox list) ───────────────────────────────

  _renderMulti(cols) {
    if (cols.length === 0) {
      this._container.replaceChildren(
        h('div', { class: 'col-picker col-picker--multi' },
          h('div', { class: 'col-picker__hint' }, this._t('noColumns')),
        ),
      );
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

    const root = h('div', { class: 'col-picker col-picker--multi' });
    for (const gk of groupOrder) {
      const items = grouped[gk];
      const group = items[0].sheetName;
      const groupEl = h('div', { class: 'col-picker__group' },
        h('div', { class: 'col-picker__group-label' }, group),
      );
      for (const c of items) {
        const key = refToKey(c);
        groupEl.append(
          h('label', { class: 'col-picker__item' },
            h('input', {
              type: 'checkbox',
              'data-col-key': key,
              checked: this._selectedKeys.has(key),
            }),
            h('span', { class: 'col-picker__name' }, `${c.shortName} – ${c.columnName}`),
            h('span', { class: 'col-picker__count' }, `n=${c.valueCount}`),
          ),
        );
      }
      root.append(groupEl);
    }

    this._container.replaceChildren(root);

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
