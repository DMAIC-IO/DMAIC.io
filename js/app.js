/**
 * Qprovement — Application Bootstrap (app.js)
 * Initializes all core services and wires the UI.
 * Entry point loaded from index.html.
 */

import { bootKernel }     from './core/kernel.js';
import { DmaicTiles }     from './ui/dmaic-tiles.js';
import { Workspace }      from './ui/workspace.js';
import { createDialogService } from './ui/dialog/dialog.js';
import { HelpPanel }      from './ui/help-panel.js';
import { VERSION }        from './core/version.js';
import { initNightlyMode }   from './core/nightly-mode.js';
import { ExportReminder }    from './core/export-reminder.js';
import { notify }            from './core/notify.js';
import { setChunkErrorHandler, guardChunkRejections, prefetchChunks } from './core/chunks.js';
import { registerServiceWorker } from './core/service-worker.js';
import Alpine from '@alpinejs/csp';
import { buildFrame } from './frame/index.js';
import { setProjectSwitcherRouter, setProjectSwitcherUi } from './frame/header/project-switcher.js';
import { initPages }  from './pages/index.js';
import { startupTasks } from './startup/index.js';
import { initRouteDirectives, initRouter, createAppActionVerbs } from './core/router/index.js';
import { setCreatePageRouter } from './core/create-page.js';
import { registerTablistDirective } from './core/tablist.js';

async function init() {
  // ─── Core Services ───────────────────────────────────────

  const kernel = await bootKernel();
  const {
    eventBus, stateManager, i18n, moduleRegistry,
    chartManager, examplesRegistry, glossaryRegistry,
  } = kernel;
  // Chunk imports (lazy libraries, the Lab) report failures as one toast.
  setChunkErrorHandler(() => notify(i18n.t('app.chunkLoadFailed'), 'error', null, {
    action: { label: i18n.t('app.reload'), onClick: () => location.reload() },
  }));
  guardChunkRejections(window);

  // ─── Alpine.js Bootstrap ─────────────────────────────────
  const routeDirectives = initRouteDirectives(Alpine);
  registerTablistDirective(Alpine);
  Alpine.start();

  // ─── UI Components ───────────────────────────────────────

  // One dialog service for the whole app: modules get it as context.dialog.
  const dialog = createDialogService({ i18n });

  initNightlyMode({ dialog, i18n });

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
    { moduleRegistry, eventBus, stateManager, i18n, dialog, notify, helpPanel, chartManager, examples: examplesRegistry, glossary: glossaryRegistry }
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

  // One shared progress dialog: the router shows it for #/action/… URLs (and
  // feeds it the scenario item events), the frame chrome drives the SAME
  // instance for its own long-running actions.
  const progress = dialog.progress();

  // Verb registry (`#/action/<verb>/<arg…>`) built ahead of the Router itself
  // — settings' action-URL list (task 12) reads it via the page context, and
  // pages init before the Router does. `routerBox` is filled in by
  // initRouter() below; rehydrateProject() only reads it when a verb actually
  // runs, always after boot. See core/router/index.js.
  const routerBox = { current: null };
  const actionVerbs = createAppActionVerbs(kernel, { dmaicTiles, workspace, notify }, routerBox);

  buildFrame(kernel, { dialog, dmaicTiles, helpPanel, workspace, notify, progress });
  const pages = await initPages(kernel, { dialog, actionVerbs, notify });

  const router = initRouter(
    kernel,
    { dmaicTiles, workspace, notify, progress, actionVerbs, routerBox },
    pages, Alpine,
  );
  routeDirectives.setRouter(router);
  dmaicTiles.setRouter(router);
  workspace.setRouter(router);
  setProjectSwitcherRouter(router);
  setProjectSwitcherUi({ dmaicTiles, workspace, moduleRegistry });
  setCreatePageRouter(router);

  // ─── Startup concerns (deeplink, prompts, viewport, auto-save, e2e) ───
  const startupCtx = { ...kernel, dialog, notify, workspace, exportReminder };
  for (const task of startupTasks) await task.init(startupCtx);

  // ─── Update title ────────────────────────────────────────

  eventBus.on('state:saved', () => _updateTitle(stateManager));
  _updateTitle(stateManager);

  // App is interactive — remove the pre-JS loading overlay.
  document.getElementById('app-loading')?.remove();
  // Warm every chunk on idle. Once every link loaded, the app works offline;
  // data-chunks-prefetched="1" only says all settled (failures included).
  prefetchChunks();
  // Offline after a reload: the worker precaches every runtime file. Until its
  // install finishes, the prefetch above covers the open page.
  registerServiceWorker();

  console.log(`Qprovement v${VERSION} ready.`);
}

function _updateTitle(stateManager) {
  const name = stateManager.get('projectMeta.name') ?? 'Qprovement';
  document.title = `${name} — Qprovement`;
}

// ─── Start ─────────────────────────────────────────────────────

init().catch(err => {
  console.error('Qprovement failed to initialize:', err);
  // Don't leave the fullscreen loading overlay covering a broken app.
  document.getElementById('app-loading')?.remove();
});
