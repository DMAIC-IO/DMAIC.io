/**
 * Course content lint: every course and every built lesson.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { COURSES, findLesson, quizIds } from '../../../js/pages/training/courses/index.js';
import { WIDGETS } from '../../../js/pages/training/widgets/index.js';
import { GLOSSARY_TERMS } from '../../../js/core/glossary-data.generated.js';

const LANGS = ['de', 'en'];
const GATE_FIELDS = ['revealAfter', 'revealAfterN', 'revealAfterShapes', 'revealAfterValues', 'revealAfterEach', 'revealAfterSamples', 'revealAfterSettings', 'revealAfterChoices'];

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
          for (const gate of GATE_FIELDS) {
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

  test('the correct option does not sit at the same position in every quiz of a lesson', () => {
    for (const { lesson } of builtLessons()) {
      const positions = blocksOf(lesson, 'de').filter((b) => b.type === 'quiz')
        .map((b) => b.options.findIndex((o) => o.correct));
      if (positions.length < 2) continue;
      assertTrue(new Set(positions).size > 1, `${lesson.id} correct option always at index ${positions[0]}`);
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

  test('lessons use only block types the lesson view renders', () => {
    // Keep in sync with the isType(b, '…') branches of js/pages/training/training.html.
    const rendered = new Set(['heading', 'paragraph', 'note', 'list', 'steps', 'definition', 'table', 'insight', 'simulation', 'quiz']);
    for (const { lesson } of builtLessons()) {
      for (const lang of LANGS) {
        for (const b of blocksOf(lesson, lang)) {
          assertTrue(rendered.has(b.type), `${lesson.id} ${lang}: block type "${b.type}" is not rendered`);
        }
      }
    }
  });

  test('manifest title and summary equal the lesson own, per language', () => {
    for (const { ref, lesson } of builtLessons()) {
      for (const lang of LANGS) {
        assertEqual(ref[lang].title, lesson[lang].title, `${ref.id} ${lang} title`);
        assertEqual(ref[lang].summary, lesson[lang].summary, `${ref.id} ${lang} summary`);
      }
    }
  });

  test('definitions carry exactly one of formula/content; formulas are LaTeX, never Unicode math', () => {
    for (const { lesson } of builtLessons()) {
      for (const lang of LANGS) {
        for (const b of blocksOf(lesson, lang).filter((x) => x.type === 'definition')) {
          const where = `${lesson.id} ${lang} ${b.term}`;
          const hasFormula = typeof b.formula === 'string' && b.formula.length > 0;
          const hasContent = typeof b.content === 'string' && b.content.length > 0;
          assertTrue(hasFormula !== hasContent, `${where}: exactly one of formula/content`);
          if (hasFormula) assertTrue(!/[Σσμ√ᵢ²]|̄/.test(b.formula), `${where}: formula is LaTeX`);
        }
      }
    }
  });

  test('summation formulas in lesson text are written as $…$', () => {
    for (const { lesson } of builtLessons()) {
      for (const lang of LANGS) {
        const unicode = strings(lesson[lang]).filter((x) => /Σ\s*\(|Σx/.test(x));
        assertDeepEqual(unicode, [], `${lesson.id} ${lang}`);
      }
    }
  });

  test('lesson 3 follows the approved structure', () => {
    const { lesson } = findLesson('sampling-distribution');
    for (const lang of LANGS) {
      const steps = lesson[lang].steps;
      assertEqual(steps.length, 7, `${lang} step count`);
      const withTheory = steps
        .map((s, i) => (s.blocks.some((b) => b.type === 'simulation' && b.params.showTheory) ? i : -1))
        .filter((i) => i >= 0);
      assertDeepEqual(withTheory, [4], `${lang} theory overlay only in the standard error step`);
      const clt = blocksOf(lesson, lang).find((b) => b.type === 'insight' && b.id === 'clt');
      assertEqual(clt.revealAfterShapes, 2);
      assertEqual(clt.revealAfterN, 3);
      assertEqual(quizIds(lesson).length, 4);
      assertTrue(!strings(lesson[lang]).some((x) => /Prozessfähigkeit|process capability/i.test(x)), 'no capability mention');
      assertTrue(!strings(steps.slice(0, 4)).some((x) => /σ\s*\/\s*√n|\\sigma\s*\/\s*\\sqrt|\\frac\{\\sigma\}\{\\sqrt/.test(x)), 'sigma/sqrt(n) only from the standard error step on');
    }
  });

  test('lesson 1 follows the approved structure', () => {
    const found = findLesson('variation');
    const lesson = found && found.lesson;
    assertTrue(!!lesson, 'lesson 1 is built');
    for (const lang of LANGS) {
      const steps = lesson[lang].steps;
      assertEqual(steps.length, 8, `${lang} step count`);
      // Symbols case-sensitive: /σ/i would also match the Σ of x̄ = Σxᵢ / n.
      const banned = strings(lesson[lang]).filter((x) => /Grundgesamtheit|Stichprobe|population|\bsamples?\b/i.test(x) || /[μσ]|\\mu|\\sigma/.test(x));
      assertDeepEqual(banned, [], `${lang}: no population/sample words or symbols`);
      const glossaries = blocksOf(lesson, lang).filter((b) => b.type === 'definition').map((b) => b.glossary);
      for (const id of ['mittelwert', 'spannweite', 'standardabweichung']) {
        assertTrue(glossaries.includes(id), `${lang}: definition ${id}`);
      }
      const waiting = steps[5].blocks.find((b) => b.type === 'simulation');
      assertDeepEqual(waiting.params.bands, [1], `${lang}: waiting times show only ± 1 s`);
    }
    assertDeepEqual(quizIds(lesson), ['q-reliable', 'q-sd-calc', 'q-two-thirds', 'q-wait-below']);
  });

  test('lesson 2 follows the approved structure', () => {
    const found = findLesson('sampling');
    const lesson = found && found.lesson;
    assertTrue(!!lesson, 'lesson 2 is built');
    for (const lang of LANGS) {
      const steps = lesson[lang].steps;
      assertEqual(steps.length, 6, `${lang} step count`);
      const banned = strings(lesson[lang])
        .filter((x) => /Stichprobenverteilung|Standardfehler|sampling distribution|standard error|√n/i.test(x));
      assertDeepEqual(banned, [], `${lang}: no lesson-3 wording`);
      const definitions = blocksOf(lesson, lang).filter((b) => b.type === 'definition');
      for (const id of ['grundgesamtheit', 'stichprobe', 'varianz']) {
        assertTrue(definitions.some((b) => b.glossary === id), `${lang}: definition ${id}`);
      }
      assertTrue(definitions.some((b) => b.formula?.includes('\\mu = \\frac{\\sum x_i}{N}')), `${lang}: μ formula`);
      const check = steps[3].blocks.find((b) => b.type === 'simulation');
      assertEqual(check.widget, 'variance-check', `${lang}: step 4 widget`);
      assertEqual(check.params.n, 3, `${lang}: step 4 n`);
      const insight = steps[3].blocks.find((b) => b.type === 'insight');
      assertEqual(insight.revealAfterSamples, 1000, `${lang}: step 4 gate`);
    }
    assertDeepEqual(quizIds(lesson), ['q-fixed', 'q-estimate', 'q-symbol', 'q-n-minus-1']);
  });

  test('lesson 4 follows the approved structure', () => {
    const found = findLesson('confidence-interval');
    const lesson = found && found.lesson;
    assertTrue(!!lesson, 'lesson 4 is built');
    const misreading = /mit\s*95\s*%\s*Wahrscheinlichkeit|95\s*%\s*(probability|chance)/i;
    for (const lang of LANGS) {
      const steps = lesson[lang].steps;
      assertEqual(steps.length, 7, `${lang} step count`);
      const all = strings(lesson[lang]);
      assertDeepEqual(all.filter((x) => /Signifikanz|p-Wert|significan|p-value|α|\\alpha/i.test(x)), [],
        `${lang}: no significance, p-value or α`);
      // Distractors may state the misreading; everything else must not.
      const wrongOptions = blocksOf(lesson, lang).filter((b) => b.type === 'quiz')
        .flatMap((q) => q.options.filter((o) => !o.correct));
      const wrongTexts = new Set(strings(wrongOptions));
      assertDeepEqual(all.filter((x) => misreading.test(x) && !wrongTexts.has(x)), [],
        `${lang}: no probability misreading outside wrong options`);
      const glossaries = blocksOf(lesson, lang).filter((b) => b.type === 'definition').map((b) => b.glossary);
      for (const id of ['konfidenzintervall', 'konfidenzniveau', 't-verteilung']) {
        assertTrue(glossaries.includes(id), `${lang}: definition ${id}`);
      }
      const sims = steps.map((s) => s.blocks.find((b) => b.type === 'simulation') || null);
      assertDeepEqual(sims.map((b) => b && b.widget),
        [null, null, 'interval-coverage', 'interval-coverage', 'interval-coverage', null, null], `${lang}: widgets`);
      assertDeepEqual(sims[2].params, { nChoices: [10], levelChoices: [0.95] }, `${lang}: step 3 params`);
      assertDeepEqual(sims[3].params, { nChoices: [5, 10, 40], levelChoices: [0.9, 0.95, 0.99] }, `${lang}: step 4 params`);
      assertDeepEqual(sims[4].params, { nChoices: [5], levelChoices: [0.95], sigma: 'unknown', compare: true },
        `${lang}: step 5 params`);
      const insights = steps.map((s) => s.blocks.find((b) => b.type === 'insight') || null);
      assertEqual(insights[2].id, 'hit-rate');
      assertEqual(insights[2].revealAfterSamples, 1000, `${lang}: step 3 gate`);
      assertEqual(insights[3].id, 'width');
      assertEqual(insights[3].revealAfterSettings, 2, `${lang}: step 4 gate`);
      assertEqual(insights[4].id, 't-factor');
      assertEqual(insights[4].revealAfterSamples, 1000, `${lang}: step 5 gate`);
    }
    assertDeepEqual(quizIds(lesson), ['q-meaning', 'q-n', 'q-level', 'q-t']);
    const correctAt = lesson.de.steps[5].blocks.filter((b) => b.type === 'quiz')
      .map((q) => q.options.findIndex((o) => o.correct));
    assertDeepEqual(correctAt, [2, 1, 0, 2], 'correct option positions');
  });
});
