/**
 * chart-base.js — Abstract base class for all D.Mike chart types.
 * Handles: container setup, axes, grid, legend, title, zoom/pan,
 * tooltip, crosshair, modebar, PNG/SVG export, ResizeObserver, destroy.
 */

import {
  generateTicks, linearScale, formatNum,
  svgEl, svgText, resolveColor, createPattern, dashArray, drawMarker
} from './chart-core.js';

import { createModebar } from './modebar.js';
import {
  edSection, edCheckboxRow, edRangeRow, edSelectRow,
  edTitleSection, edFontSizeSection, edAxisLabelSection,
  edAxisTickSection, edRefLinesSection, edRefAreasSection,
  openColorPicker, edBgColorSection,
  edColorSwatch, edColorPair, edVisToggle,
  MARKER_SYMBOLS,
} from './chart-editor.js';
import { ensureXLSX as _ensureXLSX } from '../export-utils.js';
import { icon } from '../icon.js';
import { h } from '../dom.js';

/** Font families embedded in SVG for export fidelity */
const FONT_MAIN = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const FONT_MONO = "'SF Mono', 'Cascadia Code', Consolas, 'Liberation Mono', monospace";

/** Default margins */
const DEFAULT_MARGIN = { top: 48, right: 24, bottom: 58, left: 72 };
const LEGEND_WIDTH = 90;
// Gutter between the widest y-axis label and the plot area. Covers the largest
// offset any chart type draws its left labels at (base ticks sit at `pa.x - 10`)
// plus a little breathing room.
const Y_LABEL_PAD = 14;
const PROXIMITY_PX = 12;

/**
 * Debounce helper.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
function debounce(fn, ms) {
  let t;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}

export default class ChartBase {
  /**
   * @param {HTMLElement} container - DOM element to render into
   * @param {Object} config - Chart configuration
   * @param {Object} context - { i18n, theme, language }
   */
  constructor(container, config, context) {
    /** @type {Object} */
    this.config = Object.assign({
      title: '', xLabel: '', yLabel: '',
      showTitle: true, showXLabel: true, showYLabel: true,
      showXTicks: true, showYTicks: true, showLegend: true,
      showCrosshair: false,
      xMin: null, xMax: null, yMin: null, yMax: null,
      xDec: null, yDec: null,
      titleSize: 15, labelSize: 12, tickSize: 11,
      markerSize: 8,
      refLines: [], refAreas: [],
    }, config);

    /** @type {Object} */
    this.context = context || {};
    /** @type {string} */
    this.locale = (context && context.language) || 'de';

    /** @type {HTMLElement} */
    this.container = container;

    // Zoom / pan state
    /** @private */
    this._viewState = null;
    /** @private */
    this._interactionMode = 'zoom'; // 'zoom' | 'pan'
    /** @private */
    this._isPanning = false;
    /** @private */
    this._panStart = null;

    // Current scales (stored after render for crosshair / tooltip)
    /** @private */
    this._xScale = null;
    /** @private */
    this._yScale = null;
    /** @private */
    this._xScaleInv = null;
    /** @private */
    this._yScaleInv = null;
    /** @private */
    this._xTick = null;
    /** @private */
    this._yTick = null;
    /** @private */
    this._plotArea = null;
    /** @private */
    this._highlightGroup = null;

    // Build DOM
    this._buildDOM();
    this._setupInteractions();

    // ResizeObserver — debounced for regular resizes, but always fires when
    // size transitions from 0 to non-zero (handles display:none → visible).
    this._hasRendered = false;
    this._resizeObserver = new ResizeObserver(debounce(() => {
      const size = this._getSize();
      if (size.w > 0 && size.h > 0) this.render();
    }, 80));
    this._resizeObserver.observe(this._svgWrap);

    // Deferred initial render — gives the browser time to compute layout
    // for containers that were just made visible (display:none → visible).
    requestAnimationFrame(() => this.render());
  }

  // ── DOM Construction ─────────────────────────────────────────────

  /** @private */
  _buildDOM() {
    // Card — outer flex row (chart + editor side by side)
    this._card = document.createElement('div');
    this._card.className = 'dmike-chart-card';

    // Wrapper (chart area)
    this._wrap = document.createElement('div');
    this._wrap.className = 'dmike-chart-wrap';

    // SVG wrap
    this._svgWrap = document.createElement('div');
    this._svgWrap.className = 'dmike-chart-svg-wrap';

    // Modebar (shared utility)
    this._modebarInstance = createModebar({
      onZoom: () => {
        this._interactionMode = 'zoom';
        this._svgWrap.style.cursor = 'crosshair';
      },
      onPan: () => {
        this._interactionMode = 'pan';
        this._svgWrap.style.cursor = 'grab';
      },
      onReset: () => {
        this._viewState = null;
        this.render();
      },
      onExportPNG: () => this.exportPNG(),
      onExportSVG: () => this.exportSVG(),
      onExportCSV: () => this.exportCSV(),
      onExportXLSX: () => this.exportXLSX(),
      onEditorToggle: (open) => {
        this._editorOpen = open;
        this._editorPanel.classList.toggle('dmike-chart-editor--open', open);
        if (open) this._buildEditor();
        // Re-render after CSS transition (320ms)
        setTimeout(() => this.render(), 340);
        if (typeof this.config.onEditorToggle === 'function') {
          this.config.onEditorToggle(open, this._editorInner);
        }
      },
      onPopout: () => this._openPopout(),
    });

    // SVG
    this._svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this._svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    this._svgWrap.appendChild(this._svg);

    // Tooltip
    this._tooltip = document.createElement('div');
    this._tooltip.className = 'dmike-chart-tooltip';
    this._svgWrap.appendChild(this._tooltip);

    // Zoom selection rectangle
    this._zoomRect = document.createElement('div');
    this._zoomRect.className = 'dmike-chart-zoom-rect';
    this._svgWrap.appendChild(this._zoomRect);

    // Crosshair
    this._crosshair = document.createElement('div');
    this._crosshair.className = 'dmike-chart-crosshair';
    this._crosshair.style.display = 'none';
    this._crosshairH = document.createElement('div');
    this._crosshairH.className = 'dmike-chart-crosshair-h';
    this._crosshairV = document.createElement('div');
    this._crosshairV.className = 'dmike-chart-crosshair-v';
    this._crosshairLabel = document.createElement('div');
    this._crosshairLabel.className = 'dmike-chart-crosshair-label';
    this._crosshair.appendChild(this._crosshairH);
    this._crosshair.appendChild(this._crosshairV);
    this._crosshair.appendChild(this._crosshairLabel);
    this._svgWrap.appendChild(this._crosshair);

    // Editor panel (slide-out)
    this._editorPanel = document.createElement('div');
    this._editorPanel.className = 'dmike-chart-editor';
    this._editorInner = document.createElement('div');
    this._editorInner.className = 'dmike-chart-editor-inner';
    this._editorPanel.appendChild(this._editorInner);

    // Assemble: svgWrap first, then modebar LAST so it paints on top
    this._wrap.appendChild(this._svgWrap);
    this._wrap.appendChild(this._modebarInstance.el);
    this._card.appendChild(this._wrap);
    this._card.appendChild(this._editorPanel);
    this.container.appendChild(this._card);
  }

  // _buildModebar removed — now using shared createModebar() from modebar.js

  // ── Interactions ─────────────────────────────────────────────────

  /** @private */
  _setupInteractions() {
    // Modebar events are handled by createModebar() callbacks in _buildDOM().
    this._editorOpen = false;

    // Tooltip + Crosshair
    this._mouseMoveHandler = (e) => this._onMouseMove(e);
    this._mouseLeaveHandler = () => this._onMouseLeave();
    this._svgWrap.addEventListener('mousemove', this._mouseMoveHandler);
    this._svgWrap.addEventListener('mouseleave', this._mouseLeaveHandler);

    // Zoom (mousewheel)
    this._wheelHandler = (e) => this._onWheel(e);
    this._svgWrap.addEventListener('wheel', this._wheelHandler, { passive: false });

    // Pan (drag)
    this._mouseDownHandler = (e) => this._onMouseDown(e);
    this._globalMoveHandler = (e) => this._onGlobalMouseMove(e);
    this._globalUpHandler = (e) => this._onGlobalMouseUp(e);
    this._svgWrap.addEventListener('mousedown', this._mouseDownHandler);
    window.addEventListener('mousemove', this._globalMoveHandler);
    window.addEventListener('mouseup', this._globalUpHandler);
  }

  /**
   * Build or rebuild the standard editor panel contents.
   * @private
   */
  _buildEditor() {
    const inner = this._editorInner;
    inner.replaceChildren();

    const cfg = this.config;
    const t = (key) => {
      if (this.context && this.context.i18n) {
        const full = `chart.editor.${key}`;
        const val = this.context.i18n.t(full);
        if (val !== full) return val;
      }
      return key;
    };
    const onUpdate = () => {
      this.render();
      this._buildEditor();
    };

    // Title section
    inner.appendChild(edTitleSection(cfg, () => this.render(), t));

    // Legend toggle
    if (this._getLegendItems().length > 0 || (cfg.refLines && cfg.refLines.length) || (cfg.refAreas && cfg.refAreas.length)) {
      inner.appendChild(edCheckboxRow(t('showLegend'), cfg.showLegend !== false, (v) => { cfg.showLegend = v; onUpdate(); }));
    }

    // Font sizes
    inner.appendChild(edFontSizeSection(cfg, () => this.render(), t));

    // Axis labels
    inner.appendChild(edAxisLabelSection(cfg, () => this.render(), t));

    // Axis ticks (suppressed when both axes are categorical)
    const tickSec = edAxisTickSection(cfg, () => this.render(), t);
    if (tickSec) inner.appendChild(tickSec);

    // Background color
    inner.appendChild(edBgColorSection(cfg, (changes) => {
      Object.assign(cfg, changes);
      this.render();
    }, (e, color, cb) => {
      openColorPicker(e, color, cb);
    }, t));

    // Reference lines
    inner.appendChild(edRefLinesSection(cfg.refLines, {
      onUpdate,
      onOpenColorPicker: (e, color, cb) => openColorPicker(e, color, cb),
    }, t));

    // Reference areas
    inner.appendChild(edRefAreasSection(cfg.refAreas, {
      onUpdate,
      onOpenColorPicker: (e, color, cb) => openColorPicker(e, color, cb),
    }, t));

    // Series / groups section (built from chart-type descriptors)
    const descriptors = this._getSeriesDescriptors();
    this._seriesItemEls = [];
    const tm = (key) => {
      if (this.context && this.context.i18n) {
        const full = `chart.editor.marker.${key}`;
        const val = this.context.i18n.t(full);
        if (val !== full) return val;
      }
      return key;
    };
    if (descriptors.length >= 1) {
      const sec = edSection(t('series'));
      for (let di = 0; di < descriptors.length; di++) {
        const d = descriptors[di];
        const item = document.createElement('div');
        item.className = `dmike-chart-ed-series-item${d.isVisible() ? '' : ' hidden'}`;

        const header = document.createElement('div');
        header.className = 'dmike-chart-ed-series-header';

        const swatch = edColorSwatch(d.getColor(), (e) => {
          openColorPicker(e, d.getColor(), (c) => {
            d.setColor(c);
            swatch.style.background = c;
            this.render();
            if (typeof cfg.onSeriesChange === 'function') cfg.onSeriesChange(d.index, 'color', c);
          });
        });

        const nameInp = document.createElement('input');
        nameInp.value = d.getName();
        nameInp.addEventListener('change', () => {
          d.setName(nameInp.value);
          this.render();
          if (typeof cfg.onSeriesChange === 'function') cfg.onSeriesChange(d.index, 'name', nameInp.value);
        });

        const eyeBtn = edVisToggle(d.isVisible(), () => {
          d.setVisible(!d.isVisible());
          if (typeof cfg.onSeriesChange === 'function') cfg.onSeriesChange(d.index, 'visible', d.isVisible());
          onUpdate();
        });

        header.appendChild(swatch);
        header.appendChild(nameInp);
        header.appendChild(eyeBtn);
        item.appendChild(header);

        // Marker / appearance detail controls
        const details = document.createElement('div');
        details.className = 'dmike-chart-ed-series-details';

        if (typeof d.getSymbol === 'function') {
          details.appendChild(edSelectRow(tm('symbol'), MARKER_SYMBOLS, d.getSymbol() || 'circle', (v) => {
            d.setSymbol(v);
            this.render();
          }));
        }
        if (typeof d.getSize === 'function') {
          details.appendChild(edRangeRow(tm('size'), d.getSize() ?? 8, (v) => {
            d.setSize(v);
            this.render();
          }, 0, 24, 1));
        }
        // Fill color row (more detailed than the header swatch)
        {
          const fillCol = d.getColor();
          const { el: fillRow, swatch: fillSw } = edColorPair(tm('color'), fillCol, (e) => {
            openColorPicker(e, d.getColor(), (c) => {
              d.setColor(c);
              fillSw.style.background = c;
              swatch.style.background = c;
              this.render();
              if (typeof cfg.onSeriesChange === 'function') cfg.onSeriesChange(d.index, 'color', c);
            });
          });
          details.appendChild(fillRow);
        }
        if (typeof d.getStroke === 'function') {
          const strokeCol = d.getStroke();
          const { el: strokeRow, swatch: strokeSw } = edColorPair(tm('stroke'), strokeCol, (e) => {
            openColorPicker(e, d.getStroke(), (c) => {
              d.setStroke(c);
              strokeSw.style.background = c;
              this.render();
            });
          });
          details.appendChild(strokeRow);
        }
        if (typeof d.getStrokeWidth === 'function') {
          details.appendChild(edRangeRow(tm('strokeWidth'), d.getStrokeWidth() ?? 1, (v) => {
            d.setStrokeWidth(v);
            this.render();
          }, 0, 6, 0.5));
        }

        item.appendChild(details);
        sec.appendChild(item);
        this._seriesItemEls.push(item);
      }
      inner.appendChild(sec);
    }

    // Let chart types add their own editor sections
    if (typeof this._buildTypeEditor === 'function') {
      this._buildTypeEditor(inner, t, onUpdate);
    }

    // Let consumers add custom editor sections (receives seriesItemEls for appending details)
    if (typeof this.config.onEditorBuild === 'function') {
      this.config.onEditorBuild(inner, t, onUpdate, this._seriesItemEls);
    }
  }

  /**
   * Return series/group descriptors for the generic editor section.
   * Chart types override this to describe their series/groups.
   * @returns {Array<{index, getName, setName, getColor, setColor, isVisible, setVisible}>}
   */
  _getSeriesDescriptors() {
    return [];
  }

  /** @private */
  _updateModebar() {
    this._modebarInstance.setMode(this._interactionMode);
  }

  /** @private */
  _onMouseMove(e) {
    const rect = this._svgWrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const pa = this._plotArea;

    // Crosshair
    if (this.config.showCrosshair && pa && this._xScaleInv && this._yScaleInv) {
      const inPlot = mx >= pa.x && mx <= pa.x + pa.w && my >= pa.y && my <= pa.y + pa.h;
      if (inPlot) {
        this._crosshair.style.display = '';
        this._crosshairH.style.top = `${my  }px`;
        this._crosshairH.style.left = `${pa.x  }px`;
        this._crosshairH.style.width = `${pa.w  }px`;
        this._crosshairV.style.left = `${mx  }px`;
        this._crosshairV.style.top = `${pa.y  }px`;
        this._crosshairV.style.height = `${pa.h  }px`;
        const dataX = this._xScaleInv(mx);
        const dataY = this._yScaleInv(my);
        const xDec = this.config.xDec !== null ? this.config.xDec : 2;
        const yDec = this.config.yDec !== null ? this.config.yDec : 2;
        const xStr = typeof this.config.xTickFormat === 'function'
          ? this.config.xTickFormat(dataX) : formatNum(dataX, xDec, this.locale);
        this._crosshairLabel.textContent = `${xStr  }  |  ${  formatNum(dataY, yDec, this.locale)}`;
        let lblLeft = mx + 8;
        let lblTop = my + 8;
        if (lblLeft + 120 > pa.x + pa.w) lblLeft = mx - 128;
        if (lblTop + 20 > pa.y + pa.h) lblTop = my - 22;
        this._crosshairLabel.style.left = `${lblLeft  }px`;
        this._crosshairLabel.style.top = `${lblTop  }px`;
      } else {
        this._crosshair.style.display = 'none';
      }
    } else {
      this._crosshair.style.display = 'none';
    }

    // Clear highlights
    if (this._highlightGroup) this._highlightGroup.replaceChildren();

    // Tooltip: ask subclass for nearby points
    if (this._xScale && this._yScale && pa) {
      const dataX = this._xScaleInv ? this._xScaleInv(mx) : 0;
      const dataY = this._yScaleInv ? this._yScaleInv(my) : 0;
      const nearby = this._findNearby(dataX, dataY, PROXIMITY_PX);

      if (nearby && nearby.length > 0) {
        this._tooltip.replaceChildren();
        nearby.forEach((p, i) => {
          if (i > 0) this._tooltip.append(h('div', { class: 'dmike-chart-tip-sep' }));
          this._tooltip.append(p.node);
        });
        this._tooltip.classList.add('visible');
        this._tooltip.style.left = `${mx + 12  }px`;
        this._tooltip.style.top = `${my - 10  }px`;

        // Highlight rings
        if (this._highlightGroup) {
          nearby.forEach((pt) => {
            if (pt.px !== undefined && pt.py !== undefined) {
              svgEl('circle', {
                cx: pt.px, cy: pt.py, r: this.config.markerSize / 2 + 5,
                fill: 'none', stroke: pt.color || 'var(--color-accent)', 'stroke-width': 2, opacity: 0.5,
                'pointer-events': 'none'
              }, this._highlightGroup);
            }
          });
        }
      } else {
        // Check ref lines/areas via data-ref attributes
        const target = e.target;
        if (target.hasAttribute && target.hasAttribute('data-ref')) {
          const refLabel = target.getAttribute('data-ref-label');
          const refValue = target.getAttribute('data-ref-value');
          this._tooltip.replaceChildren(
            h('b', null, refLabel || ''),
            h('br'),
            document.createTextNode(refValue || ''),
          );
          this._tooltip.classList.add('visible');
          this._tooltip.style.left = `${mx + 12  }px`;
          this._tooltip.style.top = `${my - 10  }px`;
        } else {
          this._tooltip.classList.remove('visible');
        }
      }
    }
  }

  /** @private */
  _onMouseLeave() {
    this._tooltip.classList.remove('visible');
    this._crosshair.style.display = 'none';
    if (this._highlightGroup) this._highlightGroup.replaceChildren();
  }

  /** @private */
  _onWheel(e) {
    const pa = this._plotArea;
    if (!pa) return;
    const rect = this._svgWrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Only zoom when the cursor is inside the plot area (coordinate system).
    // Outside (axis labels, title, margins) → let the page scroll normally.
    if (mx < pa.x || mx > pa.x + pa.w || my < pa.y || my > pa.y + pa.h) return;

    e.preventDefault();
    const bounds = this._getAxisBounds();

    const fx = (mx - pa.x) / pa.w;
    const fy = (my - pa.y) / pa.h;

    const factor = e.deltaY > 0 ? 1.12 : 0.88;
    const xRange = bounds.xMax - bounds.xMin;
    const yRange = bounds.yMax - bounds.yMin;
    const newXRange = xRange * factor;
    const newYRange = yRange * factor;

    this._viewState = {
      xMin: bounds.xMin + (xRange - newXRange) * fx,
      xMax: bounds.xMax - (xRange - newXRange) * (1 - fx),
      yMin: bounds.yMin + (yRange - newYRange) * (1 - fy),
      yMax: bounds.yMax - (yRange - newYRange) * fy,
    };
    this.render();
  }

  /** @private */
  _onMouseDown(e) {
    if (e.button !== 0) return;
    const pa = this._plotArea;
    if (!pa) return;
    const rect = this._svgWrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (mx < pa.x || mx > pa.x + pa.w || my < pa.y || my > pa.y + pa.h) return;

    if (this._interactionMode === 'pan') {
      this._isPanning = true;
      this._panStart = { x: e.clientX, y: e.clientY, state: { ...this._getAxisBounds() } };
      this._svgWrap.style.cursor = 'grabbing';
    } else if (this._interactionMode === 'zoom') {
      this._isZoomDragging = true;
      this._zoomStart = { x: mx, y: my, clientX: e.clientX, clientY: e.clientY };
      this._zoomRect.style.display = 'none';
      e.preventDefault();
    }
  }

  /** @private */
  _onGlobalMouseMove(e) {
    // Pan drag
    if (this._isPanning && this._panStart) {
      const pa = this._plotArea;
      if (!pa) return;
      const dx = e.clientX - this._panStart.x;
      const dy = e.clientY - this._panStart.y;
      const ps = this._panStart.state;
      const xRange = ps.xMax - ps.xMin;
      const yRange = ps.yMax - ps.yMin;
      this._viewState = {
        xMin: ps.xMin - dx / pa.w * xRange,
        xMax: ps.xMax - dx / pa.w * xRange,
        yMin: ps.yMin + dy / pa.h * yRange,
        yMax: ps.yMax + dy / pa.h * yRange,
      };
      this.render();
      return;
    }

    // Zoom rubber-band
    if (this._isZoomDragging && this._zoomStart) {
      const pa = this._plotArea;
      if (!pa) return;
      const rect = this._svgWrap.getBoundingClientRect();
      const mx = Math.max(pa.x, Math.min(pa.x + pa.w, e.clientX - rect.left));
      const my = Math.max(pa.y, Math.min(pa.y + pa.h, e.clientY - rect.top));
      const sx = this._zoomStart.x;
      const sy = this._zoomStart.y;

      const left = Math.min(sx, mx);
      const top = Math.min(sy, my);
      const w = Math.abs(mx - sx);
      const rh = Math.abs(my - sy);

      if (w > 4 || rh > 4) {
        const zr = this._zoomRect;
        zr.style.display = 'block';
        zr.style.left = `${left  }px`;
        zr.style.top = `${top  }px`;
        zr.style.width = `${w  }px`;
        zr.style.height = `${rh  }px`;
      }
    }
  }

  /** @private */
  _onGlobalMouseUp(e) {
    // Zoom rubber-band release
    if (this._isZoomDragging && this._zoomStart) {
      this._zoomRect.style.display = 'none';
      const pa = this._plotArea;
      if (pa && this._xScaleInv && this._yScaleInv) {
        const rect = this._svgWrap.getBoundingClientRect();
        const mx = Math.max(pa.x, Math.min(pa.x + pa.w, e.clientX - rect.left));
        const my = Math.max(pa.y, Math.min(pa.y + pa.h, e.clientY - rect.top));
        const sx = this._zoomStart.x;
        const w = Math.abs(mx - sx);
        const dh = Math.abs(my - this._zoomStart.y);
        const draggedRight = mx > sx;

        if (w > 8 || dh > 8) {
          if (draggedRight) {
            // Left → right: zoom into selected area
            const x0 = Math.min(sx, mx);
            const x1 = Math.max(sx, mx);
            const y0 = Math.min(this._zoomStart.y, my);
            const y1 = Math.max(this._zoomStart.y, my);
            this._viewState = {
              xMin: this._xScaleInv(x0),
              xMax: this._xScaleInv(x1),
              yMin: this._yScaleInv(y1),
              yMax: this._yScaleInv(y0),
            };
          } else {
            // Right → left: reset zoom
            this._viewState = null;
          }
          this.render();
        }
      }
      this._isZoomDragging = false;
      this._zoomStart = null;
      return;
    }

    // Pan release
    this._isPanning = false;
    this._panStart = null;
    if (this._interactionMode === 'pan') this._svgWrap.style.cursor = 'grab';
  }

  // ── Axis Bounds ──────────────────────────────────────────────────

  /** @private */
  _getAxisBounds() {
    const ext = this._getDataExtent();
    let { xMin, xMax, yMin, yMax } = ext;

    // Include ref lines/areas
    (this.config.refLines || []).forEach((l) => {
      if (l.dir === 'h') { yMin = Math.min(yMin, l.value); yMax = Math.max(yMax, l.value); }
      else { xMin = Math.min(xMin, l.value); xMax = Math.max(xMax, l.value); }
    });
    (this.config.refAreas || []).forEach((a) => {
      if (a.dir === 'y') { yMin = Math.min(yMin, a.min); yMax = Math.max(yMax, a.max); }
      else { xMin = Math.min(xMin, a.min); xMax = Math.max(xMax, a.max); }
    });

    // Padding
    const xPad = (xMax - xMin) * 0.06 || 1;
    const yPad = (yMax - yMin) * 0.06 || 1;
    xMin -= xPad; xMax += xPad;
    yMin -= yPad; yMax += yPad;

    // User overrides
    if (this.config.xMin !== null) xMin = this.config.xMin;
    if (this.config.xMax !== null) xMax = this.config.xMax;
    if (this.config.yMin !== null) yMin = this.config.yMin;
    if (this.config.yMax !== null) yMax = this.config.yMax;

    // Zoom state
    if (this._viewState) {
      return { ...this._viewState };
    }

    return { xMin, xMax, yMin, yMax };
  }

  // ── Plot Area ────────────────────────────────────────────────────

  /** @private */
  _getSize() {
    if (!this._svgWrap) return { w: 0, h: 0 };
    const rect = this._svgWrap.getBoundingClientRect();
    // Round to whole pixels so viewBox matches rendered size exactly —
    // fractional viewBox dimensions cause sub-pixel scaling artifacts
    return { w: Math.round(rect.width), h: Math.round(rect.height) };
  }

  /**
   * Labels drawn in the left gutter (the y axis). The default is the numeric
   * y tick labels; chart types whose y axis is categorical override this so
   * the left margin can grow to fit their category names.
   *
   * Return ALL labels, including those of hidden series — same rationale as
   * `_measureLegendWidth`: toggling visibility must not shift the plot area.
   *
   * @protected
   * @returns {{ labels: string[], mono: boolean }} `mono` selects the font the
   *   labels are drawn in, so the measurement matches the rendering.
   */
  _getYAxisLabels() {
    if (this.config.showYTicks === false) return { labels: [], mono: true };
    const bounds = this._getAxisBounds();
    const { ticks } = generateTicks(bounds.yMin, bounds.yMax);
    return {
      labels: ticks.map((v) => formatNum(v, this.config.yDec, this.locale)),
      mono: true,
    };
  }

  /**
   * Measure the left margin needed for the y-axis labels, using an offscreen
   * Canvas (works before the SVG is laid out) — the mirror image of
   * `_measureLegendWidth` for the right side.
   *
   * Without this the margin is a constant while the labels are unbounded, so
   * anything wider than the constant is silently clipped by the
   * `overflow: hidden` on `.dmike-chart-svg-wrap`.
   *
   * @private
   * @returns {number} Required left margin in px (never below the default)
   */
  _measureLeftMargin() {
    const { labels, mono } = this._getYAxisLabels();
    if (!labels || labels.length === 0) return DEFAULT_MARGIN.left;

    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${this.config.tickSize || 11}px ${mono ? FONT_MONO : FONT_MAIN}`;

    let maxW = 0;
    for (const label of labels) {
      const w = ctx.measureText(String(label ?? '')).width;
      if (w > maxW) maxW = w;
    }

    return Math.max(DEFAULT_MARGIN.left, Math.ceil(maxW) + Y_LABEL_PAD);
  }

  /** @private */
  _getPlotArea() {
    const size = this._getSize();
    const lw = this._legendWidth || LEGEND_WIDTH;
    const rMargin = this.config.showLegend ? lw + 16 : DEFAULT_MARGIN.right;
    const lMargin = this._leftMargin || DEFAULT_MARGIN.left;
    return {
      x: lMargin,
      y: DEFAULT_MARGIN.top,
      w: size.w - lMargin - rMargin,
      h: size.h - DEFAULT_MARGIN.top - DEFAULT_MARGIN.bottom,
      totalW: size.w,
      totalH: size.h,
      rMargin,
    };
  }

  // ── Render ───────────────────────────────────────────────────────

  /**
   * Full re-render. Called on config change, resize, zoom, pan, theme change.
   */
  render() {
    const size = this._getSize();
    if (size.w <= 0 || size.h <= 0) return;

    const svg = this._svg;
    svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
    svg.setAttribute('width', size.w);
    svg.setAttribute('height', size.h);
    svg.replaceChildren();

    // Background color
    svg.style.background = this.config.bgColor || '';

    // Read theme colors at render time
    const styles = getComputedStyle(document.documentElement);
    const get = (prop) => styles.getPropertyValue(prop).trim();
    const gridColor = get('--color-border-secondary') || '#e8ebef';
    const axisColor = get('--color-border-primary') || '#c8cdd3';
    const textPrimary = get('--color-text-primary') || '#1a1a2e';
    const textSecondary = get('--color-text-secondary') || '#5a6270';
    const tickColor = textSecondary;

    // Embed style for font-family (survives export)
    const styleEl = svgEl('style', {}, svg);
    styleEl.textContent = `text { font-family: ${FONT_MAIN}; } .tick-label { font-family: ${FONT_MONO}; }`;

    // Measure legend width dynamically (all series incl. hidden, so toggling
    // visibility doesn't change the plot width).
    if (this.config.showLegend) {
      this._legendWidth = this._measureLegendWidth();
    }

    // Same for the left gutter: the y-axis labels decide how much room they
    // need. Cached here because `_getPlotArea()` also runs from the mouse
    // handlers, where re-measuring on every mousemove would be wasteful.
    this._leftMargin = this._measureLeftMargin();

    const pa = this._getPlotArea();
    const bounds = this._getAxisBounds();

    const xTick = generateTicks(bounds.xMin, bounds.xMax);
    const yTick = generateTicks(bounds.yMin, bounds.yMax);

    // Tick overrides — let callers pin specific x/y positions (e.g. one
    // tick per categorical level). Scale & bounds stay untouched; only the
    // visible tick set changes.
    if (Array.isArray(this.config.xTicks) && this.config.xTicks.length) {
      xTick.ticks = this.config.xTicks.slice();
    }
    if (Array.isArray(this.config.yTicks) && this.config.yTicks.length) {
      yTick.ticks = this.config.yTicks.slice();
    }

    const xScale = linearScale(xTick.min, xTick.max, pa.x, pa.x + pa.w);
    const yScale = linearScale(yTick.min, yTick.max, pa.y + pa.h, pa.y);

    // Store for interactions
    this._xScale = xScale;
    this._yScale = yScale;
    this._xScaleInv = linearScale(pa.x, pa.x + pa.w, xTick.min, xTick.max);
    this._yScaleInv = linearScale(pa.y + pa.h, pa.y, yTick.min, yTick.max);
    this._xTick = xTick;
    this._yTick = yTick;
    this._plotArea = pa;

    // Defs (clip path)
    const defs = svgEl('defs', {}, svg);
    const clipId = `plot-clip-${  this._uid}`;
    const clip = svgEl('clipPath', { id: clipId }, defs);
    svgEl('rect', { x: pa.x, y: pa.y, width: pa.w, height: pa.h }, clip);

    // Hatch patterns for ref areas
    (this.config.refAreas || []).forEach((area, i) => {
      if (area.pattern && area.pattern !== '') {
        createPattern(defs, `area-pat-${this._uid}-${i}`, area);
      }
    });

    // Reference areas (behind grid)
    const areaGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
    (this.config.refAreas || []).forEach((area, i) => {
      this._drawRefArea(areaGroup, area, i, xScale, yScale, pa);
    });

    // Grid lines — per-axis toggle. Two ways to suppress:
    //   1. `categoricalX/Y: true` (chart-type convenience default) — implies
    //      the axis labels are drawn by the chart type itself and a numeric
    //      grid behind them is misleading.
    //   2. `showXGrid/showYGrid: false` (explicit caller override, also
    //      surfaced as a checkbox in the standard editor).
    const gridGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
    if (this.config.categoricalX !== true && this.config.showXGrid !== false) {
      xTick.ticks.forEach((v) => {
        const x = Math.round(xScale(v)) + 0.5;
        svgEl('line', { x1: x, y1: pa.y, x2: x, y2: pa.y + pa.h, stroke: gridColor, 'stroke-width': 1 }, gridGroup);
      });
    }
    if (this.config.categoricalY !== true && this.config.showYGrid !== false) {
      yTick.ticks.forEach((v) => {
        const y = Math.round(yScale(v)) + 0.5;
        svgEl('line', { x1: pa.x, y1: y, x2: pa.x + pa.w, y2: y, stroke: gridColor, 'stroke-width': 1 }, gridGroup);
      });
    }

    // Reference lines
    const refLineGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
    (this.config.refLines || []).forEach((line) => {
      this._drawRefLine(refLineGroup, line, xScale, yScale, pa);
    });

    // Chart-type-specific data rendering
    const plotGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
    this._renderData(svg, plotGroup, xScale, yScale, xTick, yTick, pa, defs);

    // Highlight group (hover rings)
    this._highlightGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);

    // Axes frame
    svgEl('rect', {
      x: pa.x, y: pa.y, width: pa.w, height: pa.h,
      fill: 'none', stroke: axisColor, 'stroke-width': 1
    }, svg);

    // X-Axis ticks & labels
    if (this.config.showXTicks !== false) {
      xTick.ticks.forEach((v) => {
        const x = xScale(v);
        svgEl('line', { x1: x, y1: pa.y + pa.h, x2: x, y2: pa.y + pa.h + 5, stroke: tickColor, 'stroke-width': 1 }, svg);
        const label = typeof this.config.xTickFormat === 'function'
          ? this.config.xTickFormat(v) : formatNum(v, this.config.xDec, this.locale);
        svgText(label, {
          x, y: pa.y + pa.h + 18,
          'text-anchor': 'middle', 'font-size': `${this.config.tickSize  }px`, fill: tickColor,
          'font-family': FONT_MONO, class: 'tick-label'
        }, svg);
      });
    }

    // Y-Axis ticks & labels
    if (this.config.showYTicks !== false) {
      yTick.ticks.forEach((v) => {
        const y = yScale(v);
        svgEl('line', { x1: pa.x - 5, y1: y, x2: pa.x, y2: y, stroke: tickColor, 'stroke-width': 1 }, svg);
        svgText(formatNum(v, this.config.yDec, this.locale), {
          x: pa.x - 10, y: y + 4,
          'text-anchor': 'end', 'font-size': `${this.config.tickSize  }px`, fill: tickColor,
          'font-family': FONT_MONO, class: 'tick-label'
        }, svg);
      });
    }

    // Title
    if (this.config.showTitle !== false && this.config.title) {
      svgText(this.config.title, {
        x: pa.x + pa.w / 2, y: 26,
        'text-anchor': 'middle', 'font-size': `${this.config.titleSize  }px`, 'font-weight': '700', fill: textPrimary,
        'font-family': FONT_MAIN
      }, svg);
    }

    // X Label
    if (this.config.showXLabel !== false && this.config.xLabel) {
      svgText(this.config.xLabel, {
        x: pa.x + pa.w / 2, y: pa.y + pa.h + 46,
        'text-anchor': 'middle', 'font-size': `${this.config.labelSize  }px`, 'font-weight': '600', fill: textPrimary,
        'font-family': FONT_MAIN
      }, svg);
    }

    // Y Label
    if (this.config.showYLabel !== false && this.config.yLabel) {
      svgText(this.config.yLabel, {
        x: 18, y: pa.y + pa.h / 2,
        'text-anchor': 'middle', 'font-size': `${this.config.labelSize  }px`, 'font-weight': '600', fill: textPrimary,
        'font-family': FONT_MAIN,
        transform: `rotate(-90, 18, ${pa.y + pa.h / 2})`
      }, svg);
    }

    // Legend
    if (this.config.showLegend) {
      this._drawLegend(svg, pa, size, textSecondary);
    }
  }

  // ── Reference Lines ──────────────────────────────────────────────

  /** @private */
  _drawRefLine(parent, line, xScale, yScale, pa) {
    let attrs;
    if (line.dir === 'h') {
      const y = yScale(line.value);
      attrs = { x1: pa.x, y1: y, x2: pa.x + pa.w, y2: y };
    } else {
      const x = xScale(line.value);
      attrs = { x1: x, y1: pa.y, x2: x, y2: pa.y + pa.h };
    }
    // Invisible hit area
    svgEl('line', {
      ...attrs, stroke: 'transparent', 'stroke-width': Math.max(12, (line.width || 1.5) + 10),
      'data-ref': 'line',
      'data-ref-label': line.label || (`${line.dir === 'h' ? 'Y' : 'X'  } = ${  line.value}`),
      'data-ref-value': `${line.dir === 'h' ? 'Y' : 'X'  } = ${  line.value}`,
      style: 'cursor:pointer'
    }, parent);

    const lineAttrs = { ...attrs, stroke: resolveColor(line.color), 'stroke-width': line.width || 1.5, 'pointer-events': 'none' };
    const da = dashArray(line.dash, line.width);
    if (da !== 'none') lineAttrs['stroke-dasharray'] = da;
    svgEl('line', lineAttrs, parent);

    // Static label (e.g. for spec limits — always-visible USL/LSL/Target markers).
    // Vertical lines: label above the top edge, centered on x. Horizontal lines:
    // label inside the plot at the left edge, just above the line.
    if (line.showLabel && line.label) {
      const labelColor = resolveColor(line.color);
      if (line.dir === 'h') {
        svgEl('text', {
          x: pa.x + 4, y: yScale(line.value) - 3,
          'text-anchor': 'start', 'font-size': '10px', 'font-weight': '600',
          fill: labelColor, 'pointer-events': 'none',
        }, parent).textContent = line.label;
      } else {
        svgEl('text', {
          x: xScale(line.value), y: pa.y - 4,
          'text-anchor': 'middle', 'font-size': '10px', 'font-weight': '600',
          fill: labelColor, 'pointer-events': 'none',
        }, parent).textContent = line.label;
      }
    }
  }

  // ── Reference Areas ──────────────────────────────────────────────

  /** @private */
  _drawRefArea(parent, area, idx, xScale, yScale, pa) {
    let x, y, w, rh;
    if (area.dir === 'y') {
      x = pa.x; w = pa.w;
      y = yScale(area.max);
      rh = yScale(area.min) - y;
    } else {
      y = pa.y; rh = pa.h;
      x = xScale(area.min);
      w = xScale(area.max) - x;
    }
    // Background fill
    svgEl('rect', { x, y, width: w, height: rh, fill: resolveColor(area.color) }, parent);
    // Pattern overlay
    if (area.pattern) {
      svgEl('rect', { x, y, width: w, height: rh, fill: `url(#area-pat-${this._uid}-${idx})` }, parent);
    }
    // Hit area
    svgEl('rect', {
      x, y, width: w, height: rh, fill: 'transparent',
      'data-ref': 'area',
      'data-ref-label': area.label || 'Bereich',
      'data-ref-value': `${area.dir === 'y' ? 'Y' : 'X'  }: ${  area.min  } – ${  area.max}`,
      style: 'cursor:pointer'
    }, parent);
  }

  // ── Legend ────────────────────────────────────────────────────────

  /**
   * Collect ALL legend labels — including hidden series — so that the
   * measured width stays stable when the user toggles visibility.
   * Subclasses can override for chart-type-specific logic.
   * @returns {string[]}
   */
  _getAllLegendLabels() {
    const labels = [];
    // series (scatter, xy-plot)
    (this.config.series || []).forEach(s => {
      labels.push(s.name || 'Series');
    });
    // groups (boxplot, bar)
    (this.config.groups || []).forEach((g, i) => {
      labels.push(g.name || `Group ${i + 1}`);
    });
    // If no series/groups found, fall back to _getLegendItems() which is
    // chart-type-aware (histogram, probability-plot, pareto, etc.)
    if (labels.length === 0) {
      this._getLegendItems().forEach(item => {
        if (item.label) labels.push(item.label);
      });
    }
    // ref lines + ref areas
    (this.config.refLines || []).forEach(l => {
      labels.push(l.label || (l.dir === 'h' ? 'Y=' : 'X=') + l.value);
    });
    (this.config.refAreas || []).forEach(a => {
      labels.push(a.label || 'Bereich');
    });
    return labels;
  }

  /**
   * Measure the pixel width needed for the legend using an offscreen
   * Canvas context (works even when the SVG is not yet laid out).
   * Uses ALL labels (incl. hidden series) for stable width.
   * @returns {number} Required legend width (icon + gap + text)
   */
  _measureLegendWidth() {
    const labels = this._getAllLegendLabels();
    if (labels.length === 0) return LEGEND_WIDTH;

    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `11px ${FONT_MAIN}`;

    let maxW = 0;
    for (const label of labels) {
      const w = ctx.measureText(label).width;
      if (w > maxW) maxW = w;
    }

    // icon (14px) + gap (6px) + text + small padding
    return Math.max(LEGEND_WIDTH, Math.ceil(maxW) + 26);
  }

  /** @private */
  _drawLegend(svg, pa, size, textColor) {
    const items = this._getLegendItems();

    // Add ref line items
    (this.config.refLines || []).forEach((l) => {
      items.push({
        type: 'line', color: resolveColor(l.color), dash: l.dash, width: l.width,
        label: l.label || (l.dir === 'h' ? 'Y=' : 'X=') + l.value
      });
    });
    // Add ref area items
    (this.config.refAreas || []).forEach((a) => {
      items.push({ type: 'rect', color: resolveColor(a.color), label: a.label || 'Bereich' });
    });

    const lx = pa.x + pa.w + 12;
    const ly = pa.y + 4;
    const lineH = 22;

    items.forEach((item, i) => {
      const y = ly + i * lineH;
      if (item.type === 'marker') {
        drawMarker(svg, item.symbol || 'circle', lx + 6, y + 7, 5,
          resolveColor(item.color), resolveColor(item.stroke || 'rgba(255,255,255,1)'),
          item.strokeWidth !== undefined ? item.strokeWidth : 1.5, {});
      } else if (item.type === 'line') {
        const lineAttrs = {
          x1: lx, y1: y + 7, x2: lx + 14, y2: y + 7,
          stroke: resolveColor(item.color), 'stroke-width': item.width || 1.5
        };
        const da = dashArray(item.dash, item.width);
        if (da !== 'none') lineAttrs['stroke-dasharray'] = da;
        svgEl('line', lineAttrs, svg);
      } else {
        svgEl('rect', { x: lx, y: y + 1, width: 14, height: 12, fill: resolveColor(item.color), rx: 2 }, svg);
      }
      svgText(item.label, {
        x: lx + 20, y: y + 11,
        'font-size': '11px', fill: textColor,
        'font-family': FONT_MAIN
      }, svg);
    });
  }

  // ── Export ────────────────────────────────────────────────────────

  /** @private */
  _getFileName() {
    return (this.config.title || 'chart').replace(/[^a-zA-Z0-9_\-äöüÄÖÜß]/g, '_');
  }

  /**
   * Export chart as PNG (2× resolution).
   */
  async exportPNG() {
    const size = this._getSize();
    const svgData = new XMLSerializer().serializeToString(this._svg);
    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = size.w * scale;
    canvas.height = size.h * scale;
    const ctx = canvas.getContext('2d');

    // Background
    const bgColor = this.config.bgColor
      ? resolveColor(this.config.bgColor)
      : getComputedStyle(document.documentElement).getPropertyValue('--color-bg-primary').trim() || '#ffffff';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    return new Promise((resolve) => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const a = document.createElement('a');
        a.download = `${this._getFileName()  }.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        resolve();
      };
      img.src = `data:image/svg+xml;base64,${  btoa(unescape(encodeURIComponent(svgData)))}`;
    });
  }

  /**
   * Export chart as SVG file.
   */
  async exportSVG() {
    const clone = this._svg.cloneNode(true);
    // Add background rect
    const bgColor = this.config.bgColor
      ? resolveColor(this.config.bgColor)
      : getComputedStyle(document.documentElement).getPropertyValue('--color-bg-primary').trim() || '#ffffff';
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', bgColor);
    clone.insertBefore(bg, clone.firstChild);
    // Remove hit-area elements
    clone.querySelectorAll('[data-ref]').forEach((el) => {
      if (el.getAttribute('stroke') === 'transparent' || el.getAttribute('fill') === 'transparent') {
        el.remove();
      }
    });
    const svgData = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const a = document.createElement('a');
    a.download = `${this._getFileName()  }.svg`;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Data Export (CSV / XLSX) ──────────────────────────────────────

  /**
   * Extract chart data as { headers: string[], rows: any[][] }.
   * Handles scatter (series with x/y), histogram (raw data), and pareto (items).
   * Subclasses may override for custom data layouts.
   * @returns {{ headers: string[], rows: any[][] }}
   */
  _getExportData() {
    const cfg = this.config;

    // ── Scatter / multi-series (x, y arrays) ──
    if (Array.isArray(cfg.series) && cfg.series.length > 0) {
      const series = cfg.series.filter(s => s.visible !== false);
      // Build interleaved columns: Series1 X, Series1 Y, Series2 X, …
      const headers = [];
      series.forEach(s => {
        const name = s.name || 'Series';
        headers.push(`${name  } X`, `${name  } Y`);
      });
      const maxLen = Math.max(0, ...series.map(s => Math.max(s.x?.length || 0, s.y?.length || 0)));
      const rows = [];
      for (let i = 0; i < maxLen; i++) {
        const row = [];
        series.forEach(s => {
          row.push(s.x?.[i] ?? null, s.y?.[i] ?? null);
        });
        rows.push(row);
      }
      return { headers, rows };
    }

    // ── Histogram (flat data array) ──
    if (Array.isArray(cfg.data) && cfg.data.length > 0) {
      const label = cfg.xLabel || cfg.title || 'Value';
      return {
        headers: [label],
        rows: cfg.data.map(v => [v]),
      };
    }

    // ── Pareto (items with name/value) ──
    if (Array.isArray(cfg.items) && cfg.items.length > 0) {
      return {
        headers: ['Category', 'Value'],
        rows: cfg.items.map(item => [item.name, item.value]),
      };
    }

    return { headers: [], rows: [] };
  }

  /**
   * Export chart data as CSV file download.
   */
  exportCSV() {
    const { headers, rows } = this._getExportData();
    if (headers.length === 0) return;

    const escapeCSV = (v) => {
      if (v == null) return '';
      const s = String(v);
      if (s.includes(';') || s.includes('"') || s.includes('\n')) {
        return `"${  s.replace(/"/g, '""')  }"`;
      }
      return s;
    };

    const lines = [headers.map(escapeCSV).join(';')];
    for (const row of rows) {
      lines.push(row.map(escapeCSV).join(';'));
    }
    const blob = new Blob([`\ufeff${  lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.download = `${this._getFileName()  }.csv`;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /**
   * Export chart data as XLSX file download. Lazy-loads SheetJS on first call.
   */
  async exportXLSX() {
    await _ensureXLSX();

    const { headers, rows } = this._getExportData();
    if (headers.length === 0) return;

    const wb = XLSX.utils.book_new();
    const aoa = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${this._getFileName()  }.xlsx`);
  }

  // ── Popout ──────────────────────────────────────────────────────

  _openPopout() {
    if (!this._svg) return;
    if (this._popoutOpen) return;
    this._popoutOpen = true;

    // ── Save originals ──
    const origSvg = this._svg;
    const origWrap = this._svgWrap;
    const origUid = this.__uid;

    // ── Overlay ──
    const overlay = document.createElement('div');
    overlay.className = 'dmike-chart-popout-overlay';

    const win = document.createElement('div');
    // The maximized window sizes itself (viewport-relative) and carries the
    // resize handle; the chart below just fills it. See the
    // `--maximized` rule in chart.css — no inline sizing here, or the
    // render box and the shell fight each other and the chart gets clipped.
    win.className = 'dmike-chart-popout dmike-chart-popout--maximized';

    // ── Title bar ──
    const titleBar = document.createElement('div');
    titleBar.className = 'dmike-chart-popout-titlebar';
    const titleText = document.createElement('span');
    titleText.textContent = this.config.title || 'Chart';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dmike-chart-popout-close';
    closeBtn.replaceChildren(icon('close'));
    titleBar.appendChild(titleText);
    titleBar.appendChild(closeBtn);
    win.appendChild(titleBar);

    // ── Body — mirrors chart-card structure ──
    const body = document.createElement('div');
    body.className = 'dmike-chart-popout-body';

    const card = document.createElement('div');
    card.className = 'dmike-chart-card';
    // No inline sizing: the card fills the window's body (base .dmike-chart-card
    // is width/height 100%), so the ResizeObserver below re-renders the chart
    // whenever the user drags the window's resize corner.

    const wrap = document.createElement('div');
    wrap.className = 'dmike-chart-wrap';

    const svgWrap = document.createElement('div');
    svgWrap.className = 'dmike-chart-svg-wrap';

    const popSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    popSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgWrap.appendChild(popSvg);

    // Move tooltip, zoom-rect + crosshair into popout
    svgWrap.appendChild(this._tooltip);
    svgWrap.appendChild(this._zoomRect);
    svgWrap.appendChild(this._crosshair);

    wrap.appendChild(svgWrap);

    // Modebar inside popout (no nested popout button)
    const popModebar = createModebar({
      onZoom: () => { this._interactionMode = 'zoom'; svgWrap.style.cursor = 'crosshair'; },
      onPan: () => { this._interactionMode = 'pan'; svgWrap.style.cursor = 'grab'; },
      onReset: () => { this._viewState = null; this.render(); },
      onExportPNG: () => this.exportPNG(),
      onExportSVG: () => this.exportSVG(),
      onExportCSV: () => this.exportCSV(),
      onExportXLSX: () => this.exportXLSX(),
      onEditorToggle: (open) => {
        this._editorOpen = open;
        this._editorPanel.classList.toggle('dmike-chart-editor--open', open);
        if (open) this._buildEditor();
        setTimeout(() => this.render(), 340);
        if (typeof this.config.onEditorToggle === 'function') {
          this.config.onEditorToggle(open, this._editorInner);
        }
      },
    });
    popModebar.setMode(this._interactionMode);
    wrap.appendChild(popModebar.el);

    // Move editor panel into popout
    card.appendChild(wrap);
    card.appendChild(this._editorPanel);
    body.appendChild(card);
    win.appendChild(body);
    overlay.appendChild(win);
    document.body.appendChild(overlay);

    // ── Remove mouse handlers from original svgWrap ──
    origWrap.removeEventListener('mousemove', this._mouseMoveHandler);
    origWrap.removeEventListener('mouseleave', this._mouseLeaveHandler);
    origWrap.removeEventListener('wheel', this._wheelHandler);
    origWrap.removeEventListener('mousedown', this._mouseDownHandler);

    // ── Swap rendering target ──
    this.__uid = `${origUid  }-pop`;
    this._svg = popSvg;
    this._svgWrap = svgWrap;

    // Add mouse handlers to popout svgWrap
    svgWrap.addEventListener('mousemove', this._mouseMoveHandler);
    svgWrap.addEventListener('mouseleave', this._mouseLeaveHandler);
    svgWrap.addEventListener('wheel', this._wheelHandler, { passive: false });
    svgWrap.addEventListener('mousedown', this._mouseDownHandler);

    // ── ResizeObserver ──
    const ro = new ResizeObserver(debounce(() => this.render(), 80));
    ro.observe(svgWrap);

    this._viewState = null;
    requestAnimationFrame(() => this.render());

    // ── Drag title bar ──
    let dragX = 0, dragY = 0, isDragging = false;
    const onDragStart = (e) => {
      if (closeBtn.contains(e.target)) return;
      isDragging = true;
      dragX = e.clientX - win.offsetLeft;
      dragY = e.clientY - win.offsetTop;
      win.style.transition = 'none';
    };
    const onDragMove = (e) => {
      if (!isDragging) return;
      win.style.left = `${e.clientX - dragX  }px`;
      win.style.top = `${e.clientY - dragY  }px`;
    };
    const onDragEnd = () => { isDragging = false; win.style.transition = ''; };
    titleBar.addEventListener('mousedown', onDragStart);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);

    // ── Close ──
    const onKeyDown = (e) => { if (e.key === 'Escape') close(); };
    const close = () => {
      // Remove handlers from popout
      svgWrap.removeEventListener('mousemove', this._mouseMoveHandler);
      svgWrap.removeEventListener('mouseleave', this._mouseLeaveHandler);
      svgWrap.removeEventListener('wheel', this._wheelHandler);
      svgWrap.removeEventListener('mousedown', this._mouseDownHandler);

      // Restore originals
      this.__uid = origUid;
      this._svg = origSvg;
      this._svgWrap = origWrap;

      // Move tooltip, zoom-rect + crosshair back
      origWrap.appendChild(this._tooltip);
      origWrap.appendChild(this._zoomRect);
      origWrap.appendChild(this._crosshair);

      // Move editor panel back and close it
      this._card.appendChild(this._editorPanel);
      if (this._editorOpen) {
        this._editorOpen = false;
        this._editorPanel.classList.remove('dmike-chart-editor--open');
        this._modebarInstance.setEditorOpen(false);
      }

      // Re-add handlers to original
      origWrap.addEventListener('mousemove', this._mouseMoveHandler);
      origWrap.addEventListener('mouseleave', this._mouseLeaveHandler);
      origWrap.addEventListener('wheel', this._wheelHandler, { passive: false });
      origWrap.addEventListener('mousedown', this._mouseDownHandler);

      // Cleanup
      ro.disconnect();
      popModebar.destroy();
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('keydown', onKeyDown);
      overlay.remove();

      this._popoutOpen = false;
      this._viewState = null;
      this.render();
    };

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    window.addEventListener('keydown', onKeyDown);
  }

  // ── Update / Destroy ─────────────────────────────────────────────

  /**
   * Merge new config values and re-render.
   * @param {Object} configPatch
   */
  update(configPatch) {
    Object.assign(this.config, configPatch);
    this.render();
  }

  /**
   * Clean up: disconnect ResizeObserver, remove DOM, release references.
   */
  destroy() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._modebarInstance) {
      this._modebarInstance.destroy();
      this._modebarInstance = null;
    }
    this._svgWrap.removeEventListener('mousemove', this._mouseMoveHandler);
    this._svgWrap.removeEventListener('mouseleave', this._mouseLeaveHandler);
    this._svgWrap.removeEventListener('wheel', this._wheelHandler);
    this._svgWrap.removeEventListener('mousedown', this._mouseDownHandler);
    window.removeEventListener('mousemove', this._globalMoveHandler);
    window.removeEventListener('mouseup', this._globalUpHandler);

    const root = this._card || this._wrap;
    if (root && root.parentNode) {
      root.parentNode.removeChild(root);
    }
    this._svg = null;
    this._wrap = null;
    this._svgWrap = null;
  }

  // ── Abstract Methods ─────────────────────────────────────────────
  // Subclasses MUST implement these.

  /**
   * Return the data extent for auto-scaling.
   * @abstract
   * @returns {{ xMin: number, xMax: number, yMin: number, yMax: number }}
   */
  _getDataExtent() {
    return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  }

  /**
   * Render chart-type-specific content.
   * @abstract
   */
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, plotArea, defs) {} // eslint-disable-line no-unused-vars

  /**
   * Return legend items.
   * @abstract
   * @returns {Array}
   */
  _getLegendItems() {
    return [];
  }

  /**
   * Find data points near the mouse for tooltips.
   * @abstract
   * @returns {Array<{ html: string, px: number, py: number, color: string }>}
   */
  _findNearby(dataX, dataY, proximityPx) { // eslint-disable-line no-unused-vars
    return [];
  }
}

// Unique ID counter for clip paths
let _uidCounter = 0;
Object.defineProperty(ChartBase.prototype, '_uid', {
  get() {
    if (!this.__uid) this.__uid = ++_uidCounter;
    return this.__uid;
  }
});
