/**
 * D.Mike — design registry and type-independent checks (designs/index.js)
 * Spec: docs/superpowers/specs/2026-10-25-doe-planner-teil-viewmodels-design.md (E2, E7)
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { DESIGNS, DESIGN_KEYS, designOf, checkConfig, plannedRuns } from '../../../js/modules/doe-planner/designs/index.js';
import optimal from '../../../js/modules/doe-planner/designs/optimal.js';
import { stateWith, NO_SOURCE } from './state.js';

suite('doe-planner designs — registry', () => {
  test('keys in UI order, optimal shared by three criteria', () => {
    assertDeepEqual([...DESIGN_KEYS], ['full', 'frac', 'pb', 'ccd', 'bb', 'taguchi', 'dopt', 'aopt', 'gopt']);
    assertTrue(DESIGNS.dopt === optimal && DESIGNS.aopt === optimal && DESIGNS.gopt === optimal);
  });

  test('designOf: the type module, null for an unknown or empty type', () => {
    assertEqual(designOf(stateWith({ designType: 'ccd' })).id, 'ccd');
    assertEqual(designOf(stateWith({ designType: '' })), null);
    assertEqual(designOf(stateWith({ designType: 'evop' })), null);
  });
});

suite('doe-planner designs — checkConfig', () => {
  test('valid minimal full factorial', () => {
    assertDeepEqual(checkConfig(stateWith(), NO_SOURCE), { ok: true, reason: null });
  });

  test('type-independent reasons, in order', () => {
    assertEqual(checkConfig(stateWith({ factors: [['A', ['1', '2']]] }), NO_SOURCE).reason, 'tooFewFactors');
    assertEqual(checkConfig(stateWith({ factors: [['A', ['1', '2']], ['a', ['1', '2']]] }), NO_SOURCE).reason, 'duplicateFactorNames');
    assertEqual(checkConfig(stateWith({ factors: [['A', ['1', '2']], ['', ['1', '2']]] }), NO_SOURCE).reason, 'incompleteFactor');
    assertEqual(checkConfig(stateWith({ factors: [['A', ['1', '2']], ['B', ['', '2']]] }), NO_SOURCE).reason, 'incompleteFactor');
    assertEqual(checkConfig(stateWith({ responses: [] }), NO_SOURCE).reason, 'noResponse');
    assertEqual(checkConfig(stateWith({ responses: [''] }), NO_SOURCE).reason, 'unnamedResponse');
    assertEqual(checkConfig(stateWith({ designType: '' }), NO_SOURCE).reason, 'noDesignType');
  });

  test('then the type decides', () => {
    assertEqual(checkConfig(stateWith({ designType: 'frac' }), NO_SOURCE).reason, 'noResolution');
  });
});

suite('doe-planner designs — plannedRuns', () => {
  test('runs of the type times replicates; null without a number', () => {
    const s = stateWith({ designType: 'full' });
    assertEqual(plannedRuns(s), 4);
    s.options.replicates = 3;
    assertEqual(plannedRuns(s), 12);
    s.designType = 'frac';
    assertEqual(plannedRuns(s), null);
    s.designType = '';
    assertEqual(plannedRuns(s), null);
  });
});
