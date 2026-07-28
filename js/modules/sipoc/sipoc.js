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
 */

import { createModule } from '../../core/template-module.js';
import {
  downloadFile, ensureXLSX, XLSX,
  exportColumnsAsPNG, exportColumnsAsSVG,
} from '../../core/export-utils.js';
import { draggableList } from '../../ui/draggable-list.js';
import { State, COLUMNS } from './sipoc-model.js';

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
    icon: 'clipboard-list',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      {
        icon: 'download',
        title: 'export.label',
        children: [
          { icon: 'export-xlsx', title: 'export.xlsx', onClick: (d) => d._exportXLSX() },
          { icon: 'export-csv',  title: 'export.csv',  onClick: (d) => d._exportCSV() },
          { icon: 'export-json', title: 'export.json', onClick: (d) => d._exportJSON() },
          { icon: 'export-png',  title: 'export.png',  onClick: (d) => d._exportImage('png') },
          { icon: 'export-svg',  title: 'export.svg',  onClick: (d) => d._exportImage('svg') },
        ],
      },
    ],
  },
  Model: State,

  data(module, _t) {
    return {
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
          this.model.moveItem(sourceGroup, sourceIdx, targetGroup, targetIdx);
        },
      }),

      // ── Transient UI state (never persisted) ──────────────────
      // Draft bound to the borrowed edit form's <textarea> via x-model.
      editDraft: { text: '' },

      // ── Glyphs (entities from the legacy innerHTML) ───────────
      gripGlyph: () => '⠿',   // ⠿
      editGlyph: () => '✎',   // ✎
      deleteGlyph: () => '✕', // ✕

      // ── View transforms ───────────────────────────────────────
      dragOverClass(colKey) {
        return this.isDragOver(colKey) ? 'sipoc__column--drag-over' : '';
      },

      // ── Add handlers ──────────────────────────────────────────
      addOnEnter(colKey, event) {
        this._add(colKey, event.target);
      },
      addOnClick(colKey, event) {
        const row = event.target.closest('.sipoc__add-row');
        const input = row?.querySelector('.sipoc__add-input');
        if (input) this._add(colKey, input);
      },
      _add(colKey, inputEl) {
        if (this.model.addItem(colKey, inputEl.value)) {
          inputEl.value = '';
          inputEl.focus();
        }
      },

      // ── Delete handler ────────────────────────────────────────
      deleteItem(colKey, idx, event) {
        event?.stopPropagation?.();
        this.model.deleteItem(colKey, idx);
      },

      // ── Edit handler (borrows the in-template Alpine form) ─────
      async editItem(colKey, idx, event) {
        event?.stopPropagation?.();
        const colLabel = this.t(`col.${  colKey}`);
        this.editDraft.text = this.model.columns[colKey][idx] ?? '';
        await module._context.showModal.form(
          `${colLabel} — ${this.t('common.edit')}`,
          this.$refs.editForm,
          {
            confirmLabel: this.t('common.save'),
            onMount: (el) => {
              const ta = el.querySelector('[data-field="text"]');
              if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }
            },
            onConfirm: () => this.model.setItem(colKey, idx, this.editDraft.text),
          },
        );
      },

      // ── Export ────────────────────────────────────────────────
      _exportJSON() {
        const out = { tool: 'SIPOC', timestamp: new Date().toISOString(), sipoc: {} };
        for (const col of COLUMNS) out.sipoc[col.key] = [...this.model.columns[col.key]];
        downloadFile(JSON.stringify(out, null, 2), 'sipoc.json', 'application/json');
        module._context.notify('JSON ✓', 'success');
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
        module._context.notify('CSV ✓', 'success');
      },

      async _exportXLSX() {
        const m = this.model;
        try { await ensureXLSX(); } catch { module._context.notify?.('XLSX library not loaded'); return; }
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
        module._context.notify('Excel ✓', 'success');
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
          module._context.notify('PNG ✓', 'success');
        } else {
          exportColumnsAsSVG(columns, {}, 'sipoc.svg');
          module._context.notify('SVG ✓', 'success');
        }
      },

    };
  },
});
