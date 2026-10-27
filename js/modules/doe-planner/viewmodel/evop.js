/**
 * D.Mike — DoE planner EVOP project (viewmodel/evop.js)
 *
 * Sub-viewmodel of the EVOP project mode: project name, the phase
 * timeline, the decision that closes a phase (re-center, repeat, stop)
 * and the cumulative EVOP effects. The phase logic itself lives in the
 * model (spec E8); this class confirms, fetches the response values (E5),
 * saves and shows. The confirm dialog stays with the interface:
 * confirmCompletePhase asks, completePhase acts (spec E6).
 *
 * Spec: docs/superpowers/specs/2026-10-25-doe-planner-teil-viewmodels-design.md
 */
import { PHASE_DECISIONS } from '../doe-planner-model.js';
import { readResponses, staleness, boundComplete } from '../doe-planner-responses.js';
import { requireEnum, requireIndex, requireText } from '../../../core/agent/agent-argcheck.js';

const BOOLEANS = [true, false];
const DECISION_ICONS = { recenter: 'action.loop', repeat: 'action.reset', stop: 'status.ok' };

export class EvopViewModel {
  /**
   * Gets only what exists before the mount; the model comes with attach().
   * @param {{t: function(string, object=): string, context: object, container: function(): ?Element}} deps
   */
  constructor({ t, context, container }) {
    this._t = t;
    this._context = context;
    this._container = container;
    /** @type {?object} the component's State, set by attach() */
    this.model = null;
    this._save = () => {};
    this._rev = () => 0;
    this._schedule = () => {};
    this._adoptSignatures = () => {};
  }

  /**
   * Binds the component's model and the shell's save, revision, scheduling and signature hooks.
   * @noagent lifecycle
   * @param {{model: object, save: function(): void, rev: function(): number, schedule: function(): void, adoptSignatures: function(): void}} binding
   */
  attach({ model, save, rev, schedule, adoptSignatures }) {
    this.model = model;
    this._save = save;
    this._rev = rev;
    this._schedule = schedule;
    this._adoptSignatures = adoptSignatures;
  }

  /**
   * Nothing to release but the hooks.
   * @noagent lifecycle
   */
  detach() {
    this._save = () => {};
    this._schedule = () => {};
    this._adoptSignatures = () => {};
  }

  // ── Project ───────────────────────────────────────────────

  /**
   * Switch the EVOP project mode. The first switch-on opens phase 1 with the current plan.
   * @agent
   * @param {boolean} on
   * @returns {void}
   * @throws {Error} if on is not a boolean
   */
  setProjectMode(on) {
    requireEnum('on', on, BOOLEANS);
    this.model.setProjectMode(on);
    this._save();
  }

  /**
   * Set the project name; new phases are named after it.
   * @agent
   * @param {string} name the name; "" clears it
   * @returns {void}
   * @throws {Error} if name is not a string
   */
  setProjectName(name) {
    this.model.projectName = requireText('name', name);
    this._save();
  }

  // ── Timeline ──────────────────────────────────────────────

  /** @noagent view transform @param {number} idx @returns {string} */
  timelineItemClass(idx) {
    const m = this.model;
    const ph = m.projectPhases[idx];
    const isCurrent = idx === m.activePhaseIdx ? 'doe__timeline-item--active' : '';
    const isDone = ph && ph.decision ? 'doe__timeline-item--done' : '';
    return (`${isCurrent} ${isDone}`).trim();
  }

  /** @noagent view transform @param {{doeName: string, cycleNumber: number}} ph @returns {string} */
  phaseLabel(ph) { return ph.doeName || `Phase ${ph.cycleNumber}`; }

  /** @noagent view transform @param {{decision: ?string}} ph @returns {string} icon name or '' */
  phaseDecIcon(ph) { return DECISION_ICONS[ph.decision] || ''; }

  /** @noagent view transform @returns {boolean} */
  canStartNewPhase() { return this.model.canStartNewPhase(); }

  /** @noagent view transform @returns {boolean} the active, undecided phase has every response */
  showPhaseDecision() {
    void this._rev();
    const m = this.model;
    const ph = m.projectPhases[m.activePhaseIdx];
    return Boolean(m.projectMode && ph && !ph.decision
      && staleness(this._context, m) === 'bound' && boundComplete(this._context, m));
  }

  /**
   * Start a new phase with the current factor levels. Only on a decided
   * active phase, and never after the project was stopped.
   * @agent
   * @returns {number} the index of the new phase
   * @throws {Error} if the active phase is undecided or the project was stopped
   */
  newPhase() {
    if (!this.model.canStartNewPhase()) {
      throw new Error('a new phase needs a decided active phase and a project that was not stopped');
    }
    this.model.startPhase({ recenter: false });
    this._save();
    return this.model.activePhaseIdx;
  }

  /**
   * Close the active phase without asking: store its design and the first
   * response's values, then re-center or repeat in a new phase, or stop.
   * @agent
   * @param {'recenter'|'repeat'|'stop'} decision
   * @returns {boolean} false when there is no undecided active phase
   * @throws {Error} if the decision is unknown
   */
  completePhase(decision) {
    requireEnum('decision', decision, PHASE_DECISIONS);
    const m = this.model;
    const resp = readResponses(this._context, m);
    const closed = m.closeActivePhase(decision, resp && resp.values && resp.values[0] ? resp.values[0] : undefined);
    if (!closed) return false;
    if (decision !== 'stop') {
      m.startPhase({ recenter: decision === 'recenter' });
      this._schedule();
    }
    this._save();
    return true;
  }

  /**
   * @noagent asks first — the agent calls completePhase
   * @param {'recenter'|'repeat'|'stop'} decision
   * @returns {Promise<boolean>} true when the phase was closed
   */
  async confirmCompletePhase(decision) {
    const ph = this.model.projectPhases[this.model.activePhaseIdx];
    if (!ph || ph.decision) return false;
    const ok = await this._context.dialog.confirm({ message: this._t(`decisionConfirm_${decision}`) });
    if (!ok) return false;
    return this.completePhase(decision);
  }

  /**
   * Show a phase: its plan, design and datasheet come back; the design is not regenerated.
   * @agent
   * @param {number} idx the phase, 0 = phase 1
   * @returns {void}
   * @throws {Error} if the phase is unknown
   */
  viewPhase(idx) {
    requireIndex('idx', idx, this.model.projectPhases.length - 1);
    this.model.viewPhase(idx);
    this._adoptSignatures();
    this._save();
  }

  // ── EVOP effects ──────────────────────────────────────────

  /** @noagent view transform @returns {?object} cumulative effects of all closed phases */
  evopSummary() { return this.model.evopSummary(); }

  /** @noagent view transform @returns {string} */
  evopMeanLabel() {
    const e = this.evopSummary();
    return e ? `${this._t('evopMean')}: ${e.cycleMean.toFixed(4)}` : '';
  }

  /** @noagent view transform @param {{errorLimit: number}} e @returns {string} */
  evopErrorLimit(e) {
    return `±${e.errorLimit === Infinity ? '∞' : e.errorLimit.toFixed(4)}`;
  }
}
