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
 * Summarise what loading a scenario into the current project would do.
 * Feeds the confirmation dialog — performs no side effects.
 *
 * @param {object} args
 * @param {object} args.scenario
 * @param {object} args.examplesRegistry
 * @param {string|null} [args.activeModuleId] module id of the currently open module
 * @returns {{ total: number, overwritesModuleId: string|null, newCount: number }}
 */
export function describeScenario({ scenario, examplesRegistry, activeModuleId = null }) {
  const items = scenario?.items ?? [];
  let overwritesModuleId = null;
  let newCount = 0;
  for (const item of items) {
    const { moduleId } = resolveItem(item, examplesRegistry);
    if (activeModuleId && moduleId === activeModuleId && !overwritesModuleId) {
      overwritesModuleId = moduleId;
    } else {
      newCount += 1;
    }
  }
  return { total: items.length, overwritesModuleId, newCount };
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
 * @param {string|null} [args.activeInstanceId] instance to overwrite instead of creating
 * @param {string|null} [args.activeModuleId]   module id of that instance
 * @param {function} [args.__createInstance]    seam for tests
 * @returns {Promise<{ loaded: string[], failed: {exampleId: string, error: string}[], worksheets: number }>}
 */
export async function loadScenario({
  scenario, examplesRegistry, moduleRegistry, stateManager, eventBus, workspace,
  activeInstanceId = null, activeModuleId = null, __createInstance = null,
}) {
  const items = scenario?.items ?? [];
  const loaded = [];
  const failed = [];
  const worksheetPool = new Map();
  const worksheetKeys = new Set();
  let overwriteUsed = false;

  const makeInstance = __createInstance
    ? (moduleId) => __createInstance(moduleId)
    : (moduleId) => createInstance(
      stateManager, moduleRegistry, eventBus, moduleId, moduleRegistry.get(moduleId), { silent: true },
    );

  for (const [i, item] of items.entries()) {
    const { exampleId, moduleId, meta } = resolveItem(item, examplesRegistry);
    eventBus?.emit?.('scenario:progress', {
      index: i + 1, total: items.length, exampleId, moduleId,
      title: meta?.title ?? null,
    });

    if (!moduleId) {
      failed.push({ exampleId, error: 'no module for example' });
      continue;
    }

    let instance = null;
    let instanceId = null;
    try {
      const payload = await examplesRegistry.load(exampleId);
      if (payload.worksheetKey) worksheetKeys.add(payload.worksheetKey);

      const reuseActive = !overwriteUsed && activeInstanceId && moduleId === activeModuleId;
      instanceId = reuseActive ? activeInstanceId : makeInstance(moduleId);
      if (reuseActive) overwriteUsed = true;

      instance = await workspace.instantiateDetached(instanceId, moduleId, {
        worksheetPool,
        worksheetKey: payload.worksheetKey ?? null,
      });
      if (typeof instance?.loadExample !== 'function') {
        failed.push({ exampleId, error: 'module has no loadExample' });
        continue;
      }
      await instance.loadExample(payload);
      loaded.push(exampleId);
    } catch (err) {
      failed.push({ exampleId, error: err.message });
    } finally {
      if (instance) await workspace.disposeDetached(instanceId, instance);
    }
  }

  return { loaded, failed, worksheets: worksheetKeys.size };
}
