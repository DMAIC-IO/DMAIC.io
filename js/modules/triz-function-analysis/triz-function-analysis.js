/**
 * D.Mike — TRIZ function analysis module.
 *
 * Three tabs: components, interaction matrix, function model. The diagram
 * follows the org-chart pattern of project-charter: HTML boxes moved by the
 * module, a links-only node-diagram overlay for the arrows.
 */

import { createModule } from '../../core/template-module.js';
import {
  State, KINDS, LEVELS, TABS,
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

      // ── Selection ──
      select(id) { this.selectedId = this.selectedId === id ? null : id; },
    };
  },
});
