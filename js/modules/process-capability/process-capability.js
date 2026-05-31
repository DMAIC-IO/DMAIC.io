/**
 * D.Mike — Process Capability Module (process-capability.js)
 * Measure phase: Process Capability Analysis (Cp, Cpk, Pp, Ppk).
 * Supports two-sided (LSL + USL) and one-sided specifications.
 *
 * Data source: column from a Worksheet module (referenced by column ID).
 */

import { validate, analyze } from '../../engines/process-capability-engine.js';
import { isPickerFocused } from '../../ui/column-picker.js';

/** @param {number} v @param {number} d @returns {string} */
function fmt(v, d = 4) {
  if (v == null || isNaN(v)) return '\u2013';
  return v.toFixed(d);
}

export default {
  id: 'process-capability',
  phase: 'measure',
  icon: 'bar-chart',
  i18nKey: 'modules.process-capability',
  version: '1.0.0',

  _container: null,
  _context: null,
  _t: null,
  _result: null,
  /** @type {{ instanceId: string, sheetId: string, columnId: string }|null} */
  _columnRef: null,
  /** @type {number[]|null} values loaded directly from an example (bypasses worksheet) */
  _embeddedValues: null,
  /** @type {string} display label for embedded example data */
  _embeddedLabel: '',
  _params: { name: '', lsl: NaN, usl: NaN, target: NaN, unit: 'mm', confidence: null },
  _charts: [],
  _renderGen: 0,
  _eventUnsubs: [],

  help: () => import('./process-capability-help.js'),

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._t = (key, vars) => context.i18n.t(key, vars);

    if (!document.getElementById('process-capability-css')) {
      const link = document.createElement('link');
      link.id = 'process-capability-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/process-capability/process-capability.css';
      document.head.appendChild(link);
    }

    const onStateSaved = () => this._refreshColumnSelector();
    context.eventBus.on('state:saved', onStateSaved);
    context.eventBus.on('worksheet:dataChanged', onStateSaved);
    this._eventUnsubs.push(
      () => context.eventBus.off('state:saved', onStateSaved),
      () => context.eventBus.off('worksheet:dataChanged', onStateSaved),
    );

    const onModuleAdded = ({ moduleId }) => {
      if (moduleId === 'worksheet') this._refreshColumnSelector();
    };
    context.eventBus.on('module:added', onModuleAdded);
    this._eventUnsubs.push(() => context.eventBus.off('module:added', onModuleAdded));

    const onModuleRemoved = ({ moduleId }) => {
      if (moduleId === 'worksheet') this._refreshColumnSelector();
    };
    context.eventBus.on('module:removed', onModuleRemoved);
    this._eventUnsubs.push(() => context.eventBus.off('module:removed', onModuleRemoved));

    const onModuleActivated = ({ instanceId }) => {
      if (instanceId === context.instanceId) this._refreshColumnSelector();
    };
    context.eventBus.on('module:activated', onModuleActivated);
    this._eventUnsubs.push(() => context.eventBus.off('module:activated', onModuleActivated));

    this._params = { name: '', lsl: NaN, usl: NaN, target: NaN, unit: 'mm',
      confidence: (context.stateManager.get('settings.confidenceLevel') ?? 95) / 100 };
    this._columnRef = null;
    this._result = null;

    container.innerHTML = '';
    this._render();
  },

  async destroy() {
    for (const unsub of this._eventUnsubs) unsub();
    this._eventUnsubs = [];
    this._destroyCharts();
    this._container.innerHTML = '';
  },

  onLanguageChange() {
    this._render();
    if (this._result) {
      this._renderResults(this._result);
    }
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
      columnRef: this._columnRef ? { ...this._columnRef } : null,
      embeddedValues: this._embeddedValues ? [...this._embeddedValues] : null,
      embeddedLabel: this._embeddedLabel || '',
      lastResult: this._result,
    };
  },

  setState(data) {
    if (!data) return;
    if (data.params) this._params = { ...this._params, ...data.params };
    if (data.columnRef !== undefined) this._columnRef = data.columnRef ? { ...data.columnRef } : null;
    if (data.embeddedValues !== undefined) this._embeddedValues = Array.isArray(data.embeddedValues) ? [...data.embeddedValues] : null;
    if (data.embeddedLabel !== undefined) this._embeddedLabel = data.embeddedLabel || '';
    this._result = data.lastResult || null;
    this._render();
    if (this._result) {
      this._renderResults(this._result);
    }
    this._tryAutoAnalysis();
  },

  // ─── Example Data ───────────────────────────────────────────

  /**
   * Load a catalog example into the module. Activates "embedded data" mode:
   * values come directly from the example, bypassing the worksheet column
   * selector. Switching the column selector clears the embedded data.
   *
   * @param {{ meta: object, data: any }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = this._t;

    // Warn before overwriting existing data.
    const hasData = this._embeddedValues || this._columnRef;
    if (hasData && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    const col = payload.data.columns?.[0];
    if (!col || !Array.isArray(col.values)) {
      this._notify(t('moduleHelp.exampleLoadError'), 'error');
      return;
    }
    const values = col.values.filter(v => typeof v === 'number' && !isNaN(v));
    if (values.length === 0) {
      this._notify(t('moduleHelp.exampleLoadError'), 'error');
      return;
    }

    this._embeddedValues = values;
    const lang = this._context.i18n.getLanguage();
    this._embeddedLabel = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._columnRef = null;

    // Apply spec from meta if present.
    const spec = payload.meta?.spec || {};
    if (typeof spec.lsl    === 'number') this._params.lsl    = spec.lsl;
    if (typeof spec.usl    === 'number') this._params.usl    = spec.usl;
    if (typeof spec.target === 'number') this._params.target = spec.target;

    // Use feature name from meta and unit from first column.
    if (payload.meta?.title) this._params.name = this._embeddedLabel;
    if (col.unit) this._params.unit = col.unit;
    else if (payload.meta?.columns?.[0]?.unit) this._params.unit = payload.meta.columns[0].unit;

    this._render();
    this._tryAutoAnalysis();
    this._save();
    this._notify(t('moduleHelp.exampleLoaded', { title: this._embeddedLabel }), 'success');
  },

  _clearEmbedded() {
    this._embeddedValues = null;
    this._embeddedLabel = '';
  },

  // ─── Worksheet Column Discovery ─────────────────────────────

  _getWorksheetColumns() {
    const sm = this._context?.stateManager;
    if (!sm) return [];

    const columns = [];
    const allPhases = Object.keys(sm.get('phases') || {});
    for (const phase of allPhases) {
      const instances = sm.get(`phases.${phase}`) ?? [];
      for (const inst of instances) {
        if (inst.moduleId !== 'worksheet') continue;
        const ws = sm.getModuleState(inst.instanceId);
        if (!ws?.sheets) continue;
        for (const sheet of ws.sheets) {
          const state = sheet.state;
          if (!state?.columns) continue;
          for (const col of state.columns) {
            if (col.type !== 'numeric') continue;
            const nonNull = (col.values || []).filter(v => v != null).length;
            columns.push({
              instanceId: inst.instanceId,
              sheetId: sheet.id,
              sheetName: sheet.name,
              columnId: col.id,
              columnName: col.name || '',
              shortName: col.shortName || '?',
              valueCount: nonNull,
            });
          }
        }
      }
    }
    return columns;
  },

  _getColumnValues() {
    // Embedded example data takes precedence over any worksheet column.
    if (this._embeddedValues) {
      return this._embeddedValues.filter(v => typeof v === 'number' && !isNaN(v));
    }

    if (!this._columnRef) return [];
    const sm = this._context?.stateManager;
    if (!sm) return [];

    const ws = sm.getModuleState(this._columnRef.instanceId);
    if (!ws?.sheets) return [];

    const sheet = ws.sheets.find(s => s.id === this._columnRef.sheetId);
    if (!sheet?.state?.columns) return [];

    const col = sheet.state.columns.find(c => c.id === this._columnRef.columnId);
    if (!col) return [];

    return (col.values || []).filter(v => v != null && typeof v === 'number' && !isNaN(v));
  },

  _hasWorksheet() {
    const sm = this._context?.stateManager;
    if (!sm) return false;
    const allPhases = Object.keys(sm.get('phases') || {});
    for (const phase of allPhases) {
      const instances = sm.get(`phases.${phase}`) ?? [];
      if (instances.some(i => i.moduleId === 'worksheet')) return true;
    }
    return false;
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = this._t;
    const p = this._params;

    this._container.innerHTML = `
      <div class="module-process-capability dmike-split">
        <div class="module-process-capability__input dmike-split__input">
          <div class="dmike-split__section-title">${t('modules.process-capability.sectionParams')}</div>

          <div class="field-group">
            <label>${t('modules.process-capability.featureName')}</label>
            <input type="text" class="field" data-ref="inp-name" placeholder="${t('modules.process-capability.featureNamePh')}" value="${this._esc(p.name)}">
          </div>

          <div class="pc__row-3">
            <div class="field-group">
              <label>${t('modules.process-capability.lsl')}</label>
              <input type="text" class="field field--num" data-ref="inp-lsl" placeholder="49.800" inputmode="decimal" value="${isNaN(p.lsl) ? '' : p.lsl}">
            </div>
            <div class="field-group">
              <label>${t('modules.process-capability.target')}</label>
              <input type="text" class="field field--num" data-ref="inp-target" placeholder="50.000" inputmode="decimal" value="${isNaN(p.target) ? '' : p.target}">
            </div>
            <div class="field-group">
              <label>${t('modules.process-capability.usl')}</label>
              <input type="text" class="field field--num" data-ref="inp-usl" placeholder="50.200" inputmode="decimal" value="${isNaN(p.usl) ? '' : p.usl}">
            </div>
          </div>

          <div class="pc__hint">${t('modules.process-capability.specHint')}</div>

          <div class="pc__row">
            <div class="field-group">
              <label>${t('modules.process-capability.unit')}</label>
              <input type="text" class="field" data-ref="inp-unit" value="${this._esc(p.unit)}" placeholder="mm">
            </div>
            <div class="field-group">
              <label>${t('modules.process-capability.confidenceLabel')} (%)</label>
              <input type="text" class="field field--num" data-ref="inp-confidence" placeholder="95" inputmode="decimal" value="${isNaN(p.confidence) ? '95' : +(p.confidence * 100).toFixed(2)}">
            </div>
          </div>

          <div class="dmike-split__section-title">${t('modules.process-capability.sectionData')}</div>

          <div class="field-group">
            <label>${t('modules.process-capability.columnSelectLabel')}</label>
            <div class="pc__col-select-wrap" data-ref="col-select-wrap">
              ${this._buildColumnSelectorHTML()}
            </div>
          </div>

          <div class="pc__error" data-ref="error-box"></div>
        </div>

        <div class="module-process-capability__output dmike-split__output">
          <div data-ref="results"></div>
        </div>
      </div>
    `;

    this._bindEvents();
  },

  _buildColumnSelectorHTML() {
    const t = this._t;

    // Embedded example data — show a "remove" pill instead of the selector.
    if (this._embeddedValues) {
      const n = this._embeddedValues.length;
      const label = this._embeddedLabel || t('modules.process-capability.exampleData');
      return `<div class="pc__embedded">
        <span class="pc__embedded-label">${this._esc(label)} (n=${n})</span>
        <button class="btn btn--sm btn--ghost" data-ref="btn-clear-embedded" type="button" title="${t('common.remove')}">✕</button>
      </div>`;
    }

    const hasWs = this._hasWorksheet();

    if (!hasWs) {
      return `<div class="pc__no-worksheet">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>${t('modules.process-capability.noWorksheet')}</span>
      </div>`;
    }

    const columns = this._getWorksheetColumns();

    if (columns.length === 0) {
      return `<div class="pc__no-worksheet pc__no-worksheet--empty">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>${t('modules.process-capability.noNumericColumns')}</span>
      </div>`;
    }

    let options = `<option value="">${t('modules.process-capability.selectColumn')}</option>`;
    let currentGroup = '';
    for (const col of columns) {
      const groupLabel = col.sheetName;
      if (groupLabel !== currentGroup) {
        if (currentGroup) options += '</optgroup>';
        options += `<optgroup label="${this._esc(groupLabel)}">`;
        currentGroup = groupLabel;
      }
      const refKey = `${col.instanceId}|${col.sheetId}|${col.columnId}`;
      const selected = this._columnRef
        && this._columnRef.instanceId === col.instanceId
        && this._columnRef.sheetId === col.sheetId
        && this._columnRef.columnId === col.columnId
        ? ' selected' : '';
      const displayName = col.columnName
        ? `${col.shortName} \u2013 ${col.columnName}`
        : col.shortName;
      options += `<option value="${refKey}"${selected}>${displayName} (n=${col.valueCount})</option>`;
    }
    if (currentGroup) options += '</optgroup>';

    return `<select data-ref="inp-column" class="pc__col-select">${options}</select>`;
  },

  _refreshColumnSelector() {
    if (isPickerFocused(this._container)) return;

    const wrap = this._container?.querySelector('[data-ref="col-select-wrap"]');
    if (!wrap) return;
    wrap.innerHTML = this._buildColumnSelectorHTML();
    this._bindColumnSelector();
    this._tryAutoAnalysis();
  },

  _bindEvents() {
    const c = this._container;

    this._bindColumnSelector();

    // Auto-save and auto-analyze on input change
    const autoRun = this._debounce(() => { this._save(); this._tryAutoAnalysis(); }, 600);
    c.querySelectorAll('input, select:not([data-ref="inp-column"])').forEach(el => {
      el.addEventListener('input', autoRun);
      el.addEventListener('change', autoRun);
    });
  },

  _bindColumnSelector() {
    const c = this._container;
    const colSelect = c.querySelector('[data-ref="inp-column"]');
    if (colSelect) {
      colSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) {
          this._columnRef = null;
        } else {
          const [instanceId, sheetId, columnId] = val.split('|');
          this._columnRef = { instanceId, sheetId, columnId };
          // Picking a worksheet column clears any embedded example data.
          this._clearEmbedded();
        }
        this._refreshColumnSelector();
        this._save();
        this._tryAutoAnalysis();
      });
    }

    const clearBtn = c.querySelector('[data-ref="btn-clear-embedded"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this._clearEmbedded();
        this._refreshColumnSelector();
        this._save();
        this._tryAutoAnalysis();
      });
    }
  },

  // ─── Actions ────────────────────────────────────────────────

  /**
   * Automatically run analysis if all required inputs are present and valid.
   * Silently clears results when data is incomplete.
   */
  _tryAutoAnalysis() {
    this._readInputs();

    // Data must come from either an embedded example or a worksheet column.
    if (!this._columnRef && !this._embeddedValues) return this._clearResults();

    const values = this._getColumnValues();
    if (values.length === 0) return this._clearResults();

    const p = this._params;
    const lsl = this._parseNum(p.lsl);
    const usl = this._parseNum(p.usl);
    const target = this._parseNum(p.target);

    const confidence = this._params.confidence || 0.95;
    const params = {
      lsl: isNaN(lsl) ? null : lsl,
      usl: isNaN(usl) ? null : usl,
      target: isNaN(target) ? null : target,
      confidence,
    };

    const validation = validate(params, values);
    if (!validation.valid) return this._clearResults();

    this._hideError();

    const result = analyze(params, values);
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

  // ─── Render Results ─────────────────────────────────────────

  async _renderResults(r) {
    this._destroyCharts();
    const gen = ++this._renderGen;

    const t = this._t;
    const unit = this._params.unit || '';
    const name = this._params.name || '\u2013';

    const resultsEl = this._container.querySelector('[data-ref="results"]');
    if (!resultsEl) return;

    const statusLabel = {
      pass: t('modules.process-capability.statusPass'),
      fail: t('modules.process-capability.statusFail'),
      warn: t('modules.process-capability.statusWarn'),
    };

    const badgeLabel = {
      pass: t('modules.process-capability.capable'),
      fail: t('modules.process-capability.notCapable'),
      warn: t('modules.process-capability.condCapable'),
    };

    const kpiMod = { pass: 'dmike-kpi--good', warn: 'dmike-kpi--warn', fail: 'dmike-kpi--bad' };

    const ciPct = Math.round(r.confidence * 100);
    const ciLabel = (ci) => ci ? `${t('modules.process-capability.ci')} ${ciPct}%: [${fmt(ci[0])}; ${fmt(ci[1])}]` : '';

    let html = '';

    // Status bar
    html += `<div class="pc__status-bar pc__status-bar--${r.overall}">
      <span class="pc__status-label">${statusLabel[r.overall]}</span>
      <span class="pc__status-detail">\u2014 ${this._esc(name)} \u2014 n = ${r.n}</span>
    </div>`;

    // KPI strip — main indices
    html += `<div class="dmike-kpi-strip">`;

    if (r.Cp != null) {
      const cpSt = r.cpStatus;
      html += `<div class="dmike-kpi ${kpiMod[cpSt] || ''}">
        <div class="dmike-kpi-label">Cp (${t('modules.process-capability.potential')})</div>
        <div class="dmike-kpi-value">${fmt(r.Cp)}</div>
        <div class="dmike-kpi-sub">${t('modules.process-capability.threshold')}: \u2265 1.33 \u00B7 ${badgeLabel[cpSt]}${r.CpCI ? ` \u00B7 ${ciLabel(r.CpCI)}` : ''}</div>
      </div>`;
    }

    html += `<div class="dmike-kpi ${kpiMod[r.cpkStatus] || ''}">
      <div class="dmike-kpi-label">Cpk (${t('modules.process-capability.actual')})</div>
      <div class="dmike-kpi-value">${fmt(r.Cpk)}</div>
      <div class="dmike-kpi-sub">${t('modules.process-capability.threshold')}: \u2265 1.33 \u00B7 ${badgeLabel[r.cpkStatus]}${r.CpkCI ? ` \u00B7 ${ciLabel(r.CpkCI)}` : ''}</div>
    </div>`;

    if (r.CPL != null) {
      html += `<div class="dmike-kpi">
        <div class="dmike-kpi-label">CPL (${t('modules.process-capability.lower')})</div>
        <div class="dmike-kpi-value">${fmt(r.CPL)}</div>
        <div class="dmike-kpi-sub">(x\u0304 \u2212 LSL) / 3s</div>
      </div>`;
    }

    if (r.CPU != null) {
      html += `<div class="dmike-kpi">
        <div class="dmike-kpi-label">CPU (${t('modules.process-capability.upper')})</div>
        <div class="dmike-kpi-value">${fmt(r.CPU)}</div>
        <div class="dmike-kpi-sub">(USL \u2212 x\u0304) / 3s</div>
      </div>`;
    }

    html += `</div>`;

    // Long-term (Pp/Ppk) + PPM + Sigma strip
    html += `<div class="dmike-kpi-strip">`;
    if (r.Pp != null) {
      html += `<div class="dmike-kpi">
        <div class="dmike-kpi-label">Pp (${t('modules.process-capability.overallPotential')})</div>
        <div class="dmike-kpi-value">${fmt(r.Pp)}</div>
        <div class="dmike-kpi-sub">${t('modules.process-capability.longTerm')}${r.PpCI ? ` \u00B7 ${ciLabel(r.PpCI)}` : ''}</div>
      </div>`;
    }
    if (r.Ppk != null) {
      html += `<div class="dmike-kpi">
        <div class="dmike-kpi-label">Ppk (${t('modules.process-capability.overallActual')})</div>
        <div class="dmike-kpi-value">${fmt(r.Ppk)}</div>
        <div class="dmike-kpi-sub">${t('modules.process-capability.longTerm')}${r.PpkCI ? ` \u00B7 ${ciLabel(r.PpkCI)}` : ''}</div>
      </div>`;
    }

    html += `<div class="dmike-kpi">
      <div class="dmike-kpi-label">PPM (${t('modules.process-capability.defective')})</div>
      <div class="dmike-kpi-value">${fmt(r.ppmTotal)}</div>
      <div class="dmike-kpi-sub">${t('modules.process-capability.perMillion')}</div>
    </div>`;

    html += `<div class="dmike-kpi">
      <div class="dmike-kpi-label">${t('modules.process-capability.sigmaLevel')}</div>
      <div class="dmike-kpi-value">${fmt(r.sigmaLevel)}\u03C3</div>
      <div class="dmike-kpi-sub">Z = 3 \u00B7 Cpk</div>
    </div>`;

    html += `</div>`;

    // Stats panel
    const statCols = [
      { label: t('modules.process-capability.statN'), value: r.n },
      { label: t('modules.process-capability.statMean'), value: `${fmt(r.xbar)} ${unit}` },
      { label: t('modules.process-capability.statStddevS'), value: `${fmt(r.s)} ${unit}` },
      { label: t('modules.process-capability.statStddevSigma'), value: `${fmt(r.sigma)} ${unit}` },
      { label: t('modules.process-capability.statMin'), value: `${fmt(r.xmin)} ${unit}` },
      { label: t('modules.process-capability.statMax'), value: `${fmt(r.xmax)} ${unit}` },
      r.hasLsl ? { label: 'LSL', value: `${fmt(r.lsl)} ${unit}` } : null,
      r.hasUsl ? { label: 'USL', value: `${fmt(r.usl)} ${unit}` } : null,
      r.T != null ? { label: t('modules.process-capability.statTol'), value: `${fmt(r.T)} ${unit}` } : null,
      r.targetVal != null ? { label: t('modules.process-capability.statTarget'), value: `${fmt(r.targetVal)} ${unit}` } : null,
      r.ppmBelowLsl != null ? { label: 'PPM < LSL', value: fmt(r.ppmBelowLsl) } : null,
      r.ppmAboveUsl != null ? { label: 'PPM > USL', value: fmt(r.ppmAboveUsl) } : null,
    ].filter(Boolean);
    html += `<div class="dmike-split__output-section">${t('modules.process-capability.statsTitle')}</div>
    <div class="pc__stats-panel">
      <table class="dmike-table pc__stats-table">
        <thead><tr>${statCols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
        <tbody><tr>${statCols.map(c => `<td>${c.value}</td>`).join('')}</tr></tbody>
      </table>
    </div>`;

    // Chart
    html += `<div class="dmike-split__output-section">${t('modules.process-capability.histTitle')}</div>
    <div class="pc__chart-plot" data-ref="chart-hist"></div>`;

    // Interpretation
    html += `<div class="dmike-split__output-section">${t('modules.process-capability.formulasTitle')}</div>
    <div class="pc__interpretation">`;

    if (r.twoSided) {
      html += `<p><strong>Cp</strong> = (USL \u2212 LSL) / (6 \u00B7 s) = ${fmt(r.T)} / (6 \u00B7 ${fmt(r.s)}) = <strong>${fmt(r.Cp)}</strong></p>`;
      html += `<p><strong>Cpk</strong> = min(CPU, CPL) = min(${fmt(r.CPU)}, ${fmt(r.CPL)}) = <strong>${fmt(r.Cpk)}</strong></p>`;
    } else if (r.hasUsl) {
      html += `<p><strong>CPU</strong> = (USL \u2212 x\u0304) / (3 \u00B7 s) = (${fmt(r.usl)} \u2212 ${fmt(r.xbar)}) / (3 \u00B7 ${fmt(r.s)}) = <strong>${fmt(r.CPU)}</strong></p>`;
    } else {
      html += `<p><strong>CPL</strong> = (x\u0304 \u2212 LSL) / (3 \u00B7 s) = (${fmt(r.xbar)} \u2212 ${fmt(r.lsl)}) / (3 \u00B7 ${fmt(r.s)}) = <strong>${fmt(r.CPL)}</strong></p>`;
    }

    html += `<div style="height:12px"></div>
      <p><span class="pc__tag pc__tag--pass">Cpk \u2265 1.33</span> ${t('modules.process-capability.interpPass')}</p>
      <p><span class="pc__tag pc__tag--warn">1.00 \u2264 Cpk &lt; 1.33</span> ${t('modules.process-capability.interpWarn')}</p>
      <p><span class="pc__tag pc__tag--fail">Cpk &lt; 1.00</span> ${t('modules.process-capability.interpFail')}</p>
    </div>`;

    resultsEl.innerHTML = html;
    await this._renderCharts(r, gen);
  },

  // ─── SVG Charts ────────────────────────────────────────────

  async _renderCharts(r, gen) {
    await this._renderHistogram(r);
  },

  async _renderHistogram(r) {
    const el = this._container.querySelector('[data-ref="chart-hist"]');
    if (!el) return;

    const values = this._getColumnValues();
    if (values.length === 0) return;

    const refLines = [];
    if (r.hasLsl)            refLines.push({ dir: 'v', value: r.lsl,       label: 'LSL',    color: 'var(--color-error)',   dash: 'dash', width: 1.5, showLabel: true });
    if (r.hasUsl)            refLines.push({ dir: 'v', value: r.usl,       label: 'USL',    color: 'var(--color-error)',   dash: 'dash', width: 1.5, showLabel: true });
    if (r.targetVal != null) refLines.push({ dir: 'v', value: r.targetVal, label: 'Target', color: 'var(--color-success)', dash: 'dash', width: 1.5, showLabel: true });

    const chart = await this._context.chartManager.create(el, 'histogram', {
      data: values,
      binMethod: 'sturges',
      showNormalCurve: true,
      barColor: 'var(--color-accent)',
      normalCurveColor: 'var(--color-info)',
      showLegend: true,
      refLines,
    });
    this._charts.push(chart);
  },

  _destroyCharts() {
    if (this._charts) {
      for (const c of this._charts) {
        this._context.chartManager.destroy(c);
      }
    }
    this._charts = [];
  },

  // ─── Helpers ────────────────────────────────────────────────

  _readInputs() {
    const c = this._container;
    if (!c) return;
    const q = (ref) => c.querySelector(`[data-ref="${ref}"]`);
    const v = (ref) => q(ref)?.value ?? '';

    this._params.name = v('inp-name');
    this._params.lsl = this._parseNum(v('inp-lsl'));
    this._params.usl = this._parseNum(v('inp-usl'));
    this._params.target = this._parseNum(v('inp-target'));
    this._params.unit = v('inp-unit') || 'mm';
    const rawConf = this._parseNum(v('inp-confidence'));
    // Input is in percent (e.g. 95), clamp to valid range
    if (!isNaN(rawConf) && rawConf > 0) {
      const pct = Math.max(50, Math.min(99.99, rawConf));
      this._params.confidence = pct / 100;
    } else {
      this._params.confidence = (this._context.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
    }
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
    if (this._context?.notify) {
      this._context.notify(msg, type);
    }
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
};
