/**
 * DoE Planner: view part "analysis" (viewmodel/analysis.js) in the browser —
 * the dispersion analysis of a replicated design once every response
 * value is in the bound datasheet, in the app language; a response column
 * removed from the sheet leaves the binding alone and shows no numbers.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/doe-planner/domain/model.js';
import { mount, bound, plan, settle, outputBadges, de, DATASHEET } from './view-harness.js';

/** A full design with two replicates: 8 runs. */
const replicated = (over = {}) => plan({ options: { ...new State().options, replicates: 2 }, ...over });

/** Values per run of the design: the replicates differ a little. */
const yValues = [[10, 12, 20, 23, 11, 13, 21, 25]];

/** Mounts a replicated plan with a bound, filled datasheet. */
async function filled(over = {}) {
  const b = bound(replicated(over), yValues);
  const h = await mount(b.model, b.worksheets);
  await h.done();
  return { h, b };
}

suite('doe-planner analysis: dispersion', () => {
  test('every value in the sheet: the dispersion analysis in the app language', async () => {
    const { h } = await filled();
    const vm = h.vm();
    assertEqual(vm.progress.complete, true);
    assert(vm.dispersion && vm.dispersion.ok, 'dispersion ran');
    assertEqual(h.$('.doe__dispersion-region .dmike-split__output-section').textContent, de('dispersionSection'));
    assertEqual(h.$$('.doe__dispersion-table tbody tr').length, 4, 'one row per design point');
    const cells = h.$$('.doe__dispersion-table tbody tr')[0].querySelectorAll('td');
    assert(/^\d+,\d{4}$/.test(cells[2].textContent), `mean in German: ${cells[2].textContent}`);
    assert(/^\d+,\d{6}$/.test(cells[4].textContent), `variance in German: ${cells[4].textContent}`);
    assertEqual(h.$$('.doe__dispersion-model').length, 2);
    const r2 = h.$('.doe__dispersion-model-body .doe__eval-note');
    assert(r2 && /^R² = \d+,\d%, R²adj = -?\d+,\d%$/.test(r2.textContent), r2 && r2.textContent);
    assert(h.$('.doe__dispersion-conclusion'), 'conclusion');
    // Output side: fill state, open, handover (3), evaluation (6 + 1 + 3), dispersion title (1),
    // the six point headers and four headers per fitted model.
    const models = h.$$('.doe__dispersion-coef-table').length;
    assertEqual(outputBadges(h.container), 3 + 10 + 1 + 6 + 4 * models);
  });

  test('a design without replicates says nothing about dispersion', async () => {
    const b = bound(plan(), [[1, 2, 3, 4]]);
    const h = await mount(b.model, b.worksheets);
    await h.done();
    assertEqual(h.vm().dispersion, null);
    assertEqual(h.$$('.doe__dispersion-region').length, 0);
  });

  test('a missing value: no analysis yet', async () => {
    const b = bound(replicated(), [[10, 12, 20, 23, 11, 13, 21, null]]);
    const h = await mount(b.model, b.worksheets);
    await h.done();
    assertEqual(h.$$('.doe__dispersion-region').length, 0);
    h.sheet(DATASHEET).columns[4].values[7] = 25;
    h.changed(DATASHEET);
    await settle();
    assertEqual(h.$$('.doe__dispersion-region').length, 1, 'appears with the last value, without activation');
  });
});

suite('doe-planner analysis: referenced column removed', () => {
  test('the response column is gone: binding unchanged, worksheetMissing, no numbers', async () => {
    const { h, b } = await filled();
    const vm = h.vm();
    const before = JSON.stringify(vm.model.worksheetRef);
    const sheet = h.sheet(DATASHEET);
    sheet.columns = sheet.columns.filter((c) => c.id !== b.model.worksheetRef.responseColumnIds[0]);
    h.changed(DATASHEET);
    await settle();
    await h.done();
    assertEqual(JSON.stringify(vm.model.worksheetRef), before);
    assertDeepEqual([...vm.progress.missing], [0]);
    assertEqual(h.$('.doe__results-missing').textContent, de('worksheetMissing'));
    assertEqual(h.$$('.doe__results-text').length, 0);
    assertEqual(h.$$('.doe__results-bar').length, 0);
    assertEqual(h.$$('.doe__dispersion-region').length, 0);
    assertEqual(h.$$('.doe__transfer-regression-btn').length, 0);
    assert(!/\d+ \/ \d+/.test(h.$('.doe__bound-region').textContent), 'no fill numbers');
  });
});
