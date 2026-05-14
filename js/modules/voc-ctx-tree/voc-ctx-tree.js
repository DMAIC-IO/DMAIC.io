/**
 * D.Mike — VoC → CTx Tree Module (voc-ctx-tree.js)
 * Define phase: translate Voice of Customer statements into
 * a CTx hierarchy (Needs → Drivers → Requirements).
 *
 * Spec: docs/modules/VOC-CTX-TREE.md
 */

import { exportSvgAsPNG, exportSvgAsFile } from '../../core/chart/modebar.js';
import {
  edSection, edColorPair, edRangeRow,
  openColorPicker, parseRGBA, rgbaStr,
} from '../../core/chart/chart-editor.js';
import { ensureXLSX as _ensureXLSX } from '../../core/export-utils.js';

/* ── Default node colors ── */
const DEFAULT_COLORS = {
  voc:  'rgba(230,126,34,1)',
  need: 'rgba(155,89,182,1)',
  ctq:  'rgba(39,174,96,1)',
  ctd:  'rgba(41,128,185,1)',
  ctc:  'rgba(231,76,139,1)',
  req:  'rgba(52,152,219,1)',
};

const DEFAULT_STYLES = () => ({
  borderWidth: 1,
  colors: { ...DEFAULT_COLORS },
});

/* ── SVG icon markup (same icons as modebar.js) ── */
const ICONS = {
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  png:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  svg:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 15l2 2 4-4"/></svg>',
  csv:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M8 15h2M11 15h2M14 15h2"/></svg>',
  xlsx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 13l6 6M15 13l-6 6"/></svg>',
};

export default {
  id: 'voc-ctx-tree',
  phase: 'define',
  icon: 'message-circle',
  i18nKey: 'modules.voc-ctx-tree',
  version: '0.1.0',

  /** @type {object} */
  _context: null,
  /** @type {HTMLElement} */
  _container: null,
  /** @type {Array<object>} */
  _vocs: [],
  /** @type {string|null} */
  _activeVocId: null,
  /** @type {{ borderWidth: number, bgPattern: string, colors: Object }} */
  _styles: null,
  /** @type {function|null} */
  _docClickHandler: null,
  /** @type {function|null} */
  _mouseUpHandler: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._vocs = saved.vocs ?? [];
      this._activeVocId = saved.activeVocId ?? null;
      this._styles = { ...DEFAULT_STYLES(), ...saved.styles, colors: { ...DEFAULT_COLORS, ...saved.styles?.colors } };
    } else {
      this._styles = DEFAULT_STYLES();
    }

    // Auto-select first VoC if none active
    if (!this._activeVocId && this._vocs.length) {
      this._activeVocId = this._vocs[0].id;
    }

    this._render();
  },

  async destroy() {
    if (this._docClickHandler) {
      document.removeEventListener('click', this._docClickHandler);
      this._docClickHandler = null;
    }
    if (this._mouseUpHandler) {
      document.removeEventListener('mouseup', this._mouseUpHandler);
      this._mouseUpHandler = null;
    }
    this._container.innerHTML = '';
  },

  onLanguageChange(_lang) {
    this._render();
  },

  onThemeChange(_theme) {
    // CSS custom properties handle it
  },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return {
      vocs: this._vocs,
      activeVocId: this._activeVocId,
      styles: this._styles,
    };
  },

  setState(data) {
    this._vocs = data.vocs ?? [];
    this._activeVocId = data.activeVocId ?? null;
    this._styles = { ...DEFAULT_STYLES(), ...data.styles, colors: { ...DEFAULT_COLORS, ...data.styles?.colors } };
    if (!this._activeVocId && this._vocs.length) {
      this._activeVocId = this._vocs[0].id;
    }
    this._render();
  },
  /**
   * Load a catalog example. Editorial — no worksheet is provisioned.
   * @param { meta: object, data: object } payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = (this._vocs?.length || 0) > 0;
    if (hasContent && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    this.setState(payload.data);
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },


  // ─── Help ───────────────────────────────────────────────────

  help: () => import('./voc-ctx-tree-help.js'),

  // ─── Rendering ──────────────────────────────────────────────

  _render() {
    // Clean up previous doc click handler
    if (this._docClickHandler) {
      document.removeEventListener('click', this._docClickHandler);
      this._docClickHandler = null;
    }

    const t = (key, params) => this._context.i18n.t(`modules.voc-ctx-tree.${key}`, params);

    const activeVoc = this._vocs.find(v => v.id === this._activeVocId);
    const hasData = this._vocs.length > 0;

    this._container.innerHTML = `
      <div class="module-container vct">
       <div class="dmike-split" style="flex:1;min-height:0">
        <!-- Left: VoC list -->
        <div class="vct__sidebar dmike-split__input">
          <div class="vct__sidebar-header">
            <span class="vct__sidebar-title">${t('name')}</span>
            <div class="vct__sidebar-header-right">
              <span class="vct__counter">${this._vocs.length}</span>
              <div class="dmike-chart-dropdown vct__export-wrap"${hasData ? '' : ' style="display:none"'}>
                <button class="vct__add-btn vct__export-btn" type="button" title="Export">${ICONS.download}</button>
                <div class="dmike-chart-dropdown-menu">
                  <button class="dmike-chart-dropdown-item" data-export="png">${ICONS.png} PNG</button>
                  <button class="dmike-chart-dropdown-item" data-export="svg">${ICONS.svg} SVG</button>
                  <button class="dmike-chart-dropdown-item" data-export="csv">${ICONS.csv} CSV</button>
                  <button class="dmike-chart-dropdown-item" data-export="xlsx">${ICONS.xlsx} Excel</button>
                </div>
              </div>
              <button class="vct__add-btn vct__add-voc-btn" type="button" title="${t('addVoc')}">+</button>
            </div>
          </div>
          <div class="vct__sidebar-body">
            ${this._vocs.length === 0
              ? `<div class="vct__empty"><p class="vct__empty-text">${t('noVocs')}</p></div>`
              : this._vocs.map(v => this._cardHtml(v, t)).join('')}
          </div>
          <div class="vct__settings-panel" data-ref="settingsPanel"></div>
        </div>

        <!-- Right: Tree -->
        <div class="vct__main dmike-split__output">
          <div class="vct__tree-area">
            ${activeVoc ? this._treeHtml(activeVoc, t) : this._emptyTreeHtml(t)}
          </div>
        </div>
       </div>
      </div>
    `;

    this._bindEvents(t);
    this._buildSettingsPanel(t);
    this._applyStyles();
  },

  // ─── Card HTML ──────────────────────────────────────────────

  _cardHtml(voc, t) {
    const totalReqs = voc.needs.reduce((s, n) =>
      s + n.drivers.reduce((s2, d) => s2 + d.requirements.length, 0), 0);
    const isActive = voc.id === this._activeVocId;

    return `
      <div class="vct__card${isActive ? ' vct__card--active' : ''}" data-voc-id="${voc.id}">
        <div class="vct__card-text">${this._esc(voc.text)}</div>
        <div class="vct__card-meta">
          <span class="vct__card-count">${voc.needs.length} ${t('needCount')} · ${totalReqs} Req.</span>
          <div class="vct__card-actions">
            <button class="btn btn--icon-sm vct__card-action-btn vct__edit-voc-btn" data-voc-id="${voc.id}" title="${this._context.i18n.t('common.edit')}">&#9998;</button>
            <button class="btn btn--icon-sm vct__card-action-btn vct__card-action-btn--del vct__del-voc-btn" data-voc-id="${voc.id}" title="${this._context.i18n.t('common.delete')}">&#128465;</button>
          </div>
        </div>
      </div>
    `;
  },

  _emptyTreeHtml() {
    return '';
  },

  // ─── Tree HTML ──────────────────────────────────────────────

  _treeHtml(voc, t) {
    let html = '<div class="vct__tree">';

    // VoC root node
    html += `
      <div class="vct__node vct__node--voc" style="max-width:320px;">
        <div class="vct__node-text">
          <div class="vct__node-badge">VOC</div>
          <div>\u201E${this._esc(voc.text)}\u201C</div>
          ${voc.source ? `<div class="vct__node-source">${t('source')}: ${this._esc(voc.source)}</div>` : ''}
        </div>
        <div class="vct__node-actions">
          <button class="btn btn--icon-sm vct__node-btn vct__add-need-btn" data-voc-id="${voc.id}" title="${t('addNeed')}">+</button>
        </div>
      </div>
    `;

    // Needs
    if (voc.needs.length) {
      html += `<div class="vct__children vct__children--voc">`;
      voc.needs.forEach(need => {
        html += this._needHtml(voc.id, need, t);
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  },

  _needHtml(vocId, need, t) {
    let html = `
      <div class="vct__node vct__node--need" data-drag-type="need" data-voc-id="${vocId}" data-need-id="${need.id}">
        <div class="vct__node-text">
          <div class="vct__node-badge">${t('badgeNeed')}</div>
          <div>${this._esc(need.text)}</div>
        </div>
        <div class="vct__node-actions">
          <button class="btn btn--icon-sm vct__node-btn vct__add-ctx-btn" data-voc-id="${vocId}" data-need-id="${need.id}" title="${t('addDriver')}">+</button>
          <button class="btn btn--icon-sm vct__node-btn vct__edit-need-btn" data-voc-id="${vocId}" data-need-id="${need.id}" title="${this._context.i18n.t('common.edit')}">&#9998;</button>
          <button class="btn btn--icon-sm vct__node-btn vct__node-btn--del vct__del-need-btn" data-voc-id="${vocId}" data-need-id="${need.id}" title="${this._context.i18n.t('common.delete')}">&times;</button>
        </div>
      </div>
    `;

    if (need.drivers.length) {
      html += `<div class="vct__children vct__children--need">`;
      need.drivers.forEach(drv => {
        html += this._driverHtml(vocId, need.id, drv, t);
      });
      html += '</div>';
    }

    return html;
  },

  _driverHtml(vocId, needId, drv, t) {
    const typeLabel = drv.type.toUpperCase();
    let html = `
      <div class="vct__node vct__node--${drv.type}" data-drag-type="driver" data-voc-id="${vocId}" data-need-id="${needId}" data-drv-id="${drv.id}">
        <div class="vct__node-text">
          <div class="vct__node-badge">${typeLabel}</div>
          <div>${this._esc(drv.text)}</div>
        </div>
        <div class="vct__node-actions">
          <button class="btn btn--icon-sm vct__node-btn vct__add-req-btn" data-voc-id="${vocId}" data-need-id="${needId}" data-drv-id="${drv.id}" title="${t('addReq')}">+</button>
          <button class="btn btn--icon-sm vct__node-btn vct__edit-ctx-btn" data-voc-id="${vocId}" data-need-id="${needId}" data-drv-id="${drv.id}" title="${this._context.i18n.t('common.edit')}">&#9998;</button>
          <button class="btn btn--icon-sm vct__node-btn vct__node-btn--del vct__del-ctx-btn" data-voc-id="${vocId}" data-need-id="${needId}" data-drv-id="${drv.id}" title="${this._context.i18n.t('common.delete')}">&times;</button>
        </div>
      </div>
    `;

    if (drv.requirements.length) {
      html += `<div class="vct__children vct__children--${drv.type}">`;
      drv.requirements.forEach(req => {
        html += this._reqHtml(vocId, needId, drv.id, req, t);
      });
      html += '</div>';
    }

    return html;
  },

  _reqHtml(vocId, needId, drvId, req, t) {
    return `
      <div class="vct__node vct__node--req" data-drag-type="req" data-voc-id="${vocId}" data-need-id="${needId}" data-drv-id="${drvId}" data-req-id="${req.id}">
        <div class="vct__node-text">
          <div class="vct__node-badge">${t('badgeReq')}</div>
          <div>${this._esc(req.text)}</div>
          ${req.target ? `<div class="vct__req-target">${t('target')}: ${this._esc(req.target)}</div>` : ''}
          ${req.measure ? `<div class="vct__req-measure">${t('measurement')}: ${this._esc(req.measure)}</div>` : ''}
        </div>
        <div class="vct__node-actions">
          <button class="btn btn--icon-sm vct__node-btn vct__edit-req-btn" data-voc-id="${vocId}" data-need-id="${needId}" data-drv-id="${drvId}" data-req-id="${req.id}" title="${this._context.i18n.t('common.edit')}">&#9998;</button>
          <button class="btn btn--icon-sm vct__node-btn vct__node-btn--del vct__del-req-btn" data-voc-id="${vocId}" data-need-id="${needId}" data-drv-id="${drvId}" data-req-id="${req.id}" title="${this._context.i18n.t('common.delete')}">&times;</button>
        </div>
      </div>
    `;
  },

  // ─── Event Binding ──────────────────────────────────────────

  _bindEvents(t) {
    const el = this._container;

    // ── Export dropdown (fixed positioning to escape overflow:hidden) ──
    const exportWrap = el.querySelector('.vct__export-wrap');
    if (exportWrap) {
      const exportBtn = exportWrap.querySelector('.vct__export-btn');
      const menu = exportWrap.querySelector('.dmike-chart-dropdown-menu');

      const openMenu = () => {
        const rect = exportBtn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (rect.bottom + 4) + 'px';
        menu.style.left = rect.left + 'px';
        menu.style.right = 'auto';
        menu.classList.add('open');
      };
      const closeMenu = () => menu.classList.remove('open');

      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.contains('open') ? closeMenu() : openMenu();
      });
      exportWrap.querySelectorAll('[data-export]').forEach(btn => {
        btn.addEventListener('click', () => {
          closeMenu();
          const fmt = btn.dataset.export;
          if (fmt === 'csv')  this._exportCSV(t);
          if (fmt === 'xlsx') this._exportXLSX(t);
          if (fmt === 'png')  this._exportPNG();
          if (fmt === 'svg')  this._exportSVG();
        });
      });
      // Close dropdown on outside click
      this._docClickHandler = (e) => {
        if (!exportWrap.contains(e.target)) closeMenu();
      };
      document.addEventListener('click', this._docClickHandler);
    }

    // Select VoC card
    el.querySelectorAll('.vct__card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.vct__card-action-btn')) return;
        this._activeVocId = card.dataset.vocId;
        this._save();
        this._render();
      });
    });

    // Add VoC
    el.querySelector('.vct__add-voc-btn')?.addEventListener('click', () => {
      this._openVocModal(null, t);
    });

    // Edit VoC
    el.querySelectorAll('.vct__edit-voc-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const voc = this._vocs.find(v => v.id === btn.dataset.vocId);
        if (voc) this._openVocModal(voc, t);
      });
    });

    // Delete VoC
    el.querySelectorAll('.vct__del-voc-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const voc = this._vocs.find(v => v.id === btn.dataset.vocId);
        if (!voc) return;
        const confirmed = await this._context.confirmPopout(
          t('deleteVocConfirm'),
          { danger: true }
        );
        if (!confirmed) return;
        this._vocs = this._vocs.filter(v => v.id !== voc.id);
        if (this._activeVocId === voc.id) {
          this._activeVocId = this._vocs.length ? this._vocs[0].id : null;
        }
        this._save();
        this._render();
      });
    });

    // Add Need
    el.querySelectorAll('.vct__add-need-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._openNeedModal(btn.dataset.vocId, null, t);
      });
    });

    // Edit Need
    el.querySelectorAll('.vct__edit-need-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const voc = this._vocs.find(v => v.id === btn.dataset.vocId);
        const need = voc?.needs.find(n => n.id === btn.dataset.needId);
        if (need) this._openNeedModal(btn.dataset.vocId, need, t);
      });
    });

    // Delete Need
    el.querySelectorAll('.vct__del-need-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const voc = this._vocs.find(v => v.id === btn.dataset.vocId);
        if (!voc) return;
        voc.needs = voc.needs.filter(n => n.id !== btn.dataset.needId);
        this._save();
        this._render();
      });
    });

    // Add CTx Driver
    el.querySelectorAll('.vct__add-ctx-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._openCtxModal(btn.dataset.vocId, btn.dataset.needId, null, t);
      });
    });

    // Edit CTx Driver
    el.querySelectorAll('.vct__edit-ctx-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const voc = this._vocs.find(v => v.id === btn.dataset.vocId);
        const need = voc?.needs.find(n => n.id === btn.dataset.needId);
        const drv = need?.drivers.find(d => d.id === btn.dataset.drvId);
        if (drv) this._openCtxModal(btn.dataset.vocId, btn.dataset.needId, drv, t);
      });
    });

    // Delete CTx Driver
    el.querySelectorAll('.vct__del-ctx-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const voc = this._vocs.find(v => v.id === btn.dataset.vocId);
        const need = voc?.needs.find(n => n.id === btn.dataset.needId);
        if (!need) return;
        need.drivers = need.drivers.filter(d => d.id !== btn.dataset.drvId);
        this._save();
        this._render();
      });
    });

    // Add Requirement
    el.querySelectorAll('.vct__add-req-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._openReqModal(btn.dataset.vocId, btn.dataset.needId, btn.dataset.drvId, null, t);
      });
    });

    // Edit Requirement
    el.querySelectorAll('.vct__edit-req-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const voc = this._vocs.find(v => v.id === btn.dataset.vocId);
        const need = voc?.needs.find(n => n.id === btn.dataset.needId);
        const drv = need?.drivers.find(d => d.id === btn.dataset.drvId);
        const req = drv?.requirements.find(r => r.id === btn.dataset.reqId);
        if (req) this._openReqModal(btn.dataset.vocId, btn.dataset.needId, btn.dataset.drvId, req, t);
      });
    });

    // Delete Requirement
    el.querySelectorAll('.vct__del-req-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const voc = this._vocs.find(v => v.id === btn.dataset.vocId);
        const need = voc?.needs.find(n => n.id === btn.dataset.needId);
        const drv = need?.drivers.find(d => d.id === btn.dataset.drvId);
        if (!drv) return;
        drv.requirements = drv.requirements.filter(r => r.id !== btn.dataset.reqId);
        this._save();
        this._render();
      });
    });

    // ── Drag-and-drop reordering via badge handle ──
    this._bindDragEvents(el);
  },

  _bindDragEvents(el) {
    const treeArea = el.querySelector('.vct__tree-area');
    if (!treeArea) return;

    let dragState = null;

    treeArea.querySelectorAll('.vct__node[data-drag-type] .vct__node-badge').forEach(badge => {
      badge.addEventListener('mousedown', () => {
        const node = badge.closest('.vct__node[data-drag-type]');
        if (node) node.setAttribute('draggable', 'true');
      });
    });

    if (this._mouseUpHandler) {
      document.removeEventListener('mouseup', this._mouseUpHandler);
    }
    this._mouseUpHandler = () => {
      treeArea.querySelectorAll('.vct__node[draggable]').forEach(n =>
        n.removeAttribute('draggable')
      );
    };
    document.addEventListener('mouseup', this._mouseUpHandler);

    treeArea.addEventListener('dragstart', (e) => {
      const node = e.target.closest('.vct__node[data-drag-type]');
      if (!node) return;
      dragState = { ...node.dataset };
      node.classList.add('vct__node--dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    treeArea.addEventListener('dragover', (e) => {
      if (!dragState) return;
      const target = e.target.closest('.vct__node[data-drag-type]');
      if (!target || target.dataset.dragType !== dragState.dragType) return;
      if (!this._areDragSiblings(dragState, target.dataset)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      treeArea.querySelectorAll('.vct__node--drag-over').forEach(n =>
        n.classList.remove('vct__node--drag-over')
      );
      target.classList.add('vct__node--drag-over');
    });

    treeArea.addEventListener('dragleave', (e) => {
      const node = e.target.closest('.vct__node--drag-over');
      if (node && !node.contains(e.relatedTarget)) {
        node.classList.remove('vct__node--drag-over');
      }
    });

    treeArea.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragState) return;
      const target = e.target.closest('.vct__node[data-drag-type]');
      if (!target || target.dataset.dragType !== dragState.dragType) return;
      if (!this._areDragSiblings(dragState, target.dataset)) return;

      this._reorderNodes(dragState, target.dataset);
      dragState = null;
      this._save();
      this._render();
    });

    treeArea.addEventListener('dragend', () => {
      dragState = null;
      treeArea.querySelectorAll('.vct__node--dragging').forEach(n =>
        n.classList.remove('vct__node--dragging')
      );
      treeArea.querySelectorAll('.vct__node--drag-over').forEach(n =>
        n.classList.remove('vct__node--drag-over')
      );
    });
  },

  _areDragSiblings(a, b) {
    switch (a.dragType) {
      case 'need':   return a.vocId === b.vocId;
      case 'driver': return a.vocId === b.vocId && a.needId === b.needId;
      case 'req':    return a.vocId === b.vocId && a.needId === b.needId && a.drvId === b.drvId;
    }
    return false;
  },

  _reorderNodes(source, target) {
    let arr, fromId, toId;

    switch (source.dragType) {
      case 'need': {
        const voc = this._vocs.find(v => v.id === source.vocId);
        if (!voc) return;
        arr = voc.needs;
        fromId = source.needId;
        toId = target.needId;
        break;
      }
      case 'driver': {
        const voc = this._vocs.find(v => v.id === source.vocId);
        const need = voc?.needs.find(n => n.id === source.needId);
        if (!need) return;
        arr = need.drivers;
        fromId = source.drvId;
        toId = target.drvId;
        break;
      }
      case 'req': {
        const voc = this._vocs.find(v => v.id === source.vocId);
        const need = voc?.needs.find(n => n.id === source.needId);
        const drv = need?.drivers.find(d => d.id === source.drvId);
        if (!drv) return;
        arr = drv.requirements;
        fromId = source.reqId;
        toId = target.reqId;
        break;
      }
    }

    if (!arr || fromId === toId) return;
    const fromIdx = arr.findIndex(item => item.id === fromId);
    const toIdx = arr.findIndex(item => item.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
  },

  // ─── Export ─────────────────────────────────────────────────

  /**
   * Flatten all VoCs into tabular rows.
   * @returns {{ headers: string[], rows: any[][] }}
   */
  _getExportRows() {
    const t = (key) => this._context.i18n.t(`modules.voc-ctx-tree.${key}`);
    const headers = [
      t('legendVoc'), t('vocSource'), t('legendNeed'),
      t('driverType'), 'CTx', t('legendReq'), t('target'), t('measurement'),
    ];
    const rows = [];
    for (const voc of this._vocs) {
      if (voc.needs.length === 0) {
        rows.push([voc.text, voc.source || '', '', '', '', '', '', '']);
        continue;
      }
      for (const need of voc.needs) {
        if (need.drivers.length === 0) {
          rows.push([voc.text, voc.source || '', need.text, '', '', '', '', '']);
          continue;
        }
        for (const drv of need.drivers) {
          if (drv.requirements.length === 0) {
            rows.push([voc.text, voc.source || '', need.text, drv.type.toUpperCase(), drv.text, '', '', '']);
            continue;
          }
          for (const req of drv.requirements) {
            rows.push([
              voc.text, voc.source || '', need.text,
              drv.type.toUpperCase(), drv.text,
              req.text, req.target || '', req.measure || '',
            ]);
          }
        }
      }
    }
    return { headers, rows };
  },

  /** Export all VoC data as CSV (semicolon-delimited, UTF-8 BOM). */
  _exportCSV() {
    const { headers, rows } = this._getExportRows();
    if (rows.length === 0) return;

    const esc = (v) => {
      const s = String(v ?? '');
      return (s.includes(';') || s.includes('"') || s.includes('\n'))
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    };

    const lines = [headers.map(esc).join(';')];
    for (const row of rows) lines.push(row.map(esc).join(';'));

    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    this._downloadBlob(blob, 'voc-ctx-tree.csv');
  },

  /** Export all VoC data as XLSX via SheetJS. */
  async _exportXLSX() {
    const { headers, rows } = this._getExportRows();
    if (rows.length === 0) return;

    try {
      await _ensureXLSX();
    } catch {
      this._context.notify?.('XLSX library not loaded');
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'VoC-CTx');
    XLSX.writeFile(wb, 'voc-ctx-tree.xlsx');
  },

  /** Export the active VoC tree as PNG (2× resolution). */
  _exportPNG() {
    const svg = this._buildTreeSVG();
    if (svg) exportSvgAsPNG(svg, 'voc-ctx-tree.png');
  },

  /** Export the active VoC tree as SVG file. */
  _exportSVG() {
    const svg = this._buildTreeSVG();
    if (svg) exportSvgAsFile(svg, 'voc-ctx-tree.svg');
  },

  /** Trigger a file download from a Blob. */
  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ─── SVG Tree Builder (for PNG/SVG export) ──────────────────

  /**
   * Build an SVG DOM element representing the active VoC tree.
   * Uses a top-down indented layout matching the on-screen tree.
   * @returns {SVGElement|null}
   */
  _buildTreeSVG() {
    const voc = this._vocs.find(v => v.id === this._activeVocId);
    if (!voc) return null;

    const t = (key) => this._context.i18n.t(`modules.voc-ctx-tree.${key}`);
    const NS = 'http://www.w3.org/2000/svg';
    const PAD = 20;
    const INDENT = 36;
    const NODE_W = 280;
    const NODE_PAD_X = 10;
    const NODE_PAD_Y = 6;
    const LINE_H = 16;        // line height for text
    const BADGE_H = 14;
    const GAP_Y = 8;
    const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

    // Collect flat node list with positions
    const nodes = [];
    let cursorY = PAD;

    const addNode = (type, badge, lines, level) => {
      const textLines = this._wrapText(lines[0] || '', NODE_W - 2 * NODE_PAD_X - 10, 7);
      const subLines = lines.slice(1); // extra lines (source, target, measure)
      const totalTextLines = textLines.length + subLines.length;
      const h = NODE_PAD_Y * 2 + BADGE_H + 4 + totalTextLines * LINE_H;
      const x = PAD + level * INDENT;
      nodes.push({ type, badge, textLines, subLines, x, y: cursorY, w: NODE_W, h, level });
      cursorY += h + GAP_Y;
    };

    // VoC root
    const vocLines = ['\u201E' + voc.text + '\u201C'];
    if (voc.source) vocLines.push(t('source') + ': ' + voc.source);
    addNode('voc', 'VOC', vocLines, 0);

    for (const need of voc.needs) {
      addNode('need', t('badgeNeed'), [need.text], 1);

      for (const drv of need.drivers) {
        addNode(drv.type, drv.type.toUpperCase(), [drv.text], 2);

        for (const req of drv.requirements) {
          const reqLines = [req.text];
          if (req.target) reqLines.push(t('target') + ': ' + req.target);
          if (req.measure) reqLines.push(t('measurement') + ': ' + req.measure);
          addNode('req', t('badgeReq'), reqLines, 3);
        }
      }
    }

    const totalW = PAD * 2 + 3 * INDENT + NODE_W;
    const totalH = cursorY + PAD - GAP_Y;

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('xmlns', NS);
    svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
    svg.setAttribute('width', totalW);
    svg.setAttribute('height', totalH);

    // Build color lookup from styles
    const svgColors = {};
    for (const [key, rgba] of Object.entries(this._styles.colors)) {
      const c = parseRGBA(rgba);
      svgColors[key] = {
        stroke: rgbaStr({ ...c, a: 1 }),
        fill: rgbaStr({ ...c, a: 0.08 }),
      };
    }

    // Draw connector lines
    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];
      for (let j = i - 1; j >= 0; j--) {
        if (nodes[j].level === node.level - 1) {
          const parent = nodes[j];
          const colors = svgColors[parent.type] || svgColors.voc;
          const lineX = node.x - INDENT / 2;
          const lineY1 = parent.y + parent.h;
          const lineY2 = node.y + node.h / 2;

          const path = document.createElementNS(NS, 'path');
          path.setAttribute('d', `M ${lineX} ${lineY1} L ${lineX} ${lineY2} L ${node.x} ${lineY2}`);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', colors.stroke);
          path.setAttribute('stroke-width', '1.5');
          path.setAttribute('stroke-dasharray', '4 3');
          svg.appendChild(path);
          break;
        }
      }
    }

    // Draw nodes
    for (const node of nodes) {
      const colors = svgColors[node.type] || svgColors.voc;

      // Background rect
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', node.x);
      rect.setAttribute('y', node.y);
      rect.setAttribute('width', node.w);
      rect.setAttribute('height', node.h);
      rect.setAttribute('rx', '6');
      rect.setAttribute('fill', colors.fill);
      rect.setAttribute('stroke', colors.stroke);
      rect.setAttribute('stroke-width', String(this._styles.borderWidth));
      svg.appendChild(rect);

      let ty = node.y + NODE_PAD_Y;

      // Badge
      const badgeW = node.badge.length * 6.5 + 8;
      const badgeRect = document.createElementNS(NS, 'rect');
      badgeRect.setAttribute('x', node.x + NODE_PAD_X);
      badgeRect.setAttribute('y', ty);
      badgeRect.setAttribute('width', badgeW);
      badgeRect.setAttribute('height', BADGE_H);
      badgeRect.setAttribute('rx', '3');
      badgeRect.setAttribute('fill', colors.stroke);
      svg.appendChild(badgeRect);

      const badgeText = document.createElementNS(NS, 'text');
      badgeText.setAttribute('x', node.x + NODE_PAD_X + badgeW / 2);
      badgeText.setAttribute('y', ty + BADGE_H - 3);
      badgeText.setAttribute('text-anchor', 'middle');
      badgeText.setAttribute('font-family', FONT);
      badgeText.setAttribute('font-size', '9');
      badgeText.setAttribute('font-weight', '600');
      badgeText.setAttribute('letter-spacing', '0.5');
      badgeText.setAttribute('fill', '#fff');
      badgeText.textContent = node.badge;
      svg.appendChild(badgeText);

      ty += BADGE_H + 4;

      // Main text lines
      for (const line of node.textLines) {
        const txt = document.createElementNS(NS, 'text');
        txt.setAttribute('x', node.x + NODE_PAD_X);
        txt.setAttribute('y', ty + LINE_H - 4);
        txt.setAttribute('font-family', FONT);
        txt.setAttribute('font-size', '12');
        txt.setAttribute('fill', '#1d1d1f');
        txt.textContent = line;
        svg.appendChild(txt);
        ty += LINE_H;
      }

      // Sub-lines (source, target, measure) — smaller, muted
      for (const sub of node.subLines) {
        const txt = document.createElementNS(NS, 'text');
        txt.setAttribute('x', node.x + NODE_PAD_X);
        txt.setAttribute('y', ty + LINE_H - 4);
        txt.setAttribute('font-family', FONT);
        txt.setAttribute('font-size', '10');
        txt.setAttribute('fill', '#86868b');
        txt.textContent = sub;
        svg.appendChild(txt);
        ty += LINE_H;
      }
    }

    return svg;
  },

  /**
   * Simple word-wrap for SVG text (no DOM measurement — uses char estimate).
   * @param {string} text
   * @param {number} maxWidth - available pixel width
   * @param {number} charWidth - estimated average char width in px
   * @returns {string[]}
   */
  _wrapText(text, maxWidth, charWidth) {
    const maxChars = Math.floor(maxWidth / charWidth);
    if (text.length <= maxChars) return [text];
    const words = text.split(/\s+/);
    const lines = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? cur + ' ' + word : word;
      if (test.length > maxChars && cur) {
        lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [text];
  },

  // ─── Popouts ────────────────────────────────────────────────

  /**
   * Open a form inside a draggable / resizable popout window
   * (dmike-chart-popout structure, form variant). Mirrors the
   * Modal.form() API: confirmLabel, cancelLabel, onMount, onConfirm
   * (return false to keep open).
   * @param {string} title
   * @param {string} formHtml
   * @param {object} [opts]
   * @returns {Promise<boolean>} resolves true if confirmed, false otherwise
   */
  _openFormPopout(title, formHtml, opts = {}) {
    return new Promise((resolve) => {
      const i18n = this._context.i18n;
      const confirmLabel = opts.confirmLabel ?? i18n.t('common.save');
      const cancelLabel = opts.cancelLabel ?? i18n.t('common.cancel');

      const overlay = document.createElement('div');
      overlay.className = 'dmike-chart-popout-overlay';

      const win = document.createElement('div');
      win.className = 'dmike-chart-popout dmike-chart-popout--form';

      const titleBar = document.createElement('div');
      titleBar.className = 'dmike-chart-popout-titlebar';
      const titleText = document.createElement('span');
      titleText.textContent = title;
      const closeBtn = document.createElement('button');
      closeBtn.className = 'dmike-chart-popout-close';
      closeBtn.setAttribute('aria-label', i18n.t('common.close'));
      closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
      titleBar.append(titleText, closeBtn);

      const body = document.createElement('div');
      body.className = 'dmike-chart-popout-body vct__popout-body';
      body.innerHTML = formHtml;

      const footer = document.createElement('div');
      footer.className = 'vct__popout-footer';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn--secondary';
      cancelBtn.textContent = cancelLabel;
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn btn--primary';
      confirmBtn.textContent = confirmLabel;
      footer.append(cancelBtn, confirmBtn);

      win.append(titleBar, body, footer);
      overlay.appendChild(win);
      document.body.appendChild(overlay);

      let resolved = false;
      const close = (result) => {
        if (resolved) return;
        resolved = true;
        window.removeEventListener('mousemove', onDragMove);
        window.removeEventListener('mouseup', onDragEnd);
        window.removeEventListener('keydown', onKeyDown);
        overlay.remove();
        resolve(result);
      };

      // Drag via title bar
      let dragX = 0, dragY = 0, isDragging = false;
      const onDragStart = (e) => {
        if (closeBtn.contains(e.target)) return;
        isDragging = true;
        dragX = e.clientX - win.offsetLeft;
        dragY = e.clientY - win.offsetTop;
        win.style.transition = 'none';
      };
      const onDragMove = (e) => {
        if (!isDragging) return;
        win.style.left = (e.clientX - dragX) + 'px';
        win.style.top = (e.clientY - dragY) + 'px';
      };
      const onDragEnd = () => { isDragging = false; win.style.transition = ''; };
      titleBar.addEventListener('mousedown', onDragStart);
      window.addEventListener('mousemove', onDragMove);
      window.addEventListener('mouseup', onDragEnd);

      const onKeyDown = (e) => {
        if (e.key === 'Escape') close(false);
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          confirmBtn.click();
        }
      };
      window.addEventListener('keydown', onKeyDown);

      closeBtn.addEventListener('click', () => close(false));
      cancelBtn.addEventListener('click', () => close(false));
      confirmBtn.addEventListener('click', () => {
        if (opts.onConfirm) {
          const result = opts.onConfirm(body);
          if (result === false) return;
        }
        close(true);
      });
      // Only close on a true overlay click — i.e. both mousedown and mouseup
      // on the overlay itself. This prevents text-selection drags that start
      // inside the popout and end on the overlay from closing it.
      let mouseDownOnOverlay = false;
      overlay.addEventListener('mousedown', (e) => {
        mouseDownOnOverlay = (e.target === overlay);
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay && mouseDownOnOverlay) close(false);
      });

      if (opts.onMount) opts.onMount(body);
    });
  },

  async _openVocModal(existing, t) {
    const isEdit = !!existing;
    const voc = existing || { text: '', source: '' };

    const formHtml = `
      <div>
        <div class="vct__form-group">
          <label>${t('vocText')} *</label>
          <textarea class="field" data-field="text" placeholder="${t('vocPlaceholder')}" maxlength="1000">${this._esc(voc.text)}</textarea>
        </div>
        <div class="vct__form-group">
          <label>${t('vocSource')}</label>
          <input type="text" class="field" data-field="source" placeholder="${t('vocSourcePlaceholder')}" maxlength="200" value="${this._esc(voc.source || '')}">
        </div>
      </div>
    `;

    await this._openFormPopout(
      isEdit ? t('editVoc') : t('addVoc'),
      formHtml,
      {
        onMount: (formEl) => {
          formEl.querySelector('[data-field="text"]')?.focus();
        },
        onConfirm: (formEl) => {
          const text = formEl.querySelector('[data-field="text"]').value.trim();
          if (!text) {
            formEl.querySelector('[data-field="text"]').focus();
            return false;
          }
          const source = formEl.querySelector('[data-field="source"]').value.trim();

          if (existing) {
            existing.text = text;
            existing.source = source;
          } else {
            const newVoc = { id: crypto.randomUUID(), text, source, needs: [] };
            this._vocs.push(newVoc);
            this._activeVocId = newVoc.id;
          }
          this._save();
          this._render();
          return true;
        },
      }
    );
  },

  async _openNeedModal(vocId, existing, t) {
    const isEdit = !!existing;
    const need = existing || { text: '' };

    const formHtml = `
      <div>
        <div class="vct__form-group">
          <label>${t('needText')} *</label>
          <textarea class="field" data-field="text" placeholder="${t('needPlaceholder')}" maxlength="500">${this._esc(need.text)}</textarea>
        </div>
      </div>
    `;

    await this._openFormPopout(
      isEdit ? t('editNeed') : t('addNeed'),
      formHtml,
      {
        onMount: (formEl) => {
          formEl.querySelector('[data-field="text"]')?.focus();
        },
        onConfirm: (formEl) => {
          const text = formEl.querySelector('[data-field="text"]').value.trim();
          if (!text) {
            formEl.querySelector('[data-field="text"]').focus();
            return false;
          }

          const voc = this._vocs.find(v => v.id === vocId);
          if (!voc) return false;

          if (existing) {
            existing.text = text;
          } else {
            voc.needs.push({ id: crypto.randomUUID(), text, drivers: [] });
          }
          this._save();
          this._render();
          return true;
        },
      }
    );
  },

  async _openCtxModal(vocId, needId, existing, t) {
    const isEdit = !!existing;
    const drv = existing || { text: '', type: 'ctq' };

    const formHtml = `
      <div>
        <div class="vct__form-group">
          <label>${t('driverType')}</label>
          <div class="vct__type-selector" data-ref="typeSel">
            <button type="button" class="vct__type-option${drv.type === 'ctq' ? ' vct__type-option--ctq' : ''}" data-type="ctq">
              <span class="vct__type-label">CTQ</span>
              <span class="vct__type-desc">Quality</span>
            </button>
            <button type="button" class="vct__type-option${drv.type === 'ctd' ? ' vct__type-option--ctd' : ''}" data-type="ctd">
              <span class="vct__type-label">CTD</span>
              <span class="vct__type-desc">Delivery</span>
            </button>
            <button type="button" class="vct__type-option${drv.type === 'ctc' ? ' vct__type-option--ctc' : ''}" data-type="ctc">
              <span class="vct__type-label">CTC</span>
              <span class="vct__type-desc">Cost</span>
            </button>
          </div>
        </div>
        <div class="vct__form-group">
          <label>${t('driverText')} *</label>
          <textarea class="field" data-field="text" placeholder="${t('driverPlaceholder')}" maxlength="500">${this._esc(drv.text)}</textarea>
        </div>
      </div>
    `;

    await this._openFormPopout(
      isEdit ? t('editDriver') : t('addDriver'),
      formHtml,
      {
        onMount: (formEl) => {
          // Wire up type selector
          const btns = formEl.querySelectorAll('.vct__type-option');
          btns.forEach(btn => {
            btn.addEventListener('click', () => {
              btns.forEach(b => b.className = 'vct__type-option');
              btn.classList.add(`vct__type-option--${btn.dataset.type}`);
            });
          });
          formEl.querySelector('[data-field="text"]')?.focus();
        },
        onConfirm: (formEl) => {
          const text = formEl.querySelector('[data-field="text"]').value.trim();
          if (!text) {
            formEl.querySelector('[data-field="text"]').focus();
            return false;
          }

          // Get selected type
          const selBtn = formEl.querySelector('.vct__type-option[class*="--ct"]');
          const type = selBtn ? selBtn.dataset.type : 'ctq';

          const voc = this._vocs.find(v => v.id === vocId);
          const need = voc?.needs.find(n => n.id === needId);
          if (!need) return false;

          if (existing) {
            existing.text = text;
            existing.type = type;
          } else {
            need.drivers.push({ id: crypto.randomUUID(), text, type, requirements: [] });
          }
          this._save();
          this._render();
          return true;
        },
      }
    );
  },

  async _openReqModal(vocId, needId, drvId, existing, t) {
    const isEdit = !!existing;
    const req = existing || { text: '', target: '', measure: '' };

    const formHtml = `
      <div>
        <div class="vct__form-group">
          <label>${t('reqText')} *</label>
          <textarea class="field" data-field="text" placeholder="${t('reqPlaceholder')}" maxlength="500">${this._esc(req.text)}</textarea>
        </div>
        <div class="vct__form-group">
          <label>${t('reqTarget')}</label>
          <input type="text" class="field" data-field="target" placeholder="${t('reqTargetPlaceholder')}" maxlength="200" value="${this._esc(req.target || '')}">
        </div>
        <div class="vct__form-group">
          <label>${t('reqMeasure')}</label>
          <input type="text" class="field" data-field="measure" placeholder="${t('reqMeasurePlaceholder')}" maxlength="200" value="${this._esc(req.measure || '')}">
        </div>
      </div>
    `;

    await this._openFormPopout(
      isEdit ? t('editReq') : t('addReq'),
      formHtml,
      {
        onMount: (formEl) => {
          formEl.querySelector('[data-field="text"]')?.focus();
        },
        onConfirm: (formEl) => {
          const text = formEl.querySelector('[data-field="text"]').value.trim();
          if (!text) {
            formEl.querySelector('[data-field="text"]').focus();
            return false;
          }
          const target = formEl.querySelector('[data-field="target"]').value.trim();
          const measure = formEl.querySelector('[data-field="measure"]').value.trim();

          const voc = this._vocs.find(v => v.id === vocId);
          const need = voc?.needs.find(n => n.id === needId);
          const driver = need?.drivers.find(d => d.id === drvId);
          if (!driver) return false;

          if (existing) {
            existing.text = text;
            existing.target = target;
            existing.measure = measure;
          } else {
            driver.requirements.push({ id: crypto.randomUUID(), text, target, measure });
          }
          this._save();
          this._render();
          return true;
        },
      }
    );
  },

  // ─── Settings Panel ─────────────────────────────────────────

  /**
   * Build the settings panel (colors, border width, bg pattern) in the sidebar.
   * Uses chart-editor building blocks for consistent UI.
   */
  _buildSettingsPanel(t) {
    const panel = this._container.querySelector('[data-ref="settingsPanel"]');
    if (!panel) return;
    panel.innerHTML = '';

    const section = edSection(t('settings'));

    // ── Node color pairs ──
    const colorKeys = [
      { key: 'voc',  label: t('colorVoc'),  tip: t('colorVocTip') },
      { key: 'need', label: t('colorNeed') },
      { key: 'ctq',  label: t('colorCtq'),  tip: t('colorCtqTip') },
      { key: 'ctd',  label: t('colorCtd'),  tip: t('colorCtdTip') },
      { key: 'ctc',  label: t('colorCtc'),  tip: t('colorCtcTip') },
      { key: 'req',  label: t('colorReq') },
    ];

    for (const { key, label, tip } of colorKeys) {
      const { el, swatch } = edColorPair(label, this._styles.colors[key], (e) => {
        openColorPicker(e, this._styles.colors[key], (newColor) => {
          this._styles.colors[key] = newColor;
          swatch.style.background = newColor;
          this._applyStyles();
          this._save();
        });
      });
      if (tip) el.title = tip;
      section.appendChild(el);
    }

    // ── Border width ──
    section.appendChild(edRangeRow(t('borderWidth'), this._styles.borderWidth, (val) => {
      this._styles.borderWidth = val;
      this._applyStyles();
      this._save();
    }, 0, 4, 0.5));

    panel.appendChild(section);
  },

  /**
   * Apply current styles (colors, border width, pattern) to the tree container.
   * Sets CSS custom properties on the module container so all nodes pick them up.
   */
  _applyStyles() {
    const root = this._container.querySelector('.vct');
    if (!root) return;

    const s = this._styles;

    // Apply node colors as CSS custom properties
    const colorMap = {
      voc:  '--color-vct-voc',
      need: '--color-vct-need',
      ctq:  '--color-vct-ctq',
      ctd:  '--color-vct-ctd',
      ctc:  '--color-vct-ctc',
      req:  '--color-vct-req',
    };

    for (const [key, prop] of Object.entries(colorMap)) {
      const c = parseRGBA(s.colors[key]);
      root.style.setProperty(prop, rgbaStr({ ...c, a: 1 }));
      root.style.setProperty(`${prop}-bg`, rgbaStr({ ...c, a: 0.06 }));
      root.style.setProperty(`${prop}-border`, rgbaStr({ ...c, a: 0.20 }));
      root.style.setProperty(`${prop}-badge-bg`, rgbaStr({ ...c, a: 0.12 }));
      root.style.setProperty(`${prop}-line`, rgbaStr({ ...c, a: 0.25 }));
    }

    // Apply border width to all tree nodes
    const nodes = root.querySelectorAll('.vct__node');
    for (const node of nodes) {
      node.style.borderWidth = `${s.borderWidth}px`;
    }

  },

  // ─── Persistence ────────────────────────────────────────────

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      this.getState()
    );
  },

  // ─── Helpers ────────────────────────────────────────────────

  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};
