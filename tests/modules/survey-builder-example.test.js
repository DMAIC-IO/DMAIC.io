/**
 * D.Mike — Survey builder example and help (survey-builder-example.test.js)
 * Pins the catalog entry, the hand-computed evaluation of the example
 * project and the help registration in the generated registry.
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §7, §10
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertClose } from '../test-utils.js';
import { HELP } from '../../js/core/help-registry.generated.js';
import { State } from '../../js/modules/survey-builder/survey-builder-model.js';
import {
  responseRate, ratingRanking, kanoOverview, freeTextSummary, groupComparison,
} from '../../js/modules/survey-builder/survey-stats.js';

const EXAMPLE_ID = 'survey-builder-software';

/**
 * Fetches and parses a JSON file relative to this test file.
 * @param {string} relPath - path relative to this module
 * @returns {Promise<object>} the parsed JSON
 */
async function fetchJson(relPath) {
  const url = new URL(relPath, import.meta.url);
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

/** @returns {Promise<State>} the example after the same fromJSON the module runs */
async function loadExample() {
  return State.fromJSON(await fetchJson(`../../examples/projects/${EXAMPLE_ID}.json`));
}

suite('survey-builder example — catalog and state', () => {
  test('the example is registered as a survey-builder project', async () => {
    const catalog = await fetchJson('../../examples/index.json');
    const entry = catalog.examples.find((e) => e.id === EXAMPLE_ID);
    assertTrue(!!entry, `${EXAMPLE_ID} missing from the catalog`);
    assertEqual(entry.type, 'project');
    assertEqual(entry.format, 'json');
    assertEqual(entry.file, `projects/${EXAMPLE_ID}.json`);
    assertDeepEqual(entry.modules, ['survey-builder']);
    for (const lang of ['de', 'en']) {
      assertTrue(typeof entry.title[lang] === 'string' && entry.title[lang].length > 0, `title.${lang}`);
      assertTrue(typeof entry.description[lang] === 'string' && entry.description[lang].length > 0, `description.${lang}`);
    }
  });

  test('fromJSON keeps every section, question, condition, recipient and response', async () => {
    const s = await loadExample();
    assertEqual(s.survey.title, 'Kundenbefragung Software-Support');
    assertEqual(s.survey.version, 1);
    assertEqual(s.survey.sections.length, 3);
    assertEqual(s.survey.sections.reduce((n, sec) => n + sec.questions.length, 0), 5);
    assertDeepEqual(s.section('s2').when, [{ questionId: 'q-group', optionIds: ['o-industrie'] }]);
    assertEqual(s.recipients.length, 3);
    assertEqual(s.responses.length, 6);
    assertDeepEqual(s.answeredRecipientIds, ['rec-1', 'rec-2', 'rec-3']);
  });
});

suite('survey-builder example — evaluation (hand-computed)', () => {
  test('response rate: 3 of 3 answered, 3 responses without recipient', async () => {
    const s = await loadExample();
    const r = responseRate({ recipients: s.recipients, responses: s.responses, answeredRecipientIds: s.answeredRecipientIds });
    assertEqual(r.sent, 3);
    assertEqual(r.answered, 3);
    assertEqual(r.rate, 1);
    assertEqual(r.withoutRecipient, 3);
  });

  test('ranking: Kompetenz 4.33 > Reaktionszeit 3.33 > Dokumentation 2.6', async () => {
    const s = await loadExample();
    const ranking = ratingRanking(s.survey, s.responses);
    assertDeepEqual(ranking.map((r) => r.text), ['Fachliche Kompetenz', 'Reaktionszeit des Supports', 'Dokumentation']);
    assertClose(ranking[0].mean, 26 / 6, 1e-9);
    assertClose(ranking[1].mean, 20 / 6, 1e-9);
    assertClose(ranking[2].mean, 2.6, 1e-9);
    assertEqual(ranking[2].n, 5, '"keine Angabe" does not count');
  });

  test('Kano overview: Live-Chat A, Statusanzeige O, Hotline M', async () => {
    const s = await loadExample();
    const byText = Object.fromEntries(kanoOverview(s.survey, s.responses).map((k) => [k.text, k]));
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
    const s = await loadExample();
    assertDeepEqual(freeTextSummary(s.survey, s.responses, []), { total: 5, taken: 0 });
  });

  test('group comparison by customer group: Reaktionszeit deviates, Live-Chat differs', async () => {
    const s = await loadExample();
    const cmp = groupComparison(s.survey, s.responses, 'q-group');
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

suite('survey-builder help — generated registry', () => {
  test('the module is registered under "survey-builder"', () => {
    assertTrue(!!HELP['survey-builder'], 'HELP["survey-builder"] missing — run npm run build');
    assertEqual(HELP['survey-builder'].moduleId, 'survey-builder');
  });

  test('all three sections exist with DE and EN content', () => {
    const { sections } = HELP['survey-builder'];
    for (const id of ['overview', 'methodology', 'pitfalls']) {
      for (const lang of ['de', 'en']) {
        const localized = sections[id] && sections[id][lang];
        assertTrue(!!localized, `section "${id}" has no "${lang}" version`);
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0, `section "${id}" (${lang}) has no title`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0, `section "${id}" (${lang}) has no blocks`);
      }
    }
  });

  test('German texts use real Unicode umlauts', () => {
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(HELP['survey-builder'].sections.overview.de)),
      'no umlaut in the German overview');
  });
});
