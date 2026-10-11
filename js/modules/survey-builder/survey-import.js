/**
 * D.Mike — Survey import (survey-import.js)
 *
 * Validates one answer file against the current questionnaire definition
 * and sanitises its answers per question type. Unknown ids (from an older
 * version) are dropped and reported as orphans.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §6.1
 */

import { documentOrder } from './survey-conditions.js';

export const RESPONSE_FORMAT = 'dmike-survey-response';
export const RESPONSE_FORMAT_VERSION = 1;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const onScale = (v, max) => Number.isInteger(v) && v >= 1 && v <= max;
const cleanText = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Sanitises one raw answer against its question definition.
 * @param {object} q question
 * @param {*} a raw answer
 * @param {(id: string) => void} orphan callback for unknown ids
 * @returns {*} sanitised answer, or undefined to drop it
 */
function sanitizeAnswer(q, a, orphan) {
  if (q.type === 'single') {
    if (typeof a === 'string') {
      if (q.options.some((o) => o.id === a)) return a;
      orphan(a);
      return undefined;
    }
    const other = isObject(a) ? cleanText(a.other) : null;
    return other ? { other } : undefined;
  }
  if (q.type === 'multi') {
    if (!isObject(a)) return undefined;
    const known = new Set(q.options.map((o) => o.id));
    const ids = [];
    for (const id of Array.isArray(a.ids) ? a.ids : []) {
      if (typeof id !== 'string') continue;
      if (!known.has(id)) orphan(id);
      else if (!ids.includes(id)) ids.push(id);
    }
    const other = cleanText(a.other);
    return ids.length || other ? { ids, other } : undefined;
  }
  if (q.type === 'rating' || q.type === 'kano') {
    if (!isObject(a)) return undefined;
    const known = new Set(q.rows.map((r) => r.id));
    const out = {};
    for (const [rowId, v] of Object.entries(a)) {
      if (!known.has(rowId)) { orphan(rowId); continue; }
      if (q.type === 'rating') {
        if (onScale(v, 5) || (v === 'na' && q.noAnswer)) out[rowId] = v;
      } else if (isObject(v)) {
        const cell = {
          f: onScale(v.f, 5) ? v.f : null,
          d: onScale(v.d, 5) ? v.d : null,
          w: q.importance && onScale(v.w, 9) ? v.w : null,
        };
        if (cell.f != null || cell.d != null || cell.w != null) out[rowId] = cell;
      }
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (q.type === 'text') return cleanText(a) ?? undefined;
  return undefined;
}

/**
 * Parses and sanitises one answer file.
 * @param {string} json content of one answer file
 * @param {object} survey current definition (State.survey)
 * @param {string[]} [existingResponseIds] ids of already imported responses
 * @returns {{status: 'invalid'|'foreign'|'duplicate'|'older'|'ok', response?: object, orphanIds?: string[]}}
 */
export function parseResponse(json, survey, existingResponseIds = []) {
  let d;
  try { d = JSON.parse(json); } catch { return { status: 'invalid' }; }
  const valid = isObject(d)
    && d.format === RESPONSE_FORMAT
    && d.formatVersion === RESPONSE_FORMAT_VERSION
    && typeof d.surveyId === 'string' && d.surveyId !== ''
    && Number.isInteger(d.surveyVersion) && d.surveyVersion >= 1
    && typeof d.responseId === 'string' && d.responseId !== ''
    && typeof d.submittedAt === 'string' && d.submittedAt !== ''
    && (d.recipientId == null || typeof d.recipientId === 'string')
    && isObject(d.answers);
  if (!valid) return { status: 'invalid' };
  if (d.surveyId !== survey.id) return { status: 'foreign' };
  if (existingResponseIds.includes(d.responseId)) return { status: 'duplicate' };

  const questions = new Map(documentOrder(survey).map((e) => [e.question.id, e.question]));
  const orphanIds = [];
  const orphan = (id) => { if (!orphanIds.includes(id)) orphanIds.push(id); };
  const answers = {};
  for (const [questionId, raw] of Object.entries(d.answers)) {
    const q = questions.get(questionId);
    if (!q) { orphan(questionId); continue; }
    const clean = sanitizeAnswer(q, raw, orphan);
    if (clean !== undefined) answers[questionId] = clean;
  }
  return {
    status: d.surveyVersion < survey.version ? 'older' : 'ok',
    response: {
      id: d.responseId,
      surveyVersion: d.surveyVersion,
      recipientId: d.recipientId || null,
      submittedAt: d.submittedAt,
      answers,
    },
    orphanIds,
  };
}
