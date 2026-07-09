/**
 * D.Mike — MSA Typ 2 Module (msa-typ2.js)
 * Measure phase: Measurement System Analysis Type 2 (Gage R&R).
 * ANOVA-based crossed study: operators × parts × replicates.
 *
 * Data source: three columns from a Worksheet module
 *   (Part ID, Operator ID, Measurement value).
 *
 * Migrated to createModule + Alpine CSP. The Model (msa-typ2-model.js) holds
 * only the raw inputs (LSL/USL/α/k + three column references); the Gage R&R
 * result is derived transiently in the view from those inputs plus the live
 * worksheet column values via the shared engine. ColumnPickers and the SVG
 * charts are mounted imperatively (they are not pure-template concerns).
 *
 * Spec: docs/modules/MSA-TYP2.md
 */

import { createModule } from '../../core/template-module.js';
import { State } from './msa-typ2-model.js';
import { validate, analyze } from '../../engines/msa-typ2-engine.js';
import { ColumnPicker, getColumnValues } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';

/** @param {number} v @param {number} d @returns {string} */
function fmt(v, d = 4) { return v != null && isFinite(v) ? v.toFixed(d) : '–'; }

const mod = createModule({
  config: {
    id: 'msa-typ2',
    engine: 'alpine',
    phase: 'measure',
    icon: 'users',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      result: null,
      errorMsg: '',
      _pickers: { part: null, operator: null, measurement: null },
      _charts: [],
      _unsubs: [],
      _debTimer: null,
      _renderGen: 0,

      // ── View transformations ──────────────────────────────────

      fmt,

      statusLabel: (s) => _t({ pass: 'statusPass', fail: 'statusFail', warn: 'statusWarn' }[s] || 'statusWarn'),
      badgeLabel: (s) => _t({ pass: 'capable', fail: 'notCapable', warn: 'condCapable' }[s] || 'condCapable'),
      ndcBadge: (s) => (s === 'pass' ? _t('capable') : _t('notCapable')),
      kpiModClass: (s) => ({ pass: 'dmike-kpi--good', warn: 'dmike-kpi--warn', fail: 'dmike-kpi--bad' }[s] || ''),

      statusDetail(r) {
        return `— ${r.p} ${_t('parts')}, ${r.o} ${_t('operators')}, ${r.r} ${_t('replicates')} — n = ${r.n}`;
      },

      fmtP(p) {
        if (p == null || isNaN(p)) return '–';
        if (p < 0.001) return '< 0.001';
        return p.toFixed(3);
      },

      /** ANOVA table rows. Interaction row is present only when not pooled. */
      anovaRows() {
        const r = this.result;
        if (!r) return [];
        const a = r.anova;
        const rows = [
          { key: 'part', label: _t('sourcePart'), ss: fmt(a.part.ss), df: a.part.df, ms: fmt(a.part.ms), f: fmt(a.part.f), p: this.fmtP(a.part.pValue), totalClass: '' },
          { key: 'operator', label: _t('sourceOperator'), ss: fmt(a.operator.ss), df: a.operator.df, ms: fmt(a.operator.ms), f: fmt(a.operator.f), p: this.fmtP(a.operator.pValue), totalClass: '' },
        ];
        if (a.interact) {
          rows.push({ key: 'interact', label: _t('sourceInteract'), ss: fmt(a.interact.ss), df: a.interact.df, ms: fmt(a.interact.ms), f: fmt(a.interact.f), p: this.fmtP(a.interact.pValue), totalClass: '' });
        }
        rows.push({
          key: 'equip',
          label: r.interactionPooled ? _t('sourceEquipPooled') : _t('sourceEquip'),
          ss: fmt(a.equip.ss), df: a.equip.df, ms: fmt(a.equip.ms), f: '–', p: '–', totalClass: '',
        });
        rows.push({ key: 'total', label: _t('sourceTotal'), ss: fmt(a.total.ss), df: a.total.df, ms: '–', f: '–', p: '–', totalClass: 'msa-typ2__anova-total' });
        return rows;
      },

      varCompHasTol() {
        return Boolean(this.result && this.result.varComp.grr.pctTolerance != null);
      },

      /** Variance components table rows. */
      varCompRows() {
        const r = this.result;
        if (!r) return [];
        const vc = r.varComp;
        const i2 = '  ';
        const i4 = '    ';
        const defs = [
          ['grr', _t('gageRR')],
          ['repeatability', `${i2}${_t('repeatability')}`],
          ['reproducibility', `${i2}${_t('reproducibility')}`],
          ['operator', `${i4}${_t('sourceOperator')}`],
          ['interact', `${i4}${_t('sourceInteract')}`],
          ['part', _t('partToPartVar')],
          ['total', _t('sourceTotal')],
        ];
        return defs.map(([key, label]) => {
          const v = vc[key];
          return {
            key,
            label,
            variance: fmt(v.variance),
            sigma: fmt(v.sigma),
            studyVar: fmt(v.studyVar),
            pctContribution: fmt(v.pctContribution),
            pctStudyVar: fmt(v.pctStudyVar),
            pctTolerance: v.pctTolerance != null ? fmt(v.pctTolerance) : '–',
            totalClass: key === 'total' ? 'msa-typ2__anova-total' : '',
          };
        });
      },

      // ── Analysis (controller — needs context + live worksheet data) ──

      parseNum(s) {
        if (s == null || s === '') return NaN;
        return parseFloat(String(s).replace(',', '.').trim());
      },

      /**
       * Build the three data arrays from worksheet columns.
       * @returns {{ parts: string[], operators: string[], measurements: number[] }|null}
       */
      _buildDataArrays() {
        const sm = module._context.stateManager;
        const refs = this.model.columnRefs;
        const rawParts = getColumnValues(sm, refs.part);
        const rawOps = getColumnValues(sm, refs.operator);
        const rawMeas = getColumnValues(sm, refs.measurement);

        const parts = [], operators = [], measurements = [];
        const len = Math.min(rawParts.length, rawOps.length, rawMeas.length);
        for (let i = 0; i < len; i++) {
          if (rawParts[i] == null || rawOps[i] == null || rawMeas[i] == null) continue;
          parts.push(String(rawParts[i]));
          operators.push(String(rawOps[i]));
          const m = typeof rawMeas[i] === 'number' ? rawMeas[i] : parseFloat(String(rawMeas[i]).replace(',', '.'));
          if (isNaN(m)) continue;
          measurements.push(m);
        }

        const validLen = Math.min(parts.length, operators.length, measurements.length);
        if (validLen === 0) return null;

        return {
          parts: parts.slice(0, validLen),
          operators: operators.slice(0, validLen),
          measurements: measurements.slice(0, validLen),
        };
      },

      /**
       * Run analysis if all inputs are valid; otherwise silently clear results
       * (no error shown — matches the legacy auto-analysis behaviour).
       */
      runAnalysis() {
        const refs = this.model.columnRefs;
        if (!refs.part || !refs.operator || !refs.measurement) return this.clearResults();

        const data = this._buildDataArrays();
        if (!data) return this.clearResults();

        const p = this.model.params;
        const opts = {
          alpha: this.parseNum(p.alpha) || 0.05,
          studyVarMultiplier: parseFloat(p.k),
          lsl: this.parseNum(p.lsl),
          usl: this.parseNum(p.usl),
        };

        const v = validate(data, opts);
        if (!v.valid) return this.clearResults();

        const r = analyze(data, opts);
        this.result = r;
        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderCharts(r, gen));
      },

      scheduleAnalysis() {
        clearTimeout(this._debTimer);
        this._debTimer = setTimeout(() => this.runAnalysis(), 600);
      },

      clearResults() {
        this.result = null;
        this._destroyCharts();
      },

      // ── Algorithm Lab link ────────────────────────────────────

      algoNavigate(algoId, event) {
        event?.stopPropagation();
        if (algoId && module._context.eventBus) {
          module._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
        }
      },

      // ── SVG charts (imperative via chartManager) ──────────────

      _operatorColors(n) {
        const palette = [
          'var(--color-chart-1)', 'var(--color-chart-3)', 'var(--color-chart-5)',
          'var(--color-chart-2)', 'var(--color-chart-7)', 'var(--color-chart-4)',
        ];
        return Array.from({ length: n }, (_, i) => palette[i % palette.length]);
      },

      async _renderCharts(r, gen) {
        this._destroyCharts();
        await this._renderComponentsChart(r, gen);
        if (gen !== this._renderGen) return;
        await this._renderByPartChart(r, gen);
        if (gen !== this._renderGen) return;
        await this._renderByOperatorChart(r, gen);
        if (gen !== this._renderGen) return;
        await this._renderInteractionChart(r, gen);
        if (gen !== this._renderGen) return;
        await this._renderXbarChart(r, gen);
        if (gen !== this._renderGen) return;
        await this._renderRChart(r, gen);
      },

      async _renderComponentsChart(r, gen) {
        const el = module._container.querySelector('[data-ref="chart-components"]');
        if (!el) return;
        const vc = r.varComp;
        const hasTol = vc.grr.pctTolerance != null;

        const categories = [
          _t('gageRR'), _t('repeatability'), _t('reproducibility'), _t('partToPartVar'),
        ];
        const keys = ['grr', 'repeatability', 'reproducibility', 'part'];

        const groups = [
          { name: `%${  _t('contribution')}`, values: keys.map(k => vc[k].pctContribution), color: 'var(--color-chart-1)' },
          { name: `%${  _t('studyVar')}`, values: keys.map(k => vc[k].pctStudyVar), color: 'var(--color-chart-2)' },
        ];
        if (hasTol) {
          groups.push({ name: `%${  _t('tolerance')}`, values: keys.map(k => vc[k].pctTolerance), color: 'var(--color-chart-3)' });
        }

        const chart = await module._context.chartManager.create(el, 'bar', {
          categories, groups, yLabel: '%', yMin: 0, showLegend: true,
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      async _renderByPartChart(r, gen) {
        const el = module._container.querySelector('[data-ref="chart-by-part"]');
        if (!el) return;
        const opColors = this._operatorColors(r.o);
        const partIndex = {};
        r.partLabels.forEach((pl, i) => { partIndex[pl] = i; });

        const series = r.operatorLabels.map((op, oi) => {
          const x = [], y = [];
          for (const pl of r.partLabels) {
            for (const v of r.cellData[pl][op]) {
              x.push(partIndex[pl]);
              y.push(v);
            }
          }
          return { name: op, color: opColors[oi], x, y, symbol: 'circle', strokeWidth: 1.5 };
        });

        series.push({
          name: 'x̄ Part',
          color: 'var(--color-text-secondary)',
          x: r.partLabels.map((_, i) => i),
          y: r.partLabels.map(pl => r.partMeans[pl]),
          symbol: 'diamond', strokeWidth: 1,
          connectLine: { show: true, width: 1.5, dash: 'dot', color: 'var(--color-text-secondary)' },
        });

        const chart = await module._context.chartManager.create(el, 'scatter', {
          showLegend: true,
          xLabel: _t('partLabel'),
          xMin: -0.5,
          xMax: r.partLabels.length - 0.5,
          series,
          refLines: [
            { dir: 'h', value: r.grandMean, label: 'x̄', dash: 'dash', color: 'var(--color-info)' },
          ],
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      async _renderByOperatorChart(r, gen) {
        const el = module._container.querySelector('[data-ref="chart-by-operator"]');
        if (!el) return;
        const opColors = this._operatorColors(r.o);

        const groups = r.operatorLabels.map((op) => {
          const vals = [];
          for (const pl of r.partLabels) vals.push(...r.cellData[pl][op]);
          return { name: op, values: vals };
        });

        const chart = await module._context.chartManager.create(el, 'boxplot', {
          groups,
          boxColors: opColors,
          showMean: true,
          showOutliers: true,
          showLegend: false,
          xLabel: _t('operatorLabel'),
          refLines: [
            { dir: 'v', value: r.grandMean, label: 'x̄', dash: 'dash', color: 'var(--color-info)' },
          ],
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      async _renderInteractionChart(r, gen) {
        const el = module._container.querySelector('[data-ref="chart-interaction"]');
        if (!el) return;
        const opColors = this._operatorColors(r.o);

        const series = r.operatorLabels.map((op, oi) => ({
          name: op,
          color: opColors[oi],
          x: r.partLabels.map((_, i) => i),
          y: r.partLabels.map(pl => r.cellMeans[pl][op]),
          symbol: 'circle', strokeWidth: 1.5,
          connectLine: { show: true, width: 1.5, dash: 'solid', color: opColors[oi] },
        }));

        const chart = await module._context.chartManager.create(el, 'scatter', {
          showLegend: true,
          xLabel: _t('partLabel'),
          xMin: -0.5,
          xMax: r.partLabels.length - 0.5,
          series,
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      async _renderXbarChart(r, gen) {
        const el = module._container.querySelector('[data-ref="chart-xbar"]');
        if (!el) return;
        const ctrl = r.controlChart;

        const xArr = [], yArr = [];
        let idx = 0;
        for (let oi = 0; oi < r.operatorLabels.length; oi++) {
          const op = r.operatorLabels[oi];
          for (const pl of r.partLabels) {
            xArr.push(idx);
            yArr.push(r.cellMeans[pl][op]);
            idx++;
          }
        }

        const chart = await module._context.chartManager.create(el, 'scatter', {
          showLegend: false,
          xLabel: '',
          yLabel: 'x̄',
          series: [{
            name: 'x̄',
            color: 'var(--color-text-primary)',
            x: xArr, y: yArr,
            symbol: 'circle', strokeWidth: 1,
            connectLine: { show: true, width: 1, dash: 'solid', color: 'var(--color-text-secondary)' },
          }],
          refLines: [
            { dir: 'h', value: ctrl.xbarUCL, label: 'UCL', dash: 'dash', color: 'var(--color-error)' },
            { dir: 'h', value: ctrl.xbarCL, label: 'CL', dash: 'dash', color: 'var(--color-success)' },
            { dir: 'h', value: ctrl.xbarLCL, label: 'LCL', dash: 'dash', color: 'var(--color-error)' },
          ],
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      async _renderRChart(r, gen) {
        const el = module._container.querySelector('[data-ref="chart-r"]');
        if (!el) return;
        const ctrl = r.controlChart;

        const xArr = [], yArr = [];
        let idx = 0;
        for (let oi = 0; oi < r.operatorLabels.length; oi++) {
          const op = r.operatorLabels[oi];
          for (const pl of r.partLabels) {
            xArr.push(idx);
            yArr.push(r.cellRanges[pl][op]);
            idx++;
          }
        }

        const chart = await module._context.chartManager.create(el, 'scatter', {
          showLegend: false,
          xLabel: '',
          yLabel: 'R',
          series: [{
            name: 'R',
            color: 'var(--color-text-primary)',
            x: xArr, y: yArr,
            symbol: 'circle', strokeWidth: 1,
            connectLine: { show: true, width: 1, dash: 'solid', color: 'var(--color-text-secondary)' },
          }],
          refLines: [
            { dir: 'h', value: ctrl.rUCL, label: 'UCL', dash: 'dash', color: 'var(--color-error)' },
            { dir: 'h', value: ctrl.rCL, label: 'CL', dash: 'dash', color: 'var(--color-success)' },
            { dir: 'h', value: ctrl.rLCL, label: 'LCL', dash: 'dash', color: 'var(--color-error)' },
          ],
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
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
          { role: 'measurement', wrap: 'col-measurement-wrap', types: ['numeric'] },
        ];
        for (const { role, wrap, types } of pickerConfig) {
          const el = module._container.querySelector(`[data-ref="${wrap}"]`);
          if (!el) continue;
          this._pickers[role]?.destroy();
          const opts = {
            mode: 'single',
            onChange: (ref) => {
              this.model.columnRefs[role] = ref;
              this.runAnalysis();
            },
          };
          if (types) opts.types = types;
          this._pickers[role] = new ColumnPicker(el, module._context, opts);
          if (this.model.columnRefs[role]) this._pickers[role].value = this.model.columnRefs[role];
        }
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      init() {
        // Fresh per-instance collections (the data() object is shared by Alpine.data).
        this._charts = [];
        this._unsubs = [];
        this._pickers = { part: null, operator: null, measurement: null };

        // Seed α default from global settings if the user never set one.
        if (!this.model.params.alpha) {
          const conf = module._context.stateManager.get('settings.confidenceLevel') ?? 95;
          this.model.params.alpha = String(Number(((100 - conf) / 100).toFixed(4)));
        }

        this._mountPickers();

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) {
            for (const p of Object.values(this._pickers)) p?.refresh();
          }
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        const onTheme = () => {
          if (this.result) this._renderCharts(this.result, ++this._renderGen);
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Recompute results from restored state.
        this.runAnalysis();
      },

      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        clearTimeout(this._debTimer);
        for (const p of Object.values(this._pickers)) p?.destroy();
        this._pickers = { part: null, operator: null, measurement: null };
        this._destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: MSA-Typ2 examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `columnRefs.{part,operator,measurement}.instanceId`. On load we provision a
 * fresh worksheet, rewrite the placeholders, then apply state (which re-runs
 * the analysis on the new data).
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, instanceId) {
      if (!data.columnRefs) return data;
      const next = { ...data.columnRefs };
      for (const key of ['part', 'operator', 'measurement']) {
        const r = next[key];
        if (r && r.instanceId === '__source__') next[key] = { ...r, instanceId };
      }
      return { ...data, columnRefs: next };
    },
  });
};

export default mod;
