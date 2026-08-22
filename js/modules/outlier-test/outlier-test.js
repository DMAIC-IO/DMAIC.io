/**
 * D.Mike — Outlier Test Module (outlier-test.js)
 * Analyze phase: classical outlier identification on a single numeric column.
 *
 * Methods (any subset can be enabled at once):
 *   - Grubbs' Test
 *   - Dixon Q Test
 *   - Generalized ESD (Rosner 1983)
 *   - Tukey IQR Rule (boxplot fences)
 *   - Hampel Identifier (median + scaled MAD)
 *   - Z-Score
 *   - Modified Z-Score (Iglewicz-Hoaglin)
 *
 * Migrated to createModule + Alpine CSP.
 * The input panel is declarative Alpine; the output (result cards, chart,
 * flagged table) is rendered imperatively into [data-ref="results"] — required
 * for byte-parity with the POM selectors (.outliertest__card, .outliertest__chip,
 * .outliertest__steps, etc.).
 *
 * Imperative widgets follow the msa-typ1 lifecycle pattern:
 *   _picker, _chart, _renderGen, _unsubs in data-Fn (transient, never in Model).
 */

import { createModule } from '../../core/template-module.js';
import { State, ALL_METHODS } from './outlier-test-model.js';
import {
  grubbsTest, dixonQTest, generalizedESD,
  tukeyIQR, hampelIdentifier, zScoreOutliers, modifiedZScore,
} from '../../engines/outlier-test-engine.js';
import { ColumnPicker, getColumnValues, getColumnName } from '../../ui/column-picker.js';
import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';

/** Mapping: test id → Algorithm Lab algorithm id. */
const ALGO_LAB_IDS = {
  'grubbs':           'grubbs-test',
  'dixon-q':          'dixon-q-test',
  'generalized-esd':  'generalized-esd',
  'tukey-iqr':        'tukey-iqr',
  'hampel':           'hampel-identifier',
  'z-score':          'z-score-outlier',
  'modified-z':       'modified-z-score',
};

/** Maps method id to the i18n-key suffix (e.g. 'grubbs' → 'Grubbs' → key 'mGrubbs'). */
const LABEL_KEY_MAP = {
  'grubbs':           'Grubbs',
  'dixon-q':          'Dixon',
  'generalized-esd':  'ESD',
  'tukey-iqr':        'Tukey',
  'hampel':           'Hampel',
  'z-score':          'ZScore',
  'modified-z':       'ModZ',
};

/** Maps method id to short table header label. */
const SHORT_LABEL_MAP = {
  'grubbs':           'G',
  'dixon-q':          'Q',
  'generalized-esd':  'ESD',
  'tukey-iqr':        'IQR',
  'hampel':           'Ham',
  'z-score':          'Z',
  'modified-z':       'M-Z',
};

/** @param {number|null} v @param {number} d @returns {string} */
function fmt(v, d = 4) { return v != null && isFinite(v) ? v.toFixed(d) : '–'; }

const mod = createModule({
  config: {
    id: 'outlier-test',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.outlier-test',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      _picker: null,
      _chart: null,
      _renderGen: 0,
      _unsubs: [],

      // ── Results panel (declarative — structured reactive data) ──
      /** Whether the composite results panel is shown. */
      panelShow: false,
      /** @type {Array<{value:string,label:string,kpiClass:string,valueClass:string}>} summary KPI cells. */
      summaryKpis: [],
      /** @type {Array<{val:string,label:string,active:boolean}>} chart-method segmented buttons. */
      chartSegs: [],
      /** @type {Array} per-method result cards (see _buildMethodCard). */
      methodCards: [],
      /** Whether the combined flagged-points table is shown. */
      flaggedShow: false,
      /** @type {Array<{short:string,title:string}>} flagged-table method headers. */
      flaggedHeaders: [],
      /** @type {Array} flagged-table rows (see _renderResults). */
      flaggedRows: [],
      /** @type {object} transient render context for chart re-plots (not persisted). */
      _chartCtx: { data: [], colName: '', results: {}, flaggedIdxs: [] },

      // ── View helpers exposed to the Alpine template ───────────

      /** All method ids for x-for iteration in the template. */
      allMethods: ALL_METHODS,

      /** Whether a method is enabled. */
      isMethodEnabled(mid) {
        return this.model.enabled.includes(mid);
      },

      /** i18n label for a method id. */
      methodLabel(mid) {
        const key = LABEL_KEY_MAP[mid];
        return key ? _t(`m${  key}`) : mid;
      },

      // ── Event handlers (Alpine template → @change / @input) ───

      /** Toggle a method checkbox on/off. */
      toggleMethod(mid) {
        const idx = this.model.enabled.indexOf(mid);
        if (idx >= 0) {
          this.model.enabled.splice(idx, 1);
        } else {
          this.model.enabled.push(mid);
        }
        this._runAnalysis();
      },

      /** Handle side <select> change. */
      sideChanged(event) {
        this.model.side = event.target.value;
        this._runAnalysis();
      },

      /**
       * Handle numeric parameter input changes.
       * @param {'alpha'|'tukey-factor'|'hampel-k'|'z-threshold'|'modz-threshold'|'esd-max'} ref
       * @param {Event} event
       */
      paramChanged(ref, event) {
        const raw = event.target.value;
        const isInt = ref === 'esd-max';
        const parsed = raw === '' ? null : (isInt ? parseInt(raw, 10) : parseFloat(raw));

        if (raw !== '' && (parsed == null || !isFinite(parsed))) return;

        const clamp = (v, min, max) => v == null ? null
          : v < min ? min : v > max ? max : v;

        switch (ref) {
          case 'alpha':
            this.model.alpha = clamp(parsed, 0.001, 0.5);
            break;
          case 'tukey-factor':
            this.model.tukeyFactor = clamp(parsed, 0.1, 10);
            break;
          case 'hampel-k':
            this.model.hampelK = clamp(parsed, 0.1, 20);
            break;
          case 'z-threshold':
            this.model.zThreshold = clamp(parsed, 0.1, 10);
            break;
          case 'modz-threshold':
            this.model.modZThreshold = clamp(parsed, 0.1, 10);
            break;
          case 'esd-max':
            this.model.esdMaxOutliers = raw === '' ? null : clamp(parsed, 1, 50);
            break;
        }
        this._runAnalysis();
      },

      // ── Select-element value sync ─────────────────────────────

      /**
       * Sync the <select data-ref="side"> to the model value after Alpine
       * reinit (e.g. after language change or setState). Called in init().
       */
      _syncSideSelect() {
        const sel = module._container.querySelector('[data-ref="side"]');
        if (sel) sel.value = this.model.side;
      },

      // ── ColumnPicker (imperative widget) ──────────────────────

      _mountPicker() {
        const wrap = module._container.querySelector('[data-ref="picker-wrap"]');
        if (!wrap) return;
        this._picker && this._picker.destroy();
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'single',
          types: ['numeric'],
          minCount: 3,
          onChange: (ref) => {
            this.model.colRef = ref;
            this._runAnalysis();
          },
        });
        if (this.model.colRef) this._picker.value = this.model.colRef;
      },

      // ── Data retrieval ────────────────────────────────────────

      _getColumnData() {
        if (!this._picker || !this._picker.value) return [];
        const raw = getColumnValues(module._context.stateManager, this._picker.value);
        return raw.filter((v) => v != null && typeof v === 'number' && !isNaN(v));
      },

      // ── Error display ─────────────────────────────────────────

      _showError(msg) {
        const eb = module._container.querySelector('[data-ref="error-box"]');
        if (!eb) return;
        eb.textContent = msg;
        eb.style.display = 'block';
      },

      _hideError() {
        const eb = module._container.querySelector('[data-ref="error-box"]');
        if (eb) { eb.textContent = ''; eb.style.display = 'none'; }
      },

      _hideResults() {
        const phEl = module._container.querySelector('[data-ref="placeholder"]');
        const resEl = module._container.querySelector('[data-ref="results"]');
        if (phEl) phEl.style.display = '';
        if (resEl) resEl.style.display = 'none';
        this._clearPanel();
        this._destroyChart();
      },

      /** Clear all reactive panel data (no-data / hide paths). */
      _clearPanel() {
        // Bump the render generation so any in-flight chart mount aborts.
        this._renderGen++;
        this.panelShow = false;
        this.summaryKpis = [];
        this.chartSegs = [];
        this.methodCards = [];
        this.flaggedShow = false;
        this.flaggedHeaders = [];
        this.flaggedRows = [];
      },

      // ── Analysis ─────────────────────────────────────────────

      _runAnalysis() {
        this._hideError();

        const data = this._getColumnData();
        if (data.length < 3) { this._hideResults(); return; }

        const alpha = this.model.alpha;
        const enabled = new Set(this.model.enabled);

        const results = {};
        const errs = {};

        const safe = (id, fn) => {
          if (!enabled.has(id)) return;
          try { results[id] = fn(); }
          catch (e) { errs[id] = e.message || 'error'; }
        };

        safe('grubbs',          () => grubbsTest(data, alpha, this.model.side));
        safe('dixon-q',         () => dixonQTest(data, alpha, this.model.side));
        safe('generalized-esd', () => generalizedESD(data, alpha, this.model.esdMaxOutliers ?? undefined));
        safe('tukey-iqr',       () => tukeyIQR(data, this.model.tukeyFactor));
        safe('hampel',          () => hampelIdentifier(data, this.model.hampelK));
        safe('z-score',         () => zScoreOutliers(data, this.model.zThreshold));
        safe('modified-z',      () => modifiedZScore(data, this.model.modZThreshold));

        this._renderResults(data, results, errs);
      },

      // ── Render results (declarative — structured reactive data) ──
      //
      // The composite panel (summary KPI strip + chart-method selector +
      // per-method cards + combined flagged-points table) is modelled as
      // reactive structured data and rendered by the Alpine template
      // (outlier-test.html). All text is RAW — x-text escapes structurally,
      // so values are NEVER esc()'d here. Number formatting matches the legacy
      // string output exactly (fmt()), so the rendered text is byte-identical.
      // The chart stays an imperative chartManager mount into the templated
      // [data-ref="chart"] host (sanctioned chart tier), resolved via the
      // bounded _whenAnchor rAF-poll since the host now lives inside x-if.

      /**
       * Navigate to an Algorithm Lab entry from a card link.
       * @param {string} algoId
       * @param {Event} event
       */
      openAlgoLab(algoId, event) {
        if (event) event.preventDefault();
        if (algoId && module._context.eventBus) {
          module._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
        }
      },

      /**
       * Build the structured data for a single (non-error) method card.
       * @param {string} id
       * @param {object} r engine result
       * @returns {object}
       */
      _buildMethodCard(id, r) {
        const key = LABEL_KEY_MAP[id] || 'Grubbs';
        const label = _t(`m${  key}`);
        const k = r.outliers && r.outliers.length ? r.outliers.length : 0;
        const verdictIcon = k === 0 ? 'status.ok' : 'status.warning';
        const verdictText = k === 0
          ? _t('verdictClean')
          : _t('verdictFlagged', { count: k });
        const verdictClass = k === 0
          ? 'outliertest__verdict--clean'
          : 'outliertest__verdict--flag';

        const mc = (value, lbl, kpiClass = '', valueClass = '') => ({ value, label: lbl, kpiClass, valueClass });
        let metrics = [];
        let steps = [];
        let stepsHeader = '';
        let hint = '';

        if (id === 'grubbs') {
          const pBad = r.pValue < r.parameters.alpha;
          metrics = [
            mc(fmt(r.statistic, 4), 'G'),
            mc(fmt(r.critical, 4), 'Gₜ'),
            mc(fmt(r.pValue, 4), 'p', pBad ? 'dmike-kpi--bad' : 'dmike-kpi--good'),
            mc(fmt(r.mean, 4), 'x̄'),
            mc(fmt(r.sd, 4), 's'),
          ];
        } else if (id === 'dixon-q') {
          metrics = [
            mc(fmt(r.statistic, 4), 'Q'),
            mc(fmt(r.critical, 4), 'Qₜ'),
            mc(r.parameters.variant, _t('variant'), '', 'dmike-kpi-value--sm'),
            mc(r.side, _t('side'), '', 'dmike-kpi-value--sm'),
          ];
        } else if (id === 'generalized-esd') {
          metrics = [
            mc(String(r.detected), _t('detected'), r.detected > 0 ? 'dmike-kpi--bad' : 'dmike-kpi--good'),
            mc(String(r.parameters.maxOutliers), _t('esdMax')),
          ];
          stepsHeader = 'Rᵢ > λᵢ';
          steps = r.steps.map((s) => ({
            i: String(s.i),
            value: fmt(s.value, 4),
            R: fmt(s.R, 4),
            lambda: fmt(s.lambda, 4),
            markIcon: s.R > s.lambda ? 'status.error' : 'status.ok',
            rejectClass: s.R > s.lambda ? 'outliertest__step--reject' : '',
          }));
        } else if (id === 'tukey-iqr') {
          metrics = [
            mc(fmt(r.q1, 4), 'Q1'),
            mc(fmt(r.median, 4), _t('median')),
            mc(fmt(r.q3, 4), 'Q3'),
            mc(fmt(r.iqr, 4), 'IQR'),
            mc(fmt(r.fenceLower, 4), _t('fenceLower')),
            mc(fmt(r.fenceUpper, 4), _t('fenceUpper')),
          ];
        } else if (id === 'hampel') {
          metrics = [
            mc(fmt(r.median, 4), _t('median')),
            mc(fmt(r.mad, 4), 'MAD'),
            mc(fmt(r.madScaled, 4), '1.4826·MAD'),
            mc(fmt(r.parameters.k, 2), 'k'),
            mc(fmt(r.threshold, 4), _t('threshold')),
          ];
          if (r.degenerate) hint = _t('hintDegenerateMad');
        } else if (id === 'z-score') {
          metrics = [
            mc(fmt(r.mean, 4), 'x̄'),
            mc(fmt(r.sd, 4), 's'),
            mc(fmt(r.parameters.threshold, 2), _t('threshold')),
          ];
          if (r.degenerate) hint = _t('hintDegenerateSd');
        } else if (id === 'modified-z') {
          metrics = [
            mc(fmt(r.median, 4), _t('median')),
            mc(fmt(r.mad, 4), 'MAD'),
            mc(fmt(r.parameters.threshold, 2), _t('threshold')),
          ];
          if (r.degenerate) hint = _t('hintDegenerateMad');
        }

        const chips = [];
        if (k > 0) {
          for (const o of r.outliers.slice(0, 12)) {
            chips.push({
              text: `#${  o.index + 1  }: ${  fmt(o.value, 4)}`,
              // Leading space inside the chip-stat span (legacy had it as a
              // separate text node before the span; visually identical).
              stat: o.statistic != null ? ` (${  fmt(o.statistic, 3)  })` : '',
              moreClass: '',
            });
          }
          if (r.outliers.length > 12) {
            chips.push({
              text: `+${  r.outliers.length - 12}`,
              stat: '',
              moreClass: 'outliertest__chip--more',
            });
          }
        }

        return {
          isError: false,
          cardClass: '',
          label,
          algoId: ALGO_LAB_IDS[id] || '',
          verdictIcon,
          verdictText,
          verdictClass,
          metrics,
          chips,
          steps,
          stepsHeader,
          hint,
        };
      },

      /**
       * Build the structured data for an error card.
       * @param {string} id
       * @param {string} msg
       * @returns {object}
       */
      _buildErrorCard(id, msg) {
        const key = LABEL_KEY_MAP[id] || 'Grubbs';
        return {
          isError: true,
          cardClass: 'outliertest__card--error',
          label: _t(`m${  key}`),
          algoId: ALGO_LAB_IDS[id] || '',
          errorText: `${_t('errInapplicable')  }: ${  msg}`,
        };
      },

      /**
       * Build all reactive panel data, then mount the chart.
       * @param {number[]} data
       * @param {object} results
       * @param {object} errs
       */
      _renderResults(data, results, errs) {
        const resEl = module._container.querySelector('[data-ref="results"]');
        const phEl = module._container.querySelector('[data-ref="placeholder"]');
        if (!resEl) return;
        phEl.style.display = 'none';
        resEl.style.display = 'block';

        const colName = this.model.colRef
          ? getColumnName(module._context.stateManager, this.model.colRef)
          : _t('untitledColumn');

        // Union of flagged indices across enabled methods
        const flagsByIndex = new Map();
        for (const [id, r] of Object.entries(results)) {
          if (!r || !r.outliers) continue;
          for (const o of r.outliers) {
            if (!flagsByIndex.has(o.index)) flagsByIndex.set(o.index, new Set());
            flagsByIndex.get(o.index).add(id);
          }
        }
        const flaggedIdxs = [...flagsByIndex.keys()].sort((a, b) => a - b);
        const totalFlagged = flaggedIdxs.length;

        // ── Summary KPIs
        this.summaryKpis = [
          { value: String(data.length), label: 'n', kpiClass: '', valueClass: '' },
          { value: colName, label: _t('column'), kpiClass: '', valueClass: 'dmike-kpi-value--sm' },
          { value: String(totalFlagged), label: _t('flaggedAny'), kpiClass: totalFlagged > 0 ? 'dmike-kpi--bad' : 'dmike-kpi--good', valueClass: '' },
          { value: String(Object.keys(results).length), label: _t('methodsRun'), kpiClass: '', valueClass: '' },
        ];

        // ── Chart method selector
        const enabled = new Set(this.model.enabled);
        const availableForChart = ALL_METHODS.filter(
          (id) => enabled.has(id) && results[id] && (results[id].outliers && results[id].outliers.length > 0)
        );
        if (this.model.chartMethod !== 'all' && !availableForChart.includes(this.model.chartMethod)) {
          this.model.chartMethod = 'all';
        }
        const seg = (val, label) => ({
          val,
          label,
          activeClass: this.model.chartMethod === val ? 'btn--active' : '',
        });
        const segs = [seg('all', _t('chartMethodAll'))];
        for (const mid of availableForChart) {
          const key = LABEL_KEY_MAP[mid] || 'Grubbs';
          segs.push(seg(mid, _t(`m${  key}`)));
        }
        this.chartSegs = segs;

        // ── Per-method cards
        const cards = [];
        for (const id of ALL_METHODS) {
          if (!enabled.has(id)) continue;
          if (errs[id]) {
            cards.push(this._buildErrorCard(id, errs[id]));
          } else if (results[id]) {
            cards.push(this._buildMethodCard(id, results[id]));
          }
        }
        this.methodCards = cards;

        // ── Combined flagged-points table
        const cols = ALL_METHODS.filter((id) => enabled.has(id) && results[id]);
        this.flaggedHeaders = cols.map((id) => {
          const key = LABEL_KEY_MAP[id] || id;
          return { short: SHORT_LABEL_MAP[id] || id, title: _t(`m${  key}`) };
        });
        this.flaggedRows = flaggedIdxs.map((idx) => {
          const flags = flagsByIndex.get(idx);
          return {
            idx: String(idx + 1),
            value: fmt(data[idx], 4),
            count: String(flags.size),
            cells: cols.map((id) => flags.has(id)
              ? { flagged: true, cls: 'outliertest__flag' }
              : { flagged: false, cls: 'outliertest__no-flag' }),
          };
        });
        this.flaggedShow = totalFlagged > 0;

        // Stash render context so the chart-method @click handler can re-plot.
        this._chartCtx = { data, colName, results, flaggedIdxs };

        this.panelShow = true;

        // Render chart — initial render reflects the saved selection.
        this._plotForMethod(this.model.chartMethod);
      },

      /** Indices to plot for a given chart-method selection. */
      _idxsForMethod(method) {
        const { results, flaggedIdxs } = this._chartCtx;
        if (method === 'all') return flaggedIdxs;
        return (results[method] && results[method].outliers)
          ? results[method].outliers.map((o) => o.index)
          : [];
      },

      /** Render the chart for the given method using the stashed context. */
      _plotForMethod(method) {
        const { data, colName, results } = this._chartCtx;
        this._renderChart(data, this._idxsForMethod(method), colName, method, results);
      },

      /** Chart-method segmented button @click handler. */
      selectChartMethod(method) {
        this.model.chartMethod = method;
        for (const s of this.chartSegs) s.activeClass = s.val === method ? 'btn--active' : '';
        this._plotForMethod(method);
      },

      // ── Chart ─────────────────────────────────────────────────

      _destroyChart() {
        if (this._chart && module._context && module._context.chartManager) {
          try { module._context.chartManager.destroy(this._chart); } catch { /* ignore */ }
        }
        this._chart = null;
      },

      /**
       * Resolve the [data-ref="chart"] anchor that lives inside the x-if
       * results template — Alpine may materialise it across several reactive
       * flush cycles, so poll (bounded) until it exists. Aborts if a newer
       * render started (stale _renderGen).
       * @param {string} selector
       * @param {number} gen
       * @param {number} [maxFrames]
       * @returns {Promise<Element|null>}
       */
      _whenAnchor(selector, gen, maxFrames = 30) {
        return new Promise((resolve) => {
          const tick = (left) => {
            if (gen !== this._renderGen) { resolve(null); return; }
            const el = module._container && module._container.querySelector(selector);
            if (el) { resolve(el); return; }
            if (left <= 0) { resolve(null); return; }
            requestAnimationFrame(() => tick(left - 1));
          };
          tick(maxFrames);
        });
      },

      async _renderChart(data, flaggedIdxs, colName, chartMethod = 'all') {
        this._destroyChart();

        const gen = ++this._renderGen;
        const chartEl = await this._whenAnchor('[data-ref="chart"]', gen);
        if (!chartEl) return;
        chartEl.replaceChildren();

        const flagged = new Set(flaggedIdxs);
        const inliers = [];
        const outliers = [];
        for (let i = 0; i < data.length; i++) {
          (flagged.has(i) ? outliers : inliers).push(data[i]);
        }

        const methodLabel = chartMethod === 'all'
          ? _t('chartMethodAll')
          : _t(`m${  LABEL_KEY_MAP[chartMethod] || 'Grubbs'}`);

        const groups = [
          { name: _t('groupInliers'), values: inliers },
        ];
        if (outliers.length > 0) {
          groups.push({ name: `${_t('groupOutliers')} — ${methodLabel}`, values: outliers });
        }

        try {
          const chart = await module._context.chartManager.create(chartEl, 'individual-value-plot', {
            title: _t('chartTitle', { col: colName, method: methodLabel }),
            xLabel: '',
            yLabel: colName,
            showLegend: outliers.length > 0,
            showXTicks: false,
            showMean: true,
            showMedian: true,
            connectMeans: false,
            showOverallMean: false,
            jitter: 0.6,
            groups,
            pointColors: outliers.length > 0
              ? ['var(--color-accent)', 'var(--color-error)']
              : ['var(--color-accent)'],
            pointSize: 6,
          });
          if (gen !== this._renderGen) {
            try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
            return;
          }
          this._chart = chart;
        } catch (e) {
          if (gen === this._renderGen) {
            this._showError(e.message || _t('errChart'));
          }
        }
      },

      // ── Alpine lifecycle ──────────────────────────────────────

      init() {
        this._unsubs = [];
        this._renderGen = 0;

        // Resolve alpha from global settings if not yet persisted
        if (this.model.alpha == null) {
          const globalConf = (module._context.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
          this.model.alpha = Number((1 - globalConf).toFixed(4));
        }

        this._mountPicker();
        this._syncSideSelect();

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) {
            this._picker && this._picker.refresh();
          }
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        const onTheme = () => {
          this._runAnalysis();
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        this._runAnalysis();
      },

      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._destroyChart();
        if (this._picker) { this._picker.destroy(); this._picker = null; }
      },
    };
  },
});

/**
 * Custom loadExample: outlier-test examples ship a full worksheet
 * (`sourceWorksheetData`, resolved from `sourceWorksheetFile` by examples-registry)
 * and use the literal placeholder `__source__` as `colRef.instanceId`.
 * On load: provision a fresh worksheet, rewrite the placeholder, apply state.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    rewriteRefs: rewriteRefFields(['colRef']),
  });
};

export default mod;
