/**
 * D.Mike — initial model of a module instance (initial-model.js)
 *
 * Pure helper for createModule: picks the model an instance starts with.
 * Kept out of template-module.js so it is testable without Alpine.
 */

/**
 * Gespeicherten Zustand in ein Model laden.
 *
 * Ein deklaratives Model (`Model.schema`, core/model.js) lädt streng; wirft
 * das, fällt nur das ungültige Feld auf seinen Vorgabewert
 * (`fromJSON(json, { repair: true })`) — ein leicht kaputter Projektstand
 * verliert so nichts Gültiges. Ausnahme: eine gespeicherte `_schema.version`,
 * die in falscher Form, neuer als `version` oder in der Migrationskette
 * unbekannt ist, wirft auch mit `repair` — der Fehler geht an den Aufrufer.
 * Andere Models laden wie bisher.
 *
 * @param {{ fromJSON(d: object, opts?: object): object, schema?: object }} Model
 * @param {object} json
 * @returns {object}
 * @throws {Error} gespeicherte `_schema.version` nicht ladbar (s. o.)
 */
export function loadModel(Model, json) {
  if (!Model.schema) return Model.fromJSON(json);
  try {
    return Model.fromJSON(json);
  } catch (err) {
    console.warn(`[createModule] gespeicherter Zustand ungültig, Feld auf Vorgabe gesetzt: ${err.message}`);
    return Model.fromJSON(json, { repair: true });
  }
}

/**
 * @param {{new(): object, fromJSON(d: object): object}} Model module model class
 * @param {object|null|undefined} saved persisted instance state, if any
 * @param {((context: object) => object)|undefined} createDefault optional factory for an empty instance
 * @param {object} context module context (stateManager, i18n, …)
 * @returns {object} model instance
 */
export function initialModel(Model, saved, createDefault, context) {
  if (saved) return loadModel(Model, saved);
  if (typeof createDefault === 'function') {
    try {
      const m = createDefault(context);
      if (m) return m;
    } catch (err) {
      console.warn('[createModule] createDefault failed, using new Model()', err);
    }
  }
  return new Model();
}
