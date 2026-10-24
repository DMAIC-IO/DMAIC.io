/**
 * D.Mike — Survey builder module (survey-builder.js)
 *
 * Author a VoC questionnaire, send it as a self-contained HTML file per
 * recipient, import the answer files and evaluate them. Phase: Define.
 *
 * The model (survey-builder-model.js) owns the persisted state; the pure
 * modules next to it own conditions, export, import, statistics, report and
 * the hand-over to kano / voc-ctx-tree. The UI lives in one tab controller
 * per concern (survey-*-controller.js), spread into the data function below;
 * this file keeps config, lifecycle, tabs, labels and formatting.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md
 */

import { createModule } from '../../core/template-module.js';
import { State } from './survey-builder-model.js';
import * as labels from './survey-labels.js';
import { draftController } from './survey-draft-controller.js';
import { RecipientsViewModel } from './viewmodel/recipients.js';
import { ResponsesViewModel } from './viewmodel/responses.js';
import { resultsController } from './survey-results-controller.js';
import { HandoverViewModel } from './viewmodel/handover.js';
import { chartsController } from './survey-charts-controller.js';
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
      ...draftController(module, _t),
      recipients: new RecipientsViewModel(deps),
      responses: new ResponsesViewModel(deps),
      ...resultsController(module, _t),
      handover: new HandoverViewModel(deps),
      ...chartsController(module, _t),
      _t,
      _unsubs: [],
      /** true once destroy() ran — blocks mounts that come back later. */
      _destroyed: false,

      /** Alpine lifecycle hook. */
      init() {
        this._unsubs = [];
        const binding = {
          model: this.model,
          watch: (getter, callback) => this.$watch(getter, callback),
          nextTick: (callback) => this.$nextTick(callback),
        };
        for (const vm of this._subViewModels()) vm.attach(binding);
        this.$watch(() => JSON.stringify(this.model.survey), () => this.schedulePreview());
        this.$watch(() => this._resultsSignature(), () => this.scheduleCharts());
        this._loadCondDraft();
        this.$nextTick(() => this.renderPreview());
        const eb = module._context.eventBus;
        const onTheme = () => this.scheduleCharts();
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));
        const onInstances = () => this.handover.onInstancesChanged();
        for (const evt of ['module:added', 'module:removed']) {
          eb.on(evt, onInstances);
          this._unsubs.push(() => eb.off(evt, onInstances));
        }
        if (this.isTab('results')) this.scheduleCharts();
      },

      /** Alpine lifecycle hook: timers, subscriptions, charts. */
      destroy() {
        this._destroyed = true;
        clearTimeout(this._previewTimer);
        (this._unsubs || []).forEach((off) => off());
        this._unsubs = [];
        this.destroyCharts();
        for (const vm of this._subViewModels()) vm.detach();
      },

      /** @returns {object[]} the sub-viewmodels, in attach order */
      _subViewModels() { return [this.recipients, this.responses, this.handover]; },

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
       * Charts only live on the results tab: entering it mounts them,
       * leaving it drops them (a hidden host has no size to draw into).
       * @param {'draft'|'recipients'|'results'} tab
       */
      setTab(tab) {
        this.model.ui.tab = tab;
        if (tab === 'results') {
          this.scheduleCharts();
          return;
        }
        this._renderGen++;
        this.destroyCharts();
      },

      // ── Labels and formatting (pure functions in survey-labels.js) ──

      /** @param {string} type @returns {string} translated question type */
      typeLabel(type) { return labels.typeLabel(type, _t); },

      /**
       * Question text, or "Frage <n>" (position in document order) when empty.
       * @param {object} q
       * @returns {string}
       */
      questionLabel(q) { return labels.questionLabel(this.model.survey, q, _t); },

      /** @param {number} index 0-based @returns {string} placeholder of an untitled section */
      sectionPlaceholder(index) { return labels.sectionPlaceholder(index, _t); },

      /** @param {object} opt option @returns {string} its text or a placeholder */
      optionText(opt) { return labels.optionText(opt, _t); },

      /** @param {string|null} code @returns {string} Kano category label */
      catLabel(code) { return labels.catLabel(code, module._context.i18n); },

      /**
       * @param {string|null} id recipient id
       * @returns {string|null} trimmed name, null when unknown or unnamed
       */
      recipientName(id) { return labels.recipientName(this.model.recipients, id); },

      /** @param {{when: Array|null}} node @returns {boolean} whether the node has conditions */
      hasCondition(node) { return Array.isArray(node.when) && node.when.length > 0; },

      /**
       * Notify about conditions a structural change removed and re-read the
       * condition draft (its node may have lost conditions).
       * @param {{removedConditions: number}|undefined} result
       */
      reportRemoved(result) {
        const count = result ? result.removedConditions : 0;
        if (count > 0) module._context.notify(_t('conditionsRemoved', { count }), 'info');
        this._loadCondDraft();
      },

      /** @returns {'de-DE'|'en-US'} locale of the app language */
      _locale() { return labels.localeOf(module._context.i18n); },

      /** @param {string|null} iso @returns {string} local date and time, '–' when empty */
      formatDateTime(iso) { return labels.formatDateTime(iso, this._locale()); },

      /** @param {number|null} share 0..1 @returns {string} "42 %", '—' without a base */
      fmtPct(share) { return labels.fmtPct(share); },

      /** @param {number|null} value @param {number} decimals @returns {string} localised number */
      fmtNum(value, decimals) { return labels.fmtNum(value, decimals, this._locale()); },
    };
  },
});
