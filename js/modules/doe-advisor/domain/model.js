/**
 * D.Mike — DoE-Berater: Model.
 *
 * Der Weg durch den Berater: die offene Frage oder die erreichte Empfehlung,
 * die gegebenen Antworten und die Spur der beantworteten Fragen; der
 * angezeigte Reiter ist ein Ansichtsfeld. Geschrieben wird der Berater nur
 * über die drei Kommandos. Die Antwortmöglichkeiten der offenen Frage und die
 * Empfehlung sind abgeleitet. Ohne DOM.
 *
 * Gespeichert: `{ _schema, currentStep, answers, history, tab }`. Dass die
 * drei Beraterfelder zueinander passen, sichert die Invariante
 * `wizardConsistent` — beim Laden normalisiert, beim Schreiben abgelehnt.
 */
import {
  defineModel, command, list, object, oneOf,
} from '../../../core/model.js';
import { requireForm } from '../../../core/validate.js';
import { from0, from1_0 } from './migrations.js';
import {
  FIRST_STEP, isResultStep, optionsOf, resultDesignIdOf, answered, wentBack, freshWizard, normalize, sameWizard,
} from './wizard.js';

/** Die Fragen des Beraters (gleich `STEP_IDS` aus wizard.js, Unit-Test). */
export const STEP_IDS = ['phase', 'goal', 'screening-curvature', 'factor-count', 'factor-levels', 'robustness-type', 'limits', 'corners'];

/** Alle Schritte: die Fragen und die Empfehlungen (gleich `STEP_IDS` + `RESULT_STEPS`, Unit-Test). */
export const CURRENT_STEPS = [
  'phase', 'goal', 'screening-curvature', 'factor-count', 'factor-levels', 'robustness-type', 'limits', 'corners',
  'result:evop', 'result:mixture', 'result:taguchi', 'result:dispersion', 'result:plackett-burman', 'result:dsd',
  'result:fractional', 'result:full', 'result:full-general', 'result:ccd-rotatable', 'result:ccd-face',
  'result:box-behnken', 'result:d-optimal', 'result:none',
];

/** Alle Antwortmöglichkeiten aller Fragen (gleich `ALL_OPTIONS` aus wizard.js, Unit-Test). */
export const ALL_OPTIONS = [
  'define-measure', 'analyze', 'improve', 'control',
  'screening', 'interactions', 'optimization', 'robustness', 'mixture',
  'yes', 'no', 'many-factors', 'few', 'many', 'two', 'multi-or-mixed',
  'noise-factors', 'dispersion-only', 'expandable', 'hard', 'allowed', 'forbidden', 'constrained',
];

/** Die Reiter. */
export const TABS = ['overview', 'wizard', 'ccd'];

/**
 * Der empfohlene Versuchsplan, wie ihn die Ergebniskarte zeigt.
 *
 * @typedef {object} Recommendation
 * @property {string} designId  der Schlüssel des empfohlenen Versuchsplans, z. B. `ccd-rotatable`
 * @property {string} name  die Bezeichnung des Versuchsplans, wie die Ergebniskarte sie zeigt
 * @property {string} factors  die Faktorenspanne, wie die Ergebniskarte sie zeigt
 * @property {string} levels  die Stufenangabe, wie die Ergebniskarte sie zeigt
 * @property {string} effort  die Aufwandsangabe, wie die Ergebniskarte sie zeigt
 */

/**
 * Lehnt ab, mit dem Hinweis `hintKey` für die Oberfläche.
 * @param {string} name @param {unknown} value @param {boolean} ok @param {string} allowed @param {string} hintKey
 */
function requireWith(name, value, ok, allowed, hintKey) {
  try {
    requireForm(name, value, ok, allowed);
  } catch (err) {
    throw Object.assign(/** @type {Error} */ (err), { hintKey });
  }
}

/**
 * Schreibt einen Beraterstand in das Model.
 * @param {any} m @param {import('./wizard.js').WizardState} s
 */
function assign(m, s) {
  m.answers = s.answers;
  m.history = s.history;
  m.currentStep = s.currentStep;
}

export class State extends defineModel({
  version: '1.1',
  migrations: { '0→1.0': from0, '1.0→1.1': from1_0 },
  fields: {
    /** die id der offenen Frage oder `result:<schlüssel>`, sobald eine Empfehlung steht */
    currentStep: oneOf(CURRENT_STEPS, { default: 'phase', agentWrite: false }),
    /** die gegebenen Antworten, je beantworteter Frage eine */
    answers: object({
      phase: oneOf(['define-measure', 'analyze', 'improve', 'control'], { optional: true }),
      goal: oneOf(['screening', 'interactions', 'optimization', 'robustness', 'mixture'], { optional: true }),
      screeningCurvature: oneOf(['yes', 'no', 'many-factors'], { optional: true }),
      factorCount: oneOf(['few', 'many'], { optional: true }),
      factorLevels: oneOf(['two', 'multi-or-mixed'], { optional: true }),
      robustnessType: oneOf(['noise-factors', 'dispersion-only'], { optional: true }),
      limits: oneOf(['expandable', 'hard'], { optional: true }),
      corners: oneOf(['allowed', 'forbidden', 'constrained'], { optional: true }),
    }, { agentWrite: false }),
    /** die ids der beantworteten Fragen in Antwortreihenfolge */
    history: list(oneOf(STEP_IDS), { agentWrite: false }),
  },
  view: {
    /** der angezeigte Reiter */
    tab: oneOf(TABS),
  },
  invariants: {
    wizardConsistent: {
      fields: ['currentStep', 'answers', 'history'],
      test(m) { return sameWizard(normalize(m), m); },
      repair(m) {
        const n = normalize(m._v);
        m._v.currentStep = n.currentStep;
        m._v.answers = n.answers;
        m._v.history = n.history;
      },
    },
  },
  commands: {
    answer: command({
      params: { opt: oneOf(ALL_OPTIONS) },
      returns: oneOf(CURRENT_STEPS),
      run({ opt }) {
        requireWith('opt', opt, !isResultStep(this.currentStep), 'an answer while a question is open', 'hints.noOpenQuestion');
        const options = optionsOf(this.currentStep);
        requireForm('opt', opt, options.includes(opt), options.join(', '));
        assign(this, answered(this, opt));
        return this.currentStep;
      },
    }),
    back: command({
      returns: oneOf(CURRENT_STEPS),
      run() {
        requireWith('command', 'back', this.history.length > 0, 'a command once a question was answered', 'hints.atFirstQuestion');
        assign(this, wentBack(this));
        return this.currentStep;
      },
    }),
    restart: command({
      returns: oneOf(CURRENT_STEPS),
      run() {
        if (!sameWizard(freshWizard(), this)) assign(this, freshWizard());
        return FIRST_STEP;
      },
    }),
  },
  derived: {
    /**
     * Die Antwortmöglichkeiten der offenen Frage; leer auf einer Empfehlung.
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    currentOptions() {
      return [...optionsOf(this.currentStep)];
    },
    /**
     * Der empfohlene Versuchsplan in der aktiven Sprache; null vor einer
     * Empfehlung und wenn in der Phase noch kein Versuchsplan ansteht.
     * @param {import('../../../core/source-reader.js').Source} _src
     * @param {any} _d
     * @param {(key: string, params?: object) => string} t Übersetzer des Moduls
     * @this {import('./model.types.js').StateModel}
     * @returns {Recommendation|null}
     */
    recommendation(_src, _d, t) {
      const designId = resultDesignIdOf(this.currentStep);
      if (designId === null) return null;
      return {
        designId,
        name: t(`designs.${designId}.name`),
        factors: t(`designs.${designId}.factors`),
        levels: t(`designs.${designId}.levels`),
        effort: t(`designs.${designId}.effort`),
      };
    },
  },
}) {}
