/**
 * D.Mike — Datenimport: Viewmodel.
 *
 * Die Bytes der gewählten Quelle und das volle Parse-Ergebnis leben in der
 * Closure des `view`-Blocks, nicht im Zustand. Der auto-Lauf `parse` liest
 * Quelle, Zähler `sourceRev` und die Optionen des aktiven Formats, wartet
 * abbrechbar und parst; sein Wert ist die Zusammenfassung ohne Werte. Die
 * Läufe `importText` (Text wie eine Datei einlesen) und `sendToWorksheet`
 * (gezeigtes Blatt als Schreibplan in ein neues Arbeitsblatt) warten auf ihr
 * Ende; `selectSheet` wählt das Blatt.
 *
 * Dateiauswahl und Ablegen laufen über `x-file-drop` an der Wurzel der
 * Vorlage (`handleFile`).
 */
import { createModule } from '../../../core/template-module.js';
import { asyncTask } from '../../../core/async-task.js';
import { command, number, text, oneOf, setFields } from '../../../core/model.js';
import { requireIndex } from '../../../core/validate.js';
import { FORMATS, ACCEPT, formatForFilename } from '../../../core/parser/index.js';
import { worksheetWrite, commitWorksheetWrite } from '../../../core/worksheet-write.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { UiState } from './state.js';
import {
  RERUN_DELAY, OPTION_LABEL_KEYS, pause, fmtBytes, parseErrorMessage, summarize, clampSheet,
  previewColumns, previewRows, moreRows,
} from './present.js';

/** Frist, in der `importText` und `sendToWorksheet` auf das Ende des Parsens warten. */
const SETTLE_MS = 20000;

/**
 * Die Werte eines Auswahlfelds aus dem Schema (`options.csv.delimiter` …).
 * @param {string} path @returns {string[]}
 */
function valuesAt(path) {
  /** @type {any} */
  let spec = { shape: State.schema.fields };
  for (const part of path.split('.')) spec = spec?.shape?.[part];
  return spec?.kind === 'oneOf' ? spec.values : [];
}

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  commands: {
    selectSheet: command({
      params: { index: number({ integer: true, min: 0 }) },
      run({ index }) {
        requireIndex('index', index, this.parse?.sheets.length ?? 0, { existing: true });
        setFields(this.model, { activeSheet: index });
      },
    }),
  },
  asyncTasks: {
    parse: asyncTask({
      auto: true,
      async run(_args, { signal }) {
        // Stand vor dem ersten await: Quelle, Datei und nur die Optionen des aktiven Formats.
        void this.state.sourceRev;
        const file = this.model.file ? { ...this.model.file } : null;
        const formatId = file?.formatId ?? null;
        const own = formatId ? this.model.options[formatId] : null;
        const options = own ? { ...own } : {};
        const source = this.sourceOf();
        if (!source || !file) {
          this.keepParsed(null);
          return null;
        }
        await pause(RERUN_DELAY, signal);
        const tApp = (key) => this._ui.i18n.t(key);
        if (source.error) throw new Error(parseErrorMessage(source.error, this.t, tApp));
        const fmt = FORMATS.find((f) => f.id === formatId);
        if (!fmt) throw new Error(this.t('format_unknown'));
        const isText = file.source === 'text';
        const opts = {
          filename: isText ? `text.${fmt.id}` : file.name,
          ...options,
          ...(fmt.id === 'csv' && isText ? { encoding: 'utf-8' } : {}),
        };
        let parsed;
        try {
          parsed = await fmt.parse(source.buffer, opts);
        } catch (err) {
          signal.throwIfAborted();
          this.keepParsed(null);
          throw new Error(parseErrorMessage(err, this.t, tApp), { cause: err });
        }
        // Ein abgelöster Lauf darf sein Ergebnis nicht mehr zeigen.
        signal.throwIfAborted();
        this.keepParsed(parsed);
        return summarize(parsed);
      },
    }),
    importText: asyncTask({
      params: { text: text(), format: oneOf(['csv', 'json']) },
      async run({ text: content, format }) {
        const buffer = new TextEncoder().encode(content).buffer;
        this.loadSource({ buffer }, { name: this.t('textInputName'), size: buffer.byteLength, formatId: format, source: 'text' });
        if (!(await this._asyncTaskHost.settle(SETTLE_MS))) throw new Error(this.t('parseTimeout'));
        const summary = this.parse;
        return summary ? { sheets: summary.sheets.length } : null;
      },
    }),
    sendToWorksheet: asyncTask({
      async run(_args, { signal }) {
        // Erst das Parsen abwarten: eine eben geänderte Option darf kein altes Ergebnis senden.
        if (!(await this._asyncTaskHost.settle(SETTLE_MS))) throw new Error(this.t('parseTimeout'));
        signal.throwIfAborted();
        const sheet = this.shownSheet;
        if (!sheet) return null;
        if (sheet.columns.length === 0) {
          this._ui.notify(this.t('noColumns'), 'warning');
          return null;
        }
        const services = this._ui.services;
        let write = worksheetWrite()
          .newWorksheet({ name: sheet.name || services.i18n.t('modules.worksheet.defaultSheetName') });
        sheet.columns.forEach((c, i) => {
          write = write.column({ name: c.name || c.shortName || `C${i + 1}`, type: c.type, values: c.values, format: c.format });
        });
        const { instanceId } = await commitWorksheetWrite(services, write.build(services));
        this._ui.notify(this.t('sentToWorksheet', { count: sheet.columns.length }), 'success');
        return { instanceId };
      },
    }),
  },
  /** @type {import('./state.types.js').DataImportViewFn} */
  view() {
    /** @type {{ buffer: ArrayBuffer|null, error?: unknown }|null} Bytes der gewählten Quelle oder der Lesefehler */
    let source = null;
    /** @type {import('../../../core/parser/index.js').ParseResult|null} volles Ergebnis des letzten Laufs */
    let parsed = null;
    return {
      /** Die Quelle des Laufs `parse`. @returns {{ buffer: ArrayBuffer|null, error?: unknown }|null} */
      sourceOf() { return source; },
      /** Das volle Ergebnis des Laufs `parse` behalten. @param {any} next @returns {void} */
      keepParsed(next) { parsed = next; },
      /**
       * Eine neue Quelle übernehmen: Beschreibung ins Model, erstes Blatt, Lauf neu.
       * @param {{ buffer: ArrayBuffer|null, error?: unknown }} next
       * @param {{ name: string, size: number, formatId: any, source: 'file'|'text' }} file
       * @returns {void}
       */
      loadSource(next, file) {
        source = next;
        parsed = null;
        setFields(this.model, { file, activeSheet: 0 });
        this.state.sourceRev = this.state.sourceRev + 1;
      },
      /**
       * Eine gewählte oder abgelegte Datei einlesen.
       * @param {File} file @returns {Promise<void>}
       */
      async handleFile(file) {
        const fmt = formatForFilename(file.name);
        /** @type {{ buffer: ArrayBuffer|null, error?: unknown }} */
        let next;
        try {
          next = { buffer: fmt ? await file.arrayBuffer() : null };
        } catch (error) {
          next = { buffer: null, error };
        }
        this.loadSource(next, { name: file.name, size: file.size, formatId: fmt ? fmt.id : null, source: 'file' });
      },
      /**
       * Ein Profil wählen (setzt die CSV-Optionen auf einmal).
       * @param {Event} event @returns {void}
       */
      presetChanged(event) {
        const value = /** @type {HTMLSelectElement} */ (event.target).value;
        /** @type {any} */ (this.model).applyPreset({ preset: value });
      },

      /** Wert für das `accept` der Dateiauswahl. */
      get accept() { return ACCEPT; },
      /**
       * Die Auswahlwerte eines Optionsfelds mit Beschriftung.
       * @param {string} path z. B. `options.csv.delimiter` @returns {Array<{ value: string, label: string }>}
       */
      choices(path) { return valuesAt(path).map((value) => ({ value, label: this.t(OPTION_LABEL_KEYS[value]) })); },
      /**
       * Gilt die Option im aktuellen Format?
       * @param {string} path @returns {boolean}
       */
      shows(path) { return this.activeParams.includes(path); },

      /** Format der Quelle, für die Dateikarte. */
      get formatLabel() {
        const id = this.model.file?.formatId;
        return id ? this.t(`format_${id}`) : this.t('format_unknown');
      },
      /** Größe der Quelle, für die Dateikarte. */
      get fileSizeText() { return this.model.file ? fmtBytes(this.model.file.size) : ''; },

      /** Die Blätter des letzten Laufs mit Werten; leer ohne Ergebnis. */
      get sheets() { return this.parse && parsed ? parsed.sheets : []; },
      /** Nummer des gezeigten Blatts, -1 ohne Blätter. */
      get shownIndex() { return clampSheet(this.model.activeSheet, this.sheets.length); },
      /** Das gezeigte Blatt mit Werten, oder null. */
      get shownSheet() { return this.sheets[this.shownIndex] ?? null; },
      /** Mehr als ein Blatt: die Reiter erscheinen. */
      get hasMultipleSheets() { return this.sheets.length > 1; },
      /** Das gezeigte Blatt hat Spalten. */
      get hasColumns() { return (this.shownSheet?.columns.length ?? 0) > 0; },
      /** Kopfzeile der Vorschau: Blätter, Spalten, Zeilen. */
      get previewMeta() {
        const s = this.shownSheet;
        if (!s) return '';
        return [
          this.t('sheetCount', { count: this.sheets.length }),
          this.t('columnCount', { count: s.columns.length }),
          this.t('rowCount', { count: s.rowCount }),
        ].join(' · ');
      },
      /** Reiter je Blatt. */
      get sheetTabs() {
        return this.sheets.map((s) => ({ name: s.name, meta: this.t('columnCount', { count: s.columns.length }) }));
      },
      /**
       * Klasse eines Reiters; der gezeigte ist hervorgehoben.
       * @param {number} i @returns {string}
       */
      sheetTabClass(i) {
        return i === this.shownIndex ? 'data-import__sheet-tab data-import__sheet-tab--active' : 'data-import__sheet-tab';
      },
      /** Köpfe der Vorschau. */
      get previewColumns() { return previewColumns(this.shownSheet, this.t); },
      /** Zeilen der Vorschau. */
      get previewRows() { return previewRows(this.shownSheet); },
      /** Zeilen, die die Vorschau nicht zeigt. */
      get moreRowsCount() { return moreRows(this.shownSheet); },
      /** Hinweis auf weitere Zeilen. */
      get moreRowsText() { return this.t('moreRows', { count: this.moreRowsCount }); },
    };
  },
});

