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

// ── Low-Level Element Builders ───────────────────────────────

/**
 * Create an editor section with title.
 * @param {string} title
 * @returns {HTMLElement}
 */
export function edSection(title) {
  const div = document.createElement('div');
  div.className = 'dmike-chart-ed-section';
  const titleEl = document.createElement('div');
  titleEl.className = 'dmike-chart-ed-section-title';
  titleEl.textContent = title;
  div.appendChild(titleEl);
  return div;
}

/**
 * Create a checkbox row.
 * @param {string} label
 * @param {boolean} checked
 * @param {function} onChange - Called with (boolean)
 * @returns {HTMLElement}
 */
export function edCheckboxRow(label, checked, onChange) {
  const lbl = document.createElement('label');
  lbl.className = 'dmike-chart-ed-check';
  const inp = document.createElement('input');
  inp.type = 'checkbox';
  inp.checked = checked;
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
  btn.replaceChildren(h('span', null, label), document.createTextNode(' '), icon('nav.expand-down'));
  btn.addEventListener('click', () => {
    const isOpen = target.classList.toggle('open');
    btn.classList.toggle('open', isOpen);
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
 * @returns {HTMLElement}
 */
export function edTitleSection(config, onUpdate, t) {
  const sec = edSection(t('title'));
  sec.appendChild(edCheckboxRow(t('showTitle'), config.showTitle !== false, (v) => { config.showTitle = v; onUpdate(); }));
  const row = document.createElement('div');
  row.className = 'dmike-chart-ed-inline-row';
  const lbl = document.createElement('label');
  lbl.textContent = t('titleText');
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = config.title || '';
  inp.placeholder = t('titlePlaceholder');
  inp.addEventListener('change', () => { config.title = inp.value; onUpdate(); });
  row.appendChild(lbl);
  row.appendChild(inp);
  sec.appendChild(row);
  return sec;
}

/**
 * Build the font size section: title, axis labels, tick labels.
 * Mutates config in-place, calls onUpdate() after each change.
 * @param {{ titleSize: number, labelSize: number, tickSize: number }} config - Mutated in-place
 * @param {function} onUpdate - Called after config is mutated
 * @param {function} t
 * @returns {HTMLElement}
 */
export function edFontSizeSection(config, onUpdate, t) {
  const sec = edSection(t('fontSizes'));
  sec.appendChild(edRangeRow(t('titleFontSize'), config.titleSize ?? 15, (v) => { config.titleSize = v; onUpdate(); }, 8, 30, 1));
  sec.appendChild(edRangeRow(t('labelFontSize'), config.labelSize ?? 12, (v) => { config.labelSize = v; onUpdate(); }, 8, 24, 1));
  sec.appendChild(edRangeRow(t('tickFontSize'), config.tickSize ?? 11, (v) => { config.tickSize = v; onUpdate(); }, 6, 20, 1));
  return sec;
}

/**
 * Build axis label visibility toggles.
 * Mutates config in-place, calls onUpdate() after each change.
 * @param {{ showXLabel: boolean, showYLabel: boolean }} config - Mutated in-place
 * @param {function} onUpdate - Called after config is mutated
 * @param {function} t
 * @returns {HTMLElement}
 */
export function edAxisLabelSection(config, onUpdate, t) {
  const sec = edSection(t('axisLabels'));
  sec.appendChild(edCheckboxRow(t('showXLabel'), config.showXLabel !== false, (v) => { config.showXLabel = v; onUpdate(); }));
  sec.appendChild(edCheckboxRow(t('showYLabel'), config.showYLabel !== false, (v) => { config.showYLabel = v; onUpdate(); }));
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
 * @returns {HTMLElement|null}
 */
export function edAxisTickSection(config, onUpdate, t) {
  if (config.categoricalX === true && config.categoricalY === true) return null;
  const sec = edSection(t('axisTicks'));
  if (config.categoricalX !== true) {
    sec.appendChild(edCheckboxRow(t('showXTicks'), config.showXTicks !== false, (v) => { config.showXTicks = v; onUpdate(); }));
    sec.appendChild(edCheckboxRow(t('showXGrid'),  config.showXGrid  !== false, (v) => { config.showXGrid  = v; onUpdate(); }));
  }
  if (config.categoricalY !== true) {
    sec.appendChild(edCheckboxRow(t('showYTicks'), config.showYTicks !== false, (v) => { config.showYTicks = v; onUpdate(); }));
    sec.appendChild(edCheckboxRow(t('showYGrid'),  config.showYGrid  !== false, (v) => { config.showYGrid  = v; onUpdate(); }));
  }
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
 */
export const MARKER_SYMBOLS = [
  { value: 'circle',        label: '● Circle' },
  { value: 'square',        label: '■ Square' },
  { value: 'diamond',       label: '◆ Diamond' },
  { value: 'triangle',      label: '▲ Triangle' },
  { value: 'triangle-down', label: '▼ Tri-down' },
  { value: 'cross',         label: '✚ Cross' },
  { value: 'star',          label: '★ Star' },
];

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

  sec.appendChild(edSelectRow(t('symbol'), MARKER_SYMBOLS, a.getSymbol() || 'circle', (v) => {
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

