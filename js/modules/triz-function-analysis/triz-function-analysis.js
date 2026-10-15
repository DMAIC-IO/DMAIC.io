/**
 * D.Mike — TRIZ function analysis module.
 *
 * Three tabs: components, interaction matrix, function model. The diagram
 * follows the org-chart pattern of project-charter: HTML boxes moved by the
 * module, a links-only node-diagram overlay for the arrows.
 */

import { createModule } from '../../core/template-module.js';
import {
  State, KINDS, LEVELS, TABS, orderedComponents, openPairs, rankOf, disadvantages,
} from './triz-function-analysis-model.js';

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
      cellTitle(r, c) {
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
      addFunction() { this.selectedId = this.model.addFunction().id; },
      setCarrier(fn, ev) {
        if (!this.model.setEndpoints(fn.id, ev.target.value, fn.object)) {
          ev.target.value = fn.carrier;
          notify(_t('sameEndpoint'));
        }
      },
      setObject(fn, ev) {
        if (!this.model.setEndpoints(fn.id, fn.carrier, ev.target.value)) {
          ev.target.value = fn.object;
          notify(_t('sameEndpoint'));
        }
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
          fn.id === this.selectedId ? 'tfa__fn--selected' : '',
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

      // ── Selection ──
      select(id) { this.selectedId = this.selectedId === id ? null : id; },
    };
  },
});
