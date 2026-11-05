/**
 * D.Mike — SIPOC: Viewmodel.
 *
 * Inhalt und Kommandos liegen im Model (domain/model.js); die Agentenfläche
 * entsteht aus dessen Schema. Der UI-State (Entwürfe, Vorschau der Geste)
 * steht in viewmodel/state.js. Hier bleiben: Handler der Eingabezeilen,
 * Bearbeiten-Dialog und die Downloads.
 */
import { createModule } from '../../../core/template-module.js';
import { downloadFile, ensureXLSX, exportColumnsAsPNG, exportColumnsAsSVG } from '../../../core/export-utils.js';
import descriptor from '../module.js';
import { State, COL_KEYS } from '../domain/model.js';
import { COLUMNS } from '../domain/summary.js';
import { reorder } from '../interaction/reorder.js';
import { toJSONExport, toCSV, toRows, toImageColumns, FILE_NAMES } from '../io/export.js';
import { UiState } from './state.js';

/** @typedef {import('../domain/model.types.js').AddItemCommand['col']} ColKey */

const COLOR_VARS = { suppliers: '--color-sipoc-s', inputs: '--color-sipoc-i', process: '--color-sipoc-p', outputs: '--color-sipoc-o', customers: '--color-sipoc-c' };

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  gestures: [reorder],
  config: {
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

  /** @type {import('./state.types.js').SipocViewFn} */
  view(ctx) {
    return {
      /** Spalten in Anzeigereihenfolge. */
      get columns() { return COLUMNS; },

      /**
       * Ansichtsklasse für die Einfügemarke der Geste.
       * @param {ColKey} col @param {number} idx @returns {string}
       */
      itemClass(col, idx) {
        const p = this.state.dropPreview;
        return p && p.group === col && p.index === idx ? 'sipoc__item--drop-at' : '';
      },

      /**
       * Oberflächenhandler der Eingabezeile; der Text geht durch das
       * Kommando `addItem` (Agenten rufen es direkt).
       * @param {ColKey} col
       */
      addFromDraft(col) {
        const text = this.state.drafts[col];
        if (text.trim() === '') return;
        try {
          this.model.addItem({ col, text });
          this.state.drafts[col] = '';
        } catch (err) {
          ctx.notify(err.message, 'error');
        }
      },

      /**
       * Oberflächenhandler am Löschknopf; ruft das Kommando `removeItem`.
       * @param {ColKey} col @param {number} idx
       */
      deleteItem(col, idx) {
        this.model.removeItem({ col, idx });
      },

      /**
       * Öffnet den Bearbeiten-Dialog — ein Agent darf keinen Dialog öffnen;
       * der Text geht durch das Kommando `setItem`.
       * @param {ColKey} col @param {number} idx
       */
      async editItem(col, idx) {
        this.state.editDraft.text = this.model.columns[col][idx] ?? '';
        await ctx.dialog.form({
          title: `${this.t(`col.${col}`)} — ${this.t('common.edit')}`,
          content: this.$refs.editForm,
          confirmLabel: this.t('common.save'),
          onMount: (el) => {
            const ta = el.querySelector('[data-field="text"]');
            if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }
          },
          onConfirm: () => {
            if (this.state.editDraft.text.trim() === '') return false;
            this.model.setItem({ col, idx, text: this.state.editDraft.text });
            return true;
          },
        });
      },

      /** Farben der Spalten aus den CSS-Variablen (für PNG/SVG). @returns {Record<string, string>} */
      _colors() {
        const style = getComputedStyle(this.$root);
        return Object.fromEntries(COL_KEYS.map((k) => [k, style.getPropertyValue(COLOR_VARS[k]).trim()]));
      },
      /** Download */
      _exportJSON() {
        downloadFile(toJSONExport(this.model), FILE_NAMES.json, 'application/json');
        ctx.notify('JSON', 'success', 'status.ok');
      },
      /** Download */
      _exportCSV() {
        downloadFile(toCSV(this.model, this.t), FILE_NAMES.csv, 'text/csv;charset=utf-8');
        ctx.notify('CSV', 'success', 'status.ok');
      },
      /** Download */
      async _exportXLSX() {
        let XLSX;
        try { XLSX = await ensureXLSX(); } catch { return; } // Fehler hat core/chunks.js schon gemeldet
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(toRows(this.model, this.t)), 'SIPOC');
        XLSX.writeFile(wb, FILE_NAMES.xlsx);
        ctx.notify('Excel', 'success', 'status.ok');
      },
      /** Download @param {'png'|'svg'} format */
      _exportImage(format) {
        const cols = toImageColumns(this.model, this.t, this._colors());
        if (format === 'png') exportColumnsAsPNG(cols, {}, FILE_NAMES.png);
        else exportColumnsAsSVG(cols, {}, FILE_NAMES.svg);
        ctx.notify(format.toUpperCase(), 'success', 'status.ok');
      },
    };
  },
});
