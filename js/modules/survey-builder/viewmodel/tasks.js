/**
 * D.Mike — Survey builder: runs (viewmodel/tasks.js)
 *
 * `buildSurveyFile` builds the general questionnaire file (no recipient) in
 * the language of the questionnaire. The file carries the version the export
 * settles on; the model is marked as exported only once the file is built,
 * so a failure does not raise the version. Questionnaire, version and the
 * error text are read before the texts load.
 *
 * `buildRecipientFile` builds the file of one recipient the same way, with
 * the recipient's id in it and their name in the file name; once it is
 * built, the export is marked and the recipient is marked as sent with the
 * version it settled on.
 */
import { asyncTask } from '../../../core/async-task.js';
import { downloadBlob } from '../../../core/export-utils.js';
import { idOf } from '../../../core/model.js';
import { buildSurveyHtml, surveyFileName, runnerStringsOf } from '../io/questionnaire.js';
import { loadTexts } from './texts.js';

/** @param {any} v @returns {any} a plain deep copy */
const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * The questionnaire file in the language of the questionnaire, with the
 * version the export settles on.
 * @param {any} survey plain copy, `version` already settled
 * @param {any} recipient plain copy of the recipient, or null for the general file
 * @param {string} failed the error text if the build fails
 * @returns {Promise<{ fileName: string, content: string }>}
 * @throws {Error} with `failed` as message and the cause attached
 */
async function buildFile(survey, recipient, failed) {
  try {
    const strings = runnerStringsOf(await loadTexts(survey.lang));
    return {
      fileName: surveyFileName(survey, strings, recipient),
      content: buildSurveyHtml(survey, strings, { recipientId: recipient ? recipient.id : null }),
    };
  } catch (err) {
    throw new Error(failed, { cause: err });
  }
}

/**
 * Starts a run that builds a file and downloads it; a run that cannot
 * start is reported.
 * @param {any} vm the component @param {any} ctx module context
 * @param {string} name the run @param {object} args its arguments
 * @returns {Promise<void>}
 */
export async function downloadBuiltFile(vm, ctx, name, args) {
  const out = await vm._asyncTaskHost.start(name, args);
  if (out.status === 'rejected') ctx.notify(ctx.i18n.t('common.asyncTask.rejected', { reason: out.reason }), 'error');
  if (out.status !== 'done') return;
  downloadBlob(new Blob([out.value.content], { type: 'text/html;charset=utf-8' }), out.value.fileName);
}

export const asyncTasks = {
  buildSurveyFile: asyncTask({
    /**
     * @returns {Promise<{ fileName: string, content: string }>}
     */
    async run() {
      const model = /** @type {any} */ (this.model);
      const survey = plain(model.survey);
      survey.version = model.nextExportVersion;
      const file = await buildFile(survey, null, this.t('surveyFileFailed'));
      model.markExported();
      return file;
    },
  }),
  buildRecipientFile: asyncTask({
    params: { recipientId: idOf('recipients') },
    /**
     * A recipient deleted while the texts load leaves everything as it was.
     * @param {{ recipientId: string }} args
     * @returns {Promise<{ fileName: string, content: string }>}
     */
    async run({ recipientId }) {
      const model = /** @type {any} */ (this.model);
      const survey = plain(model.survey);
      const recipient = plain(model.recipients.find((/** @type {any} */ r) => r.id === recipientId));
      survey.version = model.nextExportVersion;
      const failed = this.t('recipientFileFailed');
      const file = await buildFile(survey, recipient, failed);
      if (!model.recipients.some((/** @type {any} */ r) => r.id === recipientId)) throw new Error(failed);
      model.markExported();
      model.markSent({ recipientId });
      return file;
    },
  }),
};
