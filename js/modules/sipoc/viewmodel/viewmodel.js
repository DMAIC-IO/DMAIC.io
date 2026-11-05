/**
 * D.Mike — SIPOC: Viewmodel.
 *
 * Inhalt und Kommandos liegen im Model (domain/model.js); die Agentenfläche
 * entsteht aus dessen Schema. Hier bleiben: Entwürfe der Eingabezeilen,
 * Bearbeiten-Dialog, Vorschau der Geste und die Downloads.
 */
import { createModule } from '../../../core/template-module.js';
import { downloadFile, ensureXLSX, exportColumnsAsPNG, exportColumnsAsSVG } from '../../../core/export-utils.js';
import descriptor from '../module.js';
import { State, COL_KEYS } from '../domain/model.js';
import { COLUMNS } from '../domain/summary.js';
import { reorder } from '../interaction/reorder.js';
import { toJSONExport, toCSV, toRows, toImageColumns, FILE_NAMES } from '../io/export.js';

const COLOR_VARS = { suppliers: '--color-sipoc-s', inputs: '--color-sipoc-i', process: '--color-sipoc-p', outputs: '--color-sipoc-o', customers: '--color-sipoc-c' };

export default createModule({
  descriptor,
  Model: State,
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

  data(module) {
    return {
      columns: COLUMNS,
      /** Entwurf je Eingabezeile — nicht gespeichert. */
      drafts: Object.fromEntries(COL_KEYS.map((k) => [k, ''])),
      /** Vorschau der Geste `{ group, index }` oder null (interaction/reorder.js). */
      dropPreview: null,
      /** Entwurf im geliehenen Bearbeiten-Formular. */
      editDraft: { text: '' },

      /**
       * @noagent Ansichtsklasse für die Einfügemarke der Geste.
       * @param {string} col @param {number} idx @returns {string}
       */
      itemClass(col, idx) {
        const p = this.dropPreview;
        return p && p.group === col && p.index === idx ? 'sipoc__item--drop-at' : '';
      },

      /**
       * @noagent Oberflächenhandler der Eingabezeile; der Text geht durch
       *   das Kommando `addItem` (Agenten rufen es direkt).
       * @param {string} col
       */
      addFromDraft(col) {
        if (this.drafts[col].trim() === '') return;
        try {
          this.model.addItem({ col, text: this.drafts[col] });
          this.drafts[col] = '';
        } catch (err) {
          module._context.notify(err.message, 'error');
        }
      },

      /**
       * @noagent Oberflächenhandler am Löschknopf; ruft das Kommando `removeItem`.
       * @param {string} col @param {number} idx
       */
      deleteItem(col, idx) {
        this.model.removeItem({ col, idx });
      },

      /**
       * @noagent öffnet den Bearbeiten-Dialog — ein Agent darf keinen Dialog
       *   öffnen; der Text geht durch das Kommando `setItem`.
       * @param {string} col @param {number} idx
       */
      async editItem(col, idx) {
        this.editDraft.text = this.model.columns[col][idx] ?? '';
        await module._context.dialog.form({
          title: `${this.t(`col.${col}`)} — ${this.t('common.edit')}`,
          content: this.$refs.editForm,
          confirmLabel: this.t('common.save'),
          onMount: (el) => {
            const ta = el.querySelector('[data-field="text"]');
            if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }
          },
          onConfirm: () => {
            if (this.editDraft.text.trim() === '') return false;
            this.model.setItem({ col, idx, text: this.editDraft.text });
            return true;
          },
        });
      },

      /** @noagent Farben der Spalten aus den CSS-Variablen (für PNG/SVG). @returns {Record<string, string>} */
      _colors() {
        const style = getComputedStyle(this.$root);
        return Object.fromEntries(COL_KEYS.map((k) => [k, style.getPropertyValue(COLOR_VARS[k]).trim()]));
      },
      /** @noagent Download */
      _exportJSON() {
        downloadFile(toJSONExport(this.model), FILE_NAMES.json, 'application/json');
        module._context.notify('JSON', 'success', 'status.ok');
      },
      /** @noagent Download */
      _exportCSV() {
        downloadFile(toCSV(this.model, this.t), FILE_NAMES.csv, 'text/csv;charset=utf-8');
        module._context.notify('CSV', 'success', 'status.ok');
      },
      /** @noagent Download */
      async _exportXLSX() {
        let XLSX;
        try { XLSX = await ensureXLSX(); } catch { return; } // Fehler hat core/chunks.js schon gemeldet
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(toRows(this.model, this.t)), 'SIPOC');
        XLSX.writeFile(wb, FILE_NAMES.xlsx);
        module._context.notify('Excel', 'success', 'status.ok');
      },
      /** @noagent Download @param {'png'|'svg'} format */
      _exportImage(format) {
        const cols = toImageColumns(this.model, this.t, this._colors());
        if (format === 'png') exportColumnsAsPNG(cols, {}, FILE_NAMES.png);
        else exportColumnsAsSVG(cols, {}, FILE_NAMES.svg);
        module._context.notify(format.toUpperCase(), 'success', 'status.ok');
      },
    };
  },
});
