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
 *
 * @agent  Steuerbar über das Viewmodel: der Datentyp (setParam), die
 *   Messwertspalte (setColumn) und das Rechnen selbst. Gelesen wird über
 *   read() mit erklärter Lesefläche (AgentRead) — Konfiguration, wählbare
 *   Spalten und die Rangfolge der angepassten Verteilungen. Der Agent
 *   bekommt Zahlen, keine Diagramme.
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId } from '../../core/agent/agent-argcheck.js';
import { setAtPath } from '../../core/agent/agent-path.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { State, DATA_TYPES } from './distribution-fit-model.js';
import { runDistributionFit } from '../../engines/distribution-fit-engine.js';
import { ColumnPicker, getColumnValues, refToKey, keyToRef } from '../../ui/column-picker.js';
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

/** Die Parameter, die `setParam` annimmt. */
const PARAM_KEYS = ['dataType'];

/** Je Parameter sein Prüfer; gibt den normalisierten Wert zurück. */
const PARAM_CHECKS = {
  dataType: (v) => { requireEnum('value', v, DATA_TYPES); return v; },
};

/** Die Spalten-Slots dieses Moduls: genau einer, die Messwertspalte. */
const COLUMN_SLOTS = ['value'];

/** Je Slot der Filter, den der Wähler dieses Slots bekommt. */
const SLOT_FILTERS = { value: { types: ['numeric'], minCount: 1 } };

/** Je Slot die eine Zuweisungsstelle seines Model-Feldes. */
const COLUMN_SINKS = { value: (m, ref) => { m.columnRef = ref; } };

/** Beschriftungsschlüssel der Datentyp-Segmente. */
const DATA_TYPE_LABEL_KEYS = {
  auto: 'dataTypeAuto',
  continuous: 'dataTypeCont',
  discrete: 'dataTypeDisc',
};

/** Präfix der Kontexthilfe-Schlüssel für die in JS erzeugten Kacheln. */
const HELP = 'modules.distribution-fit.types.';

/**
 * Die Schlüsselfläche von `setParam`. Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {'auto'|'continuous'|'discrete'} dataType  Datentyp
 */

/**
 * Das gerechnete Ergebnis, wie `read().result` es liefert. Die Dichte- und
 * Verteilungsfunktionen der Engine fallen beim Lesen weg.
 *
 * @typedef {object} Result
 * @property {DescStats} stats  Kennwerte der Daten
 * @property {Fit[]} results  angepasste Verteilungen, beste zuerst
 * @property {NormalityTest[]} normalityTests  Normalitätstests
 * @property {'auto'|'continuous'|'discrete'} _dataType  Datentyp der Rechnung
 */

/**
 * @typedef {object} DescStats
 * @property {number} n  Anzahl
 * @property {number|null} mean  Mittelwert
 * @property {number|null} stdDev  Standardabweichung
 * @property {number|null} median  Median
 * @property {number|null} skewness  Schiefe
 * @property {number|null} kurtosis  Exzess-Wölbung
 * @property {number|null} min  Minimum
 * @property {number|null} max  Maximum
 */

/**
 * @typedef {object} Fit
 * @property {string} name  Verteilung
 * @property {'cont'|'disc'} type  stetig oder diskret
 * @property {Object<string, number>} params  geschätzte Parameter
 * @property {KsTest} [ks]  Kolmogorov-Smirnov, nur stetig
 * @property {ChiSquareTest} [chi2]  χ²-Anpassungstest, nur diskret
 * @property {number|null} score  p-Wert des Gütetests
 */

/**
 * @typedef {object} KsTest
 * @property {number|null} D  Statistik
 * @property {number|null} p  p-Wert
 */

/**
 * @typedef {object} ChiSquareTest
 * @property {number|null} chi2  Statistik
 * @property {number|null} df  Freiheitsgrade
 * @property {number|null} p  p-Wert
 */

/**
 * @typedef {object} NormalityTest
 * @property {string} name  Test
 * @property {number|null} p  p-Wert
 * @property {number|null} [W]  Shapiro-Wilk
 * @property {number|null} [A2]  Anderson-Darling, unkorrigiert
 * @property {number|null} [JB]  Jarque-Bera
 * @property {number|null} [K2]  D'Agostino-Pearson
 * @property {number|null} [skewness]  Schiefe
 * @property {number|null} [exKurtosis]  Exzess-Wölbung
 * @property {number|null} [skewZ]  z der Schiefe
 * @property {number|null} [kurtZ]  z der Wölbung
 * @property {boolean} [tooSmall]  zu wenige Werte
 */

/**
 * Die Agenten-Lesefläche von Distribution Fit.
 *
 * Nicht die persistierte Form: das Model hält nur Spalte und Datentyp, das
 * Ergebnis entsteht transient am Viewmodel. Darum erklärt dieses Modul seine
 * Lesefläche — ohne die interne Beispiel-Buchführung (`exampleWorksheetId`).
 *
 * @typedef {object} AgentRead
 * @property {object|null} columnRef  the chosen data column, `{ instanceId, sheetId, columnId }`, or null
 * @property {'auto'|'continuous'|'discrete'} dataType  how the data is treated
 * @property {string[]} activeParams  the keys `setParam` accepts in the current state
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts in the current state
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {Result|null} result  the ranking of the fitted distributions with key figures, or null
 * @property {string} errorMsg  the reason no result exists (too few values, zero variance), or an empty string
 */
const mod = createModule({
  config: {
    id: 'distribution-fit',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.distribution-fit',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      /** @type {object|null} — current analysis result */
      _result: null,
      /** Reason shown in the error box; empty while there is none. */
      errorMsg: '',
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
      /** @type {Array<{value:string, label:string, help:string}>} descriptive KPI cells. */
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

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Konfiguration, wählbare Spalten und Rangfolge
       */
      read(options) {
        return readAgentState('distribution-fit', {
          ...this.model.toJSON(),
          activeParams: this.activeParams(),
          activeColumnSlots: this.activeColumnSlots(),
          pickableColumns: this.pickableColumns(),
          result: this._result,
          errorMsg: this.errorMsg,
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        return [...PARAM_KEYS];
      },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() {
        return [...COLUMN_SLOTS];
      },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return { value: pickableColumnList(sm, SLOT_FILTERS.value) };
      },

      /** @noagent view transform; die Segmente rendern aus DATA_TYPES */
      dataTypeOptions() {
        return DATA_TYPES.map(v => ({ value: v, label: _t(DATA_TYPE_LABEL_KEYS[v]) }));
      },

      /**
       * Den Datentyp setzen; die Analyse läuft danach neu.
       * @agent
       * @param {keyof Params} key welcher Parameter
       * @param {'auto'|'continuous'|'discrete'} value der Wert; Bedeutung je Schlüssel siehe `Params`
       * @returns {void}
       * @throws {Error} wenn `key` kein Parameter dieses Moduls ist oder `value` nicht zulässig
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model, key, PARAM_CHECKS[key](value));
        this._autoRun();
      },

      /**
       * Eine Spalte einem Slot zuweisen; die Analyse läuft danach neu.
       * @agent
       * @param {'value'} slot der Slot; dieses Modul führt nur `value`
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte, oder null zum Leeren
       * @returns {void}
       * @throws {Error} wenn `slot` unbekannt ist oder die Spalte nicht wählbar
       */
      setColumn(slot, ref) {
        requireEnum('slot', slot, COLUMN_SLOTS);
        if (ref == null) {
          COLUMN_SINKS[slot](this.model, null);
          this._picker?.syncValue(null);
          this._autoRun();
          return;
        }
        requireEnum('slot', slot, this.activeColumnSlots());
        const keys = this.pickableColumns()[slot].map(c => c.key);
        requireKnownId('ref', refToKey(ref), keys);
        // Normalisierte Form: fremde Eigenschaften des Agentenobjekts bleiben draußen.
        const clean = keyToRef(refToKey(ref));
        COLUMN_SINKS[slot](this.model, clean);
        this._picker?.syncValue(clean);
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
          this.errorMsg = '';
          this._destroyCharts();
          this._clearPanel();
          this._showPlaceholder();
          return;
        }
        this.runAnalysis();
      },

      /** Show the placeholder and hide the results container. */
      _showPlaceholder() {
        const placeholder = module._container.querySelector('[data-ref="placeholder"]');
        const resultsEl = module._container.querySelector('[data-ref="results"]');
        if (placeholder) placeholder.style.display = '';
        if (resultsEl) resultsEl.style.display = 'none';
      },

      /**
       * Rechnet mit der gewählten Spalte. Ohne Spalte bleibt result null und
       * errorMsg leer; mit weniger als 5 Werten bleibt result null und errorMsg
       * nennt den Grund.
       * @agent
       * @returns {void}
       */
      runAnalysis() {
        this.errorMsg = '';

        const values = this._getColumnValues();
        if (values.length < 5) {
          this.errorMsg = this.model.columnRef ? _t('errMin5') : '';
          this._result = null;
          this._destroyCharts();
          this._clearPanel();
          this._showPlaceholder();
          return;
        }

        try {
          this._result = runDistributionFit(values, this.model.dataType);
          this._result._dataType = this.model.dataType;
          this._renderResults(this._result);
        } catch (err) {
          this.errorMsg = _t(err.message === 'zeroVariance' ? 'errZeroVariance' : 'errGeneric');
          this._result = null;
          this._destroyCharts();
          this._clearPanel();
          this._showPlaceholder();
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
          { value: String(stats.n), label: t('common.sym.n'), help: HELP + 'DescStats.n' },
          { value: fmt(stats.mean), label: t('mean'), help: HELP + 'DescStats.mean' },
          { value: fmt(stats.stdDev), label: t('stdDev'), help: HELP + 'DescStats.stdDev' },
          { value: fmt(stats.median), label: t('median'), help: HELP + 'DescStats.median' },
          { value: fmt(stats.skewness), label: t('skewness'), help: HELP + 'DescStats.skewness' },
          { value: fmt(stats.kurtosis), label: t('kurtosisExcess'), help: HELP + 'DescStats.kurtosis' },
          { value: fmt(stats.min), label: t('min'), help: HELP + 'DescStats.min' },
          { value: fmt(stats.max), label: t('max'), help: HELP + 'DescStats.max' },
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
            testName: isD ? t('symChi2') : t('symKs'),
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
            gofLabel: `${t('detailGofTest')  } (${  isD ? t('symChi2') : t('symKs')  })`,
            statRowLabel: `${t('nddStatistic')  } (${  isD ? t('symChi2') : t('symKsD')  })`,
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
          const qIcon = q === 'pass' ? 'status.ok' : q === 'warn' ? 'status.warning' : 'status.error';
          const pClass = q === 'pass' ? 'good' : q === 'warn' ? 'moderate' : 'poor';
          return {
            tooSmall: false,
            numText,
            name: tt.name,
            algoId,
            hasAlgoLink: Boolean(algoId),
            pillClass: `distfit__ndd-pill--${  q}`,
            pillIcon: qIcon,
            pillText: t(`nddVerdict${  q.charAt(0).toUpperCase()  }${q.slice(1)}`),
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

      /**
       * Toggle the normality deep-dive body (collapse / expand).
       * @noagent view transform
       */
      toggleNdd() {
        this.nddCollapsed = !this.nddCollapsed;
      },

      /**
       * Icon name for the normality toggle button.
       * @noagent view transform
       */
      nddChevronIcon() {
        return this.nddCollapsed ? 'nav.expand-down' : 'nav.collapse-up';
      },

      /**
       * Accessible title for the normality toggle button.
       * @noagent view transform
       */
      nddToggleTitle() {
        return this.nddCollapsed ? this.t('nddExpand') : this.t('nddCollapse');
      },

      /**
       * CSS class for the collapsible normality body.
       * @noagent view transform
       */
      nddBodyClass() {
        return this.nddCollapsed ? 'distfit__ndd-body--collapsed' : '';
      },

      /**
       * Navigate to an Algorithm Lab entry from a normality card link.
       * @noagent navigation
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
          ...SLOT_FILTERS.value,
          onChange: (ref) => {
            this.setColumn('value', ref);
          },
        });
        if (this.model.columnRef) this._picker.value = this.model.columnRef;
      },

      // ── Alpine component lifecycle ────────────────────────────

      /** @noagent lifecycle */
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

      /** @noagent lifecycle */
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
