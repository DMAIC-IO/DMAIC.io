/**
 * Tests for js/modules/survey-builder/domain/model.js — schema, defaults,
 * `hasContent`, the getters the views read and `derived.results`, each
 * against the earlier model (legacy/survey-builder-model.js) and the earlier
 * results viewmodel (`agentSnapshot()`), run here on the same stored states.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { SurveyModel } from '../../../js/modules/survey-builder/domain/model.js';
import { resultsSnapshot } from '../../../js/modules/survey-builder/domain/results.js';
import { QUESTION_TYPES } from '../../../js/modules/survey-builder/domain/conditions.js';
import { ResultsViewModel } from '../../../js/modules/survey-builder/legacy/viewmodel/results.js';
import { t, fakeContext, attach } from '../survey-vm-fakes.js';
import { EXAMPLE, MIXED, CORNERS, copy, load, legacy } from './cases.js';

/** @param {object} json earlier form @returns {object} the earlier results tab as numbers */
function legacySnapshot(json) {
  const vm = new ResultsViewModel({ t, context: fakeContext(), container: () => null });
  attach(vm, legacy(json));
  return vm.agentSnapshot();
}

/** @param {any} spec @param {string} path dotted @returns {any} the nested spec */
function specAt(spec, path) {
  return path.split('.').reduce((s, k) => (s.kind === 'list' ? s.item : s).shape[k], spec);
}

suite('survey-builder model — schema and defaults', () => {
  test('version 1.0 with the migration from 0', () => {
    assertEqual(SurveyModel.schema.version, '1.0');
    assertDeepEqual(Object.keys(SurveyModel.schema.migrations), ['0→1.0']);
  });

  test('the question types of the schema are QUESTION_TYPES', () => {
    const types = specAt(SurveyModel.schema.fields.survey, 'sections.questions.type').values;
    assertDeepEqual([...types], QUESTION_TYPES);
  });

  test('fields and view fields', () => {
    assertDeepEqual(Object.keys(SurveyModel.schema.fields),
      ['survey', 'recipients', 'responses', 'answeredRecipientIds', 'transfers', 'ui', 'dirtyStructure', 'exportedOnce']);
    assertDeepEqual(Object.keys(SurveyModel.schema.view), ['tab', 'selectedQuestionId']);
    assertDeepEqual([...SurveyModel.schema.view.tab.values], ['draft', 'recipients', 'results']);
  });

  test('a new model has no content: loading the example does not ask before overwriting', () => {
    const m = new SurveyModel();
    assertEqual(m.hasContent(), false);
    assertEqual(m.survey.version, 1);
    assertEqual(m.survey.lang, 'de');
    assertEqual(m.tab, 'draft');
    assertEqual(m.selectedQuestionId, null);
    m.setHeader({ field: 'title', value: 'Nur ein Titel' });
    assertEqual(m.hasContent(), legacy(m.toJSON()).hasContent());
  });

  test('hasContent like the earlier model: a section alone is none, a question, recipient or response is', () => {
    const m = new SurveyModel();
    const s = m.addSection();
    assertEqual(m.hasContent(), false);
    m.addQuestion({ sectionId: s, type: 'text' });
    assertEqual(m.hasContent(), true);
    const r = new SurveyModel();
    r.addRecipient();
    assertEqual(r.hasContent(), true);
    assertEqual(load(EXAMPLE).hasContent(), true);
  });
});

suite('survey-builder model — getters like the earlier model', () => {
  for (const [name, json] of [['mixed', MIXED], ['example', EXAMPLE], ['corners', CORNERS]]) {
    test(`${name}: lookups, recipient status and counts, affected responses, export version`, () => {
      const l = legacy(json);
      const m = load(json);
      const ids = [...l.survey.sections.map((s) => s.id), ...l.survey.sections.flatMap((s) => s.questions.map((q) => q.id)), 'zz'];
      for (const id of ids) {
        assertDeepEqual(m.section(id), l.section(id), `section ${id}`);
        assertDeepEqual(m.question(id), l.question(id), `question ${id}`);
        assertDeepEqual(m.sectionOf(id), l.sectionOf(id), `sectionOf ${id}`);
        assertEqual(m.countAffectedResponses(id), l.countAffectedResponses(id), `affected ${id}`);
        for (const item of [...(l.question(id)?.options ?? []), ...(l.question(id)?.rows ?? [])]) {
          assertEqual(m.countAffectedResponses(id, item.id), l.countAffectedResponses(id, item.id), `affected ${id}/${item.id}`);
        }
      }
      for (const r of [...l.recipients, { id: 'zz' }]) {
        assertEqual(m.recipientStatus(r.id), l.recipientStatus(r.id), `status ${r.id}`);
        assertEqual(m.isOutdated(r.id), l.isOutdated(r.id), `outdated ${r.id}`);
      }
      assertDeepEqual(m.recipientCounts(), l.recipientCounts());
      assertEqual(m.nextExportVersion, l.nextExportVersion());
    });
  }
});

suite('survey-builder model — derived.results', () => {
  for (const [name, json] of [['example', EXAMPLE], ['mixed with filter and grouping', MIXED], ['corners', CORNERS]]) {
    test(`${name}: equals agentSnapshot() of the earlier results viewmodel`, () => {
      const m = load(json);
      const { results } = evaluateDerived(m, null);
      assertDeepEqual(results, legacySnapshot(json));
      assertDeepEqual(resultsSnapshot(m), results);
    });
  }

  test('example with a filter and a grouping set by command', () => {
    const json = copy(EXAMPLE);
    const m = load(json);
    m.setFilter({ questionId: 'q-group', optionId: 'o-industrie' });
    m.setGroupBy({ questionId: 'q-erp' });
    json.ui = { ...json.ui, filter: { questionId: 'q-group', optionId: 'o-industrie' }, groupBy: 'q-erp' };
    assertDeepEqual(evaluateDerived(m, null).results, legacySnapshot(json));
  });

  test('a filter whose option is gone is not applied, as before', () => {
    const json = copy(MIXED);
    json.ui.filter = { questionId: 'q1', optionId: 'zz' };
    const r = evaluateDerived(load(json), null).results;
    assertEqual(r.filter, null);
    assertDeepEqual(r, legacySnapshot(json));
  });
});
