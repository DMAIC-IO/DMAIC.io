/**
 * D.Mike — XY-Plot Module (xy-plot.js)
 * Data phase: scatter/line plot of worksheet columns.
 * Each dataset has its own X and Y column — datasets need not share X data.
 * Optional Size slot turns the dataset into a bubble plot (third numeric column
 * sqrt-mapped to 6–28 px marker diameter so area stays proportional to value).
 * Uses the SVG chart framework (chartManager) for rendering.
 * Includes editor panel for series customization, reference lines/areas.
 */

import {
  edCheckboxRow, edSelectRow,
  edColorPair, edExpandBtn,
  openColorPicker,
} from '../../core/chart/chart-editor.js';

import {
  DatasetPicker,
  getColumnValues, getColumnName,
} from '../../ui/dataset-picker.js';

import { computeSeriesStats, renderStatsTable } from '../../core/stats-panel.js';
import { CHART_COLORS } from '../../core/chart/chart-colors.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

export default {
  id: 'xy-plot',
  phase: 'data',
  icon: 'scatter-chart',
  i18nKey: 'modules.xy-plot',
  version: '1.4.0',
  help: () => import('./xy-plot-help.js'),

  _container: null,
  _context: null,
  /** @type {{ xRef: object|null, yRef: object|null, groupRef: object|null }[]} */
  _datasets: [],
  _showLines: false,
  _showMarkers: true,
  _eventUnsubs: [],
  _chart: null,
  _plotting: false,
  /** @type {Object[]} overrides per dataset: { color, stroke, strokeWidth, symbol, name, visible, connectLine } */
  _seriesOverrides: [],
  /** @type {Object[]} */
  _refLines: [],
  /** @type {Object[]} */
  _refAreas: [],
  _activeColorPicker: null,
  _bgColor: null,
  _showStats: true,
  _confLevel: 95,
  /** @type {DatasetPicker|null} */
  _picker: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    // Reset per-instance state — the registry uses a shallow spread of the
    // module export, so arrays/objects from the definition are shared across
    // instances until reassigned.
    this._datasets = [{ xRef: null, yRef: null, groupRef: null, sizeRef: null }];
    this._showLines = false;
    this._showMarkers = true;
    this._seriesOverrides = [];
    this._refLines = [];
    this._refAreas = [];
    this._eventUnsubs = [];
    this._chart = null;
    this._plotting = false;
    this._activeColorPicker = null;
    this._bgColor = null;
    this._showStats = true;
    this._confLevel = 95;
    this._picker = null;
    this._exampleWorksheetId = null;

    if (!document.getElementById('xy-plot-css')) {
      const link = document.createElement('link');
      link.id = 'xy-plot-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/xy-plot/xy-plot.css';
      document.head.appendChild(link);
    }

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._loadState(saved);

    this._render();
    this._bindContainerEvents();
    this._plot();
  },

  async destroy() {
    this._closeCp();
    for (const unsub of this._eventUnsubs) unsub();
    this._eventUnsubs = [];
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._destroyChart();
    this._container.innerHTML = '';
  },

  onLanguageChange() {
    this._destroyChart();
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._render();
    this._plot();
  },

  onThemeChange() {},

  getState() {
    return {
      datasets: this._datasets.map(d => ({
        xRef: d.xRef,
        yRef: d.yRef,
        groupRef: d.groupRef || null,
        sizeRef: d.sizeRef || null,
      })),
      showLines: this._showLines,
      showMarkers: this._showMarkers,
      seriesOverrides: this._seriesOverrides,
      refLines: this._refLines,
      refAreas: this._refAreas,
      bgColor: this._bgColor,
      showStats: this._showStats,
      confLevel: this._confLevel,
      exampleWorksheetId: this._exampleWorksheetId,
    };
  },

  setState(data) {
    if (data) this._loadState(data);
    if (this._container) {
      if (this._picker) { this._picker.destroy(); this._picker = null; }
      this._render();
      this._plot();
    }
  },

  /**
   * Load a catalog example — provision a worksheet, rewrite the placeholder
   * `__source__` instanceId in each dataset's xRef/yRef/groupRef, then
   * apply the state and re-plot.
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = Array.isArray(this._datasets)
      && this._datasets.some(d => d.xRef || d.yRef);
    if (hasContent && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    const data = { ...payload.data };

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
        data.exampleWorksheetId = ref.instanceId;
        const rewrite = (r) => (r && r.instanceId === '__source__')
          ? { ...r, instanceId: ref.instanceId }
          : r;
        data.datasets = (data.datasets || []).map(d => ({
          ...d,
          xRef: rewrite(d.xRef),
          yRef: rewrite(d.yRef),
          groupRef: rewrite(d.groupRef),
          sizeRef: rewrite(d.sizeRef),
        }));
      }
    }

    this.setState(data);

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  /** @private — load state with backward compat for v1 format (colRefX + seriesRefs) */
  _loadState(saved) {
    if (saved.datasets) {
      this._datasets = saved.datasets.map(d => ({
        xRef: d.xRef || null,
        yRef: d.yRef || null,
        groupRef: d.groupRef || null,
        sizeRef: d.sizeRef || null,
      }));
    } else if (saved.colRefX && saved.seriesRefs) {
      // Migrate v1 → v2: shared X becomes per-dataset X
      this._datasets = saved.seriesRefs.map(yRef => ({
        xRef: saved.colRefX,
        yRef,
        groupRef: null,
        sizeRef: null,
      }));
    } else {
      this._datasets = [{ xRef: null, yRef: null, groupRef: null, sizeRef: null }];
    }
    if (saved.exampleWorksheetId !== undefined) this._exampleWorksheetId = saved.exampleWorksheetId;
    this._showLines = saved.showLines ?? false;
    this._showMarkers = saved.showMarkers ?? true;
    this._seriesOverrides = saved.seriesOverrides || [];
    this._refLines = saved.refLines || [];
    this._refAreas = saved.refAreas || [];
    this._bgColor = saved.bgColor || null;
    this._showStats = saved.showStats ?? true;
    this._confLevel = saved.confLevel ?? 95;
  },

  // ─── Column helpers ────────────────────────────────────────

  _getColumnValues(ref) {
    return getColumnValues(this._context?.stateManager, ref);
  },

  _getColumnName(ref) {
    return getColumnName(this._context?.stateManager, ref);
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (k, v) => this._context.i18n.t(`modules.xy-plot.${k}`, v);

    this._container.innerHTML = `
      <div class="xyplot dmike-split">
        <div class="xyplot__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionData')}</div>

          <div data-ref="picker-wrap"></div>

          <div class="xyplot__error" data-ref="error-box"></div>
        </div>

        <div class="xyplot__output dmike-split__output">
          <div class="xyplot__placeholder" data-ref="placeholder"></div>
          <div class="xyplot__plot-wrap" data-ref="plot" style="display:none"></div>
          <div class="dmike-stats-panel" data-ref="stats-panel"></div>
        </div>
      </div>
    `;

    this._createPicker();
  },

  _createPicker() {
    const pickerWrap = this._container.querySelector('[data-ref="picker-wrap"]');
    if (!pickerWrap) return;

    if (this._picker) { this._picker.destroy(); this._picker = null; }

    this._picker = new DatasetPicker(pickerWrap, this._context, {
      multi: true,
      colors: CHART_COLORS,
      slots: [
        { key: 'x', label: 'X', title: this._context.i18n.t('ui.datasetPicker.slotX'), types: ['numeric'], minCount: 1, required: true },
        { key: 'y', label: 'Y', title: this._context.i18n.t('ui.datasetPicker.slotY'), types: ['numeric'], minCount: 1, required: true },
        { key: 'group', label: 'G', title: this._context.i18n.t('ui.datasetPicker.slotG'), group: true },
        { key: 'size', label: 'S', title: this._context.i18n.t('ui.datasetPicker.slotS'), types: ['numeric'], minCount: 1 },
      ],
      onChange: (datasets) => {
        this._datasets = datasets.map(ds => ({
          xRef: ds.x || null,
          yRef: ds.y || null,
          groupRef: ds.group || null,
          sizeRef: ds.size || null,
        }));
        // Series count may change — drop stale overrides when structure changes.
        this._seriesOverrides = [];
        this._save();
        this._plot();
      },
    });

    // Restore saved refs
    if (this._datasets.some(ds => ds.xRef || ds.yRef || ds.groupRef || ds.sizeRef)) {
      this._picker.value = this._datasets.map(ds => ({
        x: ds.xRef,
        y: ds.yRef,
        group: ds.groupRef,
        size: ds.sizeRef,
      }));
    }
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindContainerEvents() {
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

  // ─── Plot ───────────────────────────────────────────────────

  _showPlaceholder() {
    const placeholder = this._container?.querySelector('[data-ref="placeholder"]');
    const plotEl = this._container?.querySelector('[data-ref="plot"]');
    if (placeholder) placeholder.style.display = '';
    if (plotEl) {
      plotEl.style.display = 'none';
      plotEl.innerHTML = '';
    }
    this._destroyChart();
  },

  async _plot() {
    if (this._plotting) return;
    this._plotting = true;

    const t = (k, v) => this._context.i18n.t(`modules.xy-plot.${k}`, v);
    const errBox = this._container?.querySelector('[data-ref="error-box"]');
    if (errBox) errBox.style.display = 'none';

    const series = [];
    const pushSeries = (x, y, name, bubble) => {
      const seriesIdx = series.length;
      const defaultColor = CHART_COLORS[seriesIdx % CHART_COLORS.length];
      const ovr = this._seriesOverrides[seriesIdx] || {};
      const s = {
        name: ovr.name || name,
        color: ovr.color || defaultColor,
        stroke: ovr.stroke || 'rgba(255,255,255,1)',
        strokeWidth: ovr.strokeWidth ?? 1.5,
        symbol: ovr.symbol || 'circle',
        visible: ovr.visible !== false,
        x,
        y,
        markerSize: this._showMarkers ? 7 : 0,
        connectLine: ovr.connectLine || {
          show: this._showLines,
          color: ovr.color || defaultColor,
          dash: 'solid',
          width: 2,
        },
      };
      if (bubble && this._showMarkers) {
        s.sizes = bubble.sizes;
        s.sizeValues = bubble.rawSizes;
        s.sizeLabel = bubble.label;
      }
      series.push(s);
    };

    let firstReadyXRef = null;
    for (let i = 0; i < this._datasets.length; i++) {
      const ds = this._datasets[i];
      // Skip incomplete datasets silently — the chart updates as the user selects columns.
      if (!ds.xRef || !ds.yRef) continue;
      if (!firstReadyXRef) firstReadyXRef = ds.xRef;

      const xVals = this._getColumnValues(ds.xRef);
      const yVals = this._getColumnValues(ds.yRef);
      const yName = this._getColumnName(ds.yRef);
      const groupVals = ds.groupRef ? this._getColumnValues(ds.groupRef) : null;
      const sizeVals = ds.sizeRef ? this._getColumnValues(ds.sizeRef) : null;
      const sizeName = ds.sizeRef ? this._getColumnName(ds.sizeRef) : '';

      if (groupVals) {
        // Split into one sub-series per unique group level (insertion order).
        const buckets = new Map();
        const len = Math.min(
          xVals.length, yVals.length, groupVals.length,
          sizeVals ? sizeVals.length : Infinity,
        );
        for (let r = 0; r < len; r++) {
          const vx = xVals[r], vy = yVals[r], vg = groupVals[r];
          if (vx == null || typeof vx !== 'number' || isNaN(vx)) continue;
          if (vy == null || typeof vy !== 'number' || isNaN(vy)) continue;
          if (vg == null || vg === '') continue;
          if (sizeVals) {
            const vs = sizeVals[r];
            if (typeof vs !== 'number' || isNaN(vs) || vs < 0) continue;
          }
          const key = String(vg);
          let b = buckets.get(key);
          if (!b) {
            b = { level: vg, x: [], y: [], rawSizes: sizeVals ? [] : null };
            buckets.set(key, b);
          }
          b.x.push(vx);
          b.y.push(vy);
          if (sizeVals) b.rawSizes.push(sizeVals[r]);
        }

        if (buckets.size === 0) {
          this._showError(t('errNoGroupLevels', { n: i + 1 }));
          this._plotting = false;
          return;
        }

        let hasAny = false;
        for (const b of buckets.values()) {
          if (b.x.length < 2) continue;
          const bubble = b.rawSizes ? this._buildBubble(b.rawSizes, sizeName) : null;
          pushSeries(b.x, b.y, t('groupSeriesName', { y: yName, level: String(b.level) }), bubble);
          hasAny = true;
        }
        if (!hasAny) {
          this._showError(t('errTooFew', { col: yName }));
          this._plotting = false;
          return;
        }
      } else {
        const x = [], y = [], rawSizes = sizeVals ? [] : null;
        const len = Math.min(
          xVals.length, yVals.length,
          sizeVals ? sizeVals.length : Infinity,
        );
        for (let r = 0; r < len; r++) {
          const vx = xVals[r], vy = yVals[r];
          if (vx == null || typeof vx !== 'number' || isNaN(vx)) continue;
          if (vy == null || typeof vy !== 'number' || isNaN(vy)) continue;
          if (sizeVals) {
            const vs = sizeVals[r];
            if (typeof vs !== 'number' || isNaN(vs) || vs < 0) continue;
            rawSizes.push(vs);
          }
          x.push(vx);
          y.push(vy);
        }

        if (x.length < 2) {
          this._showError(t('errTooFew', { col: yName }));
          this._plotting = false;
          return;
        }

        const bubble = rawSizes ? this._buildBubble(rawSizes, sizeName) : null;
        pushSeries(x, y, yName, bubble);
      }
    }

    if (series.length === 0) {
      // Nothing ready to plot yet — fall back to placeholder.
      this._showPlaceholder();
      this._plotting = false;
      return;
    }

    const placeholder = this._container.querySelector('[data-ref="placeholder"]');
    const plotEl = this._container.querySelector('[data-ref="plot"]');
    if (placeholder) placeholder.style.display = 'none';
    if (plotEl) plotEl.style.display = '';

    this._destroyChart();
    if (plotEl) plotEl.innerHTML = '';

    // Use the first ready dataset's X column name as default x label
    const xLabel = this._getColumnName(firstReadyXRef);

    try {
      this._chart = await this._context.chartManager.create(plotEl, 'scatter', {
        title: '',
        xLabel,
        yLabel: '',
        showLegend: this._context.stateManager.get('settings.chartShowLegend') !== false,
        series,
        refLines: this._refLines,
        refAreas: this._refAreas,
        ...(this._bgColor ? { bgColor: this._bgColor } : {}),
        onSeriesChange: (idx, key, value) => {
          this._syncSeriesOverride(idx, key, value);
        },
        onEditorBuild: (editorInner, t, onUpdate, seriesItemEls) => {
          this._appendSeriesDetails(editorInner, seriesItemEls);
        },
      });
    } finally {
      this._plotting = false;
    }

    this._lastSeries = series;
    this._renderStats();
    this._save();
  },

  _renderStats() {
    const panel = this._container?.querySelector('[data-ref="stats-panel"]');
    if (!panel) return;

    if (!this._showStats || !this._lastSeries || this._lastSeries.length === 0) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }

    const mapped = this._lastSeries
      .filter(s => s.visible !== false)
      .map(s => ({
        name: s.name,
        values: s.y,
        color: s.color,
        visible: true,
      }));
    const seriesStats = computeSeriesStats(mapped, this._confLevel / 100);
    renderStatsTable(panel, seriesStats, {
      i18n: this._context.i18n,
      confLevel: this._confLevel,
    });
  },

  // ─── Bubble helper ──────────────────────────────────────────

  /**
   * Map non-negative raw sizes to a 6–28 px diameter range via sqrt-normalisation,
   * so that bubble AREA stays proportional to the raw value.
   * @private
   * @param {number[]} rawSizes
   * @param {string} label
   * @returns {{ sizes: number[], rawSizes: number[], label: string }}
   */
  _buildBubble(rawSizes, label) {
    const D_MIN = 6, D_MAX = 28;
    const sqrtVals = rawSizes.map(Math.sqrt);
    const sMin = Math.min(...sqrtVals);
    const sMax = Math.max(...sqrtVals);
    const span = sMax - sMin;
    const sizes = sqrtVals.map(sv => {
      const t = span > 0 ? (sv - sMin) / span : 0.5;
      return D_MIN + t * (D_MAX - D_MIN);
    });
    return { sizes, rawSizes, label };
  },

  // ─── Chart cleanup ──────────────────────────────────────────

  _destroyChart() {
    this._closeCp();
    if (this._chart) {
      this._context.chartManager.destroy(this._chart);
      this._chart = null;
    }
  },

  // ─── Series Detail Panels (appended to base-provided series items) ──

  _appendSeriesDetails(inner, seriesItemEls) {
    if (!seriesItemEls || !seriesItemEls.length) return;
    const t = (k) => this._context.i18n.t(`modules.xy-plot.${k}`);
    const chartSeries = this._chart?.config?.series || [];

    for (let idx = 0; idx < seriesItemEls.length && idx < chartSeries.length; idx++) {
      const item = seriesItemEls[idx];
      const ser = chartSeries[idx];

      const detail = document.createElement('div');
      detail.className = 'dmike-chart-ed-series-detail';

      // Marker styling (symbol, size, fill, border) is provided by scatter._buildTypeEditor.

      const cl = ser.connectLine || { show: false, color: ser.color, dash: 'solid', width: 2 };
      const clTitle = document.createElement('div');
      clTitle.className = 'dmike-chart-ed-subsection-title';
      clTitle.textContent = t('edConnectLine');
      detail.appendChild(clTitle);

      detail.appendChild(edCheckboxRow(t('edShow'), !!cl.show, (v) => {
        cl.show = v;
        this._syncSeriesOverride(idx, 'connectLine', { ...cl });
        if (this._chart) this._chart.render();
      }));

      const { el: clColorRow, swatch: clSw } = edColorPair(t('edColor'), cl.color || ser.color, (e) => {
        this._closeCp();
        const p = openColorPicker(e, cl.color || ser.color, (c) => {
          cl.color = c;
          clSw.style.background = c;
          this._syncSeriesOverride(idx, 'connectLine', { ...cl });
          if (this._chart) this._chart.render();
        });
        this._activeColorPicker = p;
      });
      detail.appendChild(clColorRow);

      detail.appendChild(edSelectRow(t('edLineStyle'), [
        { value: 'solid', label: 'Solid' }, { value: 'dash', label: 'Dash' },
        { value: 'dot', label: 'Dot' }, { value: 'dashdot', label: 'Dash-Dot' },
        { value: 'longdash', label: 'Long dash' },
      ], cl.dash || 'solid', (v) => {
        cl.dash = v;
        this._syncSeriesOverride(idx, 'connectLine', { ...cl });
        if (this._chart) this._chart.render();
      }));

      item.appendChild(detail);
      item.appendChild(edExpandBtn(t('edDetails'), detail));
    }
  },

  _syncSeriesOverride(idx, key, value) {
    while (this._seriesOverrides.length <= idx) this._seriesOverrides.push({});
    this._seriesOverrides[idx][key] = value;
    this._save();
  },

  // ── Color Picker lifecycle ──

  _closeCp() {
    if (this._activeColorPicker) {
      this._activeColorPicker.close();
      this._activeColorPicker = null;
    }
  },
};
