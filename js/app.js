/**
 * D.Mike — Application Bootstrap (app.js)
 * Initializes all core services and wires the UI.
 * Entry point loaded from index.html.
 */

import { EventBus }       from './core/event-bus.js';
import { StateManager }   from './core/state-manager.js';
import { findOtherVersions, importFromVersion } from './core/cross-version-import.js';
import { I18n }           from './core/i18n.js';
import { ThemeManager }   from './core/theme-manager.js';
import { ModuleRegistry } from './core/module-registry.js';
import { ExamplesRegistry } from './core/examples-registry.js';
import ChartManager       from './core/chart/chart-manager.js';
import { DmaicTiles }     from './ui/dmaic-tiles.js';
import { Workspace }      from './ui/workspace.js';
import { Modal }          from './ui/modal.js';
import { HelpPanel }      from './ui/help-panel.js';
import manifest           from './modules/manifest.js';
import { VERSION }        from './core/version.js';
import { stripPatch }     from './core/version-utils.js';
import { openColorPicker, hexToRGBA, rgbaToHex6 } from './core/color-picker.js';
import { DashboardGrid }  from './ui/dashboard-grid.js';
import { DASHBOARD_TILES, DEFAULT_DASHBOARD_LAYOUT, getTileDef } from './ui/dashboard-tiles.js';
import { getChartType, evaluateNelsonRules, computeCapability, DEFAULT_ENABLED_RULES } from './engines/control-chart-engine.js';
import { getColumnValues, getColumnName } from './ui/column-picker.js';
import { CYCLES, getCycle, getPhaseIds, DEFAULT_CYCLE } from './core/cycles/cycles.js';
import { initNightlyMode }   from './core/nightly-mode.js';
import { TipEngine }         from './core/tips/tip-engine.js';
import { ExportReminder }    from './core/export-reminder.js';

async function init() {
  // ─── Core Services ───────────────────────────────────────

  const eventBus     = new EventBus();
  const stateManager = new StateManager(eventBus);
  await stateManager.load();

  const i18n = new I18n('de');
  i18n.connect(eventBus, stateManager);

  // Detect browser language for first visit
  const savedLang = stateManager.get('settings.language');
  const initialLang = savedLang ?? (navigator.language?.startsWith('de') ? 'de' : 'en');

  // Pre-load both languages (small files, avoids flicker on toggle)
  await Promise.all([i18n.loadLanguage('de'), i18n.loadLanguage('en')]);
  await i18n.setLanguage(initialLang);

  const themeManager = new ThemeManager(stateManager, eventBus);
  themeManager.init();

  const moduleRegistry = new ModuleRegistry();
  manifest.forEach(def => moduleRegistry.register(def));
  moduleRegistry.setActiveCycle(stateManager.getProjectCycle());
  stateManager.setModuleRegistry(moduleRegistry);

  const chartManager = new ChartManager(eventBus, i18n, stateManager);

  const examplesRegistry = new ExamplesRegistry();
  await examplesRegistry.init();

  const tipEngine = new TipEngine({ eventBus, stateManager, i18n });
  await tipEngine.init();

  // ─── UI Components ───────────────────────────────────────

  const modal = new Modal(i18n);

  initNightlyMode({ modal, i18n });

  const notify = (message, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    container.append(toast);
    setTimeout(() => toast.remove(), 4000);
  };

  const dmaicTiles = new DmaicTiles(
    document.getElementById('dmaic-tiles'),
    { eventBus, stateManager, i18n, moduleRegistry }
  );
  dmaicTiles.render();

  const helpPanel = new HelpPanel(
    document.getElementById('help-panel'),
    i18n
  );
  helpPanel.render();

  const workspace = new Workspace(
    document.getElementById('app-workspace'),
    { moduleRegistry, eventBus, stateManager, i18n, modal, notify, helpPanel, chartManager, examples: examplesRegistry }
  );
  workspace.render();

  // Wire workspace into DMAIC tiles for cross-phase tab drag & drop
  dmaicTiles.setWorkspace(workspace);

  // ─── Header Controls ─────────────────────────────────────

  _initProjectName(stateManager, eventBus, i18n, modal, moduleRegistry);
  _initSettings(themeManager, i18n, stateManager, tipEngine);
  _initDevArea(eventBus, i18n);
  _initModuleHelp(workspace, helpPanel, i18n, eventBus, examplesRegistry);
  _initTraining(eventBus, i18n);
  _initDashboard(eventBus, i18n, stateManager, chartManager);
  _initExportImport(stateManager, eventBus, i18n, notify, modal);
  _handleExampleDeeplink({ stateManager, eventBus, moduleRegistry, examplesRegistry, workspace, notify, i18n });

  const exportReminder = new ExportReminder({ stateManager, eventBus, i18n, notify });
  exportReminder.init();
  _initFullscreen();
  _initFooter(stateManager, eventBus, i18n);
  _updateReadOnlyBanner(stateManager, i18n);
  _maybeOfferCrossVersionImport(stateManager, modal, notify, i18n);
  _maybeShowMigrationNotice(notify, i18n);

  // ─── Viewport guard (desktop-only) ───────────────────────

  const guard = document.getElementById('viewport-guard');
  const checkViewport = () => {
    const tooSmall = window.innerWidth < 1280;
    guard.style.display = tooSmall ? 'flex' : 'none';
  };
  window.addEventListener('resize', checkViewport);
  checkViewport();

  // ─── Global collapsible output sections ──────────────────

  _initCollapsibleSections();

  // ─── Auto-save on unload ─────────────────────────────────
  // Top-level state is flushed to localStorage synchronously here.
  // Module states are handled by StateManager's own unload hooks
  // (visibilitychange / pagehide / beforeunload → IDB flush).
  window.addEventListener('beforeunload', () => stateManager.save());

  // E2E test handle: opt-in via ?e2e=1 so the production bundle stays clean.
  // Lets headless tests force a synchronous flush instead of sleeping past
  // the 2 s localStorage / 500 ms IDB debounces, and reach into live module
  // instances via the workspace.
  if (new URLSearchParams(location.search).get('e2e') === '1') {
    window.__dmike = { stateManager, eventBus, moduleRegistry, i18n, themeManager, workspace, chartManager, exportReminder, examplesRegistry };
  }

  // ─── Update title ────────────────────────────────────────

  eventBus.on('state:saved', () => _updateTitle(stateManager));
  _updateTitle(stateManager);

  console.log(`D.Mike v${VERSION} ready.`);
}

// ─── Cross-version import (data from older D.Mike on same domain) ──

const CROSS_VERSION_DISMISSED_KEY = `dmike_v${VERSION.split('.').slice(0, 2).join('.')}_crossVersionPromptDismissed`;

function _maybeOfferCrossVersionImport(stateManager, modal, notify, i18n) {
  const others = findOtherVersions();
  if (others.length === 0) return;
  if (localStorage.getItem(CROSS_VERSION_DISMISSED_KEY) === '1') return;
  if (!_isFreshInstall(stateManager)) return;

  const list = others
    .map(v => `<li><label class="cv-import__item"><input type="radio" name="cv-version" value="${v.versionMM}"> <strong>${v.label}</strong> — ${i18n.t('crossVersion.projectsCount', { count: v.projectCount })}</label></li>`)
    .join('');

  const content = `
    <p>${i18n.t('crossVersion.intro', { current: VERSION })}</p>
    <ul class="cv-import__list" style="list-style: none; padding: 0; margin: 12px 0;">${list}</ul>
    <p style="font-size: 12px; opacity: 0.7;">${i18n.t('crossVersion.note')}</p>
  `;

  modal.form(i18n.t('crossVersion.title'), content, {
    confirmLabel: i18n.t('crossVersion.takeover'),
    cancelLabel: i18n.t('crossVersion.dismiss'),
    onMount: (body) => {
      const first = body.querySelector('input[name="cv-version"]');
      if (first) first.checked = true;
    },
    onConfirm: async (body) => {
      const picked = body.querySelector('input[name="cv-version"]:checked')?.value;
      if (!picked) return false;
      try {
        await importFromVersion(picked, stateManager);
        localStorage.setItem(CROSS_VERSION_DISMISSED_KEY, '1');
        notify(i18n.t('crossVersion.success'), 'success');
        setTimeout(() => location.reload(), 800);
      } catch (err) {
        notify(i18n.t('common.error') + ': ' + err.message, 'error');
        return false;
      }
    },
  }).then(confirmed => {
    if (!confirmed) localStorage.setItem(CROSS_VERSION_DISMISSED_KEY, '1');
  });
}

/**
 * After a cross-version-migrating import, the success toast is wiped by
 * the page reload. We stash a flag in sessionStorage and surface it here.
 */
function _maybeShowMigrationNotice(notify, i18n) {
  const raw = sessionStorage.getItem('dmike_import_migrated');
  if (!raw) return;
  sessionStorage.removeItem('dmike_import_migrated');
  try {
    const { from, to } = JSON.parse(raw);
    notify(i18n.t('app.importMigrated', { from, to }), 'info');
  } catch { /* ignore malformed flag */ }
}

function _isFreshInstall(stateManager) {
  const projects = stateManager.getProjects();
  if (projects.length !== 1) return false;
  const phases = stateManager.get('phases') || {};
  return Object.values(phases).every(arr => !arr || arr.length === 0);
}

// ─── Read-only banner for completed projects ──────────────────

function _updateReadOnlyBanner(stateManager, i18n) {
  let banner = document.getElementById('readonly-banner');
  if (stateManager.isCompleted()) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'readonly-banner';
      banner.className = 'app-readonly-banner';
      const workspace = document.getElementById('app-workspace');
      workspace?.prepend(banner);
    }
    banner.textContent = '\uD83D\uDD12 ' + i18n.t('app.projectReadOnly');
    banner.style.display = '';
    document.body.classList.add('dmike--readonly');
  } else {
    if (banner) banner.style.display = 'none';
    document.body.classList.remove('dmike--readonly');
  }
}

// ─── Header Helpers ────────────────────────────────────────────

function _initProjectName(stateManager, eventBus, i18n, modal, moduleRegistry) {
  const btn = document.getElementById('project-switcher-btn');
  const display = document.getElementById('project-name-display');
  const input = document.getElementById('project-name-input');
  const dropdown = document.getElementById('project-dropdown');
  if (!display || !input || !dropdown || !btn) return;

  let dropdownOpen = false;

  const refresh = () => {
    const name = stateManager.get('projectMeta.name') ?? i18n.t('app.defaultProjectName');
    display.textContent = name + (stateManager.isCompleted() ? ' \u2713' : '');
    input.value = name;
  };
  refresh();

  // ── Dropdown rendering ──
  const renderDropdown = () => {
    const projects = stateManager.getProjects();
    const activeId = stateManager.getActiveProjectId();
    dropdown.innerHTML = '';

    let dragIdx = null;

    projects.forEach((p, idx) => {
      const item = document.createElement('div');
      item.className = 'app-header__project-item'
        + (p.id === activeId ? ' app-header__project-item--active' : '')
        + (p.status === 'completed' ? ' app-header__project-item--completed' : '');
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
      renameBtn.innerHTML = '&#9998;'; // ✎
      renameBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        closeDropdown();
        if (p.id !== activeId) {
          await stateManager.switchProject(p.id);
          eventBus.emit('project:switched', { id: p.id });
          location.reload();
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
      cycleBtn.innerHTML = '&#8646;'; // ⇆
      cycleBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        closeDropdown();
        // Switch to project first if needed (consistent with rename UX).
        if (p.id !== activeId) {
          await stateManager.switchProject(p.id);
        }
        const currentCycle = stateManager.getProjectCycle();
        const picked = await _pickCycle(modal, i18n, currentCycle);
        if (!picked || picked === currentCycle) {
          if (p.id !== activeId) location.reload(); // restore UI for the now-active project
          return;
        }
        const confirmed = await _confirmCycleSwitch(
          modal, i18n, stateManager, moduleRegistry, currentCycle, picked,
        );
        if (!confirmed) {
          if (p.id !== activeId) location.reload();
          return;
        }
        stateManager.switchCycle(picked);
        location.reload();
      });
      actions.appendChild(cycleBtn);

      // Status toggle button (active ↔ completed)
      const statusBtn = document.createElement('button');
      statusBtn.className = 'app-header__project-action-btn';
      const isCompleted = p.status === 'completed';
      statusBtn.title = i18n.t(isCompleted ? 'app.projectActivate' : 'app.projectComplete');
      statusBtn.innerHTML = isCompleted ? '&#9654;' : '&#10003;'; // ► or ✓
      statusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newStatus = p.status === 'completed' ? 'active' : 'completed';
        stateManager.setProjectStatus(p.id, newStatus);
        renderDropdown();
        if (p.id === activeId) {
          _updateReadOnlyBanner(stateManager, i18n);
          refresh();
        }
      });
      actions.appendChild(statusBtn);

      // Delete button (only if >1 project)
      if (projects.length > 1) {
        const delBtn = document.createElement('button');
        delBtn.className = 'app-header__project-action-btn app-header__project-action-btn--danger';
        delBtn.title = i18n.t('app.projectDelete');
        delBtn.innerHTML = '&#10005;'; // ✕
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const ok = window.confirm(i18n.t('app.projectDeleteConfirm', { name: p.name }));
          if (!ok) return;
          await stateManager.deleteProject(p.id);
          if (p.id === activeId) {
            const remaining = stateManager.getProjects();
            await stateManager.switchProject(remaining[0].id);
            location.reload();
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
        await stateManager.switchProject(p.id);
        eventBus.emit('project:switched', { id: p.id });
        location.reload();
      });

      dropdown.appendChild(item);
    });

    // Separator + "New project" button
    const sep = document.createElement('div');
    sep.className = 'app-header__project-separator';
    dropdown.appendChild(sep);

    const newBtn = document.createElement('button');
    newBtn.className = 'app-header__project-new';
    newBtn.textContent = '+ ' + i18n.t('app.projectNew');
    newBtn.addEventListener('click', async () => {
      closeDropdown();
      const cycleId = await _pickCycle(modal, i18n);
      if (!cycleId) return; // user cancelled
      const id = stateManager.createProject(i18n.t('app.defaultProjectName'), cycleId);
      await stateManager.switchProject(id);
      location.reload();
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

// ─── Cycle picker / switch modals (v0.3) ──────────────────────────

/**
 * Open a modal that lets the user pick one of the available improvement
 * cycles. Returns the picked cycle id, or null if cancelled.
 * @param {import('./ui/modal.js').Modal} modal
 * @param {import('./core/i18n.js').I18n} i18n
 * @param {string|null} [currentCycle] - pre-select this cycle
 * @returns {Promise<string|null>}
 */
async function _pickCycle(modal, i18n, currentCycle = null) {
  const preselected = currentCycle ?? DEFAULT_CYCLE;
  const options = Object.values(CYCLES).map(c => `
    <label class="cycle-picker__option">
      <input type="radio" name="cycle" value="${c.id}"${c.id === preselected ? ' checked' : ''}>
      <span class="cycle-picker__body">
        <span class="cycle-picker__name">${i18n.t(`${c.i18nKey}.name`)}</span>
        <span class="cycle-picker__short">${i18n.t(`${c.i18nKey}.short`)}</span>
        <span class="cycle-picker__desc">${i18n.t(`${c.i18nKey}.description`)}</span>
      </span>
    </label>
  `).join('');

  const content = `
    <p>${i18n.t('cycles.pickerIntro')}</p>
    <fieldset class="cycle-picker">${options}</fieldset>
  `;

  let picked = null;
  const ok = await modal.form(i18n.t('cycles.pickerTitle'), content, {
    confirmLabel: i18n.t('common.ok'),
    onConfirm: (body) => {
      picked = body.querySelector('input[name="cycle"]:checked')?.value || null;
      if (!picked) return false; // keep modal open
    },
  });
  return ok ? picked : null;
}

/**
 * Show a preview of what changes when switching cycles and ask for
 * confirmation. Returns true if confirmed.
 * @param {import('./ui/modal.js').Modal} modal
 * @param {import('./core/i18n.js').I18n} i18n
 * @param {import('./core/state-manager.js').StateManager} stateManager
 * @param {import('./core/module-registry.js').ModuleRegistry} moduleRegistry
 * @param {string} fromCycle
 * @param {string} toCycle
 * @returns {Promise<boolean>}
 */
async function _confirmCycleSwitch(modal, i18n, stateManager, moduleRegistry, fromCycle, toCycle) {
  const oldPhases = getPhaseIds(fromCycle);
  const newPhases = getPhaseIds(toCycle);
  const lostPhases = oldPhases.filter(p => !newPhases.includes(p));
  const newAdded = newPhases.filter(p => !oldPhases.includes(p));

  // Count how many module instances will be auto-mapped vs. fall back to the
  // first new methodology phase.
  let mapped = 0;
  let fallback = 0;
  const phasesObj = stateManager.get('phases') || {};
  for (const oldPhase of oldPhases) {
    for (const item of (phasesObj[oldPhase] || [])) {
      const def = moduleRegistry.get(item.moduleId);
      if (def?.cycles?.[toCycle]?.phase) mapped++;
      else fallback++;
    }
  }
  fallback += (phasesObj.extras || []).length;

  const firstNewPhaseLabel = i18n.t(`phases.${newPhases[0]}`);
  const fromName = i18n.t(`cycles.${fromCycle}.name`);
  const toName = i18n.t(`cycles.${toCycle}.name`);

  const sections = [`<p>${i18n.t('cycles.switchIntro')}</p>`];
  if (lostPhases.length) {
    const phaseNames = lostPhases.map(p => i18n.t(`phases.${p}`)).join(', ');
    sections.push(`<p><strong>${i18n.t('cycles.switchLostPhases', { phases: phaseNames })}</strong></p>`);
  }
  if (newAdded.length) {
    const phaseNames = newAdded.map(p => i18n.t(`phases.${p}`)).join(', ');
    sections.push(`<p>${i18n.t('cycles.switchNewPhases', { phases: phaseNames })}</p>`);
  }
  if (mapped > 0) {
    sections.push(`<p>${i18n.t('cycles.switchModuleMappedCount', { count: mapped })}</p>`);
  }
  if (fallback > 0) {
    sections.push(`<p>${i18n.t('cycles.switchModuleFallbackCount', { count: fallback, phase: firstNewPhaseLabel })}</p>`);
  }

  return await modal.form(
    i18n.t('cycles.switchTitle', { from: fromName, to: toName }),
    `<div class="cycle-switch">${sections.join('')}</div>`,
    { confirmLabel: i18n.t('cycles.switchConfirm') },
  );
}

function _initDevArea(eventBus, i18n) {
  const btn  = document.getElementById('dev-area-btn');
  const area = document.getElementById('dev-area');
  if (!btn || !area) return;

  let open = false;
  let labInstance = null;

  const close = () => {
    if (!open) return;
    open = false;
    area.style.display = 'none';
    document.body.classList.remove('dev-area-open');
    btn.classList.remove('btn--active');
  };

  const toggle = async () => {
    open = !open;
    area.style.display = open ? '' : 'none';
    document.body.classList.toggle('dev-area-open', open);
    btn.classList.toggle('btn--active', open);

    if (open) {
      eventBus.emit('overlay:opened', 'dev-area');
      // Lazy-load Algorithm Lab on first open
      if (!labInstance) {
        const { AlgorithmLab } = await import('./algorithm-lab/lab-core.js');
        labInstance = new AlgorithmLab(area, { eventBus, i18n });
        await labInstance.init();
      }
    }
  };

  btn.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) toggle();
  });
  eventBus.on('overlay:opened', (id) => { if (id !== 'dev-area') close(); });

  // Open dev area & ensure Lab is ready when a module requests lab:navigate.
  // The Lab's own listener on lab:navigate will call navigate() — we only
  // need to guarantee the panel is visible and the Lab instance exists.
  eventBus.on('lab:navigate', async (payload) => {
    if (!open) {
      open = true;
      area.style.display = '';
      document.body.classList.add('dev-area-open');
      btn.classList.add('btn--active');
      eventBus.emit('overlay:opened', 'dev-area');
    }
    if (!labInstance) {
      const { AlgorithmLab } = await import('./algorithm-lab/lab-core.js');
      labInstance = new AlgorithmLab(area, { eventBus, i18n });
      await labInstance.init();
      // Lab registers its own lab:navigate listener during init(), but
      // that listener missed this event — so navigate explicitly.
      labInstance.navigate(payload.algoId, payload.tab);
    }
  });
}

/**
 * Wire the global "Module Help" header button.
 * Opens the right-side help panel showing two tabs for the active module:
 *   - "Hilfe"        — lazy-loaded module help (via the module's `help` field)
 *   - "Beispieldaten" — catalog examples matching the active module
 *
 * The button is visible whenever the active module exposes at least one
 * of these (help loader OR matching catalog examples + loadExample method).
 *
 * @param {import('./ui/workspace.js').Workspace} workspace
 * @param {import('./ui/help-panel.js').HelpPanel} helpPanel
 * @param {import('./core/i18n.js').I18n} i18n
 * @param {import('./core/event-bus.js').EventBus} eventBus
 * @param {import('./core/examples-registry.js').ExamplesRegistry} examplesRegistry
 */
function _initModuleHelp(workspace, helpPanel, i18n, eventBus, examplesRegistry) {
  const btn = document.getElementById('module-help-btn');
  if (!btn || !workspace || !helpPanel) return;

  const _activeContext = () => {
    const info = workspace.getActiveModuleInfo();
    if (!info) return { info: null, hasHelp: false, examples: [], canLoadExample: false };
    const hasHelp = typeof info.instance?.help === 'function';
    const examples = examplesRegistry ? examplesRegistry.getForModule(info.moduleId) : [];
    const canLoadExample = typeof info.instance?.loadExample === 'function';
    return { info, hasHelp, examples, canLoadExample };
  };

  const updateVisibility = () => {
    const { hasHelp, examples, canLoadExample } = _activeContext();
    const hasExamples = canLoadExample && examples.length > 0;
    const show = hasHelp || hasExamples;
    btn.style.display = show ? '' : 'none';
    if (!show && helpPanel.isVisible()) {
      helpPanel.hide();
      btn.classList.remove('btn--active');
    }
  };

  updateVisibility();

  if (eventBus) {
    eventBus.on('module:activated', updateVisibility);
    eventBus.on('module:removed', updateVisibility);
    eventBus.on('module:added', updateVisibility);
    eventBus.on('phase:selected', updateVisibility);
  }

  const loadExampleAndApply = async (exampleId) => {
    const { info, canLoadExample } = _activeContext();
    if (!info || !canLoadExample || !examplesRegistry) return;

    try {
      const payload = await examplesRegistry.load(exampleId);
      await info.instance.loadExample(payload);
      const title = payload.meta?.title?.[i18n.getLanguage()] || payload.meta?.title?.en || exampleId;
      if (typeof workspace.notify === 'function') {
        // Workspace doesn't expose notify directly; emit a simple event instead.
      }
      eventBus?.emit?.('example:loaded', { moduleId: info.moduleId, exampleId, title });
    } catch (err) {
      console.error('[ModuleHelp] Failed to load example', exampleId, err);
      eventBus?.emit?.('example:loadFailed', { exampleId, error: err.message });
    }
  };

  btn.addEventListener('click', async () => {
    // Toggle: if already visible, close.
    if (helpPanel.isVisible()) {
      helpPanel.hide();
      btn.classList.remove('btn--active');
      return;
    }

    const { info, hasHelp, examples, canLoadExample } = _activeContext();
    btn.classList.add('btn--active');

    if (!info) {
      helpPanel.showWithTabs(i18n.t('moduleHelp.title'), {
        helpHtml: `<p style="color:var(--color-text-secondary)">${i18n.t('moduleHelp.noActiveModule')}</p>`,
      });
      return;
    }

    const moduleName = i18n.t(`modules.${info.moduleId}.name`);
    const tabExamples = canLoadExample ? examples : [];

    // Loading placeholder for help tab.
    const loadingHelp = hasHelp ? `<p>${i18n.t('moduleHelp.loading')}</p>` : '';

    helpPanel.showWithTabs(moduleName, {
      helpHtml: hasHelp ? loadingHelp : `<p style="color:var(--color-text-secondary)">${i18n.t('moduleHelp.notAvailable')}</p>`,
      examples: tabExamples,
      onLoadExample: loadExampleAndApply,
    });

    if (!hasHelp) return;

    try {
      const mod = await info.instance.help();
      const helpDef = mod?.default || mod;
      const html = _renderModuleHelp(helpDef, i18n.getLanguage());
      helpPanel.showWithTabs(moduleName, {
        helpHtml: html,
        examples: tabExamples,
        onLoadExample: loadExampleAndApply,
        preferredTab: 'help',
      });
    } catch (err) {
      console.error('[ModuleHelp] Failed to load help for', info.moduleId, err);
      helpPanel.showWithTabs(moduleName, {
        helpHtml: `<p style="color:var(--color-error)">${i18n.t('moduleHelp.loadError')}: ${err.message}</p>`,
        examples: tabExamples,
        onLoadExample: loadExampleAndApply,
      });
    }
  });

  // Sync button active state when help panel is closed via its own ✕.
  const helpEl = document.getElementById('help-panel');
  if (helpEl) {
    const observer = new MutationObserver(() => {
      btn.classList.toggle('btn--active', helpPanel.isVisible());
    });
    observer.observe(helpEl, { attributes: true, attributeFilter: ['class'] });
  }
}

/**
 * Honor deeplinks like `?module=process-capability&example=capability-bolzendurchmesser`.
 * Activates the requested module (creating an instance in its default phase if
 * none exists), then asks the module to load the requested example.
 * Query parameters are stripped from the URL afterwards so a reload doesn't
 * repeat the action.
 */
function _handleExampleDeeplink({ stateManager, eventBus, moduleRegistry, examplesRegistry, workspace, notify, i18n }) {
  const params = new URLSearchParams(location.search);
  const moduleId = params.get('module');
  const exampleId = params.get('example');
  if (!moduleId && !exampleId) return;

  // Strip these params immediately so reload/back doesn't re-trigger.
  const next = new URLSearchParams(location.search);
  next.delete('module');
  next.delete('example');
  const cleaned = next.toString();
  history.replaceState(null, '', location.pathname + (cleaned ? `?${cleaned}` : '') + location.hash);

  if (!moduleId) return;
  const def = moduleRegistry.get(moduleId);
  if (!def) {
    console.warn(`[Deeplink] Unknown module: ${moduleId}`);
    return;
  }

  // Run async work without blocking init.
  (async () => {
    const instanceId = _ensureInstance(stateManager, moduleRegistry, eventBus, moduleId, def);
    if (!instanceId) return;

    if (!exampleId) return;

    const instance = await _waitForActivation(workspace, eventBus, instanceId, 4000);
    if (!instance) {
      console.warn('[Deeplink] Module did not activate in time:', moduleId);
      return;
    }
    if (typeof instance.loadExample !== 'function') {
      notify?.(i18n.t('moduleHelp.exampleLoadError'), 'error');
      return;
    }
    try {
      const payload = await examplesRegistry.load(exampleId);
      await instance.loadExample(payload);
    } catch (err) {
      console.error('[Deeplink] Failed to load example', exampleId, err);
      notify?.(i18n.t('moduleHelp.exampleLoadError'), 'error');
    }
  })();
}

function _ensureInstance(stateManager, moduleRegistry, eventBus, moduleId, def) {
  // Existing instance in any phase?
  for (const phase of Object.keys(stateManager.get('phases') || {})) {
    const insts = stateManager.get(`phases.${phase}`) ?? [];
    const found = insts.find(i => i.moduleId === moduleId);
    if (found) {
      eventBus.emit('module:activated', { instanceId: found.instanceId });
      return found.instanceId;
    }
  }

  // Create a new instance in the module's default phase for the active cycle.
  const activeCycle = moduleRegistry.getActiveCycle();
  const targetPhase = def.phase === 'data'
    ? 'data'
    : (def.cycles?.[activeCycle]?.phase || def.phase || 'extras');

  const instanceId = crypto.randomUUID();
  const phases = stateManager.get(`phases.${targetPhase}`) ?? [];
  phases.push({ instanceId, moduleId, order: phases.length, state: {} });
  stateManager.set(`phases.${targetPhase}`, phases);
  eventBus.emit('module:added', { moduleId, phase: targetPhase, instanceId });
  return instanceId;
}

function _waitForActivation(workspace, eventBus, instanceId, timeoutMs) {
  return new Promise((resolve) => {
    const check = () => {
      const info = workspace.getActiveModuleInfo();
      if (info?.instanceId === instanceId) return info.instance;
      return null;
    };
    const immediate = check();
    if (immediate) return resolve(immediate);

    let done = false;
    const finish = (instance) => { if (done) return; done = true; eventBus.off('module:activated', listener); clearTimeout(timer); resolve(instance); };
    const listener = ({ instanceId: id }) => {
      if (id !== instanceId) return;
      // Wait a tick for the workspace to swap _activeInstanceId.
      setTimeout(() => finish(check()), 0);
    };
    eventBus.on('module:activated', listener);
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

/**
 * Minimal renderer for module help content. Walks the help definition's
 * sections (in the requested language) and emits HTML for the standard
 * block types: paragraph, definition, heading, list.
 *
 * @param {object} helpDef - Help module's default export
 * @param {string} lang - Current language code
 * @returns {string} HTML
 */
function _renderModuleHelp(helpDef, lang) {
  if (!helpDef || !helpDef.sections) {
    return '<p>No help content.</p>';
  }

  const escape = (s) => {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  };

  const renderBlock = (b) => {
    if (!b) return '';
    switch (b.type) {
      case 'paragraph':
        return `<p>${escape(b.content)}</p>`;
      case 'definition':
        return `<p><strong>${escape(b.term)}:</strong> ${escape(b.content)}</p>`;
      case 'heading':
        return `<h4>${escape(b.content)}</h4>`;
      case 'list':
        return `<ul>${(b.items || []).map(it => `<li>${escape(it)}</li>`).join('')}</ul>`;
      default:
        return b.content ? `<p>${escape(b.content)}</p>` : '';
    }
  };

  const parts = [];
  for (const [, section] of Object.entries(helpDef.sections)) {
    const localized = section?.[lang] || section?.en || section?.de;
    if (!localized) continue;
    if (localized.title) parts.push(`<h3>${escape(localized.title)}</h3>`);
    for (const block of localized.blocks || []) {
      parts.push(renderBlock(block));
    }
  }

  return parts.join('\n') || '<p>No help content.</p>';
}

function _initDashboard(eventBus, i18n, stateManager, chartManager) {
  const btn  = document.getElementById('dashboard-btn');
  const area = document.getElementById('dashboard-area');
  if (!btn || !area) return;

  // Phase iteration helpers (cycle-aware).
  // - _allPhaseKeys: every phase actually present in state (incl. data + extras).
  //   Use this for "find module instance across phases" lookups.
  // - _methodPhaseKeys: methodology phases of the active cycle (no data/extras).
  //   Use this for ZEG/achievement iteration.
  const _allPhaseKeys = () => Object.keys(stateManager.get('phases') || {});
  const _methodPhaseKeys = () => getPhaseIds(stateManager.getProjectCycle());
  let open = false;
  let chart = null;
  let grid = null;
  let gridContainer = null;
  let addMenuEl = null;

  const _buildShell = () => {
    area.innerHTML = `
      <div class="dashboard-area__inner">
        <header class="dashboard-area__header">
          <h2 class="dashboard-area__title">
            ${i18n.t('dashboard.title')}
            <span class="dashboard-area__project-name" data-ref="project-name">${_escapeHtml(stateManager.get('projectMeta.name') || '')}</span>
          </h2>
          <div class="dashboard-area__toolbar">
            <button type="button" class="btn btn--sm btn--ghost" data-ref="export-png-btn" title="PNG">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              PNG
            </button>
            <button type="button" class="btn btn--sm btn--ghost" data-ref="export-svg-btn" title="SVG">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 15l2 2 4-4"/></svg>
              SVG
            </button>
            <button type="button" class="btn btn--sm" data-ref="add-btn">+ ${i18n.t('dashboard.addTile')}</button>
          </div>
        </header>
        <div class="dashboard-grid" data-ref="grid"></div>
      </div>
    `;
    gridContainer = area.querySelector('[data-ref="grid"]');
  };

  const _escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  const _charterInstanceExists = () => {
    const phases = stateManager.get('phases') || {};
    for (const phase of _allPhaseKeys()) {
      for (const inst of (phases[phase] || [])) {
        if (inst.moduleId === 'project-charter') return true;
      }
    }
    return false;
  };

  const _findCharterState = () => {
    const phases = stateManager.get('phases') || {};
    for (const phase of _allPhaseKeys()) {
      const list = phases[phase] || [];
      for (const inst of list) {
        if (inst.moduleId === 'project-charter') {
          return stateManager.getModuleState(inst.instanceId);
        }
      }
    }
    return null;
  };

  /** Collect all FMEA module instances across phases. */
  const _findAllFmeaInstances = () => {
    const phases = stateManager.get('phases') || {};
    const result = [];
    for (const phase of _allPhaseKeys()) {
      const list = phases[phase] || [];
      for (const inst of list) {
        if (inst.moduleId === 'fmea') {
          result.push({
            instanceId: inst.instanceId,
            phase,
            label: inst.customName || i18n.t('modules.fmea.name'),
          });
        }
      }
    }
    return result;
  };

  /** Build dynamic tile defs for all current FMEA instances. */
  const _buildFmeaTileDefs = () => {
    const customTitles = stateManager.get('dashboard.titles') || {};
    return _findAllFmeaInstances().map(inst => {
      const id = `fmea:${inst.instanceId}`;
      return {
        id,
        i18nTitle: '',
        title: customTitles[id] || `FMEA — ${inst.label}`,
        defaultW: 3, defaultH: 10, minW: 2, minH: 6,
        removeLabel: i18n.t('dashboard.removeTile'),
        moveTitle: i18n.t('dashboard.moveTile'),
        resizeTitle: i18n.t('dashboard.resizeTile'),
      };
    });
  };

  const _rpnCategory = (rpn) => {
    if (!rpn) return 'none';
    if (rpn > 200) return 'critical';
    if (rpn >= 125) return 'high';
    if (rpn >= 50) return 'medium';
    return 'low';
  };

  const _rpnCategoryColor = (cat) => {
    const map = {
      critical: 'var(--color-error)',
      high:     'var(--color-warning)',
      medium:   'var(--color-info)',
      low:      'var(--color-success)',
      none:     'var(--color-text-tertiary)',
    };
    return map[cat] || map.none;
  };

  const _renderFmea = (tileId) => {
    const body = grid?.getTileBody(tileId);
    if (!body) return;
    const instanceId = tileId.replace('fmea:', '');
    const state = stateManager.getModuleState(instanceId);
    const risks = (state && Array.isArray(state.risks)) ? state.risks : [];

    if (risks.length === 0) {
      body.innerHTML = `<p class="dashboard-area__empty">${i18n.t('dashboard.fmeaEmpty')}</p>`;
      return;
    }

    // Compute RPNs
    const rpns = risks.map(r => {
      const s = parseInt(r.sev) || 0;
      const o = parseInt(r.occ) || 0;
      const d = parseInt(r.det) || 0;
      return (s && o && d) ? s * o * d : 0;
    });

    // Category counts
    const cats = { critical: 0, high: 0, medium: 0, low: 0, none: 0 };
    rpns.forEach(v => cats[_rpnCategory(v)]++);

    // Top 5 by RPN
    const indexed = risks.map((r, i) => ({ risk: r, rpn: rpns[i] }));
    indexed.sort((a, b) => b.rpn - a.rpn);
    const top = indexed.slice(0, 5);

    const catLabels = {
      critical: i18n.t('dashboard.fmeaCritical'),
      high: i18n.t('dashboard.fmeaHigh'),
      medium: i18n.t('dashboard.fmeaMedium'),
      low: i18n.t('dashboard.fmeaLow'),
      none: i18n.t('dashboard.fmeaNotRated'),
    };

    const totalRated = rpns.filter(v => v > 0).length;
    const maxRPN = Math.max(...rpns, 0);

    // Summary bar
    const barSegments = ['critical', 'high', 'medium', 'low'].map(cat => {
      const pct = totalRated > 0 ? (cats[cat] / risks.length * 100) : 0;
      if (pct === 0) return '';
      return `<div class="dashboard-fmea__bar-seg" style="width:${pct}%;background:${_rpnCategoryColor(cat)}" title="${catLabels[cat]}: ${cats[cat]}"></div>`;
    }).join('');

    // Category legend
    const legend = ['critical', 'high', 'medium', 'low', 'none'].filter(c => cats[c] > 0).map(cat =>
      `<span class="dashboard-fmea__legend-item">
        <span class="dashboard-fmea__legend-dot" style="background:${_rpnCategoryColor(cat)}"></span>
        ${catLabels[cat]}: ${cats[cat]}
      </span>`
    ).join('');

    // Top risks list
    const topHtml = top.filter(t => t.rpn > 0).map(t => {
      const cat = _rpnCategory(t.rpn);
      const desc = _escapeHtml(t.risk.failureMode || t.risk.step || '—');
      return `
        <li class="dashboard-fmea__top-item">
          <span class="dashboard-fmea__top-desc">${desc}</span>
          <span class="dashboard-fmea__top-rpn" style="color:${_rpnCategoryColor(cat)}">RPN ${t.rpn}</span>
        </li>`;
    }).join('');

    body.innerHTML = `
      <div class="dashboard-fmea__summary">
        <span>${i18n.t('dashboard.fmeaRisks')}: <strong>${risks.length}</strong></span>
        <span>${i18n.t('dashboard.fmeaMaxRPN')}: <strong style="color:${_rpnCategoryColor(_rpnCategory(maxRPN))}">${maxRPN || '—'}</strong></span>
      </div>
      <div class="dashboard-fmea__bar">${barSegments}</div>
      <div class="dashboard-fmea__legend">${legend}</div>
      ${topHtml ? `
        <div class="dashboard-fmea__top-label">${i18n.t('dashboard.fmeaTopRisks')}</div>
        <ol class="dashboard-fmea__top-list">${topHtml}</ol>
      ` : ''}
    `;
  };

  // ── Ishikawa dashboard tiles (dynamic, one per instance) ──────
  const ISHIKAWA_CATS = [
    { key: 'man',         color: '#2563eb' },
    { key: 'machine',     color: '#7c3aed' },
    { key: 'environment', color: '#059669' },
    { key: 'material',    color: '#d97706' },
    { key: 'measurement', color: '#dc2626' },
    { key: 'method',      color: '#0891b2' },
  ];

  const _findAllIshikawaInstances = () => {
    const phases = stateManager.get('phases') || {};
    const result = [];
    for (const phase of _allPhaseKeys()) {
      const list = phases[phase] || [];
      for (const inst of list) {
        if (inst.moduleId === 'ishikawa') {
          result.push({
            instanceId: inst.instanceId,
            phase,
            label: inst.customName || i18n.t('modules.ishikawa.name'),
          });
        }
      }
    }
    return result;
  };

  const _buildIshikawaTileDefs = () => {
    const customTitles = stateManager.get('dashboard.titles') || {};
    return _findAllIshikawaInstances().map(inst => {
      const id = `ishikawa:${inst.instanceId}`;
      return {
        id,
        i18nTitle: '',
        title: customTitles[id] || `Ishikawa — ${inst.label}`,
        defaultW: 3, defaultH: 10, minW: 2, minH: 6,
        removeLabel: i18n.t('dashboard.removeTile'),
        moveTitle: i18n.t('dashboard.moveTile'),
        resizeTitle: i18n.t('dashboard.resizeTile'),
      };
    });
  };

  const _renderIshikawa = (tileId) => {
    const body = grid?.getTileBody(tileId);
    if (!body) return;
    const instanceId = tileId.replace('ishikawa:', '');
    const state = stateManager.getModuleState(instanceId);
    const rows = (state && Array.isArray(state.rows)) ? state.rows : [];
    const experts = (state && Array.isArray(state.experts)) ? state.experts : [];
    const problem = (state && state.problem) || '';
    const catLabels = (state && state.catLabels) || {};
    const catLabel = (key) => {
      const custom = catLabels[key];
      if (custom && custom.trim()) return custom.trim();
      return i18n.t(`modules.ishikawa.cat.${key}`);
    };

    if (rows.length === 0) {
      body.innerHTML = `<p class="dashboard-area__empty">${i18n.t('dashboard.ishikawaEmpty')}</p>`;
      return;
    }

    // Effective category: climb parent chain
    const effCat = (r) => {
      if (r.category) return r.category;
      if (r.parentId !== null) {
        const p = rows.find(x => x.id === r.parentId);
        if (p) return effCat(p);
      }
      return '';
    };

    // Count per 6M category
    const catCounts = {};
    ISHIKAWA_CATS.forEach(c => catCounts[c.key] = 0);
    rows.forEach(r => {
      const ec = effCat(r);
      if (ec && catCounts.hasOwnProperty(ec)) catCounts[ec]++;
    });
    const totalCategorized = Object.values(catCounts).reduce((a, b) => a + b, 0);

    // Status counts
    const statusCounts = { open: 0, testing: 0, confirmed: 0, rejected: 0 };
    rows.forEach(r => {
      const s = r.status || 'open';
      if (statusCounts.hasOwnProperty(s)) statusCounts[s]++;
    });

    // 6M bar
    const barHtml = totalCategorized > 0 ? ISHIKAWA_CATS.map(c => {
      const pct = catCounts[c.key] / totalCategorized * 100;
      if (pct === 0) return '';
      return `<div class="dashboard-fmea__bar-seg" style="width:${pct}%;background:${c.color}" title="${_escapeHtml(catLabel(c.key))}: ${catCounts[c.key]}"></div>`;
    }).join('') : '';

    // Legend
    const legend = ISHIKAWA_CATS.filter(c => catCounts[c.key] > 0).map(c =>
      `<span class="dashboard-fmea__legend-item">
        <span class="dashboard-fmea__legend-dot" style="background:${c.color}"></span>
        ${_escapeHtml(catLabel(c.key))}: ${catCounts[c.key]}
      </span>`
    ).join('');

    // Status summary
    const statusColors = {
      open: 'var(--color-text-tertiary)',
      testing: 'var(--color-info)',
      confirmed: 'var(--color-success)',
      rejected: 'var(--color-error)',
    };
    const statusHtml = ['open', 'testing', 'confirmed', 'rejected']
      .filter(s => statusCounts[s] > 0)
      .map(s => `<span class="dashboard-fmea__legend-item">
        <span class="dashboard-fmea__legend-dot" style="background:${statusColors[s]}"></span>
        ${i18n.t(`modules.ishikawa.status.${s}`)}: ${statusCounts[s]}
      </span>`).join('');

    // Top scored hypotheses
    const scored = rows
      .filter(r => {
        if (!experts.length) return false;
        const vals = experts.map(e => r.ratings?.[e.id]).filter(x => x !== undefined && x !== null && x !== '');
        return vals.length > 0;
      })
      .map(r => {
        const vals = experts.map(e => r.ratings?.[e.id]).filter(x => x !== undefined && x !== null && x !== '');
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        return { name: r.name, score: avg, cat: effCat(r) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const topHtml = scored.length > 0 ? scored.map(t => {
      const catObj = ISHIKAWA_CATS.find(c => c.key === t.cat);
      const color = catObj ? catObj.color : 'var(--color-text-secondary)';
      return `<li class="dashboard-fmea__top-item">
        <span class="dashboard-fmea__top-desc">${_escapeHtml(t.name || '—')}</span>
        <span class="dashboard-fmea__top-rpn" style="color:${color}">${t.score.toFixed(1)}</span>
      </li>`;
    }).join('') : '';

    body.innerHTML = `
      ${problem ? `<div class="dashboard-charter__problem" style="margin-bottom:8px;font-size:var(--font-size-sm);opacity:0.8">${_escapeHtml(problem)}</div>` : ''}
      <div class="dashboard-fmea__summary">
        <span>${i18n.t('dashboard.ishikawaHypotheses')}: <strong>${rows.length}</strong></span>
        <span>${i18n.t('dashboard.ishikawaExperts')}: <strong>${experts.length}</strong></span>
      </div>
      ${barHtml ? `<div class="dashboard-fmea__bar">${barHtml}</div>` : ''}
      <div class="dashboard-fmea__legend">${legend}</div>
      ${statusHtml ? `<div class="dashboard-fmea__legend" style="margin-top:4px">${statusHtml}</div>` : ''}
      ${topHtml ? `
        <div class="dashboard-fmea__top-label">${i18n.t('dashboard.ishikawaTopScored')}</div>
        <ol class="dashboard-fmea__top-list">${topHtml}</ol>
      ` : ''}
    `;
  };

  // ── VoC → CTx-Baum dashboard tile ─────────────────────────────
  const _findVocState = () => {
    const phases = stateManager.get('phases') || {};
    for (const phase of _allPhaseKeys()) {
      const list = phases[phase] || [];
      for (const inst of list) {
        if (inst.moduleId === 'voc-ctx-tree') {
          return stateManager.getModuleState(inst.instanceId);
        }
      }
    }
    return null;
  };

  const _renderVoc = () => {
    const body = grid?.getTileBody('voc-ctx-tree');
    if (!body) return;
    const state = _findVocState();
    const vocs = (state && Array.isArray(state.vocs)) ? state.vocs : [];

    if (vocs.length === 0) {
      body.innerHTML = `<p class="dashboard-area__empty">${i18n.t('dashboard.vocEmpty')}</p>`;
      return;
    }

    // Count nodes by type
    let needs = 0, ctq = 0, ctd = 0, ctc = 0, reqs = 0;
    for (const voc of vocs) {
      for (const need of (voc.needs || [])) {
        needs++;
        for (const drv of (need.drivers || [])) {
          if (drv.type === 'ctq') ctq++;
          else if (drv.type === 'ctd') ctd++;
          else if (drv.type === 'ctc') ctc++;
          reqs += (drv.requirements || []).length;
        }
      }
    }
    const drivers = ctq + ctd + ctc;

    // VoC list (truncated)
    const vocList = vocs.slice(0, 6).map(v =>
      `<li class="dashboard-voc__item">\u201E${_escapeHtml(v.text || '—')}\u201C${v.source ? ` <span class="dashboard-area__muted">(${_escapeHtml(v.source)})</span>` : ''}</li>`
    ).join('');
    const moreHtml = vocs.length > 6 ? `<li class="dashboard-voc__item dashboard-area__muted">… +${vocs.length - 6}</li>` : '';

    body.innerHTML = `
      <div class="dashboard-voc__summary">
        <span class="dashboard-voc__stat"><strong>${vocs.length}</strong> VoC</span>
        <span class="dashboard-voc__stat"><strong>${needs}</strong> ${i18n.t('dashboard.vocNeeds')}</span>
        <span class="dashboard-voc__stat"><strong>${drivers}</strong> ${i18n.t('dashboard.vocDrivers')}</span>
        <span class="dashboard-voc__stat"><strong>${reqs}</strong> ${i18n.t('dashboard.vocReqs')}</span>
      </div>
      ${drivers > 0 ? `<div class="dashboard-voc__driver-bar">
        ${ctq > 0 ? `<div class="dashboard-voc__bar-seg" style="flex:${ctq};background:var(--color-voc-ctq, rgba(39,174,96,1))" title="CTQ: ${ctq}"></div>` : ''}
        ${ctd > 0 ? `<div class="dashboard-voc__bar-seg" style="flex:${ctd};background:var(--color-voc-ctd, rgba(41,128,185,1))" title="CTD: ${ctd}"></div>` : ''}
        ${ctc > 0 ? `<div class="dashboard-voc__bar-seg" style="flex:${ctc};background:var(--color-voc-ctc, rgba(231,76,139,1))" title="CTC: ${ctc}"></div>` : ''}
      </div>
      <div class="dashboard-voc__driver-legend">
        ${ctq > 0 ? `<span class="dashboard-voc__legend-item"><span class="dashboard-fmea__legend-dot" style="background:var(--color-voc-ctq, rgba(39,174,96,1))"></span>CTQ: ${ctq}</span>` : ''}
        ${ctd > 0 ? `<span class="dashboard-voc__legend-item"><span class="dashboard-fmea__legend-dot" style="background:var(--color-voc-ctd, rgba(41,128,185,1))"></span>CTD: ${ctd}</span>` : ''}
        ${ctc > 0 ? `<span class="dashboard-voc__legend-item"><span class="dashboard-fmea__legend-dot" style="background:var(--color-voc-ctc, rgba(231,76,139,1))"></span>CTC: ${ctc}</span>` : ''}
      </div>` : ''}
      <div class="dashboard-voc__list-label">${i18n.t('dashboard.vocStatements')}</div>
      <ul class="dashboard-voc__list">${vocList}${moreHtml}</ul>
    `;
  };

  // ── RACI dashboard tiles (dynamic, one per instance) ──────────
  const _findAllRaciInstances = () => {
    const phases = stateManager.get('phases') || {};
    const result = [];
    for (const phase of _allPhaseKeys()) {
      const list = phases[phase] || [];
      for (const inst of list) {
        if (inst.moduleId === 'raci-matrix') {
          result.push({
            instanceId: inst.instanceId,
            phase,
            label: inst.customName || i18n.t('modules.raci-matrix.name'),
          });
        }
      }
    }
    return result;
  };

  const _buildRaciTileDefs = () => {
    const customTitles = stateManager.get('dashboard.titles') || {};
    return _findAllRaciInstances().map(inst => {
      const id = `raci:${inst.instanceId}`;
      return {
        id,
        i18nTitle: '',
        title: customTitles[id] || `RACI — ${inst.label}`,
        defaultW: 3, defaultH: 10, minW: 2, minH: 6,
        removeLabel: i18n.t('dashboard.removeTile'),
        moveTitle: i18n.t('dashboard.moveTile'),
        resizeTitle: i18n.t('dashboard.resizeTile'),
      };
    });
  };

  const _renderRaci = (tileId) => {
    const body = grid?.getTileBody(tileId);
    if (!body) return;
    const instanceId = tileId.replace('raci:', '');
    const state = stateManager.getModuleState(instanceId);
    const activities = (state && Array.isArray(state.activities)) ? state.activities : [];
    const stakeholders = (state && Array.isArray(state.stakeholders)) ? state.stakeholders : [];
    const assignments = (state && state.assignments) || {};

    if (activities.length === 0 && stakeholders.length === 0) {
      body.innerHTML = `<p class="dashboard-area__empty">${i18n.t('dashboard.raciEmpty')}</p>`;
      return;
    }

    // Count role assignments
    const counts = { R: 0, A: 0, C: 0, I: 0 };
    const totalCells = activities.length * stakeholders.length;
    let filled = 0;
    for (const val of Object.values(assignments)) {
      if (val && counts.hasOwnProperty(val)) {
        counts[val]++;
        filled++;
      }
    }
    const coverage = totalCells > 0 ? Math.round(filled / totalCells * 100) : 0;

    const roleColors = {
      R: 'var(--color-error)',
      A: 'var(--color-warning)',
      C: 'var(--color-accent)',
      I: 'var(--color-success)',
    };

    // Bar segments
    const barHtml = filled > 0 ? ['R', 'A', 'C', 'I'].map(role => {
      const pct = counts[role] / filled * 100;
      if (pct === 0) return '';
      return `<div class="dashboard-raci__bar-seg" style="width:${pct}%;background:${roleColors[role]}" title="${role}: ${counts[role]}"></div>`;
    }).join('') : '';

    // Legend
    const legend = ['R', 'A', 'C', 'I'].filter(r => counts[r] > 0).map(role =>
      `<span class="dashboard-raci__legend-item">
        <span class="dashboard-fmea__legend-dot" style="background:${roleColors[role]}"></span>
        ${role}: ${counts[role]}
      </span>`
    ).join('');

    // Warnings: activities without R or A
    const warnings = [];
    activities.forEach((act, aIdx) => {
      let hasR = false, hasA = false;
      stakeholders.forEach((_, sIdx) => {
        const v = assignments[`${aIdx}:${sIdx}`];
        if (v === 'R') hasR = true;
        if (v === 'A') hasA = true;
      });
      if (!hasR) warnings.push({ act, missing: 'R' });
      if (!hasA) warnings.push({ act, missing: 'A' });
    });

    const warningHtml = warnings.length > 0
      ? `<div class="dashboard-raci__warn-label">${i18n.t('dashboard.raciWarnings')}</div>
         <ul class="dashboard-raci__warn-list">${warnings.slice(0, 5).map(w =>
           `<li class="dashboard-raci__warn-item"><span class="dashboard-raci__warn-role" style="color:${roleColors[w.missing]}">${w.missing}</span> ${i18n.t('dashboard.raciMissing')}: ${_escapeHtml(w.act)}</li>`
         ).join('')}${warnings.length > 5 ? `<li class="dashboard-area__muted">… +${warnings.length - 5}</li>` : ''}</ul>`
      : '';

    body.innerHTML = `
      <div class="dashboard-raci__summary">
        <span>${i18n.t('dashboard.raciActivities')}: <strong>${activities.length}</strong></span>
        <span>${i18n.t('dashboard.raciStakeholders')}: <strong>${stakeholders.length}</strong></span>
        <span>${i18n.t('dashboard.raciCoverage')}: <strong>${coverage}%</strong></span>
      </div>
      ${barHtml ? `<div class="dashboard-raci__bar">${barHtml}</div>` : ''}
      <div class="dashboard-raci__legend">${legend}</div>
      ${warningHtml}
    `;
  };

  // ── SPC dashboard tiles (dynamic, one per control-chart instance) ──
  const _findAllSpcInstances = () => {
    const phases = stateManager.get('phases') || {};
    const result = [];
    for (const phase of _allPhaseKeys()) {
      const list = phases[phase] || [];
      for (const inst of list) {
        if (inst.moduleId === 'control-chart') {
          result.push({
            instanceId: inst.instanceId,
            phase,
            label: inst.customName || i18n.t('modules.control-chart.name'),
          });
        }
      }
    }
    return result;
  };

  const _buildSpcTileDefs = () => {
    const customTitles = stateManager.get('dashboard.titles') || {};
    return _findAllSpcInstances().map(inst => {
      const id = `spc:${inst.instanceId}`;
      return {
        id,
        i18nTitle: '',
        title: customTitles[id] || `SPC — ${inst.label}`,
        defaultW: 3, defaultH: 10, minW: 2, minH: 6,
        removeLabel: i18n.t('dashboard.removeTile'),
        moveTitle: i18n.t('dashboard.moveTile'),
        resizeTitle: i18n.t('dashboard.resizeTile'),
      };
    });
  };

  /**
   * Build a compact SVG sparkline for a control chart subchart.
   * Shows data line, CL, UCL/LCL zones, spec limits, and violation dots.
   * @param {object} scData - subchart result {values, cl, ucl, lcl, sigma}
   * @param {Set<number>} violationSet - indices flagged by Nelson Rules
   * @param {number|null} usl - upper spec limit
   * @param {number|null} lsl - lower spec limit
   * @param {number} [width=320] - actual container width in px
   * @returns {string} SVG markup
   */
  const _buildSpcSparkline = (scData, violationSet, usl, lsl, width) => {
    const W = width || 320, H = 160, PAD_X = 2, PAD_Y = 6;
    const pts = scData.values.filter(v => v !== null);
    if (pts.length < 2) return '';

    const extents = [scData.lcl, scData.ucl, ...pts];
    if (usl != null) extents.push(usl);
    if (lsl != null) extents.push(lsl);
    const yMin = Math.min(...extents) - scData.sigma * 0.3;
    const yMax = Math.max(...extents) + scData.sigma * 0.3;
    const yRange = yMax - yMin || 1;

    const sx = (i) => PAD_X + (i / (scData.values.length - 1)) * (W - 2 * PAD_X);
    const sy = (v) => PAD_Y + (1 - (v - yMin) / yRange) * (H - 2 * PAD_Y);

    const uclY = sy(scData.ucl), lclY = sy(scData.lcl), clY = sy(scData.cl);
    let svg = `<svg class="dashboard-spc__sparkline" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;

    // Zone between UCL and LCL
    svg += `<rect x="${PAD_X}" y="${uclY}" width="${W - 2 * PAD_X}" height="${lclY - uclY}" fill="var(--color-success)" opacity="0.06" rx="2"/>`;

    // UCL / LCL / CL lines
    svg += `<line x1="${PAD_X}" y1="${uclY}" x2="${W - PAD_X}" y2="${uclY}" stroke="var(--color-error)" stroke-width="0.8" stroke-dasharray="4,3" opacity="0.6"/>`;
    svg += `<line x1="${PAD_X}" y1="${lclY}" x2="${W - PAD_X}" y2="${lclY}" stroke="var(--color-error)" stroke-width="0.8" stroke-dasharray="4,3" opacity="0.6"/>`;
    svg += `<line x1="${PAD_X}" y1="${clY}" x2="${W - PAD_X}" y2="${clY}" stroke="var(--color-accent)" stroke-width="0.8" opacity="0.5"/>`;

    // USL / LSL lines
    if (usl != null) {
      const uslY = sy(usl);
      svg += `<line x1="${PAD_X}" y1="${uslY}" x2="${W - PAD_X}" y2="${uslY}" stroke="var(--color-warning)" stroke-width="1" opacity="0.7"/>`;
    }
    if (lsl != null) {
      const lslY = sy(lsl);
      svg += `<line x1="${PAD_X}" y1="${lslY}" x2="${W - PAD_X}" y2="${lslY}" stroke="var(--color-warning)" stroke-width="1" opacity="0.7"/>`;
    }

    // Data polyline
    const polyPts = [];
    for (let i = 0; i < scData.values.length; i++) {
      if (scData.values[i] === null) continue;
      polyPts.push(`${sx(i).toFixed(1)},${sy(scData.values[i]).toFixed(1)}`);
    }
    svg += `<polyline points="${polyPts.join(' ')}" fill="none" stroke="var(--color-text-secondary)" stroke-width="1.2" stroke-linejoin="round"/>`;

    // Violation & out-of-spec dots
    for (let i = 0; i < scData.values.length; i++) {
      if (scData.values[i] === null) continue;
      const v = scData.values[i];
      const isNelson = violationSet.has(i);
      const isOos = (usl != null && v > usl) || (lsl != null && v < lsl);
      if (!isNelson && !isOos) continue;
      const color = isNelson ? 'var(--color-error)' : 'var(--color-warning)';
      svg += `<circle cx="${sx(i).toFixed(1)}" cy="${sy(v).toFixed(1)}" r="2.5" fill="${color}"/>`;
    }

    svg += '</svg>';
    return svg;
  };

  const _renderSpc = (tileId) => {
    const body = grid?.getTileBody(tileId);
    if (!body) return;
    const instanceId = tileId.replace('spc:', '');
    const state = stateManager.getModuleState(instanceId);

    if (!state || !state.columnRef) {
      body.innerHTML = `<p class="dashboard-area__empty">${i18n.t('dashboard.spcEmpty')}</p>`;
      return;
    }

    const ct = getChartType(state.chartTypeId || 'i-mr');
    if (!ct) return;

    const rawValues = getColumnValues(stateManager, state.columnRef);
    const values = rawValues.filter(v => v != null && typeof v === 'number' && !isNaN(v));

    if (values.length < 2) {
      body.innerHTML = `<p class="dashboard-area__empty">${i18n.t('dashboard.spcNoData')}</p>`;
      return;
    }

    const n = state.subgroupSize || 1;
    const baselineEnd = state.baselineCount || values.length;
    const result = ct.compute(values, n, baselineEnd);

    const primaryId = ct.subcharts[0].id;
    const primaryData = result.subcharts[primaryId];
    const enabledRules = state.enabledRules || [...DEFAULT_ENABLED_RULES];
    const violations = evaluateNelsonRules(
      primaryData.values, primaryData.cl, primaryData.sigma, enabledRules
    );
    const capability = computeCapability(
      primaryData.values.filter(v => v !== null),
      primaryData.cl, primaryData.sigma,
      state.usl ?? null, state.lsl ?? null
    );

    const vCount = new Set(violations.map(v => v.index)).size;
    const totalPts = primaryData.values.filter(v => v !== null).length;
    const isStable = vCount === 0;
    const colName = _escapeHtml(getColumnName(stateManager, state.columnRef) || '?');
    const fmt = (v) => v != null ? v.toFixed(4) : '—';

    const usl = state.usl ?? null;
    const lsl = state.lsl ?? null;
    const hasSpec = usl != null || lsl != null;

    // Count out-of-spec points
    let oosCount = 0;
    if (hasSpec) {
      for (const v of primaryData.values) {
        if (v === null) continue;
        if ((usl != null && v > usl) || (lsl != null && v < lsl)) oosCount++;
      }
    }

    const chartTypeLabel = {
      'i-mr': 'I-MR', 'xbar-r': 'X̄-R', 'xbar-s': 'X̄-S',
    }[ct.id] || ct.id;

    // Measure container width for sparkline
    const sparkWidth = body.clientWidth - 16; // subtract padding
    const violationSet = new Set(violations.map(v => v.index));
    const sparkSvg = _buildSpcSparkline(primaryData, violationSet, usl, lsl, sparkWidth);

    // Build HTML
    let html = `
      <div class="dashboard-spc">
        <div class="dashboard-spc__header">
          <span class="dashboard-spc__type">${chartTypeLabel}</span>
          <span class="dashboard-spc__col">${colName}</span>
        </div>
        <div class="dashboard-spc__spark">${sparkSvg}</div>
        <div class="dashboard-spc__stats">
          <div class="dashboard-spc__stat">
            <span class="dashboard-spc__stat-label">CL</span>
            <span class="dashboard-spc__stat-value">${fmt(primaryData.cl)}</span>
          </div>
          <div class="dashboard-spc__stat">
            <span class="dashboard-spc__stat-label">UCL</span>
            <span class="dashboard-spc__stat-value">${fmt(primaryData.ucl)}</span>
          </div>
          <div class="dashboard-spc__stat">
            <span class="dashboard-spc__stat-label">LCL</span>
            <span class="dashboard-spc__stat-value">${fmt(primaryData.lcl)}</span>
          </div>
          <div class="dashboard-spc__stat">
            <span class="dashboard-spc__stat-label">σ̂</span>
            <span class="dashboard-spc__stat-value">${fmt(primaryData.sigma)}</span>
          </div>
        </div>
        <div class="dashboard-spc__metrics">
          <div class="dashboard-spc__metric ${isStable ? 'dashboard-spc__metric--ok' : 'dashboard-spc__metric--bad'}">
            <span class="dashboard-spc__metric-value">${vCount}</span>
            <span class="dashboard-spc__metric-label">${i18n.t('dashboard.spcViolations')}</span>
            <span class="dashboard-spc__metric-sub">${i18n.t('dashboard.spcOf', { total: totalPts })}</span>
          </div>`;

    if (hasSpec) {
      const oosCls = oosCount === 0 ? '--ok' : '--warn';
      html += `
          <div class="dashboard-spc__metric dashboard-spc__metric${oosCls}">
            <span class="dashboard-spc__metric-value">${oosCount}</span>
            <span class="dashboard-spc__metric-label">${i18n.t('dashboard.spcOutOfSpec')}</span>
            <span class="dashboard-spc__metric-sub">${i18n.t('dashboard.spcOf', { total: totalPts })}</span>
          </div>`;
    }

    if (capability) {
      const cpkCls = capability.cpk >= 1.33 ? '--ok' : capability.cpk >= 1.0 ? '--warn' : '--bad';
      html += `
          <div class="dashboard-spc__metric dashboard-spc__metric${cpkCls}">
            <span class="dashboard-spc__metric-value">${capability.cpk.toFixed(3)}</span>
            <span class="dashboard-spc__metric-label">Cpk</span>
            ${capability.cp ? `<span class="dashboard-spc__metric-sub">Cp = ${capability.cp.toFixed(3)}</span>` : ''}
          </div>`;
    }

    html += `
        </div>
      </div>`;

    body.innerHTML = html;
  };

  const _zegColor = (zeg) => {
    if (zeg >= 100) return 'var(--color-success)';
    if (zeg >= 75)  return 'var(--color-info)';
    if (zeg >= 25)  return 'var(--color-warning)';
    return 'var(--color-error)';
  };

  const _renderCharter = () => {
    const body = grid?.getTileBody('project-charter');
    if (!body) return;
    if (!_charterInstanceExists()) {
      body.innerHTML = `<p class="dashboard-area__empty">${i18n.t('dashboard.charterEmpty')}</p>`;
      return;
    }
    const state = _findCharterState();
    if (!state || !state.problemStatement) {
      body.innerHTML = `<p class="dashboard-area__empty">${i18n.t('dashboard.charterNoProblem')}</p>`;
      return;
    }
    body.innerHTML = `
      <div class="dashboard-charter__problem-label">${i18n.t('dashboard.charterProblem')}</div>
      <div class="dashboard-charter__problem">${_escapeHtml(state.problemStatement)}</div>
    `;
  };

  const _renderGoals = () => {
    const body = grid?.getTileBody('project-goals');
    if (!body) return;
    const state = _findCharterState();
    const goals = (state && state.goals) || [];
    if (goals.length === 0) {
      body.innerHTML = `<p class="dashboard-area__empty">${i18n.t('dashboard.charterNoGoals')}</p>`;
      return;
    }
    body.innerHTML = `
      <ol class="dashboard-charter__goals">${goals.map((g, i) => {
        const zeg = Math.max(0, Math.min(100, g.achievementLevel ?? 0));
        const color = _zegColor(zeg);
        const desc = _escapeHtml(g.description || i18n.t('dashboard.charterGoalUnnamed', { n: i + 1 }));
        return `
          <li class="dashboard-charter__goal">
            <div class="dashboard-charter__goal-head">
              <span class="dashboard-charter__goal-desc">${desc}</span>
              <span class="dashboard-charter__goal-zeg" style="color:${color}">${zeg}%</span>
            </div>
            <div class="dashboard-charter__goal-bar">
              <div class="dashboard-charter__goal-bar-fill" style="width:${zeg}%; background:${color}"></div>
            </div>
          </li>
        `;
      }).join('')}</ol>
    `;
  };

  const _resolvePhaseColor = (phase) => {
    const css = getComputedStyle(document.documentElement)
      .getPropertyValue(`--color-phase-${phase}`).trim();
    return css || '#888';
  };

  const _buildSeries = () => {
    const histories = {};
    let hasAny = false;
    const methodPhases = _methodPhaseKeys();
    for (const phase of methodPhases) {
      const h = stateManager.get(`phaseAchievementHistory.${phase}`) || [];
      histories[phase] = h;
      if (h.length) hasAny = true;
    }
    if (!hasAny) return { series: [], empty: true };

    const series = methodPhases.map(phase => {
      const h = histories[phase];
      const color = _resolvePhaseColor(phase);
      return {
        name: i18n.t(`phases.${phase}`),
        x: h.map(e => e.t),
        y: h.map(e => e.v),
        color,
        markerSize: h.length === 1 ? 5 : 3,
        connectLine: { show: true, foreground: true, width: 2, color, dash: 'solid' },
        visible: h.length > 0,
      };
    });
    return { series, empty: series.every(s => s.x.length === 0) };
  };

  const _renderChart = async () => {
    const body = grid?.getTileBody('zeg-timeline');
    if (!body) return;
    if (chart) { chartManager.destroy(chart); chart = null; }

    const { series, empty } = _buildSeries();
    if (empty) {
      body.innerHTML = `<p class="dashboard-area__empty">${i18n.t('dashboard.noHistory')}</p>`;
      return;
    }
    body.innerHTML = `<div class="dashboard-area__plot" data-ref="plot"></div>`;
    const plotEl = body.querySelector('[data-ref="plot"]');

    const dateFmt = (ts) => {
      const d = new Date(ts);
      return d.toLocaleDateString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
        day: '2-digit', month: '2-digit', year: '2-digit'
      });
    };

    chart = await chartManager.create(plotEl, 'scatter', {
      title: '',
      xLabel: i18n.t('dashboard.xLabel'),
      yLabel: i18n.t('dashboard.yLabel'),
      showLegend: true,
      series,
      yMin: 0,
      yMax: 100,
      xTickFormat: dateFmt,
    });
  };

  const ORG_NW = 220, ORG_NH = 64, ORG_HG = 44, ORG_VG = 28;

  const _orgSubtreeWidth = (nodes, id) => {
    const children = nodes.filter(n => n.pid === id);
    if (!children.length) return ORG_NW;
    let w = 0;
    children.forEach((c, i) => {
      w += _orgSubtreeWidth(nodes, c.id);
      if (i < children.length - 1) w += ORG_HG;
    });
    return Math.max(ORG_NW, w);
  };

  const _orgLayout = (nodes, id, x, y, out) => {
    out[id] = { x, y };
    const children = nodes.filter(n => n.pid === id);
    if (!children.length) return;
    const cy = y + ORG_NH + ORG_VG;
    const ws = children.map(c => _orgSubtreeWidth(nodes, c.id));
    let total = 0;
    ws.forEach((w, i) => { total += w; if (i < ws.length - 1) total += ORG_HG; });
    let cx = x + ORG_NW / 2 - total / 2;
    children.forEach((c, i) => {
      _orgLayout(nodes, c.id, cx + ws[i] / 2 - ORG_NW / 2, cy, out);
      cx += ws[i] + ORG_HG;
    });
  };

  const _renderOrgChart = () => {
    const body = grid?.getTileBody('org-chart');
    if (!body) return;
    const state = _findCharterState();
    const nodes = (state && Array.isArray(state.orgChart)) ? state.orgChart : [];
    if (!nodes.length) {
      body.innerHTML = `<p class="dashboard-area__empty">${i18n.t('dashboard.orgChartEmpty')}</p>`;
      return;
    }

    // Compute layout (multiple roots supported)
    const positions = {};
    const roots = nodes.filter(n => n.pid == null);
    let ox = 0;
    roots.forEach(r => {
      const w = _orgSubtreeWidth(nodes, r.id);
      _orgLayout(nodes, r.id, ox + w / 2 - ORG_NW / 2, 0, positions);
      ox += w + ORG_HG * 2;
    });

    // Compute bounds
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    Object.values(positions).forEach(p => {
      xMin = Math.min(xMin, p.x);
      yMin = Math.min(yMin, p.y);
      xMax = Math.max(xMax, p.x + ORG_NW);
      yMax = Math.max(yMax, p.y + ORG_NH);
    });
    const PAD = 8;
    const vbW = (xMax - xMin) + PAD * 2;
    const vbH = (yMax - yMin) + PAD * 2;
    const ox0 = PAD - xMin;
    const oy0 = PAD - yMin;

    // Build edges
    const edges = nodes
      .filter(n => n.pid != null && positions[n.id] && positions[n.pid])
      .map(n => {
        const p = positions[n.pid];
        const c = positions[n.id];
        const x1 = p.x + ORG_NW / 2 + ox0;
        const y1 = p.y + ORG_NH + oy0;
        const x2 = c.x + ORG_NW / 2 + ox0;
        const y2 = c.y + oy0;
        const mid = y1 + (y2 - y1) / 2;
        return `<path d="M${x1} ${y1}C${x1} ${mid},${x2} ${mid},${x2} ${y2}" />`;
      }).join('');

    // Build nodes
    const rects = nodes.map(n => {
      const p = positions[n.id];
      if (!p) return '';
      const x = p.x + ox0;
      const y = p.y + oy0;
      const bg = n.bg ? ` style="fill:${_escapeHtml(n.bg)}"` : '';
      const stroke = n.borderColor ? ` stroke="${_escapeHtml(n.borderColor)}"` : '';
      const sw = n.borderWidth ? ` stroke-width="${Number(n.borderWidth) || 1}"` : '';
      const sd = n.borderStyle === 'dashed' ? ` stroke-dasharray="6 4"`
               : n.borderStyle === 'dotted' ? ` stroke-dasharray="2 3"` : '';
      const title = _escapeHtml(n.title || '');
      const desc = n.desc ? _escapeHtml(n.desc) : '';
      return `
        <g class="dashboard-org__node" transform="translate(${x},${y})">
          <rect class="dashboard-org__node-rect" width="${ORG_NW}" height="${ORG_NH}" rx="6" ry="6"${bg}${stroke}${sw}${sd}/>
          <text class="dashboard-org__node-title" x="${ORG_NW / 2}" y="22" text-anchor="middle">${title}</text>
          ${desc ? `<text class="dashboard-org__node-desc" x="${ORG_NW / 2}" y="42" text-anchor="middle">${desc.length > 38 ? desc.slice(0, 36) + '…' : desc}</text>` : ''}
        </g>
      `;
    }).join('');

    body.innerHTML = `
      <div class="dashboard-area__org">
        <svg class="dashboard-org__svg" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="xMidYMid meet">
          <g class="dashboard-org__edges">${edges}</g>
          <g class="dashboard-org__nodes">${rects}</g>
        </svg>
      </div>
    `;
  };

  // ── Tile renderer dispatch ────────────────────────────────────
  const _renderTile = async (tileId) => {
    if (tileId === 'zeg-timeline') await _renderChart();
    else if (tileId === 'project-charter') _renderCharter();
    else if (tileId === 'project-goals') _renderGoals();
    else if (tileId === 'voc-ctx-tree') _renderVoc();
    else if (tileId === 'org-chart') _renderOrgChart();
    else if (tileId.startsWith('fmea:')) _renderFmea(tileId);
    else if (tileId.startsWith('ishikawa:')) _renderIshikawa(tileId);
    else if (tileId.startsWith('raci:')) _renderRaci(tileId);
    else if (tileId.startsWith('spc:')) _renderSpc(tileId);
  };

  // ── Layout persistence ────────────────────────────────────────
  const _loadLayout = () => {
    const saved = stateManager.get('dashboard.layout');
    if (Array.isArray(saved)) return saved.map(x => ({ ...x }));
    return DEFAULT_DASHBOARD_LAYOUT.map(x => ({ ...x }));
  };

  const _saveLayout = () => {
    if (!grid) return;
    stateManager.set('dashboard.layout', grid.getLayout());
  };

  // ── Tile definition for grid (merges registry with i18n) ──────
  const _buildTileDef = (def) => {
    const customTitles = stateManager.get('dashboard.titles') || {};
    return {
      ...def,
      title: customTitles[def.id] || def.title || i18n.t(def.i18nTitle),
      removeLabel: i18n.t('dashboard.removeTile'),
      moveTitle: i18n.t('dashboard.moveTile'),
      resizeTitle: i18n.t('dashboard.resizeTile'),
    };
  };

  const _buildTileDefs = () => [
    ...DASHBOARD_TILES.map(_buildTileDef),
    ..._buildFmeaTileDefs(),
    ..._buildIshikawaTileDefs(),
    ..._buildRaciTileDefs(),
    ..._buildSpcTileDefs(),
  ];

  // ── Add-menu popover ──────────────────────────────────────────
  const _closeAddMenu = () => {
    if (!addMenuEl) return;
    addMenuEl.remove();
    addMenuEl = null;
    document.removeEventListener('click', _onDocClickForMenu, true);
  };

  const _onDocClickForMenu = (e) => {
    if (!addMenuEl) return;
    if (!addMenuEl.contains(e.target) && !e.target.closest('[data-ref="add-btn"]')) {
      _closeAddMenu();
    }
  };

  const _openAddMenu = (toolbar) => {
    _closeAddMenu();
    const placed = new Set(grid.getPlacedTileIds());
    const allDefs = _buildTileDefs();
    const available = allDefs.filter(t => !placed.has(t.id));

    addMenuEl = document.createElement('div');
    addMenuEl.className = 'dashboard-area__add-menu';
    if (available.length === 0) {
      addMenuEl.innerHTML = `<div class="dashboard-area__add-menu-empty">${_escapeHtml(i18n.t('dashboard.addTileEmpty'))}</div>`;
    } else {
      addMenuEl.innerHTML = available.map(t =>
        `<button type="button" class="dashboard-area__add-menu-item" data-tile-id="${t.id}">${_escapeHtml(t.title || i18n.t(t.i18nTitle))}</button>`
      ).join('');
      addMenuEl.querySelectorAll('[data-tile-id]').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.dataset.tileId;
          const def = available.find(t => t.id === id);
          if (def && grid.addTile(def)) {
            _renderTile(id);
          }
          _closeAddMenu();
        });
      });
    }
    toolbar.appendChild(addMenuEl);
    // Defer to avoid the same click closing the menu
    setTimeout(() => document.addEventListener('click', _onDocClickForMenu, true), 0);
  };

  // ── Full render: rebuild shell + grid ─────────────────────────
  const render = async () => {
    if (chart) { chartManager.destroy(chart); chart = null; }
    if (grid) { grid.destroy(); grid = null; }
    _closeAddMenu();
    _buildShell();

    grid = new DashboardGrid(gridContainer, { cols: 12, rowHeight: 40, gap: 12 });
    grid.onLayoutChange = () => {
      _saveLayout();
      // Re-render SPC sparklines so they adapt to new tile width
      for (const item of grid.getLayout()) {
        if (item.tileId.startsWith('spc:')) _renderSpc(item.tileId);
      }
    };
    grid.onTileRemoved = (tileId) => {
      if (tileId === 'zeg-timeline' && chart) {
        chartManager.destroy(chart); chart = null;
      }
    };
    grid.onTitleChanged = (tileId, newTitle) => {
      const titles = stateManager.get('dashboard.titles') || {};
      titles[tileId] = newTitle;
      stateManager.set('dashboard.titles', titles);
    };

    const tileDefs = _buildTileDefs();
    const layout = _loadLayout().filter(l => tileDefs.some(d => d.id === l.tileId));
    grid.setTiles(tileDefs, layout);

    // Render content for each placed tile
    for (const item of grid.getLayout()) {
      await _renderTile(item.tileId);
    }

    // Wire toolbar
    const addBtn = area.querySelector('[data-ref="add-btn"]');
    const toolbar = area.querySelector('.dashboard-area__toolbar');
    addBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (addMenuEl) _closeAddMenu();
      else _openAddMenu(toolbar);
    });

    const slug = (stateManager.get('projectMeta.name') || 'dashboard').replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '_');
    area.querySelector('[data-ref="export-png-btn"]')?.addEventListener('click', () => grid?.exportAllAsPng(`${slug}.png`));
    area.querySelector('[data-ref="export-svg-btn"]')?.addEventListener('click', () => grid?.exportAllAsSvg(`${slug}.svg`));
  };

  const close = () => {
    if (!open) return;
    open = false;
    area.style.display = 'none';
    document.body.classList.remove('dashboard-area-open');
    btn.classList.remove('btn--active');
    _closeAddMenu();
  };

  const toggle = async () => {
    open = !open;
    area.style.display = open ? '' : 'none';
    document.body.classList.toggle('dashboard-area-open', open);
    btn.classList.toggle('btn--active', open);
    if (open) { eventBus.emit('overlay:opened', 'dashboard'); await render(); }
    else _closeAddMenu();
  };

  btn.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) toggle();
  });
  eventBus.on('overlay:opened', (id) => { if (id !== 'dashboard') close(); });

  // Live-update while dashboard is open
  eventBus.on('phase:achievement-changed', () => { if (open) _renderChart(); });
  eventBus.on('state:saved', () => {
    if (!open) return;
    _renderCharter();
    _renderGoals();
    _renderVoc();
    _renderOrgChart();
    for (const item of (grid?.getLayout() || [])) {
      if (item.tileId.startsWith('fmea:')) _renderFmea(item.tileId);
      else if (item.tileId.startsWith('ishikawa:')) _renderIshikawa(item.tileId);
      else if (item.tileId.startsWith('raci:')) _renderRaci(item.tileId);
    }
  });
  eventBus.on('project:renamed', ({ name }) => {
    if (!open) return;
    const el = area.querySelector('[data-ref="project-name"]');
    if (el) el.textContent = name;
  });
  eventBus.on('language:changed', () => { if (open) render(); });
  eventBus.on('project:loaded', () => { if (open) render(); });
  eventBus.on('project:imported', () => { if (open) render(); });
}

/**
 * Wire the global "Training" header button.
 * Opens a full-size training area with tabs for users transitioning from
 * other software. First tab targets Minitab users.
 *
 * @param {import('./core/event-bus.js').EventBus} eventBus
 * @param {import('./core/i18n.js').I18n} i18n
 */
function _initTraining(eventBus, i18n) {
  const btn  = document.getElementById('training-btn');
  const area = document.getElementById('training-area');
  if (!btn || !area) return;

  const TABS = [
    { id: 'dmaic',   labelKey: 'training.tabDmaic',   render: () => _renderCycleTab('dmaic')  },
    { id: 'dmadv',   labelKey: 'training.tabDmadv',   render: () => _renderCycleTab('dmadv')  },
    { id: 'eightd', labelKey: 'training.tabEightd', render: () => _renderCycleTab('eightd') },
    { id: 'triz',    labelKey: 'training.tabTriz',    render: () => _renderTrizTab() },
    { id: 'minitab', labelKey: 'training.tabMinitab', render: () => _renderToolTab('minitab') },
    { id: 'jmp',     labelKey: 'training.tabJmp',     render: () => _renderToolTab('jmp') },
  ];

  let open = false;
  let activeTab = TABS[0].id;

  const _escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  /**
   * Render a cycle methodology primer from i18n namespace `training.<cycle>`.
   * Phase ids come from the cycle definition in `js/core/cycles/cycles.js` so
   * adding a new cycle requires only the matching i18n keys.
   */
  function _renderCycleTab(cycleId) {
    const t = (k) => _escapeHtml(i18n.t(`training.${cycleId}.${k}`));
    const phaseIds = getPhaseIds(cycleId);
    const phaseSections = phaseIds.map(id =>
      `<h4>${t(`${id}Title`)}</h4><p>${t(`${id}Body`)}</p>`
    ).join('');
    return `
      <p>${t('intro')}</p>

      <h3>${t('whyTitle')}</h3>
      <p>${t('whyBody')}</p>

      <h3>${t('phasesTitle')}</h3>
      ${phaseSections}

      <h3>${t('whenTitle')}</h3>
      <p>${t('whenBody')}</p>

      <h3>${t('pitfallsTitle')}</h3>
      <ul>
        <li>${t('pitfall1')}</li>
        <li>${t('pitfall2')}</li>
        <li>${t('pitfall3')}</li>
        <li>${t('pitfall4')}</li>
      </ul>

      <h3>${t('appTitle')}</h3>
      <p>${t('appBody')}</p>
    `;
  }

  /**
   * Render the TRIZ methodology primer from i18n namespace `training.triz`.
   * TRIZ is a methodology, not a phase-based cycle, so the structure differs
   * from `_renderCycleTab`: the "phases" section is replaced by core concepts
   * and a tools section.
   */
  function _renderTrizTab() {
    const t = (k) => _escapeHtml(i18n.t(`training.triz.${k}`));
    return `
      <p>${t('intro')}</p>

      <h3>${t('whyTitle')}</h3>
      <p>${t('whyBody')}</p>

      <h3>${t('conceptsTitle')}</h3>
      <h4>${t('contradictionTitle')}</h4>
      <p>${t('contradictionBody')}</p>
      <h4>${t('idealityTitle')}</h4>
      <p>${t('idealityBody')}</p>
      <h4>${t('evolutionTitle')}</h4>
      <p>${t('evolutionBody')}</p>

      <h3>${t('toolsTitle')}</h3>
      <h4>${t('tool40Title')}</h4>
      <p>${t('tool40Body')}</p>
      <h4>${t('toolMatrixTitle')}</h4>
      <p>${t('toolMatrixBody')}</p>
      <h4>${t('tool9WindowsTitle')}</h4>
      <p>${t('tool9WindowsBody')}</p>
      <h4>${t('toolArizTitle')}</h4>
      <p>${t('toolArizBody')}</p>

      <h3>${t('whenTitle')}</h3>
      <p>${t('whenBody')}</p>

      <h3>${t('pitfallsTitle')}</h3>
      <ul>
        <li>${t('pitfall1')}</li>
        <li>${t('pitfall2')}</li>
        <li>${t('pitfall3')}</li>
        <li>${t('pitfall4')}</li>
      </ul>

      <h3>${t('appTitle')}</h3>
      <p>${t('appBody')}</p>
    `;
  }

  /** Render a tool-comparison tab body from i18n namespace `training.<ns>`. */
  function _renderToolTab(ns) {
    const t = (k) => _escapeHtml(i18n.t(`training.${ns}.${k}`));
    const rows = [];
    for (let i = 1; i <= 8; i++) {
      rows.push(`<tr><td>${t(`row${i}a`)}</td><td>${t(`row${i}b`)}</td><td>${t(`row${i}c`)}</td></tr>`);
    }

    return `
      <p>${t('intro')}</p>

      <h3>${t('conceptsTitle')}</h3>
      <p>${t('conceptsIntro')}</p>

      <h3>${t('mappingTitle')}</h3>
      <p>${t('mappingIntro')}</p>
      <table class="training-area__table">
        <thead>
          <tr>
            <th>${t('col1')}</th>
            <th>${t('col2')}</th>
            <th>${t('col3')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join('')}
        </tbody>
      </table>

      <h3>${t('workflowTitle')}</h3>
      <p>${t('workflowIntro')}</p>
      <ol>
        <li>${t('workflow1')}</li>
        <li>${t('workflow2')}</li>
        <li>${t('workflow3')}</li>
        <li>${t('workflow4')}</li>
        <li>${t('workflow5')}</li>
      </ol>

      <h3>${t('dataTitle')}</h3>
      <p>${t('dataBody')}</p>

      <h3>${t('tipsTitle')}</h3>
      <ul>
        <li>${t('tip1')}</li>
        <li>${t('tip2')}</li>
        <li>${t('tip3')}</li>
        <li>${t('tip4')}</li>
      </ul>
    `;
  }

  const render = () => {
    const tabsHtml = TABS.map(tab => `
      <button type="button"
              class="training-area__tab ${tab.id === activeTab ? 'training-area__tab--active' : ''}"
              data-tab-id="${tab.id}">${_escapeHtml(i18n.t(tab.labelKey))}</button>
    `).join('');

    const active = TABS.find(t => t.id === activeTab) || TABS[0];
    const contentHtml = active.render();

    area.innerHTML = `
      <div class="training-area__inner">
        <header class="training-area__header">
          <h2 class="training-area__title">${_escapeHtml(i18n.t('training.title'))}</h2>
          <p class="training-area__subtitle">${_escapeHtml(i18n.t('training.subtitle'))}</p>
          <div class="training-area__tabs" role="tablist">${tabsHtml}</div>
        </header>
        <div class="training-area__content">${contentHtml}</div>
      </div>
    `;

    area.querySelectorAll('[data-tab-id]').forEach(el => {
      el.addEventListener('click', () => {
        activeTab = el.dataset.tabId;
        render();
      });
    });
  };

  const close = () => {
    if (!open) return;
    open = false;
    area.style.display = 'none';
    document.body.classList.remove('training-area-open');
    btn.classList.remove('btn--active');
  };

  const toggle = () => {
    open = !open;
    area.style.display = open ? '' : 'none';
    document.body.classList.toggle('training-area-open', open);
    btn.classList.toggle('btn--active', open);
    if (open) { eventBus.emit('overlay:opened', 'training'); render(); }
  };

  btn.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) toggle();
  });
  eventBus.on('overlay:opened', (id) => { if (id !== 'training') close(); });

  eventBus.on('language:changed', () => { if (open) render(); });
}

function _initSettings(themeManager, i18n, stateManager, tipEngine) {
  const settingsBtn   = document.getElementById('settings-btn');
  const overlay       = document.getElementById('settings-overlay');
  const panel         = document.getElementById('settings-panel');
  const closeBtn      = document.getElementById('settings-close');
  if (!settingsBtn || !panel) return;

  // ── Open / Close ────────────────────────────────────────────
  const open  = () => { overlay.style.display = ''; panel.style.display = ''; };
  const close = () => { overlay.style.display = 'none'; panel.style.display = 'none'; };

  settingsBtn.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.style.display !== 'none') close();
  });

  // ── Tab switching ───────────────────────────────────────────
  const tabs     = panel.querySelectorAll('.settings-tab');
  const contents = panel.querySelectorAll('.settings-tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.toggle('settings-tab--active', t === tab));
      contents.forEach(c => c.classList.toggle('settings-tab-content--active', c.dataset.tabContent === target));
    });
  });

  // ── Language toggle (inside settings panel) ─────────────────
  const langBtns = panel.querySelectorAll('.lang-toggle__option');
  const refreshLang = () => {
    langBtns.forEach(b => b.classList.toggle('lang-toggle__option--active', b.dataset.lang === i18n.getLanguage()));
  };
  refreshLang();
  langBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      await i18n.setLanguage(btn.dataset.lang);
      refreshLang();
    });
  });

  // ── Theme toggle (light / dark buttons) ─────────────────────
  const themeBtns = panel.querySelectorAll('.settings-theme-btn');
  const refreshTheme = () => {
    const current = themeManager.getTheme();
    themeBtns.forEach(b => b.classList.toggle('settings-theme-btn--active', b.dataset.theme === current));
  };
  refreshTheme();
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      themeManager.setTheme(btn.dataset.theme);
      refreshTheme();
    });
  });

  // ── Tips toggle + reset ────────────────────────────────────
  const tipsCb = document.getElementById('settings-tips-enabled');
  if (tipsCb) {
    tipsCb.checked = stateManager.get('settings.tipsEnabled') !== false;
    tipsCb.addEventListener('change', () => {
      stateManager.set('settings.tipsEnabled', tipsCb.checked);
    });
  }
  const tipsResetBtn = document.getElementById('settings-tips-reset');
  if (tipsResetBtn && tipEngine) {
    tipsResetBtn.addEventListener('click', () => tipEngine.resetDismissed());
  }

  // ── Export reminder ────────────────────────────────────────
  const reminderCb = document.getElementById('settings-export-reminder-enabled');
  if (reminderCb) {
    reminderCb.checked = stateManager.get('settings.exportReminderEnabled') !== false;
    reminderCb.addEventListener('change', () => {
      stateManager.set('settings.exportReminderEnabled', reminderCb.checked);
    });
  }
  const reminderMin = document.getElementById('settings-export-reminder-minutes');
  if (reminderMin) {
    reminderMin.value = stateManager.get('settings.exportReminderMinutes') ?? 60;
    reminderMin.addEventListener('change', () => {
      const v = Math.min(1440, Math.max(1, parseInt(reminderMin.value, 10) || 60));
      reminderMin.value = v;
      stateManager.set('settings.exportReminderMinutes', v);
    });
  }

  // ── Show Algorithm Lab link icons ──────────────────────────
  const algoLinkCb = document.getElementById('settings-show-algo-links');
  if (algoLinkCb) {
    algoLinkCb.checked = stateManager.get('settings.showAlgoLabLinks') !== false;
    algoLinkCb.addEventListener('change', () => {
      stateManager.set('settings.showAlgoLabLinks', algoLinkCb.checked);
      document.body.classList.toggle('hide-algo-lab-links', !algoLinkCb.checked);
    });
    // Apply on load
    if (!algoLinkCb.checked) document.body.classList.add('hide-algo-lab-links');
  }

  // ── Chart font-size sliders ───────────────────────────────
  const fontSliders = panel.querySelectorAll('.settings-font-slider');
  fontSliders.forEach(slider => {
    const key = slider.dataset.font;                       // e.g. 'chartTitleSize'
    const valueEl = panel.querySelector(`[data-font-value="${key}"]`);
    const previewEl = panel.querySelector(`[data-preview="${key}"]`);

    // Restore from state
    const stored = stateManager.get(`settings.${key}`);
    if (stored != null) {
      slider.value = stored;
      if (valueEl) valueEl.textContent = stored;
      if (previewEl) previewEl.style.fontSize = stored + 'px';
    } else if (previewEl) {
      previewEl.style.fontSize = slider.value + 'px';
    }

    slider.addEventListener('input', () => {
      const v = slider.value;
      if (valueEl) valueEl.textContent = v;
      if (previewEl) previewEl.style.fontSize = v + 'px';
      stateManager.set(`settings.${key}`, Number(v));
    });
  });

  // ── Chart series color swatches ─────────────────────────────
  const DEFAULT_COLORS = [
    '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
    '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
  ];
  const colorGrid = document.getElementById('settings-color-grid');
  const swatches = [];
  let activeColorPicker = null;

  /** Apply a color array to CSS custom properties and swatch backgrounds */
  const applyColors = (colors) => {
    const root = document.documentElement;
    swatches.forEach((swatch, idx) => {
      const c = (colors && colors[idx]) || DEFAULT_COLORS[idx];
      swatch.style.background = c;
      swatch.dataset.color = c;
      root.style.setProperty(`--color-chart-${idx + 1}`, c);
    });
  };

  // Build 10 swatch items
  for (let i = 0; i < 10; i++) {
    const item = document.createElement('div');
    item.className = 'settings-color-item';
    const idx = document.createElement('span');
    idx.className = 'settings-color-index';
    idx.textContent = i + 1;
    const swatch = document.createElement('div');
    swatch.className = 'settings-color-swatch';
    swatch.style.background = DEFAULT_COLORS[i];
    swatch.dataset.color = DEFAULT_COLORS[i];
    swatch.addEventListener('click', (e) => {
      if (activeColorPicker) activeColorPicker.close();
      activeColorPicker = openColorPicker(e, hexToRGBA(swatch.dataset.color), (rgba) => {
        const hex = rgbaToHex6(rgba);
        swatch.style.background = hex;
        swatch.dataset.color = hex;
        document.documentElement.style.setProperty(`--color-chart-${i + 1}`, hex);
        const current = stateManager.get('settings.chartColors') || [...DEFAULT_COLORS];
        current[i] = hex;
        stateManager.set('settings.chartColors', current);
      });
    });
    item.appendChild(idx);
    item.appendChild(swatch);
    colorGrid.appendChild(item);
    swatches.push(swatch);
  }

  // Restore saved colors on load
  const savedColors = stateManager.get('settings.chartColors');
  if (savedColors) applyColors(savedColors);

  // Reset button
  const resetBtn = document.getElementById('settings-color-reset');
  resetBtn?.addEventListener('click', () => {
    applyColors(DEFAULT_COLORS);
    stateManager.set('settings.chartColors', null);
  });

  // ── Chart background color ──
  const bgSwatch = document.getElementById('settings-bg-color-swatch');
  const bgResetBtn = document.getElementById('settings-bg-color-reset');

  const applyBgColor = (color) => {
    if (color) {
      bgSwatch.style.background = color;
      bgSwatch.classList.remove('settings-bg-color-swatch--none');
    } else {
      bgSwatch.style.background = '';
      bgSwatch.classList.add('settings-bg-color-swatch--none');
    }
  };

  // Restore saved bg color
  const savedBg = stateManager.get('settings.chartBgColor');
  applyBgColor(savedBg || null);

  bgSwatch?.addEventListener('click', (e) => {
    if (activeColorPicker) activeColorPicker.close();
    const current = stateManager.get('settings.chartBgColor') || 'rgba(255,255,255,1)';
    activeColorPicker = openColorPicker(e, current, (rgba) => {
      applyBgColor(rgba);
      stateManager.set('settings.chartBgColor', rgba);
    });
  });

  bgResetBtn?.addEventListener('click', () => {
    applyBgColor(null);
    stateManager.set('settings.chartBgColor', null);
  });

  // ── Show legend default ──
  const legendCb = document.getElementById('settings-show-legend');
  if (legendCb) {
    legendCb.checked = stateManager.get('settings.chartShowLegend') !== false;
    legendCb.addEventListener('change', () => {
      stateManager.set('settings.chartShowLegend', legendCb.checked);
    });
  }

  // ── Statistics defaults ─────────────────────────────────────
  const confInput  = document.getElementById('settings-confidence');
  const alphaInput = document.getElementById('settings-alpha');
  const powerInput = document.getElementById('settings-power');
  const betaInput  = document.getElementById('settings-beta');

  const STAT_DEFAULTS = { confidenceLevel: 95, power: 80 };

  const loadStatValues = () => {
    const conf  = stateManager.get('settings.confidenceLevel') ?? STAT_DEFAULTS.confidenceLevel;
    const power = stateManager.get('settings.power') ?? STAT_DEFAULTS.power;
    confInput.value  = conf;
    alphaInput.value = +(100 - conf).toFixed(2);
    powerInput.value = power;
    betaInput.value  = +(100 - power).toFixed(2);
  };

  if (confInput && alphaInput && powerInput && betaInput) {
    loadStatValues();

    confInput.addEventListener('input', () => {
      const v = Math.min(99.99, Math.max(50, parseFloat(confInput.value) || 95));
      alphaInput.value = +(100 - v).toFixed(2);
      stateManager.set('settings.confidenceLevel', v);
    });
    alphaInput.addEventListener('input', () => {
      const v = Math.min(50, Math.max(0.01, parseFloat(alphaInput.value) || 5));
      confInput.value = +(100 - v).toFixed(2);
      stateManager.set('settings.confidenceLevel', +(100 - v).toFixed(2));
    });
    powerInput.addEventListener('input', () => {
      const v = Math.min(99.99, Math.max(50, parseFloat(powerInput.value) || 80));
      betaInput.value = +(100 - v).toFixed(2);
      stateManager.set('settings.power', v);
    });
    betaInput.addEventListener('input', () => {
      const v = Math.min(50, Math.max(0.01, parseFloat(betaInput.value) || 20));
      powerInput.value = +(100 - v).toFixed(2);
      stateManager.set('settings.power', +(100 - v).toFixed(2));
    });

    document.getElementById('settings-stat-reset')?.addEventListener('click', () => {
      stateManager.set('settings.confidenceLevel', STAT_DEFAULTS.confidenceLevel);
      stateManager.set('settings.power', STAT_DEFAULTS.power);
      loadStatValues();
    });
  }
}

function _downloadJSON(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function _initFullscreen() {
  const btn = document.getElementById('fullscreen-btn');
  const iconEnter = document.getElementById('fullscreen-icon-enter');
  const iconExit = document.getElementById('fullscreen-icon-exit');
  if (!btn) return;

  function updateIcon() {
    const isFs = !!document.fullscreenElement;
    iconEnter.style.display = isFs ? 'none' : '';
    iconExit.style.display = isFs ? '' : 'none';
  }

  btn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  document.addEventListener('fullscreenchange', updateIcon);
}

function _initExportImport(stateManager, eventBus, i18n, notify, modal) {
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const importInput = document.getElementById('import-file-input');

  exportBtn?.addEventListener('click', () => {
    const projects = stateManager.getProjects();
    const hasMultiple = projects.length > 1;

    if (!hasMultiple) {
      // Single project — export directly
      const json = stateManager.exportJSON();
      const name = (stateManager.get('projectMeta.name') ?? 'projekt').replace(/[^a-z0-9_-]/gi, '_');
      _downloadJSON(json, `${name}_${new Date().toISOString().split('T')[0]}.json`);
      eventBus.emit('project:exported');
      notify(i18n.t('app.export') + ' ✓', 'success');
      return;
    }

    // Multiple projects — show choice dialog
    const content = document.createElement('div');
    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;padding:4px 0">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="radio" name="export-scope" value="current" checked>
          <span>${i18n.t('app.exportCurrent')}</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="radio" name="export-scope" value="all">
          <span>${i18n.t('app.exportAll', { count: projects.length })}</span>
        </label>
      </div>
    `;

    modal.form(i18n.t('app.export'), content, {
      confirmLabel: i18n.t('app.export'),
      onConfirm: async (body) => {
        const scope = body.querySelector('input[name="export-scope"]:checked')?.value || 'current';
        const date = new Date().toISOString().split('T')[0];

        if (scope === 'all') {
          const json = await stateManager.exportAllJSON();
          _downloadJSON(json, `dmike_alle_projekte_${date}.json`);
        } else {
          const json = stateManager.exportJSON();
          const name = (stateManager.get('projectMeta.name') ?? 'projekt').replace(/[^a-z0-9_-]/gi, '_');
          _downloadJSON(json, `${name}_${date}.json`);
        }
        eventBus.emit('project:exported');
        notify(i18n.t('app.export') + ' ✓', 'success');
      },
    });
  });

  importBtn?.addEventListener('click', () => importInput?.click());

  importInput?.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const sourceMM = stripPatch(data.appVersion || '0.1.0');
      const targetMM = stripPatch(VERSION);
      const migrated = sourceMM !== targetMM;
      if (data.projects && Array.isArray(data.projects)) {
        // Multi-project import
        await stateManager.importAllJSON(text);
        notify(i18n.t('app.importAllSuccess', { count: data.projects.length }), 'success');
      } else {
        // Single-project import
        await stateManager.importJSON(text);
        notify(i18n.t('app.import') + ' ✓', 'success');
      }
      if (migrated) {
        // Persist across the upcoming reload — toast is wiped otherwise.
        sessionStorage.setItem(
          'dmike_import_migrated',
          JSON.stringify({ from: sourceMM, to: targetMM })
        );
      }
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      notify(i18n.t('common.error') + ': ' + err.message, 'error');
    }
    importInput.value = '';
  });

  // Ctrl+S — export all projects as JSON
  document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      const date = new Date().toISOString().split('T')[0];
      const json = await stateManager.exportAllJSON();
      _downloadJSON(json, `dmike_alle_projekte_${date}.json`);
      eventBus.emit('project:exported');
      notify(i18n.t('app.export') + ' ✓', 'success');
    }
  });
}

function _initFooter(stateManager, eventBus, i18n) {
  const footerName = document.getElementById('footer-project-name');
  const footerSaved = document.getElementById('footer-last-saved');
  const footerStorage = document.getElementById('footer-storage');
  const footerVersion = document.getElementById('footer-version');

  if (footerVersion) {
    footerVersion.textContent = `v${VERSION}`;
    fetch('./release.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(rel => {
        if (!rel?.version) return;
        footerVersion.textContent = `v${rel.version}`;
        if (rel.date) footerVersion.title = rel.title ? `${rel.title} (${rel.date})` : rel.date;
      })
      .catch(() => {});
  }

  const refresh = () => {
    if (footerName) footerName.textContent = stateManager.get('projectMeta.name') ?? '';
    if (footerSaved) {
      const mod = stateManager.get('projectMeta.modified');
      footerSaved.textContent = mod ? new Date(mod).toLocaleTimeString() : '';
    }
    if (footerStorage) {
      const { used, total } = stateManager.getStorageUsage();
      const kb = (used / 1024).toFixed(1);
      const mb = (total / 1024 / 1024).toFixed(0);
      footerStorage.textContent = `${kb} KB / ${mb} MB`;
    }
  };

  refresh();
  eventBus.on('state:saved', refresh);
  footerName?.addEventListener('click', () => {
    document.getElementById('project-name-display')?.click();
  });
}

/**
 * Global delegated handler — makes every `.dmike-split__output-section`
 * and `.dmike-split__output-section-header` collapsible. Clicking a section
 * label toggles the collapsed state and hides all following siblings up to
 * the next section label.
 */
function _initCollapsibleSections() {
  document.addEventListener('click', (e) => {
    // Don't toggle if user clicked on an interactive control inside a header
    if (e.target.closest('button, input, select, textarea, a')) return;

    // Find the section label that was clicked. Prefer the wrapping header.
    const header = e.target.closest('.dmike-split__output-section-header');
    const label  = e.target.closest('.dmike-split__output-section');
    const toggle = header || label;
    if (!toggle) return;

    // If we're inside a header, the standalone label child is not the toggle.
    if (header && label && label !== header && header.contains(label)) {
      // use header as toggle — already set
    }

    const modifierClass = header
      ? 'dmike-split__output-section-header--collapsed'
      : 'dmike-split__output-section--collapsed';
    const collapsed = toggle.classList.toggle(modifierClass);

    // Walk forward siblings, hide/show until we hit the next section label.
    let sib = toggle.nextElementSibling;
    while (sib) {
      if (sib.classList.contains('dmike-split__output-section') ||
          sib.classList.contains('dmike-split__output-section-header')) {
        break;
      }
      sib.classList.toggle('dmike-split__output-section-hidden', collapsed);
      sib = sib.nextElementSibling;
    }
  });
}

function _updateTitle(stateManager) {
  const name = stateManager.get('projectMeta.name') ?? 'DMAIC.io';
  document.title = `${name} — DMAIC.io`;
}

// ─── Start ─────────────────────────────────────────────────────

init().catch(err => {
  console.error('D.Mike failed to initialize:', err);
});
