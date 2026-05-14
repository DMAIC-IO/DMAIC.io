/**
 * D.Mike — Process Map Module (process-map.js)
 * Visual process flow builder with inputs/outputs per step.
 * DMAIC phase: Measure
 *
 * Vertical flow of process steps, each with a title, description,
 * and associated inputs (left) and outputs (right).
 * Supports drag & drop reordering and multi-format export (XLSX, CSV, JSON, PNG, SVG).
 */

import {
  downloadFile, downloadBlob, ensureXLSX, createExportDropdown,
} from '../../core/export-utils.js';

const ICONS = {
  trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>',
  plus: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  x: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  chevronRight: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  chevronDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  loop: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>',
  diamond: '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l10 10-10 10L2 12z"/></svg>',
};

/**
 * @returns {string} Unique ID for steps and IO items
 */
function generateId() {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default {
  id: 'process-map',
  phase: 'measure',
  icon: 'git-branch',
  i18nKey: 'modules.process-map',
  version: '1.0.0',

  /** @type {object} */
  _context: null,
  /** @type {HTMLElement} */
  _container: null,
  /** @type {Array<{id: string, title: string, description: string, valueType: string|null, inputs: Array<{id: string, name: string}>, outputs: Array<{id: string, name: string}>, substeps: Array<{id: string, title: string}>, expanded: boolean}>} */
  _steps: [],
  /** @type {string|null} */
  _draggedId: null,
  /** @type {{ el: HTMLElement, destroy: function }|null} */
  _exportDropdown: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._steps = [];
    this._draggedId = null;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved && Array.isArray(saved.steps)) {
      this._steps = saved.steps.map(s => ({
        ...s,
        valueType: s.valueType || null,
        substeps: Array.isArray(s.substeps) ? s.substeps : [],
        expanded: typeof s.expanded === 'boolean' ? s.expanded : false,
        loop: s.loop || null,
      }));
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
    return { steps: JSON.parse(JSON.stringify(this._steps)) };
  },

  setState(data) {
    if (data && Array.isArray(data.steps)) {
      this._steps = data.steps.map(s => ({
        ...s,
        valueType: s.valueType || null,
        substeps: Array.isArray(s.substeps) ? s.substeps : [],
        expanded: typeof s.expanded === 'boolean' ? s.expanded : false,
        loop: s.loop || null,
      }));
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

    const hasContent = (this._steps?.length || 0) > 0;
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

  help: () => import('./process-map-help.js'),

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (key, params) => this._context.i18n.t(`modules.process-map.${key}`, params);

    this._container.innerHTML = `
      <div class="module-container pmap">
        <div class="module-container__header">
          <h2 class="module-container__title">${t('name')}</h2>
          <div class="pmap__toolbar">
            <div class="pmap__toolbar-spacer"></div>
            <span class="pmap__export-anchor"></span>
            <button class="btn btn--sm btn--primary" data-action="add-step" type="button">${ICONS.plus} ${t('addStep')}</button>
          </div>
        </div>

        <div class="module-container__body">
          <div class="pmap__canvas${this._steps.some(s => s.loop) ? ' pmap__canvas--has-loops' : ''}">
            <div class="pmap__flow" data-ref="flow">
              ${this._renderFlow(t)}
            </div>
          </div>
        </div>
      </div>
    `;

    this._bindEvents(t);
    this._initDragDrop();
    requestAnimationFrame(() => this._renderLoopBrackets());
  },

  _renderFlow(t) {
    const connectorRow = (idx, title, empty) => `
      <tr class="pmap__connector-row">
        <td></td>
        <td><div class="pmap__connector pmap__connector--clickable${empty ? ' pmap__connector--empty' : ''}" data-action="insert-step" data-idx="${idx}" title="${title}"><span class="pmap__connector-arrow">&raquo;</span></div></td>
        <td></td>
      </tr>`;

    let html = `<table class="pmap__table"><colgroup>
      <col class="pmap__col-io"><col class="pmap__col-step"><col class="pmap__col-io">
    </colgroup><tbody>`;

    if (this._steps.length === 0) {
      html += connectorRow(0, t('addFirstStep'), true);
      html += `</tbody></table>`;
      return html;
    }

    html += connectorRow(0, t('insertHere'));

    this._steps.forEach((step, idx) => {
      if (idx > 0) html += connectorRow(idx, t('insertHere'));

      const hasSubsteps = step.substeps && step.substeps.length > 0;
      const toggleIcon = step.expanded ? ICONS.chevronDown : ICONS.chevronRight;
      const substepCount = hasSubsteps ? ` (${step.substeps.length})` : '';

      html += `
      <tr class="pmap__step-row" data-step-id="${step.id}">
        <td class="pmap__cell-io">${this._renderIOPanel(step, 'inputs', t)}</td>
        <td class="pmap__cell-step">
          <div class="pmap__step-card">
            <div class="pmap__step-header">
              <span class="pmap__step-number">${String(idx + 1).padStart(2, '0')}</span>
              ${this._renderValueBadge(step, t)}
              <input class="pmap__step-title" type="text" value="${this._esc(step.title)}"
                placeholder="${t('stepNamePlaceholder')}"
                data-field="title" data-step-id="${step.id}">
              <div class="pmap__step-actions">
                <button class="pmap__step-loop-toggle${step.loop ? ' pmap__step-loop-toggle--active' : ''}" data-action="toggle-loop" data-step-id="${step.id}"
                  title="${t('loopLabel')}">${ICONS.loop}</button>
                <button class="pmap__step-delete" data-action="remove-step" data-step-id="${step.id}"
                  title="${this._context.i18n.t('common.delete')}">${ICONS.trash}</button>
              </div>
            </div>
            <div class="pmap__step-body">
              <textarea class="pmap__step-description"
                placeholder="${t('descriptionPlaceholder')}"
                data-field="description" data-step-id="${step.id}">${this._esc(step.description)}</textarea>
            </div>
            <div class="pmap__substeps-bar${hasSubsteps ? ' pmap__substeps-bar--has' : ''}" data-action="toggle-substeps" data-step-id="${step.id}">
              <span class="pmap__substeps-bar-icon">${toggleIcon}</span>
              <span class="pmap__substeps-bar-label">${t('substepsLabel')}${substepCount}</span>
            </div>
            ${step.expanded ? this._renderSubsteps(step, idx, t) : ''}
          </div>
        </td>
        <td class="pmap__cell-io">${this._renderIOPanel(step, 'outputs', t)}</td>
      </tr>`;
    });

    html += connectorRow(this._steps.length, t('insertHere'));
    html += `</tbody></table>`;
    return html;
  },

  _renderSubsteps(step, parentIdx, t) {
    let html = `<div class="pmap__substeps" data-step-id="${step.id}">`;
    html += `<div class="pmap__substeps-list">`;

    step.substeps.forEach((sub, subIdx) => {
      html += `
        <div class="pmap__substep-item" data-substep-id="${sub.id}" data-parent-id="${step.id}">
          <span class="pmap__substep-number">${parentIdx + 1}.${subIdx + 1}</span>

          <input class="pmap__substep-title" type="text" value="${this._esc(sub.title)}"
            placeholder="${t('substepPlaceholder')}"
            data-substep-id="${sub.id}" data-parent-id="${step.id}">
          <button class="pmap__substep-remove" data-action="remove-substep"
            data-parent-id="${step.id}" data-substep-id="${sub.id}"
            title="${this._context.i18n.t('common.delete')}">${ICONS.x}</button>
        </div>`;
    });

    html += `</div>`;
    html += `<button class="pmap__substep-add" data-action="add-substep" data-step-id="${step.id}"
      title="${t('addSubstep')}">${ICONS.plus} ${t('addSubstep')}</button>`;
    html += `</div>`;
    return html;
  },

  _renderValueBadge(step, t) {
    const vt = step.valueType;
    if (!vt) {
      return `<button class="pmap__value-badge pmap__value-badge--none" data-action="cycle-value" data-step-id="${step.id}" title="${t('valueTypeLabel')}">&ndash;</button>`;
    }
    const label = t(vt);
    const longLabel = t(`${vt}Long`);
    return `<button class="pmap__value-badge pmap__value-badge--${vt}" data-action="cycle-value" data-step-id="${step.id}" title="${longLabel}">${label}</button>`;
  },

  _renderLoopPanel(step, stepIdx, t) {
    const loop = step.loop;
    const targetOptions = this._steps
      .map((s, i) => i < stepIdx ? s : null)
      .filter(Boolean)
      .map((s, i) => {
        const num = String(i + 1).padStart(2, '0');
        const label = s.title ? `${num} — ${this._esc(s.title)}` : `${t('csvStep')} ${num}`;
        const sel = loop.targetStepId === s.id ? ' selected' : '';
        return `<option value="${s.id}"${sel}>${label}</option>`;
      })
      .join('');

    const loopStepsHtml = (loop.steps || []).map((ls, lsi) => `
      <div class="pmap__loop-step-item" data-loop-step-id="${ls.id}" data-parent-id="${step.id}">
        <span class="pmap__loop-step-number">${ICONS.diamond}</span>
        <input class="pmap__loop-step-title" type="text" value="${this._esc(ls.title)}"
          placeholder="${t('loopStepPlaceholder')}"
          data-loop-step-id="${ls.id}" data-parent-id="${step.id}">
        <button class="pmap__loop-step-remove" data-action="remove-loop-step"
          data-parent-id="${step.id}" data-loop-step-id="${ls.id}"
          title="${this._context.i18n.t('common.delete')}">${ICONS.x}</button>
      </div>
    `).join('');

    return `
    <div class="pmap__loop-panel" data-step-id="${step.id}">
      <div class="pmap__loop-header">
        <span class="pmap__loop-icon">${ICONS.loop}</span>
        <span class="pmap__loop-title">${t('loopLabel')}</span>
        <button class="pmap__loop-remove" data-action="remove-loop" data-step-id="${step.id}"
          title="${t('removeLoop')}">${ICONS.x}</button>
      </div>
      <div class="pmap__loop-body">
        <div class="pmap__loop-field">
          <label class="pmap__loop-field-label">${ICONS.diamond} ${t('loopCondition')}</label>
          <input class="pmap__loop-condition" type="text" value="${this._esc(loop.condition || '')}"
            placeholder="${t('loopConditionPlaceholder')}"
            data-step-id="${step.id}">
        </div>
        <div class="pmap__loop-field">
          <label class="pmap__loop-field-label">${t('loopTarget')}</label>
          <select class="pmap__loop-target-select" data-step-id="${step.id}">
            <option value="">${t('loopSelectTarget')}</option>
            ${targetOptions}
          </select>
        </div>
        <div class="pmap__loop-steps-list">
          ${loopStepsHtml}
        </div>
        <button class="pmap__loop-step-add" data-action="add-loop-step" data-step-id="${step.id}">
          ${ICONS.plus} ${t('addLoopStep')}
        </button>
      </div>
    </div>`;
  },

  _renderInputTypeBadge(stepId, io, t) {
    const it = io.inputType;
    if (!it) {
      return `<button class="pmap__input-type pmap__input-type--none" data-action="cycle-input-type" data-step-id="${stepId}" data-io-id="${io.id}" title="${t('inputTypeLabel')}">?</button>`;
    }
    const label = it === 'param' ? t('inputTypeParam') : t('inputTypeNoise');
    const longLabel = it === 'param' ? t('inputTypeParamLong') : t('inputTypeNoiseLong');
    const cls = it === 'param' ? 'param' : 'noise';
    return `<button class="pmap__input-type pmap__input-type--${cls}" data-action="cycle-input-type" data-step-id="${stepId}" data-io-id="${io.id}" title="${longLabel}">${label}</button>`;
  },

  _renderIOPanel(step, type, t) {
    const isInput = type === 'inputs';
    const side = isInput ? 'left' : 'right';
    const dotClass = isInput ? 'pmap__io-dot--input' : 'pmap__io-dot--output';
    const labelClass = isInput ? 'pmap__io-label-text--input' : 'pmap__io-label-text--output';
    const itemClass = isInput ? 'pmap__io-item--input' : 'pmap__io-item--output';
    const labelKey = isInput ? 'inputs' : 'outputs';
    const placeholderKey = isInput ? 'inputPlaceholder' : 'outputPlaceholder';

    const items = step[type].map(io => {
      const typeBadge = isInput ? this._renderInputTypeBadge(step.id, io, t) : '';
      return `
      <div class="pmap__io-item ${itemClass}" data-io-id="${io.id}" data-io-step="${step.id}" data-io-type="${type}">
        <span class="pmap__io-dot ${dotClass}"></span>
        ${typeBadge}
        <textarea class="pmap__io-name" rows="1" placeholder="${t(placeholderKey)}"
          data-io-step="${step.id}" data-io-type="${type}" data-io-id="${io.id}">${this._esc(io.name)}</textarea>
        <button class="pmap__io-remove" data-action="remove-io"
          data-step-id="${step.id}" data-io-type="${type}" data-io-id="${io.id}">${ICONS.x}</button>
      </div>`;
    }).join('');

    const labelContent = isInput
      ? `<span class="pmap__io-dot ${dotClass}"></span> ${t(labelKey)} &raquo;`
      : `&raquo; ${t(labelKey)} <span class="pmap__io-dot ${dotClass}"></span>`;

    return `
      <div class="pmap__io-panel pmap__io-panel--${side}">
        <div class="pmap__io-label" data-action="add-io" data-step-id="${step.id}" data-io-type="${type}">
          <span class="pmap__io-label-text ${labelClass}">${labelContent}</span>
        </div>
        <div class="pmap__io-list">${items}</div>
      </div>
    `;
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindEvents(t) {
    const el = this._container;

    // Toolbar buttons
    el.querySelector('[data-action="add-step"]')?.addEventListener('click', () => {
      this._addStep(this._steps.length);
    });

    // Export dropdown (central component)
    if (this._exportDropdown) this._exportDropdown.destroy();
    this._exportDropdown = createExportDropdown(
      ['xlsx', 'csv', 'json', 'png', 'svg'],
      (fmt) => {
        if (fmt === 'csv')  this._exportCSV(t);
        if (fmt === 'xlsx') this._exportXLSX(t);
        if (fmt === 'json') this._exportJSON();
        if (fmt === 'png')  this._exportImage('png', t);
        if (fmt === 'svg')  this._exportImage('svg', t);
      }
    );
    el.querySelector('.pmap__export-anchor')?.replaceWith(this._exportDropdown.el);

    // Insert step via connector arrow click
    el.querySelectorAll('[data-action="insert-step"]').forEach(conn => {
      conn.addEventListener('click', () => {
        this._addStep(parseInt(conn.dataset.idx, 10));
      });
    });

    // Remove step
    el.querySelectorAll('[data-action="remove-step"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._removeStep(btn.dataset.stepId);
      });
    });

    // Cycle value type (VA → BNVA → NVA → none)
    el.querySelectorAll('[data-action="cycle-value"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._cycleValueType(btn.dataset.stepId);
      });
    });

    // Cycle input type (param → noise → none)
    el.querySelectorAll('[data-action="cycle-input-type"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._cycleInputType(btn.dataset.stepId, btn.dataset.ioId);
      });
    });

    // Add IO
    el.querySelectorAll('[data-action="add-io"]').forEach(label => {
      label.addEventListener('click', () => {
        this._addIO(label.dataset.stepId, label.dataset.ioType);
      });
    });

    // Remove IO
    el.querySelectorAll('[data-action="remove-io"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._removeIO(btn.dataset.stepId, btn.dataset.ioType, btn.dataset.ioId);
      });
    });

    // Step title/description inline editing
    el.querySelectorAll('.pmap__step-title, .pmap__step-description').forEach(input => {
      input.addEventListener('input', () => {
        const step = this._steps.find(s => s.id === input.dataset.stepId);
        if (step) {
          step[input.dataset.field] = input.value;
          this._save();
        }
      });
    });

    // IO name inline editing
    el.querySelectorAll('.pmap__io-name').forEach(ta => {
      this._autoSizeTextarea(ta);
      ta.addEventListener('input', () => {
        this._autoSizeTextarea(ta);
        const step = this._steps.find(s => s.id === ta.dataset.ioStep);
        if (!step) return;
        const io = step[ta.dataset.ioType].find(i => i.id === ta.dataset.ioId);
        if (io) {
          io.name = ta.value;
          this._save();
        }
      });
    });

    // Toggle substeps expand/collapse
    el.querySelectorAll('[data-action="toggle-substeps"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleSubsteps(btn.dataset.stepId);
      });
    });

    // Add substep
    el.querySelectorAll('[data-action="add-substep"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._addSubstep(btn.dataset.stepId);
      });
    });

    // Remove substep
    el.querySelectorAll('[data-action="remove-substep"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._removeSubstep(btn.dataset.parentId, btn.dataset.substepId);
      });
    });

    // Substep title inline editing
    el.querySelectorAll('.pmap__substep-title').forEach(input => {
      input.addEventListener('input', () => {
        const step = this._steps.find(s => s.id === input.dataset.parentId);
        if (!step) return;
        const sub = step.substeps.find(ss => ss.id === input.dataset.substepId);
        if (sub) {
          sub.title = input.value;
          this._save();
        }
      });
    });

    // ── Loop events ──

    el.querySelectorAll('[data-action="toggle-loop"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleLoop(btn.dataset.stepId);
      });
    });

  },

  // ─── CRUD ─────────────────────────────────────────────────

  _addStep(atIndex) {
    const step = {
      id: generateId(),
      title: '',
      description: '',
      valueType: null,
      inputs: [],
      outputs: [],
      substeps: [],
      expanded: false,
      loop: null,
    };
    this._steps.splice(atIndex, 0, step);
    this._save();
    this._render();

    // Focus the new step's title
    setTimeout(() => {
      const rows = this._container.querySelectorAll('.pmap__step-row');
      if (rows[atIndex]) {
        const titleInput = rows[atIndex].querySelector('.pmap__step-title');
        if (titleInput) titleInput.focus();
      }
    }, 50);
  },

  _removeStep(id) {
    this._steps = this._steps.filter(s => s.id !== id);
    this._steps.forEach(s => {
      if (s.loop && s.loop.targetStepId === id) s.loop = null;
    });
    this._save();
    this._render();
  },

  _addIO(stepId, type) {
    const step = this._steps.find(s => s.id === stepId);
    if (!step) return;
    step[type].push({ id: generateId(), name: '' });
    this._save();
    this._render();

    // Focus the new IO item
    setTimeout(() => {
      const row = this._container.querySelector(`.pmap__step-row[data-step-id="${stepId}"]`);
      if (!row) return;
      const itemClass = type === 'inputs' ? 'pmap__io-item--input' : 'pmap__io-item--output';
      const items = row.querySelectorAll(`.${itemClass} .pmap__io-name`);
      if (items.length) items[items.length - 1].focus();
    }, 50);
  },

  _removeIO(stepId, type, ioId) {
    const step = this._steps.find(s => s.id === stepId);
    if (!step) return;
    step[type] = step[type].filter(io => io.id !== ioId);
    this._save();
    this._render();
  },

  _cycleValueType(stepId) {
    const step = this._steps.find(s => s.id === stepId);
    if (!step) return;
    const cycle = [null, 'va', 'bnva', 'nva'];
    const idx = cycle.indexOf(step.valueType);
    step.valueType = cycle[(idx + 1) % cycle.length];
    this._save();
    this._render();
  },

  _cycleInputType(stepId, ioId) {
    const step = this._steps.find(s => s.id === stepId);
    if (!step) return;
    const io = step.inputs.find(i => i.id === ioId);
    if (!io) return;
    const cycle = [null, 'param', 'noise'];
    const idx = cycle.indexOf(io.inputType || null);
    io.inputType = cycle[(idx + 1) % cycle.length];
    this._save();
    this._render();
  },

  _toggleSubsteps(stepId) {
    const step = this._steps.find(s => s.id === stepId);
    if (!step) return;
    if (!Array.isArray(step.substeps)) step.substeps = [];
    step.expanded = !step.expanded;
    this._save();
    this._render();
  },

  _addSubstep(stepId) {
    const step = this._steps.find(s => s.id === stepId);
    if (!step) return;
    step.substeps.push({ id: generateId(), title: '' });
    this._save();
    this._render();

    setTimeout(() => {
      const substepsEl = this._container.querySelector(`.pmap__substeps[data-step-id="${stepId}"]`);
      if (!substepsEl) return;
      const inputs = substepsEl.querySelectorAll('.pmap__substep-title');
      if (inputs.length) inputs[inputs.length - 1].focus();
    }, 50);
  },

  _removeSubstep(parentId, substepId) {
    const step = this._steps.find(s => s.id === parentId);
    if (!step) return;
    step.substeps = step.substeps.filter(ss => ss.id !== substepId);
    if (step.substeps.length === 0) {
      step.expanded = false;
    }
    this._save();
    this._render();
  },

  // ─── Loop CRUD ─────────────────────────────────────────────

  _toggleLoop(stepId) {
    const step = this._steps.find(s => s.id === stepId);
    if (!step) return;
    if (step.loop) {
      step.loop = null;
    } else {
      step.loop = { targetStepId: null, condition: '', steps: [] };
    }
    this._save();
    this._render();
  },

  _removeLoop(stepId) {
    const step = this._steps.find(s => s.id === stepId);
    if (!step) return;
    step.loop = null;
    this._save();
    this._render();
  },

  _addLoopStep(stepId) {
    const step = this._steps.find(s => s.id === stepId);
    if (!step || !step.loop) return;
    if (!Array.isArray(step.loop.steps)) step.loop.steps = [];
    step.loop.steps.push({ id: generateId(), title: '' });
    this._save();
    this._render();

    setTimeout(() => {
      const panel = this._container.querySelector(`.pmap__loop-panel[data-step-id="${stepId}"]`);
      if (!panel) return;
      const inputs = panel.querySelectorAll('.pmap__loop-step-title');
      if (inputs.length) inputs[inputs.length - 1].focus();
    }, 50);
  },

  _validateLoopTargets() {
    this._steps.forEach((step, idx) => {
      if (!step.loop || !step.loop.targetStepId) return;
      const targetIdx = this._steps.findIndex(s => s.id === step.loop.targetStepId);
      if (targetIdx === -1 || targetIdx >= idx) {
        step.loop.targetStepId = null;
      }
    });
  },

  _removeLoopStep(parentId, loopStepId) {
    const step = this._steps.find(s => s.id === parentId);
    if (!step || !step.loop) return;
    step.loop.steps = step.loop.steps.filter(ls => ls.id !== loopStepId);
    this._save();
    this._render();
  },

  // ─── Drag & Drop ──────────────────────────────────────────

  _initDragDrop() {
    const el = this._container;

    // Enable draggable only via the step-number handle
    el.querySelectorAll('.pmap__step-number').forEach(handle => {
      handle.addEventListener('mousedown', () => {
        const row = handle.closest('.pmap__step-row');
        if (row) row.setAttribute('draggable', 'true');
      });
    });

    // Remove draggable after drag ends (so text inputs etc. work normally)
    document.addEventListener('mouseup', () => {
      el.querySelectorAll('.pmap__step-row[draggable]').forEach(r =>
        r.removeAttribute('draggable')
      );
    }, { once: false });

    el.querySelectorAll('.pmap__step-row').forEach(row => {
      row.addEventListener('dragstart', (e) => {
        this._draggedId = row.dataset.stepId;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => row.classList.add('pmap__step-row--dragging'), 0);
      });

      row.addEventListener('dragend', () => {
        row.removeAttribute('draggable');
        el.querySelectorAll('.pmap__step-row').forEach(r =>
          r.classList.remove('pmap__step-row--dragging', 'pmap__step-row--drag-over')
        );
        this._draggedId = null;
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (row.dataset.stepId !== this._draggedId) {
          row.classList.add('pmap__step-row--drag-over');
        }
      });

      row.addEventListener('dragleave', (e) => {
        if (!row.contains(e.relatedTarget)) {
          row.classList.remove('pmap__step-row--drag-over');
        }
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetId = row.dataset.stepId;
        if (!this._draggedId || this._draggedId === targetId) return;

        const from = this._steps.findIndex(s => s.id === this._draggedId);
        const to = this._steps.findIndex(s => s.id === targetId);
        if (from === -1 || to === -1) return;

        const [moved] = this._steps.splice(from, 1);
        this._steps.splice(to, 0, moved);
        this._validateLoopTargets();

        this._draggedId = null;
        this._save();
        this._render();
      });
    });

    // ── IO drag & drop (within each step's inputs/outputs) ──
    this._initIODragDrop(el);

    // ── Substep drag & drop (within each step) ──
    this._initSubstepDragDrop(el);
  },

  _initIODragDrop(el) {
    let draggedIOId = null;
    let draggedIOStepId = null;
    let draggedIOType = null;

    el.querySelectorAll('.pmap__io-dot').forEach(handle => {
      const item = handle.closest('.pmap__io-item');
      if (!item || !item.dataset.ioId) return;
      handle.addEventListener('mousedown', () => {
        item.setAttribute('draggable', 'true');
      });
    });

    el.querySelectorAll('.pmap__io-item[data-io-id]').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        draggedIOId = item.dataset.ioId;
        draggedIOStepId = item.dataset.ioStep;
        draggedIOType = item.dataset.ioType;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => item.classList.add('pmap__io-item--dragging'), 0);
      });

      item.addEventListener('dragend', () => {
        item.removeAttribute('draggable');
        el.querySelectorAll('.pmap__io-item').forEach(i =>
          i.classList.remove('pmap__io-item--dragging', 'pmap__io-item--drag-over')
        );
        draggedIOId = null;
        draggedIOStepId = null;
        draggedIOType = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        if (item.dataset.ioId !== draggedIOId
            && item.dataset.ioStep === draggedIOStepId
            && item.dataset.ioType === draggedIOType) {
          item.classList.add('pmap__io-item--drag-over');
        }
      });

      item.addEventListener('dragleave', (e) => {
        if (!item.contains(e.relatedTarget)) {
          item.classList.remove('pmap__io-item--drag-over');
        }
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetId = item.dataset.ioId;
        if (!draggedIOId || draggedIOId === targetId) return;
        if (item.dataset.ioStep !== draggedIOStepId) return;
        if (item.dataset.ioType !== draggedIOType) return;

        const step = this._steps.find(s => s.id === draggedIOStepId);
        if (!step) return;
        const arr = step[draggedIOType];
        if (!Array.isArray(arr)) return;

        const from = arr.findIndex(io => io.id === draggedIOId);
        const to = arr.findIndex(io => io.id === targetId);
        if (from === -1 || to === -1) return;

        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);

        draggedIOId = null;
        draggedIOStepId = null;
        draggedIOType = null;
        this._save();
        this._render();
      });
    });
  },

  _initSubstepDragDrop(el) {
    let draggedSubId = null;
    let draggedParentId = null;

    // Enable draggable only via substep-number handle
    el.querySelectorAll('.pmap__substep-number').forEach(handle => {
      handle.addEventListener('mousedown', () => {
        const item = handle.closest('.pmap__substep-item');
        if (item) item.setAttribute('draggable', 'true');
      });
    });

    el.querySelectorAll('.pmap__substep-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        draggedSubId = item.dataset.substepId;
        draggedParentId = item.dataset.parentId;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => item.classList.add('pmap__substep-item--dragging'), 0);
      });

      item.addEventListener('dragend', () => {
        item.removeAttribute('draggable');
        el.querySelectorAll('.pmap__substep-item').forEach(i =>
          i.classList.remove('pmap__substep-item--dragging', 'pmap__substep-item--drag-over')
        );
        draggedSubId = null;
        draggedParentId = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        if (item.dataset.substepId !== draggedSubId && item.dataset.parentId === draggedParentId) {
          item.classList.add('pmap__substep-item--drag-over');
        }
      });

      item.addEventListener('dragleave', (e) => {
        if (!item.contains(e.relatedTarget)) {
          item.classList.remove('pmap__substep-item--drag-over');
        }
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetSubId = item.dataset.substepId;
        if (!draggedSubId || draggedSubId === targetSubId) return;
        if (item.dataset.parentId !== draggedParentId) return;

        const step = this._steps.find(s => s.id === draggedParentId);
        if (!step || !Array.isArray(step.substeps)) return;

        const from = step.substeps.findIndex(ss => ss.id === draggedSubId);
        const to = step.substeps.findIndex(ss => ss.id === targetSubId);
        if (from === -1 || to === -1) return;

        const [moved] = step.substeps.splice(from, 1);
        step.substeps.splice(to, 0, moved);

        draggedSubId = null;
        draggedParentId = null;
        this._save();
        this._render();
      });
    });
  },

  // ─── Loop Brackets (visual connector lines) ───────────────

  _renderLoopBrackets() {
    const flow = this._container.querySelector('[data-ref="flow"]');
    if (!flow) return;
    flow.querySelectorAll('.pmap__loop-bracket, .pmap__loop-panel').forEach(b => b.remove());

    const t = (key, params) => this._context.i18n.t(`modules.process-map.${key}`, params);

    const loops = [];
    this._steps.forEach((step, idx) => {
      if (!step.loop) return;
      const targetIdx = step.loop.targetStepId
        ? this._steps.findIndex(s => s.id === step.loop.targetStepId)
        : -1;
      loops.push({ step, idx, targetIdx, span: targetIdx >= 0 ? idx - targetIdx : 0 });
    });
    if (!loops.length) return;

    loops.sort((a, b) => b.span - a.span);
    const flowRect = flow.getBoundingClientRect();

    const table = flow.querySelector('.pmap__table');
    const tableRight = table
      ? table.getBoundingClientRect().right - flowRect.left
      : flowRect.width;
    const bracketBaseX = tableRight + 24;
    const panelX = bracketBaseX + 28;

    loops.forEach((lp, lane) => {
      const sourceRow = flow.querySelector(`.pmap__step-row[data-step-id="${lp.step.id}"]`);
      const bracketX = bracketBaseX + lane * 28;

      // Bracket line (only when target is set)
      if (lp.targetIdx >= 0 && lp.targetIdx < lp.idx) {
        const targetRow = flow.querySelector(`.pmap__step-row[data-step-id="${lp.step.loop.targetStepId}"]`);
        if (sourceRow && targetRow) {
          const sourceRect = sourceRow.getBoundingClientRect();
          const targetRect = targetRow.getBoundingClientRect();
          const bTop = targetRect.top - flowRect.top + targetRect.height * 0.3;
          const bBottom = sourceRect.bottom - flowRect.top - sourceRect.height * 0.3;
          const bHeight = bBottom - bTop;
          if (bHeight >= 10) {
            const bracket = document.createElement('div');
            bracket.className = 'pmap__loop-bracket';
            bracket.style.top = `${bTop}px`;
            bracket.style.height = `${bHeight}px`;
            bracket.style.left = `${bracketX}px`;
            bracket.innerHTML = '<span class="pmap__loop-bracket-arrow"></span>';
            flow.appendChild(bracket);
          }
        }
      }

      // Panel — always rendered, vertically centered on bracket or aligned to source row
      const panelHtml = this._renderLoopPanel(lp.step, lp.idx, t);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = panelHtml;
      const panel = wrapper.firstElementChild;
      panel.style.position = 'absolute';
      panel.style.left = `${panelX + lane * 28}px`;
      flow.appendChild(panel);

      // Compute vertical center after panel is in DOM
      requestAnimationFrame(() => {
        if (!sourceRow) return;
        const sourceRect = sourceRow.getBoundingClientRect();
        const panelH = panel.offsetHeight;

        if (lp.targetIdx >= 0 && lp.targetIdx < lp.idx) {
          const targetRow = flow.querySelector(`.pmap__step-row[data-step-id="${lp.step.loop.targetStepId}"]`);
          if (targetRow) {
            const targetRect = targetRow.getBoundingClientRect();
            const bTop = targetRect.top - flowRect.top + targetRect.height * 0.3;
            const bBottom = sourceRect.bottom - flowRect.top - sourceRect.height * 0.3;
            const midY = (bTop + bBottom) / 2;
            panel.style.top = `${midY - panelH / 2}px`;
            return;
          }
        }
        const rowMidY = sourceRect.top - flowRect.top + sourceRect.height / 2;
        panel.style.top = `${rowMidY - panelH / 2}px`;
      });

      this._bindLoopPanelEvents(panel, lp.step);
    });
  },

  _bindLoopPanelEvents(panel, step) {
    panel.querySelector('[data-action="remove-loop"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._removeLoop(step.id);
    });

    panel.querySelector('.pmap__loop-condition')?.addEventListener('input', (e) => {
      if (step.loop) {
        step.loop.condition = e.target.value;
        this._save();
      }
    });

    panel.querySelector('.pmap__loop-target-select')?.addEventListener('change', (e) => {
      if (step.loop) {
        step.loop.targetStepId = e.target.value || null;
        this._save();
        this._renderLoopBrackets();
      }
    });

    panel.querySelector('[data-action="add-loop-step"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._addLoopStep(step.id);
    });

    panel.querySelectorAll('[data-action="remove-loop-step"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._removeLoopStep(step.id, btn.dataset.loopStepId);
      });
    });

    panel.querySelectorAll('.pmap__loop-step-title').forEach(input => {
      input.addEventListener('input', () => {
        if (!step.loop) return;
        const ls = step.loop.steps.find(s => s.id === input.dataset.loopStepId);
        if (ls) {
          ls.title = input.value;
          this._save();
        }
      });
    });
  },

  // ─── Export ───────────────────────────────────────────────

  _exportJSON() {
    const out = {
      tool: 'ProcessMap',
      timestamp: new Date().toISOString(),
      steps: this._steps.map((s, i) => ({
        step: i + 1,
        title: s.title,
        description: s.description,
        valueType: s.valueType || null,
        inputs: s.inputs.filter(io => io.name).map(io => ({
          name: io.name,
          ...(io.inputType ? { type: io.inputType } : {}),
        })),
        outputs: s.outputs.map(io => io.name).filter(Boolean),
        substeps: (s.substeps || []).map((ss, si) => ({
          step: `${i + 1}.${si + 1}`,
          title: ss.title,
        })),
        ...(s.loop ? {
          loop: {
            condition: s.loop.condition || '',
            targetStep: s.loop.targetStepId
              ? this._steps.findIndex(st => st.id === s.loop.targetStepId) + 1
              : null,
            steps: (s.loop.steps || []).map(ls => ls.title),
          },
        } : {}),
      })),
    };
    downloadFile(JSON.stringify(out, null, 2), 'process-map.json', 'application/json');
    this._context.notify('JSON ✓', 'success');
  },

  _exportCSV(t) {
    let csv = 'sep=;\n';
    csv += [
      `"${t('csvStep')}"`,
      `"${t('csvTitle')}"`,
      `"${t('csvDescription')}"`,
      `"${t('csvValueType')}"`,
      `"${t('inputs')}"`,
      `"${t('outputs')}"`,
      `"${t('loopLabel')}"`,
    ].join(';') + '\n';

    const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
    const vtLabel = (vt) => vt ? t(`${vt}Long`) : '';
    const fmtInput = (io) => {
      if (!io.name) return '';
      if (io.inputType === 'param') return `${io.name} (x)`;
      if (io.inputType === 'noise') return `${io.name} (n)`;
      return io.name;
    };
    const fmtLoop = (s) => {
      if (!s.loop) return '';
      const parts = [];
      if (s.loop.condition) parts.push(s.loop.condition);
      if (s.loop.targetStepId) {
        const ti = this._steps.findIndex(st => st.id === s.loop.targetStepId);
        if (ti !== -1) parts.push(`→ ${t('csvStep')} ${String(ti + 1).padStart(2, '0')}`);
      }
      const ls = (s.loop.steps || []).map(l => l.title).filter(Boolean);
      if (ls.length) parts.push(`[${ls.join(', ')}]`);
      return parts.join(' ');
    };

    this._steps.forEach((s, i) => {
      csv += [
        esc(i + 1),
        esc(s.title),
        esc(s.description),
        esc(vtLabel(s.valueType)),
        esc(s.inputs.map(fmtInput).filter(Boolean).join(', ')),
        esc(s.outputs.map(io => io.name).filter(Boolean).join(', ')),
        esc(fmtLoop(s)),
      ].join(';') + '\n';

      (s.substeps || []).forEach((ss, si) => {
        csv += [
          esc(`${i + 1}.${si + 1}`),
          esc(`  ${ss.title}`),
          esc(''),
          esc(''),
          esc(''),
          esc(''),
          esc(''),
        ].join(';') + '\n';
      });
    });

    downloadFile(csv, 'process-map.csv', 'text/csv;charset=utf-8');
    this._context.notify('CSV ✓', 'success');
  },

  async _exportXLSX(t) {
    try { await ensureXLSX(); } catch { this._context.notify?.('XLSX library not loaded'); return; }

    const rows = [];
    rows.push([t('csvStep'), t('csvTitle'), t('csvDescription'), t('csvValueType'), t('inputs'), t('outputs'), t('loopLabel')]);
    const vtLabel = (vt) => vt ? t(`${vt}Long`) : '';
    const fmtInput = (io) => {
      if (!io.name) return '';
      if (io.inputType === 'param') return `${io.name} (x)`;
      if (io.inputType === 'noise') return `${io.name} (n)`;
      return io.name;
    };
    const fmtLoop = (s) => {
      if (!s.loop) return '';
      const parts = [];
      if (s.loop.condition) parts.push(s.loop.condition);
      if (s.loop.targetStepId) {
        const ti = this._steps.findIndex(st => st.id === s.loop.targetStepId);
        if (ti !== -1) parts.push(`→ ${t('csvStep')} ${String(ti + 1).padStart(2, '0')}`);
      }
      const ls = (s.loop.steps || []).map(l => l.title).filter(Boolean);
      if (ls.length) parts.push(`[${ls.join(', ')}]`);
      return parts.join(' ');
    };

    this._steps.forEach((s, i) => {
      rows.push([
        i + 1,
        s.title,
        s.description,
        vtLabel(s.valueType),
        s.inputs.map(fmtInput).filter(Boolean).join(', '),
        s.outputs.map(io => io.name).filter(Boolean).join(', '),
        fmtLoop(s),
      ]);
      (s.substeps || []).forEach((ss, si) => {
        rows.push([`${i + 1}.${si + 1}`, `  ${ss.title}`, '', '', '', '', '']);
      });
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Process Map');
    XLSX.writeFile(wb, 'process-map.xlsx');
    this._context.notify('Excel ✓', 'success');
  },

  _exportImage(format, t) {
    const cs = getComputedStyle(document.documentElement);
    const cv = (v, fb) => cs.getPropertyValue(v).trim() || fb;

    const c = {
      bgPrimary:    cv('--color-bg-primary', '#ffffff'),
      bgSecondary:  cv('--color-bg-secondary', '#f8f9fa'),
      bgTertiary:   cv('--color-bg-tertiary', '#e9ecef'),
      border:       cv('--color-border-secondary', '#dee2e6'),
      borderStrong: cv('--color-border-primary', '#cacad0'),
      textPrimary:  cv('--color-text-primary', '#212529'),
      textSecondary: cv('--color-text-secondary', '#6c757d'),
      textTertiary: cv('--color-text-tertiary', '#adb5bd'),
      accent:       cv('--color-accent', '#0066cc'),
      accentBg:     cv('--color-pmap-step-accent-bg', 'rgba(0,102,204,0.10)'),
      inputColor:   cv('--color-pmap-input', '#34c759'),
      inputBg:      cv('--color-pmap-input-bg', 'rgba(52,199,89,0.10)'),
      outputColor:  cv('--color-pmap-output', '#ff9500'),
      outputBg:     cv('--color-pmap-output-bg', 'rgba(255,149,0,0.10)'),
      connector:    cv('--color-pmap-connector', '#dee2e6'),
      va:           cv('--color-pmap-va', '#34c759'),
      vaBg:         cv('--color-pmap-va-bg', 'rgba(52,199,89,0.12)'),
      bnva:         cv('--color-pmap-bnva', '#ff9f0a'),
      bnvaBg:       cv('--color-pmap-bnva-bg', 'rgba(255,159,10,0.12)'),
      nva:          cv('--color-pmap-nva', '#ff3b30'),
      nvaBg:        cv('--color-pmap-nva-bg', 'rgba(255,59,48,0.12)'),
      param:        cv('--color-pmap-param', '#007aff'),
      paramBg:      cv('--color-pmap-param-bg', 'rgba(0,122,255,0.12)'),
      noise:        cv('--color-pmap-noise', '#af52de'),
      noiseBg:      cv('--color-pmap-noise-bg', 'rgba(175,82,222,0.12)'),
    };

    // Layout constants — match CSS grid: 1fr | 240–300px | 1fr
    const PAD = 20;
    const CARD_W = 280;
    const IO_PANEL_W = 160;
    const IO_GAP_X = 12;
    const IO_ITEM_H = 28;
    const IO_ITEM_GAP = 6;
    const IO_LABEL_H = 18;
    const HEADER_H = 36;
    const DESC_LINE_H = 18;
    const SUBSTEP_H = 26;
    const SUBSTEPS_BAR_H = 24;
    const CONNECTOR_H = 28;

    const stepLayouts = this._steps.map(s => {
      const descH = s.description ? DESC_LINE_H + 8 : 0;
      const subCount = (s.substeps || []).length;
      const subH = subCount > 0 ? SUBSTEPS_BAR_H + subCount * SUBSTEP_H + 8 : SUBSTEPS_BAR_H;
      const cardH = HEADER_H + descH + subH;
      const inCount = s.inputs.filter(io => io.name).length;
      const outCount = s.outputs.filter(io => io.name).length;
      const ioH = IO_LABEL_H + 6 + Math.max(inCount, outCount, 0) * (IO_ITEM_H + IO_ITEM_GAP);
      return { cardH, ioH, inCount, outCount, rowH: Math.max(cardH, ioH) };
    });

    const totalH = stepLayouts.reduce((a, l) => a + l.rowH, 0)
      + Math.max(0, this._steps.length - 1) * CONNECTOR_H;
    const W = PAD * 2 + IO_PANEL_W + IO_GAP_X + CARD_W + IO_GAP_X + IO_PANEL_W;
    const H = PAD * 2 + totalH;
    const cardX = PAD + IO_PANEL_W + IO_GAP_X;

    if (format === 'png') {
      this._drawPmapCanvas(W, H, cardX, PAD, CARD_W, IO_PANEL_W, IO_GAP_X,
        IO_ITEM_H, IO_ITEM_GAP, IO_LABEL_H, HEADER_H, DESC_LINE_H, SUBSTEP_H,
        SUBSTEPS_BAR_H, CONNECTOR_H, stepLayouts, c, t);
    } else {
      this._drawPmapSVGOut(W, H, cardX, PAD, CARD_W, IO_PANEL_W, IO_GAP_X,
        IO_ITEM_H, IO_ITEM_GAP, IO_LABEL_H, HEADER_H, DESC_LINE_H, SUBSTEP_H,
        SUBSTEPS_BAR_H, CONNECTOR_H, stepLayouts, c, t);
    }
  },

  _drawPmapCanvas(W, H, cardX, PAD, CARD_W, IO_PW, IO_GX,
    IO_IH, IO_IG, IO_LH, HDR_H, DESC_LH, SUB_H, SUB_BAR_H,
    CONN_H, layouts, c, t) {

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const FONT = '13px "DM Sans", system-ui, sans-serif';
    const FONT_SM = '11px "DM Sans", system-ui, sans-serif';
    const FONT_XS = '10px "DM Sans", system-ui, sans-serif';
    const FONT_MONO_XS = '11px "JetBrains Mono", monospace';
    const FONT_TITLE = '600 13px "DM Sans", system-ui, sans-serif';
    const FONT_LABEL = '600 10px "DM Sans", system-ui, sans-serif';

    ctx.fillStyle = c.bgPrimary;
    ctx.fillRect(0, 0, W, H);

    let y = PAD;

    this._steps.forEach((step, idx) => {
      const layout = layouts[idx];
      const rowH = layout.rowH;

      // ── Step card ──
      ctx.fillStyle = c.bgSecondary;
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 1;
      this._roundRect(ctx, cardX, y, CARD_W, layout.cardH, 8);
      ctx.fill();
      ctx.stroke();

      // Header border
      ctx.strokeStyle = c.border;
      ctx.beginPath();
      ctx.moveTo(cardX, y + HDR_H);
      ctx.lineTo(cardX + CARD_W, y + HDR_H);
      ctx.stroke();

      // Step number pill badge
      const numText = String(idx + 1).padStart(2, '0');
      ctx.font = FONT_MONO_XS;
      const numW = ctx.measureText(numText).width + 12;
      const pillX = cardX + 10;
      const pillY = y + 8;
      const pillH = 20;
      this._roundRect(ctx, pillX, pillY, numW, pillH, 4);
      ctx.fillStyle = c.accentBg;
      ctx.fill();
      ctx.fillStyle = c.accent;
      ctx.font = FONT_MONO_XS;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(numText, pillX + numW / 2, pillY + pillH / 2);

      // Value type badge (VA / BNVA / NVA)
      let titleOffsetX = pillX + numW + 8;
      if (step.valueType) {
        const vtText = t(step.valueType);
        ctx.font = FONT_LABEL;
        const vtW = ctx.measureText(vtText).width + 10;
        const vtX = pillX + numW + 4;
        const vtColors = { va: [c.va, c.vaBg], bnva: [c.bnva, c.bnvaBg], nva: [c.nva, c.nvaBg] };
        const [vtFg, vtBgColor] = vtColors[step.valueType];
        this._roundRect(ctx, vtX, pillY, vtW, pillH, 4);
        ctx.fillStyle = vtBgColor;
        ctx.fill();
        ctx.fillStyle = vtFg;
        ctx.font = FONT_LABEL;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(vtText, vtX + vtW / 2, pillY + pillH / 2);
        titleOffsetX = vtX + vtW + 6;
      }

      // Title
      ctx.fillStyle = c.textPrimary;
      ctx.font = FONT_TITLE;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const title = step.title || t('stepNamePlaceholder');
      ctx.fillText(this._truncate(title, 28), titleOffsetX, pillY + pillH / 2);

      // Description
      let contentY = y + HDR_H;
      if (step.description) {
        contentY += 8;
        ctx.fillStyle = c.textSecondary;
        ctx.font = FONT_SM;
        ctx.textAlign = 'left';
        ctx.fillText(this._truncate(step.description, 42), cardX + 12, contentY + DESC_LH / 2);
        contentY += DESC_LH;
      }

      // Substeps bar
      const barY = y + layout.cardH - SUB_BAR_H - ((step.substeps || []).length > 0 ? (step.substeps.length * SUB_H + 8) : 0);
      ctx.strokeStyle = c.border;
      ctx.beginPath();
      ctx.moveTo(cardX, barY);
      ctx.lineTo(cardX + CARD_W, barY);
      ctx.stroke();

      const hasSubsteps = (step.substeps || []).length > 0;
      ctx.fillStyle = hasSubsteps ? c.accent : c.textTertiary;
      ctx.font = FONT_LABEL;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const barLabel = t('substepsLabel') + (hasSubsteps ? ` (${step.substeps.length})` : '');
      ctx.fillText(barLabel, cardX + 24, barY + SUB_BAR_H / 2);
      // Chevron
      ctx.fillText(hasSubsteps ? '▾' : '▸', cardX + 10, barY + SUB_BAR_H / 2);

      // Substep items
      if (hasSubsteps) {
        const subAreaY = barY + SUB_BAR_H;
        ctx.fillStyle = c.bgTertiary;
        this._roundRectBottom(ctx, cardX, subAreaY, CARD_W, step.substeps.length * SUB_H + 8, 8);
        ctx.fill();

        step.substeps.forEach((ss, si) => {
          const sy = subAreaY + 4 + si * SUB_H;
          // Substep pill
          ctx.fillStyle = c.bgSecondary;
          this._roundRect(ctx, cardX + 8, sy, CARD_W - 16, SUB_H - 2, 4);
          ctx.fill();

          // Number badge
          const subNum = `${idx + 1}.${si + 1}`;
          ctx.font = FONT_MONO_XS;
          ctx.fillStyle = c.accent;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(subNum, cardX + 14, sy + (SUB_H - 2) / 2);

          // Title
          ctx.fillStyle = c.textPrimary;
          ctx.font = FONT_SM;
          ctx.fillText(this._truncate(ss.title, 30), cardX + 48, sy + (SUB_H - 2) / 2);
        });
      }

      // ── IO panels ──
      const ioBaseY = y + 4;

      // Inputs (left)
      const inX = PAD;
      if (step.inputs.length > 0) {
        ctx.fillStyle = c.inputColor;
        ctx.font = FONT_LABEL;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('● ' + t('inputs').toUpperCase() + ' »', inX, ioBaseY + IO_LH / 2);

        step.inputs.forEach((io, i) => {
          if (!io.name) return;
          const iy = ioBaseY + IO_LH + 6 + i * (IO_IH + IO_IG);
          ctx.fillStyle = c.inputBg;
          this._roundRect(ctx, inX, iy, IO_PW, IO_IH, 4);
          ctx.fill();

          ctx.fillStyle = c.inputColor;
          ctx.beginPath();
          ctx.arc(inX + 10, iy + IO_IH / 2, 3.5, 0, Math.PI * 2);
          ctx.fill();

          let nameX = inX + 20;
          if (io.inputType) {
            const itLabel = io.inputType === 'param' ? t('inputTypeParam') : t('inputTypeNoise');
            const itFg = io.inputType === 'param' ? c.param : c.noise;
            const itBg = io.inputType === 'param' ? c.paramBg : c.noiseBg;
            ctx.font = FONT_LABEL;
            const itW = ctx.measureText(itLabel).width + 6;
            this._roundRect(ctx, inX + 18, iy + 4, itW, IO_IH - 8, 3);
            ctx.fillStyle = itBg;
            ctx.fill();
            ctx.fillStyle = itFg;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(itLabel, inX + 18 + itW / 2, iy + IO_IH / 2);
            nameX = inX + 18 + itW + 4;
          }

          ctx.fillStyle = c.textPrimary;
          ctx.font = FONT_SM;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(this._truncate(io.name, io.inputType ? 16 : 20), nameX, iy + IO_IH / 2);
        });
      }

      // Outputs (right)
      const outX = cardX + CARD_W + IO_GX;
      if (step.outputs.length > 0) {
        ctx.fillStyle = c.outputColor;
        ctx.font = FONT_LABEL;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('» ' + t('outputs').toUpperCase() + ' ●', outX, ioBaseY + IO_LH / 2);

        step.outputs.forEach((io, i) => {
          if (!io.name) return;
          const iy = ioBaseY + IO_LH + 6 + i * (IO_IH + IO_IG);
          ctx.fillStyle = c.outputBg;
          this._roundRect(ctx, outX, iy, IO_PW, IO_IH, 4);
          ctx.fill();

          ctx.fillStyle = c.outputColor;
          ctx.beginPath();
          ctx.arc(outX + IO_PW - 10, iy + IO_IH / 2, 3.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = c.textPrimary;
          ctx.font = FONT_SM;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(this._truncate(io.name, 20), outX + 6, iy + IO_IH / 2);
        });
      }

      y += rowH;

      // ── Connector arrow between steps ──
      if (idx < this._steps.length - 1) {
        const ax = cardX + CARD_W / 2;
        const ay1 = y + 2;
        const ay2 = y + CONN_H - 2;
        ctx.strokeStyle = c.connector;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay1);
        ctx.lineTo(ax, ay2);
        ctx.stroke();
        // Small arrowhead
        ctx.fillStyle = c.connector;
        ctx.beginPath();
        ctx.moveTo(ax - 4, ay2 - 5);
        ctx.lineTo(ax + 4, ay2 - 5);
        ctx.lineTo(ax, ay2);
        ctx.closePath();
        ctx.fill();
        y += CONN_H;
      }
    });

    canvas.toBlob(blob => downloadBlob(blob, 'process-map.png'), 'image/png');
    this._context.notify('PNG ✓', 'success');
  },

  _drawPmapSVGOut(W, H, cardX, PAD, CARD_W, IO_PW, IO_GX,
    IO_IH, IO_IG, IO_LH, HDR_H, DESC_LH, SUB_H, SUB_BAR_H,
    CONN_H, layouts, c, t) {

    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const svgFill = (color) => {
      if (!color) return 'fill="none"';
      const m = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/);
      if (m) {
        const hex = `#${(+m[1]).toString(16).padStart(2,'0')}${(+m[2]).toString(16).padStart(2,'0')}${(+m[3]).toString(16).padStart(2,'0')}`;
        const a = m[4] !== undefined ? +m[4] : 1;
        return a < 1 ? `fill="${hex}" fill-opacity="${a}"` : `fill="${hex}"`;
      }
      return `fill="${color}"`;
    };

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    svg += `<rect width="${W}" height="${H}" ${svgFill(c.bgPrimary)}/>`;

    let y = PAD;

    this._steps.forEach((step, idx) => {
      const layout = layouts[idx];
      const rowH = layout.rowH;
      const hasSubsteps = (step.substeps || []).length > 0;

      // ── Step card ──
      svg += `<rect x="${cardX}" y="${y}" width="${CARD_W}" height="${layout.cardH}" rx="8" ${svgFill(c.bgSecondary)} stroke="${c.border}"/>`;
      svg += `<line x1="${cardX}" y1="${y + HDR_H}" x2="${cardX + CARD_W}" y2="${y + HDR_H}" stroke="${c.border}"/>`;

      // Step number pill
      const numText = String(idx + 1).padStart(2, '0');
      const numW = numText.length * 7 + 12;
      const pillX = cardX + 10;
      const pillY = y + 8;
      const pillH = 20;
      svg += `<rect x="${pillX}" y="${pillY}" width="${numW}" height="${pillH}" rx="4" ${svgFill(c.accentBg)}/>`;
      svg += `<text x="${pillX + numW / 2}" y="${pillY + pillH / 2}" fill="${c.accent}" font-size="11" font-family="JetBrains Mono, monospace" text-anchor="middle" dominant-baseline="central">${numText}</text>`;

      // Value type badge + Title
      let titleSvgX = pillX + numW + 8;
      if (step.valueType) {
        const vtText = t(step.valueType);
        const vtW = vtText.length * 7 + 10;
        const vtX = pillX + numW + 4;
        const vtColors = { va: [c.va, c.vaBg], bnva: [c.bnva, c.bnvaBg], nva: [c.nva, c.nvaBg] };
        const [vtFg, vtBgColor] = vtColors[step.valueType];
        svg += `<rect x="${vtX}" y="${pillY}" width="${vtW}" height="${pillH}" rx="4" ${svgFill(vtBgColor)}/>`;
        svg += `<text x="${vtX + vtW / 2}" y="${pillY + pillH / 2}" fill="${vtFg}" font-size="10" font-weight="600" font-family="DM Sans, system-ui, sans-serif" text-anchor="middle" dominant-baseline="central">${esc(vtText)}</text>`;
        titleSvgX = vtX + vtW + 6;
      }
      const title = step.title || t('stepNamePlaceholder');
      svg += `<text x="${titleSvgX}" y="${pillY + pillH / 2}" fill="${c.textPrimary}" font-size="13" font-weight="600" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(this._truncate(title, 28))}</text>`;

      // Description
      if (step.description) {
        svg += `<text x="${cardX + 12}" y="${y + HDR_H + 8 + DESC_LH / 2}" fill="${c.textSecondary}" font-size="11" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(this._truncate(step.description, 42))}</text>`;
      }

      // Substeps bar
      const barY = y + layout.cardH - SUB_BAR_H - (hasSubsteps ? (step.substeps.length * SUB_H + 8) : 0);
      svg += `<line x1="${cardX}" y1="${barY}" x2="${cardX + CARD_W}" y2="${barY}" stroke="${c.border}"/>`;
      const barColor = hasSubsteps ? c.accent : c.textTertiary;
      const chevron = hasSubsteps ? '▾' : '▸';
      const barLabel = t('substepsLabel') + (hasSubsteps ? ` (${step.substeps.length})` : '');
      svg += `<text x="${cardX + 10}" y="${barY + SUB_BAR_H / 2}" fill="${barColor}" font-size="10" font-weight="600" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${chevron}</text>`;
      svg += `<text x="${cardX + 24}" y="${barY + SUB_BAR_H / 2}" fill="${barColor}" font-size="10" font-weight="600" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(barLabel)}</text>`;

      // Substep items
      if (hasSubsteps) {
        const subAreaY = barY + SUB_BAR_H;
        const subAreaH = step.substeps.length * SUB_H + 8;
        svg += `<path d="M${cardX},${subAreaY} L${cardX + CARD_W},${subAreaY} L${cardX + CARD_W},${subAreaY + subAreaH - 8} Q${cardX + CARD_W},${subAreaY + subAreaH} ${cardX + CARD_W - 8},${subAreaY + subAreaH} L${cardX + 8},${subAreaY + subAreaH} Q${cardX},${subAreaY + subAreaH} ${cardX},${subAreaY + subAreaH - 8} Z" ${svgFill(c.bgTertiary)}/>`;

        step.substeps.forEach((ss, si) => {
          const sy = subAreaY + 4 + si * SUB_H;
          svg += `<rect x="${cardX + 8}" y="${sy}" width="${CARD_W - 16}" height="${SUB_H - 2}" rx="4" ${svgFill(c.bgSecondary)}/>`;
          const subNum = `${idx + 1}.${si + 1}`;
          svg += `<text x="${cardX + 14}" y="${sy + (SUB_H - 2) / 2}" fill="${c.accent}" font-size="11" font-family="JetBrains Mono, monospace" dominant-baseline="central">${subNum}</text>`;
          svg += `<text x="${cardX + 48}" y="${sy + (SUB_H - 2) / 2}" fill="${c.textPrimary}" font-size="11" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(this._truncate(ss.title, 30))}</text>`;
        });
      }

      // ── IO panels ──
      const ioBaseY = y + 4;

      // Inputs (left)
      const inX = PAD;
      if (step.inputs.length > 0) {
        svg += `<text x="${inX}" y="${ioBaseY + IO_LH / 2}" fill="${c.inputColor}" font-size="10" font-weight="600" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc('● ' + t('inputs').toUpperCase() + ' »')}</text>`;

        step.inputs.forEach((io, i) => {
          if (!io.name) return;
          const iy = ioBaseY + IO_LH + 6 + i * (IO_IH + IO_IG);
          svg += `<rect x="${inX}" y="${iy}" width="${IO_PW}" height="${IO_IH}" rx="4" ${svgFill(c.inputBg)}/>`;
          svg += `<circle cx="${inX + 10}" cy="${iy + IO_IH / 2}" r="3.5" fill="${c.inputColor}"/>`;

          let nameXSvg = inX + 20;
          let nameMaxLen = 20;
          if (io.inputType) {
            const itLabel = io.inputType === 'param' ? t('inputTypeParam') : t('inputTypeNoise');
            const itFg = io.inputType === 'param' ? c.param : c.noise;
            const itBgColor = io.inputType === 'param' ? c.paramBg : c.noiseBg;
            const itW = itLabel.length * 7 + 6;
            svg += `<rect x="${inX + 18}" y="${iy + 4}" width="${itW}" height="${IO_IH - 8}" rx="3" ${svgFill(itBgColor)}/>`;
            svg += `<text x="${inX + 18 + itW / 2}" y="${iy + IO_IH / 2}" fill="${itFg}" font-size="10" font-weight="600" font-family="DM Sans, system-ui, sans-serif" text-anchor="middle" dominant-baseline="central">${esc(itLabel)}</text>`;
            nameXSvg = inX + 18 + itW + 4;
            nameMaxLen = 16;
          }
          svg += `<text x="${nameXSvg}" y="${iy + IO_IH / 2}" fill="${c.textPrimary}" font-size="11" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(this._truncate(io.name, nameMaxLen))}</text>`;
        });
      }

      // Outputs (right)
      const outX = cardX + CARD_W + IO_GX;
      if (step.outputs.length > 0) {
        svg += `<text x="${outX}" y="${ioBaseY + IO_LH / 2}" fill="${c.outputColor}" font-size="10" font-weight="600" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc('» ' + t('outputs').toUpperCase() + ' ●')}</text>`;

        step.outputs.forEach((io, i) => {
          if (!io.name) return;
          const iy = ioBaseY + IO_LH + 6 + i * (IO_IH + IO_IG);
          svg += `<rect x="${outX}" y="${iy}" width="${IO_PW}" height="${IO_IH}" rx="4" ${svgFill(c.outputBg)}/>`;
          svg += `<circle cx="${outX + IO_PW - 10}" cy="${iy + IO_IH / 2}" r="3.5" fill="${c.outputColor}"/>`;
          svg += `<text x="${outX + 6}" y="${iy + IO_IH / 2}" fill="${c.textPrimary}" font-size="11" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(this._truncate(io.name, 20))}</text>`;
        });
      }

      y += rowH;

      // ── Connector ──
      if (idx < this._steps.length - 1) {
        const ax = cardX + CARD_W / 2;
        const ay1 = y + 2;
        const ay2 = y + CONN_H - 2;
        svg += `<line x1="${ax}" y1="${ay1}" x2="${ax}" y2="${ay2}" stroke="${c.connector}" stroke-width="1.5"/>`;
        svg += `<polygon points="${ax - 4},${ay2 - 5} ${ax + 4},${ay2 - 5} ${ax},${ay2}" fill="${c.connector}"/>`;
        y += CONN_H;
      }
    });

    svg += '</svg>';
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'process-map.svg');
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

  _roundRectBottom(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.closePath();
  },

  // ─── Persistence ──────────────────────────────────────────

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      this.getState()
    );
  },

  // ─── Helpers ──────────────────────────────────────────────

  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _autoSizeTextarea(ta) {
    ta.style.height = '0';
    ta.style.height = ta.scrollHeight + 'px';
  },

  _truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  },
};
