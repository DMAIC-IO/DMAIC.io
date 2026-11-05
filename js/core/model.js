/**
 * D.Mike — Deklaratives Model (model.js)
 *
 * `defineModel({ fields, view, commands })` baut aus einem Schema-Literal eine
 * Model-Klasse: je Feld ein prüfender Accessor am Prototyp, `toJSON` /
 * `fromJSON` mit Vorgabewerten, je Kommando eine geprüfte Methode und
 * `execute`. Das Schema bleibt als `Model.schema` lesbar; daraus entstehen die
 * Agentenfläche (`core/agent/agent-schema.js`), die erzeugten Typen
 * (`tools/build/model-types.mjs`) und die Attribute von `x-field`
 * (`core/field-directive.js`).
 *
 * `defineState(fields)` beschreibt UI-State mit denselben Feldkonstruktoren:
 * ein schlichtes Objekt je Komponente, ungeprüft beschrieben, nie gespeichert.
 *
 * Werte liegen in `this._v`, nicht in `#privaten` Feldern — die brechen mit
 * Alpines Proxy. Accessoren liegen am Prototyp: `Object.keys(model)` liefert
 * nur `['_v']`; wer ein Model kopiert, nimmt `toJSON()`.
 *
 * `version`/`migrations`: gespeicherte Stände tragen `_schema: { name, version }`;
 * `fromJSON` hebt ältere Stände über die Kette `'a→b'` auf `version` (fehlend =
 * `'0'`), neuere lehnt es ab.
 *
 * Rein: kein DOM, kein Alpine, kein Kontext.
 */
import {
  requireText, requireNumber, requireBoolean, requireEnum, requireIndex,
  requireKnownId, requireKeys, requireForm,
} from './validate.js';

// ─── Feld-Konstruktoren ─────────────────────────────────────

/** @param {string} kind @param {object} props @param {object} [opts] @returns {Readonly<object>} */
function spec(kind, props, opts = {}) {
  const { kind: _ignored, ...rest } = opts;
  return Object.freeze({ kind, ...props, ...rest });
}

/**
 * Freier Text. `trim`: der geprüfte Wert ist getrimmt; `nonEmpty`: leer
 * (nach `trim`) wird abgelehnt.
 * @param {{ trim?: boolean, nonEmpty?: boolean } & object} [opts] @returns {Readonly<object>}
 */
export const text = (opts) => spec('text', {}, opts);
/** Zahl, Grenzen wie `requireNumber`. @param {object} [opts] @returns {Readonly<object>} */
export const number = (opts) => spec('number', {}, opts);
/** Wahrheitswert. @param {object} [opts] @returns {Readonly<object>} */
export const boolean = (opts) => spec('boolean', {}, opts);
/** Aufzählung. @param {readonly (string|number)[]} values @param {object} [opts] @returns {Readonly<object>} */
export const oneOf = (values, opts) => spec('oneOf', { values: Object.freeze([...values]) }, opts);
/** Position in der Liste unter `path`. @param {string} path @param {object} [opts] @returns {Readonly<object>} */
export const index = (path, opts) => spec('index', { path }, opts);
/**
 * Eine vorhandene id aus der Liste unter `path`.
 * @param {string} path @param {{ key?: string }} [opts] @returns {Readonly<object>}
 */
export const idOf = (path, { key = 'id', ...opts } = {}) => spec('idOf', { path, key }, opts);
/** Liste. @param {object} item @param {object} [opts] @returns {Readonly<object>} */
export const list = (item, opts) => spec('list', { item }, opts);
/** Objekt mit festen Schlüsseln, gleicher Werttyp. @param {readonly string[]} keys @param {object} value @param {object} [opts] @returns {Readonly<object>} */
export const record = (keys, value, opts) => spec('record', { keys: Object.freeze([...keys]), value }, opts);
/** Objekt mit fester Form. @param {Record<string, object>} shape @param {object} [opts] @returns {Readonly<object>} */
export const object = (shape, opts) => spec('object', { shape: Object.freeze({ ...shape }) }, opts);

/**
 * Ein Kommando: Parameter, Rückgabetyp und Implementierung an einer Stelle.
 * `run` bekommt die geprüften Parameter als ein Objekt; `this` ist das
 * reaktive Model (bzw. das Viewmodel bei Viewmodel-Kommandos) — darum keine
 * Pfeilfunktion.
 *
 * `current(fixed)` liefert zu festen Argumenten die übrigen Parameter zum
 * aktuellen Stand (Startwerte eines Formulars). `confirm(args)` liefert
 * `null` oder `{ key, params? }` für eine Rückfrage; `key` ist relativ zu
 * `modules.<id>.`. Beide: `this` = Model, rein, nicht beobachtet, nur von
 * der Oberfläche ausgewertet.
 * @param {{ params?: Record<string, object>, returns?: object|null, run: (this: any, args: any) => any,
 *   current?: (this: any, fixed: any) => object, confirm?: (this: any, args: any) => ({ key: string, params?: object }|null) }} def
 * @returns {Readonly<{ params: Record<string, object>, returns: object|null, run: (this: any, args: any) => any,
 *   current?: Function, confirm?: Function }>}
 */
export function command(def) {
  if (typeof def?.run !== 'function') throw new Error('command: run must be a function');
  for (const hook of ['current', 'confirm']) {
    if (def[hook] !== undefined && typeof def[hook] !== 'function') throw new Error(`command: ${hook} must be a function`);
  }
  return Object.freeze({
    params: Object.freeze({ ...(def.params ?? {}) }),
    returns: def.returns ?? null,
    run: def.run,
    ...(def.current ? { current: def.current } : {}),
    ...(def.confirm ? { confirm: def.confirm } : {}),
  });
}

// ─── Werte ──────────────────────────────────────────────────

/** @param {any} v @returns {boolean} ein schlichtes Objekt (auch hinter Alpines Proxy) */
export function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Tiefe Kopie über Listen und Objekte. Kein `structuredClone`: das scheitert
 * an Alpines Proxy.
 * @param {any} v @returns {any}
 */
export function cloneJSON(v) {
  if (Array.isArray(v)) return v.map(cloneJSON);
  if (v !== null && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = cloneJSON(v[k]);
    return out;
  }
  return v;
}

/**
 * Der Vorgabewert eines Feldes, jedes Mal frisch.
 * @param {object} s Feld-Spec
 * @returns {any}
 */
export function defaultOf(s) {
  if (Object.hasOwn(s, 'default')) return cloneJSON(s.default);
  if (s.nullable) return null;
  switch (s.kind) {
    case 'text': case 'idOf': return '';
    case 'number': case 'index': return 0;
    case 'boolean': return false;
    case 'oneOf': return s.values[0];
    case 'list': return [];
    case 'record': return Object.fromEntries(s.keys.map(k => [k, defaultOf(s.value)]));
    case 'object': return Object.fromEntries(Object.entries(s.shape)
      .filter(([, v]) => v.optional !== true).map(([k, v]) => [k, defaultOf(v)]));
    default: throw new Error(`defineModel: unknown kind ${JSON.stringify(s.kind)}`);
  }
}

const PATH_TOKEN = /([A-Za-z_$][\w$]*)|\.([A-Za-z_$][\w$]*)|\[([A-Za-z_$][\w$]*)\]/y;

/**
 * Pfad wie `columns[sourceCol]` oder `events` in Schritte zerlegen. Das
 * erste Segment ist ein Feld; `.key` ein fester Schlüssel; `[name]` der Wert
 * des Parameters `name` (ersatzweise des Feldes `name`).
 * @param {string} path @returns {{ kind: 'field'|'key'|'ref', name: string }[]}
 */
export function parsePath(path) {
  /** @type {{ kind: 'field'|'key'|'ref', name: string }[]} */
  const out = [];
  PATH_TOKEN.lastIndex = 0;
  while (PATH_TOKEN.lastIndex < path.length) {
    const at = PATH_TOKEN.lastIndex;
    const m = PATH_TOKEN.exec(path);
    if (!m || (out.length === 0 && !m[1]) || (out.length > 0 && m[1])) {
      throw new Error(`defineModel: invalid path ${JSON.stringify(path)} at ${at}`);
    }
    out.push(m[1] ? { kind: 'field', name: m[1] } : m[2] ? { kind: 'key', name: m[2] } : { kind: 'ref', name: m[3] });
  }
  if (out.length === 0) throw new Error(`defineModel: empty path`);
  return out;
}

/** @param {string} path @param {{ root?: object, params?: object }} ctx @returns {any} */
function resolvePath(path, ctx) {
  const [first, ...rest] = parsePath(path);
  let node = ctx.root?.[first.name];
  for (const t of rest) {
    if (node === null || node === undefined) return undefined;
    const key = t.kind === 'key' ? t.name
      : (ctx.params && Object.hasOwn(ctx.params, t.name) ? ctx.params[t.name] : ctx.root?.[t.name]);
    node = node[key];
  }
  return node;
}

function bounds(s) {
  const out = {};
  for (const k of ['min', 'max', 'exclusiveMin', 'exclusiveMax', 'integer']) if (s[k] !== undefined) out[k] = s[k];
  return out;
}

/**
 * Einen Wert gegen seine Spec prüfen; liefert die normalisierte Kopie.
 * @param {object} s Feld-Spec
 * @param {string} name Name in der Meldung (`columns.suppliers[1]`)
 * @param {any} value
 * @param {{ root?: object, params?: object }} [ctx] Wurzel für Pfade; Parameter eines Kommandos
 * @throws {Error} in der Vertragsform von `core/validate.js`
 * @returns {any}
 */
export function checkValue(s, name, value, ctx = {}) {
  if (s.nullable && value === null) return null;
  switch (s.kind) {
    case 'text': {
      const v = requireText(name, value);
      const out = s.trim === true ? v.trim() : v;
      if (s.nonEmpty === true) requireForm(name, value, out !== '', 'a non-empty text');
      return out;
    }
    case 'number': return requireNumber(name, value, bounds(s));
    case 'boolean': return requireBoolean(name, value);
    case 'oneOf': return requireEnum(name, value, s.values, { numeric: s.values.some(v => typeof v === 'number') });
    case 'index': {
      const target = resolvePath(s.path, ctx);
      requireIndex(name, value, Array.isArray(target) ? target.length : 0, { existing: s.existing === true });
      return value;
    }
    case 'idOf': {
      const target = resolvePath(s.path, ctx);
      requireKnownId(name, value, Array.isArray(target) ? target.map(e => e?.[s.key]) : []);
      return value;
    }
    case 'list':
      requireForm(name, value, Array.isArray(value), 'a list');
      return value.map((v, i) => checkValue(s.item, `${name}[${i}]`, v, ctx));
    case 'record': {
      requireForm(name, value, isPlainObject(value), `an object with keys ${s.keys.join(', ')}`);
      for (const k of Object.keys(value)) requireKnownId(`${name} key`, k, s.keys);
      requireKeys(name, value, s.keys.map(k => ({ name: k })), 'key');
      return Object.fromEntries(s.keys.map(k => [k, checkValue(s.value, `${name}.${k}`, value[k], ctx)]));
    }
    case 'object': {
      const keys = Object.keys(s.shape);
      requireForm(name, value, isPlainObject(value), `an object with keys ${keys.join(', ')}`);
      for (const k of Object.keys(value)) requireKnownId(`${name} key`, k, keys);
      requireKeys(name, value, keys.map(k => ({ name: k, optional: s.shape[k].optional === true })), 'key');
      const out = {};
      for (const k of keys) if (Object.hasOwn(value, k)) out[k] = checkValue(s.shape[k], `${name}.${k}`, value[k], ctx);
      return out;
    }
    default: throw new Error(`defineModel: unknown kind ${JSON.stringify(s.kind)}`);
  }
}

/**
 * Liest die Spec (irgendwo im Baum) einen Pfad, also `index` oder `idOf`?
 * @param {object} s @returns {boolean}
 */
function usesPath(s) {
  switch (s.kind) {
    case 'index': case 'idOf': return true;
    case 'list': return usesPath(s.item);
    case 'record': return usesPath(s.value);
    case 'object': return Object.values(s.shape).some(usesPath);
    default: return false;
  }
}

/** @param {string|number} v @returns {string} */
const literal = (v) => (typeof v === 'string' ? `'${v}'` : String(v));

/**
 * Der Typ einer Spec als Text in JSDoc-/TypeScript-Schreibweise — für
 * `describe` und für die erzeugten Typen.
 * @param {object} s @returns {string}
 */
export function describeType(s) {
  let t;
  switch (s.kind) {
    case 'text': case 'idOf': t = 'string'; break;
    case 'number': case 'index': t = 'number'; break;
    case 'boolean': t = 'boolean'; break;
    case 'oneOf': t = s.values.map(literal).join('|'); break;
    case 'list': { const item = describeType(s.item); t = item.includes('|') ? `Array<${item}>` : `${item}[]`; break; }
    case 'record': t = `Record<${s.keys.map(literal).join('|')}, ${describeType(s.value)}>`; break;
    case 'object': t = `{ ${Object.entries(s.shape)
      .map(([k, v]) => `${k}${v.optional ? '?' : ''}: ${describeType(v)}`).join(', ')} }`; break;
    default: throw new Error(`defineModel: unknown kind ${JSON.stringify(s.kind)}`);
  }
  return s.nullable ? `${t}|null` : t;
}

// ─── Kommandos ──────────────────────────────────────────────

/**
 * Die Parameter eines Kommandos prüfen, in Erklärungsreihenfolge — ein
 * Pfad wie `columns[sourceCol]` sieht so den schon geprüften `sourceCol`.
 * @param {string} name @param {Record<string, object>} params @param {any} cmd @param {object} root
 * @returns {object} die geprüften Parameter
 */
function checkParams(name, params, cmd, root) {
  const names = Object.keys(params);
  const given = cmd === undefined ? {} : cmd;
  requireForm(name, given, isPlainObject(given), names.length ? `an object with ${names.join(', ')}` : 'an empty object');
  for (const k of Object.keys(given)) {
    try { requireKnownId(`${name} param`, k, names); } catch (err) { err.param = k; throw err; }
  }
  requireKeys(name, given, names.map(n => ({ name: n, optional: params[n].optional === true })));
  const args = {};
  for (const n of names) {
    if (!Object.hasOwn(given, n)) continue;
    args[n] = checkValue(params[n], n, given[n], { root, params: args });
  }
  return args;
}

/**
 * Ein Kommando prüfen, ausführen, melden. Der einzige Weg zu `run`.
 * @param {string} name Kommandoname
 * @param {{ params: object, run: Function }} def aus `command()`
 * @param {object} self `this` für `run` (Model oder Viewmodel)
 * @param {object} root das Model: Wurzel der Pfade, Träger des Beobachters
 * @param {any} [cmd] die Parameter als ein Objekt
 * @returns {any} das Ergebnis von `run`
 */
export function runCommand(name, def, self, root, cmd) {
  const args = checkParams(name, def.params, cmd, root);
  const result = def.run.call(self, args);
  const observer = root?._obs;
  if (typeof observer === 'function') observer(name, cloneJSON(args), result);
  return result;
}

/**
 * Die Kommando-Definition zu einem Namen aus dem Schema des Models.
 * @param {object} model Model oder Model-Klasse @param {string} name Kommandoname
 * @returns {any} die Definition aus `command()`
 * @throws {Error} unbekanntes Kommando
 */
export function commandDefOf(model, name) {
  const commands = schemaOf(model)?.commands ?? {};
  requireKnownId('command', name, Object.keys(commands));
  return commands[name];
}

/**
 * Die übrigen Parameter eines Kommandos zum aktuellen Stand (`current` der
 * Kommando-Definition), sonst `{}`.
 * @param {object} model @param {string} name Kommandoname @param {object} fixed feste Argumente
 * @returns {object}
 * @throws {Error} unbekanntes Kommando; Rückgabeschlüssel, der kein Parameter ist
 */
export function currentOf(model, name, fixed) {
  const def = commandDefOf(model, name);
  if (!def.current) return {};
  const out = def.current.call(model, fixed) ?? {};
  const names = Object.keys(def.params);
  for (const k of Object.keys(out)) requireKnownId(`${name} current key`, k, names);
  return out;
}

/**
 * Die Rückfrage eines Kommandos zu diesen Argumenten: erst prüfen (ungültige
 * Argumente werfen, bevor gefragt wird), dann `confirm`.
 * @param {object} model @param {string} name Kommandoname @param {object} args
 * @returns {{ key: string, params?: object }|null}
 * @throws {Error} unbekanntes Kommando oder ungültige Argumente
 */
export function confirmOf(model, name, args) {
  const def = commandDefOf(model, name);
  const checked = checkParams(name, def.params, args, model);
  return def.confirm ? (def.confirm.call(model, checked) ?? null) : null;
}

/**
 * Den Beobachter eines Models setzen (`createModule` macht daraus
 * `command:executed` auf dem Event-Bus — das Model kennt den Bus nicht).
 * Nicht aufzählbar: weder in `Object.keys`, noch in `Object.assign`, noch in `toJSON`.
 * @param {object} model @param {(command: string, args: object, result: any) => void} fn
 * @returns {void}
 */
export function setCommandObserver(model, fn) {
  Object.defineProperty(model, '_obs', { value: fn, writable: true, configurable: true, enumerable: false });
}

/**
 * Mehrere Inhaltsfelder setzen: alles prüfen, dann alles schreiben
 * (`instance.set`). Ansichtsfelder sind nicht setzbar.
 * @param {object} model @param {any} values
 * @throws {Error} beim ersten ungültigen Namen oder Wert; dann ist nichts geschrieben
 * @returns {object} die normalisierten Werte
 */
export function setFields(model, values) {
  const { fields } = schemaOf(model);
  const names = Object.keys(fields);
  requireForm('values', values, isPlainObject(values), `an object with any of ${names.join(', ')}`);
  for (const k of Object.keys(values)) requireKnownId('field', k, names);
  const staged = {};
  for (const k of names) staged[k] = model[k];
  const out = {};
  for (const k of names) {
    if (!Object.hasOwn(values, k)) continue;
    out[k] = checkValue(fields[k], k, values[k], { root: staged });
    staged[k] = out[k];
  }
  for (const k of Object.keys(out)) model[k] = out[k];
  return cloneJSON(out);
}

/**
 * Alle Felder und Ansichtsfelder aus einem anderen Model übernehmen, ohne
 * den Beobachter zu berühren (`applyRemoteState`). `source` ist bereits geprüft.
 * @param {object} model @param {object} source
 * @returns {void}
 */
export function replaceFields(model, source) {
  const { fields, view } = schemaOf(model);
  for (const k of [...Object.keys(fields), ...Object.keys(view)]) model._v[k] = cloneJSON(source._v[k]);
}

// ─── defineModel ────────────────────────────────────────────

const RESERVED = new Set(['constructor', 'toJSON', 'fromJSON', 'hasContent', 'execute', '_v', '_obs', '_schema']);

/**
 * Das Schema eines Models oder einer Model-Klasse.
 * @param {object|Function|null|undefined} x
 * @returns {{ fields: object, view: object, commands: object }|null}
 */
export function schemaOf(x) {
  const cls = typeof x === 'function' ? x : x?.constructor;
  return cls?.schema ?? null;
}

/**
 * Die Spec eines Feldes oder Ansichtsfeldes — bei einer UI-State-Instanz
 * (`defineState`) die Spec des State-Feldes.
 * @param {object} owner Model oder UI-State @param {string} name @returns {object|undefined}
 */
export function fieldSpec(owner, name) {
  const st = stateSchemaOf(owner);
  if (st) return st.fields[name];
  const s = schemaOf(owner);
  return s ? (s.fields[name] ?? s.view[name]) : undefined;
}

// ─── defineState ────────────────────────────────────────────

/** Die Schemata aus `defineState` — Erkennung ohne Markerfeld. */
const STATE_SCHEMAS = new WeakSet();

/**
 * Das Schema einer UI-State-Instanz aus `defineState`, sonst null. Das
 * Schema ist eingefroren; Alpines Proxy reicht es darum unverändert durch.
 * @param {any} x @returns {{ fields: Record<string, object> }|null}
 */
export function stateSchemaOf(x) {
  const s = x !== null && typeof x === 'object' ? x._schema : undefined;
  return s && STATE_SCHEMAS.has(s) ? s : null;
}

/**
 * UI-State aus einem Schema-Literal: dieselben Feldkonstruktoren wie
 * `defineModel`, ohne `index`/`idOf` (Pfade zeigen ins Model). `create()`
 * liefert ein schlichtes Objekt mit den Vorgabewerten; geprüft wird an der
 * Eingabegrenze (`x-field`), nicht beim Schreiben. Nichts wird gespeichert.
 * @param {Record<string, object>} fields
 * @returns {Readonly<{ schema: Readonly<{ fields: Readonly<Record<string, object>> }>, create: () => Record<string, any> }>}
 */
export function defineState(fields) {
  for (const [name, s] of Object.entries(fields)) {
    if (name === '_schema') throw new Error(`defineState: ${name} is a reserved name`);
    if (usesPath(s)) throw new Error(`defineState: ${name} uses index/idOf — paths refer to the model, not to the UI state`);
  }
  const schema = Object.freeze({ fields: Object.freeze({ ...fields }) });
  STATE_SCHEMAS.add(schema);
  return Object.freeze({
    schema,
    create() {
      const state = {};
      for (const [k, s] of Object.entries(schema.fields)) state[k] = defaultOf(s);
      return Object.defineProperty(state, '_schema', { value: schema, enumerable: false });
    },
  });
}

// ─── Versionen und Migrationen ──────────────────────────────

// Der Build-Gate `tools/build/module-gates.mjs` führt eine Kopie dieser beiden
// Muster — bei Änderungen synchron halten.
const VERSION = /^\d+\.\d+$/;
const MIGRATION_KEY = /^(0|\d+\.\d+)→(\d+\.\d+)$/;
/** Gespeicherte Version: `0` (vor dem ersten Schema) oder `MAJOR.MINOR`. */
const STORED_VERSION = /^(0|\d+\.\d+)$/;

/**
 * Versionen `MAJOR.MINOR` (oder `'0'`) numerisch vergleichen.
 * @param {string} a @param {string} b @returns {number} <0, 0, >0
 */
export function compareVersions(a, b) {
  const [a1, a2 = 0] = String(a).split('.').map(Number);
  const [b1, b2 = 0] = String(b).split('.').map(Number);
  return a1 - b1 || a2 - b2;
}

/**
 * `version` und `migrations` prüfen und als Schrittkarte liefern.
 * @param {string} version @param {Record<string, Function>} migrations
 * @returns {Map<string, { to: string, fn: Function }>} Startversion → Schritt
 * @throws {Error} bei falscher Form, Lücke, Doppel oder Rückschritt
 */
function migrationSteps(version, migrations) {
  if (!VERSION.test(version)) throw new Error(`defineModel: invalid version ${JSON.stringify(version)}; allowed: MAJOR.MINOR`);
  const steps = new Map();
  for (const [key, fn] of Object.entries(migrations)) {
    const m = MIGRATION_KEY.exec(key);
    if (!m) throw new Error(`defineModel: invalid migration key ${JSON.stringify(key)}; allowed: 'a→b' with a = 0 or MAJOR.MINOR, b = MAJOR.MINOR`);
    const [, from, to] = m;
    if (typeof fn !== 'function') throw new Error(`defineModel: migration ${key} must be a function`);
    if (compareVersions(to, from) <= 0) throw new Error(`defineModel: migration ${key} does not move forward`);
    if (compareVersions(to, version) > 0) throw new Error(`defineModel: migration ${key} goes beyond version ${version}`);
    if (steps.has(from)) throw new Error(`defineModel: two migrations start at ${from}`);
    steps.set(from, { to, fn });
  }
  for (const start of steps.keys()) {
    let v = start;
    while (steps.has(v)) v = steps.get(v).to;
    if (v !== version) throw new Error(`defineModel: migration chain from ${start} ends at ${v}, not at version ${version}`);
  }
  return steps;
}

/**
 * Gespeicherten Zustand auf `version` heben (Kopie je Schritt).
 * @param {object} json @param {string} version @param {Map<string, { to: string, fn: Function }>} steps
 * @returns {object}
 * @throws {Error} gespeicherte Version in falscher Form, neuer oder unbekannt
 */
function migrate(json, version, steps) {
  const stored = isPlainObject(json._schema) && Object.hasOwn(json._schema, 'version');
  const saved = stored ? json._schema.version : '0';
  if (stored) requireForm('_schema.version', saved, typeof saved === 'string' && STORED_VERSION.test(saved), '0 or MAJOR.MINOR');
  requireForm('_schema.version', saved, compareVersions(saved, version) <= 0,
    `up to ${version} (saved by a newer version of this module)`);
  if (steps.size === 0 || saved === version) return json;
  if (!steps.has(saved)) requireKnownId('_schema.version', saved, [...steps.keys(), version].sort(compareVersions));
  let v = saved;
  let out = json;
  while (v !== version) {
    const { to, fn } = steps.get(v);
    out = fn(cloneJSON(out));
    requireForm(`migration ${v}→${to} result`, out, isPlainObject(out), 'a plain object');
    v = to;
  }
  return out;
}

/**
 * Den Modulnamen für `_schema.name` setzen (`createModule` mit `descriptor`).
 * Nicht aufzählbar, damit `Object.keys(Model)` unverändert bleibt.
 * @param {Function} Model Klasse aus `defineModel` @param {string} name
 * @returns {void}
 */
export function setModelName(Model, name) {
  Object.defineProperty(Model, 'moduleName', { value: name, writable: true, configurable: true, enumerable: false });
}

/**
 * Gespeicherten Zustand laden, ohne zu werfen: streng, sonst repariert,
 * sonst (neuere oder unlesbare Version) leer. Für Stellen, die nicht werfen
 * dürfen, etwa Dashboard-Kacheln.
 * @param {any} Model Klasse aus `defineModel`
 * @param {any} json gespeicherter Zustand
 * @returns {any} eine Instanz von `Model`
 */
export function readModel(Model, json) {
  try { return Model.fromJSON(json); } catch { /* reparieren */ }
  try { return Model.fromJSON(json, { repair: true }); } catch { return new Model(); }
}

/**
 * Model-Klasse aus einem Schema-Literal.
 * @param {{ fields?: Record<string, object>, view?: Record<string, object>,
 *           commands?: Record<string, object>, version?: string,
 *           migrations?: Record<string, Function> }} schema
 * @returns {any} die Klasse (`new`, `fromJSON`, `schema`)
 */
export function defineModel(schema) {
  const fields = Object.freeze({ ...(schema.fields ?? {}) });
  const view = Object.freeze({ ...(schema.view ?? {}) });
  const commands = Object.freeze({ ...(schema.commands ?? {}) });
  if (schema.migrations !== undefined && schema.version === undefined) {
    throw new Error('defineModel: version is required when migrations are set');
  }
  const version = schema.version ?? '1.0';
  const migrations = Object.freeze({ ...(schema.migrations ?? {}) });
  const steps = migrationSteps(version, migrations);
  for (const name of Object.keys(view)) {
    if (Object.hasOwn(fields, name)) throw new Error(`defineModel: ${name} is both a field and a view field`);
  }
  for (const name of [...Object.keys(fields), ...Object.keys(view), ...Object.keys(commands)]) {
    if (RESERVED.has(name)) throw new Error(`defineModel: ${name} is a reserved name`);
  }
  for (const name of Object.keys(commands)) {
    if (Object.hasOwn(fields, name) || Object.hasOwn(view, name)) throw new Error(`defineModel: ${name} is both a field and a command`);
  }
  const all = { ...fields, ...view };

  class Model {
    constructor() {
      this._v = {};
      for (const [k, s] of Object.entries(all)) this._v[k] = defaultOf(s);
    }

    /**
     * @param {any} json gespeicherter Zustand
     * @param {{ repair?: boolean }} [opts] `repair`: ungültige Inhaltsfelder
     *   auf den Vorgabewert setzen statt zu werfen
     * @returns {any}
     */
    static fromJSON(json, { repair = false } = {}) {
      const m = new this();
      if (!isPlainObject(json)) return m;
      json = migrate(json, version, steps);
      if (!isPlainObject(json)) return m;
      // Zwei Durchgänge: pfadabhängige Specs (index/idOf) werden erst geprüft,
      // wenn alle pfadfreien Felder und Ansichtsfelder geladen sind — die
      // Deklarationsreihenfolge im Schema spielt so keine Rolle.
      const load = (k, s, isView) => {
        if (!Object.hasOwn(json, k)) return;
        try {
          m._v[k] = checkValue(s, k, json[k], { root: m });
        } catch (err) {
          // D11: ein ungültiger gespeicherter Ansichtswert fällt still auf den Vorgabewert.
          if (!repair && !isView) throw err;
        }
      };
      for (const dependent of [false, true]) {
        for (const [k, s] of Object.entries(fields)) if (usesPath(s) === dependent) load(k, s, false);
        for (const [k, s] of Object.entries(view)) if (usesPath(s) === dependent) load(k, s, true);
      }
      return m;
    }

    /** @returns {object} `_schema`, dann Inhalt und Ansicht in Schema-Reihenfolge, als Kopie */
    toJSON() {
      const name = /** @type {any} */ (this.constructor).moduleName;
      const out = { _schema: typeof name === 'string' ? { name, version } : { version } };
      for (const k of Object.keys(all)) out[k] = cloneJSON(this._v[k]);
      return out;
    }

    /** @returns {boolean} true, sobald ein Inhaltsfeld vom Vorgabewert abweicht */
    hasContent() {
      return Object.entries(fields).some(([k, s]) => JSON.stringify(this._v[k]) !== JSON.stringify(defaultOf(s)));
    }

    /**
     * Ein Kommando als Objekt ausführen: `{ type, …params }`.
     * @param {any} cmd @returns {any}
     */
    execute(cmd) {
      requireForm('command', cmd, isPlainObject(cmd), 'an object with type and the command parameters');
      const { type, ...params } = cmd;
      requireKnownId('command', type, Object.keys(commands));
      return this[type](params);
    }
  }

  Model.schema = Object.freeze({ fields, view, commands, version, migrations });
  for (const [k, s] of Object.entries(all)) {
    Object.defineProperty(Model.prototype, k, {
      get() { return this._v[k]; },
      set(v) { this._v[k] = checkValue(s, k, v, { root: this }); },
      enumerable: true,
      configurable: true,
    });
  }
  for (const [name, def] of Object.entries(commands)) {
    Object.defineProperty(Model.prototype, name, {
      value(cmd) { return runCommand(name, def, this, this, cmd); },
      writable: true,
      configurable: true,
    });
  }
  return Model;
}
