/**
 * D.Mike — Dev-Tools seeder (dev-tools-seeder.js)
 *
 * Pure orchestration for the Settings → Dev-Tools "Alle Module + Beispiele
 * laden" button. DOM-free except for the calls into the injected `workspace`
 * (which owns the detached mount). Testable with fake registries/workspace.
 */

import { findExistingInstance, createInstance } from './router/instance-ops.js';

/**
 * Add every not-yet-present module to its derived phase and, if the module has
 * a catalog example, headlessly load the FIRST one into a detached instance.
 *
 * Idempotent: modules that already have an instance are skipped (no second
 * instance, no example reload). A failing `loadExample` for one module does not
 * abort the run — it is caught per module and the detached instance is always
 * disposed via `finally`.
 *
 * @param {object}   deps
 * @param {object}   deps.moduleRegistry   — exposes getAll(), getActiveCycle()
 * @param {object}   deps.examplesRegistry — exposes getForModule(id), load(id)
 * @param {object}   deps.stateManager
 * @param {object}   deps.eventBus
 * @param {object}   deps.workspace        — exposes instantiateDetached(), disposeDetached()
 * @returns {Promise<{ added: string[], examplesLoaded: string[], skipped: string[] }>}
 */
export async function seedAllModules({
  moduleRegistry, examplesRegistry, stateManager, eventBus, workspace,
}) {
  const added = [];
  const examplesLoaded = [];
  const skipped = [];

  for (const def of moduleRegistry.getAll()) {
    if (findExistingInstance(stateManager, def.id)) {
      skipped.push(def.id);
      continue;
    }

    const instanceId = createInstance(stateManager, moduleRegistry, eventBus, def.id, def, { silent: true });
    added.push(def.id);

    const ex = examplesRegistry.getForModule(def.id)[0];
    if (!ex) continue;                                 // module stays empty

    const instance = await workspace.instantiateDetached(instanceId, def.id);
    if (typeof instance?.loadExample !== 'function') {
      await workspace.disposeDetached(instanceId, instance);
      continue;
    }
    try {
      await instance.loadExample(await examplesRegistry.load(ex.id));
      examplesLoaded.push(def.id);
    } catch (err) {
      console.warn('[dev-tools-seeder] loadExample failed', def.id, err);
    } finally {
      await workspace.disposeDetached(instanceId, instance);
    }
  }

  return { added, examplesLoaded, skipped };
}
