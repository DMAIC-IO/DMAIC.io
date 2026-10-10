/**
 * D.Mike — initial model of a module instance (initial-model.js)
 *
 * Pure helper for createModule: picks the model an instance starts with.
 * Kept out of template-module.js so it is testable without Alpine.
 */

/**
 * @param {{new(): object, fromJSON(d: object): object}} Model module model class
 * @param {object|null|undefined} saved persisted instance state, if any
 * @param {((context: object) => object)|undefined} createDefault optional factory for an empty instance
 * @param {object} context module context (stateManager, i18n, …)
 * @returns {object} model instance
 */
export function initialModel(Model, saved, createDefault, context) {
  if (saved) return Model.fromJSON(saved);
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
