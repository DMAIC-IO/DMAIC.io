/**
 * D.Mike — Survey builder: helpers of the runs (viewmodel/tasks.js)
 *
 * The runs themselves are declared in viewmodel.js (`asyncTasks`).
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
 *
 * The hand-overs `toWorksheet`, `takeToVocTree` and `handOverToKano` send
 * one stack each through `instances.interact`: all or nothing. Kano is read
 * with a stack of its own, the other surveys before it with
 * `instances.read`. A stack may switch the view and tear this viewmodel
 * down, which cancels the run; it goes on regardless. So everything a run
 * needs is read into locals before its first `await` — the model as plain
 * copies, the services, the own instance id, the texts — and nothing but the
 * stack writes afterwards: the marks the survey keeps (`setKanoTransfer`,
 * `markVocTaken`) are steps of the stack. A failure ends the run with the
 * module's own text; the cause goes to the console.
 */
import { downloadBlob } from '../../../core/export-utils.js';
import { buildSurveyHtml, surveyFileName, runnerStringsOf } from '../io/questionnaire.js';
import { documentOrder } from '../domain/conditions.js';
import { loadTexts } from './texts.js';

/** Keys of `ws.*`, the column names of the worksheet. */
export const WS_KEYS = ['responseId', 'submittedAt', 'recipient', 'other', 'functional', 'dysfunctional', 'importance', 'category', 'question'];

/** What the hand-over reads from Kano. */
export const KANO_FIELDS = ['items', 'respondents', 'options', 'source'];

/** @param {any} v @returns {any} a plain deep copy */
export const plain = (v) => JSON.parse(JSON.stringify(v));

/** The type of the questionnaire, recipient and report files. */
export const HTML_TYPE = 'text/html;charset=utf-8';

/**
 * The questionnaire file in the language of the questionnaire, with the
 * version the export settles on.
 * @param {any} survey plain copy, `version` already settled
 * @param {any} recipient plain copy of the recipient, or null for the general file
 * @param {string} failed the error text if the build fails
 * @returns {Promise<{ fileName: string, mimeType: string, content: string }>}
 * @throws {Error} with `failed` as message and the cause attached
 */
export async function buildFile(survey, recipient, failed) {
  try {
    const strings = runnerStringsOf(await loadTexts(survey.lang));
    return {
      fileName: surveyFileName(survey, strings, recipient),
      mimeType: HTML_TYPE,
      content: buildSurveyHtml(survey, strings, { recipientId: recipient ? recipient.id : null }),
    };
  } catch (err) {
    throw new Error(failed, { cause: err });
  }
}

/**
 * Starts a run from the interface; a run that cannot start is reported.
 * @param {any} vm the component @param {any} ctx module context
 * @param {string} name the run @param {object} args its arguments
 * @returns {Promise<import('../../../core/async-task.js').TaskOutcome>}
 */
export async function startTask(vm, ctx, name, args) {
  const out = await vm._asyncTaskHost.start(name, args);
  if (out.status === 'rejected') ctx.notify(ctx.i18n.t('common.asyncTask.rejected', { reason: out.reason }), 'error');
  return out;
}

/**
 * Starts a run that builds a file and downloads it; a run that cannot
 * start is reported.
 * @param {any} vm the component @param {any} ctx module context
 * @param {string} name the run @param {object} args its arguments
 * @returns {Promise<void>}
 */
export async function downloadBuiltFile(vm, ctx, name, args) {
  const out = await startTask(vm, ctx, name, args);
  if (out.status !== 'done') return;
  downloadBlob(new Blob([out.value.content], { type: out.value.mimeType }), out.value.fileName);
}

/**
 * The error a hand-over ends with: the module's own text; the cause goes to
 * the console. A run whose view was torn down meanwhile is no longer
 * reported by its host, so it reports itself.
 * @param {string} message translated text @param {string} where name of the run
 * @param {unknown} cause @param {{ signal: AbortSignal, notify: Function, warned?: boolean }} run
 *   `warned`: the cause is in the console already
 * @returns {Error}
 */
export function failure(message, where, cause, { signal, notify, warned = false }) {
  if (!warned) console.warn(`[survey-builder] ${where} failed`, cause);
  if (signal.aborted) notify(message, 'error');
  return new Error(message, { cause });
}

/**
 * Sends a stack; a stack that is not written ends the run.
 * @param {any} services @param {any[]} stack @param {string} where @param {string} failed
 * @param {AbortSignal} signal
 * @returns {Promise<any>} the answer of a written stack
 */
export async function send(services, stack, where, failed, signal) {
  let res;
  try {
    res = await services.instances.interact(stack);
  } catch (err) {
    throw failure(failed, where, err, { signal, notify: services.notify });
  }
  if (res?.ok !== true) throw failure(failed, where, res, { signal, notify: services.notify });
  return res;
}

/**
 * @param {any} res answer of a stack @param {string} id id of a step
 * @returns {any} the result of that step
 */
export const resultOf = (res, id) => (res.results ?? []).find((/** @type {any} */ r) => r.id === id)?.result;

/** @param {any} survey @returns {string[]} ids of its Kano questions */
export const kanoQuestionIds = (survey) => (survey && Array.isArray(survey.sections)
  ? documentOrder(survey).filter((e) => e.question.type === 'kano').map((e) => e.question.id) : []);

/**
 * The data of the model as plain copies.
 * @param {any} model
 * @returns {{ survey: any, responses: any[], recipients: any[], transfers: any }}
 */
export const snapshot = (model) => ({
  survey: plain(model.survey), responses: plain(model.responses), recipients: plain(model.recipients), transfers: plain(model.transfers),
});

/** @param {any} data @param {(key: string) => string} t @returns {string} the title, or the placeholder */
export const titleOf = (data, t) => data.survey.title.trim() || t('report.untitled');
