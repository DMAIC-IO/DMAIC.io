/**
 * Tests for modules/doe-advisor/domain/wizard.js — die Tabellen und alle 15
 * Wege des Baums gleich der Altform (als Literal), Optionen, Empfehlung,
 * die Zustandsfolge und `normalize` samt dem Baum der Migration.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  DESIGN_IDS, PHASE_GUIDE_IDS, CCD_ROW_IDS, STEPS, STEP_IDS, ANSWER_KEYS, ALL_OPTIONS, RESULT_DESIGN,
  RESULT_STEPS, FIRST_STEP, nextOf, isResultStep, optionsOf, resultDesignIdOf, answered, wentBack,
  freshWizard, normalize, sameWizard,
} from '../../../js/modules/doe-advisor/domain/wizard.js';
import { from1_0 } from '../../../js/modules/doe-advisor/domain/migrations.js';

/** Die 15 Wege der Altform: Antworten in Reihenfolge → Endschritt. */
const PATHS = [
  [['define-measure'], 'result:none'],
  [['control'], 'result:evop'],
  [['analyze', 'mixture'], 'result:mixture'],
  [['analyze', 'robustness', 'noise-factors'], 'result:taguchi'],
  [['analyze', 'robustness', 'dispersion-only'], 'result:dispersion'],
  [['analyze', 'screening', 'many-factors'], 'result:plackett-burman'],
  [['analyze', 'screening', 'yes'], 'result:dsd'],
  [['analyze', 'screening', 'no'], 'result:fractional'],
  [['improve', 'interactions', 'many'], 'result:fractional'],
  [['improve', 'interactions', 'few', 'two'], 'result:full'],
  [['improve', 'interactions', 'few', 'multi-or-mixed'], 'result:full-general'],
  [['improve', 'optimization', 'expandable'], 'result:ccd-rotatable'],
  [['improve', 'optimization', 'hard', 'allowed'], 'result:ccd-face'],
  [['improve', 'optimization', 'hard', 'forbidden'], 'result:box-behnken'],
  [['improve', 'optimization', 'hard', 'constrained'], 'result:d-optimal'],
];

/** @param {string[]} opts */
function walk(opts) {
  let s = freshWizard();
  for (const o of opts) s = answered(s, o);
  return s;
}

suite('doe-advisor wizard — Tabellen wie die Altform', () => {
  test('Verzeichnis, Phasenleitfaden, CCD-Zeilen', () => {
    assertDeepEqual([...DESIGN_IDS], ['full', 'full-general', 'fractional', 'plackett-burman', 'dsd', 'ccd-rotatable',
      'ccd-face', 'box-behnken', 'taguchi', 'dispersion', 'mixture', 'd-optimal', 'evop']);
    assertDeepEqual([...PHASE_GUIDE_IDS], ['define-measure', 'analyze', 'improve', 'improve-robustness', 'control']);
    assertDeepEqual([...CCD_ROW_IDS], ['alpha', 'alpha-k', 'star-position', 'levels', 'rotatable', 'prediction',
      'range', 'practical', 'quality', 'application']);
  });
  test('Fragen, Antwortschlüssel und Möglichkeiten', () => {
    assertDeepEqual(STEPS.map((s) => [s.id, s.key, [...s.options]]), [
      ['phase', 'phase', ['define-measure', 'analyze', 'improve', 'control']],
      ['goal', 'goal', ['screening', 'interactions', 'optimization', 'robustness', 'mixture']],
      ['screening-curvature', 'screeningCurvature', ['yes', 'no', 'many-factors']],
      ['factor-count', 'factorCount', ['few', 'many']],
      ['factor-levels', 'factorLevels', ['two', 'multi-or-mixed']],
      ['robustness-type', 'robustnessType', ['noise-factors', 'dispersion-only']],
      ['limits', 'limits', ['expandable', 'hard']],
      ['corners', 'corners', ['allowed', 'forbidden', 'constrained']],
    ]);
    assertDeepEqual([...STEP_IDS], STEPS.map((s) => s.id));
    assertEqual(ANSWER_KEYS['screening-curvature'], 'screeningCurvature');
    assertEqual(ALL_OPTIONS.length, 23);
    assertEqual(FIRST_STEP, 'phase');
  });
  test('Empfehlungen: 14 Schlüssel, none ohne Versuchsplan', () => {
    assertEqual(RESULT_STEPS.length, 14);
    assertEqual(RESULT_DESIGN.none, null);
    for (const [k, v] of Object.entries(RESULT_DESIGN)) if (k !== 'none') assertEqual(v, k);
    for (const k of Object.keys(RESULT_DESIGN)) if (k !== 'none') assertTrue(DESIGN_IDS.includes(k), k);
  });
});

suite('doe-advisor wizard — Wege', () => {
  for (const [opts, end] of PATHS) {
    test(`${opts.join(' → ')} → ${end}`, () => {
      const s = walk(opts);
      assertEqual(s.currentStep, end);
      assertEqual(s.history.length, opts.length);
      assertEqual(s.history[0], 'phase');
      assertTrue(isResultStep(s.currentStep));
      assertDeepEqual(optionsOf(s.currentStep), []);
      assertDeepEqual(normalize(s), s);
    });
  }
  test('die 15 Wege decken jede Schrittfolge mit ihrer Empfehlung ab', () => {
    const ends = new Set();
    const visit = (s) => {
      if (isResultStep(s.currentStep)) { ends.add(s.history.join('/') + s.currentStep); return; }
      for (const o of optionsOf(s.currentStep)) visit(answered(s, o));
    };
    visit(freshWizard());
    assertEqual(ends.size, PATHS.length);
  });
  test('der Baum der Migration gleicht nextOf (die Wege nutzen alle 23 Möglichkeiten)', () => {
    const used = new Set(PATHS.flatMap(([opts]) => opts));
    assertEqual(used.size, ALL_OPTIONS.length);
    for (const [opts] of PATHS) {
      const s = walk(opts);
      assertDeepEqual(from1_0({ tab: 'wizard', ...s }), { tab: 'wizard', ...s }, opts.join('/'));
    }
  });
  test('nextOf kennt keinen fremden Schritt', () => {
    let err = null;
    try { nextOf('result:none', {}); } catch (e) { err = e; }
    assertTrue(err instanceof Error);
  });
});

suite('doe-advisor wizard — Empfehlung und Zustandsfolge', () => {
  test('resultDesignIdOf', () => {
    assertEqual(resultDesignIdOf('result:box-behnken'), 'box-behnken');
    assertEqual(resultDesignIdOf('result:none'), null);
    assertEqual(resultDesignIdOf('goal'), null);
    assertEqual(resultDesignIdOf('result:quatsch'), null);
  });
  test('zurück verwirft die Antwort, die weggeführt hat', () => {
    const s = wentBack(walk(['improve', 'optimization', 'hard']));
    assertDeepEqual(s, { currentStep: 'limits', answers: { phase: 'improve', goal: 'optimization' }, history: ['phase', 'goal'] });
  });
  test('sameWizard vergleicht Schritt, Antworten und Spur', () => {
    assertTrue(sameWizard(freshWizard(), freshWizard()));
    assertTrue(!sameWizard(freshWizard(), walk(['improve'])));
    assertTrue(!sameWizard({ ...freshWizard(), answers: { phase: 'improve' } }, freshWizard()));
  });
});

suite('doe-advisor wizard — normalize', () => {
  test('stimmiger Stand bleibt', () => {
    const s = walk(['improve', 'optimization', 'hard']);
    assertDeepEqual(normalize(s), s);
  });
  test('Spur führt woanders hin: Schritt folgt der Spur', () => {
    const s = walk(['improve', 'optimization']);
    assertDeepEqual(normalize({ ...s, currentStep: 'corners' }), s);
  });
  test('ungültige Antwort kürzt die Spur davor', () => {
    const n = normalize({ currentStep: 'corners', answers: { phase: 'improve', goal: 'quatsch', limits: 'hard' }, history: ['phase', 'goal', 'limits'] });
    assertDeepEqual(n, { currentStep: 'goal', answers: { phase: 'improve' }, history: ['phase'] });
  });
  test('Antworten ohne Spur entfallen', () => {
    assertDeepEqual(normalize({ currentStep: 'phase', answers: { phase: 'improve' }, history: [] }), freshWizard());
  });
  test('Spur über eine Empfehlung hinaus endet dort', () => {
    const n = normalize({ answers: { phase: 'control', goal: 'mixture' }, history: ['phase', 'goal'] });
    assertDeepEqual(n, walk(['control']));
  });
  test('Formfehler: alles ergibt den frischen Berater', () => {
    for (const bad of [{}, { answers: [], history: 'phase' }, { history: [1, 2] }, { answers: null, history: null }]) {
      assertDeepEqual(normalize(bad), freshWizard());
    }
  });
  test('Golden v0.3.0 (intro, Schlüssel mit Bindestrich) endet auf phase', () => {
    assertDeepEqual(normalize({
      currentStep: 'result',
      answers: { 'factor-count': '3', 'interaction-need': 'yes' },
      history: ['intro', 'factor-count', 'interaction-need', 'budget', 'result'],
    }), freshWizard());
  });
});
