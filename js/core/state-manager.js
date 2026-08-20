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
 *   version: '0.6.0',
 *   settings: { language, theme, … },
 *   phases: { data, …<methodology phases>, extras },        // arrays of module instances
 *   phaseAchievement: { …<methodology phases> },             // 0–100, no data/extras
 *   phaseAchievementHistory: { …<methodology phases>: [{t,v}, …] }, // ZEG timeline
 *   projectMeta: { name, cycle, created, modified }          // cycle: 'dmaic' | 'dmadv' | …
 * }
 */

import { VERSION } from './version.js';
import { parseVersion, stripPatch } from './version-utils.js';
import { migrateToLatest } from './migrations.js';
import { idbDeleteAllForProject } from './idb-store.js';
import { LocalAdapter } from './storage/local-adapter.js';
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
   * @param {import('./storage/storage-adapter.js').StorageAdapter} [adapter]
   *   Persistence + project-registry seam. Defaults to LocalAdapter (web build).
   */
  constructor(eventBus, adapter = new LocalAdapter()) {
    this._eventBus = eventBus;
    this._adapter = adapter;
    this._state = this._defaultState();
    this._saveTimer = null;
    this._projectId = null;
    /** @type {import('./module-registry.js').ModuleRegistry | null} */
    this._moduleRegistry = null;

    // Module-state cache (synchronous façade in front of the adapter's IDB).
    /** @type {Map<string, object>} */
    this._moduleCache = new Map();
    this._flushTimer = null;

    this._unsub = null;           // adapter.subscribe() teardown handle
    this._applyingRemote = false; // true while applying a remote change (suppresses write-back)

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
   * List all module instances of the given moduleId across all phases in the
   * active project. Synchronous — reads from the state's `phases` tree.
   * Returns [] if no phases loaded or no instances match.
   *
   * `title` is the instance's user-visible label: the `customName` the
   * workspace writes when a tab is renamed (see workspace.js `_setCustomName`),
   * or '' when it was never renamed — the tab then shows the i18n module name,
   * which is the caller's job to supply. It deliberately does NOT fall back to
   * the instanceId: that surfaced a raw UUID in the flowchart import picker.
   * @param {string} moduleId
   * @returns {Array<{instanceId: string, moduleId: string, title: string}>}
   */
  listInstances(moduleId) {
    const out = [];
    const phases = this.get('phases') || {};
    for (const phaseId of Object.keys(phases)) {
      const items = this.get(`phases.${phaseId}`) || [];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || item.moduleId !== moduleId) continue;
        out.push({
          instanceId: item.instanceId,
          moduleId: item.moduleId,
          title: item.customName || item.title || '',
        });
      }
    }
    return out;
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
    if (this._applyingRemote) return;   // do not echo a remote apply back to the adapter
    if (this.isCompleted()) return;
    let snapshot;
    try {
      snapshot = structuredClone(state);
    } catch (err) {
      console.error('[StateManager] structuredClone failed for', instanceId, err);
      return;
    }
    this._moduleCache.set(instanceId, snapshot);
    this._adapter.putModule(this._projectId, instanceId, snapshot);
    this._scheduleFlush();
    this._eventBus.emit('data:changed', `module:${instanceId}`);
  }

  /**
   * Remove state for a module instance (called on module:removed).
   * @param {string} instanceId
   */
  removeModuleState(instanceId) {
    if (this._applyingRemote) return;   // do not echo a remote apply back to the adapter
    if (this.isCompleted()) return;
    this._moduleCache.delete(instanceId);
    this._adapter.removeModule(this._projectId, instanceId);
    this._scheduleFlush();
    this._eventBus.emit('data:changed', `module:${instanceId}:removed`);
  }

  /**
   * Persist top-level state (settings, phases, metadata) to localStorage
   * immediately. Module states are handled separately by the IDB flush
   * loop; this call does not block on them.
   */
  save() {
    if (this._applyingRemote) return;   // do not echo a remote apply back to the adapter
    try {
      // Global (shared across projects)
      localStorage.setItem(`${GLOBAL_PREFIX}settings`, JSON.stringify(this._state.settings));

      // Skip per-project save if the active project no longer exists
      // (e.g. right after deleting it and before switching away).
      if (this._projectId && !this.getProjects().some(pr => pr.id === this._projectId)) {
        this._eventBus.emit('state:saved');
        return;
      }

      // Per-project — delegated to the storage adapter.
      if (!this._projectId) this._ensureActiveProject();
      this._adapter.saveProjectMeta(this._projectId, {
        projectMeta: this._state.projectMeta,
        phases: this._state.phases,
        phaseAchievement: this._state.phaseAchievement,
        phaseAchievementHistory: this._state.phaseAchievementHistory || {},
        models: this._state.models || {},
        optimizations: this._state.optimizations || {},
        dashboard: this._state.dashboard,
        version: this._state.version,
      });

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
      // Global settings — stay inline in localStorage (not via the adapter).
      const settings = localStorage.getItem(`${GLOBAL_PREFIX}settings`);
      if (settings) this._state.settings = JSON.parse(settings);

      // Per-project doc (top-level state + module states) via the adapter.
      const doc = await this._adapter.loadProjectDoc(this._projectId);
      if (doc) {
        const meta = doc.projectMeta || {};
        // Legacy 0.2 data has no cycle field — assume DMAIC. The full
        // 0.2→0.3 migration in migrations.js applies the same rule for
        // imported exports; this branch covers in-place LS data.
        if (meta && Object.keys(meta).length > 0) {
          if (!meta.cycle) meta.cycle = DEFAULT_CYCLE;
          this._state.projectMeta = meta;
        }
        if (doc.phases && Object.keys(doc.phases).length > 0) this._state.phases = doc.phases;
        if (doc.phaseAchievement && Object.keys(doc.phaseAchievement).length > 0) this._state.phaseAchievement = doc.phaseAchievement;
        if (doc.phaseAchievementHistory) this._state.phaseAchievementHistory = doc.phaseAchievementHistory;
        if (doc.models) this._state.models = doc.models;
        if (doc.optimizations) this._state.optimizations = doc.optimizations;
        if (doc.dashboard) this._state.dashboard = doc.dashboard;
        if (doc.version) this._state.version = doc.version;

        // Module states for the active project → cache.
        this._moduleCache = new Map(Object.entries(doc.moduleStates || {}));
      } else {
        this._moduleCache.clear();
      }
    } catch (err) {
      console.error('[StateManager] Failed to load state:', err);
    }

    // Live remote sync: the adapter notifies us when a co-author writes.
    if (this._unsub) this._unsub();
    this._applyingRemote = false;
    this._unsub = this._adapter.subscribe(() => this._onRemoteChange());
  }

  // ─── Remote Sync ────────────────────────────────────────────

  /**
   * Called by the adapter when the backing store changed remotely.
   * Reloads the ProjectDoc (the adapter has already merged the remote update),
   * diffs it against local cache/state, applies in place under the guard,
   * and emits `state:remote-changed`.
   * @private
   */
  async _onRemoteChange() {
    if (this._applyingRemote) return;      // reentrancy guard
    this._applyingRemote = true;
    try {
      const doc = await this._adapter.loadProjectDoc(this._projectId);
      if (!doc) return;
      const { instanceIds, metaChanged } = this._diffRemote(doc);
      if (metaChanged) {
        this._state.projectMeta = doc.projectMeta;
        this._state.phases = doc.phases;
        this._state.phaseAchievement = doc.phaseAchievement;
        this._state.phaseAchievementHistory = doc.phaseAchievementHistory;
        this._state.models = doc.models;
        this._state.optimizations = doc.optimizations;
        this._state.dashboard = doc.dashboard;
        this._state.version = doc.version;
      }
      this._moduleCache = new Map(Object.entries(doc.moduleStates || {}));
      this._eventBus.emit('state:remote-changed', { instanceIds, metaChanged });
    } finally {
      queueMicrotask(() => { this._applyingRemote = false; });
    }
  }

  /**
   * Compute which module instanceIds changed vs. the current cache and whether
   * any meta/phases field changed vs. current state.
   * @param {object} doc - the newly loaded ProjectDoc
   * @returns {{ instanceIds: string[], metaChanged: boolean }}
   * @private
   */
  _diffRemote(doc) {
    const next = doc.moduleStates || {};
    const changed = new Set();
    for (const id of Object.keys(next)) {
      const before = this._moduleCache.get(id);
      if (JSON.stringify(before) !== JSON.stringify(next[id])) changed.add(id);
    }
    for (const id of this._moduleCache.keys()) if (!(id in next)) changed.add(id);

    const metaFields = ['projectMeta', 'phases', 'phaseAchievement', 'phaseAchievementHistory',
      'models', 'optimizations', 'dashboard', 'version'];
    let metaChanged = false;
    for (const f of metaFields) {
      if (JSON.stringify(this._state[f]) !== JSON.stringify(doc[f])) { metaChanged = true; break; }
    }
    return { instanceIds: [...changed], metaChanged };
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
    return this._adapter.listProjects();
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
    return this._adapter.createProject(name, cycleId);
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
    if (!projects.some(p => p.id === projectId)) return false;

    // If deleting the active project, drop any cached state and cancel the
    // pending flush so a follow-up save/flush cannot resurrect zombie
    // entries. The adapter drains its own pending queue in deleteProject().
    if (projectId === this._projectId) {
      this._moduleCache.clear();
      if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
    }

    // Adapter removes per-project storage (localStorage + IDB) and the
    // registry entry, and drains its pending writes for this project.
    await this._adapter.deleteProject(projectId);

    return true;
  }

  /**
   * Move a project from one index to another in the list.
   * @param {number} fromIdx
   * @param {number} toIdx
   */
  reorderProjects(fromIdx, toIdx) {
    return this._adapter.reorderProjects(fromIdx, toIdx);
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
    return this._adapter.setProjectStatus(projectId, status);
  }

  /**
   * Export ALL projects as a single JSON string.
   * Inactive projects are read from IndexedDB.
   * @returns {Promise<string>}
   */
  async exportAllJSON() {
    // Capture any unsaved live edits in the active project before reading.
    // After flushNow(), the active project's module states are in IDB, so
    // the adapter's loadProjectDoc returns them for every project uniformly.
    this._eventBus.emit('project:before-export');
    await this.flushNow();

    const projects = this.getProjects();
    const allData = {
      appVersion: VERSION,
      exportedAt: new Date().toISOString(),
      settings: this._state.settings,
      projects: [],
    };

    const docs = await this._adapter.exportProjectDocs(projects.map(p => p.id));
    const docById = new Map(docs.map(d => [d.id, d]));

    for (const proj of projects) {
      const doc = docById.get(proj.id) || {};
      const meta = doc.projectMeta && Object.keys(doc.projectMeta).length > 0
        ? doc.projectMeta
        : { name: proj.name };

      allData.projects.push({
        id: proj.id,
        status: proj.status || 'active',
        projectMeta: meta,
        phases: doc.phases || {},
        phaseAchievement: doc.phaseAchievement || {},
        phaseAchievementHistory: doc.phaseAchievementHistory || {},
        models: doc.models || {},
        optimizations: doc.optimizations || {},
        dashboard: doc.dashboard ?? null,
        version: doc.version || VERSION,
        moduleStates: doc.moduleStates || {},
      });
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

      // Persist the per-project doc (top-level state + module states) via the
      // adapter. Does NOT activate the project or stamp its own timestamps.
      await this._adapter.importProjectDoc(id, {
        projectMeta: proj.projectMeta,
        phases: proj.phases || {},
        phaseAchievement: proj.phaseAchievement || {},
        phaseAchievementHistory: proj.phaseAchievementHistory || {},
        models: proj.models || {},
        optimizations: proj.optimizations || {},
        dashboard: proj.dashboard ?? null,
        version: proj.version || VERSION,
        moduleStates: proj.moduleStates || {},
      });

      // Register the project with the FILE's status/timestamps/name-fallback,
      // without activating it.
      this._adapter.addProjectEntry({
        id,
        name: proj.projectMeta?.name || 'Importiert',
        cycle: proj.projectMeta?.cycle || DEFAULT_CYCLE,
        created: proj.projectMeta?.created || new Date().toISOString(),
        modified: proj.projectMeta?.modified || new Date().toISOString(),
        status: proj.status || 'active',
      });
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

    // Set new active (via the adapter registry).
    this._adapter.setActiveProjectId(projectId);
    this._projectId = projectId;

    // Seed defaults with the project's cycle so missing persistent state
    // (fresh project, partial LS data) yields the right phase structure.
    const proj = this.getProjects().find(p => p.id === projectId);
    const cycleId = proj?.cycle || DEFAULT_CYCLE;

    // Reset and reload the new project from the adapter. A brand-new project
    // has no saved doc yet, so load() below finds nothing to override the
    // default projectMeta with — seed the name from the project-list entry
    // (set by createProject()) so the header shows the real name immediately,
    // not the generic default, before the first save() persists a doc.
    this._state = this._defaultState(cycleId);
    if (proj?.name) this._state.projectMeta.name = proj.name;
    this._moduleCache.clear();
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

    // Replace module-state cache with imported states, queueing each write
    // through the adapter so save()/flushNow() persists them.
    this._moduleCache.clear();
    if (data.moduleStates) {
      for (const [instanceId, state] of Object.entries(data.moduleStates)) {
        this._moduleCache.set(instanceId, state);
        this._adapter.putModule(this._projectId, instanceId, state);
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
    if (!this._projectId) this._ensureActiveProject();

    // Wipe this project's per-project localStorage keys but keep it
    // registered (the adapter has no "reset one project" primitive).
    const prefix = `${GLOBAL_PREFIX}p_${this._projectId}_`;
    Object.keys(localStorage)
      .filter(k => k.startsWith(prefix))
      .forEach(k => localStorage.removeItem(k));

    try {
      await idbDeleteAllForProject(this._projectId);
    } catch (err) {
      console.error('[StateManager] IDB reset failed:', err);
    }

    // Drop any queued adapter writes for this project so they cannot
    // resurrect the data we just wiped.
    this._adapter.dropPending(this._projectId);

    this._state = this._defaultState();
    this._moduleCache.clear();
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
   * Schedule a flush of pending module-state writes to IDB — immediately on
   * the leading edge, debounced for everything that follows.
   *
   * Trailing-edge-only debouncing left every discrete commit — saving a
   * dialog, adding a row — sitting in memory for 500ms, protected by nothing
   * but the unload handler. That handler cannot be made reliable: an IDB
   * transaction started in `beforeunload` may still be discarded while the
   * browser tears the page down, which is exactly how Bug 012 lost data. So
   * the first write after a quiet period goes to storage at once, and only
   * the writes that follow it inside the window are batched — which is what
   * the debounce is actually for: not losing the keystroke, but not writing
   * on every one of them.
   * @private
   */
  _scheduleFlush() {
    const wasQuiet = this._flushTimer === null;
    if (this._flushTimer) clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => this._flush(), IDB_FLUSH_DELAY);
    // Straight to the adapter, not via _flush(): that one clears the timer we
    // just armed for whatever else arrives inside the window.
    if (wasQuiet) this._adapter.flush();
  }

  /**
   * Flush queued module-state writes to storage. The adapter owns the
   * pending queue, batching, and re-queue-on-failure.
   * @private
   * @returns {Promise<void>}
   */
  async _flush() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    return this._adapter.flush();
  }

  /**
   * Force an immediate flush and wait until pending writes reach storage.
   * @returns {Promise<void>}
   */
  async flushNow() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    return this._adapter.flush();
  }

  /**
   * Best-effort flush on page unload. Storage transactions kicked off in
   * beforeunload/visibilitychange are usually allowed to complete even
   * after the handler returns.
   * @private
   */
  _installUnloadFlush() {
    if (typeof window === 'undefined') return;
    // On unload we must commit pending module-state writes *synchronously*.
    // The async flush() defers its IDB transaction to a microtask (it awaits
    // openDB()), which the browser can discard while tearing the page down —
    // so data entered right before an immediate reload/restart is silently
    // lost (Bug 012). flushSync() issues the transaction in this stack frame
    // using the already-open connection; we fall back to the async flush when
    // the adapter has no sync path or the connection was not yet open.
    const flush = () => {
      if (typeof this._adapter.flushSync === 'function') this._adapter.flushSync();
      else this._adapter.flush();
    };
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }

  // ─── Internal ───────────────────────────────────────────────

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), AUTOSAVE_DELAY);
  }

  /**
   * Ensure a project ID is set, reading/creating via the adapter registry.
   * Legacy single-project migration now lives in the adapter (see Task 5).
   * @private
   */
  _ensureActiveProject() {
    const activeId = this._adapter.getActiveProjectId();
    const projects = this._adapter.listProjects();

    if (activeId && projects.some(p => p.id === activeId)) {
      this._projectId = activeId;
      return;
    }

    // First run — create a default project (adapter activates it).
    if (projects.length === 0) {
      this._projectId = this._adapter.createProject('Neues Projekt', DEFAULT_CYCLE);
      return;
    }

    // activeId invalid — pick first project.
    this._projectId = projects[0].id;
    this._adapter.setActiveProjectId(this._projectId);
  }

  /**
   * Keep project name in sync in the project list.
   * @private
   */
  _updateProjectList() {
    const meta = this._state.projectMeta;
    const patch = { name: meta.name, modified: meta.modified };
    if (meta.cycle) patch.cycle = meta.cycle;
    this._adapter.updateProjectEntry(this._projectId, patch);
  }
}
