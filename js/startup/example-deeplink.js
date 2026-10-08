/**
 * D.Mike — Example deeplink startup concern.
 * Honors three deeplink shapes:
 *   ?module=<id>                       activate the module (creating an instance if needed)
 *   ?module=<id>&example=<exampleId>   … and load that example into it
 *   ?scenario=<scenarioId>             load a whole scenario (every item gets a fresh instance)
 * `example` alone does nothing — without a module there is nothing to load it
 * into. `scenario` stands on its own and takes precedence over `module`.
 * Query parameters are stripped from the URL afterwards so a reload doesn't
 * repeat the action.
 */
import { createStartup } from '../core/create-startup.js';
import { findExistingInstance, createInstance } from '../core/router/instance-ops.js';
import { loadScenario } from '../core/scenario-loader.js';

export default createStartup({
  id: 'example-deeplink',

  shouldRun() {
    const params = new URLSearchParams(location.search);
    return Boolean(params.get('module') || params.get('example') || params.get('scenario'));
  },

  run({
    stateManager, eventBus, moduleRegistry, examplesRegistry, workspace, notify, i18n,
    __loadScenario = loadScenario,
  }) {
    const params = new URLSearchParams(location.search);
    const moduleId = params.get('module');
    const exampleId = params.get('example');
    const scenarioId = params.get('scenario');

    // Strip these params immediately so reload/back doesn't re-trigger.
    const next = new URLSearchParams(location.search);
    next.delete('module');
    next.delete('example');
    next.delete('scenario');
    const cleaned = next.toString();
    history.replaceState(null, '', location.pathname + (cleaned ? `?${cleaned}` : '') + location.hash);

    // A scenario loads as a whole and takes precedence: it brings its own
    // module instances, so activating a single module first would only add a
    // sixth, empty one next to them.
    if (scenarioId) {
      const scenario = examplesRegistry?.get(scenarioId);
      if (!scenario) {
        console.warn(`[Deeplink] Unknown scenario: ${scenarioId}`);
        notify?.(i18n.t('moduleHelp.scenarioNotFound'), 'error');
        return;
      }
      (async () => {
        try {
          const result = await __loadScenario({
            scenario, examplesRegistry, moduleRegistry, stateManager, eventBus, workspace,
          });
          if (result.failed.length) {
            console.warn('[Deeplink] scenario items failed:', result.failed);
            notify?.(
              i18n.t('actions.scenarioItemsFailed', {
                items: result.failed.map(f => f.exampleId).join(', '),
              }),
              'warning',
            );
          }
        } catch (err) {
          console.error('[Deeplink] Failed to load scenario', scenarioId, err);
          notify?.(i18n.t('moduleHelp.exampleLoadError'), 'error');
        }
      })();
      return;
    }

    if (!moduleId) return;
    const def = moduleRegistry.get(moduleId);
    if (!def) {
      console.warn(`[Deeplink] Unknown module: ${moduleId}`);
      return;
    }

    // Run async work without blocking init.
    (async () => {
      const instanceId = _ensureInstance(stateManager, moduleRegistry, eventBus, moduleId, def);
      if (!instanceId) return;

      if (!exampleId) return;

      const instance = await _waitForActivation(workspace, eventBus, instanceId, 4000);
      if (!instance) {
        console.warn('[Deeplink] Module did not activate in time:', moduleId);
        return;
      }
      if (typeof instance.loadExample !== 'function') {
        notify?.(i18n.t('moduleHelp.exampleLoadError'), 'error');
        return;
      }
      try {
        const payload = await examplesRegistry.load(exampleId);
        await instance.loadExample(payload);
      } catch (err) {
        console.error('[Deeplink] Failed to load example', exampleId, err);
        notify?.(i18n.t('moduleHelp.exampleLoadError'), 'error');
      }
    })();
  },
});

function _ensureInstance(stateManager, moduleRegistry, eventBus, moduleId, def) {
  const existing = findExistingInstance(stateManager, moduleId);
  if (existing) {
    eventBus.emit('module:activated', { instanceId: existing.instanceId });
    return existing.instanceId;
  }
  return createInstance(stateManager, moduleRegistry, eventBus, moduleId, def);
}

function _waitForActivation(workspace, eventBus, instanceId, timeoutMs) {
  return new Promise((resolve) => {
    const check = () => {
      const info = workspace.getActiveModuleInfo();
      if (info?.instanceId === instanceId) return info.instance;
      return null;
    };
    const immediate = check();
    if (immediate) return resolve(immediate);

    let done = false;
    const finish = (instance) => { if (done) return; done = true; eventBus.off('module:activated', listener); clearTimeout(timer); resolve(instance); };
    const listener = ({ instanceId: id }) => {
      if (id !== instanceId) return;
      // Wait a tick for the workspace to swap _activeInstanceId.
      setTimeout(() => finish(check()), 0);
    };
    eventBus.on('module:activated', listener);
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}
