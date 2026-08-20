import { StorageAdapter } from './storage-adapter.js';
import { VERSION } from '../version.js';
import { stripPatch } from '../version-utils.js';
import { DEFAULT_CYCLE, getCycle } from '../cycles/cycles.js';
import { openDB, idbGetAllForProject, idbBatch, idbBatchSync, idbDeleteAllForProject } from '../idb-store.js';

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export class LocalAdapter extends StorageAdapter {
  supportsMultiProject = true;

  /** @param {string} [prefix] localStorage version namespace */
  constructor(prefix = `dmike_v${stripPatch(VERSION)}_`) {
    super();
    this._P = prefix;
    /** @type {Map<string, Map<string, object>>} pending per-project module writes */
    this._pending = new Map();
    /** @type {Map<string, Set<string>>} pending per-project deletes */
    this._pendingDel = new Map();
    this.migrateLegacyIfNeeded();
    // Warm the IDB connection now. flushSync() is the only write path that
    // survives an immediate reload, and it needs an ALREADY OPEN connection —
    // idbBatchSync bails with `if (!_db) return false` otherwise. Without
    // this, the first item of a fresh project can be entered and the page
    // reloaded before anything ever opened the database; the write then falls
    // back to the async path, which the browser may discard while tearing the
    // page down. That is Bug 012, and it stayed reproducible in roughly one
    // of twelve instant reloads until the connection was warmed here.
    openDB().catch(() => { /* a real read/write will surface the failure */ });
  }

  _pp(id) { return `${this._P}p_${id}_`; }

  listProjects() {
    try { return JSON.parse(localStorage.getItem(`${this._P}projects`) || '[]'); }
    catch { return []; }
  }
  getActiveProjectId() { return localStorage.getItem(`${this._P}activeProject`); }
  setActiveProjectId(id) { localStorage.setItem(`${this._P}activeProject`, id); }

  /**
   * Local storage is single-client — nothing to poll. Returns a no-op unsubscribe.
   * @param {() => void} _onRemoteChange
   * @returns {() => void}
   */
  subscribe(_onRemoteChange) { return () => {}; }

  createProject(name, cycleId = DEFAULT_CYCLE) {
    const id = genId();
    const cycle = getCycle(cycleId).id;
    const now = new Date().toISOString();
    const projects = this.listProjects();
    projects.push({ id, name: name || 'Neues Projekt', cycle, created: now, modified: now, status: 'active' });
    localStorage.setItem(`${this._P}projects`, JSON.stringify(projects));
    localStorage.setItem(`${this._P}activeProject`, id);
    return id;
  }

  setProjectStatus(id, status) {
    const projects = this.listProjects();
    const p = projects.find(pr => pr.id === id);
    if (p) { p.status = status; localStorage.setItem(`${this._P}projects`, JSON.stringify(projects)); }
  }

  reorderProjects(from, to) {
    const projects = this.listProjects();
    if (from < 0 || from >= projects.length || to < 0 || to >= projects.length) return;
    const [m] = projects.splice(from, 1);
    projects.splice(to, 0, m);
    localStorage.setItem(`${this._P}projects`, JSON.stringify(projects));
  }

  async loadProjectDoc(id) {
    if (!this.listProjects().some(p => p.id === id)) return null;
    const p = this._pp(id);
    const j = (k) => { const v = localStorage.getItem(`${p}${k}`); return v ? JSON.parse(v) : null; };
    const moduleStates = {};
    try {
      for (const [instanceId, state] of await idbGetAllForProject(id)) moduleStates[instanceId] = state;
    } catch (err) { console.error('[LocalAdapter] IDB read failed', id, err); }
    return {
      projectMeta: j('projectMeta') || {},
      phases: j('phases') || {},
      phaseAchievement: j('phaseAchievement') || {},
      phaseAchievementHistory: j('phaseAchievementHistory') || {},
      models: j('models') || {},
      optimizations: j('optimizations') || {},
      dashboard: j('dashboard'),
      version: localStorage.getItem(`${p}version`) || VERSION,
      moduleStates,
    };
  }

  saveProjectMeta(id, doc) {
    const p = this._pp(id);
    const set = (k, v) => localStorage.setItem(`${p}${k}`, JSON.stringify(v));
    set('projectMeta', doc.projectMeta || {});
    set('phases', doc.phases || {});
    set('phaseAchievement', doc.phaseAchievement || {});
    set('phaseAchievementHistory', doc.phaseAchievementHistory || {});
    set('models', doc.models || {});
    set('optimizations', doc.optimizations || {});
    set('dashboard', doc.dashboard ?? null);
    localStorage.setItem(`${p}version`, doc.version || VERSION);
  }

  putModule(id, instanceId, state) {
    if (!this._pending.has(id)) this._pending.set(id, new Map());
    this._pending.get(id).set(instanceId, state);
    this._pendingDel.get(id)?.delete(instanceId);
  }

  removeModule(id, instanceId) {
    this._pending.get(id)?.delete(instanceId);
    if (!this._pendingDel.has(id)) this._pendingDel.set(id, new Set());
    this._pendingDel.get(id).add(instanceId);
  }

  /**
   * Drop any queued (unflushed) module writes/deletes for a project, so a
   * subsequent flush cannot resurrect data that was wiped out of band (reset).
   * @param {string} id
   */
  dropPending(id) {
    this._pending.delete(id);
    this._pendingDel.delete(id);
  }

  /**
   * Merge a partial update into a project's registry entry and persist.
   * Preserves the legacy cycle default-fill: an entry with no cycle after
   * the merge falls back to DEFAULT_CYCLE.
   * @param {string} id
   * @param {{name?:string, modified?:string, cycle?:string}} patch
   */
  updateProjectEntry(id, patch) {
    const projects = this.listProjects();
    const p = projects.find(pr => pr.id === id);
    if (!p) return;
    Object.assign(p, patch);
    if (!p.cycle) p.cycle = DEFAULT_CYCLE;
    localStorage.setItem(`${this._P}projects`, JSON.stringify(projects));
  }

  /**
   * Append a raw project-registry entry as-is (used by multi-project import).
   * Does NOT activate the project or stamp its own timestamps/status — the
   * caller supplies the full entry.
   * @param {ProjectEntry} entry
   */
  addProjectEntry(entry) {
    const projects = this.listProjects();
    projects.push(entry);
    localStorage.setItem(`${this._P}projects`, JSON.stringify(projects));
  }

  async flush() {
    const ids = new Set([...this._pending.keys(), ...this._pendingDel.keys()]);
    for (const id of ids) {
      const puts = this._pending.get(id) || new Map();
      const deletes = this._pendingDel.get(id) || new Set();
      this._pending.delete(id);
      this._pendingDel.delete(id);
      if (puts.size === 0 && deletes.size === 0) continue;
      try { await idbBatch(id, { puts, deletes }); }
      catch (err) {
        console.error('[LocalAdapter] IDB flush failed', id, err);
        if (!this._pending.has(id)) this._pending.set(id, new Map());
        const rp = this._pending.get(id);
        for (const [k, v] of puts) if (!rp.has(k)) rp.set(k, v);
        if (!this._pendingDel.has(id)) this._pendingDel.set(id, new Set());
        const rd = this._pendingDel.get(id);
        for (const k of deletes) if (!rp.has(k)) rd.add(k);
      }
    }
  }

  /**
   * Synchronous best-effort flush for page-unload handlers. Drains the pending
   * queues by issuing their IDB writes *synchronously* (see idbBatchSync) so a
   * reload/restart that fires beforeunload but tears the page down before an
   * awaited/debounced flush can run still commits the data (Bug 012). Any queue
   * whose write could not be issued synchronously (DB not open yet) is left
   * intact so the normal async flush path can still pick it up.
   * @returns {void}
   */
  flushSync() {
    const ids = new Set([...this._pending.keys(), ...this._pendingDel.keys()]);
    for (const id of ids) {
      const puts = this._pending.get(id) || new Map();
      const deletes = this._pendingDel.get(id) || new Set();
      if (puts.size === 0 && deletes.size === 0) {
        this._pending.delete(id);
        this._pendingDel.delete(id);
        continue;
      }
      let issued;
      try { issued = idbBatchSync(id, { puts, deletes }); }
      catch (err) { console.error('[LocalAdapter] IDB sync flush failed', id, err); issued = false; }
      if (issued) {
        this._pending.delete(id);
        this._pendingDel.delete(id);
      }
      // else: keep the queue so the async flush() can retry.
    }
  }

  async deleteProject(id) {
    this._pending.delete(id);
    this._pendingDel.delete(id);
    const prefix = this._pp(id);
    Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k));
    try { await idbDeleteAllForProject(id); }
    catch (err) { console.error('[LocalAdapter] IDB delete failed', err); }
    const updated = this.listProjects().filter(p => p.id !== id);
    localStorage.setItem(`${this._P}projects`, JSON.stringify(updated));
  }

  async exportProjectDocs(ids) {
    const out = [];
    for (const id of ids) { const doc = await this.loadProjectDoc(id); if (doc) out.push({ id, ...doc }); }
    return out;
  }

  async importProjectDoc(id, doc) {
    this.saveProjectMeta(id, doc);
    const puts = new Map(Object.entries(doc.moduleStates || {}));
    if (puts.size) { try { await idbBatch(id, { puts }); } catch (err) { console.error('[LocalAdapter] IDB import failed', id, err); } }
  }

  /**
   * Migrate legacy single-project layout (un-namespaced keys like
   * `${prefix}projectMeta`) into a project namespace. Idempotent; called
   * from the constructor and safe to call repeatedly.
   */
  migrateLegacyIfNeeded() {
    if (this.listProjects().length > 0) return;
    const legacyMeta = localStorage.getItem(`${this._P}projectMeta`);
    if (!legacyMeta) return;
    const id = this.createProject(JSON.parse(legacyMeta).name || 'Neues Projekt', DEFAULT_CYCLE);
    const p = this._pp(id);
    for (const key of ['projectMeta', 'phases', 'phaseAchievement', 'phaseAchievementHistory', 'version']) {
      const val = localStorage.getItem(`${this._P}${key}`);
      if (val) { localStorage.setItem(`${p}${key}`, val); localStorage.removeItem(`${this._P}${key}`); }
    }
    const modulePrefix = `${this._P}module_`;
    Object.keys(localStorage).filter(k => k.startsWith(modulePrefix)).forEach(k => {
      localStorage.setItem(`${p}${k.slice(this._P.length)}`, localStorage.getItem(k));
      localStorage.removeItem(k);
    });
  }
}
