/**
 * D.Mike — Regression: the experiments of the planner instances (experiment-loader.js)
 *
 * Reads `experiment` of every `doe-planner` instance through the module's
 * instance service. One read runs at a time; a request while it runs marks
 * one follow-up read, so a burst of events costs at most two reads. Every
 * caller gets the result of the newest read that started after its request,
 * never an older one.
 */

import { requireKnownId } from '../../core/agent/agent-argcheck.js';

/**
 * @typedef {import('./regression-model.js').PlannerExperiment} PlannerExperiment
 */

/**
 * @typedef {object} ExperimentLoader
 * @property {() => Promise<PlannerExperiment[]>} load read now (or join the running read and its follow-up)
 * @property {() => PlannerExperiment[]} current the result of the newest finished read, [] before the first
 * @property {() => boolean} loaded a read has finished
 * @property {(eventBus: { on: Function, off: Function }, events: string[]) => void} watch reload on these events
 * @property {() => void} dispose stop listening; reads still running write nothing
 */

/**
 * @param {{ list: (opts: { modules: string[] }) => Array<{ instanceId: string }>,
 *   read: (id: string, options: object) => Promise<any> }|null|undefined} instances the module's `ctx.instances`
 * @param {(experiments: PlannerExperiment[]) => void} onResult called with each newer result
 * @returns {ExperimentLoader}
 */
export function createExperimentLoader(instances, onResult) {
  /** @type {PlannerExperiment[]} */
  let current = [];
  let loaded = false;
  let disposed = false;
  let pending = false;
  /** @type {Promise<PlannerExperiment[]>|null} */
  let running = null;
  /** @type {Function[]} */
  const unsubs = [];

  /** @returns {Promise<PlannerExperiment[]>} one full read; a planner that cannot be read counts without experiment */
  async function readAll() {
    const planners = instances.list({ modules: ['doe-planner'] });
    return Promise.all(planners.map(async (p) => {
      try {
        const r = await instances.read(p.instanceId, { fields: ['experiment'] });
        return { plannerId: p.instanceId, experiment: r?.experiment ?? null };
      } catch {
        return { plannerId: p.instanceId, experiment: null };
      }
    }));
  }

  /** @returns {Promise<PlannerExperiment[]>} */
  async function loop() {
    /** @type {PlannerExperiment[]} */
    let out = current;
    try {
      do {
        pending = false;
        out = await readAll();
        if (disposed) break;
        current = out;
        loaded = true;
        onResult(out);
      } while (pending);
    } finally {
      // No await between the last check of `pending` and here: a request
      // after this point starts a new read.
      running = null;
    }
    return out;
  }

  return {
    load() {
      if (!instances) return Promise.resolve(current);
      if (running) { pending = true; return running; }
      running = loop();
      return running;
    },
    current: () => current,
    loaded: () => loaded,
    watch(eventBus, events) {
      const handler = () => { this.load().catch((err) => console.warn('[regression] reading the experiments failed', err)); };
      for (const ev of events) {
        eventBus.on(ev, handler);
        unsubs.push(() => eventBus.off(ev, handler));
      }
    },
    dispose() {
      disposed = true;
      for (const u of unsubs.splice(0)) u();
    },
  };
}

/**
 * Reads the experiments fresh, checks `key` against their options and applies
 * the option onto `state`.
 * @param {import('./regression-model.js').State} state the regression model
 * @param {ExperimentLoader} loader
 * @param {string} key an option key
 * @returns {Promise<boolean>} true when applied
 * @throws {Error} when no option has the key
 */
export async function importFromPlanners(state, loader, key) {
  const experiments = await loader.load();
  requireKnownId('key', key, state.listExperimentImports(experiments).map(o => o.key));
  return state.applyExperimentImport(experiments, key);
}

/**
 * The model came from a planner that no longer exists or no longer has an
 * experiment.
 * @param {import('./regression-model.js').State} state
 * @param {PlannerExperiment[]} experiments the newest read
 * @param {boolean} loaded a read has finished; before that the state is unknown
 * @returns {boolean}
 */
export function importSourceMissing(state, experiments, loaded) {
  const id = state.activeImportSource?.experimentId;
  if (!id || !loaded) return false;
  return !experiments.some(e => e.plannerId === id && e.experiment);
}
