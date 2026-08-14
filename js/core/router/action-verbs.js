/**
 * D.Mike — Action verb registry (router/action-verbs.js)
 *
 * Action URLs are one-shot commands of the form `#/action/<verb>/<arg…>`.
 * Each verb runs its effect and returns the route the router should navigate
 * to afterwards (with replace, so the command leaves no history entry).
 *
 * A verb NEVER navigates itself — the router performs exactly one navigation
 * with the returned target route. That is why `newProject()` below rehydrates
 * with `{ navigate: false }`: rehydrateProject() would otherwise navigate a
 * second time, reentrantly, while the router's `_applying` guard is still set.
 */

import { getPhaseIds, DEFAULT_CYCLE } from '../cycles/cycles.js';

/**
 * A catalog entry is a scenario iff it declares `type: 'scenario'` — the same
 * predicate ExamplesRegistry.getScenarios() uses, so `list()` and `run()` can
 * never disagree about what a scenario is. The `items` check additionally
 * rejects a scenario authored without anything to load.
 * @param {object|undefined} entry
 * @returns {boolean}
 */
function isScenario(entry) {
  return !!entry && entry.type === 'scenario' && Array.isArray(entry.items);
}

/**
 * Build the verb registry.
 *
 * @param {object} ctx
 * @param {object} ctx.i18n
 * @param {object} ctx.examplesRegistry
 * @param {object} ctx.stateManager
 * @param {function} ctx.loadScenario        bound scenario loader
 * @param {function} ctx.rehydrateProject    bound rehydrate routine, takes options
 * @param {function} [ctx.notify]
 * @returns {Map<string, {run: function, describe: function, list: function}>}
 */
export function createActionVerbs(ctx) {
  const { i18n, examplesRegistry, stateManager } = ctx;
  const lang = () => i18n.getLanguage();
  const titleOf = (meta) => meta?.title?.[lang()] || meta?.title?.en || meta?.id || '';

  /**
   * Create a project and rebuild the UI for it — without navigating; the
   * router navigates once to the route the verb returns.
   * @param {string} name
   * @param {string} cycleId
   * @returns {Promise<string>} project id
   */
  async function newProject(name, cycleId) {
    const id = stateManager.createProject(name, cycleId);
    await stateManager.switchProject(id);
    await ctx.rehydrateProject({ navigate: false });
    return id;
  }

  /**
   * Route to the given phase of the active project. An absent OR unknown phase
   * (e.g. a typo in a catalog `startPhase`) falls back to the cycle's first
   * phase — an unresolvable phase would leave a dead hash and no tile selection.
   * @param {string|null} phaseId
   * @returns {{kind: string, projectId: string, phaseId: string}}
   */
  function phaseRoute(phaseId) {
    const projectId = stateManager.getActiveProjectId();
    const cycleId = stateManager.getProjectCycle();
    const phases = getPhaseIds(cycleId);
    return {
      kind: 'phase',
      projectId,
      phaseId: phases.includes(phaseId) ? phaseId : phases[0],
    };
  }

  /**
   * Tell the user how a scenario load went. Failed items are named by their
   * example id only — `failed[].error` holds untranslated developer strings.
   * @param {object} scenario
   * @param {{loaded: string[], failed: {exampleId: string, moduleId: string|null, error: string}[]}} result
   * @returns {void}
   */
  function reportScenarioResult(scenario, result) {
    const total = scenario.items?.length ?? 0;
    ctx.notify?.(
      i18n.t('actions.scenarioLoaded', { loaded: result.loaded.length, total }),
      result.failed.length ? 'warning' : 'success',
    );
    if (result.failed.length) {
      console.warn('[actions] scenario items failed:', result.failed);
      ctx.notify?.(
        i18n.t('actions.scenarioItemsFailed', {
          items: result.failed.map(f => f.exampleId).join(', '),
        }),
        'warning',
      );
    }
  }

  const verbs = new Map();

  verbs.set('scenario', {
    /**
     * Create a fresh project for the scenario and load all its examples.
     * @param {string[]} args `[scenarioId]`
     * @returns {Promise<object>} target route
     */
    async run([scenarioId]) {
      const scenario = examplesRegistry.get(scenarioId);
      // Same definition of "scenario" as list() / ExamplesRegistry.getScenarios():
      // `type === 'scenario'`. The `items` check is an additional guard against a
      // scenario entry authored without items (which would load nothing).
      if (!isScenario(scenario)) {
        throw new Error(`Unknown scenario: ${scenarioId}`);
      }
      await newProject(titleOf(scenario), scenario.cycle);
      const result = await ctx.loadScenario({ scenario });
      reportScenarioResult(scenario, result);
      return phaseRoute(scenario.startPhase);
    },
    /**
     * @param {string[]} args `[scenarioId]`
     * @returns {{title: string, subtitle: string}}
     */
    describe([scenarioId]) {
      return {
        title: i18n.t('actions.loadingScenario'),
        subtitle: titleOf(examplesRegistry.get(scenarioId)),
      };
    },
    /** @returns {{arg: string, label: string}[]} every scenario in the catalog */
    list() {
      return examplesRegistry.getScenarios().map(s => ({ arg: s.id, label: titleOf(s) }));
    },
  });

  verbs.set('new-project', {
    /**
     * Create an empty project in the given cycle.
     * @param {string[]} args `[cycleId]`
     * @returns {Promise<object>} target route
     */
    async run([cycleId]) {
      const cycle = cycleId || DEFAULT_CYCLE;
      await newProject(i18n.t('app.defaultProjectName'), cycle);
      return phaseRoute(null);
    },
    /** @returns {{title: string, subtitle: string}} */
    describe() {
      return { title: i18n.t('actions.creatingProject'), subtitle: '' };
    },
    /** @returns {{arg: string, label: string}[]} */
    list() {
      return []; // cycles are enumerated by the settings view itself
    },
  });

  verbs.set('example', {
    /**
     * Load a single example into the active project (no new project).
     * @param {string[]} args `[exampleId]`
     * @returns {Promise<object>} target route
     */
    async run([exampleId]) {
      const meta = examplesRegistry.get(exampleId);
      if (!meta || meta.type === 'scenario') throw new Error(`Unknown example: ${exampleId}`);
      const scenario = { id: `ad-hoc:${exampleId}`, items: [exampleId], startPhase: null };
      await ctx.loadScenario({ scenario });
      return phaseRoute(null);
    },
    /**
     * @param {string[]} args `[exampleId]`
     * @returns {{title: string, subtitle: string}}
     */
    describe([exampleId]) {
      return {
        title: i18n.t('actions.loadingExample'),
        subtitle: titleOf(examplesRegistry.get(exampleId)),
      };
    },
    /** @returns {{arg: string, label: string}[]} */
    list() {
      return [];
    },
  });

  return verbs;
}
