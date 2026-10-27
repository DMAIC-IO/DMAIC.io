/**
 * D.Mike — Ishikawa 6M Module (ishikawa.js)
 *
 * Cause & Effect (Fishbone) diagram structured as a hypothesis table with
 * expert scoring, 6M categories, snapshots + diff, Pareto/Trend/Gantt/Cost
 * charts, image galleries and CSV export. DMAIC phase: Analyze.
 *
 * The model (ishikawa-model.js) owns the persisted state and the business
 * logic; ishikawa-charts.js and ishikawa-labels.js hold pure helpers. The UI
 * lives in four encapsulated sub-viewmodels under viewmodel/ — problem,
 * causes, snapshots, experiments, one per tab or panel — that know neither
 * each other nor this shell; the template addresses them by namespace
 * (`causes.addRowAndFocus()`). They talk over one EventBus per mount
 * (ishikawa-constants.js EVENTS). This file keeps config, tabs, lifecycle,
 * the drag plumbing and the wiring. The three form modals and the image
 * lightbox are Alpine templates in ishikawa.html (hidden home, `x-ref`),
 * lent to the shared dialog and returned on close.
 *
 * @agent  Über die Teil-Viewmodels steuerbar: die Problemaussage setzen
 *   (problem.*); Expertenteam, Ursachenbaum, Bewertungen, Kategorienamen,
 *   Filter, Pareto-Quelle und CSV-Export (causes.*); Snapshots speichern,
 *   laden, löschen und vergleichen (snapshots.*); Experimente und Fakten
 *   anlegen, ändern, verschieben, löschen und Experimente mit Ursachen
 *   verknüpfen (experiments.*). Der Oberfläche bleiben die Rückfragen vor
 *   dem Löschen und Laden, die Bilder samt Lightbox, Einklappen, Trend und
 *   die Chart-Editoren.
 *
 * Spec: docs/superpowers/specs/2026-10-25-ishikawa-agent-release-design.md
 */

import { createModule } from '../../core/template-module.js';
import { resolveDateOffset } from '../../core/date-offset.js';
import { EventBus } from '../../core/event-bus.js';
import { draggableRows } from '../../ui/draggable-list.js';
import { requireEnum } from '../../core/agent/agent-argcheck.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { State } from './ishikawa-model.js';
import { ProblemViewModel } from './viewmodel/problem.js';
import { CausesViewModel } from './viewmodel/causes.js';
import { SnapshotsViewModel } from './viewmodel/snapshots.js';
import { ExperimentsViewModel } from './viewmodel/experiments.js';

/** Tabs of the module, in tab-bar order. */
const TABS = ['problem', 'facts', 'hypotheses', 'experiments'];

/** Data keys of the sub-viewmodels, in attach order. */
const SUB_VIEWMODELS = ['problem', 'causes', 'snapshots', 'experiments'];

const mod = createModule({
  config: {
    id: 'ishikawa',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.ishikawa',
    version: '2.0.0',
    meta: import.meta,
    actions: [
      { icon: 'action.download', title: 'export.label', children: [
        { icon: 'format.csv', title: 'export.csv', onClick: (d) => d.causes.exportCSV() },
      ] },
    ],
  },
  Model: State,

  /**
   * Resolves the relative dates of the example ("+7d") to calendar dates.
   * @param {object} data the example's module state
   * @returns {object} a copy with resolved experiment and fact dates
   */
  beforeLoadExample(data) {
    const result = JSON.parse(JSON.stringify(data));
    if (Array.isArray(result.experiments)) {
      result.experiments.forEach(e => {
        e.startDate = resolveDateOffset(e.startDate);
        e.endDate = resolveDateOffset(e.endDate);
      });
    }
    if (Array.isArray(result.facts)) {
      result.facts.forEach(f => { f.date = resolveDateOffset(f.date); });
    }
    return result;
  },

  /**
   * Alpine data function of the module.
   * @param {object} module the module instance (`_context`, `_container`)
   * @param {function(string, object=): string} _t translation function of the module
   * @returns {object} Alpine component state and methods
   */
  data(module, _t) {
    const deps = { t: _t, context: module._context, container: () => module._container };
    // One bus per mount, never the global context.eventBus: two ishikawa
    // tabs stay apart (spec E3). A closure, not a data field, so Alpine
    // never wraps it in a reactive proxy.
    let events = null;
    return {
      ...agentReadMixin(module),
      // `name: new X(deps)` literals: the agent generator reads the
      // sub-viewmodels from exactly this shape. init() replaces them.
      problem: new ProblemViewModel(deps),
      causes: new CausesViewModel(deps),
      snapshots: new SnapshotsViewModel(deps),
      experiments: new ExperimentsViewModel(deps),

      // Reorderable rows for all three tables (.dmike-table--draggable). The
      // mixin owns the drag plumbing and Alt+Arrow; the moves go through the
      // sub-viewmodels' agent actions. `causes` is a tree, so keyboard
      // movement there is confined to siblings — the rendered list is a
      // flattened tree and a raw index step would jump into a foreign parent.
      ...draggableRows({
        onMove({ group, sourceId, targetId }) {
          if (group === 'causes') this.causes.moveRowBefore(sourceId, targetId);
          else if (group === 'experiments') this.experiments.moveExperimentBefore(sourceId, targetId);
          else if (group === 'facts') this.experiments.moveFactBefore(sourceId, targetId);
        },
        rowIds(group, id) {
          if (group === 'experiments') return this.model.experiments.map(x => x.id);
          if (group === 'facts') return this.model.facts.map(f => f.id);
          const row = this.model.rows.find(r => r.id === id);
          if (!row) return [];
          return this.model.ordered()
            .filter(r => r.parentId === row.parentId)
            .map(r => r.id);
        },
        t: (key, params) => module._context.i18n.t(key, params),
      }),

      /** @type {string} the open tab (transient, never persisted) */
      activeTab: 'problem',

      /** @noagent lifecycle — Alpine hook: builds fresh sub-viewmodels and binds them to the component's model and a fresh bus. */
      init() {
        this.dragRowsInit();
        // createModule spreads this data object into every Alpine build of
        // the component, and setState (example load) or a language change
        // rebuilds it. The sub-viewmodels would then be shared across builds
        // and carry filter, comparison or trend state into the new data, so
        // each build gets fresh ones — assigned through the reactive proxy,
        // so the template binds to the new objects.
        for (const key of SUB_VIEWMODELS) this[key] = new this[key].constructor(deps);
        events = new EventBus();
        const binding = {
          model: this.model,
          events,
          watch: (getter, callback) => this.$watch(getter, callback),
          nextTick: (callback) => this.$nextTick(callback),
          ref: (name) => this.$refs[name] ?? null,
        };
        for (const vm of this._subViewModels()) vm.attach(binding);
        // Render the active tab's charts after first paint.
        this.$nextTick(() => this.renderTabCharts());
      },

      /** @noagent lifecycle — Alpine hook: every sub-viewmodel, then the bus. */
      destroy() {
        this.dragRowsDestroy();
        for (const vm of this._subViewModels()) vm.detach();
        events = null;
      },

      /** @returns {object[]} the sub-viewmodels, in attach order */
      _subViewModels() { return SUB_VIEWMODELS.map((key) => this[key]); },

      // ── Tabs ──────────────────────────────────────────────────

      /**
       * @noagent view transform
       * @param {string} tab
       * @returns {string} active class or ""
       */
      tabClass(tab) { return this.activeTab === tab ? 'dmike-tab--active' : ''; },

      /**
       * Open a tab; the hypotheses and experiments tabs draw their charts.
       * @agent
       * @param {'problem'|'facts'|'hypotheses'|'experiments'} tab the tab to open
       * @returns {void}
       * @throws {Error} if `tab` is not one of the four tabs
       */
      setTab(tab) {
        requireEnum('tab', tab, TABS);
        if (tab === this.activeTab) return;
        this.activeTab = tab;
        this.$nextTick(() => this.renderTabCharts());
      },

      /**
       * @noagent routing hook of createModule
       * @param {string[]} sub route segments below the module
       */
      onRouteChanged(sub) {
        const key = Array.isArray(sub) && sub.length ? sub[0] : null;
        if (!key || key === this.activeTab) return;
        if (!TABS.includes(key)) return;
        this.setTab(key);
      },

      /** @noagent chart — draws the charts of the active tab */
      renderTabCharts() {
        if (this.activeTab === 'hypotheses') {
          this.causes.render();
          this.snapshots.render();
        } else if (this.activeTab === 'experiments') {
          this.experiments.render();
        }
      },
    };
  },
});

export default mod;
