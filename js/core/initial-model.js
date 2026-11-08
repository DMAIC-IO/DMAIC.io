/**
 * D.Mike — initial model of a module instance (initial-model.js)
 *
 * Pure helper for createModule: picks the model an instance starts with.
 * Kept out of template-module.js so it is testable without Alpine.
 */

import { activeContext } from './model.js';

/**
 * Gespeicherten Zustand in ein Model laden.
 *
 * Ein deklaratives Model (`Model.schema`, core/model.js) lädt streng; wirft
 * das, fällt nur das ungültige Feld auf seinen Vorgabewert
 * (`fromJSON(json, { repair: true })`) — ein leicht kaputter Projektstand
 * verliert so nichts Gültiges. Ausnahme: eine gespeicherte `_schema.version`,
 * die in falscher Form, neuer als `version` oder in der Migrationskette
 * unbekannt ist, wirft auch mit `repair` — der Fehler geht an den Aufrufer.
 * Andere Models laden wie bisher. `context` ist der Kontext des Models
 * (core/model.js); fehlende Felder bekommen ihre Vorgabe daraus.
 *
 * @param {{ fromJSON(d: object, opts?: object): object, schema?: object }} Model
 * @param {object} json
 * @param {object} [context] ModelContext
 * @returns {object}
 * @throws {Error} gespeicherte `_schema.version` nicht ladbar (s. o.)
 */
export function loadModel(Model, json, context) {
  if (!Model.schema) return Model.fromJSON(json);
  try {
    return Model.fromJSON(json, { context });
  } catch {
    const reset = [];
    let first = '';
    const model = Model.fromJSON(json, {
      repair: true,
      context,
      onRepair: (name, err) => { if (!reset.includes(name)) reset.push(name); first ||= err.message; },
    });
    console.warn(`[createModule] gespeicherter Zustand ungültig, Felder auf Vorgabe gesetzt: ${reset.join(', ')} (${first})`);
    return model;
  }
}

/**
 * Schema-Models entstehen im Kontext des Projekts (`activeContext`).
 * @param {{new(): object, fromJSON(d: object): object}} Model module model class
 * @param {object|null|undefined} saved persisted instance state, if any
 * @param {((context: object) => object)|undefined} createDefault optional factory for an empty instance
 * @param {object} context module context (stateManager, i18n, …)
 * @returns {object} model instance
 */
export function initialModel(Model, saved, createDefault, context) {
  const modelContext = Model.schema ? activeContext(context?.stateManager) : undefined;
  if (saved) return loadModel(Model, saved, modelContext);
  if (typeof createDefault === 'function') {
    try {
      const m = createDefault(context);
      if (m) return m;
    } catch (err) {
      console.warn('[createModule] createDefault failed, using new Model()', err);
    }
  }
  return modelContext ? new Model(modelContext) : new Model();
}
