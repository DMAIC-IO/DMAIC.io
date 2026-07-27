/**
 * D.Mike — Gage Run Chart Module (gage-run-chart.js)
 *
 * Measure phase: Minitab's "Messverlaufsdiagramm" (Statistik → Qualitäts-
 * werkzeuge → Messsystemanalyse → Messverlaufsdiagramm).
 *
 * Plots every single measurement grouped into one panel per part, coloured and
 * symbolised per appraiser, against a common reference line. Answers at a
 * glance: does one appraiser scatter more than the others, does one sit
 * systematically off-centre, is a particular part unusual?
 *
 * Not the run chart (`run-chart`, Minitab DE "Verlaufsdiagramm") — that one
 * carries a median line and four runs tests and has nothing to do with gages.
 *
 * The Model holds only the persisted inputs (three column refs, display
 * options, the free-text gage block); the grouping is derived transiently in
 * the view from those inputs plus the live worksheet values. The grouping math
 * lives in `js/engines/gage-run-chart-engine.js`.
 *
 * `ChartBase` renders a single plot area, so a wrapped panel grid is built by
 * stacking one chart instance per strip, all sharing a y-domain. See
 * `docs/superpowers/specs/2026-07-27-gage-run-chart-design.md`.
 */

import { createModule } from '../../core/template-module.js';
import { State, DEFAULT_PARTS_PER_ROW } from './gage-run-chart-model.js';

import { ColumnPicker, getColumnValues, getColumnName } from '../../ui/column-picker.js';
import { computeGageRunChart, splitPanelRows } from '../../engines/gage-run-chart-engine.js';
import { loadWorksheetExample } from '../../core/examples-registry.js';
import { whenAnchor } from '../../core/chart/chart-module-base.js';

/** Debounce for re-running the analysis after an input change. */
const RERUN_DELAY = 120;

/** Upper bound for the panels-per-strip field — beyond this panels are unreadable. */
const MAX_PARTS_PER_ROW = 20;

const mod = createModule({
  config: {
    id: 'gage-run-chart',
    engine: 'alpine',
    phase: 'measure',
    icon: 'activity',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      /**
       * Derived analysis result for the template, or null. Shape:
       *   { rows: [{ idx, panels }], operators, hasOperators, grandMean,
       *     refValue, n, partCount, operatorCount, warnings, yMin, yMax }
       */
      result: null,
      errorMsg: '',

      _pickers: { part: null, operator: null, measurement: null },
      _charts: [],
      _unsubs: [],
      _rerunTimer: null,
      _renderGen: 0,

      // ── View transformations ──────────────────────────────────

      fmt(v) {
        return Number.isFinite(v) ? v.toFixed(4) : '–';
      },

      gageInfoLabel(key) {
        return _t(`gageInfo_${key}`);
      },

      /** Empty string keeps the row hidden via `x-show`. */
      gageInfoValue(key) {
        return this.model.gageInfo[key] || '';
      },

      hasWarnings() {
        return Boolean(this.result) && this.result.warnings.length > 0;
      },

      warningText(code) {
        if (code === 'droppedRows') {
          return _t('warnDroppedRows', { count: this.result.droppedRows });
        }
        return _t(`warn_${code}`);
      },

      refLabel() {
        return this.model.refValue.trim() === '' ? _t('refMean') : _t('refCustom');
      },

      /**
       * Sub-line of the reference KPI. Repeating the grand mean under the
       * "Mean" label would say the same thing twice, so the default case shows
       * the data span instead.
       */
      refSubText() {
        const r = this.result;
        if (!r) return '';
        return this.model.refValue.trim() === ''
          ? _t('statSpan', { min: this.fmt(r.yMin), max: this.fmt(r.yMax) })
          : _t('statGrandMean', { v: this.fmt(r.grandMean) });
      },

      chartTitle() {
        const col = getColumnName(module._context.stateManager, this.model.columnRefs.measurement);
        return _t('chartTitle', { col });
      },

      // ── Event handlers ─────────────────────────────────────────

      refValueChanged(event) {
        this.model.refValue = String(event.target.value);
        this._scheduleRerun();
      },

      partsPerRowChanged(event) {
        const v = parseInt(event.target.value, 10);
        this.model.partsPerRow = (Number.isFinite(v) && v >= 1)
          ? Math.min(v, MAX_PARTS_PER_ROW)
          : DEFAULT_PARTS_PER_ROW;
        this._scheduleRerun();
      },

      optionToggled() {
        // x-model already wrote the boolean; just re-render.
        this._scheduleRerun();
      },

      // ── Analysis ───────────────────────────────────────────────

      _scheduleRerun() {
        clearTimeout(this._rerunTimer);
        this._rerunTimer = setTimeout(() => this._runAnalysis(), RERUN_DELAY);
      },

      _runAnalysis() {
        const clear = (msg = '') => {
          this._destroyCharts();
          this.result = null;
          this.errorMsg = msg;
        };

        const refs = this.model.columnRefs;
        if (!refs.part || !refs.measurement) return clear();

        const sm = module._context.stateManager;
        const parts = getColumnValues(sm, refs.part);
        const measurements = getColumnValues(sm, refs.measurement);
        const operators = refs.operator ? getColumnValues(sm, refs.operator) : null;

        let r;
        try {
          r = computeGageRunChart({ parts, operators, measurements });
        } catch (err) {
          return clear(String(err.message || err));
        }
        if (r.n === 0) return clear(_t('errNoData'));

        const rows = splitPanelRows(r.panels, this.model.partsPerRow)
          .map((panels, idx) => ({ idx, panels }));

        this.result = {
          rows,
          operators: r.operators,
          hasOperators: r.hasOperators,
          grandMean: r.grandMean,
          refValue: this.model.resolveRefValue(r.grandMean),
          n: r.n,
          droppedRows: r.droppedRows,
          partCount: r.parts.length,
          operatorCount: r.hasOperators ? r.operators.length : 0,
          warnings: r.warnings,
          yMin: r.yMin,
          yMax: r.yMax,
        };
        this.errorMsg = '';

        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderStrips(this.result, gen));
      },

      // ── SVG strips (imperative via chartManager) ──────────────

      /**
       * Render one chart instance per strip. All strips share the y-domain and
       * the reference line so the rows stay comparable; only the first strip
       * carries the y-axis title and only the last one the x-axis title.
       * @param {object} res
       * @param {number} gen — stale-render guard
       */
      async _renderStrips(res, gen) {
        this._destroyCharts();
        const measurementName = getColumnName(
          module._context.stateManager, this.model.columnRefs.measurement,
        );
        const partName = getColumnName(module._context.stateManager, this.model.columnRefs.part);

        for (const row of res.rows) {
          const host = await this.whenAnchor(`[data-strip="${row.idx}"]`, gen);
          if (!host || gen !== this._renderGen) return;
          host.replaceChildren();

          const isLast = row.idx === res.rows.length - 1;
          const chart = await module._context.chartManager.create(host, 'gage-run-chart', {
            title: '',
            showTitle: false,
            xLabel: isLast ? partName : '',
            showXLabel: isLast,
            yLabel: measurementName,
            // Every strip reserves legend space, otherwise the strips end up
            // different widths and their panels stop lining up across rows.
            showLegend: res.hasOperators,
            panels: row.panels,
            operators: res.operators,
            refValue: res.refValue,
            refLabel: this.refLabel(),
            showOperatorMean: this.model.showOperatorMean,
            connectWithin: this.model.connectWithin,
            sharedYMin: res.yMin,
            sharedYMax: res.yMax,
          });
          if (gen !== this._renderGen) {
            try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
            return;
          }
          this._charts.push(chart);
        }
      },

      whenAnchor(selector, gen, maxFrames = 30) {
        return whenAnchor(module, this, selector, gen, maxFrames);
      },

      _destroyCharts() {
        for (const c of this._charts) {
          try { module._context.chartManager.destroy(c); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      // ── ColumnPickers (imperative widgets) ────────────────────

      _mountPickers() {
        const pickerConfig = [
          { role: 'part', wrap: 'col-part-wrap', types: null },
          { role: 'operator', wrap: 'col-operator-wrap', types: null },
          // Attribute studies record 0/1 results, so `binary` belongs here too.
          { role: 'measurement', wrap: 'col-measurement-wrap', types: ['numeric', 'binary', 'percent', 'currency'] },
        ];
        for (const { role, wrap, types } of pickerConfig) {
          const el = module._container.querySelector(`[data-ref="${wrap}"]`);
          if (!el) continue;
          this._pickers[role]?.destroy();
          const opts = {
            mode: 'single',
            onChange: (ref) => {
              this.model.columnRefs[role] = ref;
              this._scheduleRerun();
            },
          };
          if (types) opts.types = types;
          this._pickers[role] = new ColumnPicker(el, module._context, opts);
          if (this.model.columnRefs[role]) this._pickers[role].value = this.model.columnRefs[role];
        }
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      init() {
        this._unsubs = [];
        this._charts = [];
        this._renderGen = 0;
        this._rerunTimer = null;
        this._pickers = { part: null, operator: null, measurement: null };

        this._mountPickers();

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) {
            for (const p of Object.values(this._pickers)) p?.refresh();
          }
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        // Chart colours come from CSS custom properties — re-render on theme flip.
        const onTheme = () => {
          if (this.result) this._renderStrips(this.result, ++this._renderGen);
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        this._runAnalysis();
      },

      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        clearTimeout(this._rerunTimer);
        for (const p of Object.values(this._pickers)) p?.destroy();
        this._pickers = { part: null, operator: null, measurement: null };
        this._destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: gage-run-chart catalog examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * instanceId on all three column refs. On load we provision a fresh worksheet,
 * rewrite the placeholders, then apply state (which re-runs the analysis).
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    // `loadWorksheetExample` discards the return value — mutate `data` in place.
    rewriteRefs(data, oldId, newId) {
      if (!data.columnRefs) return data;
      for (const key of ['part', 'operator', 'measurement']) {
        const r = data.columnRefs[key];
        if (r && r.instanceId === oldId) {
          data.columnRefs[key] = { ...r, instanceId: newId };
        }
      }
      return data;
    },
  });
};

export default mod;
