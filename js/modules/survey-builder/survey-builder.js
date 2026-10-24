/**
 * D.Mike — Survey builder module (survey-builder.js)
 *
 * Author a VoC questionnaire, send it as a self-contained HTML file per
 * recipient, import the answer files and evaluate them. Phase: Define.
 *
 * The model (survey-builder-model.js) owns the persisted state; the pure
 * modules next to it own conditions, export, import, statistics, report and
 * the hand-over to kano / voc-ctx-tree. The UI lives in five encapsulated
 * sub-viewmodels under viewmodel/ (draft, recipients, responses, results,
 * handover) that know neither each other nor this shell; the template
 * addresses them by namespace (`draft.addSection()`). This file keeps
 * config, tabs, lifecycle and the wiring: it creates the sub-viewmodels,
 * binds them to the component's model in init() and forwards the instance
 * events to the hand-over.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md,
 *       docs/superpowers/specs/2026-10-24-survey-builder-teil-viewmodels-design.md
 */

import { createModule } from '../../core/template-module.js';
import { State } from './survey-builder-model.js';
import * as labels from './survey-labels.js';
import { DraftViewModel } from './viewmodel/draft.js';
import { RecipientsViewModel } from './viewmodel/recipients.js';
import { ResponsesViewModel } from './viewmodel/responses.js';
import { ResultsViewModel } from './viewmodel/results.js';
import { HandoverViewModel } from './viewmodel/handover.js';
import { uid } from '../../core/uid.js';

export default createModule({
  config: {
    id: 'survey-builder',
    engine: 'alpine',
    phase: 'define',
    icon: 'module.survey-builder',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  /**
   * Every load of the example gets its own survey id. Response files are
   * matched to a survey by that id, so two instances loaded from the same
   * example would otherwise accept each other's responses as "ok".
   * @param {object} data the example's module state
   * @returns {object} a copy with a fresh `survey.id`
   */
  beforeLoadExample(data) {
    const copy = JSON.parse(JSON.stringify(data));
    if (copy.survey && typeof copy.survey === 'object') copy.survey.id = uid();
    return copy;
  },

  /**
   * Alpine data function of the module.
   * @param {object} module the module instance (`_context`, `_container`)
   * @param {function(string, object=): string} _t translation function of the module
   * @returns {object} Alpine component state and methods
   */
  data(module, _t) {
    const deps = { t: _t, context: module._context, container: () => module._container };
    return {
      draft: new DraftViewModel(deps),
      recipients: new RecipientsViewModel(deps),
      responses: new ResponsesViewModel(deps),
      results: new ResultsViewModel(deps),
      handover: new HandoverViewModel(deps),
      _t,
      _unsubs: [],

      /** Alpine lifecycle hook: binds the sub-viewmodels to the component's model. */
      init() {
        this._unsubs = [];
        const binding = {
          model: this.model,
          watch: (getter, callback) => this.$watch(getter, callback),
          nextTick: (callback) => this.$nextTick(callback),
        };
        for (const vm of this._subViewModels()) vm.attach(binding);
        // The only wiring between the parts (spec E2): kano instances may have changed.
        const eb = module._context.eventBus;
        const onInstances = () => this.handover.onInstancesChanged();
        for (const evt of ['module:added', 'module:removed']) {
          eb.on(evt, onInstances);
          this._unsubs.push(() => eb.off(evt, onInstances));
        }
      },

      /** Alpine lifecycle hook: subscriptions, then every sub-viewmodel. */
      destroy() {
        (this._unsubs || []).forEach((off) => off());
        this._unsubs = [];
        for (const vm of this._subViewModels()) vm.detach();
      },

      /** @returns {object[]} the sub-viewmodels, in attach order */
      _subViewModels() { return [this.draft, this.recipients, this.responses, this.results, this.handover]; },

      // ── Tabs ──────────────────────────────────────────────────

      /**
       * @param {'draft'|'recipients'|'results'} tab
       * @returns {boolean} whether the tab is the active one
       */
      isTab(tab) { return this.model.ui.tab === tab; },

      /**
       * @param {'draft'|'recipients'|'results'} tab
       * @returns {object} class map for the tab button
       */
      tabClass(tab) { return { 'dmike-tab--active': this.isTab(tab) }; },

      /**
       * Switches the tab; the results sub-viewmodel mounts or drops its
       * charts on its own when the tab changes.
       * @param {'draft'|'recipients'|'results'} tab
       */
      setTab(tab) { this.model.ui.tab = tab; },

      // ── Template-wide labels (pure functions in survey-labels.js) ──

      /** @param {string} type @returns {string} translated question type */
      typeLabel(type) { return labels.typeLabel(type, _t); },

      /** @param {object} q @returns {string} question text or "Frage <n>" */
      questionLabel(q) { return labels.questionLabel(this.model.survey, q, _t); },

      /** @param {number} index 0-based @returns {string} placeholder of an untitled section */
      sectionPlaceholder(index) { return labels.sectionPlaceholder(index, _t); },

      /** @param {object} opt option @returns {string} its text or a placeholder */
      optionText(opt) { return labels.optionText(opt, _t); },

      /** @param {{when: Array|null}} node @returns {boolean} whether the node has conditions */
      hasCondition(node) { return Array.isArray(node.when) && node.when.length > 0; },

      /** @param {string|null} code @returns {string} Kano category label */
      catLabel(code) { return labels.catLabel(code, module._context.i18n); },

      /** @param {number|null} share 0..1 @returns {string} "42 %", '—' without a base */
      fmtPct(share) { return labels.fmtPct(share); },

      /** @param {number|null} value @param {number} decimals @returns {string} localised number */
      fmtNum(value, decimals) { return labels.fmtNum(value, decimals, labels.localeOf(module._context.i18n)); },
    };
  },
});
