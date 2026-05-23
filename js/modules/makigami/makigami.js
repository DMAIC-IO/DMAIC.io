/**
 * DMAIC.io — Makigami Matrix Module (makigami.js)
 * Swim-lane process analysis with processing/waiting times and waste classification.
 * DMAIC phase: Analyze · DMADV: Analyze · 8D: Root cause.
 *
 * Roles × Steps swim-lane matrix on top, expandable step cards below,
 * KPI strip in between (Σ Processing, Σ Waiting, Lead Time, PCE).
 */

import { parseDuration, formatDuration, canonicalize } from './makigami-duration.js';
import {
  downloadFile, downloadBlob, ensureXLSX, createExportDropdown,
} from '../../core/export-utils.js';

const ICONS = {
  plus: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  x: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  chevronDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  chevronRight: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  settings: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  grip: '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1.3"/><circle cx="8" cy="2" r="1.3"/><circle cx="2" cy="7" r="1.3"/><circle cx="8" cy="7" r="1.3"/><circle cx="2" cy="12" r="1.3"/><circle cx="8" cy="12" r="1.3"/></svg>',
};

/**
 * Default Muda categories (TIMWOODS+S). Each carries an i18n `labelKey` and an
 * optional user-override `label`; renderers prefer `label` when set.
 */
function createDefaultMudaCategories() {
  return [
    { id: 'muda-transport',      code: 'T',  labelKey: 'muda.transport',      label: '', color: '#4a90e2' },
    { id: 'muda-inventory',      code: 'I',  labelKey: 'muda.inventory',      label: '', color: '#f5a623' },
    { id: 'muda-motion',         code: 'M',  labelKey: 'muda.motion',         label: '', color: '#9b59b6' },
    { id: 'muda-waiting',        code: 'W',  labelKey: 'muda.waiting',        label: '', color: '#d0021b' },
    { id: 'muda-overproduction', code: 'O',  labelKey: 'muda.overproduction', label: '', color: '#50e3c2' },
    { id: 'muda-overprocessing', code: 'O+', labelKey: 'muda.overprocessing', label: '', color: '#f8a01c' },
    { id: 'muda-defects',        code: 'D',  labelKey: 'muda.defects',        label: '', color: '#bd10e0' },
    { id: 'muda-skills',         code: 'S',  labelKey: 'muda.skills',         label: '', color: '#7ed321' },
  ];
}

/**
 * Default time units. `factorSeconds` controls conversion in the free-text parser.
 * Workday convention: 1 d = 8 h = 28800 s (office Makigami).
 */
function createDefaultTimeUnits() {
  return [
    { id: 'unit-s',   label: 's',   factorSeconds: 1     },
    { id: 'unit-min', label: 'min', factorSeconds: 60    },
    { id: 'unit-h',   label: 'h',   factorSeconds: 3600  },
    { id: 'unit-d',   label: 'd',   factorSeconds: 28800 },
  ];
}

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default {
  id: 'makigami',
  phase: 'analyze',
  icon: 'git-merge',
  i18nKey: 'modules.makigami',
  version: '1.0.0',

  /** @type {object} */
  _context: null,
  /** @type {HTMLElement} */
  _container: null,
  /** @type {string} */
  _title: '',
  /** @type {Array<{id:string,label:string}>} */
  _roles: [],
  /** @type {Array<{id:string,title:string,description:string,roleIds:string[],processTime:string,waitTime:string,mudaIds:string[],notes:string,expanded:boolean}>} */
  _steps: [],
  /** @type {Array<{id:string,code:string,labelKey?:string,label:string,color:string}>} */
  _mudaCategories: [],
  /** @type {Array<{id:string,label:string,factorSeconds:number}>} */
  _timeUnits: [],
  /** @type {boolean} */
  _settingsOpen: false,
  /** @type {string|null} */
  _draggedId: null,
  /** @type {'step'|'role'|null} */
  _draggedType: null,
  /** @type {(()=>void)|null} */
  _dragMouseUpHandler: null,
  /** @type {{ el: HTMLElement, destroy: function }|null} */
  _exportDropdown: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    this._resetState();

    const saved = context.stateManager.getModuleState?.(context.instanceId);
    if (saved) this._applyState(saved);

    this._render();
  },

  async destroy() {
    if (this._exportDropdown) this._exportDropdown.destroy();
    this._exportDropdown = null;
    if (this._dragMouseUpHandler) {
      document.removeEventListener('mouseup', this._dragMouseUpHandler);
      this._dragMouseUpHandler = null;
    }
    this._container.innerHTML = '';
  },

  onLanguageChange(_lang) {
    this._render();
  },

  onThemeChange(_theme) {
    // CSS custom properties handle theme switching.
  },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return JSON.parse(JSON.stringify({
      title: this._title,
      roles: this._roles,
      steps: this._steps,
      mudaCategories: this._mudaCategories,
      timeUnits: this._timeUnits,
      settingsOpen: this._settingsOpen,
    }));
  },

  setState(data) {
    this._resetState();
    if (data) this._applyState(data);
    this._render();
  },

  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = this._roles.length > 0 || this._steps.length > 0;
    if (hasContent && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    this.setState(payload.data);
    this._context.stateManager.setModuleState?.(this._context.instanceId, this.getState());

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  // ─── Help ───────────────────────────────────────────────────

  help: () => import('./makigami-help.js'),

  // ─── State helpers ──────────────────────────────────────────

  _resetState() {
    this._title = '';
    this._roles = [];
    this._steps = [];
    this._mudaCategories = createDefaultMudaCategories();
    this._timeUnits = createDefaultTimeUnits();
    this._settingsOpen = false;
    this._draggedId = null;
  },

  _applyState(data) {
    if (typeof data.title === 'string') this._title = data.title;
    if (Array.isArray(data.roles)) {
      this._roles = data.roles
        .filter(r => r && typeof r.id === 'string')
        .map(r => ({ id: r.id, label: String(r.label || '') }));
    }
    if (Array.isArray(data.steps)) {
      this._steps = data.steps
        .filter(s => s && typeof s.id === 'string')
        .map(s => ({
          id: s.id,
          title: String(s.title || ''),
          description: String(s.description || ''),
          roleIds: Array.isArray(s.roleIds) ? s.roleIds.filter(x => typeof x === 'string') : [],
          processTime: String(s.processTime || ''),
          waitTime: String(s.waitTime || ''),
          mudaIds: Array.isArray(s.mudaIds) ? s.mudaIds.filter(x => typeof x === 'string') : [],
          notes: String(s.notes || ''),
          expanded: typeof s.expanded === 'boolean' ? s.expanded : true,
        }));
    }
    if (Array.isArray(data.mudaCategories) && data.mudaCategories.length > 0) {
      this._mudaCategories = data.mudaCategories.map(m => ({
        id: String(m.id || uid('muda-')),
        code: String(m.code || ''),
        labelKey: m.labelKey ? String(m.labelKey) : undefined,
        label: String(m.label || ''),
        color: String(m.color || '#888888'),
      }));
    }
    if (Array.isArray(data.timeUnits) && data.timeUnits.length > 0) {
      this._timeUnits = data.timeUnits
        .filter(u => u && Number.isFinite(Number(u.factorSeconds)) && Number(u.factorSeconds) > 0)
        .map(u => ({
          id: String(u.id || uid('unit-')),
          label: String(u.label || ''),
          factorSeconds: Number(u.factorSeconds),
        }));
    }
    if (typeof data.settingsOpen === 'boolean') this._settingsOpen = data.settingsOpen;
  },

  _save() {
    this._context.stateManager.setModuleState?.(this._context.instanceId, this.getState());
  },

  _mudaLabel(cat) {
    if (cat.label) return cat.label;
    if (cat.labelKey) return this._context.i18n.t(`modules.makigami.${cat.labelKey}`);
    return cat.code || '';
  },

  // ─── Render (skeleton — full UI follows in later tasks) ─────

  _render() {
    const t = (key, params) => this._context.i18n.t(`modules.makigami.${key}`, params);

    this._container.innerHTML = `
      <div class="module-container makigami">
        <div class="module-container__header">
          <h2 class="module-container__title">${t('name')}</h2>
          <div class="makigami__toolbar">
            <input
              type="text"
              class="makigami__title-input"
              data-ref="title"
              value="${this._escape(this._title)}"
              placeholder="${this._escape(t('titlePlaceholder'))}"
              aria-label="${this._escape(t('title'))}">
            <div class="makigami__toolbar-spacer"></div>
            <button class="btn btn--sm" data-action="toggle-settings" type="button" title="${this._escape(t('settings'))}">
              ${ICONS.settings} ${t('settings')}
            </button>
            <span class="makigami__export-anchor" data-ref="export-anchor"></span>
          </div>
        </div>

        <div class="module-container__body">
          <div class="makigami__settings-area" data-ref="settings" hidden></div>
          <div class="makigami__matrix-area" data-ref="matrix"></div>
          <div class="makigami__kpi-area" data-ref="kpi"></div>
          <div class="makigami__cards-area" data-ref="cards"></div>
        </div>
      </div>
    `;

    this._renderMatrix();
    this._renderKPI();
    this._renderCards();
    if (this._settingsOpen) this._renderSettings();

    this._mountExportDropdown();
    this._bindHeaderEvents();
  },

  _mountExportDropdown() {
    if (this._exportDropdown) this._exportDropdown.destroy();
    this._exportDropdown = createExportDropdown(
      ['xlsx', 'csv', 'json', 'png', 'svg'],
      (fmt) => {
        if (fmt === 'xlsx') this._exportXLSX();
        else if (fmt === 'csv')  this._exportCSV();
        else if (fmt === 'json') this._exportJSON();
        else if (fmt === 'png')  this._exportPNG();
        else if (fmt === 'svg')  this._exportSVG();
      },
    );
    const anchor = this._container.querySelector('[data-ref="export-anchor"]');
    anchor?.replaceWith(this._exportDropdown.el);
  },

  _renderMatrix() {
    const t = (key) => this._context.i18n.t(`modules.makigami.${key}`);
    const host = this._container.querySelector('[data-ref="matrix"]');
    if (!host) return;

    const hasRoles = this._roles.length > 0;
    const hasSteps = this._steps.length > 0;

    if (!hasRoles && !hasSteps) {
      host.innerHTML = `
        <div class="makigami__matrix-empty">
          <p>${this._escape(t('rolesEmpty'))} ${this._escape(t('stepsEmpty'))}</p>
          <div class="makigami__matrix-empty-actions">
            <button class="btn btn--primary" data-action="add-role" type="button">${ICONS.plus} ${t('addRole')}</button>
            <button class="btn btn--primary" data-action="add-step" type="button">${ICONS.plus} ${t('addStep')}</button>
          </div>
        </div>
      `;
      this._bindMatrixEvents(host);
      return;
    }

    const stepHeadCell = (step, idx) => `
      <th class="makigami__matrix-step-head" scope="col" data-step-id="${step.id}">
        <div class="makigami__step-head-row">
          <span
            class="makigami__drag-handle"
            data-drag-type="step"
            data-step-id="${step.id}"
            aria-hidden="true">${ICONS.grip}</span>
          <span class="makigami__step-idx">S${idx + 1}</span>
          <input
            type="text"
            class="makigami__step-title-input"
            data-step-id="${step.id}"
            data-action="edit-step-title"
            value="${this._escape(step.title)}"
            placeholder="${this._escape(t('stepTitlePlaceholder'))}"
            aria-label="${this._escape(t('stepTitlePlaceholder'))}">
          <button
            class="makigami__head-delete"
            data-action="delete-step"
            data-step-id="${step.id}"
            title="${this._escape(t('deleteStep'))}"
            aria-label="${this._escape(t('deleteStep'))}"
            type="button">${ICONS.x}</button>
        </div>
      </th>
    `;

    const roleHeadCell = (role) => `
      <th class="makigami__matrix-role-head" scope="row" data-role-id="${role.id}">
        <div class="makigami__role-head-row">
          <span
            class="makigami__drag-handle"
            data-drag-type="role"
            data-role-id="${role.id}"
            aria-hidden="true">${ICONS.grip}</span>
          <input
            type="text"
            class="makigami__role-label-input"
            data-role-id="${role.id}"
            data-action="edit-role-label"
            value="${this._escape(role.label)}"
            placeholder="${this._escape(t('rolePlaceholder'))}"
            aria-label="${this._escape(t('rolePlaceholder'))}">
          <button
            class="makigami__head-delete"
            data-action="delete-role"
            data-role-id="${role.id}"
            title="${this._escape(t('deleteRole'))}"
            aria-label="${this._escape(t('deleteRole'))}"
            type="button">${ICONS.x}</button>
        </div>
      </th>
    `;

    const cell = (role, step) => {
      const active = step.roleIds.includes(role.id);
      return `
        <td class="makigami__matrix-cell" data-role-id="${role.id}" data-step-id="${step.id}">
          <button
            class="makigami__dot${active ? ' makigami__dot--active' : ''}"
            data-action="toggle"
            data-role-id="${role.id}"
            data-step-id="${step.id}"
            aria-pressed="${active}"
            aria-label="${this._escape(t('toggleParticipation'))}"
            type="button"></button>
        </td>
      `;
    };

    const stepHeadRow = `
      <tr>
        <th class="makigami__matrix-corner" scope="col">${this._escape(t('rolesHeader'))}</th>
        ${this._steps.map((s, i) => stepHeadCell(s, i)).join('')}
        <th class="makigami__matrix-add-col" scope="col">
          <button class="btn btn--sm btn--primary" data-action="add-step" type="button">${ICONS.plus} ${t('addStep')}</button>
        </th>
      </tr>
    `;

    const roleRows = this._roles.map(role => `
      <tr data-role-id="${role.id}">
        ${roleHeadCell(role)}
        ${this._steps.map(s => cell(role, s)).join('')}
        <td class="makigami__matrix-cell makigami__matrix-cell--placeholder"></td>
      </tr>
    `).join('');

    const addRoleRow = `
      <tr class="makigami__matrix-add-row">
        <th class="makigami__matrix-add-role" scope="row" colspan="${this._steps.length + 2}">
          <button class="btn btn--sm btn--primary" data-action="add-role" type="button">${ICONS.plus} ${t('addRole')}</button>
        </th>
      </tr>
    `;

    host.innerHTML = `
      <div class="makigami__matrix-scroll">
        <table class="makigami__matrix">
          <thead>${stepHeadRow}</thead>
          <tbody>
            ${roleRows}
            ${addRoleRow}
          </tbody>
        </table>
      </div>
    `;

    this._bindMatrixEvents(host);
  },

  _bindMatrixEvents(host) {
    host.querySelectorAll('[data-action="add-role"]').forEach(b => {
      b.addEventListener('click', () => this._addRole());
    });
    host.querySelectorAll('[data-action="add-step"]').forEach(b => {
      b.addEventListener('click', () => this._addStep());
    });
    host.querySelectorAll('[data-action="toggle"]').forEach(b => {
      b.addEventListener('click', (e) => {
        const { roleId, stepId } = e.currentTarget.dataset;
        this._toggleParticipation(stepId, roleId);
      });
    });
    host.querySelectorAll('[data-action="edit-step-title"]').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const id = e.currentTarget.dataset.stepId;
        this._editStepTitle(id, e.currentTarget.value);
      });
    });
    host.querySelectorAll('[data-action="edit-role-label"]').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const id = e.currentTarget.dataset.roleId;
        this._editRoleLabel(id, e.currentTarget.value);
      });
    });
    host.querySelectorAll('[data-action="delete-step"]').forEach(b => {
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.stepId;
        this._deleteStep(id);
      });
    });
    host.querySelectorAll('[data-action="delete-role"]').forEach(b => {
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.roleId;
        this._deleteRole(id);
      });
    });

    this._bindDragDrop(host);
  },

  _bindDragDrop(host) {
    // Grip handle activates draggable on the parent th only while held.
    host.querySelectorAll('.makigami__drag-handle').forEach(handle => {
      handle.addEventListener('mousedown', () => {
        const root = handle.closest('.makigami__matrix-step-head, .makigami__matrix-role-head');
        if (root) root.setAttribute('draggable', 'true');
      });
    });

    if (!this._dragMouseUpHandler) {
      this._dragMouseUpHandler = () => {
        this._container.querySelectorAll('[draggable="true"]').forEach(el => {
          el.removeAttribute('draggable');
        });
      };
      document.addEventListener('mouseup', this._dragMouseUpHandler);
    }

    const wireDraggable = (selector, type, idAttr, dragOverClass) => {
      host.querySelectorAll(selector).forEach(node => {
        node.addEventListener('dragstart', (e) => {
          this._draggedId = node.dataset[idAttr];
          this._draggedType = type;
          e.dataTransfer.effectAllowed = 'move';
          setTimeout(() => node.classList.add(`${selector.slice(1)}--dragging`), 0);
        });

        node.addEventListener('dragend', () => {
          node.removeAttribute('draggable');
          host.querySelectorAll(`${selector}--dragging, ${selector}.${dragOverClass}`).forEach(el => {
            el.classList.remove(`${selector.slice(1)}--dragging`, dragOverClass);
          });
          this._draggedId = null;
          this._draggedType = null;
        });

        node.addEventListener('dragover', (e) => {
          if (this._draggedType !== type) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (node.dataset[idAttr] !== this._draggedId) {
            node.classList.add(dragOverClass);
          }
        });

        node.addEventListener('dragleave', (e) => {
          if (!node.contains(e.relatedTarget)) {
            node.classList.remove(dragOverClass);
          }
        });

        node.addEventListener('drop', (e) => {
          if (this._draggedType !== type) return;
          e.preventDefault();
          const targetId = node.dataset[idAttr];
          if (this._draggedId && this._draggedId !== targetId) {
            if (type === 'step') this._reorderSteps(this._draggedId, targetId);
            else                 this._reorderRoles(this._draggedId, targetId);
          }
        });
      });
    };

    wireDraggable('.makigami__matrix-step-head', 'step', 'stepId',
                  'makigami__matrix-step-head--drag-over');
    wireDraggable('.makigami__matrix-role-head', 'role', 'roleId',
                  'makigami__matrix-role-head--drag-over');
  },

  _reorderSteps(draggedId, targetId) {
    if (draggedId === targetId) return;
    const from = this._steps.findIndex(s => s.id === draggedId);
    const to   = this._steps.findIndex(s => s.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = this._steps.splice(from, 1);
    const newTo = this._steps.findIndex(s => s.id === targetId);
    this._steps.splice(newTo, 0, moved);
    this._save();
    this._render();
  },

  _reorderRoles(draggedId, targetId) {
    if (draggedId === targetId) return;
    const from = this._roles.findIndex(r => r.id === draggedId);
    const to   = this._roles.findIndex(r => r.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = this._roles.splice(from, 1);
    const newTo = this._roles.findIndex(r => r.id === targetId);
    this._roles.splice(newTo, 0, moved);
    this._save();
    this._render();
  },

  _computeKPI() {
    let process = 0;
    let wait = 0;
    for (const s of this._steps) {
      const p = parseDuration(s.processTime, this._timeUnits);
      if (p.valid) process += p.seconds;
      const w = parseDuration(s.waitTime, this._timeUnits);
      if (w.valid) wait += w.seconds;
    }
    const lead = process + wait;
    const pce = lead > 0 ? process / lead : null;
    return { process, wait, lead, pce };
  },

  _renderKPI() {
    const t = (key) => this._context.i18n.t(`modules.makigami.${key}`);
    const host = this._container.querySelector('[data-ref="kpi"]');
    if (!host) return;

    const dash = t('kpiNoData');
    const hasSteps = this._steps.length > 0;
    const kpi = this._computeKPI();
    const lang = this._context.i18n.getLanguage();
    const locale = lang === 'de' ? 'de-DE' : 'en-US';

    const fmtTime = (seconds) => hasSteps
      ? formatDuration(seconds, this._timeUnits)
      : dash;
    const fmtPCE = (ratio) => ratio == null
      ? dash
      : `${(ratio * 100).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

    host.innerHTML = `
      <div class="makigami__kpi" role="group" aria-label="${this._escape(t('kpiPCE'))}">
        <div class="makigami__kpi-item">
          <span class="makigami__kpi-label">${this._escape(t('kpiProcess'))}</span>
          <span class="makigami__kpi-value" data-kpi="process">${this._escape(fmtTime(kpi.process))}</span>
        </div>
        <div class="makigami__kpi-item">
          <span class="makigami__kpi-label">${this._escape(t('kpiWait'))}</span>
          <span class="makigami__kpi-value" data-kpi="wait">${this._escape(fmtTime(kpi.wait))}</span>
        </div>
        <div class="makigami__kpi-item">
          <span class="makigami__kpi-label">${this._escape(t('kpiLead'))}</span>
          <span class="makigami__kpi-value" data-kpi="lead">${this._escape(fmtTime(kpi.lead))}</span>
        </div>
        <div class="makigami__kpi-item makigami__kpi-item--accent" title="${this._escape(t('kpiPCEHint'))}">
          <span class="makigami__kpi-label">${this._escape(t('kpiPCE'))}</span>
          <span class="makigami__kpi-value" data-kpi="pce">${this._escape(fmtPCE(kpi.pce))}</span>
        </div>
      </div>
    `;
  },

  _renderCards() {
    const t = (key) => this._context.i18n.t(`modules.makigami.${key}`);
    const host = this._container.querySelector('[data-ref="cards"]');
    if (!host) return;

    if (this._steps.length === 0) {
      host.innerHTML = `<div class="makigami__empty">${t('stepsEmpty')}</div>`;
      return;
    }

    host.innerHTML = this._steps.map((s, idx) => this._renderCardHTML(s, idx)).join('');

    this._steps.forEach((step) => {
      const card = host.querySelector(`.makigami__card[data-step-id="${step.id}"]`);
      if (card) this._bindCardEvents(card, step);
    });
  },

  _renderCardHTML(step, idx) {
    const t = (key) => this._context.i18n.t(`modules.makigami.${key}`);
    const expanded = step.expanded !== false;

    const indexBadge = `S${idx + 1}`;
    const titleText  = step.title.trim() || indexBadge;
    const chevron    = expanded ? ICONS.chevronDown : ICONS.chevronRight;

    const ptValid = parseDuration(step.processTime, this._timeUnits).valid;
    const wtValid = parseDuration(step.waitTime,    this._timeUnits).valid;

    const roleChips = this._roles.length === 0
      ? `<span class="makigami__chip-empty">${this._escape(t('cardRolesNone'))}</span>`
      : this._roles.map(role => {
        const active = step.roleIds.includes(role.id);
        const label = role.label.trim() || t('rolePlaceholder');
        return `
          <button
            class="makigami__chip${active ? ' makigami__chip--active' : ''}"
            data-action="toggle-role-chip"
            data-role-id="${role.id}"
            data-step-id="${step.id}"
            aria-pressed="${active}"
            type="button">
            <span class="makigami__chip-dot"></span>
            <span class="makigami__chip-label">${this._escape(label)}</span>
          </button>
        `;
      }).join('');

    const mudaChips = this._mudaCategories.length === 0
      ? `<span class="makigami__chip-empty">${this._escape(t('cardMudaNone'))}</span>`
      : this._mudaCategories.map(cat => {
        const active = step.mudaIds.includes(cat.id);
        const label = this._mudaLabel(cat);
        return `
          <button
            class="makigami__chip makigami__chip--muda${active ? ' makigami__chip--active' : ''}"
            data-action="toggle-muda"
            data-muda-id="${cat.id}"
            data-step-id="${step.id}"
            aria-pressed="${active}"
            style="--chip-color:${this._escape(cat.color)}"
            title="${this._escape(label)}"
            type="button">
            <span class="makigami__chip-dot"></span>
            ${cat.code ? `<span class="makigami__chip-code">${this._escape(cat.code)}</span>` : ''}
            <span class="makigami__chip-label">${this._escape(label)}</span>
          </button>
        `;
      }).join('');

    return `
      <div class="makigami__card" data-step-id="${step.id}" data-expanded="${expanded}">
        <div class="makigami__card-head">
          <button
            class="makigami__card-toggle"
            data-action="toggle-expanded"
            data-step-id="${step.id}"
            aria-expanded="${expanded}"
            aria-label="${this._escape(expanded ? t('cardCollapse') : t('cardExpand'))}"
            type="button">
            <span class="makigami__card-chevron">${chevron}</span>
            <span class="makigami__card-index">${indexBadge}</span>
            <span class="makigami__card-title">${this._escape(titleText)}</span>
          </button>
        </div>

        <div class="makigami__card-body" ${expanded ? '' : 'hidden'}>
          <div class="makigami__field">
            <label class="makigami__field-label" for="mk-desc-${step.id}">${this._escape(t('cardActivity'))}</label>
            <textarea
              id="mk-desc-${step.id}"
              class="makigami__textarea"
              data-action="edit-description"
              data-step-id="${step.id}"
              rows="2"
              placeholder="${this._escape(t('cardActivityPlaceholder'))}">${this._escape(step.description)}</textarea>
          </div>

          <div class="makigami__field">
            <label class="makigami__field-label">${this._escape(t('cardRoles'))}</label>
            <div class="makigami__chips">${roleChips}</div>
          </div>

          <div class="makigami__time-row">
            <div class="makigami__field">
              <label class="makigami__field-label" for="mk-pt-${step.id}">${this._escape(t('cardProcessTime'))}</label>
              <input
                id="mk-pt-${step.id}"
                type="text"
                class="makigami__time-input${ptValid ? '' : ' makigami__time-input--invalid'}"
                data-action="edit-process-time"
                data-step-id="${step.id}"
                value="${this._escape(step.processTime)}"
                placeholder="${this._escape(t('cardTimeHint'))}"
                aria-invalid="${!ptValid}">
              ${ptValid ? '' : `<span class="makigami__field-error">${this._escape(t('cardTimeInvalid'))}</span>`}
            </div>
            <div class="makigami__field">
              <label class="makigami__field-label" for="mk-wt-${step.id}">${this._escape(t('cardWaitTime'))}</label>
              <input
                id="mk-wt-${step.id}"
                type="text"
                class="makigami__time-input${wtValid ? '' : ' makigami__time-input--invalid'}"
                data-action="edit-wait-time"
                data-step-id="${step.id}"
                value="${this._escape(step.waitTime)}"
                placeholder="${this._escape(t('cardTimeHint'))}"
                aria-invalid="${!wtValid}">
              ${wtValid ? '' : `<span class="makigami__field-error">${this._escape(t('cardTimeInvalid'))}</span>`}
            </div>
          </div>

          <div class="makigami__field">
            <label class="makigami__field-label">${this._escape(t('cardMuda'))}</label>
            <div class="makigami__chips makigami__chips--muda">${mudaChips}</div>
          </div>

          <div class="makigami__field">
            <label class="makigami__field-label" for="mk-notes-${step.id}">${this._escape(t('cardNotes'))}</label>
            <textarea
              id="mk-notes-${step.id}"
              class="makigami__textarea"
              data-action="edit-notes"
              data-step-id="${step.id}"
              rows="2"
              placeholder="${this._escape(t('cardNotesPlaceholder'))}">${this._escape(step.notes)}</textarea>
          </div>
        </div>
      </div>
    `;
  },

  _bindCardEvents(card, step) {
    card.querySelector('[data-action="toggle-expanded"]')?.addEventListener('click', () => {
      this._toggleStepExpanded(step.id);
    });

    card.querySelector('[data-action="edit-description"]')?.addEventListener('input', (e) => {
      step.description = e.target.value;
      this._save();
    });

    card.querySelector('[data-action="edit-notes"]')?.addEventListener('input', (e) => {
      step.notes = e.target.value;
      this._save();
    });

    const ptInput = card.querySelector('[data-action="edit-process-time"]');
    ptInput?.addEventListener('input', (e) => this._handleTimeInput(step, 'processTime', e.target));
    ptInput?.addEventListener('blur',  (e) => this._handleTimeBlur(step, 'processTime', e.target));

    const wtInput = card.querySelector('[data-action="edit-wait-time"]');
    wtInput?.addEventListener('input', (e) => this._handleTimeInput(step, 'waitTime', e.target));
    wtInput?.addEventListener('blur',  (e) => this._handleTimeBlur(step, 'waitTime', e.target));

    card.querySelectorAll('[data-action="toggle-role-chip"]').forEach(b => {
      b.addEventListener('click', (e) => {
        const { roleId } = e.currentTarget.dataset;
        this._toggleParticipation(step.id, roleId);
      });
    });

    card.querySelectorAll('[data-action="toggle-muda"]').forEach(b => {
      b.addEventListener('click', (e) => {
        const { mudaId } = e.currentTarget.dataset;
        this._toggleMuda(step.id, mudaId);
      });
    });
  },

  _renderSettings() {
    const t = (key) => this._context.i18n.t(`modules.makigami.${key}`);
    const host = this._container.querySelector('[data-ref="settings"]');
    if (!host) return;
    host.hidden = !this._settingsOpen;
    if (!this._settingsOpen) {
      host.innerHTML = '';
      return;
    }

    const mudaRows = this._mudaCategories.map(cat => {
      const placeholder = cat.labelKey ? t(cat.labelKey) : '';
      return `
        <tr class="makigami__settings-row" data-muda-id="${cat.id}">
          <td>
            <input
              type="text"
              class="makigami__settings-input makigami__settings-input--code"
              data-action="edit-muda-code"
              data-muda-id="${cat.id}"
              value="${this._escape(cat.code)}"
              maxlength="4"
              aria-label="${this._escape(t('colCode'))}">
          </td>
          <td>
            <input
              type="text"
              class="makigami__settings-input"
              data-action="edit-muda-label"
              data-muda-id="${cat.id}"
              value="${this._escape(cat.label)}"
              placeholder="${this._escape(placeholder)}"
              aria-label="${this._escape(t('colLabel'))}">
          </td>
          <td>
            <input
              type="color"
              class="makigami__settings-color"
              data-action="edit-muda-color"
              data-muda-id="${cat.id}"
              value="${this._escape(cat.color)}"
              aria-label="${this._escape(t('colColor'))}">
          </td>
          <td>
            <button
              class="makigami__head-delete makigami__head-delete--inline"
              data-action="delete-muda"
              data-muda-id="${cat.id}"
              type="button"
              aria-label="${this._escape(t('settings'))}">${ICONS.x}</button>
          </td>
        </tr>
      `;
    }).join('');

    const unitRows = this._timeUnits.map(unit => `
      <tr class="makigami__settings-row" data-unit-id="${unit.id}">
        <td>
          <input
            type="text"
            class="makigami__settings-input makigami__settings-input--code"
            data-action="edit-unit-label"
            data-unit-id="${unit.id}"
            value="${this._escape(unit.label)}"
            maxlength="8"
            aria-label="${this._escape(t('colLabel'))}">
        </td>
        <td>
          <input
            type="number"
            class="makigami__settings-input makigami__settings-input--factor"
            data-action="edit-unit-factor"
            data-unit-id="${unit.id}"
            value="${unit.factorSeconds}"
            min="1"
            step="1"
            aria-label="${this._escape(t('colFactor'))}">
        </td>
        <td>
          <button
            class="makigami__head-delete makigami__head-delete--inline"
            data-action="delete-unit"
            data-unit-id="${unit.id}"
            type="button">${ICONS.x}</button>
        </td>
      </tr>
    `).join('');

    host.innerHTML = `
      <div class="makigami__settings-head">
        <h3 class="makigami__settings-title">${this._escape(t('settings'))}</h3>
        <button
          class="makigami__head-delete makigami__head-delete--inline"
          data-action="close-settings"
          type="button"
          aria-label="${this._escape(t('settingsClose'))}">${ICONS.x}</button>
      </div>

      <section class="makigami__settings-section">
        <h4 class="makigami__settings-section-title">${this._escape(t('settingsMudaTitle'))}</h4>
        <p class="makigami__settings-hint">${this._escape(t('settingsMudaHint'))}</p>
        <table class="makigami__settings-table">
          <thead>
            <tr>
              <th>${this._escape(t('colCode'))}</th>
              <th>${this._escape(t('colLabel'))}</th>
              <th>${this._escape(t('colColor'))}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${mudaRows}</tbody>
        </table>
        <button class="btn btn--sm" data-action="add-muda" type="button">${ICONS.plus} ${this._escape(t('settingsAddMuda'))}</button>
      </section>

      <section class="makigami__settings-section">
        <h4 class="makigami__settings-section-title">${this._escape(t('settingsUnitsTitle'))}</h4>
        <p class="makigami__settings-hint">${this._escape(t('settingsUnitsHint'))}</p>
        <table class="makigami__settings-table">
          <thead>
            <tr>
              <th>${this._escape(t('colLabel'))}</th>
              <th>${this._escape(t('colFactor'))}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${unitRows}</tbody>
        </table>
        <button class="btn btn--sm" data-action="add-unit" type="button">${ICONS.plus} ${this._escape(t('settingsAddUnit'))}</button>
      </section>

      <div class="makigami__settings-footer">
        <button class="btn btn--sm" data-action="reset-settings" type="button">${this._escape(t('settingsReset'))}</button>
      </div>
    `;

    this._bindSettingsEvents(host);
  },

  _bindSettingsEvents(host) {
    host.querySelector('[data-action="close-settings"]')?.addEventListener('click', () => {
      this._settingsOpen = false;
      this._save();
      this._renderSettings();
    });

    host.querySelector('[data-action="add-muda"]')?.addEventListener('click', () => this._addMudaCategory());
    host.querySelector('[data-action="add-unit"]')?.addEventListener('click', () => this._addTimeUnit());
    host.querySelector('[data-action="reset-settings"]')?.addEventListener('click', () => this._resetSettings());

    host.querySelectorAll('[data-action="edit-muda-code"]').forEach(inp => {
      inp.addEventListener('input', (e) => this._editMudaField(e.currentTarget.dataset.mudaId, 'code', e.currentTarget.value));
    });
    host.querySelectorAll('[data-action="edit-muda-label"]').forEach(inp => {
      inp.addEventListener('input', (e) => this._editMudaField(e.currentTarget.dataset.mudaId, 'label', e.currentTarget.value));
    });
    host.querySelectorAll('[data-action="edit-muda-color"]').forEach(inp => {
      inp.addEventListener('input', (e) => this._editMudaField(e.currentTarget.dataset.mudaId, 'color', e.currentTarget.value));
    });
    host.querySelectorAll('[data-action="delete-muda"]').forEach(b => {
      b.addEventListener('click', (e) => this._deleteMudaCategory(e.currentTarget.dataset.mudaId));
    });

    host.querySelectorAll('[data-action="edit-unit-label"]').forEach(inp => {
      inp.addEventListener('input', (e) => this._editUnitField(e.currentTarget.dataset.unitId, 'label', e.currentTarget.value));
    });
    host.querySelectorAll('[data-action="edit-unit-factor"]').forEach(inp => {
      inp.addEventListener('input', (e) => this._editUnitField(e.currentTarget.dataset.unitId, 'factorSeconds', e.currentTarget.value));
    });
    host.querySelectorAll('[data-action="delete-unit"]').forEach(b => {
      b.addEventListener('click', (e) => this._deleteTimeUnit(e.currentTarget.dataset.unitId));
    });
  },

  _bindHeaderEvents() {
    const titleInput = this._container.querySelector('[data-ref="title"]');
    titleInput?.addEventListener('input', (e) => {
      this._title = e.target.value;
      this._save();
    });

    this._container.querySelector('[data-action="toggle-settings"]')?.addEventListener('click', () => {
      this._settingsOpen = !this._settingsOpen;
      this._save();
      this._render();
      if (this._settingsOpen) {
        const panel = this._container.querySelector('[data-ref="settings"]');
        panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  },

  // ─── Mutators ───────────────────────────────────────────────

  _addRole() {
    this._roles.push({ id: uid('r-'), label: '' });
    this._save();
    this._render();
  },

  _addStep() {
    this._steps.push({
      id: uid('s-'),
      title: '',
      description: '',
      roleIds: [],
      processTime: '',
      waitTime: '',
      mudaIds: [],
      notes: '',
      expanded: true,
    });
    this._save();
    this._render();
  },

  _toggleParticipation(stepId, roleId) {
    const step = this._steps.find(s => s.id === stepId);
    if (!step) return;
    const active = !step.roleIds.includes(roleId);
    if (active) step.roleIds.push(roleId);
    else step.roleIds = step.roleIds.filter(id => id !== roleId);
    this._save();

    // Targeted DOM updates — avoid full re-render so input focus is preserved.
    const cellBtn = this._container.querySelector(
      `[data-action="toggle"][data-step-id="${stepId}"][data-role-id="${roleId}"]`,
    );
    if (cellBtn) {
      cellBtn.classList.toggle('makigami__dot--active', active);
      cellBtn.setAttribute('aria-pressed', String(active));
    }
    const chip = this._container.querySelector(
      `.makigami__card[data-step-id="${stepId}"] [data-action="toggle-role-chip"][data-role-id="${roleId}"]`,
    );
    if (chip) {
      chip.classList.toggle('makigami__chip--active', active);
      chip.setAttribute('aria-pressed', String(active));
    }
  },

  _toggleMuda(stepId, mudaId) {
    const step = this._steps.find(s => s.id === stepId);
    if (!step) return;
    const active = !step.mudaIds.includes(mudaId);
    if (active) step.mudaIds.push(mudaId);
    else step.mudaIds = step.mudaIds.filter(id => id !== mudaId);
    this._save();

    const chip = this._container.querySelector(
      `.makigami__card[data-step-id="${stepId}"] [data-action="toggle-muda"][data-muda-id="${mudaId}"]`,
    );
    if (chip) {
      chip.classList.toggle('makigami__chip--active', active);
      chip.setAttribute('aria-pressed', String(active));
    }
  },

  _toggleStepExpanded(stepId) {
    const step = this._steps.find(s => s.id === stepId);
    if (!step) return;
    step.expanded = step.expanded === false;
    this._save();
    // Local re-render of just this card preserves sibling input focus.
    const card = this._container.querySelector(`.makigami__card[data-step-id="${stepId}"]`);
    const idx  = this._steps.findIndex(s => s.id === stepId);
    if (card && idx >= 0) {
      card.outerHTML = this._renderCardHTML(step, idx);
      const fresh = this._container.querySelector(`.makigami__card[data-step-id="${stepId}"]`);
      if (fresh) this._bindCardEvents(fresh, step);
    }
  },

  _handleTimeInput(step, field, inputEl) {
    step[field] = inputEl.value;
    this._save();

    const result = parseDuration(inputEl.value, this._timeUnits);
    inputEl.classList.toggle('makigami__time-input--invalid', !result.valid);
    inputEl.setAttribute('aria-invalid', String(!result.valid));

    // Inline error visibility — insert/remove without re-rendering siblings.
    const field_ = inputEl.closest('.makigami__field');
    let err = field_?.querySelector('.makigami__field-error');
    if (!result.valid && !err) {
      err = document.createElement('span');
      err.className = 'makigami__field-error';
      err.textContent = this._context.i18n.t('modules.makigami.cardTimeInvalid');
      field_?.appendChild(err);
    } else if (result.valid && err) {
      err.remove();
    }
    this._renderKPI();
  },

  _handleTimeBlur(step, field, inputEl) {
    const result = canonicalize(inputEl.value, this._timeUnits);
    if (result.valid && result.text !== inputEl.value && inputEl.value.trim() !== '') {
      inputEl.value = result.text;
      step[field] = result.text;
      this._save();
    }
  },

  _editStepTitle(stepId, value) {
    const step = this._steps.find(s => s.id === stepId);
    if (!step) return;
    step.title = String(value);
    this._save();
    // Live-update the step-card heading without re-rendering the whole matrix
    // (would steal focus). Task #6 may extend this.
    const cardTitle = this._container.querySelector(
      `.makigami__card[data-step-id="${stepId}"] .makigami__card-title`,
    );
    if (cardTitle) {
      const idx = this._steps.findIndex(s => s.id === stepId);
      cardTitle.textContent = step.title || `S${idx + 1}`;
    }
  },

  _editRoleLabel(roleId, value) {
    const role = this._roles.find(r => r.id === roleId);
    if (!role) return;
    role.label = String(value);
    this._save();
    // Live-sync role chip labels on every card without re-rendering siblings.
    const fallback = this._context.i18n.t('modules.makigami.rolePlaceholder');
    this._container.querySelectorAll(
      `.makigami__card [data-action="toggle-role-chip"][data-role-id="${roleId}"] .makigami__chip-label`,
    ).forEach(el => {
      el.textContent = role.label.trim() || fallback;
    });
  },

  async _deleteStep(stepId) {
    const step = this._steps.find(s => s.id === stepId);
    if (!step) return;
    const t = (k, p) => this._context.i18n.t(`modules.makigami.${k}`, p);
    const idx = this._steps.findIndex(s => s.id === stepId);
    const label = step.title || `S${idx + 1}`;
    const msg = t('delStepConfirm').replace('{title}', label);

    const ok = this._context?.confirmPopout
      ? await this._context.confirmPopout(msg, { danger: true })
      // eslint-disable-next-line no-alert
      : confirm(msg);
    if (!ok) return;

    this._steps.splice(idx, 1);
    this._save();
    this._render();
  },

  async _deleteRole(roleId) {
    const role = this._roles.find(r => r.id === roleId);
    if (!role) return;
    const t = (k, p) => this._context.i18n.t(`modules.makigami.${k}`, p);
    const label = role.label || t('rolePlaceholder');
    const msg = t('delRoleConfirm').replace('{label}', label);

    const ok = this._context?.confirmPopout
      ? await this._context.confirmPopout(msg, { danger: true })
      // eslint-disable-next-line no-alert
      : confirm(msg);
    if (!ok) return;

    this._roles = this._roles.filter(r => r.id !== roleId);
    this._steps.forEach(s => {
      s.roleIds = s.roleIds.filter(id => id !== roleId);
    });
    this._save();
    this._render();
  },

  // ─── Settings mutators ──────────────────────────────────────

  _editMudaField(mudaId, field, value) {
    const cat = this._mudaCategories.find(m => m.id === mudaId);
    if (!cat) return;
    cat[field] = String(value);
    this._save();
    // Re-render cards so chip color/label updates show — preserves matrix focus.
    this._renderCards();
  },

  _editUnitField(unitId, field, value) {
    const unit = this._timeUnits.find(u => u.id === unitId);
    if (!unit) return;
    if (field === 'factorSeconds') {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return;
      unit.factorSeconds = n;
    } else {
      unit[field] = String(value);
    }
    this._save();
    // Time fields and KPI depend on units.
    this._renderCards();
    this._renderKPI();
  },

  _addMudaCategory() {
    this._mudaCategories.push({
      id: uid('muda-'),
      code: '',
      label: '',
      color: '#888888',
    });
    this._save();
    this._renderSettings();
    this._renderCards();
  },

  _addTimeUnit() {
    this._timeUnits.push({
      id: uid('unit-'),
      label: '',
      factorSeconds: 1,
    });
    this._save();
    this._renderSettings();
  },

  _deleteMudaCategory(mudaId) {
    const idx = this._mudaCategories.findIndex(m => m.id === mudaId);
    if (idx < 0) return;
    this._mudaCategories.splice(idx, 1);
    this._steps.forEach(s => {
      s.mudaIds = s.mudaIds.filter(id => id !== mudaId);
    });
    this._save();
    this._renderSettings();
    this._renderCards();
  },

  _deleteTimeUnit(unitId) {
    const idx = this._timeUnits.findIndex(u => u.id === unitId);
    if (idx < 0) return;
    this._timeUnits.splice(idx, 1);
    this._save();
    this._renderSettings();
    this._renderCards();
    this._renderKPI();
  },

  async _resetSettings() {
    const t = (k) => this._context.i18n.t(`modules.makigami.${k}`);
    const ok = this._context?.confirmPopout
      ? await this._context.confirmPopout(t('settingsResetConfirm'), { danger: true })
      // eslint-disable-next-line no-alert
      : confirm(t('settingsResetConfirm'));
    if (!ok) return;

    const validIds = new Set();
    this._mudaCategories = createDefaultMudaCategories();
    this._mudaCategories.forEach(m => validIds.add(m.id));
    this._timeUnits = createDefaultTimeUnits();

    // Drop step-level muda references that no longer exist after reset.
    this._steps.forEach(s => {
      s.mudaIds = s.mudaIds.filter(id => validIds.has(id));
    });

    this._save();
    this._renderSettings();
    this._renderCards();
    this._renderKPI();
  },

  // ─── Export ─────────────────────────────────────────────────

  _exportFilenameBase() {
    const slug = (this._title || 'makigami')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'makigami';
  },

  _rolesText(step, t) {
    return step.roleIds
      .map(id => this._roles.find(r => r.id === id))
      .filter(Boolean)
      .map(r => r.label.trim() || t('rolePlaceholder'))
      .join('; ');
  },

  _mudaText(step) {
    return step.mudaIds
      .map(id => this._mudaCategories.find(m => m.id === id))
      .filter(Boolean)
      .map(m => this._mudaLabel(m))
      .join('; ');
  },

  _kpiFormatters() {
    const t = (k) => this._context.i18n.t(`modules.makigami.${k}`);
    const dash = t('kpiNoData');
    const lang = this._context.i18n.getLanguage();
    const locale = lang === 'de' ? 'de-DE' : 'en-US';
    const hasSteps = this._steps.length > 0;
    const fmtTime = (seconds) => hasSteps
      ? formatDuration(seconds, this._timeUnits)
      : dash;
    const fmtPCE = (ratio) => ratio == null
      ? dash
      : `${(ratio * 100).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
    return { fmtTime, fmtPCE };
  },

  _exportJSON() {
    const data = this.getState();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${this._exportFilenameBase()}.json`);
    this._context.notify?.('JSON ✓', 'success');
  },

  _exportCSV() {
    const t = (k) => this._context.i18n.t(`modules.makigami.${k}`);
    const esc = (v) => {
      const str = String(v ?? '');
      return /[",\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const rows = [[
      t('exportColStep'), t('exportColActivity'), t('exportColRoles'),
      t('exportColProcess'), t('exportColWait'), t('exportColMuda'),
      t('exportColNotes'),
    ]];
    this._steps.forEach((s, i) => {
      rows.push([
        `S${i + 1}${s.title ? `: ${s.title}` : ''}`,
        s.description,
        this._rolesText(s, t),
        s.processTime,
        s.waitTime,
        this._mudaText(s),
        s.notes,
      ]);
    });

    const csv = rows.map(r => r.map(esc).join(',')).join('\r\n');
    downloadFile(csv, `${this._exportFilenameBase()}.csv`, 'text/csv;charset=utf-8');
    this._context.notify?.('CSV ✓', 'success');
  },

  async _exportXLSX() {
    try { await ensureXLSX(); }
    catch (err) { this._context.notify?.(`XLSX: ${err.message}`, 'error'); return; }

    const t = (k) => this._context.i18n.t(`modules.makigami.${k}`);
    const wb = XLSX.utils.book_new();

    // Sheet 1 — Matrix (roles × steps)
    const stepHeader = ['', ...this._steps.map((s, i) => `S${i + 1}${s.title ? `: ${s.title}` : ''}`)];
    const matrixRows = [stepHeader];
    this._roles.forEach(role => {
      matrixRows.push([
        role.label.trim() || t('rolePlaceholder'),
        ...this._steps.map(s => s.roleIds.includes(role.id) ? '●' : ''),
      ]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrixRows), t('exportSheetMatrix'));

    // Sheet 2 — Steps (flat)
    const stepRows = [[
      t('exportColStep'), t('exportColActivity'), t('exportColRoles'),
      t('exportColProcess'), t('exportColWait'), t('exportColMuda'),
      t('exportColNotes'),
    ]];
    this._steps.forEach((s, i) => {
      stepRows.push([
        `S${i + 1}${s.title ? `: ${s.title}` : ''}`,
        s.description,
        this._rolesText(s, t),
        s.processTime,
        s.waitTime,
        this._mudaText(s),
        s.notes,
      ]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stepRows), t('exportSheetSteps'));

    // Sheet 3 — KPI
    const kpi = this._computeKPI();
    const { fmtTime, fmtPCE } = this._kpiFormatters();
    const kpiRows = [
      [t('kpiProcess'), fmtTime(kpi.process)],
      [t('kpiWait'),    fmtTime(kpi.wait)],
      [t('kpiLead'),    fmtTime(kpi.lead)],
      [t('kpiPCE'),     fmtPCE(kpi.pce)],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiRows), t('exportSheetKPI'));

    XLSX.writeFile(wb, `${this._exportFilenameBase()}.xlsx`);
    this._context.notify?.('Excel ✓', 'success');
  },

  _buildExportSVG() {
    const t = (k) => this._context.i18n.t(`modules.makigami.${k}`);

    const ROW_H = 32, COL_W = 150, ROLE_COL_W = 200, HEADER_H = 40;
    const KPI_H = 64, KPI_GAP = 24;

    const nCols = Math.max(1, this._steps.length);
    const nRows = Math.max(1, this._roles.length);
    const tableW = ROLE_COL_W + nCols * COL_W;
    const tableH = HEADER_H + nRows * ROW_H;
    const totalH = tableH + KPI_GAP + KPI_H;
    const totalW = tableW;

    const cs = getComputedStyle(document.documentElement);
    const cv = (n, fb) => cs.getPropertyValue(n).trim() || fb;
    const C = {
      bg:        cv('--color-bg-primary',     '#ffffff'),
      bgSec:     cv('--color-bg-secondary',   '#f5f5f7'),
      border:    cv('--color-border-primary', '#d2d2d7'),
      text:      cv('--color-text-primary',   '#1d1d1f'),
      muted:     cv('--color-text-tertiary',  '#86868b'),
      accent:    cv('--color-accent',         '#0066cc'),
      accentBg:  cv('--color-accent-light',   '#e5f0ff'),
    };

    const esc = (s) => this._escape(s);
    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="12">`);
    parts.push(`<rect width="${totalW}" height="${totalH}" fill="${C.bg}"/>`);

    // Corner header
    parts.push(`<rect x="0" y="0" width="${ROLE_COL_W}" height="${HEADER_H}" fill="${C.bgSec}" stroke="${C.border}"/>`);
    parts.push(`<text x="${ROLE_COL_W / 2}" y="${HEADER_H / 2 + 4}" fill="${C.muted}" text-anchor="middle">${esc(t('rolesHeader'))}</text>`);

    // Step headers
    this._steps.forEach((s, i) => {
      const x = ROLE_COL_W + i * COL_W;
      parts.push(`<rect x="${x}" y="0" width="${COL_W}" height="${HEADER_H}" fill="${C.bgSec}" stroke="${C.border}"/>`);
      const title = `S${i + 1}${s.title ? `: ${s.title}` : ''}`;
      parts.push(`<text x="${x + COL_W / 2}" y="${HEADER_H / 2 + 4}" fill="${C.text}" text-anchor="middle">${esc(title.length > 28 ? title.slice(0, 25) + '…' : title)}</text>`);
    });

    // Body
    if (this._roles.length === 0 || this._steps.length === 0) {
      parts.push(`<text x="${totalW / 2}" y="${HEADER_H + ROW_H / 2 + 4}" fill="${C.muted}" text-anchor="middle">—</text>`);
    } else {
      this._roles.forEach((r, ri) => {
        const y = HEADER_H + ri * ROW_H;
        parts.push(`<rect x="0" y="${y}" width="${ROLE_COL_W}" height="${ROW_H}" fill="${C.bgSec}" stroke="${C.border}"/>`);
        const label = r.label.trim() || t('rolePlaceholder');
        parts.push(`<text x="12" y="${y + ROW_H / 2 + 4}" fill="${C.text}">${esc(label.length > 26 ? label.slice(0, 23) + '…' : label)}</text>`);

        this._steps.forEach((s, si) => {
          const x = ROLE_COL_W + si * COL_W;
          parts.push(`<rect x="${x}" y="${y}" width="${COL_W}" height="${ROW_H}" fill="${C.bg}" stroke="${C.border}"/>`);
          const active = s.roleIds.includes(r.id);
          const cx = x + COL_W / 2;
          const cy = y + ROW_H / 2;
          if (active) {
            parts.push(`<circle cx="${cx}" cy="${cy}" r="8" fill="${C.accent}"/>`);
          } else {
            parts.push(`<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="${C.border}" stroke-width="2"/>`);
          }
        });
      });
    }

    // KPI strip
    const kpi = this._computeKPI();
    const { fmtTime, fmtPCE } = this._kpiFormatters();
    const labels = [t('kpiProcess'), t('kpiWait'), t('kpiLead'), t('kpiPCE')];
    const values = [fmtTime(kpi.process), fmtTime(kpi.wait), fmtTime(kpi.lead), fmtPCE(kpi.pce)];
    const kpiY = tableH + KPI_GAP;
    const cellW = totalW / 4;
    for (let i = 0; i < 4; i++) {
      const x = i * cellW;
      const isAcc = i === 3;
      parts.push(`<rect x="${x}" y="${kpiY}" width="${cellW}" height="${KPI_H}" fill="${isAcc ? C.accentBg : C.bgSec}" stroke="${isAcc ? C.accent : C.border}"/>`);
      parts.push(`<text x="${x + cellW / 2}" y="${kpiY + 22}" fill="${C.muted}" text-anchor="middle" font-size="10" letter-spacing="0.05em">${esc(labels[i].toUpperCase())}</text>`);
      parts.push(`<text x="${x + cellW / 2}" y="${kpiY + 48}" fill="${C.text}" text-anchor="middle" font-size="18" font-weight="600">${esc(values[i])}</text>`);
    }

    parts.push('</svg>');
    return { svg: parts.join(''), width: totalW, height: totalH };
  },

  _exportSVG() {
    const { svg } = this._buildExportSVG();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, `${this._exportFilenameBase()}.svg`);
    this._context.notify?.('SVG ✓', 'success');
  },

  _exportPNG() {
    const { svg, width, height } = this._buildExportSVG();
    const scale = 2;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = width  * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        URL.revokeObjectURL(url);
        if (b) {
          downloadBlob(b, `${this._exportFilenameBase()}.png`);
          this._context.notify?.('PNG ✓', 'success');
        }
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      this._context.notify?.('PNG: render failed', 'error');
    };
    img.src = url;
  },

  // ─── Utilities ──────────────────────────────────────────────

  _escape(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};
