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

import { h } from '../core/dom.js';

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
    this._multi = Boolean(options.multi);
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
    const list = Array.isArray(datasets) ? datasets : (datasets ? [datasets] : []);
    this._datasets = list.map(ds => {
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
    this._container.replaceChildren();
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
    this._container.replaceChildren(this._buildEl());
    this._bindEvents();
  }

  _buildEl() {
    const root = h('div', { class: 'ds-picker' });

    for (let i = 0; i < this._datasets.length; i++) {
      root.append(this._buildDatasetEl(i));
    }

    if (this._multi) {
      root.append(
        h('button', { class: 'ds-picker__add-btn', 'data-action': 'add-dataset' },
          `+ ${this._t('addDataset')}`),
      );
    }

    return root;
  }

  _buildDatasetEl(idx) {
    const ds = this._datasets[idx];
    const showHeader = this._multi;
    const color = this._colors
      ? this._colors[idx % this._colors.length]
      : null;

    const item = h('div', { class: 'ds-picker__item', 'data-ds-idx': idx });

    if (showHeader) {
      const header = h('div', { class: 'ds-picker__header' });
      if (color) {
        header.append(h('span', { class: 'ds-picker__color', style: `background:${color}` }));
      }
      header.append(h('span', { class: 'ds-picker__title' }, this._t('datasetLabel', { n: idx + 1 })));
      if (this._datasets.length > 1) {
        header.append(
          h('button', {
            class: 'ds-picker__remove-btn',
            'data-action': 'remove-dataset',
            'data-ds-idx': idx,
          }, '×'),
        );
      }
      item.append(header);
    }

    const slots = h('div', { class: 'ds-picker__slots' });
    for (const slot of this._slots) {
      slots.append(this._buildSlotEl(slot, ds[slot.key], idx));
    }
    item.append(slots);

    return item;
  }

  _buildSlotEl(slot, currentRef, dsIdx) {
    const columns = this._discoverForSlot(slot);
    const currentKey = currentRef ? refToKey(currentRef) : '';

    let select;
    if (columns.length === 0) {
      select = h('select', {
        class: 'ds-picker__select', 'data-ds': dsIdx, 'data-slot': slot.key, disabled: true,
      }, h('option', null, this._t('noColumns')));
    } else {
      const placeholder = slot.group
        ? this._t('groupNone')
        : this._t('selectColumn');
      select = h('select', { class: 'ds-picker__select', 'data-ds': dsIdx, 'data-slot': slot.key });
      select.append(h('option', { value: '' }, placeholder));

      const grouped = {};
      for (const c of columns) (grouped[c.sheetName] ||= []).push(c);
      for (const [group, cols] of Object.entries(grouped)) {
        const optgroup = h('optgroup', { label: group });
        for (const c of cols) {
          const key = refToKey(c);
          optgroup.append(
            h('option', { value: key, selected: key === currentKey },
              `${c.shortName} ${c.columnName} (n=${c.valueCount})`),
          );
        }
        select.append(optgroup);
      }
    }

    return h('div', { class: 'ds-picker__slot' },
      h('span', { class: 'ds-picker__slot-label', title: slot.title || false }, slot.label),
      select,
    );
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
