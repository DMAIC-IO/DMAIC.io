/**
 * DoE Planner: view part "runs" (viewmodel/runs.js) in the browser — the
 * preview through the datagrid widget (cells, paste, the row menu of an
 * optimal design, new rows without a second mount), the bound datasheet
 * with its fill state read through `ctx.data`, the stale banner and the
 * buttons that start the runs and open the sheet afterwards.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { setFields } from '../../../js/core/model.js';
import { State } from '../../../js/modules/doe-planner/domain/model.js';
import {
  mount, ready, bound, plan, threeFactors, designed, settle, typeIn, outputBadges, de, DATASHEET,
} from './view-harness.js';

const td = (root, r, c) => root.querySelector(`.doe__preview-grid td[data-row-idx="${r}"][data-col-idx="${c}"]`);
const rowsOf = (root) => root.querySelectorAll('.doe__preview-grid tbody tr').length;

/** Edit a cell by double click and leave it. */
async function edit(root, r, c, raw) {
  td(root, r, c).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  const input = root.querySelector('.doe__preview-grid input.cell-editor');
  assert(input !== null, 'editor open');
  input.value = raw;
  input.blur();
  await settle();
}

/** Opens the row menu of a cell and returns its entries; the menu is closed again. */
function menuOf(root, r, c) {
  td(root, r, c).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  const items = [...document.querySelectorAll('.context-menu .context-menu__item')];
  return { items, close: () => document.querySelectorAll('.context-menu').forEach((m) => m.remove()) };
}

const optimalPlan = (over = {}) => plan({
  designType: 'dopt',
  factors: threeFactors(),
  options: { ...new State().options, optimalRuns: 8 },
  ...over,
});

suite('doe-planner runs: preview', () => {
  test('the preview shows the design; a cell change becomes a preview edit', async () => {
    const h = await ready(plan());
    const vm = h.vm();
    assertEqual(rowsOf(h.container), 4);
    assertDeepEqual(vm.previewGrid.columns.map((c) => c.key), ['run', 'std', 'block', 'rep', 'f:1', 'f:2', 'r:0']);
    assertEqual(vm.previewGrid.columns[0].lock, 'hard');
    assertEqual(vm.previewGrid.columns[6].lock, null);
    // Response column: a result typed before the datasheet exists.
    await edit(h.container, 1, 6, '12,5');
    assertDeepEqual(h.calls('setPreviewCell').at(-1), { row: 1, column: 'r:0', value: 12.5 });
    assertEqual(vm.model.previewEdits.responses[0][1], 12.5);
    assertEqual(td(h.container, 1, 6).textContent, '12,5000');
    assertEqual(h.$$('.doe__preview-stale-note').length, 0, 'a response value changes no setting');
    // Factor column: a setting moved by hand; the note says the evaluation is for the plan as made.
    await edit(h.container, 0, 4, '25');
    assertEqual(vm.model.previewEdits.factors[0][0], 25);
    assertEqual(h.$('.doe__preview-stale-note').textContent, de('previewStaleNote'));
  });

  test('the selected cell stays selected after a change', async () => {
    const h = await ready(plan());
    td(h.container, 2, 6).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await edit(h.container, 2, 6, '7');
    assertEqual(h.vm().model.previewEdits.responses[0][2], 7);
    assert(td(h.container, 2, 6).classList.contains('cell-active'), 'the cell is still the active one');
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

  test('paste: a block goes out as one command; over a categorical column nothing changes', async () => {
    const factors = [
      { id: 1, name: 'Mat', unit: '', kind: 'categorical', levels: ['Alu', 'Stahl'] },
      { id: 2, name: 'Druck', unit: 'bar', kind: 'continuous', levels: ['1', '5'] },
    ];
    const h = await ready(plan({ factors }));
    const paste = async (r, c, text) => {
      td(h.container, r, c).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      document.activeElement?.blur?.();
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await settle();
    };
    await paste(0, 5, '3\t9\n4\t');
    assertDeepEqual(h.calls('setPreviewCells').at(-1), { row: 0, column: 'f:2', values: [[3, 9], [4, null]] });
    const edits = h.vm().model.previewEdits;
    assertDeepEqual([edits.factors[1][0], edits.factors[1][1], edits.responses[0][0]], [3, 4, 9]);
    // The levels of a categorical factor come from the design, as before: the grid refuses the paste.
    await paste(2, 4, 'Holz\t7');
    assertEqual(h.calls('setPreviewCells').length, 1);
    assertEqual(h.vm().model.previewEdits.factors[1][2], null);
    assertEqual(td(h.container, 2, 4).textContent, h.vm().model.design.actualMatrix[2][0]);
  });

  test('the row menu "forbid" only for an optimal design', async () => {
    const full = await ready(plan());
    const none = menuOf(full.container, 0, 4);
    assertEqual(none.items.filter((x) => x.textContent === 'modules.doe-planner.forbiddenContextAction').length, 0);
    none.close();
    assertDeepEqual(full.vm().previewGrid.contextMenu, []);

    const h = await ready(optimalPlan());
    assertDeepEqual(h.vm().previewGrid.contextMenu, [{ id: 'forbidRun', labelKey: 'forbiddenContextAction' }]);
    const coded = [...h.vm().model.design.codedMatrix[1]];
    const menu = menuOf(h.container, 1, 4);
    const item = menu.items.find((x) => x.textContent === 'modules.doe-planner.forbiddenContextAction');
    assert(item !== undefined, 'menu entry with the module text');
    item.click();
    await settle();
    menu.close();
    assertDeepEqual(h.calls('forbidRun').at(-1), { row: 1 });
    assertDeepEqual(h.vm().model.options.forbiddenVertices.map((p) => [...p]), [coded]);
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

  test('extend an optimal design: runs from the UI state', async () => {
    const b = bound(optimalPlan());
    const h = await mount(b.model, b.worksheets);
    await h.done();
    assertEqual(h.vm().staleness, 'bound');
    const field = h.$('.doe__augment-runs-input');
    assertEqual(field.value, '4');
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
