/**
 * D.Mike — Data Import Module (data-import.js)
 * Data phase / "Erfassen" group: read worksheet data from third-party
 * file formats and forward it to the in-app worksheet.
 *
 * The architecture is open so additional formats can be added by
 * registering more parsers in the FORMATS array. Each parser receives
 * the raw ArrayBuffer plus an opts object (filename and format-specific
 * options like delimiter / encoding).
 *
 * Currently supported: Minitab Project (.mpx), CSV / TSV / TXT,
 * XLSX / XLSM / XLS / ODS, JSON / NDJSON / JSONL, Q-DAS AQDEF (.dfq/.dfd/.dfx).
 */

import { uniqueSheetName, buildInitialWorksheetState } from '../../ui/column-picker.js';
import { esc, escAttr } from '../../core/html-utils.js';
import { parseMpx } from './mpx-parser.js';
import { parseCsv } from './csv-parser.js';
import { parseXlsx } from './xlsx-parser.js';
import { parseJson } from './json-parser.js';
import { parseAqdef } from './aqdef-parser.js';

// ── Format registry ───────────────────────────────────────────────

/** @typedef {{id:string, extensions:string[], i18nKey:string, parse:(buf:ArrayBuffer, opts?:object)=>Promise<object>}} Format */

/** @type {Format[]} */
const FORMATS = [
  {
    id: 'mpx',
    extensions: ['mpx'],
    i18nKey: 'format_mpx',
    parse: parseMpx,
  },
  {
    id: 'csv',
    extensions: ['csv', 'tsv', 'txt'],
    i18nKey: 'format_csv',
    parse: parseCsv,
  },
  {
    id: 'xlsx',
    extensions: ['xlsx', 'xlsm', 'xls', 'ods'],
    i18nKey: 'format_xlsx',
    parse: parseXlsx,
  },
  {
    id: 'json',
    extensions: ['json', 'ndjson', 'jsonl'],
    i18nKey: 'format_json',
    parse: parseJson,
  },
  {
    id: 'aqdef',
    extensions: ['dfq', 'dfd', 'dfx'],
    i18nKey: 'format_aqdef',
    parse: parseAqdef,
  },
];

/** Default CSV/TSV parser options. */
const DEFAULT_CSV_OPTIONS = {
  delimiter: 'auto',  // 'auto' | 'comma' | 'semicolon' | 'tab' | 'pipe'
  encoding: 'utf-8',  // 'utf-8' | 'windows-1252' | 'iso-8859-1'
  hasHeader: true,
  skipRows: 0,        // metadata lines to drop before parsing (CMM exports)
  preset: 'generic',  // 'generic' | 'zeiss-calypso' | 'hexagon-pcdmis' | 'mitutoyo-measurlink'
};

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

/** Default XLSX/ODS parser options. */
const DEFAULT_XLSX_OPTIONS = {
  hasHeader: true,
};

/** Default AQDEF parser options. Q-DAS files default to Windows-1252 in DACH. */
const DEFAULT_AQDEF_OPTIONS = {
  encoding: 'windows-1252',  // 'utf-8' | 'windows-1252' | 'iso-8859-1'
};

const ACCEPT_ATTR = '.' + FORMATS.flatMap(f => f.extensions).join(',.');

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

const PREVIEW_ROWS = 20;

// ── Module ────────────────────────────────────────────────────────

export default {
  id: 'data-import',
  phase: 'data',
  icon: 'upload',
  i18nKey: 'modules.data-import',
  version: '1.0.0',
  help: () => import('./data-import-help.js'),

  _container: null,
  _context: null,
  /** @type {{name:string,size:number,formatId:string|null}|null} */
  _file: null,
  /** @type {{format:string, sheets:Array<object>}|null} */
  _parsed: null,
  /** Raw bytes of the loaded file — kept on the instance for re-parse on
   *  option changes (e.g. switching CSV delimiter). Not persisted. */
  _buffer: null,
  /** Format-specific parser options. Persisted. */
  _csvOptions: { ...DEFAULT_CSV_OPTIONS },
  _xlsxOptions: { ...DEFAULT_XLSX_OPTIONS },
  _aqdefOptions: { ...DEFAULT_AQDEF_OPTIONS },
  /** Index of the sheet currently shown in the preview. */
  _activeSheetIdx: 0,
  /** Last error message (i18n key + interpolation) for parse errors. */
  _error: null,
  _busy: false,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('data-import-css')) {
      const link = document.createElement('link');
      link.id = 'data-import-css';
      link.rel = 'stylesheet';
      link.href = 'js/modules/data-import/data-import.css';
      document.head.appendChild(link);
    }

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved?.file) {
      this._file = saved.file;
      // Parsed data is intentionally NOT persisted — the user must re-pick the
      // file after a reload (browsers don't keep file handles).
    }
    if (saved?.csvOptions) {
      this._csvOptions = { ...DEFAULT_CSV_OPTIONS, ...saved.csvOptions };
    }
    if (saved?.xlsxOptions) {
      this._xlsxOptions = { ...DEFAULT_XLSX_OPTIONS, ...saved.xlsxOptions };
    }
    if (saved?.aqdefOptions) {
      this._aqdefOptions = { ...DEFAULT_AQDEF_OPTIONS, ...saved.aqdefOptions };
    }

    this._render();
  },

  async destroy() {
    this._container.innerHTML = '';
    this._container = null;
    this._context = null;
    this._parsed = null;
    this._buffer = null;
  },

  onLanguageChange() { this._render(); },
  onThemeChange() { /* CSS variables handle it */ },

  getState() {
    return {
      file: this._file,
      csvOptions: this._csvOptions,
      xlsxOptions: this._xlsxOptions,
      aqdefOptions: this._aqdefOptions,
    };
  },

  setState(data) {
    this._file = data?.file || null;
    this._csvOptions = { ...DEFAULT_CSV_OPTIONS, ...(data?.csvOptions || {}) };
    this._xlsxOptions = { ...DEFAULT_XLSX_OPTIONS, ...(data?.xlsxOptions || {}) };
    this._aqdefOptions = { ...DEFAULT_AQDEF_OPTIONS, ...(data?.aqdefOptions || {}) };
    this._parsed = null;
    this._buffer = null;
    this._error = null;
    this._activeSheetIdx = 0;
    if (this._container) this._render();
  },

  // ─── Render ─────────────────────────────────────────────────

  _t(key, params) {
    return this._context.i18n.t(`modules.data-import.${key}`, params);
  },

  _render() {
    const t = (k, p) => this._t(k, p);
    const hasFile = !!this._file;

    this._container.innerHTML = `
      <div class="module-container data-import">
        ${hasFile ? this._renderLoaded(t) : this._renderEmpty(t)}
      </div>
    `;

    if (hasFile) this._bindLoadedEvents();
    else this._bindEmptyEvents();
  },

  _renderEmpty(t) {
    return `
      <div class="data-import__empty">
        <div class="data-import__dropzone" data-ref="dropzone" tabindex="0" role="button">
          <div class="data-import__dropzone-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div class="data-import__dropzone-title">${esc(t('dropHere'))}</div>
          <div class="data-import__dropzone-hint">${esc(t('dropHint'))}</div>
          <div class="data-import__dropzone-formats">${esc(t('supportedFormats'))}</div>
        </div>
        <input type="file" data-ref="file-input" accept="${escAttr(ACCEPT_ATTR)}" hidden>
      </div>
    `;
  },

  _renderLoaded(t) {
    const file = this._file;
    const fmt = FORMATS.find(f => f.id === file.formatId);
    const formatLabel = fmt ? t(fmt.i18nKey) : t('format_unknown');

    return `
      <div class="data-import__loaded">
        <div class="data-import__file-card">
          <div class="data-import__file-info">
            <div class="data-import__file-row">
              <span class="data-import__file-label">${esc(t('fileName'))}:</span>
              <span class="data-import__file-value">${esc(file.name)}</span>
            </div>
            <div class="data-import__file-row">
              <span class="data-import__file-label">${esc(t('fileType'))}:</span>
              <span class="data-import__file-value">${esc(formatLabel)}</span>
            </div>
            <div class="data-import__file-row">
              <span class="data-import__file-label">${esc(t('fileSize'))}:</span>
              <span class="data-import__file-value">${esc(fmtBytes(file.size))}</span>
            </div>
          </div>
          <div class="data-import__file-actions">
            <button class="data-import__btn-secondary" data-action="replace" type="button">
              ${esc(t('replaceFile'))}
            </button>
          </div>
        </div>

        ${fmt?.id === 'csv' ? this._renderCsvOptions(t) : ''}
        ${fmt?.id === 'xlsx' ? this._renderXlsxOptions(t) : ''}
        ${fmt?.id === 'aqdef' ? this._renderAqdefOptions(t) : ''}

        ${this._renderResult(t)}

        <input type="file" data-ref="file-input" accept="${escAttr(ACCEPT_ATTR)}" hidden>
      </div>
    `;
  },

  _renderAqdefOptions(t) {
    const o = this._aqdefOptions;
    const encOpts = [
      ['windows-1252', t('enc_windows1252')],
      ['iso-8859-1', t('enc_latin1')],
      ['utf-8', t('enc_utf8')],
    ];
    const optionTags = encOpts.map(
      ([v, label]) =>
        `<option value="${escAttr(v)}"${v === o.encoding ? ' selected' : ''}>${esc(label)}</option>`
    ).join('');
    return `
      <div class="data-import__options">
        <label class="data-import__option">
          <span class="data-import__option-label">${esc(t('encoding'))}</span>
          <select data-aqdef-opt="encoding">${optionTags}</select>
        </label>
      </div>
    `;
  },

  _renderXlsxOptions(t) {
    const o = this._xlsxOptions;
    return `
      <div class="data-import__options">
        <label class="data-import__option data-import__option--check">
          <input type="checkbox" data-xlsx-opt="hasHeader"${o.hasHeader ? ' checked' : ''}>
          <span class="data-import__option-label">${esc(t('useFirstRowAsHeader'))}</span>
        </label>
      </div>
    `;
  },

  _renderCsvOptions(t) {
    const o = this._csvOptions;
    const presetOpts = [
      ['generic', t('csv_preset_generic')],
      ['zeiss-calypso', t('csv_preset_zeiss_calypso')],
      ['hexagon-pcdmis', t('csv_preset_hexagon_pcdmis')],
      ['mitutoyo-measurlink', t('csv_preset_mitutoyo_measurlink')],
    ];
    const delimOpts = [
      ['auto', t('delim_auto')],
      ['comma', t('delim_comma')],
      ['semicolon', t('delim_semicolon')],
      ['tab', t('delim_tab')],
      ['pipe', t('delim_pipe')],
    ];
    const encOpts = [
      ['utf-8', t('enc_utf8')],
      ['windows-1252', t('enc_windows1252')],
      ['iso-8859-1', t('enc_latin1')],
    ];
    const optionTags = (items, current) => items.map(
      ([v, label]) =>
        `<option value="${escAttr(v)}"${v === current ? ' selected' : ''}>${esc(label)}</option>`
    ).join('');

    return `
      <div class="data-import__options">
        <label class="data-import__option">
          <span class="data-import__option-label">${esc(t('csv_preset'))}</span>
          <select data-csv-opt="preset">${optionTags(presetOpts, o.preset)}</select>
        </label>
        <label class="data-import__option">
          <span class="data-import__option-label">${esc(t('delimiter'))}</span>
          <select data-csv-opt="delimiter">${optionTags(delimOpts, o.delimiter)}</select>
        </label>
        <label class="data-import__option">
          <span class="data-import__option-label">${esc(t('encoding'))}</span>
          <select data-csv-opt="encoding">${optionTags(encOpts, o.encoding)}</select>
        </label>
        <label class="data-import__option">
          <span class="data-import__option-label">${esc(t('csv_skipRows'))}</span>
          <input type="number" min="0" step="1" data-csv-opt="skipRows" value="${o.skipRows}" class="data-import__num-input">
        </label>
        <label class="data-import__option data-import__option--check">
          <input type="checkbox" data-csv-opt="hasHeader"${o.hasHeader ? ' checked' : ''}>
          <span class="data-import__option-label">${esc(t('useFirstRowAsHeader'))}</span>
        </label>
      </div>
    `;
  },

  _renderResult(t) {
    if (this._busy) {
      return `<div class="data-import__status">${esc(t('parsing'))}</div>`;
    }
    if (this._error) {
      return `
        <div class="data-import__error">
          <strong>${esc(t('parseError'))}</strong>
          <div class="data-import__error-detail">${esc(this._error)}</div>
        </div>
      `;
    }
    if (!this._parsed) {
      // File loaded but not yet parsed (e.g. after reload from saved state).
      // Prompt user to re-pick the file.
      return `<div class="data-import__status">${esc(t('noFile'))}</div>`;
    }

    const sheets = this._parsed.sheets;
    const idx = Math.min(this._activeSheetIdx, sheets.length - 1);
    const sheet = sheets[idx];

    const sheetTabs = sheets.length > 1
      ? `<div class="data-import__sheet-tabs">
          ${sheets.map((s, i) => `
            <button class="data-import__sheet-tab${i === idx ? ' data-import__sheet-tab--active' : ''}"
              data-sheet-idx="${i}" type="button">
              ${esc(s.name)}
              <span class="data-import__sheet-tab-meta">${esc(t('columnCount', { count: s.columns.length }))}</span>
            </button>
          `).join('')}
        </div>`
      : '';

    return `
      <div class="data-import__preview-block">
        <div class="data-import__preview-header">
          <span class="data-import__preview-title">${esc(t('preview'))}</span>
          <span class="data-import__preview-meta">
            ${esc(t('sheetCount', { count: sheets.length }))} ·
            ${esc(t('columnCount', { count: sheet.columns.length }))} ·
            ${esc(t('rowCount', { count: sheet.rowCount }))}
          </span>
        </div>
        ${sheetTabs}
        ${this._renderPreviewTable(sheet, t)}
        <div class="data-import__send-row">
          <button class="dmike-btn-run" data-action="send" type="button">
            ${esc(t('sendToWorksheet'))}
          </button>
        </div>
      </div>
    `;
  },

  _renderPreviewTable(sheet, t) {
    if (sheet.columns.length === 0) {
      return `<div class="data-import__status">${esc(t('noColumns'))}</div>`;
    }

    const cols = sheet.columns;
    const rowsToShow = Math.min(PREVIEW_ROWS, sheet.rowCount);

    const head = cols.map(c => `
      <th>
        <div class="data-import__col-name">${esc(c.name || c.shortName)}</div>
        <div class="data-import__col-type">${esc(c.type === 'numeric' ? t('typeNumeric') : t('typeText'))}</div>
      </th>
    `).join('');

    const body = [];
    for (let r = 0; r < rowsToShow; r++) {
      const cells = cols.map(c => {
        const v = c.values[r];
        if (v == null) return '<td class="data-import__cell--null">·</td>';
        const cls = c.type === 'numeric' ? 'data-import__cell--num' : '';
        return `<td class="${cls}">${esc(String(v))}</td>`;
      }).join('');
      body.push(`<tr>${cells}</tr>`);
    }

    const more = sheet.rowCount > rowsToShow
      ? `<div class="data-import__more">${esc(t('moreRows', { count: sheet.rowCount - rowsToShow }))}</div>`
      : '';

    return `
      <div class="data-import__preview-table-wrap">
        <table class="data-import__preview-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${body.join('')}</tbody>
        </table>
      </div>
      ${more}
    `;
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindEmptyEvents() {
    const el = this._container;
    const dz = el.querySelector('[data-ref="dropzone"]');
    const fi = el.querySelector('[data-ref="file-input"]');

    if (dz && fi) {
      dz.addEventListener('click', () => fi.click());
      dz.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fi.click();
        }
      });
      this._wireDropzone(dz);
      fi.addEventListener('change', () => {
        const f = fi.files?.[0];
        if (f) this._handleFile(f);
      });
    }
  },

  _bindLoadedEvents() {
    const el = this._container;
    const fi = el.querySelector('[data-ref="file-input"]');

    el.querySelector('[data-action="replace"]')?.addEventListener('click', () => fi?.click());
    fi?.addEventListener('change', () => {
      const f = fi.files?.[0];
      if (f) this._handleFile(f);
    });

    el.querySelectorAll('[data-sheet-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeSheetIdx = parseInt(btn.dataset.sheetIdx, 10) || 0;
        this._render();
      });
    });

    el.querySelectorAll('[data-csv-opt]').forEach(ctrl => {
      const key = ctrl.dataset.csvOpt;
      ctrl.addEventListener('change', () => {
        if (key === 'preset') {
          // Apply the chosen preset's full option set, then re-render so the
          // dependent controls (delimiter, encoding, skipRows, hasHeader)
          // reflect the new defaults.
          const preset = CSV_PRESETS[ctrl.value] || CSV_PRESETS.generic;
          this._csvOptions = { ...this._csvOptions, ...preset, preset: ctrl.value };
          this._save();
          this._render();
          this._reparse();
          return;
        }
        if (ctrl.type === 'checkbox') this._csvOptions[key] = ctrl.checked;
        else if (ctrl.type === 'number') this._csvOptions[key] = Math.max(0, Math.floor(Number(ctrl.value) || 0));
        else this._csvOptions[key] = ctrl.value;
        this._save();
        this._reparse();
      });
    });

    el.querySelectorAll('[data-xlsx-opt]').forEach(ctrl => {
      const key = ctrl.dataset.xlsxOpt;
      ctrl.addEventListener('change', () => {
        if (ctrl.type === 'checkbox') this._xlsxOptions[key] = ctrl.checked;
        else this._xlsxOptions[key] = ctrl.value;
        this._save();
        this._reparse();
      });
    });

    el.querySelectorAll('[data-aqdef-opt]').forEach(ctrl => {
      const key = ctrl.dataset.aqdefOpt;
      ctrl.addEventListener('change', () => {
        if (ctrl.type === 'checkbox') this._aqdefOptions[key] = ctrl.checked;
        else this._aqdefOptions[key] = ctrl.value;
        this._save();
        this._reparse();
      });
    });

    el.querySelector('[data-action="send"]')?.addEventListener('click', () => this._sendToWorksheet());

    // Allow re-dropping a file onto the loaded view to replace it.
    this._wireDropzone(el);
  },

  _wireDropzone(target) {
    const onDragOver = (e) => {
      e.preventDefault();
      target.classList.add('data-import__dropzone--over');
    };
    const onDragLeave = () => target.classList.remove('data-import__dropzone--over');
    const onDrop = (e) => {
      e.preventDefault();
      target.classList.remove('data-import__dropzone--over');
      const f = e.dataTransfer?.files?.[0];
      if (f) this._handleFile(f);
    };
    target.addEventListener('dragover', onDragOver);
    target.addEventListener('dragleave', onDragLeave);
    target.addEventListener('drop', onDrop);
  },

  // ─── File handling ──────────────────────────────────────────

  async _handleFile(file) {
    const fmt = detectFormat(file.name);
    this._file = {
      name: file.name,
      size: file.size,
      formatId: fmt ? fmt.id : null,
    };
    this._parsed = null;
    this._buffer = null;
    this._error = null;
    this._activeSheetIdx = 0;
    this._busy = true;
    this._save();
    this._render();

    if (!fmt) {
      this._busy = false;
      this._error = this._t('format_unknown');
      this._render();
      return;
    }

    try {
      this._buffer = await file.arrayBuffer();
      await this._runParse(fmt);
    } catch (err) {
      this._busy = false;
      const code = err?.code;
      const msg = code ? this._t(code) : (err?.message || String(err));
      this._error = code ? msg : this._t('parseErrorDetail', { message: msg });
      this._render();
    }
  },

  /** Run the format's parser on the buffer with the current options. */
  async _runParse(fmt) {
    const opts = {
      filename: this._file?.name,
      ...(fmt.id === 'csv' ? this._csvOptions : {}),
      ...(fmt.id === 'xlsx' ? this._xlsxOptions : {}),
      ...(fmt.id === 'aqdef' ? this._aqdefOptions : {}),
    };
    try {
      const parsed = await fmt.parse(this._buffer, opts);
      this._parsed = parsed;
      this._error = null;
      this._busy = false;
      this._render();
    } catch (err) {
      this._parsed = null;
      this._busy = false;
      const code = err?.code;
      const msg = code ? this._t(code) : (err?.message || String(err));
      this._error = code ? msg : this._t('parseErrorDetail', { message: msg });
      this._render();
    }
  },

  /** Re-parse the buffered file with currently selected options (CSV only). */
  async _reparse() {
    if (!this._buffer || !this._file?.formatId) return;
    const fmt = FORMATS.find(f => f.id === this._file.formatId);
    if (!fmt) return;
    this._busy = true;
    this._error = null;
    this._render();
    await this._runParse(fmt);
  },

  // ─── Send to worksheet ──────────────────────────────────────

  _sendToWorksheet() {
    const parsed = this._parsed;
    if (!parsed || !parsed.sheets.length) return;
    const idx = Math.min(this._activeSheetIdx, parsed.sheets.length - 1);
    const sheet = parsed.sheets[idx];
    if (sheet.columns.length === 0) {
      this._context.notify(this._t('noColumns'), 'warning');
      return;
    }

    const sm = this._context.stateManager;
    const eb = this._context.eventBus;
    const phase = this._findOwnPhase();
    const wsId = `worksheet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Register new worksheet in the same phase the import module lives in.
    const existing = sm.get(`phases.${phase}`) ?? [];
    sm.set(`phases.${phase}`, [
      ...existing,
      { instanceId: wsId, moduleId: 'worksheet', order: existing.length, state: {} },
    ]);

    // Pre-name the sheet using the imported sheet's name, deduplicated.
    const baseName = sheet.name || this._context.i18n.t('modules.worksheet.defaultSheetName');
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
      this._context.notify(this._t('sentToWorksheet', { count: cols.length }), 'success');
    };
    eb.on('module:activated', onActivated);

    // Navigate to the new worksheet so it instantiates and the writes land.
    eb.emit('module:added', { moduleId: 'worksheet', phase, instanceId: wsId });
  },

  /** Locate which phase this module instance is registered under. */
  _findOwnPhase() {
    const sm = this._context.stateManager;
    const id = this._context.instanceId;
    for (const p of Object.keys(sm.get('phases') || {})) {
      const items = sm.get(`phases.${p}`) ?? [];
      if (items.some(i => i.instanceId === id)) return p;
    }
    return 'data';
  },

  // ─── Persistence ────────────────────────────────────────────

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      this.getState()
    );
  },
};
