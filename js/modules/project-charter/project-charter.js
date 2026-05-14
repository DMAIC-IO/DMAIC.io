/**
 * D.Mike — Project Charter Module (project-charter.js)
 * Define phase: problem statement + numbered goals with target date,
 * metric, target value, and goal achievement level (ZEG/GAL).
 * Includes a canvas-based org chart with pan/zoom, drag, and auto-layout.
 *
 * Spec: docs/modules/PROJECT-CHARTER.md
 */

import { createModebar, exportSvgAsPNG, exportSvgAsFile } from '../../core/chart/modebar.js';
import { edSection, edInlineNum, edSelectRow, edColorPair, openColorPicker } from '../../core/chart/chart-editor.js';

const NW = 220;   // node width (px)
const HG = 44;    // horizontal gap between sibling subtrees
const VG = 36;    // vertical gap between parent and children

/** Default org chart style values */
const ORG_STYLE_DEFAULTS = {
  nodeBg: '', nodeBorderColor: '', nodeBorderStyle: 'solid',
  nodeBorderWidth: 1, lineColor: '', lineStyle: 'solid', lineWidth: 2,
};

/** Map line style names to SVG stroke-dasharray values */
const DASH_MAP = { solid: 'none', dashed: '8 4', dotted: '2 4' };

export default {
  id: 'project-charter',
  phase: 'define',
  icon: 'clipboard-check',
  i18nKey: 'modules.project-charter',
  version: '0.1.0',

  /** @type {object} context passed from Workspace */
  _context: null,
  /** @type {HTMLElement} */
  _container: null,
  /** @type {string} */
  _problemStatement: '',
  /** @type {Array<object>} */
  _goals: [],
  /** @type {Array<object>} flat org nodes [{id, title, desc, pid, _col, _h, _x, _y}] */
  _orgNodes: [],
  /** @type {string|null} selected node id */
  _orgSel: null,
  /** @type {{x:number,y:number}} pan offset */
  _orgPan: { x: 0, y: 0 },
  /** @type {number} zoom level */
  _orgZoom: 1,
  /** @type {object|null} modebar instance from chart framework */
  _modebar: null,
  /** @type {object} org chart visual style overrides */
  _orgStyle: {
    nodeBg: '',
    nodeBorderColor: '',
    nodeBorderStyle: 'solid',
    nodeBorderWidth: 1,
    lineColor: '',
    lineStyle: 'solid',
    lineWidth: 2,
  },
  /** @type {boolean} editor panel open state */
  _orgEditorOpen: false,
  /** @type {Array<string>} undo stack (JSON snapshots of getState()) */
  _undoStack: [],
  /** @type {number} max undo depth */
  _undoMax: 50,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    this._undoStack = [];

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._problemStatement = saved.problemStatement ?? '';
      this._goals = saved.goals ?? [];
      this._orgNodes = this._importOrgChart(saved.orgChart);
      this._orgStyle = Object.assign({ ...ORG_STYLE_DEFAULTS }, saved.orgStyle || {});
    }

    this._render();
  },

  async destroy() {
    if (this._modebar) {
      this._modebar.destroy();
      this._modebar = null;
    }
    this._container.innerHTML = '';
  },

  onLanguageChange(_lang) {
    this._render();
  },

  onThemeChange(_theme) {
    // CSS custom properties handle theme changes automatically
  },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return {
      problemStatement: this._problemStatement,
      goals: this._goals,
      orgChart: this._orgNodes.map(n => {
        const o = { id: n.id, title: n.title, desc: n.desc, pid: n.pid };
        if (n.bg) o.bg = n.bg;
        if (n.borderColor) o.borderColor = n.borderColor;
        if (n.borderStyle && n.borderStyle !== 'solid') o.borderStyle = n.borderStyle;
        if (n.borderWidth && n.borderWidth !== 1) o.borderWidth = n.borderWidth;
        return o;
      }),
      orgStyle: { ...this._orgStyle },
    };
  },

  setState(data) {
    this._problemStatement = data.problemStatement ?? '';
    this._goals = data.goals ?? [];
    this._orgNodes = this._importOrgChart(data.orgChart);
    this._orgStyle = Object.assign({ ...ORG_STYLE_DEFAULTS }, data.orgStyle || {});
    this._render();
  },
  /**
   * Load a catalog example. Editorial — no worksheet is provisioned.
   * @param { meta: object, data: object } payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!this._problemStatement || (this._goals?.length || 0) > 0 || (this._orgNodes?.length || 0) > 0;
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

  help: () => import('./project-charter-help.js'),

  // ─── Import: handle both flat and recursive formats ─────────

  _importOrgChart(data) {
    if (!Array.isArray(data) || !data.length) return [];

    // Detect recursive format (has `children` key)
    if (data[0].children !== undefined) {
      const flat = [];
      const walk = (nodes, pid) => {
        for (const n of nodes) {
          flat.push({
            id: n.id, title: n.title ?? '',
            desc: n.description ?? n.desc ?? '',
            pid, bg: n.bg || '', borderColor: n.borderColor || '',
            borderStyle: n.borderStyle || '', borderWidth: n.borderWidth || 0,
            _col: false, _h: false, _x: 0, _y: 0,
          });
          if (n.children?.length) walk(n.children, n.id);
        }
      };
      walk(data, null);
      return flat;
    }

    // Flat format — normalise internal fields
    return data.map(n => ({
      id: n.id, title: n.title ?? '',
      desc: n.desc ?? n.description ?? '',
      pid: n.pid ?? null,
      bg: n.bg || '', borderColor: n.borderColor || '',
      borderStyle: n.borderStyle || '', borderWidth: n.borderWidth || 0,
      _col: false, _h: false, _x: 0, _y: 0,
    }));
  },

  // ─── Main Render ────────────────────────────────────────────

  _render() {
    const i18n = this._context.i18n;
    const t = (key, params) => i18n.t(`modules.project-charter.${key}`, params);

    this._container.innerHTML = `
      <div class="module-container pc">
        <div class="module-container__header">
          <h2 class="module-container__title">${i18n.t('modules.project-charter.name')}</h2>
        </div>

        <div class="module-container__body">

          <!-- Problem Statement -->
          <section class="pc__section">
            <div class="dmike-split__output-section">${t('problemStatement')}</div>
            <div class="pc__problem-wrap">
              <div class="pc__problem-toolbar">
                <button class="pc__fmt-btn" data-cmd="bold" title="${t('fmtBold')}" aria-label="${t('fmtBold')}"><strong>B</strong></button>
                <button class="pc__fmt-btn" data-cmd="italic" title="${t('fmtItalic')}" aria-label="${t('fmtItalic')}"><em>I</em></button>
              </div>
              <div
                class="field pc__problem-editor${!this._problemStatement ? ' pc__problem-editor--empty' : ''}"
                contenteditable="true"
                role="textbox"
                aria-multiline="true"
                data-placeholder="${t('problemPlaceholder')}"
                aria-label="${t('problemStatement')}"
              >${this._prepareHtml(this._problemStatement)}</div>
              <div class="pc__char-count">${t('charCount', { current: this._plainTextLength(this._problemStatement), max: 10000 })}</div>
            </div>
          </section>

          <!-- Goals -->
          <section class="pc__section">
            <div class="dmike-split__output-section">${t('goals')}</div>

            ${this._goals.length === 0
              ? `<p class="pc__no-goals">${t('noGoals')}</p>`
              : `<div class="pc__goals-table-wrap">
                  <table class="pc__goals-table">
                    <thead>
                      <tr>
                        <th class="pc__col-nr">#</th>
                        <th class="pc__col-drag" aria-label="Reihenfolge"></th>
                        <th>${t('goalDescription')}</th>
                        <th class="pc__col-date">${t('goalTargetDate')}</th>
                        <th class="pc__col-metric">${t('goalMetric')}</th>
                        <th class="pc__col-target">${t('goalTargetValue')}</th>
                        <th class="pc__col-zeg" title="${t('goalAchievementFull')}">${t('goalAchievement')}</th>
                        <th class="pc__col-del" aria-label="${t('deleteGoal')}"></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${this._goals.map((g, i) => this._renderGoalRow(g, i, t)).join('')}
                    </tbody>
                  </table>
                </div>`
            }

            <button class="btn btn--secondary btn--sm pc__add-btn" type="button">
              + ${t('addGoal')}
            </button>
          </section>

          <!-- Org Chart -->
          <section class="pc__section pc__org-section">
            <div class="dmike-split__output-section">${t('orgChart')}</div>
            <div class="pc__org-toolbar">
              <button class="btn btn--primary btn--sm pc__org-add-btn" type="button">+ ${t('orgNew')}</button>
              <button class="btn btn--sm pc__org-layout-btn" type="button">${t('orgLayout')}</button>
              <button class="btn btn--sm pc__org-undo-btn" type="button" ${this._undoStack.length === 0 ? 'disabled' : ''} title="${t('orgUndo')}">↩ ${t('orgUndo')}</button>
            </div>
            <div class="pc__org-card" data-ref="orgCard">
              <div class="pc__org-wrap" data-ref="orgWrap">
                <div class="pc__org-canvas" data-ref="orgCanvas">
                  <svg class="pc__org-lines" data-ref="orgLines"></svg>
                </div>
                <div class="pc__org-empty${this._orgNodes.length ? ' pc__org-empty--hidden' : ''}" data-ref="orgEmpty">
                  <p>${t('noOrgChart')}</p>
                </div>
              </div>
              <div class="pc__org-editor${this._orgEditorOpen ? ' pc__org-editor--open' : ''}" data-ref="orgEditor">
                <div class="pc__org-editor-inner" data-ref="orgEditorInner"></div>
              </div>
            </div>
          </section>

        </div>
      </div>
    `;

    this._bindEvents(t);
    this._orgRenderNodes(t);
    this._orgLayoutAll();
    this._orgPosDom();
    this._orgDrawLines();
    this._orgApplyTransform();
    this._orgInitModebar();
    this._orgApplyStyle();
    if (this._orgEditorOpen) this._orgBuildEditor();

    // Auto-fit on first render if there are nodes
    if (this._orgNodes.length) {
      requestAnimationFrame(() => this._orgFit());
    }
  },

  _reorderGoal(srcId, targetId, after) {
    const srcIdx = this._goals.findIndex(g => g.id === srcId);
    if (srcIdx < 0) return;
    this._pushUndo();
    const [moved] = this._goals.splice(srcIdx, 1);
    let targetIdx = this._goals.findIndex(g => g.id === targetId);
    if (targetIdx < 0) { this._goals.push(moved); }
    else {
      if (after) targetIdx += 1;
      this._goals.splice(targetIdx, 0, moved);
    }
    this._save();
    this._render();
  },

  _renderGoalRow(goal, index, t) {
    const zeg = Math.max(0, Math.min(100, goal.achievementLevel ?? 0));
    const zegColor = zeg === 100 ? 'var(--color-success)'
                   : zeg >= 75  ? 'var(--color-info)'
                   : zeg >= 25  ? 'var(--color-warning)'
                   : 'var(--color-error)';

    const dateInPast = goal.targetDate && new Date(goal.targetDate) < new Date(new Date().toDateString());

    return `
      <tr class="pc__goal-row" data-id="${goal.id}">
        <td class="pc__col-nr">${index + 1}</td>
        <td class="pc__col-drag" draggable="true" aria-hidden="true">⠿</td>
        <td>
          <input
            class="field field--sm field--ghost pc__cell-input"
            type="text"
            value="${this._escapeHtml(goal.description)}"
            data-field="description"
            placeholder="${t('goalDescription')}"
            aria-label="${t('goalDescription')}"
          >
        </td>
        <td class="pc__col-date">
          <input
            class="field field--sm field--ghost pc__cell-input${dateInPast ? ' pc__date--past' : ''}"
            type="date"
            value="${goal.targetDate ?? ''}"
            data-field="targetDate"
            aria-label="${t('goalTargetDate')}"
            ${dateInPast ? `title="${t('dateInPast')}"` : ''}
          >
        </td>
        <td class="pc__col-metric">
          <input
            class="field field--sm field--ghost pc__cell-input"
            type="text"
            value="${this._escapeHtml(goal.metric ?? '')}"
            data-field="metric"
            placeholder="${t('goalMetric')}"
            aria-label="${t('goalMetric')}"
          >
        </td>
        <td class="pc__col-target">
          <input
            class="field field--sm field--ghost pc__cell-input"
            type="text"
            value="${this._escapeHtml(goal.targetValue ?? '')}"
            data-field="targetValue"
            placeholder="${t('goalTargetValue')}"
            aria-label="${t('goalTargetValue')}"
          >
        </td>
        <td class="pc__col-zeg">
          <div class="pc__zeg-wrap">
            <input
              class="field field--sm field--ghost pc__zeg-input"
              type="number"
              min="0"
              max="100"
              value="${zeg}"
              data-field="achievementLevel"
              aria-label="${t('goalAchievementFull')}"
              title="${t('goalAchievementTooltip')}"
            >
            <div class="pc__zeg-bar-track">
              <div
                class="pc__zeg-bar-fill"
                style="width:${zeg}%; background:${zegColor}"
              ></div>
            </div>
            ${zeg === 100 ? '<span class="pc__zeg-done" aria-label="Erreicht">✓</span>' : ''}
          </div>
        </td>
        <td class="pc__col-del">
          <button
            class="btn btn--icon btn--ghost pc__del-btn"
            type="button"
            title="${t('deleteGoal')}"
            aria-label="${t('deleteGoal')}"
          >🗑</button>
        </td>
      </tr>
    `;
  },

  // ═══════════════════════════════════════════════════════════
  // ORG CHART — Canvas-based with pan/zoom/drag/layout
  // ═══════════════════════════════════════════════════════════

  _orgChildren(pid) {
    return this._orgNodes.filter(n => n.pid === pid && !n._h);
  },

  _orgNodeHeight(id) {
    const el = this._container.querySelector(`[data-org-id="${id}"]`);
    return el ? el.offsetHeight : 70;
  },

  _orgSubtreeWidth(id) {
    const n = this._orgNodes.find(x => x.id === id);
    if (!n || n._col) return NW;
    const ch = this._orgChildren(id);
    if (!ch.length) return NW;
    let w = 0;
    ch.forEach((c, i) => {
      w += this._orgSubtreeWidth(c.id);
      if (i < ch.length - 1) w += HG;
    });
    return Math.max(NW, w);
  },

  _orgLayNode(id, x, y) {
    const n = this._orgNodes.find(nd => nd.id === id);
    if (!n) return;
    n._x = x;
    n._y = y;
    const ch = this._orgChildren(id);
    if (!ch.length || n._col) return;
    const cy = y + this._orgNodeHeight(id) + VG;
    const ws = ch.map(c => this._orgSubtreeWidth(c.id));
    let total = 0;
    ws.forEach((w, i) => { total += w; if (i < ws.length - 1) total += HG; });
    let cx = x + NW / 2 - total / 2;
    ch.forEach((nd, i) => {
      this._orgLayNode(nd.id, cx + ws[i] / 2 - NW / 2, cy);
      cx += ws[i] + HG;
    });
  },

  _orgLayoutAll() {
    // Mark hidden nodes (children of collapsed)
    this._orgNodes.forEach(n => n._h = false);
    const markHidden = (pid) => {
      const p = this._orgNodes.find(n => n.id === pid);
      if (!p || !p._col) return;
      this._orgNodes.filter(n => n.pid === pid).forEach(c => {
        c._h = true;
        markHidden(c.id);
      });
    };
    this._orgNodes.forEach(n => { if (n._col) markHidden(n.id); });

    // Layout root nodes
    const roots = this._orgNodes.filter(n => n.pid === null && !n._h);
    let ox = 0;
    roots.forEach(r => {
      const w = this._orgSubtreeWidth(r.id);
      this._orgLayNode(r.id, ox + w / 2 - NW / 2, 60);
      ox += w + HG * 2;
    });
  },

  _orgRenderNodes(t) {
    const canvas = this._container.querySelector('[data-ref="orgCanvas"]');
    if (!canvas) return;

    // Remove existing node elements
    canvas.querySelectorAll('.pc__org-node').forEach(e => e.remove());

    const visible = this._orgNodes.filter(n => !n._h);
    visible.forEach(n => {
      const childCount = this._orgNodes.filter(c => c.pid === n.id).length;
      const isSel = n.id === this._orgSel;

      const div = document.createElement('div');
      div.className = `pc__org-node${isSel ? ' pc__org-node--sel' : ''}`;
      div.dataset.orgId = n.id;
      div.style.left = n._x + 'px';
      div.style.top = n._y + 'px';
      div.style.width = NW + 'px';
      // Per-node style overrides
      if (n.bg) div.style.background = n.bg;
      if (n.borderColor) div.style.borderColor = n.borderColor;
      if (n.borderStyle) div.style.borderStyle = n.borderStyle;
      if (n.borderWidth) div.style.borderWidth = n.borderWidth + 'px';

      div.innerHTML = `
        <div class="pc__org-dot-t"></div>
        <div class="pc__org-node-title">${this._escapeHtml(n.title)}</div>
        ${n.desc ? `<div class="pc__org-node-desc">${this._escapeHtml(n.desc)}</div>` : ''}
        <div class="pc__org-node-bar">
          <button class="pc__org-node-btn" data-action="add" title="${t('addChild')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="pc__org-node-btn" data-action="edit" title="${this._context.i18n.t('common.edit')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          ${childCount ? `<button class="pc__org-node-btn" data-action="toggle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${n._col ? '<polyline points="6 9 12 15 18 9"/>' : '<polyline points="18 15 12 9 6 15"/>'}</svg>${n._col ? childCount : ''}
          </button>` : ''}
          <button class="pc__org-node-btn pc__org-node-btn--del" data-action="del" title="${this._context.i18n.t('common.delete')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
        <div class="pc__org-dot-b"></div>
      `;

      // Node events
      div.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.pc__org-node-btn')) return;
        e.stopPropagation();
        this._orgSelect(n.id);
        this._orgStartDrag(n.id, e);
      });

      // Button events
      div.querySelectorAll('.pc__org-node-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          if (action === 'add') this._orgOpenAdd(n.id, t);
          else if (action === 'edit') this._orgOpenEdit(n.id, t);
          else if (action === 'toggle') this._orgToggleCollapse(n.id, t);
          else if (action === 'del') this._orgDeleteNode(n.id, t);
        });
      });

      canvas.appendChild(div);
    });

    // Update empty state
    const empty = this._container.querySelector('[data-ref="orgEmpty"]');
    if (empty) empty.classList.toggle('pc__org-empty--hidden', this._orgNodes.length > 0);
  },

  _orgPosDom() {
    this._orgNodes.filter(n => !n._h).forEach(n => {
      const el = this._container.querySelector(`[data-org-id="${n.id}"]`);
      if (el) { el.style.left = n._x + 'px'; el.style.top = n._y + 'px'; }
    });
  },

  _orgDrawLines() {
    const svg = this._container.querySelector('[data-ref="orgLines"]');
    if (!svg) return;
    svg.innerHTML = '';

    // Compute bounding box of all visible nodes so the SVG covers the full canvas
    let maxX = 0, maxY = 0;
    this._orgNodes.filter(n => !n._h).forEach(n => {
      const el = this._container.querySelector(`[data-org-id="${n.id}"]`);
      const h = el ? el.offsetHeight : 80;
      maxX = Math.max(maxX, n._x + NW);
      maxY = Math.max(maxY, n._y + h);
    });
    svg.setAttribute('width', maxX + 50);
    svg.setAttribute('height', maxY + 50);

    this._orgNodes.filter(n => !n._h && n.pid !== null).forEach(n => {
      const parent = this._orgNodes.find(p => p.id === n.pid);
      if (!parent || parent._h) return;
      const pe = this._container.querySelector(`[data-org-id="${parent.id}"]`);
      const ce = this._container.querySelector(`[data-org-id="${n.id}"]`);
      if (!pe || !ce) return;

      const x1 = parent._x + NW / 2;
      const y1 = parent._y + pe.offsetHeight;
      const x2 = n._x + NW / 2;
      const y2 = n._y;
      const mid = y1 + (y2 - y1) / 2;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${x1} ${y1}C${x1} ${mid},${x2} ${mid},${x2} ${y2}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', this._orgStyle.lineColor ||
        getComputedStyle(svg).getPropertyValue('--color-border-secondary').trim() || '#94a3b8');
      path.setAttribute('stroke-width', String(this._orgStyle.lineWidth || 2));
      const dash = DASH_MAP[this._orgStyle.lineStyle];
      if (dash && dash !== 'none') path.setAttribute('stroke-dasharray', dash);
      path.setAttribute('stroke-linecap', 'round');
      if (n.id === this._orgSel || parent.id === this._orgSel) {
        path.classList.add('pc__org-line--hl');
      }
      svg.appendChild(path);
    });
  },

  _orgApplyTransform() {
    const canvas = this._container.querySelector('[data-ref="orgCanvas"]');
    if (!canvas) return;
    canvas.style.transform = `translate(${this._orgPan.x}px,${this._orgPan.y}px) scale(${this._orgZoom})`;
  },

  // ─── Pan / Zoom ─────────────────────────────────────────────

  _orgBindPanZoom() {
    const wrap = this._container.querySelector('[data-ref="orgWrap"]');
    if (!wrap) return;

    let panning = false, startX = 0, startY = 0;

    wrap.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.pc__org-node')) return;
      panning = true;
      startX = e.clientX - this._orgPan.x;
      startY = e.clientY - this._orgPan.y;
      this._orgDeselect();
    });

    const onMove = (e) => {
      if (!panning) return;
      this._orgPan.x = e.clientX - startX;
      this._orgPan.y = e.clientY - startY;
      this._orgApplyTransform();
    };

    const onUp = () => { panning = false; };

    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerup', onUp);
    wrap.addEventListener('pointerleave', onUp);

    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const oz = this._orgZoom;
      this._orgZoom = Math.min(3, Math.max(0.1, this._orgZoom * (e.deltaY > 0 ? 0.92 : 1.08)));
      this._orgPan.x = mx - (mx - this._orgPan.x) * (this._orgZoom / oz);
      this._orgPan.y = my - (my - this._orgPan.y) * (this._orgZoom / oz);
      this._orgApplyTransform();
    }, { passive: false });
  },

  _orgZoomIn() {
    const wrap = this._container.querySelector('[data-ref="orgWrap"]');
    if (!wrap) return;
    const cx = wrap.clientWidth / 2, cy = wrap.clientHeight / 2;
    const oz = this._orgZoom;
    this._orgZoom = Math.min(3, this._orgZoom * 1.2);
    this._orgPan.x = cx - (cx - this._orgPan.x) * (this._orgZoom / oz);
    this._orgPan.y = cy - (cy - this._orgPan.y) * (this._orgZoom / oz);
    this._orgApplyTransform();
  },

  _orgZoomOut() {
    const wrap = this._container.querySelector('[data-ref="orgWrap"]');
    if (!wrap) return;
    const cx = wrap.clientWidth / 2, cy = wrap.clientHeight / 2;
    const oz = this._orgZoom;
    this._orgZoom = Math.max(0.1, this._orgZoom / 1.2);
    this._orgPan.x = cx - (cx - this._orgPan.x) * (this._orgZoom / oz);
    this._orgPan.y = cy - (cy - this._orgPan.y) * (this._orgZoom / oz);
    this._orgApplyTransform();
  },

  _orgFit() {
    const wrap = this._container.querySelector('[data-ref="orgWrap"]');
    if (!wrap || !this._orgNodes.length) return;

    const visible = this._orgNodes.filter(n => !n._h);
    if (!visible.length) return;

    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    visible.forEach(n => {
      const h = this._orgNodeHeight(n.id);
      x1 = Math.min(x1, n._x);
      y1 = Math.min(y1, n._y);
      x2 = Math.max(x2, n._x + NW);
      y2 = Math.max(y2, n._y + h);
    });

    const tw = x2 - x1, th = y2 - y1;
    const pad = 40;
    const aw = wrap.clientWidth - pad * 2;
    const ah = wrap.clientHeight - pad * 2;

    this._orgZoom = Math.min(1.5, Math.min(aw / tw, ah / th)) * 0.8;
    this._orgZoom = Math.max(0.1, this._orgZoom);
    this._orgPan.x = (wrap.clientWidth - tw * this._orgZoom) / 2 - x1 * this._orgZoom;
    this._orgPan.y = (wrap.clientHeight - th * this._orgZoom) / 2 - y1 * this._orgZoom;
    this._orgApplyTransform();
  },

  // ─── Drag ───────────────────────────────────────────────────

  _orgStartDrag(id, ev) {
    const n = this._orgNodes.find(x => x.id === id);
    if (!n) return;
    const startX = ev.clientX, startY = ev.clientY;
    const origX = n._x, origY = n._y;
    let moved = false;
    let siblingReordered = false;
    let undoPushed = false;

    const wrap = this._container.querySelector('[data-ref="orgWrap"]');

    const onMove = (e) => {
      const dx = (e.clientX - startX) / this._orgZoom;
      const dy = (e.clientY - startY) / this._orgZoom;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      if (!moved) return;
      if (!undoPushed) { this._pushUndo(); undoPushed = true; }
      n._x = origX + dx;
      n._y = origY + dy;
      const el = this._container.querySelector(`[data-org-id="${id}"]`);
      if (el) {
        el.style.left = n._x + 'px';
        el.style.top = n._y + 'px';
        el.classList.add('pc__org-node--drag');
      }
      // Enable transition class for smooth sibling shifting
      if (wrap && !wrap.classList.contains('pc__org-wrap--reordering')) {
        wrap.classList.add('pc__org-wrap--reordering');
      }
      // Attempt sibling reorder based on x-position
      siblingReordered = this._orgTryReorderSiblings(id) || siblingReordered;
      // Reset flag if node is far from siblings (user is reparenting instead)
      if (!this._orgIsNearSiblings(id)) siblingReordered = false;
      this._orgDrawLines();
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const el = this._container.querySelector(`[data-org-id="${id}"]`);
      if (el) el.classList.remove('pc__org-node--drag');
      if (wrap) wrap.classList.remove('pc__org-wrap--reordering');
      this._orgHideDropIndicator();
      if (moved) {
        if (!siblingReordered) this._orgReparent(id);
        this._save();
        this._orgRefresh();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  },

  /**
   * During drag, check if the dragged node's x-position among its siblings
   * suggests a different order. If so, reorder in array, re-layout siblings,
   * and show a drop indicator. Returns true if a reorder happened.
   */
  _orgTryReorderSiblings(dragId) {
    const dragNode = this._orgNodes.find(n => n.id === dragId);
    if (!dragNode) return false;

    const pid = dragNode.pid;
    // Get current sibling order (preserves _orgNodes array order)
    const siblings = this._orgNodes.filter(n => n.pid === pid && !n._h);
    if (siblings.length < 2) { this._orgHideDropIndicator(); return false; }

    const dragCenterX = dragNode._x + NW / 2;
    const others = siblings.filter(n => n.id !== dragId);

    // Only reorder if the dragged node is roughly at the sibling y-level
    if (others.length > 0) {
      const refY = others[0]._y;
      const refH = this._orgNodeHeight(others[0].id);
      const tolerance = refH + VG / 2;
      if (Math.abs(dragNode._y - refY) > tolerance) {
        this._orgHideDropIndicator();
        return false;
      }
    }

    // Determine desired insert position among non-dragged siblings
    let insertIdx = others.length;
    for (let i = 0; i < others.length; i++) {
      if (dragCenterX < others[i]._x + NW / 2) {
        insertIdx = i;
        break;
      }
    }

    // Build desired order
    const desired = [...others];
    desired.splice(insertIdx, 0, dragNode);

    // Check if order actually changed
    const changed = desired.some((n, i) => n.id !== siblings[i].id);

    // Show drop indicator at the insertion gap
    this._orgShowDropIndicator(dragId, pid, insertIdx, others);

    if (!changed) return false;

    // Apply new order: collect indices of siblings in _orgNodes, reassign
    const sibIndices = [];
    this._orgNodes.forEach((n, i) => {
      if (siblings.some(s => s.id === n.id)) sibIndices.push(i);
    });
    desired.forEach((node, i) => {
      this._orgNodes[sibIndices[i]] = node;
    });

    // Re-layout all, then restore dragged node to mouse position
    const savedX = dragNode._x, savedY = dragNode._y;
    this._orgLayoutAll();
    dragNode._x = savedX;
    dragNode._y = savedY;
    this._orgPosDom();

    return true;
  },

  /**
   * Show a vertical drop indicator line at the insertion gap among siblings.
   */
  _orgShowDropIndicator(dragId, pid, insertIdx, others) {
    let indicator = this._container.querySelector('.pc__org-drop-line');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'pc__org-drop-line';
      this._container.querySelector('[data-ref="orgCanvas"]')?.appendChild(indicator);
    }

    if (others.length === 0) { indicator.style.display = 'none'; return; }

    // Compute the x-position of the gap
    let gapX;
    if (insertIdx === 0) {
      gapX = others[0]._x - HG / 2;
    } else if (insertIdx >= others.length) {
      gapX = others[others.length - 1]._x + NW + HG / 2;
    } else {
      gapX = (others[insertIdx - 1]._x + NW + others[insertIdx]._x) / 2;
    }

    // Use the y and height of siblings for vertical extent
    const refNode = others[0];
    const refEl = this._container.querySelector(`[data-org-id="${refNode.id}"]`);
    const h = refEl ? refEl.offsetHeight : 70;

    indicator.style.left = (gapX - 1) + 'px';
    indicator.style.top = refNode._y + 'px';
    indicator.style.height = h + 'px';
    indicator.style.display = 'block';
  },

  /** Hide the drop indicator line */
  _orgHideDropIndicator() {
    const indicator = this._container.querySelector('.pc__org-drop-line');
    if (indicator) indicator.style.display = 'none';
  },

  /** Check if the dragged node is still near its sibling y-level */
  _orgIsNearSiblings(dragId) {
    const dragNode = this._orgNodes.find(n => n.id === dragId);
    if (!dragNode) return false;
    const siblings = this._orgNodes.filter(n => n.pid === dragNode.pid && !n._h && n.id !== dragId);
    if (!siblings.length) return false;
    const refY = siblings[0]._y;
    const refH = this._orgNodeHeight(siblings[0].id);
    return Math.abs(dragNode._y - refY) <= refH + VG / 2;
  },

  _orgReparent(id) {
    const n = this._orgNodes.find(x => x.id === id);
    const el = this._container.querySelector(`[data-org-id="${id}"]`);
    if (!n || !el) return;

    for (const o of this._orgNodes) {
      if (o.id === id || o._h || o.id === n.pid) continue;
      if (this._orgIsDescendant(o.id, id)) continue;
      const oe = this._container.querySelector(`[data-org-id="${o.id}"]`);
      if (!oe) continue;
      if (n._x < o._x + NW && n._x + NW > o._x &&
          n._y < o._y + oe.offsetHeight && n._y + el.offsetHeight > o._y) {
        n.pid = o.id;
        return;
      }
    }
  },

  _orgIsDescendant(targetId, ancestorId) {
    for (const c of this._orgNodes.filter(n => n.pid === ancestorId)) {
      if (c.id === targetId || this._orgIsDescendant(targetId, c.id)) return true;
    }
    return false;
  },

  // ─── Select ─────────────────────────────────────────────────

  _orgSelect(id) {
    this._orgSel = id;
    this._container.querySelectorAll('.pc__org-node').forEach(e =>
      e.classList.toggle('pc__org-node--sel', e.dataset.orgId === id));
    this._orgDrawLines();
  },

  _orgDeselect() {
    this._orgSel = null;
    this._container.querySelectorAll('.pc__org-node').forEach(e =>
      e.classList.remove('pc__org-node--sel'));
    this._orgDrawLines();
  },

  // ─── CRUD ───────────────────────────────────────────────────

  async _orgOpenAdd(parentId, t) {
    const parent = parentId ? this._orgNodes.find(n => n.id === parentId) : null;
    const heading = parent
      ? `${t('addChild')} — ${this._escapeHtml(parent.title)}`
      : t('orgNew');

    const formHtml = `
      <div>
        <div class="field-group">
          <label>${t('nodeTitle')} *</label>
          <input type="text" class="field" data-field="title" placeholder="${t('nodeTitle')}" maxlength="100">
        </div>
        <div class="field-group">
          <label>${t('nodeDescription')}</label>
          <textarea class="field" data-field="desc" placeholder="${t('nodeDescription')}" maxlength="300"></textarea>
        </div>
      </div>
    `;

    await this._context.showModal.form(heading, formHtml, {
      confirmLabel: this._context.i18n.t('common.save'),
      onMount: (el) => el.querySelector('[data-field="title"]')?.focus(),
      onConfirm: (el) => {
        const title = el.querySelector('[data-field="title"]').value.trim();
        if (!title) { el.querySelector('[data-field="title"]').focus(); return false; }
        this._pushUndo();
        const desc = el.querySelector('[data-field="desc"]').value.trim();
        const newNode = {
          id: crypto.randomUUID(), title, desc,
          pid: parentId ?? null,
          bg: '', borderColor: '', borderStyle: '', borderWidth: 0,
          _col: false, _h: false, _x: 0, _y: 0,
        };
        this._orgNodes.push(newNode);
        // Uncollapse parent
        if (parentId) {
          const p = this._orgNodes.find(n => n.id === parentId);
          if (p) p._col = false;
        }
        this._save();
        this._orgRefresh();
        this._orgSelect(newNode.id);
        requestAnimationFrame(() => this._orgFit());
        return true;
      },
    });
  },

  async _orgOpenEdit(id, t) {
    const n = this._orgNodes.find(x => x.id === id);
    if (!n) return;

    const te = (key) => this._context.i18n.t(`modules.project-charter.editor.${key}`);
    const cs = getComputedStyle(document.documentElement);
    const defBg = this._orgStyle.nodeBg || cs.getPropertyValue('--color-bg-secondary').trim() || '#f8fafc';
    const defBorder = this._orgStyle.nodeBorderColor || cs.getPropertyValue('--color-border-secondary').trim() || '#e2e8f0';
    const curBg = n.bg || defBg;
    const curBorderCol = n.borderColor || defBorder;
    const curBorderStyle = n.borderStyle || this._orgStyle.nodeBorderStyle || 'solid';
    const curBorderWidth = n.borderWidth || this._orgStyle.nodeBorderWidth || 1;

    const formHtml = `
      <div>
        <div class="field-group">
          <label>${t('nodeTitle')} *</label>
          <input type="text" class="field" data-field="title" value="${this._escapeHtml(n.title)}" maxlength="100">
        </div>
        <div class="field-group">
          <label>${t('nodeDescription')}</label>
          <textarea class="field" data-field="desc" maxlength="300">${this._escapeHtml(n.desc)}</textarea>
        </div>
        <hr class="pc__org-form-sep">
        <div class="field-group field-group--inline">
          <label>${te('bgColor')}</label>
          <div class="dmike-chart-ed-color-swatch" data-field="bg-swatch" style="background:${curBg}"></div>
          <input type="hidden" data-field="bg" value="${this._escapeHtml(n.bg || '')}">
        </div>
        <div class="field-group field-group--inline">
          <label>${te('borderColor')}</label>
          <div class="dmike-chart-ed-color-swatch" data-field="borderColor-swatch" style="background:${curBorderCol}"></div>
          <input type="hidden" data-field="borderColor" value="${this._escapeHtml(n.borderColor || '')}">
        </div>
        <div class="field-group field-group--inline">
          <label>${te('borderStyle')}</label>
          <select class="field" data-field="borderStyle">
            <option value="">${te('solid')}</option>
            <option value="dashed"${curBorderStyle === 'dashed' ? ' selected' : ''}>${te('dashed')}</option>
            <option value="dotted"${curBorderStyle === 'dotted' ? ' selected' : ''}>${te('dotted')}</option>
          </select>
        </div>
        <div class="field-group field-group--inline">
          <label>${te('borderWidth')}</label>
          <input type="number" class="field field--num" data-field="borderWidth" value="${curBorderWidth}" min="1" max="8">
        </div>
      </div>
    `;

    await this._context.showModal.form(this._context.i18n.t('common.edit'), formHtml, {
      confirmLabel: this._context.i18n.t('common.save'),
      onMount: (el) => {
        el.querySelector('[data-field="title"]')?.focus();
        // Wire color swatches to openColorPicker
        const bgSwatch = el.querySelector('[data-field="bg-swatch"]');
        const bgHidden = el.querySelector('[data-field="bg"]');
        bgSwatch?.addEventListener('click', (e) => {
          openColorPicker(e, bgHidden.value || curBg, (c) => {
            bgHidden.value = c;
            bgSwatch.style.background = c;
          });
        });
        const borderSwatch = el.querySelector('[data-field="borderColor-swatch"]');
        const borderHidden = el.querySelector('[data-field="borderColor"]');
        borderSwatch?.addEventListener('click', (e) => {
          openColorPicker(e, borderHidden.value || curBorderCol, (c) => {
            borderHidden.value = c;
            borderSwatch.style.background = c;
          });
        });
      },
      onConfirm: (el) => {
        const title = el.querySelector('[data-field="title"]').value.trim();
        if (!title) return false;
        this._pushUndo();
        n.title = title;
        n.desc = el.querySelector('[data-field="desc"]').value.trim();
        n.bg = el.querySelector('[data-field="bg"]').value || '';
        n.borderColor = el.querySelector('[data-field="borderColor"]').value || '';
        const bs = el.querySelector('[data-field="borderStyle"]').value;
        n.borderStyle = bs || '';
        const bw = parseInt(el.querySelector('[data-field="borderWidth"]').value, 10);
        n.borderWidth = (bw && bw !== 1) ? Math.max(1, Math.min(8, bw)) : 0;
        this._save();
        this._orgRefresh();
        return true;
      },
    });
  },

  async _orgDeleteNode(id, t) {
    const node = this._orgNodes.find(n => n.id === id);
    if (!node) return;
    const confirmed = await this._context.confirmPopout(
      t('orgDeleteConfirm', { name: node.title || t('nodeTitle') }),
      { danger: true }
    );
    if (!confirmed) return;
    this._pushUndo();

    const delRecursive = (pid) => {
      this._orgNodes.filter(n => n.pid === pid).forEach(c => {
        delRecursive(c.id);
        this._orgNodes = this._orgNodes.filter(n => n.id !== c.id);
      });
    };
    delRecursive(id);
    this._orgNodes = this._orgNodes.filter(n => n.id !== id);
    if (this._orgSel === id) this._orgSel = null;
    this._save();
    this._orgRefresh();
  },

  _orgToggleCollapse(id, t) {
    const n = this._orgNodes.find(x => x.id === id);
    if (n) {
      n._col = !n._col;
      this._orgRefresh();
    }
  },

  /** Re-layout, re-render nodes, re-draw lines */
  _orgRefresh() {
    const t = (key, params) => this._context.i18n.t(`modules.project-charter.${key}`, params);
    this._orgLayoutAll();
    this._orgRenderNodes(t);
    // Need a frame for DOM measurements
    requestAnimationFrame(() => {
      this._orgLayoutAll();
      this._orgPosDom();
      this._orgDrawLines();
    });
  },

  // ─── Event binding ──────────────────────────────────────────

  _bindEvents(t) {
    const el = this._container;

    // Problem statement: rich-text editor (contenteditable)
    const editor = el.querySelector('.pc__problem-editor');
    const charCount = el.querySelector('.pc__char-count');
    let editorUndoPushed = false;

    if (editor) {
      editor.addEventListener('focus', () => { editorUndoPushed = false; });
      editor.addEventListener('input', () => {
        if (!editorUndoPushed) { this._pushUndo(); editorUndoPushed = true; }
        this._problemStatement = editor.innerHTML;
        const len = editor.textContent.length;
        editor.classList.toggle('pc__problem-editor--empty', !editor.textContent.trim());
        charCount.textContent = t('charCount', { current: len, max: 10000 });
        charCount.classList.toggle('pc__char-count--warn', len > 9500);
        charCount.classList.toggle('pc__char-count--over', len > 10000);
        this._save();
      });

      // Formatting toolbar buttons
      el.querySelectorAll('.pc__fmt-btn').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          document.execCommand(btn.dataset.cmd, false, null);
        });
      });

      // Sanitize paste to allow only bold/italic
      editor.addEventListener('paste', (e) => {
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        const text = e.clipboardData.getData('text/plain');
        if (html) {
          document.execCommand('insertHTML', false, this._sanitizeHtml(html));
        } else if (text) {
          document.execCommand('insertText', false, text);
        }
      });
    }

    // Add goal
    el.querySelector('.pc__add-btn')?.addEventListener('click', () => {
      this._pushUndo();
      this._goals.push({
        id: crypto.randomUUID(),
        description: '',
        targetDate: '',
        metric: '',
        targetValue: '',
        achievementLevel: 0,
      });
      this._save();
      this._render();
      const rows = el.querySelectorAll('.pc__goal-row');
      rows[rows.length - 1]?.querySelector('input[data-field="description"]')?.focus();
    });

    // Goal row reordering (drag & drop via grip handle)
    el.querySelectorAll('.pc__goal-row').forEach(row => {
      const id = row.dataset.id;
      const handle = row.querySelector('.pc__col-drag');
      if (handle) {
        handle.addEventListener('dragstart', (e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('application/x-pc-goal', id);
          const rect = row.getBoundingClientRect();
          e.dataTransfer.setDragImage(row, e.clientX - rect.left, e.clientY - rect.top);
          row.classList.add('pc__goal-row--dragging');
        });
        handle.addEventListener('dragend', () => {
          row.classList.remove('pc__goal-row--dragging');
          el.querySelectorAll('.pc__goal-row').forEach(r => {
            r.classList.remove('pc__goal-row--drop-before', 'pc__goal-row--drop-after');
          });
        });
      }
      row.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes('application/x-pc-goal')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = row.getBoundingClientRect();
        const isAfter = (e.clientY - rect.top) > rect.height / 2;
        row.classList.toggle('pc__goal-row--drop-before', !isAfter);
        row.classList.toggle('pc__goal-row--drop-after', isAfter);
      });
      row.addEventListener('dragleave', (e) => {
        if (row.contains(e.relatedTarget)) return;
        row.classList.remove('pc__goal-row--drop-before', 'pc__goal-row--drop-after');
      });
      row.addEventListener('drop', (e) => {
        if (!e.dataTransfer.types.includes('application/x-pc-goal')) return;
        e.preventDefault();
        row.classList.remove('pc__goal-row--drop-before', 'pc__goal-row--drop-after');
        const srcId = e.dataTransfer.getData('application/x-pc-goal');
        if (!srcId || srcId === id) return;
        const rect = row.getBoundingClientRect();
        const isAfter = (e.clientY - rect.top) > rect.height / 2;
        this._reorderGoal(srcId, id, isAfter);
      });
    });

    // Goal field edits
    el.querySelectorAll('.pc__goal-row').forEach(row => {
      const id = row.dataset.id;

      row.querySelectorAll('.pc__cell-input, .pc__zeg-input').forEach(input => {
        let fieldUndoPushed = false;
        input.addEventListener('focus', () => { fieldUndoPushed = false; });
        input.addEventListener('change', () => {
          if (!fieldUndoPushed) { this._pushUndo(); fieldUndoPushed = true; }
          const goal = this._goals.find(g => g.id === id);
          if (!goal) return;
          const field = input.dataset.field;
          let value = input.value;
          if (field === 'achievementLevel') {
            value = Math.max(0, Math.min(100, parseInt(value, 10) || 0));
          }
          goal[field] = value;
          this._save();
          if (field === 'achievementLevel') this._render();
        });
      });

      // Delete goal
      row.querySelector('.pc__del-btn')?.addEventListener('click', () => {
        const btn = row.querySelector('.pc__del-btn');
        if (btn.dataset.confirming) {
          this._pushUndo();
          this._goals = this._goals.filter(g => g.id !== id);
          this._save();
          this._render();
        } else {
          btn.dataset.confirming = '1';
          btn.textContent = t('deleteGoalConfirm');
          btn.classList.add('btn--danger');
          btn.classList.remove('btn--ghost');
          const cancel = (e) => {
            if (!row.contains(e.target)) {
              btn.dataset.confirming = '';
              btn.textContent = '🗑';
              btn.classList.remove('btn--danger');
              btn.classList.add('btn--ghost');
              document.removeEventListener('click', cancel);
            }
          };
          setTimeout(() => document.addEventListener('click', cancel), 0);
        }
      });
    });

    // ── Org Chart toolbar ──
    el.querySelector('.pc__org-add-btn')?.addEventListener('click', () => this._orgOpenAdd(null, t));
    el.querySelector('.pc__org-layout-btn')?.addEventListener('click', () => {
      this._orgRefresh();
      requestAnimationFrame(() => this._orgFit());
    });
    el.querySelector('.pc__org-undo-btn')?.addEventListener('click', () => this._undo());

    // Pan / Zoom (scroll wheel + drag always active)
    this._orgBindPanZoom();
  },

  // ─── Org Chart Modebar ─────────────────────────────────────

  /**
   * Create and mount the shared chart modebar on the org chart wrap.
   * Provides Zoom, Pan, Reset (= Fit), and Download (PNG/SVG).
   */
  _orgInitModebar() {
    if (this._modebar) {
      this._modebar.destroy();
      this._modebar = null;
    }

    const wrap = this._container.querySelector('[data-ref="orgWrap"]');
    if (!wrap) return;

    this._modebar = createModebar({
      onZoom: () => this._orgZoomIn(),
      onPan: () => {},  // pan is always active via drag
      onReset: () => this._orgFit(),
      onExportPNG: () => this._orgExportPNG(),
      onExportSVG: () => this._orgExportSVG(),
      onEditorToggle: (isOpen) => {
        this._orgEditorOpen = isOpen;
        const panel = this._container.querySelector('[data-ref="orgEditor"]');
        if (panel) panel.classList.toggle('pc__org-editor--open', isOpen);
        if (isOpen) this._orgBuildEditor();
      },
    });

    if (this._orgEditorOpen) this._modebar.setEditorOpen(true);

    wrap.appendChild(this._modebar.el);
  },

  // ─── Org Chart Editor ──────────────────────────────────────

  /**
   * Apply org chart style overrides as CSS custom properties on the section.
   */
  _orgApplyStyle() {
    const section = this._container.querySelector('.pc__org-section');
    if (!section) return;
    const s = this._orgStyle;

    // Note: do not set custom props to '' — an empty custom property breaks
    // the var() fallback chain in CSS, so remove the prop instead.
    const setOrRemove = (name, val) => {
      if (val) section.style.setProperty(name, val);
      else section.style.removeProperty(name);
    };
    setOrRemove('--pc-org-node-bg', s.nodeBg);
    setOrRemove('--pc-org-node-border-color', s.nodeBorderColor);
    section.style.setProperty('--pc-org-node-border-style', s.nodeBorderStyle || 'solid');
    section.style.setProperty('--pc-org-node-border-width', s.nodeBorderWidth + 'px');
    setOrRemove('--pc-org-line-color', s.lineColor);
    section.style.setProperty('--pc-org-line-width', String(s.lineWidth));
    section.style.setProperty('--pc-org-line-dasharray', DASH_MAP[s.lineStyle] || 'none');
  },

  /**
   * Build the editor panel contents with form controls.
   */
  _orgBuildEditor() {
    const inner = this._container.querySelector('[data-ref="orgEditorInner"]');
    if (!inner) return;
    inner.innerHTML = '';

    const t = (key) => this._context.i18n.t(`modules.project-charter.editor.${key}`);
    const style = this._orgStyle;
    let editorUndoPushed = false;
    const apply = () => {
      if (!editorUndoPushed) { this._pushUndo(); editorUndoPushed = true; }
      this._orgApplyStyle(); this._save();
    };

    // Helper: resolve a saved color or fall back to a CSS custom property
    const resolveColor = (value, cssProp) => {
      if (value) return value;
      const cs = getComputedStyle(document.documentElement);
      return cs.getPropertyValue(cssProp).trim() || 'rgba(255,255,255,1)';
    };

    // Helper: color swatch row using the shared chart color picker
    const colorRow = (label, value, cssProp, onChange) => {
      const current = resolveColor(value, cssProp);
      const { el, swatch } = edColorPair(label, current, (e) => {
        openColorPicker(e, resolveColor(value, cssProp), (c) => {
          onChange(c);
          swatch.style.background = c;
          apply();
        });
      });
      return el;
    };

    const styleOpts = [
      { value: 'solid', label: t('solid') },
      { value: 'dashed', label: t('dashed') },
      { value: 'dotted', label: t('dotted') },
    ];

    // ── Section: Node Appearance ──
    const nodeSec = edSection(t('nodeAppearance'));
    nodeSec.appendChild(colorRow(t('bgColor'), style.nodeBg, '--color-bg-secondary', (v) => { style.nodeBg = v; }));
    nodeSec.appendChild(colorRow(t('borderColor'), style.nodeBorderColor, '--color-border-secondary', (v) => { style.nodeBorderColor = v; }));
    nodeSec.appendChild(edSelectRow(t('borderStyle'), styleOpts, style.nodeBorderStyle, (v) => { style.nodeBorderStyle = v; apply(); }));
    nodeSec.appendChild(edInlineNum(t('borderWidth'), style.nodeBorderWidth, (v) => { style.nodeBorderWidth = Math.max(1, Math.min(8, v)); apply(); }, 1, 8, 1));
    inner.appendChild(nodeSec);

    // ── Section: Connector Lines ──
    const lineSec = edSection(t('connectorLines'));
    lineSec.appendChild(colorRow(t('lineColor'), style.lineColor, '--color-border-secondary', (v) => { style.lineColor = v; }));
    lineSec.appendChild(edSelectRow(t('lineStyle'), styleOpts, style.lineStyle, (v) => { style.lineStyle = v; apply(); }));
    lineSec.appendChild(edInlineNum(t('lineWidth'), style.lineWidth, (v) => { style.lineWidth = Math.max(1, Math.min(8, v)); apply(); }, 1, 8, 1));
    inner.appendChild(lineSec);
  },

  // ─── Org Chart Export ──────────────────────────────────────

  /**
   * Build a standalone SVG from the current org chart state.
   * Renders nodes as rects + text and connector lines as bezier paths.
   * @returns {SVGElement|null}
   */
  _orgBuildExportSVG() {
    const visible = this._orgNodes.filter(n => !n._h);
    if (!visible.length) return null;

    // Compute bounding box
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    visible.forEach(n => {
      const h = this._orgNodeHeight(n.id);
      x1 = Math.min(x1, n._x);
      y1 = Math.min(y1, n._y);
      x2 = Math.max(x2, n._x + NW);
      y2 = Math.max(y2, n._y + h);
    });

    const pad = 30;
    const vw = x2 - x1 + pad * 2;
    const vh = y2 - y1 + pad * 2;
    const offX = -x1 + pad;
    const offY = -y1 + pad;

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('xmlns', NS);
    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    svg.setAttribute('width', vw);
    svg.setAttribute('height', vh);

    // Detect current theme colors from computed styles
    const styles = getComputedStyle(document.documentElement);
    const bgPrimary = styles.getPropertyValue('--color-bg-primary').trim() || '#ffffff';
    const bgSecondary = styles.getPropertyValue('--color-bg-secondary').trim() || '#f8fafc';
    const borderColor = styles.getPropertyValue('--color-border-secondary').trim() || '#e2e8f0';
    const textPrimary = styles.getPropertyValue('--color-text-primary').trim() || '#1e293b';
    const textSecondary = styles.getPropertyValue('--color-text-secondary').trim() || '#64748b';
    const lineColor = styles.getPropertyValue('--color-border-primary').trim() || '#cbd5e1';

    // Background
    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('width', vw);
    bg.setAttribute('height', vh);
    bg.setAttribute('fill', bgPrimary);
    svg.appendChild(bg);

    // Connector lines
    visible.filter(n => n.pid !== null).forEach(n => {
      const parent = this._orgNodes.find(p => p.id === n.pid);
      if (!parent || parent._h) return;
      const ph = this._orgNodeHeight(parent.id);

      const px1 = parent._x + NW / 2 + offX;
      const py1 = parent._y + ph + offY;
      const px2 = n._x + NW / 2 + offX;
      const py2 = n._y + offY;
      const mid = py1 + (py2 - py1) / 2;

      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `M${px1} ${py1}C${px1} ${mid},${px2} ${mid},${px2} ${py2}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', this._orgStyle.lineColor || lineColor);
      path.setAttribute('stroke-width', String(this._orgStyle.lineWidth || 2));
      const lineDash = DASH_MAP[this._orgStyle.lineStyle];
      if (lineDash && lineDash !== 'none') path.setAttribute('stroke-dasharray', lineDash);
      svg.appendChild(path);
    });

    // Nodes
    visible.forEach(n => {
      const nh = this._orgNodeHeight(n.id);
      const nx = n._x + offX;
      const ny = n._y + offY;

      // Node rect
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', nx);
      rect.setAttribute('y', ny);
      rect.setAttribute('width', NW);
      rect.setAttribute('height', nh);
      rect.setAttribute('rx', 6);
      // Per-node style > global orgStyle > theme default
      rect.setAttribute('fill', n.bg || this._orgStyle.nodeBg || bgSecondary);
      rect.setAttribute('stroke', n.borderColor || this._orgStyle.nodeBorderColor || borderColor);
      rect.setAttribute('stroke-width', String(n.borderWidth || this._orgStyle.nodeBorderWidth || 1));
      const nbs = n.borderStyle || this._orgStyle.nodeBorderStyle;
      const nodeDash = DASH_MAP[nbs];
      if (nodeDash && nodeDash !== 'none') rect.setAttribute('stroke-dasharray', nodeDash);
      svg.appendChild(rect);

      // Title text
      const title = document.createElementNS(NS, 'text');
      title.setAttribute('x', nx + 12);
      title.setAttribute('y', ny + 22);
      title.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
      title.setAttribute('font-size', '13');
      title.setAttribute('font-weight', '600');
      title.setAttribute('fill', textPrimary);
      title.textContent = n.title;
      svg.appendChild(title);

      // Description text
      if (n.desc) {
        const desc = document.createElementNS(NS, 'text');
        desc.setAttribute('x', nx + 12);
        desc.setAttribute('y', ny + 40);
        desc.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
        desc.setAttribute('font-size', '11');
        desc.setAttribute('fill', textSecondary);
        desc.textContent = n.desc;
        svg.appendChild(desc);
      }
    });

    return svg;
  },

  /** Export org chart as PNG */
  async _orgExportPNG() {
    const svg = this._orgBuildExportSVG();
    if (!svg) return;
    await exportSvgAsPNG(svg, 'organigramm.png');
  },

  /** Export org chart as SVG */
  _orgExportSVG() {
    const svg = this._orgBuildExportSVG();
    if (!svg) return;
    exportSvgAsFile(svg, 'organigramm.svg');
  },

  // ─── Undo ───────────────────────────────────────────────────

  /** Push current state onto the undo stack (call BEFORE mutating) */
  _pushUndo() {
    this._undoStack.push(JSON.stringify(this.getState()));
    if (this._undoStack.length > this._undoMax) this._undoStack.shift();
    this._updateUndoBtn();
  },

  /** Restore the most recent snapshot from the undo stack */
  _undo() {
    if (!this._undoStack.length) return;
    const snapshot = JSON.parse(this._undoStack.pop());
    this._problemStatement = snapshot.problemStatement ?? '';
    this._goals = snapshot.goals ?? [];
    this._orgNodes = this._importOrgChart(snapshot.orgChart);
    this._orgStyle = Object.assign({ ...ORG_STYLE_DEFAULTS }, snapshot.orgStyle || {});
    this._orgSel = null;
    this._save();
    this._render();
  },

  /** Enable / disable the undo button */
  _updateUndoBtn() {
    const btn = this._container?.querySelector('.pc__org-undo-btn');
    if (btn) btn.disabled = this._undoStack.length === 0;
  },

  // ─── Persistence ────────────────────────────────────────────

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      this.getState()
    );
    this._updateUndoBtn();
  },

  // ─── Helpers ────────────────────────────────────────────────

  _escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  /** Sanitize HTML to only allow bold/italic/line-break tags */
  _sanitizeHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'BR', 'P', 'DIV']);
    const walk = (node) => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === 1) {
          if (!allowed.has(child.tagName)) {
            child.replaceWith(document.createTextNode(child.textContent));
          } else {
            [...child.attributes].forEach(a => child.removeAttribute(a.name));
            walk(child);
          }
        }
      });
    };
    walk(tmp);
    return tmp.innerHTML;
  },

  /** Convert stored content to safe HTML — handles legacy plain text */
  _prepareHtml(raw) {
    if (!raw) return '';
    if (!/<[a-z][\s\S]*>/i.test(raw)) {
      return this._escapeHtml(raw).replace(/\n/g, '<br>');
    }
    return this._sanitizeHtml(raw);
  },

  /** Get plain text character count from an HTML string */
  _plainTextLength(html) {
    if (!html) return 0;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent.length;
  },
};
