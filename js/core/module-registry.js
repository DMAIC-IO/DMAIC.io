/**
 * D.Mike — Module Registry (module-registry.js)
 * Central hub for all available modules.
 * Reads the module catalog (catalog.generated.js) at startup, lazy-loads module JS on demand.
 * Module in neuer Form (`form: 'module'`) lassen vor dem ersten Laden ihre
 * Bestandteile über ModuleResources nachladen.
 *
 * Cycle awareness (v0.3): each module declares per-cycle phase placement
 * via `cycles[<cycleId>] = { phase, allowedPhases? }`. Modules with
 * `phase: 'data'` are cycle-independent (Daten-Bereich) and don't carry
 * a `cycles` map. Legacy entries without `cycles` are normalized to a
 * DMAIC-only mapping by the `register()` shim.
 */

import { DEFAULT_CYCLE } from './cycles/cycles.js';
import { h } from './dom.js';
import { icon } from './icon.js';
import { loadChunk } from './chunks.js';

export class ModuleRegistry {
  constructor() {
    /** @type {Map<string, object>} moduleId → definition */
    this._registry = new Map();
    /** @type {string} active cycle (drives `getByPhase` and `extras` filtering) */
    this._activeCycle = DEFAULT_CYCLE;
    /** @type {{ prepare(id: string): Promise<void> } | null} Lader für Module in neuer Form */
    this._resources = null;
  }

  /**
   * Den Lader für Bestandteile von Modulen in neuer Form setzen
   * (ModuleResources, js/core/module-resources.js). Der Kernel ruft das beim Start.
   * @param {{ prepare(id: string): Promise<void> }} resources
   */
  setResources(resources) {
    this._resources = resources;
  }

  /**
   * Templates, CSS und UI-Texte eines Moduls in neuer Form laden; für die
   * alte Form nichts (ihre Bestandteile stecken in index.html und den Bündeln).
   * @param {object} definition
   * @returns {Promise<void>}
   */
  _prepare(definition) {
    if (definition.form !== 'module') return Promise.resolve();
    if (!this._resources) {
      return Promise.reject(new Error(`[ModuleRegistry] ${definition.id}: Modul in neuer Form, aber kein Lader für Bestandteile`));
    }
    return this._resources.prepare(definition.id);
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
    const normalized = { ...definition, _loaded: null, _tile: null, _redact: null };
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
   * Whether a module declares a dashboard tile (`loadTile` in the manifest).
   * Does not load anything.
   * @param {string} moduleId
   * @returns {boolean}
   */
  hasTile(moduleId) {
    return typeof this._registry.get(moduleId)?.loadTile === 'function';
  }

  /**
   * Lazily load a module's dashboard tile file and return its default export.
   * Goes through loadChunk, so a failed import shows the shared chunk-error
   * toast and rejects with ChunkLoadError; failures are not cached.
   * @param {string} moduleId
   * @returns {Promise<object|undefined>} undefined when the module has no tile
   */
  async loadTile(moduleId) {
    const definition = this._registry.get(moduleId);
    if (!definition || typeof definition.loadTile !== 'function') return undefined;
    if (!definition._tile) {
      await loadChunk(() => this._prepare(definition));
      const mod = await loadChunk(definition.loadTile);
      definition._tile = mod.default;
    }
    return definition._tile;
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
   * Den Code eines Moduls laden (einmal) und seinen Default-Export liefern —
   * das `createModule`-Objekt. Hängt nichts ein; Agentenfläche und
   * Dashboard laden so, ohne eine Instanz zu bauen.
   * @param {string} moduleId
   * @returns {Promise<object>}
   */
  async loadModule(moduleId) {
    const definition = this._registry.get(moduleId);
    if (!definition) throw new Error(`[ModuleRegistry] Unknown module: "${moduleId}"`);
    // Lazy-load the module JS (only once).
    // Call definition.load() — a () => import(...) arrow defined in manifest.js,
    // so the path resolves relative to manifest.js, not to this file.
    if (!definition._loaded) {
      const [module] = await Promise.all([definition.load(), this._prepare(definition)]);
      definition._loaded = module.default;
    }
    return definition._loaded;
  }

  /**
   * Den Haken `redact` eines Moduls laden (Deskriptor-Feld, `core/redact.js`).
   * Einmal je Modul; ohne Haken oder für unbekannte Ids `null`.
   * @param {string} moduleId
   * @returns {Promise<((state: any) => any)|null>}
   * @throws {Error} wenn das Ziel keine Default-Funktion exportiert
   */
  async loadRedactor(moduleId) {
    const definition = this._registry.get(moduleId);
    if (typeof definition?.redact !== 'function') return null;
    if (!definition._redact) {
      const fn = (await definition.redact())?.default;
      if (typeof fn !== 'function') throw new Error(`[ModuleRegistry] ${moduleId}: redact muss eine Funktion exportieren (default)`);
      definition._redact = fn;
    }
    return definition._redact;
  }

  /**
   * Alle erklärten Haken `redact` laden — beim Start, damit der synchrone
   * Projekt-Export (`StateManager.exportJSON`) sie hat. Wirft nie: ein Haken,
   * der nicht lädt, wird gemeldet und bleibt ungeladen — der Start läuft
   * weiter, `redactorOf` wirft für dieses Modul (kein Klartext-Export), und
   * der nächste Aufruf versucht es erneut.
   * @returns {Promise<void>}
   */
  async loadRedactors() {
    const ids = [...this._registry.keys()];
    const results = await Promise.allSettled(ids.map((id) => this.loadRedactor(id)));
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[ModuleRegistry] ${ids[i]}: redact nicht geladen`, r.reason);
    });
  }

  /**
   * Der geladene Haken `redact`, synchron. `null` ohne Haken.
   * @param {string} moduleId
   * @returns {((state: any) => any)|null}
   * @throws {Error} wenn der Haken erklärt, aber nicht geladen ist (lieber kein Export als Klartext)
   */
  redactorOf(moduleId) {
    const definition = this._registry.get(moduleId);
    if (typeof definition?.redact !== 'function') return null;
    if (!definition._redact) throw new Error(`[ModuleRegistry] ${moduleId}: redact nicht geladen`);
    return definition._redact;
  }

  /**
   * Das bereits geladene `createModule`-Objekt, synchron. `null`, solange das
   * Modul nicht geladen ist, und für unbekannte Ids.
   * @param {string} moduleId
   * @returns {object|null}
   */
  getLoaded(moduleId) {
    return this._registry.get(moduleId)?._loaded ?? null;
  }

  /**
   * Lazy-load a module, call init(), and return the instance.
   * @param {string} moduleId
   * @param {HTMLElement} container
   * @param {object} context
   * @returns {Promise<object>} module instance
   */
  async instantiate(moduleId, container, context) {
    let moduleExport;
    try {
      moduleExport = await this.loadModule(moduleId);
    } catch (err) {
      console.error(`[ModuleRegistry] Failed to load module "${moduleId}":`, err);
      this._renderErrorCard(container, moduleId, err);
      throw err;
    }

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
        h('div', { class: 'module-error__icon' }, icon('status.warning')),
        h('div', { class: 'module-error__title' }, 'Module failed to load'),
        h('div', { class: 'module-error__message' }, `${moduleId}: ${err.message}`),
      ),
    );
  }
}
