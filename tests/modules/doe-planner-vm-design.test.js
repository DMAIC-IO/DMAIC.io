/**
 * D.Mike — DesignViewModel (viewmodel/design.js)
 * Spec: docs/superpowers/specs/2026-10-25-doe-planner-teil-viewmodels-design.md (E1, E2, E6)
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import { DesignViewModel } from '../../js/modules/doe-planner/viewmodel/design.js';
import { t, fakeContext, attach, plannedState } from './doe-planner-vm-fakes.js';

function setup(model = plannedState()) {
  const vm = new DesignViewModel({ t, context: fakeContext(), container: () => null });
  const rec = attach(vm, model);
  return { vm, model, rec };
}

suite('doe-planner-vm design — type', () => {
  test('selectDesignType resets the type parameters and saves', () => {
    const { vm, model, rec } = setup();
    model.selectedRes = { k: 2, runs: 4, res: 'Full', p: 0 };
    vm.selectDesignType('ccd');
    assertEqual(model.designType, 'ccd');
    assertEqual(model.selectedRes, null);
    assertEqual(rec.saves, 1);
    assertThrows(() => vm.selectDesignType('evop'), /^invalid type\b/);
  });

  test('an optimal type gets a default run count', () => {
    const { vm, model } = setup();
    vm.selectDesignType('dopt');
    assertEqual(model.options.optimalRuns, 6);
  });

  test('two-level-only types are refused for more levels', () => {
    const { vm, model } = setup();
    model.factors[0].levels = ['20', '30', '40'];
    assertEqual(vm.designOptDisabled({ key: 'frac' }), true);
    assertThrows(() => vm.selectDesignType('frac'), /two levels/);
  });

  test('recommendation for two two-level factors is full', () => {
    const { vm, model } = setup();
    model.designType = 'ccd';
    assertEqual(vm.recommendation(), 'full');
    assertEqual(vm.applyRecommendation(), 'full');
    assertEqual(model.designType, 'full');
  });
});

suite('doe-planner-vm design — type parameters', () => {
  test('selectResolution needs frac, k = factor count and a table entry', () => {
    const { vm, model } = setup();
    assertThrows(() => vm.selectResolution(2, 4), /frac/);
    model.designType = 'frac';
    assertThrows(() => vm.selectResolution(3, 8), /factor count/);
    assertThrows(() => vm.selectResolution(2, 8), /no fractional factorial/);
    vm.selectResolution(2, 4);
    assertDeepEqual(model.selectedRes, { k: 2, runs: 4, res: 'Full', p: 0 });
  });

  test('resCellClick ignores cells that are not selectable', () => {
    const { vm, model, rec } = setup();
    model.designType = 'frac';
    vm.resCellClick(3, 8);
    assertEqual(model.selectedRes, null);
    assertEqual(rec.saves, 0);
  });

  test('selectPB checks the row and the type', () => {
    const { vm, model } = setup();
    assertThrows(() => vm.selectPB(0), /belongs to design type pb/);
    model.designType = 'pb';
    assertThrows(() => vm.selectPB(99), /^invalid index\b/);
    vm.selectPB(1);
    assertEqual(model.selectedPBIdx, 1);
  });

  test('selectTaguchi accepts candidates only', () => {
    const { vm, model } = setup();
    model.designType = 'taguchi';
    assertThrows(() => vm.selectTaguchi('L99'), /^invalid name\b/);
    vm.selectTaguchi('L4');
    assertEqual(model.options.taguchiArray, 'L4');
  });
});

suite('doe-planner-vm design — options', () => {
  test('setters write the option and save', () => {
    const { vm, model, rec } = setup();
    vm.setRandomize(false);
    vm.setCenterPoints(true);
    vm.setReplicates(3);
    vm.setAlphaType('face-centered');
    vm.setCcdCenterPoints(5);
    vm.setBbCenterPoints(4);
    assertEqual(model.options.randomize, false);
    assertEqual(model.options.centerPoints, true);
    assertEqual(model.options.replicates, 3);
    assertEqual(model.options.alphaType, 'face-centered');
    assertEqual(model.options.ccdCenterPoints, 5);
    assertEqual(model.options.bbCenterPoints, 4);
    assertEqual(rec.saves, 6);
  });

  test('setters check their argument', () => {
    const { vm } = setup();
    assertThrows(() => vm.setRandomize('yes'), /^invalid on\b/);
    assertThrows(() => vm.setReplicates(11), /^invalid n\b/);
    assertThrows(() => vm.setReplicates(0), /^invalid n\b/);
    assertThrows(() => vm.setAlphaType('cubic'), /^invalid type\b/);
    assertThrows(() => vm.setCcdCenterPoints(0), /^invalid n\b/);
  });

  test('UI handlers clamp like before', () => {
    const { vm, model } = setup();
    vm.replicatesChanged({ target: { value: '25' } });
    assertEqual(model.options.replicates, 10);
    vm.ccdCpChanged({ target: { value: '' } });
    assertEqual(model.options.ccdCenterPoints, 3);
    vm.bbCpChanged({ target: { value: '-2' } });
    assertEqual(model.options.bbCenterPoints, 1);
  });

  test('center points option only for full, frac and pb', () => {
    const { vm, model } = setup();
    assertEqual(vm.showCenterPointsOption(), true);
    model.designType = 'ccd';
    assertEqual(vm.showCenterPointsOption(), false);
  });
});
