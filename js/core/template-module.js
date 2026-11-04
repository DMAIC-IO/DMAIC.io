import Alpine from '@alpinejs/csp';
import { cloneTemplate, templateKey } from './dom.js';
import { getModuleHelp, hasModuleHelp } from './help-registry.js';
import { getModuleReferences, hasModuleReferences } from './references-registry.js';
import { initialModel, loadModel } from './initial-model.js';
import { schemaOf, setModelName, setCommandObserver, replaceFields, runCommand } from './model.js';
import { schemaAgentEntry, readSchemaModel } from './agent/agent-schema.js';
import { attachGesture } from './interaction/attach.js';
import { isGesture } from './interaction/define.js';
import { requireKnownId } from './validate.js';

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

/**
 * Die Mitglieder, die ein Schema-Modul zusätzlich bekommt: `moduleId` (für
 * `x-field`), `read()` und je Viewmodel-Kommando eine geprüfte Methode.
 * @param {string} moduleId @param {object} entry @param {Record<string, object>} vmCommands
 * @returns {object}
 */
function schemaMembers(moduleId, entry, vmCommands) {
  const members = {
    moduleId,
    /** @noagent Lesefläche aus dem Schema (agent-schema.js) */
    read(options) { return readSchemaModel(entry, this.model, options); },
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

/** Was in der neuen Form aus module.js kommt oder entfällt — nie in config. */
const NOT_IN_CONFIG = ['id', 'version', 'icon', 'phase', 'allowedPhases', 'engine', 'meta', 'templateUrl'];
/** Felder aus module.js, die die Instanz trägt (wie bisher aus config). */
const FROM_DESCRIPTOR = ['id', 'version', 'icon', 'phase', 'allowedPhases'];

// base.createDefault(context) — optional factory for the model of an empty instance.
// base.descriptor — module.js-Beschreibung (neue Form): liefert
// id/version/icon/phase/allowedPhases; Template unter resources/view.html;
// immer Alpine. Ohne descriptor gilt die alte Form (alles in config).
export function createModule(base) {
  const { config = {}, descriptor, Model, data, afterMount, beforeLoadExample, createDefault, gestures = [] } = base;
  if (descriptor) {
    for (const key of NOT_IN_CONFIG) {
      if (Object.hasOwn(config, key)) {
        throw new Error(`createModule ${descriptor.id}: config.${key} gehört nicht in config — ${FROM_DESCRIPTOR.includes(key) ? 'steht in module.js' : 'entfällt in der neuen Form'}`);
      }
    }
  }
  const id = descriptor ? descriptor.id : config.id;
  gestures.forEach((g, i) => {
    if (!isGesture(g)) throw new Error(`createModule ${id}: gestures[${i}] is not a defineGesture result`);
  });
  const alpine = descriptor ? true : config.engine === 'alpine';
  if (gestures.length > 0 && !alpine) throw new Error(`createModule ${id}: gestures require the Alpine engine`);
  const placement = descriptor
    ? { engine: 'alpine', ...Object.fromEntries(FROM_DESCRIPTOR.filter((k) => descriptor[k] !== undefined).map((k) => [k, descriptor[k]])) }
    : {};
  const schema = schemaOf(Model);
  if (schema && descriptor) setModelName(Model, id);
  const vmCommands = base.commands ?? {};
  if (!schema && Object.keys(vmCommands).length > 0) {
    throw new Error(`createModule ${id}: commands need a defineModel Model`);
  }
  const agentEntry = schema ? schemaAgentEntry(Model, vmCommands) : undefined;
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
    // Methode, nicht Pfeil: die neue Form braucht die aktive Sprache der Instanz.
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
      const dataCtx = new Proxy(dataCtxTarget, {
        get: (t, prop) => t[prop],
        set: (t, prop, value) => { t[prop] = value; return true; }
      });
      const dataResult = data.call(dataCtx, module, _t);

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
          const freshState = initialModel(Model,
            context.stateManager.getModuleState(context.instanceId), createDefault, context);

          if (schema) {
            // Das Model kennt den Bus nicht; der Beobachter übersetzt.
            setCommandObserver(freshState, (command, args, result) => context.eventBus?.emit?.(
              'command:executed', { instanceId: context.instanceId, command, args, result }));
          }

          const comp = {
            model: freshState,
            t: _t,
            /** Navigate the active module to a sub-path. Modules may override this. */
            changeRoute(sub) { this.$route?.go(sub); },
          };
          if (schema) copyMembers(comp, schemaMembers(id, agentEntry, vmCommands));
          copyMembers(comp, dataResult);
          return copyMembers(comp, {
            init() {
              freshState.init?.();
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
        Alpine.initTree(this._container);

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

    getActions() { return config.actions ?? []; },

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
        const model = loadModel(Model, state);
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
        Alpine.initTree(this._container);
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
      const fresh = loadModel(Model, state);
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
      const model = current ? loadModel(Model, current) : null;
      if (typeof model?.hasContent === 'function' && model.hasContent() && this._context?.dialog) {
        const ok = await this._context.dialog.confirm({
          message: this._context.i18n.t('moduleHelp.confirmOverwrite'),
          danger: true,
        });
        if (!ok) return;
      }
      let exampleData = payload.data;
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
        this.setState(exampleData);
        this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
      } finally {
        this._loadingExample = false;
      }
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
