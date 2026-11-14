/**
 * D.Mike — DoE Planner: view part "evop" (viewmodel/evop.js)
 *
 * The EVOP project: the switch, the project name, the phase timeline
 * (view a phase, start a new one), the decision that closes the active
 * phase and the cumulative EVOP effects. The decision is asked through the
 * confirm of the command; the values of every response go with it, read
 * from the bound datasheet through `ctx.data`. Numbers are shown in the
 * app language.
 */
import { formatNumber } from '../../../core/number-format.js';
import { runUiCommand } from '../../../core/command-directives.js';
import { responseValues } from '../domain/read.js';

/** Icon of a phase's decision. */
const DECISION_ICONS = /** @type {Record<string, string>} */ ({ recenter: 'action.loop', repeat: 'action.reset', stop: 'status.ok' });

/**
 * @typedef {{ cycleNumber: number, doeName: string, decision?: string|null }} PhaseLike
 */

/**
 * The EVOP effects as the input side shows them.
 * @typedef {object} EvopView
 * @property {string} cyclesText
 * @property {string} totalRunsText
 * @property {string} meanText
 * @property {Array<{ term: string, effect: string, errorLimit: string, significant: boolean, cls: string }>} effects
 * @property {string} bestPoint empty without one
 * @property {string} recommendationClass
 * @property {string} recommendationText
 */

/** @type {import('./state.types.js').DoePlannerViewFn} */
export const evopView = (ctx) => ({
  // ── Project ───────────────────────────────────────────────

  /**
   * Switches the project mode; the first switch-on opens phase 1 with the current plan.
   * @param {Event} event change of the switch
   * @returns {void}
   */
  projectModeChanged(event) {
    this.model.setProjectMode({ on: /** @type {HTMLInputElement} */ (event.target).checked });
  },

  /** @returns {boolean} the project has phases */
  get hasPhases() { return this.model.projectPhases.length > 0; },

  // ── Timeline ──────────────────────────────────────────────

  /** @param {number} idx @returns {string} classes of a phase in the timeline */
  timelineItemClass(idx) {
    const m = this.model;
    const ph = m.projectPhases[idx];
    const active = idx === m.activePhaseIdx ? 'doe__timeline-item--active' : '';
    const done = ph && ph.decision ? 'doe__timeline-item--done' : '';
    return `${active} ${done}`.trim();
  },

  /** @param {PhaseLike} ph @returns {string} */
  phaseLabel(ph) { return ph.doeName || `Phase ${ph.cycleNumber}`; },

  /** @param {PhaseLike} ph @returns {string} icon of the decision, '' while open */
  phaseDecIcon(ph) { return (ph.decision && DECISION_ICONS[ph.decision]) || ''; },

  /** @param {PhaseLike} ph @returns {boolean} the phase is decided */
  hasDecIcon(ph) { return this.phaseDecIcon(ph) !== ''; },

  /** @returns {boolean} a new phase may start */
  get canNewPhase() { return /** @type {any} */ (this.model).canStartNewPhase(); },

  // ── Decision ──────────────────────────────────────────────

  /** @returns {boolean} the active phase is open and every response value is in its datasheet */
  get showPhaseDecision() {
    const m = this.model;
    const ph = m.projectPhases[m.activePhaseIdx];
    return Boolean(m.projectMode && ph && !ph.decision && this.staleness === 'bound' && this.progress && this.progress.complete);
  },

  /**
   * Closes the active phase with a decision, after the confirm of the command;
   * the values of every response go with it.
   * @param {'recenter'|'repeat'|'stop'} decision
   * @returns {Promise<void>}
   */
  async decide(decision) {
    const values = responseValues(this.model, ctx.data);
    const yValues = values === null ? null : values.map((col) => col ?? []);
    const res = await runUiCommand(this._ui, 'completePhase', { decision, yValues });
    if (res.ok === false && 'error' in res) {
      console.warn('[doe-planner] completePhase failed', res.error);
      ctx.notify(String(/** @type {any} */ (res.error)?.message ?? res.error), 'error');
    }
  },

  // ── EVOP effects ──────────────────────────────────────────

  /** @returns {EvopView|null} the effects to show; null without */
  get shownEvop() {
    const v = this.evopSummaryView;
    return v && !(/** @type {any} */ (v).error) ? v : null;
  },

  /** @returns {string} */
  get bestPointLabel() { return `${this.t('evopBestPoint')}:`; },

  computed: {
    /**
     * The cumulative EVOP effects in display form; null without a closed phase with values.
     * @returns {EvopView|null}
     */
    evopSummaryView() {
      const e = /** @type {any} */ (this.evop)?.summary;
      if (!e) return null;
      const lang = ctx.context.language;
      const num = (/** @type {number} */ v) => formatNumber(v, lang, { decimals: 4 });
      return {
        cyclesText: this.t('evopCycles', { n: e.cycleCount }),
        totalRunsText: this.t('evopTotalRuns', { n: e.totalRuns }),
        meanText: `${this.t('evopMean')}: ${num(e.cycleMean)}`,
        effects: e.effects.map((/** @type {any} */ x) => ({
          term: x.term,
          effect: num(x.cumulativeEffect),
          errorLimit: `±${x.errorLimit === Infinity ? '∞' : num(x.errorLimit)}`,
          significant: Boolean(x.significant),
          cls: x.significant ? 'doe__evop-sig' : '',
        })),
        bestPoint: e.bestPointDescription || '',
        recommendationClass: `doe__evop-recommendation doe__evop-rec--${e.overallRecommendation}`,
        recommendationText: this.t(`evopRec_${e.overallRecommendation}`),
      };
    },
  },
});
