/**
 * D.Mike — Course registry (courses/index.js)
 *
 * Browser-free: imported by the training page and by the static handbook (Node).
 */

import statisticsBasics from './statistics-basics.js';

/** @type {object[]} All courses. */
export const COURSES = [statisticsBasics];

/**
 * Find a lesson (manifest entry plus course) by id.
 * @param {string} lessonId
 * @returns {{course: object, ref: object, lesson: object|undefined}|null}
 */
export function findLesson(lessonId) {
  for (const course of COURSES) {
    const ref = course.lessons.find((l) => l.id === lessonId);
    if (ref) return { course, ref, lesson: ref.content };
  }
  return null;
}

/**
 * Quiz ids of a lesson (ids are language-independent, read from `de`).
 * @param {{de: {steps: {blocks: object[]}[]}}} lesson
 * @returns {string[]}
 */
export function quizIds(lesson) {
  return lesson.de.steps.flatMap((s) => s.blocks).filter((b) => b.type === 'quiz').map((b) => b.id);
}
