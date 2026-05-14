/**
 * D.Mike — Distribution Fit Module (distribution-fit.js)
 * Analyze phase: fits data to multiple distributions and ranks by GOF test.
 *
 * Data source: column from a Worksheet module (referenced by column ID).
 */

import { runDistributionFit, descriptiveStats, DIST_COLORS } from '../../engines/distribution-fit-engine.js';
import { ColumnPicker, getColumnValues } from '../../ui/column-picker.js';
import { esc } from '../../core/html-utils.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

/** Mapping: test name → Algorithm Lab ID (only for validated algorithms). */
const ALGO_LAB_IDS = {
  'Shapiro-Wilk': 'shapiro-wilk',
  'Anderson-Darling': 'anderson-darling',
  'Jarque-Bera': 'jarque-bera',
  "D'Agostino-Pearson": 'dagostino-pearson',
};

/** Small code icon SVG for Algorithm Lab links. */
const ALGO_LINK_SVG = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

/** @param {number} v @param {number} d */
function fmt(v, d = 4) {
  if (v == null || !isFinite(v)) return '\u2013';
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(d);
  return v.toFixed(d);
}

export default {
  id: 'distribution-fit',
  phase: 'analyze',
  icon: 'bar-chart-2',
  i18nKey: 'modules.distribution-fit',
  version: '1.0.0',

  _container: null,
  _context: null,
  /** @type {{ instanceId: string, sheetId: string, columnId: string }|null} */
  _columnRef: null,
  _dataType: 'auto',
  _result: null,
  _picker: null,
  _charts: [],
  /** Worksheet provisioned by loadExample (cleaned up on next load). */
  _exampleWorksheetId: null,

  help: () => import('./distribution-fit-help.js'),

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._columnRef = saved.columnRef || null;
      this._dataType = saved.dataType || 'auto';
      if (saved.exampleWorksheetId !== undefined) this._exampleWorksheetId = saved.exampleWorksheetId;
    }

    this._render();
    this._autoRun();
  },

  async destroy() {
    this._picker?.destroy();
    this._picker = null;
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
      this._renderResults(this._result);
    }
  },

  getState() {
    return {
      columnRef: this._columnRef,
      dataType: this._dataType,
      exampleWorksheetId: this._exampleWorksheetId,
    };
  },

  setState(data) {
    if (data?.columnRef) this._columnRef = data.columnRef;
    if (data?.dataType) this._dataType = data.dataType;
    if (data?.exampleWorksheetId !== undefined) this._exampleWorksheetId = data.exampleWorksheetId;
    if (this._container) {
      this._render();
      this._autoRun();
    }
  },

  /**
   * Load a catalog example. Provisions the included worksheet and rewrites
   * the `__source__` placeholder in `columnRef`.
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!this._columnRef;
    if (hasContent && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    const data = { ...payload.data };

    if (data.sourceWorksheetData) {
      const wsState = data.sourceWorksheetData;
      delete data.sourceWorksheetData;
      if (this._exampleWorksheetId) {
        removeProvisionedWorksheet(this._context, this._exampleWorksheetId);
        this._exampleWorksheetId = null;
      }
      const ref = provisionWorksheet(this._context, wsState);
      if (ref) {
        this._exampleWorksheetId = ref.instanceId;
        data.exampleWorksheetId = ref.instanceId;
        if (data.columnRef?.instanceId === '__source__') {
          data.columnRef = { ...data.columnRef, instanceId: ref.instanceId };
        }
      }
    }

    this.setState(data);
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  // ─── Column Values ──────────────────────────────────────────

  _getColumnValues() {
    if (!this._columnRef) return [];
    const raw = getColumnValues(this._context.stateManager, this._columnRef);
    return raw.filter(v => v != null && typeof v === 'number' && !isNaN(v));
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    this._picker?.destroy();
    this._picker = null;

    const t = (k, v) => this._context.i18n.t(`modules.distribution-fit.${k}`, v);

    this._container.innerHTML = `
      <div class="distfit dmike-split">
        <div class="distfit__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionData')}</div>

          <div class="field-group">
            <label>${t('columnSelectLabel')}</label>
            <div data-ref="col-picker-wrap"></div>
          </div>

          <div class="field-group">
            <label>${t('dataTypeLabel')}</label>
            <div class="btn-group distfit__toggle-row">
              <button class="btn--segment distfit__toggle-btn${this._dataType === 'auto' ? ' btn--active' : ''}" data-dtype="auto">${t('dataTypeAuto')}</button>
              <button class="btn--segment distfit__toggle-btn${this._dataType === 'continuous' ? ' btn--active' : ''}" data-dtype="continuous">${t('dataTypeCont')}</button>
              <button class="btn--segment distfit__toggle-btn${this._dataType === 'discrete' ? ' btn--active' : ''}" data-dtype="discrete">${t('dataTypeDisc')}</button>
            </div>
          </div>

          <div class="distfit__error" data-ref="error-box"></div>
        </div>

        <div class="distfit__output dmike-split__output">
          <div class="distfit__placeholder" data-ref="placeholder">
            <p>${t('placeholderText')}</p>
          </div>
          <div data-ref="results" style="display:none"></div>
        </div>
      </div>
    `;

    // Shared ColumnPicker
    const wrap = this._container.querySelector('[data-ref="col-picker-wrap"]');
    this._picker = new ColumnPicker(wrap, this._context, {
      mode: 'single',
      types: ['numeric'],
      minCount: 1,
      onChange: (ref) => {
        this._columnRef = ref;
        this._autoRun();
      },
    });
    if (this._columnRef) this._picker.value = this._columnRef;

    this._bindEvents();
  },

  _bindEvents() {
    const c = this._container;

    // Data type toggle
    c.querySelectorAll('.distfit__toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        c.querySelectorAll('.distfit__toggle-btn').forEach(b => b.classList.remove('btn--active'));
        btn.classList.add('btn--active');
        this._dataType = btn.dataset.dtype;
        this._autoRun();
      });
    });
  },

  // ─── Actions ────────────────────────────────────────────────

  _autoRun() {
    if (!this._columnRef) {
      // No column selected — show placeholder, hide results
      this._result = null;
      this._destroyCharts();
      const placeholder = this._container.querySelector('[data-ref="placeholder"]');
      const resultsEl = this._container.querySelector('[data-ref="results"]');
      if (placeholder) placeholder.style.display = '';
      if (resultsEl) resultsEl.style.display = 'none';
      const errBox = this._container.querySelector('[data-ref="error-box"]');
      if (errBox) { errBox.textContent = ''; errBox.style.display = 'none'; }
      this._save();
      return;
    }
    this._runAnalysis();
  },

  _runAnalysis() {
    const t = (k, v) => this._context.i18n.t(`modules.distribution-fit.${k}`, v);
    const errBox = this._container.querySelector('[data-ref="error-box"]');
    errBox.textContent = '';
    errBox.style.display = 'none';

    const values = this._getColumnValues();
    if (values.length < 5) {
      errBox.textContent = t('errMin5');
      errBox.style.display = 'block';
      return;
    }

    try {
      this._result = runDistributionFit(values, this._dataType);
      this._result._dataType = this._dataType;
      this._renderResults(this._result);
      this._save();
    } catch (err) {
      const key = err.message === 'zeroVariance' ? 'errZeroVariance' : 'errGeneric';
      errBox.textContent = t(key);
      errBox.style.display = 'block';
    }
  },

  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  // ─── Results Rendering ──────────────────────────────────────

  _renderResults(result) {
    const t = (k, v) => this._context.i18n.t(`modules.distribution-fit.${k}`, v);
    const placeholder = this._container.querySelector('[data-ref="placeholder"]');
    const resultsEl = this._container.querySelector('[data-ref="results"]');
    if (placeholder) placeholder.style.display = 'none';
    resultsEl.style.display = '';

    const { stats, results, normalityTests } = result;

    resultsEl.innerHTML = `
      <div class="dmike-split__output-section">${t('sectionDescriptive')}</div>
      <div class="dmike-kpi-strip">
        <div class="dmike-kpi"><div class="dmike-kpi-value">${stats.n}</div><div class="dmike-kpi-label">n</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(stats.mean)}</div><div class="dmike-kpi-label">${t('mean')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(stats.stdDev)}</div><div class="dmike-kpi-label">${t('stdDev')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(stats.median)}</div><div class="dmike-kpi-label">${t('median')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(stats.skewness)}</div><div class="dmike-kpi-label">${t('skewness')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(stats.kurtosis)}</div><div class="dmike-kpi-label">${t('kurtosisExcess')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(stats.min)}</div><div class="dmike-kpi-label">${t('min')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(stats.max)}</div><div class="dmike-kpi-label">${t('max')}</div></div>
      </div>

      <div class="dmike-split__output-section">${t('sectionHistogram')}</div>
      <div class="distfit__chart-wrap" data-ref="histogram"></div>

      <div class="dmike-split__output-section">${t('sectionRanking')}</div>
      ${this._buildRankingTable(results, t)}

      <div class="dmike-split__output-section">${t('sectionDetails')}</div>
      ${this._buildDistributionDetailTiles(results, t)}
      ${this._buildNormalityPanel(normalityTests, t)}
    `;

    this._renderHistogram(result);
    this._bindNormalityToggle();
  },

  _buildRankingTable(results, t) {
    let rows = '';
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const rank = i + 1;
      const isD = r.type === 'disc';
      const testName = isD ? '\u03c7\u00b2' : 'K-S';
      const statVal = isD ? fmt(r.chi2.chi2) : fmt(r.ks.D);
      const pV = r.score;
      const pS = pV < 0.0001 ? '0.0000' : fmt(pV);
      const q = pV >= 0.1 ? 'good' : pV >= 0.05 ? 'moderate' : 'poor';
      const qL = t('fit' + q.charAt(0).toUpperCase() + q.slice(1));
      const params = Object.entries(r.params).map(([k, v]) => `${k}=${typeof v === 'number' ? fmt(v) : v}`).join(', ');
      const typeTag = isD ? `<span class="distfit__tag distfit__tag--disc">${t('tagDisc')}</span>` : `<span class="distfit__tag distfit__tag--cont">${t('tagCont')}</span>`;
      const bestTag = i === 0 ? `<span class="distfit__tag distfit__tag--best">BEST FIT</span>` : '';
      const barWidth = Math.max(5, Math.min(100, pV * 500));

      rows += `<tr>
        <td><span class="distfit__rank distfit__rank--${rank <= 3 ? rank : 'other'}">${rank}</span></td>
        <td class="distfit__name-cell">${esc(r.name)} ${typeTag}${bestTag}</td>
        <td class="distfit__params-cell">${params}</td>
        <td>${testName}</td>
        <td>${statVal}</td>
        <td class="distfit__p-cell distfit__p-cell--${q}">${pS}</td>
        <td>
          <div class="distfit__fit-bar"><div class="distfit__fit-bar-inner distfit__fit-bar-inner--${q}" style="width:${barWidth}%"></div></div>
          <span class="distfit__fit-label">${qL}</span>
        </td>
      </tr>`;
    }

    return `<div class="distfit__table-wrap">
      <table class="dmike-table">
        <thead><tr>
          <th>#</th>
          <th>${t('colDist')}</th>
          <th>${t('colParams')}</th>
          <th>${t('colTest')}</th>
          <th>${t('colStat')}</th>
          <th>${t('colP')}</th>
          <th>${t('colFit')}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  },

  _buildDistributionDetailTiles(results, t) {
    if (!results || results.length === 0) return '';

    const tiles = results.map((r, i) => {
      const rank = i + 1;
      const isD = r.type === 'disc';
      const testName = isD ? '\u03c7\u00b2' : 'K-S';
      const statLabel = isD ? '\u03c7\u00b2' : 'D';
      const statVal = isD ? r.chi2.chi2 : r.ks.D;
      const pV = r.score;
      const pS = pV < 0.0001 ? '0.0000' : fmt(pV);
      const q = pV >= 0.1 ? 'good' : pV >= 0.05 ? 'moderate' : 'poor';
      const qL = t('fit' + q.charAt(0).toUpperCase() + q.slice(1));
      const interpKey = 'interp' + q.charAt(0).toUpperCase() + q.slice(1);
      const typeTag = isD
        ? `<span class="distfit__tag distfit__tag--disc">${t('tagDisc')}</span>`
        : `<span class="distfit__tag distfit__tag--cont">${t('tagCont')}</span>`;
      const bestTag = i === 0 ? `<span class="distfit__tag distfit__tag--best">BEST FIT</span>` : '';

      const paramRows = Object.entries(r.params).map(([k, v]) =>
        `<div class="distfit__ndd-row"><span>${esc(k)}</span><span>${typeof v === 'number' ? fmt(v) : v}</span></div>`
      ).join('');

      const dfRow = isD ? `<div class="distfit__ndd-row"><span>df</span><span>${r.chi2.df}</span></div>` : '';

      return `<div class="distfit__detail-tile">
        <h5>
          <span class="distfit__rank distfit__rank--${rank <= 3 ? rank : 'other'}">${rank}</span>
          ${esc(r.name)} ${typeTag}${bestTag}
          <span class="distfit__ndd-pill distfit__ndd-pill--${q === 'good' ? 'pass' : q === 'moderate' ? 'warn' : 'fail'}">${qL}</span>
        </h5>
        <div class="distfit__detail-section">
          <div class="distfit__detail-subtitle">${t('colParams')}</div>
          <div class="distfit__ndd-stats">${paramRows}</div>
        </div>
        <div class="distfit__detail-section">
          <div class="distfit__detail-subtitle">${t('detailGofTest')} (${testName})</div>
          <div class="distfit__ndd-stats">
            <div class="distfit__ndd-row"><span>${t('nddStatistic')} (${statLabel})</span><span>${fmt(statVal)}</span></div>
            ${dfRow}
            <div class="distfit__ndd-row"><span>p-${t('value')}</span><span class="distfit__p-cell--${q}">${pS}</span></div>
          </div>
        </div>
        <div class="distfit__interpret distfit__interpret--${q}">${t(interpKey)}</div>
      </div>`;
    }).join('');

    return `<div class="distfit__detail-grid">${tiles}</div>`;
  },

  _buildNormalityPanel(tests, t) {
    if (!tests || tests.length === 0) return '';

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
    const testCards = tests.map((tt, i) => {
      if (!tt) return '';
      let statL, stat, pVal, desc;
      if (tt.name === 'Shapiro-Wilk') { statL = 'W'; stat = tt.W; pVal = tt.p; desc = t('nddSWDesc'); }
      else if (tt.name === 'Anderson-Darling') { statL = 'A\u00b2'; stat = tt.A2; pVal = tt.p; desc = t('nddADDesc'); }
      else if (tt.name === 'Jarque-Bera') { statL = 'JB'; stat = tt.JB; pVal = tt.p; desc = t('nddJBDesc'); }
      else { statL = 'K\u00b2'; stat = tt.K2; pVal = tt.p; desc = t('nddDPDesc'); }

      if (tt.tooSmall) {
        const tooSmallKey = tt.name === 'Jarque-Bera' ? 'nddTooSmallJB' : tt.name === "D'Agostino-Pearson" ? 'nddTooSmallDP' : 'nddTooSmall';
        const algoLink1 = ALGO_LAB_IDS[tt.name] ? `<button class="distfit__ndd-algo-link" data-algo-id="${ALGO_LAB_IDS[tt.name]}" title="Algorithm Lab">${ALGO_LINK_SVG}</button>` : '';
        return `<div class="distfit__ndd-card"><h5><span class="distfit__ndd-num">${i + 1}/${numTests}</span>${tt.name}${algoLink1}</h5><div class="distfit__ndd-desc">${desc}</div><div class="distfit__interpret distfit__interpret--moderate">${t(tooSmallKey)}</div></div>`;
      }

      const q = pVal >= 0.1 ? 'pass' : pVal >= 0.05 ? 'warn' : 'fail';
      const qL = t('nddVerdict' + q.charAt(0).toUpperCase() + q.slice(1));
      const qI = q === 'pass' ? '\u2714' : q === 'warn' ? '\u26a0' : '\u2718';
      const pS = pVal < 0.0001 ? '0.0000' : fmt(pVal);

      return `<div class="distfit__ndd-card">
        <h5><span class="distfit__ndd-num">${i + 1}/${numTests}</span>${tt.name}${ALGO_LAB_IDS[tt.name] ? `<button class="distfit__ndd-algo-link" data-algo-id="${ALGO_LAB_IDS[tt.name]}" title="Algorithm Lab">${ALGO_LINK_SVG}</button>` : ''}<span class="distfit__ndd-pill distfit__ndd-pill--${q}">${qI} ${qL}</span></h5>
        <div class="distfit__ndd-desc">${desc}</div>
        <div class="distfit__ndd-stats">
          <div class="distfit__ndd-row"><span>${t('nddStatistic')} (${statL})</span><span>${fmt(stat)}</span></div>
          <div class="distfit__ndd-row"><span>p-${t('value')}</span><span class="distfit__p-cell--${q === 'pass' ? 'good' : q === 'warn' ? 'moderate' : 'poor'}">${pS}</span></div>
        </div>
      </div>`;
    }).join('');

    return `<div class="distfit__ndd">
      <div class="distfit__ndd-header">
        <h4>${t('nddTitle')}</h4>
        <button class="distfit__ndd-toggle" data-action="toggle-ndd">\u25b2</button>
      </div>
      <div class="distfit__ndd-body" data-ref="ndd-body">
        <div class="distfit__ndd-grid">${testCards}</div>
        <div class="distfit__ndd-consensus distfit__ndd-consensus--${cClass}">
          <h5>${cTitle}</h5>
          <div class="distfit__ndd-score">${valid.map(tt => `<span class="distfit__ndd-dot distfit__ndd-dot--${tt.p >= 0.1 ? 'good' : tt.p >= 0.05 ? 'moderate' : 'poor'}"></span>`).join('')}<span class="distfit__ndd-score-label">${pass}/${total}</span></div>
          <p>${cText}</p>
        </div>
      </div>
    </div>`;
  },

  _bindNormalityToggle() {
    const btn = this._container.querySelector('[data-action="toggle-ndd"]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const body = this._container.querySelector('[data-ref="ndd-body"]');
      if (!body) return;
      const isOpen = !body.classList.contains('distfit__ndd-body--collapsed');
      body.classList.toggle('distfit__ndd-body--collapsed');
      btn.textContent = isOpen ? '\u25bc' : '\u25b2';
    });

    // Algorithm Lab link icons
    this._container.querySelectorAll('.distfit__ndd-algo-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        const algoId = link.dataset.algoId;
        if (algoId && this._context.eventBus) {
          this._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
        }
      });
    });
  },

  // ─── Chart ──────────────────────────────────────────────────

  _destroyCharts() {
    for (const chart of this._charts) {
      try { this._context.chartManager.destroy(chart); } catch { /* ignore */ }
    }
    this._charts = [];
  },

  async _renderHistogram(result) {
    this._destroyCharts();

    const values = this._getColumnValues();

    if (values.length < 5) return;

    const t = (k) => this._context.i18n.t(`modules.distribution-fit.${k}`);
    const histEl = this._container.querySelector('[data-ref="histogram"]');
    if (!histEl) return;

    this._charts.push(await this._context.chartManager.create(histEl, 'histogram', {
      title: t('histogram'),
      data: values,
      binMethod: 'sturges',
      showNormalCurve: true,
      barColor: 'var(--color-chart-1)',
      normalCurveColor: 'var(--color-chart-2)',
      showLegend: false,
    }));
  },
};
