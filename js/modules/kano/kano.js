/**
 * D.Mike — Kano Module (kano.js)
 *
 * Klassifiziert Anforderungen aus dem VoC→CTx-Baum nach dem Kano-Modell.
 * DMAIC-Phase: Define.
 *
 * Der Model (kano-model.js) hält den persistierten Zustand, kano-link.js die
 * gesamte Kenntnis des Baum-Moduls, kano-engine.js die Auswertung. Diese
 * data-Fn besitzt nur die Ansicht: Quellenauswahl, Sync-Anzeige, Erfassung,
 * Ergebnisaufbereitung und das Chart-Mount.
 *
 * Datenrichtung ist eine Einbahnstraße — es wird nie in den Baum geschrieben.
 *
 * Spec: docs/superpowers/specs/2026-07-25-kano-modul-design.md
 */

import { createModule } from '../../core/template-module.js';
import { State } from './kano-model.js';
import { listTrees, flatten, diff, applyDiff, LEVELS } from './kano-link.js';

export default createModule({
  config: {
    id: 'kano',
    engine: 'alpine',
    phase: 'define',
    icon: 'layers',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      /** Ebenen für das Select (statische Optionen im Template, siehe alpine.md #3). */
      levels: LEVELS,
      /** @type {Array<{instanceId: string, state: object|null}>} */
      treeList: [],
      /** @type {{added: number, renamed: number, missing: number}} */
      pending: { added: 0, renamed: 0, missing: 0 },

      init() {
        this.refreshTrees();
        const eb = module._context.eventBus;
        this._unsubs = [];
        const onChange = () => this.refreshTrees();
        for (const evt of ['state:saved', 'module:added', 'module:removed']) {
          eb.on(evt, onChange);
          this._unsubs.push(() => eb.off(evt, onChange));
        }
      },

      destroy() {
        (this._unsubs || []).forEach((off) => off());
        this._unsubs = [];
      },

      // ── Quelle ────────────────────────────────────────────────

      /** Liest die Baumliste neu und aktualisiert den Sync-Status. */
      refreshTrees() {
        this.treeList = listTrees(module._context.stateManager);
        if (!this.model.source.instanceId && this.treeList.length === 1) {
          this.model.source.instanceId = this.treeList[0].instanceId;
        }
        this.refreshPending();
      },

      /** @returns {object|null} State des verknüpften Baums */
      activeTreeState() {
        const id = this.model.source.instanceId;
        return id ? (this.treeList.find((t) => t.instanceId === id)?.state || null) : null;
      },

      /** @returns {boolean} true, wenn kein Baum im Projekt existiert */
      hasNoTree() { return this.treeList.length === 0; },

      /** @returns {boolean} true, wenn Items ohne Baumbezug vorliegen */
      isDetached() {
        return !this.model.source.instanceId && this.model.items.length > 0;
      },

      changeTree(ev) {
        this.model.source.instanceId = ev.target.value || null;
        this.refreshPending();
      },

      // ── Ebene ─────────────────────────────────────────────────

      async changeLevel(ev) {
        const next = ev.target.value;
        const hasAnswers = Object.values(this.model.answers)
          .some((byItem) => Object.values(byItem || {})
            .some((a) => a.f !== null || a.d !== null || a.w !== null));
        if (hasAnswers) {
          const ok = await module._context.confirmPopout(_t('levelChangeConfirm'), { danger: true });
          if (!ok) { ev.target.value = this.model.source.level; return; }
        }
        this.model.source.level = next;
        this.model.setItems([]);
        this.model.answers = {};
        this.refreshPending();
      },

      toggleImportance() {
        this.model.options.importance = !this.model.options.importance;
      },

      // ── Sync ──────────────────────────────────────────────────

      /** Zählt das offene Diff gegen den Baum. */
      refreshPending() {
        const tree = this.activeTreeState();
        if (!tree) { this.pending = { added: 0, renamed: 0, missing: 0 }; return; }
        const d = diff(this.model.items, flatten(tree, this.model.source.level));
        this.pending = { added: d.added.length, renamed: d.renamed.length, missing: d.missing.length };
      },

      /** @returns {boolean} true, wenn es etwas zu übernehmen gibt */
      hasPending() {
        const p = this.pending;
        return p.added + p.renamed + p.missing > 0;
      },

      /** Statuszeile unter dem Sync-Button. */
      syncStatus() {
        if (this.isDetached()) return _t('syncDetached');
        if (!this.activeTreeState()) return '';
        if (!this.hasPending()) return _t('syncClean');
        return _t('syncPending')
          .replace('{added}', String(this.pending.added))
          .replace('{renamed}', String(this.pending.renamed))
          .replace('{missing}', String(this.pending.missing));
      },

      /** Übernimmt das Diff in die Item-Liste. */
      applySync() {
        const tree = this.activeTreeState();
        if (!tree) return;
        const d = diff(this.model.items, flatten(tree, this.model.source.level));
        this.model.setItems(applyDiff(this.model.items, d, () => crypto.randomUUID()));
        this.refreshPending();
      },
    };
  },
});
