/**
 * D.Mike — Survey export (survey-export.js)
 *
 * Builds the self-contained questionnaire page (one HTML file, no external
 * resources) and its file name. The definition and strings travel as JSON
 * script blocks; the runner travels as its own source text.
 */

import { escAttr } from '../../core/html-utils.js';
import { runSurvey, RUNNER_CSS } from './survey-runner.js';

/**
 * JSON that is safe inside a <script> element: no `<` can close the tag or
 * open a comment, and U+2028/U+2029 cannot break older script parsers.
 * @param {*} value
 * @returns {string}
 */
export function embedJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Letters (umlauts included), digits, `_` and `-`; everything else becomes `_`.
 * @param {*} text
 * @returns {string}
 */
export function sanitizeFileNamePart(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/**
 * @param {{title: string, version: number}} survey
 * @param {{fileSurvey: string}} strings runner strings in the survey language
 * @param {{name: string}|null} recipient null for the general export
 * @returns {string}
 */
export function surveyFileName(survey, strings, recipient) {
  const who = recipient ? sanitizeFileNamePart(recipient.name) : '';
  return [sanitizeFileNamePart(strings.fileSurvey), sanitizeFileNamePart(survey.title), who || `v${survey.version}`]
    .filter(Boolean)
    .join('_') + '.html';
}

/**
 * @param {object} survey State.survey
 * @param {object} strings runnerStrings() result
 * @param {{recipientId?: string|null}} [options]
 * @returns {string} complete HTML document
 */
export function buildSurveyHtml(survey, strings, options = {}) {
  const lang = survey.lang === 'en' ? 'en' : 'de';
  const meta = { recipientId: options.recipientId || null };
  return [
    '<!DOCTYPE html>',
    `<html lang="${lang}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escAttr(survey.title || strings.untitled || '')}</title>`,
    `<style>${RUNNER_CSS}</style>`,
    '</head>',
    '<body>',
    `<noscript>${escAttr(strings.noscript || '')}</noscript>`,
    '<div id="survey"></div>',
    `<script type="application/json" id="survey-def">${embedJson(survey)}</script>`,
    `<script type="application/json" id="survey-strings">${embedJson(strings)}</script>`,
    `<script type="application/json" id="survey-meta">${embedJson(meta)}</script>`,
    '<script>',
    '(function () {',
    '  var read = function (id) { return JSON.parse(document.getElementById(id).textContent); };',
    `  (${runSurvey.toString()})(read('survey-def'), read('survey-strings'), {`,
    "    recipientId: read('survey-meta').recipientId,",
    "    root: document.getElementById('survey'),",
    '  });',
    '})();',
    '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/**
 * Runner strings in the questionnaire's language (not the app's), plus the
 * Kano answer labels shared with the kano module.
 * @param {import('../../core/i18n.js').I18n} i18n
 * @param {'de'|'en'} lang
 * @returns {Promise<object>}
 */
export async function runnerStrings(i18n, lang) {
  const runner = await i18n.section('modules.survey-builder.runner', lang);
  const kano = await i18n.section('modules.kano', lang);
  const importance = Array.from({ length: 9 }, (_, i) => String(i + 1));
  importance[0] = kano.importanceLow || importance[0];
  importance[8] = kano.importanceHigh || importance[8];
  return {
    ...runner,
    kanoScale: [1, 2, 3, 4, 5].map((i) => kano[`scale${i}`] || String(i)),
    kanoImportanceScale: importance,
    kanoEmpty: kano.scaleEmpty || '-',
  };
}
