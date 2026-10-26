/**
 * D.Mike — RunsViewModel (viewmodel/runs.js)
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import { RunsViewModel } from '../../js/modules/doe-planner/viewmodel/runs.js';
import { t, fakeContext, attach, plannedState, withDesign, linkWorksheet } from './doe-planner-vm-fakes.js';

function setup(model = withDesign(plannedState())) {
  const ctx = fakeContext();
  const vm = new RunsViewModel({ t, context: ctx, container: () => null });
  const rec = attach(vm, model);
  return { vm, model, rec, ctx };
}

suite('doe-planner-vm runs — binding', () => {
  test('attach watches the preview signal and mounts on the next tick', () => {
    const { vm, rec } = setup();
    assertEqual(rec.watchers.length, 1);
    assertEqual(rec.ticks.length, 1);
    rec.flush();
    // no container in the fake: the mount tick runs, finds no anchor and leaves no grid behind
    assertEqual(rec.ticks.length, 0);
    assertEqual(vm._previewGrid, null);
  });
});

suite('doe-planner-vm runs — state', () => {
  test('unbound shows the preview; bound hides it', () => {
    const { vm, model, ctx } = setup();
    assertEqual(vm.staleness(), 'unbound');
    assertEqual(vm.showPreview(), true);
    linkWorksheet(ctx, model, [10, null, 11, 20]);
    assertEqual(vm.staleness(), 'bound');
    assertEqual(vm.showPreview(), false);
    assertEqual(vm.boundPct(), 75);
    assertEqual(vm.boundProgressText(), '3 / 4 valuesFilled (75%)');
    assertEqual(vm.boundComplete(), false);
  });
});

suite('doe-planner-vm runs — setRunValue', () => {
  test('writes into the preview and saves', () => {
    const { vm, model, rec } = setup();
    vm.setRunValue(2, 'Yield', 12.5);
    assertDeepEqual(model.previewEdits.responses, [[null, 12.5, null, null]]);
    assertEqual(model.previewDirty, false);
    vm.setRunValue(1, 'Temp', 22);
    assertEqual(model.previewDirty, true);
    assertEqual(rec.saves, 2);
  });

  test('refuses unknown runs, columns, categorical factors and non-numbers', () => {
    const { vm, model } = setup();
    assertThrows(() => vm.setRunValue(9, 'Yield', 1), /^unknown run\b/);
    assertThrows(() => vm.setRunValue(1, 'Härte', 1), /^invalid column\b/);
    assertThrows(() => vm.setRunValue(1, 'Yield', 'viel'), /^invalid value\b/);
    model.factors[1].kind = 'categorical';
    assertThrows(() => vm.setRunValue(1, 'Druck', 3), /categorical/);
  });

  test('a bound datasheet owns the values: the error names worksheet.setCells and the instance', () => {
    const { vm, model, ctx } = setup();
    linkWorksheet(ctx, model, [null, null, null, null]);
    assertThrows(() => vm.setRunValue(1, 'Yield', 3), /worksheet\.setCells.*ws-1/);
  });

  test('a stale datasheet still takes preview values', () => {
    const { vm, model, ctx } = setup();
    linkWorksheet(ctx, model, [null, null, null, null]);
    model.responses[0].unit = '%';
    assertEqual(vm.staleness(), 'stale');
    vm.setRunValue(1, 'Yield', 3);
    assertEqual(model.previewEdits.responses[0][0], 3);
  });

  test('no design, no runs', () => {
    const { vm } = setup(plannedState());
    assertThrows(() => vm.setRunValue(1, 'Yield', 3), /no design/);
  });
});

suite('doe-planner-vm runs — datasheet', () => {
  test('createDatasheet needs a design', () => {
    const { vm } = setup(plannedState());
    assertThrows(() => vm.createDatasheet(), /no design/);
  });

  test('openLinkedWorksheet activates the linked sheet', () => {
    const { vm, model, ctx } = setup();
    linkWorksheet(ctx, model, [null, null, null, null]);
    vm.openLinkedWorksheet();
    assertDeepEqual(ctx.emitted[0], { name: 'module:activated', payload: { instanceId: 'ws-1' } });
  });
});
