/**
 * D.Mike — Data Import Module (data-import.js)
 * Data phase / "Erfassen" group: read worksheet data from third-party
 * file formats and forward it to the in-app worksheet.
 *
 * v1: Minitab Project (.mpx). The architecture is open so additional formats
 * (CSV, XLSX direct, JMP, …) can be added by registering more parsers in
 * the FORMATS array.
 */

import { uniqueSheetName, buildInitialWorksheetState } from '../../ui/column-picker.js';
import { esc, escAttr } from '../../core/html-utils.js';
import { parseMpx } from './mpx-parser.js';

// ── Format registry ───────────────────────────────────────────────

/** @typedef {{id:string, extensions:string[], i18nKey:string, parse:(buf:ArrayBuffer)=>Promise<object>}} Format */

/** @type {Format[]} */
const FORMATS = [
  {
    id: 'mpx',
    extensions: ['mpx'],
    i18nKey: 'format_mpx',
    parse: parseMpx,
  },
];

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

    this._render();
  },

  async destroy() {
    this._container.innerHTML = '';
    this._container = null;
    this._context = null;
    this._parsed = null;
  },

  onLanguageChange() { this._render(); },
  onThemeChange() { /* CSS variables handle it */ },

  getState() {
    return { file: this._file };
  },

  setState(data) {
    this._file = data?.file || null;
    this._parsed = null;
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

        ${this._renderResult(t)}

        <input type="file" data-ref="file-input" accept="${escAttr(ACCEPT_ATTR)}" hidden>
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
      const buf = await file.arrayBuffer();
      const parsed = await fmt.parse(buf);
      this._parsed = parsed;
      this._busy = false;
      this._render();
    } catch (err) {
      this._busy = false;
      const code = err?.code;
      const msg = code ? this._t(code) : (err?.message || String(err));
      this._error = code ? msg : this._t('parseErrorDetail', { message: msg });
      this._render();
    }
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

      // First column overwrites the default C1, the rest get appended.
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        eb.emit('worksheet:appendColumn', {
          instanceId: wsId,
          sheetId: 'sheet_1',
          colId: i === 0 ? '__first__' : '__new__',
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
