/**
 * D.Mike — Survey builder: the report (viewmodel/report.js)
 *
 * The report of the results as one self-contained HTML text, under the
 * active filter and grouping, in the interface language. It is the HTML
 * export of the export menu and the result of the task `buildReport`; both
 * build it here. Free texts carry the names of the recipients only when the
 * survey is not anonymous and `ui.reportWithNames` is set. The texts are the
 * module's own (`report.*`, `kano.cat*`).
 */
import { buildReportHtml, reportStrings } from '../domain/report.js';
import { legacyResponses } from '../domain/answers.js';
import { localeOf } from '../domain/labels.js';
import { sanitizeFileNamePart } from '../io/questionnaire.js';

/** @param {any} v @returns {any} a plain deep copy */
const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * The name of the report file, without extension: `Bericht_<title>`, both
 * parts made safe for a file name as for the questionnaire files.
 * @param {any} vm the component
 * @returns {string} the name; without a title the placeholder stands in
 */
export function reportFileName(vm) {
  const title = String(vm.model.survey.title).trim() || vm.t('report.untitled');
  return `${sanitizeFileNamePart(vm.t('fileReport'))}_${sanitizeFileNamePart(title)}`;
}

/**
 * The report as HTML text.
 * @param {any} vm the component (model, results, `t`, `_ui`)
 * @returns {string} the complete HTML document
 */
export function reportDocument(vm) {
  const model = vm.model;
  const survey = plain(model.survey);
  const results = vm.results;
  return buildReportHtml({
    survey,
    recipients: plain(model.recipients),
    responses: legacyResponses({ survey, responses: plain(model.responses) }),
    answeredRecipientIds: plain(model.answeredRecipientIds),
  }, reportStrings((/** @type {string} */ key) => vm.t(key)), {
    locale: localeOf(vm._ui.i18n),
    withNames: !survey.anonymous && Boolean(model.ui.reportWithNames),
    filter: results.filter ? plain(results.filter) : null,
    groupBy: results.groupBy,
    vocKeys: plain(model.transfers.vocTree.responseKeys),
    generatedAt: new Date().toISOString(),
  });
}
