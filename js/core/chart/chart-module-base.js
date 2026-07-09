/**
 * D.Mike — Shared Chart-Module Alpine Lifecycle (chart-module-base.js)
 *
 * Extracts the duplicated Alpine-component lifecycle shared by every chart
 * module that mounts an imperative column/dataset picker plus one-or-more
 * imperatively-mounted chart instances. Two clusters use this:
 *
 *   - PLOT cluster (bar, pareto, …): a single `this._chart`, replotted on
 *     demand. `onTheme` re-renders the existing chart in place
 *     (`this._chart.render()`); the initial render is module-specific (passed
 *     via `cfg.initialRender`); `destroy` disposes the single chart.
 *
 *   - AUTORUN cluster (time-weighted-chart, …): an array of charts
 *     (`this._charts`) rebuilt by an `_runAnalysis()` controller behind a
 *     debounced `_scheduleAutoRun()` (AUTORUN_DELAY). `onTheme` re-runs the
 *     full analysis; the initial render is `this._runAnalysis()`; `destroy`
 *     additionally clears the debounce timer and disposes the chart array.
 *
 * The factory returns a plain object that the module spreads into the head of
 * its data-fn return. It provides the transient lifecycle fields, the picker /
 * chart disposal helpers, the bounded rAF anchor poll (`whenAnchor`), the
 * debounce scheduler, and `init` / `destroy`. The bodies mirror the original
 * per-module code verbatim so runtime behavior is byte-identical.
 *
 * `this` inside every method is the live Alpine instance (the merged data
 * object). `module` is the `createModule` closure object, used purely for
 * `module._context`, `module._container`, and `module._context.instanceId`.
 */

/** Auto-run debounce delay in ms (autorun cluster `_scheduleAutoRun`). */
export const AUTORUN_DELAY = 120;

/**
 * Bounded rAF-poll for a templated host. Alpine may materialise an x-if / x-for
 * host across several reactive flush cycles, so poll (bounded) until it exists.
 * Aborts if a newer render started (stale-gen guard).
 *
 * Standalone twin of the lifecycle object's `whenAnchor` method, for modules
 * that keep their own custom lifecycle but still need this exact helper. The
 * body is byte-identical to the per-module copies it replaces.
 *
 * @param {object} module   createModule closure object (provides `_container`).
 * @param {object} instance live Alpine instance (provides `_renderGen`).
 * @param {string} selector
 * @param {number} gen
 * @param {number} [maxFrames]
 * @returns {Promise<Element|null>}
 */
export function whenAnchor(module, instance, selector, gen, maxFrames = 30) {
  return new Promise((resolve) => {
    const tick = (left) => {
      if (gen !== instance._renderGen) { resolve(null); return; }
      const el = module._container ? module._container.querySelector(selector) : null;
      if (el) { resolve(el); return; }
      if (left <= 0) { resolve(null); return; }
      requestAnimationFrame(() => tick(left - 1));
    };
    tick(maxFrames);
  });
}

/**
 * @typedef {Object} ChartModuleLifecycleConfig
 * @property {(this:object) => void} mountPicker
 *   Mounts the module's imperative picker into its template anchor and assigns
 *   `this._picker`. Called once from `init()`. Required. `this` is the live
 *   Alpine instance.
 * @property {'render'|'rerun'} themeMode
 *   `'render'` → on `theme:changed`, re-render the single existing chart in
 *   place (`if (this._chart) this._chart.render()`); used by the PLOT cluster.
 *   `'rerun'` → on `theme:changed`, re-run the full analysis
 *   (`this._runAnalysis()`); used by the AUTORUN cluster. Required.
 * @property {boolean} [autorun=false]
 *   When `true`, `init()` resets the full autorun transient set
 *   (`_renderGen`, `_charts`, `_autoRunTimer`, `_picker`) and the default
 *   initial render is `this._runAnalysis()`. When `false` (PLOT), `init()`
 *   resets only `_unsubs` and the caller must supply `cfg.initialRender`.
 * @property {(this:object) => void} [initialRender]
 *   Optional explicit initial-render hook run at the end of `init()`. For the
 *   PLOT cluster this is required (e.g. `if (this.model.xRef)
 *   requestAnimationFrame(() => this._plot())`). For the AUTORUN cluster it
 *   defaults to `this._runAnalysis()` when omitted.
 * @property {(this:object) => void} [onActivated]
 *   Optional extra work to run when this module instance is re-activated
 *   (`module:activated` for our instanceId), in addition to the standard
 *   picker refresh.
 * @property {(this:object) => void} [onTheme]
 *   Optional explicit `theme:changed` handler. When provided it fully replaces
 *   the `themeMode`-derived default. Used by autorun modules whose theme
 *   response re-renders the *cached* result in place (rather than re-running the
 *   full analysis). `this` is the live Alpine instance.
 */

/**
 * Build the shared chart-module Alpine lifecycle object.
 *
 * @param {object} module
 *   The `createModule` closure object (provides `_context`, `_container`).
 * @param {ChartModuleLifecycleConfig} cfg
 * @returns {object} Lifecycle members to spread into the data-fn return.
 */
export function chartModuleLifecycle(module, cfg) {
  const { mountPicker, themeMode, autorun = false, initialRender, onActivated, onTheme: onThemeOverride } = cfg;

  return {
    // ── Transient view state (not persisted) ──────────────────
    /** @type {object|null} imperative picker widget */
    _picker: null,
    /** @type {object|null} single chart instance (PLOT cluster) */
    _chart: null,
    /** @type {Array} active chart instances (AUTORUN cluster) */
    _charts: [],
    /** @type {Array<() => void>} unsub functions for event-bus listeners */
    _unsubs: [],
    /** Stale-render guard: incremented before each async chart group */
    _renderGen: 0,
    /** Debounce timer handle (AUTORUN cluster) */
    _autoRunTimer: null,

    // ── Auto-run / scheduling (AUTORUN cluster) ───────────────

    /** Debounce `_runAnalysis()` by AUTORUN_DELAY ms. */
    _scheduleAutoRun() {
      clearTimeout(this._autoRunTimer);
      this._autoRunTimer = setTimeout(() => this._runAnalysis(), AUTORUN_DELAY);
    },

    // ── Picker / chart disposal helpers ───────────────────────

    /** Dispose the single picker widget (idempotent). */
    _destroyPicker() {
      if (this._picker) { this._picker.destroy(); this._picker = null; }
    },

    /** Dispose the single chart instance (PLOT cluster, idempotent). */
    _destroyChart() {
      if (this._chart) {
        try { module._context.chartManager.destroy(this._chart); } catch { /* ignore */ }
        this._chart = null;
      }
    },

    /** Dispose all chart instances (AUTORUN cluster). */
    _destroyCharts() {
      for (const c of this._charts) {
        try { module._context.chartManager.destroy(c); } catch { /* ignore */ }
      }
      this._charts = [];
    },

    // ── Templated-host anchor poll ────────────────────────────

    /**
     * Bounded rAF-poll for a templated host. Alpine may materialise the
     * x-for host across several reactive flush cycles. Aborts on stale gen.
     * @param {string} selector
     * @param {number} gen
     * @param {number} [maxFrames]
     * @returns {Promise<Element|null>}
     */
    whenAnchor(selector, gen, maxFrames = 30) {
      return whenAnchor(module, this, selector, gen, maxFrames);
    },

    // ── Alpine component lifecycle ────────────────────────────

    init() {
      // Fresh per-instance transient collections.
      this._unsubs = [];
      if (autorun) {
        this._renderGen = 0;
        this._charts = [];
        this._autoRunTimer = null;
        this._picker = null;
      }

      mountPicker.call(this);

      const eb = module._context.eventBus;

      // Refresh picker when the user switches back to this module.
      const onActivatedHandler = ({ instanceId }) => {
        if (instanceId === module._context.instanceId) {
          this._picker && this._picker.refresh();
          if (onActivated) onActivated.call(this);
        }
      };
      eb.on('module:activated', onActivatedHandler);
      this._unsubs.push(() => eb.off('module:activated', onActivatedHandler));

      // Re-render on theme change. An explicit `onTheme` override (autorun
      // modules that re-render the cached result in place) takes precedence
      // over the `themeMode`-derived default.
      const onTheme = onThemeOverride
        ? () => { onThemeOverride.call(this); }
        : themeMode === 'rerun'
          ? () => { this._runAnalysis(); }
          : () => { if (this._chart) this._chart.render(); };
      eb.on('theme:changed', onTheme);
      this._unsubs.push(() => eb.off('theme:changed', onTheme));

      // Initial render from restored state.
      if (initialRender) {
        initialRender.call(this);
      } else if (autorun) {
        this._runAnalysis();
      }
    },

    destroy() {
      for (const unsub of this._unsubs) unsub();
      this._unsubs = [];
      if (autorun) {
        clearTimeout(this._autoRunTimer);
        this._destroyPicker();
        // Dispose whichever chart shape the module uses. Modules that hold a
        // single `this._chart` leave `this._charts` empty (and vice-versa), so
        // calling both is byte-identical to the original per-module destroy.
        this._destroyChart();
        this._destroyCharts();
      } else {
        this._destroyPicker();
        this._destroyChart();
      }
    },
  };
}
