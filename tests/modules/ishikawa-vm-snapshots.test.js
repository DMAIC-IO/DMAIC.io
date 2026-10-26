/**
 * D.Mike — SnapshotsViewModel (viewmodel/snapshots.js)
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../test-utils.js';
import { State } from '../../js/modules/ishikawa/ishikawa-model.js';
import { EVENTS } from '../../js/modules/ishikawa/ishikawa-constants.js';
import { SnapshotsViewModel } from '../../js/modules/ishikawa/viewmodel/snapshots.js';
import { t, fakeContext, fakeContainer, fakeHost, attach } from './ishikawa-vm-fakes.js';

function setup() {
  const ctx = fakeContext();
  const container = fakeContainer({ '[data-ref="trendContent"]': fakeHost() });
  const vm = new SnapshotsViewModel({ t, context: ctx, container: () => container });
  const model = new State();
  const rec = attach(vm, model);
  const heard = [];
  for (const name of Object.values(EVENTS)) rec.events.on(name, (payload) => heard.push({ name, payload }));
  return { ctx, vm, model, rec, heard };
}

/** Lets pending chart promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A model with one rated cause and an expert. */
function rated(model, score) {
  const e = model.experts[0] || model.addExpert('A');
  const r = model.rows[0] || model.addRow(null);
  model.setRating(r.id, e.id, score);
  return r;
}

suite('ishikawa-vm snapshots — save, load, delete', () => {
  test('saveSnapshot returns the id of the newest snapshot, blank names get a dated one', () => {
    const { vm, model } = setup();
    const a = vm.saveSnapshot('  Stand A ');
    const b = vm.saveSnapshot('');
    assertEqual(model.snapshots[0].id, b);
    assertEqual(model.snapshots[1].id, a);
    assertEqual(model.snapshots[1].name, 'Stand A');
    assertTrue(model.snapshots[0].name.startsWith('Snapshot '));
    assertThrows(() => vm.saveSnapshot(5));
  });

  test('submitSnapDraft saves under the draft name and clears it', () => {
    const { vm, model } = setup();
    vm.snapDraft = 'Vorher';
    vm.submitSnapDraft();
    assertEqual(model.snapshots[0].name, 'Vorher');
    assertEqual(vm.snapDraft, '');
  });

  test('loadSnapshot restores the tree and tells the others', () => {
    const { vm, model, heard } = setup();
    rated(model, 3);
    const id = vm.saveSnapshot('A');
    model.addRow(null);
    vm.loadSnapshot(id);
    assertEqual(model.rows.length, 1);
    assertDeepEqual(heard.at(-1), { name: EVENTS.snapshotLoaded, payload: { id } });
    assertThrows(() => vm.loadSnapshot(99));
  });

  test('confirmLoadSnapshot asks first', async () => {
    const { ctx, vm, model } = setup();
    const id = vm.saveSnapshot('A');
    model.addRow(null);
    ctx.confirmAnswer = false;
    await vm.confirmLoadSnapshot(id);
    assertEqual(model.rows.length, 1);
    ctx.confirmAnswer = true;
    await vm.confirmLoadSnapshot(id);
    assertEqual(model.rows.length, 0);
  });

  test('confirmLoadSnapshot is a no-op when the snapshot went while the dialog was open', async () => {
    const { ctx, vm, model } = setup();
    const id = vm.saveSnapshot('A');
    model.addRow(null);
    ctx.dialog.confirm = async () => { vm.deleteSnapshot(id); return true; };
    await vm.confirmLoadSnapshot(id);
    assertEqual(model.rows.length, 1);
  });

  test('deleteSnapshot ends a comparison with it and tells the others', () => {
    const { vm, model, heard } = setup();
    const id = vm.saveSnapshot('A');
    vm.compareSnapshot(id);
    vm.deleteSnapshot(id);
    assertEqual(model.snapshots.length, 0);
    assertEqual(vm.compareSnapId, null);
    assertDeepEqual(heard.slice(-2), [
      { name: EVENTS.snapshotCompared, payload: { id: null } },
      { name: EVENTS.snapshotRemoved, payload: { id } },
    ]);
  });

  test('removeFromList stops the click from reaching the snapshot item', () => {
    const { vm, model } = setup();
    const id = vm.saveSnapshot('A');
    let stopped = false;
    vm.removeFromList(id, { stopPropagation() { stopped = true; } });
    assertTrue(stopped);
    assertEqual(model.snapshots.length, 0);
  });
});

suite('ishikawa-vm snapshots — compare', () => {
  test('compareSnapshot returns a plain diff and tells the others', () => {
    const { vm, model, heard } = setup();
    const r = rated(model, 2);
    const id = vm.saveSnapshot('A');
    rated(model, 8);
    const added = model.addRow(null);
    const diff = vm.compareSnapshot(id);
    assertDeepEqual(diff.added, [added.stableId]);
    assertDeepEqual(diff.removed, []);
    assertDeepEqual(diff.changed, [{ stableId: r.stableId, oldScore: 2, newScore: 8, delta: 6 }]);
    assertEqual(JSON.stringify(diff).includes('{}'), false, 'no Set or Map in the result');
    assertEqual(vm.compareSnapId, id);
    assertDeepEqual(heard.at(-1), { name: EVENTS.snapshotCompared, payload: { id } });
  });

  test('snapClick toggles the comparison, closeCompare ends it', () => {
    const { vm, heard } = setup();
    const id = vm.saveSnapshot('A');
    const target = { closest: () => null };
    vm.snapClick(id, { target });
    assertEqual(vm.compareSnapId, id);
    vm.snapClick(id, { target });
    assertEqual(vm.compareSnapId, null);
    vm.compareSnapshot(id);
    vm.closeCompare();
    assertEqual(vm.compareSnapId, null);
    assertDeepEqual(heard.at(-1), { name: EVENTS.snapshotCompared, payload: { id: null } });
  });

  test('compareLabel names the compared snapshot', () => {
    const { vm } = setup();
    assertEqual(vm.compareLabel(), '');
    vm.compareSnapshot(vm.saveSnapshot('Vorher'));
    assertEqual(vm.compareLabel(), 'vs. „Vorher“');
  });
});

suite('ishikawa-vm snapshots — trend', () => {
  test('with fewer than two states the trend shows its empty state', async () => {
    const { vm } = setup();
    await vm.renderTrend();
    assertEqual(vm.trendEmptyMsg, 'trendMinSnaps');
  });

  test('causes:changed redraws the trend only while it is visible, never after detach', async () => {
    const { ctx, vm, model, rec } = setup();
    rated(model, 4);
    vm.saveSnapshot('A');
    rec.events.emit(EVENTS.causesChanged);
    await settle();
    assertEqual(ctx.charts.created.length, 0);
    vm.trendVisible = true;
    rec.events.emit(EVENTS.causesChanged);
    await settle();
    assertEqual(ctx.charts.created.length, 1);
    assertEqual(ctx.charts.created[0].type, 'trend');
    vm.detach();
    rec.events.emit(EVENTS.causesChanged);
    await settle();
    assertEqual(ctx.charts.created.length, 1);
    assertEqual(ctx.charts.destroyed.length, 1);
  });

  test('a trend chart still being created at detach is destroyed, not kept', async () => {
    const { ctx, vm, model } = setup();
    rated(model, 4);
    vm.saveSnapshot('A');
    const pending = vm.renderTrend();
    vm.detach();
    await pending;
    assertEqual(ctx.charts.created.length, 1);
    assertDeepEqual(ctx.charts.destroyed, ctx.charts.created);
    assertEqual(vm._trendChart, null);
  });
});
