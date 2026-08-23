/**
 * DashboardGrid — lightweight grid-layout engine for draggable / resizable
 * dashboard tiles.
 *
 * - Fixed number of columns (default 12), fixed row height in px.
 * - Move handle: top-left square → drags the tile to a new grid cell.
 * - Resize handle: bottom-right square → grows tile to new cell size.
 * - Snap-to-grid during drag; moves that would overlap another tile are
 *   rejected (tile stays at last valid position).
 *
 * The grid owns only the tile *frame* (border, title, handles, body).
 * Tile content is inserted into the element returned by `getTileBody(id)`.
 *
 * Lifecycle callbacks:
 *   onLayoutChange(layout)       – called when a move/resize/add/remove completes
 *   onTileResized(id, layout)    – called while a resize is in progress
 *   onTileRemoved(id)            – called after a tile is removed
 */

// ── DOM → Image export helpers ──────────────────────────────────

/**
 * Collect all page CSS (stylesheets + resolved custom properties)
 * so it can be embedded inside a foreignObject `<style>` block.
 * This lets the browser's own CSS engine do the layout inside the SVG.
 */
function _collectCSS() {
  // 1. Resolve all CSS custom properties from :root
  const root = getComputedStyle(document.documentElement);
  let vars = ':root{';
  for (let i = 0; i < root.length; i++) {
    const p = root[i];
    if (p.startsWith('--')) vars += `${p}:${root.getPropertyValue(p)};`;
  }
  vars += '}';

  // 2. Read all stylesheet rules
  let rules = '';
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) rules += `${rule.cssText  }\n`;
    } catch { /* cross-origin — skip */ }
  }

  // 3. Resolve the actual rendered font-family so SVG renderers find it.
  //    System-font aliases (-apple-system, BlinkMacSystemFont, Segoe UI…)
  //    don't work inside foreignObject, but the resolved family does.
  const body = document.body || document.documentElement;
  const resolvedFont = getComputedStyle(body).fontFamily;
  const resolvedMono = getComputedStyle(
    document.querySelector('code, .font-mono, [style*=monospace]') || body
  ).fontFamily;
  const fontOverride =
    `:root{--font-family:${resolvedFont};--font-family-mono:${resolvedMono};}` +
    `body,html,div,span,p,h1,h2,h3,h4,h5,h6,li,ol,ul,section,header,nav,button,input,label{font-family:${resolvedFont};}`;

  return `${vars  }\n${  fontOverride  }\n${  rules}`;
}

/** Shared: clone element, embed full CSS, wrap in foreignObject SVG. */
function _buildExportSvg(el) {
  const rect = el.getBoundingClientRect();
  const w = Math.ceil(rect.width);
  const h = Math.ceil(rect.height);

  const clone = el.cloneNode(true);
  // Strip interactive controls
  clone.querySelectorAll('.dashboard-grid__tile-move, .dashboard-grid__tile-resize, .dashboard-grid__tile-remove, .dashboard-grid__tile-export')
    .forEach(n => n.remove());
  // Fix root element for standalone rendering
  clone.style.cssText = `position:static;margin:0;width:${w}px;height:${h}px;overflow:hidden;`;
  // Copy data-theme so theme-aware CSS selectors still match
  clone.closest('[data-theme]') ||
    clone.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') || 'light');

  const xmlns = 'http://www.w3.org/1999/xhtml';
  const svgNs = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('xmlns', svgNs);
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  const fo = document.createElementNS(svgNs, 'foreignObject');
  fo.setAttribute('width', '100%');
  fo.setAttribute('height', '100%');

  // Build an XHTML document fragment with embedded styles
  const wrapper = document.createElementNS(xmlns, 'div');
  wrapper.setAttribute('xmlns', xmlns);
  wrapper.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') || 'light');
  wrapper.style.cssText = `margin:0;padding:0;width:${w}px;height:${h}px;`;

  const style = document.createElementNS(xmlns, 'style');
  style.textContent = _collectCSS();
  wrapper.appendChild(style);
  wrapper.appendChild(clone);

  fo.appendChild(wrapper);
  svg.appendChild(fo);
  return { svg, w, h };
}

/**
 * Capture a DOM element as a PNG blob.
 * @param {HTMLElement} el
 * @param {number} scale - Pixel density multiplier (default 2)
 * @returns {Promise<Blob>}
 */
async function domToPngBlob(el, scale = 2) {
  const { svg, w, h } = _buildExportSvg(el);
  const svgData = new XMLSerializer().serializeToString(svg);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${  encodeURIComponent(svgData)}`;
  const img = new Image();

  return new Promise((resolve, reject) => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(b => resolve(b), 'image/png');
    };
    img.onerror = () => reject(new Error('PNG render failed'));
    img.src = dataUrl;
  });
}

/**
 * Capture a DOM element as an SVG string (foreignObject wrapper).
 * @param {HTMLElement} el
 * @returns {string}
 */
function domToSvgString(el) {
  const { svg } = _buildExportSvg(el);
  return new XMLSerializer().serializeToString(svg);
}

function _downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

import { h } from '../core/dom.js';
import { icon } from '../core/icon.js';

export class DashboardGrid {
  /**
   * @param {HTMLElement} container
   * @param {{cols?: number, rowHeight?: number, gap?: number}} [options]
   */
  constructor(container, options = {}) {
    this.container = container;
    this.cols = options.cols ?? 12;
    this.rowHeight = options.rowHeight ?? 40;
    this.gap = options.gap ?? 12;

    this.onLayoutChange = null;
    this.onTileResized = null;
    this.onTileRemoved = null;
    this.onTitleChanged = null;

    /** @type {Map<string, {def: object, layout: {x:number,y:number,w:number,h:number}, el: HTMLElement, bodyEl: HTMLElement}>} */
    this._tiles = new Map();

    this.container.classList.add('dashboard-grid');
    this._cellWidth = 0;
    this._recalcCellWidth();

    this._ro = new ResizeObserver(() => {
      const prev = this._cellWidth;
      this._recalcCellWidth();
      if (prev !== this._cellWidth) this._repositionAll();
    });
    this._ro.observe(this.container);
  }

  // ─── Public API ────────────────────────────────────────────────

  /**
   * Replace the current tile set.
   * @param {Array<object>} tileDefs         - Tile definitions ({id, i18nTitle, minW, minH, defaultW, defaultH, title, removeLabel, moveTitle, resizeTitle})
   * @param {Array<{tileId:string,x:number,y:number,w:number,h:number}>} layout
   */
  setTiles(tileDefs, layout) {
    for (const { el } of this._tiles.values()) el.remove();
    this._tiles.clear();

    for (const item of layout) {
      const def = tileDefs.find(d => d.id === item.tileId);
      if (!def) continue;
      this._createTile(def, { x: item.x, y: item.y, w: item.w, h: item.h });
    }
    this._updateContainerHeight();
  }

  /**
   * Add a tile. Finds the first free grid spot that fits the tile's default size.
   * @param {object} def
   * @returns {boolean} true if the tile was added, false if it already exists
   *                   or no free spot was found.
   */
  addTile(def) {
    if (this._tiles.has(def.id)) return false;
    const w = def.defaultW ?? def.minW ?? 3;
    const gh = def.defaultH ?? def.minH ?? 3;
    const spot = this._findFreeSpot(w, gh);
    if (!spot) return false;
    this._createTile(def, { x: spot.x, y: spot.y, w, h: gh });
    this._updateContainerHeight();
    this._notifyChange();
    return true;
  }

  /**
   * Remove a tile from the grid.
   * @param {string} tileId
   */
  removeTile(tileId) {
    const entry = this._tiles.get(tileId);
    if (!entry) return;
    entry.el.remove();
    this._tiles.delete(tileId);
    this._updateContainerHeight();
    this.onTileRemoved?.(tileId);
    this._notifyChange();
  }

  /**
   * Return the body element of a tile for content rendering.
   * @param {string} tileId
   * @returns {HTMLElement|null}
   */
  getTileBody(tileId) {
    return this._tiles.get(tileId)?.bodyEl ?? null;
  }

  /**
   * Serialise the current layout.
   * @returns {Array<{tileId:string,x:number,y:number,w:number,h:number}>}
   */
  getLayout() {
    return Array.from(this._tiles.values()).map(t => ({
      tileId: t.def.id,
      x: t.layout.x, y: t.layout.y,
      w: t.layout.w, h: t.layout.h,
    }));
  }

  /** @returns {string[]} ids of all currently placed tiles */
  getPlacedTileIds() {
    return Array.from(this._tiles.keys());
  }

  // ─── Export ──────────────────────────────────────────────────────

  /**
   * Export a single tile as PNG download.
   * @param {string} tileId
   * @param {string} [filename]
   */
  async exportTileAsPng(tileId, filename) {
    const entry = this._tiles.get(tileId);
    if (!entry) return;
    try {
      const blob = await domToPngBlob(entry.el);
      _downloadBlob(blob, filename || `${tileId}.png`);
    } catch (e) { console.error('[DashboardGrid] PNG export failed:', e); }
  }

  /**
   * Export a single tile as SVG download.
   * @param {string} tileId
   * @param {string} [filename]
   */
  exportTileAsSvg(tileId, filename) {
    const entry = this._tiles.get(tileId);
    if (!entry) return;
    const svgStr = domToSvgString(entry.el);
    _downloadBlob(new Blob([svgStr], { type: 'image/svg+xml' }), filename || `${tileId}.svg`);
  }

  /**
   * Export the entire dashboard grid as PNG download.
   * @param {string} [filename]
   */
  async exportAllAsPng(filename = 'dashboard.png') {
    try {
      const blob = await domToPngBlob(this.container);
      _downloadBlob(blob, filename);
    } catch (e) { console.error('[DashboardGrid] Dashboard PNG export failed:', e); }
  }

  /**
   * Export the entire dashboard grid as SVG download.
   * @param {string} [filename]
   */
  exportAllAsSvg(filename = 'dashboard.svg') {
    const svgStr = domToSvgString(this.container);
    _downloadBlob(new Blob([svgStr], { type: 'image/svg+xml' }), filename || 'dashboard.svg');
  }

  /** Destroy the grid: removes all tiles and disconnects observers. */
  destroy() {
    this._ro?.disconnect();
    this._ro = null;
    for (const { el } of this._tiles.values()) el.remove();
    this._tiles.clear();
  }

  // ─── Internal: layout math ─────────────────────────────────────

  _recalcCellWidth() {
    const width = this.container.clientWidth;
    if (width <= 0) return;
    this._cellWidth = (width - (this.cols - 1) * this.gap) / this.cols;
  }

  _cellStrideX() { return this._cellWidth + this.gap; }
  _cellStrideY() { return this.rowHeight + this.gap; }

  _pxFromLayout(layout) {
    const sx = this._cellStrideX();
    const sy = this._cellStrideY();
    const left  = Math.round(layout.x * sx);
    const top   = Math.round(layout.y * sy);
    const right = Math.round((layout.x + layout.w) * sx - this.gap);
    const bottom = Math.round((layout.y + layout.h) * sy - this.gap);
    return { left, top, width: right - left, height: bottom - top };
  }

  _rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x
        && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  _hasCollision(candidate, excludeId) {
    if (candidate.x < 0 || candidate.y < 0) return true;
    if (candidate.x + candidate.w > this.cols) return true;
    for (const [id, t] of this._tiles) {
      if (id === excludeId) continue;
      if (this._rectsOverlap(candidate, t.layout)) return true;
    }
    return false;
  }

  _findFreeSpot(w, gh) {
    if (w > this.cols) return null;
    const maxRows = 60;
    for (let y = 0; y < maxRows; y++) {
      for (let x = 0; x <= this.cols - w; x++) {
        if (!this._hasCollision({ x, y, w, h: gh })) return { x, y };
      }
    }
    return { x: 0, y: 0 };
  }

  // ─── Internal: tile DOM ────────────────────────────────────────

  _createTile(def, layout) {
    const el = document.createElement('section');
    el.className = 'dashboard-grid__tile';
    el.dataset.tileId = def.id;
    el.replaceChildren(
      h('div', {
        class: 'dashboard-grid__tile-move',
        title: def.moveTitle || '',
        'aria-label': def.moveTitle || '',
      }, icon('action.drag-handle', { variant: 'muted' })),
      h('h3', { class: 'dashboard-grid__tile-title' }, def.title || ''),
      h('div', { class: 'dashboard-grid__tile-export' },
        h('button', {
          type: 'button',
          class: 'dashboard-grid__tile-export-btn',
          'data-export': 'png',
          title: 'PNG',
        }, icon('format.png', { size: 'sm' })),
        h('button', {
          type: 'button',
          class: 'dashboard-grid__tile-export-btn',
          'data-export': 'svg',
          title: 'SVG',
        }, icon('format.svg', { size: 'sm' })),
      ),
      h('button', {
        type: 'button',
        class: 'dashboard-grid__tile-remove',
        'aria-label': def.removeLabel || '',
        title: def.removeLabel || '',
      }, icon('action.close', { size: 'sm' })),
      h('div', { class: 'dashboard-grid__tile-body' }),
      h('div', {
        class: 'dashboard-grid__tile-resize',
        title: def.resizeTitle || '',
        'aria-label': def.resizeTitle || '',
      }, icon('action.resize', { variant: 'muted' })),
    );

    el.querySelector('.dashboard-grid__tile-remove')
      .addEventListener('click', (e) => { e.stopPropagation(); this.removeTile(def.id); });
    el.querySelector('.dashboard-grid__tile-move')
      .addEventListener('pointerdown', (e) => this._startInteraction(e, def.id, 'move'));
    el.querySelector('.dashboard-grid__tile-resize')
      .addEventListener('pointerdown', (e) => this._startInteraction(e, def.id, 'resize'));

    const titleEl = el.querySelector('.dashboard-grid__tile-title');
    titleEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this._startTitleEdit(def.id, titleEl);
    });

    el.querySelectorAll('[data-export]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fmt = btn.dataset.export;
        const slug = def.id.replace(/[^a-z0-9-]/gi, '_');
        if (fmt === 'png') this.exportTileAsPng(def.id, `${slug}.png`);
        else if (fmt === 'svg') this.exportTileAsSvg(def.id, `${slug}.svg`);
      });
    });

    this.container.appendChild(el);

    const entry = {
      def,
      layout: { ...layout },
      el,
      bodyEl: el.querySelector('.dashboard-grid__tile-body'),
    };
    this._tiles.set(def.id, entry);
    this._applyLayout(entry);
  }

  _applyLayout(entry) {
    const p = this._pxFromLayout(entry.layout);
    entry.el.style.left = `${p.left}px`;
    entry.el.style.top = `${p.top}px`;
    entry.el.style.width = `${p.width}px`;
    entry.el.style.height = `${p.height}px`;
  }

  _startTitleEdit(tileId, titleEl) {
    if (titleEl.querySelector('input')) return;
    const current = titleEl.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dashboard-grid__tile-title-input';
    input.value = current;

    const commit = () => {
      const val = input.value.trim();
      const newTitle = val || current;
      titleEl.textContent = newTitle;
      if (val && val !== current) {
        this.onTitleChanged?.(tileId, newTitle);
      }
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = current; input.blur(); }
    });

    titleEl.textContent = '';
    titleEl.appendChild(input);
    input.focus();
    input.select();
  }

  _repositionAll() {
    for (const entry of this._tiles.values()) this._applyLayout(entry);
    this._updateContainerHeight();
  }

  _updateContainerHeight() {
    let maxRow = 0;
    for (const t of this._tiles.values()) {
      maxRow = Math.max(maxRow, t.layout.y + t.layout.h);
    }
    const gh = maxRow > 0
      ? maxRow * this.rowHeight + (maxRow - 1) * this.gap + this.gap
      : 0;
    this.container.style.minHeight = `${gh}px`;
  }

  _notifyChange() {
    this.onLayoutChange?.(this.getLayout());
  }

  // ─── Internal: drag / resize interaction ───────────────────────

  _startInteraction(ev, tileId, mode) {
    if (ev.button !== 0) return;
    const entry = this._tiles.get(tileId);
    if (!entry) return;
    ev.preventDefault();
    ev.stopPropagation();

    const startPt = { x: ev.clientX, y: ev.clientY };
    const startLayout = { ...entry.layout };
    const startPx = this._pxFromLayout(startLayout);
    const strideX = this._cellStrideX();
    const strideY = this._cellStrideY();

    entry.el.classList.add(`dashboard-grid__tile--${mode}ing`);

    const pointerId = ev.pointerId;
    try { ev.target.setPointerCapture(pointerId); } catch (_) { /* ignore */ }

    const onMove = (e) => {
      const dx = e.clientX - startPt.x;
      const dy = e.clientY - startPt.y;

      if (mode === 'move') {
        let newX = Math.round((startPx.left + dx) / strideX);
        let newY = Math.round((startPx.top + dy) / strideY);
        newX = Math.max(0, Math.min(this.cols - entry.layout.w, newX));
        newY = Math.max(0, newY);
        if (newX === entry.layout.x && newY === entry.layout.y) return;

        const candidate = { ...entry.layout, x: newX, y: newY };
        if (!this._hasCollision(candidate, tileId)) {
          entry.layout = candidate;
          this._applyLayout(entry);
          this._updateContainerHeight();
        }
      } else {
        const minW = entry.def.minW ?? 1;
        const minH = entry.def.minH ?? 1;
        const maxW = this.cols - entry.layout.x;
        let newW = Math.round((startPx.width + dx + this.gap) / strideX);
        let newH = Math.round((startPx.height + dy + this.gap) / strideY);
        newW = Math.max(minW, Math.min(maxW, newW));
        newH = Math.max(minH, newH);
        if (newW === entry.layout.w && newH === entry.layout.h) return;

        const candidate = { ...entry.layout, w: newW, h: newH };
        if (!this._hasCollision(candidate, tileId)) {
          entry.layout = candidate;
          this._applyLayout(entry);
          this._updateContainerHeight();
          this.onTileResized?.(tileId, { ...entry.layout });
        }
      }
    };

    const onUp = () => {
      entry.el.classList.remove(`dashboard-grid__tile--${mode}ing`);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      this._recalcCellWidth();
      this._repositionAll();
      this._notifyChange();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }
}
