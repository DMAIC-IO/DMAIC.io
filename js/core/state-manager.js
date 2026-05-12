/**
 * D.Mike — State Manager (state-manager.js)
 * Centralized state management and persistence.
 *
 * Small top-level state (settings, phases, project metadata, dashboard layout)
 * lives in localStorage for synchronous access. Larger module states
 * (worksheet data, analysis results, …) live in IndexedDB and are
 * fronted by an in-memory write-behind cache so the public API stays
 * synchronous for every module caller.
 *
 * Supports multiple projects. Each project gets its own localStorage
 * namespace (dmike_v{MAJOR.MINOR}_p_{id}_) and shares a single IndexedDB
 * store keyed by (projectId, instanceId). Settings are shared across
 * projects within the same version. Different versions are fully isolated.
 *
 * State structure (cycle-scoped — keys depend on the project's cycle):
 * {
 *   version: '0.5.0',
 *   settings: { language, theme, … },
 *   phases: { data, …<methodology phases>, extras },        // arrays of module instances
 *   phaseAchievement: { …<methodology phases> },             // 0–100, no data/extras
 *   phaseAchievementHistory: { …<methodology phases>: [{t,v}, …] }, // ZEG timeline
 *   projectMeta: { name, cycle, created, modified }          // cycle: 'dmaic' | 'dmadv' | …
 * }
 */

import { EventBus } from './event-bus.js';
import { VERSION } from './version.js';
import { parseVersion, stripPatch } from './version-utils.js';
import { migrateToLatest } from './migrations.js';
import {
  idbBatch,
  idbDeleteAllForProject,
  idbGetAllForProject,
} from './idb-store.js';
import {
  DEFAULT_CYCLE,
  getCycle,
  getPhaseIds,
  getAllPhaseIds,
} from './cycles/cycles.js';

// Storage prefix is namespaced per MAJOR.MINOR so that multiple D.Mike
// versions deployed under the same domain (e.g. /v0.2/, /v0.3/) keep their
// data fully isolated. PATCH releases share storage with their MAJOR.MINOR.
const GLOBAL_PREFIX = `dmike_v${stripPatch(VERSION)}_`;
const AUTOSAVE_DELAY = 2000;      // debounce for localStorage-backed top-level state
const IDB_FLUSH_DELAY = 500;      // debounce for IDB write-behind of module states

/**
 * Generate a short random ID for projects.
 * @returns {string}
 */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Reject imports from a future MAJOR version. We can run forward
 * migrations (older → current) but cannot synthesise backward ones.
 * @param {string | undefined} fileVersion
 */
function _assertNotFutureMajor(fileVersion) {
  if (!fileVersion) return;
  try {
    const file = parseVersion(fileVersion);
    const app = parseVersion(VERSION);
    if (file.major > app.major) {
      throw new Error(
        `Diese Datei wurde mit v${fileVersion} erstellt und kann nicht in v${VERSION} geöffnet werden. Bitte aktualisieren Sie D.Mike.`
      );
    }
  } catch (err) {
    if (err.message.startsWith('Diese Datei')) throw err;
    // Malformed version string — let the import attempt to proceed; the
    // migration chain or later parsers will surface the real error.
  }
}

export class StateManager {
  /**
   * @param {EventBus} eventBus
   */
  constructor(eventBus) {
    this._eventBus = eventBus;
    this._state = this._defaultState();
    this._saveTimer = null;
    this._projectId = null;
    /** @type {import('./module-registry.js').ModuleRegistry | null} */
    this._moduleRegistry = null;

    // Module-state cache (synchronous façade in front of IndexedDB).
    /** @type {Map<string, object>} */
    this._moduleCache = new Map();
    /** @type {Map<string, object>} */
    this._pendingPuts = new Map();
    /** @type {Set<string>} */
    this._pendingDeletes = new Set();
    this._flushTimer = null;
    /** @type {Promise<void> | null} */
    this._flushInFlight = null;

    this._installUnloadFlush();
  }

  // ─── Default State ──────────────────────────────────────────

  /**
   * Build a fresh project state for the given cycle. Phases include the
   * virtual frame tiles (`data` leading, `extras` trailing); phase-achievement
   * tracks methodology phases only.
   *
   * Unknown `cycleId` falls back to the default cycle (DMAIC) — see
   * {@link getCycle}.
   *
   * @param {string} [cycleId=DEFAULT_CYCLE]
   * @returns {object} default state object
   */
  _defaultState(cycleId = DEFAULT_CYCLE) {
    const cycle = getCycle(cycleId);
    const tileIds = getAllPhaseIds(cycle.id);          // ['data', …, 'extras']
    const methodologyIds = getPhaseIds(cycle.id);      // without data/extras
    const now = new Date().toISOString();
    return {
      version: VERSION,
      settings: {
        language: 'de',
        theme: 'light',
        chartTitleSize: 15,
        chartLabelSize: 12,
        chartTickSize: 11,
        chartColors: null,
        chartBgColor: null,
        chartShowLegend: true,
        showAlgoLabLinks: true,
        confidenceLevel: 95,
        power: 80,
      },
      phases: Object.fromEntries(tileIds.map(id => [id, []])),
      phaseAchievement: Object.fromEntries(methodologyIds.map(id => [id, 0])),
      phaseAchievementHistory: {},
      models: {},
      optimizations: {},
      projectMeta: {
        name: 'Neues Projekt',
        cycle: cycle.id,
        created: now,
        modified: now,
      },
      dashboard: {
        layout: null, // null = use default layout from dashboard-tiles.js
      },
    };
  }

  // ─── Project prefix (per-project storage namespace) ────────

  /** @returns {string} localStorage prefix for the active project */
  _prefix() {
    if (!this._projectId) this._ensureActiveProject();
    return `${GLOBAL_PREFIX}p_${this._projectId}_`;
  }

  // ─── Public API ─────────────────────────────────────────────

  /**
   * Read state at dot-path.
   * @param {string} path - e.g. 'settings.language'
   * @returns {any}
   */
  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this._state);
  }

  /**
   * Write state at dot-path, schedules auto-save.
   * @param {string} path - e.g. 'settings.language'
   * @param {any} value
   */
  set(path, value) {
    // Settings are global — always writable. Project data is blocked if completed.
    if (!path.startsWith('settings.') && this.isCompleted()) return;
    const keys = path.split('.');
    let obj = this._state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] === undefined) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this._state.projectMeta.modified = new Date().toISOString();
    this._scheduleSave();
    if (!path.startsWith('settings.')) this._eventBus.emit('data:changed', path);
  }

  /**
   * Get state for a specific module instance. Synchronous: reads from
   * the in-memory cache populated by load()/switchProject().
   * @param {string} instanceId
   * @returns {object|null}
   */
  getModuleState(instanceId) {
    return this._moduleCache.get(instanceId) ?? null;
  }

  /**
   * Update state for a specific module instance. Synchronous: writes to
   * the cache and queues an async write-behind to IndexedDB.
   *
   * The incoming state is structured-cloned so the cached snapshot is
   * decoupled from the caller's live object. This preserves the
   * "each read is a fresh snapshot" semantics the old JSON-through-
   * localStorage path gave us for free.
   * @param {string} instanceId
   * @param {object} state
   */
  setModuleState(instanceId, state) {
    if (this.isCompleted()) return;
    let snapshot;
    try {
      snapshot = structuredClone(state);
    } catch (err) {
      console.error('[StateManager] structuredClone failed for', instanceId, err);
      return;
    }
    this._moduleCache.set(instanceId, snapshot);
    this._pendingPuts.set(instanceId, snapshot);
    this._pendingDeletes.delete(instanceId);
    this._scheduleFlush();
    this._eventBus.emit('data:changed', `module:${instanceId}`);
  }

  /**
   * Remove state for a module instance (called on module:removed).
   * @param {string} instanceId
   */
  removeModuleState(instanceId) {
    if (this.isCompleted()) return;
    this._moduleCache.delete(instanceId);
    this._pendingPuts.delete(instanceId);
    this._pendingDeletes.add(instanceId);
    this._scheduleFlush();
    this._eventBus.emit('data:changed', `module:${instanceId}:removed`);
  }

  /**
   * Persist top-level state (settings, phases, metadata) to localStorage
   * immediately. Module states are handled separately by the IDB flush
   * loop; this call does not block on them.
   */
  save() {
    try {
      // Global (shared across projects)
      localStorage.setItem(`${GLOBAL_PREFIX}settings`, JSON.stringify(this._state.settings));

      // Skip per-project save if the active project no longer exists
      // (e.g. right after deleting it and before switching away).
      if (this._projectId && !this.getProjects().some(pr => pr.id === this._projectId)) {
        this._eventBus.emit('state:saved');
        return;
      }

      // Per-project
      const p = this._prefix();
      localStorage.setItem(`${p}projectMeta`, JSON.stringify(this._state.projectMeta));
      localStorage.setItem(`${p}phases`, JSON.stringify(this._state.phases));
      localStorage.setItem(`${p}phaseAchievement`, JSON.stringify(this._state.phaseAchievement));
      localStorage.setItem(`${p}phaseAchievementHistory`, JSON.stringify(this._state.phaseAchievementHistory || {}));
      localStorage.setItem(`${p}models`, JSON.stringify(this._state.models || {}));
      localStorage.setItem(`${p}optimizations`, JSON.stringify(this._state.optimizations || {}));
      localStorage.setItem(`${p}dashboard`, JSON.stringify(this._state.dashboard));
      localStorage.setItem(`${p}version`, this._state.version);

      // Update project name in project list
      this._updateProjectList();

      this._eventBus.emit('state:saved');
    } catch (err) {
      console.error('[StateManager] Failed to save state:', err);
    }
  }

  /**
   * Load state from browser storage for the active project.
   * Top-level state is read from localStorage; module states are
   * bulk-loaded from IndexedDB into the in-memory cache.
   */
  async load() {
    this._ensureActiveProject();

    try {
      // Global settings
      const settings = localStorage.getItem(`${GLOBAL_PREFIX}settings`);
      if (settings) this._state.settings = JSON.parse(settings);

      // Per-project data
      const p = this._prefix();
      const projectMeta = localStorage.getItem(`${p}projectMeta`);
      const phases = localStorage.getItem(`${p}phases`);
      const phaseAchievement = localStorage.getItem(`${p}phaseAchievement`);
      const phaseAchievementHistory = localStorage.getItem(`${p}phaseAchievementHistory`);
      const models = localStorage.getItem(`${p}models`);
      const optimizations = localStorage.getItem(`${p}optimizations`);
      const dashboard = localStorage.getItem(`${p}dashboard`);
      const version = localStorage.getItem(`${p}version`);

      if (projectMeta) {
        const parsed = JSON.parse(projectMeta);
        // Legacy 0.2 data has no cycle field — assume DMAIC. The full
        // 0.2→0.3 migration in migrations.js applies the same rule for
        // imported exports; this branch covers in-place LS data.
        if (!parsed.cycle) parsed.cycle = DEFAULT_CYCLE;
        this._state.projectMeta = parsed;
      }
      if (phases)                   this._state.phases                  = JSON.parse(phases);
      if (phaseAchievement)         this._state.phaseAchievement        = JSON.parse(phaseAchievement);
      if (phaseAchievementHistory)  this._state.phaseAchievementHistory = JSON.parse(phaseAchievementHistory);
      if (models)                   this._state.models                  = JSON.parse(models);
      if (optimizations)            this._state.optimizations           = JSON.parse(optimizations);
      if (dashboard)         this._state.dashboard          = JSON.parse(dashboard);
      if (version)           this._state.version            = version;
    } catch (err) {
      console.error('[StateManager] Failed to load state:', err);
    }

    // Load module states for the active project into the cache.
    await this._loadModuleCache();
  }

  // ─── Multi-Project API ────────────────────────────────────────

  /**
   * Get the active project ID.
   * @returns {string}
   */
  getActiveProjectId() {
    return this._projectId;
  }

  /**
   * Get list of all projects.
   * @returns {{ id: string, name: string, created: string, modified: string }[]}
   */
  getProjects() {
    try {
      const raw = localStorage.getItem(`${GLOBAL_PREFIX}projects`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  /**
   * Create a new project and switch to it. The cycle determines the phase
   * structure of the new project (see {@link _defaultState}). Unknown
   * cycle ids fall back to the default cycle.
   * @param {string} [name]
   * @param {string} [cycleId=DEFAULT_CYCLE]
   * @returns {string} new project ID
   */
  createProject(name, cycleId = DEFAULT_CYCLE) {
    const id = genId();
    const cycle = getCycle(cycleId).id;
    const projects = this.getProjects();
    const now = new Date().toISOString();
    projects.push({ id, name: name || 'Neues Projekt', cycle, created: now, modified: now, status: 'active' });
    localStorage.setItem(`${GLOBAL_PREFIX}projects`, JSON.stringify(projects));
    localStorage.setItem(`${GLOBAL_PREFIX}activeProject`, id);
    return id;
  }

  /**
   * Cycle id of the given project. Falls back to the default cycle when the
   * project entry has no cycle (legacy 0.2 data) or the project is unknown.
   * @param {string} [projectId] - defaults to the active project
   * @returns {string}
   */
  getProjectCycle(projectId = this._projectId) {
    if (projectId === this._projectId) {
      return this._state?.projectMeta?.cycle || DEFAULT_CYCLE;
    }
    const proj = this.getProjects().find(p => p.id === projectId);
    return proj?.cycle || DEFAULT_CYCLE;
  }

  /**
   * Inject the module registry. Required for `switchCycle` to look up each
   * module's per-cycle phase mapping. Called once during app bootstrap.
   * @param {import('./module-registry.js').ModuleRegistry} reg
   */
  setModuleRegistry(reg) {
    this._moduleRegistry = reg;
  }

  /**
   * Switch the active project to a different cycle in-place. Re-homes every
   * module instance to the matching phase in the new cycle (or to the first
   * methodology phase if no mapping exists), preserves ZEG values for phases
   * that exist in both cycles, drops them otherwise. Modules in `data` stay
   * put; modules in `extras` move to the first methodology phase. See Plan
   * §3.3a for the full migration rules.
   *
   * Caller is responsible for confirming with the user (modal) and for
   * triggering the UI reload after the call returns.
   *
   * @param {string} cycleId - target cycle id
   * @returns {boolean} true if a switch happened
   */
  switchCycle(cycleId) {
    if (this.isCompleted()) return false;
    const newCycleId = getCycle(cycleId).id;
    const oldCycleId = this._state.projectMeta?.cycle || DEFAULT_CYCLE;
    if (newCycleId === oldCycleId) return false;

    const oldMethodPhases = getPhaseIds(oldCycleId);
    const newMethodPhases = getPhaseIds(newCycleId);
    const newPhaseSet = new Set(newMethodPhases);
    const firstMethodPhase = newMethodPhases[0];

    // ─── Re-home module instances ─────────────────────────────
    const oldPhases = this._state.phases || {};
    const newPhasesObj = Object.fromEntries(
      getAllPhaseIds(newCycleId).map(p => [p, []])
    );
    // Data tile is cycle-independent → preserved as-is.
    newPhasesObj.data = [...(oldPhases.data || [])];

    const moveItem = (item, targetPhase) => {
      newPhasesObj[targetPhase] ??= [];
      newPhasesObj[targetPhase].push(item);
    };

    // Methodology phases of the old cycle: re-home by mapping.
    for (const oldPhase of oldMethodPhases) {
      for (const item of (oldPhases[oldPhase] || [])) {
        const def = this._moduleRegistry?.get(item.moduleId);
        const target = def?.cycles?.[newCycleId]?.phase ?? firstMethodPhase;
        moveItem(item, newPhaseSet.has(target) ? target : firstMethodPhase);
      }
    }
    // Old extras: move into first methodology phase (Plan §3.3a step 2).
    for (const item of (oldPhases.extras || [])) {
      moveItem(item, firstMethodPhase);
    }

    this._state.phases = newPhasesObj;

    // ─── Rebuild phaseAchievement ─────────────────────────────
    const oldAchievement = this._state.phaseAchievement || {};
    const newAchievement = {};
    for (const p of newMethodPhases) {
      newAchievement[p] = oldAchievement[p] ?? 0;
    }
    this._state.phaseAchievement = newAchievement;

    // Drop achievement history for phases that no longer exist.
    const history = this._state.phaseAchievementHistory;
    if (history) {
      for (const p of oldMethodPhases) {
        if (!newPhaseSet.has(p)) delete history[p];
      }
    }

    // ─── Persist + sync registry ──────────────────────────────
    this._state.projectMeta.cycle = newCycleId;
    this._state.projectMeta.modified = new Date().toISOString();
    this._moduleRegistry?.setActiveCycle(newCycleId);
    this.save();
    this._eventBus.emit('cycle:changed', { from: oldCycleId, to: newCycleId });
    return true;
  }

  /**
   * Delete a project and all its data (localStorage + IndexedDB).
   * Cannot delete the last remaining project.
   * @param {string} projectId
   * @returns {Promise<boolean>} true if deleted
   */
  async deleteProject(projectId) {
    const projects = this.getProjects();
    if (projects.length <= 1) return false;

    // If deleting the active project, drop any cached state and pending
    // writes so a follow-up save/flush cannot resurrect zombie entries.
    if (projectId === this._projectId) {
      this._moduleCache.clear();
      this._pendingPuts.clear();
      this._pendingDeletes.clear();
      if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
    }

    // Remove all localStorage keys for this project
    const prefix = `${GLOBAL_PREFIX}p_${projectId}_`;
    Object.keys(localStorage)
      .filter(k => k.startsWith(prefix))
      .forEach(k => localStorage.removeItem(k));

    // Remove all IDB module states for this project
    try {
      await idbDeleteAllForProject(projectId);
    } catch (err) {
      console.error('[StateManager] IDB delete failed:', err);
    }

    // Remove from project list
    const updated = projects.filter(p => p.id !== projectId);
    localStorage.setItem(`${GLOBAL_PREFIX}projects`, JSON.stringify(updated));

    return true;
  }

  /**
   * Move a project from one index to another in the list.
   * @param {number} fromIdx
   * @param {number} toIdx
   */
  reorderProjects(fromIdx, toIdx) {
    const projects = this.getProjects();
    if (fromIdx < 0 || fromIdx >= projects.length || toIdx < 0 || toIdx >= projects.length) return;
    const [moved] = projects.splice(fromIdx, 1);
    projects.splice(toIdx, 0, moved);
    localStorage.setItem(`${GLOBAL_PREFIX}projects`, JSON.stringify(projects));
  }

  /**
   * Check if the active project is completed (read-only).
   * @returns {boolean}
   */
  isCompleted() {
    const projects = this.getProjects();
    const p = projects.find(pr => pr.id === this._projectId);
    return p?.status === 'completed';
  }

  /**
   * Set the status of a project ('active' or 'completed').
   * @param {string} projectId
   * @param {string} status - 'active' | 'completed'
   */
  setProjectStatus(projectId, status) {
    const projects = this.getProjects();
    const p = projects.find(pr => pr.id === projectId);
    if (p) {
      p.status = status;
      localStorage.setItem(`${GLOBAL_PREFIX}projects`, JSON.stringify(projects));
    }
  }

  /**
   * Export ALL projects as a single JSON string.
   * Inactive projects are read from IndexedDB.
   * @returns {Promise<string>}
   */
  async exportAllJSON() {
    // Capture any unsaved live edits in the active project before reading the cache.
    this._eventBus.emit('project:before-export');
    await this.flushNow();

    const projects = this.getProjects();
    const allData = {
      appVersion: VERSION,
      exportedAt: new Date().toISOString(),
      settings: this._state.settings,
      projects: [],
    };

    for (const proj of projects) {
      const p = `${GLOBAL_PREFIX}p_${proj.id}_`;
      const projectMeta = localStorage.getItem(`${p}projectMeta`);
      const phases = localStorage.getItem(`${p}phases`);
      const phaseAchievement = localStorage.getItem(`${p}phaseAchievement`);
      const phaseAchievementHistory = localStorage.getItem(`${p}phaseAchievementHistory`);
      const models = localStorage.getItem(`${p}models`);
      const optimizations = localStorage.getItem(`${p}optimizations`);
      const dashboard = localStorage.getItem(`${p}dashboard`);
      const version = localStorage.getItem(`${p}version`);

      const entry = {
        id: proj.id,
        status: proj.status || 'active',
        projectMeta: projectMeta ? JSON.parse(projectMeta) : { name: proj.name },
        phases: phases ? JSON.parse(phases) : {},
        phaseAchievement: phaseAchievement ? JSON.parse(phaseAchievement) : {},
        phaseAchievementHistory: phaseAchievementHistory ? JSON.parse(phaseAchievementHistory) : {},
        models: models ? JSON.parse(models) : {},
        optimizations: optimizations ? JSON.parse(optimizations) : {},
        dashboard: dashboard ? JSON.parse(dashboard) : null,
        version: version || VERSION,
        moduleStates: {},
      };

      // Module states: active project from cache, others from IDB.
      let moduleMap;
      if (proj.id === this._projectId) {
        moduleMap = this._moduleCache;
      } else {
        try {
          moduleMap = await idbGetAllForProject(proj.id);
        } catch (err) {
          console.error('[StateManager] IDB read failed for project', proj.id, err);
          moduleMap = new Map();
        }
      }
      for (const [instanceId, state] of moduleMap) {
        entry.moduleStates[instanceId] = state;
      }

      allData.projects.push(entry);
    }

    return JSON.stringify(allData, null, 2);
  }

  /**
   * Import a multi-project export. Runs the migration chain on the file
   * before applying it. Files from a future MAJOR version are rejected.
   * Creates new projects for each entry and writes their module states to
   * IndexedDB.
   * @param {string} jsonString
   * @returns {Promise<void>}
   */
  async importAllJSON(jsonString) {
    let data = JSON.parse(jsonString);
    _assertNotFutureMajor(data.appVersion);
    data = migrateToLatest(data, VERSION);
    if (!data.projects || !Array.isArray(data.projects)) {
      throw new Error('Invalid multi-project export');
    }

    // Import settings
    if (data.settings) {
      localStorage.setItem(`${GLOBAL_PREFIX}settings`, JSON.stringify(data.settings));
    }

    for (const proj of data.projects) {
      const id = genId();
      const p = `${GLOBAL_PREFIX}p_${id}_`;

      // Write project data
      localStorage.setItem(`${p}projectMeta`, JSON.stringify(proj.projectMeta));
      localStorage.setItem(`${p}phases`, JSON.stringify(proj.phases || {}));
      localStorage.setItem(`${p}phaseAchievement`, JSON.stringify(proj.phaseAchievement || {}));
      if (proj.phaseAchievementHistory) {
        localStorage.setItem(`${p}phaseAchievementHistory`, JSON.stringify(proj.phaseAchievementHistory));
      }
      if (proj.models) {
        localStorage.setItem(`${p}models`, JSON.stringify(proj.models));
      }
      if (proj.optimizations) {
        localStorage.setItem(`${p}optimizations`, JSON.stringify(proj.optimizations));
      }
      if (proj.dashboard) {
        localStorage.setItem(`${p}dashboard`, JSON.stringify(proj.dashboard));
      }
      localStorage.setItem(`${p}version`, proj.version || VERSION);

      // Write module states directly to IDB (new project, not in cache).
      if (proj.moduleStates && Object.keys(proj.moduleStates).length > 0) {
        const puts = new Map(Object.entries(proj.moduleStates));
        try {
          await idbBatch(id, { puts });
        } catch (err) {
          console.error('[StateManager] IDB import failed for project', id, err);
        }
      }

      // Add to project list
      const projects = this.getProjects();
      projects.push({
        id,
        name: proj.projectMeta?.name || 'Importiert',
        created: proj.projectMeta?.created || new Date().toISOString(),
        modified: proj.projectMeta?.modified || new Date().toISOString(),
        status: proj.status || 'active',
      });
      localStorage.setItem(`${GLOBAL_PREFIX}projects`, JSON.stringify(projects));
    }
  }

  /**
   * Switch to a different project. Flushes any pending writes for the
   * current project, then loads top-level state and the module cache
   * for the new project.
   * @param {string} projectId
   * @returns {Promise<void>}
   */
  async switchProject(projectId) {
    // Persist current project's top-level state and flush pending IDB writes.
    this.save();
    await this.flushNow();

    // Set new active
    localStorage.setItem(`${GLOBAL_PREFIX}activeProject`, projectId);
    this._projectId = projectId;

    // Seed defaults with the project's cycle so missing persistent state
    // (fresh project, partial LS data) yields the right phase structure.
    const proj = this.getProjects().find(p => p.id === projectId);
    const cycleId = proj?.cycle || DEFAULT_CYCLE;

    // Reset and load new project
    this._state = this._defaultState(cycleId);
    this._moduleCache.clear();
    this._pendingPuts.clear();
    this._pendingDeletes.clear();
    await this.load();
  }

  // ─── Export / Import ──────────────────────────────────────────

  /**
   * Export full state for the active project as JSON string.
   * Synchronous: reads module states from the in-memory cache.
   * @returns {string}
   */
  exportJSON() {
    // Capture any unsaved live edits before reading the cache.
    this._eventBus.emit('project:before-export');
    const exportData = {
      appVersion: VERSION,
      exportedAt: new Date().toISOString(),
      ...this._state,
    };
    // Include all module states for the active project
    const moduleStates = {};
    for (const [instanceId, state] of this._moduleCache) {
      moduleStates[instanceId] = state;
    }
    exportData.moduleStates = moduleStates;
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import state from a JSON string (single-project export).
   * Runs the version migration chain on the file before applying it,
   * so older exports are upgraded to the current format. Files from a
   * future MAJOR version are rejected.
   * Writes are flushed to IDB before returning so a subsequent reload
   * sees the imported data.
   * @param {string} jsonString
   * @returns {Promise<void>}
   */
  async importJSON(jsonString) {
    let data = JSON.parse(jsonString);
    _assertNotFutureMajor(data.appVersion);
    data = migrateToLatest(data, VERSION);
    this._state.settings                 = data.settings                 ?? this._defaultState().settings;
    this._state.projectMeta              = data.projectMeta              ?? this._defaultState().projectMeta;
    this._state.phases                   = data.phases                    ?? this._defaultState().phases;
    this._state.phaseAchievement         = data.phaseAchievement          ?? this._defaultState().phaseAchievement;
    this._state.phaseAchievementHistory  = data.phaseAchievementHistory   ?? this._defaultState().phaseAchievementHistory;
    this._state.dashboard                = data.dashboard                 ?? this._defaultState().dashboard;
    this._state.version                  = VERSION;

    // Replace module-state cache with imported states.
    this._moduleCache.clear();
    this._pendingPuts.clear();
    this._pendingDeletes.clear();
    if (data.moduleStates) {
      for (const [instanceId, state] of Object.entries(data.moduleStates)) {
        this._moduleCache.set(instanceId, state);
        this._pendingPuts.set(instanceId, state);
      }
    }

    this.save();
    await this.flushNow();
    this._eventBus.emit('project:imported', { data });
  }

  /**
   * Clear all state for the active project (localStorage + IDB).
   * @returns {Promise<void>}
   */
  async reset() {
    const prefix = this._prefix();
    Object.keys(localStorage)
      .filter(k => k.startsWith(prefix))
      .forEach(k => localStorage.removeItem(k));

    try {
      await idbDeleteAllForProject(this._projectId);
    } catch (err) {
      console.error('[StateManager] IDB reset failed:', err);
    }

    this._state = this._defaultState();
    this._moduleCache.clear();
    this._pendingPuts.clear();
    this._pendingDeletes.clear();
  }

  /**
   * Approximate localStorage usage in bytes.
   * @returns {{ used: number, total: number }}
   */
  getStorageUsage() {
    let used = 0;
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(GLOBAL_PREFIX)) {
        used += (localStorage.getItem(key) || '').length * 2; // UTF-16
      }
    }
    return { used, total: 5 * 1024 * 1024 };
  }

  // ─── IDB Write-Behind ─────────────────────────────────────────

  /**
   * Schedule a debounced flush of pending module-state writes to IDB.
   * @private
   */
  _scheduleFlush() {
    if (this._flushTimer) clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => this._flush(), IDB_FLUSH_DELAY);
  }

  /**
   * Flush queued writes to IndexedDB. Safe to call concurrently —
   * overlapping calls await the in-flight promise and queue no extra work.
   * @private
   * @returns {Promise<void>}
   */
  async _flush() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    if (this._flushInFlight) return this._flushInFlight;
    if (this._pendingPuts.size === 0 && this._pendingDeletes.size === 0) return;
    if (!this._projectId) return;

    const projectId = this._projectId;
    const puts = this._pendingPuts;
    const deletes = this._pendingDeletes;
    this._pendingPuts = new Map();
    this._pendingDeletes = new Set();

    this._flushInFlight = (async () => {
      try {
        await idbBatch(projectId, { puts, deletes });
      } catch (err) {
        console.error('[StateManager] IDB flush failed:', err);
        // Re-queue on failure so the next flush retries.
        for (const [k, v] of puts) {
          if (!this._pendingPuts.has(k)) this._pendingPuts.set(k, v);
        }
        for (const k of deletes) {
          if (!this._pendingPuts.has(k)) this._pendingDeletes.add(k);
        }
      } finally {
        this._flushInFlight = null;
      }
    })();
    return this._flushInFlight;
  }

  /**
   * Force an immediate flush and wait until pending writes reach IDB.
   * @returns {Promise<void>}
   */
  async flushNow() {
    // Drain the queue; repeat once if new writes came in during flush.
    for (let i = 0; i < 2; i++) {
      if (this._pendingPuts.size === 0 && this._pendingDeletes.size === 0 && !this._flushInFlight) {
        return;
      }
      await this._flush();
      if (this._flushInFlight) await this._flushInFlight;
    }
  }

  /**
   * Best-effort synchronous flush on page unload. IndexedDB transactions
   * kicked off in beforeunload/visibilitychange are usually allowed to
   * complete even after the handler returns.
   * @private
   */
  _installUnloadFlush() {
    if (typeof window === 'undefined') return;
    const flush = () => {
      if (this._pendingPuts.size === 0 && this._pendingDeletes.size === 0) return;
      // Fire-and-forget. The transaction is queued on IDB synchronously.
      this._flush();
    };
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }

  /**
   * Bulk-load all module states for the active project into the cache.
   * @private
   * @returns {Promise<void>}
   */
  async _loadModuleCache() {
    this._moduleCache.clear();
    try {
      const map = await idbGetAllForProject(this._projectId);
      for (const [instanceId, state] of map) {
        this._moduleCache.set(instanceId, state);
      }
    } catch (err) {
      console.error('[StateManager] Failed to load module cache:', err);
    }
  }

  // ─── Internal ───────────────────────────────────────────────

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), AUTOSAVE_DELAY);
  }

  /**
   * Ensure a project ID is set. Migrates legacy single-project data if needed.
   * @private
   */
  _ensureActiveProject() {
    let activeId = localStorage.getItem(`${GLOBAL_PREFIX}activeProject`);
    let projects = this.getProjects();

    if (activeId && projects.some(p => p.id === activeId)) {
      this._projectId = activeId;
      return;
    }

    // First run or migration from legacy (single-project) format
    if (projects.length === 0) {
      const legacyMeta = localStorage.getItem(`${GLOBAL_PREFIX}projectMeta`);
      if (legacyMeta) {
        // Migrate legacy data into a new project. Legacy data predates the
        // cycle concept → assume DMAIC.
        const id = genId();
        this._projectId = id;
        this._migrateLegacy(id);
        projects = [{ id, name: JSON.parse(legacyMeta).name || 'Neues Projekt', cycle: DEFAULT_CYCLE, created: new Date().toISOString(), modified: new Date().toISOString(), status: 'active' }];
        localStorage.setItem(`${GLOBAL_PREFIX}projects`, JSON.stringify(projects));
        localStorage.setItem(`${GLOBAL_PREFIX}activeProject`, id);
        return;
      }
      // Truly first run — create default project
      const id = this.createProject();
      this._projectId = id;
      return;
    }

    // activeId invalid — pick first project
    this._projectId = projects[0].id;
    localStorage.setItem(`${GLOBAL_PREFIX}activeProject`, this._projectId);
  }

  /**
   * Migrate legacy single-project localStorage keys into a project namespace.
   * @private
   * @param {string} projectId
   */
  _migrateLegacy(projectId) {
    const p = `${GLOBAL_PREFIX}p_${projectId}_`;
    const legacyKeys = ['projectMeta', 'phases', 'phaseAchievement', 'phaseAchievementHistory', 'version'];
    for (const key of legacyKeys) {
      const val = localStorage.getItem(`${GLOBAL_PREFIX}${key}`);
      if (val) {
        localStorage.setItem(`${p}${key}`, val);
        localStorage.removeItem(`${GLOBAL_PREFIX}${key}`);
      }
    }
    // Migrate module states: dmike_module_xxx → dmike_p_{id}_module_xxx
    // (The later dmike_p_*_module_* → IDB migration then relocates these.)
    const modulePrefix = `${GLOBAL_PREFIX}module_`;
    Object.keys(localStorage)
      .filter(k => k.startsWith(modulePrefix))
      .forEach(k => {
        const suffix = k.slice(GLOBAL_PREFIX.length); // module_xxx
        localStorage.setItem(`${p}${suffix}`, localStorage.getItem(k));
        localStorage.removeItem(k);
      });
  }

  /**
   * Keep project name in sync in the project list.
   * @private
   */
  _updateProjectList() {
    const projects = this.getProjects();
    const p = projects.find(pr => pr.id === this._projectId);
    if (p) {
      p.name = this._state.projectMeta.name;
      p.modified = this._state.projectMeta.modified;
      // Keep project-list cycle in sync with projectMeta. For legacy entries
      // that never had a cycle, this fills it in on the next save.
      if (this._state.projectMeta.cycle) p.cycle = this._state.projectMeta.cycle;
      else if (!p.cycle) p.cycle = DEFAULT_CYCLE;
      localStorage.setItem(`${GLOBAL_PREFIX}projects`, JSON.stringify(projects));
    }
  }
}
