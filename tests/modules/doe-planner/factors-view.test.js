/**
 * DoE Planner: view part "factors" (viewmodel/factors.js) in the browser —
 * the real module with the real template: name, factors with kind and
 * levels, responses, and the help badges of these sections.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { mount, ready, plan, typeIn, pick, settle, inputBadges, de } from './view-harness.js';

const level = (h, fid, li) => h.$(`.doe__factor-level-input[data-factor-id="${fid}"][data-level-idx="${li}"]`);

suite('doe-planner factors: levels', () => {
  test('a typed "24,5" is stored as typed and read as 24.5 by the design', async () => {
    const h = await ready(plan());
    typeIn(level(h, 1, 1), '24,5');
    await h.done();
    const vm = h.vm();
    assertEqual(vm.model.factors[0].levels[1], '24,5');
    assertEqual(level(h, 1, 1).getAttribute('aria-invalid'), null);
    assertEqual(level(h, 1, 1).getAttribute('inputmode'), 'decimal');
    assertEqual(level(h, 1, 1).getAttribute('type'), 'text');
    assert(vm.model.design.actualMatrix.some((row) => Number(row[0]) === 24.5), JSON.stringify(vm.model.design.actualMatrix));
  });

  test('nonsense on a continuous factor is rejected, the model keeps its level', async () => {
    const h = await ready(plan());
    const before = JSON.stringify(h.vm().model.factors);
    const el = level(h, 1, 0);
    typeIn(el, 'abc');
    await settle();
    assertEqual(JSON.stringify(h.vm().model.factors), before);
    assertEqual(el.getAttribute('aria-invalid'), 'true');
    assertEqual(el.value, '20');
    typeIn(el, '');
    await settle();
    assertEqual(h.vm().model.factors[0].levels[0], '');
    assertEqual(el.getAttribute('aria-invalid'), null);
  });

  test('a categorical factor takes any label', async () => {
    const h = await mount(plan({
      factors: [
        { id: 1, name: 'Stoff', unit: '', kind: 'categorical', levels: ['', ''] },
        { id: 2, name: 'Druck', unit: 'bar', kind: 'continuous', levels: ['1', '5'] },
      ],
    }));
    typeIn(level(h, 1, 0), 'Stahl');
    await settle();
    assertEqual(h.vm().model.factors[0].levels[0], 'Stahl');
    assertEqual(level(h, 1, 0).getAttribute('placeholder'), de('factorLevelLabelPlaceholder'));
  });

  test('insert and remove a level through the buttons; remove only above two levels', async () => {
    const h = await mount(plan());
    assertEqual(h.$$('.doe__remove-level-btn[data-factor-id="1"]').length, 0);
    h.$('.doe__insert-level-btn[data-factor-id="1"][data-insert-at="1"]').click();
    await settle();
    assertDeepEqual([...h.vm().model.factors[0].levels], ['20', '', '40']);
    assertEqual(h.$$('.doe__remove-level-btn[data-factor-id="1"]').length, 3);
    h.$('.doe__remove-level-btn[data-factor-id="1"][data-level-idx="0"]').click();
    await settle();
    assertDeepEqual([...h.vm().model.factors[0].levels], ['', '40']);
  });
});

suite('doe-planner factors: factors and responses', () => {
  test('kind categorical clears the unit and disables it', async () => {
    const h = await mount(plan());
    pick(h.$('.doe__factor-kind[data-factor-id="1"]'), 'categorical');
    await settle();
    const f = h.vm().model.factors[0];
    assertEqual(f.kind, 'categorical');
    assertEqual(f.unit, '');
    assert(h.$('.doe__factor-unit[data-factor-id="1"]').disabled, 'unit disabled');
    assertEqual(h.$('.doe__factor-row[data-factor-id="1"]').dataset.factorKind, 'categorical');
  });

  test('add and remove a factor, rename it; a duplicate name is marked', async () => {
    const h = await mount(plan());
    h.$('.doe__add-factor-btn').click();
    await settle();
    assertEqual(h.vm().model.factors.length, 3);
    assertEqual(h.$$('.doe__factor-letter').map((e) => e.textContent).join(''), 'ABC');
    typeIn(h.$('.doe__factor-name[data-factor-id="3"]'), 'temp');
    await settle();
    assertEqual(h.vm().model.factors[2].name, 'temp');
    assert(h.$('.doe__factor-name[data-factor-id="1"]').classList.contains('field--error'), 'duplicate marked');
    h.$('.doe__factor-remove-btn[data-factor-id="1"]').click();
    await settle();
    assertDeepEqual(h.vm().model.factors.map((f) => f.id), [2, 3]);
  });

  test('responses: add, rename, remove; the last one cannot be removed', async () => {
    const h = await mount(plan());
    assertEqual(h.$$('.doe__response-remove-btn').length, 0);
    h.$('.doe__add-response-btn').click();
    await settle();
    assertEqual(h.vm().model.responses.length, 2);
    typeIn(h.$('.doe__response-name[data-idx="1"]'), 'Glanz');
    await settle();
    assertEqual(h.vm().model.responses[1].name, 'Glanz');
    assertEqual(h.$$('.doe__response-letter').map((e) => e.textContent).join(','), 'Y1,Y2');
    h.$('.doe__response-remove-btn[data-idx="0"]').click();
    await settle();
    assertDeepEqual(h.vm().model.responses.map((r) => r.name), ['Glanz']);
  });

  test('name: label and binding; project mode names the phase', async () => {
    const h = await mount(plan());
    assertEqual(h.$('.doe__name-label').textContent, de('doeName'));
    typeIn(h.$('.doe__name-input'), 'Spritzguss');
    await settle();
    assertEqual(h.vm().model.doeName, 'Spritzguss');
    const p = await mount(plan({ projectMode: true }));
    assertEqual(p.$('.doe__name-bar .doe__name-label').textContent, de('phaseName'));
  });
});

suite('doe-planner factors: help badges', () => {
  test('as many badges as before: name 1, factors 2, responses 2; none on the row buttons', async () => {
    const h = await mount(plan({ factors: [...plan().factors.slice(0, 1), { id: 2, name: 'B', unit: '', kind: 'continuous', levels: ['1', '2', '3'] }], responses: [{ name: 'Y', unit: '' }, { name: 'Z', unit: '' }] }));
    const b = inputBadges(h.container);
    assertEqual(b.name, 1);
    assertEqual(b['fields.factors'], 2);
    assertEqual(b['fields.responses'], 2);
    for (const sel of ['.doe__factor-remove-btn', '.doe__insert-level-btn', '.doe__remove-level-btn', '.doe__response-remove-btn']) {
      assert(h.$$(sel).length > 0, sel);
      assert(h.$$(sel).every((el) => el.getAttribute('data-help-key') === ''), sel);
    }
    assertEqual(h.$('.doe__add-factor-btn').getAttribute('data-help-key'), 'modules.doe-planner.actions.addFactor.help');
  });
});
