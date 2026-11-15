/**
 * D.Mike — Survey builder: view part "handover" (viewmodel/handover.js)
 *
 * The hand-over part of the results tab: free texts and „Sonstiges“ texts
 * ticked for the VoC tree (UI state `vocSelected`, cleaned when a response
 * goes), their mark once taken, the target of each Kano question and the
 * buttons that start the runs `takeToVocTree` and `handOverToKano` (the
 * worksheet button binds `toWorksheet` itself).
 *
 * The list of Kano instances comes from the instances service. It is asked
 * again whenever `state.kanoRev` counts up: on every `module:added` and
 * `module:removed` broadcast — the part listens from `init` to `destroy` —
 * and after an own hand-over.
 */
import { runUiCommand } from '../../../core/command-directives.js';
import { openTexts } from '../domain/handover/voc.js';

/** @type {import('./state.types.js').SurveyBuilderViewFn} */
export const handoverView = (ctx) => {
  /** @type {(() => void)|null} */
  let onInstances = null;
  /** @type {any} */
  let bus = null;
  return {
    init() {
      onInstances = () => { this.state.kanoRev += 1; };
      bus = this._ui.services.eventBus;
      bus?.on?.('module:added', onInstances);
      bus?.on?.('module:removed', onInstances);
      this.$watch(() => this.model.responses.map((/** @type {any} */ r) => r.id).join('\n'), () => this.pruneVocSelection());
    },
    destroy() {
      if (onInstances) {
        bus?.off?.('module:added', onInstances);
        bus?.off?.('module:removed', onInstances);
      }
      onInstances = null;
      bus = null;
    },

    /**
     * Starts a hand-over; a run that cannot start is reported.
     * @param {'takeToVocTree'|'handOverToKano'} name @param {object} args
     * @returns {Promise<any>} the value of a run that is done, else null
     */
    async startHandover(name, args) {
      const out = await this._asyncTaskHost.start(name, args);
      if (out.status === 'rejected') ctx.notify(ctx.i18n.t('common.asyncTask.rejected', { reason: out.reason }), 'error');
      return out.status === 'done' ? out.value : null;
    },

    /** @param {string} name a hand-over @returns {boolean} it is running */
    isHandoverRunning(name) { return Boolean(this.asyncTasks?.[name]?.running); },

    // ── VoC tree ──────────────────────────────────────────────

    /** @param {string} key answer key @returns {boolean} ticked for the VoC tree */
    isVocSelected(key) { return this.state.vocSelected.includes(key); },

    /** @param {string} key answer key @returns {boolean} taken to the VoC tree before */
    isVocTaken(key) { return this.model.transfers.vocTree.responseKeys.includes(key); },

    /** Ticks or unticks an answer. @param {string} key answer key */
    toggleVoc(key) {
      const sel = this.state.vocSelected;
      this.state.vocSelected = sel.includes(key) ? sel.filter((/** @type {string} */ k) => k !== key) : [...sel, key];
    },

    /** @returns {boolean} at least one answer is ticked */
    get hasVocSelection() { return this.state.vocSelected.length > 0; },

    /** Drops ticked answers whose response is gone. */
    pruneVocSelection() {
      const ids = new Set(this.model.responses.map((/** @type {any} */ r) => r.id));
      const kept = this.state.vocSelected.filter((/** @type {string} */ k) => ids.has(k.split(':')[0]));
      if (kept.length !== this.state.vocSelected.length) this.state.vocSelected = kept;
    },

    /**
     * Takes the ticked answers to the VoC tree; the selection empties once they are taken.
     * @returns {Promise<void>}
     */
    async takeSelected() {
      const texts = openTexts(this.model);
      const keys = this.state.vocSelected.filter((/** @type {string} */ k) => texts.has(k));
      if (keys.length === 0) return;
      if (await this.startHandover('takeToVocTree', { keys })) this.state.vocSelected = [];
    },

    // ── Kano ──────────────────────────────────────────────────

    /** @returns {Array<{ value: string, label: string }>} the Kano instances of the project */
    get kanoTargetOptions() {
      void this.state.kanoRev;
      return this._ui.services.instances.list({ modules: ['kano'] })
        .map((/** @type {any} */ inst, /** @type {number} */ i) => ({ value: inst.instanceId, label: this.t('kanoExisting', { n: i + 1 }) }));
    },

    /**
     * @param {string} questionId a Kano question
     * @returns {string} its remembered Kano instance, '' (= new) when none or gone since
     */
    kanoTargetValue(questionId) {
      const id = this.model.transfers.kano[questionId]?.instanceId;
      return id && this.kanoTargetOptions.some((/** @type {{ value: string }} */ o) => o.value === id) ? id : '';
    },

    /** @param {string} questionId @param {string} value @returns {boolean} it is the chosen target */
    isKanoTarget(questionId, value) { return this.kanoTargetValue(questionId) === value; },

    /**
     * The target select of a Kano question changed: an instance, or '' for a new one.
     * @param {string} questionId @param {Event} $event @returns {Promise<void>}
     */
    async kanoTargetChanged(questionId, $event) {
      const el = /** @type {HTMLSelectElement} */ ($event.target);
      const r = await runUiCommand(this._ui, 'setKanoTarget', { questionId, instanceId: el.value || null });
      if (r.ok) return;
      if ('error' in r) {
        console.warn('[survey-builder] setKanoTarget failed', r.error);
        ctx.notify(this.t('commandFailed'), 'error');
      }
      el.value = this.kanoTargetValue(questionId);
    },

    /**
     * Hands a Kano question over and asks for the Kano instances again.
     * @param {string} questionId @returns {Promise<void>}
     */
    async handOver(questionId) {
      if (await this.startHandover('handOverToKano', { questionId })) this.state.kanoRev += 1;
    },
  };
};
