/**
 * export-utils.js — Centralised export helpers for all D.Mike modules.
 *
 * Provides:
 *  - downloadFile / downloadBlob — trigger browser download
 *  - ensureXLSX — lazy-load SheetJS
 *  - createExportDropdown — reusable dropdown button + menu
 *  - exportTableAsPNG / exportTableAsSVG — render a table descriptor
 *    to a pixel-perfect PNG (2×) or true-vector SVG
 *
 * @module export-utils
 */

import { escAttr } from './html-utils.js';
import { h } from './dom.js';
import { icon } from './icon.js';
import { XLSX } from './vendor/xlsx.js';
import { opentype } from './vendor/opentype.js';

export { XLSX };

// ─── Download helpers ────────────────────────────────────────

/**
 * @param {string} content - Text content
 * @param {string} filename
 * @param {string} mimeType
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([`\uFEFF${  content}`], { type: mimeType });
  downloadBlob(blob, filename);
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── SVG-string → PNG rasterization ──────────────────────────

/**
 * Rasterize an SVG string to a PNG Blob via an offscreen canvas.
 *
 * Loads the SVG markup into an `Image`, paints it onto a canvas sized
 * `width·scale × height·scale`, and resolves with a PNG `Blob`. This is the
 * shared core behind every "serialize an SVG, draw it to a canvas, read back
 * a PNG" export in the app — callers parameterize only the differences
 * (output dimensions, HiDPI scale, optional background fill).
 *
 * @param {string} svgString - Serialized SVG markup.
 * @param {Object} [opts]
 * @param {number} opts.width  - Logical (1×) width of the image in px.
 * @param {number} opts.height - Logical (1×) height of the image in px.
 * @param {number} [opts.scale=2] - HiDPI multiplier for the output canvas.
 * @param {?string} [opts.background=null] - Solid fill behind the SVG
 *   (e.g. '#fff'). `null` keeps the canvas transparent.
 * @returns {Promise<Blob>} resolves with the PNG Blob; rejects if the SVG
 *   fails to load or the canvas yields no blob.
 */
export function svgStringToPngBlob(svgString, { width, height, scale = 2, background = null } = {}) {
  return new Promise((resolve, reject) => {
    const canvasW = width * scale;
    const canvasH = height * scale;
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvasW, canvasH);
    }

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvasW, canvasH);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => {
        png ? resolve(png) : reject(new Error('Canvas produced no PNG blob'));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG for rasterization'));
    };
    img.src = url;
  });
}

// ─── XLSX lazy loader ────────────────────────────────────────

/**
 * SheetJS (XLSX) is statically bundled from node_modules (see ./vendor/xlsx.js),
 * so it is always present. Kept async for callers that `await ensureXLSX()`
 * before touching `XLSX`. Signature/Promise contract is unchanged.
 * @returns {Promise<void>}
 */
export function ensureXLSX() {
  return Promise.resolve();
}

// ─── Export dropdown ─────────────────────────────────────────

/**
 * Create a reusable export dropdown button with format menu.
 *
 * @param {string[]} formats - e.g. ['xlsx','csv','json','png','svg']
 * @param {function(string):void} onExport - called with the chosen format key
 * @returns {{ el: HTMLElement, destroy: function }}
 *
 * @example
 *   const dd = createExportDropdown(['csv','png'], fmt => {
 *     if (fmt === 'csv') this._exportCSV();
 *     if (fmt === 'png') this._exportPNG();
 *   });
 *   toolbar.appendChild(dd.el);
 */
export function createExportDropdown(formats, onExport) {
  const LABELS = {
    xlsx: 'Excel',
    csv:  'CSV',
    json: 'JSON',
    png:  'PNG',
    svg:  'SVG',
  };

  const wrap = document.createElement('div');
  wrap.className = 'dmike-chart-dropdown';

  const btn = document.createElement('button');
  btn.className = 'btn btn--sm btn--secondary';
  btn.type = 'button';
  btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px';
  btn.replaceChildren(icon('action.download'), document.createTextNode(' Export'));

  const menu = document.createElement('div');
  menu.className = 'dmike-chart-dropdown-menu';

  for (const fmt of formats) {
    const item = h(
      'button',
      { class: 'dmike-chart-dropdown-item', 'data-export': fmt },
      icon(`format.${  fmt}`),
      LABELS[fmt] || fmt,
    );
    menu.appendChild(item);
  }

  wrap.appendChild(btn);
  wrap.appendChild(menu);

  const openMenu = () => {
    const rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4  }px`;
    menu.style.left = `${rect.left  }px`;
    menu.style.right = 'auto';
    menu.classList.add('open');
  };
  const closeMenu = () => menu.classList.remove('open');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.contains('open') ? closeMenu() : openMenu();
  });

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-export]');
    if (!item) return;
    closeMenu();
    onExport(item.dataset.export);
  });

  const docHandler = (e) => {
    if (!wrap.contains(e.target)) closeMenu();
  };
  document.addEventListener('click', docHandler);

  const destroy = () => {
    document.removeEventListener('click', docHandler);
    wrap.remove();
  };

  return { el: wrap, destroy };
}

// ─── Table image export ──────────────────────────────────────

/**
 * Descriptor for a table to be rendered to PNG / SVG.
 *
 * @typedef {Object} TableDescriptor
 * @property {string[]} outputs      - Column header labels
 * @property {string[]} inputs       - Row header labels
 * @property {number[]} [weights]    - Optional weight row (displayed above headers)
 * @property {string}   [weightLabel] - Label for weight row (e.g. "Importance")
 * @property {Array<Array<string|number>>} cells - cells[r][c] values
 * @property {(string|number)[]} [rowSums]  - Right-hand summary column
 * @property {(string|number)[]} [colSums]  - Bottom summary row
 * @property {string|number}     [grandTotal]
 * @property {string}   [rowSumLabel] - e.g. "Σ Row"
 * @property {string}   [colSumLabel] - e.g. "Σ Column"
 * @property {function(number,number,number):string} [cellBg]   - (val, min, max) → CSS color
 * @property {function(number,number,number):string} [cellFg]   - (val, min, max) → CSS color
 */

/**
 * Read current CSS theme colors from the document.
 * @returns {Object} color map
 */
function _themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const cv = (v, fb) => cs.getPropertyValue(v).trim() || fb;
  return {
    bgPrimary:     cv('--color-bg-primary', '#ffffff'),
    bgSecondary:   cv('--color-bg-secondary', '#f8f9fa'),
    bgTertiary:    cv('--color-bg-tertiary', '#e9ecef'),
    borderColor:   cv('--color-border-secondary', '#dee2e6'),
    borderStrong:  cv('--color-border-primary', '#cacad0'),
    textPrimary:   cv('--color-text-primary', '#212529'),
    textSecondary: cv('--color-text-secondary', '#6c757d'),
    textTertiary:  cv('--color-text-tertiary', '#adb5bd'),
    accentColor:   cv('--color-accent', '#0066cc'),
  };
}

const _PAD      = 16;
const _CELL_W   = 60;
const _NAME_W   = 160;
const _ROW_H    = 36;
const _HEADER_H = 120;
const _WEIGHT_H = 32;

/**
 * Compute total canvas dimensions for a TableDescriptor.
 * @param {TableDescriptor} td
 */
function _dims(td) {
  const cols = td.outputs.length;
  const rows = td.inputs.length;
  const hasWeights = Array.isArray(td.weights) && td.weights.length > 0;
  const hasSumCol = Array.isArray(td.rowSums);
  const hasSumRow = Array.isArray(td.colSums);
  const extraCol = hasSumCol ? _CELL_W : 0;

  const w = _NAME_W + cols * _CELL_W + extraCol + _PAD * 2;
  const height = (hasWeights ? _WEIGHT_H : 0) + _HEADER_H + rows * _ROW_H
          + (hasSumRow ? _ROW_H : 0) + _PAD * 2;
  return { w, h: height, cols, rows, hasWeights, hasSumCol, hasSumRow, extraCol };
}

/**
 * Draw a TableDescriptor onto a Canvas 2D context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {TableDescriptor} td
 */
function _drawTable(ctx, td) {
  const c = _themeColors();
  const d = _dims(td);

  const font     = '13px "DM Sans", system-ui, sans-serif';
  const fontMono = '13px "JetBrains Mono", monospace';
  const fontMonoSm = '11px "JetBrains Mono", monospace';
  const fontMonoBold = 'bold 14px "JetBrains Mono", monospace';
  const fontMonoSmBold = 'bold 11px "JetBrains Mono", monospace';

  ctx.fillStyle = c.bgPrimary;
  ctx.fillRect(0, 0, d.w, d.h);

  const ox = _PAD;
  let oy = _PAD;
  const tableW = _NAME_W + d.cols * _CELL_W + d.extraCol;
  const sumX = ox + _NAME_W + d.cols * _CELL_W;

  // ── Weight row ──
  if (d.hasWeights) {
    ctx.fillStyle = c.bgSecondary;
    ctx.fillRect(ox, oy, tableW, _WEIGHT_H);
    ctx.strokeStyle = c.borderColor; ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, tableW, _WEIGHT_H);

    ctx.fillStyle = c.textTertiary;
    ctx.font = fontMonoSm;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(td.weightLabel || '', ox + _NAME_W - 8, oy + _WEIGHT_H / 2);

    ctx.textAlign = 'center';
    ctx.font = fontMono;
    ctx.fillStyle = c.textPrimary;
    for (let i = 0; i < d.cols; i++) {
      const cx = ox + _NAME_W + i * _CELL_W + _CELL_W / 2;
      ctx.fillText(String(td.weights[i] ?? ''), cx, oy + _WEIGHT_H / 2);
      ctx.strokeRect(ox + _NAME_W + i * _CELL_W, oy, _CELL_W, _WEIGHT_H);
    }
    if (d.hasSumCol) ctx.strokeRect(sumX, oy, _CELL_W, _WEIGHT_H);
    oy += _WEIGHT_H;
  }

  // ── Output header row ──
  ctx.fillStyle = c.bgTertiary;
  ctx.fillRect(ox, oy, tableW, _HEADER_H);
  ctx.strokeStyle = c.borderStrong;
  ctx.strokeRect(ox, oy, _NAME_W, _HEADER_H);

  ctx.font = font;
  ctx.fillStyle = c.textSecondary;
  for (let i = 0; i < d.cols; i++) {
    const cx = ox + _NAME_W + i * _CELL_W + _CELL_W / 2;
    ctx.strokeRect(ox + _NAME_W + i * _CELL_W, oy, _CELL_W, _HEADER_H);
    ctx.save();
    ctx.translate(cx, oy + _HEADER_H - 8);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(td.outputs[i], 0, 0);
    ctx.restore();
  }
  if (d.hasSumCol) {
    ctx.strokeRect(sumX, oy, _CELL_W, _HEADER_H);
    ctx.save();
    ctx.translate(sumX + _CELL_W / 2, oy + _HEADER_H - 8);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = c.accentColor;
    ctx.font = fontMonoSmBold;
    ctx.fillText((td.rowSumLabel || '').toUpperCase(), 0, 0);
    ctx.restore();
  }
  oy += _HEADER_H;

  // ── Data rows ──
  const rMin = d.hasSumCol ? Math.min(...td.rowSums.map(Number)) : 0;
  const rMax = d.hasSumCol ? Math.max(...td.rowSums.map(Number)) : 0;

  for (let r = 0; r < d.rows; r++) {
    const ry = oy + r * _ROW_H;

    ctx.fillStyle = c.bgSecondary;
    ctx.fillRect(ox, ry, _NAME_W, _ROW_H);
    ctx.strokeStyle = c.borderColor;
    ctx.strokeRect(ox, ry, _NAME_W, _ROW_H);
    ctx.fillStyle = c.textPrimary; ctx.font = font;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(td.inputs[r], ox + 12, ry + _ROW_H / 2);

    for (let col = 0; col < d.cols; col++) {
      const sx = ox + _NAME_W + col * _CELL_W;
      ctx.fillStyle = c.bgPrimary;
      ctx.fillRect(sx, ry, _CELL_W, _ROW_H);
      ctx.strokeStyle = c.borderColor;
      ctx.strokeRect(sx, ry, _CELL_W, _ROW_H);
      const v = td.cells[r]?.[col];
      if (v !== undefined && v !== '' && v !== null) {
        ctx.fillStyle = c.textPrimary;
        ctx.font = fontMonoBold; ctx.textAlign = 'center';
        ctx.fillText(String(v), sx + _CELL_W / 2, ry + _ROW_H / 2);
      }
    }

    if (d.hasSumCol) {
      const rs = Number(td.rowSums[r]);
      ctx.fillStyle = td.cellBg ? td.cellBg(rs, rMin, rMax) : 'transparent';
      ctx.fillRect(sumX, ry, _CELL_W, _ROW_H);
      ctx.strokeStyle = c.borderColor;
      ctx.strokeRect(sumX, ry, _CELL_W, _ROW_H);
      ctx.fillStyle = td.cellFg ? td.cellFg(rs, rMin, rMax) : c.textPrimary;
      ctx.font = fontMonoBold; ctx.textAlign = 'center';
      ctx.fillText(String(rs), sumX + _CELL_W / 2, ry + _ROW_H / 2);
    }
  }

  // ── Footer row (column sums) ──
  if (d.hasSumRow) {
    const fY = oy + d.rows * _ROW_H;
    const cMin = Math.min(...td.colSums.map(Number));
    const cMax = Math.max(...td.colSums.map(Number));

    ctx.fillStyle = c.bgTertiary;
    ctx.fillRect(ox, fY, _NAME_W, _ROW_H);
    ctx.strokeStyle = c.borderStrong;
    ctx.strokeRect(ox, fY, _NAME_W, _ROW_H);
    ctx.fillStyle = c.accentColor;
    ctx.font = fontMonoSmBold; ctx.textAlign = 'center';
    ctx.fillText((td.colSumLabel || '').toUpperCase(), ox + _NAME_W / 2, fY + _ROW_H / 2);

    for (let col = 0; col < d.cols; col++) {
      const sx = ox + _NAME_W + col * _CELL_W;
      const cs = Number(td.colSums[col]);
      ctx.fillStyle = td.cellBg ? td.cellBg(cs, cMin, cMax) : 'transparent';
      ctx.fillRect(sx, fY, _CELL_W, _ROW_H);
      ctx.strokeStyle = c.borderStrong;
      ctx.strokeRect(sx, fY, _CELL_W, _ROW_H);
      ctx.fillStyle = td.cellFg ? td.cellFg(cs, cMin, cMax) : c.textPrimary;
      ctx.font = fontMonoBold; ctx.textAlign = 'center';
      ctx.fillText(String(cs), sx + _CELL_W / 2, fY + _ROW_H / 2);
    }

    if (d.hasSumCol && td.grandTotal !== undefined) {
      ctx.fillStyle = c.bgTertiary;
      ctx.fillRect(sumX, fY, _CELL_W, _ROW_H);
      ctx.strokeStyle = c.borderStrong;
      ctx.strokeRect(sumX, fY, _CELL_W, _ROW_H);
      ctx.fillStyle = c.accentColor;
      ctx.font = fontMonoBold; ctx.textAlign = 'center';
      ctx.fillText(String(td.grandTotal), sumX + _CELL_W / 2, fY + _ROW_H / 2);
    }
  }
}

/**
 * Export a table as PNG (2× resolution).
 * @param {TableDescriptor} td
 * @param {string} [filename='table.png']
 */
export function exportTableAsPNG(td, filename = 'table.png') {
  const { w, h: height } = _dims(td);
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  _drawTable(ctx, td);
  canvas.toBlob(blob => downloadBlob(blob, filename), 'image/png');
}

// ─── opentype.js lazy loader ────────────────────────────────

/**
 * opentype.js is statically bundled from node_modules (see ./vendor/opentype.js),
 * so it is always present. Kept async for callers. Signature unchanged.
 * @returns {Promise<void>}
 */
function _ensureOpentype() {
  return Promise.resolve();
}

/** @type {Map<string, opentype.Font>} */
const _fontCache = new Map();

async function _loadFont(url) {
  if (_fontCache.has(url)) return _fontCache.get(url);
  const buf = await fetch(url).then(r => r.arrayBuffer());
  const font = opentype.parse(buf);
  _fontCache.set(url, font);
  return font;
}

/** @type {{ sans: opentype.Font, mono: opentype.Font }|null} */
let _svgFonts = null;

async function _ensureSVGFonts() {
  if (_svgFonts) return _svgFonts;
  await _ensureOpentype();
  const [sans, mono] = await Promise.all([
    _loadFont('assets/fonts/dmsans-latin.ttf'),
    _loadFont('assets/fonts/jetbrainsmono-full.ttf'),
  ]);
  _svgFonts = { sans, mono };
  return _svgFonts;
}

/**
 * Render text as an SVG `<path>` using opentype.js.
 * @param {opentype.Font} font
 * @param {string} txt
 * @param {number} x
 * @param {number} y
 * @param {number} fontSize
 * @param {Object} opts
 * @returns {string} SVG markup
 */
function _textPath(font, txt, x, y, fontSize, opts = {}) {
  const anchor = opts.anchor || 'middle';
  const color = opts.color || '#000';
  const transform = opts.transform || '';

  const path = font.getPath(txt, 0, 0, fontSize);
  const bb = path.getBoundingBox();
  const textW = bb.x2 - bb.x1;
  const ascent = font.ascender / font.unitsPerEm * fontSize;
  const descender = font.descender / font.unitsPerEm * fontSize;
  const textH = ascent - descender;

  let dx = x;
  if (anchor === 'middle') dx = x - textW / 2 - bb.x1;
  else if (anchor === 'start') dx = x - bb.x1;
  else if (anchor === 'end') dx = x - textW - bb.x1;

  const dy = y + textH / 2 + descender;

  let groupTransform = `translate(${dx},${dy})`;
  if (transform) groupTransform = `${transform} ${groupTransform}`;

  const svgPath = path.toSVG();
  return `<g transform="${groupTransform}" fill="${color}">${svgPath}</g>`;
}

/**
 * Export a table as true-vector SVG with text converted to paths
 * (compatible with Inkscape and all SVG viewers).
 * @param {TableDescriptor} td
 * @param {string} [filename='table.svg']
 */
export async function exportTableAsSVG(td, filename = 'table.svg') {
  const fonts = await _ensureSVGFonts();
  const col = _themeColors();
  const d = _dims(td);

  const _parseBgHex = (hexIn) => {
    let hex = hexIn.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
  };
  const [bgR, bgG, bgB] = _parseBgHex(col.bgPrimary);
  const solidify = (color) => {
    if (!color || color === 'transparent' || color === 'none') return color;
    const m = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/);
    if (!m) return color;
    const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]), a = m[4] !== undefined ? Number(m[4]) : 1;
    if (a >= 1) return `rgb(${r},${g},${b})`;
    const br = Math.round(r * a + bgR * (1 - a));
    const bg = Math.round(g * a + bgG * (1 - a));
    const bb = Math.round(b * a + bgB * (1 - a));
    return `#${((1<<24)+(br<<16)+(bg<<8)+bb).toString(16).slice(1)}`;
  };

  const rect = (x, y, w, height, fill, stroke) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${height}" fill="${solidify(fill)}" stroke="${stroke}" stroke-width="1"/>`;

  const text = (x, y, txt, opts = {}) => {
    const font = opts.mono ? fonts.mono : fonts.sans;
    const fs = opts.size || 13;
    const fill = solidify(opts.color || col.textPrimary);
    return _textPath(font, txt, x, y, fs, {
      anchor: opts.anchor || 'middle',
      color: fill,
      transform: opts.transform || '',
    });
  };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d.w}" height="${d.h}" viewBox="0 0 ${d.w} ${d.h}">`;
  svg += rect(0, 0, d.w, d.h, col.bgPrimary, 'none');

  const ox = _PAD;
  let oy = _PAD;
  const tableW = _NAME_W + d.cols * _CELL_W + d.extraCol;
  const sumX = ox + _NAME_W + d.cols * _CELL_W;

  // ── Weight row ──
  if (d.hasWeights) {
    svg += rect(ox, oy, tableW, _WEIGHT_H, col.bgSecondary, col.borderColor);
    for (let i = 0; i < d.cols; i++) {
      svg += rect(ox + _NAME_W + i * _CELL_W, oy, _CELL_W, _WEIGHT_H, 'none', col.borderColor);
    }
    if (d.hasSumCol) svg += rect(sumX, oy, _CELL_W, _WEIGHT_H, 'none', col.borderColor);

    svg += text(ox + _NAME_W - 8, oy + _WEIGHT_H / 2, td.weightLabel || '', { anchor: 'end', mono: true, size: 11, color: col.textTertiary });
    for (let i = 0; i < d.cols; i++) {
      svg += text(ox + _NAME_W + i * _CELL_W + _CELL_W / 2, oy + _WEIGHT_H / 2, String(td.weights[i] ?? ''), { mono: true });
    }
    oy += _WEIGHT_H;
  }

  // ── Output header row ──
  svg += rect(ox, oy, _NAME_W, _HEADER_H, col.bgTertiary, col.borderStrong);
  for (let i = 0; i < d.cols; i++) {
    const cx = ox + _NAME_W + i * _CELL_W;
    svg += rect(cx, oy, _CELL_W, _HEADER_H, col.bgTertiary, col.borderStrong);
    const tx = cx + _CELL_W / 2;
    const ty = oy + _HEADER_H - 8;
    svg += text(tx, ty, td.outputs[i], {
      mono: false, size: 13, color: col.textSecondary,
      transform: `rotate(-90, ${tx}, ${ty})`, anchor: 'start',
    });
  }
  if (d.hasSumCol) {
    svg += rect(sumX, oy, _CELL_W, _HEADER_H, col.bgTertiary, col.borderStrong);
    const tx = sumX + _CELL_W / 2;
    const ty = oy + _HEADER_H - 8;
    svg += text(tx, ty, (td.rowSumLabel || '').toUpperCase(), {
      mono: true, size: 11, color: col.accentColor, bold: true,
      transform: `rotate(-90, ${tx}, ${ty})`, anchor: 'start',
    });
  }
  oy += _HEADER_H;

  // ── Data rows ──
  const rMin = d.hasSumCol ? Math.min(...td.rowSums.map(Number)) : 0;
  const rMax = d.hasSumCol ? Math.max(...td.rowSums.map(Number)) : 0;

  for (let r = 0; r < d.rows; r++) {
    const ry = oy + r * _ROW_H;
    svg += rect(ox, ry, _NAME_W, _ROW_H, col.bgSecondary, col.borderColor);
    svg += text(ox + 12, ry + _ROW_H / 2, td.inputs[r], { anchor: 'start' });

    for (let i = 0; i < d.cols; i++) {
      const sx = ox + _NAME_W + i * _CELL_W;
      svg += rect(sx, ry, _CELL_W, _ROW_H, col.bgPrimary, col.borderColor);
      const v = td.cells[r]?.[i];
      if (v !== undefined && v !== '' && v !== null) {
        svg += text(sx + _CELL_W / 2, ry + _ROW_H / 2, String(v), { mono: true, size: 14, bold: true });
      }
    }

    if (d.hasSumCol) {
      const rs = Number(td.rowSums[r]);
      const bg = td.cellBg ? td.cellBg(rs, rMin, rMax) : 'transparent';
      const fg = td.cellFg ? td.cellFg(rs, rMin, rMax) : col.textPrimary;
      svg += rect(sumX, ry, _CELL_W, _ROW_H, bg, col.borderColor);
      svg += text(sumX + _CELL_W / 2, ry + _ROW_H / 2, String(rs), { mono: true, size: 14, bold: true, color: fg });
    }
  }

  // ── Footer row ──
  if (d.hasSumRow) {
    const fY = oy + d.rows * _ROW_H;
    const cMin = Math.min(...td.colSums.map(Number));
    const cMax = Math.max(...td.colSums.map(Number));

    svg += rect(ox, fY, _NAME_W, _ROW_H, col.bgTertiary, col.borderStrong);
    svg += text(ox + _NAME_W / 2, fY + _ROW_H / 2, (td.colSumLabel || '').toUpperCase(), { mono: true, size: 11, bold: true, color: col.accentColor });

    for (let i = 0; i < d.cols; i++) {
      const sx = ox + _NAME_W + i * _CELL_W;
      const cs = Number(td.colSums[i]);
      const bg = td.cellBg ? td.cellBg(cs, cMin, cMax) : 'transparent';
      const fg = td.cellFg ? td.cellFg(cs, cMin, cMax) : col.textPrimary;
      svg += rect(sx, fY, _CELL_W, _ROW_H, bg, col.borderStrong);
      svg += text(sx + _CELL_W / 2, fY + _ROW_H / 2, String(cs), { mono: true, size: 14, bold: true, color: fg });
    }

    if (d.hasSumCol && td.grandTotal !== undefined) {
      svg += rect(sumX, fY, _CELL_W, _ROW_H, col.bgTertiary, col.borderStrong);
      svg += text(sumX + _CELL_W / 2, fY + _ROW_H / 2, String(td.grandTotal), { mono: true, size: 14, bold: true, color: col.accentColor });
    }
  }

  svg += '</svg>';
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), filename);
}

// ─── Column / card image export ──────────────────────────────
//
// Generic renderer for a row of N labelled columns, each holding a stack of
// text-cards (e.g. SIPOC's Supplier-Input-Process-Output-Customer board).
// This is DISTINCT from the table exporters above (which draw a grid). The
// input is intentionally generic — no module-specific names or CSS classes.

/**
 * One column of a column/card export.
 *
 * @typedef {Object} ExportColumn
 * @property {string}   title  - Header label (rendered UPPERCASE by the caller's choice; drawn verbatim)
 * @property {string}   [desc] - Optional sub-label under the title (mono)
 * @property {string}   color  - Accent color (CSS hex) for the header tint + dot
 * @property {string[]} items  - Card labels, top to bottom
 */

/**
 * Default geometry + font settings for a column/card export.
 * Callers may override any subset via the `opts` argument.
 */
const _COL_DEFAULTS = {
  COL_W: 200,
  GAP: 8,
  PAD: 20,
  HEADER_H: 48,
  ITEM_H: 32,
  ITEM_PAD: 6,
  ITEM_MAX: 28,        // truncate item labels longer than this …
  ITEM_TRUNC: 26,      // … to this many chars + '…'
  FONT: '13px "DM Sans", system-ui, sans-serif',
  FONT_SM: '10px "JetBrains Mono", monospace',
  FONT_LABEL: 'bold 11px "DM Sans", system-ui, sans-serif',
};

/**
 * Merge caller options over the column-export defaults.
 * @param {Object} [opts]
 * @returns {Object} resolved geometry/font config
 */
function _colOpts(opts = {}) {
  return { ..._COL_DEFAULTS, ...opts };
}

/**
 * Compute total canvas dimensions for a column/card export.
 * Pure geometry — unit-testable.
 * @param {ExportColumn[]} columns
 * @param {Object} [opts]
 * @returns {{ w: number, h: number, maxItems: number }}
 */
export function columnExportDims(columns, opts = {}) {
  const o = _colOpts(opts);
  const maxItems = Math.max(...columns.map(c => c.items.length), 1);
  const w = o.PAD * 2 + columns.length * o.COL_W + (columns.length - 1) * o.GAP;
  const height = o.PAD * 2 + o.HEADER_H + maxItems * (o.ITEM_H + o.ITEM_PAD) + o.ITEM_PAD;
  return { w, h: height, maxItems };
}

/**
 * Truncate a card label to fit one card. Pure — unit-testable.
 * @param {string} label
 * @param {number} [max=28]   - max length before truncation
 * @param {number} [trunc=26] - chars kept when truncating (+ '…')
 * @returns {string}
 */
export function truncateColumnLabel(label, max = _COL_DEFAULTS.ITEM_MAX, trunc = _COL_DEFAULTS.ITEM_TRUNC) {
  return label.length > max ? `${label.slice(0, trunc)  }…` : label;
}

/**
 * Read the theme colors a column/card export needs from the document.
 * @returns {Object} color map
 */
function _columnThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  const cv = (v, fb) => cs.getPropertyValue(v).trim() || fb;
  return {
    bgPrimary:     cv('--color-bg-primary', '#ffffff'),
    bgSecondary:   cv('--color-bg-secondary', '#f8f9fa'),
    borderColor:   cv('--color-border-secondary', '#dee2e6'),
    textPrimary:   cv('--color-text-primary', '#212529'),
    textSecondary: cv('--color-text-secondary', '#6c757d'),
    textTertiary:  cv('--color-text-tertiary', '#adb5bd'),
  };
}

/**
 * Trace a fully-rounded rectangle path on a Canvas 2D context.
 * @param {CanvasRenderingContext2D} ctx
 */
function _roundRect(ctx, x, y, w, height, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + height - r);
  ctx.arcTo(x + w, y + height, x + w - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Trace a rectangle with only its top two corners rounded.
 * @param {CanvasRenderingContext2D} ctx
 */
function _roundRectTop(ctx, x, y, w, height, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Draw a column/card board onto a Canvas 2D context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ExportColumn[]} columns
 * @param {Object} o - resolved options (from _colOpts) incl. theme colors
 */
function _drawColumns(ctx, columns, o) {
  const { W, H } = o;

  ctx.fillStyle = o.bgPrimary;
  ctx.fillRect(0, 0, W, H);

  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci];
    const x = o.PAD + ci * (o.COL_W + o.GAP);
    const color = col.color;
    const items = col.items;

    ctx.fillStyle = o.bgSecondary;
    ctx.strokeStyle = o.borderColor;
    ctx.lineWidth = 1;
    const colH = o.HEADER_H + Math.max(items.length, 1) * (o.ITEM_H + o.ITEM_PAD) + o.ITEM_PAD;
    _roundRect(ctx, x, o.PAD, o.COL_W, colH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = `${color  }18`;
    _roundRectTop(ctx, x, o.PAD, o.COL_W, o.HEADER_H, 6);
    ctx.fill();
    ctx.strokeStyle = o.borderColor;
    ctx.beginPath();
    ctx.moveTo(x, o.PAD + o.HEADER_H);
    ctx.lineTo(x + o.COL_W, o.PAD + o.HEADER_H);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x + 14, o.PAD + o.HEADER_H / 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.fillStyle = o.textPrimary;
    ctx.font = o.FONT_LABEL;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(col.title, x + 26, o.PAD + o.HEADER_H / 2 - 6);

    ctx.fillStyle = o.textTertiary;
    ctx.font = o.FONT_SM;
    ctx.fillText(col.desc || '', x + 26, o.PAD + o.HEADER_H / 2 + 8);

    for (let i = 0; i < items.length; i++) {
      const iy = o.PAD + o.HEADER_H + o.ITEM_PAD + i * (o.ITEM_H + o.ITEM_PAD);
      ctx.fillStyle = o.bgPrimary;
      ctx.strokeStyle = o.borderColor;
      _roundRect(ctx, x + 8, iy, o.COL_W - 16, o.ITEM_H, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = o.textPrimary;
      ctx.font = o.FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const txt = truncateColumnLabel(items[i], o.ITEM_MAX, o.ITEM_TRUNC);
      ctx.fillText(txt, x + 14, iy + o.ITEM_H / 2);
    }
  }
}

/**
 * Export a column/card board as PNG (2× resolution).
 *
 * @param {ExportColumn[]} columns - the columns to render
 * @param {Object} [opts] - geometry/font overrides (see _COL_DEFAULTS).
 *   Theme colors are read from the document unless explicitly provided.
 * @param {string} [filename='columns.png']
 */
export function exportColumnsAsPNG(columns, opts = {}, filename = 'columns.png') {
  const o = { ..._colOpts(opts), ..._columnThemeColors(), ...opts };
  const { w, h: height } = columnExportDims(columns, o);
  o.W = w; o.H = height;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  _drawColumns(ctx, columns, o);
  canvas.toBlob(blob => downloadBlob(blob, filename), 'image/png');
}

/**
 * Export a column/card board as SVG (native `<text>`, not vectorised paths —
 * matching the historical SIPOC export output byte-for-byte).
 *
 * @param {ExportColumn[]} columns - the columns to render
 * @param {Object} [opts] - geometry/font overrides + optional theme colors
 * @param {string} [filename='columns.svg']
 */
export function exportColumnsAsSVG(columns, opts = {}, filename = 'columns.svg') {
  const o = { ..._colOpts(opts), ..._columnThemeColors(), ...opts };
  const { w: W, h: H } = columnExportDims(columns, o);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="${o.bgPrimary}"/>`;

  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci];
    const x = o.PAD + ci * (o.COL_W + o.GAP);
    const color = col.color;
    const items = col.items;
    const colH = o.HEADER_H + Math.max(items.length, 1) * (o.ITEM_H + o.ITEM_PAD) + o.ITEM_PAD;

    svg += `<rect x="${x}" y="${o.PAD}" width="${o.COL_W}" height="${colH}" rx="6" fill="${o.bgSecondary}" stroke="${o.borderColor}"/>`;
    svg += `<rect x="${x}" y="${o.PAD}" width="${o.COL_W}" height="${o.HEADER_H}" rx="6" fill="${color}" fill-opacity="0.09"/>`;
    svg += `<rect x="${x}" y="${o.PAD + o.HEADER_H - 6}" width="${o.COL_W}" height="6" fill="${color}" fill-opacity="0.09"/>`;
    svg += `<line x1="${x}" y1="${o.PAD + o.HEADER_H}" x2="${x + o.COL_W}" y2="${o.PAD + o.HEADER_H}" stroke="${o.borderColor}"/>`;

    svg += `<circle cx="${x + 14}" cy="${o.PAD + o.HEADER_H / 2}" r="5" fill="${color}"/>`;
    svg += `<text x="${x + 26}" y="${o.PAD + o.HEADER_H / 2 - 6}" fill="${o.textPrimary}" font-size="11" font-weight="bold" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${escAttr(col.title)}</text>`;
    svg += `<text x="${x + 26}" y="${o.PAD + o.HEADER_H / 2 + 8}" fill="${o.textTertiary}" font-size="10" font-family="JetBrains Mono, monospace" dominant-baseline="central">${escAttr(col.desc || '')}</text>`;

    for (let i = 0; i < items.length; i++) {
      const iy = o.PAD + o.HEADER_H + o.ITEM_PAD + i * (o.ITEM_H + o.ITEM_PAD);
      svg += `<rect x="${x + 8}" y="${iy}" width="${o.COL_W - 16}" height="${o.ITEM_H}" rx="4" fill="${o.bgPrimary}" stroke="${o.borderColor}"/>`;
      const txt = truncateColumnLabel(items[i], o.ITEM_MAX, o.ITEM_TRUNC);
      svg += `<text x="${x + 14}" y="${iy + o.ITEM_H / 2}" fill="${o.textPrimary}" font-size="13" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${escAttr(txt)}</text>`;
    }
  }

  svg += '</svg>';
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), filename);
}
