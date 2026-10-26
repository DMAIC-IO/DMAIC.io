/**
 * D.Mike — Survey builder model (survey-builder-model.js)
 *
 * Persisted state of the survey-builder module: questionnaire definition,
 * recipients, imported responses, hand-over bookkeeping, UI selection.
 * Every structural change sets `dirtyStructure`; the next export bumps the
 * version (§3.4). Condition clean-up after deletes/moves runs here (§3.2).
 */

import { uid } from '../../core/uid.js';
import { QUESTION_TYPES, documentOrder, availableSources } from './survey-conditions.js';

const TABS = ['draft', 'recipients', 'results'];
const RECIPIENT_FIELDS = ['name', 'organisation', 'group', 'email', 'note'];
const QUESTION_FLAGS = ['required', 'other', 'noAnswer', 'importance', 'multiline'];

const str = (v) => (typeof v === 'string' ? v : '');

/**
 * Fresh question of a type with its type-specific fields.
 * @param {string} type
 * @returns {object}
 */
export function emptyQuestion(type) {
  const q = { id: uid(), type, text: '', hint: '', required: false, when: null };
  if (type === 'single' || type === 'multi') Object.assign(q, { options: [], other: false });
  if (type === 'rating') Object.assign(q, { rows: [], noAnswer: true });
  if (type === 'kano') Object.assign(q, { rows: [], importance: true });
  if (type === 'text') Object.assign(q, { multiline: true });
  return q;
}

function emptySurvey() {
  return { id: uid(), version: 1, lang: 'de', title: '', intro: '', contact: '', anonymous: false, sections: [] };
}

function itemsKey(q) {
  return Array.isArray(q.options) ? 'options' : Array.isArray(q.rows) ? 'rows' : null;
}

/**
 * Plain deep copy — strips Alpine proxies before handing state to pure code.
 * @param {*} value JSON-safe value
 * @returns {*}
 */
export function plainCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Whether a recipient counts as "sent". Answering proves receipt, so an
 * answerer counts as sent even without `sentAt`. Shared with the summary's
 * response rate.
 * @param {{sentAt: string|null}} recipient
 * @param {boolean} answered whether the recipient has answered
 * @returns {boolean}
 */
export function isRecipientSent(recipient, answered) {
  return Boolean(recipient.sentAt) || Boolean(answered);
}

/**
 * Complete persisted state of one survey-builder instance.
 * Mutating methods keep conditions valid and flag structural changes.
 */
export class State {
  survey = emptySurvey();
  /** @type {Array<{id, name, organisation, group, email, note, sentAt: string|null, sentVersion: number|null}>} */
  recipients = [];
  /** @type {Array<{id, surveyVersion, recipientId: string|null, viaRecipient: boolean, submittedAt, answers: object}>} */
  responses = [];
  /** @type {string[]} */
  answeredRecipientIds = [];
  transfers = { kano: {}, vocTree: { responseKeys: [] } };
  ui = { tab: 'draft', selectedQuestionId: null, filter: null, groupBy: null, reportWithNames: false };
  dirtyStructure = false;
  /** True once any export was written, so later structure edits bump the version. */
  exportedOnce = false;

  // ─── Lookup ─────────────────────────────────────────────────

  /**
   * @param {string} id section id
   * @returns {object|null}
   */
  section(id) { return this.survey.sections.find((s) => s.id === id) || null; }

  /**
   * @param {string} id question id
   * @returns {object|null}
   */
  question(id) { return documentOrder(this.survey).find((e) => e.question.id === id)?.question || null; }

  /**
   * @param {string} questionId
   * @returns {object|null} the section that holds the question
   */
  sectionOf(questionId) {
    return this.survey.sections.find((s) => s.questions.some((q) => q.id === questionId)) || null;
  }

  // ─── Header ─────────────────────────────────────────────────

  /**
   * @param {'title'|'intro'|'contact'|'lang'|'anonymous'} field
   * @param {*} value
   */
  setHeader(field, value) {
    if (field === 'lang') { this.survey.lang = value === 'en' ? 'en' : 'de'; return; }
    if (field === 'anonymous') { this.survey.anonymous = Boolean(value); return; }
    if (['title', 'intro', 'contact'].includes(field)) this.survey[field] = str(value);
  }

  // ─── Sections ───────────────────────────────────────────────

  /** @returns {string} new section id */
  addSection() {
    const s = { id: uid(), title: '', hint: '', when: null, questions: [] };
    this.survey.sections.push(s);
    this.dirtyStructure = true;
    return s.id;
  }

  /**
   * Text edit; never structural.
   * @param {string} id section id
   * @param {'title'|'hint'} field
   * @param {string} value
   */
  updateSection(id, field, value) {
    const s = this.section(id);
    if (s && (field === 'title' || field === 'hint')) s[field] = str(value);
  }

  /**
   * @param {string} id section id
   * @returns {{removedConditions: number}}
   */
  deleteSection(id) {
    const s = this.section(id);
    if (!s) return { removedConditions: 0 };
    if (s.questions.some((q) => q.id === this.ui.selectedQuestionId)) this.ui.selectedQuestionId = null;
    this.survey.sections = this.survey.sections.filter((x) => x !== s);
    this.dirtyStructure = true;
    return { removedConditions: this.cleanConditions() };
  }

  /**
   * @param {string} id section id
   * @param {-1|1} dir
   * @returns {{removedConditions: number}}
   */
  moveSection(id, dir) {
    const list = this.survey.sections;
    const i = list.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return { removedConditions: 0 };
    [list[i], list[j]] = [list[j], list[i]];
    this.dirtyStructure = true;
    return { removedConditions: this.cleanConditions() };
  }

  // ─── Questions ──────────────────────────────────────────────

  /**
   * @param {string} sectionId
   * @param {string} type one of QUESTION_TYPES
   * @returns {string|null} new question id, null for an unknown section or type
   */
  addQuestion(sectionId, type) {
    const s = this.section(sectionId);
    if (!s || !QUESTION_TYPES.includes(type)) return null;
    const q = emptyQuestion(type);
    s.questions.push(q);
    this.ui.selectedQuestionId = q.id;
    this.dirtyStructure = true;
    return q.id;
  }

  /**
   * Text fields and flags; never structural.
   * @param {string} id
   * @param {'text'|'hint'|'required'|'other'|'noAnswer'|'importance'|'multiline'} field
   * @param {*} value
   */
  updateQuestion(id, field, value) {
    const q = this.question(id);
    if (!q) return;
    if (field === 'text' || field === 'hint') q[field] = str(value);
    else if (QUESTION_FLAGS.includes(field) && field in q) q[field] = Boolean(value);
  }

  /**
   * Switch the type, keeping id, text, hint, required and conditions.
   * @param {string} id question id
   * @param {string} type one of QUESTION_TYPES
   * @returns {{removedConditions: number}}
   */
  changeType(id, type) {
    const q = this.question(id);
    if (!q || q.type === type || !QUESTION_TYPES.includes(type)) return { removedConditions: 0 };
    const fresh = emptyQuestion(type);
    const sec = this.sectionOf(id);
    const i = sec.questions.indexOf(q);
    sec.questions[i] = { ...fresh, id: q.id, text: q.text, hint: q.hint, required: q.required, when: q.when };
    this.dirtyStructure = true;
    return { removedConditions: this.cleanConditions() };
  }

  /**
   * @param {string} id question id
   * @returns {{removedConditions: number}}
   */
  deleteQuestion(id) {
    const sec = this.sectionOf(id);
    if (!sec) return { removedConditions: 0 };
    sec.questions = sec.questions.filter((q) => q.id !== id);
    if (this.ui.selectedQuestionId === id) this.ui.selectedQuestionId = null;
    if (this.ui.filter?.questionId === id) this.ui.filter = null;
    if (this.ui.groupBy === id) this.ui.groupBy = null;
    this.dirtyStructure = true;
    return { removedConditions: this.cleanConditions() };
  }

  /**
   * Move up/down; at a section boundary the question moves to the end of
   * the previous / start of the next section.
   * @param {string} id question id
   * @param {-1|1} dir
   * @returns {{removedConditions: number}}
   */
  moveQuestion(id, dir) {
    const secs = this.survey.sections;
    const si = secs.findIndex((s) => s.questions.some((q) => q.id === id));
    if (si < 0) return { removedConditions: 0 };
    const list = secs[si].questions;
    const i = list.findIndex((q) => q.id === id);
    const j = i + dir;
    if (j >= 0 && j < list.length) {
      [list[i], list[j]] = [list[j], list[i]];
    } else {
      const target = secs[si + dir];
      if (!target) return { removedConditions: 0 };
      const [q] = list.splice(i, 1);
      if (dir < 0) target.questions.push(q); else target.questions.unshift(q);
    }
    this.dirtyStructure = true;
    return { removedConditions: this.cleanConditions() };
  }

  // ─── Options / rows ─────────────────────────────────────────

  /**
   * @param {string} questionId
   * @param {'options'|'rows'} kind
   * @returns {string|null} new item id, null if the question has no such list
   */
  addItem(questionId, kind) {
    const q = this.question(questionId);
    if (!q || itemsKey(q) !== kind) return null;
    const item = { id: uid(), text: '' };
    q[kind].push(item);
    this.dirtyStructure = true;
    return item.id;
  }

  /**
   * Text edit; never structural.
   * @param {string} questionId
   * @param {'options'|'rows'} kind
   * @param {string} itemId
   * @param {'text'|'group'} field
   * @param {string} value
   */
  updateItem(questionId, kind, itemId, field, value) {
    const item = this.question(questionId)?.[kind]?.find((x) => x.id === itemId);
    if (!item) return;
    if (field === 'text') item.text = str(value);
    if (field === 'group' && kind === 'options') item.group = str(value) || undefined;
  }

  /**
   * @param {string} questionId
   * @param {'options'|'rows'} kind
   * @param {string} itemId
   * @returns {{removedConditions: number}}
   */
  deleteItem(questionId, kind, itemId) {
    const q = this.question(questionId);
    if (!q?.[kind]) return { removedConditions: 0 };
    q[kind] = q[kind].filter((x) => x.id !== itemId);
    if (this.ui.filter?.optionId === itemId) this.ui.filter = null;
    this.dirtyStructure = true;
    return { removedConditions: this.cleanConditions() };
  }

  /**
   * @param {string} questionId
   * @param {'options'|'rows'} kind
   * @param {string} itemId
   * @param {-1|1} dir
   */
  moveItem(questionId, kind, itemId, dir) {
    const list = this.question(questionId)?.[kind];
    if (!list) return;
    const i = list.findIndex((x) => x.id === itemId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.dirtyStructure = true;
  }

  // ─── Conditions ─────────────────────────────────────────────

  /**
   * Replace a node's conditions; invalid ones (not an available source,
   * unknown options, empty option list) are dropped.
   * @param {string} nodeId section or question id
   * @param {Array<{questionId: string, optionIds: string[]}>|null} when
   */
  setConditions(nodeId, when) {
    const node = this.section(nodeId) || this.question(nodeId);
    if (!node) return;
    node.when = this._validConditions(nodeId, when);
    this.dirtyStructure = true;
  }

  /**
   * @param {string} nodeId
   * @param {*} when
   * @returns {Array<{questionId: string, optionIds: string[]}>|null} only valid conditions, or null
   * @private
   */
  _validConditions(nodeId, when) {
    if (!Array.isArray(when)) return null;
    const sources = new Map(availableSources(this.survey, nodeId).map((q) => [q.id, q]));
    const out = [];
    for (const c of when) {
      const src = sources.get(c?.questionId);
      if (!src) continue;
      const known = new Set(src.options.map((o) => o.id));
      const optionIds = (Array.isArray(c.optionIds) ? c.optionIds : []).filter((id) => known.has(id));
      if (optionIds.length) out.push({ questionId: src.id, optionIds });
    }
    return out.length ? out : null;
  }

  /**
   * Re-validate every condition after a structural change.
   * @returns {number} count of conditions removed entirely
   */
  cleanConditions() {
    let removed = 0;
    const nodes = [...this.survey.sections, ...documentOrder(this.survey).map((e) => e.question)];
    for (const node of nodes) {
      const before = Array.isArray(node.when) ? node.when.length : 0;
      node.when = this._validConditions(node.id, node.when);
      removed += before - (node.when ? node.when.length : 0);
    }
    return removed;
  }

  // ─── Versioning ─────────────────────────────────────────────

  /**
   * The version the next export will carry: one higher only if the
   * structure changed after the questionnaire left the house (something was
   * sent or answered). Shown in the editor before exporting.
   * @returns {number}
   */
  nextExportVersion() {
    const leftTheHouse = this.exportedOnce || this.responses.length > 0 || this.recipients.some((r) => r.sentAt);
    return this.dirtyStructure && leftTheHouse ? this.survey.version + 1 : this.survey.version;
  }

  /** Called on every export. @returns {number} the version written into the export */
  markExported() {
    if (this.dirtyStructure) {
      this.survey.version = this.nextExportVersion();
      this.dirtyStructure = false;
    }
    this.exportedOnce = true;
    return this.survey.version;
  }

  /**
   * Responses that hold an answer for a question (or one option/row of it).
   * @param {string} questionId
   * @param {string} [itemId]
   * @returns {number}
   */
  countAffectedResponses(questionId, itemId) {
    return this.responses.filter((r) => {
      const a = r.answers?.[questionId];
      if (a === undefined) return false;
      if (!itemId) return true;
      if (typeof a === 'string') return a === itemId;
      if (Array.isArray(a?.ids)) return a.ids.includes(itemId);
      return a && typeof a === 'object' && itemId in a;
    }).length;
  }

  // ─── Recipients ─────────────────────────────────────────────

  /** @returns {string} new recipient id */
  addRecipient() {
    const r = { id: uid(), name: '', organisation: '', group: '', email: '', note: '', sentAt: null, sentVersion: null };
    this.recipients.push(r);
    return r.id;
  }

  /**
   * @param {string} id recipient id
   * @param {'name'|'organisation'|'group'|'email'|'note'} field
   * @param {string} value
   */
  updateRecipient(id, field, value) {
    const r = this.recipients.find((x) => x.id === id);
    if (r && RECIPIENT_FIELDS.includes(field)) r[field] = str(value);
  }

  /**
   * Removes the recipient; their responses are kept with the id cleared.
   * @param {string} id recipient id
   */
  deleteRecipient(id) {
    this.recipients = this.recipients.filter((r) => r.id !== id);
    this.answeredRecipientIds = this.answeredRecipientIds.filter((x) => x !== id);
    for (const resp of this.responses) if (resp.recipientId === id) resp.recipientId = null;
  }

  /**
   * @param {string} id recipient id
   * @param {string} now ISO timestamp
   */
  markSent(id, now) {
    const r = this.recipients.find((x) => x.id === id);
    if (!r) return;
    r.sentAt = now;
    r.sentVersion = this.survey.version;
  }

  /**
   * @param {string} id recipient id
   * @returns {'not-sent'|'sent'|'answered'}
   */
  recipientStatus(id) {
    if (this.answeredRecipientIds.includes(id)) return 'answered';
    const r = this.recipients.find((x) => x.id === id);
    return r?.sentAt ? 'sent' : 'not-sent';
  }

  /**
   * @param {string} id recipient id
   * @returns {boolean} sent with an older version than the current one
   */
  isOutdated(id) {
    const r = this.recipients.find((x) => x.id === id);
    return Boolean(r?.sentAt) && (r.sentVersion ?? 0) < this.survey.version;
  }

  /** @returns {{sent: number, answered: number, rate: number|null}} */
  recipientCounts() {
    const sent = this.recipients.filter((r) => isRecipientSent(r, this.answeredRecipientIds.includes(r.id))).length;
    const answered = this.recipients.filter((r) => this.answeredRecipientIds.includes(r.id)).length;
    return { sent, answered, rate: sent ? answered / sent : null };
  }

  // ─── Responses ──────────────────────────────────────────────

  /**
   * Add an already validated response (from survey-import.js).
   * @param {{id, surveyVersion, recipientId: string|null, submittedAt, answers}} response
   * @returns {{unknownRecipient: boolean}}
   */
  addResponse(response) {
    const known = response.recipientId && this.recipients.some((r) => r.id === response.recipientId);
    const unknownRecipient = Boolean(response.recipientId) && !known;
    if (known && !this.answeredRecipientIds.includes(response.recipientId)) {
      this.answeredRecipientIds.push(response.recipientId);
    }
    this.responses.push({
      id: response.id,
      surveyVersion: response.surveyVersion,
      recipientId: known && !this.survey.anonymous ? response.recipientId : null,
      viaRecipient: Boolean(known),
      submittedAt: response.submittedAt,
      answers: response.answers || {},
    });
    return { unknownRecipient };
  }

  /**
   * Removes a response and its VoC-tree transfer marks. A recipient whose last
   * response goes falls back from 'answered'; anonymous responses carry no
   * recipient id, so their recipient keeps the status.
   * @param {string} id response id
   */
  deleteResponse(id) {
    const recipientId = this.responses.find((r) => r.id === id)?.recipientId;
    this.responses = this.responses.filter((r) => r.id !== id);
    if (recipientId && !this.responses.some((r) => r.recipientId === recipientId)) {
      this.answeredRecipientIds = this.answeredRecipientIds.filter((x) => x !== recipientId);
    }
    this.transfers.vocTree.responseKeys = this.transfers.vocTree.responseKeys.filter((k) => !k.startsWith(`${id}:`));
  }

  /**
   * @returns {string[]} ids of all stored responses
   */
  responseIds() { return this.responses.map((r) => r.id); }

  // ─── Transfers ──────────────────────────────────────────────

  /**
   * @param {string} questionId
   * @param {string} instanceId target Kano instance
   */
  setKanoTarget(questionId, instanceId) { this.transfers.kano[questionId] = instanceId; }

  /** @param {string[]} keys `<responseId>:<questionId>` */
  markVocTaken(keys) {
    const set = new Set(this.transfers.vocTree.responseKeys);
    keys.forEach((k) => set.add(k));
    this.transfers.vocTree.responseKeys = [...set];
  }

  // ─── Persistence ────────────────────────────────────────────

  /**
   * @returns {boolean} true if any question, recipient or response exists
   */
  hasContent() {
    return documentOrder(this.survey).length > 0 || this.recipients.length > 0 || this.responses.length > 0;
  }

  /**
   * @returns {object} plain, deep-copied snapshot for persistence
   */
  toJSON() {
    return JSON.parse(JSON.stringify({
      survey: this.survey,
      recipients: this.recipients,
      responses: this.responses,
      answeredRecipientIds: this.answeredRecipientIds,
      transfers: this.transfers,
      ui: this.ui,
      dirtyStructure: this.dirtyStructure,
      exportedOnce: this.exportedOnce,
    }));
  }

  /**
   * Tolerant deserialisation: unknown types and malformed nodes are
   * dropped, missing fields get defaults, dangling conditions are removed.
   * @param {object|null|undefined} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;
    const sv = d.survey && typeof d.survey === 'object' ? d.survey : {};
    s.survey = {
      id: typeof sv.id === 'string' && sv.id ? sv.id : s.survey.id,
      version: Number.isInteger(sv.version) && sv.version > 0 ? sv.version : 1,
      lang: sv.lang === 'en' ? 'en' : 'de',
      title: str(sv.title), intro: str(sv.intro), contact: str(sv.contact),
      anonymous: Boolean(sv.anonymous),
      sections: (Array.isArray(sv.sections) ? sv.sections : [])
        .filter((x) => x && typeof x.id === 'string')
        .map((x) => ({
          id: x.id, title: str(x.title), hint: str(x.hint),
          when: Array.isArray(x.when) ? x.when : null,
          questions: (Array.isArray(x.questions) ? x.questions : [])
            .filter((q) => q && typeof q.id === 'string' && QUESTION_TYPES.includes(q.type))
            .map((q) => State._question(q)),
        })),
    };
    s.cleanConditions();

    s.recipients = (Array.isArray(d.recipients) ? d.recipients : [])
      .filter((r) => r && typeof r.id === 'string')
      .map((r) => ({
        id: r.id, name: str(r.name), organisation: str(r.organisation), group: str(r.group),
        email: str(r.email), note: str(r.note),
        sentAt: typeof r.sentAt === 'string' ? r.sentAt : null,
        sentVersion: Number.isInteger(r.sentVersion) ? r.sentVersion : null,
      }));
    s.responses = (Array.isArray(d.responses) ? d.responses : [])
      .filter((r) => r && typeof r.id === 'string')
      .map((r) => ({
        id: r.id,
        surveyVersion: Number.isInteger(r.surveyVersion) ? r.surveyVersion : 1,
        recipientId: typeof r.recipientId === 'string' ? r.recipientId : null,
        viaRecipient: Boolean(r.viaRecipient),
        submittedAt: str(r.submittedAt),
        answers: r.answers && typeof r.answers === 'object' ? r.answers : {},
      }));
    const ids = new Set(s.recipients.map((r) => r.id));
    s.answeredRecipientIds = (Array.isArray(d.answeredRecipientIds) ? d.answeredRecipientIds : [])
      .filter((id) => ids.has(id));
    const kano = d.transfers?.kano && typeof d.transfers.kano === 'object' ? d.transfers.kano : {};
    s.transfers = {
      kano: Object.fromEntries(Object.entries(kano).filter(([, v]) => typeof v === 'string')),
      vocTree: { responseKeys: (d.transfers?.vocTree?.responseKeys || []).filter((k) => typeof k === 'string') },
    };
    const ui = d.ui || {};
    s.ui = {
      tab: TABS.includes(ui.tab) ? ui.tab : 'draft',
      selectedQuestionId: s.question(ui.selectedQuestionId) ? ui.selectedQuestionId : null,
      filter: ui.filter && s.question(ui.filter.questionId) ? { questionId: ui.filter.questionId, optionId: str(ui.filter.optionId) } : null,
      groupBy: s.question(ui.groupBy)?.type === 'single' ? ui.groupBy : null,
      reportWithNames: Boolean(ui.reportWithNames),
    };
    s.dirtyStructure = Boolean(d.dirtyStructure);
    s.exportedOnce = Boolean(d.exportedOnce);
    return s;
  }

  /**
   * @param {object} q raw question with a valid id and type
   * @returns {object} normalised question
   * @private
   */
  static _question(q) {
    const base = emptyQuestion(q.type);
    const out = { ...base, id: q.id, text: str(q.text), hint: str(q.hint), required: Boolean(q.required),
      when: Array.isArray(q.when) ? q.when : null };
    const key = itemsKey(base);
    if (key) {
      out[key] = (Array.isArray(q[key]) ? q[key] : [])
        .filter((x) => x && typeof x.id === 'string')
        .map((x) => (key === 'options' && typeof x.group === 'string' && x.group
          ? { id: x.id, text: str(x.text), group: x.group }
          : { id: x.id, text: str(x.text) }));
    }
    for (const f of ['other', 'noAnswer', 'importance', 'multiline']) {
      if (f in base) out[f] = typeof q[f] === 'boolean' ? q[f] : base[f];
    }
    return out;
  }
}
