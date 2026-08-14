/**
 * D.Mike — Application Bootstrap (app.js)
 * Initializes all core services and wires the UI.
 * Entry point loaded from index.html.
 */

import { bootKernel }     from './core/kernel.js';
import { DmaicTiles }     from './ui/dmaic-tiles.js';
import { Workspace }      from './ui/workspace.js';
import { Modal }          from './ui/modal.js';
import { HelpPanel }      from './ui/help-panel.js';
import { VERSION }        from './core/version.js';
import { initNightlyMode }   from './core/nightly-mode.js';
import { ExportReminder }    from './core/export-reminder.js';
import { notify }            from './core/notify.js';
import Alpine from '@alpinejs/csp';
import { buildFrame } from './frame/index.js';
import { setProjectSwitcherRouter, setProjectSwitcherUi } from './frame/header/project-switcher.js';
import { initPages }  from './pages/index.js';
import { startupTasks } from './startup/index.js';
import { initRouteDirectives, initRouter, createAppActionVerbs } from './core/router/index.js';
import { setCreatePageRouter } from './core/create-page.js';
import { createActionSplash } from './ui/action-splash.js';

async function init() {
  // ─── Core Services ───────────────────────────────────────

  const kernel = await bootKernel();
  const {
    eventBus, stateManager, i18n, moduleRegistry,
    chartManager, examplesRegistry, glossaryRegistry,
  } = kernel;

  // ─── Alpine.js Bootstrap ─────────────────────────────────
  const routeDirectives = initRouteDirectives(Alpine);
  Alpine.start();

  // ─── UI Components ───────────────────────────────────────

  const modal = new Modal(i18n);

  initNightlyMode({ modal, i18n });

  const dmaicTiles = new DmaicTiles(
    document.getElementById('dmaic-tiles'),
    { eventBus, stateManager, i18n, moduleRegistry }
  );
  dmaicTiles.render();

  const helpPanel = new HelpPanel(
    document.getElementById('help-panel'),
    i18n
  );
  helpPanel.render();

  const workspace = new Workspace(
    document.getElementById('app-workspace'),
    { moduleRegistry, eventBus, stateManager, i18n, modal, notify, helpPanel, chartManager, examples: examplesRegistry, glossary: glossaryRegistry }
  );
  workspace.render();

  // Wire workspace into DMAIC tiles for cross-phase tab drag & drop
  dmaicTiles.setWorkspace(workspace);

  // ─── Header Controls ─────────────────────────────────────

  // ExportReminder must register its `project:exported` listener (which stamps
  // settings.lastExportAt) BEFORE the footer registers its own, so the footer's
  // refresh reads the freshly-stamped timestamp on export.
  const exportReminder = new ExportReminder({ stateManager, eventBus, i18n, notify });
  exportReminder.init();

  // One shared action splash: the router shows it for #/action/… URLs, the
  // frame chrome shows the SAME overlay for its own long-running actions.
  const actionSplash = createActionSplash({ i18n });

  // Verb registry (`#/action/<verb>/<arg…>`) built ahead of the Router itself
  // — settings' action-URL list (task 12) reads it via the page context, and
  // pages init before the Router does. `routerBox` is filled in by
  // initRouter() below; rehydrateProject() only reads it when a verb actually
  // runs, always after boot. See core/router/index.js.
  const routerBox = { current: null };
  const actionVerbs = createAppActionVerbs(kernel, { dmaicTiles, workspace, notify }, routerBox);

  buildFrame(kernel, { modal, dmaicTiles, helpPanel, workspace, notify, actionSplash });
  const pages = await initPages(kernel, { modal, actionVerbs, notify });

  const router = initRouter(
    kernel,
    { dmaicTiles, workspace, notify, actionSplash, actionVerbs, routerBox },
    pages, Alpine,
  );
  routeDirectives.setRouter(router);
  dmaicTiles.setRouter(router);
  workspace.setRouter(router);
  setProjectSwitcherRouter(router);
  setProjectSwitcherUi({ dmaicTiles, workspace, moduleRegistry });
  setCreatePageRouter(router);

  // ─── Startup concerns (deeplink, prompts, viewport, auto-save, e2e) ───
  const startupCtx = { ...kernel, modal, notify, workspace, exportReminder };
  for (const task of startupTasks) await task.init(startupCtx);

  // ─── Update title ────────────────────────────────────────

  eventBus.on('state:saved', () => _updateTitle(stateManager));
  _updateTitle(stateManager);

  // App is interactive — remove the pre-JS loading overlay.
  document.getElementById('app-loading')?.remove();

  console.log(`D.Mike v${VERSION} ready.`);
}

function _updateTitle(stateManager) {
  const name = stateManager.get('projectMeta.name') ?? 'DMAIC.io';
  document.title = `${name} — DMAIC.io`;
}

// ─── Start ─────────────────────────────────────────────────────

init().catch(err => {
  console.error('D.Mike failed to initialize:', err);
  // Don't leave the fullscreen loading overlay covering a broken app.
  document.getElementById('app-loading')?.remove();
});
