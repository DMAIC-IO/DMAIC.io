/**
 * D.Mike — Probability Plot Module (probability-plot.js)
 * Data phase: normal probability plot (Wahrscheinlichkeitsnetz)
 * for a single numeric worksheet column.
 *
 * Renders sorted sample values against theoretical normal quantiles
 * (Blom plotting positions) on a probability-paper Y-axis, plus a
 * least-squares-style reference line through Q1/Q3 — points close to
 * the line indicate approximate normality.
 *
 * Uses the SVG chart framework (chartManager) for rendering.
 */

import {
  esc,
} from '../../core/chart/chart-editor.js';

import {
  discoverColumns, getColumnValues, getColumnName,
  refToKey, keyToRef, isPickerFocused,
} from '../../ui/column-picker.js';

import { computeSeriesStats, renderStatsTable } from '../../core/stats-panel.js';

export default {
  id: 'probability-plot',
  phase: 'data',
  icon: 'trending-up',
  i18nKey: 'modules.probability-plot',
  version: '1.0.0',

  _container: null,
  _context: null,
  /** @type {{instanceId:string,sheetId:string,columnId:string}|null} */
  _columnRef: null,
  _chart: null,
  _plotting: false,
  _refLines: [],
  _refAreas: [],
  _bgColor: null,
  _markerColor: null,
  _lineColor: null,
  _markerSymbol: null,
  _markerSize: null,
  _markerStroke: null,
  _markerStrokeWidth: null,
  _showStats: true,
  _confLevel: 95,
  _eventUnsubs: [],

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('probability-plot-css')) {
      const link = document.createElement('link');
      link.id = 'probability-plot-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/probability-plot/probability-plot.css';
      document.head.appendChild(link);
    }

    const onRefresh = () => this._refreshSelectors();
    context.eventBus.on('state:saved', onRefresh);
    context.eventBus.on('worksheet:dataChanged', onRefresh);
    this._eventUnsubs.push(
      () => context.eventBus.off('state:saved', onRefresh),
      () => context.eventBus.off('worksheet:dataChanged', onRefresh),
    );
    const onAdd = ({ moduleId }) => { if (moduleId === 'worksheet') onRefresh(); };
    context.eventBus.on('module:added', onAdd);
    this._eventUnsubs.push(() => context.eventBus.off('module:added', onAdd));
    const onRem = ({ moduleId }) => { if (moduleId === 'worksheet') onRefresh(); };
    context.eventBus.on('module:removed', onRem);
    this._eventUnsubs.push(() => context.eventBus.off('module:removed', onRem));
    const onAct = ({ instanceId }) => { if (instanceId === context.instanceId) onRefresh(); };
    context.eventBus.on('module:activated', onAct);
    this._eventUnsubs.push(() => context.eventBus.off('module:activated', onAct));

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._loadState(saved);

    this._render();
    this._bindContainerEvents();
    this._autoPlot();
  },

  async destroy() {
    for (const unsub of this._eventUnsubs) unsub();
    this._eventUnsubs = [];
    this._destroyChart();
    this._container.innerHTML = '';
  },

  onLanguageChange() {
    this._destroyChart();
    this._render();
    this._bindContainerEvents();
    this._autoPlot();
  },

  onThemeChange() {},

  getState() {
    return {
      columnRef: this._columnRef,
      refLines: this._refLines,
      refAreas: this._refAreas,
      bgColor: this._bgColor,
      markerColor: this._markerColor,
      lineColor: this._lineColor,
      markerSymbol: this._markerSymbol,
      markerSize: this._markerSize,
      markerStroke: this._markerStroke,
      markerStrokeWidth: this._markerStrokeWidth,
      showStats: this._showStats,
      confLevel: this._confLevel,
    };
  },

  setState(data) {
    if (data) this._loadState(data);
    if (this._container) {
      this._render();
      this._bindContainerEvents();
      this._autoPlot();
    }
  },

  help: () => import('./probability-plot-help.js'),

  /** @private */
  _loadState(saved) {
    this._columnRef = saved.columnRef || null;
    this._refLines = saved.refLines || [];
    this._refAreas = saved.refAreas || [];
    this._bgColor = saved.bgColor || null;
    this._markerColor = saved.markerColor || null;
    this._lineColor = saved.lineColor || null;
    this._markerSymbol = saved.markerSymbol || null;
    this._markerSize = saved.markerSize ?? null;
    this._markerStroke = saved.markerStroke || null;
    this._markerStrokeWidth = saved.markerStrokeWidth ?? null;
    this._showStats = saved.showStats ?? true;
    this._confLevel = saved.confLevel ?? 95;
  },

  // ─── Worksheet Column Discovery ─────────────────────────────

  _getNumericColumns() {
    const sm = this._context?.stateManager;
    if (!sm) return [];
    return discoverColumns(sm, { types: ['numeric'], minCount: 2 });
  },

  _getColumnValues(ref) {
    return getColumnValues(this._context?.stateManager, ref);
  },

  _getColumnName(ref) {
    return getColumnName(this._context?.stateManager, ref);
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (k, v) => this._context.i18n.t(`modules.probability-plot.${k}`, v);

    this._container.innerHTML = `
      <div class="probplot dmike-split">
        <div class="probplot__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionData')}</div>

          <div data-ref="col-panel">
            ${this._buildColumnPanel()}
          </div>

          <div class="probplot__error" data-ref="error-box"></div>

        </div>

        <div class="probplot__output dmike-split__output">
          <div class="probplot__placeholder" data-ref="placeholder">
            <p>${t('placeholderText')}</p>
          </div>
          <div class="probplot__chart-card" data-ref="chart-card" style="display:none">
            <div class="probplot__chart-main">
              <div class="probplot__plot-wrap" data-ref="plot"></div>
            </div>
          </div>
          <div class="dmike-stats-panel" data-ref="stats-panel"></div>
        </div>
      </div>
    `;

    this._bindEvents();
  },

  _buildColumnPanel() {
    const t = (k, v) => this._context.i18n.t(`modules.probability-plot.${k}`, v);
    const cols = this._getNumericColumns();

    if (cols.length === 0) {
      return `
        <div class="field-group">
          <label>${t('valueColumn')}</label>
          <select class="field" data-ref="col-select" disabled>
            <option>${t('noNumericColumns')}</option>
          </select>
        </div>`;
    }

    const refKey = refToKey(this._columnRef);
    let opts = `<option value="">${t('selectColumn')}</option>`;
    const grouped = {};
    for (const c of cols) (grouped[c.sheetName] ||= []).push(c);
    for (const [group, gcols] of Object.entries(grouped)) {
      opts += `<optgroup label="${esc(group)}">`;
      for (const c of gcols) {
        const key = refToKey(c);
        const sel = key === refKey ? ' selected' : '';
        opts += `<option value="${key}"${sel}>${esc(c.shortName)} ${esc(c.columnName)} (n=${c.valueCount})</option>`;
      }
      opts += `</optgroup>`;
    }

    return `
      <div class="field-group">
        <label>${t('valueColumn')}</label>
        <select class="field" data-ref="col-select">${opts}</select>
      </div>`;
  },

  _refreshSelectors(force = false) {
    const panel = this._container?.querySelector('[data-ref="col-panel"]');
    if (!panel) return;
    if (!force && isPickerFocused(panel)) return;

    panel.innerHTML = this._buildColumnPanel();
    this._bindColEvents();
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindContainerEvents() {
    this._container.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      if (action === 'reset') this._reset();
    });
  },

  _bindEvents() {
    this._bindColEvents();
  },

  _bindColEvents() {
    const sel = this._container?.querySelector('[data-ref="col-select"]');
    if (!sel) return;
    sel.addEventListener('change', () => {
      this._columnRef = sel.value ? keyToRef(sel.value) : null;
      this._save();
      this._autoPlot();
    });
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
    this._syncFromChart();
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  _reset() {
    this._columnRef = null;
    this._refLines = [];
    this._refAreas = [];
    this._bgColor = null;
    this._markerColor = null;
    this._lineColor = null;
    this._markerSymbol = null;
    this._markerSize = null;
    this._markerStroke = null;
    this._markerStrokeWidth = null;
    this._destroyChart();
    this._save();
    this._render();
    this._bindContainerEvents();
  },

  _destroyChart() {
    if (this._chart) {
      this._context.chartManager.destroy(this._chart);
      this._chart = null;
    }
  },

  /** Sync editor-changed config back to module state */
  _syncFromChart() {
    if (this._chart && this._chart.config) {
      this._refLines = this._chart.config.refLines || this._refLines;
      this._refAreas = this._chart.config.refAreas || this._refAreas;
      this._bgColor = this._chart.config.bgColor ?? this._bgColor;
      this._markerColor = this._chart.config.markerColor ?? this._markerColor;
      this._lineColor = this._chart.config.lineColor ?? this._lineColor;
      this._markerSymbol = this._chart.config.markerSymbol ?? this._markerSymbol;
      this._markerSize = this._chart.config.markerSize ?? this._markerSize;
      this._markerStroke = this._chart.config.markerStroke ?? this._markerStroke;
      this._markerStrokeWidth = this._chart.config.markerStrokeWidth ?? this._markerStrokeWidth;
    }
  },

  // ─── Auto-Plot ──────────────────────────────────────────────

  _autoPlot() {
    if (!this._columnRef) {
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

    const t = (k, v) => this._context.i18n.t(`modules.probability-plot.${k}`, v);
    const errBox = this._container?.querySelector('[data-ref="error-box"]');
    if (errBox) errBox.style.display = 'none';

    const rawVals = this._getColumnValues(this._columnRef);
    const colName = this._getColumnName(this._columnRef);
    const values = rawVals.filter(v => v != null && typeof v === 'number' && !isNaN(v));

    if (values.length < 2) {
      this._showError(t('errTooFew', { col: colName }));
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
      const chartCfg = {
        title: t('chartTitle', { col: colName }),
        xLabel: colName,
        yLabel: t('yLabel'),
        showLegend: true,
        data: values,
        markerColor: this._markerColor,
        lineColor: this._lineColor,
        refLines: this._refLines,
        refAreas: this._refAreas,
        bgColor: this._bgColor,
      };
      if (this._markerSymbol != null) chartCfg.markerSymbol = this._markerSymbol;
      if (this._markerSize != null) chartCfg.markerSize = this._markerSize;
      if (this._markerStroke != null) chartCfg.markerStroke = this._markerStroke;
      if (this._markerStrokeWidth != null) chartCfg.markerStrokeWidth = this._markerStrokeWidth;
      this._chart = await this._context.chartManager.create(plotEl, 'probability-plot', chartCfg);
    } catch (err) {
      this._showError(err.message || t('errGeneric'));
    }

    this._lastValues = values;
    this._lastColName = colName;
    this._renderStats();
    this._plotting = false;
  },

  _renderStats() {
    const panel = this._container?.querySelector('[data-ref="stats-panel"]');
    if (!panel) return;

    if (!this._showStats || !this._lastValues || this._lastValues.length === 0) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }

    const series = [{
      name: this._lastColName || '?',
      values: this._lastValues,
      color: this._markerColor || 'var(--color-chart-1)',
      visible: true,
    }];
    const seriesStats = computeSeriesStats(series, this._confLevel / 100);
    renderStatsTable(panel, seriesStats, {
      i18n: this._context.i18n,
      confLevel: this._confLevel,
    });
  },
};
