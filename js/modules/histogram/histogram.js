/**
 * D.Mike — Histogram Module (histogram.js)
 * Analyze phase: histogram of worksheet columns with optional
 * Pareto line, boxplot panel, and descriptive statistics table.
 * Supports multiple series (side-by-side bars), auto/manual binning,
 * bar patterns, reference lines/areas.
 */

import { createModebar, exportSvgAsPNG, exportSvgAsFile } from '../../core/chart/modebar.js';
import {
  resolveColor, svgEl, svgText, niceNum, generateTicks,
  linearScale, formatNum, dashArray,
} from '../../core/chart/chart-core.js';
import {
  esc, parseRGBA, rgbaStr,
} from '../../core/chart/chart-editor.js';

import {
  DatasetPicker,
  getColumnValues, getColumnName,
} from '../../ui/dataset-picker.js';

import { computeSeriesStats, renderStatsTable } from '../../core/stats-panel.js';
import { CHART_COLORS, CHART_COLORS_RGBA, BORDER_COLORS } from '../../core/chart/chart-colors.js';
import { autoBinCount, computeBins, globalRange, autoBinWidth, binAll, percentile, computeBoxStats, createBarPattern } from './histogram-binning.js';
import { editorMethods } from './histogram-editor.js';
import { provisionWorksheet, removeProvisionedWorksheet, csvPayloadToWorksheetState } from '../../core/examples-registry.js';

// ─── Module ─────────────────────────────────────────────────

const mod = {
  id: 'histogram',
  phase: 'data',
  icon: 'bar-chart-2',
  i18nKey: 'modules.histogram',
  version: '1.0.0',

  _container: null,
  _context: null,
  /** @type {{ valueRef: object|null, groupRef: object|null }[]} */
  _datasets: [],
  _seriesOverrides: [],
  _binMode: 'auto',
  _binWidth: null,
  _showPareto: true,
  _showStats: true,
  _showBoxplot: true,
  _confLevel: 95,
  /** Shared chart display config — mutated in-place by shared editor builders */
  _chartConfig: {
    showTitle: true, title: '',
    titleSize: 15, labelSize: 12, tickSize: 11,
    showXLabel: true, showYLabel: true,
    showXTicks: true, showYTicks: true,
  },
  _barGap: 1,
  _refLines: [],
  _refAreas: [],
  _editorOpen: false,
  _interactionMode: 'zoom',
  _viewState: null,
  _isPanning: false,
  _panStart: null,
  _eventUnsubs: [],
  _plotting: false,
  _interactionsReady: false,
  _clickBound: false,
  _containerEventsBound: false,
  _activeColorPicker: null,
  /** @type {DatasetPicker|null} */
  _picker: null,
  /** Worksheet provisioned by loadExample (cleaned up on next load). */
  _exampleWorksheetId: null,

  // Rendering state (kept across renders for tooltip interaction)
  _curBinData: null,
  _lastXScale: null,
  _lastPa: null,
  _lastYScale: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    // Reset per-instance state — the registry uses a shallow spread of the
    // module export, so arrays/objects from the definition are shared across
    // instances until reassigned.
    this._datasets = [{ valueRef: null, groupRef: null }];
    this._seriesOverrides = [];
    this._refLines = [];
    this._refAreas = [];
    this._eventUnsubs = [];
    this._seriesData = null;
    this._viewState = null;
    this._picker = null;

    if (!document.getElementById('histogram-css')) {
      const link = document.createElement('link');
      link.id = 'histogram-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/histogram/histogram.css';
      document.head.appendChild(link);
    }

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._datasets = this._loadDatasets(saved);
      this._seriesOverrides = saved.seriesOverrides || [];
      this._binMode = saved.binMode || 'auto';
      this._binWidth = saved.binWidth ?? null;
      this._showPareto = saved.showPareto ?? true;
      this._showStats = saved.showStats ?? true;
      this._showBoxplot = saved.showBoxplot ?? true;
      this._confLevel = saved.confLevel ?? 95;
      this._chartConfig = {
        showTitle: saved.showTitle ?? true,
        title: saved.chartTitleText || '',
        titleSize: saved.titleSize ?? 15,
        labelSize: saved.labelSize ?? 12,
        tickSize: saved.tickSize ?? 11,
        showXLabel: saved.showXLabel ?? true,
        showYLabel: saved.showYLabel ?? true,
        showXTicks: saved.showXTicks ?? true,
        showYTicks: saved.showYTicks ?? true,
        bgColor: saved.bgColor || null,
      };
      this._barGap = saved.barGap ?? 1;
      this._refLines = saved.refLines || [];
      this._refAreas = saved.refAreas || [];
    }

    this._render();
    // Auto-plot if saved datasets exist
    if (this._datasets.length > 0) {
      requestAnimationFrame(() => this._plot());
    }
  },

  /** @private — load datasets with backward compat for v1 format (flat seriesRefs). */
  _loadDatasets(saved) {
    if (Array.isArray(saved.datasets)) {
      return saved.datasets.map(d => ({
        valueRef: d.valueRef || null,
        groupRef: d.groupRef || null,
      }));
    }
    if (Array.isArray(saved.seriesRefs)) {
      return saved.seriesRefs.map(ref => ({ valueRef: ref, groupRef: null }));
    }
    return [{ valueRef: null, groupRef: null }];
  },

  async destroy() {
    for (const unsub of this._eventUnsubs) unsub();
    this._eventUnsubs = [];
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._closeColorPicker();
    if (this._modebarInstance) {
      this._modebarInstance.destroy();
      this._modebarInstance = null;
    }
    if (this._globalMoveHandler) window.removeEventListener('mousemove', this._globalMoveHandler);
    if (this._globalUpHandler) window.removeEventListener('mouseup', this._globalUpHandler);
    this._clickBound = false;
    this._container.innerHTML = '';
  },

  onLanguageChange() {
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._render();
  },

  onThemeChange() {
    // Re-render chart with new theme colors
    if (this._container?.querySelector('[data-ref="chart-svg"]')) {
      this._renderChart();
    }
  },

  getState() {
    // Persist series overrides (color, pattern, visibility, name)
    const seriesOverrides = this._seriesData
      ? this._seriesData.map(s => ({
          name: s.name, visible: s.visible, fillColor: s.fillColor,
          borderColor: s.borderColor, borderWidth: s.borderWidth, borderStyle: s.borderStyle,
          pattern: s.pattern, patternColor: s.patternColor, patternSolidity: s.patternSolidity,
          showNormalCurve: s.showNormalCurve,
        }))
      : [];
    return {
      datasets: this._datasets.map(d => ({
        valueRef: d.valueRef,
        groupRef: d.groupRef || null,
      })),
      binMode: this._binMode,
      binWidth: this._binWidth,
      showTitle: this._chartConfig.showTitle,
      chartTitleText: this._chartConfig.title,
      showPareto: this._showPareto,
      showStats: this._showStats,
      showBoxplot: this._showBoxplot,
      confLevel: this._confLevel,
      titleSize: this._chartConfig.titleSize,
      labelSize: this._chartConfig.labelSize,
      tickSize: this._chartConfig.tickSize,
      showXLabel: this._chartConfig.showXLabel,
      showYLabel: this._chartConfig.showYLabel,
      showXTicks: this._chartConfig.showXTicks,
      showYTicks: this._chartConfig.showYTicks,
      barGap: this._barGap,
      bgColor: this._chartConfig.bgColor,
      refLines: this._refLines,
      refAreas: this._refAreas,
      seriesOverrides,
    };
  },

  setState(data) {
    if (data) this._datasets = this._loadDatasets(data);
    if (data?.binMode) this._binMode = data.binMode;
    if (data?.binWidth != null) this._binWidth = data.binWidth;
    if (data?.showTitle != null) this._chartConfig.showTitle = data.showTitle;
    if (data?.chartTitleText != null) this._chartConfig.title = data.chartTitleText;
    if (data?.showPareto != null) this._showPareto = data.showPareto;
    if (data?.showStats != null) this._showStats = data.showStats;
    if (data?.titleSize != null) this._chartConfig.titleSize = data.titleSize;
    if (data?.labelSize != null) this._chartConfig.labelSize = data.labelSize;
    if (data?.tickSize != null) this._chartConfig.tickSize = data.tickSize;
    if (data?.showXLabel != null) this._chartConfig.showXLabel = data.showXLabel;
    if (data?.showYLabel != null) this._chartConfig.showYLabel = data.showYLabel;
    if (data?.showXTicks != null) this._chartConfig.showXTicks = data.showXTicks;
    if (data?.showYTicks != null) this._chartConfig.showYTicks = data.showYTicks;
    if (data?.showBoxplot != null) this._showBoxplot = data.showBoxplot;
    if (data?.confLevel != null) this._confLevel = data.confLevel;
    if (data?.barGap != null) this._barGap = data.barGap;
    if (data?.bgColor !== undefined) this._chartConfig.bgColor = data.bgColor;
    if (data?.refLines) this._refLines = data.refLines;
    if (data?.refAreas) this._refAreas = data.refAreas;
    this._seriesOverrides = data?.seriesOverrides || [];
    if (this._container) {
      if (this._picker) { this._picker.destroy(); this._picker = null; }
      this._render();
      // Mirror init's auto-plot — without this, loadExample populates state
      // but _render only paints the empty input panel; the chart never draws.
      if (this._datasets.some(d => d.valueRef)) {
        requestAnimationFrame(() => this._plot());
      }
    }
  },

  /**
   * Load a catalog example. Histogram is often listed as a secondary module
   * on examples that store a single `columnRef` (process-capability, outlier-
   * test, distribution-fit, msa). Translate that into the native datasets[]
   * shape on the fly so cross-module sharing works without dedicated entries.
   *
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = Array.isArray(this._datasets)
      && this._datasets.some(d => d.valueRef);
    if (hasContent && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    let data = { ...payload.data };

    // CSV-shape payload (type: dataset) → synthesize sourceWorksheetData + columnRef
    // so it flows through the same provisioning path as project-shape payloads.
    if (!data.sourceWorksheetData && !data.datasets && !data.columnRef && Array.isArray(data.columns)) {
      const wsState = csvPayloadToWorksheetState(data, payload.meta);
      if (wsState) {
        data = {
          sourceWorksheetData: wsState,
          columnRef: { instanceId: '__source__', sheetId: wsState.activeSheetId, columnId: 'c-0' },
        };
      }
    }

    if (data.sourceWorksheetData) {
      const wsState = data.sourceWorksheetData;
      delete data.sourceWorksheetData;
      if (this._exampleWorksheetId) {
        removeProvisionedWorksheet(this._context, this._exampleWorksheetId);
        this._exampleWorksheetId = null;
      }
      const ref = provisionWorksheet(this._context, wsState);
      if (ref) {
        this._exampleWorksheetId = ref.instanceId;
        const rewrite = (r) => (r && r.instanceId === '__source__') ? { ...r, instanceId: ref.instanceId } : r;
        if (Array.isArray(data.datasets)) {
          data.datasets = data.datasets.map(d => ({ ...d, valueRef: rewrite(d.valueRef), groupRef: rewrite(d.groupRef) }));
        }
        if (data.columnRef) data.columnRef = rewrite(data.columnRef);
        if (data.colRef)    data.colRef    = rewrite(data.colRef);
        if (Array.isArray(data.seriesRefs)) data.seriesRefs = data.seriesRefs.map(rewrite);
      }
    }

    // Foreign-state translation: single columnRef / colRef / first seriesRef →
    // one dataset with that valueRef. Keep native datasets[] verbatim.
    if (!Array.isArray(data.datasets)) {
      const singleRef = data.columnRef || data.colRef
        || (Array.isArray(data.seriesRefs) ? data.seriesRefs[0] : null)
        || (Array.isArray(data.colRefsK) ? data.colRefsK[0] : null);
      if (singleRef) {
        data.datasets = [{ valueRef: singleRef, groupRef: null }];
      }
    }

    this.setState(data);
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  help: () => import('./histogram-help.js'),

  // ─── Column helpers ────────────────────────────────────────

  _getColumnValues(ref) {
    return getColumnValues(this._context?.stateManager, ref);
  },

  _getColumnName(ref) {
    return getColumnName(this._context?.stateManager, ref);
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (k, v) => this._context.i18n.t(`modules.histogram.${k}`, v);

    this._container.innerHTML = `
      <div class="histogram dmike-split">
        <div class="histogram__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionData')}</div>

          <div data-ref="picker-wrap"></div>

          <div class="dmike-split__section-title">${t('sectionBinning')}</div>
          <div class="histogram__options">
            <div class="field-group">
              <label>${t('binMode')}</label>
              <select class="field" data-ref="bin-mode">
                <option value="auto" ${this._binMode === 'auto' ? 'selected' : ''}>${t('binAuto')}</option>
                <option value="manual" ${this._binMode === 'manual' ? 'selected' : ''}>${t('binManual')}</option>
              </select>
            </div>
            <div class="field-group" data-ref="bin-width-row" style="${this._binMode === 'manual' ? '' : 'display:none'}">
              <label>${t('binWidth')}</label>
              <input type="number" class="field field--num" data-ref="bin-width" min="0.01"
                     value="${this._binWidth || ''}" placeholder="${t('binWidthAuto')}">
            </div>
          </div>

          <div class="dmike-split__section-title">${t('sectionOptions')}</div>
          <div class="histogram__options">
            <div class="field-group">
              <label>${t('confLevel')}</label>
              <input type="number" class="field field--num" data-ref="conf-level" min="50" max="99.9"
                     value="${this._confLevel}">
            </div>
          </div>

          <div class="histogram__error" data-ref="error-box"></div>
        </div>

        <div class="histogram__output dmike-split__output">
          <div class="histogram__placeholder" data-ref="placeholder"></div>
          <div class="histogram__chart-area" data-ref="chart-area" style="display:none">
            <div class="histogram__chart-card" data-ref="chart-card">
              <div class="histogram__chart-main">
                <div class="histogram__chart-wrap" data-ref="chart-wrap">
                  <svg data-ref="chart-svg"></svg>
                  <div class="dmike-chart-tooltip" data-ref="tooltip"></div>
                </div>
                <div class="histogram__boxplot-panel" data-ref="boxplot-panel">
                  <svg data-ref="boxplot-svg"></svg>
                </div>
                <div class="dmike-chart-tooltip" data-ref="boxplot-tooltip"></div>
                <div class="dmike-stats-panel" data-ref="stats-panel"></div>
              </div>
              <div class="histogram__editor" data-ref="editor-panel">
                <div class="histogram__editor-inner" data-ref="editor-inner"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this._interactionsReady = false;
    this._createPicker();
    this._bindEvents();
    this._createModebar();
  },

  _createPicker() {
    const pickerWrap = this._container.querySelector('[data-ref="picker-wrap"]');
    if (!pickerWrap) return;

    if (this._picker) { this._picker.destroy(); this._picker = null; }

    this._picker = new DatasetPicker(pickerWrap, this._context, {
      multi: true,
      colors: CHART_COLORS_RGBA,
      slots: [
        { key: 'value', label: 'V', title: this._context.i18n.t('ui.datasetPicker.slotV'), types: ['numeric'], minCount: 1, required: true },
        { key: 'group', label: 'G', title: this._context.i18n.t('ui.datasetPicker.slotG'), group: true },
      ],
      onChange: (datasets) => {
        this._datasets = datasets.map(ds => ({
          valueRef: ds.value || null,
          groupRef: ds.group || null,
        }));
        this._seriesOverrides = [];
        this._save();
        this._autoPlot();
      },
    });

    // Restore saved refs
    if (this._datasets.some(ds => ds.valueRef || ds.groupRef)) {
      this._picker.value = this._datasets.map(ds => ({
        value: ds.valueRef,
        group: ds.groupRef,
      }));
    }
  },

  _createModebar() {
    // Destroy old modebar if exists
    if (this._modebarInstance) {
      this._modebarInstance.destroy();
      this._modebarInstance = null;
    }

    const chartWrap = this._container?.querySelector('[data-ref="chart-wrap"]');
    const editorPanel = this._container?.querySelector('[data-ref="editor-panel"]');
    if (!chartWrap) return;

    this._modebarInstance = createModebar({
      onZoom: () => {
        this._interactionMode = 'zoom';
        chartWrap.style.cursor = 'default';
      },
      onPan: () => {
        this._interactionMode = 'pan';
        chartWrap.style.cursor = 'grab';
      },
      onReset: () => {
        this._viewState = null;
        this._renderChart();
      },
      onExportPNG: () => {
        const svg = this._container?.querySelector('[data-ref="chart-svg"]');
        if (svg) exportSvgAsPNG(svg, 'histogram.png');
      },
      onExportSVG: () => {
        const svg = this._container?.querySelector('[data-ref="chart-svg"]');
        if (svg) exportSvgAsFile(svg, 'histogram.svg');
      },
      onEditorToggle: (open) => {
        this._editorOpen = open;
        if (editorPanel) {
          editorPanel.classList.toggle('histogram__editor--open', open);
        }
        if (open) this._buildEditor();
        setTimeout(() => this._renderChart(), 340);
      },
    });

    chartWrap.appendChild(this._modebarInstance.el);
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindEvents() {
    // Delegated click handler — guard against stacking on re-render
    if (!this._clickBound) {
      this._clickBound = true;
      this._container.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        if (action === 'reset' && !e.target.closest('.dmike-chart-modebar')) this._resetAll();
      });
    }

    // Bin mode
    const binModeEl = this._container.querySelector('[data-ref="bin-mode"]');
    if (binModeEl) binModeEl.addEventListener('change', () => {
      this._binMode = binModeEl.value;
      const widthRow = this._container.querySelector('[data-ref="bin-width-row"]');
      if (widthRow) widthRow.style.display = this._binMode === 'manual' ? '' : 'none';
      if (this._binMode === 'auto') this._binWidth = null;
      this._save();
      this._autoPlot();
    });

    // Bin width
    const binWidthEl = this._container.querySelector('[data-ref="bin-width"]');
    if (binWidthEl) binWidthEl.addEventListener('change', () => {
      const v = parseFloat(binWidthEl.value);
      this._binWidth = (v > 0) ? v : null;
      this._save();
      this._autoPlot();
    });

    // Confidence level
    const confLevelEl = this._container.querySelector('[data-ref="conf-level"]');
    if (confLevelEl) confLevelEl.addEventListener('change', () => {
      const v = parseFloat(confLevelEl.value);
      if (v > 0 && v < 100) this._confLevel = v;
      this._save();
      this._renderStats();
    });

    // Zoom, pan, global mouse — only bind once on the container
    if (!this._containerEventsBound) {
      this._containerEventsBound = true;

      // Zoom (wheel) on chart-wrap
      this._container.addEventListener('wheel', (e) => {
        const wrap = e.target.closest('[data-ref="chart-wrap"]');
        if (!wrap || !this._lastPa || !this._lastXScale) return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const rect = wrap.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const pa = this._lastPa;
        const frac = (mx - pa.x) / pa.w;
        if (!this._viewState) {
          this._viewState = { xMin: this._lastXTick.min, xMax: this._lastXTick.max };
        }
        const vs = this._viewState;
        const range = vs.xMax - vs.xMin;
        const center = vs.xMin + frac * range;
        const newRange = range / factor;
        vs.xMin = center - frac * newRange;
        vs.xMax = center + (1 - frac) * newRange;
        this._renderChart();
      }, { passive: false });

      // Pan (drag) on chart-wrap
      this._container.addEventListener('mousedown', (e) => {
        if (this._interactionMode !== 'pan') return;
        const wrap = e.target.closest('[data-ref="chart-wrap"]');
        if (!wrap || !this._lastPa) return;
        this._isPanning = true;
        this._panStart = { x: e.clientX, vs: this._viewState ? { ...this._viewState } : { xMin: this._lastXTick.min, xMax: this._lastXTick.max } };
        wrap.style.cursor = 'grabbing';
        e.preventDefault();
      });
      this._globalMoveHandler = (e) => {
        if (!this._isPanning || !this._panStart) return;
        const dx = e.clientX - this._panStart.x;
        const pa = this._lastPa;
        if (!pa || pa.w <= 0) return;
        const range = this._panStart.vs.xMax - this._panStart.vs.xMin;
        const shift = -(dx / pa.w) * range;
        if (!this._viewState) this._viewState = {};
        this._viewState.xMin = this._panStart.vs.xMin + shift;
        this._viewState.xMax = this._panStart.vs.xMax + shift;
        this._renderChart();
      };
      this._globalUpHandler = () => {
        if (this._isPanning) {
          this._isPanning = false;
          const wrap = this._container?.querySelector('[data-ref="chart-wrap"]');
          if (wrap) wrap.style.cursor = this._interactionMode === 'pan' ? 'grab' : 'default';
        }
      };
      window.addEventListener('mousemove', this._globalMoveHandler);
      window.addEventListener('mouseup', this._globalUpHandler);
    }
  },

  /** Auto-plot whenever datasets or settings change. */
  _autoPlot() {
    const hasData = this._datasets.some(d => d.valueRef);
    if (hasData) {
      this._plot();
    } else {
      // Nothing selected yet — hide chart, show placeholder
      this._seriesData = null;
      const placeholder = this._container?.querySelector('[data-ref="placeholder"]');
      const chartArea = this._container?.querySelector('[data-ref="chart-area"]');
      if (placeholder) placeholder.style.display = '';
      if (chartArea) chartArea.style.display = 'none';
    }
  },

  _showError(msg) {
    const errBox = this._container?.querySelector('[data-ref="error-box"]');
    if (errBox) {
      errBox.textContent = msg;
      errBox.style.display = 'block';
      setTimeout(() => { errBox.style.display = 'none'; }, 4000);
    }
  },

  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  _resetAll() {
    this._datasets = [{ valueRef: null, groupRef: null }];
    this._binMode = 'auto';
    this._binWidth = null;
    this._showPareto = true;
    this._showStats = true;
    this._showBoxplot = true;
    this._confLevel = 95;
    this._chartConfig = {
      showTitle: true, title: '',
      titleSize: 15, labelSize: 12, tickSize: 11,
      showXLabel: true, showYLabel: true,
      showXTicks: true, showYTicks: true,
      bgColor: null,
    };
    this._barGap = 1;
    this._refLines = [];
    this._refAreas = [];
    this._editorOpen = false;
    this._seriesData = null;
    this._seriesOverrides = [];
    this._closeColorPicker();
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._save();
    this._render();
  },

  // ─── Plot ───────────────────────────────────────────────────

  _plot() {
    if (this._plotting) return;
    this._plotting = true;

    try {
      const t = (k, v) => this._context.i18n.t(`modules.histogram.${k}`, v);
      const errBox = this._container?.querySelector('[data-ref="error-box"]');
      if (errBox) errBox.style.display = 'none';

      if (this._datasets.length === 0) {
        this._showError(t('errNoSeries'));
        return;
      }

      // Expand datasets into flat seriesData. Each dataset with no grouping
      // produces exactly one series; grouped datasets produce one sub-series
      // per unique level (insertion order).
      const seriesData = [];
      const pushSeries = (name, values) => {
        const i = seriesData.length;
        seriesData.push({
          name,
          visible: true,
          fillColor: CHART_COLORS_RGBA[i % CHART_COLORS_RGBA.length],
          borderColor: BORDER_COLORS[i % BORDER_COLORS.length],
          borderWidth: 1,
          borderStyle: 'solid',
          pattern: '',
          patternColor: '',
          patternSolidity: 0.4,
          showNormalCurve: true,
          values,
        });
      };

      for (let i = 0; i < this._datasets.length; i++) {
        const ds = this._datasets[i];
        // Skip incomplete datasets silently — the chart updates as the user picks columns.
        if (!ds.valueRef) continue;

        const rawVals = this._getColumnValues(ds.valueRef);
        const name = this._getColumnName(ds.valueRef);

        if (ds.groupRef) {
          // Split into one sub-series per unique group level.
          const groupVals = this._getColumnValues(ds.groupRef);
          const buckets = new Map();
          const len = Math.min(rawVals.length, groupVals.length);
          for (let r = 0; r < len; r++) {
            const v = rawVals[r];
            const g = groupVals[r];
            if (v == null || typeof v !== 'number' || isNaN(v)) continue;
            if (g == null || g === '') continue;
            const key = String(g);
            let b = buckets.get(key);
            if (!b) {
              b = { level: g, values: [] };
              buckets.set(key, b);
            }
            b.values.push(v);
          }

          if (buckets.size === 0) {
            this._showError(t('errNoGroupLevels', { n: i + 1 }));
            return;
          }

          let hasAny = false;
          for (const b of buckets.values()) {
            if (b.values.length < 2) continue;
            pushSeries(t('groupSeriesName', { col: name, level: String(b.level) }), b.values);
            hasAny = true;
          }
          if (!hasAny) {
            this._showError(t('errTooFew', { col: name }));
            return;
          }
        } else {
          const values = rawVals.filter(v => v != null && typeof v === 'number' && !isNaN(v));
          if (values.length < 2) {
            this._showError(t('errTooFew', { col: name }));
            return;
          }
          pushSeries(name, values);
        }
      }

      if (seriesData.length === 0) {
        // Nothing ready yet — fall back to placeholder.
        this._seriesData = null;
        const placeholder = this._container?.querySelector('[data-ref="placeholder"]');
        const chartArea = this._container?.querySelector('[data-ref="chart-area"]');
        if (placeholder) placeholder.style.display = '';
        if (chartArea) chartArea.style.display = 'none';
        return;
      }

      // Show chart area
      const placeholder = this._container.querySelector('[data-ref="placeholder"]');
      const chartArea = this._container.querySelector('[data-ref="chart-area"]');
      if (placeholder) placeholder.style.display = 'none';
      if (chartArea) chartArea.style.display = '';

      // Apply saved series overrides (colors, patterns, names)
      if (this._seriesOverrides) {
        for (let i = 0; i < seriesData.length && i < this._seriesOverrides.length; i++) {
          const ov = this._seriesOverrides[i];
          if (ov.fillColor) seriesData[i].fillColor = ov.fillColor;
          if (ov.borderColor) seriesData[i].borderColor = ov.borderColor;
          if (ov.borderWidth != null) seriesData[i].borderWidth = ov.borderWidth;
          if (ov.borderStyle) seriesData[i].borderStyle = ov.borderStyle;
          if (ov.pattern != null) seriesData[i].pattern = ov.pattern;
          if (ov.patternColor) seriesData[i].patternColor = ov.patternColor;
          if (ov.patternSolidity != null) seriesData[i].patternSolidity = ov.patternSolidity;
          if (ov.visible != null) seriesData[i].visible = ov.visible;
          if (ov.showNormalCurve != null) seriesData[i].showNormalCurve = ov.showNormalCurve;
        }
      }

      // Store series data for rendering
      this._seriesData = seriesData;

      // Defer render to let layout compute
      requestAnimationFrame(() => {
        this._renderChart();
        if (!this._interactionsReady) {
          this._setupChartInteractions();
          this._interactionsReady = true;
        }
        if (this._editorOpen) this._buildEditor();
      });

      this._save();
    } finally {
      this._plotting = false;
    }
  },

  // ─── Chart Rendering ───────────────────────────────────────

  _renderChart() {
    const seriesData = this._seriesData;
    if (!seriesData || seriesData.length === 0) return;

    const t = (k, v) => this._context.i18n.t(`modules.histogram.${k}`, v);
    const svg = this._container.querySelector('[data-ref="chart-svg"]');
    const wrap = this._container.querySelector('[data-ref="chart-wrap"]');
    if (!svg || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const size = { w: rect.width, h: rect.height };
    if (size.w <= 0 || size.h <= 0) return;

    svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
    svg.innerHTML = '';

    // Theme-aware colors
    const textColor = resolveColor('var(--color-text-primary)');
    const subColor = resolveColor('var(--color-text-secondary)');
    const gridColor = resolveColor('var(--color-border-secondary)');
    const frameColor = resolveColor('var(--color-border-primary)');

    const FONT_MAIN = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    const FONT_MONO = "'SF Mono', 'Cascadia Code', Consolas, 'Liberation Mono', monospace";

    // Style element
    const styleEl = svgEl('style', {}, svg);
    styleEl.textContent = `text { font-family: ${FONT_MAIN}; } .tick-label { font-family: ${FONT_MONO}; }`;

    // Background color
    svg.style.background = this._chartConfig.bgColor || '';

    // Build title from custom text or series names
    const autoTitle = t('chartTitle') + ': ' + seriesData.filter(s => s.visible !== false).map(s => s.name).join(', ');
    const chartTitle = this._chartConfig.title || autoTitle;

    // Margins — extra top space when title is shown
    const cc = this._chartConfig;
    const margin = { top: cc.showTitle ? 48 : 32, right: 24, bottom: 58, left: 72 };
    const legendWidth = 130;

    // Compute bins
    const bw = this._binMode === 'manual' && this._binWidth ? this._binWidth : null;
    const binData = binAll(seriesData, bw);
    this._curBinData = binData;

    // Pareto active?
    let visCount = 0;
    seriesData.forEach(s => { if (s.visible !== false) visCount++; });
    const hasPareto = this._showPareto && visCount === 1;

    // Plot area
    let rMargin = margin.right;
    if (hasPareto) {
      const paretoSpace = 52;
      rMargin = paretoSpace + 18;
    }
    const pa = {
      x: margin.left,
      y: margin.top,
      w: size.w - margin.left - rMargin,
      h: size.h - margin.top - margin.bottom,
      totalW: size.w,
      totalH: size.h,
    };
    this._lastPa = pa;

    // Y extent — find nBins from first visible series (hidden series have empty bins)
    let maxCount = 0;
    let nBins = 0;
    for (const serBins of binData.bins) {
      if (serBins.length > nBins) nBins = serBins.length;
    }
    for (let bi = 0; bi < nBins; bi++) {
      binData.bins.forEach(serBins => {
        if (serBins[bi]) maxCount = Math.max(maxCount, serBins[bi].count);
      });
    }
    const yMax = maxCount * 1.12 || 1;

    let xTick = generateTicks(binData.globalMin, binData.globalMax);
    const yTick = generateTicks(0, yMax);

    // Apply zoom/pan view state
    if (this._viewState) {
      xTick = generateTicks(this._viewState.xMin, this._viewState.xMax);
    }
    this._lastXTick = xTick;

    const xScale = linearScale(xTick.min, xTick.max, pa.x, pa.x + pa.w);
    const yScale = linearScale(yTick.min, yTick.max, pa.y + pa.h, pa.y);
    this._lastXScale = xScale;
    this._lastYScale = yScale;

    // Defs
    const defs = svgEl('defs', {}, svg);
    const clipId = 'hist-clip';
    const clip = svgEl('clipPath', { id: clipId }, defs);
    svgEl('rect', { x: pa.x, y: pa.y, width: pa.w, height: pa.h }, clip);

    // Bar patterns
    seriesData.forEach((s, si) => {
      if (s.pattern && s.pattern !== '') {
        createBarPattern(defs, `bar-pat-${si}`, s);
      }
    });

    // Grid lines
    const gridGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
    xTick.ticks.forEach(v => {
      const x = Math.round(xScale(v)) + 0.5;
      svgEl('line', { x1: x, y1: pa.y, x2: x, y2: pa.y + pa.h, stroke: gridColor, 'stroke-width': 1 }, gridGroup);
    });
    yTick.ticks.forEach(v => {
      const y = Math.round(yScale(v)) + 0.5;
      svgEl('line', { x1: pa.x, y1: y, x2: pa.x + pa.w, y2: y, stroke: gridColor, 'stroke-width': 1 }, gridGroup);
    });

    // Reference areas (behind bars)
    const areaGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
    (this._refAreas || []).forEach((area, idx) => {
      let ax, ay, aw, ah;
      if (area.dir === 'y') {
        ax = pa.x; aw = pa.w;
        ay = yScale(area.max); ah = yScale(area.min) - ay;
      } else {
        ay = pa.y; ah = pa.h;
        ax = xScale(area.min); aw = xScale(area.max) - ax;
      }
      svgEl('rect', { x: ax, y: ay, width: aw, height: ah, fill: area.color }, areaGroup);
      if (area.pattern && area.pattern !== '') {
        createBarPattern(defs, `area-pat-${idx}`, { pattern: area.pattern, patternColor: area.patternColor || 'rgba(100,100,100,1)', patternSolidity: area.patternSolidity || 0.4 });
        svgEl('rect', { x: ax, y: ay, width: aw, height: ah, fill: `url(#area-pat-${idx})` }, areaGroup);
      }
    });

    // Reference lines (behind bars)
    const refLineGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
    (this._refLines || []).forEach(line => {
      let attrs;
      if (line.dir === 'h') {
        const ly = yScale(line.value);
        attrs = { x1: pa.x, y1: ly, x2: pa.x + pa.w, y2: ly };
      } else {
        const lx = xScale(line.value);
        attrs = { x1: lx, y1: pa.y, x2: lx, y2: pa.y + pa.h };
      }
      attrs.stroke = line.color;
      attrs['stroke-width'] = line.width;
      const da = dashArray(line.dash, line.width);
      if (da !== 'none') attrs['stroke-dasharray'] = da;
      svgEl('line', attrs, refLineGroup);
    });

    // Histogram bars
    const barGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
    const visibleSeries = [];
    seriesData.forEach((s, si) => {
      if (s.visible !== false) visibleSeries.push(si);
    });
    const nVis = visibleSeries.length;

    for (let bi = 0; bi < nBins; bi++) {
      visibleSeries.forEach((si, vi) => {
        const s = seriesData[si];
        const bins = binData.bins[si];
        if (!bins || !bins[bi]) return;
        const bin = bins[bi];

        const bx1 = xScale(bin.xMin);
        const bx2 = xScale(bin.xMax);
        let fullW = bx2 - bx1 - this._barGap;
        if (fullW < 1) fullW = 1;

        // Overlay mode: all series use full bin width
        const barW = fullW;
        const barX = bx1 + this._barGap / 2;

        const barY = yScale(bin.count);
        let barH = yScale(0) - barY;
        if (barH < 0) barH = 0;

        const borderDash = dashArray(s.borderStyle || 'solid', s.borderWidth || 1);
        const rectAttrs = {
          x: barX, y: barY, width: barW, height: barH,
          fill: s.fillColor,
          stroke: s.borderColor || 'rgba(0,0,0,0.3)',
          'stroke-width': s.borderWidth || 1,
        };
        if (borderDash !== 'none') rectAttrs['stroke-dasharray'] = borderDash;
        svgEl('rect', rectAttrs, barGroup);

        if (s.pattern && s.pattern !== '') {
          svgEl('rect', {
            x: barX, y: barY, width: barW, height: barH,
            fill: `url(#bar-pat-${si})`, stroke: 'none', 'pointer-events': 'none',
          }, barGroup);
        }

      });

      // Single hit-area per bin covering the tallest bar
      let maxBinCount = 0;
      let binXMin = 0, binXMax = 0;
      visibleSeries.forEach((si) => {
        const bins = binData.bins[si];
        if (bins && bins[bi]) {
          if (bins[bi].count > maxBinCount) maxBinCount = bins[bi].count;
          binXMin = bins[bi].xMin;
          binXMax = bins[bi].xMax;
        }
      });
      if (maxBinCount > 0) {
        const hx1 = xScale(binXMin) + this._barGap / 2;
        const hx2 = xScale(binXMax) - this._barGap / 2;
        svgEl('rect', {
          x: hx1, y: yScale(maxBinCount), width: Math.max(1, hx2 - hx1), height: yScale(0) - yScale(maxBinCount),
          fill: 'transparent', 'data-bar': 'true', 'data-bi': bi,
          style: 'cursor:pointer',
        }, barGroup);
      }
    }

    // Normal distribution curves (one per visible series)
    const curveGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
    visibleSeries.forEach(si => {
      const s = seriesData[si];
      if (!s.showNormalCurve || s.values.length < 3) return;
      const mean = s.values.reduce((a, b) => a + b, 0) / s.values.length;
      const variance = s.values.reduce((a, b) => a + (b - mean) ** 2, 0) / (s.values.length - 1);
      const std = Math.sqrt(variance);
      if (std === 0) return;
      const n = s.values.length;
      const bw = binData.binWidth;
      // PDF scaled to histogram counts: f(x) * n * binWidth
      const scale = n * bw;
      const SQRT2PI = Math.sqrt(2 * Math.PI);
      const pdf = (x) => (1 / (std * SQRT2PI)) * Math.exp(-0.5 * ((x - mean) / std) ** 2) * scale;

      const steps = 120;
      const xMin = xTick.min;
      const xMax = xTick.max;
      const dx = (xMax - xMin) / steps;
      const pts = [];
      for (let j = 0; j <= steps; j++) {
        const x = xMin + j * dx;
        const y = pdf(x);
        pts.push(`${xScale(x)},${yScale(y)}`);
      }
      svgEl('polyline', {
        points: pts.join(' '), fill: 'none',
        stroke: s.borderColor, 'stroke-width': 2,
      }, curveGroup);
    });

    // Pareto line
    if (hasPareto && nBins > 0) {
      const si0 = visibleSeries[0];
      const bins0 = binData.bins[si0];
      let totalCount = 0;
      bins0.forEach(b => { totalCount += b.count; });

      if (totalCount > 0) {
        const paretoColor = 'rgba(192,57,43,1)';
        const paretoScale = linearScale(0, 100, pa.y + pa.h, pa.y);

        // Secondary Y axis ticks
        [0, 25, 50, 75, 100].forEach(v => {
          const y = paretoScale(v);
          svgEl('line', { x1: pa.x + pa.w, y1: y, x2: pa.x + pa.w + 5, y2: y, stroke: subColor, 'stroke-width': 1 }, svg);
          svgText(`${v}%`, {
            x: pa.x + pa.w + 10, y: y + 4,
            'text-anchor': 'start', 'font-size': '11px', fill: paretoColor,
            'class': 'tick-label',
          }, svg);
        });

        // Cumulative line
        let cumPct = 0;
        const pts = [];
        for (let pi = 0; pi < bins0.length; pi++) {
          cumPct += (bins0[pi].count / totalCount) * 100;
          const cx = xScale((bins0[pi].xMin + bins0[pi].xMax) / 2);
          const cy = paretoScale(cumPct);
          pts.push(`${cx},${cy}`);
        }
        svgEl('polyline', {
          points: pts.join(' '), fill: 'none',
          stroke: paretoColor, 'stroke-width': 2,
        }, svgEl('g', { 'clip-path': `url(#${clipId})` }, svg));

        // Markers
        cumPct = 0;
        const markerGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
        for (let mi = 0; mi < bins0.length; mi++) {
          cumPct += (bins0[mi].count / totalCount) * 100;
          svgEl('circle', {
            cx: xScale((bins0[mi].xMin + bins0[mi].xMax) / 2),
            cy: paretoScale(cumPct),
            r: 2.5, fill: paretoColor, stroke: resolveColor('var(--color-bg-primary)'), 'stroke-width': 1.5,
          }, markerGroup);
        }

        // Pareto Y label
        const rLabelX = pa.x + pa.w + 42;
        svgText(t('paretoCumLabel'), {
          x: rLabelX, y: pa.y + pa.h / 2,
          'text-anchor': 'middle', 'font-size': '11px', 'font-weight': '600', fill: paretoColor,
          transform: `rotate(90, ${rLabelX}, ${pa.y + pa.h / 2})`,
        }, svg);
      }
    }

    // Axes frame
    svgEl('rect', {
      x: pa.x, y: pa.y, width: pa.w, height: pa.h,
      fill: 'none', stroke: frameColor, 'stroke-width': 1,
    }, svg);

    // X-Axis ticks
    if (cc.showXTicks) {
      xTick.ticks.forEach(v => {
        const x = xScale(v);
        svgEl('line', { x1: x, y1: pa.y + pa.h, x2: x, y2: pa.y + pa.h + 5, stroke: subColor, 'stroke-width': 1 }, svg);
        svgText(formatNum(v), {
          x, y: pa.y + pa.h + 18,
          'text-anchor': 'middle', 'font-size': cc.tickSize + 'px', fill: subColor, 'class': 'tick-label',
        }, svg);
      });
    }

    // Y-Axis ticks
    if (cc.showYTicks) {
      yTick.ticks.forEach(v => {
        const y = yScale(v);
        svgEl('line', { x1: pa.x - 5, y1: y, x2: pa.x, y2: y, stroke: subColor, 'stroke-width': 1 }, svg);
        svgText(formatNum(v), {
          x: pa.x - 10, y: y + 4,
          'text-anchor': 'end', 'font-size': cc.tickSize + 'px', fill: subColor, 'class': 'tick-label',
        }, svg);
      });
    }

    // X label
    if (cc.showXLabel) {
      svgText(t('xLabel'), {
        x: pa.x + pa.w / 2, y: pa.y + pa.h + 46,
        'text-anchor': 'middle', 'font-size': cc.labelSize + 'px', 'font-weight': '600', fill: textColor,
      }, svg);
    }

    // Y label
    if (cc.showYLabel) {
      svgText(t('yLabel'), {
        x: 18, y: pa.y + pa.h / 2,
        'text-anchor': 'middle', 'font-size': cc.labelSize + 'px', 'font-weight': '600', fill: textColor,
        transform: `rotate(-90, 18, ${pa.y + pa.h / 2})`,
      }, svg);
    }

    // Title
    if (cc.showTitle) {
      svgText(chartTitle, {
        x: pa.x + pa.w / 2, y: 26,
        'text-anchor': 'middle', 'font-size': cc.titleSize + 'px', 'font-weight': '700', fill: textColor,
      }, svg);
    }

    // Render sub-panels
    this._renderBoxplot();
    this._renderStats();
  },

  // ─── Boxplot ────────────────────────────────────────────────

  _renderBoxplot() {
    const bpPanel = this._container?.querySelector('[data-ref="boxplot-panel"]');
    const bpSvg = this._container?.querySelector('[data-ref="boxplot-svg"]');
    if (!bpPanel || !bpSvg) return;

    if (!this._showBoxplot || !this._seriesData || !this._lastXScale) {
      bpPanel.style.display = 'none';
      bpSvg.innerHTML = '';
      const cw = this._container?.querySelector('[data-ref="chart-wrap"]');
      if (cw) cw.classList.remove('histogram__chart-wrap--bp-open');
      return;
    }

    const BOX_H = 22, GAP = 6, PAD_TOP = 6, PAD_BOT = 4;
    const xScale = this._lastXScale;
    const pa = this._lastPa;

    const visibleSeries = [];
    this._seriesData.forEach((s, i) => {
      if (s.visible !== false) visibleSeries.push({ series: s, index: i });
    });

    if (visibleSeries.length === 0) {
      bpPanel.style.display = 'none';
      bpSvg.innerHTML = '';
      const cw2 = this._container?.querySelector('[data-ref="chart-wrap"]');
      if (cw2) cw2.classList.remove('histogram__chart-wrap--bp-open');
      return;
    }

    const totalH = PAD_TOP + visibleSeries.length * BOX_H + (visibleSeries.length - 1) * GAP + PAD_BOT;
    bpSvg.setAttribute('viewBox', `0 0 ${pa.totalW} ${totalH}`);
    bpSvg.setAttribute('width', pa.totalW);
    bpSvg.setAttribute('height', totalH);
    bpSvg.innerHTML = '';
    bpPanel.style.display = '';
    const cwEl = this._container?.querySelector('[data-ref="chart-wrap"]');
    if (cwEl) cwEl.classList.add('histogram__chart-wrap--bp-open');

    this._boxplotHitAreas = [];

    visibleSeries.forEach((item, vi) => {
      const s = item.series;
      const stats = computeBoxStats(s.values);
      if (!stats) return;

      const cy = PAD_TOP + vi * (BOX_H + GAP) + BOX_H / 2;
      const boxTop = cy - BOX_H / 2 + 2;
      const boxBot = cy + BOX_H / 2 - 2;
      const boxH = boxBot - boxTop;

      const xQ1 = xScale(stats.q1);
      const xQ3 = xScale(stats.q3);
      const xMed = xScale(stats.median);
      const xMean = xScale(stats.mean);
      const xWLo = xScale(stats.whiskerLo);
      const xWHi = xScale(stats.whiskerHi);

      const fillC = parseRGBA(s.fillColor);
      fillC.a = 0.35;
      const fillColor = rgbaStr(fillC);
      const strokeColor = s.borderColor || s.fillColor;

      // Whisker line
      svgEl('line', { x1: xWLo, y1: cy, x2: xWHi, y2: cy, stroke: strokeColor, 'stroke-width': 1.2 }, bpSvg);
      // Whisker caps
      svgEl('line', { x1: xWLo, y1: boxTop + 3, x2: xWLo, y2: boxBot - 3, stroke: strokeColor, 'stroke-width': 1.2 }, bpSvg);
      svgEl('line', { x1: xWHi, y1: boxTop + 3, x2: xWHi, y2: boxBot - 3, stroke: strokeColor, 'stroke-width': 1.2 }, bpSvg);
      // Box
      svgEl('rect', {
        x: xQ1, y: boxTop, width: Math.max(xQ3 - xQ1, 1), height: boxH,
        fill: fillColor, stroke: strokeColor, 'stroke-width': 1.2, rx: 1,
      }, bpSvg);
      // Median
      svgEl('line', { x1: xMed, y1: boxTop, x2: xMed, y2: boxBot, stroke: strokeColor, 'stroke-width': 2 }, bpSvg);
      // Mean diamond
      const ds = 4;
      svgEl('path', {
        d: `M${xMean},${cy - ds}L${xMean + ds},${cy}L${xMean},${cy + ds}L${xMean - ds},${cy}Z`,
        fill: strokeColor, stroke: resolveColor('var(--color-bg-primary)'), 'stroke-width': 0.8,
      }, bpSvg);
      // Outliers
      stats.outliers.forEach(ov => {
        svgEl('circle', { cx: xScale(ov), cy, r: 2.5, fill: 'none', stroke: strokeColor, 'stroke-width': 1.2 }, bpSvg);
      });
      this._boxplotHitAreas.push({ top: boxTop - 2, bottom: boxBot + 2, stats, series: s });
    });
  },

  // ─── Statistics Table ───────────────────────────────────────

  _renderStats() {
    const panel = this._container?.querySelector('[data-ref="stats-panel"]');
    if (!panel) return;

    if (!this._showStats || !this._seriesData) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }

    const series = this._seriesData.map(s => ({
      name: s.name, values: s.values, color: s.fillColor, visible: s.visible,
    }));
    const seriesStats = computeSeriesStats(series, this._confLevel / 100);
    renderStatsTable(panel, seriesStats, {
      i18n: this._context.i18n,
      confLevel: this._confLevel,
      cssPrefix: 'dmike',
    });
  },

  // ─── Chart Interactions ─────────────────────────────────────

  _setupChartInteractions() {
    const wrap = this._container?.querySelector('[data-ref="chart-wrap"]');
    const tooltip = this._container?.querySelector('[data-ref="tooltip"]');
    const bpPanel = this._container?.querySelector('[data-ref="boxplot-panel"]');
    const bpTooltip = this._container?.querySelector('[data-ref="boxplot-tooltip"]');
    if (!wrap || !tooltip) return;

    // Remove old listeners by replacing wrap content? No, we only call this once per plot.
    const t = (k, v) => this._context.i18n.t(`modules.histogram.${k}`, v);

    // Histogram tooltip — shows all visible series for the hovered bin
    wrap.addEventListener('mousemove', (e) => {
      const rect = wrap.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const target = e.target;

      if (target.hasAttribute && target.hasAttribute('data-bar')) {
        const bi = +target.getAttribute('data-bi');
        const seriesData = this._seriesData;
        const binDataLocal = this._curBinData;
        if (!seriesData || !binDataLocal) { tooltip.classList.remove('visible'); return; }

        // Bin range from first available bin
        let rangeHtml = '';
        for (const s of seriesData) {
          if (s.visible === false) continue;
          const si = seriesData.indexOf(s);
          const bins = binDataLocal.bins[si];
          if (bins && bins[bi]) {
            rangeHtml = `${t('tooltipRange')}: ${formatNum(bins[bi].xMin, 2)} – ${formatNum(bins[bi].xMax, 2)}`;
            break;
          }
        }

        let html = rangeHtml ? rangeHtml + '<br>' : '';

        // Each visible series' count for this bin
        seriesData.forEach((s, si) => {
          if (s.visible === false) return;
          const bins = binDataLocal.bins[si];
          const bin = bins ? bins[bi] : null;
          if (!bin) return;
          let totalN = 0;
          bins.forEach(b => { totalN += b.count; });
          const pct = totalN > 0 ? (bin.count / totalN * 100).toFixed(1) : '0.0';
          html += `<b style="color:${s.fillColor}">${esc(s.name)}</b>: ${bin.count} (${pct}%)<br>`;
        });

        // Pareto cumulative (single series only)
        let visCount = 0;
        seriesData.forEach(sd => { if (sd.visible !== false) visCount++; });
        if (this._showPareto && visCount === 1 && binDataLocal) {
          const si0 = seriesData.findIndex(sd => sd.visible !== false);
          if (si0 >= 0) {
            const bins0 = binDataLocal.bins[si0];
            let total = 0;
            bins0.forEach(b => { total += b.count; });
            if (total > 0) {
              let cumCount = 0;
              for (let ci = 0; ci <= bi; ci++) cumCount += bins0[ci].count;
              html += `<span style="color:rgba(192,57,43,1)">${t('tooltipCum')}: ${(cumCount / total * 100).toFixed(1)}%</span>`;
            }
          }
        }

        tooltip.innerHTML = html;
        tooltip.classList.add('visible');
        tooltip.style.left = `${mx + 12}px`;
        tooltip.style.top = `${my - 10}px`;
      } else {
        tooltip.classList.remove('visible');
      }
    });

    wrap.addEventListener('mouseleave', () => {
      tooltip.classList.remove('visible');
    });

    // Boxplot tooltip (positioned relative to chart-main, so it floats above stats panel)
    const chartMain = this._container?.querySelector('.histogram__chart-main');
    if (bpPanel && bpTooltip && chartMain) {
      bpPanel.addEventListener('mousemove', (e) => {
        if (!this._boxplotHitAreas || !this._boxplotHitAreas.length) return;
        const mainRect = chartMain.getBoundingClientRect();
        const mx = e.clientX - mainRect.left;
        const my = e.clientY - mainRect.top;

        const bpRect = bpPanel.getBoundingClientRect();
        const localY = e.clientY - bpRect.top;

        let hit = null;
        for (const area of this._boxplotHitAreas) {
          if (localY >= area.top && localY <= area.bottom) { hit = area; break; }
        }

        if (hit) {
          const st = hit.stats;
          let html = `<b style="color:${hit.series.fillColor}">${esc(hit.series.name)}</b><br>`;
          html += `Min: ${formatNum(st.min, 3)}<br>`;
          html += `Q1: ${formatNum(st.q1, 3)}<br>`;
          html += `${t('statMedian')}: ${formatNum(st.median, 3)}<br>`;
          html += `Q3: ${formatNum(st.q3, 3)}<br>`;
          html += `Max: ${formatNum(st.max, 3)}<br>`;
          html += `${t('statMean')}: ${formatNum(st.mean, 3)}`;
          if (st.outliers.length > 0) {
            html += `<br><span style="opacity:.7">${t('tooltipOutliers')}: ${st.outliers.length}</span>`;
          }
          bpTooltip.innerHTML = html;
          bpTooltip.classList.add('visible');
          bpTooltip.style.left = `${mx + 12}px`;
          bpTooltip.style.top = `${my - 10}px`;
        } else {
          bpTooltip.classList.remove('visible');
        }
      });

      bpPanel.addEventListener('mouseleave', () => {
        bpTooltip.classList.remove('visible');
      });
    }
  },

};
Object.assign(mod, editorMethods);
export default mod;
