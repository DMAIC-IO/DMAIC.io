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
 * Build the action verb registry (`#/action/<verb>/<arg…>`) ahead of the
 * Router's own construction. Pages (e.g. the settings action-URL list, task
 * 12) need read access to the verb registry — via its `list()` per verb —
 * well before the Router exists, since `initPages()` runs first in app.js.
 *
 * `rehydrateProject` needs a live Router instance, which doesn't exist yet
 * at call time. `routerBox` is a mutable one-slot box (`{ current: null }`)
 * the caller fills in once the Router is built — mirrors the pattern already
 * used for `create-page.js`'s module-level router reference. The verbs'
 * `run()` methods only read `routerBox.current` when actually invoked (i.e.
 * after boot), never at registry-build time, so the box may still be empty
 * when this function returns.
 *
 * @param {object} kernel
 * @param {{ dmaicTiles: object, workspace: object, notify?: function }} ui
 * @param {{ current: object|null }} routerBox
 * @returns {Map<string, object>} verb registry
 */
export function createAppActionVerbs(kernel, ui, routerBox) {
  return createActionVerbs({
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
      router: routerBox.current,
    }, options),
  });
}

/**
 * Build the Router and start it (attaches hashchange, applies the boot hash).
 * Wires the action verb registry (built earlier via `createAppActionVerbs`,
 * see `ui.actionVerbs`) into the Router together with the shared action
 * splash. Fills `ui.routerBox.current` with the new Router BEFORE
 * `router.start()` — the boot hash may itself be an action URL, whose verb
 * closures read the box.
 *
 * The splash instance: pass one in via `ui.actionSplash` so the rest of the
 * chrome (built earlier in app.js) shares it; if omitted, one is created here.
 * Either way the live instance is reachable as `router.getActionSplash()`.
 *
 * @param {object} kernel
 * @param {{ dmaicTiles: object, workspace: object, notify?: function,
 *          actionSplash?: object, actionVerbs: Map<string, object>,
 *          routerBox: { current: object|null } }} ui
 * @param {Map<string, object>} pages
 * @param {object} Alpine
 * @returns {Router}
 */
export function initRouter(kernel, ui, pages, Alpine) {
  if (!ui.actionSplash) {
    console.warn('[router] no ui.actionSplash passed — creating a second, ' +
      'independent overlay. Pass the app-wide instance (see app.js) instead.');
  }
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
  if (ui.routerBox) ui.routerBox.current = router;

  router.setActionVerbs(ui.actionVerbs, splash, ui.notify, kernel.i18n);

  router.start();
  return router;
}
