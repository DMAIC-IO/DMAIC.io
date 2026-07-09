/**
 * D.Mike — Kernel (kernel.js)
 * UI-independent composition root. Builds and returns the service container.
 * No DOM access. The single place services are constructed → the seam for a
 * future replaceable storage engine (see spec §6).
 */

import { EventBus }       from './event-bus.js';
import { StateManager }   from './state-manager.js';
import { LocalAdapter }   from './storage/local-adapter.js';
import { I18n }           from './i18n.js';
import { ThemeManager }   from './theme-manager.js';
import { ModuleRegistry } from './module-registry.js';
import { ExamplesRegistry } from './examples-registry.js';
import { GlossaryRegistry } from './glossary-registry.js';
import { configureStatsPanel } from './stats-panel.js';
import { setGlossaryInlineConfig } from './glossary-inline.js';
import ChartManager       from './chart/chart-manager.js';
import manifest           from '../modules/manifest.js';
import { TipEngine }      from './tips/tip-engine.js';
import { shortcutRegistry } from './shortcut-registry.js';

/**
 * Boot the UI-independent core services.
 * @param {import('./storage/local-adapter.js').LocalAdapter} [adapter] - Storage adapter to use.
 *   Defaults to LocalAdapter (localStorage). Inject an alternative (e.g. ExcelAdapter,
 *   GraphAdapter) for non-web builds.
 * @returns {Promise<object>} services container
 */
export async function bootKernel(adapter = new LocalAdapter()) {
  const eventBus     = new EventBus();
  const stateManager = new StateManager(eventBus, adapter);
  await stateManager.load();

  const i18n = new I18n('de');
  i18n.connect(eventBus, stateManager);

  // Detect browser language for first visit
  const savedLang = stateManager.get('settings.language');
  const initialLang = savedLang ?? (navigator.language?.startsWith('de') ? 'de' : 'en');

  // Pre-load both languages (small files, avoids flicker on toggle)
  await Promise.all([i18n.loadLanguage('de'), i18n.loadLanguage('en')]);
  await i18n.setLanguage(initialLang);

  const themeManager = new ThemeManager(stateManager, eventBus);
  themeManager.init();

  shortcutRegistry.init(stateManager, eventBus);

  const moduleRegistry = new ModuleRegistry();
  manifest.forEach(def => moduleRegistry.register(def));
  moduleRegistry.setActiveCycle(stateManager.getProjectCycle());
  stateManager.setModuleRegistry(moduleRegistry);

  const chartManager = new ChartManager(eventBus, i18n, stateManager);

  const examplesRegistry = new ExamplesRegistry();
  await examplesRegistry.init();

  const glossaryRegistry = new GlossaryRegistry();
  await glossaryRegistry.init();
  // Warm the full term cache so `getForModule()` is synchronous from here
  // on (the help-panel tab visibility check reads from cache).
  await glossaryRegistry.warmAll();
  // Configure the shared stats-panel with the set of known glossary IDs so
  // module column headers (Varianz, Standardabweichung, …) become inline
  // links — without each module needing to know about it.
  const knownGlossaryIds = new Set(glossaryRegistry.getAll().map(t => t.id));
  const inlineLinksOn = () => stateManager.get('settings.glossary.inlineLinksEnabled') ?? true;
  configureStatsPanel({ glossaryIds: knownGlossaryIds, glossaryEnabled: inlineLinksOn() });
  setGlossaryInlineConfig({
    ariaTemplate: i18n.t('moduleHelp.glossaryOpenAria') || 'Glossar: {term} öffnen',
    enabled: inlineLinksOn(),
  });
  // Re-apply when the user toggles the setting (UI for the toggle comes later).
  eventBus.on('settings:changed', () => {
    const on = inlineLinksOn();
    configureStatsPanel({ glossaryEnabled: on });
    setGlossaryInlineConfig({ enabled: on });
  });
  // Re-apply aria-label template when the UI language changes.
  eventBus.on('language:changed', () => {
    setGlossaryInlineConfig({ ariaTemplate: i18n.t('moduleHelp.glossaryOpenAria') || 'Glossar: {term} öffnen' });
  });

  const tipEngine = new TipEngine({ eventBus, stateManager, i18n });
  await tipEngine.init();

  return {
    eventBus, stateManager, i18n, themeManager, moduleRegistry,
    chartManager, examplesRegistry, glossaryRegistry, tipEngine, shortcutRegistry,
  };
}
