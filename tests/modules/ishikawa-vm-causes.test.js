/**
 * D.Mike — CausesViewModel (viewmodel/causes.js)
 * Spec: docs/superpowers/specs/2026-10-25-ishikawa-agent-release-design.md (E2, E3, E5)
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../test-utils.js';
import { State } from '../../js/modules/ishikawa/ishikawa-model.js';
import { CATS, STATUS_KEYS, EVENTS } from '../../js/modules/ishikawa/ishikawa-constants.js';
import { CausesViewModel, causesCsv } from '../../js/modules/ishikawa/viewmodel/causes.js';
import { t, fakeContext, fakeContainer, fakeHost, attach } from './ishikawa-vm-fakes.js';

function setup(refs = {}) {
  const ctx = fakeContext();
  const container = fakeContainer({ '[data-ref="paretoContent"]': fakeHost() });
  const vm = new CausesViewModel({ t, context: ctx, container: () => container });
  const model = new State();
  const rec = attach(vm, model, { refs });
  let changed = 0;
  rec.events.on(EVENTS.causesChanged, () => { changed += 1; });
  return { ctx, vm, model, rec, changed: () => changed };
}

suite('ishikawa-vm causes — experts', () => {
  test('addExpert returns the id, rejects duplicates and blanks, and tells the others', () => {
    const { vm, model, changed } = setup();
    const id = vm.addExpert(' A. Muster ');
    assertEqual(model.experts[0].id, id);
    assertEqual(model.experts[0].name, 'A. Muster');
    assertEqual(changed(), 1);
    assertThrows(() => vm.addExpert('a. muster'));
    assertThrows(() => vm.addExpert('  '));
    assertThrows(() => vm.addExpert(3));
  });

  test('submitExpertDraft adds from the draft, a duplicate only notifies', () => {
    const { ctx, vm, model } = setup();
    vm.expertDraft = 'B';
    vm.submitExpertDraft();
    assertEqual(vm.expertDraft, '');
    vm.expertDraft = 'b';
    vm.submitExpertDraft();
    assertEqual(model.experts.length, 1);
    assertEqual(ctx.notes[0].message, 'expertDuplicate');
    assertEqual(vm.expertDraft, 'b');
  });

  test('renameExpert renames, rejects duplicates and unknown ids', () => {
    const { vm, model } = setup();
    const a = vm.addExpert('A');
    vm.addExpert('B');
    vm.renameExpert(a, 'C');
    assertEqual(model.experts[0].name, 'C');
    assertThrows(() => vm.renameExpert(a, 'b'));
    assertThrows(() => vm.renameExpert(99, 'D'));
    assertThrows(() => vm.renameExpert(a, ''));
  });

  test('commitExpertRename restores the input on a duplicate', () => {
    const { ctx, vm, model } = setup();
    const a = vm.addExpert('A');
    vm.addExpert('B');
    const target = { value: 'b', focus() {}, select() {} };
    vm.commitExpertRename(a, { target });
    assertEqual(model.experts[0].name, 'A');
    assertEqual(target.value, 'A');
    assertEqual(ctx.notes.at(-1).message, 'expertDuplicate');
  });

  test('removeExpert drops the expert and their ratings', () => {
    const { vm, model } = setup();
    const e = vm.addExpert('A');
    const r = vm.addRow();
    vm.setRating(r, e, 5);
    vm.removeExpert(e);
    assertEqual(model.experts.length, 0);
    assertDeepEqual(model.rows[0].ratings, {});
    assertThrows(() => vm.removeExpert(e));
  });
});

suite('ishikawa-vm causes — rows', () => {
  test('addRow and addSubRow return ids; a parent opens', () => {
    const { vm, model } = setup();
    const p = vm.addRow();
    vm.collapsed[p] = true;
    const c = vm.addSubRow(p);
    assertEqual(model.rows.find((r) => r.id === c).parentId, p);
    assertEqual(vm.collapsed[p], false);
    assertThrows(() => vm.addSubRow(99));
  });

  test('setRowField checks every key; only main causes carry a category', () => {
    const { vm, model } = setup();
    const p = vm.addRow();
    const c = vm.addSubRow(p);
    vm.setRowField(p, 'name', 'Fahrer unerfahren');
    vm.setRowField(p, 'description', 'kennt die Stadt nicht');
    for (const cat of CATS) vm.setRowField(p, 'category', cat.key);
    vm.setRowField(p, 'category', '');
    for (const status of STATUS_KEYS) vm.setRowField(p, 'status', status);
    const row = model.rows.find((r) => r.id === p);
    assertEqual(row.name, 'Fahrer unerfahren');
    assertEqual(row.status, STATUS_KEYS.at(-1));
    assertThrows(() => vm.setRowField(c, 'category', 'man'));
    vm.setRowField(c, 'category', '');
    assertThrows(() => vm.setRowField(p, 'category', 'money'));
    assertThrows(() => vm.setRowField(p, 'status', 'maybe'));
    assertThrows(() => vm.setRowField(p, 'ratings', {}));
    assertThrows(() => vm.setRowField(99, 'name', 'x'));
  });

  test('deleteRow removes the subtree without asking; confirmDeleteRow asks', async () => {
    const { ctx, vm, model } = setup();
    const p = vm.addRow();
    const c = vm.addSubRow(p);
    vm.collapsed[c] = true;
    ctx.confirmAnswer = false;
    await vm.confirmDeleteRow(p);
    assertEqual(model.rows.length, 2);
    assertEqual(ctx.confirms[0].message.startsWith('delRowConfirmWithSubs|'), true);
    vm.deleteRow(p);
    assertEqual(model.rows.length, 0);
    assertEqual(vm.collapsed[c], undefined);
  });

  test('confirmDeleteRow is a no-op when the row went while the dialog was open', async () => {
    const { ctx, vm, model } = setup();
    const gone = vm.addRow();
    vm.addRow();
    ctx.dialog.confirm = async () => { vm.deleteRow(gone); return true; };
    await vm.confirmDeleteRow(gone);
    assertEqual(model.rows.length, 1);
  });

  test('duplicateRow copies the subtree with the copy suffix', () => {
    const { vm, model } = setup();
    const p = vm.addRow();
    vm.setRowField(p, 'name', 'Ofen');
    vm.addSubRow(p);
    vm.duplicateRow(p);
    assertEqual(model.rows.length, 4);
    assertTrue(model.rows.some((r) => r.name === 'Ofen (copy)'));
  });

  test('moveRowBefore moves, and refuses a target inside its own subtree', () => {
    const { vm, model } = setup();
    const a = vm.addRow();
    const b = vm.addRow();
    const a1 = vm.addSubRow(a);
    assertEqual(vm.moveRowBefore(b, a), true);
    assertEqual(model.ordered()[0].id, b);
    assertEqual(vm.moveRowBefore(a, a1), false);
    assertThrows(() => vm.moveRowBefore(a, 99));
  });
});

suite('ishikawa-vm causes — ratings', () => {
  test('setRating takes whole numbers 0..9, null clears; it redraws the Pareto', () => {
    const { ctx, vm, model, changed } = setup();
    const e = vm.addExpert('A');
    const r = vm.addRow();
    const before = changed();
    vm.setRating(r, e, 7);
    assertEqual(model.rows[0].ratings[e], 7);
    assertEqual(changed(), before + 1);
    assertEqual(ctx.charts.created.at(-1).type, 'pareto');
    vm.setRating(r, e, null);
    assertEqual(model.rows[0].ratings[e], undefined);
    assertThrows(() => vm.setRating(r, e, 10));
    assertThrows(() => vm.setRating(r, e, 2.5));
    assertThrows(() => vm.setRating(r, 99, 3));
  });

  test('ratingChanged clamps what the input typed and styles the cell', () => {
    const { vm, model } = setup();
    const e = vm.addExpert('A');
    const r = vm.addRow();
    const target = { value: '12', style: { cssText: '' } };
    vm.ratingChanged(r, e, { target });
    assertEqual(model.rows[0].ratings[e], 9);
    assertEqual(target.value, 9);
    assertTrue(target.style.cssText.startsWith('background:'));
  });
});

suite('ishikawa-vm causes — categories, filter, Pareto source', () => {
  test('setCategoryLabels keeps unnamed categories and refuses duplicates', () => {
    const { vm, model } = setup();
    vm.setCategoryLabels({ man: ' Personal ' });
    assertEqual(model.catLabels.man, 'Personal');
    assertEqual(vm.catLabel('man'), 'Personal');
    assertEqual(vm.catLabel('machine'), 'cat.machine');
    assertThrows(() => vm.setCategoryLabels({ machine: 'personal' }));
    assertThrows(() => vm.setCategoryLabels({ money: 'Geld' }));
    assertThrows(() => vm.setCategoryLabels(['x']));
  });

  test('openCatRename lends the form; a duplicate keeps it open', () => {
    const form = { id: 'rename' };
    const { ctx, vm, model } = setup({ catRenameForm: form });
    vm.openCatRename();
    assertEqual(vm.catRenameDraft.length, 6);
    assertTrue(ctx.forms[0].content === form);
    vm.catRenameDraft[0].name = 'X';
    vm.catRenameDraft[1].name = 'x';
    assertEqual(ctx.forms[0].onConfirm(), false);
    assertEqual(ctx.notes.at(-1).message, 'renameCatsDuplicate');
    vm.catRenameDraft[1].name = 'Anlage';
    ctx.forms[0].onConfirm();
    assertEqual(model.catLabels.machine, 'Anlage');
  });

  test('setFilter narrows the visible rows', () => {
    const { vm } = setup();
    const a = vm.addRow();
    vm.setRowField(a, 'category', 'man');
    vm.addRow();
    vm.setFilter('man');
    assertDeepEqual(vm.visibleRows().map((v) => v.row.id), [a]);
    vm.setFilter('all');
    assertEqual(vm.visibleRows().length, 2);
    assertThrows(() => vm.setFilter('money'));
  });

  test('collapsed parents hide their children', () => {
    const { vm } = setup();
    const p = vm.addRow();
    vm.addSubRow(p);
    vm.toggleRow(p);
    assertEqual(vm.visibleRows().length, 1);
    vm.expandAll();
    assertEqual(vm.visibleRows().length, 2);
    vm.collapseAll();
    assertEqual(vm.visibleRows().length, 1);
  });

  test('setParetoSource takes a snapshot id or null', () => {
    const { vm, model } = setup();
    model.saveSnapshot('A');
    const id = model.snapshots[0].id;
    vm.setParetoSource(id);
    assertEqual(vm.paretoSource, `snap-${id}`);
    vm.setParetoSource(null);
    assertEqual(vm.paretoSource, 'current');
    assertThrows(() => vm.setParetoSource(99));
  });
});

suite('ishikawa-vm causes — bus', () => {
  test('follows comparisons, deletions and loads of snapshots', () => {
    const { vm, model, rec } = setup();
    const r = vm.addRow();
    model.saveSnapshot('A');
    const id = model.snapshots[0].id;
    vm.addRow();
    rec.events.emit(EVENTS.snapshotCompared, { id });
    assertEqual(vm.compareSnapId, id);
    const added = vm.visibleRows().find((v) => v.row.id !== r);
    assertTrue(vm.rowClass(added).includes('ishikawa__diff-new'));
    vm.paretoSource = `snap-${id}`;
    rec.events.emit(EVENTS.snapshotRemoved, { id });
    assertEqual(vm.paretoSource, 'current');
    vm.collapsed[r] = true;
    rec.events.emit(EVENTS.snapshotLoaded, { id });
    assertDeepEqual(vm.collapsed, {});
  });

  test('a Pareto chart still being created at detach is destroyed, not kept', async () => {
    const { ctx, vm, model } = setup();
    const e = model.addExpert('A');
    const r = model.addRow(null);
    model.setRating(r.id, e.id, 5);
    const pending = vm.renderPareto();
    vm.detach();
    await pending;
    assertEqual(ctx.charts.created.length, 1);
    assertDeepEqual(ctx.charts.destroyed, ctx.charts.created);
    assertEqual(vm._paretoChart, null);
  });

  test('after detach the bus no longer reaches it', () => {
    const { vm, rec } = setup();
    vm.detach();
    rec.events.emit(EVENTS.snapshotCompared, { id: 5 });
    assertEqual(vm.compareSnapId, null);
  });
});

suite('ishikawa-vm causes — summary and CSV', () => {
  test('summary numbers and linked experiments', () => {
    const { vm, model } = setup();
    const e = vm.addExpert('A');
    const p = vm.addRow();
    vm.addSubRow(p);
    vm.setRating(p, e, 6);
    vm.setRowField(p, 'status', 'confirmed');
    model.addExperiment().hypothesisIds = [model.rows[0].stableId];
    assertEqual(vm.summaryBreakdown(), '(1 main · 1 sub)');
    assertEqual(vm.topScore(), '6.0');
    assertEqual(vm.confirmedCount(), 1);
    assertEqual(vm.linkedExpCount(model.rows[0]), 1);
    assertEqual(vm.linkExpTitle(model.rows[0]), 'linkedExperimentsTooltip|{"count":1}');
  });

  test('causesCsv writes problem, tree with ratings and facts', () => {
    const model = new State();
    model.problem = 'Lieferzeit "zu" lang';
    const e = model.addExpert('A');
    const r = model.addRow(null);
    r.name = 'Ofen';
    r.category = 'machine';
    model.setRating(r.id, e.id, 4);
    model.addFact().name = 'Stau';
    const csv = causesCsv(model, t);
    assertTrue(csv.startsWith('﻿"problemStatement","Lieferzeit ""zu"" lang"'));
    assertTrue(csv.includes('"1","main","cat.machine","cat.machine","Ofen",""'));
    assertTrue(csv.includes(',"4","4.0","status.open"'));
    assertTrue(csv.includes('"tabFacts"'));
    assertTrue(csv.includes('"1","Stau"'));
  });
});
