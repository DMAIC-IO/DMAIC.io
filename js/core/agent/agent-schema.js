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
 * Regeln eines Slots in `datasets`: die des Spaltenbezugs plus `required`/`group`.
 * @param {object} slot @returns {string[]}
 */
const slotTokens = (slot) => [...ruleTokens(slot),
  ...(slot.required ? ['required'] : []), ...(slot.group ? ['group'] : [])];

/**
 * Die Auslassungspfade eines Feldes, relativ zu seinem Wert: wo `read()` nur
 * `{ $omitted: true, bytes }` liefert. Gefragt wird allein das Merkmal
 * `omitOnRead`, nie die Feldart. `list` → `[]`, `object`/`record` →
 * `.<schlüssel>`, `map` → `{}`; ein Feld mit dem Merkmal zählt als Ganzes
 * (leerer Pfad), darunter wird nicht weitergesucht.
 * @param {object} spec
 * @param {string} [prefix] bereits durchlaufener Pfad
 * @returns {string[]}
 */
export function omitPathsOf(spec, prefix = '') {
  if (!spec || typeof spec !== 'object') return [];
  if (spec.omitOnRead === true) return [prefix];
  switch (spec.kind) {
    case 'list': return omitPathsOf(spec.item, `${prefix}[]`);
    case 'map': return omitPathsOf(spec.value, `${prefix}{}`);
    case 'record': return spec.keys.flatMap((k) => omitPathsOf(spec.value, `${prefix}.${k}`));
    case 'object': return Object.entries(spec.shape).flatMap(([k, v]) => omitPathsOf(v, `${prefix}.${k}`));
    default: return [];
  }
}

/**
 * Ob der Agent ein Feld oder einen Parameter schreiben darf: `false`, wenn er
 * oder ein Teil davon `agentWrite: false` trägt. Gefragt wird allein das
 * Merkmal, nie die Feldart.
 * @param {object} spec
 * @returns {boolean}
 */
export function writableByAgent(spec) {
  if (!spec || typeof spec !== 'object') return true;
  if (spec.agentWrite === false) return false;
  switch (spec.kind) {
    case 'table': return false;
    case 'list': return writableByAgent(spec.item);
    case 'map': case 'record': return writableByAgent(spec.value);
    case 'object': return Object.values(spec.shape).every(writableByAgent);
    default: return true;
  }
}

/**
 * Die Regeln eines Parameters als Tokens: `text` mit `trim`/`nonEmpty`,
 * `date`, `time` (mit `step:<n>`), `phase`, `index` mit `afterRemovalFrom:<pfad>`, `columnRef` (mit `types:`/`minCount:`/`maxCount:`;
 * auch als Listeneintrag), `list` mit `unique`/`sorted`.
 * @param {object} spec @returns {string[]}
 */
function ruleTokens(spec) {
  switch (spec.kind) {
    case 'text': return TEXT_RULES.filter((r) => spec[r] === true);
    case 'richText': return ['richText', 'format:**fett**,*kursiv*,\\n=Zeilenumbruch,\\\\ maskiert',
      ...(spec.maxLength !== undefined ? [`maxLength:${spec.maxLength}`] : [])];
    case 'date': return ['date'];
    case 'time': return spec.step === undefined ? ['time'] : ['time', `step:${spec.step}`];
    case 'phase': return ['phase'];
    case 'columnRef': return ['columnRef',
      ...(spec.types ? [`types:${spec.types.join(',')}`] : []),
      ...(spec.minCount > 0 ? [`minCount:${spec.minCount}`] : []),
      ...(spec.maxCount !== undefined ? [`maxCount:${spec.maxCount}`] : [])];
    case 'index': return spec.afterRemovalFrom === undefined ? [] : [`afterRemovalFrom:${spec.afterRemovalFrom}`];
    case 'datasets': return ['datasets', ...(spec.multi ? ['multi'] : [])];
    case 'list': return [
      ...(spec.item?.kind === 'columnRef' ? ruleTokens(spec.item) : []),
      ...(spec.unique === true ? ['unique'] : []),
      ...(spec.sorted === true ? ['sorted'] : []),
    ];
    default: return [];
  }
}

/**
 * @param {string} name @param {{ params: Record<string, object>, returns: object|null }} def
 * @param {'model'|'viewmodel'} target
 * @returns {object} Aktion in Registry-Form
 */
function commandAction(name, def, target) {
  const keys = {};
  for (const [param, spec] of Object.entries(def.params)) {
    const rules = ruleTokens(spec);
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
 * Die Aktionen eines manuellen asynchronen Ablaufs: Start (wartet bis zum Ende) und Abbrechen.
 * @param {string} name @param {{ params: Record<string, object> }} def
 * @returns {Record<string, object>}
 */
function taskActions(name, def) {
  const start = commandAction(name, { params: def.params, returns: null }, 'viewmodel');
  return {
    [name]: { ...start, target: 'asyncTask', task: name, op: 'start', returns: 'any',
      helpKey: `asyncTasks.${name}.help`, keysHelp: `asyncTasks.${name}.params` },
    [`${name}.cancel`]: { target: 'asyncTask', task: name, op: 'cancel', params: [], returns: '{ cancelled: boolean }',
      help: '', helpKey: `asyncTasks.${name}.cancel.help` },
  };
}

/**
 * Der Registry-Eintrag eines Schema-Moduls.
 * @param {Function} Model Klasse aus `defineModel`
 * @param {Record<string, object>} [vmCommands] Viewmodel-Kommandos aus `createModule({ commands })`
 * Die Ableitungen des Models (`Model.schema.derived`, Massenfelder aus `derivedBulk`) erscheinen
 * als Lesefelder; `computed` des view-Blocks sind Ansichtshilfen und erscheinen nicht.
 * @param {{ asyncTasks?: Record<string, object> }} [opts]
 * @returns {object} `AgentModuleEntry` mit `schema: true`, `settable`, `viewFields`, `invariants`
 */
export function schemaAgentEntry(Model, vmCommands = {}, { asyncTasks = {} } = {}) {
  const schema = schemaOf(Model);
  if (!schema) throw new Error('schemaAgentEntry: Model has no schema (defineModel)');
  const actions = { read: READ_ACTION };
  const callable = (def) => Object.values(def.params ?? {}).every(writableByAgent);
  for (const [name, def] of Object.entries(schema.commands)) {
    if (callable(def)) actions[name] = commandAction(name, def, 'model');
  }
  for (const [name, def] of Object.entries(vmCommands)) {
    if (callable(def)) actions[name] = commandAction(name, def, 'viewmodel');
  }
  for (const [name, def] of Object.entries(asyncTasks)) {
    if (!def.auto && callable(def)) Object.assign(actions, taskActions(name, def));
  }
  const fields = {};
  for (const [name, spec] of Object.entries(schema.fields)) {
    const rules = ruleTokens(spec);
    const omit = omitPathsOf(spec);
    fields[name] = {
      type: describeType(spec),
      help: '',
      bulk: spec.bulk === true,
      ...(spec.bulk === true && spec.bulkKind ? { bulkKind: spec.bulkKind } : {}),
      ...(rules.length > 0 ? { rules } : {}),
      ...(omit.length > 0 ? { omit } : {}),
      ...(spec.kind === 'datasets'
        ? { slots: Object.fromEntries(Object.entries(spec.slots).map(([k, v]) => [k, slotTokens(v)])) } : {}),
    };
  }
  const derived = Object.keys(schema.derived ?? {});
  const bulkNames = schema.derivedBulk ?? [];
  for (const name of derived) {
    fields[name] = bulkNames.includes(name)
      ? { type: 'object[]', help: '', bulk: true, bulkKind: 'table', derived: true }
      : { type: 'object|null', help: '', bulk: false, derived: true };
  }
  if (Object.keys(asyncTasks).length > 0) fields.asyncTasks = { type: 'object', help: '', bulk: false, derived: true };
  return {
    tagged: true,
    available: true,
    schema: true,
    violations: [],
    reported: [],
    actions,
    fields,
    asyncTasks: Object.entries(asyncTasks).map(([name, def]) => ({
      name, auto: def.auto === true, params: Object.keys(def.params ?? {}),
    })),
    viewFields: Object.keys(schema.view),
    settable: Object.entries(schema.fields).filter(([, spec]) => writableByAgent(spec)).map(([name]) => name),
    // Die Namen der Regeln über mehrere Felder; ihren Text liest `describe`
    // unter `modules.<id>.invariants.<name>`.
    invariants: Object.keys(schema.invariants ?? {}),
  };
}

/**
 * Der Lesezustand eines Schema-Models (Massenfelder als Deskriptor).
 * Ansichtsfelder nimmt `agent-ops.js` heraus (`stripPaths` mit `viewFields`).
 * @param {object} entry aus `schemaAgentEntry`
 * @param {object} model das (reaktive) Model
 * @param {object} [options] `{ fields?, rows? }`
 * @param {Record<string, any>} [extra] weitere Quellwerte (Ableitungen), über das Model-JSON gelegt
 * @throws {Error} wenn `options.rows` kaputt ist
 * @returns {object}
 */
export function readSchemaModel(entry, model, options, extra = {}) {
  const out = projectReadState({ ...(model?.toJSON?.() ?? {}), ...extra }, entry.fields, options ?? {});
  if (out && typeof out.$invalidCall === 'string') throw new Error(out.$invalidCall);
  return out;
}
