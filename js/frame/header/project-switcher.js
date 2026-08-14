/**
 * D.Mike — Header Project Switcher (frame/header/project-switcher.js)
 * Wires the header project name display, inline rename, and the project
 * dropdown (switch / rename / cycle-switch / status / delete / new project).
 *
 * Cycle picking & switching are event-driven: this module emits
 * `cycle:pick-requested` / `cycle:switch-requested` and reacts to
 * `cycle:picked` / `cycle:switch-confirmed` (pages/cycle owns the dialogs).
 */

import { DEFAULT_CYCLE } from '../../core/cycles/cycles.js';
import { updateReadOnlyBanner } from '../helpers.js';
import { rehydrateProject } from '../project-rehydrate.js';

/**
 * Router wired after boot (app.js, post-initRouter). When set, a user project
 * pick is routed through the router so the hash carries the new project id;
 * otherwise we fall back to the imperative stateManager.switchProject path.
 * @type {object|null}
 */
let _router = null;

/**
 * Give the project switcher access to the router (called from app.js after
 * initRouter). Pre-router callers keep the stateManager.switchProject fallback.
 * @param {object} router
 */
export function setProjectSwitcherRouter(router) {
  _router = router;
}

/** UI handles needed for reload-free project switching, wired from app.js. */
let _ui = null;

/**
 * Give the project switcher the UI handles required for rehydrating after a
 * project or cycle switch (called from app.js after the router is wired).
 * @param {{ dmaicTiles: object, workspace: object, moduleRegistry: object }} ui
 */
export function setProjectSwitcherUi(ui) {
  _ui = ui;
}

/**
 * Initialize the header project switcher.
 *
 * @param {object}   services
 * @param {object}   services.stateManager - Persistent state service.
 * @param {object}   services.eventBus - Global event bus.
 * @param {object}   services.i18n - Translation helper.
 */
export function initProjectSwitcher({ stateManager, eventBus, i18n }) {
  const btn = document.getElementById('project-switcher-btn');
  const display = document.getElementById('project-name-display');
  const input = document.getElementById('project-name-input');
  const dropdown = document.getElementById('project-dropdown');
  if (!display || !input || !dropdown || !btn) return;

  let dropdownOpen = false;

  // Rebuild the UI after a project/cycle change. Replaces the former
  // location.reload(): the router owns the hash, rehydrateProject() rebuilds
  // workspace, tiles and chrome for the now-active project.
  const rehydrate = async () => {
    if (!_ui || !_router) { location.reload(); return; } // pre-wiring fallback
    await rehydrateProject({
      stateManager, eventBus, moduleRegistry: _ui.moduleRegistry,
      dmaicTiles: _ui.dmaicTiles, workspace: _ui.workspace, router: _router,
    });
    // Header display + read-only banner refresh live on the `project:rehydrated`
    // listener below (not here) so EVERY caller of the shared rehydrateProject()
    // routine gets consistent chrome — not just this module's own callers.
  };

  // Cycle picker/switch is event-driven (pages/cycle owns the dialogs). Track
  // the in-flight request so the async replies know how to react.
  let cyclePending = null; // { currentCycle, projectSwitched }

  eventBus.on('cycle:picked', async ({ context, cycleId }) => {
    const pending = cyclePending;
    if (!pending) return;
    if (context === 'create') {
      cyclePending = null;
      if (!cycleId) return; // cancelled
      const id = stateManager.createProject(i18n.t('app.defaultProjectName'), cycleId);
      await stateManager.switchProject(id);
      await rehydrate();
      return;
    }
    // context === 'switch'
    if (!cycleId || cycleId === pending.currentCycle) {
      cyclePending = null;
      if (pending.projectSwitched) await rehydrate(); // restore UI for now-active project
      return;
    }
    // Keep cyclePending alive across the confirm round-trip; the cycle:switch-confirmed handler clears it.
    eventBus.emit('cycle:switch-requested', { from: pending.currentCycle, to: cycleId });
  });

  eventBus.on('cycle:switch-confirmed', async ({ confirmed, to }) => {
    const pending = cyclePending;
    if (!pending) return;
    cyclePending = null;
    if (!confirmed) {
      if (pending.projectSwitched) await rehydrate();
      return;
    }
    stateManager.switchCycle(to);
    await rehydrate();
  });

  // stateManager.switchCycle() persists synchronously and emits `cycle:changed`
  // unconditionally (state-manager.js) — independent of whether the caller also
  // reloads. Every current UI-driven switch happens to reload right after (see
  // above), which already repaints a closed dropdown; this listener additionally
  // keeps an ALREADY-OPEN dropdown (and the header display) in sync without
  // requiring a close/reopen, and hardens future non-reloading callers against
  // Bug 021 (per-row cycle label staying stale until the dropdown is reopened).
  eventBus.on('cycle:changed', () => {
    refresh();
    if (dropdownOpen) renderDropdown();
  });

  // rehydrateProject() (frame/project-rehydrate.js) rebuilds workspace/tiles
  // for the now-active project but has no chrome dependencies of its own —
  // it only emits `project:rehydrated`. A full reload used to re-run
  // buildFrame() from scratch, which incidentally refreshed the header name
  // display and the read-only banner too. Do that here, on the shared event,
  // so EVERY caller of rehydrateProject() (this module's own switches, and
  // any future caller such as an action-URL verb) gets consistent chrome —
  // not just callers that happen to also call refresh() themselves.
  eventBus.on('project:rehydrated', () => {
    refresh();
    updateReadOnlyBanner(stateManager, i18n);
  });

  const refresh = () => {
    const name = stateManager.get('projectMeta.name') ?? i18n.t('app.defaultProjectName');
    display.textContent = name + (stateManager.isCompleted() ? ' ✓' : '');
    input.value = name;
  };
  refresh();

  // ── Dropdown rendering ──
  const renderDropdown = () => {
    const projects = stateManager.getProjects();
    const activeId = stateManager.getActiveProjectId();
    dropdown.replaceChildren();

    let dragIdx = null;

    projects.forEach((p, idx) => {
      const item = document.createElement('div');
      item.className = `app-header__project-item${
         p.id === activeId ? ' app-header__project-item--active' : ''
         }${p.status === 'completed' ? ' app-header__project-item--completed' : ''}`;
      item.draggable = true;
      item.dataset.idx = idx;

      // ── Drag & drop ──
      item.addEventListener('dragstart', (e) => {
        dragIdx = idx;
        item.classList.add('app-header__project-item--dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragend', () => {
        dragIdx = null;
        item.classList.remove('app-header__project-item--dragging');
        dropdown.querySelectorAll('.app-header__project-item').forEach(el => {
          el.classList.remove('app-header__project-item--drop-before', 'app-header__project-item--drop-after');
        });
      });
      item.addEventListener('dragover', (e) => {
        if (dragIdx === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = item.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const before = e.clientY < mid;
        item.classList.toggle('app-header__project-item--drop-before', before);
        item.classList.toggle('app-header__project-item--drop-after', !before);
      });
      item.addEventListener('dragleave', () => {
        item.classList.remove('app-header__project-item--drop-before', 'app-header__project-item--drop-after');
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('app-header__project-item--drop-before', 'app-header__project-item--drop-after');
        if (dragIdx === null || dragIdx === idx) return;
        const rect = item.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        let toIdx = e.clientY < mid ? idx : idx + 1;
        if (dragIdx < toIdx) toIdx--;
        if (dragIdx !== toIdx) {
          stateManager.reorderProjects(dragIdx, toIdx);
          renderDropdown();
        }
        dragIdx = null;
      });

      // ── Drag handle ──
      const handle = document.createElement('span');
      handle.className = 'app-header__project-drag-handle';
      handle.textContent = '⠿';
      item.appendChild(handle);

      const nameEl = document.createElement('span');
      nameEl.className = 'app-header__project-item-name';
      nameEl.textContent = p.name;

      const cycleId = p.cycle || DEFAULT_CYCLE;
      const cycleEl = document.createElement('span');
      cycleEl.className = 'app-header__project-cycle';
      cycleEl.textContent = i18n.t(`cycles.${cycleId}.name`);
      cycleEl.title = i18n.t(`cycles.${cycleId}.short`);

      const dateEl = document.createElement('span');
      dateEl.className = 'app-header__project-item-date';
      const mod = p.modified ? new Date(p.modified) : null;
      dateEl.textContent = mod ? mod.toLocaleDateString() : '';

      const actions = document.createElement('span');
      actions.className = 'app-header__project-item-actions';

      // Rename button
      const renameBtn = document.createElement('button');
      renameBtn.className = 'app-header__project-action-btn';
      renameBtn.title = i18n.t('app.projectRename');
      renameBtn.textContent = '✎';
      renameBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        closeDropdown();
        if (p.id !== activeId) {
          await stateManager.switchProject(p.id);
          eventBus.emit('project:switched', { id: p.id });
          await rehydrate();
          return;
        }
        // Inline rename for active project
        btn.style.display = 'none';
        input.style.display = '';
        input.focus();
        input.select();
      });
      actions.appendChild(renameBtn);

      // Cycle-switch button
      const cycleBtn = document.createElement('button');
      cycleBtn.className = 'app-header__project-action-btn';
      cycleBtn.title = i18n.t('cycles.switchAction');
      cycleBtn.textContent = '⇆';
      cycleBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        closeDropdown();
        // Switch to project first if needed (consistent with rename UX).
        let projectSwitched = false;
        if (p.id !== activeId) {
          await stateManager.switchProject(p.id);
          projectSwitched = true;
        }
        const currentCycle = stateManager.getProjectCycle();
        cyclePending = { currentCycle, projectSwitched };
        eventBus.emit('cycle:pick-requested', { context: 'switch', currentCycle });
      });
      actions.appendChild(cycleBtn);

      // Status toggle button (active ↔ completed)
      const statusBtn = document.createElement('button');
      statusBtn.className = 'app-header__project-action-btn';
      const isCompleted = p.status === 'completed';
      statusBtn.title = i18n.t(isCompleted ? 'app.projectActivate' : 'app.projectComplete');
      statusBtn.textContent = isCompleted ? '▶' : '✓';
      statusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newStatus = p.status === 'completed' ? 'active' : 'completed';
        stateManager.setProjectStatus(p.id, newStatus);
        renderDropdown();
        if (p.id === activeId) {
          updateReadOnlyBanner(stateManager, i18n);
          refresh();
        }
      });
      actions.appendChild(statusBtn);

      // Delete button (only if >1 project)
      if (projects.length > 1) {
        const delBtn = document.createElement('button');
        delBtn.className = 'app-header__project-action-btn app-header__project-action-btn--danger';
        delBtn.title = i18n.t('app.projectDelete');
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const ok = window.confirm(i18n.t('app.projectDeleteConfirm', { name: p.name }));
          if (!ok) return;
          await stateManager.deleteProject(p.id);
          if (p.id === activeId) {
            const remaining = stateManager.getProjects();
            await stateManager.switchProject(remaining[0].id);
            await rehydrate();
          } else {
            renderDropdown();
          }
        });
        actions.appendChild(delBtn);
      }

      item.appendChild(nameEl);
      item.appendChild(cycleEl);
      item.appendChild(dateEl);
      item.appendChild(actions);

      // Click to switch
      item.addEventListener('click', async () => {
        if (p.id === activeId) { closeDropdown(); return; }
        closeDropdown();
        if (_router) {
          // Route through the router → the hash carries the new project id and
          // the router's apply step performs switchProject. rehydrate() below
          // rebuilds the UI for the (now project-scoped) hash, preserving prior UX.
          await _router.navigate({ kind: 'project', projectId: p.id });
        } else {
          await stateManager.switchProject(p.id);
        }
        eventBus.emit('project:switched', { id: p.id });
        await rehydrate();
      });

      dropdown.appendChild(item);
    });

    // Separator + "New project" button
    const sep = document.createElement('div');
    sep.className = 'app-header__project-separator';
    dropdown.appendChild(sep);

    const newBtn = document.createElement('button');
    newBtn.className = 'app-header__project-new';
    newBtn.textContent = `+ ${  i18n.t('app.projectNew')}`;
    newBtn.addEventListener('click', () => {
      closeDropdown();
      cyclePending = { currentCycle: null, projectSwitched: false };
      eventBus.emit('cycle:pick-requested', { context: 'create', currentCycle: null });
    });
    dropdown.appendChild(newBtn);
  };

  const openDropdown = () => {
    renderDropdown();
    dropdown.style.display = '';
    dropdownOpen = true;
  };

  const closeDropdown = () => {
    dropdown.style.display = 'none';
    dropdownOpen = false;
  };

  // Toggle dropdown on button click
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdownOpen) closeDropdown();
    else openDropdown();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (dropdownOpen && !dropdown.contains(e.target)) closeDropdown();
  });

  // ── Inline rename (active project) ──
  const confirmRename = () => {
    const val = input.value.trim().slice(0, 100);
    if (val) {
      stateManager.set('projectMeta.name', val);
      eventBus.emit('project:renamed', { name: val });
    }
    input.style.display = 'none';
    btn.style.display = '';
    refresh();
  };

  input.addEventListener('blur', confirmRename);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmRename();
    if (e.key === 'Escape') { input.value = stateManager.get('projectMeta.name'); confirmRename(); }
  });
}
