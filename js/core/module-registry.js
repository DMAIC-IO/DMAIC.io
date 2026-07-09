/**
 * D.Mike — Module Registry (module-registry.js)
 * Central hub for all available modules.
 * Reads from manifest.js at startup, lazy-loads module JS on demand.
 *
 * Cycle awareness (v0.3): each module declares per-cycle phase placement
 * via `cycles[<cycleId>] = { phase, allowedPhases? }`. Modules with
 * `phase: 'data'` are cycle-independent (Daten-Bereich) and don't carry
 * a `cycles` map. Legacy entries without `cycles` are normalized to a
 * DMAIC-only mapping by the `register()` shim.
 */

import { DEFAULT_CYCLE } from './cycles/cycles.js';
import { h } from './dom.js';

export class ModuleRegistry {
  constructor() {
    /** @type {Map<string, object>} moduleId → definition */
    this._registry = new Map();
    /** @type {string} active cycle (drives `getByPhase` and `extras` filtering) */
    this._activeCycle = DEFAULT_CYCLE;
  }

  /**
   * Register a module definition (called at startup from manifest).
   *
   * Backwards-compat shim: entries without a `cycles` map and with a non-data
   * `phase` are normalized to `cycles: { [DEFAULT_CYCLE]: { phase, allowedPhases? } }`.
   * Data modules (`phase: 'data'`) stay phase-independent and never get a
   * `cycles` entry.
   *
   * @param {object} definition
   */
  register(definition) {
    if (this._registry.has(definition.id)) {
      console.warn(`[ModuleRegistry] Duplicate module id: "${definition.id}"`);
      return;
    }
    const normalized = { ...definition, _loaded: null };
    if (definition.phase !== 'data' && !definition.cycles) {
      normalized.cycles = {
        [DEFAULT_CYCLE]: {
          phase: definition.phase,
          ...(definition.allowedPhases ? { allowedPhases: definition.allowedPhases } : {}),
        },
      };
    }
    this._registry.set(definition.id, normalized);
  }

  /**
   * Get a module definition by id.
   * @param {string} moduleId
   * @returns {object|undefined}
   */
  get(moduleId) {
    return this._registry.get(moduleId);
  }

  /**
   * Lazily load and return a module's default export (the live module object,
   * incl. static descriptors like `dashboardTile`). Loads once, then caches on
   * the registry entry. Returns `undefined` for unknown ids.
   * @param {string} moduleId
   * @returns {Promise<object|undefined>}
   */
  async loadExport(moduleId) {
    const definition = this._registry.get(moduleId);
    if (!definition) return undefined;
    if (!definition._loaded) {
      const module = await definition.load();
      definition._loaded = module.default;
    }
    return definition._loaded;
  }

  /**
   * Set the active cycle. Drives which cycle's mapping `getByPhase` and the
   * `extras` bucket use. Called from app bootstrap and on `switchProject`.
   * @param {string} cycleId
   */
  setActiveCycle(cycleId) {
    this._activeCycle = cycleId || DEFAULT_CYCLE;
  }

  /**
   * @returns {string}
   */
  getActiveCycle() {
    return this._activeCycle;
  }

  /**
   * Modules attached to a phase tile within a specific cycle.
   *
   * - `phaseId === 'data'`   → all modules with `phase: 'data'` (universal,
   *                            cycle-independent).
   * - `phaseId === 'extras'` → all non-data modules without a mapping for
   *                            this cycle (catch-all bucket; see Plan §3.1).
   * - other `phaseId`        → modules whose `cycles[cycleId].phase` matches.
   *
   * @param {string} cycleId
   * @param {string} phaseId
   * @returns {object[]}
   */
  getByCycleAndPhase(cycleId, phaseId) {
    const all = [...this._registry.values()];
    if (phaseId === 'data')   return all.filter(m => m.phase === 'data');
    if (phaseId === 'extras') return all.filter(m => m.phase !== 'data' && !m.cycles?.[cycleId]);
    return all.filter(m => m.cycles?.[cycleId]?.phase === phaseId);
  }

  /**
   * Get all modules for a phase in the active cycle. Backwards-compat
   * wrapper around `getByCycleAndPhase`.
   * @param {string} phase
   * @returns {object[]}
   */
  getByPhase(phase) {
    return this.getByCycleAndPhase(this._activeCycle, phase);
  }

  /**
   * List all registered module definitions.
   * @returns {object[]}
   */
  getAll() {
    return [...this._registry.values()];
  }

  /**
   * Lazy-load a module, call init(), and return the instance.
   * @param {string} moduleId
   * @param {HTMLElement} container
   * @param {object} context
   * @returns {Promise<object>} module instance
   */
  async instantiate(moduleId, container, context) {
    const definition = this._registry.get(moduleId);
    if (!definition) throw new Error(`[ModuleRegistry] Unknown module: "${moduleId}"`);

    // Lazy-load the module JS (only once).
    // Call definition.load() — a () => import(...) arrow defined in manifest.js,
    // so the path resolves relative to manifest.js, not to this file.
    if (!definition._loaded) {
      try {
        const module = await definition.load();
        definition._loaded = module.default;
      } catch (err) {
        console.error(`[ModuleRegistry] Failed to load module "${moduleId}":`, err);
        this._renderErrorCard(container, moduleId, err);
        throw err;
      }
    }

    const moduleExport = definition._loaded;

    // Create a fresh instance object (spread to avoid shared state)
    const instance = { ...moduleExport };

    try {
      await instance.init(container, context);
    } catch (err) {
      console.error(`[ModuleRegistry] Failed to initialize module "${moduleId}":`, err);
      this._renderErrorCard(container, moduleId, err);
      throw err;
    }

    return instance;
  }

  // ─── Internal ───────────────────────────────────────────────

  _renderErrorCard(container, moduleId, err) {
    container.replaceChildren(
      h('div', { class: 'module-error' },
        h('div', { class: 'module-error__icon' }, '⚠'),
        h('div', { class: 'module-error__title' }, 'Module failed to load'),
        h('div', { class: 'module-error__message' }, `${moduleId}: ${err.message}`),
      ),
    );
  }
}
