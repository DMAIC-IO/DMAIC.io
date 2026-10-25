/**
 * D.Mike — ExperimentsViewModel (viewmodel/experiments.js)
 * Spec: docs/superpowers/specs/2026-10-25-ishikawa-agent-release-design.md (E2, E5)
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../test-utils.js';
import { State } from '../../js/modules/ishikawa/ishikawa-model.js';
import { ExperimentsViewModel } from '../../js/modules/ishikawa/viewmodel/experiments.js';
import { t, fakeContext, fakeContainer, fakeHost, attach } from './ishikawa-vm-fakes.js';

function setup(refs = {}) {
  const ctx = fakeContext();
  const hosts = {
    '[data-ref="ganttCanvas"]': fakeHost(),
    '[data-ref="costChartCanvas"]': fakeHost(),
    '[data-ref="costRateChartCanvas"]': fakeHost(),
  };
  const container = fakeContainer(hosts);
  const vm = new ExperimentsViewModel({ t, context: ctx, container: () => container });
  const model = new State();
  const rec = attach(vm, model, { refs });
  return { ctx, vm, model, hosts, rec };
}

suite('ishikawa-vm experiments — experiments', () => {
  test('addExperiment returns the new id and schedules a chart render', () => {
    const { vm, model, rec } = setup();
    const id = vm.addExperiment();
    assertEqual(model.experiments.length, 1);
    assertEqual(model.experiments[0].id, id);
    assertEqual(rec.ticks.length, 1);
  });

  test('setExperimentField writes each key after its check', () => {
    const { vm, model } = setup();
    const id = vm.addExperiment();
    vm.setExperimentField(id, 'title', 'Routenplaner testen');
    vm.setExperimentField(id, 'status', 'running');
    vm.setExperimentField(id, 'startDate', '2026-10-01');
    vm.setExperimentField(id, 'endDate', '');
    vm.setExperimentField(id, 'costMoney', '12.5');
    vm.setExperimentField(id, 'costHours', null);
    const x = model.experiments[0];
    assertEqual(x.title, 'Routenplaner testen');
    assertEqual(x.status, 'running');
    assertEqual(x.startDate, '2026-10-01');
    assertEqual(x.endDate, '');
    assertEqual(x.costMoney, 12.5);
    assertEqual(x.costHours, null);
  });

  test('setExperimentField rejects unknown ids, keys and bad values', () => {
    const { vm } = setup();
    const id = vm.addExperiment();
    assertThrows(() => vm.setExperimentField(99, 'title', 'x'));
    assertThrows(() => vm.setExperimentField(id, 'hypothesisIds', []));
    assertThrows(() => vm.setExperimentField(id, 'status', 'paused'));
    assertThrows(() => vm.setExperimentField(id, 'startDate', '1.10.2026'));
    assertThrows(() => vm.setExperimentField(id, 'costHours', -1));
    assertThrows(() => vm.setExperimentField(id, 'title', 7));
  });

  test('deleteExperiment removes without asking, confirmDeleteExperiment asks', async () => {
    const { ctx, vm, model } = setup();
    const a = vm.addExperiment();
    const b = vm.addExperiment();
    vm.deleteExperiment(a);
    assertDeepEqual(model.experiments.map((x) => x.id), [b]);
    ctx.confirmAnswer = false;
    await vm.confirmDeleteExperiment(b);
    assertEqual(model.experiments.length, 1);
    assertEqual(ctx.confirms[0].message, 'delExperimentConfirm|{"name":"#1"}');
    ctx.confirmAnswer = true;
    await vm.confirmDeleteExperiment(b);
    assertEqual(model.experiments.length, 0);
    assertThrows(() => vm.deleteExperiment(b));
  });

  test('moveExperimentBefore reorders', () => {
    const { vm, model } = setup();
    const a = vm.addExperiment();
    const b = vm.addExperiment();
    vm.moveExperimentBefore(b, a);
    assertDeepEqual(model.experiments.map((x) => x.id), [b, a]);
    assertThrows(() => vm.moveExperimentBefore(b, 99));
  });

  test('setExperimentHypotheses links known causes once, rejects unknown ones', () => {
    const { vm, model } = setup();
    const id = vm.addExperiment();
    const r = model.addRow(null);
    vm.setExperimentHypotheses(id, [r.stableId, r.stableId]);
    assertDeepEqual(model.experiments[0].hypothesisIds, [r.stableId]);
    vm.setExperimentHypotheses(id, []);
    assertDeepEqual(model.experiments[0].hypothesisIds, []);
    assertThrows(() => vm.setExperimentHypotheses(id, ['H-999']));
    assertThrows(() => vm.setExperimentHypotheses(id, 'H-001'));
  });

  test('expCostChanged normalises typed costs like before', () => {
    const { vm, model } = setup();
    vm.addExperiment();
    model.experiments[0].costMoney = '12,5';
    model.experiments[0].costHours = '';
    vm.expCostChanged();
    assertEqual(model.experiments[0].costMoney, 12.5);
    assertEqual(model.experiments[0].costHours, null);
  });

  test('expLinkText counts linked causes', () => {
    const { vm } = setup();
    assertEqual(vm.expLinkText({ hypothesisIds: [] }), 'chooseHypotheses');
    assertEqual(vm.expLinkText({ hypothesisIds: ['H-001', 'H-002'] }), '2 linked');
  });
});

suite('ishikawa-vm experiments — facts', () => {
  test('addFact returns the id; setFactField checks the date', () => {
    const { vm, model } = setup();
    const id = vm.addFact();
    vm.setFactField(id, 'name', 'Stau ab 17 Uhr');
    vm.setFactField(id, 'date', '2026-09-30');
    vm.setFactField(id, 'owner', 'K. Schmidt');
    assertEqual(model.facts[0].name, 'Stau ab 17 Uhr');
    assertEqual(model.facts[0].date, '2026-09-30');
    assertThrows(() => vm.setFactField(id, 'date', 'gestern'));
    assertThrows(() => vm.setFactField(id, 'id', 1));
  });

  test('deleteFact, confirmDeleteFact and moveFactBefore', async () => {
    const { ctx, vm, model } = setup();
    const a = vm.addFact();
    const b = vm.addFact();
    vm.moveFactBefore(b, a);
    assertDeepEqual(model.facts.map((f) => f.id), [b, a]);
    vm.deleteFact(b);
    ctx.confirmAnswer = false;
    await vm.confirmDeleteFact(a);
    assertEqual(model.facts.length, 1);
    ctx.confirmAnswer = true;
    await vm.confirmDeleteFact(a);
    assertEqual(model.facts.length, 0);
  });

  test('ownerNames lists the experts', () => {
    const { vm, model } = setup();
    model.addExpert('A. Muster');
    assertDeepEqual(vm.ownerNames(), ['A. Muster']);
  });
});

suite('ishikawa-vm experiments — link forms', () => {
  test('openHypLink lists causes and saves the checked ones', () => {
    const form = { id: 'hyp-form' };
    const { ctx, vm, model } = setup({ hypLinkForm: form });
    const id = vm.addExperiment();
    const r1 = model.addRow(null);
    r1.category = 'man';
    const r2 = model.addRow(null);
    vm.openHypLink(id);
    assertEqual(vm.hypLinkDraft.items.length, 2);
    assertEqual(vm.hypLinkDraft.items[0].catLabel, 'cat.man');
    assertTrue(ctx.forms[0].content === form);
    vm.hypLinkDraft.items[1].checked = true;
    ctx.forms[0].onConfirm();
    assertDeepEqual(model.experiments[0].hypothesisIds, [r2.stableId]);
  });

  test('openExpLink toggles the cause in each checked experiment', () => {
    const form = { id: 'exp-form' };
    const { ctx, vm, model } = setup({ expLinkForm: form });
    const a = vm.addExperiment();
    vm.addExperiment();
    const r = model.addRow(null);
    vm.openExpLink(r.id);
    assertEqual(vm.expLinkDraft.items.length, 2);
    assertTrue(ctx.forms[0].content === form);
    vm.expLinkDraft.items[0].checked = true;
    ctx.forms[0].onConfirm();
    assertDeepEqual(model.experiments.find((x) => x.id === a).hypothesisIds, [r.stableId]);
  });
});

suite('ishikawa-vm experiments — charts', () => {
  test('without dated experiments the charts show their empty state', async () => {
    const { vm } = setup();
    await vm.renderGantt();
    await vm.renderCostChart('cumulative');
    await vm.renderCostChart('rate');
    assertEqual(vm.ganttEmptyMsg, 'ganttNoData');
    assertEqual(vm.costEmptyMsg, 'costChartNoData');
    assertEqual(vm.costRateEmptyMsg, 'costChartNoData');
  });

  test('a dated experiment draws the Gantt and pins the host height', async () => {
    const { ctx, vm, hosts } = setup();
    const id = vm.addExperiment();
    vm.setExperimentField(id, 'startDate', '2026-10-01');
    vm.setExperimentField(id, 'endDate', '2026-10-05');
    await vm.renderGantt();
    assertEqual(vm.ganttEmptyMsg, '');
    assertEqual(ctx.charts.created[0].type, 'gantt');
    assertTrue(hosts['[data-ref="ganttCanvas"]'].style.height.endsWith('px'));
  });

  test('detach destroys the charts it drew', async () => {
    const { ctx, vm } = setup();
    const id = vm.addExperiment();
    vm.setExperimentField(id, 'startDate', '2026-10-01');
    vm.setExperimentField(id, 'endDate', '2026-10-05');
    vm.setExperimentField(id, 'costMoney', 100);
    await vm.renderGantt();
    await vm.renderCostChart('cumulative');
    vm.detach();
    assertEqual(ctx.charts.destroyed.length, 2);
  });
});
