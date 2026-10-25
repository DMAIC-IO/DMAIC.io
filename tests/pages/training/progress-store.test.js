/**
 * Course progress store: one localStorage document, never throws.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  STORAGE_KEY, SCHEMA, emptyLesson, loadLesson, saveLesson, resetLesson, lessonStatus,
} from '../../../js/pages/training/progress-store.js';

/** In-memory storage double. */
function memoryStorage(initial) {
  const map = new Map(initial ? Object.entries(initial) : []);
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function throwingStorage() {
  const boom = () => { throw new Error('storage unavailable'); };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

function sample() {
  return {
    step: 3,
    reachedLast: false,
    insights: ['a', 'b'],
    quizzes: { q1: { answer: 1, correct: true, everCorrect: true } },
    results: { exponential: { 5: { mean: 35.2, sd: 6.1, count: 1000 } } },
  };
}

suite('progress store', () => {
  test('uses the documented key and schema', () => {
    assertEqual(STORAGE_KEY, 'dmike.training.progress');
    assertEqual(SCHEMA, 1);
  });

  test('round trip', () => {
    const s = memoryStorage();
    saveLesson('l1', sample(), s);
    assertDeepEqual(loadLesson('l1', s), sample());
    assertEqual(JSON.parse(s.getItem(STORAGE_KEY)).schema, 1);
  });

  test('unknown lesson is empty', () => {
    assertDeepEqual(loadLesson('x', memoryStorage()), emptyLesson());
  });

  test('ignores invalid JSON', () => {
    const s = memoryStorage({ [STORAGE_KEY]: '{' });
    assertDeepEqual(loadLesson('x', s), emptyLesson());
    saveLesson('x', sample(), s);
    const doc = JSON.parse(s.getItem(STORAGE_KEY));
    assertEqual(doc.schema, 1);
    assertDeepEqual(doc.lessons.x, sample());
  });

  test('ignores unknown schema', () => {
    const s = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ schema: 2, lessons: { a: sample() } }) });
    assertDeepEqual(loadLesson('a', s), emptyLesson());
  });

  test('survives a throwing storage', () => {
    const s = throwingStorage();
    assertDeepEqual(loadLesson('a', s), emptyLesson());
    saveLesson('a', sample(), s);
    resetLesson('a', s);
    assertEqual(lessonStatus('a', ['q1'], 5, s), 'new');
  });

  test('resetLesson clears only that lesson', () => {
    const s = memoryStorage();
    saveLesson('a', sample(), s);
    saveLesson('b', { ...sample(), step: 1 }, s);
    resetLesson('a', s);
    assertDeepEqual(loadLesson('a', s), emptyLesson());
    assertEqual(loadLesson('b', s).step, 1);
  });

  test('status: new without an entry', () => {
    assertEqual(lessonStatus('a', ['q1'], 5, memoryStorage()), 'new');
  });

  test('status: started once a step beyond the first was reached', () => {
    const s = memoryStorage();
    saveLesson('a', { ...emptyLesson(), step: 2 }, s);
    assertEqual(lessonStatus('a', ['q1'], 5, s), 'started');
  });

  test('status: complete when last step reached and all quizzes ever correct', () => {
    const s = memoryStorage();
    saveLesson('a', {
      ...emptyLesson(),
      step: 5,
      reachedLast: true,
      quizzes: {
        q1: { answer: 0, correct: false, everCorrect: true },
        q2: { answer: 1, correct: true, everCorrect: true },
      },
    }, s);
    assertEqual(lessonStatus('a', ['q1', 'q2'], 5, s), 'complete');
  });

  test('status: started when a quiz was never answered correctly', () => {
    const s = memoryStorage();
    saveLesson('a', {
      ...emptyLesson(),
      step: 5,
      reachedLast: true,
      quizzes: {
        q1: { answer: 0, correct: true, everCorrect: true },
        q2: { answer: 1, correct: false, everCorrect: false },
      },
    }, s);
    assertEqual(lessonStatus('a', ['q1', 'q2'], 5, s), 'started');
  });

  test('status: reaching the last step by index counts as reachedLast', () => {
    const s = memoryStorage();
    saveLesson('a', { ...emptyLesson(), step: 5, reachedLast: true }, s);
    assertEqual(lessonStatus('a', [], 5, s), 'complete');
  });

  test('malformed entry is repaired', () => {
    const s = memoryStorage({
      [STORAGE_KEY]: JSON.stringify({ schema: 1, lessons: { a: { step: 2, insights: 'x' } } }),
    });
    const l = loadLesson('a', s);
    assertEqual(l.step, 2);
    assertDeepEqual(l.insights, []);
    assertDeepEqual(l.results, {});
    assertDeepEqual(l.quizzes, {});
    assertEqual(l.reachedLast, false);
    assertTrue(Array.isArray(l.insights));
  });
});
