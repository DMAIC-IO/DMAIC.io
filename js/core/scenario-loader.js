/**
 * D.Mike — Scenario loader (scenario-loader.js)
 *
 * Loads a curated set of module examples ("scenario") into the active project.
 * DOM-free orchestration: instances are created through instance-ops and mounted
 * headlessly via the injected workspace, exactly like the Dev-Tools seeder.
 *
 * Data collections are deduplicated: every item that resolves to the same
 * worksheet file shares one provisioned Datensammlung, via a pool handed to the
 * module context (see provisionWorksheet in examples-registry.js). The pool
 * caches by worksheetKey alone — safe because worksheetKey IS the source file
 * path, so every item sharing a key fetches the identical worksheet payload
 * (see provisionWorksheet's own doc comment for the cache-hit trade-off).
 */

import { parseScenarioItem } from './examples-registry.js';
import { createInstance } from './router/instance-ops.js';

/**
 * Resolve the module a scenario item targets.
 * @param {string} item
 * @param {object} examplesRegistry
 * @returns {{ exampleId: string, moduleId: string|null, meta: object|undefined }}
 */
function resolveItem(item, examplesRegistry) {
  const { exampleId, moduleId } = parseScenarioItem(item);
  const meta = examplesRegistry.get(exampleId);
  return { exampleId, moduleId: moduleId || meta?.modules?.[0] || null, meta };
}

/**
 * Remove an instance the loader itself just created after it turns out the
 * item failed (mount error, no `loadExample`, or a thrown `loadExample`).
 * Mirrors the scan `removeProvisionedWorksheet` uses in examples-registry.js,
 * kept local here since it removes an arbitrary module instance, not
 * specifically a worksheet. Every instance the loader mounts is one it created
 * itself, so there is never a pre-existing instance to protect here.
 *
 * @param {object} stateManager
 * @param {object} eventBus
 * @param {string|null} instanceId
 * @returns {void}
 */
function removeFailedInstance(stateManager, eventBus, instanceId) {
  if (!instanceId) return;
  const phases = stateManager.get('phases') || {};
  for (const phaseId of Object.keys(phases)) {
    const list = stateManager.get(`phases.${phaseId}`) ?? [];
    const idx = list.findIndex(i => i.instanceId === instanceId);
    if (idx === -1) continue;
    const next = list.slice(0, idx).concat(list.slice(idx + 1));
    stateManager.set(`phases.${phaseId}`, next);
    stateManager.removeModuleState?.(instanceId);
    eventBus?.emit?.('module:removed', { instanceId, phase: phaseId, silent: true });
    return;
  }
}

/**
 * Summarise what loading a scenario into the current project would do.
 * Feeds the confirmation dialog — performs no side effects.
 *
 * Loading a scenario is purely additive: every item gets its own fresh module
 * instance, nothing the user already has is overwritten. `newCount` therefore
 * always equals `total`; it stays a separate field so the dialog reads as a
 * summary rather than a bare item count.
 *
 * @param {object} args
 * @param {object} args.scenario
 * @returns {{ total: number, newCount: number }}
 */
export function describeScenario({ scenario }) {
  const total = scenario?.items?.length ?? 0;
  return { total, newCount: total };
}

/**
 * Count the distinct data collections a scenario will provision. Loads the
 * payload envelopes only (no mounting) and counts distinct worksheet keys.
 *
 * @param {{ scenario: object, examplesRegistry: object }} args
 * @returns {Promise<number>}
 */
export async function countScenarioWorksheets({ scenario, examplesRegistry }) {
  const keys = new Set();
  for (const item of scenario?.items ?? []) {
    const { exampleId } = parseScenarioItem(item);
    try {
      const payload = await examplesRegistry.load(exampleId);
      if (payload.worksheetKey) keys.add(payload.worksheetKey);
    } catch { /* unreadable example — counted as no worksheet */ }
  }
  return keys.size;
}

/**
 * Load every example of a scenario into the active project.
 *
 * @param {object} args
 * @param {object} args.scenario           catalog entry with `items`
 * @param {object} args.examplesRegistry
 * @param {object} args.moduleRegistry
 * @param {object} args.stateManager
 * @param {object} args.eventBus
 * @param {object} args.workspace          exposes instantiateDetached/disposeDetached
 * @param {function} [args.__createInstance]    seam for tests
 * @returns {Promise<{ loaded: string[], failed: {exampleId: string, error: string}[], worksheets: number }>}
 */
export async function loadScenario({
  scenario, examplesRegistry, moduleRegistry, stateManager, eventBus, workspace,
  __createInstance = null,
}) {
  const items = scenario?.items ?? [];
  const loaded = [];
  const failed = [];
  const worksheetPool = new Map();

  const makeInstance = __createInstance
    ? (moduleId) => __createInstance(moduleId)
    : (moduleId) => createInstance(
      stateManager, moduleRegistry, eventBus, moduleId, moduleRegistry.get(moduleId), { silent: true },
    );

  /**
   * Emit without ever letting a listener abort the run — one broken UI
   * subscriber must not cost the user the rest of the scenario.
   * @param {string} name  @param {object} payload  @returns {void}
   */
  const emitSafe = (name, payload) => {
    try {
      eventBus?.emit?.(name, payload);
    } catch (err) {
      console.warn('[scenario-loader] listener threw on', name, err);
    }
  };

  for (const [i, item] of items.entries()) {
    const { exampleId, moduleId, meta } = resolveItem(item, examplesRegistry);
    emitSafe('scenario:progress', {
      index: i + 1, total: items.length, exampleId, moduleId,
      title: meta?.title ?? null,
    });

    // Announced BEFORE the attempt (progress) and again AFTER it resolves
    // (item-done), so a UI that lists items can mark a row retroactively. The
    // outer try/finally below guarantees the second event on EVERY exit path
    // of this item — including each `continue` — because `continue` runs the
    // finally block. A row that never hears back would sit pending forever.
    const failedBefore = failed.length;
    try {
      if (!moduleId) {
        failed.push({ exampleId, moduleId: null, error: 'no module for example' });
        continue;
      }

      let instance = null;
      let instanceId = null;
      try {
        const payload = await examplesRegistry.load(exampleId);

        // Always a FRESH instance — never a live, mounted one. A detached mount
        // sharing an instanceId with a mounted instance re-registers that
        // instance's Alpine.data factory (template-module.js derives the
        // component name from context.instanceId) and, worse, the mounted copy's
        // stale model is written back over the freshly loaded state by
        // Workspace._persistAllModuleStates() on the next phase/tab switch.
        // Scenario loading is therefore purely additive: nothing the user
        // already has open is touched.
        instanceId = makeInstance(moduleId);

        instance = await workspace.instantiateDetached(instanceId, moduleId, {
          worksheetPool,
          worksheetKey: payload.worksheetKey ?? null,
        });

        // instantiateDetached swallows its own mount errors and returns null
        // (see workspace.js) — distinguish that from a mounted instance that
        // genuinely has no loadExample, otherwise a mount crash is misreported.
        if (!instance) {
          failed.push({ exampleId, moduleId, error: 'module failed to mount' });
          removeFailedInstance(stateManager, eventBus, instanceId);
          continue;
        }
        if (typeof instance.loadExample !== 'function') {
          failed.push({ exampleId, moduleId, error: 'module has no loadExample' });
          removeFailedInstance(stateManager, eventBus, instanceId);
          continue;
        }

        await instance.loadExample(payload);
        loaded.push(exampleId);
      } catch (err) {
        failed.push({ exampleId, moduleId, error: err.message });
        removeFailedInstance(stateManager, eventBus, instanceId);
      } finally {
        if (instance) await workspace.disposeDetached(instanceId, instance);
      }
    } finally {
      emitSafe('scenario:item-done', {
        index: i + 1, total: items.length, exampleId, moduleId,
        ok: failed.length === failedBefore,
      });
    }
  }

  // worksheetPool is populated by the modules themselves, via
  // provisionWorksheet(ctx, wsState) reading ctx.worksheetPool/worksheetKey
  // (examples-registry.js) — so its size reflects Datensammlungen that were
  // actually provisioned, not merely referenced by a loaded payload.
  return { loaded, failed, worksheets: worksheetPool.size };
}
