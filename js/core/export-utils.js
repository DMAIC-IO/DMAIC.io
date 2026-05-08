/**
 * export-utils.js — Centralised export helpers for all D.Mike modules.
 *
 * Provides:
 *  - downloadFile / downloadBlob — trigger browser download
 *  - ensureXLSX — lazy-load SheetJS
 *  - EXPORT_ICONS — SVG icon markup for export formats
 *  - createExportDropdown — reusable dropdown button + menu
 *  - exportTableAsPNG / exportTableAsSVG — render a table descriptor
 *    to a pixel-perfect PNG (2×) or true-vector SVG
 *
 * @module export-utils
 */

// ─── Download helpers ────────────────────────────────────────

/**
 * @param {string} content - Text content
 * @param {string} filename
 * @param {string} mimeType
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType });
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

// ─── XLSX lazy loader ────────────────────────────────────────

let _xlsxPromise = null;

export function ensureXLSX() {
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  if (_xlsxPromise) return _xlsxPromise;
  _xlsxPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/xlsx.full.min.js';
    s.onload = resolve;
    s.onerror = () => { _xlsxPromise = null; reject(new Error('Failed to load SheetJS')); };
    document.head.appendChild(s);
  });
  return _xlsxPromise;
}

// ─── Export icons ────────────────────────────────────────────

export const EXPORT_ICONS = {
  download: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  png:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  svg:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 15l2 2 4-4"/></svg>',
  csv:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M8 15h2M11 15h2M14 15h2"/></svg>',
  xlsx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 13l6 6M15 13l-6 6"/></svg>',
  json: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M10 12h1M13 12h1"/></svg>',
};

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
    xlsx: `${EXPORT_ICONS.xlsx} Excel`,
    csv:  `${EXPORT_ICONS.csv} CSV`,
    json: `${EXPORT_ICONS.json} JSON`,
    png:  `${EXPORT_ICONS.png} PNG`,
    svg:  `${EXPORT_ICONS.svg} SVG`,
  };

  const wrap = document.createElement('div');
  wrap.className = 'dmike-chart-dropdown';

  const btn = document.createElement('button');
  btn.className = 'btn btn--sm btn--secondary';
  btn.type = 'button';
  btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px';
  btn.innerHTML = `${EXPORT_ICONS.download} Export`;

  const menu = document.createElement('div');
  menu.className = 'dmike-chart-dropdown-menu';

  for (const fmt of formats) {
    const item = document.createElement('button');
    item.className = 'dmike-chart-dropdown-item';
    item.dataset.export = fmt;
    item.innerHTML = LABELS[fmt] || fmt;
    menu.appendChild(item);
  }

  wrap.appendChild(btn);
  wrap.appendChild(menu);

  const openMenu = () => {
    const rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = rect.left + 'px';
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
  const h = (hasWeights ? _WEIGHT_H : 0) + _HEADER_H + rows * _ROW_H
          + (hasSumRow ? _ROW_H : 0) + _PAD * 2;
  return { w, h, cols, rows, hasWeights, hasSumCol, hasSumRow, extraCol };
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
  const { w, h } = _dims(td);
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  _drawTable(ctx, td);
  canvas.toBlob(blob => downloadBlob(blob, filename), 'image/png');
}

// ─── opentype.js lazy loader ────────────────────────────────

let _opentypePromise = null;

function _ensureOpentype() {
  if (typeof opentype !== 'undefined') return Promise.resolve();
  if (_opentypePromise) return _opentypePromise;
  _opentypePromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/opentype.min.js';
    s.onload = resolve;
    s.onerror = () => { _opentypePromise = null; reject(new Error('Failed to load opentype.js')); };
    document.head.appendChild(s);
  });
  return _opentypePromise;
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
    _loadFont('vendor/fonts/dmsans-latin.ttf'),
    _loadFont('vendor/fonts/jetbrainsmono-full.ttf'),
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

  const _parseBgHex = (hex) => {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
  };
  const [bgR, bgG, bgB] = _parseBgHex(col.bgPrimary);
  const solidify = (color) => {
    if (!color || color === 'transparent' || color === 'none') return color;
    const m = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/);
    if (!m) return color;
    const r = +m[1], g = +m[2], b = +m[3], a = m[4] !== undefined ? +m[4] : 1;
    if (a >= 1) return `rgb(${r},${g},${b})`;
    const br = Math.round(r * a + bgR * (1 - a));
    const bg = Math.round(g * a + bgG * (1 - a));
    const bb = Math.round(b * a + bgB * (1 - a));
    return `#${((1<<24)+(br<<16)+(bg<<8)+bb).toString(16).slice(1)}`;
  };

  const rect = (x, y, w, h, fill, stroke) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${solidify(fill)}" stroke="${stroke}" stroke-width="1"/>`;

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
