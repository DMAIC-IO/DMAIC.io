/**
 * D.Mike — Morphological Box concept source (morphological-box-concepts.js)
 *
 * The hand-over to solution selection: a pure function that lists every
 * concept of every morphological box in the project, so a selection module
 * can pull them as alternatives (same pull pattern as the SIPOC import of the
 * process map). A stub with `{ get, getModuleState }` is enough to test it.
 */
import { State } from './morphological-box-model.js';

/**
 * @typedef {object} MorphologicalConcept
 * @property {string} instanceId the morphological box the concept lives in
 * @property {string} conceptId
 * @property {string} name
 * @property {Array<{ parameter: string, option: string }>} picks the chosen
 *   option per parameter, in box order, as display text
 * @property {boolean} complete every parameter with options has a pick
 * @property {number} conflictCount incompatible pairs inside the concept
 */

/**
 * List the concepts of all morphological boxes, in phase and instance order.
 * @param {{ get: (path: string) => any, getModuleState: (id: string) => any }} sm
 * @returns {MorphologicalConcept[]}
 */
export function listMorphologicalConcepts(sm) {
  const out = [];
  for (const phaseId of Object.keys(sm.get('phases') || {})) {
    for (const inst of sm.get(`phases.${phaseId}`) ?? []) {
      if (inst.moduleId !== State.ID) continue;
      const box = State.fromJSON(sm.getModuleState(inst.instanceId));
      for (const c of box.concepts) {
        out.push({
          instanceId: inst.instanceId,
          conceptId: c.id,
          name: c.name,
          picks: box.parameters
            .filter(p => c.picks[p.id])
            .map(p => ({ parameter: p.name, option: box.findOption(c.picks[p.id]).label })),
          complete: box.isConceptComplete(c.id),
          conflictCount: box.conceptConflicts(c.id).length,
        });
      }
    }
  }
  return out;
}
