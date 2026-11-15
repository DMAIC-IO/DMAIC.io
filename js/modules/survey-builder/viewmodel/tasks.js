/**
 * D.Mike — Survey builder: runs (viewmodel/tasks.js)
 *
 * `buildSurveyFile` builds the general questionnaire file (no recipient) in
 * the language of the questionnaire. The file carries the version the export
 * settles on; the model is marked as exported only once the file is built,
 * so a failure does not raise the version. Questionnaire, version and the
 * error text are read before the texts load.
 */
import { asyncTask } from '../../../core/async-task.js';
import { buildSurveyHtml, surveyFileName, runnerStringsOf } from '../io/questionnaire.js';
import { loadTexts } from './texts.js';

/** @param {any} v @returns {any} a plain deep copy */
const plain = (v) => JSON.parse(JSON.stringify(v));

export const asyncTasks = {
  buildSurveyFile: asyncTask({
    /**
     * @returns {Promise<{ fileName: string, content: string }>}
     */
    async run() {
      const model = /** @type {any} */ (this.model);
      const survey = plain(model.survey);
      survey.version = model.nextExportVersion;
      const failed = this.t('surveyFileFailed');
      let file;
      try {
        const strings = runnerStringsOf(await loadTexts(survey.lang));
        file = { fileName: surveyFileName(survey, strings, null), content: buildSurveyHtml(survey, strings, { recipientId: null }) };
      } catch (err) {
        throw new Error(failed, { cause: err });
      }
      model.markExported();
      return file;
    },
  }),
};
