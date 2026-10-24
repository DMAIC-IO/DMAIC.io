/**
 * D.Mike — ResultsViewModel (viewmodel/results.js)
 * Spec: docs/superpowers/specs/2026-10-24-survey-builder-teil-viewmodels-design.md (E1, E2)
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { State } from '../../js/modules/survey-builder/survey-builder-model.js';
import { ResultsViewModel } from '../../js/modules/survey-builder/viewmodel/results.js';
import { t, fakeContext, attach } from './survey-vm-fakes.js';

/** Single question "Kundengruppe" (Handel, Industrie) and two responses. */
function setup() {
  const ctx = fakeContext();
  const vm = new ResultsViewModel({ t, context: ctx, container: () => null });
  const model = new State();
  const sec = model.addSection();
  const q = model.addQuestion(sec, 'single');
  model.updateQuestion(q, 'text', 'Kundengruppe');
  const handel = model.addItem(q, 'options');
  const industrie = model.addItem(q, 'options');
  model.updateItem(q, 'options', handel, 'text', 'Handel');
  model.updateItem(q, 'options', industrie, 'text', 'Industrie');
  for (const [id, opt] of [['r1', handel], ['r2', industrie]]) {
    model.addResponse({ id, surveyVersion: 1, recipientId: null, submittedAt: '2026-10-10T09:00:00Z', answers: { [q]: opt } });
  }
  const rec = attach(vm, model);
  return { ctx, vm, model, rec, q, handel };
}

suite('survey-vm results — lifecycle', () => {
  test('attach watches the results and the tab and subscribes to the theme', () => {
    const { ctx, rec } = setup();
    assertEqual(rec.watches.length, 2);
    assertEqual(ctx.eventBus.handlers.get('theme:changed').length, 1);
  });

  test('detach unsubscribes and drops the charts', () => {
    const { ctx, vm } = setup();
    vm._charts = [{ id: 'c1' }];
    vm.detach();
    assertEqual(ctx.eventBus.handlers.get('theme:changed').length, 0);
    assertDeepEqual(ctx.charts.destroyed, [{ id: 'c1' }]);
    assertEqual(vm._destroyed, true);
  });

  test('re-attach after detach mounts again without duplicate subscriptions', () => {
    const { ctx, vm, model } = setup();
    vm.detach();
    attach(vm, model);
    assertEqual(vm._destroyed, false);
    assertEqual(ctx.eventBus.handlers.get('theme:changed').length, 1);
  });

  test('leaving the results tab invalidates running mounts, entering schedules them', () => {
    const { vm, model, rec } = setup();
    const gen = vm._renderGen;
    vm._onTab('draft');
    assertEqual(vm._renderGen, gen + 1);
    model.ui.tab = 'results';
    const before = rec.ticks.length;
    vm._onTab('results');
    assertEqual(rec.ticks.length, before + 1);
  });
});

suite('survey-vm results — evaluation', () => {
  test('the filter narrows the base', () => {
    const { vm, q, handel } = setup();
    assertEqual(vm.filtered().length, 2);
    vm.setFilterFromEvent({ target: { value: `${q}|${handel}` } });
    assertEqual(vm.filtered().length, 1);
    assertEqual(vm.isFilterValue(`${q}|${handel}`), true);
  });

  test('a choice question yields one block and one bar chart job', () => {
    const { vm, q } = setup();
    assertDeepEqual(vm.blocks().map((b) => b.title), ['Kundengruppe']);
    assertDeepEqual(vm.questionChartJobs().map((j) => [j.key, j.type]), [[`q:${q}`, 'bar']]);
  });
});
