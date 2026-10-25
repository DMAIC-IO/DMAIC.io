/**
 * D.Mike — OptimalViewModel (viewmodel/optimal.js)
 * Spec: docs/superpowers/specs/2026-10-25-doe-planner-teil-viewmodels-design.md (E1, E6)
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../test-utils.js';
import { OptimalViewModel } from '../../js/modules/doe-planner/viewmodel/optimal.js';
import { t, fakeContext, attach, plannedState } from './doe-planner-vm-fakes.js';

function setup(ctxOverrides = {}) {
  const ctx = fakeContext(ctxOverrides);
  const model = plannedState();
  model.designType = 'dopt';
  model.options.optimalRuns = 6;
  const vm = new OptimalViewModel({ t, context: ctx, container: () => null });
  const rec = attach(vm, model);
  return { vm, model, rec, ctx };
}

/** A project worksheet "ws-src"/"s-src" with 3 rows in phase improve. */
function withSource(ctx) {
  ctx.store.phases = { improve: [{ moduleId: 'worksheet', instanceId: 'ws-src' }] };
  ctx.modules['ws-src'] = { sheets: [{ id: 's-src', name: 'Messdaten', state: { rowCount: 3, columns: [] } }] };
}

suite('doe-planner-vm optimal — runs', () => {
  test('setOptimalRuns needs at least the minimum', () => {
    const { vm, model, rec } = setup();
    vm.setOptimalRuns(8);
    assertEqual(model.options.optimalRuns, 8);
    assertEqual(rec.saves, 1);
    assertThrows(() => vm.setOptimalRuns(3), /^invalid n\b/);
  });

  test('the UI input clamps to the minimum', () => {
    const { vm, model } = setup();
    vm.optimalRunsChanged({ target: { value: '2' } });
    assertEqual(model.options.optimalRuns, 4);
  });
});

suite('doe-planner-vm optimal — model terms', () => {
  test('setTerm adds a term and raises the runs if needed', () => {
    const { vm, model } = setup();
    model.options.optimalRuns = 4;
    vm.setTerm('Q0', true);
    assertTrue(model.getActiveTerms().includes('Q0'));
    assertEqual(model.options.optimalRuns, 5);
  });

  test('main effects stay; unknown terms are refused', () => {
    const { vm } = setup();
    assertThrows(() => vm.setTerm('M0', false), /main effect/);
    assertThrows(() => vm.setTerm('Q7', true), /^invalid termId\b/);
  });

  test('setTermGroup switches every term of a group', () => {
    const { vm, model } = setup();
    vm.setTermGroup(1, true);
    assertTrue(model.getActiveTerms().includes('Q0') && model.getActiveTerms().includes('Q1'));
    vm.setTermGroup(1, false);
    assertTrue(!model.getActiveTerms().includes('Q0'));
    assertThrows(() => vm.setTermGroup(0, false), /main effects/);
    assertThrows(() => vm.setTermGroup(9, true), /^invalid groupIdx\b/);
  });

  test('toggleTermGroup only folds the view', () => {
    const { vm, rec } = setup();
    const g = vm.termGroups()[0];
    assertEqual(vm.termGroupExpanded(0, g), true);
    vm.toggleTermGroup(0);
    assertEqual(vm.termGroupExpanded(0, g), false);
    assertEqual(rec.saves, 0);
  });
});

suite('doe-planner-vm optimal — forbidden vertices', () => {
  test('a pattern lists one coded level or null per factor', () => {
    const { vm, model } = setup();
    assertEqual(vm.addForbiddenVertex([1, null]), true);
    assertEqual(vm.addForbiddenVertex([1, null]), false);
    assertDeepEqual(model.options.forbiddenVertices, [[1, null]]);
    assertThrows(() => vm.addForbiddenVertex([1]), /one value per factor/);
    assertThrows(() => vm.addForbiddenVertex([0.5, null]), /coded level/);
    assertThrows(() => vm.addForbiddenVertex([null, null]), /at least one/);
  });

  test('removeForbiddenVertex checks the index', () => {
    const { vm, model } = setup();
    vm.addForbiddenVertex([-1, 1]);
    assertThrows(() => vm.removeForbiddenVertex(1), /^invalid index\b/);
    vm.removeForbiddenVertex(0);
    assertDeepEqual(model.options.forbiddenVertices, []);
  });

  test('rule text names factor and level', () => {
    const { vm } = setup();
    assertEqual(vm.forbiddenRuleText([1, null]), 'Temp = 40 ∧ Druck = forbiddenAny');
  });
});

suite('doe-planner-vm optimal — source and augment', () => {
  test('setSourceWorksheet accepts project worksheets only, null clears', () => {
    const { vm, model, ctx } = setup();
    withSource(ctx);
    assertThrows(() => vm.setSourceWorksheet('ws-x', 's-src'), /unknown worksheet/);
    vm.setSourceWorksheet('ws-src', 's-src');
    assertDeepEqual(model.sourceWorksheet, { instanceId: 'ws-src', sheetId: 's-src' });
    assertEqual(vm.sourceWorksheetKey(), 'ws-src::s-src');
    vm.setSourceWorksheet(null);
    assertEqual(model.sourceWorksheet, null);
  });

  test('the UI picker splits its key', () => {
    const { vm, model, ctx } = setup();
    withSource(ctx);
    vm.sourceWorksheetChanged({ target: { value: 'ws-src::s-src' } });
    assertEqual(model.sourceWorksheet.sheetId, 's-src');
    vm.sourceWorksheetChanged({ target: { value: '' } });
    assertEqual(model.sourceWorksheet, null);
  });

  test('augment needs an optimal design with a linked datasheet', () => {
    const { vm, model } = setup();
    assertThrows(() => vm.augment(2), /linked datasheet/);
    model.designType = 'full';
    assertThrows(() => vm.augment(2), /needs an optimal design/);
    assertThrows(() => vm.augment(0), /^invalid n\b/);
  });

  test('clickAugment reports a bad count and errors as a note', () => {
    const container = { querySelector: () => ({ value: 'x' }) };
    const ctx = fakeContext();
    const vm = new OptimalViewModel({ t, context: ctx, container: () => container });
    const model = plannedState();
    model.designType = 'dopt';
    attach(vm, model);
    vm.clickAugment();
    assertEqual(ctx.notes[0].message, 'augmentInvalidCount');
    container.querySelector = () => ({ value: '2' });
    vm.clickAugment();
    assertEqual(ctx.notes[1].type, 'error');
  });
});
