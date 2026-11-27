/**
 * D.Mike — DoE-Berater: Katalog und Entscheidungsbaum.
 *
 * Reine Tabellen und Funktionen ohne DOM und ohne i18n: die ids des
 * Planverzeichnisses, des Phasenleitfadens und des CCD-Vergleichs, die acht
 * Fragen des Beraters mit Antwortschlüssel und Antwortmöglichkeiten, der
 * Übergang `nextOf` und die Zustandsfolge (antworten, zurück, neu,
 * normalisieren). Texte stehen unter `designs.<id>`, `phaseGuide.<id>`,
 * `ccd.rows.<id>` und `wizard.<schritt>` in `resources/i18n/ui.<lang>.json`.
 */

/** Die Versuchspläne des Verzeichnisses, in Anzeigereihenfolge. */
export const DESIGN_IDS = Object.freeze([
  'full', 'full-general', 'fractional', 'plackett-burman', 'dsd', 'ccd-rotatable', 'ccd-face',
  'box-behnken', 'taguchi', 'dispersion', 'mixture', 'd-optimal', 'evop',
]);

/** Die Zeilen des Phasenleitfadens. */
export const PHASE_GUIDE_IDS = Object.freeze(['define-measure', 'analyze', 'improve', 'improve-robustness', 'control']);

/** Die Zeilen des CCD-Vergleichs. */
export const CCD_ROW_IDS = Object.freeze([
  'alpha', 'alpha-k', 'star-position', 'levels', 'rotatable', 'prediction', 'range', 'practical', 'quality', 'application',
]);

/**
 * Die Fragen des Beraters: id, Schlüssel der Antwort in `answers` und die
 * Antwortmöglichkeiten in Anzeigereihenfolge.
 * @type {ReadonlyArray<{ id: string, key: string, options: ReadonlyArray<string> }>}
 */
export const STEPS = Object.freeze([
  { id: 'phase', key: 'phase', options: ['define-measure', 'analyze', 'improve', 'control'] },
  { id: 'goal', key: 'goal', options: ['screening', 'interactions', 'optimization', 'robustness', 'mixture'] },
  { id: 'screening-curvature', key: 'screeningCurvature', options: ['yes', 'no', 'many-factors'] },
  { id: 'factor-count', key: 'factorCount', options: ['few', 'many'] },
  { id: 'factor-levels', key: 'factorLevels', options: ['two', 'multi-or-mixed'] },
  { id: 'robustness-type', key: 'robustnessType', options: ['noise-factors', 'dispersion-only'] },
  { id: 'limits', key: 'limits', options: ['expandable', 'hard'] },
  { id: 'corners', key: 'corners', options: ['allowed', 'forbidden', 'constrained'] },
].map((s) => Object.freeze({ ...s, options: Object.freeze(s.options) })));

/** Die ids der Fragen, in Baumreihenfolge. */
export const STEP_IDS = Object.freeze(STEPS.map((s) => s.id));

/** Antwortschlüssel je Frage-id. @type {Readonly<Record<string, string>>} */
export const ANSWER_KEYS = Object.freeze(Object.fromEntries(STEPS.map((s) => [s.id, s.key])));

/** Alle Antwortmöglichkeiten aller Fragen, ohne Doppelte. */
export const ALL_OPTIONS = Object.freeze([...new Set(STEPS.flatMap((s) => s.options))]);

/** Ergebnisschlüssel → empfohlener Versuchsplan (`none`: keiner). @type {Readonly<Record<string, string|null>>} */
export const RESULT_DESIGN = Object.freeze({
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
});

const RESULT_PREFIX = 'result:';

/** Die Schritte, auf denen eine Empfehlung steht (`result:<schlüssel>`). */
export const RESULT_STEPS = Object.freeze(Object.keys(RESULT_DESIGN).map((k) => `${RESULT_PREFIX}${k}`));

/** Der erste Schritt. */
export const FIRST_STEP = 'phase';

/**
 * Der nächste Schritt nach der Antwort auf `stepId`: eine Frage-id oder
 * `result:<schlüssel>`.
 * @param {string} stepId die beantwortete Frage
 * @param {Readonly<Record<string, string>>} a die Antworten einschließlich der neuen
 * @returns {string}
 */
export function nextOf(stepId, a) {
  switch (stepId) {
    case 'phase':
      if (a.phase === 'define-measure') return 'result:none';
      if (a.phase === 'control') return 'result:evop';
      return 'goal';
    case 'goal':
      if (a.goal === 'mixture') return 'result:mixture';
      if (a.goal === 'robustness') return 'robustness-type';
      if (a.goal === 'screening') return 'screening-curvature';
      if (a.goal === 'interactions') return 'factor-count';
      return 'limits';
    case 'screening-curvature':
      if (a.screeningCurvature === 'many-factors') return 'result:plackett-burman';
      if (a.screeningCurvature === 'yes') return 'result:dsd';
      return 'result:fractional';
    case 'factor-count':
      return a.factorCount === 'few' ? 'factor-levels' : 'result:fractional';
    case 'factor-levels':
      return a.factorLevels === 'multi-or-mixed' ? 'result:full-general' : 'result:full';
    case 'robustness-type':
      return a.robustnessType === 'dispersion-only' ? 'result:dispersion' : 'result:taguchi';
    case 'limits':
      return a.limits === 'expandable' ? 'result:ccd-rotatable' : 'corners';
    case 'corners':
      if (a.corners === 'constrained') return 'result:d-optimal';
      if (a.corners === 'forbidden') return 'result:box-behnken';
      return 'result:ccd-face';
    default:
      throw new Error(`unknown step: ${stepId}`);
  }
}

/** @param {string} step @returns {boolean} steht auf `step` eine Empfehlung? */
export const isResultStep = (step) => typeof step === 'string' && step.startsWith(RESULT_PREFIX);

/**
 * Die Antwortmöglichkeiten eines Schritts; leer auf einer Empfehlung.
 * @param {string} step @returns {ReadonlyArray<string>}
 */
export function optionsOf(step) {
  return STEPS.find((s) => s.id === step)?.options ?? [];
}

/**
 * Der empfohlene Versuchsplan eines Schritts; `null` vor einer Empfehlung und
 * bei `result:none`.
 * @param {string} step @returns {string|null}
 */
export function resultDesignIdOf(step) {
  if (!isResultStep(step)) return null;
  return RESULT_DESIGN[step.slice(RESULT_PREFIX.length)] ?? null;
}

/**
 * @typedef {object} WizardState
 * @property {string} currentStep
 * @property {Record<string, string>} answers
 * @property {string[]} history
 */

/**
 * Antwortet auf die offene Frage und rückt vor.
 * @param {WizardState} s @param {string} opt eine Möglichkeit der offenen Frage
 * @returns {WizardState}
 */
export function answered(s, opt) {
  const answers = { ...s.answers, [ANSWER_KEYS[s.currentStep]]: opt };
  return { currentStep: nextOf(s.currentStep, answers), answers, history: [...s.history, s.currentStep] };
}

/**
 * Eine Frage zurück; die Antwort, die weggeführt hat, entfällt.
 * @param {WizardState} s mit mindestens einer beantworteten Frage
 * @returns {WizardState}
 */
export function wentBack(s) {
  const history = s.history.slice(0, -1);
  const prev = s.history[s.history.length - 1];
  const answers = { ...s.answers };
  delete answers[ANSWER_KEYS[prev]];
  return { currentStep: prev, answers, history };
}

/** @returns {WizardState} der frische Berater */
export const freshWizard = () => ({ currentStep: FIRST_STEP, answers: {}, history: [] });

/**
 * Normalform eines gespeicherten Stands: die Spur wird ab der ersten Frage
 * nachgespielt, solange jeder Eintrag der erreichte Schritt ist und eine
 * gültige Antwort hat. `currentStep` ist, wohin dieses Präfix führt,
 * `answers` enthält nur dessen Antworten. Ein stimmiger Stand bleibt gleich.
 * @param {{ currentStep?: unknown, answers?: unknown, history?: unknown }} s
 * @returns {WizardState}
 */
export function normalize(s) {
  const given = s.answers && typeof s.answers === 'object' && !Array.isArray(s.answers)
    ? /** @type {Record<string, unknown>} */ (s.answers) : {};
  const trail = Array.isArray(s.history) ? s.history : [];
  let state = freshWizard();
  for (const id of trail) {
    if (id !== state.currentStep || isResultStep(state.currentStep)) break;
    const opt = given[ANSWER_KEYS[id]];
    if (typeof opt !== 'string' || !optionsOf(id).includes(opt)) break;
    state = answered(state, opt);
  }
  return state;
}

/**
 * Gleichen zwei Stände einander (Schritt, Antworten, Spur)?
 * @param {WizardState} a @param {WizardState} b @returns {boolean}
 */
export function sameWizard(a, b) {
  const ka = Object.keys(a.answers);
  return a.currentStep === b.currentStep
    && a.history.length === b.history.length && a.history.every((h, i) => h === b.history[i])
    && ka.length === Object.keys(b.answers).length && ka.every((k) => a.answers[k] === b.answers[k]);
}
