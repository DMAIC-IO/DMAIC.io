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
 *
 * ── Verb contract ────────────────────────────────────────────────────────────
 * A verb is `{ modal, run, list }` and the router needs nothing else — adding a
 * verb means editing this file only.
 *
 *   modal: null                       no dialog at all (nothing opens, nothing
 *                                     flashes) — for effects too short to warrant
 *                                     one.
 *   modal.render(args)                → { title, subtitle?, body? }: what the
 *                                     progress dialog shows WHILE run() works.
 *                                     REQUIRED whenever `modal` is non-null —
 *                                     the router calls it unguarded, so a modal
 *                                     without render() fails the whole action.
 *   modal.done: null                  the dialog auto-closes when run() resolves.
 *   modal.done(detail, args)          → { title, subtitle?, body?, confirmLabel? }:
 *                                     the dialog stays open in this state until
 *                                     the user confirms, THEN the router
 *                                     navigates.
 *   run(args)                         → Promise<{ route, detail? }>. `route` is
 *                                     where the router navigates (replace);
 *                                     `detail` is handed straight to done().
 *                                     Throwing is fine: the router reports
 *                                     `actions.failed`, closes the dialog and
 *                                     falls back to the active project route.
 *   list()                            → [{ arg, label }] for UIs that enumerate
 *                                     the verb's arguments ([] if it has none).
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
 * @returns {Map<string, {modal: object|null, run: function, list: function}>}
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
    modal: {
      /**
       * @param {string[]} args `[scenarioId]`
       * @returns {{title: string, subtitle: string}}
       */
      render([scenarioId]) {
        return {
          title: i18n.t('actions.loadingScenario'),
          subtitle: titleOf(examplesRegistry.get(scenarioId)),
        };
      },
      /**
       * Stays open on purpose: a scenario mounts a whole project's worth of
       * modules, long enough that the user must be able to read the outcome
       * before the UI changes under them.
       * @param {{loaded: string[], failed: object[]}|null} detail  run()'s detail
       * @param {string[]} args `[scenarioId]`
       * @returns {{title: string, subtitle: string, confirmLabel: string}}
       */
      done(detail, [scenarioId]) {
        const scenario = examplesRegistry.get(scenarioId);
        const total = scenario?.items?.length ?? 0;
        return {
          title: i18n.t('actions.scenarioReady'),
          subtitle: i18n.t('actions.scenarioLoaded', {
            loaded: detail?.loaded?.length ?? 0, total,
          }),
          confirmLabel: i18n.t('actions.startNow'),
        };
      },
    },
    /**
     * Create a fresh project for the scenario and load all its examples.
     * @param {string[]} args `[scenarioId]`
     * @returns {Promise<{route: object, detail: object}>}
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
      return { route: phaseRoute(scenario.startPhase), detail: result };
    },
    /** @returns {{arg: string, label: string}[]} every scenario in the catalog */
    list() {
      return examplesRegistry.getScenarios().map(s => ({ arg: s.id, label: titleOf(s) }));
    },
  });

  verbs.set('new-project', {
    // No modal: createProject + switchProject + rehydrate finish in a few
    // milliseconds — a dialog that flashes for one frame is pure flicker.
    modal: null,
    /**
     * Create an empty project in the given cycle.
     * @param {string[]} args `[cycleId]`
     * @returns {Promise<{route: object, detail: object}>}
     */
    async run([cycleId]) {
      const cycle = cycleId || DEFAULT_CYCLE;
      const id = await newProject(i18n.t('app.defaultProjectName'), cycle);
      return { route: phaseRoute(null), detail: { projectId: id } };
    },
    /** @returns {{arg: string, label: string}[]} */
    list() {
      return []; // cycles are enumerated by the settings view itself
    },
  });

  verbs.set('example', {
    modal: {
      /**
       * @param {string[]} args `[exampleId]`
       * @returns {{title: string, subtitle: string}}
       */
      render([exampleId]) {
        return {
          title: i18n.t('actions.loadingExample'),
          subtitle: titleOf(examplesRegistry.get(exampleId)),
        };
      },
      // Auto-close: a single example is self-explanatory and the success toast
      // already reports it — a confirmation click here would be ceremony.
      done: null,
    },
    /**
     * Load a single example into the active project (no new project).
     * @param {string[]} args `[exampleId]`
     * @returns {Promise<{route: object, detail: object}>}
     */
    async run([exampleId]) {
      const meta = examplesRegistry.get(exampleId);
      if (!meta || meta.type === 'scenario') throw new Error(`Unknown example: ${exampleId}`);
      const scenario = { id: `ad-hoc:${exampleId}`, items: [exampleId], startPhase: null };
      const result = await ctx.loadScenario({ scenario });
      return { route: phaseRoute(null), detail: result };
    },
    /** @returns {{arg: string, label: string}[]} */
    list() {
      return [];
    },
  });

  return verbs;
}
