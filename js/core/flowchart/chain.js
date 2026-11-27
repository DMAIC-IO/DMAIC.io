/**
 * D.Mike — Flowchart-Kette (chain.js)
 *
 * Reine Funktionen auf einer Schrittliste der Flowchart-Module
 * (`steps: list(object({ id, …, substeps: list(object({ id, … })) }))`).
 * Jede arbeitet auf Kopien und liefert eine neue Liste; die Eingabe und ihre
 * Schritte bleiben unverändert. Indizes sind Endindizes: die Position des
 * Eintrags nach der Änderung. Die Kommandos der Flowchart-Models rufen sie in
 * `run`.
 *
 * Fehler tragen `param` (`core/validate.js`): eine unbekannte id den Namen
 * ihres Parameters (`id`, `stepId`, `substepId`), ein Index außerhalb des
 * Bereichs `index`.
 */
import { requireIndex, requireKnownId } from '../validate.js';

/**
 * @typedef {{ id: string, substeps?: Array<{ id: string }> }} ChainStep
 */

/** Position einer id, sonst Fehler mit `param` = `name`. */
function positionOf(list, id, name) {
  const ids = list.map((x) => x.id);
  requireKnownId(name, id, ids);
  return ids.indexOf(id);
}

/** Eintrag an `from` herausnehmen und an `to` einsetzen; neue Liste. */
function relocate(list, from, to) {
  const out = list.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/** Den Schritt `stepId` durch `fn(schritt)` ersetzen; neue Liste. */
function withStep(steps, stepId, fn) {
  const at = positionOf(steps, stepId, 'stepId');
  const out = steps.slice();
  out[at] = fn(steps[at]);
  return out;
}

/**
 * Einen Schritt einfügen.
 * @template {ChainStep} S
 * @param {S[]} steps @param {S} step
 * @param {number} [index] `0…länge`; ohne Index am Ende
 * @returns {S[]}
 * @throws {Error} `param: 'index'` außerhalb des Bereichs
 */
export function insertStep(steps, step, index = steps.length) {
  requireIndex('index', index, steps.length);
  const out = steps.slice();
  out.splice(index, 0, step);
  return out;
}

/**
 * Einen Schritt entfernen.
 * @template {ChainStep} S
 * @param {S[]} steps @param {string} id
 * @returns {S[]}
 * @throws {Error} `param: 'id'` bei unbekannter id
 */
export function removeStep(steps, id) {
  const at = positionOf(steps, id, 'id');
  return steps.filter((_, i) => i !== at);
}

/**
 * Einen Schritt an einen Endindex verschieben.
 * @template {ChainStep} S
 * @param {S[]} steps @param {string} id @param {number} index `0…länge−1`
 * @returns {S[]}
 * @throws {Error} `param: 'id'` bzw. `param: 'index'`
 */
export function moveStep(steps, id, index) {
  const at = positionOf(steps, id, 'id');
  requireIndex('index', index, steps.length, { existing: true });
  return relocate(steps, at, index);
}

/**
 * Einen Unterschritt am Ende des Schritts anlegen.
 * @template {ChainStep} S
 * @param {S[]} steps @param {string} stepId @param {{ id: string }} substep
 * @returns {S[]}
 * @throws {Error} `param: 'stepId'` bei unbekanntem Schritt
 */
export function addSubstep(steps, stepId, substep) {
  return withStep(steps, stepId, (s) => ({ ...s, substeps: [...(s.substeps ?? []), substep] }));
}

/**
 * Einen Unterschritt entfernen.
 * @template {ChainStep} S
 * @param {S[]} steps @param {string} stepId @param {string} substepId
 * @returns {S[]}
 * @throws {Error} `param: 'stepId'` bzw. `param: 'substepId'`
 */
export function removeSubstep(steps, stepId, substepId) {
  return withStep(steps, stepId, (s) => {
    const subs = s.substeps ?? [];
    const at = positionOf(subs, substepId, 'substepId');
    return { ...s, substeps: subs.filter((_, i) => i !== at) };
  });
}

/**
 * Einen Unterschritt innerhalb seines Schritts an einen Endindex verschieben.
 * @template {ChainStep} S
 * @param {S[]} steps @param {string} stepId @param {string} substepId
 * @param {number} index `0…länge−1` der Unterschritte
 * @returns {S[]}
 * @throws {Error} `param: 'stepId'`, `'substepId'` bzw. `'index'`
 */
export function moveSubstep(steps, stepId, substepId, index) {
  return withStep(steps, stepId, (s) => {
    const subs = s.substeps ?? [];
    const at = positionOf(subs, substepId, 'substepId');
    requireIndex('index', index, subs.length, { existing: true });
    return { ...s, substeps: relocate(subs, at, index) };
  });
}
