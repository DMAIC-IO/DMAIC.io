/**
 * D.Mike — Survey builder hand-over (survey-handover-controller.js)
 *
 * Results tab: free texts to the VoC tree, Kano questions to kano,
 * all responses to a worksheet (spec §6.2, §8).
 * Spread into the data function of survey-builder.js, which owns config,
 * lifecycle, tabs, labels and formatting; `this` is the whole component.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md
 */

import { documentOrder, findQuestion, isVisible } from './survey-conditions.js';
import { worksheetColumns, otherKey } from './survey-stats.js';
import {
  buildWorksheetState, listInstances, treePhaseForCycle, kanoStateFromSurvey, vocsFromAnswers, appendVocs,
} from './survey-link.js';
import { plainCopy } from './survey-builder-model.js';
import { provisionInstance } from '../../core/examples-registry.js';
import { uniqueSheetName } from '../../ui/column-picker.js';
import { DEFAULT_CYCLE } from '../../core/cycles/cycles.js';

/** Keys of `modules.survey-builder.ws.*`, the worksheet column labels. */
const WS_KEYS = ['responseId', 'submittedAt', 'recipient', 'other', 'functional', 'dysfunctional', 'importance', 'category', 'question'];

/**
 * @param {object} module the module instance (`_context`, `_container`)
 * @param {function(string, object=): string} _t translation function of the module
 * @returns {object} members of the Alpine component
 */
export function handoverController(module, _t) {
  return {
    /** Free-text answers ticked for the VoC tree, keys `<responseId>:<questionId>`. */
    vocSelected: [],
    /** Bumped whenever kano instances may have changed — the state manager is not reactive. */
    kanoRev: 0,

    // Free texts → VoC tree (spec §8.2)

    /**
     * @param {object} b block
     * @returns {Array<{key: string, text: string, name: string}>} non-empty answers of a text block
     */
    textAnswers(b) {
      return b.stats.answers
        .filter((a) => a.text.trim())
        .map((a) => ({ key: otherKey(a.responseId, b.question.id), text: a.text.trim(), name: this.recipientName(a.recipientId) || '' }));
    },

    /**
     * @param {object} b choice block
     * @returns {Array<{key: string, text: string, name: string}>} "Sonstige" texts, transferable like free texts
     */
    otherAnswers(b) {
      return b.stats.otherTexts
        .filter((o) => o.text.trim())
        .map((o) => ({ key: otherKey(o.responseId, b.question.id, true), text: o.text.trim(), name: this.recipientName(o.recipientId) || '' }));
    },

    /**
     * @param {object} b block
     * @returns {boolean}
     */
    hasTextAnswers(b) { return this.textAnswers(b).length > 0; },

    /**
     * @param {{name: string}} a answer
     * @returns {boolean} whether the respondent may be named
     */
    hasName(a) { return !this.model.survey.anonymous && Boolean(a.name); },

    /**
     * @param {string} key `<responseId>:<questionId>`
     * @returns {boolean}
     */
    isVocSelected(key) { return this.vocSelected.includes(key); },

    /**
     * @param {string} key `<responseId>:<questionId>`
     * @returns {boolean} whether already taken to the VoC tree
     */
    isVocTaken(key) { return this.model.transfers.vocTree.responseKeys.includes(key); },

    /**
     * @param {string} key `<responseId>:<questionId>`
     */
    toggleVoc(key) {
      this.vocSelected = this.isVocSelected(key)
        ? this.vocSelected.filter((k) => k !== key)
        : [...this.vocSelected, key];
    },

    /**
     * @returns {boolean} whether any answer is ticked
     */
    hasVocSelection() { return this.vocSelected.length > 0; },

    /**
     * Drops ticked answers whose response no longer exists. Until the
     * hand-over is its own sub-viewmodel, the shell watches the response
     * ids and calls this.
     */
    pruneVocSelection() {
      const ids = new Set(this.model.responseIds());
      this.vocSelected = this.vocSelected.filter((k) => ids.has(k.split(':')[0]));
    },

    /** Every non-empty free-text and "Sonstige" answer of all responses (ignores the filter). */
    _openTexts() {
      const map = new Map();
      for (const resp of this.model.responses) {
        for (const { question: q } of documentOrder(this.model.survey)) {
          if (!isVisible(q, resp.answers, this.model.survey)) continue;
          const a = resp.answers[q.id];
          const name = this.recipientName(resp.recipientId) || '';
          if (q.type === 'text') {
            const text = typeof a === 'string' ? a.trim() : '';
            if (text) map.set(otherKey(resp.id, q.id), { text, name });
          } else if ((q.type === 'single' || q.type === 'multi') && a && typeof a === 'object') {
            const text = typeof a.other === 'string' ? a.other.trim() : '';
            if (text) map.set(otherKey(resp.id, q.id, true), { text, name });
          }
        }
      }
      return map;
    },

    /**
     * Adds the ticked answers as VoCs to the project's VoC tree, creating
     * one in the cycle's tree phase when there is none. Answers already
     * taken over stay selectable (spec 8.2), so re-selecting one adds it again.
     */
    takeToVocTree() {
      const ctx = module._context;
      const sm = ctx.stateManager;
      const texts = this._openTexts();
      const keys = this.vocSelected.filter((k) => texts.has(k));
      if (keys.length === 0) return;
      const title = this.model.survey.title.trim() || _t('report.untitled');
      const vocs = vocsFromAnswers(keys.map((k) => texts.get(k)), _t('vocSource', { title }), this.model.survey.anonymous);
      const tree = listInstances(sm, 'voc-ctx-tree')[0];
      if (tree) {
        sm.setModuleState(tree.instanceId, appendVocs(tree.state ? plainCopy(tree.state) : null, vocs));
        ctx.eventBus.emit('state:remote-changed', { instanceIds: [tree.instanceId], metaChanged: false });
      } else {
        const phase = treePhaseForCycle(sm.get('projectMeta.cycle') || DEFAULT_CYCLE);
        if (!provisionInstance(ctx, { moduleId: 'voc-ctx-tree', phase, state: appendVocs(null, vocs) })) return;
      }
      this.model.markVocTaken(keys);
      this.vocSelected = [];
      ctx.notify(_t('vocTaken', { count: keys.length }), 'success');
    },

    // Kano hand-over (spec §8.1)

    /** @returns {Array<{value: string, label: string}>} kano instances of the project */
    kanoTargetOptions() {
      void this.kanoRev; // reactive dependency, see kanoRev
      return listInstances(module._context.stateManager, 'kano')
        .map((inst, i) => ({ value: inst.instanceId, label: _t('kanoExisting', { n: i + 1 }) }));
    },

    /**
     * Linked kano instance of a question, '' (= new) when none or deleted since.
     * @param {string} questionId
     * @returns {string} instance id or ''
     */
    kanoTargetValue(questionId) {
      const id = this.model.transfers.kano[questionId];
      return id && this.kanoTargetOptions().some((o) => o.value === id) ? id : '';
    },

    /**
     * @param {string} questionId
     * @param {string} value
     * @returns {boolean}
     */
    isKanoTarget(questionId, value) { return this.kanoTargetValue(questionId) === value; },

    /**
     * `@change` of the Kano target select.
     * @param {string} questionId
     * @param {Event} ev
     */
    setKanoTargetFromEvent(questionId, ev) {
      this.model.setKanoTarget(questionId, ev.target.value || null);
    },

    /**
     * Hands a Kano question (all responses, ignoring the filter) to the
     * chosen kano instance, or to a new one next to this module. A repeat
     * hand-over replaces only what came from this question.
     * @param {string} questionId
     * @returns {void}
     */
    handOverToKano(questionId) {
      const ctx = module._context;
      const sm = ctx.stateManager;
      const question = findQuestion(this.model.survey, questionId);
      if (!question) return;
      const targetId = this.kanoTargetValue(questionId);
      const target = targetId ? sm.getModuleState(targetId) : null;
      const state = kanoStateFromSurvey(target ? plainCopy(target) : null, {
        surveyInstanceId: ctx.instanceId,
        question: plainCopy(question),
        responses: plainCopy(this.model.responses),
        recipients: plainCopy(this.model.recipients),
        anonymous: this.model.survey.anonymous,
        respondentLabel: (n) => _t('respondentLabel', { n }),
      });
      let instanceId = targetId;
      if (targetId) {
        sm.setModuleState(targetId, state);
        ctx.eventBus.emit('state:remote-changed', { instanceIds: [targetId], metaChanged: false });
      } else {
        instanceId = provisionInstance(ctx, { moduleId: 'kano', phase: this._ownPhase(), state });
        if (!instanceId) return;
      }
      this.kanoRev++;
      this.model.setKanoTarget(questionId, instanceId);
      ctx.notify(_t('kanoHandedOver'), 'success');
    },

    // Worksheet (spec §6.2)

    /** All responses as a new worksheet in this module's phase. */
    toWorksheet() {
      const ctx = module._context;
      const sm = ctx.stateManager;
      const strings = {};
      for (const k of WS_KEYS) strings[k] = _t(`ws.${k}`);
      const columns = worksheetColumns(
        plainCopy(this.model.survey), plainCopy(this.model.responses), plainCopy(this.model.recipients), strings,
      );
      const name = uniqueSheetName(sm, this.model.survey.title.trim() || _t('report.untitled'));
      const id = provisionInstance(ctx, {
        moduleId: 'worksheet', phase: this._ownPhase(), state: buildWorksheetState(columns, name),
      });
      if (id) ctx.notify(_t('worksheetCreated', { name }), 'success');
    },
  };
}
