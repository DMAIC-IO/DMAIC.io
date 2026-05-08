/**
 * D.Mike — MSA Typ 2 Module (msa-typ2.js)
 * Measure phase: Measurement System Analysis Type 2 (Gage R&R).
 * ANOVA-based crossed study: operators × parts × replicates.
 *
 * Data source: three columns from a Worksheet module
 *   (Part ID, Operator ID, Measurement value).
 *
 * Spec: docs/modules/MSA-TYP2.md
 */

import { validate, analyze } from '../../engines/msa-typ2-engine.js';
import { ColumnPicker, getColumnValues } from '../../ui/column-picker.js';

/** Algorithm Lab ID for the Gage R&R algorithm. */
const ALGO_LAB_ID_GRR = 'grr';

/** Small code icon SVG for Algorithm Lab links. */
const ALGO_LINK_SVG = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

/** @param {number} v @param {number} d @returns {string} */
function fmt(v, d = 4) { return v != null && isFinite(v) ? v.toFixed(d) : '–'; }

export default {
  id: 'msa-typ2',
  phase: 'measure',
  icon: 'users',
  i18nKey: 'modules.msa-typ2',
  version: '1.0.0',

  _container: null,
  _context: null,
  _t: null,
  _result: null,
  _columnRefs: { part: null, operator: null, measurement: null },
  _pickers: { part: null, operator: null, measurement: null },
  _params: { lsl: NaN, usl: NaN, alpha: null, studyVarMultiplier: 5.15 },
  _charts: [],
  _renderGen: 0,
  _eventUnsubs: [],

  help: () => import('./msa-typ2-help.js'),

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._t = (key, vars) => context.i18n.t(key, vars);

    if (!document.getElementById('msa-typ2-css')) {
      const link = document.createElement('link');
      link.id = 'msa-typ2-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/msa-typ2/msa-typ2.css';
      document.head.appendChild(link);
    }

    const onModuleActivated = ({ instanceId }) => {
      if (instanceId === context.instanceId) {
        for (const p of Object.values(this._pickers)) p?.refresh();
      }
    };
    context.eventBus.on('module:activated', onModuleActivated);
    this._eventUnsubs.push(() => context.eventBus.off('module:activated', onModuleActivated));

    const globalAlpha = +((100 - (context.stateManager.get('settings.confidenceLevel') ?? 95)) / 100).toFixed(4);
    this._params = { lsl: NaN, usl: NaN, alpha: globalAlpha, studyVarMultiplier: 5.15 };
    this._columnRefs = { part: null, operator: null, measurement: null };
    this._pickers = { part: null, operator: null, measurement: null };
    this._result = null;

    container.innerHTML = '';
    this._render();
  },

  async destroy() {
    for (const unsub of this._eventUnsubs) unsub();
    this._eventUnsubs = [];
    for (const p of Object.values(this._pickers)) p?.destroy();
    this._pickers = { part: null, operator: null, measurement: null };
    this._destroyCharts();
    this._container.innerHTML = '';
  },

  onLanguageChange() {
    this._render();
    if (this._result) this._renderResults(this._result);
  },

  onThemeChange() {
    if (this._result) {
      this._destroyCharts();
      this._renderCharts(this._result, ++this._renderGen);
    }
  },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    this._readInputs();
    return {
      params: { ...this._params },
      columnRefs: {
        part: this._columnRefs.part ? { ...this._columnRefs.part } : null,
        operator: this._columnRefs.operator ? { ...this._columnRefs.operator } : null,
        measurement: this._columnRefs.measurement ? { ...this._columnRefs.measurement } : null,
      },
      lastResult: this._result,
    };
  },

  setState(data) {
    if (!data) return;
    if (data.params) this._params = { ...this._params, ...data.params };
    if (data.columnRefs) {
      for (const key of ['part', 'operator', 'measurement']) {
        this._columnRefs[key] = data.columnRefs[key] ? { ...data.columnRefs[key] } : null;
      }
    }
    this._result = data.lastResult || null;
    this._render();
    if (this._result) this._renderResults(this._result);
    this._tryAutoAnalysis();
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    for (const p of Object.values(this._pickers)) p?.destroy();
    this._pickers = { part: null, operator: null, measurement: null };

    const t = this._t;
    const p = this._params;

    this._container.innerHTML = `
      <div class="module-msa-typ2 dmike-split">
        <div class="dmike-split__input">
          <div class="dmike-split__section-title">${t('modules.msa-typ2.sectionColumns')}</div>

          <div class="field-group">
            <label>${t('modules.msa-typ2.partColumn')}</label>
            <div data-ref="col-part-wrap"></div>
          </div>

          <div class="field-group">
            <label>${t('modules.msa-typ2.operatorColumn')}</label>
            <div data-ref="col-operator-wrap"></div>
          </div>

          <div class="field-group">
            <label>${t('modules.msa-typ2.measurementColumn')}</label>
            <div data-ref="col-measurement-wrap"></div>
          </div>

          <div class="dmike-split__section-title">${t('modules.msa-typ2.sectionParams')}</div>

          <div class="msa-typ2__row">
            <div class="field-group">
              <label>${t('modules.msa-typ2.lsl')}</label>
              <input type="text" class="field field--num" data-ref="inp-lsl" placeholder="24.900" inputmode="decimal" value="${isNaN(p.lsl) ? '' : p.lsl}">
            </div>
            <div class="field-group">
              <label>${t('modules.msa-typ2.usl')}</label>
              <input type="text" class="field field--num" data-ref="inp-usl" placeholder="25.100" inputmode="decimal" value="${isNaN(p.usl) ? '' : p.usl}">
            </div>
          </div>

          <div class="msa-typ2__row">
            <div class="field-group">
              <label>${t('modules.msa-typ2.alphaLabel')}</label>
              <input type="text" class="field field--num" data-ref="inp-alpha" inputmode="decimal" value="${p.alpha}">
            </div>
            <div class="field-group">
              <label>${t('modules.msa-typ2.kLabel')}</label>
              <select class="field" data-ref="inp-k">
                <option value="5.15"${p.studyVarMultiplier === 5.15 ? ' selected' : ''}>5.15 (99 %)</option>
                <option value="6"${p.studyVarMultiplier === 6 ? ' selected' : ''}>6.00 (99.73 %)</option>
              </select>
            </div>
          </div>

          <div class="msa-typ2__error" data-ref="error-box"></div>
        </div>

        <div class="dmike-split__output">
          <div data-ref="results"></div>
        </div>
      </div>
    `;

    const pickerConfig = [
      { role: 'part', wrap: 'col-part-wrap', types: null },
      { role: 'operator', wrap: 'col-operator-wrap', types: null },
      { role: 'measurement', wrap: 'col-measurement-wrap', types: ['numeric'] },
    ];
    for (const { role, wrap, types } of pickerConfig) {
      const el = this._container.querySelector(`[data-ref="${wrap}"]`);
      const opts = {
        mode: 'single',
        onChange: (ref) => {
          this._columnRefs[role] = ref;
          this._save();
          this._tryAutoAnalysis();
        },
      };
      if (types) opts.types = types;
      this._pickers[role] = new ColumnPicker(el, this._context, opts);
      if (this._columnRefs[role]) this._pickers[role].value = this._columnRefs[role];
    }

    this._bindEvents();
  },

  _bindEvents() {
    const c = this._container;
    const autoRun = this._debounce(() => { this._save(); this._tryAutoAnalysis(); }, 600);
    c.querySelectorAll('[data-ref^="inp-"]').forEach(el => {
      el.addEventListener('input', autoRun);
      el.addEventListener('change', autoRun);
    });
  },

  // ─── Actions ────────────────────────────────────────────────

  /**
   * Automatically run analysis if all required inputs are present and valid.
   * Silently clears results when data is incomplete.
   */
  _tryAutoAnalysis() {
    this._readInputs();

    if (!this._columnRefs.part || !this._columnRefs.operator || !this._columnRefs.measurement) {
      return this._clearResults();
    }

    const data = this._buildDataArrays();
    if (!data) return this._clearResults();

    const p = this._params;
    const opts = {
      alpha: p.alpha,
      studyVarMultiplier: p.studyVarMultiplier,
      lsl: this._parseNum(p.lsl),
      usl: this._parseNum(p.usl),
    };

    const v = validate(data, opts);
    if (!v.valid) return this._clearResults();

    this._hideError();
    const result = analyze(data, opts);
    this._result = result;
    this._renderResults(result);
    this._save();
  },

  /**
   * Clear results when data is incomplete.
   */
  _clearResults() {
    this._result = null;
    const resultsEl = this._container?.querySelector('[data-ref="results"]');
    if (resultsEl) resultsEl.innerHTML = '';
    this._destroyCharts();
  },

  /**
   * Build the three data arrays from worksheet columns.
   * @returns {{ parts: string[], operators: string[], measurements: number[] }|null}
   */
  _buildDataArrays() {
    const sm = this._context.stateManager;
    const rawParts = getColumnValues(sm, this._columnRefs.part);
    const rawOps = getColumnValues(sm, this._columnRefs.operator);
    const rawMeas = getColumnValues(sm, this._columnRefs.measurement);

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

  // ─── Render Results ─────────────────────────────────────────

  async _renderResults(r) {
    this._destroyCharts();
    const gen = ++this._renderGen;

    const t = this._t;
    const resultsEl = this._container.querySelector('[data-ref="results"]');
    if (!resultsEl) return;

    const statusLabel = {
      pass: t('modules.msa-typ2.statusPass'),
      fail: t('modules.msa-typ2.statusFail'),
      warn: t('modules.msa-typ2.statusWarn'),
    };

    const badgeLabel = {
      pass: t('modules.msa-typ2.capable'),
      fail: t('modules.msa-typ2.notCapable'),
      warn: t('modules.msa-typ2.condCapable'),
    };

    let html = '';

    // Status bar
    html += `<div class="msa-typ2__status-bar msa-typ2__status-bar--${r.grrStatus}">
      <span class="msa-typ2__status-label">${statusLabel[r.grrStatus]}</span>
      <span class="msa-typ2__status-detail">— ${r.p} ${t('modules.msa-typ2.parts')}, ${r.o} ${t('modules.msa-typ2.operators')}, ${r.r} ${t('modules.msa-typ2.replicates')} — n = ${r.n}</span>
    </div>`;

    // KPI strip (global dmike-kpi-strip)
    const kpiMod = { pass: 'dmike-kpi--good', warn: 'dmike-kpi--warn', fail: 'dmike-kpi--bad' };
    const vc = r.varComp;

    html += `<div class="dmike-kpi-strip">
      <div class="dmike-kpi ${kpiMod[r.grrStatus] || ''}">
        <div class="dmike-kpi-label">%GRR (${t('modules.msa-typ2.studyVar')}) <button class="msa-typ2__algo-link" data-algo-id="${ALGO_LAB_ID_GRR}" title="Algorithm Lab">${ALGO_LINK_SVG}</button></div>
        <div class="dmike-kpi-value">${fmt(vc.grr.pctStudyVar)} %</div>
        <div class="dmike-kpi-sub">${t('modules.msa-typ2.threshold')}: &lt; 10 % · ${badgeLabel[r.grrStatus]}</div>
      </div>
      <div class="dmike-kpi ${kpiMod[r.ndcStatus] || ''}">
        <div class="dmike-kpi-label">ndc</div>
        <div class="dmike-kpi-value">${r.ndc}</div>
        <div class="dmike-kpi-sub">${t('modules.msa-typ2.threshold')}: ≥ 5 · ${r.ndcStatus === 'pass' ? badgeLabel.pass : badgeLabel.fail}</div>
      </div>
      <div class="dmike-kpi">
        <div class="dmike-kpi-label">%EV (${t('modules.msa-typ2.repeatability')})</div>
        <div class="dmike-kpi-value">${fmt(vc.repeatability.pctStudyVar)} %</div>
        <div class="dmike-kpi-sub">${t('modules.msa-typ2.ofStudyVar')}</div>
      </div>
      <div class="dmike-kpi">
        <div class="dmike-kpi-label">%AV (${t('modules.msa-typ2.reproducibility')})</div>
        <div class="dmike-kpi-value">${fmt(vc.reproducibility.pctStudyVar)} %</div>
        <div class="dmike-kpi-sub">${t('modules.msa-typ2.ofStudyVar')}</div>
      </div>
    </div>`;

    // ANOVA table
    html += this._renderAnovaTable(r);

    // Variance components table
    html += this._renderVarianceTable(r);

    // Charts
    html += `<div class="dmike-split__output-section">${t('modules.msa-typ2.chartComponentsTitle')}</div>
    <div class="msa-typ2__chart-plot" data-ref="chart-components"></div>`;

    html += `<div class="dmike-split__output-section">${t('modules.msa-typ2.chartByPartTitle')}</div>
    <div class="msa-typ2__chart-plot" data-ref="chart-by-part"></div>`;

    html += `<div class="dmike-split__output-section">${t('modules.msa-typ2.chartByOperatorTitle')}</div>
    <div class="msa-typ2__chart-plot" data-ref="chart-by-operator"></div>`;

    html += `<div class="dmike-split__output-section">${t('modules.msa-typ2.chartInteractionTitle')}</div>
    <div class="msa-typ2__chart-plot" data-ref="chart-interaction"></div>`;

    html += `<div class="dmike-split__output-section">${t('modules.msa-typ2.chartXbarTitle')}</div>
    <div class="msa-typ2__chart-plot" data-ref="chart-xbar"></div>`;

    html += `<div class="dmike-split__output-section">${t('modules.msa-typ2.chartRTitle')}</div>
    <div class="msa-typ2__chart-plot" data-ref="chart-r"></div>`;

    // Interpretation
    html += `<div class="dmike-split__output-section">${t('modules.msa-typ2.interpretTitle')}</div>
    <div class="msa-typ2__interpretation">
      <p><span class="msa-typ2__tag msa-typ2__tag--pass">%GRR &lt; 10 %</span> ${t('modules.msa-typ2.interpPass')}</p>
      <p><span class="msa-typ2__tag msa-typ2__tag--warn">10 % ≤ %GRR &lt; 30 %</span> ${t('modules.msa-typ2.interpWarn')}</p>
      <p><span class="msa-typ2__tag msa-typ2__tag--fail">%GRR ≥ 30 %</span> ${t('modules.msa-typ2.interpFail')}</p>
      <p><span class="msa-typ2__tag msa-typ2__tag--pass">ndc ≥ 5</span> ${t('modules.msa-typ2.interpNdcPass')}</p>
      <p><span class="msa-typ2__tag msa-typ2__tag--fail">ndc &lt; 5</span> ${t('modules.msa-typ2.interpNdcFail')}</p>
      ${r.interactionPooled ? `<p class="msa-typ2__note">${t('modules.msa-typ2.interactionPooledNote')}</p>` : ''}
    </div>`;

    resultsEl.innerHTML = html;

    // Algorithm Lab link icons
    resultsEl.querySelectorAll('.msa-typ2__algo-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        const algoId = link.dataset.algoId;
        if (algoId && this._context.eventBus) {
          this._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
        }
      });
    });

    await this._renderCharts(r, gen);
  },

  _renderAnovaTable(r) {
    const t = this._t;
    const a = r.anova;
    let html = `<div class="dmike-split__output-section">${t('modules.msa-typ2.anovaTitle')}</div>
    <div class="msa-typ2__stats-panel">
      <table class="msa-typ2__anova-table">
        <thead><tr>
          <th>${t('modules.msa-typ2.anovaSource')}</th>
          <th>SS</th><th>df</th><th>MS</th><th>F</th><th>p</th>
        </tr></thead><tbody>`;

    html += `<tr>
      <td>${t('modules.msa-typ2.sourcePart')}</td>
      <td>${fmt(a.part.ss)}</td><td>${a.part.df}</td><td>${fmt(a.part.ms)}</td>
      <td>${fmt(a.part.f)}</td><td>${this._fmtP(a.part.pValue)}</td>
    </tr>`;

    html += `<tr>
      <td>${t('modules.msa-typ2.sourceOperator')}</td>
      <td>${fmt(a.operator.ss)}</td><td>${a.operator.df}</td><td>${fmt(a.operator.ms)}</td>
      <td>${fmt(a.operator.f)}</td><td>${this._fmtP(a.operator.pValue)}</td>
    </tr>`;

    if (a.interact) {
      html += `<tr>
        <td>${t('modules.msa-typ2.sourceInteract')}</td>
        <td>${fmt(a.interact.ss)}</td><td>${a.interact.df}</td><td>${fmt(a.interact.ms)}</td>
        <td>${fmt(a.interact.f)}</td><td>${this._fmtP(a.interact.pValue)}</td>
      </tr>`;
    }

    const equipLabel = r.interactionPooled
      ? t('modules.msa-typ2.sourceEquipPooled')
      : t('modules.msa-typ2.sourceEquip');
    html += `<tr>
      <td>${equipLabel}</td>
      <td>${fmt(a.equip.ss)}</td><td>${a.equip.df}</td><td>${fmt(a.equip.ms)}</td>
      <td>–</td><td>–</td>
    </tr>`;

    html += `<tr class="msa-typ2__anova-total">
      <td>${t('modules.msa-typ2.sourceTotal')}</td>
      <td>${fmt(a.total.ss)}</td><td>${a.total.df}</td>
      <td>–</td><td>–</td><td>–</td>
    </tr>`;

    html += `</tbody></table></div>`;
    return html;
  },

  _renderVarianceTable(r) {
    const t = this._t;
    const vc = r.varComp;
    const hasTol = vc.grr.pctTolerance != null;

    let html = `<div class="dmike-split__output-section">${t('modules.msa-typ2.varCompTitle')}</div>
    <div class="msa-typ2__stats-panel">
      <table class="msa-typ2__anova-table">
        <thead><tr>
          <th>${t('modules.msa-typ2.anovaSource')}</th>
          <th>σ²</th><th>σ</th>
          <th>${t('modules.msa-typ2.studyVarK')}</th>
          <th>%${t('modules.msa-typ2.contribution')}</th>
          <th>%${t('modules.msa-typ2.studyVar')}</th>
          ${hasTol ? `<th>%${t('modules.msa-typ2.tolerance')}</th>` : ''}
        </tr></thead><tbody>`;

    const rows = [
      ['grr', t('modules.msa-typ2.gageRR')],
      ['repeatability', `  ${t('modules.msa-typ2.repeatability')}`],
      ['reproducibility', `  ${t('modules.msa-typ2.reproducibility')}`],
      ['operator', `    ${t('modules.msa-typ2.sourceOperator')}`],
      ['interact', `    ${t('modules.msa-typ2.sourceInteract')}`],
      ['part', t('modules.msa-typ2.partToPartVar')],
      ['total', t('modules.msa-typ2.sourceTotal')],
    ];

    for (const [key, label] of rows) {
      const v = vc[key];
      const cls = key === 'total' ? ' class="msa-typ2__anova-total"' : '';
      html += `<tr${cls}>
        <td>${label}</td>
        <td>${fmt(v.variance)}</td>
        <td>${fmt(v.sigma)}</td>
        <td>${fmt(v.studyVar)}</td>
        <td>${fmt(v.pctContribution)}</td>
        <td>${fmt(v.pctStudyVar)}</td>
        ${hasTol ? `<td>${v.pctTolerance != null ? fmt(v.pctTolerance) : '–'}</td>` : ''}
      </tr>`;
    }

    html += `</tbody></table>
      <div class="msa-typ2__var-note">ndc = ${r.ndc}</div>
    </div>`;
    return html;
  },

  // ─── Charts ─────────────────────────────────────────────────

  async _renderCharts(r, gen) {
    await this._renderComponentsChart(r);
    if (gen !== this._renderGen) return;
    await this._renderByPartChart(r);
    if (gen !== this._renderGen) return;
    await this._renderByOperatorChart(r);
    if (gen !== this._renderGen) return;
    await this._renderInteractionChart(r);
    if (gen !== this._renderGen) return;
    await this._renderXbarChart(r);
    if (gen !== this._renderGen) return;
    await this._renderRChart(r);
  },

  _operatorColors(n) {
    const palette = [
      'var(--color-chart-1)', 'var(--color-chart-3)', 'var(--color-chart-5)',
      'var(--color-chart-2)', 'var(--color-chart-7)', 'var(--color-chart-4)',
    ];
    return Array.from({ length: n }, (_, i) => palette[i % palette.length]);
  },

  // ── Components Chart (grouped bar via chartManager) ─────────

  async _renderComponentsChart(r) {
    const el = this._container.querySelector('[data-ref="chart-components"]');
    if (!el) return;
    const t = this._t;
    const vc = r.varComp;
    const hasTol = vc.grr.pctTolerance != null;

    const categories = [
      t('modules.msa-typ2.gageRR'),
      t('modules.msa-typ2.repeatability'),
      t('modules.msa-typ2.reproducibility'),
      t('modules.msa-typ2.partToPartVar'),
    ];
    const keys = ['grr', 'repeatability', 'reproducibility', 'part'];

    const groups = [
      { name: '%' + t('modules.msa-typ2.contribution'), values: keys.map(k => vc[k].pctContribution), color: 'var(--color-chart-1)' },
      { name: '%' + t('modules.msa-typ2.studyVar'), values: keys.map(k => vc[k].pctStudyVar), color: 'var(--color-chart-2)' },
    ];
    if (hasTol) {
      groups.push({ name: '%' + t('modules.msa-typ2.tolerance'), values: keys.map(k => vc[k].pctTolerance), color: 'var(--color-chart-3)' });
    }

    const chart = await this._context.chartManager.create(el, 'bar', {
      categories,
      groups,
      yLabel: '%',
      yMin: 0,
      showLegend: true,
    });
    this._charts.push(chart);
  },

  // ── By-Part Chart (scatter via chartManager) ───────────────

  async _renderByPartChart(r) {
    const el = this._container.querySelector('[data-ref="chart-by-part"]');
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
      return {
        name: op, color: opColors[oi],
        x, y,
        symbol: 'circle', strokeWidth: 1.5,
      };
    });

    // Part means series (dotted line + markers)
    series.push({
      name: 'x̄ Part',
      color: 'var(--color-text-secondary)',
      x: r.partLabels.map((_, i) => i),
      y: r.partLabels.map(pl => r.partMeans[pl]),
      symbol: 'diamond', strokeWidth: 1,
      connectLine: { show: true, width: 1.5, dash: 'dot', color: 'var(--color-text-secondary)' },
    });

    const chart = await this._context.chartManager.create(el, 'scatter', {
      showLegend: true,
      xLabel: this._t('modules.msa-typ2.partLabel'),
      xMin: -0.5,
      xMax: r.partLabels.length - 0.5,
      series,
      refLines: [
        { dir: 'h', value: r.grandMean, label: 'x̄', dash: 'dash', color: 'var(--color-info)' },
      ],
    });
    this._charts.push(chart);
  },

  // ── By-Operator Chart (boxplot via chartManager) ────────────

  async _renderByOperatorChart(r) {
    const el = this._container.querySelector('[data-ref="chart-by-operator"]');
    if (!el) return;
    const opColors = this._operatorColors(r.o);

    const groups = r.operatorLabels.map((op) => {
      const vals = [];
      for (const pl of r.partLabels) vals.push(...r.cellData[pl][op]);
      return { name: op, values: vals };
    });

    const chart = await this._context.chartManager.create(el, 'boxplot', {
      groups,
      boxColors: opColors,
      showMean: true,
      showOutliers: true,
      showLegend: false,
      xLabel: this._t('modules.msa-typ2.operatorLabel'),
      refLines: [
        { dir: 'v', value: r.grandMean, label: 'x̄', dash: 'dash', color: 'var(--color-info)' },
      ],
    });
    this._charts.push(chart);
  },

  // ── Interaction Chart (scatter via chartManager) ───────────

  async _renderInteractionChart(r) {
    const el = this._container.querySelector('[data-ref="chart-interaction"]');
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

    const chart = await this._context.chartManager.create(el, 'scatter', {
      showLegend: true,
      xLabel: this._t('modules.msa-typ2.partLabel'),
      xMin: -0.5,
      xMax: r.partLabels.length - 0.5,
      series,
    });
    this._charts.push(chart);
  },

  // ── X-bar Chart (scatter via chartManager) ─────────────────

  async _renderXbarChart(r) {
    const el = this._container.querySelector('[data-ref="chart-xbar"]');
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

    const chart = await this._context.chartManager.create(el, 'scatter', {
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
    this._charts.push(chart);
  },

  // ── R Chart (scatter via chartManager) ─────────────────────

  async _renderRChart(r) {
    const el = this._container.querySelector('[data-ref="chart-r"]');
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

    const chart = await this._context.chartManager.create(el, 'scatter', {
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
    this._charts.push(chart);
  },

  _destroyCharts() {
    const cm = this._context?.chartManager;
    for (const chart of this._charts) {
      try { if (cm) cm.destroy(chart); } catch { /* ignore */ }
    }
    this._charts = [];
  },

  // ─── Helpers ────────────────────────────────────────────────

  _readInputs() {
    const c = this._container;
    if (!c) return;
    const v = (ref) => c.querySelector(`[data-ref="${ref}"]`)?.value ?? '';
    this._params.lsl = this._parseNum(v('inp-lsl'));
    this._params.usl = this._parseNum(v('inp-usl'));
    this._params.alpha = this._parseNum(v('inp-alpha')) || this._params.alpha;
    this._params.studyVarMultiplier = parseFloat(v('inp-k'));
  },

  _parseNum(s) {
    if (s == null || s === '') return NaN;
    return parseFloat(String(s).replace(',', '.').trim());
  },

  _showError(msg) {
    const el = this._container.querySelector('[data-ref="error-box"]');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => this._hideError(), 6000);
  },

  _hideError() {
    const el = this._container?.querySelector('[data-ref="error-box"]');
    if (el) el.classList.remove('visible');
  },

  _save() {
    this._readInputs();
    if (this._context?.stateManager && this._context?.instanceId) {
      this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
    }
  },

  _notify(msg, type) {
    if (this._context?.notify) this._context.notify(msg, type);
  },

  _esc(s) {
    if (!s) return '';
    const el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  },

  _debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  },

  _fmtP(p) {
    if (p == null || isNaN(p)) return '–';
    if (p < 0.001) return '< 0.001';
    return p.toFixed(3);
  },

};
