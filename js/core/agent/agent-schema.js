/**
 * D.Mike — Agentenfläche aus dem Schema (agent-schema.js)
 *
 * Für ein Modul mit deklarativem Model (`core/model.js`) entsteht der
 * Registry-Eintrag zur Laufzeit aus `Model.schema` — in DERSELBEN Form wie
 * ein Eintrag von `agent-registry.generated.js`, damit Katalog, Prüfer und
 * `describe` unverändert bleiben.
 *
 * Kommandos nehmen über die Fläche genau EIN Objekt (`args: [{ … }]`). In
 * `describe` erscheint dafür ein Parameter `command` vom Typ `object`; seine
 * Schlüssel stehen in `keys`, ihre Hilfe unter
 * `modules.<id>.actions.<kommando>.params.<param>` (`keysHelp`).
 *
 * Rein: kein DOM. Importiert NICHT agent-read-mixin.js (zöge die generierte
 * Registry ins Bundle).
 */
import { describeType, schemaOf } from '../model.js';
import { projectReadState } from './agent-read.js';

/** Die `read`-Aktion jedes Schema-Moduls, wortgleich zum geteilten `read()`. */
const READ_ACTION = Object.freeze({
  params: [{
    name: 'options', type: 'object', optional: true,
    help: '`{ fields?: string[], rows?: { from: number, to: number } }`',
  }],
  returns: 'AgentRead',
  help: 'Den vollständigen Lesezustand dieser Instanz liefern.',
});

/** Rückfalltext des Objektparameters, wenn i18n keinen Satz führt. */
const COMMAND_PARAM_HELP = 'Das Kommando als ein Objekt; seine Schlüssel stehen unter keys.';

/** Die `text`-Optionen, die als `rules` im Schlüssel erscheinen (feste Reihenfolge). */
const TEXT_RULES = ['trim', 'nonEmpty'];

/**
 * @param {string} name @param {{ params: Record<string, object>, returns: object|null }} def
 * @param {'model'|'viewmodel'} target
 * @returns {object} Aktion in Registry-Form
 */
function commandAction(name, def, target) {
  const keys = {};
  for (const [param, spec] of Object.entries(def.params)) {
    const rules = spec.kind === 'text' ? TEXT_RULES.filter((r) => spec[r] === true) : [];
    keys[param] = {
      type: describeType(spec),
      help: '',
      ...(spec.optional === true ? { optional: true } : {}),
      ...(rules.length ? { rules } : {}),
    };
  }
  return {
    target,
    params: [{ name: 'command', type: 'object', optional: false, help: COMMAND_PARAM_HELP }],
    returns: def.returns ? describeType(def.returns) : 'void',
    help: '',
    keysOf: name,
    keysHelp: `actions.${name}.params`,
    keys,
  };
}

/**
 * Der Registry-Eintrag eines Schema-Moduls.
 * @param {Function} Model Klasse aus `defineModel`
 * @param {Record<string, object>} [vmCommands] Viewmodel-Kommandos aus `createModule({ commands })`
 * @returns {object} `AgentModuleEntry` mit `schema: true`, `settable`, `viewFields`
 */
export function schemaAgentEntry(Model, vmCommands = {}) {
  const schema = schemaOf(Model);
  if (!schema) throw new Error('schemaAgentEntry: Model has no schema (defineModel)');
  const actions = { read: READ_ACTION };
  for (const [name, def] of Object.entries(schema.commands)) actions[name] = commandAction(name, def, 'model');
  for (const [name, def] of Object.entries(vmCommands)) actions[name] = commandAction(name, def, 'viewmodel');
  const fields = {};
  for (const [name, spec] of Object.entries(schema.fields)) {
    fields[name] = {
      type: describeType(spec),
      help: '',
      bulk: spec.bulk === true,
      ...(spec.bulk === true && spec.bulkKind ? { bulkKind: spec.bulkKind } : {}),
    };
  }
  return {
    tagged: true,
    available: true,
    schema: true,
    violations: [],
    reported: [],
    actions,
    fields,
    viewFields: Object.keys(schema.view),
    settable: Object.keys(schema.fields),
  };
}

/**
 * Der Lesezustand eines Schema-Models (Massenfelder als Deskriptor).
 * Ansichtsfelder nimmt `agent-ops.js` heraus (`stripPaths` mit `viewFields`).
 * @param {object} entry aus `schemaAgentEntry`
 * @param {object} model das (reaktive) Model
 * @param {object} [options] `{ fields?, rows? }`
 * @throws {Error} wenn `options.rows` kaputt ist
 * @returns {object}
 */
export function readSchemaModel(entry, model, options) {
  const out = projectReadState(model?.toJSON?.() ?? {}, entry.fields, options ?? {});
  if (out && typeof out.$invalidCall === 'string') throw new Error(out.$invalidCall);
  return out;
}
