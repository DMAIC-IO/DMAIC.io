/**
 * D.Mike — DoE-Berater Module (doe-advisor.js)
 * Overview of available DoE designs and a guided wizard that recommends
 * the right design based on the user's project context.
 * DMAIC phase: Improve
 */

import { escHtml, escAttr } from '../../core/html-utils.js';

/**
 * DoE design catalog. Keys are stable design IDs; copy lives in i18n
 * under modules.doe-advisor.designs.<id>.
 *
 * Each entry references the same key set so a single template renders
 * the catalog table and the wizard recommendation card.
 *
 * @type {string[]}
 */
const DESIGN_IDS = [
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
const PHASE_GUIDE_IDS = ['define-measure', 'analyze', 'improve', 'improve-robustness', 'control'];

/** @type {string[]} */
const CCD_ROW_IDS = [
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
const WIZARD_STEPS = [
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
const ANSWER_KEYS = {
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
const RESULT_DESIGN = {
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

export default {
  id: 'doe-advisor',
  phase: 'improve',
  icon: 'compass',
  i18nKey: 'modules.doe-advisor',
  version: '1.0.0',

  /** @type {object|null} */
  _context: null,
  /** @type {HTMLElement|null} */
  _container: null,
  /** @type {'overview'|'wizard'|'ccd'} */
  _tab: 'overview',
  /** @type {string} Current wizard step id */
  _currentStep: 'phase',
  /** @type {object} Wizard answers keyed by ANSWER_KEYS values */
  _answers: {},
  /** @type {string|null} Final recommendation key (e.g. 'result:full') */
  _result: null,
  /** @type {string[]} History of visited step ids (for back button) */
  _history: [],

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._tab = 'overview';
    this._resetWizard();

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._importState(saved);

    this._render();
  },

  async destroy() {
    this._container.innerHTML = '';
  },

  onLanguageChange(_lang) {
    this._render();
  },

  onThemeChange(_theme) {
    // CSS variables handle theme
  },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return {
      tab: this._tab,
      currentStep: this._currentStep,
      answers: { ...this._answers },
      result: this._result,
      history: [...this._history],
    };
  },

  setState(data) {
    this._importState(data);
    this._render();
  },

  // ─── Help ───────────────────────────────────────────────────

  help: () => import('./doe-advisor-help.js'),

  // ─── Internal: state ────────────────────────────────────────

  _importState(saved) {
    if (!saved) return;
    if (typeof saved.tab === 'string') this._tab = saved.tab;
    if (typeof saved.currentStep === 'string') this._currentStep = saved.currentStep;
    if (saved.answers && typeof saved.answers === 'object') this._answers = { ...saved.answers };
    if (typeof saved.result === 'string' || saved.result === null) this._result = saved.result;
    if (Array.isArray(saved.history)) this._history = [...saved.history];
  },

  _resetWizard() {
    this._currentStep = 'phase';
    this._answers = {};
    this._result = null;
    this._history = [];
  },

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      this.getState()
    );
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (key, params) => this._context.i18n.t(`modules.doe-advisor.${key}`, params);

    this._container.innerHTML = `
      <div class="module-container doe-advisor">
        <div class="module-container__header">
          <h2 class="module-container__title">${escHtml(t('name'))}</h2>
          <div class="doe-advisor__tabs" role="tablist">
            <button class="doe-advisor__tab${this._tab === 'overview' ? ' doe-advisor__tab--active' : ''}"
                    data-tab="overview" type="button">${escHtml(t('tabOverview'))}</button>
            <button class="doe-advisor__tab${this._tab === 'wizard' ? ' doe-advisor__tab--active' : ''}"
                    data-tab="wizard" type="button">${escHtml(t('tabWizard'))}</button>
            <button class="doe-advisor__tab${this._tab === 'ccd' ? ' doe-advisor__tab--active' : ''}"
                    data-tab="ccd" type="button">${escHtml(t('tabCcd'))}</button>
          </div>
        </div>

        <div class="module-container__body">
          ${this._tab === 'overview' ? this._renderOverview(t) : ''}
          ${this._tab === 'wizard' ? this._renderWizard(t) : ''}
          ${this._tab === 'ccd' ? this._renderCcd(t) : ''}
        </div>
      </div>
    `;

    this._bindEvents();
  },

  _renderOverview(t) {
    const designsRows = DESIGN_IDS.map((id) => {
      const tip = t(`designs.${id}.tip`);
      const factors = t(`designs.${id}.factors`);
      const levels = t(`designs.${id}.levels`);
      const effort = t(`designs.${id}.effort`);
      const note = t(`designs.${id}.note`);
      const name = t(`designs.${id}.name`);
      return `
        <tr class="doe-advisor__row" data-design-id="${escAttr(id)}">
          <th scope="row" class="doe-advisor__row-name">
            <div class="doe-advisor__design-name">${escHtml(name)}</div>
            <div class="doe-advisor__design-tip">${escHtml(tip)}</div>
          </th>
          <td class="doe-advisor__cell-num">${escHtml(factors)}</td>
          <td class="doe-advisor__cell-num">${escHtml(levels)}</td>
          <td>${escHtml(effort)}</td>
          <td>${escHtml(note)}</td>
        </tr>
      `;
    }).join('');

    const phaseRows = PHASE_GUIDE_IDS.map((id) => `
      <tr>
        <th scope="row">${escHtml(t(`phaseGuide.${id}.phase`))}</th>
        <td>${escHtml(t(`phaseGuide.${id}.goal`))}</td>
        <td>${escHtml(t(`phaseGuide.${id}.designs`))}</td>
      </tr>
    `).join('');

    return `
      <section class="doe-advisor__section">
        <h3 class="doe-advisor__section-title">${escHtml(t('overviewTitle'))}</h3>
        <p class="doe-advisor__section-lead">${escHtml(t('overviewLead'))}</p>

        <div class="doe-advisor__table-wrap">
          <table class="doe-advisor__table">
            <thead>
              <tr>
                <th scope="col">${escHtml(t('col.design'))}</th>
                <th scope="col">${escHtml(t('col.factors'))}</th>
                <th scope="col">${escHtml(t('col.levels'))}</th>
                <th scope="col">${escHtml(t('col.effort'))}</th>
                <th scope="col">${escHtml(t('col.note'))}</th>
              </tr>
            </thead>
            <tbody>${designsRows}</tbody>
          </table>
        </div>
      </section>

      <section class="doe-advisor__section">
        <h3 class="doe-advisor__section-title">${escHtml(t('phaseGuideTitle'))}</h3>
        <div class="doe-advisor__table-wrap">
          <table class="doe-advisor__table doe-advisor__table--phase">
            <thead>
              <tr>
                <th scope="col">${escHtml(t('col.dmaicPhase'))}</th>
                <th scope="col">${escHtml(t('col.target'))}</th>
                <th scope="col">${escHtml(t('col.recommended'))}</th>
              </tr>
            </thead>
            <tbody>${phaseRows}</tbody>
          </table>
        </div>
      </section>
    `;
  },

  _renderWizard(t) {
    const isResult = this._currentStep.startsWith('result:');
    const stepNum = this._history.length + (isResult ? 0 : 1);
    const totalEstimate = Math.max(stepNum + (isResult ? 0 : 1), 4);

    return `
      <section class="doe-advisor__section">
        <div class="doe-advisor__wizard-header">
          <h3 class="doe-advisor__section-title">${escHtml(t('wizardTitle'))}</h3>
          <div class="doe-advisor__wizard-progress">
            <span class="doe-advisor__wizard-step-label">
              ${isResult ? escHtml(t('wizardResultLabel')) : escHtml(t('wizardStepOf', { current: stepNum, total: totalEstimate }))}
            </span>
            <button class="btn btn--sm doe-advisor__wizard-restart" type="button">${escHtml(t('wizardRestart'))}</button>
          </div>
        </div>

        ${isResult ? this._renderWizardResult(t) : this._renderWizardStep(t)}

        ${this._history.length > 0 || isResult ? `
          <div class="doe-advisor__wizard-nav">
            <button class="btn btn--sm doe-advisor__wizard-back" type="button">${escHtml(t('wizardBack'))}</button>
          </div>
        ` : ''}
      </section>
    `;
  },

  _renderWizardStep(t) {
    const step = WIZARD_STEPS.find((s) => s.id === this._currentStep);
    if (!step) return '';

    const options = step.options.map((opt) => {
      const label = t(`wizard.${step.id}.options.${opt}.label`);
      const help = t(`wizard.${step.id}.options.${opt}.help`);
      return `
        <button class="doe-advisor__option" data-option="${escAttr(opt)}" type="button">
          <span class="doe-advisor__option-label">${escHtml(label)}</span>
          <span class="doe-advisor__option-help">${escHtml(help)}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="doe-advisor__wizard-question">
        <div class="doe-advisor__wizard-question-text">${escHtml(t(`wizard.${step.id}.question`))}</div>
        ${this._history.length > 0 ? `
          <div class="doe-advisor__wizard-trail">
            ${this._history.map((stepId) => {
              const s = WIZARD_STEPS.find((x) => x.id === stepId);
              if (!s) return '';
              const ans = this._answers[ANSWER_KEYS[stepId]];
              if (!ans) return '';
              const ansLabel = t(`wizard.${stepId}.options.${ans}.label`);
              return `<span class="doe-advisor__wizard-trail-item">${escHtml(t(`wizard.${stepId}.short`))}: <strong>${escHtml(ansLabel)}</strong></span>`;
            }).join('')}
          </div>
        ` : ''}
      </div>

      <div class="doe-advisor__options">
        ${options}
      </div>
    `;
  },

  _renderWizardResult(t) {
    const key = this._currentStep.slice('result:'.length);
    const designId = RESULT_DESIGN[key];

    if (!designId) {
      // No DoE recommended (Define / Measure)
      return `
        <div class="doe-advisor__result doe-advisor__result--none">
          <div class="doe-advisor__result-tag">${escHtml(t('wizardResultLabel'))}</div>
          <h4 class="doe-advisor__result-title">${escHtml(t('resultNoneTitle'))}</h4>
          <p class="doe-advisor__result-body">${escHtml(t('resultNoneBody'))}</p>
        </div>
      `;
    }

    const name = t(`designs.${designId}.name`);
    const tip = t(`designs.${designId}.tip`);
    const note = t(`designs.${designId}.note`);
    const factors = t(`designs.${designId}.factors`);
    const levels = t(`designs.${designId}.levels`);
    const effort = t(`designs.${designId}.effort`);
    const reasoning = t(`wizard.reasoning.${designId}`);

    return `
      <div class="doe-advisor__result" data-design-id="${escAttr(designId)}">
        <div class="doe-advisor__result-tag">${escHtml(t('wizardResultLabel'))}</div>
        <h4 class="doe-advisor__result-title">${escHtml(name)}</h4>
        <p class="doe-advisor__result-reasoning">${escHtml(reasoning)}</p>

        <div class="doe-advisor__result-meta">
          <div class="doe-advisor__result-meta-item">
            <span class="doe-advisor__result-meta-label">${escHtml(t('col.factors'))}</span>
            <span class="doe-advisor__result-meta-value">${escHtml(factors)}</span>
          </div>
          <div class="doe-advisor__result-meta-item">
            <span class="doe-advisor__result-meta-label">${escHtml(t('col.levels'))}</span>
            <span class="doe-advisor__result-meta-value">${escHtml(levels)}</span>
          </div>
          <div class="doe-advisor__result-meta-item">
            <span class="doe-advisor__result-meta-label">${escHtml(t('col.effort'))}</span>
            <span class="doe-advisor__result-meta-value">${escHtml(effort)}</span>
          </div>
        </div>

        <div class="doe-advisor__result-section">
          <h5 class="doe-advisor__result-subtitle">${escHtml(t('resultUseCase'))}</h5>
          <p class="doe-advisor__result-body">${escHtml(tip)}</p>
        </div>

        <div class="doe-advisor__result-section">
          <h5 class="doe-advisor__result-subtitle">${escHtml(t('resultStrengthLimit'))}</h5>
          <p class="doe-advisor__result-body">${escHtml(note)}</p>
        </div>
      </div>
    `;
  },

  _renderCcd(t) {
    const rows = CCD_ROW_IDS.map((id) => `
      <tr>
        <th scope="row">${escHtml(t(`ccd.rows.${id}.label`))}</th>
        <td>${escHtml(t(`ccd.rows.${id}.rotatable`))}</td>
        <td>${escHtml(t(`ccd.rows.${id}.face`))}</td>
      </tr>
    `).join('');

    return `
      <section class="doe-advisor__section">
        <h3 class="doe-advisor__section-title">${escHtml(t('ccdTitle'))}</h3>
        <p class="doe-advisor__section-lead">${escHtml(t('ccdLead'))}</p>

        <div class="doe-advisor__table-wrap">
          <table class="doe-advisor__table doe-advisor__table--ccd">
            <thead>
              <tr>
                <th scope="col">${escHtml(t('ccd.col.property'))}</th>
                <th scope="col">${escHtml(t('ccd.col.rotatable'))}</th>
                <th scope="col">${escHtml(t('ccd.col.face'))}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <div class="doe-advisor__rule">
          <div class="doe-advisor__rule-label">${escHtml(t('ccd.ruleLabel'))}</div>
          <p class="doe-advisor__rule-body">${escHtml(t('ccd.ruleBody'))}</p>
        </div>
      </section>
    `;
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindEvents() {
    const el = this._container;

    el.querySelectorAll('.doe-advisor__tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._tab = btn.dataset.tab;
        this._save();
        this._render();
      });
    });

    el.querySelectorAll('.doe-advisor__option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const opt = btn.dataset.option;
        this._answerStep(opt);
      });
    });

    el.querySelector('.doe-advisor__wizard-back')?.addEventListener('click', () => {
      this._goBack();
    });

    el.querySelector('.doe-advisor__wizard-restart')?.addEventListener('click', () => {
      this._resetWizard();
      this._save();
      this._render();
    });
  },

  // ─── Wizard logic ───────────────────────────────────────────

  _answerStep(option) {
    const step = WIZARD_STEPS.find((s) => s.id === this._currentStep);
    if (!step) return;
    const answerKey = ANSWER_KEYS[step.id];
    this._answers[answerKey] = option;
    this._history.push(step.id);
    const next = step.next(this._answers);
    this._currentStep = next;
    if (next.startsWith('result:')) {
      this._result = next;
    }
    this._save();
    this._render();
  },

  _goBack() {
    if (this._history.length === 0) return;
    const prevStep = this._history.pop();
    // remove its answer
    const answerKey = ANSWER_KEYS[prevStep];
    if (answerKey) delete this._answers[answerKey];
    this._currentStep = prevStep;
    this._result = null;
    this._save();
    this._render();
  },
};
