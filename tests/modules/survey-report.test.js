/**
 * D.Mike — Survey report tests (survey-report.test.js)
 * Sections present, names only when allowed, escaping, CSS bars.
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §7.3
 */

import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { buildReportHtml } from '../../js/modules/survey-builder/survey-report.js';
import { SURVEY, RESPONSES } from './fixtures/survey-fixture.js';

const STRINGS = {
  untitled: 'Fragebogen', period: 'Zeitraum: {from} – {to}', generated: 'Erstellt am {date}',
  rateTitle: 'Rücklauf', rateLine: '{sent} verschickt · {answered} beantwortet ({rate})',
  withoutRecipient: '{count} Antworten ohne Empfänger', groupNone: 'ohne Gruppe', colGroup: 'Gruppe',
  colSent: 'verschickt', colAnswered: 'beantwortet', colRate: 'Quote',
  summaryTitle: 'Zusammenfassung', topTitle: 'Top-Prioritäten', colItem: 'Merkmal', colN: 'n',
  colMean: 'Mittelwert', colMedian: 'Median', colTop: 'Anteil 4–5', colNa: 'k. A.',
  kanoTitle: 'Kano-Überblick', colCategory: 'Kategorie', colBetter: 'Better', colWorse: 'Worse',
  colImportance: 'Wichtigkeit', freeText: '{total} offene Antworten, {taken} in den VoC-Baum übernommen',
  groupsTitle: 'Gruppenvergleich nach „{question}“', fewResponses: 'wenig Antworten', meanShort: 'Ø {value}', differs: 'unterschiedlich',
  questionsTitle: 'Alle Fragen', nResponses: 'n = {n}', other: 'Sonstige', filter: 'Gefiltert: {question} = {option}',
  noResponses: 'Noch keine Antworten.', anonymous: 'anonym',
  cat: { M: 'Basis', O: 'Leistung', A: 'Begeisterung', I: 'Indifferent', R: 'Umgekehrt', Q: 'Widersprüchlich' },
};
const RECIPIENTS = [{ id: 'p1', name: 'Anna Beispiel', organisation: '', group: 'Kunde', email: '', note: '', sentAt: '2026-10-01', sentVersion: 1 }];
const data = (survey = SURVEY) => ({ survey, recipients: RECIPIENTS, responses: RESPONSES, answeredRecipientIds: ['p1'] });
const OPTS = { locale: 'de-DE', withNames: false, filter: null, groupBy: null, vocKeys: [], generatedAt: '2026-10-10T12:00:00Z' };
const html = (over = {}, survey) => buildReportHtml(data(survey), STRINGS, { ...OPTS, ...over });

suite('survey-report — structure', () => {
  test('is a complete document with print CSS', () => {
    const h = html();
    assertTrue(h.startsWith('<!DOCTYPE html>'));
    assertTrue(h.includes('@media print'));
    assertTrue(h.includes('<html lang="de">'));
  });

  test('html lang follows the report language, not the survey language', () => {
    assertTrue(html({ locale: 'en-US' }, { ...SURVEY, lang: 'de' }).includes('<html lang="en">'));
    assertTrue(html({ locale: 'de-DE' }, { ...SURVEY, lang: 'en' }).includes('<html lang="de">'));
  });

  test('contains rate, summary and question sections', () => {
    const h = html();
    for (const s of ['rate', 'summary', 'questions']) assertTrue(h.includes(`data-section="${s}"`), s);
    assertTrue(!h.includes('data-section="groups"'), 'no group section without groupBy');
    for (const id of ['g', 'm', 'c', 'r', 'k', 't']) assertTrue(h.includes(`data-question-id="${id}"`), id);
    assertTrue(!h.includes('data-question-id="i"'), 'info questions are skipped');
  });

  test('period from first to last submittedAt', () => {
    assertTrue(html().includes('Zeitraum: 1.10.2026 – 5.10.2026'));
  });

  test('summary shows rate line, free-text line and Kano categories', () => {
    const h = html({ vocKeys: ['x2:m:other'] });
    assertTrue(h.includes('1 verschickt · 1 beantwortet (100 %)'));
    assertTrue(h.includes('3 offene Antworten, 1 in den VoC-Baum übernommen'));
    assertTrue(h.includes('Leistung'));
  });

  test('bars are CSS widths, no SVG', () => {
    const h = html();
    assertTrue(h.includes('class="bar__fill" style="width:60%"'), 'option ga has 60 %');
    assertTrue(!h.includes('<svg'));
  });

  test('group comparison when groupBy is set', () => {
    const h = html({ groupBy: 'g' });
    assertTrue(h.includes('data-section="groups"'));
    assertTrue(h.includes('Gruppenvergleich nach „G“'));
    assertTrue(h.includes('wenig Antworten'));
    assertTrue(/class="num deviates"/.test(h));
  });

  test('filter is applied and named', () => {
    const h = html({ filter: { questionId: 'g', optionId: 'gb' } });
    assertTrue(h.includes('Gefiltert: G = B'));
    assertTrue(!h.includes('Faster'), 'x1 is filtered out');
  });

  test('no responses: a note instead of empty tables', () => {
    const h = buildReportHtml({ ...data(), responses: [] }, STRINGS, OPTS);
    assertTrue(h.includes('Noch keine Antworten.'));
  });
});

suite('survey-report — names and escaping', () => {
  test('no names by default', () => {
    assertTrue(!html().includes('Anna Beispiel'));
  });

  test('names with the switch on', () => {
    assertTrue(html({ withNames: true }).includes('Anna Beispiel'));
  });

  test('never names when the survey is anonymous', () => {
    assertTrue(!html({ withNames: true }, { ...SURVEY, anonymous: true }).includes('Anna Beispiel'));
  });

  test('texts are escaped', () => {
    const s = { ...SURVEY, title: '</title><script>alert(1)</script>' };
    const h = html({}, s);
    assertTrue(!h.includes('<script>alert(1)'));
    assertTrue(h.includes('&lt;/title&gt;&lt;script&gt;'));
  });

  test('untitled survey uses the fallback title', () => {
    assertEqual(/<title>([^<]*)<\/title>/.exec(html({}, { ...SURVEY, title: '' }))[1], 'Fragebogen');
  });
});
