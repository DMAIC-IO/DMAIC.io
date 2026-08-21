/**
 * D.Mike — RACI Matrix Module (raci-matrix.js)
 * Define phase: Assign Responsible, Accountable, Consulted, Informed
 * roles per activity/task to project stakeholders.
 *
 * Migrated to createModule + Alpine CSP. The Model (raci-matrix-model.js)
 * holds the persisted state (activities, stakeholders, assignments) plus all
 * RACI business logic (cycle, add/remove with reindexing, move, rename,
 * validation). The data-fn owns the view transforms (role colors, legend,
 * warnings), the add/cell/delete/rename/drag handlers, the transient rename
 * and drag UI state, and CSV export.
 */

import { createModule } from '../../core/template-module.js';
import { downloadFile } from '../../core/export-utils.js';
import {
  State, ROLES, ACTIVITY_MAXLEN, STAKEHOLDER_MAXLEN,
} from './raci-matrix-model.js';

// ─── Role colors (view only) ──────────────────────────────────

const ROLE_COLORS = {
  R: { bg: 'var(--color-error-alpha, rgba(239,68,68,0.12))',   text: 'var(--color-error)' },
  A: { bg: 'var(--color-warning-alpha, rgba(234,179,8,0.12))', text: 'var(--color-warning)' },
  C: { bg: 'var(--color-accent-alpha, rgba(59,130,246,0.12))', text: 'var(--color-accent)' },
  I: { bg: 'var(--color-success-alpha, rgba(34,197,94,0.12))', text: 'var(--color-success)' },
};

export default createModule({
  config: {
    id: 'raci-matrix',
    engine: 'alpine',
    phase: 'define',
    icon: 'module.raci-matrix',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      { icon: 'action.download', title: 'export.label', children: [
        { icon: 'format.csv', title: 'export.csv', onClick: (d) => d.exportCSV() },
      ] },
    ],
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Static view data ──────────────────────────────────────
      roles: ROLES,
      activityMaxlen: ACTIVITY_MAXLEN,
      stakeholderMaxlen: STAKEHOLDER_MAXLEN,
      dragGlyph: '⠿',  // ⠿ drag handle (Braille dots 1-6)
      warnGlyph: '⚠',  // ⚠ warning sign

      // ── Transient input + rename + drag UI state ──────────────
      newActivity: '',
      newStakeholder: '',
      /** @type {{type:'activity'|'stakeholder', idx:number}|null} */
      rename: null,
      renameValue: '',
      /** @type {number|null} index of the row currently being dragged */
      dragIdx: null,

      // ── View transforms ───────────────────────────────────────
      legendStyle(role) {
        const c = ROLE_COLORS[role];
        return c ? `background:${c.bg};color:${c.text}` : '';
      },
      legendLabel(role) {
        return `${role  } = ${  _t(`role${  role}`)}`;
      },
      cellStyle(role) {
        const c = role ? ROLE_COLORS[role] : null;
        return c ? `background:${c.bg};color:${c.text}` : '';
      },
      addLabel(key) {
        return `+ ${  _t(key)}`;
      },
      cornerLabel() {
        return `${_t('activity')  } \\ ${  _t('stakeholder')}`;
      },
      renameTitle(value) {
        return `${value  } — ${  _t('renameHint')}`;
      },

      // ── Validation views ──────────────────────────────────────
      // Legacy only validated when both activities AND stakeholders exist.
      warningsActive() {
        return this.model.activities.length > 0 && this.model.stakeholders.length > 0;
      },
      /**
       * Call validate() once per render and return a Map keyed by aIdx.
       * Alpine re-invokes this on every reactive render, so it stays fresh.
       * @returns {Map<number, {aIdx:number, issues:string[]}>}
       */
      warningsByRow() {
        const map = new Map();
        if (!this.warningsActive()) return map;
        for (const w of this.model.validate()) map.set(w.aIdx, w);
        return map;
      },
      hasWarning(aIdx) {
        return this.warningsByRow().has(aIdx);
      },
      warnTitle(aIdx) {
        const w = this.warningsByRow().get(aIdx);
        if (!w) return '';
        return w.issues.map(i => _t(`warn_${  i}`)).join(', ');
      },
      rowWarnClass(aIdx) {
        return this.hasWarning(aIdx) ? 'raci__row--warn' : '';
      },

      // ── Add handlers ──────────────────────────────────────────
      addActivityFromInput() {
        const v = this.newActivity.trim();
        if (!v) return;
        this.model.addActivity(v);
        this.newActivity = '';
        this.$nextTick(() => {
          this.$el.querySelector('[data-add="activity"]')?.focus();
        });
      },
      addStakeholderFromInput() {
        const v = this.newStakeholder.trim();
        if (!v) return;
        this.model.addStakeholder(v);
        this.newStakeholder = '';
        this.$nextTick(() => {
          this.$el.querySelector('[data-add="stakeholder"]')?.focus();
        });
      },

      // ── Cell + delete handlers ────────────────────────────────
      cycleRole(aIdx, sIdx) {
        this.model.cycleRole(aIdx, sIdx);
      },
      removeActivity(idx) {
        this.model.removeActivity(idx);
      },
      removeStakeholder(idx) {
        this.model.removeStakeholder(idx);
      },

      // ── Inline rename ─────────────────────────────────────────
      isRenaming(type, idx) {
        return Boolean(this.rename) && this.rename.type === type && this.rename.idx === idx;
      },
      startRename(type, idx) {
        const list = type === 'activity' ? this.model.activities : this.model.stakeholders;
        this.rename = { type, idx };
        this.renameValue = list[idx];
        this.$nextTick(() => {
          const input = this.$el.querySelector('.raci__rename-input');
          if (input) { input.focus(); input.select(); }
        });
      },
      commitRename() {
        if (!this.rename) return;
        const { type, idx } = this.rename;
        if (type === 'activity') this.model.renameActivity(idx, this.renameValue);
        else this.model.renameStakeholder(idx, this.renameValue);
        this.rename = null;
        this.renameValue = '';
      },
      cancelRename() {
        this.rename = null;
        this.renameValue = '';
      },

      // ── Drag & drop row reorder ───────────────────────────────
      dragStart(aIdx, event) {
        this.dragIdx = aIdx;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', ''); // required for Firefox
        event.currentTarget.classList.add('raci__row--dragging');
      },
      dragEnd(event) {
        event.currentTarget.classList.remove('raci__row--dragging');
        this.$el.querySelectorAll('.raci__row--drop-before, .raci__row--drop-after').forEach(
          r => r.classList.remove('raci__row--drop-before', 'raci__row--drop-after')
        );
        this.dragIdx = null;
      },
      dragOver(aIdx, event) {
        if (this.dragIdx === null) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const row = event.currentTarget;
        const rect = row.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        row.classList.toggle('raci__row--drop-before', before);
        row.classList.toggle('raci__row--drop-after', !before);
      },
      dragLeave(event) {
        event.currentTarget.classList.remove('raci__row--drop-before', 'raci__row--drop-after');
      },
      drop(targetIdx, event) {
        event.preventDefault();
        event.currentTarget.classList.remove('raci__row--drop-before', 'raci__row--drop-after');
        if (this.dragIdx === null || this.dragIdx === targetIdx) { this.dragIdx = null; return; }
        const rect = event.currentTarget.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        let toIdx = before ? targetIdx : targetIdx + 1;
        if (this.dragIdx < toIdx) toIdx--;
        this.model.moveActivity(this.dragIdx, toIdx);
        this.dragIdx = null;
      },

      // ── Export ────────────────────────────────────────────────
      exportCSV() {
        const m = this.model;
        if (!m.activities.length || !m.stakeholders.length) return;
        const sep = ';';
        const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
        const header = [q(this.t('activity')), ...m.stakeholders.map(q)].join(sep);
        const rows = m.activities.map((a, aIdx) => {
          const cells = m.stakeholders.map((_, sIdx) => m.getRole(aIdx, sIdx) || '');
          return [q(a), ...cells.map(q)].join(sep);
        });
        const csv = [header, ...rows].join('\n');
        downloadFile(csv, 'raci-matrix.csv', 'text/csv;charset=utf-8');
        module._context.notify(this.t('exportedCSV'), 'success');
      },
    };
  },
});
