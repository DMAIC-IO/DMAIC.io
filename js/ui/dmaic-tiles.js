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
 * Each methodology tile is a split-button: phase letter + name (select),
 * a hover-revealed pencil to edit the goal-achievement percentage (ZEG,
 * 0–100 %), and a chevron trigger for the module dropdown. Virtual tiles
 * (data, extras) skip the ZEG and the pencil.
 */

import {
  CYCLES,
  DEFAULT_CYCLE,
  getCycle,
  getAllPhaseIds,
  getPhaseDef,
} from '../core/cycles/cycles.js';
import { h } from '../core/dom.js';
import { icon } from '../core/icon.js';
import { estimateTilesWidth, resolveCollapsed } from './dmaic-tiles-layout.js';

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

  /**
   * Set router reference so tile clicks navigate through the router.
   * @param {import('../core/router/index.js').Router} router
   */
  setRouter(router) { this._router = router; }

  render() {
    const cycleId = this._getCycleId();
    this._applyPhaseColors(cycleId);
    this._moduleRegistry?.setActiveCycle(cycleId);

    this._container.replaceChildren();
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
    this._recomputeCollapse();
  }

  selectPhase(phase) {
    this._selectPhase(phase);
  }

  getActivePhase() {
    return this._activePhase;
  }

  updateBadge(_phase) {
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

    const pct = isVirtual ? 0 : (this._stateManager.get(`phaseAchievement.${phase}`) ?? 0);

    const letterClass = letter.length > 1
      ? 'dmaic-tile__letter dmaic-tile__letter--multichar'
      : 'dmaic-tile__letter';
    // Interactive controls are siblings (not nested) to satisfy the
    // WAI/axe "nested-interactive" rule: a select button carries the phase
    // navigation + keyboard semantics, the menu button opens the dropdown.
    // No aria-label here: an explicit label would override the visible text
    // ("Define 0%") and trip WCAG 2.5.3 (label-content-name-mismatch). The
    // accessible name is computed from the visible children instead — the
    // decorative first-letter badge is hidden so the name is "<Phase> <pct>%".
    // Three full-height click segments, each a sibling button (never nested —
    // nested-interactive): (1) letter+name → navigate, (2) pencil+% → edit
    // progress, (3) chevron → module menu. Dividers separate them. The whole
    // row lives in `.dmaic-tile__inner`, which is lifted to a centred absolute
    // overlay when a collapsed tile is hovered (see CSS) so it spreads over
    // both neighbours without reflowing them (the flow slot keeps its pinned
    // width).
    const nameText = this._i18n.t(`phases.${phase}`);
    const body = h('button', {
      class: 'dmaic-tile__body',
      type: 'button',
    },
      h('span', { class: letterClass, 'aria-hidden': 'true' }, letter),
      // `--dmaic-name-w` sizes the collapsed→hover reveal to the actual name
      // length (1em/char safely over-estimates uppercase width), so long names
      // are never clipped. max-width just caps, so the animation still grows
      // smoothly to the real content width.
      h('span', {
        class: 'dmaic-tile__name',
        style: `--dmaic-name-w: ${nameText.length + 1}em`,
      }, nameText),
    );
    // Click / Enter / Space on the body button → select phase.
    body.addEventListener('click', () => {
      this._closeMenu();
      this._navigatePhase(phase);
    });

    // Segment 2: pencil + % (virtual tiles have no ZEG → no segment).
    const editSeg = isVirtual ? null : this._buildEditSegment(phase, tile, pct);

    const menuBtn = h('button', {
      class: 'dmaic-tile__menu-btn',
      type: 'button',
      'aria-label': 'Module',
      title: 'Module',
    }, icon('chevron-down'));
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleMenu(phase, tile);
    });

    // Left group = navigate (letter+name) + edit (pencil+%) with no divider
    // between them, so the whole left reads as one. A single divider separates
    // the left group from the dropdown.
    const left = h('div', { class: 'dmaic-tile__left' }, ...[body, editSeg].filter(Boolean));
    const row = h('div', { class: 'dmaic-tile__row' },
      left,
      h('span', { class: 'dmaic-tile__divider', 'aria-hidden': 'true' }),
      menuBtn,
    );

    // Progress bar is its own row UNDER the button row (in y), not overlapping —
    // so the divider ends naturally above it. Both live inside `.dmaic-tile__inner`,
    // the single container that becomes the hover overlay, so the bar expands
    // together with the buttons when a collapsed tile is hovered.
    const progressBar = isVirtual ? null : h('span', {
      class: 'dmaic-tile__progress-bar',
      'aria-hidden': 'true',
    }, h('span', {
      class: 'dmaic-tile__progress-fill',
      style: `width: ${pct}%`,
    }));

    const inner = h('div', { class: 'dmaic-tile__inner' }, ...[row, progressBar].filter(Boolean));
    tile.append(inner);

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
    const modules = this._moduleRegistry.getByCycleAndPhase(cycleId, phase)
      .filter(m => !m.hiddenFromMenu);
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
      item.dataset.moduleId = def.id;

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
          this._closeMenu();
          if (this._router) {
            this._router.navigate({
              kind: 'module-new',
              projectId: this._stateManager.getActiveProjectId(),
              moduleType: def.id,
            });
          } else {
            this._addModule(def.id, phase);
          }
        });
      }

      dropdown.append(item);
    });

    tile.append(dropdown);
    this._openMenu = { phase, dropdown, tile };
    tile.classList.add('dmaic-tile--menu-open');

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
    const GROUP_ORDER = ['collect', 'process', 'visualize', 'charts', 'plan', 'evaluate', 'optimize'];
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
    this._openMenu.tile.classList.remove('dmaic-tile--menu-open');
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

  /**
   * Build the pencil+% edit segment (click area 2). Clicking anywhere in it —
   * the pencil or the number — opens the ZEG editor. Rebuilt after each edit so
   * the fresh segment keeps its click handler.
   * @param {string} phase
   * @param {HTMLElement} tile
   * @param {number} pct
   * @returns {HTMLButtonElement}
   * @private
   */
  _buildEditSegment(phase, tile, pct) {
    const seg = h('button', {
      class: 'dmaic-tile__edit',
      type: 'button',
      'aria-label': this._i18n.t('phases.editProgress'),
      title: this._i18n.t('phases.editProgress'),
    },
      h('span', { class: 'dmaic-tile__edit-icon', 'aria-hidden': 'true' }, '✎'),
      h('span', {
        class: 'dmaic-tile__zeg',
        title: this._i18n.t('phases.achievementTooltip'),
      }, `${pct}%`),
    );
    seg.addEventListener('click', (e) => {
      e.stopPropagation();
      this._closeMenu();
      this._openProgressEditor(phase, tile, seg);
    });
    return seg;
  }

  _openProgressEditor(phase, tile, editSeg) {
    if (tile.querySelector('.dmaic-tile__progress-input')) return;

    const current = this._stateManager.get(`phaseAchievement.${phase}`) ?? 0;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '100';
    input.value = current;
    input.className = 'dmaic-tile__progress-input';
    input.setAttribute('aria-label', this._i18n.t('phases.achievementTooltip'));

    // Swap the whole edit segment for the input (not just the % span) so the
    // input is never nested inside the segment button (nested-interactive).
    editSeg.replaceWith(input);
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

      input.replaceWith(this._buildEditSegment(phase, tile, val));

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

  /**
   * Route a phase change through the router when available, falling back to
   * direct `_selectPhase` for boot/test contexts that have no router.
   * Used by both click and keydown handlers so keyboard navigation keeps the
   * URL hash and history in sync.
   * @param {string} phase
   * @private
   */
  _navigatePhase(phase) {
    if (this._router) {
      this._router.navigate({
        kind: 'phase',
        projectId: this._stateManager.getActiveProjectId(),
        phaseId: phase,
      });
    } else {
      this._selectPhase(phase); // pre-router fallback (boot/tests)
    }
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
    // Active tile changed → the previously active tile may now be collapsed
    // (and needs a pinned width) and the new one expanded. Re-pin.
    this._recomputeCollapse();
  }

  /**
   * Build a text-measure bound to the tile-name font, for width budgeting.
   * @returns {(text:string) => number}
   * @private
   */
  _makeMeasure() {
    this._measureCanvas ??= document.createElement('canvas');
    const ctx = this._measureCanvas.getContext('2d');
    const probe = this._container.querySelector('.dmaic-tile__name');
    if (probe) {
      const cs = getComputedStyle(probe);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    } else {
      ctx.font = '12px sans-serif';
    }
    return (text) => ctx.measureText(text).width;
  }

  /**
   * Recompute whether inactive tiles must collapse and toggle the container
   * class. Content-driven (no ResizeObserver): called at render, cycle switch,
   * and language change. See docs/superpowers/specs/2026-08-12-hauptmenu-phase-tiles-design.md.
   * @private
   */
  _recomputeCollapse() {
    const cycleId = this._getCycleId();
    const tiles = getAllPhaseIds(cycleId).map((p) => {
      const def = getPhaseDef(cycleId, p);
      return {
        letter: def?.letter ?? '?',
        name: this._i18n.t(`phases.${p}`),
        hasZeg: def?.virtual !== true,
      };
    });
    const est = estimateTilesWidth(tiles, this._makeMeasure());
    const budget = this._container.clientWidth || 1280;
    const menuMode = getCycle(cycleId).menuMode ?? 'auto';
    this._collapsed = resolveCollapsed({ est, budget, menuMode });
    this._container.classList.toggle('dmaic-tiles--collapsed', this._collapsed);
    this._pinCollapsedWidths();
  }

  /**
   * Pin each collapsed inactive tile to its current content width so the hover
   * overlay — which lifts `.dmaic-tile__inner` to `position:absolute` — cannot
   * collapse the tile's flow slot. With the slot width fixed, the expanding
   * overlay spreads over both neighbours instead of pushing them (no reflow,
   * no hover flicker). Cleared and re-measured on every recompute.
   * @private
   */
  _pinCollapsedWidths() {
    const tiles = this._container.querySelectorAll('.dmaic-tile');
    tiles.forEach((t) => { t.style.width = ''; });
    if (!this._collapsed) return;
    tiles.forEach((t) => {
      if (t.classList.contains('dmaic-tile--active')) return;
      t.style.width = `${t.offsetWidth}px`;
    });
  }

  _subscribeEvents() {
    this._eventBus.on('module:added', () => {});
    this._eventBus.on('module:removed', () => {});
    this._eventBus.on('badge:update', () => {});
    this._eventBus.on('language:changed', () => this._refreshLabels());
    // Sync highlight when another component (e.g. workspace) drives the phase
    // change. Equality guard prevents the self-emit from `_selectPhase` from
    // looping back through here.
    this._eventBus.on('phase:selected', ({ phase }) => {
      if (this._activePhase === phase) return;
      this._activePhase = phase;
      this._highlightActive();
    });
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
    this._recomputeCollapse();
  }
}
