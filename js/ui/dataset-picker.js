/**
 * D.Mike — DatasetPicker Component (dataset-picker.js)
 *
 * Generic, reusable column-selection widget for analysis modules.
 * Supports configurable "slots" (e.g. X, Y, Value, Group) and
 * optional multi-dataset mode (add / remove dataset rows).
 *
 * Usage:
 *
 *   // Single dataset — Probability Plot (one numeric column)
 *   const picker = new DatasetPicker(el, context, {
 *     slots: [
 *       { key: 'value', label: 'Wertespalte', types: ['numeric'], minCount: 2, required: true },
 *     ],
 *     onChange: (datasets) => { ... },
 *   });
 *
 *   // Single dataset — Boxplot grouped (value + group)
 *   const picker = new DatasetPicker(el, context, {
 *     slots: [
 *       { key: 'value', label: 'Wertespalte', types: ['numeric'], required: true },
 *       { key: 'group', label: 'Gruppierung', group: true },
 *     ],
 *     onChange: (datasets) => { ... },
 *   });
 *
 *   // Multi-dataset — XY-Plot (X + Y + optional Group per dataset)
 *   const picker = new DatasetPicker(el, context, {
 *     multi: true,
 *     slots: [
 *       { key: 'x', label: 'X', types: ['numeric'], minCount: 2, required: true },
 *       { key: 'y', label: 'Y', types: ['numeric'], minCount: 2, required: true },
 *       { key: 'group', label: 'G', group: true },
 *     ],
 *     onChange: (datasets) => { ... },
 *   });
 *
 * Slot options:
 *   key       — Unique identifier (used in returned dataset objects)
 *   label     — Short label shown in the UI (e.g. "X", "V", "G")
 *   types     — Column type filter (default: all types)
 *   minCount  — Minimum non-null values (default: 0)
 *   maxCount  — Maximum non-null values (default: Infinity)
 *   required  — If true, dataset is incomplete without this column
 *   group     — If true, shows "no grouping" placeholder; accepts any type
 *
 * Returned datasets:  [{ x: ref|null, y: ref|null, group: ref|null }, ...]
 * In single mode the array always has length 1.
 */

import {
  discoverColumns, getColumnValues, getColumnName,
  refToKey, keyToRef, isPickerFocused,
} from './column-picker.js';

export { discoverColumns, getColumnValues, getColumnName, refToKey, keyToRef, isPickerFocused };

import { esc } from '../core/html-utils.js';

// ── DatasetPicker ──────────────────────────────────────────────────

export class DatasetPicker {
  /**
   * @param {HTMLElement} container
   * @param {Object} context — { eventBus, stateManager, i18n }
   * @param {Object} options
   * @param {Array<Object>} options.slots — Slot definitions
   * @param {boolean} [options.multi=false] — Allow multiple datasets
   * @param {function} [options.onChange] — Called with datasets array
   * @param {string[]} [options.colors] — Optional per-dataset color indicators
   */
  constructor(container, context, options) {
    this._container = container;
    this._ctx = context;
    this._slots = options.slots || [];
    this._multi = !!options.multi;
    this._onChange = options.onChange || null;
    this._colors = options.colors || null;

    // Datasets: array of objects mapping slotKey → ref|null
    this._datasets = [this._emptyDataset()];

    // EventBus subscriptions
    this._unsubs = [];
    const eb = context.eventBus;
    const refresh = () => this._refresh();
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

  // ── Public API ──────────────────────────────────────────────────

  /** Current datasets. */
  get value() {
    return this._datasets.map(ds => ({ ...ds }));
  }

  /** Programmatically set datasets. */
  set value(datasets) {
    if (!Array.isArray(datasets)) datasets = datasets ? [datasets] : [];
    this._datasets = datasets.map(ds => {
      const obj = this._emptyDataset();
      for (const slot of this._slots) {
        obj[slot.key] = ds[slot.key] || null;
      }
      return obj;
    });
    if (this._datasets.length === 0) this._datasets.push(this._emptyDataset());
    this._render();
  }

  /** Refresh column lists (called automatically on worksheet changes). */
  refresh() {
    this._refresh();
  }

  /** Clean up event listeners. */
  destroy() {
    for (const fn of this._unsubs) fn();
    this._unsubs = [];
    this._container.innerHTML = '';
  }

  // ── Private ─────────────────────────────────────────────────────

  _t(key, vars) {
    return this._ctx.i18n.t(`ui.datasetPicker.${key}`, vars);
  }

  _emptyDataset() {
    const ds = {};
    for (const slot of this._slots) ds[slot.key] = null;
    return ds;
  }

  /** Discover columns for a given slot config. */
  _discoverForSlot(slot) {
    const filter = {};
    if (slot.types) filter.types = slot.types;
    if (slot.minCount != null) filter.minCount = slot.minCount;
    if (slot.maxCount != null) filter.maxCount = slot.maxCount;
    return discoverColumns(this._ctx.stateManager, filter);
  }

  /** Refresh without thrashing open dropdowns. */
  _refresh() {
    if (isPickerFocused(this._container)) return;
    this._render();
  }

  // ── Rendering ───────────────────────────────────────────────────

  _render() {
    this._container.innerHTML = this._buildHTML();
    this._bindEvents();
  }

  _buildHTML() {
    let html = '<div class="ds-picker">';

    for (let i = 0; i < this._datasets.length; i++) {
      html += this._buildDatasetHTML(i);
    }

    if (this._multi) {
      html += `<button class="ds-picker__add-btn" data-action="add-dataset">
        + ${esc(this._t('addDataset'))}
      </button>`;
    }

    html += '</div>';
    return html;
  }

  _buildDatasetHTML(idx) {
    const ds = this._datasets[idx];
    const showHeader = this._multi;
    const color = this._colors
      ? this._colors[idx % this._colors.length]
      : null;

    let html = `<div class="ds-picker__item" data-ds-idx="${idx}">`;

    if (showHeader) {
      html += `<div class="ds-picker__header">`;
      if (color) {
        html += `<span class="ds-picker__color" style="background:${color}"></span>`;
      }
      html += `<span class="ds-picker__title">${esc(this._t('datasetLabel', { n: idx + 1 }))}</span>`;
      if (this._datasets.length > 1) {
        html += `<button class="ds-picker__remove-btn" data-action="remove-dataset" data-ds-idx="${idx}">&times;</button>`;
      }
      html += `</div>`;
    }

    html += `<div class="ds-picker__slots">`;
    for (const slot of this._slots) {
      html += this._buildSlotHTML(slot, ds[slot.key], idx);
    }
    html += `</div></div>`;

    return html;
  }

  _buildSlotHTML(slot, currentRef, dsIdx) {
    const columns = this._discoverForSlot(slot);
    const currentKey = currentRef ? refToKey(currentRef) : '';

    let selectHTML;
    if (columns.length === 0) {
      selectHTML = `<select class="ds-picker__select" data-ds="${dsIdx}" data-slot="${slot.key}" disabled>
        <option>${esc(this._t('noColumns'))}</option>
      </select>`;
    } else {
      const placeholder = slot.group
        ? this._t('groupNone')
        : this._t('selectColumn');
      let opts = `<option value="">${esc(placeholder)}</option>`;

      const grouped = {};
      for (const c of columns) (grouped[c.sheetName] ||= []).push(c);
      for (const [group, cols] of Object.entries(grouped)) {
        opts += `<optgroup label="${esc(group)}">`;
        for (const c of cols) {
          const key = refToKey(c);
          const sel = key === currentKey ? ' selected' : '';
          opts += `<option value="${key}"${sel}>${esc(c.shortName)} ${esc(c.columnName)} (n=${c.valueCount})</option>`;
        }
        opts += `</optgroup>`;
      }

      selectHTML = `<select class="ds-picker__select" data-ds="${dsIdx}" data-slot="${slot.key}">${opts}</select>`;
    }

    const titleAttr = slot.title ? ` title="${esc(slot.title)}"` : '';
    return `<div class="ds-picker__slot">
      <span class="ds-picker__slot-label"${titleAttr}>${esc(slot.label)}</span>
      ${selectHTML}
    </div>`;
  }

  // ── Events ──────────────────────────────────────────────────────

  _bindEvents() {
    // Select changes
    this._container.querySelectorAll('.ds-picker__select').forEach(sel => {
      sel.addEventListener('change', () => {
        const dsIdx = parseInt(sel.dataset.ds, 10);
        const slotKey = sel.dataset.slot;
        this._datasets[dsIdx][slotKey] = sel.value ? keyToRef(sel.value) : null;
        this._fireChange();
      });
    });

    // Add dataset
    const addBtn = this._container.querySelector('[data-action="add-dataset"]');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this._datasets.push(this._emptyDataset());
        this._render();
        this._fireChange();
      });
    }

    // Remove dataset
    this._container.querySelectorAll('[data-action="remove-dataset"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.dsIdx, 10);
        if (this._datasets.length > 1) {
          this._datasets.splice(idx, 1);
          this._render();
          this._fireChange();
        }
      });
    });
  }

  _fireChange() {
    if (this._onChange) this._onChange(this.value);
  }
}
