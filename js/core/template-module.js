import Alpine from '@alpinejs/csp';
import { cloneTemplate, templateKey } from './dom.js';
import { getModuleHelp, hasModuleHelp } from './help-registry.js';
import { getModuleReferences, hasModuleReferences } from './references-registry.js';
import { initialModel, loadModel } from './initial-model.js';
import { schemaOf, checkParams, setModelName, setCommandObserver, replaceFields, runCommand, cloneJSON, setModelContext, activeContext } from './model.js';
import { schemaAgentEntry, readSchemaModel } from './agent/agent-schema.js';
import { attachGesture } from './interaction/attach.js';
import { isGesture } from './interaction/define.js';
import { requireKnownId } from './validate.js';
import { formatsOf } from './exporter.js';
import { openDialogSafely } from './command-directives.js';
import { defineComputedSlots, bindComputed } from './computed.js';
import { derivedAccessor, evaluateDerived } from './derived.js';
import { checkAsyncTasks, defineAsyncTaskSlots, createAsyncTasks } from './async-task.js';
import { createWorksheetData } from './worksheet-data.js';
import { withoutStoredEdits } from './chart/instance-chart-manager.js';
import { createFieldErrors } from './field-errors.js';
import { formatNumber } from './number-format.js';

/**
 * Was `view(ctx)` bekommt: die Kontextdienste und die Kennungen der Instanz.
 * `cssVars(map)` liest CSS-Variablen am Wurzelelement der Instanz.
 * @typedef {{ context: object,
 *   notify: (message: string, type?: string, titleKey?: string) => void,
 *   dialog: any, i18n: any, eventBus: any, instanceId: string, moduleId: string,
 *   cssVars: (map: Record<string, string>) => Record<string, string>,
 *   data: import('./worksheet-data.js').WorksheetData,
 *   instances?: import('./instances.js').InstancesReader,
 *   openDialog: (ref: string, opts?: import('./command-directives.js').DialogOptions) => Promise<void> }} ViewContext
 */
/**
 * `this` in den Gliedern eines `view`-Blocks. Die eigenen Glieder des Blocks
 * sind untereinander `any`. `fieldError(path)` ist die letzte Ablehnung des
 * `x-field` mit diesem Ausdruck (sonst `''`).
 * @template M, S
 * @typedef {{ model: M, state: S, t: (key: string, params?: object) => string,
 *   fieldError: (path: string) => string, moduleId: string, $refs: Record<string, HTMLElement>, $root: HTMLElement,
 *   $watch: Function, $nextTick: Function }} ViewThis
 */
/**
 * Der `view`-Block eines Moduls in der neuen Form. `computed: { name() {…} }`
 * liefert Ableitungen, als `this.<name>` lesbar.
 * @template M, S
 * @typedef {(ctx: ViewContext) => Record<string, any> & ThisType<Record<string, any> & ViewThis<M, S>>} ViewFn
 */
/** Zeilen eines Tabellen-Exports; die erste Zeile ist der Kopf. @typedef {(string|number|null)[][]} ExportRows */
/**
 * `this` in den Mappern eines `exports`-Blocks: die Komponente wie im
 * `view`-Block, dazu `cssVars`.
 * @template M, S
 * @typedef {ViewThis<M, S> & { cssVars: (map: Record<string, string>) => Record<string, string> }} ExportThis
 */
/**
 * Der `exports`-Block eines Moduls: Mapper nach Datenform. Die Formate
 * folgen daraus (`core/exporter.js`).
 * @template M, S
 * @typedef {{ fileName?: string|(() => string),
 *   table?: () => ExportRows|Promise<ExportRows>,
 *   tables?: () => Record<string, ExportRows>|Promise<Record<string, ExportRows>>,
 *   tree?: () => unknown,
 *   image?: () => string|Promise<string> } & ThisType<Record<string, any> & ExportThis<M, S>>} ExportsDef
 */

/**
 * Pure gate: returns true iff the given route store state belongs to the
 * specified module instance.  Used by createModule's generic onRouteChanged
 * wiring and exported for unit-testing without a live Alpine mount.
 *
 * @param {{ instanceId?: string, sub?: unknown } | null | undefined} store
 * @param {string} instanceId
 * @returns {boolean}
 */
export function shouldApplyRoute(store, instanceId) {
  return Boolean(store && store.instanceId === instanceId);
}

/**
 * Eigenschaften samt Gettern/Settern übertragen. Spread und
 * `Object.assign` werten Getter einmal aus und kopieren den Wert — ein
 * berechneter Anzeigewert im Viewmodel wäre danach eingefroren.
 * @param {object} target @param {object} source @returns {object} target
 */
function copyMembers(target, source) {
  return Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
}

/** Erlaubte Schlüssel in `exports`; die Mapper darunter. */
const EXPORT_KEYS = ['fileName', 'table', 'tables', 'tree', 'image'];
const EXPORT_MAPPERS = ['table', 'tables', 'tree', 'image'];

/**
 * CSS-Variablen an `el`, getrimmt; fehlt eine, `''`.
 * @param {Element|null|undefined} el @param {Record<string, string>} map
 * @returns {Record<string, string>}
 */
function readCssVars(el, map) {
  const style = el ? getComputedStyle(el) : null;
  return Object.fromEntries(Object.entries(map).map(([key, name]) => [key, style ? style.getPropertyValue(name).trim() : '']));
}

/**
 * `exports` prüfen; wirft mit der Modul-Id.
 * @param {string} id @param {Record<string, unknown>} def @param {boolean} hasView
 */
function checkExports(id, def, hasView) {
  if (!hasView) throw new Error(`createModule(${id}): exports requires view`);
  if (def === null || typeof def !== 'object' || Array.isArray(def)) throw new Error(`createModule(${id}): exports must be an object`);
  for (const key of Object.keys(def)) {
    if (!EXPORT_KEYS.includes(key)) throw new Error(`createModule(${id}): exports.${key} is unknown (allowed: ${EXPORT_KEYS.join(', ')})`);
  }
  if (!EXPORT_MAPPERS.some((k) => def[k] !== undefined)) {
    throw new Error(`createModule(${id}): exports needs at least one of ${EXPORT_MAPPERS.join(', ')}`);
  }
  for (const key of EXPORT_MAPPERS) {
    if (def[key] !== undefined && typeof def[key] !== 'function') throw new Error(`createModule(${id}): exports.${key} must be a function`);
  }
  if (def.fileName !== undefined && typeof def.fileName !== 'string' && typeof def.fileName !== 'function') {
    throw new Error(`createModule(${id}): exports.fileName must be a string or a function`);
  }
}

/**
 * Der Lesezustand eines Schema-Models: die Felder ohne Ansichtsfelder, darüber
 * die Ableitungen und `asyncTasks`. Massenfelder kommen als Deskriptor, die
 * Zeilen nur, wenn `options.fields` sie nennt. Gemountet und ohne Mount gleich.
 * @param {object} entry aus `schemaAgentEntry` @param {object} model
 * @param {object|undefined} options `{ fields?, rows? }`
 * @param {Record<string, any>} values Werte der Ableitungen nach Name
 * @param {string[]} bulk davon die Massenfelder
 * @param {object} [asyncTasks] Status der asynchronen Abläufe
 * @returns {object}
 * @throws {Error} wenn `options.rows` kaputt ist
 */
function assembleRead(entry, model, options, values, bulk, asyncTasks) {
  /** @type {Record<string, any>} */
  const extra = {};
  for (const [name, value] of Object.entries(values)) {
    if (bulk.includes(name)) {
      const rows = Array.isArray(value) ? value : [];
      const wanted = Array.isArray(options?.fields) && options.fields.includes(name);
      // Ohne angeforderte Zeilen genügt der Deskriptor: kein Klon der Zeilen.
      extra[name] = wanted ? cloneJSON(rows) : rows;
      extra[`${name}Columns`] = [...new Set(rows.flatMap((row) => Object.keys(row ?? {})))];
      continue;
    }
    extra[name] = value === undefined ? null : cloneJSON(value);
  }
  if (asyncTasks) extra.asyncTasks = asyncTasks;
  return readSchemaModel(entry, model, options, extra);
}

/**
 * Der Status der asynchronen Abläufe im Ruhezustand, wie `readStatus()` ihn vor dem ersten Lauf liefert.
 * @param {Record<string, { auto?: boolean }>} defs
 * @returns {Record<string, object>}
 */
function idleTaskStatus(defs) {
  return Object.fromEntries(Object.entries(defs).map(([name, def]) => {
    const base = { running: false, progress: null, error: null };
    return [name, def.auto ? { ...base, value: null } : base];
  }));
}

/**
 * Die Zellfunktionen der `derived`-Einträge eines Viewmodels. Jeder Eintrag
 * rechnet auf `vm.model`; `d.<name>` liest die Zelle eines anderen. Ein Zyklus
 * und der Fehler eines gelesenen Eintrags werfen wie ohne Mount (`evaluateDerived`).
 * @param {any} vm reaktive Komponente
 * @param {Record<string, Function>} defs `Model.schema.derived`
 * @param {any} data Arbeitsblattsicht
 * @returns {Record<string, () => any>}
 */
function derivedCells(vm, defs, data) {
  const names = Object.keys(defs);
  /** @type {string[]} */
  const evaluating = [];
  const failed = new Set();
  const d = derivedAccessor(names, (name) => {
    const at = evaluating.indexOf(name);
    if (at !== -1) throw new Error(`derived cycle: ${[...evaluating.slice(at), name].join(' → ')}`);
    const value = vm[name];
    if (failed.has(name)) throw new Error(value.error);
    return value;
  });
  return Object.fromEntries(names.map((name) => [name, () => {
    evaluating.push(name);
    try {
      const value = defs[name].call(vm.model, data, d);
      failed.delete(name);
      return value;
    } catch (err) {
      failed.add(name);
      throw err;
    } finally {
      evaluating.pop();
    }
  }]));
}

/**
 * Die Mitglieder, die ein Schema-Modul zusätzlich bekommt: `moduleId` (für
 * `x-field`), `read()` und je Viewmodel-Kommando eine geprüfte Methode.
 * @param {string} moduleId @param {object} entry @param {Record<string, object>} vmCommands
 * @param {string[]} [readNames] die `derived` des Models — `read()` liefert jedes; die `computed` des view-Blocks bleiben Ansichtshilfen
 * @param {string[]} [bulk] davon die Massenfelder
 * @returns {object}
 */
function schemaMembers(moduleId, entry, vmCommands, readNames = [], bulk = []) {
  const members = {
    moduleId,
    /** @noagent Lesefläche aus dem Schema (agent-schema.js) */
    read(options) {
      const values = Object.fromEntries(readNames.map((name) => [name, this[name]]));
      return assembleRead(entry, this.model, options, values, bulk,
        this._asyncTaskHost ? this._asyncTaskHost.readStatus() : undefined);
    },
  };
  for (const [name, def] of Object.entries(vmCommands)) {
    members[name] = function viewmodelCommand(cmd) { return runCommand(name, def, this, this.model, cmd); };
  }
  return members;
}

/**
 * Das Kommando einer Geste auf dem reaktiven Model ausführen — Model- oder
 * Viewmodel-Kommando, wie die Agentenfläche (Spec C §6).
 * @param {object} vm reaktives Viewmodel (Alpine-Zustand der Instanz)
 * @param {Record<string, object>} vmCommands
 * @param {string} name @param {object} args
 * @returns {any} Ergebnis von `run`
 * @throws {Error} unbekanntes Kommando oder Prüfung in `runCommand`
 */
function executeCommand(vm, vmCommands, name, args) {
  const commands = schemaOf(vm.model)?.commands ?? {};
  if (Object.hasOwn(commands, name)) return vm.model[name](args);
  if (Object.hasOwn(vmCommands, name)) return vm[name](args);
  return requireKnownId('command', name, [...Object.keys(commands), ...Object.keys(vmCommands)]);
}

/** Glieder, die createModule selbst setzt — kein view-Glied, computed, Feld, Kommando oder Task darf so heißen. */
const RESERVED_MEMBERS = Object.freeze(['model', 'state', 't', 'fieldError', 'moduleId', 'read', 'cssVars', 'changeRoute', '_ui', '_asyncTasks', '_asyncTaskHost', 'asyncTasks']);
/** Lebenszyklus des view-Blocks — als Name eines computed, Felds, Kommandos oder Tasks gesperrt. */
const LIFECYCLE = Object.freeze(['init', 'destroy']);

/**
 * Den view-Block einmal mit einem Probe-Kontext bauen und seine Glieder und
 * `computed` lesen, ohne dass ein Getter läuft. Liest der Block `ctx` außerhalb
 * seiner Glieder, wirft die Probe.
 * @param {string} id @param {(ctx: any) => object} view
 * @param {string[]} [derived] die `derived`-Namen des Models
 * @returns {{ members: string[], computed: Record<string, Function> }}
 * @throws {Error} reservierter Name, `computed` ohne Funktion, Kollision, Zugriff auf ctx
 */
function computedDefsOf(id, view, derived = []) {
  const probe = new Proxy({}, {
    get: (_t, prop) => { throw new Error(`createModule(${id}): view(ctx) reads ctx.${String(prop)} while the module is created — read ctx only inside members`); },
  });
  const block = view(probe);
  for (const name of Object.keys(block)) {
    if (RESERVED_MEMBERS.includes(name)) throw new Error(`createModule(${id}): view member ${name} is reserved`);
    if (name !== 'computed' && derived.includes(name)) throw new Error(`createModule(${id}): view member ${name} collides with derived`);
  }
  const desc = Object.getOwnPropertyDescriptor(block, 'computed');
  /** @type {Record<string, Function>} */
  const defs = desc ? (desc.value ?? {}) : {};
  for (const [name, fn] of Object.entries(defs)) {
    if (typeof fn !== 'function') throw new Error(`createModule(${id}): computed ${name} must be a function`);
    if (derived.includes(name)) throw new Error(`createModule(${id}): computed ${name} collides with derived`);
    if (Object.hasOwn(block, name) || RESERVED_MEMBERS.includes(name) || LIFECYCLE.includes(name)) {
      throw new Error(`createModule(${id}): computed ${name} collides with a member of the view block`);
    }
  }
  return { members: Object.keys(block).filter((n) => n !== 'computed'), computed: defs };
}

/**
 * Namen gegen die reservierten Glieder prüfen.
 * @param {string} id @param {string} kind `field` oder `command` @param {string[]} names
 * @returns {void}
 */
function checkReserved(id, kind, names) {
  for (const name of names) {
    if (RESERVED_MEMBERS.includes(name) || LIFECYCLE.includes(name)) throw new Error(`createModule(${id}): ${kind} ${name} is reserved`);
  }
}

/** Was in der neuen Form aus module.js kommt oder entfällt — nie in config. */
const NOT_IN_CONFIG = ['id', 'version', 'icon', 'phase', 'allowedPhases', 'engine', 'meta', 'templateUrl'];
/** Felder aus module.js, die die Instanz trägt (wie bisher aus config). */
const FROM_DESCRIPTOR = ['id', 'version', 'icon', 'phase', 'allowedPhases'];

// base.createDefault(context) — optional factory for the model of an empty instance.
// base.descriptor — module.js-Beschreibung (neue Form): liefert
// id/version/icon/phase/allowedPhases; Template unter resources/view.html;
// immer Alpine. Ohne descriptor gilt die alte Form (alles in config).
// base.view(ctx) — neue Form statt base.data(module, t): liefert Getter und
// Handler; `this` ist die Komponente mit model, state, t. base.State — UI-State
// aus defineState, nur zusammen mit view.
// Model.schema.derived — Ableitungen des Models, im Viewmodel als Zellen `this.<name>`, in read()
// als Lesefelder; derivedBulk sind ihre Massenfelder. Ohne Mount: loadDetached/readDetached.
// computed im view-Block sind Ansichtshilfen und stehen nicht in read().
// base.asyncTasks — asynchrone Abläufe (core/async-task.js), nur mit view und defineModel; Wert unter dem Namen, Status unter _asyncTasks.
// base.exports — Mapper nach Datenform (table/tables/tree/image, fileName),
// nur mit view; daraus entstehen Export-Menü und Dateien (core/exporter.js).
// base.forms — Namensraum von viewmodel/forms.js (defineForm), für
// x-command-form mit data-form; Vorgabe {}.
/**
 * Ein Modul aus Model, Viewmodel und Template bauen.
 * @template V
 * @template [T={}]
 * @param {{ view?: (ctx: any) => V, asyncTasks?: T } & Record<string, any>} base
 * @returns {Record<string, any> & { readonly __view?: V, readonly __asyncTasks?: T }}
 */
export function createModule(base) {
  const { config = {}, descriptor, Model, State: UiState, data, view, afterMount, beforeLoadExample, fromExample, createDefault, gestures = [], forms = {}, exports: exportsDef, asyncTasks: taskDefs = {} } = base;
  if (descriptor) {
    for (const key of NOT_IN_CONFIG) {
      if (Object.hasOwn(config, key)) {
        throw new Error(`createModule ${descriptor.id}: config.${key} gehört nicht in config — ${FROM_DESCRIPTOR.includes(key) ? 'steht in module.js' : 'entfällt in der neuen Form'}`);
      }
    }
  }
  const id = descriptor ? descriptor.id : config.id;
  if (data && view) throw new Error(`createModule(${id}): data and view are mutually exclusive`);
  if (UiState && !view) throw new Error(`createModule(${id}): State requires view`);
  if (Object.hasOwn(base, 'readComputed')) throw new Error(`createModule(${id}): readComputed is gone — computed is not readable`);
  if (Object.hasOwn(base, 'readBulk')) throw new Error(`createModule(${id}): readBulk is gone — use derivedBulk in the Model`);
  const taskNames = Object.keys(taskDefs);
  if (taskNames.length > 0 && !view) throw new Error(`createModule(${id}): asyncTasks needs view`);
  const schema = schemaOf(Model);
  const derivedDefs = schema?.derived ?? {};
  const derivedList = Object.keys(derivedDefs);
  const derivedBulk = [...(schema?.derivedBulk ?? [])];
  const probed = view ? computedDefsOf(id, view, derivedList) : { members: [], computed: {} };
  const computedNames = Object.keys(probed.computed);
  if (fromExample !== undefined && typeof fromExample !== 'function') throw new Error(`createModule(${id}): fromExample must be a function`);
  if (fromExample && beforeLoadExample) throw new Error(`createModule(${id}): fromExample and beforeLoadExample are exclusive`);
  if (exportsDef !== undefined) checkExports(id, exportsDef, Boolean(view));
  const actions = exportsDef === undefined ? (config.actions ?? []) : [...(config.actions ?? []), {
    icon: 'action.download',
    title: 'export.label',
    children: formatsOf(exportsDef).map((fmt) => ({ icon: `format.${fmt}`, title: `export.${fmt}`, export: fmt })),
  }];
  gestures.forEach((g, i) => {
    if (!isGesture(g)) throw new Error(`createModule ${id}: gestures[${i}] is not a defineGesture result`);
  });
  const alpine = descriptor ? true : config.engine === 'alpine';
  if (gestures.length > 0 && !alpine) throw new Error(`createModule ${id}: gestures require the Alpine engine`);
  const placement = descriptor
    ? { engine: 'alpine', ...Object.fromEntries(FROM_DESCRIPTOR.filter((k) => descriptor[k] !== undefined).map((k) => [k, descriptor[k]])) }
    : {};
  if (schema && descriptor) setModelName(Model, id);
  const vmCommands = base.commands ?? {};
  if (!schema && Object.keys(vmCommands).length > 0) {
    throw new Error(`createModule ${id}: commands need a defineModel Model`);
  }
  if (schema) {
    const fieldNames = [...Object.keys(schema.fields), ...Object.keys(schema.view)];
    checkReserved(id, 'field', fieldNames);
    checkReserved(id, 'command', [...Object.keys(schema.commands), ...Object.keys(vmCommands)]);
    checkReserved(id, 'derived', derivedList);
    // Oberfläche und Agentenfläche lösten einen gemeinsamen Namen verschieden auf.
    for (const name of Object.keys(vmCommands)) {
      if (Object.hasOwn(schema.commands, name)) throw new Error(`createModule(${id}): command ${name} is both a model and a viewmodel command`);
      if (derivedList.includes(name)) throw new Error(`createModule(${id}): command ${name} collides with derived`);
    }
    for (const name of fieldNames) {
      if (computedNames.includes(name)) throw new Error(`createModule(${id}): field ${name} collides with computed`);
      const base = name.endsWith('Columns') ? name.slice(0, -'Columns'.length) : null;
      if (base !== null && derivedBulk.includes(base)) {
        throw new Error(`createModule(${id}): field ${name} collides with derivedBulk ${base}`);
      }
    }
  }
  if (taskNames.length > 0) {
    if (!schema) throw new Error(`createModule(${id}): asyncTasks need a defineModel Model`);
    checkAsyncTasks(`createModule(${id})`, taskDefs, {
      ...Object.fromEntries(Object.keys(schema.fields).map((n) => [n, 'field'])),
      ...Object.fromEntries(Object.keys(schema.view).map((n) => [n, 'field'])),
      ...Object.fromEntries(Object.keys(schema.commands).map((n) => [n, 'command'])),
      ...Object.fromEntries(Object.keys(vmCommands).map((n) => [n, 'command'])),
      ...Object.fromEntries(probed.members.map((n) => [n, 'view member'])),
      ...Object.fromEntries(computedNames.map((n) => [n, 'computed'])),
      ...Object.fromEntries(derivedList.map((n) => [n, 'derived'])),
      ...Object.fromEntries([...RESERVED_MEMBERS, ...LIFECYCLE].map((n) => [n, 'view member'])),
    });
  }
  const agentEntry = schema ? schemaAgentEntry(Model, vmCommands, { asyncTasks: taskDefs }) : undefined;
  // Zellen im Viewmodel: erst die Ableitungen des Models, dann die computed des view-Blocks.
  const cellNames = [...derivedList, ...computedNames];
  const i18nKey = `modules.${  id}`;
  // Derive the template URL from document.baseURI so the key is stable whether
  // the app runs unbundled or from app.min.js (where import.meta.url → bundle path).
  const templateUrl = descriptor
    ? new URL(`js/modules/${id}/resources/view.html`, document.baseURI).href
    : config.templateUrl
      ? config.templateUrl
      : new URL(`js/modules/${id}/${id}.html`, document.baseURI).href;
  const tplKey = templateKey(templateUrl);
  // Alpine's CSP build parses the x-data expression, so the component name must be a
  // valid JS identifier — a kebab-case id like "triz-resources" would be read as the
  // subtraction "triz - resources". Register/reference Alpine components in camelCase.
  const alpineName = id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

  /**
   * Clone the module template and rebind its root `x-data` from the shared,
   * module-level component name to a per-INSTANCE name.
   *
   * Every instance of the same module would otherwise register Alpine.data()
   * under the same `alpineName` (last write wins). When Alpine re-initialises a
   * re-attached instance on a phase switch, every `[x-data="<module>"]` node then
   * resolves to the LAST-registered instance's factory — so an earlier instance
   * re-inits as the wrong instance, mounting into the wrong container and
   * cross-contaminating state (the "two Datensammlung tabs" bug: first tab empty,
   * last tab renders two grids). A unique name per instanceId keeps each
   * container bound to its own factory.
   *
   * @param {string} uniqueName  per-instance Alpine component name
   * @returns {Node[]}
   */
  function cloneForInstance(uniqueName) {
    const nodes = cloneTemplate(tplKey);
    for (const node of nodes) {
      if (node.nodeType !== 1) continue; // ELEMENT_NODE
      if (node.getAttribute('x-data') === alpineName) node.setAttribute('x-data', uniqueName);
      node.querySelectorAll(`[x-data="${alpineName}"]`).forEach(el => el.setAttribute('x-data', uniqueName));
    }
    return nodes;
  }

  const m = {
    i18nKey,
    imagePaths(json) { return Model.imagePaths?.(json) ?? []; },
    ...placement,
    ...config,
    agentEntry,
    Model,
    /**
     * Ein Model ohne Mount laden: gespeicherter Zustand oder die Vorgabe
     * (`createDefault`), im Kontext des Projekts. Kommandos melden
     * `command:executed` mit `instanceId` wie im Mount.
     * @param {object|null|undefined} json gespeicherter Zustand
     * @param {{ instanceId: string, eventBus?: any, stateManager?: any }} services
     * @returns {object} das Model
     */
    loadDetached(json, { instanceId, eventBus, stateManager } = /** @type {any} */ ({})) {
      const model = initialModel(Model, json, createDefault, { instanceId, eventBus, stateManager });
      if (schema) {
        setModelContext(model, activeContext(stateManager));
        setCommandObserver(model, (command, args, result) => eventBus?.emit?.(
          'command:executed', { instanceId, command, args, result }));
      }
      return model;
    },
    /**
     * Der Lesezustand eines Models ohne Mount, gleich dem gemounteten `read()`:
     * Felder ohne Ansichtsfelder, die Ableitungen des Models, `asyncTasks` im Ruhezustand.
     * @param {object} model aus `loadDetached`
     * @param {any} data Arbeitsblattsicht
     * @param {object} [options] `{ fields?, rows? }`
     * @returns {object}
     * @throws {Error} ohne Schema-Model oder wenn `options.rows` kaputt ist
     */
    readDetached(model, data, options) {
      if (!agentEntry) throw new Error(`createModule(${id}): readDetached needs a defineModel Model`);
      return assembleRead(agentEntry, model, options, evaluateDerived(model, data), derivedBulk,
        taskNames.length > 0 ? idleTaskStatus(taskDefs) : undefined);
    },
    // Methode, nicht Pfeil: die neue Form braucht die aktive Sprache der Instanz.
    // hasModuleHelp/hasModuleReferences: einmal beim Erzeugen ausgewertet. Das
    // genügt — der Katalog (#module-resources, HELP/REFS) ist statisch und vor
    // dem ersten createModule gesetzt.
    help: hasModuleHelp(id) ? function help() { return getModuleHelp(id, this._context?.i18n?.getLanguage()); } : undefined,
    references: hasModuleReferences(id) ? () => getModuleReferences(id) : undefined,

    _container: null,
    _context: null,
    _tmpl: null,
    _gestureDetach: [],
    _applyingRemote: false,

    async init(container, context) {
      this._container = container;
      this._context = context;

      // Per-instance Alpine component name — see cloneForInstance() for why the
      // shared module-level name causes multi-instance cross-contamination.
      // instanceId is a UUID; strip non-identifier chars so the CSP x-data parser
      // reads it as a single identifier (alpineName prefix guarantees a letter start).
      const uniqueName = `${alpineName}_${String(context.instanceId).replace(/[^a-zA-Z0-9]/g, '')}`;
      this._alpineName = uniqueName;

      const saved = context.stateManager.getModuleState(context.instanceId);
      const state = initialModel(Model, saved, createDefault, context);

      if (!container.id) container.id = `${id  }-${  context.instanceId}`;

      const module = this;
      const _t = module._context.i18n.tf(i18nKey);

      const dataCtxTarget = {};
      let dataResult;
      let computedDefs = null;
      const worksheetData = view || derivedList.length > 0 ? createWorksheetData(context.stateManager) : null;
      if (view) {
        // Neue Form: kein `module`, nur die Dienste und Kennungen.
        dataResult = view({
          context,
          notify: (...args) => context.notify(...args),
          dialog: context.dialog,
          i18n: context.i18n,
          eventBus: context.eventBus,
          instanceId: context.instanceId,
          moduleId: id,
          data: worksheetData,
          instances: context.instances,
          cssVars: (map) => readCssVars(container.querySelector('[x-data]'), map),
          openDialog: (ref, opts) => openDialogSafely(Alpine, container.querySelector('[x-data]'), ref, opts),
        });
        // `computed` ist kein Glied, sondern die Liste der Ableitungen — vor
        // dem Kopieren herausnehmen (der Deskriptor, nicht der Wert: Getter
        // des Blocks dürfen hier noch nicht laufen). Namen und Kollisionen
        // sind beim Anlegen geprüft (computedDefsOf).
        const computedDesc = Object.getOwnPropertyDescriptor(dataResult, 'computed');
        computedDefs = computedDesc ? computedDesc.value : null;
        if (computedDesc) delete dataResult.computed;
      } else {
        const dataCtx = new Proxy(dataCtxTarget, {
          get: (t, prop) => t[prop],
          set: (t, prop, value) => { t[prop] = value; return true; }
        });
        dataResult = data.call(dataCtx, module, _t);
      }

      if (alpine) {
        dataCtxTarget.t = _t;
        dataCtxTarget.model = state;
        copyMembers(dataCtxTarget, dataResult);

        // The data-fn may define its own init()/destroy() lifecycle hooks (e.g. async
        // data loading). The object literal below redefines init/destroy after the
        // ...dataResult spread, which would shadow them — so capture and invoke them
        // explicitly. (Mirrors the legacy engine, whose component init ran the data-fn init.)
        const dataInit = dataResult.init;
        const dataDestroy = dataResult.destroy;

        Alpine.data(uniqueName, () => {
          // Nach `setState` steht das eben geladene Model bereit: nicht erneut laden.
          const preloaded = module._preloadedModel;
          module._preloadedModel = null;
          const freshState = preloaded ?? initialModel(Model,
            context.stateManager.getModuleState(context.instanceId), createDefault, context);

          let offCycle = null;
          let releaseComputed = null;
          let taskHost = null;
          if (schema) {
            setModelContext(freshState, activeContext(context.stateManager));
          }

          if (schema) {
            // Das Model kennt den Bus nicht; der Beobachter übersetzt.
            setCommandObserver(freshState, (command, args, result) => context.eventBus?.emit?.(
              'command:executed', { instanceId: context.instanceId, command, args, result }));
          }

          const comp = {
            model: freshState,
            t: _t,
            /**
             * Zahl für die Anzeige im Format der App-Sprache (`x-text="num(model.mean, 3)"`).
             * Liest die Sprache bei jedem Aufruf; `onLanguageChange` baut den Baum neu auf.
             * @param {number|null|undefined} value
             * @param {number} [decimals]
             * @returns {string}
             */
            num(value, decimals) {
              return formatNumber(value, context.language, decimals === undefined ? {} : { decimals });
            },
            /** Navigate the active module to a sub-path. Modules may override this. */
            changeRoute(sub) { this.$route?.go(sub); },
          };
          // Neue Form: UI-State je Komponente, frisch aus dem Schema.
          // Die Ablehnungen der x-field leben ebenso je Komponente und sterben mit ihr.
          const fieldErrors = view ? createFieldErrors(Alpine) : null;
          if (view) {
            Object.assign(comp, { state: UiState ? UiState.create() : {}, moduleId: id });
            comp.cssVars = function cssVars(map) { return readCssVars(this.$root, map); };
            Object.defineProperty(comp, 'fieldError', {
              enumerable: false,
              configurable: true,
              value: (path) => fieldErrors.message(path),
            });
          }
          if (schema) copyMembers(comp, schemaMembers(id, agentEntry, vmCommands, derivedList, derivedBulk));
          if (schema || exportsDef) {
            // Griff der Kommando-Primitive (core/command-directives.js) und, für
            // exports/component, von runExport (core/exporter.js). Nicht
            // aufzählbar; `this` ist Alpines Proxy, `this.model` also reaktiv.
            // Den Dialog-Dienst gibt es erst nach Alpine.start() — beim Lesen holen.
            const storedEditsOff = withoutStoredEdits(context.chartManager ?? null);
            Object.defineProperty(comp, '_ui', {
              enumerable: false,
              configurable: true,
              get() {
                return {
                  model: this.model,
                  notify: (...args) => context.notify?.(...args),
                  dialog: context.dialog,
                  i18n: context.i18n,
                  services: {
                    eventBus: context.eventBus, stateManager: context.stateManager, i18n: context.i18n,
                    chartManager: storedEditsOff, instanceId: context.instanceId, moduleId: id,
                  },
                  moduleId: id,
                  instanceId: context.instanceId,
                  forms,
                  fieldErrors,
                  vmCommands,
                  exports: exportsDef ?? null,
                  component: this,
                };
              },
            });
          }
          copyMembers(comp, dataResult);
          if (cellNames.length > 0) defineComputedSlots(comp, cellNames);
          if (taskNames.length > 0) defineAsyncTaskSlots(comp, taskNames);
          // Der Griff gehört zur Komponente, nicht zum Alpine-Proxy: im Getter lesen, nicht nachträglich setzen.
          if (taskNames.length > 0) Object.defineProperty(comp, '_asyncTaskHost', { get: () => taskHost, enumerable: false, configurable: true });
          return copyMembers(comp, {
            init() {
              freshState.init?.();
              if (schema) {
                // Der Kontext folgt Zyklus und Einstellungen des Projekts (Phasen-Vorgaben, Invarianten, Vorgaben aus dem Kontext).
                const refresh = () => setModelContext(this.model, activeContext(context.stateManager));
                const onSettings = (p) => { if (p?.key === 'confidenceLevel' || p?.key === 'power') refresh(); };
                context.eventBus?.on?.('cycle:changed', refresh);
                context.eventBus?.on?.('settings:changed', onSettings);
                offCycle = () => {
                  context.eventBus?.off?.('cycle:changed', refresh);
                  context.eventBus?.off?.('settings:changed', onSettings);
                };
              }
              // UI-State ist nicht gespeichert, aber beobachtbar — wie
              // command:executed für das Model. $watch liest tief.
              if (UiState) {
                for (const key of Object.keys(UiState.schema.fields)) {
                  this.$watch(() => this.state[key], (value) => context.eventBus?.emit?.(
                    'state:changed', { instanceId: context.instanceId, key, value: cloneJSON(value) }));
                }
              }
              if (cellNames.length > 0) {
                releaseComputed = bindComputed(Alpine, this, {
                  ...derivedCells(this, derivedDefs, worksheetData), ...(computedDefs ?? {}),
                });
              }
              // Der Task-Host steht vor view().init() — init darf Tasks starten und lesen.
              if (taskNames.length > 0) {
                const vm = this;
                taskHost = createAsyncTasks({
                  defs: taskDefs,
                  vm,
                  reactivity: { effect: (fn) => Alpine.effect(fn), release: (h) => Alpine.release(h) },
                  checkArgs: (name, params, args) => checkParams(name, params, args, vm.model),
                  notify: (message) => context.notify?.(message, 'error'),
                });
              }
              dataInit?.call(this);
              // Automatic persist-$watch: persists on every model mutation by
              // deep-cloning model.toJSON() through Alpine's reactivity proxy.
              //
              // `config.manualPersist === true` opts OUT of this watch. The module
              // MUST then call module._persist()/ctx.stateManager.setModuleState()
              // on every state-changing path itself. Use only for modules that own
              // debounced persistence over large/opaque state (e.g. worksheet, whose
              // workbook deep-clone is expensive and already flushed by its own
              // debounced persister). Default/omitted ⇒ auto-watch registered
              // (current behaviour, unchanged for all other modules).
              if (config.manualPersist !== true) {
                this.$watch(
                  () => this.model.toJSON(),
                  () => module._persist(this.model)
                );
              }
              // Generic sub-route binding: if the module's data-fn defines
              // onRouteChanged(sub), wire it to the route store. The gate
              // `store.instanceId === context.instanceId` is the CORRECTNESS
              // KEYSTONE — only the currently-routed instance reacts; all hidden
              // sibling instances of the same module type stay silent.
              if (typeof this.onRouteChanged === 'function') {
                const applyRoute = () => {
                  const store = this.$store.route;
                  if (!shouldApplyRoute(store, context.instanceId)) return;
                  this.onRouteChanged(Array.isArray(store.sub) ? store.sub : []);
                };
                this.$watch(() => this.$store.route?.sub, applyRoute);
                this.$watch(() => this.$store.route?.instanceId, applyRoute);
                applyRoute();
              }
            },
            destroy() {
              taskHost?.release(); taskHost = null;
              releaseComputed?.(); releaseComputed = null;
              offCycle?.(); offCycle = null;
              fieldErrors?.dispose();
              dataDestroy?.call(this);
              freshState.destroy?.();
            }
          });
        });

        container.replaceChildren(...cloneForInstance(uniqueName));
        Alpine.initTree(container);
        // Gesten hängen am Container (Delegation) und überleben Sprachwechsel
        // und setState (die eine laufende Geste abbrechen); das Viewmodel wird
        // je Geste frisch aufgelöst.
        module._gestureDetach.forEach((detach) => detach());
        const currentVm = () => Alpine.$data(container.querySelector('[x-data]'));
        const gestureEnv = {
          execute: (name, args) => executeCommand(currentVm(), vmCommands, name, args),
          notify: (message, type) => context.notify?.(message, type),
          t: _t,
        };
        module._gestureDetach = gestures.map((g) => attachGesture(container, g, currentVm, gestureEnv));
        module._tmpl = {
          _state: state,
          getState() { return { model: this._state }; }
        };
        afterMount?.(module);
        
      }
    },

    async destroy() {
      // Guard: a detached/aborted instance (init threw or never ran to
      // completion) can reach destroy() with no mounted container — nothing
      // to tear down.
      if (!this._container) return;
      if (alpine) {
        this._gestureDetach.forEach((detach) => detach());
        this._gestureDetach = [];
        this._container.querySelectorAll('[x-data]').forEach(root => {
          Alpine.destroyTree(root);
        });
        this._container.replaceChildren();
        return;
      }
      this._container.querySelectorAll('[x-data]').forEach(root => {
        if (root.__alpineState && typeof root.__alpineState.destroy === 'function') {
          root.__alpineState.destroy.call(root.__alpineState);
        }
      });
      this._container.replaceChildren();
    },

    onLanguageChange() {
      if (alpine) {
        // Eine laufende Geste verlöre mit dem DOM ihren Griff und hielte die Sperre.
        this._gestureDetach.forEach((detach) => detach.cancel());
        Alpine.destroyTree(this._container);
        this._container.replaceChildren(...cloneForInstance(this._alpineName));
        // Eine gelöste Hülle (Instanz einer anderen Phase) bleibt unbelebt:
        // beim Wiedereinhängen baut Alpine sie aus dem gespeicherten Stand neu
        // auf. Belebt hielte sie ein altes Model, das beim nächsten Speichern
        // aller Instanzen einen inzwischen gespeicherten Stand überschriebe.
        if (this._container.isConnected) Alpine.initTree(this._container);
      }
    },

    onThemeChange() {},

    getState() {
      if (alpine) {
        const root = this._container?.querySelector('[x-data]');
        if (root) {
          try {
            return Alpine.$data(root).model?.toJSON?.() ?? null;
          } catch {
            return this._tmpl?._state?.toJSON?.() ?? null;
          }
        }
        return this._tmpl?._state?.toJSON?.() ?? null;
      }
    },

    getActions() { return actions; },

    getActionData() {
      if (!alpine) return null;
      const root = this._container?.querySelector('[x-data]');
      return root ? Alpine.$data(root) : null;
    },

    bindEffect(fn) {
      const handle = Alpine.effect(fn);
      return () => Alpine.release(handle);
    },

    setState(state) {
      if (alpine) {
        const model = loadModel(Model, state, schema ? activeContext(this._context?.stateManager) : undefined);
        this._persist(model);
        // Guard: a detached/aborted instance (init threw or never ran to
        // completion) has no mounted container. Still persist the state —
        // it will be read fresh the next time the instance is mounted —
        // but skip the DOM remount, there is nothing to remount into.
        if (!this._container) {
          if (this._tmpl) {
            this._tmpl._state = model;
          } else {
            this._tmpl = { _state: model, getState() { return { model: this._state }; } };
          }
          return;
        }
        this._gestureDetach.forEach((detach) => detach.cancel());
        Alpine.destroyTree(this._container);
        this._container.replaceChildren(...cloneForInstance(this._alpineName));
        // Gelöste Hülle: gespeichert ist schon, das Wiedereinhängen lädt neu (wie onLanguageChange).
        if (!this._container.isConnected) {
          if (this._tmpl) this._tmpl._state = model;
          return;
        }
        this._preloadedModel = model;
        try { Alpine.initTree(this._container); } finally { this._preloadedModel = null; }
        const root = this._container.querySelector('[x-data]');
        if (root) {
          const alpineData = Alpine.$data(root);
          this._tmpl = {
            _state: alpineData.model,
            getState() { return { model: this._state }; }
          };
        } else {
          this._tmpl._state = model;
        }
        
      }
    },

    applyRemoteState(state) {
      if (!alpine) return;
      const root = this._container?.querySelector('[x-data]');
      if (!root) return;
      const fresh = loadModel(Model, state, schema ? activeContext(this._context?.stateManager) : undefined);
      this._applyingRemote = true;
      const live = Alpine.$data(root).model;
      // Accessoren am Prototyp: Object.assign träfe nur `_v` und ersetzte das
      // reaktive Werteobjekt am Proxy vorbei.
      if (schema) replaceFields(live, fresh);
      else Object.assign(live, fresh);
      // Reset after Alpine flushes the reactive effects this mutation queued —
      // the persist-$watch runs in that flush and must see the guard still set.
      // queueMicrotask can resolve before the scheduler flush, leaking a persist.
      Alpine.nextTick(() => { this._applyingRemote = false; });
    },

    _persist(model) {
      if (this._applyingRemote) return;
      this._context.stateManager.setModuleState(this._context.instanceId, model.toJSON());
    },
  };

  if (typeof Model.prototype.hasContent === 'function') {
    m.loadExample = async function (payload) {
      if (!payload || !payload.data) return;
      // Read the LIVE state (engine-aware) — for the Alpine engine the reactive model
      // lives inside the Alpine component, not in _tmpl._state.
      const current = this.getState();
      const model = current ? loadModel(Model, current, schema ? activeContext(this._context?.stateManager) : undefined) : null;
      if (typeof model?.hasContent === 'function' && model.hasContent() && this._context?.dialog) {
        const ok = await this._context.dialog.confirm({
          message: this._context.i18n.t('moduleHelp.confirmOverwrite'),
          danger: true,
        });
        if (!ok) return;
      }
      let exampleData = payload.data;
      // `fromExample` übersetzt fremde Beispielformen (etwa eine CSV-Datei) in
      // die eigene, bevor ein Arbeitsblatt bereitgestellt wird.
      // Beispiele mit eigenem Arbeitsblatt: provisionieren und die Spalten-
      // bezüge aus dem Schema umhängen (examples-registry.js). Dynamisch
      // geladen — examples-registry hängt am Katalog der Module. Die Rückfrage
      // oben gilt auch hier (`confirmed`), der Lader fragt nicht noch einmal.
      const hasFromExample = typeof fromExample === 'function';
      const registry = (hasFromExample || (schema && payload.data.sourceWorksheetData))
        ? await import('./examples-registry.js') : null;
      if (hasFromExample) {
        try {
          exampleData = fromExample(payload.data, payload.meta ?? {}, { csvToWorksheet: registry.csvPayloadToWorksheetState });
        } catch (err) {
          console.warn(`[createModule] ${id}: fromExample failed`, err);
          this._context?.notify?.(this._context.i18n.t('moduleHelp.exampleLoadError'), 'error');
          return;
        }
      }
      const loadWorksheetExample = schema && exampleData?.sourceWorksheetData
        ? registry.loadWorksheetExample : null;
      /** @type {Promise<void>|null} */
      let loading = null;
      // `_loadingExample` marks the synchronous window in which a hook-driven
      // side effect (e.g. examples-registry.js `provisionInstance`) may emit a
      // global event (`module:added`) BEFORE `setState()` below has replaced
      // this instance's own (about-to-be-destroyed) Alpine component. Modules
      // that react to such events reactively (kano.js `refreshTrees`) can read
      // this flag on `this`/`module` — the wrapper object is stable across the
      // `setState()` destroy/rebuild — to skip a self-mutation that would
      // otherwise flow through this OLD component's still-active persist
      // $watch and silently overwrite the example's correct state once Alpine
      // flushes its reactivity queue (a later microtask, after this function
      // returns). Unused by modules without `beforeLoadExample` side effects —
      // no behaviour change for them.
      this._loadingExample = true;
      try {
        if (typeof beforeLoadExample === 'function') {
          exampleData = beforeLoadExample.call(this, payload.data);
        }
        if (loadWorksheetExample) {
          // Ohne Rückfrage läuft der Lader bis zum Ende synchron — Arbeits-
          // blatt, setState und Meldung fallen in dieses Fenster.
          // `prevId` stammt aus dem vor dem Hook geladenen Stand: der Hook ersetzt ihn nicht.
          loading = loadWorksheetExample(this, { ...payload, data: exampleData },
            { Model, confirmed: true, prevId: model?.exampleWorksheetId ?? null });
        } else {
          this.setState(exampleData);
        }
      } finally {
        this._loadingExample = false;
      }
      if (loading) return loading;
      const lang = this._context.i18n.getLanguage();
      const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
      this._context.notify?.(
        this._context.i18n.t('moduleHelp.exampleLoaded').replace('{title}', title),
        'success'
      );
    };
  } else {
    console.warn(`[createModule] ${id}: loadExample benötigt hasContent() im Model — wird übersprungen`);
  }

  return m;
}
