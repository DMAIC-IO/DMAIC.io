/**
 * D.Mike — Project Charter Module (project-charter.js)
 *
 * Define phase: rich-text problem statement, numbered goals (target date,
 * metric, target value, goal-achievement level / ZEG), and a canvas-based
 * org chart with pan/zoom, drag, auto-layout, collapse, per-node styling,
 * undo, modebar (zoom/pan/reset/PNG/SVG/editor) and an editor panel.
 *
 * Migrated to createModule + Alpine CSP. The two form sections (problem
 * statement + goals table) are declarative in project-charter.html. The
 * org-chart canvas, modebar, editor panel, color picker and SVG/PNG export
 * are imperative widgets (pointer math + POM byte-parity) mounted in the
 * data-fn init() and disposed in destroy() — see .claude/MODULES.md.
 *
 * Spec: docs/modules/PROJECT-CHARTER.md
 */

import { createModule } from '../../core/template-module.js';
import { State } from './project-charter-model.js';
import { createModebar, exportSvgAsPNG, exportSvgAsFile } from '../../core/chart/modebar.js';
import { edSection, edInlineNum, edSelectRow, edColorPair, openColorPicker } from '../../core/chart/chart-editor.js';
import { h } from '../../core/dom.js';
import { markdownToFragment, domToMarkdown } from './project-charter-richtext.js';
import { icon } from '../../core/icon.js';
import { resolveDateOffset } from '../../core/date-offset.js';

const NW = 220;   // node width (px)
const HG = 44;    // horizontal gap between sibling subtrees
const VG = 36;    // vertical gap between parent and children
const UNDO_MAX = 50;

/** Map line style names to SVG stroke-dasharray values */
const DASH_MAP = { solid: 'none', dashed: '8 4', dotted: '2 4' };

/** Convert stored Markdown content to a DocumentFragment for the editor. */
function prepareFragment(raw) {
  return markdownToFragment(raw);
}

export { prepareFragment };

/**
 * Render the charter problem-statement dashboard tile. Distinguishes "no
 * instance" (charterEmpty) from "instance, no problem statement"
 * (charterNoProblem). The problem statement is stored as the RTE Markdown
 * subset and rendered sink-free via markdownToFragment (NOT as a raw string —
 * h() would otherwise show literal `**bold**`).
 * @param {HTMLElement} host
 * @param {{state: object, i18n: object}} args
 */
export function renderDashboardTile(host, { state, i18n }) {
  if (!state) {
    host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.charterEmpty')));
    return;
  }
  if (!state.problemStatement) {
    host.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.charterNoProblem')));
    return;
  }
  host.replaceChildren(
    h('div', { class: 'dashboard-charter__problem-label' }, i18n.t('dashboard.charterProblem')),
    h('div', { class: 'dashboard-charter__problem' }, markdownToFragment(state.problemStatement)),
  );
}

/**
 * Locate the single project-charter instance across all phases and read its
 * persisted module state. The charter is a singleton — returns the first match.
 * @param {{stateManager: object}} ctx
 * @returns {{instanceId: string, state: object}|null}
 */
function findCharter(ctx) {
  const phases = ctx.stateManager.get('phases') || {};
  for (const list of Object.values(phases)) {
    for (const inst of (list || [])) {
      if (inst.moduleId === 'project-charter') {
        return { instanceId: inst.instanceId, state: ctx.stateManager.getModuleState(inst.instanceId) };
      }
    }
  }
  return null;
}

export default createModule({
  config: {
    id: 'project-charter',
    engine: 'alpine',
    phase: 'define',
    icon: 'clipboard-check',
    version: '0.2.0',
    meta: import.meta,
    dashboardTile: {
      defaultW: 3, defaultH: 10, minW: 2, minH: 6,
      /**
       * Enumerate the (at most one) charter dashboard tile. Emits an entry only
       * when a charter instance exists.
       * @param {{stateManager: object, i18n: object}} ctx
       * @returns {Array<{tileId: string, instanceId: string, title: string}>}
       */
      enumerate(ctx) {
        const found = findCharter(ctx);
        if (!found) return [];
        return [{
          tileId: 'project-charter',
          instanceId: found.instanceId,
          title: ctx.i18n.t('dashboard.charterTitle'),
        }];
      },
      render: renderDashboardTile,
    },
  },
  Model: State,

  beforeLoadExample(data) {
    const result = JSON.parse(JSON.stringify(data));
    if (Array.isArray(result.goals)) {
      result.goals = result.goals.map(g => ({ ...g, targetDate: resolveDateOffset(g.targetDate) }));
    }
    return result;
  },

  data(module, _t) {
    return {
      // ── Transient view state (never persisted) ───────────────
      _orgSel: null,
      _orgPan: { x: 0, y: 0 },
      _orgZoom: 1,
      _modebar: null,
      _orgEditorOpen: false,
      _undoStack: [],
      _confirmingDelete: {},
      _confirmTick: 0,

      // ── Modal draft state (bound to the in-template borrowed forms) ──
      nodeDraft: { title: '', desc: '' },
      nodeStyleDraft: {
        title: '', desc: '',
        bg: '', borderColor: '',
        bgDisplay: '', borderColorDisplay: '',
        borderStyle: '', borderWidth: 1,
      },

      // ── Lifecycle: mount/dispose imperative org-chart widgets ─
      init() {
        this._undoStack = [];
        // Initial contenteditable content (Alpine must not own it).
        this.$nextTick(() => {
          // Point the framework's _tmpl._state at THIS component's live reactive
          // model so module.getState() reflects the latest edits even after the
          // Alpine root is torn down (the workspace re-persists live instances via
          // getState() on tab switch / re-add — matches legacy behaviour).
          if (module._tmpl) module._tmpl._state = this.model;
          const editor = this.$root.querySelector('[data-ref="problemEditor"]');
          if (editor) {
            editor.replaceChildren(prepareFragment(this.model.problemStatement));
            editor.classList.toggle('pc__problem-editor--empty', !editor.textContent.trim());
          }
          this._orgRender();
          this._orgInitModebar();
          this._orgApplyStyle();
          if (this._orgEditorOpen) this._orgBuildEditor();
          if (this.model.orgNodes.length) {
            requestAnimationFrame(() => this._orgFit());
          }
        });
      },

      destroy() {
        if (this._modebar) { this._modebar.destroy(); this._modebar = null; }
      },

      // ═══════════════════════════════════════════════════════
      // PROBLEM STATEMENT (contenteditable, rich-text)
      // ═══════════════════════════════════════════════════════

      problemFocus() { this._editorUndoPushed = false; },

      problemInput(event) {
        const editor = event.target;
        if (!this._editorUndoPushed) { this._pushUndo(); this._editorUndoPushed = true; }
        this.model.problemStatement = domToMarkdown(editor);
        editor.classList.toggle('pc__problem-editor--empty', !editor.textContent.trim());
      },

      problemPaste(event) {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        if (text) document.execCommand('insertText', false, text);
      },

      fmtMouseDown(cmd, event) {
        event.preventDefault();
        document.execCommand(cmd, false, null);
      },

      charCountText() {
        const len = markdownToFragment(this.model.problemStatement).textContent.length;
        return _t('charCount', { current: len, max: 10000 });
      },

      // ═══════════════════════════════════════════════════════
      // GOALS
      // ═══════════════════════════════════════════════════════

      zegClamped(level) {
        return Math.max(0, Math.min(100, parseInt(level, 10) || 0));
      },

      zegColor(level) {
        const zeg = this.zegClamped(level);
        return zeg === 100 ? 'var(--color-success)'
          : zeg >= 75 ? 'var(--color-info)'
          : zeg >= 25 ? 'var(--color-warning)'
          : 'var(--color-error)';
      },

      zegBarStyle(level) {
        return `width:${  this.zegClamped(level)  }%; background:${  this.zegColor(level)}`;
      },

      isDateInPast(date) {
        return Boolean(date) && new Date(date) < new Date(new Date().toDateString());
      },

      autoGrow(event) {
        const el = event.target;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight  }px`;
      },

      addGoal(_event) {
        this._pushUndo();
        this.model.addGoal();
        this.$nextTick(() => {
          const rows = this.$root.querySelectorAll('.pc__goal-row');
          const last = rows[rows.length - 1];
          last?.querySelector('textarea[data-field="description"]')?.focus();
        });
      },

      // Reset the per-edit undo guard whenever focus enters a goal field, so
      // each distinct edit (after a focus) pushes its own undo snapshot
      // (matches legacy per-input focus reset).
      goalFieldFocus() { this._fieldUndoPushed = false; },

      goalChanged(id, field, event) {
        if (!this._fieldUndoPushed) { this._pushUndo(); this._fieldUndoPushed = true; }
        // x-model already wrote the raw string to the model; re-apply
        // through the model so achievementLevel is clamped.
        this.model.setGoalField(id, field, event.target.value);
      },

      // delete (two-click confirm)
      isConfirmingDelete(id) {
        this._confirmTick; // reactive dependency
        return Boolean(this._confirmingDelete[id]);
      },

      delBtnLabel(id) {
        this._confirmTick;
        return this._confirmingDelete[id] ? _t('deleteGoalConfirm') : '🗑';
      },

      goalDeleteClick(id, event) {
        if (this._confirmingDelete[id]) {
          this._pushUndo();
          this.model.deleteGoal(id);
          delete this._confirmingDelete[id];
          this._confirmTick++;
        } else {
          this._confirmingDelete[id] = true;
          this._confirmTick++;
          const row = event.target.closest('.pc__goal-row');
          const cancel = (e) => {
            if (!row || !row.contains(e.target)) {
              delete this._confirmingDelete[id];
              this._confirmTick++;
              document.removeEventListener('click', cancel);
            }
          };
          setTimeout(() => document.addEventListener('click', cancel), 0);
        }
      },

      // goal row drag reorder (custom dataTransfer mime for parity)
      goalDragStart(id, event) {
        const row = event.target.closest('.pc__goal-row');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-pc-goal', id);
        const rect = row.getBoundingClientRect();
        event.dataTransfer.setDragImage(row, event.clientX - rect.left, event.clientY - rect.top);
        row.classList.add('pc__goal-row--dragging');
      },

      goalDragEnd(event) {
        const row = event.target.closest('.pc__goal-row');
        row?.classList.remove('pc__goal-row--dragging');
        this.$root.querySelectorAll('.pc__goal-row').forEach(r =>
          r.classList.remove('pc__goal-row--drop-before', 'pc__goal-row--drop-after'));
      },

      goalDragOver(id, event) {
        if (!event.dataTransfer.types.includes('application/x-pc-goal')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const row = event.currentTarget;
        const rect = row.getBoundingClientRect();
        const isAfter = (event.clientY - rect.top) > rect.height / 2;
        row.classList.toggle('pc__goal-row--drop-before', !isAfter);
        row.classList.toggle('pc__goal-row--drop-after', isAfter);
      },

      goalDragLeave(id, event) {
        const row = event.currentTarget;
        if (row.contains(event.relatedTarget)) return;
        row.classList.remove('pc__goal-row--drop-before', 'pc__goal-row--drop-after');
      },

      goalDrop(id, event) {
        if (!event.dataTransfer.types.includes('application/x-pc-goal')) return;
        event.preventDefault();
        const row = event.currentTarget;
        row.classList.remove('pc__goal-row--drop-before', 'pc__goal-row--drop-after');
        const srcId = event.dataTransfer.getData('application/x-pc-goal');
        if (!srcId || srcId === id) return;
        const rect = row.getBoundingClientRect();
        const isAfter = (event.clientY - rect.top) > rect.height / 2;
        this._pushUndo();
        this.model.reorderGoal(srcId, id, isAfter);
      },

      // ═══════════════════════════════════════════════════════
      // ORG CHART — imperative canvas (pan/zoom/drag/layout)
      // ═══════════════════════════════════════════════════════

      orgAddRoot() { this._orgOpenAdd(null); },
      orgLayoutBtn() { this._orgRefresh(); requestAnimationFrame(() => this._orgFit()); },
      canUndo() { this._confirmTick; return this._undoStack.length > 0; },
      orgUndo() { this._undo(); },

      _orgChildren(pid) {
        return this.model.orgNodes.filter(n => n.pid === pid && !n._h);
      },

      _orgNodeHeight(id) {
        const el = this.$root.querySelector(`[data-org-id="${  id  }"]`);
        return el ? el.offsetHeight : 70;
      },

      _orgSubtreeWidth(id) {
        const n = this.model.orgNodes.find(x => x.id === id);
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
        const n = this.model.orgNodes.find(nd => nd.id === id);
        if (!n) return;
        n._x = x; n._y = y;
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
        this.model.orgNodes.forEach(n => n._h = false);
        const markHidden = (pid) => {
          const p = this.model.orgNodes.find(n => n.id === pid);
          if (!p || !p._col) return;
          this.model.orgNodes.filter(n => n.pid === pid).forEach(c => {
            c._h = true;
            markHidden(c.id);
          });
        };
        this.model.orgNodes.forEach(n => { if (n._col) markHidden(n.id); });

        const roots = this.model.orgNodes.filter(n => n.pid === null && !n._h);
        let ox = 0;
        roots.forEach(r => {
          const w = this._orgSubtreeWidth(r.id);
          this._orgLayNode(r.id, ox + w / 2 - NW / 2, 60);
          ox += w + HG * 2;
        });
      },

      _orgRenderNodes() {
        const canvas = this.$root.querySelector('[data-ref="orgCanvas"]');        if (!canvas) return;
        canvas.querySelectorAll('.pc__org-node').forEach(e => e.remove());

        const visible = this.model.orgNodes.filter(n => !n._h);
        visible.forEach(n => {
          const childCount = this.model.orgNodes.filter(c => c.pid === n.id).length;
          const isSel = n.id === this._orgSel;

          const div = document.createElement('div');
          div.className = `pc__org-node${  isSel ? ' pc__org-node--sel' : ''}`;
          div.dataset.orgId = n.id;
          div.style.left = `${n._x  }px`;
          div.style.top = `${n._y  }px`;
          div.style.width = `${NW  }px`;
          if (n.bg) div.style.background = n.bg;
          if (n.borderColor) div.style.borderColor = n.borderColor;
          if (n.borderStyle) div.style.borderStyle = n.borderStyle;
          if (n.borderWidth) div.style.borderWidth = `${n.borderWidth  }px`;

          div.append(
            h('div', { class: 'pc__org-dot-t' }),
            h('div', { class: 'pc__org-node-title' }, n.title),
            n.desc ? h('div', { class: 'pc__org-node-desc' }, n.desc) : null,
            h('div', { class: 'pc__org-node-bar' },
              h('button', { class: 'pc__org-node-btn', 'data-action': 'add', title: _t('addChild') },
                icon('plus', { cls: 'pc__org-node-ico' })),
              h('button', { class: 'pc__org-node-btn', 'data-action': 'edit', title: module._context.i18n.t('common.edit') },
                icon('edit', { cls: 'pc__org-node-ico' })),
              childCount
                ? h('button', { class: 'pc__org-node-btn', 'data-action': 'toggle' },
                    icon(n._col ? 'chevron-down' : 'chevron-up', { cls: 'pc__org-node-ico' }),
                    n._col ? String(childCount) : null)
                : null,
              h('button', { class: 'pc__org-node-btn pc__org-node-btn--del', 'data-action': 'del', title: module._context.i18n.t('common.delete') },
                icon('trash', { cls: 'pc__org-node-ico' })),
            ),
            h('div', { class: 'pc__org-dot-b' }),
          );

          div.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.pc__org-node-btn')) return;
            e.stopPropagation();
            this._orgSelect(n.id);
            this._orgStartDrag(n.id, e);
          });

          div.querySelectorAll('.pc__org-node-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const action = btn.dataset.action;
              if (action === 'add') this._orgOpenAdd(n.id);
              else if (action === 'edit') this._orgOpenEdit(n.id);
              else if (action === 'toggle') this._orgToggleCollapse(n.id);
              else if (action === 'del') this._orgDeleteNode(n.id);
            });
          });

          canvas.appendChild(div);
        });

        const empty = this.$root.querySelector('[data-ref="orgEmpty"]');
        if (empty) empty.classList.toggle('pc__org-empty--hidden', this.model.orgNodes.length > 0);
      },

      _orgPosDom() {
        this.model.orgNodes.filter(n => !n._h).forEach(n => {
          const el = this.$root.querySelector(`[data-org-id="${  n.id  }"]`);
          if (el) { el.style.left = `${n._x  }px`; el.style.top = `${n._y  }px`; }
        });
      },

      _orgDrawLines() {
        const svg = this.$root.querySelector('[data-ref="orgLines"]');
        if (!svg) return;
        svg.replaceChildren();

        let maxX = 0, maxY = 0;
        this.model.orgNodes.filter(n => !n._h).forEach(n => {
          const el = this.$root.querySelector(`[data-org-id="${  n.id  }"]`);
          const nodeH = el ? el.offsetHeight : 80;
          maxX = Math.max(maxX, n._x + NW);
          maxY = Math.max(maxY, n._y + nodeH);
        });
        svg.setAttribute('width', maxX + 50);
        svg.setAttribute('height', maxY + 50);

        this.model.orgNodes.filter(n => !n._h && n.pid !== null).forEach(n => {
          const parent = this.model.orgNodes.find(p => p.id === n.pid);
          if (!parent || parent._h) return;
          const pe = this.$root.querySelector(`[data-org-id="${  parent.id  }"]`);
          const ce = this.$root.querySelector(`[data-org-id="${  n.id  }"]`);
          if (!pe || !ce) return;

          const x1 = parent._x + NW / 2;
          const y1 = parent._y + pe.offsetHeight;
          const x2 = n._x + NW / 2;
          const y2 = n._y;
          const mid = y1 + (y2 - y1) / 2;

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', `M${x1} ${y1}C${x1} ${mid},${x2} ${mid},${x2} ${y2}`);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', this.model.orgStyle.lineColor ||
            getComputedStyle(svg).getPropertyValue('--color-border-secondary').trim() || '#94a3b8');
          path.setAttribute('stroke-width', String(this.model.orgStyle.lineWidth || 2));
          const dash = DASH_MAP[this.model.orgStyle.lineStyle];
          if (dash && dash !== 'none') path.setAttribute('stroke-dasharray', dash);
          path.setAttribute('stroke-linecap', 'round');
          if (n.id === this._orgSel || parent.id === this._orgSel) {
            path.classList.add('pc__org-line--hl');
          }
          svg.appendChild(path);
        });
      },

      _orgApplyTransform() {
        const canvas = this.$root.querySelector('[data-ref="orgCanvas"]');
        if (!canvas) return;
        canvas.style.transform = `translate(${this._orgPan.x}px,${this._orgPan.y}px) scale(${this._orgZoom})`;
      },

      /** Full org render: layout, nodes, lines, transform, pan/zoom binding. */
      _orgRender() {
        this._orgRenderNodes();
        this._orgLayoutAll();
        this._orgPosDom();
        this._orgDrawLines();
        this._orgApplyTransform();
        this._orgApplyStyle();
        if (!this._panZoomBound) { this._orgBindPanZoom(); this._panZoomBound = true; }
      },

      /** Re-layout, re-render nodes, re-draw lines (after a mutation). */
      _orgRefresh() {
        this._orgLayoutAll();
        this._orgRenderNodes();
        requestAnimationFrame(() => {
          this._orgLayoutAll();
          this._orgPosDom();
          this._orgDrawLines();
        });
      },

      // ─── Pan / Zoom ─────────────────────────────────────────

      _orgBindPanZoom() {
        const wrap = this.$root.querySelector('[data-ref="orgWrap"]');
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
        const wrap = this.$root.querySelector('[data-ref="orgWrap"]');
        if (!wrap) return;
        const cx = wrap.clientWidth / 2, cy = wrap.clientHeight / 2;
        const oz = this._orgZoom;
        this._orgZoom = Math.min(3, this._orgZoom * 1.2);
        this._orgPan.x = cx - (cx - this._orgPan.x) * (this._orgZoom / oz);
        this._orgPan.y = cy - (cy - this._orgPan.y) * (this._orgZoom / oz);
        this._orgApplyTransform();
      },

      _orgFit() {
        const wrap = this.$root.querySelector('[data-ref="orgWrap"]');
        if (!wrap || !this.model.orgNodes.length) return;
        const visible = this.model.orgNodes.filter(n => !n._h);
        if (!visible.length) return;

        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        visible.forEach(n => {
          const nodeH = this._orgNodeHeight(n.id);
          x1 = Math.min(x1, n._x);
          y1 = Math.min(y1, n._y);
          x2 = Math.max(x2, n._x + NW);
          y2 = Math.max(y2, n._y + nodeH);
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

      // ─── Drag ───────────────────────────────────────────────

      _orgStartDrag(id, ev) {
        const n = this.model.orgNodes.find(x => x.id === id);
        if (!n) return;
        const startX = ev.clientX, startY = ev.clientY;
        const origX = n._x, origY = n._y;
        let moved = false, siblingReordered = false, undoPushed = false;
        const wrap = this.$root.querySelector('[data-ref="orgWrap"]');

        const onMove = (e) => {
          const dx = (e.clientX - startX) / this._orgZoom;
          const dy = (e.clientY - startY) / this._orgZoom;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
          if (!moved) return;
          if (!undoPushed) { this._pushUndo(); undoPushed = true; }
          n._x = origX + dx;
          n._y = origY + dy;
          const el = this.$root.querySelector(`[data-org-id="${  id  }"]`);
          if (el) {
            el.style.left = `${n._x  }px`;
            el.style.top = `${n._y  }px`;
            el.classList.add('pc__org-node--drag');
          }
          if (wrap && !wrap.classList.contains('pc__org-wrap--reordering')) {
            wrap.classList.add('pc__org-wrap--reordering');
          }
          siblingReordered = this._orgTryReorderSiblings(id) || siblingReordered;
          if (!this._orgIsNearSiblings(id)) siblingReordered = false;
          this._orgDrawLines();
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          const el = this.$root.querySelector(`[data-org-id="${  id  }"]`);
          if (el) el.classList.remove('pc__org-node--drag');
          if (wrap) wrap.classList.remove('pc__org-wrap--reordering');
          this._orgHideDropIndicator();
          if (moved) {
            if (!siblingReordered) this._orgReparent(id);
            this._orgRefresh();
          }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      },

      _orgTryReorderSiblings(dragId) {
        const dragNode = this.model.orgNodes.find(n => n.id === dragId);
        if (!dragNode) return false;
        const pid = dragNode.pid;
        const siblings = this.model.orgNodes.filter(n => n.pid === pid && !n._h);
        if (siblings.length < 2) { this._orgHideDropIndicator(); return false; }

        const dragCenterX = dragNode._x + NW / 2;
        const others = siblings.filter(n => n.id !== dragId);
        if (others.length > 0) {
          const refY = others[0]._y;
          const refH = this._orgNodeHeight(others[0].id);
          const tolerance = refH + VG / 2;
          if (Math.abs(dragNode._y - refY) > tolerance) {
            this._orgHideDropIndicator();
            return false;
          }
        }
        let insertIdx = others.length;
        for (let i = 0; i < others.length; i++) {
          if (dragCenterX < others[i]._x + NW / 2) { insertIdx = i; break; }
        }
        const desired = [...others];
        desired.splice(insertIdx, 0, dragNode);
        const changed = desired.some((n, i) => n.id !== siblings[i].id);
        this._orgShowDropIndicator(dragId, pid, insertIdx, others);
        if (!changed) return false;

        const sibIndices = [];
        this.model.orgNodes.forEach((n, i) => {
          if (siblings.some(s => s.id === n.id)) sibIndices.push(i);
        });
        desired.forEach((node, i) => { this.model.orgNodes[sibIndices[i]] = node; });

        const savedX = dragNode._x, savedY = dragNode._y;
        this._orgLayoutAll();
        dragNode._x = savedX;
        dragNode._y = savedY;
        this._orgPosDom();
        return true;
      },

      _orgShowDropIndicator(dragId, pid, insertIdx, others) {
        let indicator = this.$root.querySelector('.pc__org-drop-line');
        if (!indicator) {
          indicator = document.createElement('div');
          indicator.className = 'pc__org-drop-line';
          this.$root.querySelector('[data-ref="orgCanvas"]')?.appendChild(indicator);
        }
        if (others.length === 0) { indicator.style.display = 'none'; return; }
        let gapX;
        if (insertIdx === 0) {
          gapX = others[0]._x - HG / 2;
        } else if (insertIdx >= others.length) {
          gapX = others[others.length - 1]._x + NW + HG / 2;
        } else {
          gapX = (others[insertIdx - 1]._x + NW + others[insertIdx]._x) / 2;
        }
        const refNode = others[0];
        const refEl = this.$root.querySelector(`[data-org-id="${  refNode.id  }"]`);
        const nodeH = refEl ? refEl.offsetHeight : 70;
        indicator.style.left = `${gapX - 1  }px`;
        indicator.style.top = `${refNode._y  }px`;
        indicator.style.height = `${nodeH  }px`;
        indicator.style.display = 'block';
      },

      _orgHideDropIndicator() {
        const indicator = this.$root.querySelector('.pc__org-drop-line');
        if (indicator) indicator.style.display = 'none';
      },

      _orgIsNearSiblings(dragId) {
        const dragNode = this.model.orgNodes.find(n => n.id === dragId);
        if (!dragNode) return false;
        const siblings = this.model.orgNodes.filter(n => n.pid === dragNode.pid && !n._h && n.id !== dragId);
        if (!siblings.length) return false;
        const refY = siblings[0]._y;
        const refH = this._orgNodeHeight(siblings[0].id);
        return Math.abs(dragNode._y - refY) <= refH + VG / 2;
      },

      _orgReparent(id) {
        const n = this.model.orgNodes.find(x => x.id === id);
        const el = this.$root.querySelector(`[data-org-id="${  id  }"]`);
        if (!n || !el) return;
        for (const o of this.model.orgNodes) {
          if (o.id === id || o._h || o.id === n.pid) continue;
          if (this._orgIsDescendant(o.id, id)) continue;
          const oe = this.$root.querySelector(`[data-org-id="${  o.id  }"]`);
          if (!oe) continue;
          if (n._x < o._x + NW && n._x + NW > o._x &&
              n._y < o._y + oe.offsetHeight && n._y + el.offsetHeight > o._y) {
            n.pid = o.id;
            return;
          }
        }
      },

      _orgIsDescendant(targetId, ancestorId) {
        for (const c of this.model.orgNodes.filter(n => n.pid === ancestorId)) {
          if (c.id === targetId || this._orgIsDescendant(targetId, c.id)) return true;
        }
        return false;
      },

      // ─── Select ─────────────────────────────────────────────

      _orgSelect(id) {
        this._orgSel = id;
        this.$root.querySelectorAll('.pc__org-node').forEach(e =>
          e.classList.toggle('pc__org-node--sel', e.dataset.orgId === id));
        this._orgDrawLines();
      },

      _orgDeselect() {
        this._orgSel = null;
        this.$root.querySelectorAll('.pc__org-node').forEach(e =>
          e.classList.remove('pc__org-node--sel'));
        this._orgDrawLines();
      },

      // ─── CRUD (modals) ──────────────────────────────────────

      async _orgOpenAdd(parentId) {
        const t = (k, p) => _t(k, p);
        const parent = parentId ? this.model.orgNodes.find(n => n.id === parentId) : null;
        const heading = parent
          ? `${t('addChild')} — ${parent.title}`
          : t('orgNew');

        this.nodeDraft.title = '';
        this.nodeDraft.desc = '';

        await module._context.showModal.form(heading, this.$refs.nodeForm, {
          confirmLabel: module._context.i18n.t('common.save'),
          onMount: (el) => el.querySelector('[data-field="title"]')?.focus(),
          onConfirm: (el) => {
            const title = this.nodeDraft.title.trim();
            if (!title) { el.querySelector('[data-field="title"]')?.focus(); return false; }
            this._pushUndo();
            const desc = this.nodeDraft.desc.trim();
            const newNode = {
              id: crypto.randomUUID(), title, desc,
              pid: parentId ?? null,
              bg: '', borderColor: '', borderStyle: '', borderWidth: 0,
              _col: false, _h: false, _x: 0, _y: 0,
            };
            this.model.orgNodes.push(newNode);
            if (parentId) {
              const p = this.model.orgNodes.find(n => n.id === parentId);
              if (p) p._col = false;
            }
            this._orgRefresh();
            this._orgSelect(newNode.id);
            requestAnimationFrame(() => this._orgFit());
            return true;
          },
        });
      },

      /** Open the colour picker for a node-style swatch, writing the chosen
       *  colour (and its display value) back into nodeStyleDraft. */
      nodeStylePickColor(which, event) {
        const d = this.nodeStyleDraft;
        const cur = which === 'bg'
          ? (d.bg || d.bgDisplay)
          : (d.borderColor || d.borderColorDisplay);
        openColorPicker(event, cur, (c) => {
          if (which === 'bg') { d.bg = c; d.bgDisplay = c; }
          else { d.borderColor = c; d.borderColorDisplay = c; }
        });
      },

      async _orgOpenEdit(id) {
        const n = this.model.orgNodes.find(x => x.id === id);
        if (!n) return;

        const cs = getComputedStyle(document.documentElement);
        const defBg = this.model.orgStyle.nodeBg || cs.getPropertyValue('--color-bg-secondary').trim() || '#f8fafc';
        const defBorder = this.model.orgStyle.nodeBorderColor || cs.getPropertyValue('--color-border-secondary').trim() || '#e2e8f0';

        const d = this.nodeStyleDraft;
        d.title = n.title;
        d.desc = n.desc;
        d.bg = n.bg || '';
        d.borderColor = n.borderColor || '';
        d.bgDisplay = n.bg || defBg;
        d.borderColorDisplay = n.borderColor || defBorder;
        d.borderStyle = n.borderStyle || this.model.orgStyle.nodeBorderStyle || '';
        d.borderWidth = n.borderWidth || this.model.orgStyle.nodeBorderWidth || 1;

        await module._context.showModal.form(module._context.i18n.t('common.edit'), this.$refs.nodeStyleForm, {
          confirmLabel: module._context.i18n.t('common.save'),
          onMount: (el) => el.querySelector('[data-field="title"]')?.focus(),
          onConfirm: () => {
            const title = d.title.trim();
            if (!title) return false;
            this._pushUndo();
            n.title = title;
            n.desc = d.desc.trim();
            n.bg = d.bg || '';
            n.borderColor = d.borderColor || '';
            n.borderStyle = d.borderStyle || '';
            const bw = parseInt(d.borderWidth, 10);
            n.borderWidth = (bw && bw !== 1) ? Math.max(1, Math.min(8, bw)) : 0;
            this._orgRefresh();
            return true;
          },
        });
      },

      async _orgDeleteNode(id) {
        const t = (k, p) => _t(k, p);
        const node = this.model.orgNodes.find(n => n.id === id);
        if (!node) return;
        const confirmed = await module._context.confirmPopout(
          t('orgDeleteConfirm', { name: node.title || t('nodeTitle') }),
          { danger: true }
        );
        if (!confirmed) return;
        this._pushUndo();
        const delRecursive = (pid) => {
          this.model.orgNodes.filter(n => n.pid === pid).forEach(c => {
            delRecursive(c.id);
            this.model.orgNodes = this.model.orgNodes.filter(n => n.id !== c.id);
          });
        };
        delRecursive(id);
        this.model.orgNodes = this.model.orgNodes.filter(n => n.id !== id);
        if (this._orgSel === id) this._orgSel = null;
        this._orgRefresh();
      },

      _orgToggleCollapse(id) {
        const n = this.model.orgNodes.find(x => x.id === id);
        if (n) {
          n._col = !n._col;
          this._orgRefresh();
        }
      },

      // ─── Modebar ────────────────────────────────────────────

      _orgInitModebar() {
        if (this._modebar) { this._modebar.destroy(); this._modebar = null; }
        const wrap = this.$root.querySelector('[data-ref="orgWrap"]');
        if (!wrap) return;
        this._modebar = createModebar({
          onZoom: () => this._orgZoomIn(),
          onPan: () => {},
          onReset: () => this._orgFit(),
          onExportPNG: () => this._orgExportPNG(),
          onExportSVG: () => this._orgExportSVG(),
          onEditorToggle: (isOpen) => {
            this._orgEditorOpen = isOpen;
            const panel = this.$root.querySelector('[data-ref="orgEditor"]');
            if (panel) panel.classList.toggle('pc__org-editor--open', isOpen);
            if (isOpen) this._orgBuildEditor();
          },
        });
        if (this._orgEditorOpen) this._modebar.setEditorOpen(true);
        wrap.appendChild(this._modebar.el);
      },

      // ─── Editor panel ───────────────────────────────────────

      _orgApplyStyle() {
        const section = this.$root.querySelector('.pc__org-section');
        if (!section) return;
        const s = this.model.orgStyle;
        const setOrRemove = (name, val) => {
          if (val) section.style.setProperty(name, val);
          else section.style.removeProperty(name);
        };
        setOrRemove('--pc-org-node-bg', s.nodeBg);
        setOrRemove('--pc-org-node-border-color', s.nodeBorderColor);
        section.style.setProperty('--pc-org-node-border-style', s.nodeBorderStyle || 'solid');
        section.style.setProperty('--pc-org-node-border-width', `${s.nodeBorderWidth  }px`);
        setOrRemove('--pc-org-line-color', s.lineColor);
        section.style.setProperty('--pc-org-line-width', String(s.lineWidth));
        section.style.setProperty('--pc-org-line-dasharray', DASH_MAP[s.lineStyle] || 'none');
      },

      _orgBuildEditor() {
        const inner = this.$root.querySelector('[data-ref="orgEditorInner"]');
        if (!inner) return;
        inner.replaceChildren();

        const t = (key) => _t(`editor.${  key}`);
        const style = this.model.orgStyle;
        let editorUndoPushed = false;
        const apply = () => {
          if (!editorUndoPushed) { this._pushUndo(); editorUndoPushed = true; }
          this._orgApplyStyle();
          // Touch the reactive model so $watch persists the orgStyle change.
          this.model.orgStyle = { ...this.model.orgStyle };
        };

        const resolveColor = (value, cssProp) => {
          if (value) return value;
          const cs = getComputedStyle(document.documentElement);
          return cs.getPropertyValue(cssProp).trim() || 'rgba(255,255,255,1)';
        };

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

        const nodeSec = edSection(t('nodeAppearance'));
        nodeSec.appendChild(colorRow(t('bgColor'), style.nodeBg, '--color-bg-secondary', (v) => { style.nodeBg = v; }));
        nodeSec.appendChild(colorRow(t('borderColor'), style.nodeBorderColor, '--color-border-secondary', (v) => { style.nodeBorderColor = v; }));
        nodeSec.appendChild(edSelectRow(t('borderStyle'), styleOpts, style.nodeBorderStyle, (v) => { style.nodeBorderStyle = v; apply(); }));
        nodeSec.appendChild(edInlineNum(t('borderWidth'), style.nodeBorderWidth, (v) => { style.nodeBorderWidth = Math.max(1, Math.min(8, v)); apply(); }, 1, 8, 1));
        inner.appendChild(nodeSec);

        const lineSec = edSection(t('connectorLines'));
        lineSec.appendChild(colorRow(t('lineColor'), style.lineColor, '--color-border-secondary', (v) => { style.lineColor = v; }));
        lineSec.appendChild(edSelectRow(t('lineStyle'), styleOpts, style.lineStyle, (v) => { style.lineStyle = v; apply(); }));
        lineSec.appendChild(edInlineNum(t('lineWidth'), style.lineWidth, (v) => { style.lineWidth = Math.max(1, Math.min(8, v)); apply(); }, 1, 8, 1));
        inner.appendChild(lineSec);
      },

      // ─── SVG / PNG export ───────────────────────────────────

      _orgBuildExportSVG() {
        const visible = this.model.orgNodes.filter(n => !n._h);
        if (!visible.length) return null;

        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        visible.forEach(n => {
          const nodeH = this._orgNodeHeight(n.id);
          x1 = Math.min(x1, n._x);
          y1 = Math.min(y1, n._y);
          x2 = Math.max(x2, n._x + NW);
          y2 = Math.max(y2, n._y + nodeH);
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

        const styles = getComputedStyle(document.documentElement);
        const bgPrimary = styles.getPropertyValue('--color-bg-primary').trim() || '#ffffff';
        const bgSecondary = styles.getPropertyValue('--color-bg-secondary').trim() || '#f8fafc';
        const borderColor = styles.getPropertyValue('--color-border-secondary').trim() || '#e2e8f0';
        const textPrimary = styles.getPropertyValue('--color-text-primary').trim() || '#1e293b';
        const textSecondary = styles.getPropertyValue('--color-text-secondary').trim() || '#64748b';
        const lineColor = styles.getPropertyValue('--color-border-primary').trim() || '#cbd5e1';

        const bg = document.createElementNS(NS, 'rect');
        bg.setAttribute('width', vw);
        bg.setAttribute('height', vh);
        bg.setAttribute('fill', bgPrimary);
        svg.appendChild(bg);

        visible.filter(n => n.pid !== null).forEach(n => {
          const parent = this.model.orgNodes.find(p => p.id === n.pid);
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
          path.setAttribute('stroke', this.model.orgStyle.lineColor || lineColor);
          path.setAttribute('stroke-width', String(this.model.orgStyle.lineWidth || 2));
          const lineDash = DASH_MAP[this.model.orgStyle.lineStyle];
          if (lineDash && lineDash !== 'none') path.setAttribute('stroke-dasharray', lineDash);
          svg.appendChild(path);
        });

        visible.forEach(n => {
          const nh = this._orgNodeHeight(n.id);
          const nx = n._x + offX;
          const ny = n._y + offY;
          const rect = document.createElementNS(NS, 'rect');
          rect.setAttribute('x', nx);
          rect.setAttribute('y', ny);
          rect.setAttribute('width', NW);
          rect.setAttribute('height', nh);
          rect.setAttribute('rx', 6);
          rect.setAttribute('fill', n.bg || this.model.orgStyle.nodeBg || bgSecondary);
          rect.setAttribute('stroke', n.borderColor || this.model.orgStyle.nodeBorderColor || borderColor);
          rect.setAttribute('stroke-width', String(n.borderWidth || this.model.orgStyle.nodeBorderWidth || 1));
          const nbs = n.borderStyle || this.model.orgStyle.nodeBorderStyle;
          const nodeDash = DASH_MAP[nbs];
          if (nodeDash && nodeDash !== 'none') rect.setAttribute('stroke-dasharray', nodeDash);
          svg.appendChild(rect);

          const title = document.createElementNS(NS, 'text');
          title.setAttribute('x', nx + 12);
          title.setAttribute('y', ny + 22);
          title.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
          title.setAttribute('font-size', '13');
          title.setAttribute('font-weight', '600');
          title.setAttribute('fill', textPrimary);
          title.textContent = n.title;
          svg.appendChild(title);

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

      async _orgExportPNG() {
        const svg = this._orgBuildExportSVG();
        if (!svg) return;
        await exportSvgAsPNG(svg, 'organigramm.png');
      },

      _orgExportSVG() {
        const svg = this._orgBuildExportSVG();
        if (!svg) return;
        exportSvgAsFile(svg, 'organigramm.svg');
      },

      // ─── Undo ───────────────────────────────────────────────

      _pushUndo() {
        this._undoStack.push(JSON.stringify(this.model.toJSON()));
        if (this._undoStack.length > UNDO_MAX) this._undoStack.shift();
        this._confirmTick++; // refresh undo-button disabled state
      },

      _undo() {
        if (!this._undoStack.length) return;
        const snapshot = JSON.parse(this._undoStack.pop());
        const restored = State.fromJSON(snapshot);
        this.model.problemStatement = restored.problemStatement;
        this.model.goals = restored.goals;
        this.model.orgNodes = restored.orgNodes;
        this.model.orgStyle = restored.orgStyle;
        this._orgSel = null;
        this._confirmTick++;
        // Re-sync contenteditable + org chart imperatively (synchronously, so
        // the node count reflects the undo immediately — matches legacy _render).
        const editor = this.$root.querySelector('[data-ref="problemEditor"]');
        if (editor) {
          editor.replaceChildren(prepareFragment(this.model.problemStatement));
          editor.classList.toggle('pc__problem-editor--empty', !editor.textContent.trim());
        }
        this._orgRefresh();
      },
    };
  },
});
