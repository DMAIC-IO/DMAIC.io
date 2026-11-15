/**
 * D.Mike — Survey builder: Model.
 *
 * Fragebogen (Kopf, Abschnitte, Fragen mit Optionen oder Zeilen und
 * Bedingungen), Empfänger, eingelesene Antworten, Merker der Übergaben an
 * Kano und den VoC-Baum, Filter und Gruppierung der Auswertung und die
 * Exportversion. Ohne DOM, ohne i18n.
 *
 * Jede Strukturänderung setzt `dirtyStructure`; der nächste Export hebt die
 * Version, sobald der Fragebogen das Haus verlassen hat (`nextExportVersion`).
 * Strukturkommandos bereinigen danach die Bedingungen (`cleanConditions`)
 * und räumen Filter, Gruppierung und Auswahl auf, die auf Entferntes zeigen.
 * Antworten liegen in der gespeicherten Form (`answers.js`); die reinen
 * Module lesen sie über `legacyResponses`.
 *
 * ids von Fragen, Optionen und Zeilen liegen in verschachtelten Listen:
 * Kommandos prüfen sie mit `requireKnownId`, ihre Eindeutigkeit und die
 * Verweise darauf sichern die Invarianten — beim Laden repariert, beim
 * Schreiben abgelehnt. Fachliche Ablehnungen werfen mit `param`. `confirm`
 * liefert die Rückfrage als Schlüssel unter `modules.survey-builder`.
 */
import {
  defineModel, command, cloneJSON, list, object, map, text, number, boolean, oneOf, idOf,
} from '../../../core/model.js';
import { requireKnownId, requireForm } from '../../../core/validate.js';
import { uid } from '../../../core/uid.js';
import { documentOrder, availableSources, findQuestion } from './conditions.js';
import { parseResponse } from './import.js';
import { storedAnswers } from './answers.js';
import { isRecipientSent } from './recipients.js';
import { resultsSnapshot } from './results.js';
import { recipientName } from './labels.js';
import { from0 } from './migrations.js';

/** Schalter einer Frage; welche eine Frage hat, hängt vom Typ ab (`emptyQuestion`). */
export const QUESTION_FLAGS = Object.freeze(['required', 'other', 'noAnswer', 'importance', 'multiline']);

/**
 * Neue Frage eines Typs mit ihren typeigenen Feldern.
 * @param {string} type ein Fragetyp (`QUESTION_TYPES` in conditions.js)
 * @param {string} [id] sonst eine neue
 * @returns {Record<string, any>}
 */
export function emptyQuestion(type, id = uid()) {
  const q = { id, type, text: '', hint: '', required: false, when: null };
  if (type === 'single' || type === 'multi') Object.assign(q, { options: [], other: false });
  if (type === 'rating') Object.assign(q, { rows: [], noAnswer: true });
  if (type === 'kano') Object.assign(q, { rows: [], importance: true });
  if (type === 'text') Object.assign(q, { multiline: true });
  return q;
}

/** @param {Record<string, any>} q @returns {'options'|'rows'|null} die Liste der Optionen oder Zeilen */
function itemsKey(q) {
  return Array.isArray(q.options) ? 'options' : Array.isArray(q.rows) ? 'rows' : null;
}

/** @param {any} survey @returns {any[]} alle Fragen in Dokumentreihenfolge */
function questionsOf(survey) {
  return documentOrder(survey).map((e) => e.question);
}

/** @param {ReadonlyArray<unknown>} ids @returns {boolean} keine id doppelt */
function distinct(ids) {
  return new Set(ids).size === ids.length;
}

/**
 * Spätere Einträge mit schon gesehener id entfallen.
 * @template {{ id: unknown }} T
 * @param {T[]} items @param {Set<unknown>} [seen] gemeinsame Menge über mehrere Listen
 * @returns {T[]}
 */
function dedupe(items, seen = new Set()) {
  return items.filter((x) => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

/**
 * Nur die gültigen Bedingungen eines Knotens: Quelle eine frühere Ein- oder
 * Mehrfachauswahl, Optionen dieser Quelle, mindestens eine. Sonst null.
 * @param {any} survey @param {string} nodeId @param {unknown} when
 * @returns {Array<{ questionId: string, optionIds: string[] }>|null}
 */
function validWhen(survey, nodeId, when) {
  if (!Array.isArray(when)) return null;
  const sources = new Map(availableSources(survey, nodeId).map((q) => [q.id, q]));
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
 * Alle Bedingungen nach einer Strukturänderung neu prüfen (schreibt in `survey`).
 * @param {any} survey @returns {number} wie viele Bedingungen ganz entfielen
 */
export function cleanConditions(survey) {
  let removed = 0;
  for (const node of [...survey.sections, ...questionsOf(survey)]) {
    const before = Array.isArray(node.when) ? node.when.length : 0;
    node.when = validWhen(survey, node.id, node.when);
    removed += before - (node.when ? node.when.length : 0);
  }
  return removed;
}

/**
 * Die typeigenen Schlüssel einer Frage in ihrer Normalform: fehlende
 * bekommen ihre Vorgabe, typfremde entfallen.
 * @param {Record<string, any>} q @returns {Record<string, any>}
 */
function shapedQuestion(q) {
  const base = emptyQuestion(q.type, q.id);
  const out = { ...base, text: q.text, hint: q.hint, required: q.required, when: q.when };
  for (const k of ['options', 'rows', 'other', 'noAnswer', 'importance', 'multiline']) {
    if (k in base && q[k] !== undefined) out[k] = q[k];
  }
  return out;
}

/** @param {Record<string, any>} q @returns {boolean} genau die typeigenen Schlüssel */
function hasOwnShape(q) {
  const want = Object.keys(emptyQuestion(q.type, q.id)).sort();
  return JSON.stringify(Object.keys(q).sort()) === JSON.stringify(want);
}

/** @param {any} survey @param {any} ui @returns {boolean} Filter auf eine vorhandene Frage, Gruppierung auf eine Einfachauswahl */
function uiValid(survey, ui) {
  return (ui.filter === null || findQuestion(survey, ui.filter.questionId) !== null)
    && (ui.groupBy === null || findQuestion(survey, ui.groupBy)?.type === 'single');
}

/**
 * Antworten auf eine Frage (oder eine ihrer Optionen/Zeilen) in der gespeicherten Form?
 * @param {Record<string, any>|undefined} a gespeicherte Antwort @param {string} [itemId]
 * @returns {boolean}
 */
function answers(a, itemId) {
  if (a === undefined) return false;
  if (!itemId) return true;
  if (a.option !== undefined) return a.option === itemId;
  if (a.text !== undefined) return a.text === itemId;
  if (a.ids !== undefined) return a.ids.includes(itemId);
  if (a.other !== undefined) return itemId === 'other';
  return Object.hasOwn(a.ratings ?? {}, itemId) || Object.hasOwn(a.kano ?? {}, itemId);
}

/** @param {'up'|'down'} direction @returns {-1|1} */
const step = (direction) => (direction === 'up' ? -1 : 1);

export class SurveyModel extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    survey: object({
      id: text(),
      version: number({ integer: true, min: 1, default: 1 }),
      lang: oneOf(['de', 'en']),
      title: text(),
      intro: text(),
      contact: text(),
      anonymous: boolean(),
      sections: list(object({
        id: text(),
        title: text(),
        hint: text(),
        when: list(object({ questionId: text(), optionIds: list(text()) }), { nullable: true }),
        questions: list(object({
          id: text(),
          type: oneOf(['single', 'multi', 'rating', 'kano', 'text', 'info']),
          text: text(),
          hint: text(),
          required: boolean(),
          when: list(object({ questionId: text(), optionIds: list(text()) }), { nullable: true }),
          options: list(object({ id: text(), text: text(), group: text({ optional: true }) }), { optional: true }),
          rows: list(object({ id: text(), text: text() }), { optional: true }),
          other: boolean({ optional: true }),
          noAnswer: boolean({ optional: true }),
          importance: boolean({ optional: true }),
          multiline: boolean({ optional: true }),
        })),
      })),
    }),
    recipients: list(object({
      id: text(),
      name: text(),
      organisation: text(),
      group: text(),
      email: text(),
      note: text(),
      sentAt: text({ nullable: true }),
      sentVersion: number({ integer: true, nullable: true }),
    })),
    responses: list(object({
      id: text(),
      surveyVersion: number({ integer: true }),
      recipientId: text({ nullable: true }),
      viaRecipient: boolean(),
      submittedAt: text(),
      answers: map(text(), object({
        option: text({ optional: true }),
        ids: list(text(), { optional: true }),
        other: text({ optional: true, nullable: true }),
        ratings: map(text(), oneOf([1, 2, 3, 4, 5, 'na']), { optional: true }),
        kano: map(text(), object({
          f: number({ integer: true, min: 1, max: 5, nullable: true }),
          d: number({ integer: true, min: 1, max: 5, nullable: true }),
          w: number({ integer: true, min: 1, max: 9, nullable: true }),
        }), { optional: true }),
        text: text({ optional: true }),
      })),
    })),
    answeredRecipientIds: list(text()),
    transfers: object({
      kano: map(text(), object({ instanceId: text(), itemIds: list(text()), respondentIds: list(text()) })),
      vocTree: object({ responseKeys: list(text()) }),
    }),
    ui: object({
      filter: object({ questionId: text(), optionId: text() }, { nullable: true }),
      groupBy: text({ nullable: true }),
      reportWithNames: boolean(),
    }),
    dirtyStructure: boolean(),
    exportedOnce: boolean(),
  },
  view: {
    tab: oneOf(['draft', 'recipients', 'results']),
    selectedQuestionId: text({ nullable: true }),
  },
  commands: {
    // ── Kopf ──────────────────────────────────────────────
    setHeader: command({
      params: { field: oneOf(['title', 'intro', 'contact']), value: text() },
      run({ field, value }) { this.survey[field] = value; },
    }),
    setSurveyLanguage: command({
      params: { lang: oneOf(['de', 'en']) },
      run({ lang }) { this.survey.lang = lang; },
    }),
    setAnonymous: command({
      params: { anonymous: boolean() },
      run({ anonymous }) { this.survey.anonymous = anonymous; },
    }),

    // ── Abschnitte ────────────────────────────────────────
    addSection: command({
      returns: text(),
      run() {
        const id = uid();
        this.survey.sections.push({ id, title: '', hint: '', when: null, questions: [] });
        this.dirtyStructure = true;
        return id;
      },
    }),
    setSectionField: command({
      params: { sectionId: idOf('survey.sections'), field: oneOf(['title', 'hint']), value: text() },
      run({ sectionId, field, value }) { this.section(sectionId)[field] = value; },
    }),
    moveSection: command({
      params: { sectionId: idOf('survey.sections'), direction: oneOf(['up', 'down']) },
      returns: object({ removedConditions: number({ integer: true }) }),
      run({ sectionId, direction }) {
        const list = this.survey.sections;
        const i = list.findIndex((s) => s.id === sectionId);
        const j = i + step(direction);
        if (j < 0 || j >= list.length) return { removedConditions: 0 };
        [list[i], list[j]] = [list[j], list[i]];
        this.dirtyStructure = true;
        return { removedConditions: cleanConditions(this.survey) };
      },
    }),
    removeSection: command({
      params: { sectionId: idOf('survey.sections') },
      returns: object({ removedConditions: number({ integer: true }) }),
      confirm({ sectionId }) {
        const count = this.section(sectionId).questions.length;
        return count > 0 ? { key: 'confirmSectionDelete', params: { count } } : null;
      },
      run({ sectionId }) {
        const gone = new Set(this.section(sectionId).questions.map((q) => q.id));
        this.survey.sections = this.survey.sections.filter((s) => s.id !== sectionId);
        this._forgetQuestions(gone);
        this.dirtyStructure = true;
        return { removedConditions: cleanConditions(this.survey) };
      },
    }),

    // ── Fragen ────────────────────────────────────────────
    addQuestion: command({
      params: { sectionId: idOf('survey.sections'), type: oneOf(['single', 'multi', 'rating', 'kano', 'text', 'info']) },
      returns: text(),
      run({ sectionId, type }) {
        const q = emptyQuestion(type);
        this.section(sectionId).questions.push(q);
        this.selectedQuestionId = q.id;
        this.dirtyStructure = true;
        return q.id;
      },
    }),
    moveQuestion: command({
      params: { questionId: text(), direction: oneOf(['up', 'down']) },
      returns: object({ removedConditions: number({ integer: true }) }),
      run({ questionId, direction }) {
        this._requireQuestion(questionId);
        const dir = step(direction);
        const secs = this.survey.sections;
        const si = secs.findIndex((s) => s.questions.some((q) => q.id === questionId));
        const list = secs[si].questions;
        const i = list.findIndex((q) => q.id === questionId);
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
        return { removedConditions: cleanConditions(this.survey) };
      },
    }),
    removeQuestion: command({
      params: { questionId: text() },
      returns: object({ removedConditions: number({ integer: true }) }),
      confirm({ questionId }) {
        this._requireQuestion(questionId);
        const count = this.countAffectedResponses(questionId);
        return count > 0 ? { key: 'confirmDeleteAffected', params: { count } } : null;
      },
      run({ questionId }) {
        this._requireQuestion(questionId);
        const sec = this.sectionOf(questionId);
        sec.questions = sec.questions.filter((q) => q.id !== questionId);
        this._forgetQuestions(new Set([questionId]));
        this.dirtyStructure = true;
        return { removedConditions: cleanConditions(this.survey) };
      },
    }),
    setQuestionField: command({
      params: { questionId: text(), field: oneOf(['text', 'hint']), value: text() },
      run({ questionId, field, value }) { this._requireQuestion(questionId)[field] = value; },
    }),
    setQuestionFlag: command({
      params: { questionId: text(), flag: oneOf(['required', 'other', 'noAnswer', 'importance', 'multiline']), on: boolean() },
      run({ questionId, flag, on }) {
        const q = this._requireQuestion(questionId);
        const allowed = QUESTION_FLAGS.filter((f) => (f === 'required' ? q.type !== 'info' : f in q));
        requireForm('flag', flag, allowed.includes(flag), `a flag of a ${q.type} question: ${allowed.join(', ') || 'none'}`);
        q[flag] = on;
      },
    }),
    changeQuestionType: command({
      params: { questionId: text(), type: oneOf(['single', 'multi', 'rating', 'kano', 'text', 'info']) },
      returns: object({ removedConditions: number({ integer: true }) }),
      confirm({ questionId }) {
        this._requireQuestion(questionId);
        const count = this.countAffectedResponses(questionId);
        return count > 0 ? { key: 'confirmChangeType', params: { count } } : null;
      },
      run({ questionId, type }) {
        const q = this._requireQuestion(questionId);
        if (q.type === type) return { removedConditions: 0 };
        const sec = this.sectionOf(questionId);
        const i = sec.questions.findIndex((x) => x.id === questionId);
        sec.questions[i] = { ...emptyQuestion(type, q.id), text: q.text, hint: q.hint, required: q.required, when: q.when };
        if (this.ui.groupBy === questionId && type !== 'single') this.ui = { ...this.ui, groupBy: null };
        this.dirtyStructure = true;
        return { removedConditions: cleanConditions(this.survey) };
      },
    }),

    // ── Optionen und Zeilen ───────────────────────────────
    addItem: command({
      params: { questionId: text() },
      returns: text(),
      run({ questionId }) {
        const q = this._requireQuestion(questionId);
        const kind = itemsKey(q);
        requireForm('questionId', questionId, kind !== null, `a question with options or rows (a ${q.type} question has none)`);
        const id = uid();
        q[kind].push({ id, text: '' });
        this.dirtyStructure = true;
        return id;
      },
    }),
    setItemField: command({
      params: { questionId: text(), itemId: text(), field: oneOf(['text', 'group']), value: text() },
      run({ questionId, itemId, field, value }) {
        const { q, kind, item } = this._requireItem(questionId, itemId);
        if (field === 'text') { item.text = value; return; }
        requireForm('field', field, kind === 'options', `text (a ${q.type} question has rows, no display groups)`);
        if (value) item.group = value; else delete item.group;
      },
    }),
    moveItem: command({
      params: { questionId: text(), itemId: text(), direction: oneOf(['up', 'down']) },
      run({ questionId, itemId, direction }) {
        const { q, kind } = this._requireItem(questionId, itemId);
        const list = q[kind];
        const i = list.findIndex((x) => x.id === itemId);
        const j = i + step(direction);
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        this.dirtyStructure = true;
      },
    }),
    removeItem: command({
      params: { questionId: text(), itemId: text() },
      returns: object({ removedConditions: number({ integer: true }) }),
      confirm({ questionId, itemId }) {
        this._requireItem(questionId, itemId);
        const count = this.countAffectedResponses(questionId, itemId);
        return count > 0 ? { key: 'confirmDeleteAffected', params: { count } } : null;
      },
      run({ questionId, itemId }) {
        const { q, kind } = this._requireItem(questionId, itemId);
        q[kind] = q[kind].filter((x) => x.id !== itemId);
        if (this.ui.filter?.optionId === itemId) this.ui = { ...this.ui, filter: null };
        this.dirtyStructure = true;
        return { removedConditions: cleanConditions(this.survey) };
      },
    }),

    // ── Bedingungen ───────────────────────────────────────
    setConditions: command({
      params: { nodeId: text(), conditions: list(object({ questionId: text(), optionIds: list(text()) })) },
      returns: number({ integer: true }),
      run({ nodeId, conditions }) {
        const ids = [...this.survey.sections.map((s) => s.id), ...questionsOf(this.survey).map((q) => q.id)];
        requireKnownId('nodeId', nodeId, ids);
        const sources = availableSources(this.survey, nodeId).map((q) => q.id);
        conditions.forEach((c, i) => requireKnownId(`conditions[${i}].questionId`, c.questionId, sources));
        const node = this.section(nodeId) ?? this.question(nodeId);
        node.when = validWhen(this.survey, nodeId, conditions);
        this.dirtyStructure = true;
        return node.when ? node.when.length : 0;
      },
    }),

    // ── Exportversion ─────────────────────────────────────
    markExported: command({
      returns: number({ integer: true }),
      run() {
        if (this.dirtyStructure) {
          this.survey.version = this.nextExportVersion;
          this.dirtyStructure = false;
        }
        this.exportedOnce = true;
        return this.survey.version;
      },
    }),

    // ── Empfänger ─────────────────────────────────────────
    addRecipient: command({
      returns: text(),
      run() {
        const id = uid();
        this.recipients.push({ id, name: '', organisation: '', group: '', email: '', note: '', sentAt: null, sentVersion: null });
        return id;
      },
    }),
    setRecipientField: command({
      params: { recipientId: idOf('recipients'), field: oneOf(['name', 'organisation', 'group', 'email', 'note']), value: text() },
      run({ recipientId, field, value }) { this.recipients.find((r) => r.id === recipientId)[field] = value; },
    }),
    removeRecipient: command({
      params: { recipientId: idOf('recipients') },
      confirm({ recipientId }) {
        if (this.recipientStatus(recipientId) !== 'answered') return null;
        const name = recipientName(this.recipients, recipientId);
        return name ? { key: 'confirmRecipientDelete', params: { name } } : { key: 'confirmRecipientDeleteUnnamed' };
      },
      run({ recipientId }) {
        this.recipients = this.recipients.filter((r) => r.id !== recipientId);
        this.answeredRecipientIds = this.answeredRecipientIds.filter((x) => x !== recipientId);
        for (const resp of this.responses) if (resp.recipientId === recipientId) resp.recipientId = null;
      },
    }),
    markSent: command({
      params: { recipientId: idOf('recipients') },
      run({ recipientId }) {
        const r = this.recipients.find((x) => x.id === recipientId);
        r.sentAt = new Date().toISOString();
        r.sentVersion = this.survey.version;
      },
    }),

    // ── Antworten ─────────────────────────────────────────
    importResponse: command({
      params: { json: text(), fileName: text() },
      returns: object({
        status: oneOf(['ok', 'older', 'duplicate', 'foreign', 'invalid']),
        orphanIds: list(text()),
        unknownRecipient: boolean(),
      }),
      run({ json }) {
        const survey = cloneJSON(this.survey);
        const result = parseResponse(json, survey, this.responses.map((r) => r.id));
        if (result.status !== 'ok' && result.status !== 'older') return { status: result.status, orphanIds: [], unknownRecipient: false };
        const response = result.response;
        const known = Boolean(response.recipientId) && this.recipients.some((r) => r.id === response.recipientId);
        if (known && !this.answeredRecipientIds.includes(response.recipientId)) this.answeredRecipientIds.push(response.recipientId);
        this.responses.push({
          id: response.id,
          surveyVersion: response.surveyVersion,
          recipientId: known && !this.survey.anonymous ? response.recipientId : null,
          viaRecipient: known,
          submittedAt: response.submittedAt,
          answers: storedAnswers(survey, response.answers),
        });
        return { status: result.status, orphanIds: [...(result.orphanIds ?? [])], unknownRecipient: Boolean(response.recipientId) && !known };
      },
    }),
    removeResponse: command({
      params: { responseId: idOf('responses') },
      confirm() { return { key: 'confirmResponseDelete' }; },
      run({ responseId }) {
        const recipientId = this.responses.find((r) => r.id === responseId).recipientId;
        this.responses = this.responses.filter((r) => r.id !== responseId);
        if (recipientId && !this.responses.some((r) => r.recipientId === recipientId)) {
          this.answeredRecipientIds = this.answeredRecipientIds.filter((x) => x !== recipientId);
        }
        this.transfers.vocTree.responseKeys = this.transfers.vocTree.responseKeys.filter((k) => !k.startsWith(`${responseId}:`));
      },
    }),

    // ── Auswertung ────────────────────────────────────────
    setFilter: command({
      params: { questionId: text({ nullable: true }), optionId: text({ nullable: true }) },
      run({ questionId, optionId }) {
        if (questionId === null && optionId === null) { this.ui = { ...this.ui, filter: null }; return; }
        const choices = questionsOf(this.survey).filter((q) => q.type === 'single' || q.type === 'multi');
        requireKnownId('questionId', questionId, choices.map((q) => q.id));
        requireKnownId('optionId', optionId, choices.find((q) => q.id === questionId).options.map((o) => o.id));
        this.ui = { ...this.ui, filter: { questionId, optionId } };
      },
    }),
    setGroupBy: command({
      params: { questionId: text({ nullable: true }) },
      run({ questionId }) {
        if (questionId !== null) {
          requireKnownId('questionId', questionId, questionsOf(this.survey).filter((q) => q.type === 'single').map((q) => q.id));
        }
        this.ui = { ...this.ui, groupBy: questionId };
      },
    }),

    // ── Merker der Übergaben ──────────────────────────────
    setKanoTarget: command({
      params: { questionId: text(), instanceId: text({ nullable: true }) },
      run({ questionId, instanceId }) {
        this._requireKanoQuestion(questionId);
        const kano = { ...this.transfers.kano };
        if (instanceId === null) delete kano[questionId];
        else if (kano[questionId]?.instanceId !== instanceId) kano[questionId] = { instanceId, itemIds: [], respondentIds: [] };
        this.transfers = { ...this.transfers, kano };
      },
    }),
    setKanoTransfer: command({
      params: { questionId: text(), transfer: object({ instanceId: text(), itemIds: list(text()), respondentIds: list(text()) }) },
      run({ questionId, transfer }) {
        this._requireKanoQuestion(questionId);
        this.transfers = { ...this.transfers, kano: { ...this.transfers.kano, [questionId]: transfer } };
      },
    }),
    markVocTaken: command({
      params: { keys: list(text()) },
      run({ keys }) {
        const set = new Set(this.transfers.vocTree.responseKeys);
        keys.forEach((k) => set.add(k));
        this.transfers.vocTree.responseKeys = [...set];
      },
    }),
  },
  derived: {
    /**
     * Die Auswertung unter dem aktiven Filter und der aktiven Gruppierung, als Zahlen.
     * @this {import('./model.types.js').SurveyModelModel}
     * @returns {import('./results.js').SurveyResults}
     */
    results() {
      return resultsSnapshot(this);
    },
  },
  invariants: {
    uniqueIds: {
      fields: ['survey', 'recipients', 'responses'],
      test(m) {
        const items = questionsOf(m.survey).every((q) => distinct((q.options ?? q.rows ?? []).map((x) => x.id)));
        return distinct([...m.survey.sections.map((s) => s.id), ...questionsOf(m.survey).map((q) => q.id)])
          && items && distinct(m.recipients.map((r) => r.id)) && distinct(m.responses.map((r) => r.id));
      },
      repair(m) {
        const nodes = new Set();
        /** @type {any[]} */
        const sections = dedupe(m._v.survey.sections, nodes);
        for (const s of sections) {
          s.questions = dedupe(s.questions, nodes);
          for (const q of s.questions) {
            if (Array.isArray(q.options)) q.options = dedupe(q.options);
            if (Array.isArray(q.rows)) q.rows = dedupe(q.rows);
          }
        }
        m._v.survey.sections = sections;
        m._v.recipients = dedupe(m._v.recipients);
        m._v.responses = dedupe(m._v.responses);
      },
    },
    questionShape: {
      fields: ['survey'],
      test(m) {
        return questionsOf(m.survey).every(hasOwnShape);
      },
      repair(m) {
        for (const s of m._v.survey.sections) s.questions = s.questions.map(shapedQuestion);
      },
    },
    validConditions: {
      fields: ['survey'],
      test(m) {
        return [...m.survey.sections, ...questionsOf(m.survey)]
          .every((node) => JSON.stringify(node.when) === JSON.stringify(validWhen(m.survey, node.id, node.when)));
      },
      repair(m) {
        cleanConditions(m._v.survey);
      },
    },
    validUi: {
      fields: ['ui', 'survey'],
      test(m) {
        return uiValid(m.survey, m.ui);
      },
      repair(m) {
        const { survey, ui } = m._v;
        if (ui.filter !== null && findQuestion(survey, ui.filter.questionId) === null) ui.filter = null;
        if (ui.groupBy !== null && findQuestion(survey, ui.groupBy)?.type !== 'single') ui.groupBy = null;
      },
    },
    // Nennt nur das Ansichtsfeld: so heilt eine verwaiste Auswahl auch beim
    // strengen Laden still. Kommandos, die Fragen entfernen, räumen sie selbst.
    validSelection: {
      fields: ['selectedQuestionId'],
      test(m) {
        return m.selectedQuestionId === null || findQuestion(m.survey, m.selectedQuestionId) !== null;
      },
      repair(m) {
        m._v.selectedQuestionId = null;
      },
    },
    answeredRecipients: {
      fields: ['answeredRecipientIds', 'recipients'],
      test(m) {
        const ids = new Set(m.recipients.map((r) => r.id));
        return m.answeredRecipientIds.every((id) => ids.has(id));
      },
      repair(m) {
        const ids = new Set(m._v.recipients.map((r) => r.id));
        m._v.answeredRecipientIds = m._v.answeredRecipientIds.filter((id) => ids.has(id));
      },
    },
  },
}) {
  // ─── Nachschlagen ──────────────────────────────────────

  /** @param {string} id Abschnitt-id @returns {any} der Abschnitt, sonst null */
  section(id) {
    return this.survey.sections.find((s) => s.id === id) || null;
  }

  /** @param {string} id Frage-id @returns {any} die Frage, sonst null */
  question(id) {
    return findQuestion(this.survey, id);
  }

  /** @param {string} questionId @returns {any} der Abschnitt, der die Frage hält, sonst null */
  sectionOf(questionId) {
    return this.survey.sections.find((s) => s.questions.some((q) => q.id === questionId)) || null;
  }

  // ─── Versand und Version ───────────────────────────────

  /**
   * Die Version, die der nächste Export trägt: eins höher nur, wenn sich der
   * Aufbau geändert hat, nachdem der Fragebogen das Haus verlassen hat
   * (exportiert, verschickt oder beantwortet).
   * @returns {number}
   */
  get nextExportVersion() {
    const leftTheHouse = this.exportedOnce || this.responses.length > 0 || this.recipients.some((r) => r.sentAt);
    return this.dirtyStructure && leftTheHouse ? this.survey.version + 1 : this.survey.version;
  }

  /** @param {string} id Empfänger-id @returns {'not-sent'|'sent'|'answered'} */
  recipientStatus(id) {
    if (this.answeredRecipientIds.includes(id)) return 'answered';
    const r = this.recipients.find((x) => x.id === id);
    return r?.sentAt ? 'sent' : 'not-sent';
  }

  /** @param {string} id Empfänger-id @returns {boolean} mit einer älteren als der aktuellen Version verschickt */
  isOutdated(id) {
    const r = this.recipients.find((x) => x.id === id);
    return Boolean(r?.sentAt) && (r.sentVersion ?? 0) < this.survey.version;
  }

  /** @returns {{ sent: number, answered: number, rate: number|null }} */
  recipientCounts() {
    const sent = this.recipients.filter((r) => isRecipientSent(r, this.answeredRecipientIds.includes(r.id))).length;
    const answered = this.recipients.filter((r) => this.answeredRecipientIds.includes(r.id)).length;
    return { sent, answered, rate: sent ? answered / sent : null };
  }

  /**
   * Antworten mit einer Antwort auf die Frage (oder eine ihrer Optionen/Zeilen).
   * @param {string} questionId @param {string} [itemId]
   * @returns {number}
   */
  countAffectedResponses(questionId, itemId) {
    return this.responses.filter((r) => answers(r.answers[questionId], itemId)).length;
  }

  /** @returns {boolean} wahr, sobald es eine Frage, einen Empfänger oder eine Antwort gibt (Rückfrage vor dem Überschreiben) */
  hasContent() {
    return questionsOf(this.survey).length > 0 || this.recipients.length > 0 || this.responses.length > 0;
  }

  // ─── Prüfungen der Kommandos ───────────────────────────

  /** @param {string} questionId @returns {any} die Frage @throws {Error} unbekannte id, mit `param` `questionId` */
  _requireQuestion(questionId) {
    requireKnownId('questionId', questionId, questionsOf(this.survey).map((q) => q.id));
    return this.question(questionId);
  }

  /** @param {string} questionId @throws {Error} keine Kano-Frage, mit `param` `questionId` */
  _requireKanoQuestion(questionId) {
    requireKnownId('questionId', questionId, questionsOf(this.survey).filter((q) => q.type === 'kano').map((q) => q.id));
  }

  /**
   * @param {string} questionId @param {string} itemId
   * @returns {{ q: any, kind: 'options'|'rows', item: any }}
   * @throws {Error} unbekannte Frage oder Option/Zeile, Frage ohne Optionen und Zeilen
   */
  _requireItem(questionId, itemId) {
    const q = this._requireQuestion(questionId);
    const kind = itemsKey(q);
    requireForm('questionId', questionId, kind !== null, `a question with options or rows (a ${q.type} question has none)`);
    requireKnownId('itemId', itemId, q[kind].map((x) => x.id));
    return { q, kind, item: q[kind].find((x) => x.id === itemId) };
  }

  /**
   * Auswahl, Filter und Gruppierung lösen, die auf entfernte Fragen zeigen.
   * @param {Set<string>} gone ids der entfernten Fragen
   */
  _forgetQuestions(gone) {
    if (gone.has(this.selectedQuestionId)) this.selectedQuestionId = null;
    const { filter, groupBy } = this.ui;
    if ((filter && gone.has(filter.questionId)) || gone.has(groupBy)) {
      this.ui = {
        ...this.ui,
        filter: filter && gone.has(filter.questionId) ? null : filter,
        groupBy: gone.has(groupBy) ? null : groupBy,
      };
    }
  }
}
