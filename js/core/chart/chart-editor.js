/**
 * chart-editor.js — Shared chart editor panel building blocks.
 * Provides reusable DOM builder functions for chart editor panels.
 * Used by all chart modules (histogram, xy-plot, etc.) to ensure
 * consistent editor UI across the application.
 *
 * @module chart-editor
 */

// Import shared components (used locally) and re-export for consumers
import { parseRGBA, rgbaStr, rgbaToHex, parseHex, openColorPicker } from '../color-picker.js';
import { createSliderInput, createSliderRow } from '../slider.js';
export { parseRGBA, rgbaStr, rgbaToHex, parseHex, openColorPicker };
export { createSliderInput, createSliderRow };

import { esc } from '../html-utils.js';
export { esc };

import { h } from '../dom.js';
import { icon } from '../icon.js';

// ── Chart Size ───────────────────────────────────────────────

/** Bounds of a fixed chart side in px (chart editor "Größe"). */
export const CHART_SIZE_MIN = 100;
export const CHART_SIZE_MAX = 4000;

/**
 * Normalize a fixed chart side: empty / non-numeric → `null` (auto),
 * otherwise rounded and clamped to 100–4000 px.
 * @param {*} v - raw value (number or input string)
 * @returns {number|null}
 */
export function normalizeChartSize(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(CHART_SIZE_MAX, Math.max(CHART_SIZE_MIN, Math.round(n)));
}

// ── Low-Level Element Builders ───────────────────────────────

/**
 * Titles of the collapsible sections the user opened. Module-level, so the
 * state survives an editor rebuild and lasts until the page reloads.
 * @type {Set<string>}
 */
const _openSections = new Set();

/**
 * Create an editor section with title. By default the section is
 * collapsible: it starts closed (unless opened before under the same title)
 * and a click on the title toggles it.
 * @param {string} title
 * @param {{ collapsible?: boolean }} [opts] - `collapsible: false` keeps a static, always visible section
 * @returns {HTMLElement}
 */
export function edSection(title, opts = {}) {
  const div = document.createElement('div');
  div.className = 'dmike-chart-ed-section';
  if (opts.collapsible === false) {
    const titleEl = document.createElement('div');
    titleEl.className = 'dmike-chart-ed-section-title';
    titleEl.textContent = title;
    div.appendChild(titleEl);
    return div;
  }
  div.classList.add('dmike-chart-ed-section--collapsible');
  const titleEl = document.createElement('button');
  titleEl.type = 'button';
  titleEl.className = 'dmike-chart-ed-section-title';
  const text = document.createElement('span');
  text.textContent = title;
  const chevron = icon('nav.expand-down', { size: 'sm', cls: 'dmike-chart-ed-section-chevron' });
  titleEl.append(text, chevron);
  const setOpen = (open) => {
    div.classList.toggle('open', open);
    titleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) _openSections.add(title); else _openSections.delete(title);
  };
  setOpen(_openSections.has(title));
  titleEl.addEventListener('click', () => setOpen(!div.classList.contains('open')));
  div.appendChild(titleEl);
  return div;
}

/**
 * Legend section: the show-legend checkbox and — while the legend is shown
 * and has two or more entries — the entry order, reorderable by drag & drop
 * and by up/down buttons.
 * @param {{ show: boolean, entries: Array<{key: string, label: string, color?: string}>,
 *   onToggle: function(boolean): void, onReorder: function(string[]): void }} opts
 *   entries in current order; onReorder is called with the new key list
 * @param {function(string): string} t - editor translation function
 * @returns {HTMLElement}
 */
export function edLegendSection({ show, entries, onToggle, onReorder }, t) {
  const sec = edSection(t('legend'));
  sec.dataset.edSection = 'legend';
  sec.appendChild(edCheckboxRow(t('showLegend'), show, onToggle, 'showLegend'));
  if (show && entries.length >= 2) sec.appendChild(edLegendOrderList(entries, onReorder, t));
  return sec;
}

/**
 * Legend order block: a caption and one row per legend entry.
 * @param {Array<{key: string, label: string, color?: string}>} entries - in current order
 * @param {function(string[]): void} onReorder - called with the new key list
 * @param {function(string): string} t - editor translation function
 * @returns {HTMLElement}
 */
function edLegendOrderList(entries, onReorder, t) {
  const sec = document.createElement('div');
  sec.dataset.edSection = 'legendOrder';
  const caption = document.createElement('div');
  caption.className = 'dmike-chart-ed-subsection-title';
  caption.textContent = t('legendOrder');
  sec.appendChild(caption);
  const keys = entries.map(e => e.key);
  const move = (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= keys.length || to >= keys.length) return;
    const next = keys.slice();
    const [k] = next.splice(from, 1);
    next.splice(to, 0, k);
    onReorder(next);
  };
  const list = document.createElement('div');
  list.className = 'dmike-chart-ed-legend-list';
  let dragFrom = -1;
  const rows = [];
  entries.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'dmike-chart-ed-legend-row';
    row.draggable = true;
    row.dataset.legendKey = entry.key;
    const handle = icon('action.drag-handle', { size: 'sm', cls: 'dmike-chart-ed-legend-handle' });
    const swatch = document.createElement('span');
    swatch.className = 'dmike-chart-ed-legend-swatch';
    if (entry.color) swatch.style.background = entry.color;
    const label = document.createElement('span');
    label.className = 'dmike-chart-ed-legend-label';
    label.textContent = entry.label;
    const btn = (dir, iconName, aria, disabled, to) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dmike-chart-ed-btn-icon dmike-chart-ed-legend-move';
      b.dataset.move = dir;
      b.setAttribute('aria-label', aria);
      b.title = aria;
      b.disabled = disabled;
      b.appendChild(icon(iconName, { size: 'sm' }));
      b.addEventListener('click', () => move(i, to));
      return b;
    };
    row.append(handle, swatch, label,
      btn('up', 'nav.arrow-up', t('moveUp'), i === 0, i - 1),
      btn('down', 'nav.arrow-down', t('moveDown'), i === entries.length - 1, i + 1));
    row.addEventListener('dragstart', (e) => {
      dragFrom = i;
      row.classList.add('is-dragging');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', entry.key); } catch { /* ignore */ }
    });
    row.addEventListener('dragover', (e) => {
      if (dragFrom < 0) return;
      e.preventDefault();
      rows.forEach(r => r.classList.toggle('is-drop-target', r === row));
    });
    row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = dragFrom;
      dragFrom = -1;
      rows.forEach(r => r.classList.remove('is-drop-target', 'is-dragging'));
      move(from, i);
    });
    row.addEventListener('dragend', () => {
      dragFrom = -1;
      rows.forEach(r => r.classList.remove('is-drop-target', 'is-dragging'));
    });
    rows.push(row);
    list.appendChild(row);
  });
  sec.appendChild(list);
  return sec;
}

/**
 * Create a checkbox row.
 * @param {string} label
 * @param {boolean} checked
 * @param {function} onChange - Called with (boolean)
 * @param {string} [key] - config key, set as data-key on the input
 * @returns {HTMLElement}
 */
export function edCheckboxRow(label, checked, onChange, key) {
  const lbl = document.createElement('label');
  lbl.className = 'dmike-chart-ed-check';
  const inp = document.createElement('input');
  inp.type = 'checkbox';
  inp.checked = checked;
  if (key) inp.dataset.key = key;
  inp.addEventListener('change', () => onChange(inp.checked));
  lbl.appendChild(inp);
  lbl.appendChild(document.createTextNode(label));
  return lbl;
}

/**
 * Create a label + select row.
 * @param {string} label
 * @param {{ value: string, label: string }[]} options
 * @param {string} value - Current value
 * @param {function} onChange - Called with (string)
 * @returns {HTMLElement}
 */
export function edSelectRow(label, options, value, onChange) {
  const row = document.createElement('div');
  row.className = 'dmike-chart-ed-inline-row';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  const sel = document.createElement('select');
  options.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    if (String(o.value) === String(value)) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => onChange(sel.value));
  row.appendChild(lbl);
  row.appendChild(sel);
  return row;
}

/**
 * Create a label + text/number input row (fires on 'input').
 * @param {string} label
 * @param {string} type - 'text' | 'number'
 * @param {string|number} value
 * @param {function} onChange
 * @returns {HTMLElement}
 */
export function edInputRow(label, type, value, onChange) {
  const row = document.createElement('div');
  row.className = 'dmike-chart-ed-row';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  const inp = document.createElement('input');
  inp.type = type;
  inp.value = value;
  inp.addEventListener('input', () => onChange(type === 'number' ? Number(inp.value) : inp.value));
  row.appendChild(lbl);
  row.appendChild(inp);
  return row;
}

/**
 * Create a label + input row (fires on 'change').
 * @param {string} label
 * @param {string} type
 * @param {string|number} value
 * @param {function} onChange
 * @returns {HTMLElement}
 */
export function edInlineInput(label, type, value, onChange) {
  const row = document.createElement('div');
  row.className = 'dmike-chart-ed-inline-row';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  const inp = document.createElement('input');
  inp.type = type;
  inp.value = value;
  inp.addEventListener('change', () => onChange(inp.value));
  row.appendChild(lbl);
  row.appendChild(inp);
  return row;
}

/**
 * Create a label + number input row (fires on 'change').
 * @param {string} label
 * @param {number} value
 * @param {function} onChange - Called with (number)
 * @param {number} [min]
 * @param {number} [max]
 * @param {number|string} [step='any']
 * @returns {HTMLElement}
 */
export function edInlineNum(label, value, onChange, min, max, step) {
  const row = document.createElement('div');
  row.className = 'dmike-chart-ed-inline-row';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.value = value;
  inp.step = step !== undefined ? step : 'any';
  if (min !== undefined) inp.min = min;
  if (max !== undefined) inp.max = max;
  inp.addEventListener('change', () => onChange(Number(inp.value)));
  row.appendChild(lbl);
  row.appendChild(inp);
  return row;
}

/**
 * Create a label + range slider + numeric display row.
 * Delegates to the global createSliderRow component.
 * @param {string} label
 * @param {number} value - Current value
 * @param {function} onChange - Called with (number)
 * @param {number} [min=1]
 * @param {number} [max=40]
 * @param {number} [step=1]
 * @returns {HTMLElement}
 */
export function edRangeRow(label, value, onChange, min = 1, max = 40, step = 1) {
  const { el } = createSliderRow({ label, value, min, max, step, onChange });
  return el;
}

/**
 * Create a label + color swatch pair.
 * @param {string} label
 * @param {string} color - rgba() string
 * @param {function} onClick - Called with (MouseEvent)
 * @returns {{ el: HTMLElement, swatch: HTMLElement }}
 */
export function edColorPair(label, color, onClick) {
  const row = document.createElement('div');
  row.className = 'dmike-chart-ed-color-pair';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  const swatch = document.createElement('div');
  swatch.className = 'dmike-chart-ed-color-swatch';
  swatch.style.background = color;
  swatch.addEventListener('click', onClick);
  row.appendChild(lbl);
  row.appendChild(swatch);
  return { el: row, swatch };
}

/**
 * Create a standalone color swatch.
 * @param {string} color
 * @param {function} onClick
 * @returns {HTMLElement}
 */
export function edColorSwatch(color, onClick) {
  const swatch = document.createElement('div');
  swatch.className = 'dmike-chart-ed-color-swatch';
  swatch.style.background = color;
  swatch.addEventListener('click', onClick);
  return swatch;
}

/**
 * Create a visibility toggle button (eye icon).
 * @param {boolean} visible
 * @param {function} onClick
 * @returns {HTMLElement}
 */
export function edVisToggle(visible, onClick) {
  const btn = document.createElement('button');
  btn.className = 'dmike-chart-ed-vis-toggle';
  btn.replaceChildren(icon(visible ? 'action.show' : 'action.hide'));
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Create an expand/collapse button.
 * @param {string} label
 * @param {HTMLElement} target - Element to toggle .open on
 * @returns {HTMLElement}
 */
export function edExpandBtn(label, target) {
  const btn = document.createElement('button');
  btn.className = 'dmike-chart-ed-expand-btn';
  const chevron = icon('nav.expand-down');
  btn.replaceChildren(h('span', null, label), document.createTextNode(' '), chevron);
  btn.addEventListener('click', () => {
    const isOpen = target.classList.toggle('open');
    btn.classList.toggle('open', isOpen);
    chevron.dataset.icon = isOpen ? 'nav.collapse-up' : 'nav.expand-down';
  });
  return btn;
}

/**
 * Create an icon button (e.g. delete).
 * @param {string} glyph - Text glyph (e.g. '×')
 * @param {string} [extraClass] - e.g. 'danger'
 * @param {function} onClick
 * @returns {HTMLElement}
 */
export function edBtnIcon(glyph, extraClass, onClick) {
  const btn = document.createElement('button');
  btn.className = `dmike-chart-ed-btn-icon${  extraClass ? ` ${  extraClass}` : ''}`;
  btn.textContent = glyph;
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Create a dashed "add" button.
 * @param {string} label
 * @param {function} onClick
 * @returns {HTMLElement}
 */
export function edBtnAdd(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'dmike-chart-ed-btn-add';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

// ── Composite Section Builders ───────────────────────────────

/**
 * Build the title section: show/hide toggle + custom title text.
 * Mutates config in-place, calls onUpdate() after each change.
 * @param {{ showTitle: boolean, title: string }} config - Mutated in-place
 * @param {function} onUpdate - Called after config is mutated
 * @param {function} t - Translation function (key → string)
 * @param {function} [onEdit] - (key, value) after a user edit, before onUpdate
 * @param {Object} [auto] - automatic values; `auto.title` becomes the placeholder
 * @returns {HTMLElement}
 */
export function edTitleSection(config, onUpdate, t, onEdit, auto = {}) {
  const sec = edSection(t('title'));
  sec.appendChild(edCheckboxRow(t('showTitle'), config.showTitle !== false, (v) => {
    config.showTitle = v; onEdit?.('showTitle', v); onUpdate();
  }));
  const row = document.createElement('div');
  row.className = 'dmike-chart-ed-inline-row';
  const lbl = document.createElement('label');
  lbl.textContent = t('titleText');
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = config.title || '';
  inp.placeholder = auto.title || t('titlePlaceholder');
  inp.addEventListener('change', () => { config.title = inp.value; onEdit?.('title', inp.value); onUpdate(); });
  row.appendChild(lbl);
  row.appendChild(inp);
  sec.appendChild(row);
  return sec;
}

/** Bounds of every font size slider (px). */
const FONT_SIZE_MIN = 6;
const FONT_SIZE_MAX = 30;

/**
 * Build the font size section: title, axis labels, tick labels and — for
 * charts with a legend — the legend.
 * Mutates config in-place, calls onUpdate() after each change.
 * @param {{ titleSize: number, labelSize: number, tickSize: number, legendSize?: number }} config - Mutated in-place
 * @param {function} onUpdate - Called after config is mutated
 * @param {function} t
 * @param {{ legend?: boolean }} [opts] - legend: also offer the legend font size
 * @returns {HTMLElement}
 */
export function edFontSizeSection(config, onUpdate, t, opts = {}) {
  const sec = edSection(t('fontSizes'));
  // One shared scale, so equal sizes sit at equal slider positions.
  const row = (label, value, set) => edRangeRow(label, value, (v) => { set(v); onUpdate(); }, FONT_SIZE_MIN, FONT_SIZE_MAX, 1);
  sec.appendChild(row(t('titleFontSize'), config.titleSize ?? 15, (v) => { config.titleSize = v; }));
  sec.appendChild(row(t('labelFontSize'), config.labelSize ?? 12, (v) => { config.labelSize = v; }));
  sec.appendChild(row(t('tickFontSize'), config.tickSize ?? 11, (v) => { config.tickSize = v; }));
  if (opts.legend) {
    sec.appendChild(row(t('legendFontSize'), config.legendSize ?? 11, (v) => { config.legendSize = v; }));
  }
  return sec;
}

/**
 * Build a text input row bound to one axis label key.
 * @param {string} label
 * @param {object} config - Mutated in-place
 * @param {'xLabel'|'yLabel'} key
 * @param {function} onUpdate
 * @param {function} [onEdit] - (key, value) after a user edit, before onUpdate
 * @param {string} [placeholder] - automatic label shown while the field is empty
 * @returns {HTMLElement}
 */
function edAxisLabelTextRow(label, config, key, onUpdate, onEdit, placeholder) {
  const row = document.createElement('div');
  row.className = 'dmike-chart-ed-inline-row';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = config[key] || '';
  inp.dataset.key = key;
  inp.placeholder = placeholder || '';
  inp.addEventListener('change', () => { config[key] = inp.value; onEdit?.(key, inp.value); onUpdate(); });
  row.appendChild(lbl);
  row.appendChild(inp);
  return row;
}

/**
 * Build the axis label section: per axis a visibility toggle + label text.
 * Mutates config in-place, calls onUpdate() after each change.
 * @param {{ showXLabel: boolean, showYLabel: boolean, xLabel: string, yLabel: string }} config - Mutated in-place
 * @param {function} onUpdate - Called after config is mutated
 * @param {function} t
 * @param {function} [onEdit] - (key, value) after a user edit, before onUpdate
 * @param {Object} [auto] - automatic values; `auto.xLabel` / `auto.yLabel` become placeholders
 * @returns {HTMLElement}
 */
export function edAxisLabelSection(config, onUpdate, t, onEdit, auto = {}) {
  const sec = edSection(t('axisLabels'));
  sec.appendChild(edCheckboxRow(t('showXLabel'), config.showXLabel !== false, (v) => {
    config.showXLabel = v; onEdit?.('showXLabel', v); onUpdate();
  }));
  sec.appendChild(edAxisLabelTextRow(t('xLabelText'), config, 'xLabel', onUpdate, onEdit, auto.xLabel));
  sec.appendChild(edCheckboxRow(t('showYLabel'), config.showYLabel !== false, (v) => {
    config.showYLabel = v; onEdit?.('showYLabel', v); onUpdate();
  }));
  sec.appendChild(edAxisLabelTextRow(t('yLabelText'), config, 'yLabel', onUpdate, onEdit, auto.yLabel));
  return sec;
}

/**
 * Build axis tick + grid visibility toggles.
 * Mutates config in-place, calls onUpdate() after each change.
 *
 * Per axis the section shows:
 *   - Tick toggle (`showXTicks` / `showYTicks`) — skipped when the axis is
 *     declared `categoricalX` / `categoricalY`, because the labels are
 *     drawn by the chart type itself.
 *   - Grid toggle (`showXGrid` / `showYGrid`) — skipped for the same reason
 *     (the grid wouldn't render anyway since chart-base short-circuits on
 *     the categorical flag).
 *
 * If both axes are fully categorical, the entire section is suppressed
 * (returns `null`).
 *
 * @param {{
 *   showXTicks: boolean, showYTicks: boolean,
 *   showXGrid?: boolean, showYGrid?: boolean,
 *   categoricalX?: boolean, categoricalY?: boolean
 * }} config - Mutated in-place
 * @param {function} onUpdate - Called after config is mutated
 * @param {function} t
 * @param {function} [onEdit] - (key, value) after a switch changed
 * @returns {HTMLElement|null}
 */
export function edAxisTickSection(config, onUpdate, t, onEdit) {
  if (config.categoricalX === true && config.categoricalY === true) return null;
  const sec = edSection(t('axisTicks'));
  const row = (key) => edCheckboxRow(t(key), config[key] !== false, (v) => {
    config[key] = v;
    onEdit?.(key, v);
    onUpdate();
  }, key);
  if (config.categoricalX !== true) sec.append(row('showXTicks'), row('showXGrid'));
  if (config.categoricalY !== true) sec.append(row('showYTicks'), row('showYGrid'));
  return sec;
}

/**
 * Build the chart size section: width/height inputs in px (100–4000, empty =
 * auto) and the "export only" checkbox. A typed value is rounded and clamped,
 * and the input shows the stored value afterwards.
 *
 * @param {{ chartWidth?: number|null, chartHeight?: number|null, sizeExportOnly?: boolean }} config - Mutated in-place
 * @param {function} onChange - Called after an edit
 * @param {function} t - Translator for `chart.editor.*` keys
 * @returns {HTMLElement}
 */
export function edSizeSection(config, onChange, t) {
  const sec = edSection(t('size'));
  const row = (key) => {
    const r = document.createElement('div');
    r.className = 'dmike-chart-ed-inline-row';
    const lbl = document.createElement('label');
    lbl.textContent = t(key);
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = String(CHART_SIZE_MIN);
    inp.max = String(CHART_SIZE_MAX);
    inp.step = '1';
    inp.placeholder = t('auto');
    inp.dataset.chartSize = key;
    const cur = normalizeChartSize(config[key]);
    inp.value = cur === null ? '' : String(cur);
    inp.addEventListener('change', () => {
      const next = normalizeChartSize(inp.value.trim());
      config[key] = next;
      inp.value = next === null ? '' : String(next);
      onChange();
    });
    lbl.addEventListener('click', () => inp.focus());
    r.append(lbl, inp);
    return r;
  };
  sec.append(row('chartWidth'), row('chartHeight'));
  sec.appendChild(edCheckboxRow(t('sizeExportOnly'), !!config.sizeExportOnly, (v) => {
    config.sizeExportOnly = v;
    onChange();
  }, 'sizeExportOnly'));
  return sec;
}

/**
 * Build the axis range section: min/max number inputs per axis that allows a
 * range (`axes`). An empty field means automatic. Every edit replaces
 * `config.axisRange` with a new object (`null` once all fields are empty).
 * An axis with min >= max marks both its inputs invalid; ChartBase ignores
 * that axis until it is fixed.
 *
 * @param {{ axisRange?: Object|null }} config - Mutated in-place
 * @param {function} onChange - Called after `config.axisRange` changed
 * @param {function} t
 * @param {{ x: boolean, y: boolean }} axes - Axes that get inputs
 * @returns {HTMLElement|null} null when no axis allows a range
 */
export function edAxisRangeSection(config, onChange, t, axes) {
  if (!axes || (!axes.x && !axes.y)) return null;
  const sec = edSection(t('axisRange'));
  const inputs = {};

  const markInvalid = () => {
    const r = config.axisRange || {};
    for (const a of ['x', 'y']) {
      const lo = r[`${a}Min`], hi = r[`${a}Max`];
      const bad = Number.isFinite(lo) && Number.isFinite(hi) && hi <= lo;
      for (const k of [`${a}Min`, `${a}Max`]) {
        if (!inputs[k]) continue;
        inputs[k].classList.toggle('dmike-chart-ed-input--invalid', bad);
        inputs[k].title = bad ? t('axisRangeInvalid') : '';
      }
    }
  };

  const row = (key) => {
    const r = document.createElement('div');
    r.className = 'dmike-chart-ed-inline-row';
    const lbl = document.createElement('label');
    lbl.textContent = t(key);
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = 'any';
    inp.placeholder = t('auto');
    inp.dataset.axisRange = key;
    const cur = config.axisRange?.[key];
    inp.value = Number.isFinite(cur) ? String(cur) : '';
    inp.addEventListener('change', () => {
      const next = { ...(config.axisRange || {}) };
      const raw = inp.value.trim();
      const num = raw === '' ? NaN : Number(raw);
      if (Number.isFinite(num)) next[key] = num;
      else { delete next[key]; inp.value = ''; }
      config.axisRange = Object.keys(next).length ? next : null;
      markInvalid();
      onChange();
    });
    lbl.addEventListener('click', () => inp.focus());
    inputs[key] = inp;
    r.append(lbl, inp);
    return r;
  };

  if (axes.x) sec.append(row('xMin'), row('xMax'));
  if (axes.y) sec.append(row('yMin'), row('yMax'));
  markInvalid();
  return sec;
}

/**
 * Build plot background color section.
 * @param {{ bgColor: string }} config
 * @param {function} onChange
 * @param {function} onOpenColorPicker - (event, color, callback) => void
 * @param {function} t
 * @returns {HTMLElement}
 */
export function edBgColorSection(config, onChange, onOpenColorPicker, t) {
  const sec = edSection(t('bgColor'));
  const { el, swatch } = edColorPair(t('bgColorLabel'), config.bgColor || 'rgba(255,255,255,1)', (e) => {
    onOpenColorPicker(e, config.bgColor || 'rgba(255,255,255,1)', (c) => {
      config.bgColor = c;
      swatch.style.background = c;
      onChange({ bgColor: c });
    });
  });
  sec.appendChild(el);
  return sec;
}

/**
 * Build reference lines section with add/remove/edit.
 * @param {Array} refLines
 * @param {Object} callbacks - { onUpdate, onOpenColorPicker }
 * @param {function} t
 * @returns {HTMLElement}
 */
export function edRefLinesSection(refLines, callbacks, t) {
  const sec = edSection(t('refLines'));

  (refLines || []).forEach((line, idx) => {
    const item = document.createElement('div');
    item.className = 'dmike-chart-ed-ref-item';

    const header = document.createElement('div');
    header.className = 'dmike-chart-ed-ref-header';
    const colorBar = document.createElement('div');
    colorBar.className = 'dmike-chart-ed-ref-color';
    colorBar.style.background = line.color;
    const info = document.createElement('div');
    info.className = 'dmike-chart-ed-ref-info';
    info.replaceChildren(
      h('div', { class: 'name' }, line.label || 'Line'),
      h('div', { class: 'detail' }, `${line.dir === 'h' ? 'Y' : 'X'} = ${line.value}`),
    );

    header.appendChild(colorBar);
    header.appendChild(info);
    header.appendChild(edBtnIcon('×', 'danger', () => {
      refLines.splice(idx, 1);
      callbacks.onUpdate();
    }));
    item.appendChild(header);

    const editor = document.createElement('div');
    editor.className = 'dmike-chart-ed-inline-editor open';
    editor.appendChild(edInlineInput(t('label'), 'text', line.label || '', (v) => { line.label = v; callbacks.onUpdate(); }));
    editor.appendChild(edSelectRow(t('direction'), [
      { value: 'v', label: `X (${t('vertical')})` },
      { value: 'h', label: `Y (${t('horizontal')})` },
    ], line.dir, (v) => { line.dir = v; callbacks.onUpdate(); }));
    editor.appendChild(edInlineNum(t('value'), line.value, (v) => { line.value = v; callbacks.onUpdate(); }));
    editor.appendChild(edSelectRow(t('lineStyle'), [
      { value: 'solid', label: 'Solid' }, { value: 'dash', label: 'Dash' },
      { value: 'dot', label: 'Dot' }, { value: 'longdash', label: 'Long dash' },
    ], line.dash, (v) => { line.dash = v; callbacks.onUpdate(); }));

    const { el: colorRow, swatch: csw } = edColorPair(t('color'), line.color, (e) => {
      callbacks.onOpenColorPicker(e, line.color, (c) => {
        line.color = c;
        csw.style.background = c;
        colorBar.style.background = c;
        callbacks.onUpdate();
      });
    });
    editor.appendChild(colorRow);

    item.appendChild(editor);
    sec.appendChild(item);
  });

  sec.appendChild(edBtnAdd(`+ ${t('addRefLine')}`, () => {
    refLines.push({ dir: 'v', value: 0, label: '', dash: 'dash', width: 1.5, color: 'rgba(192,57,43,1)' });
    callbacks.onUpdate();
  }));

  return sec;
}

/**
 * Symbol options for marker editors. Mirrors `drawMarker` in chart-core.js.
 * `label` is the English fallback; the shown text comes from
 * `markerSymbolOptions(t)` via `chart.editor.marker.symbols.<value>`.
 */
export const MARKER_SYMBOLS = [
  { value: 'circle',        glyph: '●', label: 'Circle' },
  { value: 'square',        glyph: '■', label: 'Square' },
  { value: 'diamond',       glyph: '◆', label: 'Diamond' },
  { value: 'triangle',      glyph: '▲', label: 'Triangle' },
  { value: 'triangle-down', glyph: '▼', label: 'Triangle down' },
  { value: 'cross',         glyph: '✚', label: 'Cross' },
  { value: 'star',          glyph: '★', label: 'Star' },
];

/**
 * Translated select options for the marker symbol dropdown.
 *
 * @param {function(string): string} t - Lookup under `chart.editor.marker.*`;
 *   returns the key itself when no translation exists.
 * @returns {{ value: string, label: string }[]}
 */
export function markerSymbolOptions(t) {
  return MARKER_SYMBOLS.map(({ value, glyph, label }) => {
    const key = `symbols.${value}`;
    const text = typeof t === 'function' ? t(key) : key;
    return { value, label: `${glyph} ${text && text !== key ? text : label}` };
  });
}

/**
 * Build a generic marker styling section: symbol, size, fill, border color, border width.
 * Storage layout is opaque to this helper — callers pass getter/setter accessors.
 *
 * @param {string} title - Section title
 * @param {{
 *   getSymbol:      () => string,
 *   setSymbol:      (v: string) => void,
 *   getSize:        () => number,
 *   setSize:        (v: number) => void,
 *   getColor:       () => string,
 *   setColor:       (v: string) => void,
 *   getStroke:      () => string,
 *   setStroke:      (v: string) => void,
 *   getStrokeWidth: () => number,
 *   setStrokeWidth: (v: number) => void,
 *   onChange:       () => void,
 * }} a - Accessors
 * @param {function} t - Translation lookup; resolves keys under `chart.editor.marker.*`
 * @param {{ sizeMin?:number, sizeMax?:number, sizeStep?:number,
 *           strokeMin?:number, strokeMax?:number, strokeStep?:number }} [opts]
 * @returns {HTMLElement}
 */
export function edMarkerSection(title, a, t, opts = {}) {
  const sizeMin   = opts.sizeMin   ?? 2;
  const sizeMax   = opts.sizeMax   ?? 24;
  const sizeStep  = opts.sizeStep  ?? 1;
  const swMin     = opts.strokeMin ?? 0;
  const swMax     = opts.strokeMax ?? 6;
  const swStep    = opts.strokeStep ?? 0.5;

  const sec = edSection(title);

  sec.appendChild(edSelectRow(t('symbol'), markerSymbolOptions(t), a.getSymbol() || 'circle', (v) => {
    a.setSymbol(v);
    a.onChange();
  }));

  sec.appendChild(edRangeRow(t('size'), a.getSize() ?? 8, (v) => {
    a.setSize(v);
    a.onChange();
  }, sizeMin, sizeMax, sizeStep));

  const fillCol = a.getColor();
  const { el: fillRow, swatch: fillSw } = edColorPair(t('color'), fillCol, (e) => {
    openColorPicker(e, a.getColor(), (c) => {
      a.setColor(c);
      fillSw.style.background = c;
      a.onChange();
    });
  });
  sec.appendChild(fillRow);

  const strokeCol = a.getStroke();
  const { el: strokeRow, swatch: strokeSw } = edColorPair(t('stroke'), strokeCol, (e) => {
    openColorPicker(e, a.getStroke(), (c) => {
      a.setStroke(c);
      strokeSw.style.background = c;
      a.onChange();
    });
  });
  sec.appendChild(strokeRow);

  sec.appendChild(edRangeRow(t('strokeWidth'), a.getStrokeWidth() ?? 1, (v) => {
    a.setStrokeWidth(v);
    a.onChange();
  }, swMin, swMax, swStep));

  return sec;
}

/**
 * Build reference areas section with add/remove/edit.
 * @param {Array} refAreas
 * @param {Object} callbacks - { onUpdate, onOpenColorPicker }
 * @param {function} t
 * @returns {HTMLElement}
 */
export function edRefAreasSection(refAreas, callbacks, t) {
  const sec = edSection(t('refAreas'));

  (refAreas || []).forEach((area, idx) => {
    const item = document.createElement('div');
    item.className = 'dmike-chart-ed-ref-item';

    const header = document.createElement('div');
    header.className = 'dmike-chart-ed-ref-header';
    const colorBar = document.createElement('div');
    colorBar.className = 'dmike-chart-ed-ref-color';
    colorBar.style.background = area.color;
    colorBar.style.width = '14px';
    colorBar.style.borderRadius = '3px';
    const info = document.createElement('div');
    info.className = 'dmike-chart-ed-ref-info';
    info.replaceChildren(
      h('div', { class: 'name' }, area.label || 'Area'),
      h('div', { class: 'detail' }, `${area.dir === 'y' ? 'Y' : 'X'}: ${area.min} – ${area.max}`),
    );

    header.appendChild(colorBar);
    header.appendChild(info);
    header.appendChild(edBtnIcon('×', 'danger', () => {
      refAreas.splice(idx, 1);
      callbacks.onUpdate();
    }));
    item.appendChild(header);

    const editor = document.createElement('div');
    editor.className = 'dmike-chart-ed-inline-editor open';
    editor.appendChild(edInlineInput(t('label'), 'text', area.label || '', (v) => { area.label = v; callbacks.onUpdate(); }));
    editor.appendChild(edSelectRow(t('direction'), [
      { value: 'x', label: `X (${t('vertical')})` },
      { value: 'y', label: `Y (${t('horizontal')})` },
    ], area.dir, (v) => { area.dir = v; callbacks.onUpdate(); }));
    editor.appendChild(edInlineNum('Min', area.min, (v) => { area.min = v; callbacks.onUpdate(); }));
    editor.appendChild(edInlineNum('Max', area.max, (v) => { area.max = v; callbacks.onUpdate(); }));

    const { el: bgRow, swatch: bgSw } = edColorPair(t('color'), area.color, (e) => {
      callbacks.onOpenColorPicker(e, area.color, (c) => {
        area.color = c;
        bgSw.style.background = c;
        colorBar.style.background = c;
        callbacks.onUpdate();
      });
    });
    editor.appendChild(bgRow);

    item.appendChild(editor);
    sec.appendChild(item);
  });

  sec.appendChild(edBtnAdd(`+ ${t('addRefArea')}`, () => {
    refAreas.push({ dir: 'x', min: 0, max: 1, label: '', color: 'rgba(44,95,138,0.12)' });
    callbacks.onUpdate();
  }));

  return sec;
}

