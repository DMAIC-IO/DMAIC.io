/**
 * D.Mike — FMEA Module (fmea.js)
 * Failure Mode and Effects Analysis with RPN calculation,
 * projected RPN via action deltas, and CSV export.
 * DMAIC phase: Analyze
 */

import { esc } from '../../core/html-utils.js';

function generateId() {
  return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function rpnBadgeClass(v) {
  if (!v) return 'fmea__rpn-badge--none';
  if (v > 200) return 'fmea__rpn-badge--critical';
  if (v >= 125) return 'fmea__rpn-badge--high';
  if (v >= 50) return 'fmea__rpn-badge--medium';
  return 'fmea__rpn-badge--low';
}

function cardGlowClass(v) {
  if (!v) return '';
  if (v > 200) return 'fmea__risk-card--critical';
  if (v >= 125) return 'fmea__risk-card--high';
  if (v >= 50) return 'fmea__risk-card--medium';
  return 'fmea__risk-card--low';
}

/** Map value 1–10 to scale row index (0–4) */
function scaleRow(v) {
  if (v <= 1) return 0;
  if (v <= 3) return 1;
  if (v <= 6) return 2;
  if (v <= 8) return 3;
  return 4;
}

/**
 * Build <option> elements for a S/O/D select with title tooltips.
 * @param {Array<string>} labels — 5 tooltip strings for rows 0–4
 */
function makeSODOptions(labels) {
  let h = `<option value="">—</option>`;
  for (let i = 1; i <= 10; i++) {
    const tip = labels[scaleRow(i)];
    h += `<option value="${i}" title="${esc(tip)}">${i}</option>`;
  }
  return h;
}

function makeDeltaOptions() {
  let h = '<option value="0">0</option>';
  for (let i = 1; i <= 9; i++) h += `<option value="${i}">\u2212${i}</option>`;
  return h;
}

function computeActionRPNReduction(s, o, d, ds, doo, dd) {
  if (!s || !o || !d) return 0;
  const before = s * o * d;
  const after = Math.max(1, s - ds) * Math.max(1, o - doo) * Math.max(1, d - dd);
  return Math.max(0, before - after);
}

export default {
  id: 'fmea',
  phase: 'analyze',
  icon: 'alert-triangle',
  i18nKey: 'modules.fmea',
  version: '1.0.0',

  _context: null,
  _container: null,
  /** @type {Array<object>} */
  _risks: [],
  _scales: null,
  _scaleVisible: false,
  _burndownChart: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._risks = [];
    this._scales = null;
    this._scaleVisible = false;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved && Array.isArray(saved.risks)) {
      this._risks = saved.risks;
    }
    if (saved && saved.scales) {
      this._scales = saved.scales;
    }

    this._render();
  },

  async destroy() {
    if (this._burndownChart) {
      try { this._context.chartManager.destroy(this._burndownChart); } catch { /* ignore */ }
      this._burndownChart = null;
    }
    this._container.innerHTML = '';
  },

  onLanguageChange() { this._render(); },
  onThemeChange() {},

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    this._syncFromDOM();
    this._syncScalesFromDOM();
    return {
      risks: JSON.parse(JSON.stringify(this._risks)),
      scales: this._scales ? { ...this._scales } : null,
    };
  },

  setState(data) {
    if (data && Array.isArray(data.risks)) {
      this._risks = data.risks;
    }
    this._scales = (data && data.scales) ? { ...data.scales } : null;
    this._render();
  },
  /**
   * Load a catalog example. Editorial — no worksheet is provisioned.
   * @param { meta: object, data: object } payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = (this._risks?.length || 0) > 0;
    if (hasContent && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    this.setState(payload.data);
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },


  // ─── Help ───────────────────────────────────────────────────

  help: () => import('./fmea-help.js'),

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (key, params) => this._context.i18n.t(`modules.fmea.${key}`, params);

    this._container.innerHTML = `
      <div class="module-container fmea">
        <div class="module-container__header">
          <h2 class="module-container__title">${t('name')}</h2>
          <div class="pmap__toolbar">
            <div class="pmap__toolbar-spacer"></div>
            <button class="btn btn--sm" data-action="toggle-scale" type="button">${t('scales')}</button>
            <button class="btn btn--sm" data-action="show-burndown" type="button">${t('burndown')}</button>
            <button class="btn btn--sm" data-action="sort-rpn" type="button">${t('sortByRPN')}</button>
            <button class="btn btn--sm" data-action="export-csv" type="button">${t('exportCSV')}</button>
            <button class="btn btn--sm btn--primary" data-action="add-risk" type="button">${t('addRisk')}</button>
          </div>
        </div>

        <div class="module-container__body">
          ${this._renderScaleRef(t)}
          ${this._renderStats(t)}
          <div class="fmea__risk-list" data-ref="risk-list">
            ${this._risks.map((r, i) => this._renderRiskCard(r, i, t)).join('')}
          </div>
        </div>
      </div>
    `;

    this._restoreSelectValues();
    this._recalcAll();
    this._bindEvents(t);
  },

  _renderStats(t) {
    return `
      <div class="fmea__stats">
        <div class="fmea__stat-card">
          <div class="fmea__stat-icon" style="background:rgba(74,124,255,0.12);color:var(--color-accent)">\u03A3</div>
          <div><div class="fmea__stat-value" data-stat="total">0</div><div class="fmea__stat-label">${t('statTotal')}</div></div>
        </div>
        <div class="fmea__stat-card">
          <div class="fmea__stat-icon" style="background:rgba(239,68,68,0.12);color:var(--color-error)">\u26A0</div>
          <div><div class="fmea__stat-value" data-stat="critical">0</div><div class="fmea__stat-label">${t('statCritical')}</div></div>
        </div>
        <div class="fmea__stat-card">
          <div class="fmea__stat-icon" style="background:rgba(251,146,60,0.12);color:#FB923C">\u25B2</div>
          <div><div class="fmea__stat-value" data-stat="high">0</div><div class="fmea__stat-label">${t('statHigh')}</div></div>
        </div>
        <div class="fmea__stat-card">
          <div class="fmea__stat-icon" style="background:rgba(251,191,36,0.12);color:#FBBF24">\u25CF</div>
          <div><div class="fmea__stat-value" data-stat="medium">0</div><div class="fmea__stat-label">${t('statMedium')}</div></div>
        </div>
        <div class="fmea__stat-card">
          <div class="fmea__stat-icon" style="background:rgba(52,211,153,0.12);color:var(--color-success, #34D399)">\u2713</div>
          <div><div class="fmea__stat-value" data-stat="low">0</div><div class="fmea__stat-label">${t('statLow')}</div></div>
        </div>
        <div class="fmea__stat-card">
          <div class="fmea__stat-icon" style="background:rgba(255,255,255,0.04);color:var(--color-text-secondary)">\u00D8</div>
          <div><div class="fmea__stat-value" data-stat="avg">\u2014</div><div class="fmea__stat-label">${t('statAvg')}</div></div>
        </div>
        <div class="fmea__stat-card">
          <div class="fmea__stat-icon" style="background:rgba(239,68,68,0.12);color:var(--color-error)">\u2191</div>
          <div><div class="fmea__stat-value" data-stat="max">\u2014</div><div class="fmea__stat-label">${t('statMax')}</div></div>
        </div>
      </div>
    `;
  },

  /** @returns {object} Default scale texts from i18n */
  _getDefaultScales(t) {
    return {
      sevNone: t('sevNone'), sevNoneDesc: t('sevNoneDesc'),
      sevLow: t('sevLow'), sevLowDesc: t('sevLowDesc'),
      sevMod: t('sevMod'), sevModDesc: t('sevModDesc'),
      sevHigh: t('sevHigh'), sevHighDesc: t('sevHighDesc'),
      sevVHigh: t('sevVHigh'), sevVHighDesc: t('sevVHighDesc'),
      occUnlikely: t('occUnlikely'), occUnlikelyRate: '< 1 / 1.500.000',
      occLow: t('occLow'), occLowRate: '1 / 150.000 \u2013 15.000',
      occMod: t('occMod'), occModRate: '1 / 2.000 \u2013 80',
      occHigh: t('occHigh'), occHighRate: '1 / 20 \u2013 8',
      occVHigh: t('occVHigh'), occVHighRate: '\u2265 1 / 3',
      detCertain: t('detCertain'), detCertainDesc: t('detCertainDesc'),
      detHigh: t('detHigh'), detHighDesc: t('detHighDesc'),
      detMod: t('detMod'), detModDesc: t('detModDesc'),
      detLow: t('detLow'), detLowDesc: t('detLowDesc'),
      detVLow: t('detVLow'), detVLowDesc: t('detVLowDesc'),
    };
  },

  /** @returns {string} Raw scale text — custom if set, otherwise i18n default */
  _s(key, t) {
    return (this._scales && this._scales[key] != null) ? this._scales[key] : t(key);
  },

  /** @returns {string} Raw scale text for rate keys (no i18n fallback, hardcoded defaults) */
  _sr(key) {
    if (this._scales && this._scales[key] != null) return this._scales[key];
    const defaults = {
      occUnlikelyRate: '< 1 / 1.500.000',
      occLowRate: '1 / 150.000 \u2013 15.000',
      occModRate: '1 / 2.000 \u2013 80',
      occHighRate: '1 / 20 \u2013 8',
      occVHighRate: '\u2265 1 / 3',
    };
    return defaults[key] || '';
  },

  _renderScaleRef(t) {
    const ed = 'contenteditable="true" class="fmea__scale-editable"';
    const s = (key) => esc(this._s(key, t));
    const sr = (key) => esc(this._sr(key));

    return `
      <div class="fmea__scale-ref${this._scaleVisible ? ' fmea__scale-ref--visible' : ''}" data-ref="scale-ref">
        <div class="fmea__scale-toolbar">
          <button class="btn btn--sm btn--ghost" data-action="reset-scales" type="button">${t('resetScales')}</button>
        </div>
        <h3>${t('scaleSeverity')}</h3>
        <table>
          <thead><tr><th>${t('scaleValue')}</th><th>${t('scaleMeaning')}</th><th>${t('scaleDescription')}</th></tr></thead>
          <tbody>
            <tr><td>1</td><td ${ed} data-scale="sevNone">${s('sevNone')}</td><td ${ed} data-scale="sevNoneDesc">${s('sevNoneDesc')}</td></tr>
            <tr><td>2\u20133</td><td ${ed} data-scale="sevLow">${s('sevLow')}</td><td ${ed} data-scale="sevLowDesc">${s('sevLowDesc')}</td></tr>
            <tr><td>4\u20136</td><td ${ed} data-scale="sevMod">${s('sevMod')}</td><td ${ed} data-scale="sevModDesc">${s('sevModDesc')}</td></tr>
            <tr><td>7\u20138</td><td ${ed} data-scale="sevHigh">${s('sevHigh')}</td><td ${ed} data-scale="sevHighDesc">${s('sevHighDesc')}</td></tr>
            <tr><td>9\u201310</td><td ${ed} data-scale="sevVHigh">${s('sevVHigh')}</td><td ${ed} data-scale="sevVHighDesc">${s('sevVHighDesc')}</td></tr>
          </tbody>
        </table>
        <h3>${t('scaleOccurrence')}</h3>
        <table>
          <thead><tr><th>${t('scaleValue')}</th><th>${t('scaleProbability')}</th><th>${t('scaleRate')}</th></tr></thead>
          <tbody>
            <tr><td>1</td><td ${ed} data-scale="occUnlikely">${s('occUnlikely')}</td><td ${ed} data-scale="occUnlikelyRate">${sr('occUnlikelyRate')}</td></tr>
            <tr><td>2\u20133</td><td ${ed} data-scale="occLow">${s('occLow')}</td><td ${ed} data-scale="occLowRate">${sr('occLowRate')}</td></tr>
            <tr><td>4\u20136</td><td ${ed} data-scale="occMod">${s('occMod')}</td><td ${ed} data-scale="occModRate">${sr('occModRate')}</td></tr>
            <tr><td>7\u20138</td><td ${ed} data-scale="occHigh">${s('occHigh')}</td><td ${ed} data-scale="occHighRate">${sr('occHighRate')}</td></tr>
            <tr><td>9\u201310</td><td ${ed} data-scale="occVHigh">${s('occVHigh')}</td><td ${ed} data-scale="occVHighRate">${sr('occVHighRate')}</td></tr>
          </tbody>
        </table>
        <h3>${t('scaleDetection')}</h3>
        <table>
          <thead><tr><th>${t('scaleValue')}</th><th>${t('scaleDetect')}</th><th>${t('scaleDescription')}</th></tr></thead>
          <tbody>
            <tr><td>1</td><td ${ed} data-scale="detCertain">${s('detCertain')}</td><td ${ed} data-scale="detCertainDesc">${s('detCertainDesc')}</td></tr>
            <tr><td>2\u20133</td><td ${ed} data-scale="detHigh">${s('detHigh')}</td><td ${ed} data-scale="detHighDesc">${s('detHighDesc')}</td></tr>
            <tr><td>4\u20136</td><td ${ed} data-scale="detMod">${s('detMod')}</td><td ${ed} data-scale="detModDesc">${s('detModDesc')}</td></tr>
            <tr><td>7\u20138</td><td ${ed} data-scale="detLow">${s('detLow')}</td><td ${ed} data-scale="detLowDesc">${s('detLowDesc')}</td></tr>
            <tr><td>9\u201310</td><td ${ed} data-scale="detVLow">${s('detVLow')}</td><td ${ed} data-scale="detVLowDesc">${s('detVLowDesc')}</td></tr>
          </tbody>
        </table>
        <h3>${t('rpnCategories')}</h3>
        <div class="fmea__legend-grid">
          <div class="fmea__legend-item"><div class="fmea__legend-dot" style="background:var(--color-success, #34D399)"></div> &lt; 50 ${t('catLow')}</div>
          <div class="fmea__legend-item"><div class="fmea__legend-dot" style="background:#FBBF24"></div> 50\u2013124 ${t('catMedium')}</div>
          <div class="fmea__legend-item"><div class="fmea__legend-dot" style="background:#FB923C"></div> 125\u2013200 ${t('catHigh')}</div>
          <div class="fmea__legend-item"><div class="fmea__legend-dot" style="background:var(--color-error)"></div> &gt; 200 ${t('catCritical')}</div>
        </div>
      </div>
    `;
  },

  /** Sync all contenteditable scale cells back to _scales */
  _syncScalesFromDOM() {
    const cells = this._container.querySelectorAll('[data-scale]');
    if (!cells.length) return;
    if (!this._scales) this._scales = {};
    cells.forEach(cell => {
      this._scales[cell.dataset.scale] = cell.textContent.trim();
    });
  },

  _renderRiskCard(risk, idx, t) {
    const num = String(idx + 1).padStart(3, '0');
    const collapsedCls = risk.collapsed ? ' fmea__risk-card--collapsed' : '';
    const st = (k) => this._s(k, t);
    const str = (k) => this._sr(k);
    const sevLabels = [
      `${st('sevNone')} – ${st('sevNoneDesc')}`,
      `${st('sevLow')} – ${st('sevLowDesc')}`,
      `${st('sevMod')} – ${st('sevModDesc')}`,
      `${st('sevHigh')} – ${st('sevHighDesc')}`,
      `${st('sevVHigh')} – ${st('sevVHighDesc')}`,
    ];
    const occLabels = [
      `${st('occUnlikely')} (${str('occUnlikelyRate')})`,
      `${st('occLow')} (${str('occLowRate')})`,
      `${st('occMod')} (${str('occModRate')})`,
      `${st('occHigh')} (${str('occHighRate')})`,
      `${st('occVHigh')} (${str('occVHighRate')})`,
    ];
    const detLabels = [
      `${st('detCertain')} – ${st('detCertainDesc')}`,
      `${st('detHigh')} – ${st('detHighDesc')}`,
      `${st('detMod')} – ${st('detModDesc')}`,
      `${st('detLow')} – ${st('detLowDesc')}`,
      `${st('detVLow')} – ${st('detVLowDesc')}`,
    ];
    const sevOpts = makeSODOptions(sevLabels);
    const occOpts = makeSODOptions(occLabels);
    const detOpts = makeSODOptions(detLabels);
    const deltaOpts = makeDeltaOptions();

    let actionsHTML = '';
    (risk.actions || []).forEach((a, ai) => {
      actionsHTML += `
        <tr data-action-idx="${ai}">
          <td style="text-align:center"><input type="checkbox" class="fmea__done-check" ${a.done ? 'checked' : ''}></td>
          <td><textarea name="actionText" placeholder="${t('actionPlaceholder')}">${esc(a.text || '')}</textarea></td>
          <td><input type="text" name="actionResp" placeholder="${t('actionResp')}" value="${esc(a.resp || '')}"></td>
          <td><input type="date" name="actionDate" value="${a.date || ''}"></td>
          <td class="fmea__delta-cell"><select name="deltaS" title="\u0394S">${deltaOpts}</select></td>
          <td class="fmea__delta-cell"><select name="deltaO" title="\u0394O">${deltaOpts}</select></td>
          <td class="fmea__delta-cell"><select name="deltaD" title="\u0394D">${deltaOpts}</select></td>
          <td style="text-align:center"><button class="fmea__action-del-btn" data-action="del-action" data-risk-id="${risk.id}" data-action-idx="${ai}" title="${this._context.i18n.t('common.delete')}">\u2715</button></td>
        </tr>
      `;
    });

    return `
      <div class="fmea__risk-card${collapsedCls}" data-risk-id="${risk.id}">
        <div class="fmea__risk-header">
          <span class="fmea__risk-number" data-action="toggle-collapse" data-risk-id="${risk.id}" title="${t('collapseToggle')}">
            <span class="fmea__collapse-arrow">\u25BC</span> R-${num}
          </span>
          <input class="fmea__risk-title" name="step" placeholder="${t('stepPlaceholder')}" value="${esc(risk.step || '')}">
          <div class="fmea__rpn-header-group">
            <span class="fmea__rpn-badge fmea__rpn-badge--none" data-rpn-badge>RPN \u2014</span>
            <span class="fmea__rpn-arrow-sep">\u2192</span>
            <span class="fmea__rpn-badge fmea__rpn-badge--sm fmea__rpn-badge--none" data-proj-rpn-badge>${t('target')} \u2014</span>
          </div>
          <button class="fmea__risk-delete" data-action="del-risk" data-risk-id="${risk.id}" title="${this._context.i18n.t('common.delete')}">\u2715</button>
        </div>
        <div class="fmea__risk-body">
          <div class="fmea__fields-row">
            <div class="field-group">
              <label>${t('failureMode')}</label>
              <textarea class="field" name="failureMode" placeholder="${t('failureModePlaceholder')}">${esc(risk.failureMode || '')}</textarea>
            </div>
            <div class="field-group">
              <label>${t('effect')}</label>
              <textarea class="field" name="effect" placeholder="${t('effectPlaceholder')}">${esc(risk.effect || '')}</textarea>
            </div>
            <div class="field-group">
              <label>${t('cause')}</label>
              <textarea class="field" name="cause" placeholder="${t('causePlaceholder')}">${esc(risk.cause || '')}</textarea>
            </div>
          </div>
          <div class="fmea__fields-row fmea__fields-row--2">
            <div class="field-group">
              <label>${t('currentControls')}</label>
              <textarea class="field" name="control" placeholder="${t('controlPlaceholder')}">${esc(risk.control || '')}</textarea>
            </div>
            <div class="field-group">
              <label>${t('rating')}</label>
              <div class="fmea__sod-row">
                <div class="fmea__sod-group"><label title="${esc(t('tipS'))}">S</label><select name="sev">${sevOpts}</select></div>
                <div class="fmea__sod-group"><label title="${esc(t('tipO'))}">O</label><select name="occ">${occOpts}</select></div>
                <div class="fmea__sod-group"><label title="${esc(t('tipD'))}">D</label><select name="det">${detOpts}</select></div>
              </div>
            </div>
          </div>

          <hr class="fmea__section-sep">
          <div class="fmea__section-title">${t('actionsSection')}</div>
          <div class="fmea__actions-section">
            <table class="fmea__action-table">
              <thead><tr>
                <th style="width:28px">\u2713</th>
                <th>${t('action')}</th>
                <th style="width:110px">${t('responsible')}</th>
                <th style="width:105px">${t('dueDate')}</th>
                <th class="fmea__delta-cell" style="width:62px">\u0394S</th>
                <th class="fmea__delta-cell" style="width:62px">\u0394O</th>
                <th class="fmea__delta-cell" style="width:62px">\u0394D</th>
                <th style="width:28px"></th>
              </tr></thead>
              <tbody data-action-body>${actionsHTML}</tbody>
            </table>
            <button class="fmea__add-action-btn" data-action="add-action" data-risk-id="${risk.id}">\uFF0B ${t('addAction')}</button>
          </div>
          <div class="fmea__projected-bar">
            <span class="fmea__proj-label">${t('projectedLabel')}</span>
            <span class="fmea__proj-item">S: <strong data-proj-s>\u2014</strong></span>
            <span class="fmea__proj-item">O: <strong data-proj-o>\u2014</strong></span>
            <span class="fmea__proj-item">D: <strong data-proj-d>\u2014</strong></span>
            <span class="fmea__proj-arrow">\u2192</span>
            <span class="fmea__rpn-badge fmea__rpn-badge--none" data-proj-rpn>RPN \u2014</span>
          </div>
        </div>
      </div>
    `;
  },

  // ─── Restore select values after innerHTML ──────────────────

  _restoreSelectValues() {
    const el = this._container;
    this._risks.forEach(risk => {
      const card = el.querySelector(`[data-risk-id="${risk.id}"]`);
      if (!card) return;
      if (risk.sev) card.querySelector('[name=sev]').value = risk.sev;
      if (risk.occ) card.querySelector('[name=occ]').value = risk.occ;
      if (risk.det) card.querySelector('[name=det]').value = risk.det;
      (risk.actions || []).forEach((a, ai) => {
        const tr = card.querySelector(`[data-action-idx="${ai}"]`);
        if (!tr) return;
        if (a.deltaS) tr.querySelector('[name=deltaS]').value = a.deltaS;
        if (a.deltaO) tr.querySelector('[name=deltaO]').value = a.deltaO;
        if (a.deltaD) tr.querySelector('[name=deltaD]').value = a.deltaD;
      });
    });
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindEvents(t) {
    const el = this._container;

    el.querySelector('[data-action="add-risk"]')?.addEventListener('click', () => this._addRisk());
    el.querySelector('[data-action="sort-rpn"]')?.addEventListener('click', () => this._sortByRPN());
    el.querySelector('[data-action="export-csv"]')?.addEventListener('click', () => this._exportCSV(t));
    el.querySelector('[data-action="show-burndown"]')?.addEventListener('click', () => this._showBurndown(t));
    el.querySelector('[data-action="toggle-scale"]')?.addEventListener('click', () => {
      this._scaleVisible = !this._scaleVisible;
      el.querySelector('[data-ref="scale-ref"]')?.classList.toggle('fmea__scale-ref--visible', this._scaleVisible);
    });

    el.querySelector('[data-action="reset-scales"]')?.addEventListener('click', () => {
      this._scales = null;
      this._save();
      this._render();
    });

    // Scale cell editing — save on blur
    el.querySelectorAll('[data-scale]').forEach(cell => {
      cell.addEventListener('blur', () => {
        this._syncScalesFromDOM();
        this._save();
      });
    });

    // Collapse toggles
    el.querySelectorAll('[data-action="toggle-collapse"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = el.querySelector(`[data-risk-id="${btn.dataset.riskId}"]`);
        card?.classList.toggle('fmea__risk-card--collapsed');
        const risk = this._risks.find(r => r.id === btn.dataset.riskId);
        if (risk) risk.collapsed = card.classList.contains('fmea__risk-card--collapsed');
        this._save();
      });
    });

    // Delete risk
    el.querySelectorAll('[data-action="del-risk"]').forEach(btn => {
      btn.addEventListener('click', () => this._deleteRisk(btn.dataset.riskId));
    });

    // Add action
    el.querySelectorAll('[data-action="add-action"]').forEach(btn => {
      btn.addEventListener('click', () => this._addAction(btn.dataset.riskId));
    });

    // Delete action
    el.querySelectorAll('[data-action="del-action"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._deleteAction(btn.dataset.riskId, parseInt(btn.dataset.actionIdx, 10));
      });
    });

    // Live input/change on risk cards
    el.querySelectorAll('.fmea__risk-card').forEach(card => {
      const handler = () => {
        this._syncCardFromDOM(card);
        this._recalcCard(card);
        this._updateStats();
        this._save();
      };
      card.addEventListener('input', handler);
      card.addEventListener('change', handler);
    });
  },

  // ─── CRUD ───────────────────────────────────────────────────

  _addRisk() {
    const risk = {
      id: generateId(),
      step: '', failureMode: '', effect: '', cause: '', control: '',
      sev: '', occ: '', det: '',
      actions: [],
      collapsed: false,
    };
    this._risks.push(risk);
    this._save();
    this._render();
  },

  _deleteRisk(id) {
    this._syncFromDOM();
    this._risks = this._risks.filter(r => r.id !== id);
    this._save();
    this._render();
  },

  _addAction(riskId) {
    this._syncFromDOM();
    const risk = this._risks.find(r => r.id === riskId);
    if (!risk) return;
    risk.actions.push({ text: '', resp: '', date: '', done: false, deltaS: '0', deltaO: '0', deltaD: '0' });
    this._save();
    this._render();
  },

  _deleteAction(riskId, actionIdx) {
    this._syncFromDOM();
    const risk = this._risks.find(r => r.id === riskId);
    if (!risk) return;
    risk.actions.splice(actionIdx, 1);
    this._save();
    this._render();
  },

  _sortByRPN() {
    this._syncFromDOM();
    this._risks.sort((a, b) => {
      const rpnA = (parseInt(a.sev) || 0) * (parseInt(a.occ) || 0) * (parseInt(a.det) || 0);
      const rpnB = (parseInt(b.sev) || 0) * (parseInt(b.occ) || 0) * (parseInt(b.det) || 0);
      return rpnB - rpnA;
    });
    this._save();
    this._render();
    const t = (key) => this._context.i18n.t(`modules.fmea.${key}`);
    this._context.notify(t('sortedByRPN'));
  },

  // ─── Sync DOM → Data ───────────────────────────────────────

  _syncFromDOM() {
    const el = this._container;
    this._risks.forEach(risk => {
      const card = el.querySelector(`[data-risk-id="${risk.id}"]`);
      if (card) this._syncCardFromDOM(card, risk);
    });
  },

  _syncCardFromDOM(cardEl, risk) {
    const r = risk || this._risks.find(rr => rr.id === cardEl.dataset.riskId);
    if (!r) return;
    const g = (name) => (cardEl.querySelector(`[name="${name}"]`) || {}).value || '';
    r.step = g('step');
    r.failureMode = g('failureMode');
    r.effect = g('effect');
    r.cause = g('cause');
    r.control = g('control');
    r.sev = g('sev');
    r.occ = g('occ');
    r.det = g('det');
    r.collapsed = cardEl.classList.contains('fmea__risk-card--collapsed');

    r.actions = [];
    cardEl.querySelectorAll('[data-action-body] tr').forEach(tr => {
      r.actions.push({
        text: tr.querySelector('[name=actionText]')?.value || '',
        resp: tr.querySelector('[name=actionResp]')?.value || '',
        date: tr.querySelector('[name=actionDate]')?.value || '',
        done: tr.querySelector('.fmea__done-check')?.checked || false,
        deltaS: tr.querySelector('[name=deltaS]')?.value || '0',
        deltaO: tr.querySelector('[name=deltaO]')?.value || '0',
        deltaD: tr.querySelector('[name=deltaD]')?.value || '0',
      });
    });
  },

  // ─── RPN Calculation ───────────────────────────────────────

  _recalcAll() {
    this._container.querySelectorAll('.fmea__risk-card').forEach(card => this._recalcCard(card));
    this._updateStats();
  },

  _recalcCard(card) {
    const s = parseInt(card.querySelector('[name=sev]')?.value) || 0;
    const o = parseInt(card.querySelector('[name=occ]')?.value) || 0;
    const d = parseInt(card.querySelector('[name=det]')?.value) || 0;
    const rpn = (s && o && d) ? s * o * d : 0;

    // Current RPN badge
    const badge = card.querySelector('[data-rpn-badge]');
    if (badge) {
      badge.textContent = rpn ? `RPN ${rpn}` : 'RPN \u2014';
      badge.className = 'fmea__rpn-badge ' + rpnBadgeClass(rpn);
    }

    // Card glow class
    const base = 'fmea__risk-card';
    const collapsed = card.classList.contains('fmea__risk-card--collapsed') ? ' fmea__risk-card--collapsed' : '';
    card.className = base + collapsed + (rpn ? ' ' + cardGlowClass(rpn) : '');

    // Sum deltas
    let totalDS = 0, totalDO = 0, totalDD = 0;
    card.querySelectorAll('[data-action-body] tr').forEach(tr => {
      totalDS += parseInt(tr.querySelector('[name=deltaS]')?.value) || 0;
      totalDO += parseInt(tr.querySelector('[name=deltaO]')?.value) || 0;
      totalDD += parseInt(tr.querySelector('[name=deltaD]')?.value) || 0;
    });

    const projS = Math.max(1, s - totalDS);
    const projO = Math.max(1, o - totalDO);
    const projD = Math.max(1, d - totalDD);
    const projRPN = (s && o && d) ? projS * projO * projD : 0;

    const ps = card.querySelector('[data-proj-s]');
    const po = card.querySelector('[data-proj-o]');
    const pd = card.querySelector('[data-proj-d]');
    if (ps) ps.textContent = s ? projS : '\u2014';
    if (po) po.textContent = o ? projO : '\u2014';
    if (pd) pd.textContent = d ? projD : '\u2014';

    // Bottom projected badge
    const projBadge = card.querySelector('[data-proj-rpn]');
    if (projBadge) {
      projBadge.textContent = projRPN ? `RPN ${projRPN}` : 'RPN \u2014';
      projBadge.className = 'fmea__rpn-badge ' + rpnBadgeClass(projRPN);
    }

    // Header target badge
    const t = (key) => this._context.i18n.t(`modules.fmea.${key}`);
    const headerProj = card.querySelector('[data-proj-rpn-badge]');
    if (headerProj) {
      headerProj.textContent = projRPN ? `${t('target')} ${projRPN}` : `${t('target')} \u2014`;
      headerProj.className = 'fmea__rpn-badge fmea__rpn-badge--sm ' + rpnBadgeClass(projRPN);
    }

    card.dataset.rpn = rpn;
    card.dataset.projRpn = projRPN;
  },

  _updateStats() {
    const el = this._container;
    const cards = el.querySelectorAll('.fmea__risk-card');
    let total = 0, crit = 0, high = 0, med = 0, low = 0, sum = 0, count = 0, max = 0;

    cards.forEach(c => {
      total++;
      const v = parseInt(c.dataset.rpn) || 0;
      if (v > 0) {
        count++; sum += v;
        if (v > max) max = v;
        if (v > 200) crit++;
        else if (v >= 125) high++;
        else if (v >= 50) med++;
        else low++;
      }
    });

    const set = (key, val) => {
      const e = el.querySelector(`[data-stat="${key}"]`);
      if (e) e.textContent = val;
    };
    set('total', total);
    set('critical', crit);
    set('high', high);
    set('medium', med);
    set('low', low);
    set('avg', count ? Math.round(sum / count) : '\u2014');
    set('max', max || '\u2014');
  },

  // ─── CSV Export ─────────────────────────────────────────────

  _exportCSV(t) {
    this._syncFromDOM();
    const headers = ['#', t('step'), t('failureMode'), t('effect'), t('cause'), t('currentControls'), 'S', 'O', 'D', 'RPN',
      t('action'), t('responsible'), t('dueDate'), t('done'), '\u0394S', '\u0394O', '\u0394D',
      'Proj.S', 'Proj.O', 'Proj.D', 'Proj.RPN'];
    let csv = 'sep=;\n' + headers.map(h => `"${h}"`).join(';') + '\n';

    this._risks.forEach((risk, idx) => {
      const s = parseInt(risk.sev) || 0;
      const o = parseInt(risk.occ) || 0;
      const d = parseInt(risk.det) || 0;
      const rpn = (s && o && d) ? s * o * d : 0;

      let totalDS = 0, totalDO = 0, totalDD = 0;
      (risk.actions || []).forEach(a => {
        totalDS += parseInt(a.deltaS) || 0;
        totalDO += parseInt(a.deltaO) || 0;
        totalDD += parseInt(a.deltaD) || 0;
      });
      const ps = Math.max(1, s - totalDS);
      const po = Math.max(1, o - totalDO);
      const pd = Math.max(1, d - totalDD);
      const prpn = (s && o && d) ? ps * po * pd : '';

      const e = (v) => `"${String(v || '').replace(/"/g, '""')}"`;

      if (!risk.actions || !risk.actions.length) {
        csv += [idx + 1, risk.step, risk.failureMode, risk.effect, risk.cause, risk.control,
          s || '', o || '', d || '', rpn || '', '', '', '', '', '', '', '', ps, po, pd, prpn].map(e).join(';') + '\n';
      } else {
        risk.actions.forEach((a, ai) => {
          const row = ai === 0
            ? [idx + 1, risk.step, risk.failureMode, risk.effect, risk.cause, risk.control,
              s || '', o || '', d || '', rpn || '', a.text, a.resp, a.date, a.done ? 'Ja' : 'Nein',
              a.deltaS, a.deltaO, a.deltaD, ps, po, pd, prpn]
            : ['', '', '', '', '', '', '', '', '', '', a.text, a.resp, a.date, a.done ? 'Ja' : 'Nein',
              a.deltaS, a.deltaO, a.deltaD, '', '', '', ''];
          csv += row.map(e).join(';') + '\n';
        });
      }
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fmea_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this._context.notify(t('exportedCSV'));
  },

  // ─── Burndown Chart ────────────────────────────────────────

  async _showBurndown(t) {
    this._syncFromDOM();

    // Collect all dated actions with their RPN reduction contribution
    const events = [];
    let totalRPN = 0;

    this._risks.forEach(risk => {
      const s = parseInt(risk.sev) || 0;
      const o = parseInt(risk.occ) || 0;
      const d = parseInt(risk.det) || 0;
      if (!s || !o || !d) return;
      totalRPN += s * o * d;

      // Sort this risk's dated actions by date, then compute sequential reductions
      const dated = (risk.actions || [])
        .map((a, i) => ({ ...a, _idx: i }))
        .filter(a => a.date);
      dated.sort((a, b) => a.date.localeCompare(b.date));

      let runS = s, runO = o, runD = d;
      for (const a of dated) {
        const ds = parseInt(a.deltaS) || 0;
        const doo = parseInt(a.deltaO) || 0;
        const dd = parseInt(a.deltaD) || 0;
        if (!ds && !doo && !dd) continue;
        const before = runS * runO * runD;
        runS = Math.max(1, runS - ds);
        runO = Math.max(1, runO - doo);
        runD = Math.max(1, runD - dd);
        const reduction = before - runS * runO * runD;
        if (reduction > 0) {
          events.push({ ts: new Date(a.date).getTime(), reduction, done: !!a.done });
        }
      }
    });

    if (!events.length || !totalRPN) {
      this._context.notify(t('burndownNoData'));
      return;
    }

    events.sort((a, b) => a.ts - b.ts);

    // Build Plan line (all events) and Actual line (only done events)
    const planX = [];
    const planY = [];
    const actX = [];
    const actY = [];

    // Start point: earliest date minus 1 day
    const startTs = events[0].ts - 86400000;
    planX.push(startTs);
    planY.push(totalRPN);
    actX.push(startTs);
    actY.push(totalRPN);

    let planRPN = totalRPN;
    let actRPN = totalRPN;
    for (const ev of events) {
      planRPN -= ev.reduction;
      planX.push(ev.ts);
      planY.push(planRPN);
      if (ev.done) {
        actRPN -= ev.reduction;
        actX.push(ev.ts);
        actY.push(actRPN);
      }
    }

    const lang = this._context.language || 'de';
    const dateFmt = (ms) => {
      const d = new Date(ms);
      return d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
    };

    // Build popout overlay (reuses dmike-chart-popout CSS)
    const overlay = document.createElement('div');
    overlay.className = 'dmike-chart-popout-overlay';

    const win = document.createElement('div');
    win.className = 'dmike-chart-popout';

    const titleBar = document.createElement('div');
    titleBar.className = 'dmike-chart-popout-titlebar';
    const titleText = document.createElement('span');
    titleText.textContent = t('burndownTitle');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dmike-chart-popout-close';
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    titleBar.append(titleText, closeBtn);

    const body = document.createElement('div');
    body.className = 'dmike-chart-popout-body';
    const chartWrap = document.createElement('div');
    chartWrap.style.width = '100%';
    chartWrap.style.height = '100%';
    body.appendChild(chartWrap);

    win.append(titleBar, body);
    overlay.appendChild(win);
    document.body.appendChild(overlay);

    const close = () => {
      if (this._burndownChart) {
        this._context.chartManager.destroy(this._burndownChart);
        this._burndownChart = null;
      }
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    };

    // Drag title bar
    let dragX = 0, dragY = 0, isDragging = false;
    const onDragStart = (e) => {
      if (closeBtn.contains(e.target)) return;
      isDragging = true;
      dragX = e.clientX - win.offsetLeft;
      dragY = e.clientY - win.offsetTop;
      win.style.transition = 'none';
    };
    const onDragMove = (e) => {
      if (!isDragging) return;
      win.style.left = (e.clientX - dragX) + 'px';
      win.style.top = (e.clientY - dragY) + 'px';
    };
    const onDragEnd = () => { isDragging = false; win.style.transition = ''; };
    titleBar.addEventListener('mousedown', onDragStart);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);

    const onKeyDown = (e) => { if (e.key === 'Escape') close(); };
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    window.addEventListener('keydown', onKeyDown);

    this._burndownChart = await this._context.chartManager.create(chartWrap, 'scatter', {
      series: [
        {
          name: t('burndownPlan'),
          x: planX,
          y: planY,
          color: 'var(--color-text-tertiary)',
          symbol: 'circle',
          connectLine: { show: true, dash: 'dash', width: 2, color: 'var(--color-text-tertiary)' },
        },
        {
          name: t('burndownActual'),
          x: actX,
          y: actY,
          color: 'var(--color-accent)',
          symbol: 'circle',
          connectLine: { show: true, dash: 'solid', width: 2.5, color: 'var(--color-accent)' },
        },
      ],
      title: t('burndownTitle'),
      yLabel: 'RPN',
      yMin: 0,
      showLegend: true,
      xTickFormat: dateFmt,
    });
  },

  // ─── Persistence ──────────────────────────────────────────

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      {
        risks: JSON.parse(JSON.stringify(this._risks)),
        scales: this._scales ? { ...this._scales } : null,
      }
    );
  },
};
