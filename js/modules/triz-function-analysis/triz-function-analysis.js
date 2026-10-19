/**
 * D.Mike — TRIZ function analysis module.
 *
 * Four tabs: components, interaction matrix, function model, value & cost. The diagram
 * follows the org-chart pattern of project-charter: HTML boxes moved by the
 * module, a links-only node-diagram overlay for the arrows.
 */

import { createModule } from '../../core/template-module.js';
import {
  State, KINDS, GROUPS, LEVELS, TABS, orderedComponents, openPairs, rankOf, disadvantages, functionPairs, valueCostRows,
} from './triz-function-analysis-model.js';
import {
  NODE_W, NODE_H, resolvePositions, buildFunctionDiagram,
} from './triz-function-analysis-diagram.js';

/** Arrow overlay chart per component root (not reactive, not persisted). */
const arrowCharts = new WeakMap();
/** Value & cost scatter per component root (not reactive, not persisted). */
const valueCostCharts = new WeakMap();
/** Crosshair at the middle of both normalised axes; top left = trimming candidates. */
const VC_SPLIT = 5;
const DRAG_THRESHOLD = 3;
const CANVAS_PAD = 20;
const CANVAS_MIN = { w: 480, h: 240 };
/** Room right of / below a dragged verb label (its centre) so it stays on the canvas. */
const LABEL_ROOM = 60;

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
      /** Store a cost typed into a system row; an invalid entry snaps back to the stored value. */
      setCost(c, ev) {
        // Unparsable text ('2e') reads as '' and would otherwise clear the cost.
        if (ev.target.validity.badInput || !this.model.setCost(c.id, ev.target.value)) {
          ev.target.value = this.costValue(c);
        }
      },
      costValue(c) { return c.cost ?? ''; },
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
      /** Function blocks, one per pair; a/b follow the matrix order so the header never flips. */
      pairBlocks() {
        const order = new Map(this.matrixComponents().map((c, i) => [c.id, i]));
        return functionPairs(this.model).map((g) => {
          const [a, b] = g.complete && order.get(g.b) < order.get(g.a) ? [g.b, g.a] : [g.a, g.b];
          return { ...g, a, b, label: `${this.endName(a)} — ${this.endName(b)}` };
        });
      },
      addOnPair(g) { this.selectedId = this.model.addFunction(g.a, g.b).id; },
      endName(id) {
        const c = this.model.component(id);
        return c ? label(c) : '—';
      },
      isForward(fn, g) { return fn.carrier === g.a; },
      isBackward(fn, g) { return fn.carrier !== g.a; },
      directionLabel(fn) { return `${this.endName(fn.carrier)} → ${this.endName(fn.object)}`; },
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

      // ── Value & cost ──
      /** Table rows of the system components, formatted for the UI language. */
      vcRows() {
        const locale = module._context.i18n.getLanguage() === 'en' ? 'en-US' : 'de-DE';
        const int = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
        const dec = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        const eur = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });
        return valueCostRows(this.model).map((r) => ({
          id: r.id,
          name: label(r),
          value: int.format(r.value),
          normValue: dec.format(r.normValue),
          cost: r.cost === null ? '–' : eur.format(r.cost),
          normCost: r.normCost === null ? '–' : dec.format(r.normCost),
        }));
      },
      /** @returns {string} hint shown instead of the plot, '' when there is something to plot */
      valueCostEmpty() {
        const rows = valueCostRows(this.model);
        if (rows.length === 0) return _t('vc.emptyComponents');
        return rows.some((r) => r.cost !== null) ? '' : _t('vc.emptyCosts');
      },
      /** Redraw the scatter; called by x-effect, reads the model and writes nothing reactive. */
      drawValueCost() {
        const rows = valueCostRows(this.model).filter((r) => r.cost !== null);
        const chart = valueCostCharts.get(this.$root);
        if (!chart) return;
        module._context.chartManager.update(chart, {
          xLabel: _t('vc.axisValue'),
          yLabel: _t('vc.axisCost'),
          series: [{
            name: _t('vc.cost'),
            x: rows.map((r) => r.normValue),
            y: rows.map((r) => r.normCost),
            labels: rows.map((r) => label(r)),
          }],
        });
      },

      // ── Lifecycle: arrow overlay and value & cost chart ──
      init() {
        this.$nextTick(() => { this._mountArrows(); this._mountValueCost(); });
      },
      destroy() {
        this._unmounted = true;
        const cm = module._context.chartManager;
        for (const charts of [arrowCharts, valueCostCharts]) {
          const chart = charts.get(this.$root);
          if (chart) { cm.destroy(chart); charts.delete(this.$root); }
        }
      },
      _mountValueCost() {
        const host = this.$root.querySelector('[data-ref="value-cost-chart"]');
        if (!host) return;
        const root = this.$root;
        const cm = module._context.chartManager;
        const split = { value: VC_SPLIT, dash: 'dash', color: 'var(--color-text-secondary)' };
        cm.create(host, 'scatter', {
          title: '', xLabel: _t('vc.axisValue'), yLabel: _t('vc.axisCost'), showLegend: false,
          // Half a unit of margin keeps a point at 0 or 10 from being cut off.
          xMin: -0.5, xMax: 10.5, yMin: -0.5, yMax: 10.5,
          refLines: [{ dir: 'v', ...split }, { dir: 'h', ...split }],
          series: [],
        }).then((chart) => {
          if (!chart) return;
          // Unmounted while the chart type was loading: do not keep an orphan.
          if (this._unmounted || !root.isConnected) { cm.destroy(chart); return; }
          valueCostCharts.set(root, chart);
          this.drawValueCost();
        });
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
       * dragged box's or verb label's live position as override.
       * @param {{positions?: Object, labels?: Object}} [override]
       */
      drawArrows(override = {}) {
        const { nodes, links } = buildFunctionDiagram({
          components: this.model.components,
          functions: this.model.functions,
          positions: { ...this.model.positions, ...override.positions },
          labels: { ...this.model.labels, ...override.labels },
        }, { selectedId: this.selectedId });
        const chart = arrowCharts.get(this.$root);
        // Outlines come from the SVG (ellipse/hexagon), names from the draggable HTML boxes.
        const outlines = nodes.map((n) => ({ ...n, lines: [] }));
        if (chart) module._context.chartManager.update(chart, { nodes: outlines, links });
      },

      // ── Boxes ──
      canvasStyle() {
        const pos = Object.values(resolvePositions(this.model));
        const labels = Object.values(this.model.labels);
        const w = Math.max(CANVAS_MIN.w, ...pos.map((p) => p.x + NODE_W + CANVAS_PAD), ...labels.map((p) => p.x + LABEL_ROOM));
        const h = Math.max(CANVAS_MIN.h, ...pos.map((p) => p.y + NODE_H + CANVAS_PAD), ...labels.map((p) => p.y + LABEL_ROOM));
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
          this.drawArrows({ positions: { [c.id]: { x, y } } });
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
      /**
       * Drag a verb label (SVG overlay, delegated): the arrow bends at the
       * label. A click without moving selects the function.
       * @param {PointerEvent} ev
       */
      startLabelDrag(ev) {
        if (ev.button !== 0) return;
        const id = ev.target.closest?.('[data-part^="link-label"]')?.getAttribute('data-id');
        const link = id && buildFunctionDiagram(this.model).links.find((l) => l.id === id);
        if (!link) return;
        ev.preventDefault();
        const start = link.via ?? { x: (link.x1 + link.x2) / 2, y: (link.y1 + link.y2) / 2 };
        const sx = ev.clientX, sy = ev.clientY;
        let moved = false, x = start.x, y = start.y;
        const onMove = (e) => {
          const dx = e.clientX - sx, dy = e.clientY - sy;
          if (!moved && Math.abs(dx) <= DRAG_THRESHOLD && Math.abs(dy) <= DRAG_THRESHOLD) return;
          moved = true;
          x = Math.max(0, start.x + dx);
          y = Math.max(0, start.y + dy);
          this.drawArrows({ labels: { [id]: { x, y } } });
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          if (moved) this.model.moveLabel(id, x, y);
          else this.select(id);
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
