/**
 * D.Mike — Example deeplink startup concern.
 * Honors deeplinks like `?module=process-capability&example=capability-bolzendurchmesser`.
 * Activates the requested module (creating an instance in its default phase if
 * none exists), then asks the module to load the requested example.
 * Query parameters are stripped from the URL afterwards so a reload doesn't
 * repeat the action.
 */
import { createStartup } from '../core/create-startup.js';
import { findExistingInstance, createInstance } from '../core/router/instance-ops.js';

export default createStartup({
  id: 'example-deeplink',

  shouldRun() {
    const params = new URLSearchParams(location.search);
    return Boolean(params.get('module') || params.get('example'));
  },

  run({ stateManager, eventBus, moduleRegistry, examplesRegistry, workspace, notify, i18n }) {
    const params = new URLSearchParams(location.search);
    const moduleId = params.get('module');
    const exampleId = params.get('example');

    // Strip these params immediately so reload/back doesn't re-trigger.
    const next = new URLSearchParams(location.search);
    next.delete('module');
    next.delete('example');
    const cleaned = next.toString();
    history.replaceState(null, '', location.pathname + (cleaned ? `?${cleaned}` : '') + location.hash);

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
