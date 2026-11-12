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
 * `defineForm({ fields, fromParams?, toParams? })` beschreibt ein Formular,
 * dessen Felder nicht die Parameter eines Kommandos sind; `fromAttr` wandelt
 * den Text eines `data-arg-*` in den Wert einer Feldart.
 *
 * `defineSettings(fields)` beschreibt die Einstellungen einer Dashboard-Kachel
 * (`number` mit Grenzen, `oneOf`, `boolean`); `readSettings` liest
 * gespeicherte Werte und fällt still auf die Vorgabe zurück.
 *
 * Werte liegen in `this._v`, nicht in `#privaten` Feldern — die brechen mit
 * Alpines Proxy. Accessoren liegen am Prototyp: `Object.keys(model)` liefert
 * nur `['_v']`; wer ein Model kopiert, nimmt `toJSON()`.
 *
 * `version`/`migrations`: gespeicherte Stände tragen `_schema: { name, version }`;
 * `fromJSON` hebt ältere Stände über die Kette `'a→b'` auf `version` (fehlend =
 * `'0'`), neuere lehnt es ab.
 *
 * `ModelContext` (`setModelContext`): Fakten als schlichte Werte — der aktive
 * Zyklus und die Einstellungen Konfidenzniveau/Teststärke. Feldarten lesen ihn
 * über `checkValue`/`defaultOf` (auch eine `default`-Funktion), das Model über
 * `this.context`. Keine Dienste.
 *
 * Rein: kein DOM, kein Alpine.
 */
import {
  requireText, requireNumber, requireBoolean, requireEnum, requireIndex,
  requireKnownId, requireKeys, requireForm,
} from './validate.js';
import { CYCLES, DEFAULT_CYCLE, getPhaseIds } from './cycles/cycles.js';
import { isIsoDate } from './local-date.js';

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
/**
 * Position in der Liste unter `path`. `afterRemovalFrom`: Pfad der Liste, aus der der Eintrag
 * zuvor entfernt wird; ist das dieselbe Liste wie unter `path`, gilt nur noch Länge − 1 als Obergrenze.
 * @param {string} path @param {{ afterRemovalFrom?: string, existing?: boolean } & object} [opts] @returns {Readonly<object>}
 */
export const index = (path, opts) => spec('index', { path }, opts);
/**
 * Eine vorhandene id aus der Liste unter `path`.
 * @param {string} path @param {{ key?: string } & object} [opts] @returns {Readonly<object>}
 */
export const idOf = (path, { key = 'id', ...opts } = {}) => spec('idOf', { path, key }, opts);
/**
 * Liste. `unique`: ohne Doppelte; `sorted`: Zahlen numerisch, sonst per `localeCompare`.
 * Gesetzte Werte werden in diese Normalform gebracht.
 * @param {object} item @param {{ unique?: boolean, sorted?: boolean } & object} [opts] @returns {Readonly<object>}
 */
export const list = (item, opts) => spec('list', { item }, opts);
/** Objekt mit festen Schlüsseln, gleicher Werttyp. @param {readonly string[]} keys @param {object} value @param {object} [opts] @returns {Readonly<object>} */
export const record = (keys, value, opts) => spec('record', { keys: Object.freeze([...keys]), value }, opts);
/**
 * Objekt mit freien Schlüsseln, gleicher Werttyp. Schlüssel: `text()`, `idOf(path)`
 * oder `number({ integer: true })`; gespeichert werden sie immer als Text.
 * @param {object} key @param {object} value @param {object} [opts] @returns {Readonly<object>}
 */
export const map = (key, value, opts) => {
  const ok = key?.kind === 'text' || key?.kind === 'idOf' || (key?.kind === 'number' && key.integer === true);
  if (!ok) throw new Error('defineModel: map key must be text(), idOf(path) or number({ integer: true }); allowed: text, idOf, number({ integer: true })');
  return spec('map', { key, value }, opts);
};
/** Objekt mit fester Form. @param {Record<string, object>} shape @param {object} [opts] @returns {Readonly<object>} */
export const object = (shape, opts) => spec('object', { shape: Object.freeze({ ...shape }) }, opts);

/**
 * Kalenderdatum `JJJJ-MM-TT` (echtes Datum). `empty`: auch `''` (kein Datum).
 * @param {{ empty?: boolean } & object} [opts] @returns {Readonly<object>}
 */
export const date = (opts) => spec('date', {}, opts);

/**
 * Uhrzeit `HH:MM` (00–23, 00–59). `step`: Raster in Minuten.
 * @param {{ step?: number } & object} [opts] @returns {Readonly<object>}
 */
export const time = (opts) => spec('time', {}, opts);

/**
 * Eine Phase irgendeines Zyklus (`core/cycles/cycles.js`); Vorgabe ist die
 * erste Phase des aktiven Zyklus (`context.cycle`).
 * @param {object} [opts] @returns {Readonly<object>}
 */
export const phase = (opts) => spec('phase', {}, opts);

/**
 * Spaltenarten eines Arbeitsblatts (Schlüssel von `COLUMN_TYPES` in
 * `core/datagrid/datagrid-utils.js`; ein Test hält beide gleich — das Model
 * bleibt frei von DOM-Importen).
 */
const COLUMN_KINDS = Object.freeze(['numeric', 'text', 'date', 'time', 'currency', 'percent', 'binary']);

/**
 * Bezug auf eine Spalte eines Arbeitsblatts `{ instanceId, sheetId?, columnId }`.
 * Geprüft wird nur die Form — ob Blatt und Spalte existieren, prüft das
 * Model nicht. `types` (bekannte Spaltenarten)/`minCount`/`maxCount` sagen, welche Spalten passen (Picker,
 * Agent). Nullbar per Vorgabe, Vorgabewert `null`; in Listen
 * `columnRef({ nullable: false })`.
 * @param {{ types?: readonly string[], minCount?: number, maxCount?: number, nullable?: boolean } & object} [opts]
 * @returns {Readonly<object>}
 */
export const columnRef = ({ types, minCount = 0, maxCount, ...opts } = {}) => {
  if (types) {
    const unknown = types.filter((t) => !COLUMN_KINDS.includes(t));
    if (unknown.length > 0) throw new Error(`invalid types ${unknown.join(', ')}; allowed: ${COLUMN_KINDS.join(', ')}`);
  }
  return spec('columnRef',
    { types: types ? Object.freeze([...types]) : null, minCount, ...(maxCount !== undefined ? { maxCount } : {}) },
    { nullable: true, ...opts });
};

/**
 * Datensätze: Liste von Zeilen `{ <slot>: Spaltenbezug|null }` (jeder Slot ist nullbar:
 * eine neue Zeile beginnt mit `null` in allen Slots, `columnRef({ nullable: false })` wird abgelehnt), mindestens
 * eine Zeile, ohne `multi` genau eine. Slots sind `columnRef`-Beschreibungen,
 * dazu `required` (Zeile ohne diesen Slot ist unvollständig — bleibt aber
 * gültig) und `group` (Platzhalter „keine Gruppierung“, jeder Spaltentyp).
 * `colors`: CSS-Farben je Zeile. Geprüft wird nur die Form.
 * @param {Record<string, object>} slots
 * @param {{ multi?: boolean, colors?: readonly string[]|null } & object} [opts]
 * @returns {Readonly<object>}
 */
export const datasets = (slots, { multi = false, colors = null, ...opts } = {}) => {
  for (const [k, slot] of Object.entries(slots)) {
    if (slot?.nullable === false) throw new Error(`invalid datasets slot ${k} nullable:false; allowed: nullable slots (a new row starts with null in every slot)`);
  }
  return spec('datasets', {
    slots: Object.freeze({ ...slots }), multi, colors: colors ? Object.freeze([...colors]) : null,
  }, opts);
};

/**
 * Bild als Daten-URL (`data:image/<art>;base64,…`). Trägt die Merkmale
 * `omitOnRead` (`read()` liefert dort nur `{ $omitted: true, bytes }`) und
 * `agentWrite: false` (der Agent schreibt das Feld nicht); beide lassen sich
 * über die Optionen überschreiben. Vorgabe `''`, mit `nullable` `null`.
 * @param {object} [opts] @returns {Readonly<object>}
 */
export const image = (opts) => spec('image', {}, { omitOnRead: true, agentWrite: false, ...opts });

const IMAGE_DATA_URL = /^data:image\/[\w.+-]+;base64,/;

const COLUMN_REF_KEYS = Object.freeze(['instanceId', 'sheetId', 'columnId']);

/** @param {unknown} v @returns {boolean} */
function isColumnRef(v) {
  if (!isPlainObject(v)) return false;
  const r = /** @type {Record<string, unknown>} */ (v);
  const id = (x) => typeof x === 'string' && x !== '';
  return id(r.instanceId) && id(r.columnId) && (r.sheetId === undefined || id(r.sheetId))
    && Object.keys(r).every((k) => COLUMN_REF_KEYS.includes(k));
}

/** Alle Phasen aller Zyklen (ohne `data`/`extras`), ohne Doppel. */
export const ALL_PHASE_IDS = Object.freeze([...new Set(Object.keys(CYCLES).flatMap((c) => getPhaseIds(c)))]);

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

// ─── Kontext des Models ─────────────────────────────────────

/** @typedef {{ cycle: string, confidenceLevel: number, power: number }} ModelContext */

/** Der Kontext ohne gesetzte Fakten (reine Tests, alte Pfade); Prozentwerte wie die Einstellungen. */
export const DEFAULT_CONTEXT = Object.freeze({ cycle: DEFAULT_CYCLE, confidenceLevel: 95, power: 80 });
const CONTEXT_KEYS = ['cycle', 'confidenceLevel', 'power'];
/** Bereich der Prozentwerte im Kontext. */
const PERCENT = Object.freeze({ exclusiveMin: 0, exclusiveMax: 100 });

/**
 * Einen Kontext prüfen: nur bekannte Schlüssel, nur schlichte Werte.
 * `cycle` ist Pflicht; `confidenceLevel`/`power` fallen auf `DEFAULT_CONTEXT`.
 * @param {any} ctx @returns {Readonly<ModelContext>}
 * @throws {Error} unbekannter Schlüssel, fehlender Zyklus, unbekannter Zyklus, Prozentwert außerhalb (0, 100)
 */
export function checkContext(ctx) {
  requireForm('context', ctx, isPlainObject(ctx), 'an object with cycle');
  for (const k of Object.keys(ctx)) requireKnownId('context key', k, CONTEXT_KEYS);
  requireKeys('context', ctx, [{ name: 'cycle' }], 'key');
  requireEnum('context.cycle', ctx.cycle, Object.keys(CYCLES));
  const pct = (k) => {
    if (!Object.hasOwn(ctx, k)) return DEFAULT_CONTEXT[k];
    requireNumber(`context.${k}`, ctx[k], PERCENT);
    return ctx[k];
  };
  return Object.freeze({ cycle: ctx.cycle, confidenceLevel: pct('confidenceLevel'), power: pct('power') });
}

/**
 * Den Kontext eines Models setzen (beim Anlegen und bei jeder Änderung).
 * Nicht aufzählbar: weder in `Object.keys` noch in `toJSON`.
 * @param {object} model @param {ModelContext} ctx @returns {void}
 */
export function setModelContext(model, ctx) {
  const value = checkContext(ctx);
  // Zuweisen, sobald es das Feld gibt: über Alpines Proxy löst das Effekte aus.
  if (Object.hasOwn(model, '_ctx')) { model._ctx = value; return; }
  Object.defineProperty(model, '_ctx', { value, writable: true, configurable: true, enumerable: false });
}

/**
 * Der Kontext eines Models, sonst `DEFAULT_CONTEXT`.
 * @param {any} model @returns {ModelContext}
 */
export function contextOf(model) {
  return model?._ctx ?? DEFAULT_CONTEXT;
}

/**
 * Der Kontext des offenen Projekts aus dem State-Manager: Zyklus des
 * Projekts, Konfidenzniveau und Teststärke aus den Einstellungen. Ein
 * unbekannter Zyklus gilt als Vorgabezyklus; ein Prozentwert, der keine
 * endliche Zahl in (0, 100) ist, als Vorgabe (95 bzw. 80).
 * @param {{ getProjectCycle?: () => string, get?: (path: string) => any }|undefined|null} stateManager
 * @returns {ModelContext}
 */
export function activeContext(stateManager) {
  const cycle = stateManager?.getProjectCycle?.();
  const pct = (key) => {
    const v = stateManager?.get?.(`settings.${key}`);
    return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 100 ? v : DEFAULT_CONTEXT[key];
  };
  return {
    cycle: typeof cycle === 'string' && Object.hasOwn(CYCLES, cycle) ? cycle : DEFAULT_CYCLE,
    confidenceLevel: pct('confidenceLevel'),
    power: pct('power'),
  };
}

/**
 * Der Vorgabewert eines Feldes, jedes Mal frisch. Ist `default` eine
 * Funktion, liefert sie den Wert aus dem Kontext; er wird gegen die Feldart
 * geprüft.
 * @param {object} s Feld-Spec
 * @param {ModelContext} [context] Kontext des Models (Zyklus für `phase`, Einstellungen für `default`-Funktionen)
 * @param {string} [name] Feldname für die Meldung
 * @param {object} [root] das entstehende Model, gegen das Pfade (`index`, `idOf`) einer `default`-Funktion geprüft werden
 * @returns {any}
 * @throws {Error} wenn eine `default`-Funktion einen ungültigen Wert liefert
 */
export function defaultOf(s, context = DEFAULT_CONTEXT, name = 'default', root = undefined) {
  if (Object.hasOwn(s, 'default')) {
    if (typeof s.default !== 'function') return cloneJSON(s.default);
    return checkValue(s, name, s.default(context), { context, root });
  }
  if (s.nullable) return null;
  switch (s.kind) {
    case 'text': case 'idOf': case 'date': case 'image': return '';
    case 'time': return '00:00';
    case 'phase': return getPhaseIds(context.cycle)[0];
    case 'columnRef': return null;
    case 'datasets': return [Object.fromEntries(Object.keys(s.slots).map((k) => [k, null]))];
    case 'number': case 'index': return 0;
    case 'boolean': return false;
    case 'oneOf': return s.values[0];
    case 'list': return [];
    case 'record': return Object.fromEntries(s.keys.map(k => [k, defaultOf(s.value, context, `${name}.${k}`, root)]));
    case 'map': return {};
    case 'object': return Object.fromEntries(Object.entries(s.shape)
      .filter(([, v]) => v.optional !== true).map(([k, v]) => [k, defaultOf(v, context, `${name}.${k}`, root)]));
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
 * @param {{ root?: object, params?: object, context?: ModelContext }} [ctx] Wurzel für Pfade; Parameter eines Kommandos; Kontext des Models
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
      const existing = s.existing === true
        || (s.afterRemovalFrom !== undefined && target !== undefined && resolvePath(s.afterRemovalFrom, ctx) === target);
      requireIndex(name, value, Array.isArray(target) ? target.length : 0, { existing });
      return value;
    }
    case 'idOf': {
      const target = resolvePath(s.path, ctx);
      requireKnownId(name, value, Array.isArray(target) ? target.map(e => e?.[s.key]) : []);
      return value;
    }
    case 'list':
      requireForm(name, value, Array.isArray(value), 'a list');
      return normalList(s, value.map((v, i) => checkValue(s.item, `${name}[${i}]`, v, ctx)));
    case 'record': {
      requireForm(name, value, isPlainObject(value), `an object with keys ${s.keys.join(', ')}`);
      for (const k of Object.keys(value)) requireKnownId(`${name} key`, k, s.keys);
      requireKeys(name, value, s.keys.map(k => ({ name: k })), 'key');
      return Object.fromEntries(s.keys.map(k => [k, checkValue(s.value, `${name}.${k}`, value[k], ctx)]));
    }
    case 'map': {
      requireForm(name, value, isPlainObject(value), 'an object');
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        checkMapKey(s, name, k, ctx);
        out[k] = checkValue(s.value, `${name}[${k}]`, v, ctx);
      }
      return out;
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
    case 'date': {
      const v = requireText(name, value);
      if (v === '' && s.empty === true) return v;
      return requireForm(name, value, isIsoDate(v), 'a date YYYY-MM-DD');
    }
    case 'time': {
      const v = requireText(name, value);
      const m = TIME.exec(v);
      const onGrid = m !== null && (s.step === undefined || (Number(m[1]) * 60 + Number(m[2])) % s.step === 0);
      return requireForm(name, value, onGrid, s.step === undefined ? 'a time HH:MM' : `a time HH:MM on a ${s.step}-minute grid`);
    }
    case 'phase': return requireEnum(name, value, ALL_PHASE_IDS);
    case 'image': {
      const v = requireText(name, value);
      return requireForm(name, value, IMAGE_DATA_URL.test(v), 'an image data URL data:image/<type>;base64,…');
    }
    case 'columnRef': {
      requireForm(name, value, isColumnRef(value), 'a column reference { instanceId, sheetId?, columnId }');
      return {
        instanceId: value.instanceId,
        ...(value.sheetId !== undefined ? { sheetId: value.sheetId } : {}),
        columnId: value.columnId,
      };
    }
    case 'datasets': {
      const slotNames = Object.keys(s.slots);
      requireForm(name, value, Array.isArray(value), 'a list of rows');
      requireForm(name, value, value.length >= 1, 'at least one row');
      if (!s.multi) requireForm(name, value, value.length === 1, 'exactly one row');
      return value.map((row, i) => {
        const at = `${name}[${i}]`;
        requireForm(at, row, isPlainObject(row), `an object with keys ${slotNames.join(', ')}`);
        for (const k of Object.keys(row)) requireKnownId(`${at} key`, k, slotNames);
        return Object.fromEntries(slotNames.map((k) => [k,
          row[k] === null || row[k] === undefined ? null : checkValue(s.slots[k], `${at}.${k}`, row[k], ctx)]));
      });
    }
    default: throw new Error(`defineModel: unknown kind ${JSON.stringify(s.kind)}`);
  }
}

/**
 * Den Schlüssel eines Map-Eintrags prüfen. Zahlschlüssel werden als Zahl
 * geprüft, aber als Text gespeichert; `__proto__` ist nie ein Schlüssel.
 * @param {object} s Map-Spec @param {string} name Name der Map in der Meldung
 * @param {string} key @param {object} [ctx]
 * @throws {Error} in der Vertragsform von `core/validate.js`
 * @returns {void}
 */
export function checkMapKey(s, name, key, ctx = {}) {
  requireForm(`${name} key`, key, key !== '__proto__', 'a key other than __proto__');
  if (s.key.kind === 'number') checkValue(s.key, `${name} key`, String(Number(key)) === key ? Number(key) : NaN, ctx);
  else if (s.key.kind === 'idOf') {
    // Schlüssel sind Text: eine Zahl-id passt über ihren Text.
    const target = resolvePath(s.key.path, ctx);
    requireKnownId(`${name} key`, key, Array.isArray(target) ? target.map(e => String(e?.[s.key.key])) : []);
  } else checkValue(s.key, `${name} key`, key, ctx);
}

/**
 * Normalform einer Liste mit `unique`/`sorted`: ohne Doppelte, Zahlen numerisch, Text per `localeCompare`.
 * @param {object} s Listen-Spec @param {any[]} items @returns {any[]}
 */
function normalList(s, items) {
  let out = s.unique === true ? [...new Set(items)] : items;
  if (s.sorted === true) {
    out = [...out].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))));
  }
  return out;
}

/**
 * Reparatur eines gespeicherten Werts: in Listen, Maps und Objekten entfällt nur
 * der ungültige Eintrag (bei Objekten das umschließende Element), alles andere
 * wird strikt geprüft.
 * @param {object} s @param {string} name @param {any} value @param {object} ctx
 * @param {(err: Error) => void} dropped wird mit dem ersten verworfenen Eintragsfehler gerufen
 * @returns {any}
 */
function repairValue(s, name, value, ctx, dropped) {
  if (s.nullable && value === null) return null;
  switch (s.kind) {
    case 'list': {
      if (!Array.isArray(value)) return checkValue(s, name, value, ctx);
      const kept = [];
      value.forEach((v, i) => {
        try { kept.push(repairValue(s.item, `${name}[${i}]`, v, ctx, dropped)); } catch (err) { dropped(err); }
      });
      return normalList(s, kept);
    }
    case 'map': {
      if (!isPlainObject(value)) return checkValue(s, name, value, ctx);
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        try {
          checkMapKey(s, name, k, ctx);
          out[k] = repairValue(s.value, `${name}[${k}]`, v, ctx, dropped);
        } catch (err) { dropped(err); }
      }
      return out;
    }
    case 'object': {
      const keys = Object.keys(s.shape);
      if (!isPlainObject(value)) return checkValue(s, name, value, ctx);
      for (const k of Object.keys(value)) requireKnownId(`${name} key`, k, keys);
      requireKeys(name, value, keys.map(k => ({ name: k, optional: s.shape[k].optional === true })), 'key');
      const out = {};
      for (const k of keys) if (Object.hasOwn(value, k)) out[k] = repairValue(s.shape[k], `${name}.${k}`, value[k], ctx, dropped);
      return out;
    }
    default: return checkValue(s, name, value, ctx);
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
    case 'map': return usesPath(s.key) || usesPath(s.value);
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
    case 'text': case 'idOf': case 'date': case 'time': case 'phase': case 'image': t = 'string'; break;
    case 'number': case 'index': t = 'number'; break;
    case 'boolean': t = 'boolean'; break;
    case 'oneOf': t = s.values.map(literal).join('|'); break;
    case 'list': { const item = describeType(s.item); t = item.includes('|') ? `Array<${item}>` : `${item}[]`; break; }
    case 'record': t = `Record<${s.keys.map(literal).join('|')}, ${describeType(s.value)}>`; break;
    case 'map': t = `Record<string, ${describeType(s.value)}>`; break;
    case 'object': t = `{ ${Object.entries(s.shape)
      .map(([k, v]) => `${k}${v.optional ? '?' : ''}: ${describeType(v)}`).join(', ')} }`; break;
    case 'columnRef': t = '{ instanceId: string, sheetId?: string, columnId: string }'; break;
    case 'datasets': t = `Array<{ ${Object.entries(s.slots)
      .map(([k, v]) => `${k}: ${describeType(v)}`).join(', ')} }>`; break;
    default: throw new Error(`defineModel: unknown kind ${JSON.stringify(s.kind)}`);
  }
  return s.nullable ? `${t}|null` : t;
}

/**
 * Spaltenbezüge umhängen: in allen `columnRef`-Werten des Schemas (auch in
 * `list`, `object`, `record`, `map`) wird `instanceId === from` durch `to` ersetzt.
 * Liefert eine flache Kopie; Werte, die nicht zur Spec passen, bleiben stehen.
 * @param {Function} Model Klasse aus `defineModel`
 * @param {Record<string, any>} data gespeicherter oder geladener Zustand
 * @param {string} from @param {string} to
 * @returns {Record<string, any>}
 */
export function rewriteColumnRefs(Model, data, from, to) {
  const schema = schemaOf(Model);
  if (!schema || !isPlainObject(data)) return data;
  /** @param {any} s @param {any} v @returns {any} */
  const walk = (s, v) => {
    if (v === null || v === undefined) return v;
    switch (s.kind) {
      case 'columnRef': return isPlainObject(v) && v.instanceId === from ? { ...v, instanceId: to } : v;
      case 'datasets': return Array.isArray(v) ? v.map((row) => (isPlainObject(row)
        ? Object.fromEntries(Object.entries(row).map(([k, r]) => [k, s.slots[k] ? walk(s.slots[k], r) : r])) : row)) : v;
      case 'list': return Array.isArray(v) ? v.map((x) => walk(s.item, x)) : v;
      case 'record': return isPlainObject(v)
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(s.value, x)])) : v;
      case 'map': return isPlainObject(v)
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(s.value, x)])) : v;
      case 'object': return isPlainObject(v)
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, s.shape[k] ? walk(s.shape[k], x) : x])) : v;
      default: return v;
    }
  };
  const out = { ...data };
  for (const [k, s] of Object.entries({ ...schema.fields, ...schema.view })) {
    if (Object.hasOwn(out, k)) out[k] = walk(s, out[k]);
  }
  return out;
}

// ─── Kommandos ──────────────────────────────────────────────

/**
 * Die Parameter eines Kommandos prüfen, in Erklärungsreihenfolge — ein
 * Pfad wie `columns[sourceCol]` sieht so den schon geprüften `sourceCol`.
 * Auch für die Parameter asynchroner Abläufe (`core/async-task.js`).
 * @param {string} name @param {Record<string, object>} params @param {any} cmd @param {object} root
 * @returns {object} die geprüften Parameter
 */
export function checkParams(name, params, cmd, root) {
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
    args[n] = checkValue(params[n], n, given[n], { root, params: args, context: contextOf(root) });
  }
  return args;
}

/**
 * Der Fehler einer verletzten Invariante, in der Vertragsform von `validate.js`.
 * @param {string} field @param {any} value @param {string} name
 * @returns {Error} mit `param` und `invariant`
 */
function invariantError(field, value, name) {
  try {
    requireForm(field, value, false, `a value that keeps ${name}`);
  } catch (err) {
    err.invariant = name;
    return err;
  }
  return new Error('unreachable');
}

/**
 * Den Namen der ersten verletzten Invariante aus `names`, sonst `null`.
 * @param {object} model @param {Record<string, { readonly fields: readonly string[], test: Function }>} invariants @param {string[]} names
 * @returns {string|null}
 */
function brokenInvariant(model, invariants, names) {
  for (const n of names) if (!invariants[n].test.call(model, model)) return n;
  return null;
}

/**
 * `fn` mit ausgesetzten Invarianten ausführen und danach die betroffenen
 * prüfen; bei Verletzung die genannten Felder auf den Stand davor setzen.
 * @param {object} root das Model @param {() => any} fn @returns {any}
 */
function withInvariants(root, fn) {
  const invariants = schemaOf(root)?.invariants;
  const names = invariants ? Object.keys(invariants) : [];
  if (names.length === 0) return fn();
  const watched = [...new Set(names.flatMap((n) => invariants[n].fields))];
  const before = Object.fromEntries(watched.map((f) => [f, cloneJSON(root._v[f])]));
  root._run = (root._run ?? 0) + 1;
  let result;
  try {
    result = fn();
  } finally {
    root._run -= 1;
  }
  if (root._run > 0) return result;
  const changed = new Set(watched.filter((f) => JSON.stringify(root._v[f]) !== JSON.stringify(before[f])));
  const affected = names.filter((n) => invariants[n].fields.some((f) => changed.has(f)));
  const broken = brokenInvariant(root, invariants, affected);
  if (broken !== null) {
    const field = invariants[broken].fields[0];
    const err = invariantError(field, root._v[field], broken);
    for (const f of watched) root._v[f] = before[f];
    throw err;
  }
  return result;
}

/**
 * `fn` ausführen, das in das Inhalts- oder Ansichtsfeld `rootField` schreibt (etwa ein
 * Eintragsfeld per `x-field`), und danach die Invarianten prüfen, die dieses Feld nennen.
 * Bei Verletzung wird der Wert des Feldes von vorher wiederhergestellt und `invariantError`
 * geworfen (`param`, `invariant`). Innerhalb eines Kommandos prüft das Kommando selbst.
 * @param {object} model das Model @param {string} rootField Name des Wurzelfelds @param {() => any} fn
 * @returns {any}
 */
export function checkInvariantsAfter(model, rootField, fn) {
  const invariants = schemaOf(model)?.invariants;
  const names = invariants ? Object.keys(invariants).filter((n) => invariants[n].fields.includes(rootField)) : [];
  if (names.length === 0 || (model._run ?? 0) > 0) return fn();
  const before = cloneJSON(model._v[rootField]);
  let result;
  try {
    result = fn();
  } catch (err) {
    model._v[rootField] = before;
    throw err;
  }
  const broken = brokenInvariant(model, invariants, names);
  if (broken !== null) {
    const err = invariantError(rootField, model._v[rootField], broken);
    model._v[rootField] = before;
    throw err;
  }
  return result;
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
  const result = withInvariants(root, () => {
    const r = def.run.call(self, args);
    if (r && typeof r.then === 'function') {
      if (typeof r.catch === 'function') r.catch(() => {});
      throw new Error(`command ${name}: run must be synchronous — use asyncTask`);
    }
    return r;
  });
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
 * (`instance.set`). Ansichtsfelder sind nicht setzbar. Die Invarianten gelten
 * für den Endstand, nicht für Zwischenstände: `{ xMin, xMax }` darf beide
 * Grenzen über die alten hinweg verschieben.
 * @param {object} model @param {any} values
 * @throws {Error} beim ersten ungültigen Namen oder Wert oder bei verletzter
 *   Invariante (mit `param` und `invariant`); dann ist nichts geschrieben
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
    out[k] = checkValue(fields[k], k, values[k], { root: staged, context: contextOf(model) });
    staged[k] = out[k];
  }
  writeAtomically(model, out);
  return cloneJSON(out);
}

/**
 * Geprüfte Werte schreiben; die Invarianten der geschriebenen Felder erst am
 * Ende prüfen. Bei Verletzung oder Fehler stehen alle Felder wieder wie vorher.
 * Innerhalb eines Kommandos prüft das Kommando selbst.
 * @param {object} model @param {Record<string, any>} out geprüfte Werte je Feld
 * @returns {void}
 */
function writeAtomically(model, out) {
  const written = Object.keys(out);
  const before = Object.fromEntries(written.map((k) => [k, model._v[k]]));
  const restore = () => { for (const k of written) model._v[k] = before[k]; };
  const outer = (model._run ?? 0) > 0;
  model._run = (model._run ?? 0) + 1;
  try {
    for (const k of written) model[k] = out[k];
  } catch (err) {
    restore();
    throw err;
  } finally {
    model._run -= 1;
  }
  if (outer) return;
  const invariants = schemaOf(model)?.invariants ?? {};
  const affected = Object.keys(invariants).filter((n) => invariants[n].fields.some((f) => written.includes(f)));
  const broken = brokenInvariant(model, invariants, affected);
  if (broken === null) return;
  const field = invariants[broken].fields.find((f) => written.includes(f));
  const err = invariantError(field, model._v[field], broken);
  restore();
  throw err;
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

const RESERVED = new Set(['constructor', 'toJSON', 'fromJSON', 'hasContent', 'execute', '_v', '_obs', '_schema', 'context', '_ctx', '_run']);

/**
 * Das Schema eines Models oder einer Model-Klasse.
 * @param {object|Function|null|undefined} x
 * @returns {{ fields: object, view: object, commands: object, invariants?: object, derived?: Record<string, Function>, derivedBulk?: readonly string[] }|null}
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
    if (typeof s.default === 'function') throw new Error(`state field ${name}: default must not be a function`);
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

// ─── Formulare und Attribute ────────────────────────────────

const FROM_ATTR_FORBIDDEN = new Set(['object', 'list', 'record', 'map', 'columnRef', 'datasets']);

/**
 * Den Text eines `data-arg-*`-Attributs in den Wert seiner Feldart wandeln.
 * Was sich nicht wandeln lässt, bleibt Text — die Prüfung danach lehnt mit
 * der üblichen Meldung ab. `oneOf` bleibt Text: `checkValue` ordnet
 * Zahlentexte dem Mitglied zu.
 * @param {object} s Feld-Spec @param {string} text
 * @returns {any}
 * @throws {Error} für `object`, `list`, `record`
 */
export function fromAttr(s, text) {
  if (FROM_ATTR_FORBIDDEN.has(s.kind)) throw new Error(`fromAttr: ${s.kind} cannot come from an attribute`);
  if (s.nullable && text === '') return null;
  switch (s.kind) {
    case 'index': return /^\d+$/.test(text.trim()) ? Number(text) : text;
    case 'number': try { return requireNumber('value', text); } catch { return text; }
    case 'boolean': return text === 'true' ? true : (text === 'false' ? false : text);
    default: return text;
  }
}

/**
 * Formular-Schema für Formulare, deren Felder nicht die Parameter eines
 * Kommandos sind. Dieselben Feldkonstruktoren wie `defineState`, ohne
 * `index`/`idOf`. `fromParams(params)` macht aus Parametern Formularwerte,
 * `toParams(values, fixed)` aus Formularwerten Parameter; beide rein,
 * fehlend gilt 1:1. Das Kommando steht nicht im Schema, sondern am Element.
 * @param {{ fields: Record<string, object>, fromParams?: (params: any) => object,
 *   toParams?: (values: any, fixed: any) => object }} def
 * @returns {Readonly<{ schema: Readonly<{ fields: Readonly<Record<string, object>> }>,
 *   fromParams: (params: any) => object, toParams: (values: any, fixed: any) => object }>}
 */
export function defineForm({ fields, fromParams, toParams }) {
  for (const [name, s] of Object.entries(fields)) {
    if (usesPath(s)) throw new Error(`defineForm: ${name} uses index/idOf — paths refer to the model, not to the form`);
  }
  for (const [key, fn] of [['fromParams', fromParams], ['toParams', toParams]]) {
    if (fn !== undefined && typeof fn !== 'function') throw new Error(`defineForm: ${key} must be a function`);
  }
  return Object.freeze({
    schema: Object.freeze({ fields: Object.freeze({ ...fields }) }),
    fromParams: fromParams ?? ((params) => ({ ...params })),
    toParams: toParams ?? ((values) => ({ ...values })),
  });
}

// ─── Kachel-Einstellungen ───────────────────────────────────

/** Feldarten, die eine Kachel-Einstellung haben darf. */
const SETTINGS_KINDS = new Set(['number', 'oneOf', 'boolean']);
/** Die Schemata aus `defineSettings` — Erkennung ohne Markerfeld. */
const SETTINGS_SCHEMAS = new WeakSet();

/**
 * Einstellungen einer Dashboard-Kachel aus einem Schema-Literal: nur
 * `number` (mit endlichem `min` ≤ `max`), `oneOf` mit Text-Werten und
 * `boolean`; die Vorgabe muss gültig sein. Namen mit `_` am Anfang gehören
 * dem Host (`_source`).
 * @param {Record<string, object>} fields
 * @returns {Readonly<{ schema: Readonly<{ fields: Readonly<Record<string, object>> }> }>}
 */
export function defineSettings(fields) {
  for (const [name, s] of Object.entries(fields)) {
    if (name.startsWith('_')) throw new Error(`defineSettings: ${name} — names starting with "_" belong to the host`);
    if (!s || !SETTINGS_KINDS.has(s.kind)) throw new Error(`defineSettings: ${name} is ${s?.kind}; allowed: number, oneOf, boolean`);
    if (s.nullable === true || s.optional === true) throw new Error(`defineSettings: ${name} may not be nullable or optional`);
    if (s.kind === 'number' && !(Number.isFinite(s.min) && Number.isFinite(s.max) && s.min <= s.max)) {
      throw new Error(`defineSettings: ${name} needs finite min <= max`);
    }
    if (s.kind === 'oneOf' && !s.values.every((v) => typeof v === 'string')) throw new Error(`defineSettings: ${name} values must be strings`);
    try { checkValue(s, name, defaultOf(s)); } catch (err) { throw new Error(`defineSettings: ${name} default — ${err.message}`); }
  }
  const schema = Object.freeze({ fields: Object.freeze({ ...fields }) });
  SETTINGS_SCHEMAS.add(schema);
  return Object.freeze({ schema });
}

/**
 * Stammt `x` aus `defineSettings`?
 * @param {unknown} x @returns {boolean}
 */
export function isSettings(x) {
  return Boolean(x && typeof x === 'object' && SETTINGS_SCHEMAS.has(/** @type {any} */ (x).schema));
}

/**
 * Gespeicherte Einstellungen lesen, ohne zu werfen: je Feld der geprüfte
 * Wert, sonst die Vorgabe. Unbekannte Schlüssel fallen weg.
 * @param {{ schema: { fields: Record<string, object> } }} Settings aus `defineSettings`
 * @param {unknown} stored
 * @returns {Record<string, any>}
 */
export function readSettings(Settings, stored) {
  /** @type {Record<string, unknown>} */
  const src = isPlainObject(stored) ? /** @type {any} */ (stored) : {};
  const out = {};
  for (const [name, s] of Object.entries(Settings.schema.fields)) {
    try {
      out[name] = Object.hasOwn(src, name) ? checkValue(/** @type {any} */ (s), name, src[name]) : defaultOf(/** @type {any} */ (s));
    } catch {
      out[name] = defaultOf(/** @type {any} */ (s));
    }
  }
  return out;
}

// ─── Widgets ────────────────────────────────────────────────

const WIDGET_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const WIDGET = Symbol('widget');

/**
 * Ein Widget beschreiben: Eingaben (`props`, je eine Feldart; Pflicht außer
 * `optional: true`), optionale Wertbindung (`value`, eine Feldart — bei
 * Feldarten mit Parametern gilt die Art als Familie) und `forKind` (das
 * Widget ist das Bedienelement dieser Feldart für `x-field`).
 * @param {{ name: string, props?: Record<string, object>, value?: object|null, forKind?: string|null, api?: Record<string, any> }} def
 * @returns {Readonly<{ name: string, props: Readonly<Record<string, object>>, value: object|null, forKind: string|null, slots: Readonly<object> } & Record<string, any>>}
 */
export function defineWidget({ name, props = {}, value = null, forKind = null, api = {} }) {
  if (typeof name !== 'string' || !WIDGET_NAME.test(name)) throw new Error('defineWidget: name must be kebab-case');
  for (const [p, s] of Object.entries(props)) {
    if (!s || typeof s !== 'object' || typeof s.kind !== 'string') throw new Error(`defineWidget(${name}): props.${p} is not a field kind`);
  }
  if (forKind !== null && value?.kind !== forKind) throw new Error(`defineWidget(${name}): forKind needs value of that kind`);
  for (const k of Object.keys(api)) {
    if (['name', 'props', 'value', 'forKind', 'slots'].includes(k)) throw new Error(`defineWidget(${name}): api.${k} is reserved`);
  }
  const w = { ...api, name, props: Object.freeze({ ...props }), value, forKind, slots: Object.freeze({}) };
  Object.defineProperty(w, WIDGET, { value: true });
  return Object.freeze(w);
}

/**
 * Stammt `x` aus `defineWidget`?
 * @param {unknown} x @returns {boolean}
 */
export const isWidget = (x) => Boolean(x && /** @type {any} */ (x)[WIDGET]);

// ─── Versionen und Migrationen ──────────────────────────────

// Der Build-Gate `tools/build/module-gates.mjs` importiert beide Muster.
export const VERSION = /^\d+\.\d+$/;
export const MIGRATION_KEY = /^(0|\d+\.\d+)→(\d+\.\d+)$/;
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
  const present = json._schema !== undefined;
  if (present && !isPlainObject(json._schema)) requireForm('_schema.version', json._schema, false, '0 or MAJOR.MINOR');
  const saved = present ? json._schema.version : '0';
  if (present) requireForm('_schema.version', saved, typeof saved === 'string' && STORED_VERSION.test(saved), '0 or MAJOR.MINOR');
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
  const named = /** @type {any} */ (Model);
  if (Object.hasOwn(named, 'moduleName') && named.moduleName !== name) {
    throw new Error(`Model${Model.name === 'Model' ? '' : ` ${Model.name}`} already belongs to module ${named.moduleName}`);
  }
  Object.defineProperty(Model, 'moduleName', { value: name, writable: true, configurable: true, enumerable: false });
}

/**
 * Gespeicherten Zustand laden, ohne zu werfen: streng, sonst repariert,
 * sonst (neuere oder unlesbare Version) leer. Für Stellen, die nicht werfen
 * dürfen, etwa Dashboard-Kacheln.
 * @param {any} Model Klasse aus `defineModel`
 * @param {any} json gespeicherter Zustand
 * @param {ModelContext} [context] Kontext, aus dem fehlende Felder ihre Vorgabe bekommen
 * @returns {any} eine Instanz von `Model`
 */
export function readModel(Model, json, context) {
  try { return Model.fromJSON(json, { context }); } catch { /* reparieren */ }
  try { return Model.fromJSON(json, { repair: true, context }); } catch { return new Model(context); }
}

/**
 * Model-Klasse aus einem Schema-Literal.
 * @param {{ fields?: Record<string, object>, view?: Record<string, object>,
 *           commands?: Record<string, object>, version?: string,
 *           migrations?: Record<string, Function>,
 *           invariants?: Record<string, { fields: string[], test: (m: any) => boolean, repair?: (m: any) => void }>,
 *           derived?: Record<string, (data: any, d: Record<string, any>) => any>, derivedBulk?: string[] }} schema
 *   `derived.<name>(data, d)`: fachliche Ableitung; `this` ist das Model, `data` die Arbeitsblattsicht, `d` liest andere
 *   Ableitungen. `derivedBulk`: Namen, die als Ganzes (nicht einzeln) abgefragt werden.
 *   `invariants.<name>.repair`: heilt beim Laden mit `repair: true` einen verletzten Zustand; läuft in
 *   Deklarationsreihenfolge, sieht den Ladezustand (inklusive der Heilung früherer Invarianten) und schreibt
 *   direkt in die Felder. Heilt es nicht (oder wirft es), fallen die Felder der Invariante auf ihre Vorgabewerte
 *   zurück. Schreiben (Setter, Kommando, `x-field`) ruft `repair` nie. Eine Invariante, die nur Ansichtsfelder
 *   nennt, wird auch beim strengen Laden damit geheilt. Wirft der Test nach `repair`, gilt die Invariante als
 *   nicht geheilt. Invarianten, die Felder teilen: die spätere muss Vorgabewerte vertragen, denn ihr Rückfall
 *   setzt gemeinsame Felder zurück, ohne die frühere erneut zu prüfen.
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
  const derived = Object.freeze({ ...(schema.derived ?? {}) });
  const derivedBulk = Object.freeze([...(schema.derivedBulk ?? [])]);
  for (const [name, fn] of Object.entries(derived)) {
    if (RESERVED.has(name)) throw new Error(`defineModel: ${name} is a reserved name`);
    if (Object.hasOwn(fields, name)) throw new Error(`defineModel: ${name} is both a field and a derived`);
    if (Object.hasOwn(view, name)) throw new Error(`defineModel: ${name} is both a view field and a derived`);
    if (Object.hasOwn(commands, name)) throw new Error(`defineModel: ${name} is both a command and a derived`);
    if (typeof fn !== 'function') throw new Error(`defineModel: derived ${name} must be a function`);
  }
  for (const name of derivedBulk) {
    if (!Object.hasOwn(derived, name)) throw new Error(`defineModel: derivedBulk ${name} names no derived entry`);
  }
  const all = { ...fields, ...view };
  const invariants = Object.freeze(Object.fromEntries(Object.entries(schema.invariants ?? {}).map(([name, inv]) => {
    if (typeof inv?.test !== 'function') throw new Error(`defineModel: invariant ${name} needs a test function`);
    const names = Array.isArray(inv.fields) ? inv.fields : [];
    if (names.length === 0) throw new Error(`defineModel: invariant ${name} needs fields`);
    for (const f of names) requireKnownId(`invariant ${name} field`, f, Object.keys(all));
    if (inv.repair !== undefined && typeof inv.repair !== 'function') throw new Error(`defineModel: invariant ${name} repair must be a function`);
    return [name, Object.freeze({ fields: Object.freeze([...names]), test: inv.test, repair: inv.repair })];
  })));
  /** Feld → Namen der Invarianten, die es nennen. */
  const invariantsOf = {};
  for (const [name, inv] of Object.entries(invariants)) for (const f of inv.fields) (invariantsOf[f] ??= []).push(name);

  class Model {
    /** @param {ModelContext} [context] Kontext, aus dem die Vorgaben kommen (sonst der Vorgabe-Kontext) */
    constructor(context) {
      this._v = {};
      Object.defineProperty(this, '_run', { value: 0, writable: true, configurable: true, enumerable: false });
      if (context !== undefined) setModelContext(this, context);
      const ctx = contextOf(this);
      // Pfadabhängige Vorgaben (index/idOf) erst, wenn die pfadfreien da sind.
      for (const k of Object.keys(all)) this._v[k] = undefined;
      for (const dependent of [false, true]) {
        for (const [k, s] of Object.entries(all)) if (usesPath(s) === dependent) this._v[k] = defaultOf(s, ctx, k, this);
      }
    }

    /**
     * @param {any} json gespeicherter Zustand
     * @param {{ repair?: boolean, context?: ModelContext, onRepair?: (name: string, err: Error) => void }} [opts]
     *   `repair`: ungültige Inhaltsfelder auf den Vorgabewert setzen statt zu werfen, in Listen nur die
     *   ungültigen Einträge verwerfen; `onRepair`: wird für jedes zurückgesetzte oder gekürzte Feld
     *   gerufen; `context`: Kontext des Models, fehlende Felder bekommen ihre Vorgabe daraus
     * @returns {any}
     */
    static fromJSON(json, { repair = false, context, onRepair } = {}) {
      const m = new this(context);
      if (!isPlainObject(json)) return m;
      json = migrate(json, version, steps);
      if (!isPlainObject(json)) return m;
      // Zwei Durchgänge: pfadabhängige Specs (index/idOf) werden erst geprüft,
      // wenn alle pfadfreien Felder und Ansichtsfelder geladen sind — die
      // Deklarationsreihenfolge im Schema spielt so keine Rolle.
      const load = (k, s, isView) => {
        if (!Object.hasOwn(json, k)) return;
        const ctx = { root: m, context: contextOf(m) };
        try {
          if (repair && !isView) {
            let first = null;
            m._v[k] = repairValue(s, k, json[k], ctx, (err) => { first ??= err; });
            if (first) onRepair?.(k, first);
          } else m._v[k] = checkValue(s, k, json[k], ctx);
        } catch (err) {
          // D11: ein ungültiger gespeicherter Ansichtswert fällt still auf den Vorgabewert.
          if (!repair && !isView) throw err;
          if (!isView) onRepair?.(k, err);
        }
      };
      for (const dependent of [false, true]) {
        for (const [k, s] of Object.entries(fields)) if (usesPath(s) === dependent) load(k, s, false);
        for (const [k, s] of Object.entries(view)) if (usesPath(s) === dependent) load(k, s, true);
      }
      for (const [name, inv] of Object.entries(invariants)) {
        if (inv.test.call(m, m)) continue;
        const onlyView = inv.fields.every((f) => Object.hasOwn(view, f));
        if (!onlyView && !repair) throw invariantError(inv.fields[0], m._v[inv.fields[0]], name);
        const broken = inv.fields.map((f) => invariantError(f, m._v[f], name));
        let healed = false;
        if (inv.repair) {
          // Ohne Invariantenprüfung beim Schreiben: repair arbeitet auf dem Ladezustand.
          const loading = /** @type {any} */ (m);
          loading._run += 1;
          try { inv.repair.call(m, m); } catch { /* Rückfall auf die Vorgabewerte */ } finally { loading._run -= 1; }
          try { healed = inv.test.call(m, m); } catch { healed = false; }
        }
        if (!healed) inv.fields.forEach((f) => { m._v[f] = defaultOf(all[f], contextOf(m), f); });
        if (!onlyView) inv.fields.forEach((f, i) => onRepair?.(f, broken[i]));
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

    /** @returns {boolean} true, sobald ein Inhaltsfeld vom Vorgabewert (im Kontext des Models) abweicht */
    hasContent() {
      const ctx = contextOf(this);
      return Object.entries(fields).some(([k, s]) => JSON.stringify(this._v[k]) !== JSON.stringify(defaultOf(s, ctx, k)));
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

  Model.schema = Object.freeze({ fields, view, commands, version, migrations, invariants, derived, derivedBulk });
  for (const [k, s] of Object.entries(all)) {
    Object.defineProperty(Model.prototype, k, {
      get() { return this._v[k]; },
      set(v) {
        const next = checkValue(s, k, v, { root: this, context: contextOf(this) });
        const before = this._v[k];
        this._v[k] = next;
        if ((this._run ?? 0) > 0 || !invariantsOf[k]) return;
        const broken = brokenInvariant(this, invariants, invariantsOf[k]);
        if (broken !== null) {
          this._v[k] = before;
          throw invariantError(k, next, broken);
        }
      },
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
  Object.defineProperty(Model.prototype, 'context', {
    get() { return contextOf(this); },
    enumerable: false,
    configurable: true,
  });
  const probe = new Model();
  for (const [name, inv] of Object.entries(invariants)) {
    if (!inv.test.call(probe, probe)) throw new Error(`defineModel: invariant ${name} fails on the defaults`);
  }
  return Model;
}
