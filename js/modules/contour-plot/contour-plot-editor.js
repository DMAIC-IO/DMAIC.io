/**
 * D.Mike — Contour Plot: Editor panel mixin
 *
 * Extracted from contour-plot.js — builds the chart-editor sidebar
 * with contour-display options, marker styling, and shared sections.
 */

import {
  edSection, edCheckboxRow, edSelectRow, edRangeRow, edInputRow,
  edTitleSection, edFontSizeSection, edAxisTickSection,
  edBgColorSection, edRefLinesSection, edRefAreasSection,
  edColorPair, openColorPicker,
} from '../../core/chart/chart-editor.js';

import { getColor } from './contour-plot-render.js';

export const editorMethods = {

  _buildEditor() {
    const inner = this._container?.querySelector('[data-ref="editor-inner"]');
    if (!inner) return;
    inner.replaceChildren();

    const t = (k) => this._t(k);
    const te = (k) => this._context.i18n.t(`chart.editor.${k}`);
    const cc = this._chartConfig;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const redraw = () => { if (this._lastGrid) this._drawContour(); };
    const rebuild = () => { this._buildEditor(); redraw(); };
    const cpOpen = (e, color, cb) => { this._closeColorPicker(); const p = openColorPicker(e, color, cb); this._activeColorPicker = p; };

    // ── Contour Display section (module-specific) ──
    const s1 = edSection(t('sectionDisplay'));

    s1.appendChild(edSelectRow(t('colorScheme'), [
      { value: 'viridis', label: 'Viridis' },
      { value: 'plasma', label: 'Plasma' },
      { value: 'thermal', label: 'Thermal' },
      { value: 'green', label: t('schemeGreen') },
      { value: 'grayscale', label: t('schemeGray') },
    ], this._state.colorScheme || 'viridis', (v) => {
      this._state.colorScheme = v;
      this._updateEditorColorPreview();
      this._saveState();
      redraw();
    }));

    // Color preview strip
    const preview = document.createElement('div');
    preview.className = 'contour__color-preview';
    preview.dataset.ref = 'edColorPreview';
    s1.appendChild(preview);
    this._updateEditorColorPreview();

    s1.appendChild(edRangeRow(t('contourLevels'), this._state.numLevels || 10, (v) => {
      this._state.numLevels = v; this._saveState(); redraw();
    }, 4, 20, 1));

    s1.appendChild(edRangeRow(t('gridResolution'), this._state.gridRes || 100, (v) => {
      this._state.gridRes = v; this._saveState(); redraw();
    }, 40, 200, 10));

    s1.appendChild(edCheckboxRow(t('showLines'), this._state.showLines !== false, (v) => {
      this._state.showLines = v; this._saveState(); redraw();
    }));

    s1.appendChild(edCheckboxRow(t('showLabels'), this._state.showLabels !== false, (v) => {
      this._state.showLabels = v; this._saveState(); redraw();
    }));

    s1.appendChild(edCheckboxRow(t('showDataPoints'), this._state.showDataPoints || false, (v) => {
      this._state.showDataPoints = v; this._saveState(); redraw();
    }));

    inner.appendChild(s1);

    // ── Data Point Styling ──
    const sMarker = edSection(t('sectionMarker'));

    sMarker.appendChild(edSelectRow(t('markerSymbol'), [
      { value: 'circle', label: '● Circle' }, { value: 'square', label: '■ Square' },
      { value: 'diamond', label: '◆ Diamond' }, { value: 'triangle', label: '▲ Triangle' },
      { value: 'triangle-down', label: '▼ Tri-down' }, { value: 'cross', label: '✚ Cross' },
      { value: 'star', label: '★ Star' },
    ], cc.markerSymbol || 'circle', (v) => {
      cc.markerSymbol = v; this._saveState(); redraw();
    }));

    sMarker.appendChild(edRangeRow(t('markerSize'), cc.markerSize ?? 10, (v) => {
      cc.markerSize = v; this._saveState(); redraw();
    }, 2, 24, 1));

    const { el: mFillRow, swatch: mFillSw } = edColorPair(t('markerColor'),
      cc.markerColor || (isDark ? '#fff' : '#222'), (e) => {
        this._closeColorPicker();
        const p = openColorPicker(e, cc.markerColor || (isDark ? '#fff' : '#222'), (c) => {
          cc.markerColor = c; mFillSw.style.background = c; this._saveState(); redraw();
        });
        this._activeColorPicker = p;
      });
    sMarker.appendChild(mFillRow);

    const { el: mStrokeRow, swatch: mStrokeSw } = edColorPair(t('markerStroke'),
      cc.markerStroke || 'rgba(255,255,255,1)', (e) => {
        this._closeColorPicker();
        const p = openColorPicker(e, cc.markerStroke || 'rgba(255,255,255,1)', (c) => {
          cc.markerStroke = c; mStrokeSw.style.background = c; this._saveState(); redraw();
        });
        this._activeColorPicker = p;
      });
    sMarker.appendChild(mStrokeRow);

    sMarker.appendChild(edRangeRow(t('markerStrokeWidth'), cc.markerStrokeWidth ?? 2, (v) => {
      cc.markerStrokeWidth = v; this._saveState(); redraw();
    }, 0, 6, 0.5));

    sMarker.appendChild(edSelectRow(t('markerStrokeDash'), [
      { value: 'solid', label: 'Solid' }, { value: 'dash', label: 'Dash' },
      { value: 'dot', label: 'Dot' }, { value: 'dashdot', label: 'Dash-Dot' },
      { value: 'longdash', label: 'Long dash' },
    ], cc.markerStrokeDash || 'solid', (v) => {
      cc.markerStrokeDash = v; this._saveState(); redraw();
    }));

    inner.appendChild(sMarker);

    // ── Title (shared) ──
    inner.appendChild(edTitleSection(this._chartConfig, () => { this._saveState(); redraw(); }, te));

    // ── Font Sizes (shared) ──
    inner.appendChild(edFontSizeSection(this._chartConfig, () => { this._saveState(); redraw(); }, te));

    // ── Axis Labels (shared) ──
    const axLbl = edSection(te('axisLabels'));
    axLbl.appendChild(edCheckboxRow(te('showXLabel'), this._chartConfig.showXLabel !== false, (v) => {
      this._chartConfig.showXLabel = v; this._saveState(); redraw();
    }));
    axLbl.appendChild(edInputRow(t('xFactorName'), 'text', this._chartConfig.xLabelText || this._val('xLabel'), (v) => {
      this._chartConfig.xLabelText = v;
      const el = this._container.querySelector('[data-ref="xLabel"]');
      if (el) el.value = v;
      this._saveState(); redraw();
    }));
    axLbl.appendChild(edCheckboxRow(te('showYLabel'), this._chartConfig.showYLabel !== false, (v) => {
      this._chartConfig.showYLabel = v; this._saveState(); redraw();
    }));
    axLbl.appendChild(edInputRow(t('yFactorName'), 'text', this._chartConfig.yLabelText || this._val('yLabel'), (v) => {
      this._chartConfig.yLabelText = v;
      const el = this._container.querySelector('[data-ref="yLabel"]');
      if (el) el.value = v;
      this._saveState(); redraw();
    }));
    inner.appendChild(axLbl);

    // ── Axis Ticks (shared) ──
    inner.appendChild(edAxisTickSection(this._chartConfig, () => { this._saveState(); redraw(); }, te));

    // ── Background Color (shared) ──
    inner.appendChild(edBgColorSection(this._chartConfig, (patch) => {
      if (patch.bgColor !== undefined) this._chartConfig.bgColor = patch.bgColor;
      this._saveState(); redraw();
    }, cpOpen, te));

    // ── Reference Lines (shared) ──
    inner.appendChild(edRefLinesSection(this._refLines, { onUpdate: rebuild, onOpenColorPicker: cpOpen }, te));

    // ── Reference Areas (shared) ──
    inner.appendChild(edRefAreasSection(this._refAreas, { onUpdate: rebuild, onOpenColorPicker: cpOpen }, te));
  },

  _closeColorPicker() {
    if (this._activeColorPicker) {
      this._activeColorPicker.close();
      this._activeColorPicker = null;
    }
  },

  _updateEditorColorPreview() {
    const el = this._container?.querySelector('[data-ref="edColorPreview"]');
    if (!el) return;
    const scheme = this._state.colorScheme || 'viridis';
    el.replaceChildren();
    for (let i = 0; i < 12; i++) {
      const c = getColor(i / 11, scheme);
      const d = document.createElement('div');
      d.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
      el.appendChild(d);
    }
  },

  _onModelChange() {
    const model = this._val('modelType');
    const coeffEl = this._container.querySelector('[data-ref="coeffSection"]');
    const customEl = this._container.querySelector('[data-ref="customSection"]');
    coeffEl.style.display = model === 'custom' ? 'none' : '';
    customEl.style.display = model === 'custom' ? '' : 'none';
  },

};
