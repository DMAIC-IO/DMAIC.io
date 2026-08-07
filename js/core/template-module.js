import Alpine from '@alpinejs/csp';
import { cloneTemplate, templateKey } from './dom.js';
import { getModuleHelp, hasModuleHelp } from './help-registry.js';

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

export function createModule(base) {
  const { config, Model, data, afterMount, beforeLoadExample } = base;
  const i18nKey = `modules.${  config.id}`;
  // Derive the template URL from document.baseURI so the key is stable whether
  // the app runs unbundled or from app.min.js (where import.meta.url → bundle path).
  const templateUrl = config.templateUrl
    ? config.templateUrl
    : new URL(`js/modules/${  config.id  }/${  config.id  }.html`, document.baseURI).href;
  const tplKey = templateKey(templateUrl);
  // Alpine's CSP build parses the x-data expression, so the component name must be a
  // valid JS identifier — a kebab-case id like "triz-resources" would be read as the
  // subtraction "triz - resources". Register/reference Alpine components in camelCase.
  const alpineName = config.id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

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
    ...config,
    help: hasModuleHelp(config.id) ? () => getModuleHelp(config.id) : undefined,

    _container: null,
    _context: null,
    _tmpl: null,
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
      const state = saved ? Model.fromJSON(saved) : new Model();

      if (!container.id) container.id = `${config.id  }-${  context.instanceId}`;

      const module = this;
      const _t = module._context.i18n.tf(i18nKey);

      const dataCtxTarget = {};
      const dataCtx = new Proxy(dataCtxTarget, {
        get: (t, prop) => t[prop],
        set: (t, prop, value) => { t[prop] = value; return true; }
      });
      const dataResult = data.call(dataCtx, module, _t);

      if (config.engine === 'alpine') {
        dataCtxTarget.t = _t;
        dataCtxTarget.model = state;
        Object.assign(dataCtxTarget, dataResult);

        // The data-fn may define its own init()/destroy() lifecycle hooks (e.g. async
        // data loading). The object literal below redefines init/destroy after the
        // ...dataResult spread, which would shadow them — so capture and invoke them
        // explicitly. (Mirrors the legacy engine, whose component init ran the data-fn init.)
        const dataInit = dataResult.init;
        const dataDestroy = dataResult.destroy;

        Alpine.data(uniqueName, () => {
          const freshState = context.stateManager.getModuleState(context.instanceId)
            ? Model.fromJSON(context.stateManager.getModuleState(context.instanceId))
            : new Model();

          return {
            model: freshState,
            t: _t,
            /** Navigate the active module to a sub-path. Modules may override this. */
            changeRoute(sub) { this.$route?.go(sub); },
            ...dataResult,
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
          };
        });

        container.replaceChildren(...cloneForInstance(uniqueName));
        Alpine.initTree(container);
        module._tmpl = {
          _state: state,
          getState() { return { model: this._state }; }
        };
        afterMount?.(module);
        
      }
    },

    async destroy() {
      if (config.engine === 'alpine') {
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
      if (config.engine === 'alpine') {
        Alpine.destroyTree(this._container);
        this._container.replaceChildren(...cloneForInstance(this._alpineName));
        Alpine.initTree(this._container);

      }
    },

    onThemeChange() {},

    getState() {
      if (config.engine === 'alpine') {
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
      if (config.engine !== 'alpine') return null;
      const root = this._container?.querySelector('[x-data]');
      return root ? Alpine.$data(root) : null;
    },

    bindEffect(fn) {
      const handle = Alpine.effect(fn);
      return () => Alpine.release(handle);
    },

    setState(state) {
      if (config.engine === 'alpine') {
        const model = Model.fromJSON(state);
        this._persist(model);
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
      if (config.engine !== 'alpine') return;
      const root = this._container?.querySelector('[x-data]');
      if (!root) return;
      const fresh = Model.fromJSON(state);
      this._applyingRemote = true;
      Object.assign(Alpine.$data(root).model, fresh);
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
      const model = current ? Model.fromJSON(current) : null;
      if (typeof model?.hasContent === 'function' && model.hasContent() && this._context?.confirmPopout) {
        const ok = await this._context.confirmPopout(
          this._context.i18n.t('moduleHelp.confirmOverwrite'), { danger: true }
        );
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
    console.warn(`[createModule] ${config.id}: loadExample benötigt hasContent() im Model — wird übersprungen`);
  }

  return m;
}
