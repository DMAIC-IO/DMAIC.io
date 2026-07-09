/**
 * color-picker.js — Shared RGBA color picker popup.
 * Global utility used by chart editors and the settings panel.
 *
 * @module color-picker
 */

// ── Helpers ──────────────────────────────────────────────────

/** Parse rgba()/rgb() string → { r, g, b, a } */
export function parseRGBA(str) {
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (!m) return { r: 100, g: 100, b: 100, a: 1 };
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
}

/** { r, g, b, a } → rgba() string */
export function rgbaStr(c) {
  return `rgba(${c.r},${c.g},${c.b},${c.a.toFixed(2)})`;
}

/**
 * Convert RGBA components to #RRGGBBAA hex string.
 * @param {{ r: number, g: number, b: number, a: number }} c
 * @returns {string}
 */
export function rgbaToHex(c) {
  const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${  hex(c.r)  }${hex(c.g)  }${hex(c.b)  }${hex(c.a * 255)}`;
}

/**
 * Parse a #RRGGBB or #RRGGBBAA hex string into RGBA components.
 * Returns null if the string is not a valid hex color.
 * @param {string} str
 * @returns {{ r: number, g: number, b: number, a: number }|null}
 */
export function parseHex(str) {
  const s = str.replace(/^#/, '');
  if (s.length !== 6 && s.length !== 8) return null;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  const a = s.length === 8 ? parseInt(s.slice(6, 8), 16) / 255 : 1;
  if ([r, g, b, a].some(v => isNaN(v))) return null;
  return { r, g, b, a };
}

/**
 * Convert a hex color (#RRGGBB) to rgba() string.
 * @param {string} hex
 * @returns {string}
 */
export function hexToRGBA(hex) {
  const c = parseHex(hex);
  return c ? rgbaStr(c) : 'rgba(100,100,100,1)';
}

/**
 * Convert an rgba() string to #RRGGBB hex (ignoring alpha).
 * @param {string} rgba
 * @returns {string}
 */
export function rgbaToHex6(rgba) {
  const c = parseRGBA(rgba);
  const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${  hex(c.r)  }${hex(c.g)  }${hex(c.b)}`;
}

// ── Color Picker ─────────────────────────────────────────────

import { createSliderInput } from './slider.js';

/**
 * Open an RGBA color picker popup.
 * @param {MouseEvent} e
 * @param {string} currentColor - rgba() string
 * @param {function} onChange - Called with new rgba() string on each slider change
 * @returns {{ close: function }} - Call close() to remove the popup
 */
export function openColorPicker(e, currentColor, onChange) {
  const c = parseRGBA(currentColor);
  const overlay = document.createElement('div');
  overlay.className = 'dmike-chart-ed-cp-overlay';
  const popup = document.createElement('div');
  popup.className = 'dmike-chart-ed-cp-popup';

  const rect = e.target.getBoundingClientRect();
  popup.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
  popup.style.top = `${rect.bottom + 6}px`;

  const preview = document.createElement('div');
  preview.className = 'dmike-chart-ed-cp-preview';
  const previewColor = document.createElement('div');
  previewColor.className = 'dmike-chart-ed-cp-preview-color';
  previewColor.style.background = currentColor;
  preview.appendChild(previewColor);
  popup.appendChild(preview);

  // Hex input row
  const hexRow = document.createElement('div');
  hexRow.className = 'dmike-chart-ed-cp-hex-row';
  const hexLabel = document.createElement('span');
  hexLabel.textContent = '#';
  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'dmike-chart-ed-cp-hex-input';
  hexInput.value = rgbaToHex(c).slice(1);
  hexInput.spellcheck = false;
  hexInput.maxLength = 8;
  hexRow.appendChild(hexLabel);
  hexRow.appendChild(hexInput);
  popup.appendChild(hexRow);

  /** @type {Map<string, { slider: HTMLInputElement, val: HTMLSpanElement }>} */
  const sliderRefs = new Map();

  const syncHexFromSliders = () => {
    hexInput.value = rgbaToHex(c).slice(1);
  };

  const update = () => {
    const str = rgbaStr(c);
    previewColor.style.background = str;
    syncHexFromSliders();
    onChange(str);
  };

  [
    { key: 'r', label: 'R', max: 255, cls: 'dmike-chart-ed-cp-r' },
    { key: 'g', label: 'G', max: 255, cls: 'dmike-chart-ed-cp-g' },
    { key: 'b', label: 'B', max: 255, cls: 'dmike-chart-ed-cp-b' },
    { key: 'a', label: 'A', max: 100, cls: 'dmike-chart-ed-cp-a' },
  ].forEach(ch => {
    const row = document.createElement('div');
    row.className = 'dmike-chart-ed-cp-slider-row';
    const span = document.createElement('span');
    span.textContent = ch.label;
    const initVal = ch.key === 'a' ? Math.round(c.a * 100) : c[ch.key];
    const slider = createSliderInput({
      value: initVal, min: 0, max: ch.max, step: 1,
      className: ch.cls,
    });
    const val = document.createElement('span');
    val.className = 'dmike-chart-ed-cp-val';
    val.textContent = initVal;
    sliderRefs.set(ch.key, { slider, val });
    slider.addEventListener('input', () => {
      val.textContent = slider.value;
      if (ch.key === 'a') c.a = Number(slider.value) / 100;
      else c[ch.key] = Number(slider.value);
      update();
    });
    row.appendChild(span);
    row.appendChild(slider);
    row.appendChild(val);
    popup.appendChild(row);
  });

  // Hex input → update sliders + color
  hexInput.addEventListener('input', () => {
    const parsed = parseHex(hexInput.value);
    if (!parsed) return;
    c.r = parsed.r;
    c.g = parsed.g;
    c.b = parsed.b;
    c.a = parsed.a;
    // Sync sliders
    const sr = sliderRefs.get('r');
    sr.slider.value = c.r; sr.val.textContent = c.r;
    const sg = sliderRefs.get('g');
    sg.slider.value = c.g; sg.val.textContent = c.g;
    const sb = sliderRefs.get('b');
    sb.slider.value = c.b; sb.val.textContent = c.b;
    const sa = sliderRefs.get('a');
    const aVal = Math.round(c.a * 100);
    sa.slider.value = aVal; sa.val.textContent = aVal;
    const str = rgbaStr(c);
    previewColor.style.background = str;
    onChange(str);
  });

  const close = () => {
    overlay.remove();
    popup.remove();
  };

  overlay.addEventListener('click', close);
  document.body.appendChild(overlay);
  document.body.appendChild(popup);

  return { close };
}
