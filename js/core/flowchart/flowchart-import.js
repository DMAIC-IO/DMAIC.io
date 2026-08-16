/**
 * D.Mike — Flowchart generic import picker (flowchart-import.js)
 *
 * Registry of source→target step mappers. Each target flowchart module
 * (process-map, activity-flowchart, opportunity-flowchart, deployment-flowchart)
 * registers one mapper per source module it wants to import from — e.g. PM
 * registers a SIPOC→PM mapper in `modules/process-map/process-map-sipoc-import.js`.
 *
 * A mapper receives the raw, persisted state of a source-module instance and
 * returns a list of *seed* step objects (not yet normalized — normalization
 * happens when the seeds are appended via `targetState.addStep`).
 */

/** @type {Map<string, Map<string, (state:any)=>object[]>>} target moduleId → source moduleId → mapper */
const registry = new Map();

/**
 * Register a mapper that turns a source-module instance's state into seed
 * steps for a target flowchart module.
 * @param {string} targetModuleId - moduleId of the flowchart module importing steps (e.g. 'process-map')
 * @param {string} sourceModuleId - moduleId of the module being imported from (e.g. 'sipoc')
 * @param {(state: any) => object[]} mapper - maps the source instance's state to an array of seed steps
 * @returns {void}
 */
export function registerSourceMapper(targetModuleId, sourceModuleId, mapper) {
  if (!registry.has(targetModuleId)) registry.set(targetModuleId, new Map());
  registry.get(targetModuleId).set(sourceModuleId, mapper);
}

/**
 * Test-only: clear the mapper registry. Keeps suites hermetic when multiple
 * test files register mappers under the same target/source ids.
 * @returns {void}
 */
export function __resetRegistryForTests() { registry.clear(); }

/**
 * Enumerate every instance of the given source module(s) known to the
 * state-manager, in a shape suitable for a generic import picker.
 * @param {{ sources: string[], stateManager: { listInstances?: (moduleId:string) => any[] } }} params
 * @returns {Array<{ instanceId: string, moduleId: string, title: string }>}
 */
export function listSourceInstances({ sources, stateManager }) {
  if (stateManager && typeof stateManager.listInstances !== 'function') {
    console.warn('[flowchart-import] stateManager has no listInstances(moduleId) method — every source will return []; register the method on stateManager or pass a wrapper. Sources requested:', sources);
  }
  const out = [];
  for (const src of sources) {
    const list = stateManager?.listInstances?.(src) || [];
    for (const inst of list) {
      out.push({
        instanceId: inst.instanceId ?? inst.id,
        moduleId: src,
        title: inst.title ?? inst.name ?? inst.instanceId ?? '(unnamed)',
      });
    }
  }
  return out;
}

/**
 * Look up the mapper registered for (targetModuleId, sourceModuleId), run it
 * against the source instance's persisted state, and append the resulting
 * seed steps to the end of `targetState.steps` via `targetState.addStep`.
 * @param {{
 *   targetModuleId: string, sourceModuleId: string, instanceId: string,
 *   stateManager: { getModuleState?: (instanceId:string) => any },
 *   targetState: { steps: object[], addStep: (atIndex:number, seed?:object) => object },
 * }} params
 * @returns {object[]|null} the appended steps, or null when no mapper is registered
 */
export function appendFromInstance({
  targetModuleId, sourceModuleId, instanceId, stateManager, targetState,
}) {
  const mapper = registry.get(targetModuleId)?.get(sourceModuleId);
  if (!mapper) return null;
  const sourceState = stateManager?.getModuleState?.(instanceId);
  const rawSteps = mapper(sourceState) || [];
  const appended = [];
  for (const seed of rawSteps) {
    appended.push(targetState.addStep(targetState.steps.length, seed));
  }
  return appended;
}
