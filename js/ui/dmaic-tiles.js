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
import { resolveCollapsed } from './dmaic-tiles-layout.js';
import { uid } from '../core/uid.js';

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
    this._subscribed = false;
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
    this._buildTiles();
    if (!this._subscribed) {
      this._subscribeEvents();
      this._subscribed = true;
    }
  }

  /**
   * Rebuild the tiles for the currently active cycle. Used after a project or
   * cycle switch — unlike render() it never re-registers event listeners.
   */
  rebuild() {
    this._buildTiles();
  }

  /** Build the tile DOM for the active cycle. */
  _buildTiles() {
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
    // Beide Vorkommen: die Kachel im Fluss UND ihr Flyout. Wird eines
    // vergessen, zeigt das Flyout einen veralteten Wert.
    tile.querySelectorAll('.dmaic-tile__progress-fill')
      .forEach((fill) => { fill.style.width = `${pct}%`; });
    tile.querySelectorAll('.dmaic-tile__zeg')
      .forEach((zeg) => { zeg.textContent = `${pct}%`; });
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

    const nameText = this._i18n.t(`phases.${phase}`);
    // Zwei Darstellungen, ein Bauplan: die Kachel im Fluss und ihre Flyout-Kopie
    // entstehen aus derselben Methode und unterscheiden sich nur im %-Segment.
    const inner = this._buildInner(phase, tile, letter, nameText, isVirtual, pct,
      { editable: true });
    tile.append(inner,
      this._buildFlyout(phase, tile, letter, nameText, isVirtual, pct));

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

    // Ist die Kachel kollabiert, sitzt das Dropdown unter dem Flyout statt
    // unter der Kachel — sonst überdeckten sich beide. Das Flyout ist absolut
    // positioniert und damit selbst Bezugsrahmen; `top: 100%` genügt.
    const host = (this._collapsed && !tile.classList.contains('dmaic-tile--active'))
      ? tile.querySelector('.dmaic-tile__flyout')
      : tile;
    (host ?? tile).append(dropdown);
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
    // Order of the divider sections inside a phase dropdown. Only the groups
    // present in the current phase show up, so one flat list covers all phases.
    // `flowcharts` and `causes` are shared across phases (Measure/Analyze and
    // Define/Analyze) — their slot here fixes the order in every phase at once.
    const GROUP_ORDER = [
      'collect', 'process', 'visualize',       // Daten
      'scope', 'customer', 'team',             // Define
      'causes', 'flowcharts', 'statistics',    // Define / Measure / Analyze
      'msa', 'capability',                     // Measure
      'plan', 'evaluate', 'optimize',          // Improve
      'charts',                                // Control
    ];
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
    const instanceId = uid();
    const phases = this._stateManager.get(`phases.${phase}`) ?? [];
    phases.push({ instanceId, moduleId, order: phases.length, state: {} });
    this._stateManager.set(`phases.${phase}`, phases);
    this._eventBus.emit('module:added', { moduleId, phase, instanceId });
  }

  // ─── Progress Editor ───────────────────────────────────────

  /**
   * Build a `.dmaic-tile__inner` — the button row on top, the progress bar
   * beneath it. Called TWICE per tile: once for the rendering in flow, once for
   * the flyout copy below the row. Both carry the same class names, so every
   * CSS rule applies to both without duplication; code that means exactly one
   * of them addresses the in-flow child through
   * `.dmaic-tile > .dmaic-tile__inner`.
   *
   * Interactive controls are siblings (not nested) to satisfy the WAI/axe
   * "nested-interactive" rule: a select button carries the phase navigation +
   * keyboard semantics, the menu button opens the dropdown. No aria-label on
   * the segments: an explicit label would override the visible text
   * ("Define 0%") and trip WCAG 2.5.3 (label-content-name-mismatch). The
   * accessible name is computed from the visible children instead — the
   * decorative first-letter badge is hidden so the name is "<Phase> <pct>%".
   * Three full-height click segments, each a sibling button (never nested):
   * (1) letter+name → navigate, (2) pencil+% → edit progress on the active
   * tile / navigate on an inactive one, (3) chevron → module menu.
   *
   * @param {string} phase
   * @param {HTMLElement} tile   the owning `.dmaic-tile` (both renderings live in it)
   * @param {string} letter      phase abbreviation, e.g. "D3"
   * @param {string} nameText    translated phase name
   * @param {boolean} isVirtual  frame tiles have neither ZEG nor progress bar
   * @param {number} pct
   * @param {object} opts
   * @param {boolean} opts.editable  in flow the %-segment is a button (it opens
   *   the ZEG editor on the active tile); in the flyout it is a static span.
   *   A second interactive control on the same value would be a redundant
   *   editor entry and a nested-interactive risk, and it would buy nothing —
   *   the segment in flow is reachable in every state.
   * @returns {HTMLDivElement}
   * @private
   */
  _buildInner(phase, tile, letter, nameText, isVirtual, pct, { editable }) {
    const letterClass = letter.length > 1
      ? 'dmaic-tile__letter dmaic-tile__letter--multichar'
      : 'dmaic-tile__letter';

    const body = h('button', {
      class: 'dmaic-tile__body',
      type: 'button',
    },
      h('span', { class: letterClass, 'aria-hidden': 'true' }, letter),
      h('span', { class: 'dmaic-tile__name' }, nameText),
    );
    // Click / Enter / Space on the body button → select phase.
    body.addEventListener('click', () => {
      this._closeMenu();
      this._navigatePhase(phase);
    });

    // Segment 2: pencil + % (virtual tiles have no ZEG → no segment).
    let editSeg = null;
    if (!isVirtual) {
      editSeg = editable
        ? this._buildEditSegment(phase, tile, pct)
        : h('span', { class: 'dmaic-tile__edit dmaic-tile__edit--static' },
            h('span', {
              class: 'dmaic-tile__zeg',
              title: this._i18n.t('phases.achievementTooltip'),
            }, `${pct}%`));
    }

    const menuLabel = this._i18n.t('phases.moduleMenu');
    const menuBtn = h('button', {
      class: 'dmaic-tile__menu-btn',
      type: 'button',
      'aria-label': menuLabel,
      title: menuLabel,
    }, icon('nav.expand-down', { size: 'sm' }));
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
    // so the divider ends naturally above it. Both live inside
    // `.dmaic-tile__inner`, so the bar travels with the buttons into the flyout.
    const progressBar = isVirtual ? null : h('span', {
      class: 'dmaic-tile__progress-bar',
      'aria-hidden': 'true',
    }, h('span', {
      class: 'dmaic-tile__progress-fill',
      style: `width: ${pct}%`,
    }));

    return h('div', { class: 'dmaic-tile__inner' }, ...[row, progressBar].filter(Boolean));
  }

  /**
   * Second rendering of the tile, shown BELOW the row while a collapsed
   * inactive tile is hovered — nothing ever overlaps a neighbour. Virtual frame
   * tiles get one too: their name needs revealing just as much.
   *
   * @param {string} phase
   * @param {HTMLElement} tile
   * @param {string} letter
   * @param {string} nameText
   * @param {boolean} isVirtual
   * @param {number} pct
   * @returns {HTMLDivElement}
   * @private
   */
  _buildFlyout(phase, tile, letter, nameText, isVirtual, pct) {
    return h('div', { class: 'dmaic-tile__flyout' },
      this._buildInner(phase, tile, letter, nameText, isVirtual, pct, { editable: false }));
  }

  /**
   * Build the pencil+% edit segment (click area 2). On the ACTIVE tile a click
   * anywhere in it — pencil or number — opens the ZEG editor; on an inactive
   * tile it navigates to the phase, matching the pencil, which only appears on
   * the active tile. Rebuilt after each edit so the fresh segment keeps its
   * click handler.
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
      // Kein aria-label: der sichtbare "%"-Text ist der Accessible Name
      // (WCAG 2.5.3 label-content-name-mismatch). Zweck steht im title/Tooltip.
      title: this._i18n.t('phases.editProgress'),
    },
      // Zahl und Stift teilen einen Slot und liegen darin übereinander: beim
      // Hovern der aktiven Kachel blendet die Zahl aus und der Stift ein, ohne
      // dass sich eine Breite ändert. Die Slotbreite kommt von `.dmaic-tile__edit-slot`
      // (fixe `min-width` in layout.css), nicht vom Icon — sonst würde die Kachel
      // beim Wechsel von "7%" auf "100%" springen.
      h('span', { class: 'dmaic-tile__edit-slot' },
        h('span', {
          class: 'dmaic-tile__zeg',
          title: this._i18n.t('phases.achievementTooltip'),
        }, `${pct}%`),
        icon('action.edit', { size: 'xs', cls: 'dmaic-tile__edit-icon' }),
      ),
    );
    seg.addEventListener('click', (e) => {
      e.stopPropagation();
      this._closeMenu();
      // Den Fortschritt bearbeitet nur die aktive Kachel — allein dort kündigt
      // der Stift das auch an. Auf einer inaktiven Kachel navigiert das Segment
      // wie der Körper daneben; sonst öffnete es einen Editor ganz ohne
      // sichtbare Ankündigung, und in der kollabierten Leiste liegt genau dort
      // die Kachelmitte.
      if (!tile.classList.contains('dmaic-tile--active')) {
        this._navigatePhase(phase);
        return;
      }
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

      tile.querySelectorAll('.dmaic-tile__progress-fill')
        .forEach((fill) => { fill.style.width = `${val}%`; });
      // Die Zahl im Fluss erneuert sich schon durch das neu gebaute Segment
      // oben; nur das Flyout braucht den Nachtrag.
      tile.querySelectorAll('.dmaic-tile__flyout .dmaic-tile__zeg')
        .forEach((zeg) => { zeg.textContent = `${val}%`; });
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
    // Active tile changed → the collapse decision depends on which tile is
    // active (only the active tile keeps its full name), so recompute.
    this._recomputeCollapse();
  }

  /**
   * Recompute whether inactive tiles must collapse and toggle the container
   * class. Content-driven (no ResizeObserver): called at render, cycle switch,
   * and language change. See
   * docs/superpowers/specs/2026-09-06-kachelreihe-messen-statt-schaetzen-design.md.
   *
   * Measures the REAL width instead of estimating it: drop
   * `dmaic-tiles--collapsed`, read `scrollWidth` against `clientWidth`, set
   * the class back on. `dmaic-tiles--measuring` freezes transitions for the
   * duration so the intermediate, uncollapsed style change never animates.
   *
   * FLICKER-FREE ONLY IF SYNCHRONOUS END TO END: a browser paints after the
   * running JS task ends, not after a forced layout read. This method and
   * ALL THREE of its callers (`_buildTiles`, `_highlightActive`,
   * `_refreshLabels`) must stay synchronous — no `await`, no
   * `requestAnimationFrame` between removing the collapsed class and setting
   * it back. Introduce either one anywhere on that path and the uncollapsed
   * row becomes visible for a frame.
   * @private
   */
  _recomputeCollapse() {
    const cycleId = this._getCycleId();
    const menuMode = getCycle(cycleId).menuMode ?? 'auto';
    const container = this._container;

    container.classList.add('dmaic-tiles--measuring');
    container.classList.remove('dmaic-tiles--collapsed');
    const overflows = container.scrollWidth > container.clientWidth;
    this._collapsed = resolveCollapsed({ overflows, menuMode });
    container.classList.toggle('dmaic-tiles--collapsed', this._collapsed);
    container.classList.remove('dmaic-tiles--measuring');
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
      tile.querySelectorAll('.dmaic-tile__name')
        .forEach((nameEl) => { nameEl.textContent = this._i18n.t(`phases.${phase}`); });
      tile.setAttribute('aria-label', this._i18n.t(`phases.${phase}`));
    });
    this._recomputeCollapse();
  }
}
