/**
 * D.Mike — DoE-Berater Model (doe-advisor-model.js)
 *
 * Pure state + business logic for the DoE Advisor module: the design catalog
 * id lists, the wizard decision tree, and the wizard state machine. Contains
 * no DOM access, no i18n and no view formatting — those live in the data-fn
 * (see doe-advisor.js).
 */

/**
 * DoE design catalog. Keys are stable design IDs; copy lives in i18n
 * under modules.doe-advisor.designs.<id>.
 * @type {string[]}
 */
export const DESIGN_IDS = [
  'full',
  'full-general',
  'fractional',
  'plackett-burman',
  'dsd',
  'ccd-rotatable',
  'ccd-face',
  'box-behnken',
  'taguchi',
  'dispersion',
  'mixture',
  'd-optimal',
  'evop',
];

/** @type {string[]} */
export const PHASE_GUIDE_IDS = ['define-measure', 'analyze', 'improve', 'improve-robustness', 'control'];

/** @type {string[]} */
export const CCD_ROW_IDS = [
  'alpha', 'alpha-k', 'star-position', 'levels',
  'rotatable', 'prediction', 'range', 'practical',
  'quality', 'application',
];

/**
 * Wizard questions. Each step renders a question and a list of options.
 * The advance logic uses `next` (a function of the current answers) to
 * decide which step comes next or which design to recommend.
 *
 * Steps reference i18n keys via modules.doe-advisor.wizard.<id>.
 *
 * @type {{id: string, options: string[], next: (answers: object) => string}[]}
 */
export const WIZARD_STEPS = [
  {
    id: 'phase',
    options: ['define-measure', 'analyze', 'improve', 'control'],
    next: (a) => {
      if (a.phase === 'define-measure') return 'result:none';
      if (a.phase === 'control') return 'result:evop';
      return 'goal';
    },
  },
  {
    id: 'goal',
    options: ['screening', 'interactions', 'optimization', 'robustness', 'mixture'],
    next: (a) => {
      if (a.goal === 'mixture') return 'result:mixture';
      if (a.goal === 'robustness') return 'robustness-type';
      if (a.goal === 'screening') return 'screening-curvature';
      if (a.goal === 'interactions') return 'factor-count';
      // optimization
      return 'limits';
    },
  },
  {
    id: 'screening-curvature',
    options: ['yes', 'no', 'many-factors'],
    next: (a) => {
      if (a.screeningCurvature === 'many-factors') return 'result:plackett-burman';
      if (a.screeningCurvature === 'yes') return 'result:dsd';
      return 'result:fractional';
    },
  },
  {
    id: 'factor-count',
    options: ['few', 'many'],
    next: (a) => {
      if (a.factorCount === 'few') return 'factor-levels';
      return 'result:fractional';
    },
  },
  {
    id: 'factor-levels',
    options: ['two', 'multi-or-mixed'],
    next: (a) => {
      if (a.factorLevels === 'multi-or-mixed') return 'result:full-general';
      return 'result:full';
    },
  },
  {
    id: 'robustness-type',
    options: ['noise-factors', 'dispersion-only'],
    next: (a) => {
      if (a.robustnessType === 'dispersion-only') return 'result:dispersion';
      return 'result:taguchi';
    },
  },
  {
    id: 'limits',
    options: ['expandable', 'hard'],
    next: (a) => {
      if (a.limits === 'expandable') return 'result:ccd-rotatable';
      return 'corners';
    },
  },
  {
    id: 'corners',
    options: ['allowed', 'forbidden', 'constrained'],
    next: (a) => {
      if (a.corners === 'constrained') return 'result:d-optimal';
      if (a.corners === 'forbidden') return 'result:box-behnken';
      return 'result:ccd-face';
    },
  },
];

/** Map answer key per step id (used by `next` to look up the answer). */
export const ANSWER_KEYS = {
  'phase': 'phase',
  'goal': 'goal',
  'screening-curvature': 'screeningCurvature',
  'factor-count': 'factorCount',
  'factor-levels': 'factorLevels',
  'robustness-type': 'robustnessType',
  'limits': 'limits',
  'corners': 'corners',
};

/** Result keys map design IDs to their catalog entry. */
export const RESULT_DESIGN = {
  'evop': 'evop',
  'mixture': 'mixture',
  'taguchi': 'taguchi',
  'dispersion': 'dispersion',
  'plackett-burman': 'plackett-burman',
  'dsd': 'dsd',
  'fractional': 'fractional',
  'full': 'full',
  'full-general': 'full-general',
  'ccd-rotatable': 'ccd-rotatable',
  'ccd-face': 'ccd-face',
  'box-behnken': 'box-behnken',
  'd-optimal': 'd-optimal',
  'none': null,
};

const RESULT_PREFIX = 'result:';

/**
 * DoE Advisor state: active tab plus the wizard state machine.
 */
export class State {
  static VERSION = '1.0';
  static ID = 'doe-advisor';

  _schema = { name: State.ID, version: State.VERSION };

  /** @type {'overview'|'wizard'|'ccd'} */
  tab = 'overview';
  /** @type {string} Current wizard step id, or `result:<key>` once decided. */
  currentStep = 'phase';
  /** @type {Record<string,string>} Answers keyed by ANSWER_KEYS values. */
  answers = {};
  /** @type {string[]} Visited step ids (back-button history). */
  history = [];

  // ─── Derived (raw data) ─────────────────────────────────────

  /** @returns {boolean} whether the wizard has reached a recommendation. */
  get isResult() {
    return this.currentStep.startsWith(RESULT_PREFIX);
  }

  /** @returns {string|null} the result key (e.g. 'evop', 'none') or null. */
  get resultKey() {
    return this.isResult ? this.currentStep.slice(RESULT_PREFIX.length) : null;
  }

  /** @returns {string|null} the recommended design id, or null when none. */
  get resultDesignId() {
    const key = this.resultKey;
    if (key == null) return null;
    return RESULT_DESIGN[key] ?? null;
  }

  /** @returns {object|null} definition of the active (non-result) step. */
  get currentStepDef() {
    return WIZARD_STEPS.find((s) => s.id === this.currentStep) || null;
  }

  /** @returns {string[]} option ids of the active step (empty on a result). */
  get currentOptions() {
    const step = this.currentStepDef;
    return step ? step.options : [];
  }

  // ─── Business logic ─────────────────────────────────────────

  /**
   * Record an answer for the current step and advance to the next step
   * (or a result), pushing the current step onto the history.
   * @param {string} option
   */
  answerStep(option) {
    const step = this.currentStepDef;
    if (!step) return;
    const answerKey = ANSWER_KEYS[step.id];
    this.answers[answerKey] = option;
    this.history.push(step.id);
    this.currentStep = step.next(this.answers);
  }

  /** Step back one question, discarding the answer that led away from it. */
  goBack() {
    if (this.history.length === 0) return;
    const prevStep = this.history.pop();
    const answerKey = ANSWER_KEYS[prevStep];
    if (answerKey) delete this.answers[answerKey];
    this.currentStep = prevStep;
  }

  /** Reset the wizard to its first question. */
  resetWizard() {
    this.currentStep = 'phase';
    this.answers = {};
    this.history = [];
  }

  /** @returns {boolean} whether any non-default state is present. */
  hasContent() {
    return this.tab !== 'overview' || this.currentStep !== 'phase' || this.history.length > 0;
  }

  // ─── Serialization ──────────────────────────────────────────

  toJSON() {
    return {
      _schema: { ...this._schema },
      tab: this.tab,
      currentStep: this.currentStep,
      answers: { ...this.answers },
      history: [...this.history],
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d) return s;
    if (typeof d.tab === 'string') s.tab = d.tab;
    if (typeof d.currentStep === 'string') s.currentStep = d.currentStep;
    if (d.answers && typeof d.answers === 'object' && !Array.isArray(d.answers)) {
      s.answers = { ...d.answers };
    }
    if (Array.isArray(d.history)) s.history = [...d.history];
    return s;
  }
}
