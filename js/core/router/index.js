/**
 * D.Mike — Router wiring. Two entry points so registration happens before
 * Alpine.start() while the Router (which needs pages/workspace) is built later.
 */
import { Router } from './router.js';
import { registerRouteDirectives } from './route-store.js';

/**
 * Register the route store/magic/directive. Call BEFORE Alpine.start().
 * `onGo` is filled in once the Router exists (via the returned setter).
 * @param {object} Alpine
 * @returns {{ setRouter: (r: Router) => void }}
 */
export function initRouteDirectives(Alpine) {
  let router = null;
  registerRouteDirectives(Alpine, {
    onGo: (sub) => {
      if (!router) return;
      const info = router._ws.getActiveModuleInfo();
      if (!info) return;
      router.navigate({
        kind: 'module',
        projectId: router._sm.getActiveProjectId(),
        instanceId: info.instanceId,
        sub,
      });
    },
  });
  return { setRouter: (r) => { router = r; } };
}

/**
 * Build the Router and start it (attaches hashchange, applies the boot hash).
 * @param {object} kernel
 * @param {{ dmaicTiles: object, workspace: object }} ui
 * @param {Map<string, object>} pages
 * @param {object} Alpine
 * @returns {Router}
 */
export function initRouter(kernel, ui, pages, Alpine) {
  const router = new Router({
    stateManager: kernel.stateManager,
    moduleRegistry: kernel.moduleRegistry,
    eventBus: kernel.eventBus,
    dmaicTiles: ui.dmaicTiles,
    workspace: ui.workspace,
    pages,
    Alpine,
  });
  router.start();
  return router;
}
