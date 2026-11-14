/**
 * DoE Planner: view part "optimal" (viewmodel/optimal.js) in the browser —
 * runs, model terms with folding groups, forbidden combinations drafted in
 * the UI state, the source picker over `ctx.instances` and `ctx.data`, and
 * the help badges of the optimal panel.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/doe-planner/domain/model.js';
import { UiState } from '../../../js/modules/doe-planner/viewmodel/state.js';
import { mount, plan, threeFactors, worksheet, typeIn, pick, settle, inputBadges, de } from './view-harness.js';

const optimalPlan = (over = {}) => plan({
  designType: 'dopt',
  factors: threeFactors(),
  options: { ...new State().options, optimalRuns: 8 },
  ...over,
});

suite('doe-planner optimal: forbidden combinations', () => {
  test('the draft lives in the UI state; the button forbids it and clears the draft', async () => {
    const h = await mount(optimalPlan());
    assertEqual(h.$('.doe__forbidden-empty').textContent, de('forbiddenEmpty'));
    // Help badges as before: design type title, recommendation and the four labels of the panel.
    assertEqual(inputBadges(h.container)['fields.designType'], 2 + 4);
    assertEqual(h.$('.doe__optimal-runs-input').getAttribute('data-help-key'), '');
    const selects = h.$$('.doe__forbidden-input');
    assertEqual(selects.length, 3);
    assertDeepEqual([...selects[0].options].map((o) => o.value), ['', '-1', '1']);
    pick(selects[0], '1');
    pick(selects[2], '-1');
    await settle();
    assertDeepEqual([...h.vm().state.forbiddenDraft], [1, null, -1]);
    assertEqual(UiState.schema.fields.forbiddenDraft.item.nullable, true, 'the draft schema allows any level');
    h.$('.doe__forbidden-add-btn').click();
    await settle();
    assertDeepEqual(h.vm().model.options.forbiddenVertices.map((p) => [...p]), [[1, null, -1]]);
    assertDeepEqual(h.calls('addForbiddenVertex').at(-1), { pattern: [1, null, -1] });
    assertDeepEqual([...h.vm().state.forbiddenDraft], []);
    assertEqual(h.$$('.doe__forbidden-input').map((s) => s.value).join('|'), '||');
    assertEqual(h.$('.doe__forbidden-rule').textContent, `A = 10 ∧ B = ${de('forbiddenAny')} ∧ C = 0`);
  });

  test('an empty draft forbids nothing and says what to do; remove allows it again', async () => {
    const h = await mount(optimalPlan({ options: { ...new State().options, optimalRuns: 8, forbiddenVertices: [[1, 1, null]] } }));
    h.$('.doe__forbidden-add-btn').click();
    await settle();
    assertEqual(h.vm().model.options.forbiddenVertices.length, 1);
    assertDeepEqual(h.notes.at(-1), [de('forbiddenHint'), 'info']);
    h.$('.doe__forbidden-remove-btn[data-rule-idx="0"]').click();
    await settle();
    assertEqual(h.vm().model.options.forbiddenVertices.length, 0);
  });
});

suite('doe-planner optimal: source worksheet', () => {
  test('picking a sheet sets the source with its row count; none removes it', async () => {
    const ws = worksheet('Messung', { A: [0, 10, 5], B: [0, 10, 5], C: [10, 0, 5], Yield: [1, 2, 3] });
    const h = await mount(optimalPlan(), { 'ws-1': ws });
    const sel = h.$('.doe__source-select');
    assertDeepEqual([...sel.options].map((o) => o.textContent), [de('sourceNone'), 'Messung (3)']);
    pick(sel, 'ws-1::sheet_1');
    await settle();
    assertDeepEqual({ ...h.vm().model.sourceWorksheet }, { instanceId: 'ws-1', sheetId: 'sheet_1' });
    assertEqual(h.calls('setSourceWorksheet').at(-1).sourceRowCount, 3);
    assertEqual(h.$('.doe__source-mapping-ok').textContent, de('sourceMappingOk', { rows: 3, responses: 1 }));
    assertEqual(h.$('.doe__optimal-runs-input').closest('.field-group').querySelector('label').textContent, de('optimalRunsNew'));
    pick(h.$('.doe__source-select'), '');
    await settle();
    assertEqual(h.vm().model.sourceWorksheet, null);
    assertDeepEqual(h.calls('setSourceWorksheet').at(-1), { ref: null });
  });

  test('a worksheet added to the project appears in the picker without a reload', async () => {
    const h = await mount(optimalPlan());
    assertEqual(h.$$('.doe__source-select option').length, 1);
    h.addWorksheet('ws-9', worksheet('Neu', { A: [1, 2] }));
    await settle();
    assertDeepEqual(h.$$('.doe__source-select option').map((o) => o.value), ['', 'ws-9::sheet_1']);
  });

  test('a missing factor column is reported; the own datasheet is no source', async () => {
    const ws = worksheet('Teil', { A: [1], B: [2] });
    const h = await mount(optimalPlan({
      sourceWorksheet: { instanceId: 'ws-1', sheetId: 'sheet_1' },
      worksheetRef: {
        instanceId: 'ws-2', sheetId: 'sheet_1', factorColumnIds: [], responseColumnIds: [], meanColumnIds: [],
        lnVarColumnIds: [], runOrderColumnId: null, stdOrderColumnId: null, designSignature: null, snapshot: null,
      },
    }), { 'ws-1': ws, 'ws-2': worksheet('Eigen', { A: [1] }) });
    assertEqual(h.$('.doe__source-mapping-error').textContent, de('sourceMissingFactors', { names: 'C' }));
    assert(h.$('.doe__source-select option[value="ws-1::sheet_1"]').selected, 'source selected');
    assertDeepEqual(h.vm().sourceOptions.map((o) => o.key), ['ws-1::sheet_1']);
  });
});

suite('doe-planner optimal: runs and terms', () => {
  test('runs through the field; the hint names the minimum', async () => {
    const h = await mount(optimalPlan());
    const input = h.$('.doe__optimal-runs-input');
    assertEqual(input.value, '8');
    typeIn(input, '12');
    await settle();
    assertEqual(h.vm().model.options.optimalRuns, 12);
    assertEqual(h.$('.doe__optimal-hint').textContent, de('optimalMinRuns', { min: h.vm().optimalMinNew }));
    assertEqual(h.$('.doe__optimal-info').textContent, de('optimalInfo_dopt'));
    typeIn(input, 'abc');
    await settle();
    assertEqual(h.vm().model.options.optimalRuns, 12);
    assertEqual(input.getAttribute('aria-invalid'), 'true');
    assertEqual(input.value, '12');
  });

  test('a stored run count 0 shows the minimum, as before', async () => {
    const h = await mount(optimalPlan({ options: { ...new State().options, optimalRuns: 0 } }));
    assertEqual(h.$('.doe__optimal-runs-input').value, String(h.vm().optimalMinNew));
    assert(h.vm().optimalMinNew > 0, 'a minimum');
  });

  test('a term box switches the term; groups fold in the UI state, high orders start closed', async () => {
    const h = await mount(optimalPlan());
    const groups = h.$$('.doe__term-group');
    assertDeepEqual(groups.map((g) => g.classList.contains('doe__term-group--open')), [true, true, true, false]);
    const quad = h.$('.doe__term-check[data-term-id="Q0"]');
    assert(!quad.checked, 'Q0 off');
    quad.click();
    await settle();
    assert(h.vm().model.options.optimalActiveTerms.includes('Q0'), 'Q0 on');
    assertDeepEqual(h.calls('setTerm').at(-1), { id: 'Q0', on: true });
    assert(h.$('.doe__term-check[data-term-id="M0"]').disabled, 'main effects locked');
    h.$('.doe__term-group-header[data-group-idx="3"]').click();
    await settle();
    assertDeepEqual([...h.vm().state.termGroupExpanded], [3]);
    assert(h.$('.doe__term-group[data-group-idx="3"]').classList.contains('doe__term-group--open'), 'opened');
    h.$('.doe__term-group-header[data-group-idx="0"]').click();
    await settle();
    assertEqual(h.$$('.doe__term-group[data-group-idx="0"] .doe__term-check').length, 0, 'main effects folded');
  });

  test('with a source the term command gets the row count', async () => {
    const ws = worksheet('Messung', { A: [0, 10], B: [0, 10], C: [0, 10] });
    const h = await mount(optimalPlan({ sourceWorksheet: { instanceId: 'ws-1', sheetId: 'sheet_1' } }), { 'ws-1': ws });
    h.$('.doe__term-check[data-term-id="Q1"]').click();
    await settle();
    assertDeepEqual(h.calls('setTerm').at(-1), { id: 'Q1', on: true, sourceRowCount: 2 });
  });
});
