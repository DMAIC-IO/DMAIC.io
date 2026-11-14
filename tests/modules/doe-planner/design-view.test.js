/**
 * DoE Planner: view part "design" (viewmodel/design.js) in the browser —
 * type picker and recommendation, resolution table, Plackett-Burman,
 * Box-Behnken, Taguchi, the general options with "new seed", and the help
 * badges of these sections.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { mount, ready, plan, threeFactors, worksheet, typeIn, pick, settle, inputBadges, de } from './view-harness.js';

const typeBtn = (h, key) => h.$(`.doe__design-opt[data-type="${key}"]`);

suite('doe-planner design: type picker', () => {
  test('a click selects the type; the radio state follows; the recommendation applies', async () => {
    const h = await mount(plan({ designType: 'ccd' }));
    assertEqual(typeBtn(h, 'ccd').getAttribute('aria-checked'), 'true');
    assertEqual(h.$('.doe__design-options').getAttribute('role'), 'radiogroup');
    assertEqual(h.$('.doe__recommendation-btn').dataset.recType, 'full');
    assertEqual(h.$('.doe__recommendation-btn').textContent, de('design_full'));
    assertEqual(h.$('.doe__recommendation-text').textContent, de('recFull', { k: 2 }));
    typeBtn(h, 'bb').click();
    await settle();
    assertEqual(h.vm().model.designType, 'bb');
    assertEqual(typeBtn(h, 'bb').getAttribute('aria-checked'), 'true');
    assertEqual(typeBtn(h, 'ccd').getAttribute('aria-checked'), 'false');
    h.$('.doe__recommendation-btn').click();
    await settle();
    assertEqual(h.vm().model.designType, 'full');
    assertEqual(h.calls('selectDesignType').at(-1).sourceRowCount, undefined, 'no source, no row count');
  });

  test('two-level types are disabled with a three-level factor; full shows the product', async () => {
    const f = plan().factors;
    const h = await mount(plan({ factors: [f[0], { ...f[1], levels: ['1', '3', '5'] }] }));
    assert(typeBtn(h, 'frac').disabled, 'frac disabled');
    assert(typeBtn(h, 'pb').disabled, 'pb disabled');
    assertEqual(typeBtn(h, 'frac').title, de('tipTwoLevelOnly'));
    assertEqual(typeBtn(h, 'full').querySelector('.doe__design-opt-desc').textContent, '2×3');
    assertEqual(typeBtn(h, 'ccd').querySelector('.doe__design-opt-desc').textContent, 'CCD');
  });

  test('with a source sheet the type command gets its row count', async () => {
    const ws = worksheet('Messung', { A: [1, 2, 3], B: [1, 2, 3], C: [1, 2, 3] });
    const h = await mount(plan({
      designType: 'dopt', factors: threeFactors(), sourceWorksheet: { instanceId: 'ws-1', sheetId: 'sheet_1' },
      options: { ...plan().options, optimalRuns: 6 },
    }), { 'ws-1': ws });
    typeBtn(h, 'aopt').click();
    await settle();
    assertEqual(h.vm().model.designType, 'aopt');
    assertEqual(h.calls('selectDesignType').at(-1).sourceRowCount, 3);
  });
});

suite('doe-planner design: own choice of the type', () => {
  test('resolution table: a cell of the factor count selects, others do nothing', async () => {
    const h = await mount(plan({ designType: 'frac', factors: threeFactors() }));
    assertEqual(h.$('.doe__res-info').textContent, de('resSelectPrompt'));
    const cell = h.$('.doe__res-cell[data-k="3"][data-runs="4"]');
    assert(cell, 'selectable cell');
    assertEqual(cell.dataset.res, 'III');
    cell.click();
    await settle();
    assertDeepEqual({ ...h.vm().model.selectedRes }, { k: 3, runs: 4, res: 'III', p: 1 });
    assert(h.$('.doe__res-cell[data-k="3"][data-runs="4"]').classList.contains('doe__res-cell--selected'), 'selected');
    assertEqual(h.$('.doe__res-info').textContent, `3 ${de('factors')} · 4 ${de('runs')} · ${de('resolution')} III`);
    assert(h.$('.doe__res-alias-detail'), 'alias detail');
    assert(h.$$('.doe__res-alias-table tbody tr').length > 0, 'alias rows');
    assertEqual(h.$$('.doe__res-cell[data-k="4"]').length, 0, 'other factor counts carry no data');
    assert(h.$$('.doe__res-col--active').length === 1 && h.$('.doe__res-col--active').textContent === '3', 'active column');
    // Help badges as before: title, recommendation, table title, term/aliased-with headers.
    assertEqual(inputBadges(h.container)['fields.designType'], 5);
    assert(h.$$('.doe__res-cell[data-k]').every((el) => el.getAttribute('data-help-key') === ''), 'no badge on the cells');
  });

  test('Plackett-Burman row and Taguchi array by click', async () => {
    const h = await mount(plan({ designType: 'pb' }));
    assertEqual(h.$('.doe__pb-info').textContent, de('pbSelectPrompt'));
    h.$('.doe__pb-row[data-idx="1"]').click();
    await settle();
    assertEqual(h.vm().model.selectedPBIdx, 1);
    assert(h.$('.doe__pb-row[data-idx="1"]').classList.contains('doe__pb-row--selected'), 'selected row');
    assertEqual(h.$('.doe__pb-info').textContent, `8–11 ${de('factors')}`);
    // Help badges as before: title, recommendation, panel title; none on the rows.
    assertEqual(inputBadges(h.container)['fields.designType'], 3);
    assert(h.$$('.doe__pb-row').every((el) => el.getAttribute('data-help-key') === ''), 'no badge on the rows');

    const t = await mount(plan({ designType: 'taguchi', factors: threeFactors() }));
    const rows = t.$$('.doe__taguchi-row');
    assert(rows.length > 0, 'arrays');
    assert(rows[0].classList.contains('doe__taguchi-row--selected'), 'first array preselected as before');
    const last = rows.at(-1).dataset.oa;
    rows.at(-1).click();
    await settle();
    assertEqual(t.vm().model.options.taguchiArray, last);
    assertEqual(t.$('.doe__taguchi-info').textContent, de('taguchiLevels2'));
    assertEqual(inputBadges(t.container)['fields.designType'], 3);
  });

  test('Box-Behnken: details for 3 factors, a warning for 2', async () => {
    const h = await mount(plan({ designType: 'bb', factors: threeFactors() }));
    assert(h.$('.doe__bb-detail').textContent.startsWith('3 '), h.$('.doe__bb-detail').textContent);
    // Help badges as before: no panel title badge; parameters title, randomise, replicates,
    // bb center points, the summary (3) and the new "new seed" button.
    assertEqual(inputBadges(h.container)['fields.designType'], 2);
    assertEqual(inputBadges(h.container)['fields.options'], 1 + 1 + 1 + 1 + 3 + 1);
    const w = await mount(plan({ designType: 'bb' }));
    assertEqual(w.$('.doe__bb-warning').textContent, de('bbNotAvailable', { k: 2, min: 3, max: 7 }));
  });
});

suite('doe-planner design: general options', () => {
  test('randomise and center points bind; replicates and CCD settings through the field', async () => {
    const h = await mount(plan({ designType: 'ccd' }));
    assertEqual(h.$$('.doe__center-check').length, 0, 'no general center points for ccd');
    // Help badges as before: title, randomise, replicates, alpha, ccd center points, summary (3), new seed.
    assertEqual(inputBadges(h.container)['fields.options'], 1 + 1 + 1 + 2 + 3 + 1);
    assert(['.doe__replicates-input', '.doe__alpha-type-select', '.doe__ccd-cp-input'].every((q) => h.$(q).getAttribute('data-help-key') === ''), 'no badge on the inputs');
    h.$('.doe__randomize-check').click();
    await settle();
    assertEqual(h.vm().model.options.randomize, false);
    typeIn(h.$('.doe__replicates-input'), '3');
    await settle();
    assertEqual(h.vm().model.options.replicates, 3);
    typeIn(h.$('.doe__replicates-input'), '11');
    await settle();
    assertEqual(h.vm().model.options.replicates, 3, 'out of range rejected');
    pick(h.$('.doe__alpha-type-select'), 'face-centered');
    await settle();
    assertEqual(h.vm().model.options.alphaType, 'face-centered');
    typeIn(h.$('.doe__ccd-cp-input'), '5');
    await settle();
    assertEqual(h.vm().model.options.ccdCenterPoints, 5);
    const full = await mount(plan());
    full.$('.doe__center-check').click();
    await settle();
    assertEqual(full.vm().model.options.centerPoints, true);
  });

  test('"new seed" draws another seed and a new design', async () => {
    const h = await ready(plan());
    const before = h.vm().model.seed;
    // Help badges as before (full): design type 2; parameters 4, summary 3, plus "new seed".
    assertEqual(inputBadges(h.container)['fields.designType'], 2);
    assertEqual(inputBadges(h.container)['fields.options'], 8);
    assert(h.$$('.doe__design-opt').every((el) => el.getAttribute('data-help-key') === ''), 'no badge on the options');
    const btn = h.$('.doe__reshuffle-btn');
    assertEqual(btn.textContent, de('reshuffle'));
    btn.click();
    await h.done();
    assert(h.vm().model.seed !== before, 'new seed');
    assertEqual(h.vm().pending, false, 'the design was made for the new seed');
  });
});
