/**
 * DoE Planner: view part "evop" (viewmodel/evop.js) in the browser — the
 * project toggle and name, the phase timeline, the decision that closes a
 * phase (asked through the confirm dialog, with the values of every
 * response read through `ctx.data`), viewing an earlier phase with its
 * selection, and the cumulative EVOP effects in the app language.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/doe-planner/domain/model.js';
import { mount, bound, designed, plan, threeFactors, settle, typeIn, inputBadges, de } from './view-harness.js';

/** A stored state in project mode, phase 1 open. @param {object} stored */
function project(stored) {
  const m = State.fromJSON(stored);
  m.setProjectMode({ on: true });
  return m.toJSON();
}

suite('doe-planner evop: project', () => {
  test('the toggle opens phase 1; name and timeline; help badges as before', async () => {
    const h = await mount(designed(plan()));
    assertEqual(h.$$('.doe__project-bar').length, 0);
    const check = h.$('.doe__project-check');
    check.checked = true;
    check.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    assertDeepEqual(h.calls('setProjectMode').at(-1), { on: true });
    assertEqual(h.vm().model.projectPhases.length, 1);
    assertEqual(h.$$('.doe__timeline-item').length, 1, 'phase 1, no new phase while it is open');
    assertEqual(h.$('.doe__timeline-label').textContent, 'Ofen');
    assert(h.$('.doe__timeline-item').classList.contains('doe__timeline-item--active'), 'active phase');
    typeIn(h.$('.doe__project-name-input'), 'Beschichtung');
    await settle();
    assertEqual(h.vm().model.projectName, 'Beschichtung');
    // Toggle, project name, phase history.
    assertEqual(inputBadges(h.container).evop, 3);
    assertEqual(inputBadges(h.container).name, 1);
  });
});

suite('doe-planner evop: phase label', () => {
  test('a phase without a name is labelled with its number from the texts', async () => {
    const stored = project(designed(plan()));
    stored.projectPhases[0].doeName = '';
    const h = await mount(stored);
    assertEqual(h.$('.doe__timeline-label').textContent, de('phaseLabel', { n: 1 }));
  });
});

suite('doe-planner evop: complete a phase', () => {
  /** Project with a bound, filled datasheet of two responses. */
  async function decidable() {
    const b = bound(plan({ responses: [{ name: 'Yield', unit: '%' }, { name: 'Kosten', unit: '' }] }), [[1, 2, 3, 4], [5, 6, 7, 8]]);
    const h = await mount(project(b.model), b.worksheets);
    await h.done();
    return h;
  }

  test('a decision asks through confirm and stores the values of every response', async () => {
    const h = await decidable();
    const asked = [];
    h.context.dialog.confirm = async (opts) => { asked.push(opts); return true; };
    assertEqual(h.$('.doe__phase-decision-title').textContent, de('decisionTitle'));
    assertEqual(h.$$('.doe__phase-decision-btn').length, 3);
    h.$('.doe__phase-decision-btn[data-decision="repeat"]').click();
    await settle();
    assertEqual(asked.length, 1);
    assertEqual(asked[0].message, 'modules.doe-planner.confirm.completePhase.repeat');
    const args = h.calls('completePhase').at(-1);
    assertEqual(args.decision, 'repeat');
    assertDeepEqual(args.yValues, [[1, 2, 3, 4], [5, 6, 7, 8]]);
    const phases = h.vm().model.projectPhases;
    assertEqual(phases.length, 2);
    assertEqual(phases[0].decision, 'repeat');
    assertDeepEqual(phases[0].yValues.map((c) => [...c]), [[1, 2, 3, 4], [5, 6, 7, 8]]);
    assertEqual(h.vm().model.activePhaseIdx, 1);
    assertEqual(h.$$('.doe__timeline-dec').length, 1, 'the decided phase carries its icon');
  });

  test('each decision asks with its own text, the one of the earlier planner', async () => {
    const legacy = {
      recenter: 'Re-zentrieren? Der beste Punkt wird zum neuen Mittelpunkt. Die Faktor-Stufen werden automatisch angepasst.',
      repeat: 'Phase wiederholen? Es wird ein neuer Zyklus mit den gleichen Faktoreinstellungen erstellt.',
      stop: 'Projekt abschließen? Es werden keine weiteren Phasen erstellt.',
    };
    const texts = new Set();
    for (const decision of ['recenter', 'repeat', 'stop']) {
      const h = await decidable();
      const asked = [];
      h.context.dialog.confirm = async (opts) => { asked.push(opts); return false; };
      h.$(`.doe__phase-decision-btn[data-decision="${decision}"]`).click();
      await settle();
      assertEqual(asked.length, 1, decision);
      assertEqual(asked[0].message, `modules.doe-planner.confirm.completePhase.${decision}`);
      const text = de(`confirm.completePhase.${decision}`);
      assertEqual(text, legacy[decision]);
      texts.add(text);
    }
    assertEqual(texts.size, 3);
  });

  test('a declined confirm closes nothing', async () => {
    const h = await decidable();
    h.context.dialog.confirm = async () => false;
    h.$('.doe__phase-decision-btn[data-decision="stop"]').click();
    await settle();
    assertEqual(h.calls('completePhase').length, 0);
    assertEqual(h.vm().model.projectPhases[0].decision, null);
    assertEqual(h.$$('.doe__phase-decision').length, 1);
  });

  test('no decision while a value is missing', async () => {
    const b = bound(plan(), [[1, 2, 3, null]]);
    const h = await mount(project(b.model), b.worksheets);
    await h.done();
    assertEqual(h.$$('.doe__phase-decision').length, 0);
  });
});

suite('doe-planner evop: phases', () => {
  test('viewing a phase brings back its plan and selection', async () => {
    const m = State.fromJSON(designed(plan({ designType: 'frac', factors: threeFactors(), selectedRes: { k: 3, runs: 4, res: 'III', p: 1 } })));
    m.setProjectMode({ on: true });
    m.completePhase({ decision: 'repeat' });
    m.selectDesignType({ type: 'full' });
    m.syncActivePhase();
    const h = await mount(m.toJSON());
    await h.done();
    assertEqual(h.vm().model.designType, 'full');
    assertEqual(h.vm().model.selectedRes, null);
    const items = h.$$('.doe__timeline-item[data-phase-idx]');
    assertEqual(items.length, 2);
    items[0].click();
    await settle();
    assertDeepEqual(h.calls('viewPhase').at(-1), { index: 0 });
    assertEqual(h.vm().model.activePhaseIdx, 0);
    assertEqual(h.vm().model.designType, 'frac');
    assertDeepEqual({ ...h.vm().model.selectedRes }, { k: 3, runs: 4, res: 'III', p: 1 });
    assert(h.$$('.doe__timeline-item[data-phase-idx]')[0].classList.contains('doe__timeline-item--active'), 'phase 1 active');
    // A decided active phase may be followed by a new one.
    assertEqual(h.$$('.doe__new-phase-btn').length, 1);
    h.$('.doe__new-phase-btn').click();
    await settle();
    assertEqual(h.vm().model.projectPhases.length, 3);
  });

  test('cumulative EVOP effects in the app language', async () => {
    const m = State.fromJSON(designed(plan()));
    m.setProjectMode({ on: true });
    m.completePhase({ decision: 'repeat', yValues: [[10, 14, 11, 16]] });
    m.regenerate({ source: null });
    m.completePhase({ decision: 'repeat', yValues: [[11, 15, 10, 17]] });
    const h = await mount(m.toJSON());
    await h.done();
    const summary = h.vm().evop.summary;
    assert(summary && summary.effects.length > 0, 'effects');
    assertEqual(h.$('.doe__evop-title').textContent, de('evopEffectTable'));
    const meta = h.$$('.doe__evop-meta span').map((s) => s.textContent);
    assertEqual(meta[0], de('evopCycles', { n: 2 }));
    assert(/^.+: \d+,\d{4}$/.test(meta[2]), meta[2]);
    const row = h.$$('.doe__evop-table tbody tr')[0].querySelectorAll('td');
    assert(/^-?\d+,\d{4}$/.test(row[1].textContent), row[1].textContent);
    assert(/^±(\d+,\d{4}|∞)$/.test(row[2].textContent), row[2].textContent);
    assertEqual(h.$('.doe__evop-recommendation').textContent, de(`evopRec_${summary.overallRecommendation}`));
    // Toggle, name, phase history, effect table title and its four column headers.
    assertEqual(inputBadges(h.container).evop, 3 + 1 + 4);
  });
});
