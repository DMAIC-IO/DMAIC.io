/**
 * D.Mike — Histogram Editor Panel (histogram-editor.js)
 * Editor panel methods extracted from histogram.js as a mixin.
 * All methods use `this` bound to the histogram module object.
 */

import {
  edSection, edCheckboxRow, edSelectRow,
  edColorPair, edColorSwatch, edVisToggle, edExpandBtn,
  edTitleSection, edFontSizeSection, edAxisLabelSection, edAxisTickSection,
  edRefLinesSection, edRefAreasSection, edBgColorSection,
  openColorPicker,
} from '../../core/chart/chart-editor.js';

export const editorMethods = {

  // ─── Editor Panel ──────────────────────────────────────────

  _buildEditor() {
    const inner = this._container?.querySelector('[data-ref="editor-inner"]');
    if (!inner || !this._seriesData) return;
    inner.innerHTML = '';
    const t = (k) => this._context.i18n.t(`modules.histogram.${k}`);
    const te = (k) => this._context.i18n.t(`chart.editor.${k}`);
    const rerender = () => { this._renderChart(); this._save(); };
    const rebuild = () => { this._buildEditor(); rerender(); };

    // ── Display section (module-specific: pareto/boxplot/stats) ──
    const s0 = edSection(t('edDisplay'));
    s0.appendChild(edCheckboxRow(t('showPareto'), this._showPareto, (v) => { this._showPareto = v; rerender(); }));
    s0.appendChild(edCheckboxRow(t('showBoxplot'), this._showBoxplot, (v) => { this._showBoxplot = v; rerender(); }));
    s0.appendChild(edCheckboxRow(t('showStats'), this._showStats, (v) => { this._showStats = v; rerender(); }));
    inner.appendChild(s0);

    // ── Title (shared) ──
    inner.appendChild(edTitleSection(this._chartConfig, rerender, te));

    // ── Font Sizes (shared) ──
    inner.appendChild(edFontSizeSection(this._chartConfig, rerender, te));

    // ── Axis Labels (shared) ──
    inner.appendChild(edAxisLabelSection(this._chartConfig, rerender, te));

    // ── Axis Ticks (shared) ──
    inner.appendChild(edAxisTickSection(this._chartConfig, rerender, te));

    // ── Series section (module-specific) ──
    const s1 = edSection(t('edSeries'));
    this._seriesData.forEach((ser, i) => s1.appendChild(this._edSeriesItem(ser, i)));
    inner.appendChild(s1);

    // ── Reference Lines (shared) ──
    const cpOpen = (e, color, cb) => { this._closeColorPicker(); const p = openColorPicker(e, color, cb); this._activeColorPicker = p; };
    // ── Background color ──
    inner.appendChild(edBgColorSection(this._chartConfig, (patch) => {
      if (patch.bgColor !== undefined) this._chartConfig.bgColor = patch.bgColor;
      this._renderChart();
      this._save();
    }, cpOpen, te));

    inner.appendChild(edRefLinesSection(this._refLines, { onUpdate: rebuild, onOpenColorPicker: cpOpen }, te));

    // ── Reference Areas (shared) ──
    inner.appendChild(edRefAreasSection(this._refAreas, { onUpdate: rebuild, onOpenColorPicker: cpOpen }, te));
  },

  _edSeriesItem(ser, idx) {
    const item = document.createElement('div');
    item.className = `dmike-chart-ed-series-item${ser.visible === false ? ' hidden' : ''}`;

    const header = document.createElement('div');
    header.className = 'dmike-chart-ed-series-header';

    const swatch = edColorSwatch(ser.fillColor, (e) => {
      this._closeColorPicker();
      const p = openColorPicker(e, ser.fillColor, (c) => { ser.fillColor = c; swatch.style.background = c; this._renderChart(); this._save(); });
      this._activeColorPicker = p;
    });

    const nameInp = document.createElement('input');
    nameInp.value = ser.name;
    nameInp.addEventListener('change', () => { ser.name = nameInp.value; this._renderChart(); this._save(); });

    const eyeBtn = edVisToggle(ser.visible !== false, () => {
      ser.visible = ser.visible === false ? true : false;
      this._buildEditor(); this._renderChart(); this._save();
    });

    header.appendChild(swatch);
    header.appendChild(nameInp);
    header.appendChild(eyeBtn);
    item.appendChild(header);

    // Detail panel
    const detail = document.createElement('div');
    detail.className = 'dmike-chart-ed-series-detail';

    // Normal curve toggle
    detail.appendChild(edCheckboxRow(this._context.i18n.t('modules.histogram.edNormalCurve'), ser.showNormalCurve !== false, (v) => {
      ser.showNormalCurve = v;
      this._renderChart(); this._save();
    }));

    // Pattern (module-specific)
    detail.appendChild(edSelectRow(this._context.i18n.t('modules.histogram.edPattern'), [
      { value: '', label: '—' }, { value: '/', label: '/' }, { value: '\\', label: '\\' },
      { value: 'x', label: '×' }, { value: '-', label: '—' }, { value: '|', label: '|' },
      { value: '+', label: '+' }, { value: '.', label: '·' },
    ], ser.pattern || '', (v) => { ser.pattern = v; this._renderChart(); this._save(); }));

    // Border style (module-specific)
    detail.appendChild(edSelectRow(this._context.i18n.t('modules.histogram.edBorderStyle'), [
      { value: 'solid', label: 'Solid' }, { value: 'dash', label: 'Dash' },
      { value: 'dot', label: 'Dot' }, { value: 'none', label: 'None' },
    ], ser.borderStyle || 'solid', (v) => { ser.borderStyle = v; this._renderChart(); this._save(); }));

    // Border color
    const { el: bcRow, swatch: bcSwatch } = edColorPair(
      this._context.i18n.t('modules.histogram.edBorderColor'), ser.borderColor,
      (e) => {
        this._closeColorPicker();
        const p = openColorPicker(e, ser.borderColor, (c) => { ser.borderColor = c; bcSwatch.style.background = c; this._renderChart(); this._save(); });
        this._activeColorPicker = p;
      },
    );
    detail.appendChild(bcRow);

    item.appendChild(detail);
    item.appendChild(edExpandBtn('Details', detail));

    return item;
  },

  // ── Color Picker lifecycle ──

  _closeColorPicker() {
    if (this._activeColorPicker) {
      this._activeColorPicker.close();
      this._activeColorPicker = null;
    }
  },
};
