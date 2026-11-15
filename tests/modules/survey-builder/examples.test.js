/**
 * Survey builder: the shipped example project — catalog entry, loading
 * through the model (migration 0→1.0) and the hand-computed evaluation.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertClose } from '../../test-utils.js';
import { SurveyModel } from '../../../js/modules/survey-builder/domain/model.js';
import { legacyResponses } from '../../../js/modules/survey-builder/domain/answers.js';
import {
  responseRate, ratingRanking, kanoOverview, freeTextSummary, groupComparison,
} from '../../../js/modules/survey-builder/domain/stats.js';

const EXAMPLE_ID = 'survey-builder-software';
const BASE = new URL('../../../js/modules/survey-builder/resources/examples/', import.meta.url);

/** @param {string} relPath relative to the examples folder @returns {Promise<any>} */
async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, BASE), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

/** @returns {Promise<any>} the example after the same fromJSON the module runs */
async function loadExample() {
  return SurveyModel.fromJSON(await fetchJson(`projects/${EXAMPLE_ID}.json`));
}

/** @param {any} m @returns {{ survey: any, responses: any[] }} the input of the pure modules */
const pure = (m) => ({ survey: m.survey, responses: legacyResponses(m) });

suite('survey-builder example — catalog and state', () => {
  test('examples.json lists the example as a project', async () => {
    const catalog = await fetchJson('examples.json');
    const entry = catalog.examples.find((e) => e.id === EXAMPLE_ID);
    assertTrue(!!entry, `${EXAMPLE_ID} missing from examples.json`);
    assertEqual(entry.type, 'project');
    assertEqual(entry.format, 'json');
    assertEqual(entry.file, `projects/${EXAMPLE_ID}.json`);
    for (const lang of ['de', 'en']) {
      assertTrue(typeof entry.title[lang] === 'string' && entry.title[lang].length > 0, `title.${lang}`);
      assertTrue(typeof entry.description[lang] === 'string' && entry.description[lang].length > 0, `description.${lang}`);
    }
  });

  test('fromJSON keeps every section, question, condition, recipient and response', async () => {
    const m = await loadExample();
    assertEqual(m.survey.title, 'Kundenbefragung Software-Support');
    assertEqual(m.survey.version, 1);
    assertEqual(m.survey.sections.length, 3);
    assertEqual(m.survey.sections.reduce((n, sec) => n + sec.questions.length, 0), 5);
    assertDeepEqual(m.section('s2').when, [{ questionId: 'q-group', optionIds: ['o-industrie'] }]);
    assertEqual(m.recipients.length, 3);
    assertEqual(m.responses.length, 6);
    assertDeepEqual([...m.answeredRecipientIds], ['rec-1', 'rec-2', 'rec-3']);
  });
});

suite('survey-builder example — evaluation (hand-computed)', () => {
  test('response rate: 3 of 3 answered, 3 responses without recipient', async () => {
    const m = await loadExample();
    const r = responseRate({ recipients: m.recipients, responses: legacyResponses(m), answeredRecipientIds: m.answeredRecipientIds });
    assertEqual(r.sent, 3);
    assertEqual(r.answered, 3);
    assertEqual(r.rate, 1);
    assertEqual(r.withoutRecipient, 3);
  });

  test('ranking: Kompetenz 4.33 > Reaktionszeit 3.33 > Dokumentation 2.6', async () => {
    const { survey, responses } = pure(await loadExample());
    const ranking = ratingRanking(survey, responses);
    assertDeepEqual(ranking.map((r) => r.text), ['Fachliche Kompetenz', 'Reaktionszeit des Supports', 'Dokumentation']);
    assertClose(ranking[0].mean, 26 / 6, 1e-9);
    assertClose(ranking[1].mean, 20 / 6, 1e-9);
    assertClose(ranking[2].mean, 2.6, 1e-9);
    assertEqual(ranking[2].n, 5, '"keine Angabe" does not count');
  });

  test('Kano overview: Live-Chat A, Statusanzeige O, Hotline M', async () => {
    const { survey, responses } = pure(await loadExample());
    const byText = Object.fromEntries(kanoOverview(survey, responses).map((k) => [k.text, k]));
    assertEqual(byText['Live-Chat im Support'].category, 'A');
    assertClose(byText['Live-Chat im Support'].cs, 4 / 6, 1e-9);
    assertClose(byText['Live-Chat im Support'].ds, 0, 1e-9);
    assertEqual(byText['Statusanzeige für Tickets'].category, 'O');
    assertClose(byText['Statusanzeige für Tickets'].cs, 1, 1e-9);
    assertClose(byText['Statusanzeige für Tickets'].ds, -1, 1e-9);
    assertEqual(byText['Hotline rund um die Uhr'].category, 'M');
    assertClose(byText['Hotline rund um die Uhr'].cs, 0, 1e-9);
    assertClose(byText['Hotline rund um die Uhr'].ds, -5 / 6, 1e-9);
  });

  test('free texts: 4 wishes plus 1 "Sonstiges" text, none taken', async () => {
    const { survey, responses } = pure(await loadExample());
    assertDeepEqual(freeTextSummary(survey, responses, []), { total: 5, taken: 0 });
  });

  test('group comparison by customer group: Reaktionszeit deviates, Live-Chat differs', async () => {
    const { survey, responses } = pure(await loadExample());
    const cmp = groupComparison(survey, responses, 'q-group');
    assertDeepEqual(cmp.groups.map((g) => [g.text, g.n, g.few]), [['Handel', 3, true], ['Industrie', 3, true]]);

    const rating = cmp.questions.find((p) => p.questionId === 'q-rating');
    const reaktion = rating.rows.find((r) => r.id === 'r-reaktion');
    assertClose(reaktion.cells[0].mean, 7 / 3, 1e-9);
    assertClose(reaktion.cells[1].mean, 13 / 3, 1e-9);
    assertDeepEqual(reaktion.cells.map((c) => c.deviates), [true, true]);
    const doku = rating.rows.find((r) => r.id === 'r-doku');
    assertClose(doku.cells[0].mean, 3, 1e-9);
    assertClose(doku.cells[1].mean, 7 / 3, 1e-9);
    assertDeepEqual(doku.cells.map((c) => c.deviates), [false, false]);

    const kano = cmp.questions.find((p) => p.questionId === 'q-kano');
    const chat = kano.rows.find((r) => r.id === 'k-chat');
    assertDeepEqual(chat.categories, ['A', 'I']);
    assertEqual(chat.differs, true);
    assertEqual(kano.rows.find((r) => r.id === 'k-status').differs, false);
  });
});
