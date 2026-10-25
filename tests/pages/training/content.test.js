/**
 * Course content lint: every course and every built lesson.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { COURSES, findLesson, quizIds } from '../../../js/pages/training/courses/index.js';
import { WIDGETS } from '../../../js/pages/training/widgets/index.js';
import { GLOSSARY_TERMS } from '../../../js/core/glossary-data.generated.js';

const LANGS = ['de', 'en'];
const GATE_FIELDS = ['revealAfter', 'revealAfterN', 'revealAfterShapes'];

/** All built lessons as {course, ref, lesson}. */
function builtLessons() {
  const out = [];
  for (const course of COURSES) {
    for (const ref of course.lessons) {
      if (ref.content) out.push({ course, ref, lesson: ref.content });
    }
  }
  return out;
}

/** Every string anywhere inside a value. */
function strings(value, acc = []) {
  if (typeof value === 'string') acc.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, acc));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, acc));
  return acc;
}

const blocksOf = (lesson, lang) => lesson[lang].steps.flatMap((s) => s.blocks);

suite('course content', () => {
  test('registry has the statistics-basics course with six lessons in order', () => {
    const course = COURSES.find((c) => c.id === 'statistics-basics');
    assertTrue(!!course, 'course missing');
    assertDeepEqual(course.lessons.map((l) => l.id), [
      'variation', 'sampling', 'sampling-distribution',
      'confidence-interval', 'hypothesis-test', 'errors-power',
    ]);
    const hit = findLesson('sampling-distribution');
    assertEqual(hit.course.id, 'statistics-basics');
    assertEqual(hit.lesson.id, 'sampling-distribution');
    assertEqual(findLesson('nope'), null);
  });

  test('de and en have the same steps and block types', () => {
    for (const { lesson } of builtLessons()) {
      assertEqual(lesson.de.steps.length, lesson.en.steps.length, `${lesson.id} step count`);
      lesson.de.steps.forEach((step, i) => {
        const en = lesson.en.steps[i];
        assertDeepEqual(step.blocks.map((b) => b.type), en.blocks.map((b) => b.type),
          `${lesson.id} step ${i} block types`);
        step.blocks.forEach((b, j) => {
          const e = en.blocks[j];
          assertEqual(b.id, e.id, `${lesson.id} step ${i} block ${j} id`);
          assertEqual(b.widget, e.widget, `${lesson.id} step ${i} block ${j} widget`);
          assertDeepEqual(b.params, e.params, `${lesson.id} step ${i} block ${j} params`);
          for (const gate of ['revealAfter', 'revealAfterN', 'revealAfterShapes']) {
            assertEqual(b[gate], e[gate], `${lesson.id} step ${i} block ${j} ${gate}`);
          }
          // Stored quiz answers are option indices, so the correct position must match.
          assertDeepEqual((b.options || []).map((o) => !!o.correct), (e.options || []).map((o) => !!o.correct),
            `${lesson.id} step ${i} block ${j} correct option position`);
        });
      });
    }
  });

  test('insight and quiz ids are present and unique per lesson', () => {
    for (const { lesson } of builtLessons()) {
      for (const lang of LANGS) {
        const ids = blocksOf(lesson, lang)
          .filter((b) => b.type === 'insight' || b.type === 'quiz')
          .map((b) => b.id);
        ids.forEach((id) => assertTrue(typeof id === 'string' && id.length > 0, `${lesson.id} missing id`));
        assertEqual(new Set(ids).size, ids.length, `${lesson.id} ${lang} ids unique`);
      }
    }
  });

  test('every quiz has exactly one correct option and feedback on every option', () => {
    for (const { lesson } of builtLessons()) {
      for (const lang of LANGS) {
        for (const b of blocksOf(lesson, lang).filter((x) => x.type === 'quiz')) {
          assertTrue(b.options.length >= 2, `${b.id} needs options`);
          assertEqual(b.options.filter((o) => o.correct).length, 1, `${lesson.id}/${b.id} ${lang} correct count`);
          b.options.forEach((o) => assertTrue(!!o.feedback && !!o.text, `${b.id} option text/feedback`));
        }
      }
    }
  });

  test('quizIds lists the quiz ids of a lesson', () => {
    const { lesson } = findLesson('sampling-distribution');
    const ids = quizIds(lesson);
    assertTrue(ids.length >= 1);
    assertDeepEqual(ids, blocksOf(lesson, 'de').filter((b) => b.type === 'quiz').map((b) => b.id));
  });

  test('gates use only known fields', () => {
    for (const { lesson } of builtLessons()) {
      for (const lang of LANGS) {
        for (const b of blocksOf(lesson, lang).filter((x) => x.type === 'insight')) {
          const known = new Set(['type', 'id', 'paragraphs', ...GATE_FIELDS]);
          Object.keys(b).forEach((k) => assertTrue(known.has(k), `${b.id}: unknown field ${k}`));
          if (b.revealAfterShapes != null) {
            assertTrue(b.revealAfterN != null, `${b.id}: revealAfterShapes needs revealAfterN`);
          }
          GATE_FIELDS.forEach((k) => {
            if (b[k] != null) assertTrue(Number.isInteger(b[k]) && b[k] > 0, `${b.id}: ${k} positive integer`);
          });
        }
      }
    }
  });

  test('simulation widgets are registered', () => {
    for (const { lesson } of builtLessons()) {
      for (const lang of LANGS) {
        for (const b of blocksOf(lesson, lang).filter((x) => x.type === 'simulation')) {
          assertTrue(WIDGETS.includes(b.widget), `${lesson.id}: unknown widget ${b.widget}`);
        }
      }
    }
  });

  test('glossary references exist', () => {
    for (const { lesson } of builtLessons()) {
      for (const lang of LANGS) {
        for (const b of blocksOf(lesson, lang)) {
          if (b.type === 'definition' && b.glossary) {
            assertTrue(!!GLOSSARY_TERMS[b.glossary], `${lesson.id}: glossary ${b.glossary}`);
          }
        }
        for (const s of strings(lesson[lang])) {
          for (const m of s.matchAll(/\{\{term:([^|}]+)/g)) {
            assertTrue(!!GLOSSARY_TERMS[m[1]], `${lesson.id}: {{term:${m[1]}}}`);
          }
        }
      }
    }
  });

  test('prerequisites name earlier lessons of the same course', () => {
    for (const course of COURSES) {
      const seen = new Set();
      course.lessons.forEach((ref, i) => {
        ref.prerequisites.forEach((p) => assertTrue(seen.has(p), `${ref.id}: prerequisite ${p} not earlier`));
        if (i > 0) assertDeepEqual(ref.prerequisites, [course.lessons[i - 1].id], `${ref.id} predecessor`);
        seen.add(ref.id);
      });
    }
  });

  test('every lessonRef has de and en title and summary', () => {
    for (const course of COURSES) {
      for (const lang of LANGS) {
        assertTrue(!!course[lang].title && !!course[lang].summary, `${course.id} ${lang}`);
      }
      for (const ref of course.lessons) {
        for (const lang of LANGS) {
          assertTrue(!!ref[lang] && !!ref[lang].title && !!ref[lang].summary, `${ref.id} ${lang}`);
        }
      }
    }
  });

  test('stub lesson keeps the shape the E2E task depends on', () => {
    const { lesson } = findLesson('sampling-distribution');
    const sims = lesson.de.steps.map((s) => s.blocks.findIndex((b) => b.type === 'simulation'));
    assertEqual(sims.length, 2);
    assertTrue(sims[0] >= 0 && sims[0] === sims[1], 'simulation at the same block index');
    const pops = lesson.de.steps.map((s) => s.blocks[sims[0]].params.population);
    assertTrue(pops[0] !== pops[1], 'different populations');
    const types = new Set(blocksOf(lesson, 'de').map((b) => b.type));
    ['paragraph', 'heading', 'list', 'steps', 'note', 'definition', 'table', 'insight', 'simulation', 'quiz']
      .forEach((t) => assertTrue(types.has(t), `block type ${t} used`));
    assertTrue(blocksOf(lesson, 'de').some((b) => b.type === 'insight' && GATE_FIELDS.some((k) => b[k] != null)));
  });
});
