/**
 * D.Mike — Router wiring. Two entry points so registration happens before
 * Alpine.start() while the Router (which needs pages/workspace) is built later.
 */
import { Router } from './router.js';
import { registerRouteDirectives } from './route-store.js';
import { createActionVerbs } from './action-verbs.js';
import { createActionSplash } from '../../ui/action-splash.js';
import { loadScenario } from '../scenario-loader.js';
import { rehydrateProject } from '../../frame/project-rehydrate.js';

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
 * Also builds the action verb registry (`#/action/<verb>/<arg…>`) and wires it
 * into the Router together with the shared action splash.
 *
 * The splash instance: pass one in via `ui.actionSplash` so the rest of the
 * chrome (built earlier in app.js) shares it; if omitted, one is created here.
 * Either way the live instance is reachable as `router.getActionSplash()`.
 *
 * @param {object} kernel
 * @param {{ dmaicTiles: object, workspace: object, notify?: function,
 *          actionSplash?: object }} ui
 * @param {Map<string, object>} pages
 * @param {object} Alpine
 * @returns {Router}
 */
export function initRouter(kernel, ui, pages, Alpine) {
  const splash = ui.actionSplash ?? createActionSplash({ i18n: kernel.i18n });
  const router = new Router({
    stateManager: kernel.stateManager,
    moduleRegistry: kernel.moduleRegistry,
    eventBus: kernel.eventBus,
    dmaicTiles: ui.dmaicTiles,
    workspace: ui.workspace,
    pages,
    Alpine,
  });

  const verbs = createActionVerbs({
    i18n: kernel.i18n,
    examplesRegistry: kernel.examplesRegistry,
    stateManager: kernel.stateManager,
    notify: ui.notify,
    loadScenario: (args) => loadScenario({
      examplesRegistry: kernel.examplesRegistry,
      moduleRegistry: kernel.moduleRegistry,
      stateManager: kernel.stateManager,
      eventBus: kernel.eventBus,
      workspace: ui.workspace,
      ...args,
    }),
    // navigate:false — the router performs the single navigation itself.
    rehydrateProject: (options) => rehydrateProject({
      stateManager: kernel.stateManager,
      eventBus: kernel.eventBus,
      moduleRegistry: kernel.moduleRegistry,
      dmaicTiles: ui.dmaicTiles,
      workspace: ui.workspace,
      router,
    }, options),
  });
  router.setActionVerbs(verbs, splash, ui.notify, kernel.i18n);

  router.start();
  return router;
}
