/**
 * D.Mike — Modelldaten-Generator: Viewmodel.
 *
 * Faktoren, Koeffizienten und Einstellungen liegen im Model
 * (domain/model.js); die Daten sind eine reine Funktion davon (`rowsOf`).
 * Hier bleiben die Anzeige (Gleichung, Koeffizientengruppen, Kennzahlen,
 * Zeilenzähler in der App-Sprache), die Lesevorschau im Widget `datagrid`
 * mit den Knöpfen der Ecke (Export, „In Datensammlung öffnen“), der Knopf
 * „Daten generieren“ (UI-State `shown`) und der Lauf `toWorksheet`, der die
 * Daten als Stapel in ein neues Arbeitsblatt schreibt.
 */
import { createModule } from '../../../core/template-module.js';
import { asyncTask } from '../../../core/async-task.js';
import { command, oneOf } from '../../../core/model.js';
import { formatNumber, parseNumber } from '../../../core/number-format.js';
import { TableData } from '../../../core/table-data.js';
import { runExport } from '../../../core/exporter.js';
import { downloadFile } from '../../../core/export-utils.js';
import { gridRows, gridRecords, gridCsv, XLSX_SHEET_NAME, EXPORT_FILE_NAME } from '../../../core/datagrid/table/export.js';
import { markRejection, clearRejection } from '../../../core/param-input.js';
import { worksheetWrite, commitWorksheetWrite } from '../../../core/worksheet-write.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { buildTerms, rowsOf } from '../domain/sample.js';
import { UiState } from './state.js';
import { fmtStat, fmtPlain, equationParts, betaGroups } from './present.js';

/** Nachkommastellen der Spalten in Vorschau, Export und Arbeitsblatt (wie die Altform). */
const DECIMALS = 4;

/** Kennzahlen: Schlüssel in `generated`, Beschriftung. */
const KPI = [['n', 'statN'], ['mean', 'statMean'], ['sd', 'statStd'], ['min', 'min'], ['max', 'max']];

/**
 * Die Spalten der Vorschau in Model-Form (`x-widget-columns`).
 * @param {string[]} names
 */
function previewColumns(names) {
  return names.map((name, i) => ({
    id: `c${i + 1}`, name, shortName: `C${i + 1}`, type: 'numeric', unit: null, role: 'continuous',
    format: { decimals: DECIMALS }, meta: null,
  }));
}

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  commands: {
    /**
     * Der Exportknopf in der Ecke des Rasters (Rolle `exportAs`): die
     * Vorschau mit Kopf als `data.csv` (zeichengleich zur Altform), `data.xlsx`
     * (Blatt `Data`) oder `data.json`. Ändert nichts.
     * @noagent grid only (role of the datagrid widget)
     */
    gridExport: command({
      params: { format: oneOf(['xlsx', 'csv', 'json'], { agentWrite: false }) },
      run({ format }) {
        const { table, columns } = this.previewTable;
        const ui = this._ui;
        if (format === 'csv') {
          downloadFile(gridCsv(columns, table, ui.i18n.getLanguage()), `${EXPORT_FILE_NAME}.csv`, 'text/csv;charset=utf-8');
          return;
        }
        void runExport({
          ...ui,
          exports: {
            fileName: EXPORT_FILE_NAME,
            tables: () => ({ [XLSX_SHEET_NAME]: gridRows(columns, table) }),
            tree: () => gridRecords(columns, table),
          },
        }, format);
      },
    }),
    /**
     * Der Knopf „In Datensammlung öffnen“ in der Ecke des Rasters (Rolle
     * `openInWorksheet`): startet den Lauf `toWorksheet` über die
     * view-Methode, ohne auf ihn zu warten. Der Agent nimmt den Lauf selbst.
     * @noagent grid only (role of the datagrid widget)
     */
    gridOpenInWorksheet: command({
      run() { void this.sendToWorksheet(); },
    }),
  },
  asyncTasks: {
    toWorksheet: asyncTask({
      async run() {
        // Stand vor dem ersten await: Spalten, Werte und Blattname.
        const services = this._ui.services;
        const { names, columns } = rowsOf(this.model);
        const sheetName = this.t('name');
        let write = worksheetWrite().newWorksheet({ name: sheetName, fitRows: true });
        names.forEach((name, i) => {
          write = write.column({ name, type: 'numeric', values: [...columns[i]], format: { decimals: DECIMALS } });
        });
        const { instanceId } = await commitWorksheetWrite(services, write.build());
        return { instanceId };
      },
    }),
  },
  /** @type {import('./state.types.js').ModelDataGeneratorViewFn} */
  view(ctx) {
    const lang = () => ctx.i18n.getLanguage();
    /** Builds der Vorschau bisher (`previewTable.rev`). */
    let rev = 0;
    return {
      /**
       * @noagent Lebenszyklus: werden die Koeffizienten anders gesetzt (Agent,
       * Rückgängig), verlieren ihre Felder die Abweisungsmarke.
       */
      init() {
        this.$watch(() => JSON.stringify(this.model.betas), () => {
          this.$root.querySelectorAll('input[data-beta]').forEach((/** @type {HTMLElement} */ el) => clearRejection(el));
        });
      },

      computed: {
        /** Die Gleichung: Name von Y, β₀ und je Term mit β ≠ 0 ein Teil. */
        equation() {
          const m = this.model;
          const terms = buildTerms(m.factors.length, m.maxOrder)
            .map((indices, i) => ({ indices, beta: m.betas[String(i)] ?? 0 }));
          return { y: m.yName, intercept: fmtPlain(m.intercept, lang()), parts: equationParts(terms, m.factors, lang()) };
        },
        /** Die Koeffizienten nach Ordnung gruppiert. */
        betaGroups() {
          const groupLabel = (order) => (order === 1 ? this.t('mainEffects') : this.t('orderInteractions', { order }));
          return betaGroups(/** @type {any} */ (this).terms, groupLabel, lang());
        },
        /** Kennzahlkarten aus `generated`. */
        statKpis() {
          const g = /** @type {any} */ (this).generated;
          return KPI.map(([key, label]) => ({
            key, label: this.t(label), value: key === 'n' ? formatNumber(g.n, lang()) : fmtStat(g[key], lang()),
          }));
        },
        /** Zähler über der Vorschau: „(n Zeilen)“. */
        rowCountText() {
          return `(${formatNumber(rowsOf(this.model).columns[0]?.length ?? 0, lang())} ${this.t('rows')})`;
        },
        /**
         * Die Vorschau für das Widget: die Daten als TableData, Spaltenköpfe
         * numerisch mit vier Nachkommastellen, `rev` zählt die Builds.
         */
        previewTable() {
          rev += 1;
          const { names, columns } = rowsOf(this.model);
          return {
            table: new TableData(columns[0]?.length ?? 0, columns),
            columns: previewColumns(names),
            rev,
          };
        },
      },

      /** Konfiguration der Lesevorschau: nur lesend; die Knöpfe der Ecke als Rollen → Viewmodel-Kommandos. */
      get previewConfig() {
        return {
          readOnly: true,
          features: {},
          commands: { exportAs: 'gridExport', openInWorksheet: 'gridOpenInWorksheet' },
          contextMenu: [],
        };
      },
      get removeGlyph() { return '×'; },
      get addLabel() { return `+ ${this.t('addFactor')}`; },
      get noiseLabel() { return `${this.t('noise')} (σε)`; },
      get canRemove() { return this.model.factors.length > 1; },
      /** @param {string} name @returns {string} DOM-id je Instanz */
      fieldId(name) { return `mdg-${name}-${ctx.instanceId}`; },

      /** @noagent Zeigt Kennzahlen und Vorschau (Knopf „Daten generieren“). */
      showResults() { this.state.shown = true; },

      /**
       * @noagent Übernimmt einen getippten Koeffizienten über `setBeta`; der
       * Agent ruft `setBeta` selbst. Eine Eingabe, die keine Zahl ist, wird
       * abgewiesen; das Feld zeigt wieder den alten Wert.
       * @param {number} idx Termindex
       * @param {Event} event
       */
      onBetaInput(idx, event) {
        const el = /** @type {HTMLInputElement} */ (event.target);
        const v = parseNumber(el.value.trim());
        const old = fmtPlain(this.model.betas[String(idx)] ?? 0, lang());
        if (v === null || !Number.isFinite(v)) {
          el.value = old;
          markRejection(el, ctx.i18n.t('common.inputRejectedPlain'));
          return;
        }
        clearRejection(el);
        this.model.setBeta({ index: idx, value: v });
      },

      /**
       * Schreibt die Daten in ein neues Arbeitsblatt und holt es nach vorn.
       * Scheitert der Lauf, meldet ihn der Kern.
       * @returns {Promise<void>}
       */
      async sendToWorksheet() {
        const out = await this._asyncTaskHost.start('toWorksheet', {});
        if (out.status === 'rejected') {
          ctx.notify(ctx.i18n.t('common.asyncTask.rejected', { reason: out.reason }), 'error');
          return;
        }
        const instanceId = out.status === 'done' ? out.value?.instanceId : null;
        if (instanceId) ctx.eventBus.emit('module:activated', { instanceId });
      },
    };
  },
});
