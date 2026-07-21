/**
 * @typedef {{ id: string, name: string, cycle?: string, created: string, modified: string, status: string }} ProjectEntry
 * @typedef {{ projectMeta: object, phases: object, phaseAchievement: object, phaseAchievementHistory: object, models: object, optimizations: object, dashboard: object|null, version: string, moduleStates: Object<string,object> }} ProjectDoc
 */

const NI = (name) => { throw new Error(`StorageAdapter.${name}() not implemented`); };

/**
 * Abstract persistence + project-registry seam. Exactly one concrete adapter
 * is wired per build (LocalAdapter on web; Excel/Graph adapters downstream).
 */
export class StorageAdapter {
  /** @type {boolean} True only for adapters that manage a project registry. */
  supportsMultiProject = false;

  listProjects() { return NI('listProjects'); }
  getActiveProjectId() { return NI('getActiveProjectId'); }
  setActiveProjectId(_id) { return NI('setActiveProjectId'); }
  createProject(_name, _cycle) { return NI('createProject'); }
  setProjectStatus(_id, _status) { return NI('setProjectStatus'); }
  reorderProjects(_from, _to) { return NI('reorderProjects'); }
  async deleteProject(_id) { return NI('deleteProject'); }
  async loadProjectDoc(_id) { return NI('loadProjectDoc'); }
  saveProjectMeta(_id, _doc) { return NI('saveProjectMeta'); }
  putModule(_id, _instanceId, _state) { return NI('putModule'); }
  removeModule(_id, _instanceId) { return NI('removeModule'); }
  /** Drop any queued (unflushed) module writes/deletes for a project. */
  dropPending(_id) { return NI('dropPending'); }
  /** Append a raw project-registry entry without activating it or stamping timestamps. */
  addProjectEntry(_entry) { return NI('addProjectEntry'); }
  /** Merge a partial update into a project's registry entry and persist. */
  updateProjectEntry(_id, _patch) { return NI('updateProjectEntry'); }
  async flush() { return NI('flush'); }
  /**
   * Optional synchronous best-effort flush for page-unload handlers. Adapters
   * that back module state with an async store (e.g. IndexedDB) should commit
   * pending writes synchronously here so data survives an immediate
   * reload/restart. Default: no-op (callers fall back to {@link flush}).
   * @returns {void}
   */
  flushSync() {}

  /**
   * Register a callback fired when the backing store changes remotely
   * (another client/co-author wrote). Returns an unsubscribe function.
   * @param {() => void} _onRemoteChange
   * @returns {() => void}
   */
  subscribe(_onRemoteChange) { return NI('subscribe'); }

  async exportProjectDocs(_ids) { return NI('exportProjectDocs'); }
  async importProjectDoc(_id, _doc) { return NI('importProjectDoc'); }
}
