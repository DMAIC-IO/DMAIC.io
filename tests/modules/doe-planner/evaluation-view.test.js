/**
 * DoE Planner: view part "evaluation" (viewmodel/evaluation.js) in the
 * browser — summary of the input side, placeholder, the evaluation of a
 * current design in the app language, the note while the design is
 * pending, the own text when the evaluation cannot be computed, the lab
 * links and the help badges of the output side.
 */
import { suite, test, assert, assertEqual } from '../../test-utils.js';
import { setFields } from '../../../js/core/model.js';
import { configSignature } from '../../../js/modules/doe-planner/domain/signatures.js';
import { State } from '../../../js/modules/doe-planner/domain/model.js';
import { mount, ready, plan, threeFactors, settle, flush, outputBadges, de } from './view-harness.js';

suite('doe-planner evaluation: summary and placeholder', () => {
  test('an incomplete plan shows the placeholder, "?" runs and "incomplete"', async () => {
    const h = await mount(plan({ factors: [plan().factors[0]] }));
    assert(h.$('.doe__placeholder'), 'placeholder');
    assertEqual(h.$$('.doe__output-content').length, 0);
    assertEqual(h.$('.doe__summary-item--pending').textContent, de('configIncomplete'));
    assertEqual(outputBadges(h.container), 1, 'the placeholder carries its badge');
    const frac = await mount(plan({ designType: 'frac' }));
    assertEqual(frac.$$('.doe__summary-item strong')[1].textContent, '?');
  });

  test('a current design: runs, resolution and the generated badge', async () => {
    const h = await ready(plan({ options: { ...new State().options, replicates: 2 } }));
    const strong = h.$$('.doe__summary-item strong').map((e) => e.textContent);
    assertEqual(strong[0], '2');
    assertEqual(strong[1], '8');
    assertEqual(strong[2], 'Full');
    assertEqual(h.$('.doe__generated-badge').textContent.trim(), de('generated', { runs: 8 }));
    assertEqual(h.$$('.doe__placeholder').length, 0);
  });
});

suite('doe-planner evaluation: output', () => {
  test('efficiency, condition number and leverage in the app language; VIF and power', async () => {
    const h = await ready(plan());
    const cards = h.$$('.doe__eval-compact .dmike-kpi');
    assertEqual(cards.length, 5);
    assertEqual(cards[0].querySelector('.dmike-kpi-value').textContent, '100%');
    assert(/^\d+,\d$/.test(cards[3].querySelector('.dmike-kpi-value').textContent), cards[3].textContent);
    assert(/^\d+,\d{3}$/.test(cards[4].querySelector('.dmike-kpi-value').textContent), cards[4].textContent);
    assert(h.$$('.doe__vif-table td').some((td) => /^\d+,\d{2}$/.test(td.textContent)), 'VIF in German');
    assert(h.$$('.doe__power-table tbody tr').length > 0, 'power rows');
    assertEqual(h.$('.doe__eval-pending'), null);
    // Each efficiency card, the condition number and the leverage have their own help text.
    const keys = h.$$('.doe__eval-compact .dmike-kpi-label').map((el) => (el.matches('[data-help-key]') ? el : el.querySelector('[data-help-key]')).getAttribute('data-help-key'));
    assertEqual(keys.length, 5);
    assertEqual(new Set(keys).size, 5, keys.join(', '));
    assertEqual(keys[0], 'modules.doe-planner.fields.assessment.dEfficiency.help');
    assertEqual(keys[4], 'modules.doe-planner.fields.assessment.maxLeverage.help');
    const help = await (await fetch(new URL('../../../js/modules/doe-planner/resources/i18n/context-help.de.json', import.meta.url), { cache: 'no-cache' })).json();
    const texts = ['dEfficiency', 'aEfficiency', 'gEfficiency', 'conditionNumber', 'maxLeverage'].map((k) => help.fields.assessment[k].help);
    assertEqual(new Set(texts).size, 5);
    assert(texts[3].includes('Kollinearität') && texts[4].includes('p/n'), 'legacy texts');
    // Help badges as before: efficiency 6, VIF 1, power 3; a full design has no aliases.
    // Without a datasheet the create button and the preview label and hint carry 3 more.
    assertEqual(outputBadges(h.container), 6 + 1 + 3 + 3);
  });

  test('lab links: three for the efficiencies, one for VIF; a click opens the lab', async () => {
    const h = await ready(plan());
    assertEqual(h.$$('.dmike-algo-link[data-algo-id="d-efficiency"]').length, 3);
    assertEqual(h.$$('.dmike-algo-link[data-algo-id="vif"]').length, 1);
    h.$('.dmike-algo-link[data-algo-id="vif"]').click();
    const nav = h.events.filter(([n]) => n === 'lab:navigate').at(-1);
    assertEqual(nav[1].algoId, 'vif');
  });

  test('while the design is pending a note stands instead of numbers', async () => {
    const h = await ready(plan());
    const vm = h.vm();
    setFields(vm.model, { factors: [vm.model.factors[0], { ...vm.model.factors[1], levels: ['2', '8'] }] });
    await flush();
    await flush();
    assertEqual(vm.pending, true);
    assertEqual(h.$('.doe__eval-pending').textContent, de('evaluationPending'));
    assertEqual(h.$$('.doe__eval-compact').length, 0);
    assert(h.$('.doe__generated-badge'), 'the generated badge stays while a new design is pending');
    assertEqual(h.$$('.doe__summary-item--pending').length, 0);
    await h.done();
    assertEqual(h.$$('.doe__eval-pending').length, 0);
    assertEqual(h.$$('.doe__eval-compact').length, 1);
  });

  test('an evaluation that cannot be computed gets its own text', async () => {
    const base = plan();
    const broken = {
      ...base,
      design: {
        codedMatrix: [], actualMatrix: [], stdOrder: [], runOrder: [], replicateIds: [],
        resolution: 'Full', p: 0, designType: 'full', configSignature: configSignature(base),
      },
    };
    const h = await mount(broken);
    assertEqual(h.vm().pending, false);
    assertEqual(h.$('.doe__eval-failed').textContent, de('evaluationFailed'));
    assertEqual(h.$$('.doe__eval-compact').length, 0);
  });
});

/** Create button, preview label and hint of a plan without a datasheet. */
const RUNS_BADGES = 3;

suite('doe-planner evaluation: help badges', () => {
  // The legacy output side: efficiency heading, three cards, condition number, leverage (6);
  // VIF heading (1); alias heading and its two column headers (3); power heading and its two
  // column headers (3). The placeholder carries one.
  test('a fractional design with aliases has as many badges as before', async () => {
    const frac = await ready(plan({ designType: 'frac', factors: threeFactors(), selectedRes: { k: 3, runs: 4, res: 'III', p: 1 } }));
    const vm = frac.vm();
    assert(vm.shownAssessment.hasAlias && vm.shownAssessment.aliasRows.length > 0, 'frac has aliases');
    assertEqual(outputBadges(frac.container), 6 + (vm.hasVif ? 1 : 0) + 3 + (vm.hasPower ? 3 : 0) + RUNS_BADGES);
  });
});
