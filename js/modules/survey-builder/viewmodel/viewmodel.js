/**
 * D.Mike — Survey builder: viewmodel (viewmodel/viewmodel.js)
 *
 * A questionnaire is drafted (sections, questions, options, conditions),
 * sent to recipients as self-contained HTML files, and the returned answer
 * files are read in and evaluated. Data and commands live in the model
 * (domain/model.js), the agent surface comes from its schema. The interface
 * is put together from view parts, one per area of the draft.
 *
 * The runs (`asyncTasks`) build the questionnaire, recipient and report
 * files and do the hand-overs to other modules; what they share is in
 * tasks.js, which also says how the hand-overs work.
 */
import { createModule } from '../../../core/template-module.js';
import { setFields, cloneJSON, idOf, list, text } from '../../../core/model.js';
import { uid } from '../../../core/uid.js';
import descriptor from '../module.js';
import { SurveyModel } from '../domain/model.js';
import { UiState } from './state.js';
import { asyncTask } from '../../../core/async-task.js';
import { worksheetWrite, commitWorksheetWrite, completeStack, WriteError } from '../../../core/worksheet-write.js';
import { requireKnownId } from '../../../core/agent/agent-argcheck.js';
import { findQuestion } from '../domain/conditions.js';
import { legacyResponses } from '../domain/answers.js';
import { worksheetColumnsFor } from '../domain/handover/worksheet.js';
import { vocStack, openTexts } from '../domain/handover/voc.js';
import { kanoOwnEntries, kanoBackups, kanoStack } from '../domain/handover/kano.js';
import {
  WS_KEYS, KANO_FIELDS, HTML_TYPE, plain, buildFile, failure, send, resultOf, kanoQuestionIds, snapshot, titleOf,
} from './tasks.js';
import { reportDocument, reportFileName } from './report.js';
import { outlineView } from './outline.js';
import { propertiesView } from './properties.js';
import { conditionsView } from './conditions.js';
import { questionnaireView } from './questionnaire.js';
import { recipientsView } from './recipients.js';
import { responsesView } from './responses.js';
import { resultsView } from './results.js';
import { chartsView } from './charts.js';
import { handoverView } from './handover.js';

export default createModule({
  descriptor,
  Model: SurveyModel,
  State: UiState,
  asyncTasks: {
    buildSurveyFile: asyncTask({
      /**
       * A cancelled run leaves version and export mark as they were.
       * @param {object} _args @param {{ signal: AbortSignal }} ctl
       * @returns {Promise<{ fileName: string, mimeType: string, content: string }>}
       */
      async run(_args, { signal }) {
        const model = /** @type {any} */ (this.model);
        const survey = plain(model.survey);
        survey.version = model.nextExportVersion;
        const file = await buildFile(survey, null, this.t('surveyFileFailed'));
        signal.throwIfAborted();
        model.markExported();
        return file;
      },
    }),
    buildRecipientFile: asyncTask({
      params: { recipientId: idOf('recipients') },
      /**
       * A recipient deleted while the texts load, or a cancelled run, leaves
       * everything as it was.
       * @param {{ recipientId: string }} args @param {{ signal: AbortSignal }} ctl
       * @returns {Promise<{ fileName: string, mimeType: string, content: string }>}
       */
      async run({ recipientId }, { signal }) {
        const model = /** @type {any} */ (this.model);
        const survey = plain(model.survey);
        const recipient = plain(model.recipients.find((/** @type {any} */ r) => r.id === recipientId));
        survey.version = model.nextExportVersion;
        const failed = this.t('recipientFileFailed');
        const file = await buildFile(survey, recipient, failed);
        signal.throwIfAborted();
        if (!model.recipients.some((/** @type {any} */ r) => r.id === recipientId)) throw new Error(failed);
        model.markExported();
        model.markSent({ recipientId });
        return file;
      },
    }),
    buildReport: asyncTask({
      /**
       * The report under the active filter and grouping; nothing is downloaded.
       * @returns {Promise<{ fileName: string, mimeType: string, content: string }>}
       */
      async run() {
        return { fileName: `${reportFileName(this)}.html`, mimeType: HTML_TYPE, content: reportDocument(this) };
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
  },

  exports: {
    fileName() { return reportFileName(this); },
    document() { return reportDocument(this); },
  },

  /**
   * An empty survey with an id of its own (answer files name it).
   * @returns {SurveyModel}
   */
  createDefault() {
    const m = new SurveyModel();
    setFields(m, { survey: { ...cloneJSON(m.survey), id: uid() } });
    return m;
  },

  /**
   * A loaded example gets a fresh survey id, so answers to an earlier copy
   * are told apart.
   * @param {object} data module state of the example
   * @returns {object} copy with a new `survey.id`
   */
  beforeLoadExample(data) {
    const copy = JSON.parse(JSON.stringify(data));
    if (copy.survey && typeof copy.survey === 'object') copy.survey.id = uid();
    return copy;
  },

  view: [outlineView, propertiesView, conditionsView, questionnaireView, recipientsView, responsesView, resultsView, chartsView, handoverView],
});
