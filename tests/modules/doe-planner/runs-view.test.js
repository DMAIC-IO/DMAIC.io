/**
 * DoE Planner: view part "runs" (viewmodel/runs.js) in the browser — the
 * preview through the datagrid widget in its table() form (typing, paste,
 * clear, cut, fill and the row menu go out as roles; the viewmodel turns
 * them into setPreviewCell, setPreviewCells and forbidRun), undo through
 * the module history, the bound datasheet with its fill state read through
 * `ctx.source`, the stale banner and the buttons that start the runs and
 * open the sheet afterwards.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { setFields } from '../../../js/core/model.js';
import { TableData } from '../../../js/core/table-data.js';
import { State } from '../../../js/modules/doe-planner/domain/model.js';
import { previewOrEmpty } from '../../../js/modules/doe-planner/viewmodel/runs.js';
import {
  mount, ready, bound, plan, threeFactors, designed, settle, typeIn, outputBadges, de, DATASHEET,
} from './view-harness.js';

const grid = (root) => root.querySelector('.doe__preview-grid');
const td = (root, r, c) => root.querySelector(`.doe__preview-grid td[data-row-idx="${r}"][data-col-idx="${c}"]`);
/** Drawn data rows of the virtualized grid (no spacer, no hidden pool row). */
const rowsOf = (root) => root.querySelectorAll('.doe__preview-grid tbody tr[data-pool]:not([hidden])').length;
const center = (node) => {
  const r = node.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
};
const mouse = (target, type, opts = {}) => target.dispatchEvent(new MouseEvent(type, {
  bubbles: true, cancelable: true, button: 0, ...center(target), ...opts,
}));
const key = (target, k, opts = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));

/** Selects a cell (shift: extends the selection). */
function sel(root, r, c, shift = false) {
  mouse(td(root, r, c), 'mousedown', { shiftKey: shift });
  mouse(td(root, r, c), 'mouseup', { shiftKey: shift });
}

/** Selects a cell, types a value and takes it with Enter. */
async function typeAt(root, r, c, text) {
  // A click on the one active cell clears the selection; after Enter the next cell is already active.
  if (!td(root, r, c).classList.contains('cell-active')) sel(root, r, c);
  key(document.activeElement, text[0]);
  const input = root.querySelector('.doe__preview-grid input.cell-editor');
  assert(input !== null, 'editor opened by typing');
  input.value = text;
  key(input, 'Enter');
  await settle();
}

/** Pastes tab separated text at a cell. */
async function pasteAt(root, r, c, text) {
  sel(root, r, c);
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  await settle();
}

/** Opens the menu of a cell or a header and returns its entries; `close` removes it. */
function menuOf(el) {
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...center(el) }));
  const items = [...document.querySelectorAll('.context-menu .context-menu__item')];
  return { items, close: () => document.querySelectorAll('.context-menu').forEach((m) => m.remove()) };
}

const optimalPlan = (over = {}) => plan({
  designType: 'dopt',
  factors: threeFactors(),
  options: { ...new State().options, optimalRuns: 8 },
  ...over,
});

/** A categorical factor (locked in the preview) before a continuous one. */
const mixedFactors = () => [
  { id: 1, name: 'Mat', unit: '', kind: 'categorical', levels: ['Alu', 'Stahl'] },
  { id: 2, name: 'Druck', unit: 'bar', kind: 'continuous', levels: ['1', '5'] },
];

suite('doe-planner runs: preview', () => {
  test('the preview is a TableData with column heads in model form and the values of the run table', async () => {
    const h = await ready(plan());
    const vm = h.vm();
    const p = vm.previewTable;
    assert(p.table instanceof TableData, 'a TableData');
    assertEqual(p.table.rowCount, 4);
    assertEqual(typeof p.rev, 'number');
    assertDeepEqual(p.columns.map((c) => c.id), ['run', 'std', 'block', 'rep', 'f:1', 'f:2', 'r:0']);
    assertDeepEqual(p.columns[0].meta, { lock: 'hard', reason: 'run-order', managedBy: 'doe-planner' });
    assertDeepEqual(p.columns[4].format, { decimals: 2 });
    assertEqual(p.columns[4].unit, 'C');
    assertEqual(p.columns[6].meta, null);
    // Values, not their text.
    assertEqual(typeof p.table.get(0, 0), 'number');
    assertEqual(typeof p.table.get(4, 0), 'number');
    assertEqual(p.table.get(6, 0), null);
    assertEqual(rowsOf(h.container), 4);
  });

  test('typing 12,5 into the first response cell goes out as setPreviewCell', async () => {
    const h = await ready(plan());
    const vm = h.vm();
    await typeAt(h.container, 0, 6, '12,5');
    assertDeepEqual(h.calls('setPreviewCell').at(-1), { row: 0, column: 'r:0', value: 12.5 });
    assertEqual(vm.model.previewEdits.responses[0][0], 12.5);
    assertEqual(td(h.container, 0, 6).textContent, '12,5000');
    assertEqual(h.$$('.doe__preview-stale-note').length, 0, 'a response value changes no setting');
    // Factor column: a setting moved by hand; the note says the evaluation is for the plan as made.
    await typeAt(h.container, 0, 4, '25');
    assertEqual(vm.model.previewEdits.factors[0][0], 25);
    assertEqual(h.$('.doe__preview-stale-note').textContent, de('previewStaleNote'));
  });

  test('a preview build that throws gives the empty preview, never { error }', () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const p = previewOrEmpty(() => { throw new Error('boom'); }, 7);
      assert(p.table instanceof TableData, 'a TableData');
      assertEqual(p.table.rowCount, 0);
      assertDeepEqual(p.columns, []);
      assertEqual(p.rev, 7);
      assertEqual('error' in p, false);
    } finally {
      console.warn = warn;
    }
  });

  test('previewTable.rev rises when the preview edits change', async () => {
    const h = await ready(plan());
    const before = h.vm().previewTable.rev;
    await typeAt(h.container, 1, 6, '7');
    assert(h.vm().previewTable.rev > before, `rev ${h.vm().previewTable.rev} > ${before}`);
  });

  test('a new design shows its rows without a second mount', async () => {
    const h = await ready(plan());
    const table = h.$('.doe__preview-grid .datagrid__table');
    setFields(h.vm().model, { options: { ...h.vm().model.options, replicates: 2 } });
    await h.done();
    assertEqual(rowsOf(h.container), 8);
    assertEqual(h.$$('.doe__preview-grid .datagrid__table').length, 1);
    assert(h.$('.doe__preview-grid .datagrid__table') === table, 'the same table');
  });

  test('paste: a 2×2 block from f:<id> row 1 goes out as setPreviewCells with numbers', async () => {
    const h = await ready(plan());
    await pasteAt(h.container, 1, 5, '3\t9\n4\t');
    assertDeepEqual(h.calls('setPreviewCells').at(-1), { row: 1, column: 'f:2', values: [[3, 9], [4, null]] });
    const edits = h.vm().model.previewEdits;
    assertDeepEqual([edits.factors[1][1], edits.factors[1][2], edits.responses[0][1]], [3, 4, 9]);
  });

  test('paste: a block past the last row is cut to the rows of the preview', async () => {
    const h = await ready(plan());
    await pasteAt(h.container, 3, 6, '1\n2\n3');
    assertDeepEqual(h.calls('setPreviewCells').at(-1), { row: 3, column: 'r:0', values: [[1]] });
    assertEqual(h.vm().model.previewEdits.responses[0][3], 1);
    assertEqual(h.vm().previewTable.table.rowCount, 4, 'no new row');
  });

  test('paste over a locked and a free column writes the free one and says why', async () => {
    const h = await ready(plan({ factors: mixedFactors() }));
    await pasteAt(h.container, 2, 4, 'Holz\t7');
    assertDeepEqual(h.calls('setPreviewCells'), [{ row: 2, column: 'f:1', values: [[null, 7]] }]);
    assertEqual(td(h.container, 2, 4).textContent, h.vm().model.design.actualMatrix[2][0], 'the locked column stays');
    assertEqual(td(h.container, 2, 5).textContent, '7,00');
    assertEqual(h.notes.at(-1)?.[1], 'warning', 'the lock is reported');
  });

  test('paste over a locked column only changes nothing and says why', async () => {
    const h = await ready(plan({ factors: mixedFactors() }));
    await pasteAt(h.container, 2, 4, 'Holz');
    assertEqual(h.calls('setPreviewCells').length, 0);
    assertEqual(h.vm().model.previewEdits, null);
    assertEqual(td(h.container, 2, 4).textContent, h.vm().model.design.actualMatrix[2][0]);
    assertEqual(h.notes.at(-1)?.[1], 'warning', 'the lock is reported');
  });

  test('clear over a locked and a free column sets only the free one to null', async () => {
    const h = await ready(plan({ factors: mixedFactors() }));
    await typeAt(h.container, 0, 6, '1');
    await typeAt(h.container, 1, 6, '2');
    await typeAt(h.container, 2, 6, '3');
    const level = td(h.container, 0, 4).textContent;
    // Columns 4 (categorical, locked) to 6 (response), rows 0 and 1.
    await h.vm().previewClearRange({ c0: 4, r0: 0, c1: 6, r1: 1 });
    await settle();
    assertDeepEqual(h.calls('setPreviewCells').at(-1), { row: 0, column: 'f:1', values: [[null, null, null], [null, null, null]] });
    const r = h.vm().model.previewEdits.responses[0];
    assertDeepEqual([r[0], r[1], r[2]], [null, null, 3]);
    assertEqual(td(h.container, 0, 4).textContent, level, 'the locked column stays');
    assertEqual(td(h.container, 0, 6).textContent, '');
  });

  test('Delete on a selection clears the edits in the model', async () => {
    const h = await ready(plan());
    await typeAt(h.container, 0, 6, '1');
    await typeAt(h.container, 1, 6, '2');
    await typeAt(h.container, 2, 6, '3');
    sel(h.container, 0, 6); sel(h.container, 1, 6, true);
    key(document.activeElement, 'Delete');
    await settle();
    const r = h.vm().model.previewEdits.responses[0];
    assertDeepEqual([r[0], r[1], r[2]], [null, null, 3]);
    assertEqual(td(h.container, 0, 6).textContent, '');
    assertEqual(td(h.container, 2, 6).textContent, '3,0000');
  });

  test('cut clears the cell in the model', async () => {
    const h = await ready(plan());
    await typeAt(h.container, 1, 6, '4');
    sel(h.container, 1, 6);
    document.activeElement.dispatchEvent(new ClipboardEvent('cut', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true }));
    await settle();
    assertEqual(h.vm().model.previewEdits, null);
    assertEqual(td(h.container, 1, 6).textContent, '');
  });

  test('the fill handle writes the filled cells into the model', async () => {
    const h = await ready(plan());
    await typeAt(h.container, 0, 6, '9');
    sel(h.container, 0, 6);
    mouse(h.$('.doe__preview-grid .datagrid__fill-handle'), 'mousedown');
    mouse(td(h.container, 2, 6), 'mousemove');
    mouse(td(h.container, 2, 6), 'mouseup');
    await settle();
    assertDeepEqual(h.calls('setPreviewCells').at(-1), { row: 1, column: 'r:0', values: [[9], [9]] });
    const r = h.vm().model.previewEdits.responses[0];
    assertDeepEqual([r[0], r[1], r[2], r[3]], [9, 9, 9, null]);
    assertEqual(td(h.container, 2, 6).textContent, '9,0000');
  });

  test('fill sideways from a response into nothing; into a factor writes the factor', async () => {
    const h = await ready(plan());
    await h.vm().previewFillRange({ source: { c0: 4, r0: 0, c1: 4, r1: 1 }, target: { c0: 4, r0: 0, c1: 5, r1: 1 }, ctrl: false });
    await settle();
    const last = h.calls('setPreviewCells').at(-1);
    assertEqual(last.row, 0);
    assertEqual(last.column, 'f:2');
    assertEqual(last.values.length, 2);
    assert(last.values.every((line) => line.length === 1 && typeof line[0] === 'number'), JSON.stringify(last.values));
  });

  test('the row menu "forbid" on row 3 calls forbidRun; only an optimal design has it', async () => {
    const full = await ready(plan());
    assertDeepEqual(full.vm().previewConfig.contextMenu, []);
    const none = menuOf(td(full.container, 0, 4));
    assertEqual(none.items.filter((x) => x.dataset.menuId === 'forbidRun').length, 0);
    none.close();

    const h = await ready(optimalPlan());
    assertDeepEqual(h.vm().previewConfig.contextMenu, [{ id: 'forbidRun', labelKey: 'forbiddenContextAction' }]);
    const coded = [...h.vm().model.design.codedMatrix[3]];
    const menu = menuOf(td(h.container, 3, 4));
    const item = menu.items.find((x) => x.dataset.menuId === 'forbidRun');
    assert(item !== undefined, 'menu entry');
    assertEqual(item.textContent.trim(), 'modules.doe-planner.forbiddenContextAction');
    item.click();
    await settle();
    menu.close();
    assertDeepEqual(h.calls('forbidRun').at(-1), { row: 3 });
    assertDeepEqual(h.vm().model.options.forbiddenVertices.map((p) => [...p]), [coded]);
  });

  test('sort, insert column and delete row are not offered', async () => {
    const h = await ready(plan());
    const head = menuOf(h.$('.doe__preview-grid th[data-col-idx="6"]'));
    const headIds = head.items.map((x) => x.dataset.menuId);
    head.close();
    for (const id of ['sortAsc', 'sortDesc', 'insertColLeft', 'insertColRight', 'deleteColumn']) {
      assert(!headIds.includes(id), `no ${id} in the column menu: ${headIds.join(', ')}`);
    }
    const row = menuOf(h.$('.doe__preview-grid td.datagrid__row-header[data-row-idx="0"]'));
    const rowIds = row.items.map((x) => x.dataset.menuId);
    row.close();
    for (const id of ['insertRowAbove', 'insertRowBelow', 'deleteRow']) {
      assert(!rowIds.includes(id), `no ${id} in the row menu: ${rowIds.join(', ')}`);
    }
    const cell = menuOf(td(h.container, 0, 6));
    const cellIds = cell.items.map((x) => x.dataset.menuId);
    cell.close();
    assert(!cellIds.includes('deleteSelectedRows'), `no row delete in the cell menu: ${cellIds.join(', ')}`);
  });

  test('read only while a new design is pending', async () => {
    const h = await ready(plan());
    const vm = h.vm();
    assertEqual(vm.previewConfig.readOnly, false);
    setFields(vm.model, { options: { ...vm.model.options, replicates: 2 } });
    assertEqual(vm.pending, true);
    assertEqual(vm.previewConfig.readOnly, true);
    await h.done();
    assertEqual(vm.previewConfig.readOnly, false);
  });

  test('undo through the module history takes a preview edit back', async () => {
    const h = await ready(plan());
    await typeAt(h.container, 0, 6, '5');
    assertEqual(h.vm().model.previewEdits.responses[0][0], 5);
    assertEqual(h.module.historyStep('undo'), true);
    await settle();
    assertEqual(h.vm().model.previewEdits, null);
    assertEqual(td(h.container, 0, 6).textContent, '');
    assertEqual(h.module.historyStep('redo'), true);
    await settle();
    assertEqual(h.vm().model.previewEdits.responses[0][0], 5);
    assertEqual(td(h.container, 0, 6).textContent, '5,0000');
  });

  test('undo after a settings change and its automatic design: one step back to both, no new design', async () => {
    const h = await ready(plan());
    const vm = h.vm();
    const reps = vm.model.options.replicates;
    const design = JSON.stringify(vm.model.design);
    setFields(vm.model, { options: { ...vm.model.options, replicates: reps + 1 } });
    await h.done();
    assert(JSON.stringify(vm.model.design) !== design, 'a new design was made');
    assertEqual(h.module.historyStep('undo'), true);
    // Past the pause before generate (600 ms): nothing is made anew.
    await new Promise((r) => setTimeout(r, 800));
    await h.done();
    assertEqual(vm.model.options.replicates, reps);
    assertEqual(JSON.stringify(vm.model.design), design, 'the design as before');
    assertEqual(vm.pending, false);
    assertEqual(h.module.historyCan('undo'), false);
    assertEqual(h.module.historyCan('redo'), true, 'redo stays');
    assertEqual(h.module.historyStep('redo'), true);
    await h.done();
    assertEqual(vm.model.options.replicates, reps + 1);
    assertEqual(vm.pending, false);
  });

  test('without a datasheet: create button and hint; help badges as before', async () => {
    const h = await ready(plan());
    assertEqual(h.$('.doe__datasheet-create-btn').textContent, de('worksheetCreate'));
    assertEqual(h.$('.doe__datasheet-create-hint').textContent, de('worksheetCreateHint'));
    assertEqual(h.$$('.doe__stale-banner').length, 0);
    assertEqual(h.$$('.doe__bound-region').length, 0);
    // Evaluation 6 + 1 + 3, create button 1, preview label and hint 2.
    assertEqual(outputBadges(h.container), 10 + 1 + 2);
  });
});

suite('doe-planner runs: create and open', () => {
  test('create starts the run and opens the new datasheet', async () => {
    const h = await ready(plan());
    const started = h.stubRuns({ createDatasheet: { status: 'done', value: { instanceId: 'ws-new', sheetId: 'sheet_1' } } });
    h.$('.doe__datasheet-create-btn').click();
    await settle();
    assertDeepEqual(started, [['createDatasheet', {}]]);
    assertDeepEqual(h.activated(), ['ws-new']);
  });

  test('a failing run opens nothing and says why', async () => {
    const h = await ready(plan());
    h.$('.doe__datasheet-create-btn').click();
    await h.done();
    assertDeepEqual(h.activated(), []);
    assertDeepEqual(h.notes.at(-1), [de('datasheetFailed'), 'error']);
  });

  test('a stale datasheet: banner, recreate, open the old one', async () => {
    const b = bound(plan());
    const h = await mount(b.model, b.worksheets);
    await h.done();
    const vm = h.vm();
    assertEqual(vm.staleness, 'bound');
    setFields(vm.model, { factors: [vm.model.factors[0], { ...vm.model.factors[1], levels: ['2', '8'] }] });
    await h.done();
    assertEqual(vm.staleness, 'stale');
    assertEqual(h.$('.doe__stale-text').textContent, de('worksheetStaleWarning'));
    assert(rowsOf(h.container) > 0, 'the preview shows while the sheet is stale');
    h.$('.doe__open-old-worksheet-btn').click();
    assertDeepEqual(h.activated(), [DATASHEET]);
    const started = h.stubRuns({ createDatasheet: { status: 'done', value: { instanceId: 'ws-2', sheetId: 'sheet_1' } } });
    h.$('.doe__datasheet-recreate-btn').click();
    await settle();
    assertDeepEqual(started.map(([n]) => n), ['createDatasheet']);
    assertDeepEqual(h.activated(), [DATASHEET, 'ws-2']);
  });
});

suite('doe-planner runs: bound datasheet', () => {
  test('fill state from the sheet; it rises with a cell value, without activation', async () => {
    const b = bound(plan());
    const h = await mount(b.model, b.worksheets);
    await h.done();
    assertEqual(h.vm().staleness, 'bound');
    assertEqual(h.$$('.doe__preview-grid').length, 0, 'no preview while the sheet is current');
    assertEqual(h.$('.doe__results-text').textContent, `0 / 4 ${de('valuesFilled')} (0%)`);
    assertEqual(h.$('.doe__results-bar-fill').getAttribute('style'), 'width:0%');
    h.sheet(DATASHEET).columns[4].values[0] = '2,5';
    h.changed(DATASHEET);
    await settle();
    assertEqual(h.$('.doe__results-text').textContent, `1 / 4 ${de('valuesFilled')} (25%)`);
    assertEqual(h.$('.doe__results-bar-fill').getAttribute('style'), 'width:25%');
    assertEqual(h.events.filter(([n]) => n === 'module:activated').length, 0);
    assertEqual(h.$$('.doe__transfer-regression-btn').length, 0, 'the handover waits for every value');
    h.$('.doe__open-worksheet-btn').click();
    assertDeepEqual(h.activated(), [DATASHEET]);
  });

  test('the datasheet gone, the binding still current: the preview shows read only, no edit goes out', async () => {
    const b = bound(plan());
    const h = await mount(b.model, {});
    await h.done();
    const vm = h.vm();
    assertEqual(vm.staleness, 'none');
    assert(rowsOf(h.container) > 0, 'the preview shows without a sheet');
    assertEqual(vm.previewConfig.readOnly, true);
    assert(grid(h.container).querySelector('.widget-datagrid').classList.contains('dmike--readonly'), 'the grid is read only');
    mouse(td(h.container, 1, 6), 'dblclick');
    await settle();
    assertEqual(h.container.querySelector('.doe__preview-grid input.cell-editor'), null, 'no editor');
    assertEqual(h.calls('setPreviewCell').length, 0);
    assertEqual(vm.model.previewEdits, null);
  });

  test('every value filled: hand over to a regression, then open it', async () => {
    const b = bound(plan({ responses: [{ name: 'Yield', unit: '%' }, { name: 'Kosten', unit: '' }], analysisResponseIdx: 1 }),
      [[1, 2, 3, 4], [5, 6, 7, 8]]);
    const h = await mount(b.model, b.worksheets);
    await h.done();
    assertEqual(h.$('.doe__results-text').textContent, `8 / 8 ${de('valuesFilled')} (100%)`);
    const started = h.stubRuns({ transferToRegression: { status: 'done', value: { instanceId: 'reg-1' } } });
    h.$('.doe__transfer-regression-btn').click();
    await settle();
    assertDeepEqual(started, [['transferToRegression', { response: 1 }]]);
    assertDeepEqual(h.activated(), ['reg-1']);
    // Bound output: fill state, open, handover; evaluation 6 + 1 + 3.
    assertEqual(outputBadges(h.container), 3 + 10);
  });

  test('a renamed response with its carry-over into the sheet: one undo step back to the old name, redo stays', async () => {
    const b = bound(plan());
    const h = await mount(b.model, b.worksheets);
    await h.done();
    const vm = h.vm();
    const stacks = [];
    // The worksheet takes the rename as the real one does.
    h.context.instances.interact = async (stack) => {
      stacks.push(stack);
      for (const a of stack) {
        if (a.method === 'renameColumn') h.sheet(DATASHEET).columns.find((c) => c.id === a.args[0].columnId).name = a.args[0].name;
      }
      return { ok: true, results: stack.map(() => ({})) };
    };
    setFields(vm.model, { responses: [{ name: 'Ausbeute', unit: '%' }] });
    await h.done();
    assertEqual(stacks.length, 1, 'the rename went out');
    assertEqual(vm.model.worksheetRef.snapshot.responses[0].name, 'Ausbeute');
    assertEqual(h.module.historyStep('undo'), true);
    // Past the pause before syncResponses (600 ms): nothing is written anew.
    await new Promise((r) => setTimeout(r, 800));
    await h.done();
    assertEqual(vm.model.responses[0].name, 'Yield', 'the old name is back');
    assertEqual(vm.model.worksheetRef.snapshot.responses[0].name, 'Yield', 'the snapshot with it');
    assertEqual(stacks.length, 1, 'no new carry-over');
    assertEqual(h.module.historyCan('undo'), false);
    assertEqual(h.module.historyCan('redo'), true, 'redo stays');
    assertEqual(h.module.historyStep('redo'), true);
    await new Promise((r) => setTimeout(r, 800));
    await h.done();
    assertEqual(vm.model.responses[0].name, 'Ausbeute');
    assertEqual(vm.model.worksheetRef.snapshot.responses[0].name, 'Ausbeute');
    assertEqual(stacks.length, 1, 'redo writes nothing either');
    assertEqual(h.module.historyCan('redo'), false);
  });

  test('extend an optimal design: runs from the UI state', async () => {
    const b = bound(optimalPlan());
    const h = await mount(b.model, b.worksheets);
    await h.done();
    assertEqual(h.vm().staleness, 'bound');
    const field = h.$('.doe__augment-runs-input');
    assertEqual(field.value, '4');
    const label = h.$('.doe__augment-row label');
    assert(field.id !== '' && label.htmlFor === field.id, 'the label points to the field');
    assertEqual(field.id, 'doe-augment-runs-doe-1');
    typeIn(field, '6');
    await settle();
    assertEqual(h.vm().state.augmentRuns, 6);
    const started = h.stubRuns({});
    h.$('.doe__augment-btn').click();
    await settle();
    assertDeepEqual(started, [['augment', { runs: 6 }]]);
    const full = await mount(bound(plan()).model, bound(plan()).worksheets);
    await full.done();
    assertEqual(full.$$('.doe__augment-section').length, 0, 'only optimal designs grow');
  });

  test('a stored design is shown as it is, without a run', async () => {
    const h = await mount(designed(plan()));
    assertEqual(rowsOf(h.container), 4);
  });
});
