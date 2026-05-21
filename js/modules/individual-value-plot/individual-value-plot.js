/**
 * D.Mike — Individual Value Plot Module (individual-value-plot.js)
 * Data phase: vertical individual-value plots of worksheet columns.
 *
 * Each dataset row selects a numeric value column and an optional grouping
 * column. Without grouping → one column of points per value column.
 * With grouping → one column of points per unique group value.
 *
 * Uses the SVG chart framework (chartManager) for rendering.
 */

import {
  DatasetPicker,
  getColumnValues, getColumnName,
} from '../../ui/dataset-picker.js';

import { computeSeriesStats, renderStatsTable } from '../../core/stats-panel.js';
import { CHART_COLORS } from '../../core/chart/chart-colors.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

export default {
  id: 'individual-value-plot',
  phase: 'data',
  icon: 'scatter-chart',
  i18nKey: 'modules.individual-value-plot',
  version: '1.0.0',

  _container: null,
  _context: null,
  /** Array of column refs (one per dataset row) */
  _seriesRefs: [],
  /** Parallel array: optional grouping column per dataset */
  _groupRefs: [],
  _showMean: true,
  _showMedian: false,
  _connectMeans: false,
  _showOverallMean: false,
  _jitter: 0.6,
  _showStats: true,
  _confLevel: 95,
  _chart: null,
  _plotting: false,
  _refLines: [],
  _refAreas: [],
  _bgColor: null,
  _pointColors: [],
  _pointSymbol: 'circle',
  _pointSize: 6,
  _eventUnsubs: [],
  /** @type {DatasetPicker|null} */
  _picker: null,
  /** Worksheet provisioned by loadExample (cleaned up on next load). */
  _exampleWorksheetId: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('individual-value-plot-css')) {
      const link = document.createElement('link');
      link.id = 'individual-value-plot-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/individual-value-plot/individual-value-plot.css';
      document.head.appendChild(link);
    }

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._loadState(saved);

    this._render();
    this._autoPlot();
  },

  async destroy() {
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
    this._autoPlot();
  },

  onThemeChange() {},

  getState() {
    return {
      seriesRefs: this._seriesRefs,
      groupRefs: this._groupRefs,
      showMean: this._showMean,
      showMedian: this._showMedian,
      connectMeans: this._connectMeans,
      showOverallMean: this._showOverallMean,
      jitter: this._jitter,
      showStats: this._showStats,
      confLevel: this._confLevel,
      refLines: this._refLines,
      refAreas: this._refAreas,
      bgColor: this._bgColor,
      pointColors: this._pointColors,
      pointSymbol: this._pointSymbol,
      pointSize: this._pointSize,
      exampleWorksheetId: this._exampleWorksheetId,
    };
  },

  setState(data) {
    if (data) this._loadState(data);
    if (this._container) {
      if (this._picker) { this._picker.destroy(); this._picker = null; }
      this._render();
      this._autoPlot();
    }
  },

  help: () => import('./individual-value-plot-help.js'),

  /** @private */
  _loadState(saved) {
    this._seriesRefs = saved.seriesRefs || [];
    // Group refs are stored as `[g1, g2, g3]` per series. Old saved state used
    // a single ref or null per series — wrap those into the new array form.
    this._groupRefs = (saved.groupRefs || []).map((g) => {
      if (Array.isArray(g)) {
        return [g[0] || null, g[1] || null, g[2] || null];
      }
      return [g || null, null, null];
    });
    this._showMean = saved.showMean ?? true;
    this._showMedian = saved.showMedian ?? false;
    this._connectMeans = saved.connectMeans ?? false;
    this._showOverallMean = saved.showOverallMean ?? false;
    this._jitter = saved.jitter ?? 0.6;
    this._showStats = saved.showStats ?? true;
    this._confLevel = saved.confLevel ?? 95;
    this._refLines = saved.refLines || [];
    this._refAreas = saved.refAreas || [];
    this._bgColor = saved.bgColor || null;
    this._pointColors = saved.pointColors || [];
    this._pointSymbol = saved.pointSymbol || 'circle';
    this._pointSize = saved.pointSize ?? 6;
    if (saved.exampleWorksheetId !== undefined) this._exampleWorksheetId = saved.exampleWorksheetId;
  },

  /**
   * Load a catalog example. Provisions the included worksheet and rewrites
   * `__source__` placeholders. groupRefs entries are `[g1,g2,g3]` arrays;
   * each leg gets rewritten independently.
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = (this._seriesRefs?.length || 0) > 0;
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
        const rewrite = (r) => (r && r.instanceId === '__source__') ? { ...r, instanceId: ref.instanceId } : r;
        if (Array.isArray(data.seriesRefs)) data.seriesRefs = data.seriesRefs.map(rewrite);
        if (Array.isArray(data.groupRefs)) {
          data.groupRefs = data.groupRefs.map((g) => Array.isArray(g) ? g.map(rewrite) : rewrite(g));
        }
      }
    }

    this.setState(data);
    this._save();

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  // ─── Column helpers ────────────────────────────────────────

  _getColumnValues(ref) {
    return getColumnValues(this._context?.stateManager, ref);
  },

  _getColumnName(ref) {
    return getColumnName(this._context?.stateManager, ref);
  },

  /** Always-length-3 array of group refs for series `i` (entries may be null). */
  _groupRefsAt(i) {
    const g = this._groupRefs[i];
    if (Array.isArray(g)) return [g[0] || null, g[1] || null, g[2] || null];
    return [g || null, null, null];
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (k, v) => this._context.i18n.t(`modules.individual-value-plot.${k}`, v);

    this._container.innerHTML = `
      <div class="ivplot dmike-split">
        <div class="ivplot__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionData')}</div>

          <div data-ref="picker-wrap"></div>

          <div class="ivplot__error" data-ref="error-box"></div>
        </div>

        <div class="ivplot__output dmike-split__output">
          <div class="ivplot__placeholder" data-ref="placeholder">
            <p>${t('placeholderText')}</p>
          </div>
          <div class="ivplot__chart-card" data-ref="chart-card" style="display:none">
            <div class="ivplot__chart-main">
              <div class="ivplot__plot-wrap" data-ref="plot"></div>
            </div>
          </div>
          <div class="dmike-stats-panel" data-ref="stats-panel"></div>
        </div>
      </div>
    `;

    this._createPicker();
    this._bindEvents();
  },

  _createPicker() {
    const pickerWrap = this._container.querySelector('[data-ref="picker-wrap"]');
    if (!pickerWrap) return;

    if (this._picker) { this._picker.destroy(); this._picker = null; }

    this._picker = new DatasetPicker(pickerWrap, this._context, {
      multi: true,
      colors: CHART_COLORS,
      slots: [
        { key: 'value',  label: 'V',  title: this._context.i18n.t('ui.datasetPicker.slotV'),  types: ['numeric'], minCount: 1, required: true },
        { key: 'group',  label: 'G1', title: this._context.i18n.t('ui.datasetPicker.slotG1'), group: true },
        { key: 'group2', label: 'G2', title: this._context.i18n.t('ui.datasetPicker.slotG2'), group: true },
        { key: 'group3', label: 'G3', title: this._context.i18n.t('ui.datasetPicker.slotG3'), group: true },
      ],
      onChange: (datasets) => {
        const valid = datasets.filter((ds) => ds.value != null);
        this._seriesRefs = valid.map((ds) => ds.value);
        this._groupRefs = valid.map((ds) => [ds.group || null, ds.group2 || null, ds.group3 || null]);
        this._save();
        this._autoPlot();
      },
    });

    if (this._seriesRefs.length > 0) {
      this._picker.value = this._seriesRefs.map((ref, i) => {
        const arr = this._groupRefsAt(i);
        return {
          value: ref,
          group:  arr[0] || null,
          group2: arr[1] || null,
          group3: arr[2] || null,
        };
      });
    }
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindEvents() {},

  _showError(msg) {
    const errBox = this._container?.querySelector('[data-ref="error-box"]');
    if (errBox) {
      errBox.textContent = msg;
      errBox.style.display = 'block';
      setTimeout(() => { errBox.style.display = 'none'; }, 4000);
    }
  },

  _save() {
    this._syncFromChart();
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  _destroyChart() {
    if (this._chart) {
      this._context.chartManager.destroy(this._chart);
      this._chart = null;
    }
  },

  // ─── Auto-Plot ──────────────────────────────────────────────

  /** Sync option toggles from the live chart back to module state */
  _syncFromChart() {
    if (this._chart && this._chart.config) {
      const c = this._chart.config;
      this._showMean = c.showMean ?? this._showMean;
      this._showMedian = c.showMedian ?? this._showMedian;
      this._connectMeans = c.connectMeans ?? this._connectMeans;
      this._showOverallMean = c.showOverallMean ?? this._showOverallMean;
      this._jitter = c.jitter ?? this._jitter;
      this._pointSymbol = c.pointSymbol ?? this._pointSymbol;
      this._pointSize = c.pointSize ?? this._pointSize;
    }
  },

  _autoPlot() {
    const hasData = this._seriesRefs.length > 0;

    if (!hasData) {
      this._destroyChart();
      const placeholder = this._container?.querySelector('[data-ref="placeholder"]');
      const chartCard = this._container?.querySelector('[data-ref="chart-card"]');
      if (placeholder) placeholder.style.display = '';
      if (chartCard) chartCard.style.display = 'none';
      return;
    }

    this._syncFromChart();
    this._plot();
  },

  // ─── Plot ───────────────────────────────────────────────────

  async _plot() {
    if (this._plotting) return;
    this._plotting = true;

    const t = (k, v) => this._context.i18n.t(`modules.individual-value-plot.${k}`, v);
    const errBox = this._container?.querySelector('[data-ref="error-box"]');
    if (errBox) errBox.style.display = 'none';

    let groups;

    try {
      groups = this._buildGroups(t);
    } catch (err) {
      this._showError(err.message);
      this._plotting = false;
      return;
    }

    if (!groups || groups.length === 0) {
      this._showError(t('errNoData'));
      this._plotting = false;
      return;
    }

    const placeholder = this._container.querySelector('[data-ref="placeholder"]');
    const chartCard = this._container.querySelector('[data-ref="chart-card"]');
    const plotEl = this._container.querySelector('[data-ref="plot"]');
    if (placeholder) placeholder.style.display = 'none';
    if (chartCard) chartCard.style.display = '';

    this._destroyChart();
    if (plotEl) plotEl.innerHTML = '';

    try {
      this._chart = await this._context.chartManager.create(plotEl, 'individual-value-plot', {
        title: t('chartTitle'),
        xLabel: '',
        yLabel: t('yLabel'),
        showLegend: groups.length > 1,
        showXTicks: false,
        showMean: this._showMean,
        showMedian: this._showMedian,
        connectMeans: this._connectMeans,
        showOverallMean: this._showOverallMean,
        jitter: this._jitter,
        groups,
        pointColors: this._pointColors,
        pointSymbol: this._pointSymbol,
        pointSize: this._pointSize,
        refLines: this._refLines,
        refAreas: this._refAreas,
        bgColor: this._bgColor,
      });
    } catch (err) {
      this._showError(err.message || t('errGeneric'));
    }

    this._lastGroups = groups;
    this._renderStats();
    this._plotting = false;
  },

  _renderStats() {
    const panel = this._container?.querySelector('[data-ref="stats-panel"]');
    if (!panel) return;

    if (!this._showStats || !this._lastGroups) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }

    const series = this._lastGroups.map((g, i) => ({
      name: g.name,
      values: g.values,
      color: (this._pointColors[i] || CHART_COLORS[i % CHART_COLORS.length]),
      visible: true,
    }));
    const seriesStats = computeSeriesStats(series, this._confLevel / 100);
    renderStatsTable(panel, seriesStats, {
      i18n: this._context.i18n,
      confLevel: this._confLevel,
    });
  },

  /**
   * Build groups from all datasets.
   * Each dataset has a value column and optionally a grouping column.
   * Without grouping: one column per dataset.
   * With grouping: one column per unique group value within that dataset.
   */
  _buildGroups(t) {
    if (this._seriesRefs.length === 0) {
      throw new Error(t('errNoSeries'));
    }

    const groups = [];
    for (let i = 0; i < this._seriesRefs.length; i++) {
      const ref = this._seriesRefs[i];
      const activeGroupRefs = this._groupRefsAt(i).filter(Boolean);
      const rawVals = this._getColumnValues(ref);
      const colName = this._getColumnName(ref);

      if (activeGroupRefs.length === 0) {
        const values = rawVals.filter((v) => v != null && typeof v === 'number' && !isNaN(v));
        if (values.length < 1) {
          throw new Error(t('errTooFew', { col: colName }));
        }
        groups.push({ name: colName, values });
      } else {
        const groupCols = activeGroupRefs.map((gr) => this._getColumnValues(gr));
        const len = Math.min(rawVals.length, ...groupCols.map((arr) => arr.length));
        const buckets = new Map();
        const order = [];
        for (let j = 0; j < len; j++) {
          const v = rawVals[j];
          if (v == null || typeof v !== 'number' || isNaN(v)) continue;
          const tuple = groupCols.map((arr) => arr[j]);
          if (tuple.some((x) => x == null)) continue;
          const key = tuple.map(String).join(' | ');
          if (!buckets.has(key)) {
            buckets.set(key, []);
            order.push(key);
          }
          buckets.get(key).push(v);
        }
        for (const key of order) {
          const values = buckets.get(key);
          if (values.length < 1) continue;
          groups.push({ name: `${colName} — ${key}`, values });
        }
      }
    }

    if (groups.length === 0) throw new Error(t('errNoData'));
    return groups;
  },
};
