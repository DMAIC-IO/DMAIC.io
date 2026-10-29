/**
 * D.Mike — SIPOC Module (sipoc.js)
 * Supplier-Input-Process-Output-Customer diagram. DMAIC phase: Define.
 *
 * Migrated to createModule + Alpine CSP. The Model (sipoc-model.js) holds the
 * persisted state ({ columns }) plus the add/edit/delete/move business logic.
 * This data-fn owns only view transforms (glyphs, drag-over class), the event
 * handlers (which call Model methods or the shared modal helper), and the
 * export handlers. Export is exposed via config.actions (unified workspace
 * action bar) rather than an in-content dropdown. No HTML is built in JS —
 * the UI lives in sipoc.html.
 *
 * Spec: docs/modules/SIPOC.md
 *
 * @agent  Vollständig über das Viewmodel steuerbar: die Einträge aller fünf
 *   SIPOC-Spalten — anlegen, ändern, entfernen und zwischen den Spalten
 *   verschieben. Der Oberfläche bleiben nur der Dateidownload, der
 *   Bearbeiten-Dialog und die Maus-Gestik des Verschiebens.
 */

import { createModule } from '../../core/template-module.js';
import {
  downloadFile, ensureXLSX,
  exportColumnsAsPNG, exportColumnsAsSVG,
} from '../../core/export-utils.js';
import { draggableList } from '../../ui/draggable-list.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireIndex } from '../../core/agent/agent-argcheck.js';
import { State, COLUMNS, COL_KEYS } from './sipoc-model.js';

const COL_COLORS = {
  suppliers: '#f59e0b',
  inputs: '#3b82f6',
  process: '#10b981',
  outputs: '#a855f7',
  customers: '#ef4444',
};

export default createModule({
  config: {
    id: 'sipoc',
    engine: 'alpine',
    phase: 'define',
    icon: 'module.sipoc',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      {
        icon: 'action.download',
        title: 'export.label',
        children: [
          { icon: 'format.xlsx', title: 'export.xlsx', onClick: (d) => d._exportXLSX() },
          { icon: 'format.csv',  title: 'export.csv',  onClick: (d) => d._exportCSV() },
          { icon: 'format.json', title: 'export.json', onClick: (d) => d._exportJSON() },
          { icon: 'format.png',  title: 'export.png',  onClick: (d) => d._exportImage('png') },
          { icon: 'format.svg',  title: 'export.svg',  onClick: (d) => d._exportImage('svg') },
        ],
      },
    ],
  },
  Model: State,

  data(module, _t) {
    return {
      ...agentReadMixin(module),

      // ── Static view data ──────────────────────────────────────
      columns: COLUMNS,

      // ── Drag-and-drop reordering (shared mixin) ───────────────
      // Owns the transient drag state + handlers (dragStart/dragEnd/dragOver/
      // dragLeave/drop) and the pointer→drop-index math. sipoc only supplies the
      // reorder callback and its CSS selectors/classes.
      ...draggableList({
        itemSelector: '.sipoc__item',
        draggingClass: 'sipoc__item--dragging',
        // Regular function: draggableList invokes it with `this` = Alpine component.
        onReorder({ sourceGroup, sourceIdx, targetGroup, targetIdx }) {
          this.moveItem(sourceGroup, sourceIdx, targetGroup, targetIdx);
        },
      }),

      // ── Transient UI state (never persisted) ──────────────────
      // Draft bound to the borrowed edit form's <textarea> via x-model.
      editDraft: { text: '' },

      // ── View transforms ───────────────────────────────────────
      /** @noagent view transform */
      dragOverClass(colKey) {
        return this.isDragOver(colKey) ? 'sipoc__column--drag-over' : '';
      },

      // ── Add handlers ──────────────────────────────────────────
      /**
       * @noagent packt ein Tastaturereignis des Eingabefeldes aus; der Text
       *   geht durch `addItem`.
       */
      addOnEnter(colKey, event) {
        this._add(colKey, event.target);
      },
      /**
       * @noagent packt ein Klickereignis des Plusknopfes aus; der Text geht
       *   durch `addItem`.
       */
      addOnClick(colKey, event) {
        const row = event.target.closest('.sipoc__add-row');
        const input = row?.querySelector('.sipoc__add-input');
        if (input) this._add(colKey, input);
      },
      _add(colKey, inputEl) {
        if (this.addItem(colKey, inputEl.value) >= 0) {
          inputEl.value = '';
          inputEl.focus();
        }
      },

      // ── Delete handler ────────────────────────────────────────
      /**
       * @noagent Oberflächenhandler am Löschknopf; er stoppt die
       *   Ereignisblase und ruft `removeItem`.
       */
      deleteItem(colKey, idx, event) {
        event?.stopPropagation?.();
        this.removeItem(colKey, idx);
      },

      // ── Zustands-Sinks: ein benannter Setter je Gestalt ──
      // Die Spaltenschlüssel sind eine feste Fünfer-Menge; `COL_KEYS` im
      // Model ist deren einzige Quelle, damit Prüfmeldung und
      // Persistenzform nicht auseinanderlaufen.
      // Zu den Indexgrenzen: ein Eintrag, den es GIBT, liegt in
      // `0..length-1` — darum wird `length - 1` übergeben. `dropIdx` von
      // `moveItem` ist dagegen ein EINFÜGEPUNKT, dort heißt `length` „ans
      // Ende" und wird selbst übergeben (`requireIndex` erlaubt die
      // Obergrenze einschließlich).

      /**
       * Hängt einen Eintrag an eine SIPOC-Spalte an.
       * @agent
       * @param {string} colKey die Spalte
       * @param {string} text der Eintrag
       * @returns {number} der Index des neuen Eintrags, oder -1 wenn der
       *   Text leer war und nichts angelegt wurde
       * @throws {Error} wenn `colKey` keine der fünf SIPOC-Spalten ist
       */
      addItem(colKey, text) {
        requireEnum('colKey', colKey, COL_KEYS);
        if (!this.model.addItem(colKey, text)) return -1;
        return this.model.columns[colKey].length - 1;
      },

      /**
       * Ersetzt den Eintrag an einer Position einer SIPOC-Spalte.
       * @agent
       * @param {string} colKey die Spalte
       * @param {number} idx die Position des Eintrags, von 0 an gezählt
       * @param {string} text der neue Eintrag
       * @returns {boolean} true wenn der Eintrag geändert wurde, false wenn
       *   der Text leer war und der alte Eintrag stehen blieb
       * @throws {Error} wenn `colKey` keine der fünf SIPOC-Spalten ist oder
       *   die Spalte an `idx` keinen Eintrag hat
       */
      setItem(colKey, idx, text) {
        requireEnum('colKey', colKey, COL_KEYS);
        requireIndex('idx', idx, this.model.columns[colKey].length, { existing: true });
        return this.model.setItem(colKey, idx, text);
      },

      /**
       * Entfernt den Eintrag an einer Position einer SIPOC-Spalte.
       * @agent
       * @param {string} colKey die Spalte
       * @param {number} idx die Position des Eintrags, von 0 an gezählt
       * @returns {boolean} true wenn ein Eintrag entfernt wurde
       * @throws {Error} wenn `colKey` keine der fünf SIPOC-Spalten ist oder
       *   die Spalte an `idx` keinen Eintrag hat
       */
      removeItem(colKey, idx) {
        requireEnum('colKey', colKey, COL_KEYS);
        requireIndex('idx', idx, this.model.columns[colKey].length, { existing: true });
        return this.model.deleteItem(colKey, idx);
      },

      /**
       * Verschiebt einen Eintrag innerhalb einer Spalte oder in eine andere.
       * @agent
       * @param {string} sourceCol die Spalte, aus der der Eintrag kommt
       * @param {number} sourceIdx seine Position dort, von 0 an gezählt
       * @param {string} targetCol die Spalte, in die er soll
       * @param {number} dropIdx die Einfügeposition in der Zielspalte; deren
       *   Länge heißt „ans Ende“
       * @returns {boolean} true wenn der Eintrag verschoben wurde
       * @throws {Error} wenn eine der beiden Spalten keine der fünf
       *   SIPOC-Spalten ist, `sourceIdx` dort keinen Eintrag bezeichnet oder
       *   `dropIdx` hinter dem Ende der Zielspalte liegt
       */
      moveItem(sourceCol, sourceIdx, targetCol, dropIdx) {
        requireEnum('sourceCol', sourceCol, COL_KEYS);
        requireEnum('targetCol', targetCol, COL_KEYS);
        requireIndex('sourceIdx', sourceIdx, this.model.columns[sourceCol].length, { existing: true });
        requireIndex('dropIdx', dropIdx, this.model.columns[targetCol].length);
        return this.model.moveItem(sourceCol, sourceIdx, targetCol, dropIdx);
      },

      // ── Edit handler (borrows the in-template Alpine form) ─────
      /**
       * @noagent öffnet den Bearbeiten-Dialog — ein Agent darf keinen
       *   Dialog öffnen, er blockierte den Stapel; der Text geht durch
       *   `setItem`.
       */
      async editItem(colKey, idx, event) {
        event?.stopPropagation?.();
        const colLabel = this.t(`col.${  colKey}`);
        this.editDraft.text = this.model.columns[colKey][idx] ?? '';
        await module._context.dialog.form({
          title: `${colLabel} — ${this.t('common.edit')}`,
          content: this.$refs.editForm,
          confirmLabel: this.t('common.save'),
          onMount: (el) => {
            const ta = el.querySelector('[data-field="text"]');
            if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }
          },
          onConfirm: () => this.setItem(colKey, idx, this.editDraft.text),
        });
      },

      // ── Export ────────────────────────────────────────────────
      _exportJSON() {
        const out = { tool: 'SIPOC', timestamp: new Date().toISOString(), sipoc: {} };
        for (const col of COLUMNS) out.sipoc[col.key] = [...this.model.columns[col.key]];
        downloadFile(JSON.stringify(out, null, 2), 'sipoc.json', 'application/json');
        module._context.notify('JSON', 'success', 'status.ok');
      },

      _exportCSV() {
        const m = this.model;
        const maxLen = Math.max(...COLUMNS.map(c => m.columns[c.key].length), 1);
        let csv = 'sep=;\n';
        csv += `${COLUMNS.map(c => `"${this.t(`col.${  c.key}`)}"`).join(';')  }\n`;
        for (let i = 0; i < maxLen; i++) {
          csv += `${COLUMNS.map(c => {
            const val = m.columns[c.key][i] || '';
            return `"${val.replace(/"/g, '""')}"`;
          }).join(';')  }\n`;
        }
        downloadFile(csv, 'sipoc.csv', 'text/csv;charset=utf-8');
        module._context.notify('CSV', 'success', 'status.ok');
      },

      async _exportXLSX() {
        const m = this.model;
        // A failed load already toasted (core/chunks.js).
        let XLSX;
        try { XLSX = await ensureXLSX(); } catch { return; }
        const maxLen = Math.max(...COLUMNS.map(c => m.columns[c.key].length), 1);
        const rows = [];
        rows.push(COLUMNS.map(c => this.t(`col.${  c.key}`)));
        for (let i = 0; i < maxLen; i++) {
          rows.push(COLUMNS.map(c => m.columns[c.key][i] || ''));
        }
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'SIPOC');
        XLSX.writeFile(wb, 'sipoc.xlsx');
        module._context.notify('Excel', 'success', 'status.ok');
      },

      /**
       * Map the model's columns + i18n titles into the generic column/card
       * shape and hand them to the shared export-utils renderer.
       * @param {'png'|'svg'} format
       */
      _exportImage(format) {
        const m = this.model;
        const columns = COLUMNS.map(c => ({
          title: this.t(`col.${  c.key}`).toUpperCase(),
          desc: this.t(`colDesc.${  c.key}`),
          color: COL_COLORS[c.key],
          items: m.columns[c.key],
        }));

        if (format === 'png') {
          exportColumnsAsPNG(columns, {}, 'sipoc.png');
          module._context.notify('PNG', 'success', 'status.ok');
        } else {
          exportColumnsAsSVG(columns, {}, 'sipoc.svg');
          module._context.notify('SVG', 'success', 'status.ok');
        }
      },

    };
  },
});
