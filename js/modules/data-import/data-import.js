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
 * Currently supported: Minitab Project (.mpx), CSV / TSV / TXT,
 * XLSX / XLSM / XLS / ODS, JSON / NDJSON / JSONL, Q-DAS AQDEF (.dfq/.dfd/.dfx).
 */

import { createModule } from '../../core/template-module.js';
import { uniqueSheetName, buildInitialWorksheetState } from '../../ui/column-picker.js';
import {
  State, clampSkipRows,
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

/**
 * CMM preset profiles. Each preset is a one-click set of default CSV options
 * tuned to a common metrology export format. The values are best-guess
 * starting points — exact metadata-row counts and delimiters vary between
 * software versions and customer templates, so users can always tweak the
 * individual options afterwards (delimiter, encoding, skipRows, hasHeader).
 */
const CSV_PRESETS = {
  generic:               { delimiter: 'auto',      encoding: 'utf-8',        skipRows: 0, hasHeader: true },
  'zeiss-calypso':       { delimiter: 'semicolon', encoding: 'windows-1252', skipRows: 4, hasHeader: true },
  'hexagon-pcdmis':      { delimiter: 'comma',     encoding: 'utf-8',        skipRows: 4, hasHeader: true },
  'mitutoyo-measurlink': { delimiter: 'comma',     encoding: 'utf-8',        skipRows: 0, hasHeader: true },
};

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

// ── Module ────────────────────────────────────────────────────────

export default createModule({
  config: {
    id: 'data-import',
    engine: 'alpine',
    phase: 'data',
    icon: 'upload',
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

      fileName() { return this.model.file ? this.model.file.name : ''; },

      formatLabel() {
        const f = this.model.file;
        const fmt = f ? FORMATS.find(x => x.id === f.formatId) : null;
        return fmt ? _t(fmt.i18nKey) : _t('format_unknown');
      },

      fileSizeText() {
        return this.model.file ? fmtBytes(this.model.file.size) : '';
      },

      // ── Which options block is shown ──────────────────────────

      _formatId() { return this.model.file ? this.model.file.formatId : null; },
      isCsv() { return this._formatId() === 'csv'; },
      isXlsx() { return this._formatId() === 'xlsx'; },
      isAqdef() { return this._formatId() === 'aqdef'; },

      // ── Preview accessors ─────────────────────────────────────

      _activeSheet() {
        if (!this.parsed) return null;
        const sheets = this.parsed.sheets;
        const idx = Math.min(this.activeSheetIdx, sheets.length - 1);
        return sheets[idx] || null;
      },

      hasMultipleSheets() {
        return Boolean(this.parsed) && this.parsed.sheets.length > 1;
      },

      hasColumns() {
        const s = this._activeSheet();
        return Boolean(s) && s.columns.length > 0;
      },

      previewMeta() {
        const s = this._activeSheet();
        if (!this.parsed || !s) return '';
        return [
          _t('sheetCount', { count: this.parsed.sheets.length }),
          _t('columnCount', { count: s.columns.length }),
          _t('rowCount', { count: s.rowCount }),
        ].join(' · ');
      },

      sheetTabClass(i) {
        const idx = this.parsed ? Math.min(this.activeSheetIdx, this.parsed.sheets.length - 1) : 0;
        return i === idx ? 'data-import__sheet-tab data-import__sheet-tab--active' : 'data-import__sheet-tab';
      },

      moreRowsCount() {
        const s = this._activeSheet();
        if (!s) return 0;
        return Math.max(0, s.rowCount - Math.min(PREVIEW_ROWS, s.rowCount));
      },

      moreRowsText() {
        return _t('moreRows', { count: this.moreRowsCount() });
      },

      /** Rebuild the transient view collections from `parsed` + `activeSheetIdx`. */
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

      openPicker() {
        const fi = module._container?.querySelector('[data-ref="file-input"]');
        fi?.click();
      },

      onFileInput(event) {
        const f = event.target.files && event.target.files[0];
        if (f) this.handleFile(f);
      },

      onDropzoneKey(event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.openPicker();
        }
      },

      onDragOver(event) {
        event.preventDefault();
        this.dragOver = true;
      },

      onDragLeave() {
        this.dragOver = false;
      },

      onDrop(event) {
        event.preventDefault();
        this.dragOver = false;
        const f = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (f) this.handleFile(f);
      },

      // ── Options handlers ──────────────────────────────────────

      onCsvOpt(key, event) {
        const ctrl = event.target;
        if (key === 'preset') {
          // Apply the chosen preset's full option set, then re-parse so the
          // dependent controls reflect the new defaults.
          const preset = CSV_PRESETS[ctrl.value] || CSV_PRESETS.generic;
          this.model.csvOptions = { ...this.model.csvOptions, ...preset, preset: ctrl.value };
          this.reparse();
          return;
        }
        if (ctrl.type === 'checkbox') {
          this.model.csvOptions[key] = ctrl.checked;
        } else if (ctrl.type === 'number') {
          const clamped = clampSkipRows(ctrl.value);
          this.model.csvOptions[key] = clamped;
          // Reflect the clamped value back into the input even when the model
          // value did not change (e.g. -3 → 0 when already 0), since Alpine's
          // :value binding only updates on a model change.
          ctrl.value = String(clamped);
        } else {
          this.model.csvOptions[key] = ctrl.value;
        }
        this.reparse();
      },

      onXlsxOpt(key, event) {
        const ctrl = event.target;
        if (ctrl.type === 'checkbox') this.model.xlsxOptions[key] = ctrl.checked;
        else this.model.xlsxOptions[key] = ctrl.value;
        this.reparse();
      },

      onAqdefOpt(key, event) {
        const ctrl = event.target;
        if (ctrl.type === 'checkbox') this.model.aqdefOptions[key] = ctrl.checked;
        else this.model.aqdefOptions[key] = ctrl.value;
        this.reparse();
      },

      selectSheet(i) {
        this.activeSheetIdx = i;
        this.rebuildView();
      },

      // ── File handling ─────────────────────────────────────────

      async handleFile(file) {
        const fmt = detectFormat(file.name);
        this.model.file = {
          name: file.name,
          size: file.size,
          formatId: fmt ? fmt.id : null,
        };
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

        try {
          this.buffer = await file.arrayBuffer();
          await this.runParse(fmt);
        } catch (err) {
          this.busy = false;
          this.errorMsg = this._errMessage(err);
        }
      },

      /** Run the format's parser on the buffer with the current options. */
      async runParse(fmt) {
        const opts = {
          filename: this.model.file ? this.model.file.name : undefined,
          ...(fmt.id === 'csv' ? this.model.csvOptions : {}),
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

      /** Re-parse the buffered file with currently selected options. */
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
        const code = err && err.code;
        if (code) return _t(code);
        const msg = (err && err.message) || String(err);
        return _t('parseErrorDetail', { message: msg });
      },

      // ── Send to worksheet ─────────────────────────────────────

      sendToWorksheet() {
        const parsed = this.parsed;
        if (!parsed || !parsed.sheets.length) return;
        const idx = Math.min(this.activeSheetIdx, parsed.sheets.length - 1);
        const sheet = parsed.sheets[idx];
        if (sheet.columns.length === 0) {
          module._context.notify(_t('noColumns'), 'warning');
          return;
        }

        const sm = module._context.stateManager;
        const eb = module._context.eventBus;
        const phase = this._findOwnPhase();
        const wsId = `worksheet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        // Register new worksheet in the same phase the import module lives in.
        const existing = sm.get(`phases.${phase}`) ?? [];
        sm.set(`phases.${phase}`, [
          ...existing,
          { instanceId: wsId, moduleId: 'worksheet', order: existing.length, state: {} },
        ]);

        // Pre-name the sheet using the imported sheet's name, deduplicated.
        const baseName = sheet.name || module._context.i18n.t('modules.worksheet.defaultSheetName');
        const sheetName = uniqueSheetName(sm, baseName);
        sm.setModuleState(wsId, buildInitialWorksheetState(sheetName));

        const cols = sheet.columns;
        const onActivated = ({ instanceId }) => {
          if (instanceId !== wsId) return;
          eb.off('module:activated', onActivated);

          // Map imported columns 0..N-1 onto the worksheet's default empty slots
          // (C1..C5 from _initEmptyGrid). Any imports past slot 5 simply append.
          for (let i = 0; i < cols.length; i++) {
            const c = cols[i];
            eb.emit('worksheet:appendColumn', {
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
          module._context.notify(_t('sentToWorksheet', { count: cols.length }), 'success');
        };
        eb.on('module:activated', onActivated);

        // Navigate to the new worksheet so it instantiates and the writes land.
        eb.emit('module:added', { moduleId: 'worksheet', phase, instanceId: wsId });
      },

      /** Locate which phase this module instance is registered under. */
      _findOwnPhase() {
        const sm = module._context.stateManager;
        const id = module._context.instanceId;
        for (const p of Object.keys(sm.get('phases') || {})) {
          const items = sm.get(`phases.${p}`) ?? [];
          if (items.some(i => i.instanceId === id)) return p;
        }
        return 'data';
      },

      // ── Lifecycle ─────────────────────────────────────────────

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
