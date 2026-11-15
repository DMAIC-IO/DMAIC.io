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
import { asyncTask } from '../../../core/async-task.js';
import { downloadBlob } from '../../../core/export-utils.js';
import { idOf, list, text } from '../../../core/model.js';
import { worksheetWrite, commitWorksheetWrite, completeStack, WriteError } from '../../../core/worksheet-write.js';
import { requireKnownId } from '../../../core/agent/agent-argcheck.js';
import { buildSurveyHtml, surveyFileName, runnerStringsOf } from '../io/questionnaire.js';
import { documentOrder, findQuestion } from '../domain/conditions.js';
import { legacyResponses } from '../domain/answers.js';
import { worksheetColumnsFor } from '../domain/handover/worksheet.js';
import { vocStack, openTexts } from '../domain/handover/voc.js';
import { kanoOwnEntries, kanoBackups, kanoStack } from '../domain/handover/kano.js';
import { loadTexts } from './texts.js';
import { reportDocument, reportFileName } from './report.js';

/** Keys of `ws.*`, the column names of the worksheet. */
const WS_KEYS = ['responseId', 'submittedAt', 'recipient', 'other', 'functional', 'dysfunctional', 'importance', 'category', 'question'];

/** What the hand-over reads from Kano. */
const KANO_FIELDS = ['items', 'respondents', 'options', 'source'];

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
  downloadBlob(new Blob([out.value.content], { type: 'text/html;charset=utf-8' }), out.value.fileName);
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
function failure(message, where, cause, { signal, notify, warned = false }) {
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
async function send(services, stack, where, failed, signal) {
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
const resultOf = (res, id) => (res.results ?? []).find((/** @type {any} */ r) => r.id === id)?.result;

/** @param {any} survey @returns {string[]} ids of its Kano questions */
const kanoQuestionIds = (survey) => (survey && Array.isArray(survey.sections)
  ? documentOrder(survey).filter((e) => e.question.type === 'kano').map((e) => e.question.id) : []);

/**
 * The data of the model as plain copies.
 * @param {any} model
 * @returns {{ survey: any, responses: any[], recipients: any[], transfers: any }}
 */
const snapshot = (model) => ({
  survey: plain(model.survey), responses: plain(model.responses), recipients: plain(model.recipients), transfers: plain(model.transfers),
});

/** @param {any} data @param {(key: string) => string} t @returns {string} the title, or the placeholder */
const titleOf = (data, t) => data.survey.title.trim() || t('report.untitled');

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
  buildReport: asyncTask({
    /**
     * The report under the active filter and grouping; nothing is downloaded.
     * @returns {Promise<{ fileName: string, content: string }>}
     */
    async run() {
      return { fileName: `${reportFileName(this)}.html`, content: reportDocument(this) };
    },
  }),
  toWorksheet: asyncTask({
    /**
     * All responses into a new worksheet in this phase, one row per response.
     * @param {object} _args @param {{ signal: AbortSignal }} ctl
     * @returns {Promise<{ instanceId: string }>}
     */
    async run(_args, { signal }) {
      const services = this._ui.services;
      const data = snapshot(this.model);
      const failed = this.t('handoverFailed');
      const strings = /** @type {any} */ (Object.fromEntries(WS_KEYS.map((k) => [k, this.t(`ws.${k}`)])));
      let plan;
      try {
        let write = worksheetWrite().newWorksheet({ name: titleOf(data, (k) => this.t(k)), fitRows: true });
        for (const c of worksheetColumnsFor(data, strings)) write = write.column({ name: c.name, type: c.type, values: c.values, role: c.role });
        plan = write.build();
      } catch (err) {
        throw failure(failed, 'toWorksheet', err, { signal, notify: services.notify });
      }
      // The name the sheet gets in the project, as the commit settles it.
      const rename = /** @type {any} */ (completeStack(services, plan).find((/** @type {any} */ a) => a.method === 'renameSheet'));
      const created = this.t('worksheetCreated', { name: rename?.args?.[1] ?? titleOf(data, (k) => this.t(k)) });
      let res;
      try {
        res = await commitWorksheetWrite(services, plan);
      } catch (err) {
        // commitWorksheetWrite has put a failed stack into the console itself.
        throw failure(failed, 'toWorksheet', err, { signal, notify: services.notify, warned: err instanceof WriteError });
      }
      services.notify(created, 'success');
      return { instanceId: res.instanceId };
    },
  }),
  takeToVocTree: asyncTask({
    params: { keys: list(text()) },
    /**
     * Free texts and „Sonstiges“ texts as voices into the project's first VoC
     * tree, or into a new one. An answer taken before is added again.
     * @param {{ keys: string[] }} args @param {{ signal: AbortSignal }} ctl
     * @returns {Promise<{ taken: number, instanceId: string|null }>}
     * @throws {Error} if `keys` is empty or a key names no non-empty answer
     */
    async run({ keys }, { signal }) {
      const services = this._ui.services;
      const instanceId = this._ui.instanceId;
      const data = snapshot(this.model);
      const texts = openTexts(data);
      if (keys.length === 0) throw new Error('invalid keys []; allowed: at least one answer key');
      keys.forEach((k, i) => requireKnownId(`keys[${i}]`, k, [...texts.keys()]));
      const treeId = services.instances.list({ modules: ['voc-ctx-tree'] })[0]?.instanceId ?? null;
      const stack = vocStack({
        treeId,
        entries: keys.map((k) => /** @type {{ text: string, name: string }} */ (texts.get(k))),
        sourceLabel: this.t('vocSource', { title: titleOf(data, (k) => this.t(k)) }),
        anonymous: data.survey.anonymous,
        surveyInstanceId: instanceId,
        keys,
      });
      const taken = this.t('vocTaken', { count: keys.length });
      const res = await send(services, stack, 'takeToVocTree', this.t('handoverFailed'), signal);
      services.notify(taken, 'success');
      return { taken: keys.length, instanceId: treeId ?? resultOf(res, 'tree')?.instanceId ?? null };
    },
  }),
  handOverToKano: asyncTask({
    params: { questionId: text() },
    /**
     * A Kano question with all responses, filter aside, to its chosen Kano
     * instance or to a new one in this phase. Only what came from this
     * question is replaced. Order: the other surveys, then Kano, then the
     * write stack.
     * @param {{ questionId: string }} args @param {{ signal: AbortSignal }} ctl
     * @returns {Promise<{ instanceId: string|null }>}
     * @throws {Error} if the question is no Kano question
     */
    async run({ questionId }, { signal }) {
      const services = this._ui.services;
      const instanceId = this._ui.instanceId;
      const data = snapshot(this.model);
      const ownKano = kanoQuestionIds(data.survey);
      requireKnownId('questionId', questionId, ownKano);
      const question = findQuestion(data.survey, questionId);
      const responses = legacyResponses(data);
      const labels = responses.map((_r, i) => this.t('respondentLabel', { n: i + 1 }));
      const failed = this.t('handoverFailed');
      const done = this.t('kanoHandedOver');
      const notifyFail = { signal, notify: services.notify };

      const surveys = services.instances.list({ modules: ['survey-builder'] });
      const phase = surveys.find((/** @type {any} */ i) => i.instanceId === instanceId)?.phase;
      if (!phase) throw failure(failed, 'handOverToKano', new Error('the survey is in no phase'), notifyFail);
      const remembered = data.transfers.kano[questionId];
      const kanoId = remembered && services.instances.list({ modules: ['kano'] }).some((/** @type {any} */ i) => i.instanceId === remembered.instanceId)
        ? remembered.instanceId : null;

      let kanoRead = null;
      let backups = /** @type {any[]} */ ([]);
      let own = { itemIds: /** @type {string[]} */ ([]), respondentIds: /** @type {string[]} */ ([]) };
      if (kanoId) {
        const known = [{ instanceId, transfers: data.transfers, kanoQuestionIds: ownKano }];
        for (const other of surveys) {
          if (other.instanceId === instanceId) continue;
          try {
            const r = /** @type {any} */ (await services.instances.read(other.instanceId, { fields: ['transfers', 'survey'] }));
            known.push({ instanceId: other.instanceId, transfers: { kano: r?.transfers?.kano ?? {} }, kanoQuestionIds: kanoQuestionIds(r?.survey) });
          } catch (err) {
            // Gone since the list: it has no marks to keep. Anything else could lose its marks.
            if (/** @type {any} */ (err)?.code !== 'unknown_instance') throw failure(failed, 'handOverToKano', err, notifyFail);
          }
        }
        const read = await send(services, [{
          op: 'instance.call', module: 'kano', instance: kanoId, method: 'read', args: [{ fields: KANO_FIELDS }],
        }], 'handOverToKano', failed, signal);
        const value = read.results?.[0]?.result?.value;
        if (!value || !Array.isArray(value.items) || !Array.isArray(value.respondents)) {
          throw failure(failed, 'handOverToKano', new Error('kano read gave no items or respondents'), notifyFail);
        }
        kanoRead = value;
        // The read stack has switched the view: the host no longer reports this run, a throw here must.
        try {
          backups = kanoBackups(value, known, kanoId);
          own = kanoOwnEntries(value, remembered, instanceId, questionId);
        } catch (err) {
          throw failure(failed, 'handOverToKano', err, notifyFail);
        }
      }
      let stack;
      try {
        stack = kanoStack({
          kanoId, phase, kanoRead, question, responses, recipients: data.recipients, anonymous: data.survey.anonymous,
          respondentLabel: (n) => labels[n - 1] ?? '', surveyInstanceId: instanceId, backups, own,
        });
      } catch (err) {
        throw failure(failed, 'handOverToKano', err, notifyFail);
      }
      const res = await send(services, stack, 'handOverToKano', failed, signal);
      services.notify(done, 'success');
      return { instanceId: kanoId ?? resultOf(res, 'kano')?.instanceId ?? null };
    },
  }),
};
