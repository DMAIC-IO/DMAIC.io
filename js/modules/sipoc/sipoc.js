/**
 * D.Mike — SIPOC Module (sipoc.js)
 * Supplier-Input-Process-Output-Customer diagram.
 * DMAIC phase: Define
 *
 * Five-column interactive board with drag & drop reordering,
 * inline add/edit/delete, and multi-format export (XLSX, CSV, JSON, PNG, SVG).
 *
 * Spec: docs/modules/SIPOC.md
 */

import {
  downloadFile, downloadBlob, ensureXLSX, createExportDropdown,
} from '../../core/export-utils.js';

/** @type {{ key: string, letter: string }[]} */
const COLUMNS = [
  { key: 'suppliers', letter: 'S' },
  { key: 'inputs',    letter: 'I' },
  { key: 'process',   letter: 'P' },
  { key: 'outputs',   letter: 'O' },
  { key: 'customers', letter: 'C' },
];

const COL_COLORS = {
  suppliers: '#f59e0b',
  inputs:    '#3b82f6',
  process:   '#10b981',
  outputs:   '#a855f7',
  customers: '#ef4444',
};

export default {
  id: 'sipoc',
  phase: 'define',
  icon: 'clipboard-list',
  i18nKey: 'modules.sipoc',
  version: '1.0.0',

  /** @type {object} */
  _context: null,
  /** @type {HTMLElement} */
  _container: null,
  /** @type {Record<string, string[]>} */
  _data: null,
  /** @type {{ col: string|null, idx: number|null }} */
  _dragState: { col: null, idx: null },
  /** @type {{ el: HTMLElement, destroy: function }|null} */
  _exportDropdown: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._data = { suppliers: [], inputs: [], process: [], outputs: [], customers: [] };

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._importState(saved);
    }

    this._render();
  },

  async destroy() {
    if (this._exportDropdown) this._exportDropdown.destroy();
    this._container.innerHTML = '';
  },

  onLanguageChange(_lang) {
    this._render();
  },

  onThemeChange(_theme) {
    // CSS custom properties handle theme changes
  },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return { columns: JSON.parse(JSON.stringify(this._data)) };
  },

  setState(data) {
    this._importState(data);
    this._render();
  },

  // ─── Help ───────────────────────────────────────────────────

  help: () => import('./sipoc-help.js'),

  // ─── Internal: state import ─────────────────────────────────

  _importState(saved) {
    if (!saved) return;
    const cols = saved.columns || saved;
    for (const col of COLUMNS) {
      if (Array.isArray(cols[col.key])) {
        this._data[col.key] = [...cols[col.key]];
      }
    }
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (key, params) => this._context.i18n.t(`modules.sipoc.${key}`, params);

    this._container.innerHTML = `
      <div class="module-container sipoc">
        <div class="module-container__header">
          <h2 class="module-container__title">${this._context.i18n.t('modules.sipoc.name')}</h2>
          <div class="sipoc__toolbar">
            <div class="sipoc__toolbar-spacer"></div>
            <span class="sipoc__export-anchor"></span>
          </div>
        </div>

        <div class="module-container__body">
          ${this._renderFlowBar()}
          <div class="sipoc__grid" data-ref="sipocGrid">
            ${COLUMNS.map(col => this._renderColumn(col, t)).join('')}
          </div>
        </div>
      </div>
    `;

    this._bindEvents(t);
    this._initDragDrop();
  },

  _renderFlowBar() {
    return `
      <div class="sipoc__flow-bar">
        <div class="sipoc__flow-step"><div class="sipoc__flow-letter sipoc__flow-letter--s">S</div></div>
        <div class="sipoc__flow-arrow sipoc__flow-arrow--si"></div>
        <div class="sipoc__flow-step"><div class="sipoc__flow-letter sipoc__flow-letter--i">I</div></div>
        <div class="sipoc__flow-arrow sipoc__flow-arrow--ip"></div>
        <div class="sipoc__flow-step"><div class="sipoc__flow-letter sipoc__flow-letter--p">P</div></div>
        <div class="sipoc__flow-arrow sipoc__flow-arrow--po"></div>
        <div class="sipoc__flow-step"><div class="sipoc__flow-letter sipoc__flow-letter--o">O</div></div>
        <div class="sipoc__flow-arrow sipoc__flow-arrow--oc"></div>
        <div class="sipoc__flow-step"><div class="sipoc__flow-letter sipoc__flow-letter--c">C</div></div>
      </div>
    `;
  },

  _renderColumn(col, t) {
    const items = this._data[col.key];
    return `
      <div class="sipoc__column" data-col="${col.key}">
        <div class="sipoc__col-header">
          <div class="sipoc__col-title">
            <div class="sipoc__col-indicator"></div>
            <div>
              <div class="sipoc__col-label">${t(`col.${col.key}`)}</div>
              <div class="sipoc__col-desc">${t(`colDesc.${col.key}`)}</div>
            </div>
          </div>
          <span class="sipoc__item-count">${items.length}</span>
        </div>
        <div class="sipoc__items-list" data-col="${col.key}">
          ${col.key === 'process' && items.length > 0
            ? `<div class="sipoc__process-cap sipoc__process-cap--start">${t('processStart')}</div>` : ''}
          ${items.length === 0
            ? ''
            : items.map((item, i) => this._renderItem(col.key, item, i)).join('')
          }
          ${col.key === 'process' && items.length > 0
            ? `<div class="sipoc__process-cap sipoc__process-cap--end">${t('processEnd')}</div>` : ''}
        </div>
        <div class="sipoc__add-area">
          <div class="sipoc__add-row">
            <input
              class="field sipoc__add-input"
              type="text"
              placeholder="${t(`placeholder.${col.key}`)}"
              data-col="${col.key}"
              aria-label="${t(`placeholder.${col.key}`)}"
            />
            <button class="sipoc__add-btn" data-col="${col.key}" title="${this._context.i18n.t('common.add')}">+</button>
          </div>
        </div>
      </div>
    `;
  },

  _renderItem(colKey, text, index) {
    const isProcess = colKey === 'process';
    return `
      <div class="sipoc__item" draggable="true" data-col="${colKey}" data-idx="${index}">
        <span class="sipoc__grip">&#x283F;</span>
        ${isProcess ? `<span class="sipoc__step-num">${index + 1}</span>` : ''}
        <span class="sipoc__item-text">${this._escapeHtml(text)}</span>
        <div class="sipoc__item-actions">
          <button class="btn btn--icon-sm sipoc__item-btn" data-action="edit" data-col="${colKey}" data-idx="${index}"
            title="${this._context.i18n.t('common.edit')}">&#x270E;</button>
          <button class="btn btn--icon-sm sipoc__item-btn sipoc__item-btn--delete" data-action="delete" data-col="${colKey}" data-idx="${index}"
            title="${this._context.i18n.t('common.delete')}">&#x2715;</button>
        </div>
      </div>
    `;
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindEvents(t) {
    const el = this._container;

    // Add items via input + Enter
    el.querySelectorAll('.sipoc__add-input').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this._addItem(input.dataset.col, input);
        }
      });
    });

    // Add items via + button
    el.querySelectorAll('.sipoc__add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const colKey = btn.dataset.col;
        const input = el.querySelector(`.sipoc__add-input[data-col="${colKey}"]`);
        if (input) this._addItem(colKey, input);
      });
    });

    // Edit / Delete via event delegation
    el.querySelectorAll('.sipoc__item-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { action, col, idx } = btn.dataset;
        if (action === 'edit') this._editItem(col, parseInt(idx, 10), t);
        if (action === 'delete') this._deleteItem(col, parseInt(idx, 10));
      });
    });

    // Export dropdown (central component)
    if (this._exportDropdown) this._exportDropdown.destroy();
    this._exportDropdown = createExportDropdown(
      ['xlsx', 'csv', 'json', 'png', 'svg'],
      (fmt) => {
        if (fmt === 'csv')  this._exportCSV(t);
        if (fmt === 'xlsx') this._exportXLSX(t);
        if (fmt === 'json') this._exportJSON();
        if (fmt === 'png')  this._exportImage('png');
        if (fmt === 'svg')  this._exportImage('svg');
      }
    );
    el.querySelector('.sipoc__export-anchor')?.replaceWith(this._exportDropdown.el);
  },

  // ─── CRUD ───────────────────────────────────────────────────

  _addItem(colKey, inputEl) {
    const val = inputEl.value.trim();
    if (!val) return;
    this._data[colKey].push(val);
    inputEl.value = '';
    this._save();
    this._render();
    const input = this._container.querySelector(`.sipoc__add-input[data-col="${colKey}"]`);
    if (input) input.focus();
  },

  _deleteItem(colKey, idx) {
    this._data[colKey].splice(idx, 1);
    this._save();
    this._render();
  },

  async _editItem(colKey, idx, t) {
    const colLabel = t(`col.${colKey}`);
    const currentValue = this._data[colKey][idx];

    const formHtml = `
      <div>
        <textarea class="field" data-field="text"
          style="min-height:80px;"
        >${this._escapeHtml(currentValue)}</textarea>
      </div>
    `;

    await this._context.showModal.form(
      `${colLabel} — ${this._context.i18n.t('common.edit')}`,
      formHtml,
      {
        confirmLabel: this._context.i18n.t('common.save'),
        onMount: (el) => {
          const ta = el.querySelector('[data-field="text"]');
          if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }
        },
        onConfirm: (el) => {
          const val = el.querySelector('[data-field="text"]').value.trim();
          if (!val) return false;
          this._data[colKey][idx] = val;
          this._save();
          this._render();
          return true;
        },
      }
    );
  },

  // ─── Drag & Drop ────────────────────────────────────────────

  _initDragDrop() {
    const el = this._container;

    el.querySelectorAll('.sipoc__item[draggable]').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        this._dragState.col = item.dataset.col;
        this._dragState.idx = parseInt(item.dataset.idx, 10);
        item.classList.add('sipoc__item--dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('sipoc__item--dragging');
        el.querySelectorAll('.sipoc__column').forEach(c => c.classList.remove('sipoc__column--drag-over'));
        this._dragState = { col: null, idx: null };
      });
    });

    el.querySelectorAll('.sipoc__items-list').forEach(list => {
      list.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        list.closest('.sipoc__column').classList.add('sipoc__column--drag-over');
      });

      list.addEventListener('dragleave', (e) => {
        if (!list.contains(e.relatedTarget)) {
          list.closest('.sipoc__column').classList.remove('sipoc__column--drag-over');
        }
      });

      list.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetCol = list.dataset.col;
        const sourceCol = this._dragState.col;
        const sourceIdx = this._dragState.idx;
        if (sourceCol === null) return;

        let dropIdx = this._data[targetCol].length;
        const items = list.querySelectorAll('.sipoc__item');
        for (let i = 0; i < items.length; i++) {
          const rect = items[i].getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) {
            dropIdx = i;
            break;
          }
        }

        const [moved] = this._data[sourceCol].splice(sourceIdx, 1);
        if (sourceCol === targetCol && dropIdx > sourceIdx) dropIdx--;
        this._data[targetCol].splice(dropIdx, 0, moved);

        this._save();
        this._render();
        list.closest('.sipoc__column').classList.remove('sipoc__column--drag-over');
      });
    });
  },

  // ─── Export ─────────────────────────────────────────────────

  _exportJSON() {
    const out = {
      tool: 'SIPOC',
      timestamp: new Date().toISOString(),
      sipoc: {},
    };
    for (const col of COLUMNS) {
      out.sipoc[col.key] = [...this._data[col.key]];
    }
    downloadFile(JSON.stringify(out, null, 2), 'sipoc.json', 'application/json');
    this._context.notify('JSON ✓', 'success');
  },

  _exportCSV(t) {
    const maxLen = Math.max(...COLUMNS.map(c => this._data[c.key].length), 1);
    let csv = 'sep=;\n';
    csv += COLUMNS.map(c => `"${t(`col.${c.key}`)}"`).join(';') + '\n';
    for (let i = 0; i < maxLen; i++) {
      csv += COLUMNS.map(c => {
        const val = this._data[c.key][i] || '';
        return `"${val.replace(/"/g, '""')}"`;
      }).join(';') + '\n';
    }
    downloadFile(csv, 'sipoc.csv', 'text/csv;charset=utf-8');
    this._context.notify('CSV ✓', 'success');
  },

  async _exportXLSX(t) {
    try { await ensureXLSX(); } catch { this._context.notify?.('XLSX library not loaded'); return; }
    const maxLen = Math.max(...COLUMNS.map(c => this._data[c.key].length), 1);
    const rows = [];
    rows.push(COLUMNS.map(c => t(`col.${c.key}`)));
    for (let i = 0; i < maxLen; i++) {
      rows.push(COLUMNS.map(c => this._data[c.key][i] || ''));
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'SIPOC');
    XLSX.writeFile(wb, 'sipoc.xlsx');
    this._context.notify('Excel ✓', 'success');
  },

  _exportImage(format) {
    const t = (key) => this._context.i18n.t(`modules.sipoc.${key}`);
    const cs = getComputedStyle(document.documentElement);
    const cv = (v, fb) => cs.getPropertyValue(v).trim() || fb;

    const COL_W = 200;
    const GAP = 8;
    const PAD = 20;
    const HEADER_H = 48;
    const ITEM_H = 32;
    const ITEM_PAD = 6;
    const FONT = '13px "DM Sans", system-ui, sans-serif';
    const FONT_SM = '10px "JetBrains Mono", monospace';
    const FONT_LABEL = 'bold 11px "DM Sans", system-ui, sans-serif';

    const bgPrimary = cv('--color-bg-primary', '#ffffff');
    const bgSecondary = cv('--color-bg-secondary', '#f8f9fa');
    const borderColor = cv('--color-border-secondary', '#dee2e6');
    const textPrimary = cv('--color-text-primary', '#212529');
    const textSecondary = cv('--color-text-secondary', '#6c757d');
    const textTertiary = cv('--color-text-tertiary', '#adb5bd');

    const maxItems = Math.max(...COLUMNS.map(c => this._data[c.key].length), 1);
    const totalW = PAD * 2 + COLUMNS.length * COL_W + (COLUMNS.length - 1) * GAP;
    const totalH = PAD * 2 + HEADER_H + maxItems * (ITEM_H + ITEM_PAD) + ITEM_PAD;

    if (format === 'png') {
      this._drawSipocPNG(totalW, totalH, COL_W, GAP, PAD, HEADER_H, ITEM_H, ITEM_PAD,
        FONT, FONT_SM, FONT_LABEL, bgPrimary, bgSecondary, borderColor,
        textPrimary, textSecondary, textTertiary, t);
    } else {
      this._drawSipocSVG(totalW, totalH, COL_W, GAP, PAD, HEADER_H, ITEM_H, ITEM_PAD,
        FONT_LABEL, bgPrimary, bgSecondary, borderColor,
        textPrimary, textSecondary, textTertiary, t);
    }
  },

  /** @param {function} t */
  _drawSipocPNG(W, H, COL_W, GAP, PAD, HEADER_H, ITEM_H, ITEM_PAD,
    FONT, FONT_SM, FONT_LABEL, bgPrimary, bgSecondary, borderColor,
    textPrimary, textSecondary, textTertiary, t) {

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    ctx.fillStyle = bgPrimary;
    ctx.fillRect(0, 0, W, H);

    for (let ci = 0; ci < COLUMNS.length; ci++) {
      const col = COLUMNS[ci];
      const x = PAD + ci * (COL_W + GAP);
      const color = COL_COLORS[col.key];
      const items = this._data[col.key];

      ctx.fillStyle = bgSecondary;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      const colH = HEADER_H + Math.max(items.length, 1) * (ITEM_H + ITEM_PAD) + ITEM_PAD;
      this._roundRect(ctx, x, PAD, COL_W, colH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = color + '18';
      this._roundRectTop(ctx, x, PAD, COL_W, HEADER_H, 6);
      ctx.fill();
      ctx.strokeStyle = borderColor;
      ctx.beginPath();
      ctx.moveTo(x, PAD + HEADER_H);
      ctx.lineTo(x + COL_W, PAD + HEADER_H);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x + 14, PAD + HEADER_H / 2, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.fillStyle = textPrimary;
      ctx.font = FONT_LABEL;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(t(`col.${col.key}`).toUpperCase(), x + 26, PAD + HEADER_H / 2 - 6);

      ctx.fillStyle = textTertiary;
      ctx.font = FONT_SM;
      ctx.fillText(t(`colDesc.${col.key}`), x + 26, PAD + HEADER_H / 2 + 8);

      for (let i = 0; i < items.length; i++) {
        const iy = PAD + HEADER_H + ITEM_PAD + i * (ITEM_H + ITEM_PAD);
        ctx.fillStyle = bgPrimary;
        ctx.strokeStyle = borderColor;
        this._roundRect(ctx, x + 8, iy, COL_W - 16, ITEM_H, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = textPrimary;
        ctx.font = FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const txt = items[i].length > 28 ? items[i].slice(0, 26) + '…' : items[i];
        ctx.fillText(txt, x + 14, iy + ITEM_H / 2);
      }
    }

    canvas.toBlob(blob => downloadBlob(blob, 'sipoc.png'), 'image/png');
    this._context.notify('PNG ✓', 'success');
  },

  _drawSipocSVG(W, H, COL_W, GAP, PAD, HEADER_H, ITEM_H, ITEM_PAD,
    FONT_LABEL, bgPrimary, bgSecondary, borderColor,
    textPrimary, textSecondary, textTertiary, t) {

    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    svg += `<rect width="${W}" height="${H}" fill="${bgPrimary}"/>`;

    for (let ci = 0; ci < COLUMNS.length; ci++) {
      const col = COLUMNS[ci];
      const x = PAD + ci * (COL_W + GAP);
      const color = COL_COLORS[col.key];
      const items = this._data[col.key];
      const colH = HEADER_H + Math.max(items.length, 1) * (ITEM_H + ITEM_PAD) + ITEM_PAD;

      svg += `<rect x="${x}" y="${PAD}" width="${COL_W}" height="${colH}" rx="6" fill="${bgSecondary}" stroke="${borderColor}"/>`;

      svg += `<rect x="${x}" y="${PAD}" width="${COL_W}" height="${HEADER_H}" rx="6" fill="${color}" fill-opacity="0.09"/>`;
      svg += `<rect x="${x}" y="${PAD + HEADER_H - 6}" width="${COL_W}" height="6" fill="${color}" fill-opacity="0.09"/>`;
      svg += `<line x1="${x}" y1="${PAD + HEADER_H}" x2="${x + COL_W}" y2="${PAD + HEADER_H}" stroke="${borderColor}"/>`;

      svg += `<circle cx="${x + 14}" cy="${PAD + HEADER_H / 2}" r="5" fill="${color}"/>`;
      svg += `<text x="${x + 26}" y="${PAD + HEADER_H / 2 - 6}" fill="${textPrimary}" font-size="11" font-weight="bold" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(t(`col.${col.key}`).toUpperCase())}</text>`;
      svg += `<text x="${x + 26}" y="${PAD + HEADER_H / 2 + 8}" fill="${textTertiary}" font-size="10" font-family="JetBrains Mono, monospace" dominant-baseline="central">${esc(t(`colDesc.${col.key}`))}</text>`;

      for (let i = 0; i < items.length; i++) {
        const iy = PAD + HEADER_H + ITEM_PAD + i * (ITEM_H + ITEM_PAD);
        svg += `<rect x="${x + 8}" y="${iy}" width="${COL_W - 16}" height="${ITEM_H}" rx="4" fill="${bgPrimary}" stroke="${borderColor}"/>`;
        const txt = items[i].length > 28 ? items[i].slice(0, 26) + '…' : items[i];
        svg += `<text x="${x + 14}" y="${iy + ITEM_H / 2}" fill="${textPrimary}" font-size="13" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(txt)}</text>`;
      }
    }

    svg += '</svg>';
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'sipoc.svg');
    this._context.notify('SVG ✓', 'success');
  },

  // ─── Canvas helpers ─────────────────────────────────────────

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  },

  _roundRectTop(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  },

  // ─── Persistence ────────────────────────────────────────────

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      this.getState()
    );
  },

  // ─── Helpers ────────────────────────────────────────────────

  _escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};
