/**
 * D.Mike — Morphologischer Kasten: Konzepte für die Lösungsauswahl.
 *
 * Die Übergabe an die Lösungsauswahl: eine reine Funktion, die alle Konzepte
 * aller morphologischen Kästen des Projekts auflistet, damit ein
 * Auswahlmodul sie als Alternativen holen kann (dasselbe Holmuster wie der
 * SIPOC-Import der Prozesslandkarte). Zum Testen genügt ein Stub mit
 * `{ get, getModuleState }`.
 */
import { readModel } from '../../../core/model.js';
import { State } from './model.js';

const MODULE_ID = 'morphological-box';

/**
 * @typedef {object} MorphologicalConcept
 * @property {string} instanceId der Kasten, in dem das Konzept steht
 * @property {string} conceptId
 * @property {string} name
 * @property {Array<{ parameter: string, option: string }>} picks die gewählte
 *   Option je Parameter, in Kastenreihenfolge, als Anzeigetext
 * @property {boolean} complete jeder Parameter mit Optionen hat eine Wahl
 * @property {number} conflictCount unverträgliche Paare innerhalb des Konzepts
 */

/**
 * Die Konzepte aller morphologischen Kästen auflisten, in Phasen- und Instanzreihenfolge.
 * @param {{ get: (path: string) => any, getModuleState: (id: string) => any }} sm
 * @returns {MorphologicalConcept[]}
 */
export function listMorphologicalConcepts(sm) {
  const out = [];
  for (const phaseId of Object.keys(sm.get('phases') || {})) {
    for (const inst of sm.get(`phases.${phaseId}`) ?? []) {
      if (inst.moduleId !== MODULE_ID) continue;
      const box = readModel(State, sm.getModuleState(inst.instanceId));
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
