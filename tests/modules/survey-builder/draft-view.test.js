/**
 * Survey builder: the draft tab in the browser — the real module with the
 * real template: outline and selection, properties with the type change,
 * the condition editor, warnings, the general questionnaire file and the
 * help badges of the tab.
 *
 * The questionnaire file of the example is compared with the file the
 * earlier draft built, frozen in fixtures/legacy-oracles.json (entries
 * `surveyFile.example.<lang>`).
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { mount, stored, settle, until, pick, de, helpEntry } from './view-harness.js';
import { loadTexts } from '../../../js/modules/survey-builder/viewmodel/texts.js';

/** @param {string} path relative to this file @returns {Promise<any>} */
async function loadJson(path) {
  return (await fetch(new URL(path, import.meta.url), { cache: 'no-cache' })).json();
}

const EXAMPLE = await loadJson('../../../js/modules/survey-builder/resources/examples/projects/survey-builder-software.json');
const ORACLES = await loadJson('./fixtures/legacy-oracles.json');
const UI_EN = await loadJson('../../../js/modules/survey-builder/resources/i18n/ui.en.json');

/** Two choice questions; q2 is shown only for option o2 of q1. */
const linked = (over = {}) => stored({
  survey: {
    sections: [{
      id: 's1', title: 'Allgemein', hint: '', when: null, questions: [
        { id: 'q1', type: 'single', text: 'Gruppe', hint: '', required: false, when: null, other: false,
          options: [{ id: 'o1', text: 'Handel' }, { id: 'o2', text: 'Industrie' }] },
        { id: 'q2', type: 'single', text: 'ERP', hint: '', required: false, when: [{ questionId: 'q1', optionIds: ['o2'] }], other: false,
          options: [{ id: 'e1', text: 'SAP' }] },
        { id: 'q3', type: 'text', text: 'Wünsche', hint: '', required: false, when: null, multiline: true },
      ],
    }],
  },
  ...over,
});

/** One response that answered q1. */
const answered = () => linked({
  responses: [{ id: 'r1', surveyVersion: 1, recipientId: null, viaRecipient: false, submittedAt: '2026-10-01T10:00:00.000Z', answers: { q1: { option: 'o1' } } }],
});

/** @param {any} h @param {string} id */
const selectQuestion = (h, id) => h.$(`.survey-builder__question[data-question-id="${id}"] [data-action="selectQuestion"]`).click();

suite('survey-builder draft: outline', () => {
  test('a new section is selected; a question added through the picker is selected and the picker shows its prompt again', async () => {
    const h = await mount(stored());
    h.$('[data-ref="addSection"]').click();
    await settle();
    const sec = h.vm().model.survey.sections[0];
    assertTrue(Boolean(sec), 'section added');
    assertEqual(h.vm().state.selectedSectionId, sec.id);
    assertTrue(Boolean(h.$('[data-ref="sectionProps"]')), 'section properties shown');
    const picker = h.$(`.survey-builder__section[data-section-id="${sec.id}"] [data-ref="addQuestion"]`);
    pick(picker, 'multi');
    await settle();
    const q = h.vm().model.survey.sections[0].questions[0];
    assertEqual(q.type, 'multi');
    assertEqual(h.vm().model.selectedQuestionId, q.id);
    assertEqual(h.vm().state.selectedSectionId, null);
    assertEqual(picker.value, '');
    assertTrue(Boolean(h.$('[data-ref="questionProps"]')), 'question properties shown');
    assertEqual(h.$('[data-ref="sectionProps"]'), null);
  });

  test('clicking a question selects it; the edit button of a section selects the section instead', async () => {
    const h = await mount(linked());
    selectQuestion(h, 'q2');
    await settle();
    assertEqual(h.vm().model.selectedQuestionId, 'q2');
    assertTrue(h.$('.survey-builder__question[data-question-id="q2"]').classList.contains('survey-builder__question--selected'));
    h.$('.survey-builder__section[data-section-id="s1"] [data-action="editSection"]').click();
    await settle();
    assertEqual(h.vm().state.selectedSectionId, 's1');
    assertEqual(h.vm().model.selectedQuestionId, null);
    assertTrue(Boolean(h.$('[data-ref="sectionProps"]')), 'section properties shown');
  });

  test('a removed selected section leaves no selection: the question selected before stays hidden', async () => {
    const h = await mount(linked());
    h.$('[data-ref="addSection"]').click();
    await settle();
    selectQuestion(h, 'q2');
    await settle();
    assertEqual(h.vm().model.selectedQuestionId, 'q2');
    const added = h.vm().model.survey.sections[1].id;
    h.$(`.survey-builder__section[data-section-id="${added}"] [data-action="editSection"]`).click();
    await settle();
    h.$(`.survey-builder__section[data-section-id="${added}"] [data-action="deleteSection"]`).click();
    await settle();
    assertEqual(h.vm().model.survey.sections.length, 1);
    assertEqual(h.vm().selectedQuestion, null);
    assertEqual(h.$('[data-ref="questionProps"]'), null);
    assertEqual(h.$('[data-ref="sectionProps"]'), null);
    assertEqual(h.$('.survey-builder__question--selected'), null);
    assertTrue(h.vm().hasNoSelection, 'nothing selected');
  });

  test('deleting a question another one refers to tells „1 condition removed“ — also when an agent deletes', async () => {
    const h = await mount(linked());
    h.$('.survey-builder__question[data-question-id="q1"] [data-action="deleteQuestion"]').click();
    await settle();
    assertDeepEqual(h.vm().model.survey.sections[0].questions.map((q) => q.id), ['q2', 'q3']);
    assertEqual(h.vm().model.question('q2').when, null);
    assertDeepEqual(h.notes, [[de('conditionsRemoved', { count: 1 }), 'info']]);

    const a = await mount(linked());
    a.vm().model.removeQuestion({ questionId: 'q1' });
    await settle();
    assertDeepEqual(a.notes, [[de('conditionsRemoved', { count: 1 }), 'info']]);
  });

  test('moving and texts: arrows run the commands, the section title binds to the model', async () => {
    const h = await mount(linked());
    h.$('.survey-builder__question[data-question-id="q3"] [data-action="moveQuestionUp"]').click();
    await settle();
    assertDeepEqual(h.vm().model.survey.sections[0].questions.map((q) => q.id), ['q1', 'q3', 'q2']);
    assertDeepEqual(h.calls('moveQuestion'), [{ questionId: 'q3', direction: 'up' }]);
    const title = h.$('.survey-builder__section[data-section-id="s1"] [data-field="sectionTitle"]');
    title.value = 'Neu';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    assertEqual(h.vm().model.survey.sections[0].title, 'Neu');
  });
});

suite('survey-builder draft: properties', () => {
  test('a type change of an answered question asks first; declined, the picker shows the old type', async () => {
    const h = await mount(answered(), { confirm: false });
    selectQuestion(h, 'q1');
    await settle();
    const sel = h.$('[data-ref="questionType"]');
    assertEqual(sel.value, 'single');
    pick(sel, 'text');
    await settle();
    assertEqual(h.confirms.length, 1);
    assertEqual(h.confirms[0].message, de('confirmChangeType', { count: 1 }));
    assertEqual(h.vm().model.question('q1').type, 'single');
    assertEqual(h.$('[data-ref="questionType"]').value, 'single');
    assertEqual(h.calls('changeQuestionType').length, 0);
  });

  test('a type change without answers runs at once; the flags of the new type appear', async () => {
    const h = await mount(linked());
    selectQuestion(h, 'q3');
    await settle();
    assertTrue(Boolean(h.$('[data-flag="multiline"]')), 'text question: multiline');
    pick(h.$('[data-ref="questionType"]'), 'rating');
    await settle();
    assertEqual(h.confirms.length, 0);
    assertEqual(h.vm().model.question('q3').type, 'rating');
    assertEqual(h.$('[data-flag="multiline"]'), null);
    assertTrue(Boolean(h.$('[data-flag="noAnswer"]')), 'rating: no answer');
  });

  test('flags and the display group: a flag binds to the question, an emptied group drops its key', async () => {
    const h = await mount(linked());
    selectQuestion(h, 'q1');
    await settle();
    const other = h.$('[data-flag="other"]');
    other.click();
    await settle();
    assertEqual(h.vm().model.question('q1').other, true);
    pick(h.$('[data-ref="questionType"]'), 'multi');
    await settle();
    assertEqual(h.vm().model.question('q1').type, 'multi');
    h.$('[data-ref="addItem"]').click();
    await settle();
    const item = h.vm().model.question('q1').options[0];
    const group = h.$(`.survey-builder__item[data-item-id="${item.id}"] [data-field="group"]`);
    group.value = 'Digital';
    group.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    assertEqual(h.vm().model.question('q1').options[0].group, 'Digital');
    group.value = '';
    group.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    assertTrue(!('group' in h.vm().model.question('q1').options[0]), 'group key dropped');
  });
});

suite('survey-builder draft: conditions', () => {
  test('source, option, removal: setConditions gets exactly the complete rows; the draft is UI state, not in the JSON', async () => {
    const h = await mount(linked());
    selectQuestion(h, 'q3');
    await settle();
    assertDeepEqual(h.vm().state.conditionDraft, []);
    h.$('[data-ref="addCondition"]').click();
    await settle();
    const row = () => h.$$('[data-ref="condition"]')[0];
    pick(row().querySelector('[data-field="source"]'), 'q1');
    await settle();
    assertEqual(h.calls('setConditions').length, 0, 'a source alone changes nothing');
    assertEqual(h.vm().model.dirtyStructure, false);
    const box = row().querySelector('input[type="checkbox"][value="o2"]');
    box.click();
    await settle();
    assertDeepEqual(h.calls('setConditions'), [{ nodeId: 'q3', conditions: [{ questionId: 'q1', optionIds: ['o2'] }] }]);
    assertDeepEqual(h.vm().model.question('q3').when, [{ questionId: 'q1', optionIds: ['o2'] }]);

    h.$('[data-ref="addCondition"]').click();
    await settle();
    pick(h.$$('[data-ref="condition"]')[1].querySelector('[data-field="source"]'), 'q2');
    await settle();
    assertEqual(h.calls('setConditions').length, 1, 'the second row has no option yet');
    assertEqual(h.vm().state.conditionDraft.length, 2);

    row().querySelector('[data-action="removeCondition"]').click();
    await settle();
    assertDeepEqual(h.calls('setConditions')[1], { nodeId: 'q3', conditions: [] });
    assertEqual(h.vm().model.question('q3').when, null);
    assertEqual(h.vm().state.conditionDraft.length, 1, 'the incomplete row stays in the draft');
    const json = h.vm().model.toJSON();
    assertTrue(!JSON.stringify(json).includes('conditionDraft'), 'draft not stored');
  });

  test('the draft follows the selection and conditions an agent sets', async () => {
    const h = await mount(linked());
    selectQuestion(h, 'q2');
    await settle();
    assertDeepEqual(h.vm().state.conditionDraft.map((c) => [c.questionId, c.optionIds]), [['q1', ['o2']]]);
    h.vm().model.setConditions({ nodeId: 'q2', conditions: [{ questionId: 'q1', optionIds: ['o1', 'o2'] }] });
    await settle();
    assertDeepEqual(h.vm().state.conditionDraft.map((c) => [c.questionId, c.optionIds]), [['q1', ['o1', 'o2']]]);
    selectQuestion(h, 'q1');
    await settle();
    assertEqual(h.$('[data-ref="conditions"] .survey-builder__hint').textContent, de('conditionsNone'));
    assertDeepEqual(h.vm().state.conditionDraft, []);
  });
});

suite('survey-builder draft: questionnaire', () => {
  test('warnings as before: empty section, question without text, choice without options', async () => {
    const h = await mount(stored({
      survey: {
        sections: [
          { id: 's1', title: '', hint: '', when: null, questions: [] },
          { id: 's2', title: 'Teil', hint: '', when: null, questions: [
            { id: 'q1', type: 'single', text: '', hint: '', required: false, when: null, other: false, options: [{ id: 'o1', text: ' ' }] },
          ] },
        ],
      },
    }));
    const label = de('questionNumber', { n: 1 });
    assertDeepEqual(h.vm().warnings.map((w) => w.text), [
      de('warnEmptySection', { section: de('sectionUntitled', { n: 1 }) }),
      de('warnEmptyText', { question: label }),
      de('warnNoItems', { question: label }),
    ]);
    assertDeepEqual(h.$$('[data-ref="warnings"] li').map((li) => li.textContent), h.vm().warnings.map((w) => w.text));
    const none = await mount(stored());
    assertDeepEqual(none.vm().warnings.map((w) => w.text), [de('warnNoQuestions')]);
  });

  for (const lang of ['en', 'de']) {
    test(`buildSurveyFile of the example in ${lang} (app in German) is the earlier file, character for character`, async () => {
      const json = JSON.parse(JSON.stringify(EXAMPLE));
      json.survey.lang = lang;
      const h = await mount(json);
      const out = await h.vm()._asyncTaskHost.start('buildSurveyFile', {});
      assertEqual(out.status, 'done');
      const want = ORACLES[`surveyFile.example.${lang}`];
      assertEqual(out.value.fileName, want.fileName);
      assertEqual(out.value.mimeType, 'text/html;charset=utf-8');
      assert(out.value.content === want.content, 'content differs from the earlier file');
      assertEqual(h.vm().model.survey.version, want.version);
      assertEqual(h.vm().model.exportedOnce, true);
      if (lang === 'en') {
        const scale = [1, 2, 3, 4, 5].map((i) => UI_EN.kano[`scale${i}`]);
        assertTrue(out.value.content.includes(JSON.stringify(scale)), 'Kano scale from kano.scale* (en)');
        assertTrue(out.value.content.includes(JSON.stringify(UI_EN.runner.untitled)), 'runner texts in English');
      }
    });
  }

  test('buildSurveyFile cancelled while the texts load: version and export mark stay', async () => {
    const json = JSON.parse(JSON.stringify(EXAMPLE));
    json.dirtyStructure = true;
    json.exportedOnce = true;
    const h = await mount(json);
    const m = h.vm().model;
    const before = { version: m.survey.version, exportedOnce: m.exportedOnce, dirty: m.dirtyStructure };
    const run = h.vm()._asyncTaskHost.start('buildSurveyFile', {});
    h.vm()._asyncTaskHost.cancel('buildSurveyFile');
    assertEqual((await run).status, 'cancelled');
    await loadTexts(json.survey.lang);
    await settle();
    assertDeepEqual({ version: m.survey.version, exportedOnce: m.exportedOnce, dirty: m.dirtyStructure }, before);
  });

  test('the version line and the preview: the runner draws into the preview box', async () => {
    const h = await mount(JSON.parse(JSON.stringify(EXAMPLE)));
    assertEqual(h.$('[data-ref="versionLine"]').textContent, de('versionLine', { version: 1 }));
    const host = h.$('[data-ref="preview"]');
    await until(() => Boolean(host.shadowRoot?.querySelector('div')?.childElementCount));
    assertTrue(Boolean(host.shadowRoot?.querySelector('div')?.childElementCount), 'preview drawn');
    assertDeepEqual(h.notes, []);
  });
});

suite('survey-builder draft: help badges', () => {
  test('every caption of the draft has a help key that exists; buttons of the rows carry none, no badge inside another', async () => {
    const h = await mount(answered());
    selectQuestion(h, 'q1');
    await settle();
    const tab = h.$('[data-ref="draftTab"]');
    h.$('[data-ref="addCondition"]').click();
    await settle();
    pick(h.$('[data-ref="condition"] [data-field="source"]'), 'q1');
    await settle();
    const captions = [...tab.querySelectorAll('label, th, .dmike-kpi-label')]
      // Option labels of a condition row: exempt, the condition title carries the badge.
      .filter((el) => !el.closest('.survey-builder__cond-options'));
    assertTrue(captions.length >= 8, `captions: ${captions.length}`);
    for (const el of captions) {
      const key = el.getAttribute('data-help-key') || el.querySelector('[data-help-key]:not([data-help-key=""])')?.getAttribute('data-help-key');
      assertTrue(Boolean(key), `no help key: ${el.outerHTML.slice(0, 120)}`);
    }
    const keyed = [...h.container.querySelectorAll('[data-help-key]')].filter((el) => el.getAttribute('data-help-key'));
    for (const el of keyed) {
      const key = el.getAttribute('data-help-key');
      assertTrue(key.startsWith(`modules.survey-builder.`), key);
      const path = key.slice('modules.survey-builder.'.length).replace(/\.help$/, '');
      const entry = helpEntry(path);
      assertTrue(Boolean(entry && (typeof entry === 'string' || entry.help)), `help text missing: ${key}`);
      assertEqual(el.parentElement.closest('[data-help-key]:not([data-help-key=""])'), null, `badge inside a badge: ${key}`);
    }
    const commands = [...h.container.querySelectorAll('[x-command]')];
    assertTrue(commands.length > 0, 'x-command buttons');
    for (const el of commands) {
      const key = el.getAttribute('data-help-key');
      const cmd = el.getAttribute('x-command');
      assertTrue(key === '' || key === `modules.survey-builder.actions.${cmd}.help`, `${cmd}: ${key}`);
    }
    for (const sel of ['[data-action="moveSectionUp"]', '[data-action="deleteSection"]', '[data-action="deleteQuestion"]', '[data-action="deleteItem"]']) {
      assertTrue(h.$$(sel).every((el) => el.getAttribute('data-help-key') === ''), sel);
    }
    assertEqual(h.$('[data-ref="addSection"]').getAttribute('data-help-key'), 'modules.survey-builder.actions.addSection.help');
  });
});
