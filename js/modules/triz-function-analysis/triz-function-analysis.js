/**
 * D.Mike — TRIZ function analysis module.
 *
 * Three tabs: components, interaction matrix, function model. The diagram
 * follows the org-chart pattern of project-charter: HTML boxes moved by the
 * module, a links-only node-diagram overlay for the arrows.
 */

import { createModule } from '../../core/template-module.js';
import {
  State, KINDS, GROUPS, LEVELS, TABS, orderedComponents, openPairs, rankOf, disadvantages, isComplete,
} from './triz-function-analysis-model.js';
import {
  NODE_W, NODE_H, resolvePositions, buildFunctionDiagram,
} from './triz-function-analysis-diagram.js';

/** Arrow overlay chart per component root (not reactive, not persisted). */
const arrowCharts = new WeakMap();
const DRAG_THRESHOLD = 3;
const CANVAS_PAD = 20;
const CANVAS_MIN = { w: 480, h: 240 };

export default createModule({
  config: {
    id: 'triz-function-analysis',
    engine: 'alpine',
    phase: 'improve',
    icon: 'module.triz-function-analysis',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    const notify = (msg) => module._context.notify?.(msg);
    const label = (c) => c.name.trim() || _t('unnamed');

    return {
      TABS,
      KINDS,
      GROUPS,
      LEVELS,
      selectedId: null,

      // ── Tabs ──
      setTab(tab) { if (TABS.includes(tab)) this.model.activeTab = tab; },
      tabLabel(tab) { return _t(`tab.${tab}`); },
      tabClass(tab) { return tab === this.model.activeTab ? 'dmike-tab--active' : ''; },
      contentClass(tab) { return tab === this.model.activeTab ? 'dmike-tab-content--active' : ''; },

      // ── Components ──
      groupLabel(kind) { return _t(`group.${kind}`); },
      componentsOf(kind) { return this.model.components.filter((c) => c.kind === kind); },
      canAdd(kind) { return kind !== 'target' || !this.model.components.some((c) => c.kind === 'target'); },
      addComponent(kind) {
        if (!this.canAdd(kind)) return;
        const { component, demoted } = this.model.addComponent(kind);
        if (demoted) notify(_t('targetDemoted', { name: label(demoted) }));
        this.$nextTick(() => {
          this.$root.querySelector(`[data-role="component"][data-id="${component.id}"] [data-role="component-name"]`)?.focus();
        });
      },
      setName(c, ev) { c.name = ev.target.value; },
      setNote(c, ev) { c.note = ev.target.value; },
      changeKind(c, ev) {
        const demoted = this.model.setKind(c.id, ev.target.value);
        if (demoted) notify(_t('targetDemoted', { name: label(demoted) }));
      },
      discardIfEmpty(c) {
        if (this.model.discardIfEmpty(c.id) && this.selectedId === c.id) this.selectedId = null;
      },
      async removeComponent(c) {
        const count = this.model.impactOf(c.id);
        const message = count
          ? _t('confirmDeleteUsed', { name: label(c), count })
          : _t('confirmDelete', { name: label(c) });
        const ok = await module._context.dialog.confirm({ message, danger: true });
        if (!ok) return;
        this.model.removeComponent(c.id);
        if (this.selectedId === c.id) this.selectedId = null;
      },

      // ── Interaction matrix ──
      matrixComponents() { return orderedComponents(this.model.components); },
      headClass(c) { return `tfa__mh tfa__mh--${c.kind}`; },
      cellClass(ri, ci) {
        if (ci === ri) return 'tfa__cell tfa__cell--diag';
        return ci > ri ? 'tfa__cell' : 'tfa__cell tfa__cell--off';
      },
      isTicked(r, c) { return this.model.hasInteraction(r.id, c.id); },
      isExcluded(r, c) { return this.model.isExcluded(r.id, c.id); },
      cellState(r, c) { return this.model.pairState(r.id, c.id); },
      cellTitle(r, c) {
        if (this.isExcluded(r, c)) return _t('pairExcluded');
        const n = this.model.usersOf(r.id, c.id);
        return n ? _t('pairLocked', { count: n }) : '';
      },
      toggleCell(r, c) {
        const res = this.model.toggleInteraction(r.id, c.id);
        if (!res.ok && res.usedBy) notify(_t('pairLocked', { count: res.usedBy }));
      },
      matrixSummary() {
        return _t('matrixSummary', { count: this.model.interactions.length, open: openPairs(this.model).length });
      },

      // ── Function model: open pairs and function cards ──
      openPairChips() {
        const order = new Map(this.matrixComponents().map((c, i) => [c.id, i]));
        const name = (id) => label(this.model.component(id));
        return openPairs(this.model).map((p) => {
          const [a, b] = order.get(p.a) <= order.get(p.b) ? [p.a, p.b] : [p.b, p.a];
          return { key: `${a}|${b}`, a, b, label: `${name(a)} — ${name(b)}` };
        });
      },
      createFromPair(p) { this.selectedId = this.model.addFunction(p.a, p.b).id; },
      addOnPair(fn) { this.selectedId = this.model.addFunction(fn.carrier, fn.object).id; },
      isComplete(fn) { return isComplete(fn); },
      endName(id) {
        const c = this.model.component(id);
        return c ? label(c) : '—';
      },
      setVerb(fn, ev) { fn.verb = ev.target.value; },
      setParameter(fn, ev) { fn.parameter = ev.target.value; },
      changeType(fn, ev) { this.model.setType(fn.id, ev.target.value); },
      changeLevel(fn, ev) { this.model.setLevel(fn.id, ev.target.value); },
      swap(fn) { this.model.swapDirection(fn.id); },
      removeFunction(fn) {
        this.model.removeFunction(fn.id);
        if (this.selectedId === fn.id) this.selectedId = null;
      },
      rankLabel(fn) {
        const r = rankOf(fn, this.model.components);
        return r ? _t(`rank.${r}`) : '';
      },
      fnClass(fn) {
        return [
          // The row itself, or a component it uses, is selected
          this.selectedId && [fn.id, fn.carrier, fn.object].includes(this.selectedId) ? 'tfa__fn--selected' : '',
          fn.type === 'harmful' ? 'tfa__fn--harmful' : '',
        ].filter(Boolean).join(' ');
      },

      // ── Disadvantages ──
      disadvantageGroups() {
        const all = disadvantages(this.model);
        return ['harmful', 'insufficient', 'excessive']
          .map((kind) => ({
            kind,
            title: _t(`disadvantage.${kind}`),
            items: all.filter((d) => d.kind === kind).map((d) => ({ ...d, verb: d.verb || _t('verbMissing') })),
          }))
          .filter((g) => g.items.length > 0);
      },
      paramText(d) { return d.parameter ? ` (${d.parameter})` : ''; },

      // ── Lifecycle: arrow overlay ──
      init() {
        this.$nextTick(() => this._mountArrows());
      },
      destroy() {
        this._unmounted = true;
        const chart = arrowCharts.get(this.$root);
        if (chart) { module._context.chartManager.destroy(chart); arrowCharts.delete(this.$root); }
      },
      _mountArrows() {
        const host = this.$root.querySelector('[data-ref="arrows"]');
        if (!host) return;
        const root = this.$root;
        const cm = module._context.chartManager;
        cm.create(host, 'node-diagram', {
          showModebar: false, origin: 'zero', padding: 0, nodes: [], links: [], highlightClass: 'tfa__arrow--hl',
        }).then((chart) => {
          if (!chart) return;
          // Unmounted while the chart type was loading: do not keep an orphan.
          if (this._unmounted || !root.isConnected) { cm.destroy(chart); return; }
          arrowCharts.set(root, chart);
          this.drawArrows();
        });
      },

      /**
       * Redraw the arrows. Called by x-effect (reads model + selection, writes
       * nothing reactive) and on every pointer move of a drag with the
       * dragged box's live position as override.
       * @param {{id:string,x:number,y:number}|null} [override]
       */
      drawArrows(override = null) {
        const positions = override
          ? { ...this.model.positions, [override.id]: { x: override.x, y: override.y } }
          : this.model.positions;
        const { links } = buildFunctionDiagram(
          { components: this.model.components, functions: this.model.functions, positions },
          { selectedId: this.selectedId });
        const chart = arrowCharts.get(this.$root);
        if (chart) module._context.chartManager.update(chart, { links });
      },

      // ── Boxes ──
      canvasStyle() {
        const pos = Object.values(resolvePositions(this.model));
        const w = Math.max(CANVAS_MIN.w, ...pos.map((p) => p.x + NODE_W + CANVAS_PAD));
        const h = Math.max(CANVAS_MIN.h, ...pos.map((p) => p.y + NODE_H + CANVAS_PAD));
        return `width:${w}px;height:${h}px`;
      },
      nodeStyle(c) {
        const p = resolvePositions(this.model)[c.id];
        return `left:${p.x}px;top:${p.y}px;width:${NODE_W}px;height:${NODE_H}px`;
      },
      nodeClass(c) {
        return [`tfa__node--${c.kind}`, c.id === this.selectedId ? 'tfa__node--selected' : ''].filter(Boolean).join(' ');
      },
      startDrag(c, ev) {
        if (ev.button !== 0) return;
        const el = ev.currentTarget;
        const start = resolvePositions(this.model)[c.id];
        const sx = ev.clientX, sy = ev.clientY;
        let moved = false, x = start.x, y = start.y;
        const onMove = (e) => {
          const dx = e.clientX - sx, dy = e.clientY - sy;
          if (!moved && Math.abs(dx) <= DRAG_THRESHOLD && Math.abs(dy) <= DRAG_THRESHOLD) return;
          moved = true;
          x = Math.max(0, start.x + dx);
          y = Math.max(0, start.y + dy);
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
          el.classList.add('tfa__node--drag');
          this.drawArrows({ id: c.id, x, y });
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          el.classList.remove('tfa__node--drag');
          if (moved) this.model.movePosition(c.id, x, y);
          else this.select(c.id);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      },
      resetLayout() { this.model.resetPositions(); },
      async exportDiagram(fmt) {
        const { nodes, links } = buildFunctionDiagram(this.model);
        await module._context.chartManager.exportOffscreen('node-diagram', { nodes, links, padding: 30 }, fmt, 'funktionsmodell');
      },

      // ── Selection ──
      select(id) { this.selectedId = this.selectedId === id ? null : id; },
      /** Card clicks only select: editing a row must not toggle its selection. */
      selectFunction(id) { this.selectedId = id; },
    };
  },
});
