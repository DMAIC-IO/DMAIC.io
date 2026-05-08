/**
 * D.Mike — Cross-Version Browser Import (cross-version-import.js)
 *
 * D.Mike versions deployed under the same domain (e.g. /v0.2/, /v0.3/)
 * keep their data fully isolated by namespacing localStorage and
 * IndexedDB per MAJOR.MINOR. This module bridges that isolation:
 * it detects when another version's data is present in the current
 * browser and offers a one-click takeover that funnels the data
 * through `migrateToLatest()` into the current version.
 *
 * Public API:
 *   findOtherVersions()             → list of versions with data
 *   buildSnapshotFromVersion(mm)    → JSON-string snapshot ready to import
 *   importFromVersion(mm, sm)       → end-to-end takeover
 */

import { VERSION } from './version.js';
import { stripPatch, compareVersions } from './version-utils.js';

const VERSIONED_KEY_RE = /^dmike_v(\d+)\.(\d+)_/;
const LEGACY_KEY_RE = /^dmike_(?!v\d)/; // pre-0.2 keys (no version segment)
const CURRENT_MM = stripPatch(VERSION);

/**
 * @typedef {Object} OtherVersion
 * @property {string}  versionMM      e.g. '0.1' or '0.2'
 * @property {string}  label          e.g. 'v0.1' (UI label)
 * @property {number}  projectCount   how many projects are stored
 * @property {boolean} legacy         true for pre-0.2 (no version segment)
 */

/**
 * Find all D.Mike versions other than the current one that have data
 * in this browser. Sorted newest-first.
 * @returns {OtherVersion[]}
 */
export function findOtherVersions() {
  /** @type {Map<string, OtherVersion>} */
  const versions = new Map();

  // Versioned data (v0.2+)
  for (const key of Object.keys(localStorage)) {
    const m = key.match(VERSIONED_KEY_RE);
    if (!m) continue;
    const mm = `${m[1]}.${m[2]}`;
    if (mm === CURRENT_MM) continue;
    if (!versions.has(mm)) {
      versions.set(mm, { versionMM: mm, label: `v${mm}`, projectCount: 0, legacy: false });
    }
  }

  // Legacy data (pre-0.2: keys like dmike_projects, dmike_p_…)
  // Only count if at least one legacy non-versioned key exists.
  const hasLegacy = Object.keys(localStorage).some(k => LEGACY_KEY_RE.test(k));
  if (hasLegacy && CURRENT_MM !== '0.1') {
    versions.set('0.1', { versionMM: '0.1', label: 'v0.1', projectCount: 0, legacy: true });
  }

  // Count projects per detected version
  for (const v of versions.values()) {
    const prefix = v.legacy ? 'dmike_' : `dmike_v${v.versionMM}_`;
    const projectsRaw = localStorage.getItem(`${prefix}projects`);
    if (projectsRaw) {
      try { v.projectCount = JSON.parse(projectsRaw).length; } catch { /* ignore */ }
    }
  }

  return [...versions.values()]
    .filter(v => v.projectCount > 0)
    .sort((a, b) => compareVersions(`${b.versionMM}.0`, `${a.versionMM}.0`));
}

/**
 * Build an importable JSON snapshot from another version's storage.
 * Reads localStorage (per-project metadata) and IndexedDB (module states).
 * @param {string} versionMM - e.g. '0.1' or '0.2'
 * @returns {Promise<object>} export-shaped object (multi-project)
 */
export async function buildSnapshotFromVersion(versionMM) {
  const legacy = versionMM === '0.1' && !localStorage.getItem(`dmike_v0.1_projects`);
  const lsPrefix = legacy ? 'dmike_' : `dmike_v${versionMM}_`;
  const dbName = legacy ? 'dmike' : `dmike_v${versionMM}`;

  const settings = _readJSON(`${lsPrefix}settings`, {});
  const projectsList = _readJSON(`${lsPrefix}projects`, []);

  const moduleStatesByProject = await _readModuleStatesFromDB(dbName);

  const projects = projectsList.map(proj => {
    const p = `${lsPrefix}p_${proj.id}_`;
    const projectMeta = _readJSON(`${p}projectMeta`, { name: proj.name });
    const phases = _readJSON(`${p}phases`, {});
    const phaseAchievement = _readJSON(`${p}phaseAchievement`, {});
    // History was only persisted from v0.3 on — older versions yield {} here.
    const phaseAchievementHistory = _readJSON(`${p}phaseAchievementHistory`, {});
    const dashboard = _readJSON(`${p}dashboard`, null);
    const moduleStates = moduleStatesByProject.get(proj.id) || {};

    return {
      id: proj.id,
      status: proj.status || 'active',
      version: `${versionMM}.0`,
      projectMeta,
      phases,
      phaseAchievement,
      phaseAchievementHistory,
      dashboard,
      moduleStates,
    };
  });

  return {
    appVersion: `${versionMM}.0`,
    exportedAt: new Date().toISOString(),
    settings,
    projects,
  };
}

/**
 * End-to-end takeover: build snapshot from another version, push it
 * through importAllJSON which runs the migration chain.
 * @param {string} versionMM
 * @param {import('./state-manager.js').StateManager} stateManager
 */
export async function importFromVersion(versionMM, stateManager) {
  const snapshot = await buildSnapshotFromVersion(versionMM);
  await stateManager.importAllJSON(JSON.stringify(snapshot));
}

// ─── Internal ─────────────────────────────────────────────────

function _readJSON(key, fallback) {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

/**
 * Read all module states from another version's IndexedDB.
 * Returns Map<projectId, { instanceId: state }>.
 *
 * If the DB doesn't exist or has no expected store, returns an empty map.
 * Never creates a new DB as a side-effect.
 * @param {string} dbName
 * @returns {Promise<Map<string, object>>}
 */
async function _readModuleStatesFromDB(dbName) {
  const result = new Map();

  // Skip if we know the DB doesn't exist (modern browsers).
  if (typeof indexedDB.databases === 'function') {
    try {
      const list = await indexedDB.databases();
      if (!list.some(d => d.name === dbName)) return result;
    } catch { /* fall through and try to open */ }
  }

  return new Promise((resolve) => {
    let createdNew = false;
    const openReq = indexedDB.open(dbName);
    openReq.onupgradeneeded = () => { createdNew = true; };
    openReq.onerror = () => resolve(result);
    openReq.onsuccess = () => {
      const db = openReq.result;
      if (createdNew || !db.objectStoreNames.contains('moduleStates')) {
        db.close();
        // If we accidentally created an empty DB, drop it.
        if (createdNew) indexedDB.deleteDatabase(dbName);
        resolve(result);
        return;
      }
      const tx = db.transaction('moduleStates', 'readonly');
      const cursorReq = tx.objectStore('moduleStates').openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) { db.close(); resolve(result); return; }
        const key = String(cursor.key);
        const sep = key.indexOf('::');
        if (sep > 0) {
          const projectId = key.slice(0, sep);
          const instanceId = key.slice(sep + 2);
          if (!result.has(projectId)) result.set(projectId, {});
          result.get(projectId)[instanceId] = cursor.value;
        }
        cursor.continue();
      };
      cursorReq.onerror = () => { db.close(); resolve(result); };
    };
  });
}
