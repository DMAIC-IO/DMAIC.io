/**
 * D.Mike — Shared module-instance helpers used by the router and
 * example-deeplink startup concern. Pure: no DOM; only touches
 * stateManager, moduleRegistry, and eventBus.
 */

import { uid } from '../uid.js';
import { CYCLES, VIRTUAL_PHASES } from '../cycles/cycles.js';

/**
 * Find the phase id whose instance array contains the given instanceId.
 * @param {object} stateManager
 * @param {string} instanceId
 * @returns {string|null}
 */
export function findInstancePhase(stateManager, instanceId) {
  for (const phaseId of Object.keys(stateManager.get('phases') || {})) {
    const insts = stateManager.get(`phases.${phaseId}`) ?? [];
    if (insts.some(i => i.instanceId === instanceId)) return phaseId;
  }
  return null;
}

/**
 * Find the first existing instance of moduleId across all phases.
 * @param {object} stateManager
 * @param {string} moduleId
 * @returns {{ instanceId: string, phaseId: string }|null}
 */
export function findExistingInstance(stateManager, moduleId) {
  for (const phaseId of Object.keys(stateManager.get('phases') || {})) {
    const insts = stateManager.get(`phases.${phaseId}`) ?? [];
    const found = insts.find(i => i.moduleId === moduleId);
    if (found) return { instanceId: found.instanceId, phaseId };
  }
  return null;
}

/**
 * Das Lese-Abbild für `canAddInstance` aus dem Projektzustand.
 * @param {object} stateManager
 * @param {string} activeCycle
 * @param {boolean} completed
 * @returns {{ activeCycle: string, instances: Map<string, { module: string, phase: string }>, completed: boolean }}
 */
export function instanceWorld(stateManager, activeCycle, completed) {
  const instances = new Map();
  for (const phase of Object.keys(stateManager.get('phases') || {})) {
    for (const item of stateManager.get(`phases.${phase}`) ?? []) {
      instances.set(item.instanceId, { module: item.moduleId, phase });
    }
  }
  return { activeCycle, instances, completed: completed === true };
}

/**
 * Create a new instance of moduleId in its default phase for the active cycle
 * (`defaultPhaseFor` — dieselbe Regel, die das Anlegemenü füllt), persist it,
 * and emit `module:added`. Returns the new instanceId.
 * @param {object} stateManager
 * @param {object} moduleRegistry
 * @param {object} eventBus
 * @param {string} moduleId
 * @param {object} def  Module definition (has .phase and .cycles)
 * @param {object} [options]
 * @param {boolean} [options.silent=false]  When true, emit `module:added` with
 *   `silent: true` so the workspace refreshes tabs WITHOUT eagerly mounting or
 *   activating a live instance (used by headless Dev-Tools seeding, so the
 *   persisted example is only read when the user later opens the tab).
 * @param {string} [options.phase]  Zielphase, die die Ableitung überschreibt.
 *   Genutzt von der Agentenfläche: dort hat der Prüfer die Phase bereits
 *   gegen `allowedPhases` geprüft, bevor irgendein Seiteneffekt passiert.
 * @returns {string}
 * @throws {Error} wenn `canAddInstance` ablehnt; der Fehler trägt `reason`
 *   (`'completed'|'wrongPhase'|'singleton'`) und ggf. `allowedPhases`.
 */
export function createInstance(stateManager, moduleRegistry, eventBus, moduleId, def, { silent = false, phase } = {}) {
  // Keine eigene Ableitung mehr: die Vorgabephase ist die, die auch das
  // Anlegemenü anbietet. Der ausdrückliche `phase`-Überschreiber bleibt —
  // ihn braucht die Agentenfläche für die 26 mehrdeutigen Paare.
  const cycle = moduleRegistry.getActiveCycle();
  const targetPhase = phase || defaultPhaseFor(def, cycle);

  // Dieselbe Regel wie Kachel und Agentenfläche. Eine Absage wirft, statt
  // still nichts zu tun: ein Aufrufer, der eine Instanz-Id erwartet, bekäme
  // sonst eine Phantom-Id. `reason` (und `allowedPhases`) hängen am Fehler.
  const verdict = canAddInstance(def, targetPhase, instanceWorld(stateManager, cycle, stateManager.isCompleted?.()));
  if (!verdict.ok) {
    throw Object.assign(new Error(`createInstance: ${moduleId} abgelehnt (${verdict.reason})`), verdict);
  }

  const instanceId = uid();
  const phases = stateManager.get(`phases.${targetPhase}`) ?? [];
  phases.push({ instanceId, moduleId, order: phases.length, state: {} });
  stateManager.set(`phases.${targetPhase}`, phases);
  eventBus.emit('module:added', { moduleId, phase: targetPhase, instanceId, silent });
  return instanceId;
}

/**
 * Die Phasen, in denen dieses Modul in diesem Zyklus angelegt werden darf.
 *
 * Die EINZIGE Quelle dieser Regel. Sie gewinnt nicht aus Geschmack, sondern
 * weil `module-registry.js:getByCycleAndPhase` so filtert: ein Modul ohne
 * Zyklus-Zuordnung erscheint im Anlegemenü unter `extras` und nirgends
 * sonst. Jede Ableitung, die daneben auf `def.phase` zurückfällt, erzeugt
 * Instanzen in Phasen, deren Menü sie nie angeboten hat.
 *
 * @param {{ phase?: string, cycles?: object }} def  die Moduldefinition
 * @param {string} activeCycle
 * @returns {string[]} erste Position ist die Vorgabe, der Rest ist Wahl
 */
export function allowedPhasesFor(def, activeCycle) {
  if (def.phase === VIRTUAL_PHASES.data.id) return [VIRTUAL_PHASES.data.id];
  const mapping = def.cycles?.[activeCycle];
  if (!mapping) return [VIRTUAL_PHASES.extras.id];
  const extra = Array.isArray(mapping.allowedPhases) ? mapping.allowedPhases : [];
  return [mapping.phase, ...extra.filter(p => p !== mapping.phase)];
}

/**
 * Die Vorgabephase: erste Position aus `allowedPhasesFor`.
 *
 * In 112 der 138 Modul/Zyklus-Paare ist sie die einzige Möglichkeit und
 * niemand muss eine Phase nennen; in 26 Paaren ist die Phase eine fachliche
 * Entscheidung, die ein Aufrufer treffen darf.
 *
 * @param {{ phase?: string, cycles?: object }} def
 * @param {string} activeCycle
 * @returns {string}
 */
export function defaultPhaseFor(def, activeCycle) {
  return allowedPhasesFor(def, activeCycle)[0];
}

/**
 * Darf dieses Modul in diese Phase angelegt werden?
 *
 * Die drei Vorbedingungen an einem Ort: Phasenzugehörigkeit, Singleton,
 * abgeschlossenes Projekt. `reason` bleibt bei den drei Zeichenketten, die
 * `dmaic-tiles.js` heute an die Kachel-Beschriftung weitergibt
 * (`phases.wrongPhase`, `phases.singletonExists`).
 *
 * @param {{ id: string, phase?: string, cycles?: object, singleton?: boolean }} def
 * @param {string} phase  die Zielphase
 * @param {{ activeCycle: string,
 *           instances: Map<string, { module: string, phase: string }>,
 *           completed: boolean }} world
 *   das Lese-Abbild aus `buildWorld` — kein neuer Zustandsbegriff.
 *   `activeCycle` ist die Kennung des aktiven Zyklus und ist Pflicht.
 * @returns {{ ok: true } | { ok: false, reason: 'wrongPhase'|'singleton'|'completed', allowedPhases?: string[] }}
 * @throws {Error} wenn `world.activeCycle` fehlt oder keinen bekannten Zyklus nennt
 */
export function canAddInstance(def, phase, world) {
  // Zuerst das abgeschlossene Projekt: dort ist der Modulsatz eingefroren,
  // und `wrongPhase` wäre die unwichtigere von zwei wahren Antworten.
  if (world?.completed === true) return { ok: false, reason: 'completed' };

  // Ohne gültige Zyklus-Kennung gibt es keine Antwort, nur ein Raten:
  // `allowedPhasesFor` fände für einen unbekannten Zyklus keine Zuordnung
  // und meldete `extras` — plausibel und falsch, ohne jedes Signal. Lieber
  // lautstark scheitern als eine erfundene Phasenliste ausliefern.
  const activeCycle = world?.activeCycle;
  if (typeof activeCycle !== 'string' || !CYCLES[activeCycle]) {
    throw new Error(
      `canAddInstance: world.activeCycle nennt keinen bekannten Zyklus (${String(activeCycle)})`,
    );
  }
  const allowed = allowedPhasesFor(def, activeCycle);
  if (!allowed.includes(phase)) {
    return { ok: false, reason: 'wrongPhase', allowedPhases: allowed };
  }

  // Dieselbe Bedeutung wie `isSingleton` in agent-catalog.js (das hier nicht
  // importiert werden kann: es importiert diese Datei).
  if (def.singleton === true) {
    for (const inst of world.instances.values()) {
      if (inst.module === def.id) return { ok: false, reason: 'singleton' };
    }
  }

  return { ok: true };
}
