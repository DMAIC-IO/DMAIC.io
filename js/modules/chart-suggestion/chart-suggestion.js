/**
 * D.Mike — Chart Suggestion Module (chart-suggestion.js)
 *
 * Migrated to createModule + Alpine CSP. The Alpine template
 * (chart-suggestion.html) provides the declarative SHELL: the split layout,
 * the selection-role chips (x-for), the ranked suggestion cards (x-for) with
 * active state, and the preview header (title/notes/open button). The empty
 * state is a declarative x-if.
 *
 * The preview PLOT is a module-owned imperative CHART TIER (the sanctioned
 * chart-tier exception to "no HTML in JS", same pattern as histogram /
 * control-chart): it renders through context.chartManager plus several custom
 * composite grids (SPLOM matrix, main-effects, interaction plot, boxplot
 * trellis, scatter-marginal, stacked CUSUM) that the chart types cannot express
 * declaratively. Card thumbnail SVGs are tiny decorative glyphs injected into
 * their [data-thumb] anchors after each render (decorative-SVG exception — no
 * structural module UI is built in JS).
 *
 * Cross-module contract (preserved byte-for-byte): the module HEARS the
 * event-bus message `chart-suggestion:load` { instanceId, selection } (emitted
 * by the Worksheet toolbar), and EMITS `module:added` when the "Open in module"
 * button spawns a standalone chart module.
 *
 * Selection state + the prefill adapters live in chart-suggestion-model.js; the
 * ranking rule-engine is the shared core util core/chart-suggestions/.
 */

import { createModule } from '../../core/template-module.js';
import { State } from './chart-suggestion-model.js';
import { h } from '../../core/dom.js';
import { icon } from '../../core/icon.js';
import { CHART_COLORS } from '../../core/chart/chart-colors.js';
import { computeIMR } from '../../engines/control-chart-engine.js';
import { computeEWMA, computeCUSUM, estimateSigma } from '../../engines/time-weighted-chart-engine.js';
import { groupedMeans, cellMeans } from '../../engines/grouped-aggregations.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';

const mod = createModule({
  config: {
    id: 'chart-suggestion',
    engine: 'alpine',
    phase: 'data',
    icon: 'sparkles',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    /** Module-scoped i18n for `modules.chart-suggestion.<key>` (with params). */
    const t = (k, v) => module._context.i18n.t(`modules.chart-suggestion.${k}`, v);

    return {
      // ── Transient render state (never persisted) ──────────────
      _charts: [],
      _unsubs: [],
      _renderGen: 0,
      previewPlaceholder: '', // empty-state message for the preview plot (sibling anchor)

      // ── View transforms (i18n / CSS) ──────────────────────────
      emptyText() {
        return this.model.selection ? t('emptyStateNoMatch') : t('emptyStateNoSelection');
      },
      selectionColumns() {
        return (this.model.selection && this.model.selection.columns) || [];
      },
      selectionLabel() {
        return t('selectionLabel', { n: this.selectionColumns().length });
      },
      roleName(role) { return t(`role.${  role}`); },
      chartTitle(s) { return t(`charts.${  s.i18nKey}`); },
      chartNotes(s) { return s.notesKey ? t(`notes.${  s.notesKey}`) : ''; },
      cardClass(s) {
        return s.type === this.model.selectedChartType ? 'chart-suggestion__card--active' : '';
      },
      openBtnVisible() { return Boolean(this.model.buildPrefill()); },

      // ── Event handlers ────────────────────────────────────────
      pickChart(type) {
        if (type === this.model.selectedChartType) return;
        this.model.selectedChartType = type;
        // Card --active + open-btn visibility update reactively via Alpine.
        this._renderPreview();
      },

      openInModule() {
        const prefill = this.model.buildPrefill();
        if (!prefill) return;
        const sm = module._context.stateManager;
        const phase = this._findOwnPhase();
        const instances = sm.get(`phases.${phase}`) || [];
        const instanceId = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `${prefill.target}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const updated = instances.slice();
        updated.push({ instanceId, moduleId: prefill.target, order: updated.length, state: {} });
        sm.set(`phases.${phase}`, updated);
        sm.setModuleState(instanceId, prefill.state);
        module._context.eventBus.emit('module:added', {
          moduleId: prefill.target, phase, instanceId,
        });
      },

      _findOwnPhase() {
        const sm = module._context.stateManager;
        const phases = sm.get('phases') || {};
        for (const phase of Object.keys(phases)) {
          if ((phases[phase] || []).some(i => i.instanceId === module._context.instanceId)) {
            return phase;
          }
        }
        return 'data';
      },

      // ── Imperative render orchestration ───────────────────────

      /**
       * Bounded rAF poll for a `[data-ref]`/`[data-thumb]` anchor that lives
       * INSIDE a nested Alpine `x-if`/`x-for` template (materialised over several
       * reactive flush cycles, so a single rAF can fire before it exists). Resolves
       * the element once present, aborts on a newer render (`gen`), gives up after
       * `maxFrames`. See `.claude/alpine.md` §6 / correlation `_whenAnchor`.
       */
      _whenAnchor(selector, gen, maxFrames = 30) {
        return new Promise((resolve) => {
          const tick = (left) => {
            if (gen !== this._renderGen) { resolve(null); return; }
            const el = module._container?.querySelector(selector);
            if (el) { resolve(el); return; }
            if (left <= 0) { resolve(null); return; }
            requestAnimationFrame(() => tick(left - 1));
          };
          tick(maxFrames);
        });
      },

      /**
       * Create one chart into `cell`, guarded by the render generation `gen`:
       * if a newer render started while the (awaited) create was in flight, the
       * freshly-built chart is destroyed and dropped (never pushed into `_charts`
       * nor left in a stale/detached cell). On failure, writes the esc-wrapped
       * error placeholder into `cell`. Mirrors correlation's `_mkScatter`.
       */
      async _mkChart(cell, gen, type, config) {
        let chart;
        try {
          chart = await module._context.chartManager.create(cell, type, config);
        } catch (err) {
          if (gen !== this._renderGen) return null;
          cell.replaceChildren(h('div', { class: 'chart-suggestion__placeholder chart-suggestion__placeholder--error' }, err.message || String(err)));
          return null;
        }
        if (gen !== this._renderGen) {
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return null;
        }
        this._charts.push(chart);
        return chart;
      },

      /** Inject decorative thumbnail SVGs + render the active preview. */
      async _afterRender() {
        const gen = this._renderGen;
        // Thumbs live inside the nested `x-for` under `x-if="suggestions.length>0"`;
        // wait for the first one before injecting (anchor may not exist yet).
        const firstThumb = await this._whenAnchor('[data-thumb]', gen);
        if (firstThumb && gen === this._renderGen) {
          const thumbs = module._container?.querySelectorAll('[data-thumb]');
          thumbs?.forEach(el => { el.replaceChildren(chartThumbNode(el.getAttribute('data-thumb'))); });
        }
        this._renderPreview();
      },

      _destroyCharts() {
        const cm = module._context?.chartManager;
        if (!cm) { this._charts = []; return; }
        for (const chart of this._charts) {
          try { cm.destroy(chart); } catch { /* best-effort teardown; ignore */ }
        }
        this._charts = [];
      },

      async _renderPreview() {
        const gen = ++this._renderGen;
        const titleEl = module._container?.querySelector('[data-ref="preview-title"]');
        const notesEl = module._container?.querySelector('[data-ref="preview-notes"]');
        // The plot anchor lives inside the nested `x-if="suggestions.length>0"`
        // template — poll until it materialises (blank preview otherwise).
        const plotEl  = await this._whenAnchor('[data-ref="plot"]', gen);
        if (!plotEl || gen !== this._renderGen) return;

        this._destroyCharts();
        plotEl.replaceChildren();
        this.previewPlaceholder = '';

        const sugg = this.model.suggestions.find(s => s.type === this.model.selectedChartType);
        if (!sugg) {
          if (titleEl) titleEl.textContent = '';
          if (notesEl) notesEl.textContent = '';
          return;
        }

        if (titleEl) titleEl.textContent = t(`charts.${  sugg.i18nKey}`);
        if (notesEl) notesEl.textContent = sugg.notesKey ? t(`notes.${  sugg.notesKey}`) : '';

        const cols = (this.model.selection && this.model.selection.columns) || [];

        if (sugg.type === 'scatter-matrix') { await this._renderScatterMatrix(plotEl, cols, gen); return; }
        if (sugg.type === 'main-effects')   { await this._renderMainEffectsPlot(plotEl, cols, gen); return; }
        if (sugg.type === 'interaction-plot') { await this._renderInteractionPlot(plotEl, cols, gen); return; }
        if (sugg.type === 'boxplot') {
          const grouping = cols.filter(c => c.role === 'categorical' || c.role === 'ordinal').length;
          if (grouping === 2) { await this._renderBoxplotTrellis(plotEl, cols, gen); return; }
        }
        if (sugg.type === 'scatter-marginal-boxplot')   { await this._renderScatterMarginal(plotEl, cols, 'boxplot', gen); return; }
        if (sugg.type === 'scatter-marginal-histogram') { await this._renderScatterMarginal(plotEl, cols, 'histogram', gen); return; }
        if (sugg.type === 'cusum') { await this._renderCusumStacked(plotEl, cols, gen); return; }

        const config = buildChartConfig(sugg.type, cols, t);
        if (!config) {
          this.previewPlaceholder = t('previewUnavailable', { type: sugg.type });
          return;
        }
        await this._mkChart(plotEl, gen, config.chartType || sugg.type, config);
      },

      async _renderScatterMatrix(plotEl, columns, gen) {
        const allCont = columns.filter(c => c.role === 'continuous');
        if (allCont.length < 2) {
          this.previewPlaceholder = t('previewUnavailable', { type: 'scatter-matrix' });
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
            if (gen !== this._renderGen) return;
            const cell = document.createElement('div');
            cell.className = 'chart-suggestion__matrix-cell';
            grid.appendChild(cell);

            if (r === c) {
              cell.classList.add('chart-suggestion__matrix-cell--diag');
              cell.textContent = cols[r].name || `c${r + 1}`;
              continue;
            }
            const xCol = cols[c], yCol = cols[r];
            const xRaw = xCol.values || [], yRaw = yCol.values || [];
            const N = Math.min(xRaw.length, yRaw.length);
            const xs = [], ys = [];
            for (let i = 0; i < N; i++) {
              const xn = toNum(xRaw[i]), yn = toNum(yRaw[i]);
              if (Number.isFinite(xn) && Number.isFinite(yn)) { xs.push(xn); ys.push(yn); }
            }
            const config = {
              title: '', xLabel: '', yLabel: '', showLegend: false,
              series: [{ name: `${xCol.name || 'X'} vs ${yCol.name || 'Y'}`, x: xs, y: ys, color: CHART_COLORS[0] }],
            };
            await this._mkChart(cell, gen, 'scatter', config);
          }
        }
      },

      async _renderMainEffectsPlot(plotEl, columns, gen) {
        const yCol = columns.find(c => c.role === 'continuous');
        const factors = columns.filter(c => c.role === 'categorical' || c.role === 'ordinal');
        if (!yCol || factors.length === 0) {
          this.previewPlaceholder = t('previewUnavailable', { type: 'main-effects' });
          return;
        }
        const panels = factors.map(f => ({ factor: f, gm: groupedMeans(yCol.values || [], f.values || []) }));
        const yValsAll = (yCol.values || []).map(toNum).filter(Number.isFinite);
        const overallY = yValsAll.length > 0 ? yValsAll.reduce((s, v) => s + v, 0) / yValsAll.length : NaN;

        let yMin = Infinity, yMax = -Infinity;
        for (const p of panels) {
          for (const m of p.gm.means) {
            if (Number.isFinite(m)) { if (m < yMin) yMin = m; if (m > yMax) yMax = m; }
          }
        }
        if (Number.isFinite(overallY)) { if (overallY < yMin) yMin = overallY; if (overallY > yMax) yMax = overallY; }
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
          if (gen !== this._renderGen) return;
          const cell = document.createElement('div');
          cell.className = 'chart-suggestion__matrix-cell';
          grid.appendChild(cell);
          if (gm.levels.length === 0) {
            cell.replaceChildren(h('div', { class: 'chart-suggestion__placeholder' }, t('previewUnavailable', { type: 'main-effects' })));
            continue;
          }
          const xs = gm.levels.map((_, i) => i);
          const config = {
            title: factor.name || '', titleSize: 12, labelSize: 11, tickSize: 10,
            xLabel: '', yLabel: yCol.name || '', showLegend: false,
            xMin: -0.5, xMax: gm.levels.length - 0.5, yMin, yMax, xTicks: xs,
            xTickFormat: (v) => { const idx = Math.round(v); return idx >= 0 && idx < gm.levels.length ? gm.levels[idx] : ''; },
            refLines: Number.isFinite(overallY) ? [{ dir: 'h', value: overallY, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' }] : [],
            series: [{
              name: factor.name || '', color: CHART_COLORS[0], markerSize: 5,
              x: xs, y: gm.means,
              connectLine: { show: true, dash: 'solid', width: 2, color: CHART_COLORS[0] },
            }],
          };
          await this._mkChart(cell, gen, 'scatter', config);
        }
      },

      async _renderInteractionPlot(plotEl, columns, gen) {
        const yCol = columns.find(c => c.role === 'continuous');
        const factors = columns.filter(c => c.role === 'categorical' || c.role === 'ordinal');
        if (!yCol || factors.length < 2) {
          this.previewPlaceholder = t('previewUnavailable', { type: 'interaction-plot' });
          return;
        }
        const fA = factors[0], fB = factors[1];
        const { aLevels, bLevels, means } = cellMeans(yCol.values || [], fA.values || [], fB.values || []);
        if (aLevels.length === 0 || bLevels.length === 0) {
          this.previewPlaceholder = t('previewUnavailable', { type: 'interaction-plot' });
          return;
        }
        const series = bLevels.map((bName, bi) => ({
          name: bName, color: CHART_COLORS[bi % CHART_COLORS.length], markerSize: 5,
          x: aLevels.map((_, ai) => ai),
          y: aLevels.map((_, ai) => means[ai][bi]),
          connectLine: { show: true, dash: 'solid', width: 2, color: CHART_COLORS[bi % CHART_COLORS.length] },
        }));
        let yMin = Infinity, yMax = -Infinity;
        for (const s of series) {
          for (const v of s.y) { if (Number.isFinite(v)) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; } }
        }
        if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) {
          yMin = (yMin === yMax && Number.isFinite(yMin)) ? yMin - 1 : 0;
          yMax = Number.isFinite(yMax) ? yMax + 1 : 1;
        }
        const yPad = (yMax - yMin) * 0.15 || 1;
        yMin -= yPad; yMax += yPad;
        const config = {
          title: '', titleSize: 13, labelSize: 11, tickSize: 10,
          xLabel: fA.name || '', yLabel: yCol.name || '', showLegend: true, legendTitle: fB.name || '',
          xMin: -0.5, xMax: aLevels.length - 0.5, yMin, yMax,
          xTicks: aLevels.map((_, i) => i),
          xTickFormat: (v) => { const idx = Math.round(v); return idx >= 0 && idx < aLevels.length ? aLevels[idx] : ''; },
          series,
        };
        await this._mkChart(plotEl, gen, 'scatter', config);
      },

      async _renderBoxplotTrellis(plotEl, columns, gen) {
        const yCol = columns.find(c => c.role === 'continuous');
        const factors = columns.filter(c => c.role === 'categorical' || c.role === 'ordinal');
        if (!yCol || factors.length < 2) {
          this.previewPlaceholder = t('previewUnavailable', { type: 'boxplot' });
          return;
        }
        const fA = factors[0], fB = factors[1];
        const yVals = yCol.values || [], aVals = fA.values || [], bVals = fB.values || [];
        const N = Math.min(yVals.length, aVals.length, bVals.length);
        const aLevels = [], bLevels = [];
        const seenA = new Set(), seenB = new Set();
        for (let i = 0; i < N; i++) {
          const a = aVals[i] == null ? '' : String(aVals[i]);
          const b = bVals[i] == null ? '' : String(bVals[i]);
          if (!seenA.has(a)) { seenA.add(a); aLevels.push(a); }
          if (!seenB.has(b)) { seenB.add(b); bLevels.push(b); }
        }
        if (aLevels.length === 0 || bLevels.length === 0) {
          this.previewPlaceholder = t('previewUnavailable', { type: 'boxplot' });
          return;
        }
        const bucket = new Map();
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
          if (gen !== this._renderGen) return;
          const cell = document.createElement('div');
          cell.className = 'chart-suggestion__matrix-cell';
          grid.appendChild(cell);
          const groups = aLevels.map((aLevel, ai) => ({
            name: aLevel, values: bucket.get(bLevel).get(aLevel), color: CHART_COLORS[ai % CHART_COLORS.length],
          }));
          const config = {
            title: `${fB.name || ''}: ${bLevel}`.trim(), titleSize: 12, labelSize: 11, tickSize: 10,
            xLabel: yCol.name || '', yLabel: '', showLegend: false, showMean: true, showOutliers: true,
            xMin, xMax, groups,
          };
          await this._mkChart(cell, gen, 'boxplot', config);
        }
      },

      async _renderScatterMarginal(plotEl, columns, kind, gen) {
        const cont = columns.filter(c => c.role === 'continuous');
        if (cont.length < 2) {
          this.previewPlaceholder = t('previewUnavailable', { type: `scatter-marginal-${  kind}` });
          return;
        }
        const xCol = cont[0], yCol = cont[1];
        const xRaw = xCol.values || [], yRaw = yCol.values || [];
        const n = Math.min(xRaw.length, yRaw.length);
        const xs = [], ys = [];
        for (let i = 0; i < n; i++) {
          const xn = toNum(xRaw[i]), yn = toNum(yRaw[i]);
          if (Number.isFinite(xn) && Number.isFinite(yn)) { xs.push(xn); ys.push(yn); }
        }
        if (xs.length === 0) {
          this.previewPlaceholder = t('previewUnavailable', { type: `scatter-marginal-${  kind}` });
          return;
        }
        const padRange = (vals) => {
          const mn = Math.min(...vals), mx = Math.max(...vals);
          const p = (mx - mn) * 0.05 || 0.5;
          return { min: mn - p, max: mx + p };
        };
        const xR = padRange(xs), yR = padRange(ys);

        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateRows = '22% 78%';
        grid.style.gridTemplateColumns = '78% 22%';
        grid.style.gap = '4px';
        grid.style.width = '100%';
        grid.style.height = '100%';
        grid.style.minHeight = '0';
        const makeCell = () => { const c = document.createElement('div'); c.className = 'chart-suggestion__matrix-cell'; grid.appendChild(c); return c; };
        const cellTopX = makeCell();
        const cellTopR = makeCell();
        const cellBotX = makeCell();
        const cellBotR = makeCell();
        plotEl.appendChild(grid);
        cellTopR.style.background = 'transparent';
        cellTopR.style.border = 'none';

        await this._mkChart(cellBotX, gen, 'scatter', {
          title: '', xLabel: xCol.name || '', yLabel: yCol.name || '',
          xMin: xR.min, xMax: xR.max, yMin: yR.min, yMax: yR.max, showLegend: false,
          series: [{ name: `${xCol.name || 'X'} vs ${yCol.name || 'Y'}`, x: xs, y: ys, color: CHART_COLORS[0] }],
        });

        if (kind === 'boxplot') {
          await this._mkChart(cellTopX, gen, 'boxplot', {
            title: '', xLabel: '', yLabel: '', showLegend: false, showMean: false,
            xMin: xR.min, xMax: xR.max, groups: [{ name: '', values: xs, color: CHART_COLORS[0] }],
          });
          await this._mkChart(cellBotR, gen, 'boxplot', {
            title: '', xLabel: '', yLabel: '', showLegend: false, showMean: false, orientation: 'vertical',
            yMin: yR.min, yMax: yR.max, groups: [{ name: '', values: ys, color: CHART_COLORS[0] }],
          });
        } else {
          await this._mkChart(cellTopX, gen, 'histogram', {
            title: '', xLabel: '', yLabel: '', showLegend: false, showXTicks: false, showYTicks: false,
            xMin: xR.min, xMax: xR.max, data: xs, barColor: CHART_COLORS[0],
          });
          await this._mkChart(cellBotR, gen, 'histogram', {
            title: '', xLabel: '', yLabel: '', showLegend: false, showXTicks: false, showYTicks: false,
            orientation: 'horizontal', yMin: yR.min, yMax: yR.max, data: ys, barColor: CHART_COLORS[0],
          });
        }
      },

      async _renderCusumStacked(plotEl, columns, gen) {
        const date = columns.filter(c => c.role === 'date');
        const cont = columns.filter(c => c.role === 'continuous');
        const prep = collectTimeOrderedSeries(date, cont);
        if (!prep || prep.values.length < 3) {
          this.previewPlaceholder = t('previewUnavailable', { type: 'cusum' });
          return;
        }
        const target = mean(prep.values);
        const sigma = estimateSigma(prep.values, 'mr');
        if (!(sigma > 0)) {
          this.previewPlaceholder = t('previewUnavailable', { type: 'cusum' });
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
          if (gen !== this._renderGen) return;
          const cell = document.createElement('div');
          cell.className = 'chart-suggestion__matrix-cell';
          grid.appendChild(cell);
          await this._mkChart(cell, gen, 'control-chart', {
            title: p.label, titleSize: 12, labelSize: 11, tickSize: 10,
            xLabel: '', yLabel: '', showLegend: false,
            values: p.values, cl: 0, ucl: r.h, lcl: 0, sigma: 0, showZones: false,
            violationIndices: new Set(p.signals),
          });
        }
      },

      // ── Lifecycle ─────────────────────────────────────────────
      init() {
        const eb = module._context.eventBus;

        // Cross-module: the Worksheet toolbar emits `chart-suggestion:load`.
        // Same handler behavior as legacy _subscribeEvents.
        const onLoad = ({ instanceId, selection }) => {
          if (instanceId !== module._context.instanceId) return;
          this.model.selection = selection;
          this.model.selectedChartType = null;
          this.model.recomputeSuggestions();
          // Declarative shell (chips/cards/empty-state) re-renders reactively;
          // re-inject thumbs + render preview imperatively next frame.
          requestAnimationFrame(() => this._afterRender());
        };
        eb.on('chart-suggestion:load', onLoad);
        this._unsubs.push(() => eb.off('chart-suggestion:load', onLoad));

        // Re-render preview on theme change so chart colors refresh (legacy parity).
        const onTheme = () => { if (this._charts.length) this._renderPreview(); };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Initial render of thumbs + preview from the restored state.
        requestAnimationFrame(() => this._afterRender());
      },

      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        // Bump the render generation so any in-flight `_whenAnchor` rAF-poll or
        // `_mkChart` create aborts on its next tick instead of touching detached
        // cells after teardown.
        this._renderGen++;
        this._destroyCharts();
      },
    };
  },
});

/**
 * Load a catalog example via the shared worksheet-backed flow. The helper
 * provisions a worksheet from `sourceWorksheetData` (resolved from
 * `sourceWorksheetFile` by examples-registry), records its id as
 * `exampleWorksheetId`, cleans up any prior example-provisioned sheet, applies
 * the result via setState (rebuilding the Alpine tree → re-init → render) and
 * emits the success toast.
 *
 * Chart-suggestion's only special-casing — the `__source__` placeholder lives
 * on the scalar `selection.sourceInstanceId` rather than in a refs array — is
 * expressed in the `rewriteRefs` callback, which also re-stamps `selection.ts`
 * to match the legacy behaviour (the model's `cloneSelection` would otherwise
 * null a missing `ts`). The legacy `sourceSheetId` fallback to the provisioned
 * sheet id is intentionally dropped: every shipped example carries an explicit
 * `selection.sourceSheetId`, so that branch was never exercised.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, instanceId) {
      if (data.selection && data.selection.sourceInstanceId === '__source__') {
        data.selection = { ...data.selection, sourceInstanceId: instanceId };
      }
      if (data.selection) data.selection = { ...data.selection, ts: Date.now() };
      return data;
    },
  });
};

// ─── Helpers (module-scope, pure) ────────────────────────────────

/**
 * Build a chart-config object for the given chart type from the column
 * snapshot. Returns null if the type is not supported in the preview yet.
 * `t` is a translator scoped to `modules.chart-suggestion`.
 */
function buildChartConfig(chartType, columns, t) {
  const cont = columns.filter(c => c.role === 'continuous');
  const cat  = columns.filter(c => c.role === 'categorical' || c.role === 'ordinal');
  const date = columns.filter(c => c.role === 'date');
  const numericVals = (c) => (c?.values || []).map(toNum).filter(v => Number.isFinite(v));

  switch (chartType) {
    case 'histogram': {
      if (cont.length === 0) return null;
      const c = cont[0];
      return { title: c.name || '', xLabel: c.name || '', yLabel: t('axis.frequency'), data: numericVals(c), showNormalCurve: true };
    }
    case 'boxplot': {
      const groups = boxplotGroups(cont, cat);
      if (!groups) return null;
      return { title: '', xLabel: '', yLabel: '', showLegend: groups.length > 1, showMean: true, showOutliers: true, groups };
    }
    case 'individual-value-plot': {
      const groups = boxplotGroups(cont, cat);
      if (!groups) return null;
      return { title: '', xLabel: '', yLabel: '', showLegend: groups.length > 1, groups };
    }
    case 'run-chart': {
      if (cont.length === 0) return null;
      const c = cont[0];
      return { title: c.name || '', xLabel: t('axis.observation'), yLabel: c.name || '', values: numericVals(c), pointColor: CHART_COLORS[0], lineColor: CHART_COLORS[0] };
    }
    case 'scatter': {
      const dateGroups = collectDateLineGroups(date, cont, cat);
      if (dateGroups) return buildDateLineConfig(dateGroups);
      if (cont.length < 2) return null;
      const xCol = cont[0], yCol = cont[1];
      const xRaw = xCol.values || [], yRaw = yCol.values || [];
      const n = Math.min(xRaw.length, yRaw.length);
      const xs = [], ys = [];
      for (let i = 0; i < n; i++) {
        const xn = toNum(xRaw[i]), yn = toNum(yRaw[i]);
        if (Number.isFinite(xn) && Number.isFinite(yn)) { xs.push(xn); ys.push(yn); }
      }
      return { title: '', xLabel: xCol.name || '', yLabel: yCol.name || '', series: [{ name: `${xCol.name || 'X'} vs ${yCol.name || 'Y'}`, x: xs, y: ys, color: CHART_COLORS[0] }] };
    }
    case 'bar': {
      if (cat.length >= 2) {
        const colA = cat[0], colB = cat[1];
        const { categories, groups } = crossTabCategorical(colA, colB);
        if (categories.length === 0) return null;
        return { title: '', xLabel: colA.name || '', yLabel: t('axis.count'), categories, groups, stacked: true, showLegend: true, legendTitle: colB.name || '' };
      }
      if (cont.length >= 1 && cat.length >= 1) {
        const yCol = cont[0], factor = cat[0];
        const { levels, means } = groupedMeans(yCol.values || [], factor.values || []);
        const valid = levels.map((lvl, i) => ({ lvl, m: means[i] })).filter(p => Number.isFinite(p.m));
        if (valid.length === 0) return null;
        return { title: '', xLabel: factor.name || '', yLabel: yCol.name || '', categories: valid.map(p => p.lvl), groups: [{ name: yCol.name || '', values: valid.map(p => p.m), color: CHART_COLORS[0] }] };
      }
      const cc = cat[0] || cont[0];
      if (!cc) return null;
      const { categories, counts } = countCategories(cc.values || []);
      return { title: cc.name || '', xLabel: cc.name || '', yLabel: t('axis.count'), categories, groups: [{ name: cc.name || '', values: counts, color: CHART_COLORS[0] }] };
    }
    case 'bubble': {
      if (cont.length < 3) return null;
      const xCol = cont[0], yCol = cont[1], sCol = cont[2];
      const xRaw = xCol.values || [], yRaw = yCol.values || [], sRaw = sCol.values || [];
      const N = Math.min(xRaw.length, yRaw.length, sRaw.length);
      const xs = [], ys = [], rawSizes = [];
      for (let i = 0; i < N; i++) {
        const xn = toNum(xRaw[i]), yn = toNum(yRaw[i]), sn = toNum(sRaw[i]);
        if (Number.isFinite(xn) && Number.isFinite(yn) && Number.isFinite(sn) && sn >= 0) { xs.push(xn); ys.push(yn); rawSizes.push(sn); }
      }
      if (xs.length === 0) return null;
      const D_MIN = 6, D_MAX = 28;
      const sqrtVals = rawSizes.map(Math.sqrt);
      const sMin = Math.min(...sqrtVals), sMax = Math.max(...sqrtVals);
      const span = sMax - sMin;
      const sizes = sqrtVals.map(sv => { const tt = span > 0 ? (sv - sMin) / span : 0.5; return D_MIN + tt * (D_MAX - D_MIN); });
      return { chartType: 'scatter', title: '', xLabel: xCol.name || '', yLabel: yCol.name || '', showLegend: false, series: [{ name: sCol.name || '', x: xs, y: ys, sizes, sizeValues: rawSizes, sizeLabel: sCol.name || '', color: CHART_COLORS[0] }] };
    }
    case 'mosaic': {
      if (cat.length < 2) return null;
      const colA = cat[0], colB = cat[1];
      const { categories, groups } = crossTabCategorical(colA, colB);
      if (categories.length === 0) return null;
      return { title: '', xLabel: colA.name || '', yLabel: '', categories, groups, showLegend: true, legendTitle: colB.name || '' };
    }
    case 'heatmap': {
      if (cont.length >= 1 && cat.length >= 2) {
        const yCol = cont[0], colA = cat[0], colB = cat[1];
        const { aLevels, bLevels, means } = cellMeans(yCol.values || [], colA.values || [], colB.values || []);
        if (aLevels.length === 0 || bLevels.length === 0) return null;
        return { title: '', xLabel: colB.name || '', yLabel: colA.name || '', xCategories: bLevels, yCategories: aLevels, cells: means, valueLabel: t('axis.mean'), valueDecimals: 2 };
      }
      if (cat.length >= 2) {
        const colA = cat[0], colB = cat[1];
        const { categories, groups } = crossTabCategorical(colA, colB);
        if (categories.length === 0 || groups.length === 0) return null;
        const cells = groups.map(g => categories.map((_, ci) => g.values[ci] || 0));
        return { title: '', xLabel: colA.name || '', yLabel: colB.name || '', xCategories: categories, yCategories: groups.map(g => g.name), cells, valueLabel: t('axis.count'), valueDecimals: 0 };
      }
      return null;
    }
    case 'pareto': {
      const otherLabel = t('axis.other');
      const otherCount = t('axis.otherCategories');
      if (cat.length >= 2) {
        const colA = cat[0], colB = cat[1];
        const { categories, groups } = crossTabCategorical(colA, colB);
        if (categories.length === 0) return null;
        return { title: '', xLabel: colA.name || '', yLabel: t('axis.count'), categories, groups, showLegend: true, legendTitle: colB.name || '', otherBucket: true, otherLabel, otherCountTemplate: otherCount };
      }
      const cc = cat[0] || cont[0];
      if (!cc) return null;
      const counted = countCategories(cc.values || []);
      const items = counted.categories.map((c, i) => ({ name: c, value: counted.counts[i], color: CHART_COLORS[0] })).sort((a, b) => b.value - a.value);
      return { title: cc.name || '', xLabel: cc.name || '', yLabel: t('axis.count'), items, otherBucket: true, otherLabel, otherCountTemplate: otherCount };
    }
    case 'pie': {
      const cc = cat[0];
      if (!cc) return null;
      const { categories, counts } = countCategories(cc.values || []);
      return { title: cc.name || '', slices: categories.map((c, i) => ({ label: c, value: counts[i], color: CHART_COLORS[i % CHART_COLORS.length] })) };
    }
    case 'probability-plot': {
      if (cont.length === 0) return null;
      const c = cont[0];
      return { title: c.name || '', xLabel: c.name || '', yLabel: t('axis.percentile'), data: numericVals(c), markerColor: CHART_COLORS[0] };
    }
    case 'control-chart': {
      const prep = collectTimeOrderedSeries(date, cont);
      if (!prep || prep.values.length < 2) return null;
      const result = computeIMR(prep.values);
      const sub = result.subcharts.i;
      return { title: prep.valueName, xLabel: prep.xLabel || t('axis.observation'), yLabel: prep.valueName, values: sub.values, cl: sub.cl, ucl: sub.ucl, lcl: sub.lcl, sigma: sub.sigma, labels: result.labels };
    }
    case 'ewma': {
      const prep = collectTimeOrderedSeries(date, cont);
      if (!prep || prep.values.length < 3) return null;
      const target = mean(prep.values);
      const sigma = estimateSigma(prep.values, 'mr');
      if (!(sigma > 0)) return null;
      const r = computeEWMA(prep.values, target, sigma, 0.2, 3);
      return { chartType: 'control-chart', title: prep.valueName, xLabel: prep.xLabel || t('axis.observation'), yLabel: prep.valueName, values: r.values, cl: r.cl, ucl: r.ucl, lcl: r.lcl, sigma: r.sigma, showZones: false, violationIndices: new Set(r.signals) };
    }
    default:
      return null;
  }
}

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
  return { values, valueName: valueCol.name || '', xLabel: dateCol ? (dateCol.name || '') : '' };
}

function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function parseDateValue(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) { const t = v.getTime(); return Number.isFinite(t) ? t : null; }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const d = new Date(String(v));
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

function collectDateLineGroups(date, cont, cat) {
  if (date.length < 1 || cont.length < 1) return null;
  const dateCol = date[0];
  const rawDates = dateCol.values || [];
  if (cont.length === 1 && cat.length === 1) {
    const yCol = cont[0], gCol = cat[0];
    const yRaw = yCol.values || [], gRaw = gCol.values || [];
    const N = Math.min(rawDates.length, yRaw.length, gRaw.length);
    const buckets = new Map();
    for (let i = 0; i < N; i++) {
      const dt = parseDateValue(rawDates[i]);
      const yn = toNum(yRaw[i]);
      if (dt === null || !Number.isFinite(yn)) continue;
      const key = gRaw[i] == null ? '' : String(gRaw[i]);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ d: dt, v: yn });
    }
    return { groups: Array.from(buckets, ([name, points]) => ({ name, points })), xLabel: dateCol.name || '', yLabel: yCol.name || '', legendTitle: gCol.name || '' };
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
  return { groups, xLabel: dateCol.name || '', yLabel: cont.length === 1 ? (cont[0].name || '') : '', legendTitle: '' };
}

function buildDateLineConfig({ groups, xLabel, yLabel, legendTitle }) {
  const series = groups.map((g, idx) => {
    g.points.sort((a, b) => a.d - b.d);
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    return { name: g.name, x: g.points.map(p => p.d), y: g.points.map(p => p.v), color, markerSize: 4, connectLine: { show: true, color, width: 1.5 } };
  });
  const config = {
    title: '', xLabel, yLabel, showLegend: series.length > 1,
    xTickFormat: (v) => { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : ''; },
    series,
  };
  if (legendTitle) config.legendTitle = legendTitle;
  return config;
}

function boxplotGroups(cont, cat) {
  if (cont.length === 0) return null;
  if (cont.length > 1 && cat.length === 0) {
    return cont.map((c, i) => ({ name: c.name || `c${i + 1}`, values: (c.values || []).map(toNum).filter(Number.isFinite), color: CHART_COLORS[i % CHART_COLORS.length] }));
  }
  if (cont.length === 1 && cat.length === 0) {
    const c = cont[0];
    return [{ name: c.name || '', values: (c.values || []).map(toNum).filter(Number.isFinite), color: CHART_COLORS[0] }];
  }
  if (cont.length === 1 && cat.length >= 1) {
    const cVals = cont[0].values || [], gVals = cat[0].values || [];
    const buckets = new Map();
    const n = Math.min(cVals.length, gVals.length);
    for (let i = 0; i < n; i++) {
      const key = gVals[i] == null ? '' : String(gVals[i]);
      const num = toNum(cVals[i]);
      if (!Number.isFinite(num)) continue;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(num);
    }
    return Array.from(buckets.entries()).map(([name, values], i) => ({ name, values, color: CHART_COLORS[i % CHART_COLORS.length] }));
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
  return { categories: Array.from(counts.keys()), counts: Array.from(counts.values()) };
}

function crossTabCategorical(colA, colB) {
  const aVals = colA.values || [], bVals = colB.values || [];
  const n = Math.min(aVals.length, bVals.length);
  const aCats = [], bCats = [];
  const aIdx = new Map(), bIdx = new Map();
  const counts = [];
  for (let i = 0; i < n; i++) {
    const av = aVals[i], bv = bVals[i];
    if (av == null || av === '' || bv == null || bv === '') continue;
    const ak = String(av), bk = String(bv);
    if (!aIdx.has(ak)) { aIdx.set(ak, aCats.length); aCats.push(ak); counts.push([]); }
    if (!bIdx.has(bk)) { bIdx.set(bk, bCats.length); bCats.push(bk); }
    const ai = aIdx.get(ak), bi = bIdx.get(bk);
    if (counts[ai][bi] == null) counts[ai][bi] = 0;
    counts[ai][bi] += 1;
  }
  const groups = bCats.map((bName, bi) => ({ name: bName, values: aCats.map((_, ai) => counts[ai][bi] || 0), color: CHART_COLORS[bi % CHART_COLORS.length] }));
  return { categories: aCats, groups };
}

function toNum(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(',', '.');
  return Number(s);
}

/** Decorative thumbnail icon for each chart type. Mono types → mask icon (follows
 *  --color-accent); opacity types → raw icon with accent baked per theme. */
const RAW_THUMBS = new Set(['pie', 'mosaic', 'heatmap', 'bubble']);
/** All chart types with a dedicated chart-thumb-<type> source icon. Any type not
 *  listed here falls back to chart-thumb-generic so a thumbnail is never blank. */
const KNOWN_THUMBS = new Set([
  'bar', 'boxplot', 'bubble', 'control-chart', 'cusum', 'ewma', 'heatmap',
  'histogram', 'individual-value-plot', 'interaction-plot', 'main-effects',
  'mosaic', 'pareto', 'pie', 'probability-plot', 'run-chart', 'scatter',
  'scatter-marginal-boxplot', 'scatter-marginal-histogram', 'scatter-matrix',
]);
function chartThumbNode(type) {
  const name = KNOWN_THUMBS.has(type) ? type : 'generic';
  return icon(`chart-thumb-${name}`, { raw: RAW_THUMBS.has(type), cls: 'chart-suggestion__thumb-ico' });
}

export default mod;
