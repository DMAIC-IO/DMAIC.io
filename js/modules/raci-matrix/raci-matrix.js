/**
 * D.Mike — RACI Matrix Module (raci-matrix.js)
 * Define phase: Assign Responsible, Accountable, Consulted, Informed
 * roles per activity/task to project stakeholders.
 *
 * Migrated to createModule + Alpine CSP. The Model (raci-matrix-model.js)
 * holds the persisted state (activities, stakeholders, assignments) plus all
 * RACI business logic (cycle, add/remove with reindexing, move, rename,
 * validation). The data-fn owns the view transforms (role colors, legend,
 * warnings), the add/cell/delete/rename handlers, the row reorder (draggableRows),
 * the transient rename UI state, and CSV export.
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Aktivitäten und
 *   Beteiligte anlegen, umbenennen und entfernen, Zeilen umsortieren und
 *   jede Rolle der Matrix setzen oder zurücknehmen. Der Oberfläche bleiben
 *   nur der CSV-Download und die Maus-Gestik des Ziehens.
 */

import { createModule } from '../../core/template-module.js';
import { downloadFile } from '../../core/export-utils.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireIndex } from '../../core/agent/agent-argcheck.js';
import { draggableRows } from '../../ui/draggable-list.js';
import {
  State, ROLES, ROLE_VALUES, ACTIVITY_MAXLEN, STAKEHOLDER_MAXLEN,
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
      ...agentReadMixin(module),
      // Activities have no ids, so the row index is the id. A move rebuilds
      // the indices, but the mixin resets its drag state on every drop.
      ...draggableRows({
        onMove({ group, sourceId, targetId }) {
          if (group !== 'activities') return;
          // "before targetId" — removing the source first shifts later rows up.
          const to = sourceId < targetId ? targetId - 1 : targetId;
          this.moveActivity(sourceId, to);
        },
        rowIds(group) {
          return group === 'activities' ? this.model.activities.map((_, i) => i) : [];
        },
        t: (key, params) => module._context.i18n.t(key, params),
      }),

      // ── Static view data ──────────────────────────────────────
      roles: ROLES,
      activityMaxlen: ACTIVITY_MAXLEN,
      stakeholderMaxlen: STAKEHOLDER_MAXLEN,
      // ── Transient input + rename + drag UI state ──────────────
      newActivity: '',
      newStakeholder: '',
      /** @type {{type:'activity'|'stakeholder', idx:number}|null} */
      rename: null,
      renameValue: '',

      // ── View transforms ───────────────────────────────────────
      /** @noagent view transform */
      legendStyle(role) {
        const c = ROLE_COLORS[role];
        return c ? `background:${c.bg};color:${c.text}` : '';
      },
      /** @noagent view transform */
      legendLabel(role) {
        return `${role  } = ${  _t(`role${  role}`)}`;
      },
      /** @noagent view transform */
      cellStyle(role) {
        const c = role ? ROLE_COLORS[role] : null;
        return c ? `background:${c.bg};color:${c.text}` : '';
      },
      /** @noagent view transform */
      addLabel(key) {
        return `+ ${  _t(key)}`;
      },
      /** @noagent view transform */
      cornerLabel() {
        return `${_t('activity')  } \\ ${  _t('stakeholder')}`;
      },
      /** @noagent view transform */
      renameTitle(value) {
        return `${value  } — ${  _t('renameHint')}`;
      },

      // ── Validation views ──────────────────────────────────────
      // Legacy only validated when both activities AND stakeholders exist.
      /** @noagent view transform */
      warningsActive() {
        return this.model.activities.length > 0 && this.model.stakeholders.length > 0;
      },
      /**
       * Call validate() once per render and return a Map keyed by aIdx.
       * Alpine re-invokes this on every reactive render, so it stays fresh.
       * @returns {Map<number, {aIdx:number, issues:string[]}>}
       * @noagent view transform
       */
      warningsByRow() {
        const map = new Map();
        if (!this.warningsActive()) return map;
        for (const w of this.model.validate()) map.set(w.aIdx, w);
        return map;
      },
      /** @noagent view transform */
      hasWarning(aIdx) {
        return this.warningsByRow().has(aIdx);
      },
      /** @noagent view transform */
      warnTitle(aIdx) {
        const w = this.warningsByRow().get(aIdx);
        if (!w) return '';
        return w.issues.map(i => _t(`warn_${  i}`)).join(', ');
      },
      /** @noagent view transform */
      rowWarnClass(aIdx) {
        return this.hasWarning(aIdx) ? 'raci__row--warn' : '';
      },

      // ── Add handlers ──────────────────────────────────────────
      /**
       * @noagent liest den Eingabepuffer der Oberfläche aus; der Text geht
       *   durch `addActivity`.
       */
      addActivityFromInput() {
        const v = this.newActivity.trim();
        if (!v) return;
        this.addActivity(v);
        this.newActivity = '';
        this.$nextTick(() => {
          this.$el.querySelector('[data-add="activity"]')?.focus();
        });
      },
      /**
       * @noagent liest den Eingabepuffer der Oberfläche aus; der Text geht
       *   durch `addStakeholder`.
       */
      addStakeholderFromInput() {
        const v = this.newStakeholder.trim();
        if (!v) return;
        this.addStakeholder(v);
        this.newStakeholder = '';
        this.$nextTick(() => {
          this.$el.querySelector('[data-add="stakeholder"]')?.focus();
        });
      },

      // ── Zustands-Sinks: ein benannter Setter je Gestalt (E2, E7) ──
      // Zeilen- und Spaltennummer bezeichnen eine Aktivität bzw. einen
      // Beteiligten, die es GIBT: der gültige Bereich endet bei
      // `length - 1`, deshalb wird das übergeben und nicht die Länge. Die
      // Rolle ist eine Wertemenge (vier Rollen plus der leere Text als
      // Rücknahme) und läuft über `requireEnum`.
      // `cycleRole` bleibt neben `setRole` eine eigene Fähigkeit: die
      // Gestik läuft über FÜNF Werte, und „einen Schritt weiter" ist eine
      // eigene Semantik — dasselbe Verhältnis wie `triz-resources`
      // `cycleStatus` zu `setCellStatus`. Beide schreiben über dieselbe
      // Zuweisungsstelle im Model (`setRole`).

      /**
       * Geht die Rolle einer Zelle einen Schritt weiter: ohne Rolle zu R, R
       * zu A, A zu C, C zu I, I zurück zu ohne Rolle.
       * @agent
       * @param {number} aIdx die Zeilennummer der Aktivität, von 0 an gezählt
       * @param {number} sIdx die Spaltennummer des Beteiligten, von 0 an gezählt
       * @returns {void}
       * @throws {Error} wenn `aIdx` keine Aktivität oder `sIdx` keinen
       *   Beteiligten bezeichnet
       */
      cycleRole(aIdx, sIdx) {
        requireIndex('aIdx', aIdx, this.model.activities.length - 1);
        requireIndex('sIdx', sIdx, this.model.stakeholders.length - 1);
        this.model.cycleRole(aIdx, sIdx);
      },

      /**
       * Setzt die Rolle einer Zelle absolut.
       * @agent
       * @param {number} aIdx die Zeilennummer der Aktivität, von 0 an gezählt
       * @param {number} sIdx die Spaltennummer des Beteiligten, von 0 an gezählt
       * @param {string} role die Rolle, oder der leere Text, um sie
       *   zurückzunehmen
       * @returns {void}
       * @throws {Error} wenn `aIdx` keine Aktivität oder `sIdx` keinen
       *   Beteiligten bezeichnet, oder `role` keine der Rollen ist
       */
      setRole(aIdx, sIdx, role) {
        requireIndex('aIdx', aIdx, this.model.activities.length - 1);
        requireIndex('sIdx', sIdx, this.model.stakeholders.length - 1);
        // Der leere Text steht als Rücknahme in der ausgelieferten
        // Feldhilfe von `assignments` und muss die Senke erreichen
        // (Ruling 52); jeder andere unbekannte Wert wirft weiter.
        requireEnum('role', role, ROLE_VALUES);
        this.model.setRole(aIdx, sIdx, role);
      },

      /**
       * Hängt eine Aktivität (Zeile) an die Matrix an.
       * @agent
       * @param {string} text die Aktivität; Leerzeichen am Rand fallen weg
       * @returns {number} die Zeilennummer der neuen Aktivität, oder -1 wenn
       *   der Text leer war und nichts angelegt wurde
       */
      addActivity(text) {
        const before = this.model.activities.length;
        this.model.addActivity(text);
        return this.model.activities.length > before ? before : -1;
      },

      /**
       * Hängt einen Beteiligten (Spalte) an die Matrix an.
       * @agent
       * @param {string} text der Beteiligte; Leerzeichen am Rand fallen weg
       * @returns {number} die Spaltennummer des neuen Beteiligten, oder -1
       *   wenn der Text leer war und nichts angelegt wurde
       */
      addStakeholder(text) {
        const before = this.model.stakeholders.length;
        this.model.addStakeholder(text);
        return this.model.stakeholders.length > before ? before : -1;
      },

      /**
       * Benennt eine Aktivität um.
       * @agent
       * @param {number} idx die Zeilennummer, von 0 an gezählt
       * @param {string} value der neue Name
       * @returns {boolean} true wenn umbenannt wurde, false wenn der Text
       *   leer war und der alte Name stehen blieb
       * @throws {Error} wenn `idx` keine Aktivität bezeichnet
       */
      renameActivity(idx, value) {
        requireIndex('idx', idx, this.model.activities.length - 1);
        // Ein leerer Name ist eine fachliche Absage, kein ungültiges
        // Argument: die Oberfläche verwirft ihn genauso und behält den alten.
        if (String(value ?? '').trim() === '') return false;
        this.model.renameActivity(idx, value);
        return true;
      },

      /**
       * Benennt einen Beteiligten um.
       * @agent
       * @param {number} idx die Spaltennummer, von 0 an gezählt
       * @param {string} value der neue Name
       * @returns {boolean} true wenn umbenannt wurde, false wenn der Text
       *   leer war und der alte Name stehen blieb
       * @throws {Error} wenn `idx` keinen Beteiligten bezeichnet
       */
      renameStakeholder(idx, value) {
        requireIndex('idx', idx, this.model.stakeholders.length - 1);
        // Siehe `renameActivity`: leerer Name ist eine Absage.
        if (String(value ?? '').trim() === '') return false;
        this.model.renameStakeholder(idx, value);
        return true;
      },

      /**
       * Entfernt eine Aktivität samt ihrer Rollen; die übrigen Zeilen rücken
       * nach.
       * @agent
       * @param {number} idx die Zeilennummer, von 0 an gezählt
       * @returns {void}
       * @throws {Error} wenn `idx` keine Aktivität bezeichnet
       */
      removeActivity(idx) {
        requireIndex('idx', idx, this.model.activities.length - 1);
        this.model.removeActivity(idx);
      },

      /**
       * Entfernt einen Beteiligten samt seiner Rollen; die übrigen Spalten
       * rücken nach.
       * @agent
       * @param {number} idx die Spaltennummer, von 0 an gezählt
       * @returns {void}
       * @throws {Error} wenn `idx` keinen Beteiligten bezeichnet
       */
      removeStakeholder(idx) {
        requireIndex('idx', idx, this.model.stakeholders.length - 1);
        this.model.removeStakeholder(idx);
      },

      /**
       * Verschiebt eine Aktivität an eine andere Stelle der Reihenfolge; ihre
       * Rollen wandern mit.
       * @agent
       * @param {number} from die Zeilennummer der Aktivität, von 0 an gezählt
       * @param {number} to die Zeilennummer, an die sie soll
       * @returns {boolean} true wenn die Aktivität verschoben wurde, false
       *   wenn `from` und `to` gleich sind
       * @throws {Error} wenn `from` oder `to` keine Zeile der Matrix
       *   bezeichnet
       */
      moveActivity(from, to) {
        const last = this.model.activities.length - 1;
        requireIndex('from', from, last);
        requireIndex('to', to, last);
        if (from === to) return false;
        this.model.moveActivity(from, to);
        return true;
      },

      // ── Inline rename ─────────────────────────────────────────
      /** @noagent view transform */
      isRenaming(type, idx) {
        return Boolean(this.rename) && this.rename.type === type && this.rename.idx === idx;
      },
      /**
       * @noagent öffnet das Umbenennen-Feld der Oberfläche und füllt dessen
       *   Puffer.
       */
      startRename(type, idx) {
        const list = type === 'activity' ? this.model.activities : this.model.stakeholders;
        this.rename = { type, idx };
        this.renameValue = list[idx];
        this.$nextTick(() => {
          const input = this.$el.querySelector('.raci__rename-input');
          if (input) { input.focus(); input.select(); }
        });
      },
      /**
       * @noagent übernimmt den Puffer des Umbenennen-Feldes; der Name geht
       *   durch `renameActivity` bzw. `renameStakeholder`.
       */
      commitRename() {
        if (!this.rename) return;
        const { type, idx } = this.rename;
        if (type === 'activity') this.renameActivity(idx, this.renameValue);
        else this.renameStakeholder(idx, this.renameValue);
        this.rename = null;
        this.renameValue = '';
      },
      /** @noagent verwirft den Puffer des Umbenennen-Feldes. */
      cancelRename() {
        this.rename = null;
        this.renameValue = '';
      },

      // ── Lifecycle ─────────────────────────────────────────────
      /** @noagent lifecycle */
      init() {
        this.dragRowsInit();
      },
      /** @noagent lifecycle */
      destroy() {
        this.dragRowsDestroy();
      },

      // ── Export ────────────────────────────────────────────────
      /**
       * @noagent lädt eine Datei herunter; ein Agent liest den Zustand über
       *   `read()`.
       */
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
