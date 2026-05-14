/**
 * D.Mike — Ishikawa 6M Module (ishikawa.js)
 * Cause & Effect (Fishbone) Diagram — structured as a hypothesis table
 * with expert scoring, 6M categories, snapshots, trend chart, and diffing.
 * DMAIC phase: Analyze
 *
 * Spec: docs/modules/ISHIKAWA.md
 */

import { CATS, STATUS_KEYS, STATUS_CSS, EXP_COLS } from './ishikawa-constants.js';
import { problemMethods } from './ishikawa-problem.js';
import { experimentsMethods } from './ishikawa-experiments.js';
import { factsMethods } from './ishikawa-facts.js';
import { chartsMethods } from './ishikawa-charts.js';

const mod = {
  id: 'ishikawa',
  phase: 'analyze',
  icon: 'git-branch',
  i18nKey: 'modules.ishikawa',
  version: '1.0.0',

  _context: null,
  _container: null,
  _problem: '',
  _rows: [],
  _experts: [],
  _catLabels: {},
  _snapshots: [],
  _experiments: [],
  _facts: [],
  _images: { inScope: [], outScope: [] },
  _compareSnap: null,
  _idC: 0,
  _expIdC: 0,
  _snapIdC: 0,
  _xpIdC: 0,
  _factIdC: 0,
  _imgIdC: 0,
  _stableIdC: 0,
  _activeTab: 'problem',
  _collapsed: null,
  _activeFilter: 'all',
  _hiddenLines: null,
  _trendVisible: false,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._problem = '';
    this._rows = [];
    this._experts = [];
    this._catLabels = {};
    this._snapshots = [];
    this._experiments = [];
    this._facts = [];
    this._images = { inScope: [], outScope: [] };
    this._compareSnap = null;
    this._idC = 0;
    this._expIdC = 0;
    this._snapIdC = 0;
    this._xpIdC = 0;
    this._factIdC = 0;
    this._imgIdC = 0;
    this._stableIdC = 0;
    this._activeTab = 'problem';
    this._collapsed = new Set();
    this._activeFilter = 'all';
    this._hiddenLines = new Set();
    this._trendVisible = false;
    this._paretoSource = 'current';
    this._paretoChart = null;
    this._paretoEditorOpen = false;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._importState(saved);

    this._render();
  },

  async destroy() {
    if (this._paretoChart) {
      this._context.chartManager.destroy(this._paretoChart);
      this._paretoChart = null;
    }
    this._container.innerHTML = '';
  },

  onLanguageChange(_lang) {
    this._render();
  },

  onThemeChange(_theme) {},

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return {
      problem: this._problem,
      experts: JSON.parse(JSON.stringify(this._experts)),
      catLabels: { ...this._catLabels },
      rows: JSON.parse(JSON.stringify(this._rows)),
      snapshots: JSON.parse(JSON.stringify(this._snapshots)),
      experiments: JSON.parse(JSON.stringify(this._experiments)),
      facts: JSON.parse(JSON.stringify(this._facts)),
      images: JSON.parse(JSON.stringify(this._images)),
    };
  },

  setState(data) {
    this._importState(data);
    this._render();
  },

  // ─── Help ───────────────────────────────────────────────────

  help: () => import('./ishikawa-help.js'),
  /**
   * Load a catalog example. Editorial — no worksheet is provisioned.
   * @param { meta: object, data: object } payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!this._problem || (this._rows?.length || 0) > 0;
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


  // ─── Internal: state ────────────────────────────────────────

  _importState(saved) {
    if (!saved) return;
    this._problem = saved.problem || '';
    this._experts = saved.experts ? JSON.parse(JSON.stringify(saved.experts)) : [];
    this._catLabels = saved.catLabels ? { ...saved.catLabels } : {};
    this._rows = saved.rows ? JSON.parse(JSON.stringify(saved.rows)) : [];
    this._snapshots = saved.snapshots ? JSON.parse(JSON.stringify(saved.snapshots)) : [];
    this._experiments = saved.experiments ? JSON.parse(JSON.stringify(saved.experiments)) : [];
    this._facts = saved.facts ? JSON.parse(JSON.stringify(saved.facts)) : [];
    const si = saved.images || {};
    this._images = {
      inScope: Array.isArray(si.inScope) ? JSON.parse(JSON.stringify(si.inScope)) : [],
      outScope: Array.isArray(si.outScope) ? JSON.parse(JSON.stringify(si.outScope)) : [],
    };
    this._idC = Math.max(0, ...this._rows.map(r => r.id), this._idC);
    this._expIdC = Math.max(0, ...this._experts.map(e => e.id), this._expIdC);
    this._snapIdC = Math.max(0, ...this._snapshots.map(s => s.id), this._snapIdC);
    this._xpIdC = Math.max(0, ...this._experiments.map(x => x.id || 0), this._xpIdC);
    this._factIdC = Math.max(0, ...this._facts.map(f => f.id || 0), this._factIdC);
    this._imgIdC = Math.max(
      0,
      ...this._images.inScope.map(i => i.id || 0),
      ...this._images.outScope.map(i => i.id || 0),
      this._imgIdC
    );
    this._rows.forEach(r => {
      if (r.stableId) {
        const n = parseInt(r.stableId.split('-')[1]) || 0;
        if (n > this._stableIdC) this._stableIdC = n;
      }
    });
    this._snapshots.forEach(s => {
      (s.data.rows || []).forEach(r => {
        if (r.stableId) {
          const n = parseInt(r.stableId.split('-')[1]) || 0;
          if (n > this._stableIdC) this._stableIdC = n;
        }
      });
    });
  },

  _uid() { return ++this._idC; },
  _eUid() { return ++this._expIdC; },
  _sUid() { return ++this._snapIdC; },
  _xUid() { return ++this._xpIdC; },
  _fUid() { return ++this._factIdC; },
  _imgUid() { return ++this._imgIdC; },
  _nextStableId() { this._stableIdC++; return 'H-' + String(this._stableIdC).padStart(3, '0'); },

  // ─── Tree helpers ───────────────────────────────────────────

  _getDepth(r) {
    let d = 0, c = r;
    while (c.parentId !== null) {
      c = this._rows.find(x => x.id === c.parentId);
      if (!c) break;
      d++;
    }
    return d;
  },

  _hasKids(id) { return this._rows.some(r => r.parentId === id); },

  _descIds(id) {
    const o = [];
    this._rows.filter(r => r.parentId === id).forEach(c => {
      o.push(c.id);
      o.push(...this._descIds(c.id));
    });
    return o;
  },

  _isHidden(r) {
    let c = r;
    while (c.parentId !== null) {
      if (this._collapsed.has(c.parentId)) return true;
      c = this._rows.find(x => x.id === c.parentId);
      if (!c) break;
    }
    return false;
  },

  _effCat(r) {
    if (r.category) return r.category;
    if (r.parentId !== null) {
      const p = this._rows.find(x => x.id === r.parentId);
      if (p) return this._effCat(p);
    }
    return '';
  },

  _ordered() {
    const res = [];
    const walk = (pid) => {
      this._rows.filter(r => r.parentId === pid).forEach(c => {
        res.push(c);
        walk(c.id);
      });
    };
    walk(null);
    return res;
  },

  _buildNums() {
    const n = {}, ctr = {};
    this._ordered().forEach(r => {
      const k = r.parentId === null ? '_' : r.parentId;
      ctr[k] = (ctr[k] || 0) + 1;
      n[r.id] = r.parentId === null ? '' + ctr[k] : (n[r.parentId] || '?') + '.' + ctr[k];
    });
    return n;
  },

  _calcScore(r) {
    if (!this._experts.length) return null;
    const v = this._experts.map(e => r.ratings[e.id]).filter(x => x !== undefined && x !== null && x !== '');
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  },

  _calcScoreFor(row, el) {
    if (!el.length) return null;
    const v = el.map(e => row.ratings[e.id]).filter(x => x !== undefined && x !== null && x !== '');
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  },

  _dName(r) { return r.name && r.name.trim() ? r.name.trim() : r.stableId; },

  _isNameDuplicate(name, excludeId) {
    if (!name || !name.trim()) return false;
    return this._rows.some(r => r.id !== excludeId && r.name && r.name.trim().toLowerCase() === name.trim().toLowerCase());
  },

  _catColor(key) {
    const c = CATS.find(c => c.key === key);
    return c ? c.color : 'var(--color-border-secondary)';
  },

  _catLabel(key) {
    const custom = this._catLabels && this._catLabels[key];
    if (custom && custom.trim()) return custom.trim();
    return this._context.i18n.t(`modules.ishikawa.cat.${key}`);
  },

  _ini(name) {
    const p = name.trim().split(/\s+/);
    return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
  },

  _scoreCellHtml(score, chg) {
    if (score === null) return `<span class="ishikawa__score-badge">&ndash;</span>`;
    const sc = score >= 6 ? 'ishikawa__score-high' : score >= 3 ? 'ishikawa__score-mid' : 'ishikawa__score-low';
    const pct = score / 9 * 100;
    const barCol = score >= 6 ? '#dc2626' : score >= 3 ? '#d97706' : '#16a34a';
    let deltaHtml = '';
    if (chg) {
      const sign = chg.delta > 0 ? '+' : '';
      const cls = chg.delta > 0 ? 'ishikawa__delta-up' : 'ishikawa__delta-down';
      deltaHtml = `<span class="ishikawa__score-delta ${cls}">${sign}${chg.delta.toFixed(1)}</span>`;
    }
    return `<div class="ishikawa__score-bar-wrap">
      <span class="ishikawa__score-badge ${sc}">${score.toFixed(1)}</span>
      <div class="ishikawa__score-bar-track"><div class="ishikawa__score-bar-fill" style="width:${pct}%;background:${barCol}"></div></div>
      ${deltaHtml}</div>`;
  },

  _updateRowScoreCell(r) {
    const tr = this._container.querySelector(`tr[data-id="${r.id}"]`);
    if (!tr) return;
    const cell = tr.querySelector('.ishikawa__col-score');
    if (!cell) return;
    const score = this._calcScore(r);
    const diff = this._compareSnap ? this._getDiff() : null;
    const chg = diff ? diff.changedMap[r.stableId] : null;
    cell.innerHTML = this._scoreCellHtml(score, chg);
  },

  _refreshDerivedPanels(t) {
    // Re-render panels below the table (summary, pareto, trend) without
    // touching the table itself — rebuilding the table would tear down the
    // rating input the user is about to click into.
    const summary = this._container.querySelector('.ishikawa__summary-bar');
    if (summary) {
      const tmp = document.createElement('div');
      tmp.innerHTML = this._renderSummary(t);
      const fresh = tmp.firstElementChild;
      if (fresh) summary.replaceWith(fresh);
    }
    this._renderParetoChart(t);
    if (this._trendVisible) this._renderTrendChart(t);
  },

  _ratingBg(v) {
    if (v === '' || v === undefined || v === null || isNaN(v)) return '';
    const n = Math.max(0, Math.min(9, Number(v)));
    const t = n / 9;
    let r, g, b;
    if (t < 0.5) {
      const p = t * 2;
      r = Math.round(134 + (253 - 134) * p);
      g = Math.round(239 + (224 - 239) * p);
      b = Math.round(172 + (71 - 172) * p);
    } else {
      const p = (t - 0.5) * 2;
      r = Math.round(253 + (252 - 253) * p);
      g = Math.round(224 + (165 - 224) * p);
      b = Math.round(71 + (165 - 71) * p);
    }
    return `background:rgba(${r},${g},${b},0.35);border-color:rgba(${r},${g},${b},0.5);color:var(--color-text-primary)`;
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (key, params) => this._context.i18n.t(`modules.ishikawa.${key}`, params);

    const validTabs = ['problem', 'hypotheses', 'experiments', 'facts'];
    const tab = validTabs.includes(this._activeTab) ? this._activeTab : 'problem';

    let tabBody = '';
    if (tab === 'problem') {
      tabBody = this._renderProblemTab(t);
    } else if (tab === 'hypotheses') {
      tabBody = `
        <div class="ishikawa__experts-row">
          ${this._renderExpertPanel(t)}
        </div>
        ${this._renderDiffBanner(t)}
        ${this._renderToolbar(t)}
        ${this._renderTable(t)}
        ${this._renderPareto(t)}
        ${this._renderSummary(t)}
        ${this._renderSnapshotPanel(t)}
        ${this._renderTrendPanel(t)}`;
    } else if (tab === 'experiments') {
      tabBody = this._renderExperimentsTab(t);
    } else {
      tabBody = this._renderFactsTab(t);
    }

    this._container.innerHTML = `
      <div class="module-container ishikawa">
        <div class="module-container__header">
          <h2 class="module-container__title">${this._context.i18n.t('modules.ishikawa.name')}</h2>
          <div class="ishikawa__toolbar">
            <div class="ishikawa__toolbar-spacer"></div>
            <button class="btn btn--sm btn--secondary" data-ref="exportCsvBtn" type="button">${t('exportCSV')}</button>
          </div>
        </div>

        <div class="module-container__body">
          <div class="ishikawa__tabs" role="tablist">
            <button class="ishikawa__tab ${tab === 'problem' ? 'ishikawa__tab--active' : ''}" role="tab" data-tab="problem">${t('tabProblem')}</button>
            <button class="ishikawa__tab ${tab === 'facts' ? 'ishikawa__tab--active' : ''}" role="tab" data-tab="facts">${t('tabFacts')}</button>
            <button class="ishikawa__tab ${tab === 'hypotheses' ? 'ishikawa__tab--active' : ''}" role="tab" data-tab="hypotheses">${t('tabHypotheses')}</button>
            <button class="ishikawa__tab ${tab === 'experiments' ? 'ishikawa__tab--active' : ''}" role="tab" data-tab="experiments">${t('tabExperiments')}</button>
          </div>

          ${tabBody}
        </div>
      </div>
    `;

    this._bindEvents(t);
    if (tab === 'hypotheses') {
      this._renderParetoChart(t);
      if (this._trendVisible) this._renderTrendChart(t);
    } else if (tab === 'experiments') {
      this._renderGantt(t);
      this._renderCostChart(t, 'cumulative'); this._renderCostChart(t, 'rate');
    }
  },

  _renderExpertPanel(t) {
    const tags = this._experts.length
      ? this._experts.map(e => `
          <span class="ishikawa__expert-tag">
            <span class="ishikawa__expert-ini" data-expert-ini-for="${e.id}" style="background:${e.color}">${this._ini(e.name)}</span>
            <input type="text" class="ishikawa__expert-name-edit" data-expert-name-id="${e.id}"
                   value="${this._escapeAttr(e.name)}" spellcheck="false" />
            <button class="ishikawa__expert-rm" data-expert-id="${e.id}" title="${this._context.i18n.t('common.remove')}">&#x2715;</button>
          </span>`).join('')
      : `<span class="ishikawa__no-items">${t('noExperts')}</span>`;

    return `
      <div class="ishikawa__expert-panel">
        <div class="ishikawa__expert-header">
          <label class="ishikawa__panel-label" style="margin:0">${t('expertTeam')}</label>
          <div class="ishikawa__expert-add-form">
            <input type="text" class="field field--inline ishikawa__expert-name-input" data-ref="expertNameInput"
                   placeholder="${t('expertPlaceholder')}" />
            <button class="btn btn--sm btn--primary" data-ref="addExpertBtn">+ ${t('addExpert')}</button>
          </div>
        </div>
        <div class="ishikawa__expert-tags">${tags}</div>
      </div>`;
  },

  _renderSnapshotPanel(t) {
    const items = this._snapshots.length
      ? this._snapshots.map(s => {
          const d = new Date(s.date);
          const ds = d.toLocaleDateString('de-DE') + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
          const nr = (s.data.rows || []).length;
          const act = this._compareSnap && this._compareSnap.id === s.id;
          return `
            <div class="ishikawa__snap-item ${act ? 'ishikawa__snap-item--active' : ''}"
                 data-snap-id="${s.id}" title="${t('snapClickHint')}">
              <span class="ishikawa__snap-date">${ds}</span>
              <span class="ishikawa__snap-name">${this._escapeHtml(s.name)}</span>
              <span class="ishikawa__snap-badge">${nr} ${t('hyp')}</span>
              <button class="ishikawa__snap-del" data-snap-del="${s.id}" title="${this._context.i18n.t('common.delete')}">&#x2715;</button>
            </div>`;
        }).join('')
      : `<span class="ishikawa__no-items">${t('noSnapshots')}</span>`;

    return `
      <div class="ishikawa__snapshot-panel">
        <label class="ishikawa__panel-label">${t('snapshots')}</label>
        <div class="ishikawa__snapshot-inner">
          <div class="ishikawa__snapshot-save">
            <input type="text" class="field field--inline ishikawa__snapshot-name-input" data-ref="snapNameInput"
                   placeholder="${t('snapNamePlaceholder')}" />
            <button class="btn btn--sm btn--primary" data-ref="saveSnapBtn">${t('saveSnapshot')}</button>
            <button class="btn btn--sm" data-ref="trendBtn">${t('trend')}</button>
          </div>
          <div class="ishikawa__snapshot-list">
            <div class="ishikawa__snap-items">${items}</div>
          </div>
        </div>
      </div>`;
  },

  _renderTrendPanel(t) {
    return `
      <div class="ishikawa__trend-panel ${this._trendVisible ? 'ishikawa__trend-panel--visible' : ''}" data-ref="trendPanel">
        <div class="ishikawa__trend-inner">
          <div class="ishikawa__trend-header">
            <h3>${t('trendTitle')}</h3>
            <button class="ishikawa__trend-close" data-ref="trendCloseBtn">&#x2715;</button>
          </div>
          <div class="ishikawa__trend-body" data-ref="trendContent"></div>
        </div>
      </div>`;
  },

  _renderDiffBanner(t) {
    if (!this._compareSnap) return '<div class="ishikawa__diff-banner" data-ref="diffBanner"></div>';

    const diff = this._getDiff();
    if (!diff) return '<div class="ishikawa__diff-banner" data-ref="diffBanner"></div>';

    return `
      <div class="ishikawa__diff-banner ishikawa__diff-banner--visible" data-ref="diffBanner">
        <div class="ishikawa__diff-title">${t('compareWith')}</div>
        <div class="ishikawa__diff-stats">
          <span class="ishikawa__diff-stat"><span class="ishikawa__diff-val ishikawa__diff-val--new">+${diff.added.length} ${t('diffNew')}</span></span>
          <span class="ishikawa__diff-stat"><span class="ishikawa__diff-val ishikawa__diff-val--del">&minus;${diff.removed.length} ${t('diffRemoved')}</span></span>
          <span class="ishikawa__diff-stat"><span class="ishikawa__diff-val ishikawa__diff-val--chg">&updownarrow;${diff.changed.length} ${t('diffChanged')}</span></span>
          <span class="ishikawa__diff-stat" style="color:var(--color-text-tertiary)">vs. &bdquo;${this._escapeHtml(this._compareSnap.name)}&ldquo;</span>
        </div>
        <button class="ishikawa__diff-close" data-ref="diffCloseBtn">${t('endCompare')}</button>
      </div>`;
  },

  _renderToolbar(t) {
    const cc = {};
    CATS.forEach(c => cc[c.key] = 0);
    this._rows.forEach(r => {
      const e = this._effCat(r);
      if (cc[e] !== undefined) cc[e]++;
    });

    const chips = CATS.map(c =>
      `<button class="ishikawa__filter-chip ${this._activeFilter === c.key ? 'ishikawa__filter-chip--active' : ''}"
              data-filter="${c.key}" style="border-left:3px solid ${c.color}">${this._escapeHtml(this._catLabel(c.key))} <span class="ishikawa__filter-chip-count">(${cc[c.key]})</span></button>`
    ).join('');

    const renameBtn = `<button class="ishikawa__cat-rename-btn" data-ref="renameCatsBtn"
              title="${t('renameCatsTitle')}" aria-label="${t('renameCatsTitle')}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
        </svg>
      </button>`;

    return `
      <div class="ishikawa__toolbar" style="margin-bottom:var(--spacing-sm)">
        <button class="btn btn--sm btn--primary" data-ref="addRowBtn">+ ${t('hypothesis')}</button>
        <button class="btn btn--sm" data-ref="expandAllBtn">${t('expandAll')}</button>
        <button class="btn btn--sm" data-ref="collapseAllBtn">${t('collapseAll')}</button>
        <div class="ishikawa__toolbar-spacer"></div>
        <div class="ishikawa__filter-group">
          <button class="ishikawa__filter-chip ${this._activeFilter === 'all' ? 'ishikawa__filter-chip--active' : ''}"
                  data-filter="all">${t('filterAll')} <span class="ishikawa__filter-chip-count">(${this._rows.length})</span></button>
          ${chips}
          ${renameBtn}
        </div>
      </div>`;
  },

  _renderTable(t) {
    const ord = this._ordered();
    const nums = this._buildNums();
    const diff = this._compareSnap ? this._getDiff() : null;

    const vis = ord.filter(r => {
      if (this._activeFilter !== 'all' && this._effCat(r) !== this._activeFilter) return false;
      return true;
    });

    // Header
    let head = `<tr>
      <th class="ishikawa__col-nr">#</th>
      <th class="ishikawa__col-cat">${t('category')}</th>
      <th class="ishikawa__col-name">${t('colName')}</th>
      <th>${t('colDescription')}</th>`;

    this._experts.forEach(e => {
      head += `<th class="ishikawa__col-expert">
        <div class="ishikawa__exp-col-head">
          <div class="ishikawa__exp-ini" style="background:${e.color}">${this._ini(e.name)}</div>
          <div class="ishikawa__exp-nm" title="${this._escapeAttr(e.name)}">${this._escapeHtml(e.name)}</div>
        </div>
      </th>`;
    });

    head += `<th class="ishikawa__col-score">${t('avgScore')}</th>
      <th class="ishikawa__col-status">${t('statusHeader')}</th>
      <th class="ishikawa__col-actions"></th></tr>`;

    // Body
    let body = '';
    if (!vis.length) {
      const cs = 5 + this._experts.length + 2;
      const msg = this._rows.length ? t('noCategoryHyp') : t('emptyHint');
      body = `<tr class="ishikawa__empty-row"><td colspan="${cs}">${msg}</td></tr>`;
    } else {
      vis.forEach(r => {
        const d = this._getDepth(r);
        const hid = this._isHidden(r);
        const hk = this._hasKids(r.id);
        const col = this._collapsed.has(r.id);
        const ec = this._effCat(r);
        const bcol = ec ? this._catColor(ec) : 'var(--color-border-secondary)';
        const score = this._calcScore(r);
        let diffCls = '';
        if (diff) {
          if (diff.addedSet.has(r.stableId)) diffCls = 'ishikawa__diff-new';
          else if (diff.changedMap[r.stableId]) diffCls = 'ishikawa__diff-chg';
        }

        const catOpts = CATS.map(c =>
          `<option value="${c.key}" ${r.category === c.key ? 'selected' : ''}>${this._escapeHtml(this._catLabel(c.key))}</option>`
        ).join('');

        const stOpts = STATUS_KEYS.map(s =>
          `<option value="${s}" ${r.status === s ? 'selected' : ''}>${t(`status.${s}`)}</option>`
        ).join('');

        const tgl = hk
          ? `<button class="ishikawa__toggle-btn ${col ? 'ishikawa__toggle-btn--collapsed' : ''}" data-toggle="${r.id}">&#x25BC;</button>`
          : `<div class="ishikawa__toggle-placeholder"></div>`;

        const defOpt = !r.category && ec ? `\u21B3 ${this._escapeHtml(this._catLabel(ec))}` : t('catChoose');
        const nameDup = this._isNameDuplicate(r.name, r.id) ? 'ishikawa__name-input--dup' : '';

        body += `<tr data-id="${r.id}" class="ishikawa__depth-${Math.min(d, 3)} ${hid ? 'ishikawa__row-hidden' : ''} ${diffCls}"
                     draggable="true">
          <td class="ishikawa__col-nr" style="padding-left:${12 + d * 16}px"><div class="ishikawa__nr-cell">${tgl}<span class="ishikawa__nr-text">${nums[r.id] || ''}</span></div></td>
          ${d > 0
            ? `<td><div class="ishikawa__cat-inherited" style="border-left:3px solid ${bcol}">${ec ? this._escapeHtml(this._catLabel(ec)) : ''}</div></td>`
            : `<td><select class="ishikawa__cat-select" data-row-cat="${r.id}" style="border-left:3px solid ${bcol}">
              <option value="" ${!r.category ? 'selected' : ''}>${defOpt}</option>${catOpts}</select></td>`
          }
          <td><input class="ishikawa__name-input ${nameDup}" type="text" value="${this._escapeAttr(r.name)}"
                     placeholder="${t('namePlaceholder')}" data-row-name="${r.id}" /></td>
          <td><div class="ishikawa__hypo-cell">
            <input class="ishikawa__desc-input" type="text" value="${this._escapeAttr(r.description)}"
                   placeholder="${d ? t('subCausePlaceholder') : t('causePlaceholder')}" data-row-desc="${r.id}" />
          </div></td>`;

        this._experts.forEach(e => {
          const val = r.ratings[e.id] !== undefined ? r.ratings[e.id] : '';
          body += `<td class="ishikawa__col-expert">
            <input type="number" class="ishikawa__rating-input" min="0" max="9"
                   value="${val}" placeholder="&ndash;" style="${val !== '' ? this._ratingBg(val) : ''}"
                   data-rating-row="${r.id}" data-rating-exp="${e.id}" />
          </td>`;
        });

        const chg = diff ? diff.changedMap[r.stableId] : null;
        const scoreHtml = this._scoreCellHtml(score, chg);

        const linkedExpCount = this._experiments.reduce(
          (acc, x) => acc + (Array.isArray(x.hypothesisIds) && x.hypothesisIds.includes(r.stableId) ? 1 : 0),
          0
        );
        const linkExpTitle = linkedExpCount > 0
          ? t('linkedExperimentsTooltip', { count: linkedExpCount })
          : t('linkExperimentsTitle');
        const linkExpBtn = `<button class="ishikawa__icon-btn ishikawa__icon-btn--exp${linkedExpCount > 0 ? ' ishikawa__icon-btn--linked' : ''}"
              title="${this._escapeAttr(linkExpTitle)}" aria-label="${this._escapeAttr(linkExpTitle)}" data-link-exp="${r.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9 3h6"/>
                <path d="M10 3v6L3.5 19.5A1.5 1.5 0 0 0 4.8 22h14.4a1.5 1.5 0 0 0 1.3-2.5L14 9V3"/>
                <path d="M7 15h10"/>
              </svg>
              ${linkedExpCount > 0 ? `<span class="ishikawa__exp-link-badge">${linkedExpCount}</span>` : ''}
            </button>`;

        body += `<td class="ishikawa__col-score">${scoreHtml}</td>
          <td><select class="ishikawa__status-select ${STATUS_CSS[r.status] || ''}" data-row-status="${r.id}">${stOpts}</select></td>
          <td><div class="ishikawa__row-actions">
            <button class="ishikawa__icon-btn" title="${t('addSub')}" data-add-sub="${r.id}">+</button>
            <button class="ishikawa__icon-btn" title="${t('duplicate')}" data-dupe="${r.id}">&#x2398;</button>
            ${linkExpBtn}
            <button class="ishikawa__icon-btn" title="${this._context.i18n.t('common.delete')}" data-del-row="${r.id}">&#x2715;</button>
          </div></td></tr>`;
      });
    }

    return `
      <div class="ishikawa__table-wrap">
        <table class="ishikawa__table">
          <thead>${head}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  },

  _renderSummary(t) {
    const total = this._rows.length;
    const roots = this._rows.filter(r => r.parentId === null).length;
    const subs = total - roots;
    const conf = this._rows.filter(r => r.status === 'confirmed').length;
    const scored = this._rows.map(r => ({ r, s: this._calcScore(r) })).filter(x => x.s !== null).sort((a, b) => b.s - a.s);
    const topScore = scored.length ? scored[0].s.toFixed(1) : '\u2013';

    const cc = {};
    CATS.forEach(c => cc[c.key] = 0);
    this._rows.forEach(r => {
      const e = this._effCat(r);
      if (cc[e] !== undefined) cc[e]++;
    });

    const catBar = CATS.map(c => {
      const p = total > 0 ? cc[c.key] / total * 100 : 0;
      return p > 0 ? `<div style="width:${p}%;background:${c.color}"></div>` : '';
    }).join('');

    return `
      <div class="ishikawa__summary-bar">
        <div class="ishikawa__summary-card">
          <div class="ishikawa__s-label">${t('hypotheses')}</div>
          <div class="ishikawa__s-value">${total} <span style="font-size:var(--font-size-xs);font-weight:400;color:var(--color-text-tertiary)">(${roots} ${t('main')} &middot; ${subs} ${t('sub')})</span></div>
          <div class="ishikawa__cat-bar">${catBar}</div>
        </div>
        <div class="ishikawa__summary-card"><div class="ishikawa__s-label">${t('expertTeam')}</div><div class="ishikawa__s-value">${this._experts.length}</div></div>
        <div class="ishikawa__summary-card"><div class="ishikawa__s-label">${t('highestAvg')}</div><div class="ishikawa__s-value" style="color:var(--color-accent)">${topScore}</div></div>
        <div class="ishikawa__summary-card"><div class="ishikawa__s-label">${t('status.confirmed')}</div><div class="ishikawa__s-value" style="color:#16a34a">${conf}</div></div>
        <div class="ishikawa__summary-card"><div class="ishikawa__s-label">${t('snapshots')}</div><div class="ishikawa__s-value">${this._snapshots.length}</div></div>
      </div>`;
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindEvents(t) {
    const el = this._container;

    // Tab switching
    el.querySelectorAll('.ishikawa__tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        if (target && target !== this._activeTab) {
          this._activeTab = target;
          this._render();
        }
      });
    });

    // ── Top row (experts) — present in all tabs ──
    // Expert add
    const expInp = el.querySelector('[data-ref="expertNameInput"]');
    const addExpBtn = el.querySelector('[data-ref="addExpertBtn"]');
    const doAddExp = () => {
      const name = expInp.value.trim();
      if (!name) return;
      if (this._experts.some(e => e.name.toLowerCase() === name.toLowerCase())) {
        this._context.notify(t('expertDuplicate'));
        return;
      }
      this._experts.push({ id: this._eUid(), name, color: EXP_COLS[this._experts.length % EXP_COLS.length] });
      expInp.value = '';
      this._save();
      this._render();
    };
    if (addExpBtn) addExpBtn.addEventListener('click', doAddExp);
    if (expInp) expInp.addEventListener('keydown', e => { if (e.key === 'Enter') doAddExp(); });

    // Expert remove
    el.querySelectorAll('.ishikawa__expert-rm').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.expertId, 10);
        this._experts = this._experts.filter(e => e.id !== id);
        this._rows.forEach(r => { delete r.ratings[id]; });
        this._save();
        this._render();
      });
    });

    // Expert rename (inline edit in tag)
    el.querySelectorAll('.ishikawa__expert-name-edit').forEach(inp => {
      const id = parseInt(inp.dataset.expertNameId, 10);
      const commit = () => {
        const exp = this._experts.find(e => e.id === id);
        if (!exp) return;
        const newName = inp.value.trim();
        if (!newName) { inp.value = exp.name; return; }
        if (newName === exp.name) return;
        if (this._experts.some(e => e.id !== id && e.name.toLowerCase() === newName.toLowerCase())) {
          this._context.notify(t('expertDuplicate'));
          inp.value = exp.name;
          inp.focus();
          inp.select();
          return;
        }
        exp.name = newName;
        this._save();
        this._render();
      };
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
        else if (e.key === 'Escape') {
          const exp = this._experts.find(x => x.id === id);
          if (exp) inp.value = exp.name;
          inp.blur();
        }
      });
      inp.addEventListener('blur', commit);
    });

    // Top toolbar export button — present in both tabs
    el.querySelector('[data-ref="exportCsvBtn"]')?.addEventListener('click', () => this._exportCSV(t));

    // Non-hypothesis tabs — bind their own events and return, since the
    // hypothesis-tab DOM doesn't exist on this render.
    if (this._activeTab === 'problem') {
      this._bindProblemEvents(t);
      return;
    }

    if (this._activeTab === 'experiments') {
      this._bindExperimentsEvents(t);
      return;
    }

    if (this._activeTab === 'facts') {
      this._bindFactsEvents(t);
      return;
    }

    // Snapshot save
    const snapInp = el.querySelector('[data-ref="snapNameInput"]');
    const saveSnapBtn = el.querySelector('[data-ref="saveSnapBtn"]');
    const doSaveSnap = () => {
      const name = (snapInp ? snapInp.value.trim() : '') || ('Snapshot ' + new Date().toLocaleDateString('de-DE'));
      this._snapshots.unshift({
        id: this._sUid(),
        name,
        date: new Date().toISOString(),
        data: { problem: this._problem, experts: JSON.parse(JSON.stringify(this._experts)), rows: JSON.parse(JSON.stringify(this._rows)) },
      });
      if (snapInp) snapInp.value = '';
      this._save();
      this._render();
    };
    if (saveSnapBtn) saveSnapBtn.addEventListener('click', doSaveSnap);
    if (snapInp) snapInp.addEventListener('keydown', e => { if (e.key === 'Enter') doSaveSnap(); });

    // Snapshot click/dblclick
    el.querySelectorAll('.ishikawa__snap-item').forEach(item => {
      const id = parseInt(item.dataset.snapId, 10);
      item.addEventListener('click', (e) => {
        if (e.target.closest('.ishikawa__snap-del')) return;
        this._compareWith(id);
      });
      item.addEventListener('dblclick', () => this._loadSnapshot(id, t));
    });

    // Snapshot delete
    el.querySelectorAll('.ishikawa__snap-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.snapDel, 10);
        this._snapshots = this._snapshots.filter(s => s.id !== id);
        if (this._compareSnap && this._compareSnap.id === id) this._compareSnap = null;
        this._save();
        this._render();
      });
    });

    // Trend toggle
    el.querySelector('[data-ref="trendBtn"]')?.addEventListener('click', () => {
      this._trendVisible = !this._trendVisible;
      this._render();
    });
    el.querySelector('[data-ref="trendCloseBtn"]')?.addEventListener('click', () => {
      this._trendVisible = false;
      this._render();
    });

    // Diff close
    el.querySelector('[data-ref="diffCloseBtn"]')?.addEventListener('click', () => {
      this._compareSnap = null;
      this._render();
    });

    // Toolbar
    el.querySelector('[data-ref="addRowBtn"]')?.addEventListener('click', () => this._addRow(null, t));
    el.querySelector('[data-ref="expandAllBtn"]')?.addEventListener('click', () => { this._collapsed.clear(); this._render(); });
    el.querySelector('[data-ref="collapseAllBtn"]')?.addEventListener('click', () => {
      this._rows.forEach(r => { if (this._hasKids(r.id)) this._collapsed.add(r.id); });
      this._render();
    });
    el.querySelector('[data-ref="renameCatsBtn"]')?.addEventListener('click', () => this._openCatRenameModal(t));

    // Filter chips
    el.querySelectorAll('.ishikawa__filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this._activeFilter = chip.dataset.filter;
        this._render();
      });
    });

    // Row events
    el.querySelectorAll('.ishikawa__toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.toggle, 10);
        this._collapsed.has(id) ? this._collapsed.delete(id) : this._collapsed.add(id);
        this._render();
      });
    });

    el.querySelectorAll('[data-row-cat]').forEach(sel => {
      sel.addEventListener('change', () => {
        const r = this._rows.find(x => x.id === parseInt(sel.dataset.rowCat, 10));
        if (r) { r.category = sel.value; this._save(); this._render(); }
      });
    });

    el.querySelectorAll('[data-row-name]').forEach(inp => {
      inp.addEventListener('input', () => {
        const r = this._rows.find(x => x.id === parseInt(inp.dataset.rowName, 10));
        if (r) { r.name = inp.value; this._save(); }
      });
    });

    el.querySelectorAll('[data-row-desc]').forEach(inp => {
      inp.addEventListener('input', () => {
        const r = this._rows.find(x => x.id === parseInt(inp.dataset.rowDesc, 10));
        if (r) { r.description = inp.value; this._save(); }
      });
    });

    el.querySelectorAll('[data-row-status]').forEach(sel => {
      sel.addEventListener('change', () => {
        const r = this._rows.find(x => x.id === parseInt(sel.dataset.rowStatus, 10));
        if (r) {
          r.status = sel.value;
          this._save();
          this._render();
        }
      });
    });

    el.querySelectorAll('.ishikawa__rating-input').forEach(inp => {
      inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('keydown', (e) => {
        if (['e','E','+','-','.', ','].includes(e.key)) e.preventDefault();
      });
      inp.addEventListener('change', () => {
        const rId = parseInt(inp.dataset.ratingRow, 10);
        const eId = parseInt(inp.dataset.ratingExp, 10);
        const r = this._rows.find(x => x.id === rId);
        if (!r) return;
        const val = inp.value;
        const n = parseInt(val, 10);
        if (val === '' || isNaN(n)) delete r.ratings[eId];
        else r.ratings[eId] = Math.max(0, Math.min(9, n));
        inp.value = r.ratings[eId] !== undefined ? r.ratings[eId] : '';
        inp.style.cssText = inp.value !== '' ? this._ratingBg(parseInt(inp.value, 10)) : '';
        this._save();
        this._updateRowScoreCell(r);
        this._refreshDerivedPanels(t);
      });
    });

    el.querySelectorAll('[data-add-sub]').forEach(btn => {
      btn.addEventListener('click', () => this._addRow(parseInt(btn.dataset.addSub, 10), t));
    });

    el.querySelectorAll('[data-dupe]').forEach(btn => {
      btn.addEventListener('click', () => this._dupeRow(parseInt(btn.dataset.dupe, 10)));
    });

    el.querySelectorAll('[data-del-row]').forEach(btn => {
      btn.addEventListener('click', () => this._delRow(parseInt(btn.dataset.delRow, 10)));
    });

    el.querySelectorAll('[data-link-exp]').forEach(btn => {
      btn.addEventListener('click', () => this._openExperimentLinkModal(parseInt(btn.dataset.linkExp, 10), t));
    });

    // Pareto source selector
    el.querySelector('[data-ref="paretoSelect"]')?.addEventListener('change', (e) => {
      this._paretoSource = e.target.value;
      this._renderParetoChart(t);
    });

    // Drag & drop
    this._initDragDrop();
  },

  // ─── Actions ────────────────────────────────────────────────

  _addRow(pid, t) {
    const nr = {
      id: this._uid(),
      stableId: this._nextStableId(),
      parentId: pid,
      category: '',
      name: '',
      description: '',
      ratings: {},
      status: 'open',
    };
    if (pid !== null) {
      const di = this._descIds(pid);
      const pi = this._rows.findIndex(r => r.id === pid);
      let ins = pi + 1;
      if (di.length) ins = Math.max(...di.map(d => this._rows.findIndex(r => r.id === d))) + 1;
      this._rows.splice(ins, 0, nr);
      this._collapsed.delete(pid);
    } else {
      this._rows.push(nr);
    }
    this._save();
    this._render();
    setTimeout(() => {
      const inp = this._container.querySelector(`tr[data-id="${nr.id}"] .ishikawa__name-input`);
      if (inp) inp.focus();
    }, 30);
  },

  async _delRow(id) {
    const row = this._rows.find(r => r.id === id);
    if (!row) return;
    const t = (key, params) => this._context.i18n.t(`modules.ishikawa.${key}`, params);
    const i18n = this._context.i18n;
    const descIds = this._descIds(id);
    const label = this._dName(row);
    const message = descIds.length > 0
      ? t('delRowConfirmWithSubs', { name: label, count: descIds.length })
      : t('delRowConfirm', { name: label });
    const confirmed = await this._context.confirmPopout(message, {
      title: i18n.t('common.delete'),
      confirmLabel: i18n.t('common.delete'),
      danger: true,
    });
    if (!confirmed) return;
    const rm = new Set([id, ...descIds]);
    const removedStableIds = new Set(
      this._rows.filter(r => rm.has(r.id) && r.stableId).map(r => r.stableId)
    );
    this._rows = this._rows.filter(r => !rm.has(r.id));
    rm.forEach(x => this._collapsed.delete(x));
    if (removedStableIds.size > 0 && this._experiments.length > 0) {
      this._experiments.forEach(exp => {
        if (Array.isArray(exp.hypothesisIds)) {
          exp.hypothesisIds = exp.hypothesisIds.filter(sid => !removedStableIds.has(sid));
        }
      });
    }
    this._save();
    this._render();
  },

  _dupeRow(id) {
    const src = this._rows.find(r => r.id === id);
    if (!src) return;
    const self = this;
    const t = (key) => this._context.i18n.t(`modules.ishikawa.${key}`);
    function cp(sid, npid) {
      const s = self._rows.find(r => r.id === sid);
      const nid = self._uid();
      const c = {
        id: nid,
        stableId: self._nextStableId(),
        parentId: npid,
        category: s.category,
        name: s.name + (sid === id ? ` (${t('copy')})` : ''),
        description: s.description,
        ratings: { ...s.ratings },
        status: s.status,
      };
      const di = self._descIds(sid);
      const si = self._rows.findIndex(r => r.id === sid);
      let ins = si + 1;
      if (di.length) ins = Math.max(...di.map(d => self._rows.findIndex(r => r.id === d))) + 1;
      self._rows.splice(ins, 0, c);
      self._rows.filter(r => r.parentId === sid && r.id !== nid).forEach(ch => cp(ch.id, nid));
    }
    cp(id, src.parentId);
    this._save();
    this._render();
  },

  // ─── Snapshots ──────────────────────────────────────────────

  async _loadSnapshot(id, t) {
    const snap = this._snapshots.find(s => s.id === id);
    if (!snap) return;
    const confirmed = await this._context.confirmPopout(t('loadSnapConfirm'));
    if (!confirmed) return;
    const d = snap.data;
    this._problem = d.problem || '';
    this._experts = JSON.parse(JSON.stringify(d.experts || []));
    this._rows = JSON.parse(JSON.stringify(d.rows || []));
    this._idC = Math.max(this._idC, ...this._rows.map(r => r.id), 0);
    this._expIdC = Math.max(this._expIdC, ...this._experts.map(e => e.id), 0);
    this._rows.forEach(r => {
      if (r.stableId) {
        const n = parseInt(r.stableId.split('-')[1]) || 0;
        if (n > this._stableIdC) this._stableIdC = n;
      }
    });
    this._collapsed.clear();
    this._save();
    this._render();
  },

  _compareWith(id) {
    const snap = this._snapshots.find(s => s.id === id);
    if (!snap) return;
    if (this._compareSnap && this._compareSnap.id === id) {
      this._compareSnap = null;
    } else {
      this._compareSnap = snap;
    }
    this._render();
  },

  _getDiff() {
    if (!this._compareSnap) return null;
    const oldRows = this._compareSnap.data.rows || [];
    const oldByStable = {};
    oldRows.forEach(r => { if (r.stableId) oldByStable[r.stableId] = r; });
    const newStables = new Set(this._rows.filter(r => r.stableId).map(r => r.stableId));
    const oldStables = new Set(oldRows.filter(r => r.stableId).map(r => r.stableId));
    const added = this._rows.filter(r => r.stableId && !oldStables.has(r.stableId));
    const removed = oldRows.filter(r => r.stableId && !newStables.has(r.stableId));
    const changed = [];
    this._rows.forEach(r => {
      if (!r.stableId || !oldByStable[r.stableId]) return;
      const old = oldByStable[r.stableId];
      const oS = this._calcScoreFor(old, this._compareSnap.data.experts || []) || 0;
      const nS = this._calcScore(r) || 0;
      if (Math.abs(oS - nS) > 0.01) changed.push({ row: r, oldScore: oS, newScore: nS, delta: nS - oS });
    });
    return {
      added, removed, changed,
      addedSet: new Set(added.map(r => r.stableId)),
      changedMap: Object.fromEntries(changed.map(c => [c.row.stableId, c])),
    };
  },

  // ─── Drag & Drop ────────────────────────────────────────────

  _initDragDrop() {
    let dragId = null;
    const el = this._container;

    el.querySelectorAll('tr[draggable]').forEach(tr => {
      tr.addEventListener('dragstart', (e) => {
        dragId = parseInt(tr.dataset.id, 10);
        tr.classList.add('ishikawa__dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      tr.addEventListener('dragend', () => {
        dragId = null;
        el.querySelectorAll('.ishikawa__dragging,.ishikawa__drag-over').forEach(x => x.classList.remove('ishikawa__dragging', 'ishikawa__drag-over'));
      });
      tr.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.querySelectorAll('.ishikawa__drag-over').forEach(x => x.classList.remove('ishikawa__drag-over'));
        tr.classList.add('ishikawa__drag-over');
      });
      tr.addEventListener('drop', (e) => {
        e.preventDefault();
        const tid = parseInt(tr.dataset.id, 10);
        if (dragId === null || dragId === tid) return;
        if (this._descIds(dragId).includes(tid)) return;
        const dr = this._rows.find(r => r.id === dragId);
        const grp = [dr, ...this._descIds(dragId).map(d => this._rows.find(r => r.id === d))].filter(Boolean);
        this._rows = this._rows.filter(r => !grp.some(g => g.id === r.id));
        const ti = this._rows.findIndex(r => r.id === tid);
        this._rows.splice(ti, 0, ...grp);
        const target = this._rows.find(r => r.id === tid);
        dr.parentId = target ? target.parentId : null;
        if (dr.parentId !== null) dr.category = '';
        this._save();
        this._render();
      });
    });
  },

  // ─── Category renaming ──────────────────────────────────────

  _openCatRenameModal(t) {
    const i18n = this._context.i18n;
    const rows = CATS.map(c => {
      const def = i18n.t(`modules.ishikawa.cat.${c.key}`);
      const cur = (this._catLabels && this._catLabels[c.key]) || '';
      return `
        <div class="ishikawa__cat-rename-row">
          <span class="ishikawa__cat-rename-swatch" style="background:${c.color}"></span>
          <span class="ishikawa__cat-rename-default">${this._escapeHtml(def)}</span>
          <input type="text" class="field" data-cat-key="${c.key}"
                 value="${this._escapeAttr(cur)}" placeholder="${this._escapeAttr(def)}" maxlength="40" />
        </div>`;
    }).join('');

    const html = `
      <div class="ishikawa__cat-rename">
        <p class="ishikawa__cat-rename-hint">${t('renameCatsHint')}</p>
        ${rows}
      </div>`;

    this._context.showModal.form(t('renameCatsTitle'), html, {
      confirmLabel: i18n.t('common.save'),
      onConfirm: (body) => {
        const next = {};
        const seen = new Map();
        let dup = false;
        body.querySelectorAll('input[data-cat-key]').forEach(inp => {
          const key = inp.dataset.catKey;
          const val = inp.value.trim();
          next[key] = val;
        });
        // Compute effective labels (override or default) and check uniqueness
        for (const c of CATS) {
          const eff = (next[c.key] || i18n.t(`modules.ishikawa.cat.${c.key}`)).toLowerCase();
          if (seen.has(eff)) { dup = true; break; }
          seen.set(eff, c.key);
        }
        if (dup) {
          this._context.notify(t('renameCatsDuplicate'));
          return false;
        }
        this._catLabels = next;
        this._save();
        this._render();
      },
    });
  },

  _truncate(s, n) {
    return s.length > n ? s.substring(0, n - 1) + '\u2026' : s;
  },

  // ─── Export ─────────────────────────────────────────────────

  _exportCSV(t) {
    const ord = this._ordered();
    const nums = this._buildNums();
    let csv = '\uFEFF';
    csv += `"${t('problemStatement')}","${(this._problem || '').replace(/"/g, '""')}"\n\n`;
    csv += `"#","${t('level')}","${t('category')}","${t('effCat')}","${t('name')}","${t('description')}"`;
    this._experts.forEach(e => { csv += `,"${e.name.replace(/"/g, '""')}"`; });
    csv += `,"${t('avgScore')}","${t('status')}"\n`;
    ord.forEach(r => {
      const d = this._getDepth(r);
      const s = this._calcScore(r);
      const catName = r.category ? this._catLabel(r.category) : '';
      const effCatName = this._effCat(r) ? this._catLabel(this._effCat(r)) : '';
      const lvl = d === 0 ? t('main') : 'Sub';
      csv += `"${nums[r.id]}","${lvl}","${catName}","${effCatName}","${(r.name || '').replace(/"/g, '""')}","${'  '.repeat(d)}${(r.description || '').replace(/"/g, '""')}"`;
      this._experts.forEach(e => {
        csv += `,"${r.ratings[e.id] !== undefined ? r.ratings[e.id] : ''}"`;
      });
      csv += `,"${s !== null ? s.toFixed(1) : ''}","${r.status ? t(`status.${r.status}`) : ''}"\n`;
    });

    if (this._facts.length) {
      csv += '\n';
      csv += `"${t('tabFacts')}"\n`;
      csv += `"#","${t('factName')}","${t('factDescription')}","${t('factDate')}","${t('factOwner')}"\n`;
      this._facts.forEach((f, idx) => {
        const esc = (v) => String(v ?? '').replace(/"/g, '""');
        csv += `"${idx + 1}","${esc(f.name)}","${esc(f.description)}","${esc(f.date)}","${esc(f.owner)}"\n`;
      });
    }

    this._downloadFile(csv, 'ishikawa-6m-export.csv', 'text/csv;charset=utf-8');
    this._context.notify(t('exportedCSV'));
  },

  _downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ─── Persistence ────────────────────────────────────────────

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      this.getState()
    );
  },

  // ─── Helpers ────────────────────────────────────────────────

  _escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  _escapeAttr(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  },
};

Object.assign(mod, problemMethods, experimentsMethods, factsMethods, chartsMethods);
export default mod;
