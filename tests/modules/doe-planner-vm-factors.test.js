/**
 * D.Mike — FactorsViewModel (viewmodel/factors.js)
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../test-utils.js';
import { State } from '../../js/modules/doe-planner/doe-planner-model.js';
import { FactorsViewModel } from '../../js/modules/doe-planner/viewmodel/factors.js';
import { t, fakeContext, attach, plannedState } from './doe-planner-vm-fakes.js';

function setup(model = plannedState()) {
  const vm = new FactorsViewModel({ t, context: fakeContext(), container: () => null });
  const rec = attach(vm, model);
  return { vm, model, rec, ids: model.factors.map((f) => f.id) };
}

suite('doe-planner-vm factors — binding', () => {
  test('the model comes with attach(), not with the constructor', () => {
    const vm = new FactorsViewModel({ t, context: fakeContext(), container: () => null });
    assertEqual(vm.model, null);
    const model = new State();
    attach(vm, model);
    assertTrue(vm.model === model);
  });
});

suite('doe-planner-vm factors — factors', () => {
  test('addFactor returns the new id, saves and clears forbidden vertices', () => {
    const { vm, model, rec } = setup();
    model.options.forbiddenVertices = [[1, null]];
    const id = vm.addFactor();
    assertEqual(model.factors[2].id, id);
    assertDeepEqual(model.options.forbiddenVertices, []);
    assertEqual(rec.saves, 1);
  });

  test('removeFactor checks the id', () => {
    const { vm, model, ids } = setup();
    assertThrows(() => vm.removeFactor(99), /^unknown factorId\b/);
    vm.removeFactor(ids[0]);
    assertEqual(model.factors.length, 1);
  });

  test('name and unit are set and saved', () => {
    const { vm, model, rec, ids } = setup();
    vm.setFactorName(ids[0], 'Temperatur');
    vm.setFactorUnit(ids[0], 'K');
    assertEqual(model.factors[0].name, 'Temperatur');
    assertEqual(model.factors[0].unit, 'K');
    assertEqual(rec.saves, 2);
    assertThrows(() => vm.setFactorName(ids[0], 3), /^invalid name\b/);
  });

  test('categorical clears the unit; a categorical factor takes no unit', () => {
    const { vm, model, ids } = setup();
    vm.setFactorKind(ids[0], 'categorical');
    assertEqual(model.factors[0].kind, 'categorical');
    assertEqual(model.factors[0].unit, '');
    assertThrows(() => vm.setFactorUnit(ids[0], 'K'), /categorical/);
    vm.setFactorUnit(ids[0], '');
    assertThrows(() => vm.setFactorKind(ids[0], 'ordinal'), /^invalid kind\b/);
  });

  test('levels: set, insert, remove — at least two stay', () => {
    const { vm, model, ids } = setup();
    vm.setLevel(ids[0], 1, '45');
    assertDeepEqual(model.factors[0].levels, ['20', '45']);
    assertThrows(() => vm.setLevel(ids[0], 2, '50'), /^invalid levelIdx\b/);
    vm.insertLevel(ids[0], 1);
    assertDeepEqual(model.factors[0].levels, ['20', '', '45']);
    vm.removeLevel(ids[0], 1);
    assertDeepEqual(model.factors[0].levels, ['20', '45']);
    assertThrows(() => vm.removeLevel(ids[0], 0), /two levels/);
  });

  test('levels: a number becomes text, a non-number non-text is refused', () => {
    const { vm, model, ids } = setup();
    vm.setLevel(ids[0], 1, 45);
    assertDeepEqual(model.factors[0].levels, ['20', '45']);
    vm.setLevel(ids[0], 1, -2.5);
    assertEqual(model.factors[0].levels[1], '-2.5');
    assertThrows(() => vm.setLevel(ids[0], 1, true), /allowed: any string or finite number, "" clears it$/);
    assertThrows(() => vm.setLevel(ids[0], 1, NaN), /any string or finite number/);
    assertEqual(model.factors[0].levels[1], '-2.5');
  });
});

suite('doe-planner-vm factors — responses', () => {
  test('add returns the index; name and unit are set', () => {
    const { vm, model } = setup();
    const idx = vm.addResponse();
    assertEqual(idx, 1);
    vm.setResponseName(1, 'Härte');
    vm.setResponseUnit(1, 'HV');
    assertDeepEqual(model.responses[1], { name: 'Härte', unit: 'HV' });
    assertThrows(() => vm.setResponseName(5, 'x'), /^invalid index\b/);
  });

  test('remove keeps at least one response', () => {
    const { vm, model } = setup();
    assertThrows(() => vm.removeResponse(0), /at least one response/);
    vm.addResponse();
    vm.removeResponse(0);
    assertEqual(model.responses.length, 1);
  });
});

suite('doe-planner-vm factors — view helpers', () => {
  test('letters, kind, duplicate marker', () => {
    const { vm, model } = setup();
    assertEqual(vm.factorLetter(2), 'C');
    assertEqual(vm.responseLetter(0), 'Y1');
    assertEqual(vm.factorKind(model.factors[0]), 'continuous');
    assertEqual(vm.factorNameClass(model.factors[0]), '');
    model.factors[1].name = 'temp';
    assertEqual(vm.factorNameClass(model.factors[0]), 'field--error');
    assertEqual(vm.factorNameTitle(model.factors[0]), 'duplicateFactorError');
    assertEqual(vm.levelPlaceholder(model.factors[0]), '…');
  });
});
