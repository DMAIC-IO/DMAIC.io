/**
 * D.Mike — course progress store (progress-store.js)
 *
 * Persists per-lesson course progress as ONE localStorage document under
 * `dmike.training.progress`. This is the only module that touches
 * localStorage for courses. Progress is deliberately kept outside the
 * stateManager and the project export.
 *
 * Every function takes an optional `storage` (default `globalThis.localStorage`)
 * so tests can inject an in-memory double. Nothing here ever throws: a missing,
 * blocked, full or corrupt storage degrades to "no progress".
 *
 * @typedef {Object} QuizProgress
 * @property {number} answer      Index of the last chosen option.
 * @property {boolean} correct    Whether the last answer was correct.
 * @property {boolean} everCorrect Whether any answer was ever correct.
 *
 * @typedef {Object} LessonProgress
 * @property {number} step              Index of the current step.
 * @property {boolean} reachedLast      Whether the last step was ever reached.
 * @property {string[]} insights        Ids of unlocked insights.
 * @property {Object<string, QuizProgress>} quizzes
 * @property {Object<string, Object<string, {mean: number, sd: number, count: number}>>} results
 *   Per population, per n: summary of the drawn sample means.
 */

export const STORAGE_KEY = 'dmike.training.progress';
export const SCHEMA = 1;

/** @returns {Storage|null} The default storage, or null if inaccessible. */
function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** @param {unknown} v @returns {boolean} True for a plain (non-array) object. */
function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Creates the progress of a lesson nobody has opened yet.
 * @returns {LessonProgress}
 */
export function emptyLesson() {
  return { step: 0, reachedLast: false, insights: [], quizzes: {}, results: {} };
}

/**
 * Fills a stored entry with defaults where fields are missing or malformed.
 * @param {unknown} raw
 * @returns {LessonProgress}
 */
function repair(raw) {
  const base = emptyLesson();
  if (!isObject(raw)) return base;
  return {
    step: Number.isFinite(raw.step) && raw.step >= 0 ? raw.step : base.step,
    reachedLast: raw.reachedLast === true,
    insights: Array.isArray(raw.insights) ? raw.insights.filter((i) => typeof i === 'string') : base.insights,
    quizzes: isObject(raw.quizzes) ? raw.quizzes : base.quizzes,
    results: isObject(raw.results) ? raw.results : base.results,
  };
}

/**
 * Reads the stored document; anything unreadable yields an empty one.
 * @param {Storage} storage
 * @returns {{schema: number, lessons: Object<string, unknown>}}
 */
function readDocument(storage) {
  const empty = { schema: SCHEMA, lessons: {} };
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (!text) return empty;
    const doc = JSON.parse(text);
    if (!isObject(doc) || doc.schema !== SCHEMA || !isObject(doc.lessons)) return empty;
    return { schema: SCHEMA, lessons: doc.lessons };
  } catch {
    return empty;
  }
}

/**
 * Writes the document; failures (quota, blocked storage) are swallowed.
 * @param {Storage} storage
 * @param {{schema: number, lessons: Object<string, unknown>}} doc
 */
function writeDocument(storage, doc) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    /* progress is a convenience; losing it must not break the lesson */
  }
}

/**
 * Loads the progress of one lesson. Never throws.
 * @param {string} lessonId
 * @param {Storage} [storage]
 * @returns {LessonProgress}
 */
export function loadLesson(lessonId, storage = defaultStorage()) {
  if (!storage) return emptyLesson();
  return repair(readDocument(storage).lessons[lessonId]);
}

/**
 * Saves the progress of one lesson, keeping all other lessons. Never throws.
 * @param {string} lessonId
 * @param {LessonProgress} progress
 * @param {Storage} [storage]
 */
export function saveLesson(lessonId, progress, storage = defaultStorage()) {
  if (!storage) return;
  const doc = readDocument(storage);
  doc.lessons[lessonId] = repair(progress);
  writeDocument(storage, doc);
}

/**
 * Forgets the progress of one lesson; other lessons stay. Never throws.
 * @param {string} lessonId
 * @param {Storage} [storage]
 */
export function resetLesson(lessonId, storage = defaultStorage()) {
  if (!storage) return;
  const doc = readDocument(storage);
  if (!(lessonId in doc.lessons)) return;
  delete doc.lessons[lessonId];
  writeDocument(storage, doc);
}

/**
 * Status of a lesson. Complete means: the last step was reached AND every quiz
 * was answered correctly at least once.
 * @param {string} lessonId
 * @param {string[]} quizIds   Ids of all quizzes in the lesson.
 * @param {number} lastStep    Index of the last step.
 * @param {Storage} [storage]
 * @returns {'new'|'started'|'complete'}
 */
export function lessonStatus(lessonId, quizIds, lastStep, storage = defaultStorage()) {
  const p = loadLesson(lessonId, storage);
  const atEnd = p.reachedLast || p.step >= lastStep;
  const allQuizzesPassed = quizIds.every((id) => p.quizzes[id]?.everCorrect === true);
  if (atEnd && allQuizzesPassed && (p.reachedLast || p.step > 0)) return 'complete';
  const touched = p.step > 0 || p.reachedLast || p.insights.length > 0 || Object.keys(p.quizzes).length > 0;
  return touched ? 'started' : 'new';
}
