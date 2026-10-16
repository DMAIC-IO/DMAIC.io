/**
 * D.Mike — Survey export tests (survey-export.test.js)
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §5.1
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import {
  buildSurveyHtml, surveyFileName, sanitizeFileNamePart, embedJson, runnerStrings,
} from '../../js/modules/survey-builder/survey-export.js';
import { runSurvey } from '../../js/modules/survey-builder/survey-runner.js';
import { CONDITION_CASES } from '../../js/modules/survey-builder/survey-conditions.js';
import { I18n } from '../../js/core/i18n.js';

const STRINGS = { untitled: 'Fragebogen', noscript: 'JavaScript nötig', fileSurvey: 'Fragebogen' };
const block = (html, id) => JSON.parse(
  html.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`))[1],
);

suite('survey-export — embedJson', () => {
  test('escapes < and line separators and stays valid JSON', () => {
    const value = { t: '</script><!-- \u2028\u2029' };
    const s = embedJson(value);
    assertEqual(s.includes('<'), false);
    assertEqual(/[\u2028\u2029]/.test(s), false);
    assertDeepEqual(JSON.parse(s), value);
  });
});

suite('survey-export — buildSurveyHtml', () => {
  const evil = JSON.parse(JSON.stringify(CONDITION_CASES[0].survey));
  evil.title = '</script><script>alert(1)</script> "Größe" & Co';
  evil.sections[0].questions[0].options[0].text = '<!-- Kunde \u2028';
  const html = buildSurveyHtml(evil, STRINGS, { recipientId: 'r1' });

  test('escapes script-breaking text', () => {
    assertEqual(html.split('</script>').length - 1, 4);
    assertEqual(html.includes('<!--'), false);
    assertDeepEqual(block(html, 'survey-def'), evil);
    assertTrue(html.includes('<title>&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt; &quot;Größe&quot; &amp; Co</title>'));
  });

  test('embeds the recipient id', () => {
    assertDeepEqual(block(html, 'survey-meta'), { recipientId: 'r1' });
  });

  test('general export carries recipient null', () => {
    assertDeepEqual(block(buildSurveyHtml(evil, STRINGS), 'survey-meta'), { recipientId: null });
  });

  test('embeds strings, language and the runner', () => {
    assertDeepEqual(block(html, 'survey-strings'), STRINGS);
    assertTrue(html.startsWith('<!DOCTYPE html>\n<html lang="de">'));
    assertTrue(html.includes(runSurvey.toString()));
    assertTrue(html.includes('<div id="survey"></div>'));
  });

  test('loads nothing from outside', () => {
    assertEqual(/\s(src|href)=/i.test(html), false);
  });
});

suite('survey-export — file names', () => {
  const survey = { title: 'VoC 2026', version: 3 };
  test('sanitises and keeps umlauts', () => {
    assertEqual(sanitizeFileNamePart(' Kundenbefragung: Größe/Preis? '), 'Kundenbefragung_Größe_Preis');
  });
  test('caps at 60 characters', () => {
    assertEqual(sanitizeFileNamePart('x'.repeat(80)).length, 60);
  });
  test('recipient file', () => {
    assertEqual(surveyFileName(survey, STRINGS, { name: 'Anna Müller' }), 'Fragebogen_VoC_2026_Anna_Müller.html');
  });
  test('general file', () => {
    assertEqual(surveyFileName(survey, STRINGS, null), 'Fragebogen_VoC_2026_v3.html');
  });
  test('nameless recipient falls back to the version', () => {
    assertEqual(surveyFileName(survey, STRINGS, { name: '  ' }), 'Fragebogen_VoC_2026_v3.html');
  });
  test('untitled survey', () => {
    assertEqual(surveyFileName({ title: '', version: 1 }, STRINGS, null), 'Fragebogen_v1.html');
  });
});

suite('survey-export — runnerStrings', () => {
  test('merges runner and kano labels in the survey language', async () => {
    const i18n = new I18n('en');
    i18n._cache.set('de', { modules: {
      'survey-builder': { runner: { save: 'Antworten speichern' } },
      kano: { scale1: 'Das würde mich sehr freuen', importanceLow: '1 — völlig unwichtig',
        importanceHigh: '9 — außerordentlich wichtig', scaleEmpty: '—' },
    } });
    i18n._cache.set('en', { modules: { 'survey-builder': { runner: { save: 'Save answers', reset: 'Start over' } }, kano: {} } });
    const s = await runnerStrings(i18n, 'de');
    assertEqual(s.save, 'Antworten speichern');
    assertEqual(s.reset, 'Start over');
    assertEqual(s.kanoScale[0], 'Das würde mich sehr freuen');
    assertEqual(s.kanoScale[4], '5');
    assertEqual(s.kanoImportanceScale.length, 9);
    assertEqual(s.kanoImportanceScale[0], '1 — völlig unwichtig');
    assertEqual(s.kanoImportanceScale[4], '5');
    assertEqual(s.kanoEmpty, '—');
  });
});
