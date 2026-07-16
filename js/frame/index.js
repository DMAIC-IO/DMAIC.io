/**
 * D.Mike — Frame Composition Root (frame/index.js)
 * Wires the application chrome (header controls, glossary, footer) against the
 * static anchors in index.html. Called once from app.js after the core UI
 * widgets (modal, dmaicTiles, helpPanel, workspace) have been constructed.
 */

import { initProjectSwitcher } from './header/project-switcher.js';
import { initGlossaryInline, initHeaderCoordinator } from './header/overlay-menu.js';
import { initModuleHelp }      from './header/module-help.js';
import { initActionButtons }   from './header/action-buttons.js';
import { initFooter }          from './footer/footer.js';
import { updateReadOnlyBanner, initCollapsibleSections } from './helpers.js';
import { startGlossaryAugmenter } from '../core/glossary-inline.js';

/**
 * Build the application chrome.
 *
 * @param {object} kernel - bootKernel() services container (eventBus,
 *   stateManager, i18n, themeManager, moduleRegistry, chartManager,
 *   examplesRegistry, glossaryRegistry, tipEngine, shortcutRegistry).
 * @param {object} ui - UI widgets built in app.js.
 * @param {object} ui.modal - Shared modal dialog host.
 * @param {object} ui.dmaicTiles - DMAIC phase tiles.
 * @param {object} ui.helpPanel - Help panel instance.
 * @param {object} ui.workspace - Module workspace.
 * @param {Function} ui.notify - Toast notification helper.
 */
export function buildFrame(kernel, ui) {
  // Glossary wiring on the help panel:
  // Permanent loader so [data-glossary-term] clicks work even before any
  // module-help has been opened (e.g. clicking "Varianz" in a stats table).
  ui.helpPanel.setGlossaryLoader((id) => kernel.glossaryRegistry.get(id));
  // Sync title resolver so the seeAlso list and {{term:id}} cross-refs in the
  // glossary detail view show real titles ("Standardabweichung") instead of
  // the kebab-case ids ("standardabweichung").
  ui.helpPanel.setGlossaryTitleResolver((id, lang) => kernel.glossaryRegistry.getCachedTitle(id, lang));
  // Full-catalog provider so searching the glossary tab surfaces non-module
  // terms (after the module-specific ones), replacing the removed standalone
  // glossary catalog button.
  ui.helpPanel.setGlossaryCatalog(() => kernel.glossaryRegistry.getAllCached());
  // Augment any `.glossary-term` markers anywhere in the DOM with the hover
  // button + SVG icon. Idempotent + MutationObserver-backed, so later renders
  // (module switches, stats-table updates) are auto-handled.
  startGlossaryAugmenter();

  initProjectSwitcher(kernel);
  initGlossaryInline(kernel, ui);
  initHeaderCoordinator(kernel, ui);
  initModuleHelp(kernel, ui);
  initActionButtons(kernel, ui);
  initFooter(kernel);
  updateReadOnlyBanner(kernel.stateManager, kernel.i18n);
  initCollapsibleSections();
}
