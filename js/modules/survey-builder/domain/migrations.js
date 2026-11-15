/**
 * D.Mike — Survey builder: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js oder answers.js (das Schema und die Antwortform
 * dürfen sich ändern, die Migration nicht). Aus conditions.js kommen nur die
 * Sichtbarkeitsregeln, die auch der exportierte Fragebogen in eigener Kopie
 * trägt.
 *
 * `'0→1.0'`: der Stand, den das frühere `fromJSON` lieferte (tolerant wie
 * dort: unbekannte Fragetypen und Knoten ohne id entfallen, fehlende Felder
 * bekommen ihre Vorgabe, verwaiste Bedingungen, Filter, Gruppierung, Auswahl
 * und Antwort-Empfänger werden bereinigt), dazu drei Formwechsel:
 * - jede Antwort als Objekt mit festen Schlüsseln (`{ option }`, `{ other }`,
 *   `{ ids, other }`, `{ ratings }`, `{ kano }`, `{ text }`);
 * - `transfers.kano[q]` von der Instanz-id (Text) auf
 *   `{ instanceId, itemIds: [], respondentIds: [] }` — die Listen füllt die
 *   erste Übergabe an die Instanz;
 * - `ui.tab` und `ui.selectedQuestionId` werden die Ansichtsfelder `tab` und
 *   `selectedQuestionId`.
 */
import { uid } from '../../../core/uid.js';
import { documentOrder, availableSources, findQuestion } from './conditions.js';

/** Fragetypen im Formatstand 1.0. */
const TYPES_1_0 = Object.freeze(['single', 'multi', 'rating', 'kano', 'text', 'info']);
/** Reiter im Formatstand 1.0. */
const TABS_1_0 = Object.freeze(['draft', 'recipients', 'results']);
/** Typeigene Schalter mit ihrer Vorgabe im Formatstand 1.0. */
const FLAGS_1_0 = Object.freeze({
  single: { other: false }, multi: { other: false }, rating: { noAnswer: true }, kano: { importance: true }, text: { multiline: true }, info: {},
});
/** Liste der Optionen oder Zeilen je Typ im Formatstand 1.0. */
const ITEMS_1_0 = Object.freeze({ single: 'options', multi: 'options', rating: 'rows', kano: 'rows', text: null, info: null });
/** Bewertungsstufen im Formatstand 1.0. */
const RATING_VALUES_1_0 = Object.freeze([1, 2, 3, 4, 5, 'na']);

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** @param {unknown} v @returns {string} */
const str = (v) => (typeof v === 'string' ? v : '');
/** @param {unknown} v @returns {any[]} */
const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * Eine Frage mit gültiger id und gültigem Typ in ihrer festen Form.
 * @param {Record<string, any>} q @returns {Record<string, any>}
 */
function question(q) {
  const out = {
    id: q.id, type: q.type, text: str(q.text), hint: str(q.hint), required: Boolean(q.required),
    when: Array.isArray(q.when) ? q.when : null,
  };
  const key = ITEMS_1_0[q.type];
  if (key) {
    out[key] = arr(q[key]).filter((x) => isObj(x) && typeof x.id === 'string')
      .map((x) => (key === 'options' && typeof x.group === 'string' && x.group
        ? { id: x.id, text: str(x.text), group: x.group }
        : { id: x.id, text: str(x.text) }));
  }
  for (const [f, dflt] of Object.entries(FLAGS_1_0[q.type])) out[f] = typeof q[f] === 'boolean' ? q[f] : dflt;
  return out;
}

/**
 * Nur gültige Bedingungen eines Knotens, sonst null (wie das frühere `cleanConditions`).
 * @param {object} survey @param {string} nodeId @param {unknown} when
 * @returns {Array<{ questionId: string, optionIds: string[] }>|null}
 */
function validConditions(survey, nodeId, when) {
  if (!Array.isArray(when)) return null;
  const sources = new Map(availableSources(survey, nodeId).map((q) => [q.id, q]));
  const out = [];
  for (const c of when) {
    const src = sources.get(c?.questionId);
    if (!src) continue;
    const known = new Set(src.options.map((o) => o.id));
    const optionIds = arr(c.optionIds).filter((id) => known.has(id));
    if (optionIds.length) out.push({ questionId: src.id, optionIds });
  }
  return out.length ? out : null;
}

/**
 * Eine Antwort in der Antwortform 1.0 (eingefrorene Fassung von `toStored`).
 * @param {{ type: string }|null} q @param {any} a
 * @returns {Record<string, any>|undefined}
 */
function storedAnswer(q, a) {
  if (typeof a === 'string') return q?.type === 'single' ? { option: a } : { text: a };
  if (!isObj(a)) return undefined;
  if (Array.isArray(a.ids)) {
    const out = { ids: a.ids.filter((id) => typeof id === 'string') };
    if (Object.hasOwn(a, 'other')) out.other = typeof a.other === 'string' ? a.other : null;
    return out;
  }
  const keys = Object.keys(a);
  if (keys.length === 1 && keys[0] === 'other' && (typeof a.other === 'string' || a.other === null)) return { other: a.other };
  const scale = (v, max) => (Number.isInteger(v) && v >= 1 && v <= max ? v : null);
  const ratings = {};
  const kano = {};
  for (const [rowId, v] of Object.entries(a)) {
    if (rowId === '__proto__') continue;
    if (isObj(v)) kano[rowId] = { f: scale(v.f, 5), d: scale(v.d, 5), w: scale(v.w, 9) };
    else if (RATING_VALUES_1_0.includes(v)) ratings[rowId] = v;
  }
  return { ...(Object.keys(ratings).length ? { ratings } : {}), ...(Object.keys(kano).length ? { kano } : {}) };
}

/**
 * @param {object} survey @param {unknown} raw Antworten einer Antwort @returns {Record<string, Record<string, any>>}
 */
function answers(survey, raw) {
  /** @type {Record<string, Record<string, any>>} */
  const out = {};
  for (const [questionId, a] of Object.entries(isObj(raw) ? raw : {})) {
    if (questionId === '__proto__') continue;
    const stored = storedAnswer(findQuestion(survey, questionId), a);
    if (stored !== undefined) out[questionId] = stored;
  }
  return out;
}

/**
 * Formatstand des früheren Models (ohne `_schema`) → 1.0.
 * @param {Record<string, any>} d gespeicherter Zustand
 * @returns {Record<string, any>}
 */
export function from0(d) {
  const sv = isObj(d.survey) ? d.survey : {};
  const survey = {
    id: typeof sv.id === 'string' && sv.id ? sv.id : uid(),
    version: Number.isInteger(sv.version) && sv.version > 0 ? sv.version : 1,
    lang: sv.lang === 'en' ? 'en' : 'de',
    title: str(sv.title), intro: str(sv.intro), contact: str(sv.contact),
    anonymous: Boolean(sv.anonymous),
    sections: arr(sv.sections).filter((x) => isObj(x) && typeof x.id === 'string').map((x) => ({
      id: x.id, title: str(x.title), hint: str(x.hint),
      when: Array.isArray(x.when) ? x.when : null,
      questions: arr(x.questions).filter((q) => isObj(q) && typeof q.id === 'string' && TYPES_1_0.includes(q.type)).map(question),
    })),
  };
  for (const node of [...survey.sections, ...documentOrder(survey).map((e) => e.question)]) {
    node.when = validConditions(survey, node.id, node.when);
  }

  const recipients = arr(d.recipients).filter((r) => isObj(r) && typeof r.id === 'string').map((r) => ({
    id: r.id, name: str(r.name), organisation: str(r.organisation), group: str(r.group),
    email: str(r.email), note: str(r.note),
    sentAt: typeof r.sentAt === 'string' ? r.sentAt : null,
    sentVersion: Number.isInteger(r.sentVersion) ? r.sentVersion : null,
  }));
  const responses = arr(d.responses).filter((r) => isObj(r) && typeof r.id === 'string').map((r) => ({
    id: r.id,
    surveyVersion: Number.isInteger(r.surveyVersion) ? r.surveyVersion : 1,
    recipientId: typeof r.recipientId === 'string' ? r.recipientId : null,
    viaRecipient: Boolean(r.viaRecipient),
    submittedAt: str(r.submittedAt),
    answers: answers(survey, r.answers),
  }));
  const recipientIds = new Set(recipients.map((r) => r.id));
  const answeredRecipientIds = arr(d.answeredRecipientIds).filter((id) => recipientIds.has(id));

  const transfers = isObj(d.transfers) ? d.transfers : {};
  const kano = isObj(transfers.kano) ? transfers.kano : {};
  const vocTree = isObj(transfers.vocTree) ? transfers.vocTree : {};

  const ui = isObj(d.ui) ? d.ui : {};
  const has = (id) => findQuestion(survey, id) !== null;
  return {
    survey,
    recipients,
    responses,
    answeredRecipientIds,
    transfers: {
      kano: Object.fromEntries(Object.entries(kano).filter(([q, v]) => q !== '__proto__' && typeof v === 'string')
        .map(([q, instanceId]) => [q, { instanceId, itemIds: [], respondentIds: [] }])),
      vocTree: { responseKeys: arr(vocTree.responseKeys).filter((k) => typeof k === 'string') },
    },
    ui: {
      filter: isObj(ui.filter) && has(ui.filter.questionId)
        ? { questionId: ui.filter.questionId, optionId: str(ui.filter.optionId) } : null,
      groupBy: findQuestion(survey, ui.groupBy)?.type === 'single' ? ui.groupBy : null,
      reportWithNames: Boolean(ui.reportWithNames),
    },
    dirtyStructure: Boolean(d.dirtyStructure),
    exportedOnce: Boolean(d.exportedOnce),
    tab: TABS_1_0.includes(ui.tab) ? ui.tab : 'draft',
    selectedQuestionId: has(ui.selectedQuestionId) ? ui.selectedQuestionId : null,
  };
}
