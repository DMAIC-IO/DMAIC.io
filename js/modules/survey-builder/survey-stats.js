/**
 * D.Mike — Survey statistics (survey-stats.js)
 *
 * Pure functions over the survey definition and imported responses:
 * filter, per-question statistics, response rate, rating ranking, Kano
 * overview, free-text count and group comparison. No DOM, no state access.
 * The base of every share is the set of responses in which the question was
 * visible; a hidden answer never counts.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §6.2, §7
 */

import { documentOrder, findQuestion, isVisible, answerHasOption } from './survey-conditions.js';
import { evaluate, classify } from '../../engines/kano-engine.js';
import { ROLE } from '../../core/datagrid/datagrid-roles.js';

/** Groups below this many responses carry the "few responses" hint. */
export const FEW_RESPONSES = 5;
/** Rating cells deviating from the overall mean by at least this are highlighted. */
export const DEVIATION = 0.5;

const COMPARED = ['single', 'multi', 'rating', 'kano'];

/**
 * @param {number[]} values
 * @returns {number|null}
 */
export function mean(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

/**
 * @param {number[]} values
 * @returns {number|null}
 */
export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * "Auswerten für: <question> = <option>" — keeps responses in which the
 * question was visible and whose answer contains the option.
 * @param {object} survey
 * @param {object[]} responses
 * @param {{questionId: string, optionId: string}|null} filter
 * @returns {object[]}
 */
export function filterResponses(survey, responses, filter) {
  if (!filter) return responses;
  const q = findQuestion(survey, filter.questionId);
  if (!q) return responses;
  return responses.filter((r) => isVisible(q, r.answers, survey)
    && answerHasOption(r.answers?.[q.id], [filter.optionId]));
}

function choiceStats(q, base) {
  const counts = new Map(q.options.map((o) => [o.id, 0]));
  const otherTexts = [];
  let answered = 0;
  for (const r of base) {
    const a = r.answers?.[q.id];
    if (a == null) continue;
    answered += 1;
    const ids = typeof a === 'string' ? [a] : (Array.isArray(a.ids) ? a.ids : []);
    for (const id of ids) if (counts.has(id)) counts.set(id, counts.get(id) + 1);
    if (typeof a === 'object' && typeof a.other === 'string' && a.other.trim()) {
      otherTexts.push({ responseId: r.id, recipientId: r.recipientId, text: a.other });
    }
  }
  const n = base.length;
  return {
    type: q.type, questionId: q.id, n, answered,
    options: q.options.map((o) => ({ id: o.id, text: o.text, count: counts.get(o.id), share: n ? counts.get(o.id) / n : null })),
    otherCount: otherTexts.length,
    otherTexts,
  };
}

function ratingStats(q, base) {
  const rows = q.rows.map((row) => {
    const values = [];
    const dist = [0, 0, 0, 0, 0];
    let na = 0;
    for (const r of base) {
      const v = r.answers?.[q.id]?.[row.id];
      if (v === 'na') na += 1;
      else if (Number.isInteger(v) && v >= 1 && v <= 5) { values.push(v); dist[v - 1] += 1; }
    }
    return {
      id: row.id, text: row.text, n: values.length, mean: mean(values), median: median(values), dist, na,
      topShare: values.length ? (dist[3] + dist[4]) / values.length : null,
    };
  });
  return { type: 'rating', questionId: q.id, n: base.length, rows };
}

function kanoStats(q, base) {
  const items = q.rows.map((row) => ({ id: row.id, nodeId: null, label: row.text, path: '', missing: false }));
  const respondents = base.map((r) => ({ id: r.id, name: '' }));
  const answers = Object.fromEntries(base.map((r) => [r.id, r.answers?.[q.id] || {}]));
  const { rows } = evaluate(items, respondents, answers, { importance: Boolean(q.importance) });
  return { type: 'kano', questionId: q.id, n: base.length, rows: rows.map((row) => ({ ...row, id: row.itemId, text: row.label })) };
}

function textStats(q, base) {
  const answers = base
    .filter((r) => typeof r.answers?.[q.id] === 'string' && r.answers[q.id].trim())
    .map((r) => ({ responseId: r.id, recipientId: r.recipientId, text: r.answers[q.id] }));
  return { type: 'text', questionId: q.id, n: base.length, answers };
}

/**
 * @param {object} survey
 * @param {object} question
 * @param {object[]} responses
 * @returns {object|null} see the Interfaces block of the plan (Task 6)
 */
export function questionStats(survey, question, responses) {
  const base = responses.filter((r) => isVisible(question, r.answers, survey));
  switch (question.type) {
    case 'single':
    case 'multi': return choiceStats(question, base);
    case 'rating': return ratingStats(question, base);
    case 'kano': return kanoStats(question, base);
    case 'text': return textStats(question, base);
    default: return null;
  }
}

/**
 * Sent / answered / rate, per recipient group, plus responses that came
 * without a known recipient (counted separately, spec §7.1).
 * @param {{recipients: object[], responses: object[], answeredRecipientIds: string[]}} data
 * @returns {{sent: number, answered: number, rate: number|null, withoutRecipient: number,
 *            groups: Array<{group: string, sent: number, answered: number, rate: number|null}>}}
 */
export function responseRate({ recipients, responses, answeredRecipientIds }) {
  const answeredSet = new Set(answeredRecipientIds);
  const groups = new Map();
  let sent = 0;
  let answered = 0;
  for (const r of recipients) {
    const isAnswered = answeredSet.has(r.id);
    // Answering proves receipt, so an answerer counts as sent even without sentAt.
    const isSent = Boolean(r.sentAt) || isAnswered;
    if (!isSent) continue;
    const key = (r.group || '').trim();
    const g = groups.get(key) || { group: key, sent: 0, answered: 0, rate: null };
    if (isSent) { g.sent += 1; sent += 1; }
    if (isAnswered) { g.answered += 1; answered += 1; }
    groups.set(key, g);
  }
  const list = [...groups.values()]
    .map((g) => ({ ...g, rate: g.sent ? g.answered / g.sent : null }))
    .sort((a, b) => (a.group === '') - (b.group === '') || a.group.localeCompare(b.group));
  return {
    sent, answered, rate: sent ? answered / sent : null,
    withoutRecipient: responses.filter((r) => !r.viaRecipient).length,
    groups: list,
  };
}

/**
 * All rows of all rating questions in one ranking ("Top-Prioritäten").
 * @param {object} survey
 * @param {object[]} responses
 * @returns {Array<{questionId, questionText, rowId, text, n, mean, topShare}>}
 */
export function ratingRanking(survey, responses) {
  const out = [];
  for (const { question: q } of documentOrder(survey)) {
    if (q.type !== 'rating') continue;
    for (const row of questionStats(survey, q, responses).rows) {
      out.push({ questionId: q.id, questionText: q.text, rowId: row.id, text: row.text, n: row.n, mean: row.mean, topShare: row.topShare });
    }
  }
  return out.sort((a, b) => {
    if (a.mean === null && b.mean === null) return 0;
    if (a.mean === null) return 1;
    if (b.mean === null) return -1;
    return b.mean - a.mean;
  });
}

/**
 * All Kano rows of all kano questions.
 * @param {object} survey
 * @param {object[]} responses
 * @returns {Array<{questionId, questionText, rowId, text, category, cs, ds, importanceMean, n}>}
 */
export function kanoOverview(survey, responses) {
  const out = [];
  for (const { question: q } of documentOrder(survey)) {
    if (q.type !== 'kano') continue;
    for (const row of questionStats(survey, q, responses).rows) {
      out.push({
        questionId: q.id, questionText: q.text, rowId: row.id, text: row.text,
        category: row.category, cs: row.cs, ds: row.ds, importanceMean: row.importanceMean, n: row.n,
      });
    }
  }
  return out;
}

/**
 * Open answers (text questions + "other" texts) and how many of them were
 * taken into the VoC tree (`<responseId>:<questionId>` keys).
 * @param {object} survey
 * @param {object[]} responses
 * @param {string[]} responseKeys
 * @returns {{total: number, taken: number}}
 */
export function freeTextSummary(survey, responses, responseKeys) {
  const taken = new Set(responseKeys);
  let total = 0;
  let takenCount = 0;
  for (const { question: q } of documentOrder(survey)) {
    const s = questionStats(survey, q, responses);
    const entries = s?.type === 'text' ? s.answers : (s?.otherTexts || []);
    for (const e of entries) {
      total += 1;
      if (taken.has(`${e.responseId}:${q.id}`)) takenCount += 1;
    }
  }
  return { total, taken: takenCount };
}

/**
 * Group comparison by one `single` question (spec §7.2). Apply the filter
 * first (`filterResponses`), then pass the result here.
 * @param {object} survey
 * @param {object[]} responses
 * @param {string} groupByQuestionId
 * @returns {object|null}
 */
export function groupComparison(survey, responses, groupByQuestionId) {
  const gq = findQuestion(survey, groupByQuestionId);
  if (!gq || gq.type !== 'single') return null;
  const groups = gq.options.map((o) => {
    const members = responses.filter((r) => isVisible(gq, r.answers, survey) && r.answers?.[gq.id] === o.id);
    return { id: o.id, text: o.text, n: members.length, few: members.length < FEW_RESPONSES, members };
  });
  const questions = [];
  for (const { question: q } of documentOrder(survey)) {
    if (q.id === gq.id || !COMPARED.includes(q.type)) continue;
    const overall = questionStats(survey, q, responses);
    const per = groups.map((g) => questionStats(survey, q, g.members));
    if (q.type === 'single' || q.type === 'multi') {
      questions.push({
        type: q.type, questionId: q.id, text: q.text,
        options: q.options.map((o, i) => ({ id: o.id, text: o.text, shares: per.map((p) => p.options[i].share) })),
      });
    } else if (q.type === 'rating') {
      questions.push({
        type: 'rating', questionId: q.id, text: q.text,
        rows: overall.rows.map((row, i) => ({
          id: row.id, text: row.text, overall: row.mean,
          cells: per.map((p) => {
            const m = p.rows[i].mean;
            return { mean: m, deviates: m !== null && row.mean !== null && Math.abs(m - row.mean) >= DEVIATION - 1e-9 };
          }),
        })),
      });
    } else {
      questions.push({
        type: 'kano', questionId: q.id, text: q.text,
        rows: q.rows.map((row) => {
          const categories = per.map((p) => p.rows.find((x) => x.id === row.id)?.category ?? null);
          return { id: row.id, text: row.text, categories, differs: new Set(categories.filter(Boolean)).size > 1 };
        }),
      });
    }
  }
  return { questionId: gq.id, groups: groups.map(({ members, ...g }) => g), questions };
}

/**
 * Columns for "Als Worksheet" (spec §6.2): one row per response.
 * @param {object} survey
 * @param {object[]} responses
 * @param {Array<{id: string, name: string}>} recipients
 * @param {{responseId, submittedAt, recipient, other, functional, dysfunctional, importance, category, question}} strings
 * @returns {Array<{name: string, type: 'numeric'|'text', role: string, values: Array<number|string|null>}>}
 */
export function worksheetColumns(survey, responses, recipients, strings) {
  const cols = [];
  const add = (name, type, role, valueOf) => cols.push({ name, type, role, values: responses.map(valueOf) });
  const names = new Map(recipients.map((r) => [r.id, r.name]));

  add(strings.responseId, 'text', ROLE.IDENTIFIER, (r) => r.id);
  add(strings.submittedAt, 'text', ROLE.IDENTIFIER, (r) => r.submittedAt || null);
  if (!survey.anonymous) add(strings.recipient, 'text', ROLE.CATEGORICAL, (r) => names.get(r.recipientId) || null);

  documentOrder(survey).forEach(({ question: q }, index) => {
    const label = q.text.trim() || `${strings.question} ${index + 1}`;
    // Value of one column for one response; null when the question was hidden.
    const col = (name, type, role, pick) => add(name, type, role,
      (r) => (isVisible(q, r.answers, survey) ? pick(r.answers?.[q.id]) : null));

    if (q.type === 'single') {
      const text = new Map(q.options.map((o) => [o.id, o.text]));
      col(label, 'text', ROLE.CATEGORICAL, (a) => (typeof a === 'string' ? text.get(a) ?? null : (a?.other || null)));
    } else if (q.type === 'multi') {
      for (const o of q.options) {
        col(`${label}: ${o.text}`, 'numeric', ROLE.CATEGORICAL, (a) => (Array.isArray(a?.ids) && a.ids.includes(o.id) ? 1 : 0));
      }
      if (q.other) col(`${label}: ${strings.other}`, 'text', ROLE.FREE_TEXT, (a) => a?.other || null);
    } else if (q.type === 'rating') {
      for (const row of q.rows) {
        col(`${label}: ${row.text}`, 'numeric', ROLE.ORDINAL, (a) => (Number.isInteger(a?.[row.id]) ? a[row.id] : null));
      }
    } else if (q.type === 'kano') {
      for (const row of q.rows) {
        const cell = (a) => a?.[row.id] || {};
        col(`${row.text} (${strings.functional})`, 'numeric', ROLE.ORDINAL, (a) => cell(a).f ?? null);
        col(`${row.text} (${strings.dysfunctional})`, 'numeric', ROLE.ORDINAL, (a) => cell(a).d ?? null);
        if (q.importance) col(`${row.text} (${strings.importance})`, 'numeric', ROLE.ORDINAL, (a) => cell(a).w ?? null);
        col(`${row.text} (${strings.category})`, 'text', ROLE.CATEGORICAL, (a) => {
          const { f, d } = cell(a);
          return Number.isInteger(f) && Number.isInteger(d) ? classify(f, d) : null;
        });
      }
    } else if (q.type === 'text') {
      col(label, 'text', ROLE.FREE_TEXT, (a) => (typeof a === 'string' && a.trim() ? a : null));
    }
  });
  return cols;
}
