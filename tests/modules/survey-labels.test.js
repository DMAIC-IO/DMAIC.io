/**
 * D.Mike — Survey builder labels (survey-labels.test.js)
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import {
  localeOf, typeLabel, questionLabel, sectionPlaceholder, optionText, catLabel,
  recipientName, formatDateTime, fmtPct, fmtNum,
} from '../../js/modules/survey-builder/domain/labels.js';

const t = (key, params) => (params ? `${key}|${JSON.stringify(params)}` : key);
const i18n = (lang) => ({ getLanguage: () => lang });

suite('survey-labels — questions and options', () => {
  test('questionLabel trims the text and numbers an empty question in document order', () => {
    const q1 = { id: 'q1', type: 'single', text: '  Kundengruppe  ', when: null, options: [] };
    const q2 = { id: 'q2', type: 'text', text: '', when: null };
    const survey = { sections: [{ id: 's1', when: null, questions: [q1, q2] }] };
    assertEqual(questionLabel(survey, q1, t), 'Kundengruppe');
    assertEqual(questionLabel(survey, q2, t), 'questionNumber|{"n":2}');
  });

  test('typeLabel translates and falls back to the text type', () => {
    assertEqual(typeLabel('kano', t), 'typeKano');
    assertEqual(typeLabel('bogus', t), 'typeText');
  });

  test('sectionPlaceholder counts from one, optionText falls back to a placeholder', () => {
    assertEqual(sectionPlaceholder(0, t), 'sectionUntitled|{"n":1}');
    assertEqual(optionText({ text: 'Handel' }, t), 'Handel');
    assertEqual(optionText({ text: '' }, t), 'optionUntitled');
  });
});

suite('survey-labels — kano and recipients', () => {
  test('catLabel translates the category code and shows a dash without code', () => {
    assertEqual(catLabel('M', (k) => `T:kano.${k}`), 'T:kano.catM');
    assertEqual(catLabel(null, (k) => `T:kano.${k}`), '—');
  });

  test('recipientName trims and returns null for unknown, unnamed or missing ids', () => {
    const recipients = [{ id: 'a', name: '  Firma A ' }, { id: 'b', name: '   ' }];
    assertEqual(recipientName(recipients, 'a'), 'Firma A');
    assertEqual(recipientName(recipients, 'b'), null);
    assertEqual(recipientName(recipients, 'x'), null);
    assertEqual(recipientName(recipients, null), null);
  });
});

suite('survey-labels — formatting', () => {
  test('localeOf follows the app language', () => {
    assertEqual(localeOf(i18n('en')), 'en-US');
    assertEqual(localeOf(i18n('de')), 'de-DE');
  });

  test('fmtPct rounds to whole percent and shows a dash without base', () => {
    assertEqual(fmtPct(0.424), '42 %');
    assertEqual(fmtPct(null), '—');
    assertEqual(fmtPct(undefined), '—');
  });

  test('fmtNum uses the locale and fixed decimals', () => {
    assertEqual(fmtNum(1.5, 2, 'de-DE'), '1,50');
    assertEqual(fmtNum(1.5, 2, 'en-US'), '1.50');
    assertEqual(fmtNum(null, 2, 'de-DE'), '—');
  });

  test('formatDateTime shows a dash for empty or broken input', () => {
    assertEqual(formatDateTime(null, 'de-DE'), '–');
    assertEqual(formatDateTime('kein Datum', 'de-DE'), '–');
    assertTrue(formatDateTime('2026-10-10T09:30:00.000Z', 'de-DE').includes('10.10.'));
  });
});
