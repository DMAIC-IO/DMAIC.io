/**
 * D.Mike — Models Store (models-store.js)
 *
 * Project-central store for trained regression models. Models are persisted as
 * named resources under `state.models[id]` so that the response-optimization
 * module can later reference them by id, independent of which Regression module
 * instance produced them.
 *
 * Schema follows V0.4-DOE-REGRESSION-OPTIMIERUNG §3:
 *
 *   state.models[id] = {
 *     id, name, createdAt, updatedAt,
 *     experimentId,                    // null for ad-hoc models
 *     responseSpec: {
 *       sourceColumn,                  // worksheet column id (or `column:name`)
 *       transform: 'identity'|'mean'|'lnvar'|'log'|'sqrt',
 *       aggregateOver: number[][]|null // replicate groups (row indices)
 *     },
 *     termSet:    string[],            // ['1','X1','X2','X1*X2','X1^2', ...]
 *     coef, vcov, sigma2, df, rSqAdj, lofPValue,
 *     factorSpec: [{name, low, high, unit?}],
 *     dataSnapshot: { X, y, factorSpec, termSet, trainedAt, sourceFingerprint },
 *     dataHash,                        // hash of (X, y)
 *     createdFromInstanceId            // module instance that wrote the model
 *   }
 *
 * The store is **stateless** — every public function takes a `stateManager`
 * and reads/writes `state.models` on it. There is no in-memory cache: callers
 * always see the current state.
 */

// ─── Hashing ──────────────────────────────────────────────────────

/**
 * Deterministic 32-bit FNV-1a hash over the JSON serialization of (X, y).
 * Returned as an 8-char zero-padded hex string. Sufficient to detect data
 * drift; not a cryptographic hash (no collision-resistance guarantees).
 *
 * @param {number[][]} X - Design matrix as fed into OLS (after model expansion).
 * @param {number[]}   y - Response vector.
 * @returns {string} 8-char hex hash
 */
export function computeDataHash(X, y) {
  const text = JSON.stringify({ X, y });
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ─── Persistence ──────────────────────────────────────────────────

/**
 * Insert or update a model record. If `record.id` is missing, a new uuid is
 * generated and returned. Otherwise the existing entry under that id is
 * overwritten and `updatedAt` is bumped.
 *
 * @param {object} stateManager - app state manager (has get/set)
 * @param {object} record - model record (see schema)
 * @returns {string} model id
 */
export function saveModel(stateManager, record) {
  const all = stateManager.get('models') ?? {};
  const id = record.id ?? (typeof crypto !== 'undefined' ? crypto.randomUUID() : `model_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const now = new Date().toISOString();
  const isNew = !(id in all);
  const next = {
    ...all,
    [id]: {
      ...record,
      id,
      createdAt: isNew ? now : (all[id].createdAt ?? now),
      updatedAt: now,
    },
  };
  stateManager.set('models', next);
  return id;
}

/** Read one model by id. Returns `null` if not present. */
export function getModel(stateManager, id) {
  const all = stateManager.get('models') ?? {};
  return all[id] ?? null;
}

/**
 * List all models, optionally filtered by experimentId. Result is ordered
 * by `updatedAt` descending so the freshest model surfaces first.
 *
 * @param {object} stateManager
 * @param {{experimentId?: string|null}} [filter]
 * @returns {object[]} model records
 */
export function listModels(stateManager, filter = {}) {
  const all = stateManager.get('models') ?? {};
  let arr = Object.values(all);
  if ('experimentId' in filter) {
    arr = arr.filter(m => m.experimentId === filter.experimentId);
  }
  arr.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return arr;
}

/** Delete one model by id. No-op if missing. */
export function deleteModel(stateManager, id) {
  const all = stateManager.get('models') ?? {};
  if (!(id in all)) return;
  const next = { ...all };
  delete next[id];
  stateManager.set('models', next);
}

// ─── Freshness ────────────────────────────────────────────────────

/**
 * Compare a stored model's training snapshot against the data currently
 * available in the worksheet. Three states matter for the UI badges:
 *
 *   'fresh'  — dataHash matches; the model and the data are in sync.
 *   'stale'  — source still exists but produces different (X, y) than at training time.
 *   'orphan' — source no longer exists (column or experiment was deleted).
 *
 * `sourceProbe` is a callback the caller provides because the store does not
 * read from the worksheet directly. It receives the model's
 * `responseSpec.sourceColumn` and the model's `experimentId` and must return
 * either `null` (source gone) or the current `(X, y)` arrays.
 *
 * @param {object} model
 * @param {(sourceColumn: string, experimentId: string|null) => ({X: number[][], y: number[]} | null)} sourceProbe
 * @returns {'fresh'|'stale'|'orphan'}
 */
export function getModelFreshness(model, sourceProbe) {
  if (!model || !model.dataHash) return 'orphan';
  const probe = sourceProbe(model.responseSpec?.sourceColumn, model.experimentId ?? null);
  if (probe == null) return 'orphan';
  const currentHash = computeDataHash(probe.X, probe.y);
  return currentHash === model.dataHash ? 'fresh' : 'stale';
}

// ─── Snapshot helper ──────────────────────────────────────────────

/**
 * Compose the `dataSnapshot` block for a model. Wraps the raw training inputs
 * with metadata that makes the snapshot self-contained: anyone can reproduce
 * the OLS fit from the snapshot alone, even after the source data changes.
 *
 * @param {{X: number[][], y: number[], factorSpec: object[], termSet: string[],
 *          experimentId?: string|null, responseColumn?: string|null,
 *          workbookHash?: string|null}} args
 * @returns {object} dataSnapshot
 */
export function buildDataSnapshot(args) {
  return {
    X: args.X.map(row => [...row]),
    y: [...args.y],
    factorSpec: args.factorSpec.map(f => ({ ...f })),
    termSet: [...args.termSet],
    trainedAt: new Date().toISOString(),
    sourceFingerprint: {
      experimentId:   args.experimentId   ?? null,
      responseColumn: args.responseColumn ?? null,
      workbookHash:   args.workbookHash   ?? computeDataHash(args.X, args.y),
    },
  };
}
