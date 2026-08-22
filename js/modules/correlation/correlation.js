/**
 * D.Mike — Correlation Analysis Module (correlation.js)
 * Analyze phase: Pearson, Spearman, Kendall correlations.
 *
 * Migrated to createModule + Alpine CSP. The Model (correlation-model.js) holds
 * only persistence state (selected columns, confidence, matrix method, filters)
 * + thin orchestration that delegates ALL statistics to the unchanged engine
 * (engines/correlation-engine.js). The analysis RESULT is derived transiently
 * in the view and recomputed on every relevant change — it is NOT persisted.
 *
 * Output is declarative Alpine markup:
 *   - 2 columns → pairwise cards + descriptive/diagnostic stat grids
 *   - 3+ columns → correlation matrix (heatmap <table>) + per-pair scatter cards
 * The only imperative widgets are the chartManager scatter plots, mounted into
 * [data-ref] anchors and disposed in destroy() (sanctioned chart-tier exception).
 * The previous correlation-render.js subfile is gone — its table/card HTML is
 * now template, its chart config is now the data-fn chart helpers below.
 */

import { createModule } from '../../core/template-module.js';
import { State, parseConfPercent, formatConfPercent } from './correlation-model.js';
import { isPickerFocused, refToKey } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';

// Unicode glyphs carried over from the legacy innerHTML (kept out of x-text
// literals — Alpine CSP would emit \u-escapes verbatim).
const GLYPH_RHO = 'ρ';      // ρ
const GLYPH_TAU = 'τ';      // τ
const GLYPH_GE_R = '|r| ≥'; // |r| ≥
const GLYPH_LE_P = 'p ≤';   // p ≤
const BULLET = '●';         // ●
const EN_DASH = '–';        // –
const HEART_LR = '↔';       // ↔

/** Format a number to d decimals, with dashes / infinities like legacy. */
function fmt(v, d = 4) {
  if (v == null) return EN_DASH;
  if (v === Infinity) return '∞';        // ∞
  if (v === -Infinity) return '−∞'; // −∞
  if (Number.isNaN(v)) return EN_DASH;
  return v.toFixed(d);
}
function fmtP(p) {
  if (p == null || !isFinite(p)) return EN_DASH;
  return p < 0.0001 ? '< 0.0001' : p.toFixed(4);
}

const REC_NAMES = { pearson: 'Pearson r', spearman: `Spearman ${GLYPH_RHO}`, kendall: `Kendall ${GLYPH_TAU}` };

const mod = createModule({
  config: {
    id: 'correlation',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.correlation',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Glyph constants exposed to the template ──────────────
      GLYPH_RHO, GLYPH_TAU, GLYPH_GE_R, GLYPH_LE_P, BULLET,

      // ── Transient view state (never persisted) ───────────────
      result: null,         // pairwise engine result (or { error })
      matrixResult: null,   // raw matrix from model.computeMatrix
      matrixView: { names: [], rows: [] },
      cards: [],
      statGroups: [],
      filteredPairs: [],
      recTooltipLines: [],
      errorKey: null,
      _errN: 0,
      hoverRow: -1,
      hoverCol: -1,
      selectedPair: null,
      collapsedPairs: {},   // key → true when collapsed
      allCollapsed: false,
      _charts: [],
      _unsubs: [],
      _renderGen: 0,
      _lastFingerprint: null,

      // ── stateManager accessor ────────────────────────────────
      sm() { return module._context?.stateManager; },

      // ── Column list ──────────────────────────────────────────
      colGroups() { return this.model.columnGroups(this.sm()); },
      colKey(col) { return refToKey(col); },
      colDisplayName(col) {
        return col.columnName ? `${col.shortName} ${EN_DASH} ${col.columnName}` : col.shortName;
      },
      toggleColumn(col) {
        this.model.toggleColumn(col);
        this.result = null;
        this.matrixResult = null;
        this._lastFingerprint = null;
        this.autoRun();
      },

      // ── Selected-info hint ───────────────────────────────────
      selectedInfoText() {
        const n = this.model.colRefs.length;
        if (n === 0) return _t('selectMinTwo');
        if (n === 1) return _t('selectOneMore');
        if (n === 2) return _t('pairwiseMode');
        return _t('matrixMode', { n });
      },
      selectedInfoClass() {
        return this.model.colRefs.length < 2 ? 'corr__hint' : 'corr__col-info';
      },

      // ── Confidence level ─────────────────────────────────────
      confDisplay() { return formatConfPercent(this.model.confidenceLevel); },
      confPctText() { return String(Math.round(this.model.confidenceLevel * 100)); },
      commitConf(event) {
        const input = event.target;
        const parsed = parseConfPercent(input.value);
        if (parsed == null) { input.value = formatConfPercent(this.model.confidenceLevel); return; }
        if (parsed === this.model.confidenceLevel) { input.value = formatConfPercent(parsed); return; }
        this.model.confidenceLevel = parsed;
        input.value = formatConfPercent(parsed);
        this._lastFingerprint = null;
        this.autoRun();
      },
      confKeydown(event) {
        if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); }
      },

      // ── Error box ────────────────────────────────────────────
      errorText() {
        if (!this.errorKey) return '';
        if (this.errorKey === 'errMin4') return _t('errMin4', { n: this._errN ?? 0 });
        return _t(this.errorKey);
      },
      errorDisplay() { return this.errorKey ? 'display:block' : 'display:none'; },

      // ── Mode ─────────────────────────────────────────────────
      mode() {
        const n = this.model.colRefs.length;
        if (n === 2 && this.result && !this.result.error) return 'pairwise';
        if (n > 2 && this.matrixResult) return 'matrix';
        return 'none';
      },

      // ── Auto-run (recompute + chart mount) ───────────────────
      autoRun() {
        if (!module._container) return;
        if (this.model.colRefs.length < 2) { this.clearResults(); return; }
        const fp = this.model.inputFingerprint(this.sm());
        if (fp === this._lastFingerprint && (this.result || this.matrixResult)) return;
        this._lastFingerprint = fp;
        this.runAnalysis();
      },

      clearResults() {
        this.result = null;
        this.matrixResult = null;
        this.matrixView = { names: [], rows: [] };
        this.cards = [];
        this.statGroups = [];
        this.filteredPairs = [];
        this.errorKey = null;
        this.selectedPair = null;
        // Reset index-keyed collapse state so stale "i-j" keys from a prior
        // column-set don't apply to a different pair after a re-analysis.
        this.collapsedPairs = {};
        this.allCollapsed = false;
        this._lastFingerprint = null;
        this._renderGen++;
        this.destroyCharts();
      },

      runAnalysis() {
        this.errorKey = null;
        this._renderGen++;
        this.destroyCharts();
        const n = this.model.colRefs.length;
        if (n < 2) return;
        if (n === 2) this.runPairwise();
        else this.runMatrix();
      },

      runPairwise() {
        this.matrixResult = null;
        const res = this.model.computePairwise(this.sm());
        if (!res) { this.result = null; return; }
        if (res.error) {
          this.errorKey = res.error;
          this._errN = res.n;
          this.result = null;
          return;
        }
        this.result = res;
        this.buildPairwiseView(res);
        this.$nextTick(() => this.mountScatter(res));
      },

      runMatrix() {
        this.result = null;
        // Fresh collapse state per analysis: "i-j" keys are index-based, so a
        // changed column-set must not inherit collapse flags from the old one.
        this.collapsedPairs = {};
        this.allCollapsed = false;
        const m = this.model.computeMatrix(this.sm());
        this.matrixResult = m;
        this.selectedPair = null;
        this.buildMatrixView(m);
        this.$nextTick(() => this.mountMatrixScatters(m));
      },

      // ── View builders (pairwise) ─────────────────────────────
      buildPairwiseView(result) {
        const { pearson, spearman, kendall, recommendation, descriptive, diagnostics, n, df } = result;

        const corrColor = (r) => {
          const a = Math.abs(r);
          if (a >= 0.7) return r > 0 ? 'var(--color-success)' : 'var(--color-error)';
          if (a >= 0.4) return 'var(--color-warning)';
          return 'var(--color-text-tertiary)';
        };
        const interpretR = (r) => {
          const a = Math.abs(r);
          const dir = r >= 0 ? 'pos' : 'neg';
          if (a >= 0.9) return _t(`interpVeryStrong_${dir}`);
          if (a >= 0.7) return _t(`interpStrong_${dir}`);
          if (a >= 0.5) return _t(`interpModerate_${dir}`);
          if (a >= 0.3) return _t(`interpWeak_${dir}`);
          return _t('interpVeryWeak');
        };
        const toP = (v) => ((v + 1) / 2) * 100;

        // Recommendation tooltip lines — {icon, text} pairs so an icon can sit
        // beside each line without an x-text trap wiping it. The header line
        // carries no icon (iconName: null, hidden via x-show in the
        // template). Per reason: ok → criterion met, !ok → criterion
        // violated — reads as an assumption check, not a hard error, hence
        // status.ok/status.warning.
        const lines = [{ iconName: null, text: `${_t('recommendation')}: ${REC_NAMES[recommendation.best]}` }];
        for (const r of recommendation.reasons) {
          lines.push({ iconName: r.ok ? 'status.ok' : 'status.warning', text: _t(r.key, r.params) });
        }
        this.recTooltipLines = lines;

        const makeCard = (method, label, rVal, stats, ci) => {
          const color = corrColor(rVal);
          return {
            method, label, color,
            recClass: recommendation.best === method ? 'result-card--recommended' : '',
            rText: fmt(rVal),
            interp: interpretR(rVal),
            stats,
            ciFillStyle: `background:${color};left:${toP(ci[0])}%;width:${toP(ci[1]) - toP(ci[0])}%`,
            ciPointStyle: `left:${toP(rVal)}%`,
            ciLow: fmt(ci[0]),
            ciHigh: fmt(ci[1]),
          };
        };

        this.cards = [
          makeCard('pearson', 'Pearson r', pearson.r, [
            { label: _t('pValue'), value: fmtP(pearson.p) },
            { label: _t('tStat'), value: fmt(pearson.t) },
            { label: 'R²', value: `${fmt(pearson.r2)} (${(pearson.r2 * 100).toFixed(1)} %)` },
          ], pearson.ci),
          makeCard('spearman', `Spearman ${GLYPH_RHO}`, spearman.r, [
            { label: _t('pValue'), value: fmtP(spearman.p) },
            { label: _t('tStat'), value: fmt(spearman.t) },
            { label: `${GLYPH_RHO}²`, value: `${fmt(spearman.r2)} (${(spearman.r2 * 100).toFixed(1)} %)` },
          ], spearman.ci),
          makeCard('kendall', `Kendall ${GLYPH_TAU}`, kendall.tau, [
            { label: _t('pValue'), value: fmtP(kendall.p) },
            { label: _t('zStat'), value: fmt(kendall.z) },
            { label: _t('concordant'), value: String(kendall.concordant) },
            { label: _t('discordant'), value: String(kendall.discordant) },
          ], kendall.ci),
        ];

        const normXColor = diagnostics.normX.normal ? 'var(--color-success)' : 'var(--color-warning)';
        const normYColor = diagnostics.normY.normal ? 'var(--color-success)' : 'var(--color-warning)';
        const monoColor = diagnostics.mono >= 0.85 ? 'var(--color-success)'
          : diagnostics.mono >= 0.7 ? 'var(--color-warning)' : 'var(--color-error)';
        const outlierColor = diagnostics.outliers === 0 ? 'var(--color-success)' : 'var(--color-warning)';

        this.statGroups = [
          {
            title: _t('descriptiveStats'),
            rows: [
              { label: 'n', value: String(n) },
              { label: _t('degreesOfFreedom'), value: String(df) },
              { label: _t('meanX'), value: fmt(descriptive.meanX, 3) },
              { label: _t('meanY'), value: fmt(descriptive.meanY, 3) },
              { label: _t('stdDevX'), value: fmt(descriptive.stdX, 3) },
              { label: _t('stdDevY'), value: fmt(descriptive.stdY, 3) },
              { label: _t('covariance'), value: fmt(descriptive.cov, 3) },
            ],
          },
          {
            title: _t('diagnostics'),
            rows: [
              { label: _t('normalityX'), value: `${diagnostics.normX.label} (JB=${diagnostics.normX.jb.toFixed(2)})`, style: `color:${normXColor}` },
              { label: _t('normalityY'), value: `${diagnostics.normY.label} (JB=${diagnostics.normY.jb.toFixed(2)})`, style: `color:${normYColor}` },
              { label: _t('skewnessX'), value: fmt(diagnostics.skewX, 3) },
              { label: _t('skewnessY'), value: fmt(diagnostics.skewY, 3) },
              { label: _t('kurtosisX'), value: fmt(diagnostics.kurtX, 3) },
              { label: _t('kurtosisY'), value: fmt(diagnostics.kurtY, 3) },
              { label: _t('monotonicityIndex'), value: `${(diagnostics.mono * 100).toFixed(1)} %`, style: `color:${monoColor}` },
              { label: _t('outliers'), value: diagnostics.outliers === 0 ? _t('none') : String(diagnostics.outliers), style: `color:${outlierColor}` },
            ],
          },
        ];
      },

      // ── View builders (matrix) ───────────────────────────────
      cellPassesFilter(r, p) {
        const minR = this.model.filterMinR;
        const maxP = this.model.filterMaxP;
        if (minR == null && maxP == null) return true;
        if (isNaN(r)) return false;
        if (minR != null && Math.abs(r) < minR) return false;
        if (maxP != null && (p == null || p > maxP)) return false;
        return true;
      },

      buildMatrixView(matrixResult) {
        const { names, matrix, ciMatrix, pMatrix, nMatrix, pairs } = matrixResult;
        const k = names.length;
        const method = this.model.matrixMethod;
        const mat = matrix[method];
        const ciMat = ciMatrix[method];
        const pMat = pMatrix[method];

        const corrColor = (r) => {
          if (isNaN(r)) return 'var(--color-text-tertiary)';
          const a = Math.abs(r);
          if (a >= 0.7) return r > 0 ? 'var(--color-success)' : 'var(--color-error)';
          if (a >= 0.4) return 'var(--color-warning)';
          return 'var(--color-text-tertiary)';
        };
        const corrBg = (r) => {
          if (isNaN(r)) return 'transparent';
          const a = Math.abs(r);
          return r > 0 ? `rgba(34, 197, 94, ${a * 0.25})` : `rgba(239, 68, 68, ${a * 0.25})`;
        };

        const rows = [];
        for (let i = 0; i < k; i++) {
          const row = [];
          for (let j = 0; j < k; j++) {
            if (j > i) {
              row.push({ kind: 'empty', cls: 'corr__matrix-cell corr__matrix-cell--empty', style: '', title: '' });
              continue;
            }
            if (i === j) {
              row.push({ kind: 'diag', cls: 'corr__matrix-cell corr__matrix-cell--diag', style: '', title: '' });
              continue;
            }
            const r = mat[i][j];
            const p = pMat[i][j];
            const passes = this.cellPassesFilter(r, p);
            const color = corrColor(r);
            const bg = passes ? corrBg(r) : 'transparent';
            const ci = ciMat[i][j];
            row.push({
              kind: 'value',
              cls: `corr__matrix-cell${  passes ? '' : ' corr__matrix-cell--dimmed'}`,
              style: `background:${bg};color:${color}`,
              title: `n = ${nMatrix[i][j]}`,
              val: isNaN(r) ? EN_DASH : fmt(r),
              pStr: p != null ? fmtP(p) : '',
              ciStr: ci ? `[${fmt(ci[0], 3)}, ${fmt(ci[1], 3)}]` : '',
            });
          }
          rows.push(row);
        }
        this.matrixView = { names, rows };

        // Filtered upper-triangle pairs for scatter cards.
        const corrColorF = corrColor;
        this.filteredPairs = (pairs || []).filter(pair => {
          if (pair.x.length < 4) return false;
          return this.cellPassesFilter(mat[pair.i][pair.j], pMat[pair.i][pair.j]);
        }).map(pair => {
          const r = mat[pair.i][pair.j];
          const p = pMat[pair.i][pair.j];
          const ci = ciMat[pair.i][pair.j];
          return {
            i: pair.i, j: pair.j,
            key: `${pair.i}-${pair.j}`,
            titleText: `${names[pair.i]} ${HEART_LR} ${names[pair.j]}`,
            color: corrColorF(r),
            rLabel: isNaN(r) ? EN_DASH : fmt(r, 3),
            pLabel: p != null ? fmtP(p) : EN_DASH,
            ciLabel: ci ? `[${fmt(ci[0], 3)}, ${fmt(ci[1], 3)}]` : '',
          };
        });
      },

      setMethod(method) {
        this.model.matrixMethod = method;
        if (this.matrixResult) {
          this._renderGen++;
          this.destroyCharts();
          this.selectedPair = null;
          this.buildMatrixView(this.matrixResult);
          this.$nextTick(() => this.mountMatrixScatters(this.matrixResult));
        }
      },

      // ── Matrix filter inputs ─────────────────────────────────
      filterMinRDisplay() { return this.model.filterMinR != null ? String(this.model.filterMinR) : ''; },
      filterMaxPDisplay() { return this.model.filterMaxP != null ? String(this.model.filterMaxP) : ''; },
      applyFilterMinR(event) {
        const v = event.target.value.trim();
        this.model.filterMinR = v !== '' ? parseFloat(v) : null;
        this.rerenderMatrix();
      },
      applyFilterMaxP(event) {
        const v = event.target.value.trim();
        this.model.filterMaxP = v !== '' ? parseFloat(v) : null;
        this.rerenderMatrix();
      },
      rerenderMatrix() {
        if (!this.matrixResult) return;
        this._renderGen++;
        this.destroyCharts();
        this.buildMatrixView(this.matrixResult);
        this.$nextTick(() => this.mountMatrixScatters(this.matrixResult));
      },

      // ── Matrix hover / select / collapse (transient) ─────────
      matrixHover(event) {
        const cell = event.target.closest('[data-row][data-col]');
        if (!cell) return;
        this.hoverRow = cell.dataset.row;
        this.hoverCol = cell.dataset.col;
      },
      matrixHoverClear() { this.hoverRow = -1; this.hoverCol = -1; },
      hoverClass(i, j) {
        const hr = this.hoverRow, hc = this.hoverCol;
        if (hr === -1 && hc === -1) return '';
        const match = String(i) === String(hr) || String(j) === String(hc);
        return match ? ' corr__matrix--highlight' : '';
      },
      matrixClick(event) {
        const cell = event.target.closest('[data-row][data-col]');
        if (!cell) return;
        const row = parseInt(cell.dataset.row, 10);
        const col = parseInt(cell.dataset.col, 10);
        if (row === col || cell.classList.contains('corr__matrix-cell--empty')) return;
        if (!this.filteredPairs.length) return;
        const pairI = Math.max(row, col);
        const pairJ = Math.min(row, col);
        const pairKey = `${pairI}-${pairJ}`;
        this.selectedPair = this.selectedPair === pairKey ? null : pairKey;
      },
      selectClass(i, j) {
        if (!this.selectedPair) return '';
        const [pi, pj] = this.selectedPair.split('-').map(Number);
        const match = (i === pi && j === pj) || (i === pj && j === pi);
        return match ? ' corr__matrix-cell--selected' : '';
      },
      plotCardClass(pair) {
        return this.collapsedPairs[pair.key] ? 'corr__matrix-plot-card--collapsed' : '';
      },
      plotCardDisplay(pair) {
        if (!this.selectedPair) return '';
        return this.selectedPair === pair.key ? '' : 'display:none';
      },
      togglePlot(key) {
        this.collapsedPairs = { ...this.collapsedPairs, [key]: !this.collapsedPairs[key] };
      },
      collapseAllLabel() { return this.allCollapsed ? _t('expandAll') : _t('collapseAll'); },
      toggleAllPlots() {
        const next = !this.allCollapsed;
        const map = {};
        for (const pair of this.filteredPairs) map[pair.key] = next;
        this.collapsedPairs = map;
        this.allCollapsed = next;
      },

      // ── Chart mounting (imperative — sanctioned chart tier) ──
      //
      // Scatter anchors live INSIDE Alpine `x-if`/`x-for` templates (the
      // pairwise `scatter-plot` anchor under `x-if="mode()==='pairwise'"`, the
      // per-pair `matrix-plot-*` anchors under a nested `x-if`+`x-for`). Alpine
      // materialises those deeply-nested nodes over several reactive flush
      // cycles, so a single `$nextTick` can fire BEFORE the anchors exist in the
      // DOM — `querySelector` then returns null and no chart mounts (the blank
      // cards). `_whenAnchor` waits across animation frames (bounded) until the
      // anchor is present before mounting, aborting if a newer render started.
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

      async mountScatter(result) {
        const gen = this._renderGen;
        if (!result._x || !result._y) return;
        const plotEl = await this._whenAnchor('[data-ref="scatter-plot"]', gen);
        if (!plotEl) return;
        const x = result._x, y = result._y;
        const { slope, intercept, xMin, xMax } = this._regression(x, y);
        await this._mkScatter(plotEl, gen, {
          xLabel: result._nameX || 'X', yLabel: result._nameY || 'Y', showLegend: true,
          dataName: _t('dataPoints'), lineName: _t('regressionLine'),
          x, y, slope, intercept, xMin, xMax,
        });
      },

      async mountMatrixScatters(matrixResult) {
        const gen = this._renderGen;
        const { names } = matrixResult;
        for (const pair of this.filteredPairs) {
          if (this._renderGen !== gen) return;
          if (pair.i == null) continue;
          const raw = matrixResult.pairs.find(p => p.i === pair.i && p.j === pair.j);
          if (!raw || raw.x.length < 4) continue;
          const plotEl = await this._whenAnchor(`[data-ref="matrix-plot-${pair.key}"]`, gen);
          if (!plotEl) continue;
          const { slope, intercept, xMin, xMax } = this._regression(raw.x, raw.y);
          await this._mkScatter(plotEl, gen, {
            xLabel: names[pair.i], yLabel: names[pair.j], showLegend: false,
            dataName: _t('dataPoints'), lineName: '',
            x: raw.x, y: raw.y, slope, intercept, xMin, xMax,
          });
        }
      },

      _regression(x, y) {
        let sumX = 0, sumY = 0;
        for (let n = 0; n < x.length; n++) { sumX += x[n]; sumY += y[n]; }
        const mx = sumX / x.length, my = sumY / x.length;
        let num = 0, den = 0;
        for (let n = 0; n < x.length; n++) {
          num += (x[n] - mx) * (y[n] - my);
          den += (x[n] - mx) * (x[n] - mx);
        }
        const slope = den ? num / den : 0;
        return { slope, intercept: my - slope * mx, xMin: Math.min(...x), xMax: Math.max(...x) };
      },

      async _mkScatter(plotEl, gen, o) {
        const chart = await module._context.chartManager.create(plotEl, 'scatter', {
          xLabel: o.xLabel, yLabel: o.yLabel, showLegend: o.showLegend,
          series: [
            { name: o.dataName, color: 'var(--color-chart-1)', markerSize: 4, strokeWidth: 0.75, x: o.x, y: o.y, symbol: 'circle' },
            {
              name: o.lineName, color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0,
              x: [o.xMin, o.xMax], y: [o.slope * o.xMin + o.intercept, o.slope * o.xMax + o.intercept],
              connectLine: { show: true, dash: 'solid', width: 2, color: 'var(--color-error)', foreground: true },
            },
          ],
        });
        if (gen !== this._renderGen) { try { module._context.chartManager.destroy(chart); } catch { /* ignore */ } return; }
        this._charts.push(chart);
      },

      destroyCharts() {
        for (const chart of this._charts) {
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      // ── Lifecycle ────────────────────────────────────────────
      init() {
        const ctx = module._context;

        // Default confidence from app settings on a fresh module.
        if (this.model.confidenceLevel == null) {
          this.model.confidenceLevel = (ctx.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
        }

        const onRefresh = () => {
          if (isPickerFocused(module._container)) return;
          this.autoRun();
        };
        const eb = ctx.eventBus;
        eb.on('state:saved', onRefresh);
        eb.on('worksheet:dataChanged', onRefresh);
        this._unsubs.push(
          () => eb.off('state:saved', onRefresh),
          () => eb.off('worksheet:dataChanged', onRefresh),
        );
        const onMod = ({ moduleId }) => { if (moduleId === 'worksheet') onRefresh(); };
        eb.on('module:added', onMod);
        eb.on('module:removed', onMod);
        this._unsubs.push(() => eb.off('module:added', onMod), () => eb.off('module:removed', onMod));
        const onAct = ({ instanceId }) => { if (instanceId === ctx.instanceId) onRefresh(); };
        eb.on('module:activated', onAct);
        this._unsubs.push(() => eb.off('module:activated', onAct));
        const onTheme = () => {
          if (this.result && !this.result.error) { this._renderGen++; this.destroyCharts(); this.$nextTick(() => this.mountScatter(this.result)); }
          else if (this.matrixResult) { this.rerenderMatrix(); }
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        this.$nextTick(() => this.autoRun());
      },

      destroy() {
        for (const u of this._unsubs) u();
        this._unsubs = [];
        // Bump the render generation so any in-flight `_whenAnchor` rAF-poll
        // aborts on its next tick instead of running its full frame budget
        // after teardown.
        this._renderGen++;
        this.destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: correlation examples ship a worksheet snapshot
 * (`sourceWorksheetData`, resolved from `sourceWorksheetFile` by the registry)
 * plus a `colRefs` array using the `__source__` placeholder instanceId. We
 * provision the worksheet (replacing any prior example-provisioned one),
 * rewrite the placeholder refs to the new instance, then apply via setState —
 * which rebuilds the Alpine tree and re-runs the analysis.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, instanceId) {
      data.colRefs = (data.colRefs || []).map(r =>
        (r && r.instanceId === '__source__') ? { ...r, instanceId } : r);
      // Drop any persisted derived result from old snapshots — auto-run recomputes.
      delete data.result;
      delete data.matrixResult;
      return data;
    },
  });
};

export default mod;
