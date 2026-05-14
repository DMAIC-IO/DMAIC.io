/**
 * D.Mike — Workspace Area (workspace.js)
 * Shows modules added to the active DMAIC phase as tabs.
 * Handles tab switching, module activation, and empty state.
 */

import { confirmPopout } from './popout.js';

export class Workspace {
  /**
   * @param {HTMLElement} container
   * @param {object} deps
   * @param {import('../core/module-registry.js').ModuleRegistry} deps.moduleRegistry
   * @param {import('../core/event-bus.js').EventBus} deps.eventBus
   * @param {import('../core/state-manager.js').StateManager} deps.stateManager
   * @param {import('../core/i18n.js').I18n} deps.i18n
   * @param {import('./modal.js').Modal} deps.modal
   */
  constructor(container, { moduleRegistry, eventBus, stateManager, i18n, modal, ...rest }) {
    this._container = container;
    this._moduleRegistry = moduleRegistry;
    this._eventBus = eventBus;
    this._stateManager = stateManager;
    this._i18n = i18n;
    this._modal = modal;
    this._context = rest; // remainder of context passed to modules
    this._activePhase = 'define';
    this._activeInstanceId = null;
    /** @type {Map<string, object>} instanceId → module instance */
    this._instances = new Map();
    /** @type {Map<string, HTMLElement>} instanceId → container element */
    this._containers = new Map();
  }

  /**
   * Render the workspace shell.
   */
  render() {
    this._container.className = 'app-workspace';

    // Build the workspace__content shell as a child WITHOUT touching
    // sibling nodes (e.g. #help-panel) that already live inside the
    // same <main> container — using innerHTML on the container would
    // wipe them out and detach their event listeners.
    const content = document.createElement('div');
    content.className = 'workspace__content';
    content.innerHTML = `
      <div class="workspace__tabs" role="tablist"></div>
      <div class="workspace__module-area"></div>
    `;
    // Insert before the help panel (if present) so workspace content
    // sits on the left and help panel on the right.
    const helpPanelEl = this._container.querySelector('#help-panel');
    if (helpPanelEl) {
      this._container.insertBefore(content, helpPanelEl);
    } else {
      this._container.appendChild(content);
    }

    this._tabsEl = content.querySelector('.workspace__tabs');
    this._moduleArea = content.querySelector('.workspace__module-area');

    this._subscribeEvents();
    this._showPhase('define');
  }

  // ─── Internal ───────────────────────────────────────────────

  _showPhase(phase) {
    // Persist all live module states before switching phase
    this._persistAllModuleStates();

    this._activePhase = phase;
    const instances = this._stateManager.get(`phases.${phase}`) ?? [];

    this._tabsEl.innerHTML = '';

    // Detach ALL children from moduleArea (module containers + empty-state div)
    // without destroying them. replaceChildren() severs the parent-child link
    // but keeps the nodes — with their content and event listeners — alive in
    // memory. This avoids the stale-empty-state and wrong-phase-container bugs.
    this._moduleArea.replaceChildren();

    if (instances.length === 0) {
      this._renderEmptyState();
      return;
    }

    instances.forEach(({ instanceId, moduleId }) => {
      this._renderTab(instanceId, moduleId, phase);
      // Re-attach the container for this instance if it already exists.
      // New instances get their container in _instantiateModule.
      const existing = this._containers.get(instanceId);
      if (existing) {
        if (existing.style.display !== 'none') {
          existing.dataset.displayStyle = existing.style.display;
        }
        existing.style.display = 'none';
        this._moduleArea.append(existing);
      }
    });

    // Keep the previously active tab if it still belongs to this phase,
    // otherwise fall back to the first tab.
    const ids = instances.map(i => i.instanceId);
    const keepId = ids.includes(this._activeInstanceId) ? this._activeInstanceId : ids[0];
    this._activateTab(keepId);
  }

  _renderTab(instanceId, moduleId, phase) {
    const tab = document.createElement('div');
    tab.className = 'workspace__tab';
    tab.dataset.instanceId = instanceId;
    tab.dataset.moduleId = moduleId;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('tabindex', '0');
    tab.setAttribute('draggable', 'true');

    const defaultName = this._i18n.t(`modules.${moduleId}.name`);
    const customName = this._getCustomName(instanceId, phase);
    tab.innerHTML = `
      <span class="workspace__tab-name">${customName || defaultName}</span>
      <span class="workspace__tab-close" title="${this._i18n.t('workspace.tabs.close')}" aria-label="${this._i18n.t('workspace.tabs.close')}">✕</span>
    `;

    tab.addEventListener('click', (e) => {
      if (!e.target.classList.contains('workspace__tab-close') &&
          !e.target.classList.contains('workspace__tab-name-input')) {
        this._activateTab(instanceId);
      }
    });
    tab.querySelector('.workspace__tab-close').addEventListener('click', () => {
      this._removeModule(instanceId, moduleId, phase);
    });

    // Double-click on tab name → inline rename
    const nameSpan = tab.querySelector('.workspace__tab-name');
    nameSpan.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (this._stateManager.isCompleted()) return;
      this._startTabRename(nameSpan, instanceId, moduleId, phase);
    });

    // ── Tab drag & drop ──
    tab.addEventListener('dragstart', (e) => {
      this._draggedTab = { instanceId, moduleId, phase };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-dmike-tab', JSON.stringify({ instanceId, moduleId, phase }));
      tab.classList.add('workspace__tab--dragging');
    });
    tab.addEventListener('dragend', () => {
      tab.classList.remove('workspace__tab--dragging');
      this._tabsEl.querySelectorAll('.workspace__tab').forEach(t =>
        t.classList.remove('workspace__tab--drop-before', 'workspace__tab--drop-after')
      );
      this._draggedTab = null;
    });
    tab.addEventListener('dragover', (e) => {
      if (!this._draggedTab) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = tab.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      const before = e.clientX < mid;
      tab.classList.toggle('workspace__tab--drop-before', before);
      tab.classList.toggle('workspace__tab--drop-after', !before);
    });
    tab.addEventListener('dragleave', () => {
      tab.classList.remove('workspace__tab--drop-before', 'workspace__tab--drop-after');
    });
    tab.addEventListener('drop', (e) => {
      e.preventDefault();
      tab.classList.remove('workspace__tab--drop-before', 'workspace__tab--drop-after');
      if (!this._draggedTab || this._draggedTab.instanceId === instanceId) return;

      const rect = tab.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      this._reorderTab(this._draggedTab, instanceId, before);
    });

    this._tabsEl.append(tab);
  }

  async _activateTab(instanceId) {
    // Persist all live module states so other modules can read them
    this._persistAllModuleStates();

    // Hide all module containers — preserve original display value
    this._containers.forEach((el, id) => {
      if (id === instanceId) {
        el.style.display = el.dataset.displayStyle || '';
      } else {
        if (el.style.display !== 'none') {
          el.dataset.displayStyle = el.style.display;
        }
        el.style.display = 'none';
      }
    });

    // Update tab active state
    this._tabsEl.querySelectorAll('.workspace__tab').forEach(tab => {
      tab.classList.toggle('workspace__tab--active', tab.dataset.instanceId === instanceId);
    });

    this._activeInstanceId = instanceId;

    // Instantiate module if not yet done
    if (!this._instances.has(instanceId)) {
      await this._instantiateModule(instanceId);
    }

    this._eventBus.emit('module:activated', { instanceId });
  }

  /**
   * Save all live module states so cross-module data access
   * (e.g. MSA reading worksheet columns) works reliably. Skips instances
   * that have already been dropped from `phases` — otherwise a freshly
   * removed module would resurrect its own state on the next tab switch.
   */
  _persistAllModuleStates() {
    const phases = this._stateManager.get('phases') || {};
    const live = new Set();
    for (const arr of Object.values(phases)) {
      if (Array.isArray(arr)) for (const i of arr) live.add(i.instanceId);
    }
    this._instances.forEach((instance, id) => {
      if (!live.has(id)) return;
      try {
        const state = instance.getState?.();
        if (!state) return;
        this._stateManager.setModuleState(id, state);
      } catch { /* ignore */ }
    });
  }

  async _instantiateModule(instanceId) {
    const phase = this._activePhase;
    const instances = this._stateManager.get(`phases.${phase}`) ?? [];
    const record = instances.find(i => i.instanceId === instanceId);
    if (!record) return;

    const moduleContainer = document.createElement('div');
    moduleContainer.style.height = '100%';
    moduleContainer.dataset.instanceId = instanceId;
    moduleContainer.dataset.moduleId = record.moduleId;
    this._moduleArea.append(moduleContainer);
    this._containers.set(instanceId, moduleContainer);

    const context = this._buildContext(instanceId);

    try {
      const instance = await this._moduleRegistry.instantiate(record.moduleId, moduleContainer, context);
      this._instances.set(instanceId, instance);

      // Restore saved state
      const saved = this._stateManager.getModuleState(instanceId);
      if (saved) {
        try { instance.setState?.(saved); } catch {}
      }
    } catch {
      // Error card already rendered by module registry
    }
  }

  /**
   * Get the currently active module instance, or null if no module is active.
   * @returns {object|null}
   */
  getActiveInstance() {
    if (!this._activeInstanceId) return null;
    return this._instances.get(this._activeInstanceId) || null;
  }

  /**
   * Get metadata for the currently active module: { instanceId, moduleId, instance }.
   * Returns null if no module is active.
   * @returns {{ instanceId: string, moduleId: string, instance: object }|null}
   */
  getActiveModuleInfo() {
    const instanceId = this._activeInstanceId;
    if (!instanceId) return null;
    const instance = this._instances.get(instanceId);
    if (!instance) return null;
    const phases = this._stateManager.get(`phases.${this._activePhase}`) ?? [];
    const record = phases.find(i => i.instanceId === instanceId);
    return {
      instanceId,
      moduleId: record?.moduleId || instance.id,
      instance,
    };
  }

  _buildContext(instanceId) {
    return {
      instanceId,
      eventBus: this._eventBus,
      stateManager: this._stateManager,
      i18n: this._i18n,
      showModal: this._modal,
      confirmPopout: (message, options = {}) => confirmPopout(message, { ...options, i18n: this._i18n }),
      notify: this._context.notify,
      chartManager: this._context.chartManager,
      examples: this._context.examples,
      theme: document.documentElement.dataset.theme || 'light',
      language: this._i18n.getLanguage(),
    };
  }

  async _removeModule(instanceId, moduleId, phase) {
    if (this._stateManager.isCompleted()) return;
    const name = this._i18n.t(`modules.${moduleId}.name`);
    const confirmed = await confirmPopout(
      this._i18n.t('workspace.removeConfirm', { name }),
      { i18n: this._i18n, danger: true }
    );
    if (!confirmed) return;

    // Destroy module instance
    const instance = this._instances.get(instanceId);
    try { await instance?.destroy?.(); } catch {}

    this._instances.delete(instanceId);
    this._containers.get(instanceId)?.remove();
    this._containers.delete(instanceId);

    // Remove from state
    const phases = this._stateManager.get(`phases.${phase}`) ?? [];
    this._stateManager.set(
      `phases.${phase}`,
      phases.filter(i => i.instanceId !== instanceId)
    );
    this._stateManager.removeModuleState(instanceId);

    this._eventBus.emit('module:removed', { moduleId, phase, instanceId });
    this._showPhase(phase);
  }

  /**
   * Get custom name for a module instance from state.
   * @param {string} instanceId
   * @param {string} phase
   * @returns {string|undefined}
   */
  _getCustomName(instanceId, phase) {
    const instances = this._stateManager.get(`phases.${phase}`) ?? [];
    const record = instances.find(i => i.instanceId === instanceId);
    return record?.customName;
  }

  /**
   * Save custom name for a module instance to state.
   * @param {string} instanceId
   * @param {string} phase
   * @param {string|null} name — null to clear
   */
  _setCustomName(instanceId, phase, name) {
    const instances = this._stateManager.get(`phases.${phase}`) ?? [];
    const record = instances.find(i => i.instanceId === instanceId);
    if (!record) return;
    if (name) {
      record.customName = name;
    } else {
      delete record.customName;
    }
    this._stateManager.set(`phases.${phase}`, instances);
  }

  /**
   * Replace tab-name span with an inline text input for renaming.
   */
  _startTabRename(nameSpan, instanceId, moduleId, phase) {
    const currentText = nameSpan.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'workspace__tab-name-input';
    input.value = currentText;

    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const val = input.value.trim();
      const defaultName = this._i18n.t(`modules.${moduleId}.name`);
      const newSpan = document.createElement('span');
      newSpan.className = 'workspace__tab-name';

      if (val && val !== defaultName) {
        newSpan.textContent = val;
        this._setCustomName(instanceId, phase, val);
      } else {
        newSpan.textContent = defaultName;
        this._setCustomName(instanceId, phase, null);
      }

      input.replaceWith(newSpan);

      // Re-bind dblclick on the new span
      newSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (this._stateManager.isCompleted()) return;
        this._startTabRename(newSpan, instanceId, moduleId, phase);
      });
    };

    let committed = false;
    input.addEventListener('blur', () => {
      if (!committed) { committed = true; commit(); }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!committed) { committed = true; commit(); }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        input.value = currentText; // restore original
        if (!committed) { committed = true; commit(); }
      }
    });
  }

  _renderEmptyState() {
    const el = document.createElement('div');
    el.className = 'workspace__empty';
    el.innerHTML = `
      <div class="workspace__empty-icon">⊞</div>
      <p class="workspace__empty-text">${this._i18n.t('workspace.emptyState')}</p>
    `;
    this._moduleArea.append(el);
  }

  /**
   * Reorder a dragged tab relative to a target tab within the same phase,
   * or move it into the current phase if it came from another one.
   */
  _reorderTab(dragged, targetInstanceId, insertBefore) {
    const targetPhase = this._activePhase;

    // If dragged from a different phase, move it first
    if (dragged.phase !== targetPhase) {
      if (!this._isPhaseAllowed(dragged.moduleId, targetPhase)) return;
      this._moveTabToPhase(dragged, targetPhase);
      dragged.phase = targetPhase;
    }

    const items = this._stateManager.get(`phases.${targetPhase}`) ?? [];
    const srcIdx = items.findIndex(i => i.instanceId === dragged.instanceId);
    if (srcIdx < 0) return;

    const [item] = items.splice(srcIdx, 1);
    let tgtIdx = items.findIndex(i => i.instanceId === targetInstanceId);
    if (tgtIdx < 0) tgtIdx = items.length;
    if (!insertBefore) tgtIdx++;
    items.splice(tgtIdx, 0, item);

    this._stateManager.set(`phases.${targetPhase}`, items);
    this._activeInstanceId = dragged.instanceId;
    this._showPhase(targetPhase);
  }

  /**
   * Move a tab from its source phase to a target phase (appends at end).
   * Called when dropping a tab onto a DMAIC tile.
   */
  moveTabToPhaseAndShow(dragged, targetPhase) {
    if (dragged.phase === targetPhase) {
      this._eventBus.emit('phase:selected', { phase: targetPhase });
      return;
    }
    if (!this._isPhaseAllowed(dragged.moduleId, targetPhase)) return;
    this._activeInstanceId = dragged.instanceId;
    // _moveTabToPhase emits module:removed + module:added;
    // the module:added listener already triggers phase:selected → _showPhase.
    this._moveTabToPhase(dragged, targetPhase);
  }

  /**
   * Check if a module is allowed in the given phase. Honors the cycle-specific
   * `cycles[activeCycle].allowedPhases` (Plan §3.2). Virtual tiles `data` and
   * `extras` are catch-all and accept any module.
   * @param {string} moduleId
   * @param {string} phase
   * @returns {boolean}
   */
  _isPhaseAllowed(moduleId, phase) {
    if (phase === 'data' || phase === 'extras') return true;
    const def = this._moduleRegistry.get(moduleId);
    if (!def) return true;
    const cycleId = this._stateManager.get('projectMeta.cycle') || 'dmaic';
    const allowed = def.cycles?.[cycleId]?.allowedPhases;
    if (allowed && !allowed.includes(phase)) return false;
    return true;
  }

  /**
   * Internal: remove module record from source phase and append to target phase.
   */
  _moveTabToPhase(dragged, targetPhase) {
    const srcItems = this._stateManager.get(`phases.${dragged.phase}`) ?? [];
    const idx = srcItems.findIndex(i => i.instanceId === dragged.instanceId);
    if (idx < 0) return;

    const [item] = srcItems.splice(idx, 1);
    this._stateManager.set(`phases.${dragged.phase}`, srcItems);
    this._eventBus.emit('module:removed', { moduleId: dragged.moduleId, phase: dragged.phase, instanceId: dragged.instanceId });

    const tgtItems = this._stateManager.get(`phases.${targetPhase}`) ?? [];
    tgtItems.push(item);
    this._stateManager.set(`phases.${targetPhase}`, tgtItems);
    this._eventBus.emit('module:added', { moduleId: dragged.moduleId, phase: targetPhase, instanceId: dragged.instanceId });
  }

  _subscribeEvents() {
    this._eventBus.on('phase:selected', ({ phase }) => this._showPhase(phase));
    this._eventBus.on('module:added', ({ phase, instanceId, silent }) => {
      if (silent) {
        // Silent add: refresh phase tabs without switching the active module
        if (this._activePhase === phase) {
          this._showPhase(phase);
          // Re-activate the tab that was active before
          if (this._activeInstanceId) {
            this._activateTab(this._activeInstanceId);
          }
        }
        return;
      }
      this._activeInstanceId = instanceId;
      if (this._activePhase === phase) {
        // Same phase — re-render phase to clear empty state, render new tab,
        // re-attach existing containers, and activate the new module.
        this._showPhase(phase);
      } else {
        this._eventBus.emit('phase:selected', { phase });
      }
    });
    this._eventBus.on('module:activated', ({ instanceId }) => {
      // Ignore if this tab is already active (avoids re-entrant loop
      // since _activateTab itself emits module:activated)
      if (instanceId === this._activeInstanceId) return;

      // Find which phase this instance belongs to and switch to it. Cycle-
      // agnostic — iterates whatever phases the current project actually has.
      const phases = Object.keys(this._stateManager.get('phases') || {});
      for (const phase of phases) {
        const instances = this._stateManager.get(`phases.${phase}`) ?? [];
        if (instances.some(i => i.instanceId === instanceId)) {
          this._activeInstanceId = instanceId;
          if (this._activePhase !== phase) {
            this._eventBus.emit('phase:selected', { phase });
          } else {
            this._activateTab(instanceId);
          }
          return;
        }
      }
    });
    this._eventBus.on('theme:changed', ({ theme }) => {
      this._instances.forEach(inst => {
        try { inst.onThemeChange?.(theme); } catch {}
      });
    });
    this._eventBus.on('language:changed', ({ lang }) => {
      this._instances.forEach(inst => {
        try { inst.onLanguageChange?.(lang); } catch {}
      });
    });
    this._eventBus.on('project:before-export', () => {
      this._persistAllModuleStates();
    });
  }
}
