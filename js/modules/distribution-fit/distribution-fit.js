/**
 * D.Mike — Distribution Fit Module (distribution-fit.js)
 * Analyze phase: fits data to multiple distributions and ranks by GOF test.
 *
 * Migrated to createModule + Alpine CSP.
 *
 * Architecture:
 *   - Static structure (input panel, placeholder, results container) lives in the
 *     Alpine template (distribution-fit.html).
 *   - Dynamic results (KPI strip, ranking table, detail tiles, normality panel,
 *     histogram chart) are rendered imperatively into [data-ref="results"] because
 *     the result structure is deeply nested and variable.
 *   - ColumnPicker is an imperative widget mounted in init(), disposed in destroy().
 *   - chartManager histogram uses _renderGen stale-guard.
 *   - _unsubs collects event-bus subscriptions for cleanup.
 *
 * Spec: docs/modules/DISTRIBUTION-FIT.md
 */

import { createModule } from '../../core/template-module.js';
import { State } from './distribution-fit-model.js';
import { runDistributionFit } from '../../engines/distribution-fit-engine.js';
import { ColumnPicker, getColumnValues } from '../../ui/column-picker.js';
import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';
import { whenAnchor } from '../../core/chart/chart-module-base.js';

/** Mapping: test name → Algorithm Lab ID (only for validated algorithms). */
const ALGO_LAB_IDS = {
  'Shapiro-Wilk': 'shapiro-wilk',
  'Anderson-Darling': 'anderson-darling',
  'Jarque-Bera': 'jarque-bera',
  "D'Agostino-Pearson": 'dagostino-pearson',
};

/**
 * Format a number for display.
 * @param {number} v
 * @param {number} d — decimal places (default 4)
 * @returns {string}
 */
function fmt(v, d = 4) {
  if (v == null || !isFinite(v)) return '–';
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(d);
  return v.toFixed(d);
}

const mod = createModule({
  config: {
    id: 'distribution-fit',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'bar-chart-2',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      /** @type {object|null} — current analysis result */
      _result: null,
      /** @type {Array} — active chart instances */
      _charts: [],
      /** @type {import('../../ui/column-picker.js').ColumnPicker|null} */
      _picker: null,
      /** Stale-render guard: incremented before each async chart.create */
      _renderGen: 0,
      /** @type {Array} — unsub functions for event-bus listeners */
      _unsubs: [],

      // ── Results panel (declarative — structured reactive data) ──
      /** Whether the results panel is shown. */
      panelShow: false,
      /** @type {Array<{value:string, label:string}>} descriptive KPI cells. */
      kpiCells: [],
      /** @type {Array} ranking-table rows (see _buildRankingRows). */
      rankRows: [],
      /** @type {Array} distribution detail tiles (see _buildDetailTiles). */
      detailTiles: [],
      /** Whether the normality deep-dive panel is rendered. */
      nddShow: false,
      /** Whether the normality deep-dive body is collapsed. */
      nddCollapsed: false,
      /** @type {Array} normality test cards (see _buildNormalityData). */
      nddCards: [],
      /** @type {Array<{cls:string}>} consensus score dots. */
      nddDots: [],
      /** Consensus block: { cls, title, text, scoreLabel }. */
      nddConsensus: { cls: '', title: '', text: '', scoreLabel: '' },

      // ── View helpers (data type toggle) ──────────────────────

      /** Switch the data type and re-run analysis. */
      setDataType(dtype) {
        this.model.dataType = dtype;
        this._autoRun();
      },

      // ── Column / analysis ────────────────────────────────────

      /** @returns {number[]} numeric values from selected column */
      _getColumnValues() {
        if (!this.model.columnRef) return [];
        const raw = getColumnValues(module._context.stateManager, this.model.columnRef);
        return raw.filter(v => v != null && typeof v === 'number' && !isNaN(v));
      },

      /**
       * Show placeholder / hide results when no column selected;
       * otherwise run the analysis.
       */
      _autoRun() {
        if (!this.model.columnRef) {
          this._result = null;
          this._destroyCharts();
          this._clearPanel();
          const placeholder = module._container.querySelector('[data-ref="placeholder"]');
          const resultsEl = module._container.querySelector('[data-ref="results"]');
          if (placeholder) placeholder.style.display = '';
          if (resultsEl) resultsEl.style.display = 'none';
          const errBox = module._container.querySelector('[data-ref="error-box"]');
          if (errBox) { errBox.textContent = ''; errBox.style.display = 'none'; }
          return;
        }
        this._runAnalysis();
      },

      /** Run the distribution fit analysis and render results. */
      _runAnalysis() {
        const t = (k) => _t(k);
        const errBox = module._container.querySelector('[data-ref="error-box"]');
        if (errBox) { errBox.textContent = ''; errBox.style.display = 'none'; }

        const values = this._getColumnValues();
        if (values.length < 5) {
          if (errBox) { errBox.textContent = t('errMin5'); errBox.style.display = 'block'; }
          return;
        }

        try {
          this._result = runDistributionFit(values, this.model.dataType);
          this._result._dataType = this.model.dataType;
          this._renderResults(this._result);
        } catch (err) {
          const key = err.message === 'zeroVariance' ? 'errZeroVariance' : 'errGeneric';
          if (errBox) { errBox.textContent = t(key); errBox.style.display = 'block'; }
          this._result = null;
          this._destroyCharts();
          this._clearPanel();
          // Hide results
          const placeholder = module._container.querySelector('[data-ref="placeholder"]');
          const resultsEl = module._container.querySelector('[data-ref="results"]');
          if (placeholder) placeholder.style.display = '';
          if (resultsEl) resultsEl.style.display = 'none';
        }
      },

      // ── Results rendering (declarative — structured reactive data) ──
      //
      // The composite panel (descriptive KPI strip + ranking table + detail
      // tiles + normality deep-dive) is modelled as reactive structured data
      // and rendered by the Alpine template (distribution-fit.html). All text
      // is RAW (x-text escapes structurally — never esc()'d here). Number
      // formatting matches the legacy string output exactly (fmt()). The
      // histogram stays an imperative chartManager mount into the templated
      // [data-ref="histogram"] host (sanctioned chart tier).

      /**
       * Build all reactive panel data, then mount the histogram.
       * @param {object} result
       */
      _renderResults(result) {
        const t = (k) => _t(k);
        const placeholder = module._container.querySelector('[data-ref="placeholder"]');
        const resultsEl = module._container.querySelector('[data-ref="results"]');
        if (placeholder) placeholder.style.display = 'none';
        if (!resultsEl) return;
        resultsEl.style.display = '';

        const { stats, results, normalityTests } = result;

        this.kpiCells = [
          { value: String(stats.n), label: 'n' },
          { value: fmt(stats.mean), label: t('mean') },
          { value: fmt(stats.stdDev), label: t('stdDev') },
          { value: fmt(stats.median), label: t('median') },
          { value: fmt(stats.skewness), label: t('skewness') },
          { value: fmt(stats.kurtosis), label: t('kurtosisExcess') },
          { value: fmt(stats.min), label: t('min') },
          { value: fmt(stats.max), label: t('max') },
        ];

        this.rankRows = this._buildRankingRows(results, t);
        this.detailTiles = this._buildDetailTiles(results, t);
        this._buildNormalityData(normalityTests, t);

        this.panelShow = true;

        this._renderHistogram(result);
      },

      /**
       * Build structured ranking-table rows.
       * @param {Array} results
       * @param {Function} t
       * @returns {Array}
       */
      _buildRankingRows(results, t) {
        return results.map((r, i) => {
          const rank = i + 1;
          const isD = r.type === 'disc';
          const pV = r.score;
          const pS = pV < 0.0001 ? '0.0000' : fmt(pV);
          const q = pV >= 0.1 ? 'good' : pV >= 0.05 ? 'moderate' : 'poor';
          const params = Object.entries(r.params).map(([k, v]) => `${k}=${typeof v === 'number' ? fmt(v) : String(v)}`).join(', ');
          return {
            rank,
            rankSuffix: rank <= 3 ? String(rank) : 'other',
            name: r.name,
            isDisc: isD,
            typeTagText: isD ? t('tagDisc') : t('tagCont'),
            typeTagClass: isD ? 'distfit__tag--disc' : 'distfit__tag--cont',
            isBest: i === 0,
            params,
            testName: isD ? 'χ²' : 'K-S',
            statVal: isD ? fmt(r.chi2.chi2) : fmt(r.ks.D),
            q,
            pS,
            barWidth: Math.max(5, Math.min(100, pV * 500)),
            qL: t(`fit${  q.charAt(0).toUpperCase()  }${q.slice(1)}`),
          };
        });
      },

      /**
       * Build structured distribution detail tiles.
       * @param {Array} results
       * @param {Function} t
       * @returns {Array}
       */
      _buildDetailTiles(results, t) {
        if (!results || results.length === 0) return [];
        return results.map((r, i) => {
          const rank = i + 1;
          const isD = r.type === 'disc';
          const statVal = isD ? r.chi2.chi2 : r.ks.D;
          const pV = r.score;
          const pS = pV < 0.0001 ? '0.0000' : fmt(pV);
          const q = pV >= 0.1 ? 'good' : pV >= 0.05 ? 'moderate' : 'poor';
          const interpKey = `interp${  q.charAt(0).toUpperCase()  }${q.slice(1)}`;
          const paramRows = Object.entries(r.params).map(([k, v]) => ({
            key: k,
            val: typeof v === 'number' ? fmt(v) : String(v),
          }));
          return {
            rank,
            rankSuffix: rank <= 3 ? String(rank) : 'other',
            name: r.name,
            typeTagText: isD ? t('tagDisc') : t('tagCont'),
            typeTagClass: isD ? 'distfit__tag--disc' : 'distfit__tag--cont',
            isBest: i === 0,
            pillClass: q === 'good' ? 'pass' : q === 'moderate' ? 'warn' : 'fail',
            qL: t(`fit${  q.charAt(0).toUpperCase()  }${q.slice(1)}`),
            paramsLabel: t('colParams'),
            paramRows,
            gofLabel: `${t('detailGofTest')  } (${  isD ? 'χ²' : 'K-S'  })`,
            statRowLabel: `${t('nddStatistic')  } (${  isD ? 'χ²' : 'D'  })`,
            statVal: fmt(statVal),
            isDisc: isD,
            df: isD ? String(r.chi2.df) : '',
            pRowLabel: `p-${  t('value')}`,
            pClass: `distfit__p-cell--${  q}`,
            pS,
            interpClass: `distfit__interpret--${  q}`,
            interpText: t(interpKey),
          };
        });
      },

      /**
       * Build structured normality deep-dive data (cards + consensus + dots).
       * @param {Array} tests
       * @param {Function} t
       */
      _buildNormalityData(tests, t) {
        if (!tests || tests.length === 0) {
          this.nddShow = false;
          this.nddCards = [];
          this.nddDots = [];
          this.nddConsensus = { cls: '', title: '', text: '', scoreLabel: '' };
          return;
        }

        const valid = tests.filter(tt => !tt.tooSmall && !isNaN(tt.p));
        const pass = valid.filter(tt => tt.p >= 0.1).length;
        const fail = valid.filter(tt => tt.p < 0.05).length;
        const total = valid.length;

        let cClass, cTitle, cText;
        if (pass === total) {
          cClass = 'good'; cTitle = t('nddConfirmed'); cText = t('nddConfirmedText');
        } else if (fail === 0) {
          cClass = 'moderate'; cTitle = t('nddBorderline'); cText = t('nddBorderlineText');
        } else if (pass >= fail) {
          cClass = 'moderate'; cTitle = t('nddMixed'); cText = t('nddMixedText');
        } else {
          cClass = 'poor'; cTitle = t('nddRejected'); cText = t('nddRejectedText');
        }

        const numTests = tests.length;
        this.nddCards = tests.map((tt, i) => {
          if (!tt) return null;
          let statL, stat, pVal, desc;
          if (tt.name === 'Shapiro-Wilk') {
            statL = 'W'; stat = tt.W; pVal = tt.p; desc = t('nddSWDesc');
          } else if (tt.name === 'Anderson-Darling') {
            statL = 'A²'; stat = tt.A2; pVal = tt.p; desc = t('nddADDesc');
          } else if (tt.name === 'Jarque-Bera') {
            statL = 'JB'; stat = tt.JB; pVal = tt.p; desc = t('nddJBDesc');
          } else {
            statL = 'K²'; stat = tt.K2; pVal = tt.p; desc = t('nddDPDesc');
          }

          const algoId = ALGO_LAB_IDS[tt.name] || '';
          const numText = `${i + 1  }/${  numTests}`;

          if (tt.tooSmall) {
            const tooSmallKey = tt.name === 'Jarque-Bera'
              ? 'nddTooSmallJB'
              : tt.name === "D'Agostino-Pearson"
                ? 'nddTooSmallDP'
                : 'nddTooSmall';
            return {
              tooSmall: true,
              numText,
              name: tt.name,
              algoId,
              hasAlgoLink: Boolean(algoId),
              desc,
              tooSmallText: t(tooSmallKey),
            };
          }

          const q = pVal >= 0.1 ? 'pass' : pVal >= 0.05 ? 'warn' : 'fail';
          const qI = q === 'pass' ? '✔' : q === 'warn' ? '⚠' : '✘';
          const pClass = q === 'pass' ? 'good' : q === 'warn' ? 'moderate' : 'poor';
          return {
            tooSmall: false,
            numText,
            name: tt.name,
            algoId,
            hasAlgoLink: Boolean(algoId),
            pillClass: `distfit__ndd-pill--${  q}`,
            pillText: `${qI  } ${  t(`nddVerdict${  q.charAt(0).toUpperCase()  }${q.slice(1)}`)}`,
            desc,
            statRowLabel: `${t('nddStatistic')  } (${  statL  })`,
            statVal: fmt(stat),
            pRowLabel: `p-${  t('value')}`,
            pClass: `distfit__p-cell--${  pClass}`,
            pS: pVal < 0.0001 ? '0.0000' : fmt(pVal),
          };
        }).filter(c => c !== null);

        this.nddDots = valid.map(tt => ({
          cls: `distfit__ndd-dot--${  tt.p >= 0.1 ? 'good' : tt.p >= 0.05 ? 'moderate' : 'poor'}`,
        }));

        this.nddConsensus = {
          cls: `distfit__ndd-consensus--${  cClass}`,
          title: cTitle,
          text: cText,
          scoreLabel: `${pass  }/${  total}`,
        };
        this.nddCollapsed = false;
        this.nddShow = true;
      },

      /** Toggle the normality deep-dive body (collapse / expand). */
      toggleNdd() {
        this.nddCollapsed = !this.nddCollapsed;
      },

      /** Chevron glyph for the normality toggle button. */
      nddChevron() {
        return this.nddCollapsed ? '▼' : '▲';
      },

      /** CSS class for the collapsible normality body. */
      nddBodyClass() {
        return this.nddCollapsed ? 'distfit__ndd-body--collapsed' : '';
      },

      /**
       * Navigate to an Algorithm Lab entry from a normality card link.
       * @param {string} algoId
       * @param {Event} event
       */
      openAlgoLab(algoId, event) {
        if (event) event.stopPropagation();
        if (algoId && module._context.eventBus) {
          module._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
        }
      },

      /** Clear all reactive panel data (no-data / error paths). */
      _clearPanel() {
        this.panelShow = false;
        this.kpiCells = [];
        this.rankRows = [];
        this.detailTiles = [];
        this.nddShow = false;
        this.nddCards = [];
        this.nddDots = [];
        this.nddConsensus = { cls: '', title: '', text: '', scoreLabel: '' };
      },

      // ── Chart rendering ───────────────────────────────────────

      /** Destroy all active chart instances. */
      _destroyCharts() {
        for (const chart of this._charts) {
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      /**
       * Render histogram chart with normal curve overlay.
       * Uses _renderGen stale-guard to prevent orphaned charts on rapid re-renders.
       * @param {object} _result
       */
      async _renderHistogram(_result) {
        this._destroyCharts();
        const values = this._getColumnValues();
        if (values.length < 5) return;

        // The histogram host lives inside the x-if results template; wait
        // (bounded) for Alpine to materialise it before mounting.
        const gen = ++this._renderGen;
        const histEl = await whenAnchor(module, this, '[data-ref="histogram"]', gen);
        if (!histEl) return;

        const chart = await module._context.chartManager.create(histEl, 'histogram', {
          title: _t('histogram'),
          data: values,
          binMethod: 'sturges',
          showNormalCurve: true,
          barColor: 'var(--color-chart-1)',
          normalCurveColor: 'var(--color-chart-2)',
          showLegend: false,
        });

        if (gen !== this._renderGen) {
          // Stale render — newer one started while awaiting
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return;
        }

        this._charts.push(chart);
      },

      // ── ColumnPicker (imperative widget) ──────────────────────

      _mountPicker() {
        const wrap = module._container.querySelector('[data-ref="col-picker-wrap"]');
        if (!wrap) return;
        this._picker?.destroy();
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'single',
          types: ['numeric'],
          minCount: 1,
          onChange: (ref) => {
            this.model.columnRef = ref;
            this._autoRun();
          },
        });
        if (this.model.columnRef) this._picker.value = this.model.columnRef;
      },

      // ── Alpine component lifecycle ────────────────────────────

      init() {
        // Fresh per-instance transient collections
        this._charts = [];
        this._unsubs = [];
        this._clearPanel();
        this.nddCollapsed = false;
        this._renderGen = 0;

        this._mountPicker();

        const eb = module._context.eventBus;

        // Refresh picker when the user switches back to this module
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) this._picker?.refresh();
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        // Re-render chart on theme change
        const onTheme = () => {
          if (this._result) {
            this._destroyCharts();
            this._renderHistogram(this._result);
          }
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Trigger initial analysis from restored state
        this._autoRun();
      },

      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._picker?.destroy();
        this._picker = null;
        this._destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: distribution-fit examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `columnRef.instanceId`. On load we provision a fresh worksheet, rewrite the
 * placeholder, then apply state (which re-runs the analysis on the new data).
 *
 * This replaces the generic createModule loadExample because of the worksheet
 * provisioning the generic helper cannot perform.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    rewriteRefs: rewriteRefFields(['columnRef']),
  });
};

export default mod;
