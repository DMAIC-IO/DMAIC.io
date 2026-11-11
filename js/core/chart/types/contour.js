/**
 * contour.js — Contour plot of a sampled surface z(x, y).
 *
 * The surface is drawn as a raster image (one pixel per grid point) below
 * grid lines, reference areas and reference lines; contour lines, their
 * labels and optional measured points are drawn on top. Fill and line
 * colours come from a sequential scheme (see core/chart/color-schemes.js).
 * Grid cells with `null` or non-finite values stay empty.
 *
 * Config:
 *   grid: (number|null)[][]    — grid[j][i]; row 0 lies at yRange[1], column 0 at xRange[0]
 *   xRange: [min, max]         — x span of the grid (also the exact x axis)
 *   yRange: [min, max]         — y span of the grid (also the exact y axis)
 *   zLabel: ''                 — name of z in the tooltip
 *   points: [{ x, y, z }]      — measured points, drawn with showDataPoints
 *   colorScheme: 'viridis'     — viridis / plasma / thermal / green / grayscale
 *   numLevels: 10              — number of contour levels
 *   gridRes: 100               — grid resolution (consumed by the caller that samples the grid)
 *   showLines: true            — draw contour lines
 *   showLabels: true           — label each contour line once
 *   showDataPoints: false      — draw `points`
 *   markerSymbol / markerSize / markerColor / markerStroke /
 *   markerStrokeWidth / markerStrokeDash — styling of the measured points
 */

import ChartBase from '../chart-base.js';
import { h } from '../../dom.js';
import { svgEl, drawMarker, dashArray, resolveColor, formatNum } from '../chart-core.js';
import { edSection, edCheckboxRow, edRangeRow, edSelectRow, edMarkerSection } from '../chart-editor.js';
import { getColor } from '../color-schemes.js';
import {
  contourLevels, contourSegments, labelSegment, bilinear, rasterRGBA, lineColor,
} from '../contour-geometry.js';
import { CONTOUR_DEFAULTS } from '../contour-defaults.js';

const DASH_STYLES = ['solid', 'dash', 'dot', 'dashdot', 'longdash'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const validRange = (r) => Array.isArray(r) && isNum(r[0]) && isNum(r[1]) && r[1] > r[0];
const fix = (v) => Math.round(v * 100) / 100;

export default class ContourChart extends ChartBase {
  /** Base editor keys plus this type's own editor settings. */
  static editorKeys = [
    ...ChartBase.editorKeys, 'colorScheme', 'numLevels', 'gridRes', 'showLines', 'showLabels',
    'showDataPoints', 'markerSymbol', 'markerSize', 'markerColor', 'markerStroke',
    'markerStrokeWidth', 'markerStrokeDash',
  ];

  /**
   * @param {HTMLElement} container
   * @param {Object} config
   * @param {Object} context
   */
  constructor(container, config, context) {
    const cfg = config || {};
    const xRange = cfg.xRange || [0, 1];
    const yRange = cfg.yRange || [0, 1];
    const defaults = {
      ...CONTOUR_DEFAULTS,
      grid: [],
      xRange,
      yRange,
      zLabel: '',
      points: [],
      showLegend: false,
      xExact: true,
      yExact: true,
      xMin: xRange[0], xMax: xRange[1],
      yMin: yRange[0], yMax: yRange[1],
    };
    super(container, Object.assign(defaults, cfg), context);
  }

  /**
   * @override — a new xRange / yRange moves the axes along unless the patch
   * sets the bounds itself.
   */
  update(configPatch) {
    const patch = { ...configPatch };
    if (Array.isArray(patch.xRange)) {
      patch.xMin ??= patch.xRange[0];
      patch.xMax ??= patch.xRange[1];
    }
    if (Array.isArray(patch.yRange)) {
      patch.yMin ??= patch.yRange[0];
      patch.yMax ??= patch.yRange[1];
    }
    super.update(patch);
  }

  /** @override */
  _getDataExtent() {
    const { xRange, yRange } = this.config;
    const [xMin, xMax] = validRange(xRange) ? xRange : [0, 1];
    const [yMin, yMax] = validRange(yRange) ? yRange : [0, 1];
    return { xMin, xMax, yMin, yMax };
  }

  /**
   * The drawable surface: grid, its size and the z span of its finite values.
   * @returns {{grid: Array<Array<number|null>>, rows: number, cols: number, zMin: number, zMax: number}|null}
   * @private
   */
  _surface() {
    const { grid, xRange, yRange } = this.config;
    if (!Array.isArray(grid) || !validRange(xRange) || !validRange(yRange)) return null;
    const rows = grid.length;
    const cols = rows ? (grid[0]?.length ?? 0) : 0;
    if (rows < 2 || cols < 2 || grid.some((r) => !Array.isArray(r) || r.length !== cols)) return null;
    let zMin = Infinity, zMax = -Infinity;
    for (const row of grid) {
      for (const z of row) {
        if (!isNum(z)) continue;
        if (z < zMin) zMin = z;
        if (z > zMax) zMax = z;
      }
    }
    if (!isNum(zMin)) return null;
    return { grid, rows, cols, zMin, zMax };
  }

  /**
   * Pixel position of a grid coordinate (gx along columns, gy along rows).
   * @private
   */
  _gridToPx(s, xScale, yScale) {
    const [x0, x1] = this.config.xRange;
    const [y0, y1] = this.config.yRange;
    return {
      px: (gx) => xScale(x0 + gx / (s.cols - 1) * (x1 - x0)),
      py: (gy) => yScale(y1 - gy / (s.rows - 1) * (y1 - y0)),
    };
  }

  /** @override — the raster image of the surface. */
  _renderUnderlay(group, xScale, yScale, _plotArea, _defs) {
    const s = this._surface();
    if (!s) return;
    const canvas = document.createElement('canvas');
    canvas.width = s.cols;
    canvas.height = s.rows;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(s.cols, s.rows);
    img.data.set(rasterRGBA(s.grid, this.config.colorScheme || 'viridis', s.zMin, s.zMax));
    ctx.putImageData(img, 0, 0);

    // Pixel i covers [i, i + 1) grid steps, so the image is one step wider
    // (and taller) than the span between the first and last grid point.
    const { px, py } = this._gridToPx(s, xScale, yScale);
    const x = px(0), y = py(0);
    svgEl('image', {
      href: canvas.toDataURL('image/png'),
      x, y,
      width: (px(s.cols - 1) - x) * s.cols / (s.cols - 1),
      height: (py(s.rows - 1) - y) * s.rows / (s.rows - 1),
      preserveAspectRatio: 'none',
      style: 'image-rendering: pixelated',
    }, group);
  }

  /** @override — contour lines, their labels and the measured points. */
  _renderData(_svg, plotGroup, xScale, yScale, _xTick, _yTick, _plotArea, _defs) {
    const cfg = this.config;
    const s = this._surface();
    if (s && cfg.showLines !== false && s.zMax > s.zMin) {
      const { px, py } = this._gridToPx(s, xScale, yScale);
      const scheme = cfg.colorScheme || 'viridis';
      const n = Math.max(1, Math.round(cfg.numLevels ?? CONTOUR_DEFAULTS.numLevels));
      const labelFill = resolveColor('var(--color-text-primary)');
      const halo = resolveColor('var(--color-bg-primary)');
      for (const lv of contourLevels(s.zMin, s.zMax, n)) {
        const segs = contourSegments(s.grid, lv);
        if (!segs.length) continue;
        const d = segs.map(({ seg: [a, b, c, e] }) =>
          `M${fix(px(a))},${fix(py(b))}L${fix(px(c))},${fix(py(e))}`).join('');
        const t = (lv - s.zMin) / (s.zMax - s.zMin);
        svgEl('path', {
          class: 'chart-contour-line', d,
          fill: 'none', stroke: lineColor(getColor(t, scheme)), 'stroke-width': 0.8,
        }, plotGroup);

        if (cfg.showLabels === false) continue;
        const at = labelSegment(segs, s.cols);
        if (!at) continue;
        const [a, b, c, e] = at.seg;
        svgEl('text', {
          class: 'chart-contour-label',
          x: fix((px(a) + px(c)) / 2 + 2),
          y: fix((py(b) + py(e)) / 2 - 2),
          style: 'font: 600 9px monospace',
          fill: labelFill,
          stroke: halo, 'stroke-width': 3, 'stroke-opacity': 0.8, 'paint-order': 'stroke',
          'pointer-events': 'none',
        }, plotGroup).textContent = formatNum(lv, 1, this.locale);
      }
    }

    if (cfg.showDataPoints) this._renderPoints(plotGroup, xScale, yScale);
  }

  /** @private */
  _renderPoints(plotGroup, xScale, yScale) {
    const cfg = this.config;
    const r = (cfg.markerSize ?? CONTOUR_DEFAULTS.markerSize) / 2;
    if (!(r > 0)) return;
    const fill = resolveColor(cfg.markerColor || CONTOUR_DEFAULTS.markerColor);
    const stroke = resolveColor(cfg.markerStroke || CONTOUR_DEFAULTS.markerStroke);
    const sw = cfg.markerStrokeWidth ?? CONTOUR_DEFAULTS.markerStrokeWidth;
    const da = dashArray(cfg.markerStrokeDash || 'solid', sw);
    const extra = { class: 'chart-contour-point' };
    if (da !== 'none') extra['stroke-dasharray'] = da;
    for (const p of cfg.points || []) {
      if (!p || !isNum(p.x) || !isNum(p.y)) continue;
      drawMarker(plotGroup, cfg.markerSymbol || 'circle', xScale(p.x), yScale(p.y), r,
        fill, stroke, sw, { ...extra });
    }
  }

  /** @override */
  _getLegendItems() {
    return [];
  }

  /** @override — the interpolated surface value at the mouse position. */
  _findNearby(dataX, dataY, _proximityPx) {
    const pa = this._plotArea;
    const s = this._surface();
    if (!pa || !s || !this._xScale || !this._yScale) return [];
    const px = this._xScale(dataX);
    const py = this._yScale(dataY);
    if (!(px >= pa.x && px <= pa.x + pa.w && py >= pa.y && py <= pa.y + pa.h)) return [];
    const z = bilinear(s.grid, this.config.xRange, this.config.yRange, dataX, dataY);
    if (z === null) return [];
    const cfg = this.config;
    const row = (label, v) => [h('b', null, `${label}:`), ` ${formatNum(v, 3, this.locale)}`];
    return [{
      node: h('div', null,
        ...row(cfg.xLabel || 'x', dataX), h('br'),
        ...row(cfg.yLabel || 'y', dataY), h('br'),
        ...row(cfg.zLabel || 'z', z),
      ),
      px,
      py,
    }];
  }

  /** @override */
  _buildTypeEditor(inner, _t, onUpdate, onChange) {
    const cfg = this.config;
    const tr = (prefix) => (key) => {
      if (this.context && this.context.i18n) {
        const full = `chart.editor.${prefix}.${key}`;
        const val = this.context.i18n.t(full);
        if (val !== full) return val;
      }
      return key;
    };
    const th = tr('contour');

    // ── Appearance ──
    const sec = edSection(th('appearance'));
    const preview = document.createElement('div');
    preview.className = 'dmike-chart-ed__color-preview';
    sec.appendChild(edSelectRow(th('colorScheme'), [
      { value: 'viridis', label: 'Viridis' },
      { value: 'plasma', label: 'Plasma' },
      { value: 'thermal', label: 'Thermal' },
      { value: 'green', label: th('schemeGreen') },
      { value: 'grayscale', label: th('schemeGray') },
    ], cfg.colorScheme || 'viridis', (v) => {
      cfg.colorScheme = v;
      this._updateColorPreview(preview);
      onUpdate();
    }));
    sec.appendChild(preview);
    this._updateColorPreview(preview);

    // Sliders call onChange (render + notify) so dragging keeps the slider alive.
    sec.appendChild(edRangeRow(th('numLevels'), cfg.numLevels ?? CONTOUR_DEFAULTS.numLevels, (v) => {
      cfg.numLevels = Math.round(v);
      onChange();
    }, 4, 20, 1));
    sec.appendChild(edRangeRow(th('gridRes'), cfg.gridRes ?? CONTOUR_DEFAULTS.gridRes, (v) => {
      cfg.gridRes = Math.round(v / 10) * 10;
      onChange();
    }, 40, 200, 10));
    sec.appendChild(edCheckboxRow(th('showLines'), cfg.showLines !== false, (v) => {
      cfg.showLines = v;
      onUpdate();
    }));
    sec.appendChild(edCheckboxRow(th('showLabels'), cfg.showLabels !== false, (v) => {
      cfg.showLabels = v;
      onUpdate();
    }));
    sec.appendChild(edCheckboxRow(th('showDataPoints'), !!cfg.showDataPoints, (v) => {
      cfg.showDataPoints = v;
      onUpdate();
    }));
    inner.appendChild(sec);

    // ── Measured points ──
    const marker = edMarkerSection(th('dataPoints'), {
      getSymbol: () => cfg.markerSymbol || 'circle',
      setSymbol: (v) => { cfg.markerSymbol = v; },
      getSize: () => cfg.markerSize ?? CONTOUR_DEFAULTS.markerSize,
      setSize: (v) => { cfg.markerSize = v; },
      getColor: () => cfg.markerColor || CONTOUR_DEFAULTS.markerColor,
      setColor: (v) => { cfg.markerColor = v; },
      getStroke: () => cfg.markerStroke || CONTOUR_DEFAULTS.markerStroke,
      setStroke: (v) => { cfg.markerStroke = v; },
      getStrokeWidth: () => cfg.markerStrokeWidth ?? CONTOUR_DEFAULTS.markerStrokeWidth,
      setStrokeWidth: (v) => { cfg.markerStrokeWidth = v; },
      onChange,
    }, tr('marker'), { sizeMin: 2, sizeMax: 24, strokeMin: 0, strokeMax: 6 });
    marker.appendChild(edSelectRow(th('markerStrokeDash'),
      DASH_STYLES.map((value) => ({ value, label: th(`dash.${value}`) })),
      cfg.markerStrokeDash || 'solid', (v) => {
        cfg.markerStrokeDash = v;
        onUpdate();
      }));
    inner.appendChild(marker);
  }

  /**
   * Fill the colour strip below the scheme selection.
   * @param {HTMLElement} el
   * @private
   */
  _updateColorPreview(el) {
    const scheme = this.config.colorScheme || 'viridis';
    el.replaceChildren();
    for (let i = 0; i < 12; i++) {
      const c = getColor(i / 11, scheme);
      const d = document.createElement('div');
      d.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
      el.appendChild(d);
    }
  }
}
