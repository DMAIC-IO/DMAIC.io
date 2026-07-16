import { suite, test, assertEqual } from '../test-utils.js';
import {
  State,
  DESIGN_IDS,
  PHASE_GUIDE_IDS,
  CCD_ROW_IDS,
  WIZARD_STEPS,
  RESULT_DESIGN,
} from '../../js/modules/doe-advisor/doe-advisor-model.js';

suite('DoE Advisor Model — Constants', () => {
  test('catalog covers 13 designs', () => {
    assertEqual(DESIGN_IDS.length, 13);
  });
  test('phase guide has 5 rows', () => {
    assertEqual(PHASE_GUIDE_IDS.length, 5);
  });
  test('CCD comparison has 10 rows', () => {
    assertEqual(CCD_ROW_IDS.length, 10);
  });
  test('every WIZARD_STEPS result key resolves in RESULT_DESIGN', () => {
    for (const step of WIZARD_STEPS) {
      for (const opt of step.options) {
        const next = step.next({ ...stubAnswers(step, opt) });
        if (next.startsWith('result:')) {
          const key = next.slice('result:'.length);
          assertEqual(key in RESULT_DESIGN, true, `missing RESULT_DESIGN key: ${key}`);
        }
      }
    }
  });
});

// Helper to build an answers object that drives a step's next() for a given option.
function stubAnswers(step, opt) {
  const KEYS = {
    'phase': 'phase',
    'goal': 'goal',
    'screening-curvature': 'screeningCurvature',
    'factor-count': 'factorCount',
    'factor-levels': 'factorLevels',
    'robustness-type': 'robustnessType',
    'limits': 'limits',
    'corners': 'corners',
  };
  return { [KEYS[step.id]]: opt };
}

suite('DoE Advisor Model — State defaults', () => {
  test('constructor sets defaults', () => {
    const s = new State();
    assertEqual(s.tab, 'overview');
    assertEqual(s.currentStep, 'phase');
    assertEqual(Object.keys(s.answers).length, 0);
    assertEqual(s.history.length, 0);
  });

  test('isResult false on fresh state', () => {
    assertEqual(new State().isResult, false);
  });

  test('currentOptions returns the phase step options by default', () => {
    const s = new State();
    assertEqual(s.currentOptions.length, 4);
    assertEqual(s.currentOptions.includes('define-measure'), true);
  });
});

suite('DoE Advisor Model — Wizard logic', () => {
  test('answerStep advances and records history + answer', () => {
    const s = new State();
    s.answerStep('improve');
    assertEqual(s.currentStep, 'goal');
    assertEqual(s.history.length, 1);
    assertEqual(s.history[0], 'phase');
    assertEqual(s.answers.phase, 'improve');
    assertEqual(s.isResult, false);
  });

  test('define-measure yields a none result', () => {
    const s = new State();
    s.answerStep('define-measure');
    assertEqual(s.currentStep, 'result:none');
    assertEqual(s.isResult, true);
    assertEqual(s.resultKey, 'none');
    assertEqual(s.resultDesignId, null);
  });

  test('control yields evop result', () => {
    const s = new State();
    s.answerStep('control');
    assertEqual(s.isResult, true);
    assertEqual(s.resultDesignId, 'evop');
  });

  // Mirror of the E2E wizard path matrix.
  const paths = [
    { steps: ['analyze', 'mixture'], design: 'mixture' },
    { steps: ['analyze', 'robustness', 'noise-factors'], design: 'taguchi' },
    { steps: ['analyze', 'robustness', 'dispersion-only'], design: 'dispersion' },
    { steps: ['analyze', 'screening', 'many-factors'], design: 'plackett-burman' },
    { steps: ['analyze', 'screening', 'yes'], design: 'dsd' },
    { steps: ['analyze', 'screening', 'no'], design: 'fractional' },
    { steps: ['improve', 'interactions', 'many'], design: 'fractional' },
    { steps: ['improve', 'interactions', 'few', 'two'], design: 'full' },
    { steps: ['improve', 'interactions', 'few', 'multi-or-mixed'], design: 'full-general' },
    { steps: ['improve', 'optimization', 'expandable'], design: 'ccd-rotatable' },
    { steps: ['improve', 'optimization', 'hard', 'allowed'], design: 'ccd-face' },
    { steps: ['improve', 'optimization', 'hard', 'forbidden'], design: 'box-behnken' },
    { steps: ['improve', 'optimization', 'hard', 'constrained'], design: 'd-optimal' },
  ];
  for (const p of paths) {
    test(`path [${p.steps.join(' → ')}] → ${p.design}`, () => {
      const s = new State();
      for (const step of p.steps) s.answerStep(step);
      assertEqual(s.isResult, true);
      assertEqual(s.resultDesignId, p.design);
    });
  }

  test('goBack removes last answer and returns to previous step', () => {
    const s = new State();
    s.answerStep('improve');
    s.answerStep('optimization');
    assertEqual(s.history.length, 2);
    s.goBack();
    assertEqual(s.currentStep, 'goal');
    assertEqual(s.history.length, 1);
    assertEqual(s.answers.goal, undefined);
    assertEqual(s.isResult, false);
  });

  test('goBack from a result returns to the last question', () => {
    const s = new State();
    s.answerStep('control'); // result:evop
    assertEqual(s.isResult, true);
    s.goBack();
    assertEqual(s.currentStep, 'phase');
    assertEqual(s.isResult, false);
    assertEqual(s.history.length, 0);
  });

  test('goBack on empty history is a no-op', () => {
    const s = new State();
    s.goBack();
    assertEqual(s.currentStep, 'phase');
    assertEqual(s.history.length, 0);
  });

  test('resetWizard clears answers, history and step', () => {
    const s = new State();
    s.answerStep('improve');
    s.answerStep('optimization');
    s.resetWizard();
    assertEqual(s.currentStep, 'phase');
    assertEqual(s.history.length, 0);
    assertEqual(Object.keys(s.answers).length, 0);
  });
});

suite('DoE Advisor Model — Serialization', () => {
  test('toJSON returns schema, tab, currentStep, answers, history', () => {
    const s = new State();
    s.tab = 'wizard';
    s.answerStep('improve');
    const json = s.toJSON();
    assertEqual(json._schema.name, 'doe-advisor');
    assertEqual(json._schema.version, '1.0');
    assertEqual(json.tab, 'wizard');
    assertEqual(json.currentStep, 'goal');
    assertEqual(json.answers.phase, 'improve');
    assertEqual(json.history[0], 'phase');
  });

  test('toJSON does not leak internal _schema reference', () => {
    const s = new State();
    const json = s.toJSON();
    json._schema.version = 'hacked';
    assertEqual(s._schema.version, '1.0');
  });

  test('toJSON snapshots answers/history (no shared reference)', () => {
    const s = new State();
    s.answerStep('improve');
    const json = s.toJSON();
    s.answerStep('optimization');
    assertEqual(json.history.length, 1);
    assertEqual(json.answers.goal, undefined);
  });

  test('fromJSON(null) returns default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.tab, 'overview');
    assertEqual(s.currentStep, 'phase');
    assertEqual(s.history.length, 0);
  });

  test('fromJSON(undefined) returns default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.currentStep, 'phase');
  });

  test('fromJSON restores full state', () => {
    const s = State.fromJSON({
      tab: 'ccd',
      currentStep: 'result:evop',
      answers: { phase: 'control' },
      history: ['phase'],
    });
    assertEqual(s.tab, 'ccd');
    assertEqual(s.currentStep, 'result:evop');
    assertEqual(s.answers.phase, 'control');
    assertEqual(s.history[0], 'phase');
    assertEqual(s.resultDesignId, 'evop');
  });

  test('fromJSON sanitises invalid types to defaults', () => {
    const s = State.fromJSON({ tab: 42, currentStep: 99, answers: 'x', history: 'y' });
    assertEqual(s.tab, 'overview');
    assertEqual(s.currentStep, 'phase');
    assertEqual(Object.keys(s.answers).length, 0);
    assertEqual(s.history.length, 0);
  });

  test('round-trip toJSON → fromJSON preserves state', () => {
    const orig = new State();
    orig.tab = 'wizard';
    orig.answerStep('improve');
    orig.answerStep('optimization');
    orig.answerStep('expandable');
    const restored = State.fromJSON(orig.toJSON());
    assertEqual(restored.tab, 'wizard');
    assertEqual(restored.currentStep, orig.currentStep);
    assertEqual(restored.resultDesignId, 'ccd-rotatable');
    assertEqual(restored.history.length, 3);
  });
});

suite('DoE Advisor Model — hasContent', () => {
  test('false on fresh default state', () => {
    assertEqual(new State().hasContent(), false);
  });
  test('true once a tab other than overview is active', () => {
    const s = new State();
    s.tab = 'wizard';
    assertEqual(s.hasContent(), true);
  });
  test('true once the wizard advanced', () => {
    const s = new State();
    s.answerStep('improve');
    assertEqual(s.hasContent(), true);
  });
});
