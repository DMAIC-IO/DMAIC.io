/**
 * D.Mike — IndexedDB Key-Value Store (idb-store.js)
 *
 * Minimal async wrapper around IndexedDB for module states. Used as the
 * backing store behind StateManager's in-memory cache (write-behind).
 *
 * Layout:
 *   DB:    `dmike_v${MAJOR.MINOR}`  (one DB per app MINOR — isolates versions)
 *   Store: 'moduleStates'
 *   Key:   `${projectId}::${instanceId}`  (string)
 *   Value: arbitrary JSON-serialisable module state object
 *
 * The StateManager public API stays synchronous for callers; all IDB
 * operations here return Promises and are used internally for bulk
 * load/flush/migration.
 */

import { VERSION } from './version.js';
import { stripPatch } from './version-utils.js';

const DB_NAME = `dmike_v${stripPatch(VERSION)}`;
const DB_VERSION = 1;
const STORE = 'moduleStates';
const KEY_SEP = '::';

let _dbPromise = null;

/**
 * Open (and lazily create) the D.Mike IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
  return _dbPromise;
}

/**
 * Build the compound key used in the object store.
 * @param {string} projectId
 * @param {string} instanceId
 * @returns {string}
 */
function _key(projectId, instanceId) {
  return `${projectId}${KEY_SEP}${instanceId}`;
}

/**
 * Split a compound key back into [projectId, instanceId].
 * @param {string} key
 * @returns {[string, string] | null}
 */
function _splitKey(key) {
  const idx = key.indexOf(KEY_SEP);
  if (idx < 0) return null;
  return [key.slice(0, idx), key.slice(idx + KEY_SEP.length)];
}

/**
 * Wrap an IDBRequest in a Promise.
 * @param {IDBRequest} req
 * @returns {Promise<any>}
 */
function _wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Read a single module state.
 * @param {string} projectId
 * @param {string} instanceId
 * @returns {Promise<object | undefined>}
 */
export async function idbGet(projectId, instanceId) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readonly');
  return _wrap(tx.objectStore(STORE).get(_key(projectId, instanceId)));
}

/**
 * Write a single module state.
 * @param {string} projectId
 * @param {string} instanceId
 * @param {object} state
 * @returns {Promise<void>}
 */
export async function idbPut(projectId, instanceId, state) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(state, _key(projectId, instanceId));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Delete a single module state.
 * @param {string} projectId
 * @param {string} instanceId
 * @returns {Promise<void>}
 */
export async function idbDelete(projectId, instanceId) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(_key(projectId, instanceId));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Apply a batch of writes and deletes in a single transaction.
 * @param {{ puts?: Map<string, object> | Array<[string, object]>, deletes?: Iterable<string> }} batch
 *   puts: instanceId → state
 *   deletes: iterable of instanceId
 * @param {string} projectId
 * @returns {Promise<void>}
 */
export async function idbBatch(projectId, batch) {
  const puts = batch.puts instanceof Map
    ? Array.from(batch.puts.entries())
    : (Array.isArray(batch.puts) ? batch.puts : []);
  const deletes = batch.deletes ? Array.from(batch.deletes) : [];

  if (puts.length === 0 && deletes.length === 0) return;

  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  for (const [instanceId, state] of puts) {
    store.put(state, _key(projectId, instanceId));
  }
  for (const instanceId of deletes) {
    store.delete(_key(projectId, instanceId));
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Load every module state belonging to a project.
 * @param {string} projectId
 * @returns {Promise<Map<string, object>>} instanceId → state
 */
export async function idbGetAllForProject(projectId) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const prefix = `${projectId}${KEY_SEP}`;
  const upper = prefix + '\uffff';
  const range = IDBKeyRange.bound(prefix, upper, false, false);

  const out = new Map();
  return new Promise((resolve, reject) => {
    const req = store.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(out); return; }
      const split = _splitKey(String(cursor.key));
      if (split) out.set(split[1], cursor.value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete all module states belonging to a project.
 * @param {string} projectId
 * @returns {Promise<void>}
 */
export async function idbDeleteAllForProject(projectId) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const prefix = `${projectId}${KEY_SEP}`;
  const upper = prefix + '\uffff';
  const range = IDBKeyRange.bound(prefix, upper, false, false);
  store.delete(range);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
