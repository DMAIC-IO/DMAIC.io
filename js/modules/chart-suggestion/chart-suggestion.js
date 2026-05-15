/**
 * D.Mike — Chart Suggestion Module (chart-suggestion.js)
 *
 * Data phase: given a column selection (snapshotted from the worksheet at
 * click time), proposes a ranked list of chart types based on the analytical
 * roles of the selected columns. Clicking a suggestion renders the chart in
 * the right pane.
 *
 * Triggered from the Worksheet toolbar via the event-bus message
 * `chart-suggestion:load`. Marked `hiddenFromMenu: true` in the manifest so
 * users can only get here from a worksheet — a standalone empty-state was
 * confusing.
 */

import { getSuggestionsFor } from '../../core/chart-suggestions/chart-suggestions.js';
import { esc } from '../../core/html-utils.js';
import { CHART_COLORS } from '../../core/chart/chart-colors.js';
import { computeIMR } from '../../engines/control-chart-engine.js';
import { computeEWMA, computeCUSUM, estimateSigma } from '../../engines/time-weighted-chart-engine.js';
import { groupedMeans, cellMeans } from '../../engines/grouped-aggregations.js';

const mod = {
  id: 'chart-suggestion',
  phase: 'data',
  icon: 'sparkles',
  i18nKey: 'modules.chart-suggestion',
  version: '1.0.0',

  _container: null,
  _context: null,
  /** @type {{sourceInstanceId?: string, columns: Array}|null} */
  _selection: null,
  /** Suggestions cached after each load (recomputed when selection changes). */
  _suggestions: [],
  /** Currently picked suggestion id (chart type), or null. */
  _selectedChartType: null,
  /** Live chart instances in the preview (single chart, or matrix cells). */
  _charts: [],
  _eventUnsubs: [],

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('chart-suggestion-css')) {
      const link = document.createElement('link');
      link.id = 'chart-suggestion-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/chart-suggestion/chart-suggestion.css';
      document.head.appendChild(link);
    }

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._loadState(saved);
    this._recomputeSuggestions();

    this._render();
    this._subscribeEvents();
  },

  async destroy() {
    for (const unsub of this._eventUnsubs) unsub();
    this._eventUnsubs = [];
    this._destroyCharts();
    this._container.innerHTML = '';
  },

  onLanguageChange() {
    this._render();
  },

  onThemeChange() {
    if (this._charts.length) this._renderPreview();
  },

  getState() {
    return {
      selection: this._selection,
      selectedChartType: this._selectedChartType,
    };
  },

  setState(data) {
    if (!data) return;
    this._loadState(data);
    this._recomputeSuggestions();
    if (this._container) this._render();
  },

  help: () => import('./chart-suggestion-help.js'),

  /** @private */
  _loadState(saved) {
    this._selection = saved.selection || null;
    this._selectedChartType = saved.selectedChartType || null;
  },

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      this.getState(),
    );
  },

  // ─── Event wiring ───────────────────────────────────────────

  _subscribeEvents() {
    const eb = this._context.eventBus;
    const onLoad = ({ instanceId, selection }) => {
      if (instanceId !== this._context.instanceId) return;
      this._selection = selection;
      this._selectedChartType = null;
      this._recomputeSuggestions();
      this._save();
      this._render();
    };
    eb.on('chart-suggestion:load', onLoad);
    this._eventUnsubs.push(() => eb.off('chart-suggestion:load', onLoad));
  },

  // ─── Selection → suggestions ────────────────────────────────

  _recomputeSuggestions() {
    if (!this._selection || !Array.isArray(this._selection.columns) || this._selection.columns.length === 0) {
      this._suggestions = [];
      return;
    }
    this._suggestions = getSuggestionsFor(this._selection.columns);

    // Preserve user pick if still valid; otherwise pick the top-ranked one
    const stillValid = this._selectedChartType
      && this._suggestions.some(s => s.type === this._selectedChartType);
    if (!stillValid) {
      this._selectedChartType = this._suggestions[0]?.type || null;
    }
  },

  // ─── Render ─────────────────────────────────────────────────

  _t(key, vars) { return this._context.i18n.t(`modules.chart-suggestion.${key}`, vars); },

  _render() {
    const t = (k, v) => this._t(k, v);

    if (!this._selection || this._suggestions.length === 0) {
      this._destroyCharts();
      this._container.innerHTML = this._renderEmptyState(t);
      return;
    }

    this._container.innerHTML = `
      <div class="chart-suggestion dmike-split">
        <aside class="chart-suggestion__gallery dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionSuggestions')}</div>
          <div class="chart-suggestion__selection-info" data-ref="selection-info"></div>
          <ul class="chart-suggestion__cards" data-ref="cards"></ul>
        </aside>
        <section class="chart-suggestion__preview dmike-split__output">
          <header class="chart-suggestion__preview-header">
            <span class="chart-suggestion__preview-title" data-ref="preview-title"></span>
            <span class="chart-suggestion__preview-notes" data-ref="preview-notes"></span>
            <button type="button" class="chart-suggestion__open-btn" data-ref="open-btn" data-action="open-in-module" hidden>
              ${t('openInModule')}
            </button>
          </header>
          <div class="chart-suggestion__plot" data-ref="plot"></div>
        </section>
      </div>
    `;

    this._renderSelectionInfo();
    this._renderCards();
    this._renderPreview();
    this._bindCardEvents();
    this._bindOpenInModule();
  },

  _renderEmptyState(t) {
    const tipKey = this._selection
      ? 'emptyStateNoMatch'
      : 'emptyStateNoSelection';
    return `
      <div class="chart-suggestion chart-suggestion--empty">
        <div class="chart-suggestion__empty-card">
          <div class="chart-suggestion__empty-icon">✨</div>
          <h2 class="chart-suggestion__empty-title">${esc(t('emptyTitle'))}</h2>
          <p class="chart-suggestion__empty-text">${esc(t(tipKey))}</p>
        </div>
      </div>
    `;
  },

  _renderSelectionInfo() {
    const el = this._container.querySelector('[data-ref="selection-info"]');
    if (!el || !this._selection) return;
    const cols = this._selection.columns || [];
    const t = (k, v) => this._t(k, v);
    const labels = cols.map(c => `<span class="chart-suggestion__col-chip col-role-${esc(c.role)}">${esc(c.name || '?')} <em>${esc(t('role.' + c.role))}</em></span>`).join(' ');
    el.innerHTML = `<div class="chart-suggestion__selection-label">${t('selectionLabel', { n: cols.length })}</div>${labels}`;
  },

  _renderCards() {
    const list = this._container.querySelector('[data-ref="cards"]');
    if (!list) return;
    const t = (k, v) => this._t(k, v);
    list.innerHTML = this._suggestions.map(s => {
      const active = s.type === this._selectedChartType ? ' chart-suggestion__card--active' : '';
      const notes = s.notesKey ? `<div class="chart-suggestion__card-notes">${esc(t('notes.' + s.notesKey))}</div>` : '';
      return `
        <li>
          <button type="button" class="chart-suggestion__card${active}" data-chart-type="${esc(s.type)}">
            <div class="chart-suggestion__card-thumb chart-suggestion__card-thumb--${esc(s.type)}" aria-hidden="true">${chartThumbSVG(s.type)}</div>
            <div class="chart-suggestion__card-body">
              <div class="chart-suggestion__card-title">${esc(t('charts.' + s.i18nKey))}</div>
              ${notes}
            </div>
          </button>
        </li>
      `;
    }).join('');
  },

  _bindCardEvents() {
    const list = this._container.querySelector('[data-ref="cards"]');
    if (!list) return;
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-chart-type]');
      if (!btn) return;
      const type = btn.dataset.chartType;
      if (type === this._selectedChartType) return;
      this._selectedChartType = type;
      this._save();
      // Re-render cards (active state) without rebuilding the whole shell
      list.querySelectorAll('.chart-suggestion__card').forEach(el => {
        el.classList.toggle('chart-suggestion__card--active', el.dataset.chartType === type);
      });
      this._renderPreview();
      this._updateOpenInModuleVisibility();
    });
  },

  _bindOpenInModule() {
    const btn = this._container.querySelector('[data-ref="open-btn"]');
    if (!btn) return;
    btn.addEventListener('click', () => this._openInTargetModule());
    this._updateOpenInModuleVisibility();
  },

  _updateOpenInModuleVisibility() {
    const btn = this._container?.querySelector('[data-ref="open-btn"]');
    if (!btn) return;
    const prefill = this._buildPrefill();
    btn.hidden = !prefill;
  },

  /**
   * Build a prefill payload for the currently-selected chart type, or null
   * when the type has no corresponding standalone module (bar, pareto, pie,
   * control-chart, scatter-matrix).
   */
  _buildPrefill() {
    const chartType = this._selectedChartType;
    const fn = CHART_TYPE_TO_PREFILL[chartType];
    if (!fn) return null;
    const sel = this._selection;
    if (!sel?.sourceInstanceId || !sel?.sourceSheetId) return null;
    return fn(sel.columns || [], sel.sourceInstanceId, sel.sourceSheetId);
  },

  /**
   * Open (or create) the standalone module that matches the active suggestion
   * with the selected columns prefilled. Always creates a fresh instance —
   * users keep the chart-suggestion tab as scratch space and may want
   * multiple drilled-down analyses side by side.
   */
  _openInTargetModule() {
    const prefill = this._buildPrefill();
    if (!prefill) return;
    const sm = this._context.stateManager;
    const phase = this._findOwnPhase();
    const instances = sm.get(`phases.${phase}`) || [];
    const instanceId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${prefill.target}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const updated = instances.slice();
    updated.push({ instanceId, moduleId: prefill.target, order: updated.length, state: {} });
    sm.set(`phases.${phase}`, updated);
    sm.setModuleState(instanceId, prefill.state);
    this._context.eventBus.emit('module:added', {
      moduleId: prefill.target, phase, instanceId,
    });
  },

  _findOwnPhase() {
    const sm = this._context.stateManager;
    const phases = sm.get('phases') || {};
    for (const phase of Object.keys(phases)) {
      if ((phases[phase] || []).some(i => i.instanceId === this._context.instanceId)) {
        return phase;
      }
    }
    return 'data';
  },

  // ─── Preview rendering ──────────────────────────────────────

  _destroyCharts() {
    if (!this._context?.chartManager) {
      this._charts = [];
      return;
    }
    for (const chart of this._charts) {
      try { this._context.chartManager.destroy(chart); } catch {}
    }
    this._charts = [];
  },

  async _renderPreview() {
    const titleEl = this._container?.querySelector('[data-ref="preview-title"]');
    const notesEl = this._container?.querySelector('[data-ref="preview-notes"]');
    const plotEl  = this._container?.querySelector('[data-ref="plot"]');
    if (!plotEl) return;
    const t = (k, v) => this._t(k, v);

    this._destroyCharts();
    plotEl.innerHTML = '';

    const sugg = this._suggestions.find(s => s.type === this._selectedChartType);
    if (!sugg) {
      if (titleEl) titleEl.textContent = '';
      if (notesEl) notesEl.textContent = '';
      return;
    }

    if (titleEl) titleEl.textContent = t('charts.' + sugg.i18nKey);
    if (notesEl) notesEl.textContent = sugg.notesKey ? t('notes.' + sugg.notesKey) : '';

    if (sugg.type === 'scatter-matrix') {
      await this._renderScatterMatrix(plotEl, t);
      return;
    }
    if (sugg.type === 'main-effects') {
      await this._renderMainEffectsPlot(plotEl, t);
      return;
    }
    if (sugg.type === 'interaction-plot') {
      await this._renderInteractionPlot(plotEl, t);
      return;
    }
    if (sugg.type === 'boxplot') {
      const grouping = (this._selection?.columns || [])
        .filter(c => c.role === 'categorical' || c.role === 'ordinal').length;
      if (grouping === 2) {
        await this._renderBoxplotTrellis(plotEl, t);
        return;
      }
    }
    if (sugg.type === 'scatter-marginal-boxplot') {
      await this._renderScatterMarginal(plotEl, t, 'boxplot');
      return;
    }
    if (sugg.type === 'scatter-marginal-histogram') {
      await this._renderScatterMarginal(plotEl, t, 'histogram');
      return;
    }
    if (sugg.type === 'cusum') {
      await this._renderCusumStacked(plotEl, t);
      return;
    }

    const config = buildChartConfig(sugg.type, this._selection.columns, t);
    if (!config) {
      plotEl.innerHTML = `<div class="chart-suggestion__placeholder">${esc(t('previewUnavailable', { type: sugg.type }))}</div>`;
      return;
    }

    try {
      const chart = await this._context.chartManager.create(plotEl, config.chartType || sugg.type, config);
      this._charts.push(chart);
    } catch (err) {
      plotEl.innerHTML = `<div class="chart-suggestion__placeholder chart-suggestion__placeholder--error">${esc(err.message || String(err))}</div>`;
    }
  },

  /**
   * Render an n×n SPLOM. Diagonal cells show the variable name (also acts as
   * axis label for the row and column); off-diagonal cells are small scatter
   * plots. Capped at MATRIX_MAX columns to keep rendering cost bounded.
   */
  async _renderScatterMatrix(plotEl, t) {
    const allCont = (this._selection?.columns || []).filter(c => c.role === 'continuous');
    if (allCont.length < 2) {
      plotEl.innerHTML = `<div class="chart-suggestion__placeholder">${esc(t('previewUnavailable', { type: 'scatter-matrix' }))}</div>`;
      return;
    }

    const MATRIX_MAX = 6;
    const cols = allCont.slice(0, MATRIX_MAX);
    const n = cols.length;
    const truncated = allCont.length > MATRIX_MAX;

    const grid = document.createElement('div');
    grid.className = 'chart-suggestion__matrix';
    grid.style.setProperty('--matrix-n', String(n));
    grid.dataset.matrixSize = String(n);
    plotEl.appendChild(grid);

    if (truncated) {
      const note = document.createElement('div');
      note.className = 'chart-suggestion__matrix-note';
      note.textContent = t('notes.matrixTruncated', { shown: n, total: allCont.length });
      plotEl.appendChild(note);
    }

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const cell = document.createElement('div');
        cell.className = 'chart-suggestion__matrix-cell';
        grid.appendChild(cell);

        if (r === c) {
          cell.classList.add('chart-suggestion__matrix-cell--diag');
          cell.textContent = cols[r].name || `c${r + 1}`;
          continue;
        }

        const xCol = cols[c];
        const yCol = cols[r];
        const xRaw = xCol.values || [];
        const yRaw = yCol.values || [];
        const N = Math.min(xRaw.length, yRaw.length);
        const xs = [];
        const ys = [];
        for (let i = 0; i < N; i++) {
          const xn = toNum(xRaw[i]);
          const yn = toNum(yRaw[i]);
          if (Number.isFinite(xn) && Number.isFinite(yn)) {
            xs.push(xn);
            ys.push(yn);
          }
        }

        const config = {
          title: '',
          xLabel: '',
          yLabel: '',
          showLegend: false,
          series: [{
            name: `${xCol.name || 'X'} vs ${yCol.name || 'Y'}`,
            x: xs,
            y: ys,
            color: CHART_COLORS[0],
          }],
        };

        try {
          const chart = await this._context.chartManager.create(cell, 'scatter', config);
          this._charts.push(chart);
        } catch (err) {
          cell.innerHTML = `<div class="chart-suggestion__placeholder chart-suggestion__placeholder--error">${esc(err.message || String(err))}</div>`;
        }
      }
    }
  },

  /**
   * Main effects plot (model-free, ANOVA-flavored): one sub-panel per
   * categorical/ordinal factor. Each panel plots the observed mean of the
   * continuous response at every factor level, connected by a line. A
   * dashed reference line marks the overall response mean so users can see
   * how strongly each factor pulls away from it.
   *
   * The panels share Y bounds so effect magnitudes are visually comparable.
   */
  async _renderMainEffectsPlot(plotEl, t) {
    const cols = this._selection?.columns || [];
    const yCol = cols.find(c => c.role === 'continuous');
    const factors = cols.filter(c => c.role === 'categorical' || c.role === 'ordinal');
    if (!yCol || factors.length === 0) {
      plotEl.innerHTML = `<div class="chart-suggestion__placeholder">${esc(t('previewUnavailable', { type: 'main-effects' }))}</div>`;
      return;
    }

    const panels = factors.map(f => ({
      factor: f,
      gm: groupedMeans(yCol.values || [], f.values || []),
    }));

    const yValsAll = (yCol.values || []).map(toNum).filter(Number.isFinite);
    const overallY = yValsAll.length > 0
      ? yValsAll.reduce((s, v) => s + v, 0) / yValsAll.length
      : NaN;

    // Shared Y bounds across panels for direct effect-magnitude comparison.
    let yMin = Infinity, yMax = -Infinity;
    for (const p of panels) {
      for (const m of p.gm.means) {
        if (Number.isFinite(m)) {
          if (m < yMin) yMin = m;
          if (m > yMax) yMax = m;
        }
      }
    }
    if (Number.isFinite(overallY)) {
      if (overallY < yMin) yMin = overallY;
      if (overallY > yMax) yMax = overallY;
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) {
      yMin = Number.isFinite(overallY) ? overallY - 1 : 0;
      yMax = Number.isFinite(overallY) ? overallY + 1 : 1;
    }
    const yPad = (yMax - yMin) * 0.15 || 1;
    yMin -= yPad; yMax += yPad;

    const n = panels.length;
    const grid = document.createElement('div');
    grid.className = 'chart-suggestion__matrix';
    grid.style.setProperty('--matrix-n', String(n));
    grid.style.gridTemplateRows = '1fr';
    grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    grid.dataset.matrixSize = String(n);
    plotEl.appendChild(grid);

    for (const { factor, gm } of panels) {
      const cell = document.createElement('div');
      cell.className = 'chart-suggestion__matrix-cell';
      grid.appendChild(cell);

      if (gm.levels.length === 0) {
        cell.innerHTML = `<div class="chart-suggestion__placeholder">${esc(t('previewUnavailable', { type: 'main-effects' }))}</div>`;
        continue;
      }

      const xs = gm.levels.map((_, i) => i);
      const config = {
        title: factor.name || '',
        titleSize: 12,
        labelSize: 11,
        tickSize: 10,
        xLabel: '',
        yLabel: yCol.name || '',
        showLegend: false,
        xMin: -0.5,
        xMax: gm.levels.length - 0.5,
        yMin, yMax,
        xTicks: xs,
        xTickFormat: (v) => {
          const idx = Math.round(v);
          return idx >= 0 && idx < gm.levels.length ? gm.levels[idx] : '';
        },
        refLines: Number.isFinite(overallY) ? [{
          dir: 'h', value: overallY,
          dash: 'dash', width: 1, color: 'var(--color-text-tertiary)',
        }] : [],
        series: [{
          name: factor.name || '',
          color: CHART_COLORS[0],
          markerSize: 5,
          x: xs, y: gm.means,
          connectLine: { show: true, dash: 'solid', width: 2, color: CHART_COLORS[0] },
        }],
      };

      try {
        const chart = await this._context.chartManager.create(cell, 'scatter', config);
        this._charts.push(chart);
      } catch (err) {
        cell.innerHTML = `<div class="chart-suggestion__placeholder chart-suggestion__placeholder--error">${esc(err.message || String(err))}</div>`;
      }
    }
  },

  /**
   * Interaction plot (model-free, ANOVA-flavored): a single panel with
   * factor A on the X axis and one line per level of factor B, points = cell
   * means. Parallel lines ⇒ no interaction; lines that diverge or cross
   * ⇒ A's effect depends on B.
   *
   * Requires exactly 2 factors (the rule only fires for 1 response + 2
   * categorical/ordinal columns).
   */
  async _renderInteractionPlot(plotEl, t) {
    const cols = this._selection?.columns || [];
    const yCol = cols.find(c => c.role === 'continuous');
    const factors = cols.filter(c => c.role === 'categorical' || c.role === 'ordinal');
    if (!yCol || factors.length < 2) {
      plotEl.innerHTML = `<div class="chart-suggestion__placeholder">${esc(t('previewUnavailable', { type: 'interaction-plot' }))}</div>`;
      return;
    }

    const fA = factors[0], fB = factors[1];
    const { aLevels, bLevels, means } = cellMeans(yCol.values || [], fA.values || [], fB.values || []);
    if (aLevels.length === 0 || bLevels.length === 0) {
      plotEl.innerHTML = `<div class="chart-suggestion__placeholder">${esc(t('previewUnavailable', { type: 'interaction-plot' }))}</div>`;
      return;
    }

    const series = bLevels.map((bName, bi) => ({
      name: bName,
      color: CHART_COLORS[bi % CHART_COLORS.length],
      markerSize: 5,
      x: aLevels.map((_, ai) => ai),
      // Cells with no observations stay NaN — scatter skips them, breaking the line there.
      y: aLevels.map((_, ai) => means[ai][bi]),
      connectLine: {
        show: true, dash: 'solid', width: 2,
        color: CHART_COLORS[bi % CHART_COLORS.length],
      },
    }));

    let yMin = Infinity, yMax = -Infinity;
    for (const s of series) {
      for (const v of s.y) {
        if (Number.isFinite(v)) {
          if (v < yMin) yMin = v;
          if (v > yMax) yMax = v;
        }
      }
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) {
      yMin = (yMin === yMax && Number.isFinite(yMin)) ? yMin - 1 : 0;
      yMax = Number.isFinite(yMax) ? yMax + 1 : 1;
    }
    const yPad = (yMax - yMin) * 0.15 || 1;
    yMin -= yPad; yMax += yPad;

    const config = {
      title: '',
      titleSize: 13,
      labelSize: 11,
      tickSize: 10,
      xLabel: fA.name || '',
      yLabel: yCol.name || '',
      showLegend: true,
      legendTitle: fB.name || '',
      xMin: -0.5,
      xMax: aLevels.length - 0.5,
      yMin, yMax,
      xTicks: aLevels.map((_, i) => i),
      xTickFormat: (v) => {
        const idx = Math.round(v);
        return idx >= 0 && idx < aLevels.length ? aLevels[idx] : '';
      },
      series,
    };

    try {
      const chart = await this._context.chartManager.create(plotEl, 'scatter', config);
      this._charts.push(chart);
    } catch (err) {
      plotEl.innerHTML = `<div class="chart-suggestion__placeholder chart-suggestion__placeholder--error">${esc(err.message || String(err))}</div>`;
    }
  },

  /**
   * Trellis boxplot for 1 response + 2 grouping factors: one panel per level
   * of factor B (the second grouping column in the selection); inside each
   * panel, one box per level of factor A. Shared X (response) range across
   * panels so the level effects are directly comparable.
   *
   * Reuses the `boxplot` chart-type as-is — Trellis is purely a layout
   * decision composed at the suggestion-preview level.
   */
  async _renderBoxplotTrellis(plotEl, t) {
    const cols = this._selection?.columns || [];
    const yCol = cols.find(c => c.role === 'continuous');
    const factors = cols.filter(c => c.role === 'categorical' || c.role === 'ordinal');
    if (!yCol || factors.length < 2) {
      plotEl.innerHTML = `<div class="chart-suggestion__placeholder">${esc(t('previewUnavailable', { type: 'boxplot' }))}</div>`;
      return;
    }

    const fA = factors[0], fB = factors[1];
    const yVals = yCol.values || [];
    const aVals = fA.values || [];
    const bVals = fB.values || [];
    const N = Math.min(yVals.length, aVals.length, bVals.length);

    // Preserve insertion order for both factors.
    const aLevels = [], bLevels = [];
    const seenA = new Set(), seenB = new Set();
    for (let i = 0; i < N; i++) {
      const a = aVals[i] == null ? '' : String(aVals[i]);
      const b = bVals[i] == null ? '' : String(bVals[i]);
      if (!seenA.has(a)) { seenA.add(a); aLevels.push(a); }
      if (!seenB.has(b)) { seenB.add(b); bLevels.push(b); }
    }
    if (aLevels.length === 0 || bLevels.length === 0) {
      plotEl.innerHTML = `<div class="chart-suggestion__placeholder">${esc(t('previewUnavailable', { type: 'boxplot' }))}</div>`;
      return;
    }

    // Bucket continuous values by (B-level, A-level).
    const bucket = new Map();  // bLevel → (aLevel → number[])
    for (const b of bLevels) bucket.set(b, new Map(aLevels.map(a => [a, []])));
    let xMin = Infinity, xMax = -Infinity;
    for (let i = 0; i < N; i++) {
      const a = aVals[i] == null ? '' : String(aVals[i]);
      const b = bVals[i] == null ? '' : String(bVals[i]);
      const v = toNum(yVals[i]);
      if (!Number.isFinite(v)) continue;
      bucket.get(b).get(a).push(v);
      if (v < xMin) xMin = v;
      if (v > xMax) xMax = v;
    }
    if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin === xMax) {
      xMin = Number.isFinite(xMin) ? xMin - 1 : 0;
      xMax = Number.isFinite(xMax) ? xMax + 1 : 1;
    }
    const xPad = (xMax - xMin) * 0.05 || 0.5;
    xMin -= xPad; xMax += xPad;

    const n = bLevels.length;
    const grid = document.createElement('div');
    grid.className = 'chart-suggestion__matrix';
    grid.style.setProperty('--matrix-n', String(n));
    grid.style.gridTemplateRows = '1fr';
    grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    grid.dataset.matrixSize = String(n);
    plotEl.appendChild(grid);

    for (const bLevel of bLevels) {
      const cell = document.createElement('div');
      cell.className = 'chart-suggestion__matrix-cell';
      grid.appendChild(cell);

      const groups = aLevels.map((aLevel, ai) => ({
        name: aLevel,
        values: bucket.get(bLevel).get(aLevel),
        color: CHART_COLORS[ai % CHART_COLORS.length],
      }));

      const config = {
        title: `${fB.name || ''}: ${bLevel}`.trim(),
        titleSize: 12,
        labelSize: 11,
        tickSize: 10,
        xLabel: yCol.name || '',
        yLabel: '',
        showLegend: false,
        showMean: true,
        showOutliers: true,
        xMin, xMax,
        groups,
      };

      try {
        const chart = await this._context.chartManager.create(cell, 'boxplot', config);
        this._charts.push(chart);
      } catch (err) {
        cell.innerHTML = `<div class="chart-suggestion__placeholder chart-suggestion__placeholder--error">${esc(err.message || String(err))}</div>`;
      }
    }
  },

  /**
   * Scatter plot with marginal distributions on top (for X) and right (for Y).
   * `kind`: 'boxplot' → marginal-X horizontal boxplot, marginal-Y vertical
   * boxplot; 'histogram' → marginal-X vertical histogram, marginal-Y horizontal
   * histogram. All panels share the data range with the main scatter so the
   * marginal positions align with the corresponding scatter axis.
   */
  async _renderScatterMarginal(plotEl, t, kind) {
    const cols = this._selection?.columns || [];
    const cont = cols.filter(c => c.role === 'continuous');
    if (cont.length < 2) {
      plotEl.innerHTML = `<div class="chart-suggestion__placeholder">${esc(t('previewUnavailable', { type: 'scatter-marginal-' + kind }))}</div>`;
      return;
    }
    const xCol = cont[0], yCol = cont[1];

    // Paired numeric extraction (drop rows where either side is non-numeric).
    const xRaw = xCol.values || [];
    const yRaw = yCol.values || [];
    const n = Math.min(xRaw.length, yRaw.length);
    const xs = [], ys = [];
    for (let i = 0; i < n; i++) {
      const xn = toNum(xRaw[i]);
      const yn = toNum(yRaw[i]);
      if (Number.isFinite(xn) && Number.isFinite(yn)) {
        xs.push(xn); ys.push(yn);
      }
    }
    if (xs.length === 0) {
      plotEl.innerHTML = `<div class="chart-suggestion__placeholder">${esc(t('previewUnavailable', { type: 'scatter-marginal-' + kind }))}</div>`;
      return;
    }

    // Shared data ranges (with 5 % padding) — passed to all 3 panels so the
    // marginal positions line up with the scatter axis they share.
    const padRange = (vals) => {
      const mn = Math.min(...vals);
      const mx = Math.max(...vals);
      const p = (mx - mn) * 0.05 || 0.5;
      return { min: mn - p, max: mx + p };
    };
    const xR = padRange(xs);
    const yR = padRange(ys);

    // Build the 2×2 grid: small marginal row on top, small marginal column
    // on the right. Top-right cell is left empty.
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateRows = '22% 78%';
    grid.style.gridTemplateColumns = '78% 22%';
    grid.style.gap = '4px';
    grid.style.width = '100%';
    grid.style.height = '100%';
    grid.style.minHeight = '0';

    const makeCell = () => {
      const c = document.createElement('div');
      c.className = 'chart-suggestion__matrix-cell';
      grid.appendChild(c);
      return c;
    };
    const cellTopX = makeCell();
    const cellTopR = makeCell();
    const cellBotX = makeCell();
    const cellBotR = makeCell();
    plotEl.appendChild(grid);

    // Top-right is intentionally blank (could carry n-info later).
    cellTopR.style.background = 'transparent';
    cellTopR.style.border = 'none';

    // ── Main scatter ──
    try {
      const sc = await this._context.chartManager.create(cellBotX, 'scatter', {
        title: '',
        xLabel: xCol.name || '',
        yLabel: yCol.name || '',
        xMin: xR.min, xMax: xR.max,
        yMin: yR.min, yMax: yR.max,
        showLegend: false,
        series: [{
          name: `${xCol.name || 'X'} vs ${yCol.name || 'Y'}`,
          x: xs, y: ys,
          color: CHART_COLORS[0],
        }],
      });
      this._charts.push(sc);
    } catch (err) {
      cellBotX.innerHTML = `<div class="chart-suggestion__placeholder chart-suggestion__placeholder--error">${esc(err.message || String(err))}</div>`;
    }

    if (kind === 'boxplot') {
      // Marginal-X: horizontal boxplot of X values, single group.
      try {
        const mx = await this._context.chartManager.create(cellTopX, 'boxplot', {
          title: '', xLabel: '', yLabel: '',
          showLegend: false, showMean: false,
          xMin: xR.min, xMax: xR.max,
          groups: [{ name: '', values: xs, color: CHART_COLORS[0] }],
        });
        this._charts.push(mx);
      } catch (err) {
        cellTopX.innerHTML = `<div class="chart-suggestion__placeholder chart-suggestion__placeholder--error">${esc(err.message || String(err))}</div>`;
      }
      // Marginal-Y: vertical boxplot of Y values, single group.
      try {
        const my = await this._context.chartManager.create(cellBotR, 'boxplot', {
          title: '', xLabel: '', yLabel: '',
          showLegend: false, showMean: false,
          orientation: 'vertical',
          yMin: yR.min, yMax: yR.max,
          groups: [{ name: '', values: ys, color: CHART_COLORS[0] }],
        });
        this._charts.push(my);
      } catch (err) {
        cellBotR.innerHTML = `<div class="chart-suggestion__placeholder chart-suggestion__placeholder--error">${esc(err.message || String(err))}</div>`;
      }
    } else {
      // Marginal-X: vertical histogram of X values.
      try {
        const mx = await this._context.chartManager.create(cellTopX, 'histogram', {
          title: '', xLabel: '', yLabel: '',
          showLegend: false, showXTicks: false, showYTicks: false,
          xMin: xR.min, xMax: xR.max,
          data: xs,
          barColor: CHART_COLORS[0],
        });
        this._charts.push(mx);
      } catch (err) {
        cellTopX.innerHTML = `<div class="chart-suggestion__placeholder chart-suggestion__placeholder--error">${esc(err.message || String(err))}</div>`;
      }
      // Marginal-Y: horizontal histogram of Y values.
      try {
        const my = await this._context.chartManager.create(cellBotR, 'histogram', {
          title: '', xLabel: '', yLabel: '',
          showLegend: false, showXTicks: false, showYTicks: false,
          orientation: 'horizontal',
          yMin: yR.min, yMax: yR.max,
          data: ys,
          barColor: CHART_COLORS[0],
        });
        this._charts.push(my);
      } catch (err) {
        cellBotR.innerHTML = `<div class="chart-suggestion__placeholder chart-suggestion__placeholder--error">${esc(err.message || String(err))}</div>`;
      }
    }
  },

  /**
   * Two-sided CUSUM preview: C⁺ on top, C⁻ on bottom, both as control-chart
   * instances against the decision interval H. Mirrors the wiring of the
   * time-weighted-chart module.
   */
  async _renderCusumStacked(plotEl, t) {
    const cols = this._selection?.columns || [];
    const date = cols.filter(c => c.role === 'date');
    const cont = cols.filter(c => c.role === 'continuous');
    const prep = collectTimeOrderedSeries(date, cont);
    if (!prep || prep.values.length < 3) {
      plotEl.innerHTML = `<div class="chart-suggestion__placeholder">${esc(t('previewUnavailable', { type: 'cusum' }))}</div>`;
      return;
    }
    const target = mean(prep.values);
    const sigma = estimateSigma(prep.values, 'mr');
    if (!(sigma > 0)) {
      plotEl.innerHTML = `<div class="chart-suggestion__placeholder">${esc(t('previewUnavailable', { type: 'cusum' }))}</div>`;
      return;
    }
    const r = computeCUSUM(prep.values, target, sigma, 0.5, 4);

    const grid = document.createElement('div');
    grid.className = 'chart-suggestion__matrix';
    grid.style.setProperty('--matrix-n', '1');
    grid.style.gridTemplateRows = '1fr 1fr';
    grid.style.gridTemplateColumns = '1fr';
    grid.dataset.matrixSize = '2';
    plotEl.appendChild(grid);

    const panels = [
      { values: r.cPlus,  label: 'C⁺', signals: r.signalsHi },
      { values: r.cMinus, label: 'C⁻', signals: r.signalsLo },
    ];
    for (const p of panels) {
      const cell = document.createElement('div');
      cell.className = 'chart-suggestion__matrix-cell';
      grid.appendChild(cell);
      try {
        const chart = await this._context.chartManager.create(cell, 'control-chart', {
          title: p.label,
          titleSize: 12,
          labelSize: 11,
          tickSize: 10,
          xLabel: '',
          yLabel: '',
          showLegend: false,
          values: p.values,
          cl: 0,
          ucl: r.h,
          lcl: 0,
          sigma: 0,
          showZones: false,
          violationIndices: new Set(p.signals),
        });
        this._charts.push(chart);
      } catch (err) {
        cell.innerHTML = `<div class="chart-suggestion__placeholder chart-suggestion__placeholder--error">${esc(err.message || String(err))}</div>`;
      }
    }
  },
};

// ─── Prefill adapters: suggestion chart-type → target module state ───
//
// Each function maps the snapshot ({id, role, ...}) of selected columns to
// the initial state shape that the corresponding full module expects.
// Returns `null` when the columns don't satisfy that module's minimums
// (e.g. xy-plot needs two continuous columns).

function _ref(srcId, sheetId, col) {
  return { instanceId: srcId, sheetId, columnId: col.id };
}

const MODULE_PREFILL = {
  histogram(cols, srcId, sheetId) {
    const cont = cols.filter(c => c.role === 'continuous');
    if (cont.length === 0) return null;
    return {
      target: 'histogram',
      state: {
        datasets: cont.map(c => ({
          valueRef: _ref(srcId, sheetId, c),
          groupRef: null,
        })),
      },
    };
  },
  xy(cols, srcId, sheetId) {
    const cont = cols.filter(c => c.role === 'continuous');
    if (cont.length < 2) return null;
    return {
      target: 'xy-plot',
      state: {
        datasets: [{
          xRef: _ref(srcId, sheetId, cont[0]),
          yRef: _ref(srcId, sheetId, cont[1]),
          groupRef: null,
        }],
      },
    };
  },
  run(cols, srcId, sheetId) {
    const cont = cols.filter(c => c.role === 'continuous');
    if (cont.length === 0) return null;
    return {
      target: 'run-chart',
      state: { columnRef: _ref(srcId, sheetId, cont[0]) },
    };
  },
  boxplot(cols, srcId, sheetId) {
    const cont = cols.filter(c => c.role === 'continuous');
    const grp = cols.find(c => c.role === 'categorical' || c.role === 'ordinal');
    if (cont.length === 0) return null;
    const grpRef = grp ? _ref(srcId, sheetId, grp) : null;
    return {
      target: 'boxplot',
      state: {
        seriesRefs: cont.map(c => _ref(srcId, sheetId, c)),
        groupRefs:  cont.map(() => grpRef),
      },
    };
  },
  ivp(cols, srcId, sheetId) {
    const cont = cols.filter(c => c.role === 'continuous');
    const grp = cols.find(c => c.role === 'categorical' || c.role === 'ordinal');
    if (cont.length === 0) return null;
    const grpRef = grp ? _ref(srcId, sheetId, grp) : null;
    return {
      target: 'individual-value-plot',
      state: {
        seriesRefs: cont.map(c => _ref(srcId, sheetId, c)),
        groupRefs:  cont.map(() => grpRef),
      },
    };
  },
  probability(cols, srcId, sheetId) {
    const cont = cols.filter(c => c.role === 'continuous');
    if (cont.length === 0) return null;
    return {
      target: 'probability-plot',
      state: { columnRef: _ref(srcId, sheetId, cont[0]) },
    };
  },
};

/** Suggestion chart-type → prefill adapter. Types not in this table have no
 *  open-in-module button (bar, pareto, pie, control-chart, scatter-matrix). */
const CHART_TYPE_TO_PREFILL = {
  'histogram':             MODULE_PREFILL.histogram,
  'scatter':               MODULE_PREFILL.xy,
  'run-chart':             MODULE_PREFILL.run,
  'boxplot':               MODULE_PREFILL.boxplot,
  'individual-value-plot': MODULE_PREFILL.ivp,
  'probability-plot':      MODULE_PREFILL.probability,
};

// ─── Helpers (module-scope, pure) ────────────────────────────────

/**
 * Build a chart-config object for the given chart type from the column
 * snapshot. Returns null if the type is not supported in the preview yet.
 *
 * `t` is a translator scoped to `modules.chart-suggestion`.
 */
function buildChartConfig(chartType, columns, t) {
  const cont = columns.filter(c => c.role === 'continuous');
  const cat  = columns.filter(c => c.role === 'categorical' || c.role === 'ordinal');
  const date = columns.filter(c => c.role === 'date');
  const numericVals = (c) => (c?.values || []).map(toNum).filter(v => Number.isFinite(v));
  const cleanCat   = (c) => (c?.values || []).map(v => v == null ? '' : String(v));

  switch (chartType) {
    case 'histogram': {
      if (cont.length === 0) return null;
      const c = cont[0];
      return {
        title: c.name || '',
        xLabel: c.name || '',
        yLabel: t('axis.frequency'),
        data: numericVals(c),
        showNormalCurve: true,
      };
    }
    case 'boxplot': {
      const groups = boxplotGroups(cont, cat, t);
      if (!groups) return null;
      return {
        title: '',
        xLabel: '',
        yLabel: '',
        showLegend: groups.length > 1,
        showMean: true,
        showOutliers: true,
        groups,
      };
    }
    case 'individual-value-plot': {
      const groups = boxplotGroups(cont, cat, t);
      if (!groups) return null;
      return {
        title: '',
        xLabel: '',
        yLabel: '',
        showLegend: groups.length > 1,
        groups,
      };
    }
    case 'run-chart': {
      if (cont.length === 0) return null;
      const c = cont[0];
      return {
        title: c.name || '',
        xLabel: t('axis.observation'),
        yLabel: c.name || '',
        values: numericVals(c),
        pointColor: CHART_COLORS[0],
        lineColor: CHART_COLORS[0],
      };
    }
    case 'scatter': {
      // Date + grouping → multi-line time series. Two ways to derive the
      // groups, identical rendering otherwise:
      //   B4 (`date-cont-cat`, `date-cont-ord`): 1 date + 1 cont + 1 cat →
      //       one line per category level.
      //   A3 (`date-and-continuous`, `date-and-multi-continuous`):
      //       1 date + ≥1 cont → one line per Y column.
      // Falls through to the pairwise 2-continuous scatter case when no
      // date column is present.
      const dateGroups = collectDateLineGroups(date, cont, cat);
      if (dateGroups) return buildDateLineConfig(dateGroups);
      if (cont.length < 2) return null;
      const xCol = cont[0], yCol = cont[1];
      // Use paired raw values: drop rows where either side is non-numeric.
      const xRaw = xCol.values || [];
      const yRaw = yCol.values || [];
      const n = Math.min(xRaw.length, yRaw.length);
      const xs = [], ys = [];
      for (let i = 0; i < n; i++) {
        const xn = toNum(xRaw[i]);
        const yn = toNum(yRaw[i]);
        if (Number.isFinite(xn) && Number.isFinite(yn)) {
          xs.push(xn); ys.push(yn);
        }
      }
      return {
        title: '',
        xLabel: xCol.name || '',
        yLabel: yCol.name || '',
        series: [{
          name: `${xCol.name || 'X'} vs ${yCol.name || 'Y'}`,
          x: xs, y: ys,
          color: CHART_COLORS[0],
        }],
      };
    }
    case 'bar': {
      // Three shapes:
      //   2× cat              → stacked cross-tab (counts).
      //   1× cont + 1× cat/ord → aggregated: mean of Y per factor level
      //                          (`barAggregated` suggestion).
      //   1× cat alone        → single-series frequency bar.
      if (cat.length >= 2) {
        const colA = cat[0], colB = cat[1];
        const { categories, groups } = crossTabCategorical(colA, colB);
        if (categories.length === 0) return null;
        return {
          title: '',
          xLabel: colA.name || '',
          yLabel: t('axis.count'),
          categories,
          groups,
          stacked: true,
          showLegend: true,
          legendTitle: colB.name || '',
        };
      }
      if (cont.length >= 1 && cat.length >= 1) {
        const yCol = cont[0];
        const factor = cat[0];
        const { levels, means } = groupedMeans(yCol.values || [], factor.values || []);
        const valid = levels
          .map((lvl, i) => ({ lvl, m: means[i] }))
          .filter(p => Number.isFinite(p.m));
        if (valid.length === 0) return null;
        return {
          title: '',
          xLabel: factor.name || '',
          yLabel: yCol.name || '',
          categories: valid.map(p => p.lvl),
          groups: [{
            name: yCol.name || '',
            values: valid.map(p => p.m),
            color: CHART_COLORS[0],
          }],
        };
      }
      const cc = cat[0] || cont[0];
      if (!cc) return null;
      const { categories, counts } = countCategories(cc.values || []);
      return {
        title: cc.name || '',
        xLabel: cc.name || '',
        yLabel: t('axis.count'),
        categories,
        groups: [{ name: cc.name || '', values: counts, color: CHART_COLORS[0] }],
      };
    }
    case 'bubble': {
      // Bubble: 3 continuous columns. cont[0]=X, cont[1]=Y, cont[2]=size.
      // Renders through the standard scatter chart-type with per-point sizes.
      // Negative sizes are dropped (no meaningful area). Sizes are mapped via
      // sqrt-normalisation to a 6–28 px diameter range so AREA stays
      // proportional to the raw value, not the radius.
      if (cont.length < 3) return null;
      const xCol = cont[0], yCol = cont[1], sCol = cont[2];
      const xRaw = xCol.values || [];
      const yRaw = yCol.values || [];
      const sRaw = sCol.values || [];
      const N = Math.min(xRaw.length, yRaw.length, sRaw.length);
      const xs = [], ys = [], rawSizes = [];
      for (let i = 0; i < N; i++) {
        const xn = toNum(xRaw[i]);
        const yn = toNum(yRaw[i]);
        const sn = toNum(sRaw[i]);
        if (Number.isFinite(xn) && Number.isFinite(yn) && Number.isFinite(sn) && sn >= 0) {
          xs.push(xn); ys.push(yn); rawSizes.push(sn);
        }
      }
      if (xs.length === 0) return null;
      const D_MIN = 6, D_MAX = 28;
      const sqrtVals = rawSizes.map(Math.sqrt);
      const sMin = Math.min(...sqrtVals);
      const sMax = Math.max(...sqrtVals);
      const span = sMax - sMin;
      const sizes = sqrtVals.map(sv => {
        const t = span > 0 ? (sv - sMin) / span : 0.5;
        return D_MIN + t * (D_MAX - D_MIN);
      });
      return {
        chartType: 'scatter',
        title: '',
        xLabel: xCol.name || '',
        yLabel: yCol.name || '',
        showLegend: false,
        series: [{
          name: sCol.name || '',
          x: xs, y: ys,
          sizes,
          sizeValues: rawSizes,
          sizeLabel: sCol.name || '',
          color: CHART_COLORS[0],
        }],
      };
    }
    case 'mosaic': {
      // Two-categorical only. The mosaic renderer reuses the cross-tab
      // shape (`categories` + `groups`); column widths are derived from
      // the marginal A counts inside the chart type itself.
      if (cat.length < 2) return null;
      const colA = cat[0], colB = cat[1];
      const { categories, groups } = crossTabCategorical(colA, colB);
      if (categories.length === 0) return null;
      return {
        title: '',
        xLabel: colA.name || '',
        yLabel: '',
        categories,
        groups,
        showLegend: true,
        legendTitle: colB.name || '',
      };
    }
    case 'heatmap': {
      // Two variants:
      //   1× cont + 2× cat → mean-of-Y per (A,B) cell.
      //   2× cat           → frequency cross-tab.
      if (cont.length >= 1 && cat.length >= 2) {
        const yCol = cont[0];
        const colA = cat[0], colB = cat[1];
        const { aLevels, bLevels, means } = cellMeans(
          yCol.values || [], colA.values || [], colB.values || [],
        );
        if (aLevels.length === 0 || bLevels.length === 0) return null;
        return {
          title: '',
          xLabel: colB.name || '',
          yLabel: colA.name || '',
          xCategories: bLevels,
          yCategories: aLevels,
          cells: means,
          valueLabel: t('axis.mean'),
          valueDecimals: 2,
        };
      }
      if (cat.length >= 2) {
        const colA = cat[0], colB = cat[1];
        const { categories, groups } = crossTabCategorical(colA, colB);
        if (categories.length === 0 || groups.length === 0) return null;
        // Pivot stacked-bar shape into row-major cells matrix.
        // groups[gi].values[ci] is count(A=categories[ci], B=groups[gi].name).
        const cells = groups.map(g => categories.map((_, ci) => g.values[ci] || 0));
        return {
          title: '',
          xLabel: colA.name || '',
          yLabel: colB.name || '',
          xCategories: categories,
          yCategories: groups.map(g => g.name),
          cells,
          valueLabel: t('axis.count'),
          valueDecimals: 0,
        };
      }
      return null;
    }
    case 'pareto': {
      // Two-categorical: stacked Pareto. Sorting by total happens inside
      // the chart based on the per-category sum across segments.
      const otherLabel = t('axis.other');
      const otherCount = t('axis.otherCategories');
      if (cat.length >= 2) {
        const colA = cat[0], colB = cat[1];
        const { categories, groups } = crossTabCategorical(colA, colB);
        if (categories.length === 0) return null;
        return {
          title: '',
          xLabel: colA.name || '',
          yLabel: t('axis.count'),
          categories,
          groups,
          showLegend: true,
          legendTitle: colB.name || '',
          otherBucket: true,
          otherLabel,
          otherCountTemplate: otherCount,
        };
      }
      const cc = cat[0] || cont[0];
      if (!cc) return null;
      const counted = countCategories(cc.values || []);
      // Pareto: sort by frequency desc, build items[] (the shape the
      // Pareto chart type expects — see app/dev/js/core/chart/types/pareto.js).
      const items = counted.categories
        .map((c, i) => ({ name: c, value: counted.counts[i], color: CHART_COLORS[0] }))
        .sort((a, b) => b.value - a.value);
      return {
        title: cc.name || '',
        xLabel: cc.name || '',
        yLabel: t('axis.count'),
        items,
        otherBucket: true,
        otherLabel,
        otherCountTemplate: otherCount,
      };
    }
    case 'pie': {
      const cc = cat[0];
      if (!cc) return null;
      const { categories, counts } = countCategories(cc.values || []);
      return {
        title: cc.name || '',
        slices: categories.map((c, i) => ({
          label: c,
          value: counts[i],
          color: CHART_COLORS[i % CHART_COLORS.length],
        })),
      };
    }
    case 'probability-plot': {
      if (cont.length === 0) return null;
      const c = cont[0];
      return {
        title: c.name || '',
        xLabel: c.name || '',
        yLabel: t('axis.percentile'),
        data: numericVals(c),
        markerColor: CHART_COLORS[0],
      };
    }
    case 'control-chart': {
      // Show an I-chart (Individuals): one observation per row. If a date
      // column is present, sort observations by date so the time axis is
      // monotonic. Subgroup size > 1 (X̄/R, X̄/S) is left to the full
      // Control-Chart module — needs explicit subgroup configuration.
      const prep = collectTimeOrderedSeries(date, cont);
      if (!prep || prep.values.length < 2) return null;
      const result = computeIMR(prep.values);
      const sub = result.subcharts.i;
      return {
        title: prep.valueName,
        xLabel: prep.xLabel || t('axis.observation'),
        yLabel: prep.valueName,
        values: sub.values,
        cl: sub.cl,
        ucl: sub.ucl,
        lcl: sub.lcl,
        sigma: sub.sigma,
        labels: result.labels,
      };
    }
    case 'ewma': {
      // EWMA control chart against the baseline mean (full series). Uses the
      // generic `control-chart` renderer with stepped UCL/LCL arrays — same
      // wiring as the time-weighted-chart module.
      const prep = collectTimeOrderedSeries(date, cont);
      if (!prep || prep.values.length < 3) return null;
      const target = mean(prep.values);
      const sigma = estimateSigma(prep.values, 'mr');
      if (!(sigma > 0)) return null;
      const r = computeEWMA(prep.values, target, sigma, 0.2, 3);
      return {
        chartType: 'control-chart',
        title: prep.valueName,
        xLabel: prep.xLabel || t('axis.observation'),
        yLabel: prep.valueName,
        values: r.values,
        cl: r.cl,
        ucl: r.ucl,
        lcl: r.lcl,
        sigma: r.sigma,
        showZones: false,
        violationIndices: new Set(r.signals),
      };
    }
    default:
      return null;
  }
}

/**
 * Helper for control-chart-family previews (control-chart, ewma).
 * Returns a numeric series ordered by date if a date column is present,
 * along with axis labels. Returns null if no continuous column is present.
 */
function collectTimeOrderedSeries(date, cont) {
  if (cont.length === 0) return null;
  const valueCol = cont[0];
  const dateCol = date[0];
  const rawVals = valueCol.values || [];
  let values;
  if (dateCol && Array.isArray(dateCol.values)) {
    const N = Math.min(dateCol.values.length, rawVals.length);
    const pairs = [];
    for (let i = 0; i < N; i++) {
      const dt = parseDateValue(dateCol.values[i]);
      const v = toNum(rawVals[i]);
      if (dt !== null && Number.isFinite(v)) pairs.push({ d: dt, v });
    }
    pairs.sort((a, b) => a.d - b.d);
    values = pairs.map(p => p.v);
  } else {
    values = rawVals.map(toNum).filter(Number.isFinite);
  }
  return {
    values,
    valueName: valueCol.name || '',
    xLabel: dateCol ? (dateCol.name || '') : '',
  };
}

function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

/**
 * Parse a date-like value (Date | string | number) into epoch ms, or null if
 * it can't be parsed. Accepts ISO strings, numeric epochs, and Date objects.
 */
function parseDateValue(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const d = new Date(String(v));
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Bucket date+value rows for a multi-line time-series preview. Returns
 * `{ groups, xLabel, yLabel, legendTitle }` or null if the column shape
 * doesn't fit either supported case (cat-grouped or column-per-series).
 * Each group is `{ name, points: [{ d, v }] }`; points are unsorted.
 */
function collectDateLineGroups(date, cont, cat) {
  if (date.length < 1 || cont.length < 1) return null;
  const dateCol = date[0];
  const rawDates = dateCol.values || [];

  if (cont.length === 1 && cat.length === 1) {
    const yCol = cont[0];
    const gCol = cat[0];
    const yRaw = yCol.values || [];
    const gRaw = gCol.values || [];
    const N = Math.min(rawDates.length, yRaw.length, gRaw.length);
    const buckets = new Map(); // preserves insertion order
    for (let i = 0; i < N; i++) {
      const dt = parseDateValue(rawDates[i]);
      const yn = toNum(yRaw[i]);
      if (dt === null || !Number.isFinite(yn)) continue;
      const key = gRaw[i] == null ? '' : String(gRaw[i]);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ d: dt, v: yn });
    }
    return {
      groups: Array.from(buckets, ([name, points]) => ({ name, points })),
      xLabel: dateCol.name || '',
      yLabel: yCol.name || '',
      legendTitle: gCol.name || '',
    };
  }

  const groups = cont.map((yCol, idx) => {
    const yRaw = yCol.values || [];
    const n = Math.min(rawDates.length, yRaw.length);
    const points = [];
    for (let i = 0; i < n; i++) {
      const dt = parseDateValue(rawDates[i]);
      const yn = toNum(yRaw[i]);
      if (dt !== null && Number.isFinite(yn)) points.push({ d: dt, v: yn });
    }
    return { name: yCol.name || `Y${idx + 1}`, points };
  });
  return {
    groups,
    xLabel: dateCol.name || '',
    yLabel: cont.length === 1 ? (cont[0].name || '') : '',
    legendTitle: '',
  };
}

/**
 * Render the chart config for a multi-line date series. Sorts each group's
 * points by date and assigns a colour from the palette per group.
 */
function buildDateLineConfig({ groups, xLabel, yLabel, legendTitle }) {
  const series = groups.map((g, idx) => {
    g.points.sort((a, b) => a.d - b.d);
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    return {
      name: g.name,
      x: g.points.map(p => p.d),
      y: g.points.map(p => p.v),
      color,
      markerSize: 4,
      connectLine: { show: true, color, width: 1.5 },
    };
  });
  const config = {
    title: '',
    xLabel,
    yLabel,
    showLegend: series.length > 1,
    xTickFormat: (v) => {
      const d = new Date(v);
      return Number.isFinite(d.getTime())
        ? d.toISOString().slice(0, 10)
        : '';
    },
    series,
  };
  if (legendTitle) config.legendTitle = legendTitle;
  return config;
}

/**
 * Build the `groups` array for a boxplot / individual-value-plot.
 * Single continuous → one group; continuous + cat/ordinal → group per category.
 * Returns null if neither shape is possible.
 */
function boxplotGroups(cont, cat, t) {
  if (cont.length === 0) {
    if (cat.length === 0) return null;
    // multi-continuous case handled below
    return null;
  }
  // Multi-continuous: one box per continuous column
  if (cont.length > 1 && cat.length === 0) {
    return cont.map((c, i) => ({
      name: c.name || `c${i + 1}`,
      values: (c.values || []).map(toNum).filter(Number.isFinite),
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }
  // Single continuous, no cat
  if (cont.length === 1 && cat.length === 0) {
    const c = cont[0];
    return [{
      name: c.name || '',
      values: (c.values || []).map(toNum).filter(Number.isFinite),
      color: CHART_COLORS[0],
    }];
  }
  // Continuous + categorical/ordinal: group continuous values by category
  if (cont.length === 1 && cat.length >= 1) {
    const cVals = cont[0].values || [];
    const gVals = cat[0].values  || [];
    const buckets = new Map();
    const n = Math.min(cVals.length, gVals.length);
    for (let i = 0; i < n; i++) {
      const key = gVals[i] == null ? '' : String(gVals[i]);
      const num = toNum(cVals[i]);
      if (!Number.isFinite(num)) continue;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(num);
    }
    return Array.from(buckets.entries()).map(([name, values], i) => ({
      name,
      values,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }
  return null;
}

function countCategories(values) {
  const counts = new Map();
  for (const v of values) {
    if (v == null || v === '') continue;
    const key = String(v);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return {
    categories: Array.from(counts.keys()),
    counts:     Array.from(counts.values()),
  };
}

/**
 * Build a 2D cross-tab of two categorical columns:
 *   { categories: unique values of colA (in insertion order),
 *     groups:     one per unique value of colB, each with values[] = counts at each catA }
 * Rows where either side is empty/null are dropped.
 */
function crossTabCategorical(colA, colB) {
  const aVals = colA.values || [];
  const bVals = colB.values || [];
  const n = Math.min(aVals.length, bVals.length);

  const aCats = [];
  const bCats = [];
  const aIdx = new Map();
  const bIdx = new Map();
  const counts = []; // counts[aIdx][bIdx]

  for (let i = 0; i < n; i++) {
    const av = aVals[i];
    const bv = bVals[i];
    if (av == null || av === '' || bv == null || bv === '') continue;
    const ak = String(av);
    const bk = String(bv);
    if (!aIdx.has(ak)) { aIdx.set(ak, aCats.length); aCats.push(ak); counts.push([]); }
    if (!bIdx.has(bk)) { bIdx.set(bk, bCats.length); bCats.push(bk); }
    const ai = aIdx.get(ak);
    const bi = bIdx.get(bk);
    if (counts[ai][bi] == null) counts[ai][bi] = 0;
    counts[ai][bi] += 1;
  }

  const groups = bCats.map((bName, bi) => ({
    name: bName,
    values: aCats.map((_, ai) => counts[ai][bi] || 0),
    color: CHART_COLORS[bi % CHART_COLORS.length],
  }));

  return { categories: aCats, groups };
}

function toNum(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(',', '.');
  const n = Number(s);
  return n;
}

/** Tiny inline SVG thumbnail for each chart type. Decorative only. */
function chartThumbSVG(type) {
  // 30×30 viewbox, currentColor fills — picks up CSS color from .card-thumb
  const svgs = {
    histogram:               '<rect x="3" y="14" width="4" height="13"/><rect x="9" y="9"  width="4" height="18"/><rect x="15" y="5" width="4" height="22"/><rect x="21" y="11" width="4" height="16"/>',
    boxplot:                 '<g stroke="currentColor" stroke-width="1.5"><line x1="6" y1="15" x2="24" y2="15"/><rect x="9" y="9" width="12" height="12" fill="none"/><line x1="6" y1="9" x2="6" y2="21"/><line x1="24" y1="9" x2="24" y2="21"/></g>',
    'individual-value-plot': '<circle cx="6" cy="22" r="1.5"/><circle cx="10" cy="18" r="1.5"/><circle cx="14" cy="15" r="1.5"/><circle cx="18" cy="11" r="1.5"/><circle cx="22" cy="8" r="1.5"/>',
    scatter:                 '<circle cx="6" cy="22" r="1.5"/><circle cx="11" cy="14" r="1.5"/><circle cx="15" cy="19" r="1.5"/><circle cx="20" cy="10" r="1.5"/><circle cx="24" cy="16" r="1.5"/>',
    'scatter-matrix':        '<rect x="3"  y="3"  width="7" height="7" fill="none" stroke="currentColor" stroke-width="0.75"/><rect x="12" y="3"  width="7" height="7" fill="none" stroke="currentColor" stroke-width="0.75"/><rect x="21" y="3"  width="7" height="7" fill="none" stroke="currentColor" stroke-width="0.75"/><rect x="3"  y="12" width="7" height="7" fill="none" stroke="currentColor" stroke-width="0.75"/><rect x="12" y="12" width="7" height="7" fill="none" stroke="currentColor" stroke-width="0.75"/><rect x="21" y="12" width="7" height="7" fill="none" stroke="currentColor" stroke-width="0.75"/><rect x="3"  y="21" width="7" height="7" fill="none" stroke="currentColor" stroke-width="0.75"/><rect x="12" y="21" width="7" height="7" fill="none" stroke="currentColor" stroke-width="0.75"/><rect x="21" y="21" width="7" height="7" fill="none" stroke="currentColor" stroke-width="0.75"/><circle cx="14" cy="6"  r="0.7"/><circle cx="17" cy="8"  r="0.7"/><circle cx="23" cy="5"  r="0.7"/><circle cx="26" cy="8"  r="0.7"/><circle cx="5"  cy="15" r="0.7"/><circle cx="8"  cy="17" r="0.7"/><circle cx="23" cy="14" r="0.7"/><circle cx="26" cy="17" r="0.7"/><circle cx="5"  cy="24" r="0.7"/><circle cx="8"  cy="26" r="0.7"/><circle cx="14" cy="23" r="0.7"/><circle cx="17" cy="26" r="0.7"/>',
    'run-chart':             '<polyline points="3,20 9,12 15,18 21,8 27,14" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    'control-chart':         '<polyline points="3,15 9,20 15,12 21,18 27,14" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="3" y1="6" x2="27" y2="6" stroke-dasharray="2,2" stroke-width="0.75"/><line x1="3" y1="24" x2="27" y2="24" stroke-dasharray="2,2" stroke-width="0.75"/>',
    ewma:                    '<polyline points="3,18 7,16 11,17 15,14 19,12 23,9 27,7" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="3" y1="5" x2="27" y2="5" stroke-dasharray="2,2" stroke-width="0.75"/><line x1="3" y1="25" x2="27" y2="25" stroke-dasharray="2,2" stroke-width="0.75"/>',
    cusum:                   '<polyline points="3,15 7,14 11,12 15,9 19,5 23,4 27,3" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="3,15 7,16 11,18 15,21 19,25 23,26 27,27" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="3" y1="15" x2="27" y2="15" stroke-dasharray="1,2" stroke-width="0.75" opacity="0.6"/>',
    'probability-plot':      '<polyline points="3,24 8,18 13,14 18,11 23,8 27,5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    pareto:                  '<rect x="3" y="6" width="4" height="21"/><rect x="9" y="11" width="4" height="16"/><rect x="15" y="15" width="4" height="12"/><rect x="21" y="20" width="4" height="7"/><polyline points="5,7 11,12 17,17 23,21 26,24" fill="none" stroke="currentColor" stroke-width="0.75"/>',
    bar:                     '<rect x="4" y="10" width="5" height="17"/><rect x="11" y="6"  width="5" height="21"/><rect x="18" y="14" width="5" height="13"/>',
    pie:                     '<circle cx="15" cy="15" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M15 15 L15 5 A10 10 0 0 1 24 19 Z" fill="currentColor" opacity="0.5"/>',
    mosaic:                  '<rect x="3" y="3" width="11" height="13" fill="currentColor" opacity="0.55"/><rect x="3" y="17" width="11" height="10" fill="currentColor" opacity="0.3"/><rect x="15" y="3" width="6" height="9" fill="currentColor" opacity="0.55"/><rect x="15" y="13" width="6" height="14" fill="currentColor" opacity="0.3"/><rect x="22" y="3" width="5" height="18" fill="currentColor" opacity="0.55"/><rect x="22" y="22" width="5" height="5" fill="currentColor" opacity="0.3"/>',
    heatmap:                 '<rect x="3"  y="3"  width="8" height="8" fill="currentColor" opacity="0.85"/><rect x="12" y="3"  width="8" height="8" fill="currentColor" opacity="0.45"/><rect x="21" y="3"  width="8" height="8" fill="currentColor" opacity="0.20"/><rect x="3"  y="12" width="8" height="8" fill="currentColor" opacity="0.45"/><rect x="12" y="12" width="8" height="8" fill="currentColor" opacity="0.65"/><rect x="21" y="12" width="8" height="8" fill="currentColor" opacity="0.30"/><rect x="3"  y="21" width="8" height="8" fill="currentColor" opacity="0.15"/><rect x="12" y="21" width="8" height="8" fill="currentColor" opacity="0.30"/><rect x="21" y="21" width="8" height="8" fill="currentColor" opacity="0.75"/>',
    bubble:                  '<circle cx="7"  cy="22" r="3.5" fill="currentColor" opacity="0.55"/><circle cx="13" cy="14" r="2"   fill="currentColor" opacity="0.55"/><circle cx="20" cy="9"  r="5.5" fill="currentColor" opacity="0.55"/><circle cx="25" cy="20" r="2.8" fill="currentColor" opacity="0.55"/>',
  };
  const body = svgs[type] || '<rect x="3" y="3" width="24" height="24" fill="none" stroke="currentColor"/>';
  return `<svg viewBox="0 0 30 30" width="100%" height="100%" fill="currentColor">${body}</svg>`;
}

export default mod;
