/**
 * D.Mike — Frame · Module help button (module-help.js)
 * The #module-help-btn: shows/hides per active module, opens the help-panel with
 * help / examples / glossary tabs, syncs btn--active via a MutationObserver, and
 * announces overlay:opened='help-panel'. Moved verbatim from app.js
 * `_initModuleHelp` (no behavior change).
 */

import { h } from '../../core/dom.js';
import { renderModuleHelp } from '../../core/help-renderer.js';
import { loadScenario, describeScenario, countScenarioWorksheets } from '../../core/scenario-loader.js';
import { buildScenarioConfirmDialog } from '../../dialogs/scenario-confirm/scenario-confirm.js';

/**
 * Wire the global "Module Help" header button.
 * Opens the right-side help panel showing two tabs for the active module:
 *   - "Hilfe"        — lazy-loaded module help (via the module's `help` field)
 *   - "Beispieldaten" — catalog examples matching the active module, plus any
 *                       scenarios that reference them (load-whole-scenario)
 *
 * The button is visible whenever the active module exposes at least one
 * of these (help loader OR matching catalog examples + loadExample method).
 *
 * @param {object} kernel - { i18n, eventBus, examplesRegistry, glossaryRegistry,
 *   moduleRegistry, stateManager }
 * @param {object} ui     - { workspace, helpPanel, modal, notify, actionSplash }
 */
export function initModuleHelp(
  { i18n, eventBus, examplesRegistry, glossaryRegistry, moduleRegistry, stateManager },
  { workspace, helpPanel, modal, notify, actionSplash },
) {
  const btn = document.getElementById('module-help-btn');
  if (!btn || !workspace || !helpPanel) return;

  const scenarioConfirmDialog = buildScenarioConfirmDialog({ i18n, eventBus });
  scenarioConfirmDialog.prewarm?.();

  const _activeContext = () => {
    const info = workspace.getActiveModuleInfo();
    if (!info) {
      return {
        info: null, hasHelp: false, examples: [], canLoadExample: false, glossary: [], scenarios: [],
      };
    }
    const hasHelp = typeof info.instance?.help === 'function';
    const examples = examplesRegistry ? examplesRegistry.getForModule(info.moduleId) : [];
    const canLoadExample = typeof info.instance?.loadExample === 'function';
    const glossary = glossaryRegistry ? glossaryRegistry.getForModule(info.moduleId) : [];

    const scenarioMap = new Map();
    if (examplesRegistry) {
      for (const ex of examples) {
        for (const s of examplesRegistry.getScenariosForExample(ex.id)) scenarioMap.set(s.id, s);
      }
    }
    const scenarios = [...scenarioMap.values()].map(s => ({
      id: s.id,
      title: s.title?.[i18n.getLanguage()] || s.title?.en || s.id,
      description: s.description?.[i18n.getLanguage()] || s.description?.en || '',
    }));

    return { info, hasHelp, examples, canLoadExample, glossary, scenarios };
  };

  // The button is ALWAYS visible: glossary (full catalog) is always available
  // via the panel, so the sidebar always has content. Toggling display per
  // module reflowed the whole header (visible flicker on navigation) — keep
  // the icon's slot stable instead.
  btn.style.display = '';

  const loadExampleAndApply = async (exampleId) => {
    const { info, canLoadExample } = _activeContext();
    if (!info || !canLoadExample || !examplesRegistry) return;

    try {
      const payload = await examplesRegistry.load(exampleId);
      await info.instance.loadExample(payload);
      const title = payload.meta?.title?.[i18n.getLanguage()] || payload.meta?.title?.en || exampleId;
      if (typeof workspace.notify === 'function') {
        // Workspace doesn't expose notify directly; emit a simple event instead.
      }
      eventBus?.emit?.('example:loaded', { moduleId: info.moduleId, exampleId, title });
    } catch (err) {
      console.error('[ModuleHelp] Failed to load example', exampleId, err);
      eventBus?.emit?.('example:loadFailed', { exampleId, error: err.message });
    }
  };

  // Load a whole scenario into the running project: confirms with the user
  // first (naming what gets overwritten/created), then delegates to the
  // shared scenario loader and reports the result via a toast. Never renders
  // loadScenario's failed[].error strings — those are untranslated developer
  // strings; only the failing example ids go to the user, the raw error to
  // console.warn (mirrors action-verbs.js reportScenarioResult()).
  const loadScenarioAndApply = async (scenarioId) => {
    if (!examplesRegistry || !moduleRegistry || !stateManager || !modal) return;
    const { info } = _activeContext();
    const scenario = examplesRegistry.get(scenarioId);
    if (!scenario) return;

    const summary = describeScenario({
      scenario, examplesRegistry, activeModuleId: info?.moduleId ?? null,
    });
    const worksheetCount = await countScenarioWorksheets({ scenario, examplesRegistry });
    const scenarioTitle = scenario.title?.[i18n.getLanguage()] || scenario.title?.en || scenario.id;
    const overwriteModuleName = summary.overwritesModuleId
      ? i18n.t(`modules.${summary.overwritesModuleId}.name`) : '';

    const confirmed = await scenarioConfirmDialog.open(modal, {
      scenarioTitle, overwriteModuleName, newCount: summary.newCount, worksheetCount,
    }, {
      title: i18n.t('scenarios.confirmTitle', { title: scenarioTitle }),
      confirmLabel: i18n.t('scenarios.confirmButton'),
    });
    if (!confirmed) return;

    actionSplash?.show({ title: i18n.t('actions.loadingScenario'), subtitle: scenarioTitle });
    try {
      const result = await loadScenario({
        scenario, examplesRegistry, moduleRegistry, stateManager, eventBus, workspace,
        activeInstanceId: info?.instanceId ?? null,
        activeModuleId: info?.moduleId ?? null,
      });
      const total = scenario.items?.length ?? 0;
      notify?.(
        i18n.t('actions.scenarioLoaded', { loaded: result.loaded.length, total }),
        result.failed.length ? 'warning' : 'success',
      );
      if (result.failed.length) {
        console.warn('[ModuleHelp] scenario items failed:', result.failed);
        notify?.(
          i18n.t('actions.scenarioItemsFailed', {
            items: result.failed.map(f => f.exampleId).join(', '),
          }),
          'warning',
        );
      }
    } finally {
      actionSplash?.hide();
    }
  };

  const glossaryGet = glossaryRegistry ? (termId) => glossaryRegistry.get(termId) : null;

  // Populate the panel for the CURRENT active module. Shared by the button
  // click and the module-switch subscription so both render identical content.
  // `preferredTab` (optional) keeps the user on their current tab across a
  // module switch; on first open it defaults to the help tab.
  async function populatePanel(preferredTab) {
    const { info, hasHelp, examples, canLoadExample, glossary, scenarios } = _activeContext();
    const tabPref = preferredTab ? { preferredTab } : {};

    if (!info) {
      // No active module: still offer the glossary tab (full catalog via
      // search), so the panel always has content.
      helpPanel.showWithTabs(i18n.t('moduleHelp.title'), {
        helpNode: h('p', { style: 'color:var(--color-text-secondary)' }, i18n.t('moduleHelp.noActiveModule')),
        glossary: [],
        glossaryGet,
        ...tabPref,
      });
      return;
    }

    const moduleName = i18n.t(`modules.${info.moduleId}.name`);
    const tabExamples = canLoadExample ? examples : [];
    const tabScenarios = canLoadExample ? scenarios : [];

    // Loading placeholder for help tab.
    const helpPlaceholder = hasHelp
      ? h('p', null, i18n.t('moduleHelp.loading'))
      : h('p', { style: 'color:var(--color-text-secondary)' }, i18n.t('moduleHelp.notAvailable'));

    helpPanel.showWithTabs(moduleName, {
      helpNode: helpPlaceholder,
      examples: tabExamples,
      onLoadExample: loadExampleAndApply,
      scenarios: tabScenarios,
      onLoadScenario: loadScenarioAndApply,
      glossary,
      glossaryGet,
      ...tabPref,
    });

    if (!hasHelp) return;

    try {
      const mod = await info.instance.help();
      const helpDef = mod?.default || mod;
      const node = renderModuleHelp(helpDef, i18n.getLanguage());
      helpPanel.showWithTabs(moduleName, {
        helpNode: node,
        examples: tabExamples,
        onLoadExample: loadExampleAndApply,
        scenarios: tabScenarios,
        onLoadScenario: loadScenarioAndApply,
        glossary,
        glossaryGet,
        preferredTab: preferredTab || 'help',
      });
    } catch (err) {
      console.error('[ModuleHelp] Failed to load help for', info.moduleId, err);
      helpPanel.showWithTabs(moduleName, {
        helpNode: h('p', { style: 'color:var(--color-error)' }, `${i18n.t('moduleHelp.loadError')}: ${err.message}`),
        examples: tabExamples,
        onLoadExample: loadExampleAndApply,
        scenarios: tabScenarios,
        onLoadScenario: loadScenarioAndApply,
        glossary,
        glossaryGet,
        ...tabPref,
      });
    }
  }

  btn.addEventListener('click', async () => {
    // Toggle closed only when this panel is already open on one of its own
    // tabs (help / examples / glossary). The standalone glossary button has
    // been removed — all three tabs belong to this single sidebar button.
    const tab = helpPanel.getActiveTab?.();
    const ownsPanel = helpPanel.isVisible() && (tab === 'help' || tab === 'examples' || tab === 'glossary');
    if (ownsPanel) {
      helpPanel.hide();
      btn.classList.remove('btn--active');
      return;
    }

    // Announce ourselves as the active overlay so Dashboard/AlgoLab/Training
    // close themselves — only one header icon should be blue at a time.
    eventBus.emit('overlay:opened', 'help-panel');
    btn.classList.add('btn--active');
    await populatePanel();
  });

  // When the active module changes while our panel is open on one of its own
  // tabs, re-render the panel for the new module — keeping the current tab —
  // so help / examples / glossary always reflect the active module.
  eventBus.on('module:activated', () => {
    const tab = helpPanel.getActiveTab?.();
    const ownsPanel = helpPanel.isVisible() && (tab === 'help' || tab === 'examples' || tab === 'glossary');
    if (ownsPanel) populatePanel(tab);
  });

  // Sync button active state with the panel. The help/examples/glossary tabs
  // all belong to this single sidebar button now (the standalone glossary
  // button has been removed).
  const helpEl = document.getElementById('help-panel');
  if (helpEl) {
    const observer = new MutationObserver(() => {
      const tab = helpPanel.getActiveTab?.();
      const ownsPanel = helpPanel.isVisible() && (tab === 'help' || tab === 'examples' || tab === 'glossary');
      btn.classList.toggle('btn--active', ownsPanel);
    });
    observer.observe(helpEl, { attributes: true, attributeFilter: ['class', 'data-active-tab'] });
  }
}
