/**
 * Guards the static course overview page: lesson list in order, the
 * "in preparation" label, one link into the app (the app has no lesson URLs),
 * no lesson step text and escaped titles.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrainingCoursesPage, renderTrainingIndex } from './pages.mjs';
import { appRootFrom } from './page-shell.mjs';
import { COURSES } from '../../../js/pages/training/courses/index.js';

const LESSON_IDS = [
  'variation', 'sampling', 'sampling-distribution',
  'confidence-interval', 'hypothesis-test', 'errors-power',
];

/** Plain text of every lesson item title, in document order. */
function itemTitles(html) {
  return [...html.matchAll(/<li class="handbook-course__lesson"[^>]*>\s*<strong>([^<]*)<\/strong>/g)].map((m) => m[1]);
}

test('de page lists the six lesson titles in order', () => {
  const page = renderTrainingCoursesPage({ lang: 'de', courses: COURSES });
  assert.equal(page.pathFromRoot, '/de/training/courses.html');
  const expected = COURSES[0].lessons.map((l) => l.de.title);
  assert.equal(expected.length, 6);
  assert.deepEqual(itemTitles(page.html), expected);
  assert.deepEqual(COURSES[0].lessons.map((l) => l.id), LESSON_IDS);
  assert.match(page.html, /Statistik-Grundlagen/);
});

test('unbuilt lessons carry the "in Vorbereitung" label, the built ones do not', () => {
  const page = renderTrainingCoursesPage({ lang: 'de', courses: COURSES });
  assert.equal((page.html.match(/in Vorbereitung/g) || []).length, 4);
  for (const id of ['variation', 'sampling-distribution']) {
    const built = page.html.match(new RegExp(`<li class="handbook-course__lesson"[^>]*data-lesson-id="${id}"[\\s\\S]*?<\\/li>`))[0];
    assert.doesNotMatch(built, /in Vorbereitung/);
  }
});

test('exactly one "open in app" link, pointing at the app root', () => {
  const page = renderTrainingCoursesPage({ lang: 'de', courses: COURSES });
  const links = [...page.html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>In der App öffnen/g)];
  assert.equal(links.length, 1);
  assert.equal(links[0][1], appRootFrom(page.pathFromRoot));
});

test('no step text of a lesson appears on the page', () => {
  const page = renderTrainingCoursesPage({ lang: 'de', courses: COURSES });
  assert.doesNotMatch(page.html, /Die Ausgangsfrage/);
  assert.doesNotMatch(page.html, /Experiment: eine schiefe Grundgesamtheit/);
});

test('en page uses English titles and link label', () => {
  const page = renderTrainingCoursesPage({ lang: 'en', courses: COURSES });
  assert.equal(page.pathFromRoot, '/en/training/courses.html');
  assert.deepEqual(itemTitles(page.html), COURSES[0].lessons.map((l) => l.en.title));
  assert.match(page.html, /Statistics basics/);
  assert.match(page.html, />Open in app/);
  assert.match(page.html, /in preparation/);
  assert.equal(page.altPathFromRoot, '/de/training/courses.html');
});

test('titles and summaries are HTML-escaped', () => {
  const course = {
    id: 'x',
    de: { title: 'A<b>', summary: 'S<i>' },
    en: { title: 'A<b>', summary: 'S<i>' },
    lessons: [{ id: 'l', de: { title: 'L<u>', summary: 'x&y' }, en: { title: 'L<u>', summary: 'x&y' }, prerequisites: [] }],
  };
  const page = renderTrainingCoursesPage({ lang: 'de', courses: [course] });
  assert.match(page.html, /A&lt;b&gt;/);
  assert.match(page.html, /L&lt;u&gt;/);
  assert.match(page.html, /x&amp;y/);
  assert.doesNotMatch(page.html, /<b>|<u>|<i>/);
});

test('the training index links to the course overview', () => {
  const page = renderTrainingIndex({ lang: 'de', i18n: {} });
  assert.match(page.html, /href="\.\/courses\.html"/);
});
