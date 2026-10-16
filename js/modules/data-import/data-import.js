/**
 * D.Mike — Data Import Module (data-import.js)
 * Data phase / "Erfassen" group: read worksheet data from third-party
 * file formats and forward it to the in-app worksheet.
 *
 * Migrated to createModule + Alpine CSP. The Model (data-import-model.js)
 * holds only the persisted state (picked file + the three parser option
 * sets). Parsed data, the raw buffer, the active sheet index, busy/error
 * flags and the preview matrix are derived transiently in the view (data-fn).
 *
 * The format registry is open so additional formats can be added by
 * registering more parsers in the FORMATS array. Each parser receives the
 * raw ArrayBuffer plus an opts object (filename and format-specific options
 * like delimiter / encoding). Parsing itself stays in the dedicated parser
 * subfiles (csv-parser.js, xlsx-parser.js, json-parser.js, mpx-parser.js,
 * aqdef-parser.js, zip-reader.js) — they are imported unchanged below.
 *
 * 🔴 CROSS-MODULE CONTRACT: `sendToWorksheet()` registers a new worksheet
 * instance in the host phase and emits `module:added` then, on the worksheet's
 * `module:activated`, one `worksheet:appendColumn` per imported column. The
 * event names, payload shapes and timing are preserved byte-identically from
 * the legacy implementation — the E2E asserts the worksheet receives the data.
 *
 * @agent  Steuerbar über das Viewmodel: CSV- oder JSON-Text importieren
 *   (importText), Parser-Optionen setzen (setParam), ein Blatt wählen
 *   (selectSheet) und an einen neuen Worksheet senden (sendToWorksheet).
 *   Dateiauswahl und Ziehen-und-Ablegen bleiben der Oberfläche vorbehalten
 *   — und damit XLSX, MPX und AQDEF; gelesen wird über read() (AgentRead).
 *
 * Currently supported: Minitab Project (.mpx), CSV / TSV / TXT,
 * XLSX / XLSM / XLS / ODS, JSON / NDJSON / JSONL, Q-DAS AQDEF (.dfq/.dfd/.dfx).
 */

import { openNewWorksheet } from '../../core/worksheet-handoff.js';
import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import {
  requireEnum, requireIndex, requireNumber, requireText,
} from '../../core/agent/agent-argcheck.js';
import {
  State, clampSkipRows, parseErrorMessage, TEXT_FORMATS, CSV_PRESETS, CSV_PRESET_IDS,
  CSV_DELIMITERS, CSV_ENCODINGS, AQDEF_ENCODINGS, OPTION_LABEL_KEYS,
} from './data-import-model.js';
import { parseMpx } from './mpx-parser.js';
import { parseCsv } from './csv-parser.js';
import { parseXlsx } from './xlsx-parser.js';
import { parseJson } from './json-parser.js';
import { parseAqdef } from './aqdef-parser.js';

// ── Format registry ───────────────────────────────────────────────

/** @typedef {{id:string, extensions:string[], i18nKey:string, parse:(buf:ArrayBuffer, opts?:object)=>Promise<object>}} Format */

/** @type {Format[]} */
const FORMATS = [
  { id: 'mpx', extensions: ['mpx'], i18nKey: 'format_mpx', parse: parseMpx },
  { id: 'csv', extensions: ['csv', 'tsv', 'txt'], i18nKey: 'format_csv', parse: parseCsv },
  { id: 'xlsx', extensions: ['xlsx', 'xlsm', 'xls', 'ods'], i18nKey: 'format_xlsx', parse: parseXlsx },
  { id: 'json', extensions: ['json', 'ndjson', 'jsonl'], i18nKey: 'format_json', parse: parseJson },
  { id: 'aqdef', extensions: ['dfq', 'dfd', 'dfx'], i18nKey: 'format_aqdef', parse: parseAqdef },
];

const ACCEPT_ATTR = `.${  FORMATS.flatMap(f => f.extensions).join(',.')}`;

const PREVIEW_ROWS = 20;

function detectFormat(filename) {
  const m = /\.([^.]+)$/.exec(filename || '');
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return FORMATS.find(f => f.extensions.includes(ext)) || null;
}

function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

const PARAM_KEYS = ['csvOptions.preset', 'csvOptions.delimiter', 'csvOptions.encoding',
  'csvOptions.hasHeader', 'csvOptions.skipRows', 'xlsxOptions.hasHeader', 'aqdefOptions.encoding'];
const BOOL_VALUES = [true, false];
const PARAM_CHECKS = {
  'csvOptions.preset': (v) => { requireEnum('value', v, CSV_PRESET_IDS); return v; },
  'csvOptions.delimiter': (v) => { requireEnum('value', v, CSV_DELIMITERS); return v; },
  'csvOptions.encoding': (v) => { requireEnum('value', v, CSV_ENCODINGS); return v; },
  'csvOptions.hasHeader': (v) => { requireEnum('value', v, BOOL_VALUES); return v; },
  'csvOptions.skipRows': (v) => requireNumber('value', v, { min: 0, integer: true }),
  'xlsxOptions.hasHeader': (v) => { requireEnum('value', v, BOOL_VALUES); return v; },
  'aqdefOptions.encoding': (v) => { requireEnum('value', v, AQDEF_ENCODINGS); return v; },
};

/**
 * Einen Wert unter einem Punkt-Schlüssel (`'csvOptions.delimiter'`) in `obj` ablegen.
 * @param {object} obj Wurzel, deren Pfad beschrieben wird
 * @param {string} key Schlüssel, gegebenenfalls mit Punkt
 * @param {any} value der abzulegende Wert
 */
function setAtPath(obj, key, value) {
  const parts = key.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

/**
 * Einen Wert unter einem Punkt-Schlüssel aus `obj` lesen.
 * @param {object} obj Wurzel
 * @param {string} key Schlüssel, gegebenenfalls mit Punkt
 * @returns {any} der gespeicherte Wert
 */
function getAtPath(obj, key) {
  return key.split('.').reduce((cur, part) => cur?.[part], obj);
}

// ── Module ────────────────────────────────────────────────────────

/**
 * Geparste Daten werden nicht persistiert — nach einem Neuladen ist `sheets`
 * leer, bis erneut importiert wird. Die Lesefläche nennt Blätter und Spalten,
 * nicht die Werte; die Werte liest ein Agent nach `sendToWorksheet` aus dem
 * Worksheet.
 *
 * @typedef {object} AgentRead
 * @property {{ name: string, size: number, formatId: string|null, source: 'file'|'text' }|null} file  what was imported last
 * @property {object} csvOptions  `{ preset, delimiter, encoding, hasHeader, skipRows }`
 * @property {object} xlsxOptions  `{ hasHeader }`
 * @property {object} aqdefOptions  `{ encoding }`
 * @property {string[]} activeParams  the keys `setParam` accepts for the current format
 * @property {string[]} textFormats  the formats `importText` accepts
 * @property {Array<{ name: string, rowCount: number, columns: Array<{ name: string, type: string }> }>} sheets  the parsed sheets, [] without data
 * @property {number} activeSheetIdx  the sheet `sendToWorksheet` sends
 * @property {boolean} busy  a parse is running
 * @property {string|null} errorMsg  the message the module shows, null without error
 */
export default createModule({
  config: {
    id: 'data-import',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.data-import',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Static template data ──────────────────────────────────
      acceptAttr: ACCEPT_ATTR,

      // ── Transient view state (not persisted) ──────────────────
      /** @type {{format:string, sheets:Array<object>}|null} */
      parsed: null,
      /** Raw bytes of the loaded file — kept for re-parse on option changes. */
      buffer: null,
      activeSheetIdx: 0,
      errorMsg: null,
      busy: false,
      dragOver: false,

      // Transient derived view collections (rebuilt on each render via rebuildView)
      sheetTabs: [],
      previewColumns: [],
      previewRows: [],

      // ── File card view helpers ────────────────────────────────

      /** @noagent view transform */
      fileName() { return this.model.file ? this.model.file.name : ''; },

      /** @noagent view transform */
      formatLabel() {
        const f = this.model.file;
        const fmt = f ? FORMATS.find(x => x.id === f.formatId) : null;
        return fmt ? _t(fmt.i18nKey) : _t('format_unknown');
      },

      /** @noagent view transform */
      fileSizeText() {
        return this.model.file ? fmtBytes(this.model.file.size) : '';
      },

      // ── Which options block is shown ──────────────────────────

      _formatId() { return this.model.file ? this.model.file.formatId : null; },
      /** @noagent view transform */
      isCsv() { return this._formatId() === 'csv'; },
      /** @noagent view transform */
      isXlsx() { return this._formatId() === 'xlsx'; },
      /** @noagent view transform */
      isAqdef() { return this._formatId() === 'aqdef'; },

      // ── Preview accessors ─────────────────────────────────────

      _activeSheet() {
        if (!this.parsed) return null;
        const sheets = this.parsed.sheets;
        const idx = Math.min(this.activeSheetIdx, sheets.length - 1);
        return sheets[idx] || null;
      },

      /** @noagent view transform */
      hasMultipleSheets() {
        return Boolean(this.parsed) && this.parsed.sheets.length > 1;
      },

      /** @noagent view transform */
      hasColumns() {
        const s = this._activeSheet();
        return Boolean(s) && s.columns.length > 0;
      },

      /** @noagent view transform */
      previewMeta() {
        const s = this._activeSheet();
        if (!this.parsed || !s) return '';
        return [
          _t('sheetCount', { count: this.parsed.sheets.length }),
          _t('columnCount', { count: s.columns.length }),
          _t('rowCount', { count: s.rowCount }),
        ].join(' · ');
      },

      /** @noagent view transform */
      sheetTabClass(i) {
        const idx = this.parsed ? Math.min(this.activeSheetIdx, this.parsed.sheets.length - 1) : 0;
        return i === idx ? 'data-import__sheet-tab data-import__sheet-tab--active' : 'data-import__sheet-tab';
      },

      /** @noagent view transform */
      moreRowsCount() {
        const s = this._activeSheet();
        if (!s) return 0;
        return Math.max(0, s.rowCount - Math.min(PREVIEW_ROWS, s.rowCount));
      },

      /** @noagent view transform */
      moreRowsText() {
        return _t('moreRows', { count: this.moreRowsCount() });
      },

      /** @noagent helper; rebuilds the transient view collections from `parsed` + `activeSheetIdx`. */
      rebuildView() {
        this.sheetTabs = [];
        this.previewColumns = [];
        this.previewRows = [];
        if (!this.parsed) return;

        const sheets = this.parsed.sheets;
        this.sheetTabs = sheets.map(s => ({
          name: s.name,
          meta: _t('columnCount', { count: s.columns.length }),
        }));

        const s = this._activeSheet();
        if (!s) return;
        const cols = s.columns;
        this.previewColumns = cols.map(c => ({
          name: c.name || c.shortName,
          typeLabel: c.type === 'numeric' ? _t('typeNumeric') : _t('typeText'),
        }));

        const rowsToShow = Math.min(PREVIEW_ROWS, s.rowCount);
        const rows = [];
        for (let r = 0; r < rowsToShow; r++) {
          rows.push(cols.map(c => {
            const v = c.values[r];
            if (v == null) return { cls: 'data-import__cell--null', text: '·' };
            return { cls: c.type === 'numeric' ? 'data-import__cell--num' : '', text: String(v) };
          }));
        }
        this.previewRows = rows;
      },

      // ── File picking / drag-drop ──────────────────────────────

      /** @noagent DOM event handler; opens the file dialog; the agent uses importText() */
      openPicker() {
        const fi = module._container?.querySelector('[data-ref="file-input"]');
        fi?.click();
      },

      /** @noagent DOM event handler; the agent uses importText() */
      onFileInput(event) {
        const f = event.target.files && event.target.files[0];
        if (f) this.handleFile(f);
      },

      /** @noagent DOM event handler; the agent uses importText() */
      onDropzoneKey(event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.openPicker();
        }
      },

      /** @noagent DOM event handler; the agent uses importText() */
      onDragOver(event) {
        event.preventDefault();
        this.dragOver = true;
      },

      /** @noagent DOM event handler; the agent uses importText() */
      onDragLeave() {
        this.dragOver = false;
      },

      /** @noagent DOM event handler; the agent uses importText() */
      onDrop(event) {
        event.preventDefault();
        this.dragOver = false;
        const f = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (f) this.handleFile(f);
      },

      // ── Options handlers ──────────────────────────────────────

      /**
       * Option an die Senke setzen; bei Ablehnung das Feld auf den
       * gespeicherten Wert zurücksetzen und die Absage melden.
       * @noagent helper; shared by the option handlers, the agent uses setParam()
       */
      async _applyOption(ctrl, key, value) {
        try {
          await this.setParam(key, value);
        } catch (err) {
          const stored = getAtPath(this.model, key);
          if (ctrl.type === 'checkbox') ctrl.checked = Boolean(stored);
          else ctrl.value = String(stored);
          module._context.notify(err?.message ?? String(err), 'warning');
        }
      },

      /** @noagent DOM event handler; the agent uses setParam() */
      async onCsvOpt(key, event) {
        const ctrl = event.target;
        if (ctrl.type === 'checkbox') {
          await this._applyOption(ctrl, `csvOptions.${key}`, ctrl.checked);
        } else if (ctrl.type === 'number') {
          // Clamp before the call and reflect the clamped value back into the
          // input even when the model value did not change (e.g. -3 → 0 when
          // already 0), since Alpine's :value binding only updates on a change.
          const clamped = clampSkipRows(ctrl.value);
          ctrl.value = String(clamped);
          await this._applyOption(ctrl, `csvOptions.${key}`, clamped);
        } else {
          await this._applyOption(ctrl, `csvOptions.${key}`, ctrl.value);
        }
      },

      /** @noagent DOM event handler; the agent uses setParam() */
      async onXlsxOpt(key, event) {
        const ctrl = event.target;
        await this._applyOption(ctrl, `xlsxOptions.${key}`, ctrl.type === 'checkbox' ? ctrl.checked : ctrl.value);
      },

      /** @noagent DOM event handler; the agent uses setParam() */
      async onAqdefOpt(key, event) {
        const ctrl = event.target;
        await this._applyOption(ctrl, `aqdefOptions.${key}`, ctrl.type === 'checkbox' ? ctrl.checked : ctrl.value);
      },

      /** @noagent view transform */
      presetOptions() { return this._options(CSV_PRESET_IDS); },
      /** @noagent view transform */
      delimiterOptions() { return this._options(CSV_DELIMITERS); },
      /** @noagent view transform */
      csvEncodingOptions() { return this._options(CSV_ENCODINGS); },
      /** @noagent view transform */
      aqdefEncodingOptions() { return this._options(AQDEF_ENCODINGS); },
      _options(values) {
        return values.map(value => ({ value, label: _t(OPTION_LABEL_KEYS[value]) }));
      },

      /** @noagent view transform */
      isTextSource() { return this.model.file?.source === 'text'; },

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Datei, Optionen, wählbare Schlüssel und die Blätter mit ihren Spalten
       */
      read(options) {
        const f = this.model.file;
        return readAgentState('data-import', {
          file: f ? { name: f.name, size: f.size, formatId: f.formatId, source: f.source ?? 'file' } : null,
          csvOptions: { ...this.model.csvOptions },
          xlsxOptions: { ...this.model.xlsxOptions },
          aqdefOptions: { ...this.model.aqdefOptions },
          activeParams: this.activeParams(),
          textFormats: TEXT_FORMATS,
          sheets: (this.parsed?.sheets ?? []).map(sh => ({
            name: sh.name,
            rowCount: sh.rowCount,
            columns: sh.columns.map(c => ({ name: c.name || c.shortName, type: c.type })),
          })),
          activeSheetIdx: this.activeSheetIdx,
          busy: this.busy,
          errorMsg: this.errorMsg,
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        const id = this._formatId();
        if (id === 'csv') {
          const keys = PARAM_KEYS.filter(k => k.startsWith('csvOptions.'));
          return this.isTextSource() ? keys.filter(k => k !== 'csvOptions.encoding') : keys;
        }
        if (id === 'xlsx') return ['xlsxOptions.hasHeader'];
        if (id === 'aqdef') return ['aqdefOptions.encoding'];
        return [];
      },

      /**
       * CSV- oder JSON-Text wie eine Datei einlesen und die Vorschau aufbauen.
       * @agent
       * @param {string} text der Inhalt; ein leerer Text ergibt einen Parse-Fehler in errorMsg
       * @param {string} format eines der Formate aus textFormats
       * @returns {Promise<{ sheets: number }|null>} Zahl der Blätter, null wenn das Parsen scheiterte
       * @throws {Error} wenn text keine Zeichenkette oder format kein Textformat ist
       */
      async importText(text, format) {
        requireText('text', text);
        requireEnum('format', format, TEXT_FORMATS);
        const fmt = FORMATS.find(f => f.id === format);
        const buffer = new TextEncoder().encode(text).buffer;
        await this._load(buffer, { name: _t('textInputName'), size: buffer.byteLength, source: 'text' }, fmt);
        return this.parsed ? { sheets: this.parsed.sheets.length } : null;
      },

      /**
       * Eine Parser-Option setzen und die Daten neu einlesen.
       * @agent
       * @param {string} key einer der Schlüssel aus activeParams
       * @param {string|number|boolean} value der neue Wert; Art und Bereich hängen vom Schlüssel ab
       * @returns {Promise<void>}
       * @throws {Error} wenn key im aktuellen Format nicht gilt oder value außerhalb des Bereichs liegt
       */
      async setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        const v = PARAM_CHECKS[key](value);
        if (key === 'csvOptions.preset') {
          this.model.csvOptions = { ...this.model.csvOptions, ...CSV_PRESETS[v], preset: v };
        } else {
          setAtPath(this.model, key, v);
        }
        await this.reparse();
      },

      /**
       * Das Blatt wählen, das die Vorschau zeigt und `sendToWorksheet` sendet.
       * @agent
       * @param {number} index Nummer des Blatts in sheets, ab 0
       * @returns {void}
       * @throws {Error} wenn index außerhalb von sheets liegt
       */
      selectSheet(index) {
        requireIndex('index', index, (this.parsed?.sheets.length ?? 0) - 1);
        this.activeSheetIdx = index;
        this.rebuildView();
      },

      // ── File handling ─────────────────────────────────────────

      /** @noagent helper; shared loader of importText() and handleFile() */
      async _load(buffer, meta, fmt) {
        this.model.file = { name: meta.name, size: meta.size, formatId: fmt ? fmt.id : null, source: meta.source };
        this.parsed = null;
        this.buffer = null;
        this.errorMsg = null;
        this.activeSheetIdx = 0;
        this.busy = true;
        this.rebuildView();
        if (!fmt) {
          this.busy = false;
          this.errorMsg = _t('format_unknown');
          return;
        }
        this.buffer = buffer;
        await this.runParse(fmt);
      },

      /** @noagent DOM event handler; reads a File, the agent uses importText() */
      async handleFile(file) {
        const fmt = detectFormat(file.name);
        try {
          const buffer = fmt ? await file.arrayBuffer() : null;
          await this._load(buffer, { name: file.name, size: file.size, source: 'file' }, fmt);
        } catch (err) {
          this.busy = false;
          this.errorMsg = this._errMessage(err);
        }
      },

      /** @noagent helper; runs the format's parser on the buffer with the current options. */
      async runParse(fmt) {
        const isText = this.model.file?.source === 'text';
        const opts = {
          filename: isText ? `text.${fmt.id}` : (this.model.file ? this.model.file.name : undefined),
          ...(fmt.id === 'csv' ? this.model.csvOptions : {}),
          ...(fmt.id === 'csv' && isText ? { encoding: 'utf-8' } : {}),
          ...(fmt.id === 'xlsx' ? this.model.xlsxOptions : {}),
          ...(fmt.id === 'aqdef' ? this.model.aqdefOptions : {}),
        };
        try {
          const parsed = await fmt.parse(this.buffer, opts);
          this.parsed = parsed;
          this.errorMsg = null;
          this.busy = false;
          this.rebuildView();
        } catch (err) {
          this.parsed = null;
          this.busy = false;
          this.errorMsg = this._errMessage(err);
          this.rebuildView();
        }
      },

      /** @noagent helper; re-parses the buffered file with currently selected options. */
      async reparse() {
        const formatId = this._formatId();
        if (!this.buffer || !formatId) return;
        const fmt = FORMATS.find(f => f.id === formatId);
        if (!fmt) return;
        this.busy = true;
        this.errorMsg = null;
        await this.runParse(fmt);
      },

      _errMessage(err) {
        return parseErrorMessage(err, _t, (k) => module._context.i18n.t(k));
      },

      // ── Send to worksheet ─────────────────────────────────────

      /**
       * Das gewählte Blatt an einen neuen Worksheet senden.
       * @agent
       * @returns {Promise<{ instanceId: string }|null>} die Instanz des neuen Worksheets, null ohne Daten oder Spalten
       */
      async sendToWorksheet() {
        const parsed = this.parsed;
        if (!parsed || !parsed.sheets.length) return null;
        const idx = Math.min(this.activeSheetIdx, parsed.sheets.length - 1);
        const sheet = parsed.sheets[idx];
        if (sheet.columns.length === 0) {
          module._context.notify(_t('noColumns'), 'warning');
          return null;
        }

        const ctx = module._context;
        // Pre-name the sheet using the imported sheet's name, deduplicated.
        const baseName = sheet.name || ctx.i18n.t('modules.worksheet.defaultSheetName');
        const cols = sheet.columns;
        const wsId = await openNewWorksheet(ctx, { sheetName: baseName });
        // Map imported columns 0..N-1 onto the worksheet's default empty slots
        // (C1..C5 from _initEmptyGrid). Any imports past slot 5 simply append.
        for (let i = 0; i < cols.length; i++) {
          const c = cols[i];
          ctx.eventBus.emit('worksheet:appendColumn', {
            instanceId: wsId,
            sheetId: 'sheet_1',
            colId: '__slot__',
            slot: i,
            name: c.name || c.shortName || `C${i + 1}`,
            values: c.values,
            discrete: false,
            type: c.type === 'text' ? 'text' : 'numeric',
          });
        }
        ctx.notify(_t('sentToWorksheet', { count: cols.length }), 'success');
        return { instanceId: wsId };
      },

      /** @noagent DOM event handler; the agent uses sendToWorksheet() */
      async onSend() {
        try {
          await this.sendToWorksheet();
        } catch (err) {
          module._context.notify(err?.message ?? String(err), 'error');
        }
      },

      // ── Lifecycle ─────────────────────────────────────────────

      /** @noagent lifecycle */
      init() {
        // Parsed data is intentionally NOT persisted — the user must re-pick the
        // file after a reload (browsers don't keep file handles). Reset transient
        // collections so a restored `model.file` shows the "noFile" prompt.
        this.parsed = null;
        this.buffer = null;
        this.errorMsg = null;
        this.activeSheetIdx = 0;
        this.busy = false;
        this.rebuildView();
      },
    };
  },
});
