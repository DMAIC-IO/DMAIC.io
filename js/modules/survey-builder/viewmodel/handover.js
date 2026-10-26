/**
 * D.Mike — Survey builder hand-over (viewmodel/handover.js)
 *
 * Sub-viewmodel of the results tab's hand-over: free texts to the VoC tree,
 * Kano questions to kano, all responses to a worksheet. Keeps its VoC selection clean against the existing
 * responses itself. Knows the model, survey-labels.js and the pure
 * survey-*.js modules — never a sibling or the shell.
 */

import { documentOrder, findQuestion, isVisible } from '../survey-conditions.js';
import { worksheetColumns, otherKey } from '../survey-stats.js';
import {
  buildWorksheetState, listInstances, treePhaseForCycle, kanoStateFromSurvey, vocsFromAnswers, appendVocs,
} from '../survey-link.js';
import { plainCopy } from '../survey-builder-model.js';
import { recipientName } from '../survey-labels.js';
import { provisionInstance } from '../../../core/examples-registry.js';
import { uniqueSheetName } from '../../../ui/column-picker.js';
import { DEFAULT_CYCLE } from '../../../core/cycles/cycles.js';
import { requireKnownId } from '../../../core/agent/agent-argcheck.js';

/** Keys of `modules.survey-builder.ws.*`, the worksheet column labels. */
const WS_KEYS = ['responseId', 'submittedAt', 'recipient', 'other', 'functional', 'dysfunctional', 'importance', 'category', 'question'];

export class HandoverViewModel {
  /**
   * @param {{t: function(string, object=): string, context: object, container: function(): ?Element}} deps
   */
  constructor({ t, context, container }) {
    this._t = t;
    this._context = context;
    this._container = container;
    /** @type {?object} the component's State, set by attach() */
    this.model = null;
    /** Free-text answers ticked for the VoC tree, keys `<responseId>:<questionId>`. */
    this.vocSelected = [];
    /** Bumped whenever kano instances may have changed — the state manager is not reactive. */
    this._kanoRev = 0;
  }

  /**
   * Binds the component's model and keeps the VoC selection clean: a
   * deleted response takes its ticked answers with it.
   * @noagent lifecycle
   * @param {{model: object, watch: function, nextTick: function}} binding
   */
  attach({ model, watch }) {
    this.model = model;
    watch(() => this.model.responseIds().join('\n'), () => this._pruneVocSelection());
  }

  /**
   * Nothing to release; Alpine drops the watch with the component.
   * @noagent lifecycle
   */
  detach() {}

  /**
   * The shell forwards module:added / module:removed — kano instances may have changed.
   * @noagent lifecycle
   */
  onInstancesChanged() { this._kanoRev++; }

  /** Drops ticked answers whose response no longer exists. */
  _pruneVocSelection() {
    const ids = new Set(this.model.responseIds());
    this.vocSelected = this.vocSelected.filter((k) => ids.has(k.split(':')[0]));
  }

  /**
   * Phase this instance lives in — new kano / worksheet instances are
   * created next to it (survey-builder design §6.2, §8.1).
   * @returns {string}
   */
  _ownPhase() {
    const phases = this._context.stateManager.get('phases') || {};
    for (const phase of Object.keys(phases)) {
      const list = phases[phase];
      if (Array.isArray(list) && list.some((i) => i.instanceId === this._context.instanceId)) return phase;
    }
    return 'define';
  }

  // Free texts → VoC tree

  /**
   * @noagent view transform
   * @param {object} b block
   * @returns {Array<{key: string, text: string, name: string}>} non-empty answers of a text block
   */
  textAnswers(b) {
    return b.stats.answers
      .filter((a) => a.text.trim())
      .map((a) => ({ key: otherKey(a.responseId, b.question.id), text: a.text.trim(), name: recipientName(this.model.recipients, a.recipientId) || '' }));
  }

  /**
   * @noagent view transform
   * @param {object} b choice block
   * @returns {Array<{key: string, text: string, name: string}>} "Sonstige" texts, transferable like free texts
   */
  otherAnswers(b) {
    return b.stats.otherTexts
      .filter((o) => o.text.trim())
      .map((o) => ({ key: otherKey(o.responseId, b.question.id, true), text: o.text.trim(), name: recipientName(this.model.recipients, o.recipientId) || '' }));
  }

  /**
   * @noagent view transform
   * @param {object} b block
   * @returns {boolean}
   */
  hasTextAnswers(b) { return this.textAnswers(b).length > 0; }

  /**
   * @noagent view transform
   * @param {{name: string}} a answer
   * @returns {boolean} whether the respondent may be named
   */
  hasName(a) { return !this.model.survey.anonymous && Boolean(a.name); }

  /**
   * @noagent view transform
   * @param {string} key `<responseId>:<questionId>`
   * @returns {boolean}
   */
  isVocSelected(key) { return this.vocSelected.includes(key); }

  /**
   * @noagent view transform
   * @param {string} key `<responseId>:<questionId>`
   * @returns {boolean} whether already taken to the VoC tree
   */
  isVocTaken(key) { return this.model.transfers.vocTree.responseKeys.includes(key); }

  /**
   * @noagent UI selection
   * @param {string} key `<responseId>:<questionId>`
   */
  toggleVoc(key) {
    this.vocSelected = this.isVocSelected(key)
      ? this.vocSelected.filter((k) => k !== key)
      : [...this.vocSelected, key];
  }

  /**
   * @noagent view transform
   * @returns {boolean} whether any answer is ticked
   */
  hasVocSelection() { return this.vocSelected.length > 0; }

  /** Every non-empty free-text and "Sonstige" answer of all responses (ignores the filter). */
  _openTexts() {
    const map = new Map();
    for (const resp of this.model.responses) {
      for (const { question: q } of documentOrder(this.model.survey)) {
        if (!isVisible(q, resp.answers, this.model.survey)) continue;
        const a = resp.answers[q.id];
        const name = recipientName(this.model.recipients, resp.recipientId) || '';
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
  }

  /**
   * Add free-text and "other" answers as VoCs to the project's VoC tree;
   * without a tree, one is created in the cycle's tree phase. An answer
   * taken over before is added again.
   * @agent
   * @param {string[]} keys answer keys `<responseId>:<questionId>`, for an "other" text `<responseId>:<questionId>:other`
   * @returns {number} how many answers were taken over, 0 if no tree could be created
   * @throws {Error} if `keys` is empty or a key names no non-empty answer
   */
  takeToVocTree(keys) {
    const texts = this._openTexts();
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error(`invalid keys ${JSON.stringify(keys)}; allowed: at least one answer key`);
    }
    keys.forEach((k, i) => requireKnownId(`keys[${i}]`, k, [...texts.keys()]));
    const ctx = this._context;
    const sm = ctx.stateManager;
    const title = this.model.survey.title.trim() || this._t('report.untitled');
    const vocs = vocsFromAnswers(keys.map((k) => texts.get(k)), this._t('vocSource', { title }), this.model.survey.anonymous);
    const tree = listInstances(sm, 'voc-ctx-tree')[0];
    if (tree) {
      sm.setModuleState(tree.instanceId, appendVocs(tree.state ? plainCopy(tree.state) : null, vocs));
      ctx.eventBus.emit('state:remote-changed', { instanceIds: [tree.instanceId], metaChanged: false });
    } else {
      const phase = treePhaseForCycle(sm.get('projectMeta.cycle') || DEFAULT_CYCLE);
      if (!provisionInstance(ctx, { moduleId: 'voc-ctx-tree', phase, state: appendVocs(null, vocs) })) return 0;
    }
    this.model.markVocTaken(keys);
    ctx.notify(this._t('vocTaken', { count: keys.length }), 'success');
    return keys.length;
  }

  /**
   * Take the ticked answers over and empty the selection after a take-over.
   * @noagent template handler, see takeToVocTree
   */
  takeSelectedToVocTree() {
    const texts = this._openTexts();
    const keys = this.vocSelected.filter((k) => texts.has(k));
    if (keys.length === 0) return;
    if (this.takeToVocTree(keys) > 0) this.vocSelected = [];
  }

  // Kano hand-over

  /**
   * @returns {Array<{value: string, label: string}>} kano instances of the project
   * @noagent view transform
   */
  kanoTargetOptions() {
    void this._kanoRev; // reactive dependency, see _kanoRev
    return listInstances(this._context.stateManager, 'kano')
      .map((inst, i) => ({ value: inst.instanceId, label: this._t('kanoExisting', { n: i + 1 }) }));
  }

  /**
   * Linked kano instance of a question, '' (= new) when none or deleted since.
   * @noagent view transform
   * @param {string} questionId
   * @returns {string} instance id or ''
   */
  kanoTargetValue(questionId) {
    const id = this.model.transfers.kano[questionId];
    return id && this.kanoTargetOptions().some((o) => o.value === id) ? id : '';
  }

  /**
   * @noagent view transform
   * @param {string} questionId
   * @param {string} value
   * @returns {boolean}
   */
  isKanoTarget(questionId, value) { return this.kanoTargetValue(questionId) === value; }

  /** @returns {string[]} ids of the Kano questions */
  _kanoQuestionIds() {
    return documentOrder(this.model.survey).filter((e) => e.question.type === 'kano').map((e) => e.question.id);
  }

  /** @returns {string[]} ids of the project's kano instances */
  _kanoInstanceIds() { return listInstances(this._context.stateManager, 'kano').map((inst) => inst.instanceId); }

  /**
   * Choose the kano instance a Kano question is handed to; null means a new
   * instance at the next hand-over.
   * @agent
   * @param {string} questionId the Kano question
   * @param {string|null} instanceId a kano instance of the project, null for a new one
   * @returns {void}
   * @throws {Error} if the question is no Kano question or the instance is no kano instance of the project
   */
  setKanoTarget(questionId, instanceId) {
    requireKnownId('questionId', questionId, this._kanoQuestionIds());
    if (instanceId !== null) requireKnownId('instanceId', instanceId, this._kanoInstanceIds());
    this.model.setKanoTarget(questionId, instanceId);
  }

  /**
   * `@change` of the Kano target select.
   * @noagent template handler, see setKanoTarget
   * @param {string} questionId
   * @param {Event} ev
   */
  setKanoTargetFromEvent(questionId, ev) { this.setKanoTarget(questionId, ev.target.value || null); }

  /**
   * Hand a Kano question with all responses (ignoring the filter) to its
   * chosen kano instance, or to a new one in this module's phase. A repeat
   * hand-over replaces only what came from this question.
   * @agent
   * @param {string} questionId the Kano question
   * @returns {string|null} id of the kano instance, null if none could be created
   * @throws {Error} if the question is no Kano question
   */
  handOverToKano(questionId) {
    requireKnownId('questionId', questionId, this._kanoQuestionIds());
    const ctx = this._context;
    const sm = ctx.stateManager;
    const question = findQuestion(this.model.survey, questionId);
    const targetId = this.kanoTargetValue(questionId);
    const target = targetId ? sm.getModuleState(targetId) : null;
    const state = kanoStateFromSurvey(target ? plainCopy(target) : null, {
      surveyInstanceId: ctx.instanceId,
      question: plainCopy(question),
      responses: plainCopy(this.model.responses),
      recipients: plainCopy(this.model.recipients),
      anonymous: this.model.survey.anonymous,
      respondentLabel: (n) => this._t('respondentLabel', { n }),
    });
    let instanceId = targetId;
    if (targetId) {
      sm.setModuleState(targetId, state);
      ctx.eventBus.emit('state:remote-changed', { instanceIds: [targetId], metaChanged: false });
    } else {
      instanceId = provisionInstance(ctx, { moduleId: 'kano', phase: this._ownPhase(), state });
      if (!instanceId) return null;
    }
    this._kanoRev++;
    this.model.setKanoTarget(questionId, instanceId);
    ctx.notify(this._t('kanoHandedOver'), 'success');
    return instanceId;
  }

  // Worksheet

  /**
   * Put all responses into a new worksheet in this module's phase, one row
   * per response.
   * @agent
   * @returns {string|null} id of the new worksheet, null if none could be created
   */
  toWorksheet() {
    const ctx = this._context;
    const sm = ctx.stateManager;
    const strings = {};
    for (const k of WS_KEYS) strings[k] = this._t(`ws.${k}`);
    const columns = worksheetColumns(
      plainCopy(this.model.survey), plainCopy(this.model.responses), plainCopy(this.model.recipients), strings,
    );
    const name = uniqueSheetName(sm, this.model.survey.title.trim() || this._t('report.untitled'));
    const id = provisionInstance(ctx, {
      moduleId: 'worksheet', phase: this._ownPhase(), state: buildWorksheetState(columns, name),
    });
    if (id) ctx.notify(this._t('worksheetCreated', { name }), 'success');
    return id || null;
  }
}
