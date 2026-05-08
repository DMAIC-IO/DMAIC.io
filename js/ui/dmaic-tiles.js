/**
 * D.Mike — Phase Tiles (dmaic-tiles.js)
 * Renders and manages the phase tiles for the active project's cycle.
 * Always wraps the cycle's methodology phases with two virtual frame tiles:
 * `data` (leading, phase-independent tools) and `extras` (trailing, catch-all
 * for modules without a cycle-specific mapping). See `js/core/cycles/cycles.js`.
 *
 * Class name kept as `DmaicTiles` for backwards-compat across the codebase
 * (Plan §4.4 — file/class rename deferred).
 *
 * Each methodology tile shows: phase letter, name, hamburger menu for
 * modules, and an editable goal-achievement percentage (ZEG, 0–100 %)
 * on double-click. Virtual tiles (data, extras) skip the ZEG.
 */

import {
  CYCLES,
  DEFAULT_CYCLE,
  getCycle,
  getAllPhaseIds,
  getPhaseDef,
} from '../core/cycles/cycles.js';

export class DmaicTiles {
  /**
   * @param {HTMLElement} container
   * @param {object} deps
   * @param {import('../core/event-bus.js').EventBus} deps.eventBus
   * @param {import('../core/state-manager.js').StateManager} deps.stateManager
   * @param {import('../core/i18n.js').I18n} deps.i18n
   * @param {import('../core/module-registry.js').ModuleRegistry} [deps.moduleRegistry]
   */
  constructor(container, { eventBus, stateManager, i18n, moduleRegistry }) {
    this._container = container;
    this._eventBus = eventBus;
    this._stateManager = stateManager;
    this._i18n = i18n;
    this._moduleRegistry = moduleRegistry;
    this._workspace = null;
    this._activePhase = 'define';
    this._openMenu = null;
    this._closeMenuOnOutsideClick = this._closeMenuOnOutsideClick.bind(this);
  }

  /**
   * Set workspace reference for cross-phase tab drag & drop.
   * @param {import('./workspace.js').Workspace} workspace
   */
  setWorkspace(workspace) {
    this._workspace = workspace;
  }

  render() {
    const cycleId = this._getCycleId();
    this._applyPhaseColors(cycleId);
    this._moduleRegistry?.setActiveCycle(cycleId);

    this._container.innerHTML = '';
    this._container.className = 'dmaic-tiles';

    const phases = getAllPhaseIds(cycleId);
    if (!phases.includes(this._activePhase)) {
      // After a cycle switch the previous active phase may no longer exist.
      this._activePhase = phases[1] ?? phases[0];
    }

    phases.forEach(phase => {
      const tile = this._createTile(phase, cycleId);
      this._container.append(tile);
    });

    this._highlightActive();
    this._subscribeEvents();
  }

  selectPhase(phase) {
    this._selectPhase(phase);
  }

  getActivePhase() {
    return this._activePhase;
  }

  updateBadge(phase) {
    // Kept for API compatibility.
  }

  updateProgress(phase, value) {
    const tile = this._container.querySelector(`[data-phase="${phase}"]`);
    if (!tile) return;
    const pct = Math.max(0, Math.min(100, value));
    const fill = tile.querySelector('.dmaic-tile__progress-fill');
    if (fill) fill.style.width = `${pct}%`;
    const zeg = tile.querySelector('.dmaic-tile__zeg');
    if (zeg) zeg.textContent = `${pct}%`;
  }

  // ─── Internal ───────────────────────────────────────────────

  /** @returns {string} active project's cycle id */
  _getCycleId() {
    return this._stateManager.get('projectMeta.cycle') || DEFAULT_CYCLE;
  }

  /**
   * Push the active cycle's phase colors onto `:root` as CSS variables so
   * existing consumers of `--color-phase-<id>` (charts, badges) pick them
   * up automatically. Vars not provided by the cycle fall back to the
   * defaults declared in `css/variables.css`.
   * @param {string} cycleId
   * @private
   */
  _applyPhaseColors(cycleId) {
    const root = document.documentElement;
    // Clear any phase var that ANY cycle could have set, then re-apply the
    // active cycle's overrides. Phases without an explicit `color` fall back
    // to the CSS default in `variables.css`.
    const known = new Set();
    for (const c of Object.values(CYCLES)) {
      for (const p of c.phases) known.add(p.id);
    }
    for (const id of known) root.style.removeProperty(`--color-phase-${id}`);
    for (const p of getCycle(cycleId).phases) {
      if (p.color) root.style.setProperty(`--color-phase-${p.id}`, p.color);
    }
  }

  _createTile(phase, cycleId) {
    const phaseDef = getPhaseDef(cycleId, phase);
    const isVirtual = phaseDef?.virtual === true;
    const letter = phaseDef?.letter ?? '?';

    const tile = document.createElement('div');
    tile.className = 'dmaic-tile';
    tile.dataset.phase = phase;
    tile.setAttribute('role', 'button');
    tile.setAttribute('tabindex', '0');
    tile.setAttribute('aria-label', this._i18n.t(`phases.${phase}`));

    const pct = isVirtual ? 0 : (this._stateManager.get(`phaseAchievement.${phase}`) ?? 0);

    tile.innerHTML = `
      <span class="dmaic-tile__letter">${letter}</span>
      <span class="dmaic-tile__name">${this._i18n.t(`phases.${phase}`)}</span>
      ${isVirtual ? '' : `<span class="dmaic-tile__zeg"
            title="${this._i18n.t('phases.achievementTooltip')}">${pct}%</span>`}
      <button class="dmaic-tile__menu-btn" aria-label="Module" title="Module">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
      </button>
      ${isVirtual ? '' : `<span class="dmaic-tile__progress-bar" aria-hidden="true">
        <span class="dmaic-tile__progress-fill" style="width: ${pct}%"></span>
      </span>`}
    `;

    const menuBtn = tile.querySelector('.dmaic-tile__menu-btn');

    // Click on tile body (not menu button) → select phase
    tile.addEventListener('click', (e) => {
      if (menuBtn.contains(e.target)) return;
      this._closeMenu();
      this._selectPhase(phase);
    });

    tile.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === tile) {
        e.preventDefault();
        this._selectPhase(phase);
      }
    });

    // Double-click → edit ZEG (virtual tiles have no ZEG)
    if (!isVirtual) {
      tile.addEventListener('dblclick', (e) => {
        if (menuBtn.contains(e.target)) return;
        e.preventDefault();
        const zegEl = tile.querySelector('.dmaic-tile__zeg');
        this._openProgressEditor(phase, tile, zegEl);
      });
    }

    // Hamburger menu → show module dropdown
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleMenu(phase, tile);
    });

    // ── Drop target for tab drag & drop ──
    tile.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('application/x-dmike-tab')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      tile.classList.add('dmaic-tile--drop-target');
    });
    tile.addEventListener('dragleave', () => {
      tile.classList.remove('dmaic-tile--drop-target');
    });
    tile.addEventListener('drop', (e) => {
      tile.classList.remove('dmaic-tile--drop-target');
      const raw = e.dataTransfer.getData('application/x-dmike-tab');
      if (!raw || !this._workspace) return;
      e.preventDefault();
      const dragged = JSON.parse(raw);
      this._workspace.moveTabToPhaseAndShow(dragged, phase);
    });

    return tile;
  }

  // ─── Module Dropdown Menu ──────────────────────────────────

  _toggleMenu(phase, tile) {
    if (this._openMenu && this._openMenu.phase === phase) {
      this._closeMenu();
      return;
    }
    this._closeMenu();
    this._showMenu(phase, tile);
  }

  _showMenu(phase, tile) {
    if (!this._moduleRegistry) return;

    const cycleId = this._getCycleId();
    const modules = this._moduleRegistry.getByCycleAndPhase(cycleId, phase);
    if (modules.length === 0) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'dmaic-tile__dropdown';

    const grouped = this._groupModules(modules);

    grouped.forEach((entry) => {
      if (entry.divider) {
        const div = document.createElement('div');
        div.className = 'dmaic-tile__dropdown-divider';
        div.textContent = this._i18n.t(`dataGroups.${entry.divider}`);
        dropdown.append(div);
        return;
      }

      const def = entry;
      const item = document.createElement('button');
      item.className = 'dmaic-tile__dropdown-item';

      const check = this._canAdd(def, phase);

      item.textContent = this._i18n.t(`modules.${def.id}.name`);

      if (!check.ok) {
        item.classList.add('dmaic-tile__dropdown-item--disabled');
        item.disabled = true;
        if (check.reason === 'singleton') {
          item.title = this._i18n.t('phases.singletonExists', { name: this._i18n.t(`modules.${def.id}.name`) });
        } else if (check.reason === 'wrongPhase') {
          const allowedIds = check.allowedPhases ?? [];
          const allowed = allowedIds.map(p => this._i18n.t(`phases.${p}`)).join(', ');
          item.title = this._i18n.t('phases.wrongPhase', { name: this._i18n.t(`modules.${def.id}.name`), phases: allowed });
        }
      } else {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this._addModule(def.id, phase);
          this._closeMenu();
        });
      }

      dropdown.append(item);
    });

    tile.append(dropdown);
    this._openMenu = { phase, dropdown, tile };

    requestAnimationFrame(() => {
      document.addEventListener('click', this._closeMenuOnOutsideClick);
      document.addEventListener('keydown', this._closeMenuOnEscape);
    });
  }

  /**
   * @param {object[]} modules
   * @returns {Array<object|{divider:string}>}
   */
  _groupModules(modules) {
    const GROUP_ORDER = ['collect', 'process', 'visualize'];
    const hasGroups = modules.some(m => m.group);
    if (!hasGroups) return modules;

    const buckets = new Map();
    const ungrouped = [];
    for (const m of modules) {
      if (m.group) {
        if (!buckets.has(m.group)) buckets.set(m.group, []);
        buckets.get(m.group).push(m);
      } else {
        ungrouped.push(m);
      }
    }

    const result = [];
    for (const g of GROUP_ORDER) {
      if (!buckets.has(g)) continue;
      result.push({ divider: g });
      result.push(...buckets.get(g));
    }
    if (ungrouped.length) {
      if (result.length) result.push({ divider: 'other' });
      result.push(...ungrouped);
    }
    return result;
  }

  _closeMenu() {
    if (!this._openMenu) return;
    this._openMenu.dropdown.remove();
    this._openMenu = null;
    document.removeEventListener('click', this._closeMenuOnOutsideClick);
    document.removeEventListener('keydown', this._closeMenuOnEscape);
  }

  _closeMenuOnOutsideClick(e) {
    if (this._openMenu && !this._openMenu.tile.contains(e.target)) {
      this._closeMenu();
    }
  }

  _closeMenuOnEscape = (e) => {
    if (e.key === 'Escape') this._closeMenu();
  };

  // ─── Module Add Logic ──────────────────────────────────────

  _findModulePhase(moduleId) {
    for (const p of getAllPhaseIds(this._getCycleId())) {
      const items = this._stateManager.get(`phases.${p}`) ?? [];
      if (items.some(i => i.moduleId === moduleId)) return p;
    }
    return null;
  }

  /**
   * Decide whether a module can be added to a given phase tile in the active
   * cycle. Returns `{ ok: false, reason, allowedPhases? }` on failure so the
   * dropdown can show the right tooltip.
   * @param {object} def - module definition from the registry
   * @param {string} phase - target phase id (incl. virtual `data` / `extras`)
   * @returns {{ ok: boolean, reason?: string, allowedPhases?: string[] }}
   */
  _canAdd(def, phase) {
    const cycleId = this._getCycleId();
    // Virtual tiles (`data`, `extras`) are catch-all — no allowedPhases check.
    if (phase !== 'data' && phase !== 'extras') {
      const mapping = def.cycles?.[cycleId];
      const allowed = mapping?.allowedPhases;
      if (allowed && !allowed.includes(phase)) {
        return { ok: false, reason: 'wrongPhase', allowedPhases: allowed };
      }
    }
    if (def.singleton) {
      for (const p of getAllPhaseIds(cycleId)) {
        const items = this._stateManager.get(`phases.${p}`) ?? [];
        if (items.some(i => i.moduleId === def.id)) {
          return { ok: false, reason: 'singleton' };
        }
      }
    }
    return { ok: true };
  }

  _addModule(moduleId, phase) {
    if (this._stateManager.isCompleted()) return;
    const def = this._moduleRegistry.get(moduleId);
    if (def && !this._canAdd(def, phase).ok) return;
    const instanceId = crypto.randomUUID();
    const phases = this._stateManager.get(`phases.${phase}`) ?? [];
    phases.push({ instanceId, moduleId, order: phases.length, state: {} });
    this._stateManager.set(`phases.${phase}`, phases);
    this._eventBus.emit('module:added', { moduleId, phase, instanceId });
  }

  // ─── Progress Editor ───────────────────────────────────────

  _openProgressEditor(phase, tile, zegEl) {
    if (tile.querySelector('.dmaic-tile__progress-input')) return;

    const current = this._stateManager.get(`phaseAchievement.${phase}`) ?? 0;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '100';
    input.value = current;
    input.className = 'dmaic-tile__progress-input';
    input.setAttribute('aria-label', this._i18n.t('phases.achievementTooltip'));

    zegEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const val = Math.max(0, Math.min(100, parseInt(input.value, 10) || 0));
      this._stateManager.set(`phaseAchievement.${phase}`, val);

      const histKey = `phaseAchievementHistory.${phase}`;
      const history = this._stateManager.get(histKey) || [];
      const last = history[history.length - 1];
      if (!last || last.v !== val) {
        history.push({ t: Date.now(), v: val });
        this._stateManager.set(histKey, history);
      }

      this._eventBus.emit('phase:achievement-changed', { phase, value: val });

      const newZeg = document.createElement('span');
      newZeg.className = 'dmaic-tile__zeg';
      newZeg.title = this._i18n.t('phases.achievementTooltip');
      newZeg.textContent = `${val}%`;
      input.replaceWith(newZeg);

      const fill = tile.querySelector('.dmaic-tile__progress-fill');
      if (fill) fill.style.width = `${val}%`;
    };

    let done = false;
    const guard = () => { if (!done) { done = true; commit(); } };

    input.addEventListener('blur', guard);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = current; input.blur(); }
      e.stopPropagation();
    });
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  _selectPhase(phase) {
    this._activePhase = phase;
    this._highlightActive();
    this._eventBus.emit('phase:selected', { phase });
  }

  _highlightActive() {
    this._container.querySelectorAll('.dmaic-tile').forEach(tile => {
      tile.classList.toggle('dmaic-tile--active', tile.dataset.phase === this._activePhase);
    });
  }

  _subscribeEvents() {
    this._eventBus.on('module:added', () => {});
    this._eventBus.on('module:removed', () => {});
    this._eventBus.on('badge:update', () => {});
    this._eventBus.on('language:changed', () => this._refreshLabels());
  }

  _refreshLabels() {
    // Iterate the actually-rendered tiles so a cycle switch doesn't matter.
    this._container.querySelectorAll('.dmaic-tile').forEach(tile => {
      const phase = tile.dataset.phase;
      if (!phase) return;
      const nameEl = tile.querySelector('.dmaic-tile__name');
      if (nameEl) nameEl.textContent = this._i18n.t(`phases.${phase}`);
      tile.setAttribute('aria-label', this._i18n.t(`phases.${phase}`));
    });
  }
}
