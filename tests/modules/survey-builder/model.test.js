/**
 * Tests for js/modules/survey-builder/domain/model.js — schema, defaults,
 * `hasContent`, the getters the views read and `derived.results`, each
 * against the earlier model and the earlier results viewmodel
 * (`agentSnapshot()`) on the same stored states, frozen in
 * fixtures/legacy-oracles.json.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { SurveyModel } from '../../../js/modules/survey-builder/domain/model.js';
import { resultsSnapshot } from '../../../js/modules/survey-builder/domain/results.js';
import { QUESTION_TYPES } from '../../../js/modules/survey-builder/domain/conditions.js';
import { EXAMPLE, MIXED, CORNERS, copy, load, frozen } from './cases.js';

/**
 * `agentSnapshot()` of the earlier results viewmodel on a stored state, frozen.
 * @param {string} key @param {object} json earlier form @returns {object} the earlier results tab as numbers
 */
function legacySnapshot(key, json) {
  return frozen(`results ${key}`, ({ Legacy, ResultsViewModel, t, fakeContext, attach }) => {
    const vm = new ResultsViewModel({ t, context: fakeContext(), container: () => null });
    attach(vm, Legacy.fromJSON(copy(json)));
    return vm.agentSnapshot();
  });
}

/**
 * What a model answers for every section, question, option, row and
 * recipient id of a stored state (plus the unknown id `zz`).
 * @param {any} m a model (earlier or declarative) @param {boolean} getter `nextExportVersion` is a getter (declarative)
 * @returns {object}
 */
function lookups(m, getter) {
  const ids = [...m.survey.sections.map((s) => s.id), ...m.survey.sections.flatMap((s) => s.questions.map((q) => q.id)), 'zz'];
  const out = { ids: {}, recipients: {} };
  for (const id of ids) {
    const items = [...(m.question(id)?.options ?? []), ...(m.question(id)?.rows ?? [])];
    out.ids[id] = {
      section: m.section(id), question: m.question(id), sectionOf: m.sectionOf(id),
      affected: m.countAffectedResponses(id),
      items: Object.fromEntries(items.map((x) => [x.id, m.countAffectedResponses(id, x.id)])),
    };
  }
  for (const r of [...m.recipients, { id: 'zz' }]) {
    out.recipients[r.id] = { status: m.recipientStatus(r.id), outdated: m.isOutdated(r.id) };
  }
  out.counts = m.recipientCounts();
  out.nextExportVersion = getter ? m.nextExportVersion : m.nextExportVersion();
  return JSON.parse(JSON.stringify(out));
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
    // The earlier hasContent counted questions, recipients and responses only.
    assertEqual(m.hasContent(), frozen('hasContent title only', ({ Legacy }) => Legacy.fromJSON(m.toJSON()).hasContent()));
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
      const want = frozen(`getters ${name}`, ({ Legacy }) => lookups(Legacy.fromJSON(copy(json)), false));
      assertDeepEqual(lookups(load(json), true), want);
    });
  }
});

suite('survey-builder model — derived.results', () => {
  for (const [name, json] of [['example', EXAMPLE], ['mixed with filter and grouping', MIXED], ['corners', CORNERS]]) {
    test(`${name}: equals agentSnapshot() of the earlier results viewmodel`, () => {
      const m = load(json);
      const { results } = evaluateDerived(m, null);
      assertDeepEqual(results, legacySnapshot(name, json));
      assertDeepEqual(resultsSnapshot(m), results);
    });
  }

  test('example with a filter and a grouping set by command', () => {
    const json = copy(EXAMPLE);
    const m = load(json);
    m.setFilter({ questionId: 'q-group', optionId: 'o-industrie' });
    m.setGroupBy({ questionId: 'q-erp' });
    json.ui = { ...json.ui, filter: { questionId: 'q-group', optionId: 'o-industrie' }, groupBy: 'q-erp' };
    assertDeepEqual(evaluateDerived(m, null).results, legacySnapshot('example filter and grouping', json));
  });

  test('a filter whose option is gone is not applied, as before', () => {
    const json = copy(MIXED);
    json.ui.filter = { questionId: 'q1', optionId: 'zz' };
    const r = evaluateDerived(load(json), null).results;
    assertEqual(r.filter, null);
    assertDeepEqual(r, legacySnapshot('mixed stale filter', json));
  });
});
