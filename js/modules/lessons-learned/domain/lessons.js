/**
 * D.Mike — Lessons Learned: reine Funktionen über die Erfahrungen.
 *
 * Wertemengen, Kennzahlen, Filter und Suche der Liste, die Normalform einer
 * eingelesenen Erfahrung und die Vorgabephase. Ohne DOM, ohne i18n.
 */
import { getPhaseIds, DEFAULT_CYCLE } from '../../../core/cycles/cycles.js';

/** Die Kategorien einer Erfahrung. */
export const CATEGORIES = Object.freeze(['success', 'problem', 'improve']);

/** Die Stufen der Wirkung. */
export const IMPACTS = Object.freeze(['high', 'medium', 'low']);

/**
 * @typedef {object} LessonAction
 * @property {string} text
 * @property {boolean} done
 */

/**
 * @typedef {object} Lesson
 * @property {string} id
 * @property {string} title
 * @property {string} category
 * @property {string} phase
 * @property {string} impact
 * @property {string} owner
 * @property {string} description
 * @property {string} rootCause
 * @property {string} recommendation
 * @property {LessonAction[]} actions
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * Die letzte Phase eines Zyklus — Vorgabe einer neuen Erfahrung.
 * @param {string} cycle @returns {string}
 */
export function lastPhase(cycle) {
  return getPhaseIds(cycle).at(-1) ?? getPhaseIds(DEFAULT_CYCLE).at(-1);
}

/**
 * Zahl der Erfahrungen je Kategorie und der offenen Maßnahmen.
 * @param {ReadonlyArray<Pick<Lesson, 'category'|'actions'>>} lessons
 * @returns {{ total: number, success: number, problem: number, improve: number, openActions: number }}
 */
export function statsOf(lessons) {
  const out = { total: 0, success: 0, problem: 0, improve: 0, openActions: 0 };
  for (const l of lessons) {
    out.total++;
    if (l.category === 'success') out.success++;
    else if (l.category === 'problem') out.problem++;
    else if (l.category === 'improve') out.improve++;
    out.openActions += l.actions.filter((a) => !a.done).length;
  }
  return out;
}

/**
 * Erfahrungen mit hoher Wirkung und mindestens einer offenen Maßnahme, in
 * gespeicherter Reihenfolge, höchstens `n`.
 * @template {Pick<Lesson, 'impact'|'actions'>} T
 * @param {ReadonlyArray<T>} lessons @param {number} n @returns {T[]}
 */
export function openHighImpact(lessons, n) {
  return lessons.filter((l) => l.impact === 'high' && l.actions.some((a) => !a.done)).slice(0, n);
}

/**
 * Die angezeigten Erfahrungen: Kategorie-Filter, Suche über Titel,
 * Beschreibung, Verantwortlich, Empfehlung und Ursache (ohne Groß- und
 * Kleinschreibung), die neueste zuerst; gleich alte in gespeicherter
 * Reihenfolge.
 * @template {Lesson} T
 * @param {ReadonlyArray<T>} lessons
 * @param {string} filter `all` oder eine Kategorie
 * @param {string} search
 * @returns {T[]}
 */
export function shownLessons(lessons, filter, search) {
  let list = [...lessons];
  if (filter !== 'all') list = list.filter((l) => l.category === filter);
  const q = String(search ?? '').toLowerCase().trim();
  if (q) {
    list = list.filter((l) => [l.title, l.description, l.owner, l.recommendation, l.rootCause]
      .some((s) => String(s || '').toLowerCase().includes(q)));
  }
  return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} v @returns {string} */
const textOr = (v) => (typeof v === 'string' ? v : '');

/** @param {unknown} v @returns {number} */
const stamp = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Eine eingelesene Erfahrung in Normalform, ohne id: Texte bleiben, sonst
 * leer; eine unbekannte Kategorie wird `success`, eine unbekannte Wirkung
 * `medium`; die Phase bleibt als Text, sonst die letzte Phase des
 * Standardzyklus; Zeitstempel als endliche Zahl, sonst 0; je Maßnahme nur
 * Text und Haken. Was kein Objekt ist, liefert `null`.
 * @param {unknown} raw
 * @returns {Omit<Lesson, 'id'>|null}
 */
export function toLesson(raw) {
  if (!isObject(raw)) return null;
  return {
    title: textOr(raw.title),
    category: CATEGORIES.includes(raw.category) ? raw.category : 'success',
    phase: typeof raw.phase === 'string' ? raw.phase : lastPhase(DEFAULT_CYCLE),
    impact: IMPACTS.includes(raw.impact) ? raw.impact : 'medium',
    owner: textOr(raw.owner),
    description: textOr(raw.description),
    rootCause: textOr(raw.rootCause),
    recommendation: textOr(raw.recommendation),
    actions: Array.isArray(raw.actions) ? raw.actions.map((a) => ({
      text: isObject(a) ? textOr(a.text) : '',
      done: isObject(a) && typeof a.done === 'boolean' ? a.done : false,
    })) : [],
    createdAt: stamp(raw.createdAt),
    updatedAt: stamp(raw.updatedAt),
  };
}
