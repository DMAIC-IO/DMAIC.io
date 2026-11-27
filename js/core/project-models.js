/**
 * D.Mike — Project models migration (project-models.js)
 *
 * Moves the legacy project keys `models`, `optimizations` and `experiments`
 * into the module instances that own them (rule D5 "data with the owner"):
 *
 *   - A model record goes to the `regression` / `glm-regression` instance that
 *     wrote it (`createdFromInstanceId`, `savedModelId`) as the raw state key
 *     `savedModel`. The module migration `'0→1.0'` turns it into
 *     `modelRecord`.
 *   - A model without owner (owner deleted, or the owner saved another model
 *     since) becomes a new instance of its family with the model name as tab
 *     name. Its id is derived from the record — never `uid()`: `load()` runs
 *     the migration again on every start until the project is saved.
 *   - An optimization referenced by a `response-optimization` instance
 *     (`optId`) goes into that instance as `optimization: { modelRefs, result }`
 *     — the only parts the legacy reader used.
 *   - The three project keys are dropped (`experiments` has had no reader since
 *     F1.12).
 *
 * Pure and idempotent: the input document is never mutated; a second run on
 * the result (or on a document where the owners already carry their models)
 * reports `changed: []`.
 */

const OWNER_MODULES = new Set(['regression', 'glm-regression']);
const READER_MODULE = 'response-optimization';
const LEGACY_KEYS = ['models', 'optimizations', 'experiments'];

/**
 * @typedef {{ instanceId: string, moduleId: string, order?: number, state?: object, customName?: string }} PhaseEntry
 * @typedef {{ phases?: Object<string, PhaseEntry[]>, moduleStates?: Object<string, object>,
 *             models?: Object<string, object>|object[], optimizations?: Object<string, object>,
 *             experiments?: unknown }} ProjectDocLike
 * @typedef {{ doc: ProjectDocLike, changed: string[], phasesChanged: boolean }} AdoptResult
 */

/**
 * True when the document still carries one of the legacy project keys
 * (`models`, `optimizations`, `experiments`).
 * @param {unknown} doc
 * @returns {boolean}
 */
export function hasLegacyProjectModels(doc) {
  return !!doc && typeof doc === 'object' && LEGACY_KEYS.some(k => k in /** @type {object} */ (doc));
}

/**
 * Move legacy project models and optimizations into their owner instances.
 *
 * @param {ProjectDocLike} doc  Project document (`phases`, `moduleStates`, legacy keys).
 * @param {{ phaseFor?: (moduleId: string) => (string|null|undefined) }} [opts]
 *   `phaseFor` names the default phase of a module in the active cycle; used for
 *   an orphan model that no optimization points at.
 * @returns {AdoptResult} The new document (same object when no legacy key is
 *   present), the instance ids whose state changed or was created, and whether
 *   `phases` gained an entry.
 */
export function adoptProjectModels(doc, { phaseFor } = {}) {
  if (!hasLegacyProjectModels(doc)) {
    return { doc, changed: [], phasesChanged: false };
  }

  const phases = clonePhases(doc.phases);
  const moduleStates = { ...(doc.moduleStates || {}) };
  /** @type {Set<string>} */
  const changed = new Set();
  let phasesChanged = false;

  const entries = () => Object.entries(phases).flatMap(([phase, list]) =>
    (Array.isArray(list) ? list : []).map(e => ({ phase, entry: e })));
  const findEntry = (id) => entries().find(x => x.entry?.instanceId === id) || null;
  const setState = (id, patch) => {
    moduleStates[id] = { ...(moduleStates[id] || {}), ...patch };
    changed.add(id);
  };

  // ── 1./2. Models → owner instance or orphan instance ─────────────
  for (const m of modelRecords(doc.models)) {
    const candidates = [m.createdFromInstanceId, orphanFallbackId(m)].filter(Boolean);
    const owner = candidates
      .map(id => findEntry(id))
      .find(x => x && OWNER_MODULES.has(x.entry.moduleId)
        && moduleStates[x.entry.instanceId]?.savedModelId === m.id);

    if (owner) {
      const st = moduleStates[owner.entry.instanceId];
      if (!carriesModel(st, m.id)) setState(owner.entry.instanceId, { savedModel: m });
      continue;
    }

    const moduleId = m.family ? 'glm-regression' : 'regression';
    const instanceId = m.createdFromInstanceId && !findEntry(m.createdFromInstanceId)
      ? m.createdFromInstanceId
      : orphanFallbackId(m);
    const phase = phaseOfReader(entries(), moduleStates, m.id)
      ?? phaseFor?.(moduleId)
      ?? Object.keys(phases)[0]
      ?? null;
    if (!phase) continue; // a document without any phase has nowhere to put it

    const list = Array.isArray(phases[phase]) ? phases[phase] : (phases[phase] = []);
    /** @type {PhaseEntry} */
    const record = { instanceId, moduleId, order: list.length, state: {} };
    if (m.name) record.customName = m.name;
    list.push(record);
    phasesChanged = true;
    moduleStates[instanceId] = {};
    setState(instanceId, { savedModelId: m.id, savedModelName: m.name ?? null, savedModel: m });
  }

  // ── 3. Optimizations → referencing response-optimization ─────────
  const optimizations = doc.optimizations && typeof doc.optimizations === 'object' ? doc.optimizations : {};
  for (const { entry } of entries()) {
    if (entry.moduleId !== READER_MODULE) continue;
    const st = moduleStates[entry.instanceId];
    const opt = st?.optId != null ? optimizations[st.optId] : null;
    if (!opt || st.optimization) continue;
    setState(entry.instanceId, {
      optimization: { modelRefs: Array.isArray(opt.modelRefs) ? [...opt.modelRefs] : [], result: opt.result ?? null },
    });
  }

  // ── 4. Drop the legacy keys ──────────────────────────────────────
  const out = { ...doc, phases, moduleStates };
  for (const k of LEGACY_KEYS) delete out[k];
  return { doc: out, changed: [...changed], phasesChanged };
}

/** @param {unknown} models @returns {object[]} records with an id */
function modelRecords(models) {
  if (!models || typeof models !== 'object') return [];
  const list = Array.isArray(models) ? models : Object.values(models);
  return list.filter(m => m && typeof m === 'object' && typeof m.id === 'string' && m.id);
}

/** @param {{ id: string }} m */
function orphanFallbackId(m) { return `reg-${m.id}`; }

/** True when the raw owner state already carries the record of `id`. */
function carriesModel(st, id) {
  if (st?.savedModel && st.savedModel.id === id) return true;
  return !!(st?.modelRecord && st.savedModelId === id);
}

/** Phase of the first response-optimization instance whose `specs` name `modelId`. */
function phaseOfReader(entries, moduleStates, modelId) {
  const hit = entries.find(({ entry }) => entry.moduleId === READER_MODULE
    && moduleStates[entry.instanceId]?.specs
    && Object.hasOwn(moduleStates[entry.instanceId].specs, modelId));
  return hit ? hit.phase : null;
}

/** Copy the phase lists one level deep (entries are pushed, never edited). */
function clonePhases(phases) {
  const out = {};
  for (const [k, v] of Object.entries(phases || {})) out[k] = Array.isArray(v) ? [...v] : v;
  return out;
}
