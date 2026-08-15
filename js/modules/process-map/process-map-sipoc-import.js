/**
 * D.Mike — Process Map ↔ SIPOC Import helpers.
 *
 * Pure functions that back the "Aus SIPOC übernehmen" flow:
 *   1. listSipocInstances(sm)      — enumerate all SIPOC instances in the project
 *   2. appendSipocProcess(model, sipocState) — append the SIPOC's process column
 *                                              as fresh Steps at the end of the map
 *
 * Kept isolated from the process-map data-fn so it can be unit-tested without
 * Alpine, DOM, or the state-manager itself (a stub with { get, getModuleState }
 * suffices).
 */

const PREVIEW_MAX = 4;

/** Trimmed non-empty strings from an unknown array shape. */
function cleanStrings(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(v => typeof v === 'string')
    .map(v => v.trim())
    .filter(v => v.length > 0);
}

/**
 * Enumerate every SIPOC instance in the project (across all phases), in the
 * order the phases appear in `stateManager.get('phases')`.
 *
 * @param {{ get: (path:string) => any, getModuleState: (id:string) => any }} sm
 * @returns {Array<{ instanceId: string, label: string, processCount: number, processPreview: string[] }>}
 */
export function listSipocInstances(sm) {
  const out = [];
  const phases = sm.get('phases') || {};
  for (const phaseId of Object.keys(phases)) {
    const instances = sm.get(`phases.${phaseId}`) ?? [];
    for (const inst of instances) {
      if (inst.moduleId !== 'sipoc') continue;
      const state = sm.getModuleState(inst.instanceId);
      const clean = cleanStrings(state?.columns?.process);
      out.push({
        instanceId: inst.instanceId,
        label: `SIPOC #${out.length + 1}`,
        processCount: clean.length,
        processPreview: clean.slice(0, PREVIEW_MAX),
      });
    }
  }
  return out;
}

/**
 * Append every non-empty entry of the SIPOC's process column as a new Step at
 * the end of `model.steps`. Uses the model's own `addStep(atIndex)` factory so
 * every step gets a canonical shape and a fresh id.
 *
 * @param {import('./process-map-model.js').State} model
 * @param {any} sipocState  { columns: { process: string[] } }
 * @returns {number} number of steps appended
 */
export function appendSipocProcess(model, sipocState) {
  const titles = cleanStrings(sipocState?.columns?.process);
  for (const title of titles) {
    const id = model.addStep(model.steps.length);
    const step = model.findStep(id);
    if (step) step.title = title;
  }
  return titles.length;
}
