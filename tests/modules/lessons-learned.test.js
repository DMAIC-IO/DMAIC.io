import { suite, test, assertEqual } from '../test-utils.js';
import { Lesson, Action, State } from '../../js/modules/lessons-learned/lessons-learned-model.js';

suite('Lessons Learned Model — Action', () => {
  test('constructor sets default values', () => {
    const a = new Action();
    assertEqual(a.text, '');
    assertEqual(a.done, false);
  });

  test('toJSON returns expected shape', () => {
    const a = new Action();
    a.text = 'Test action';
    a.done = true;
    const json = a.toJSON();
    assertEqual(json.text, 'Test action');
    assertEqual(json.done, true);
  });

  test('fromJSON(null) returns default', () => {
    const a = Action.fromJSON(null);
    assertEqual(a.text, '');
    assertEqual(a.done, false);
  });

  test('fromJSON(undefined) returns default', () => {
    const a = Action.fromJSON(undefined);
    assertEqual(a.text, '');
    assertEqual(a.done, false);
  });

  test('fromJSON with data restores correctly', () => {
    const a = Action.fromJSON({ text: 'Do something', done: true });
    assertEqual(a.text, 'Do something');
    assertEqual(a.done, true);
  });

  test('fromJSON sanitizes invalid text', () => {
    const a = Action.fromJSON({ text: 123, done: 'yes' });
    assertEqual(a.text, '');
    assertEqual(a.done, false);
  });

  test('toJSON -> fromJSON round-trip', () => {
    const a = new Action();
    a.text = 'Round trip test';
    a.done = true;
    const json = a.toJSON();
    const b = Action.fromJSON(json);
    assertEqual(b.text, 'Round trip test');
    assertEqual(b.done, true);
  });
});

suite('Lessons Learned Model — Lesson', () => {
  test('constructor sets default values', () => {
    const l = new Lesson();
    assertEqual(l.title, '');
    assertEqual(l.category, 'success');
    assertEqual(l.phase, 'control');
    assertEqual(l.impact, 'medium');
    assertEqual(l.owner, '');
    assertEqual(l.description, '');
    assertEqual(l.rootCause, '');
    assertEqual(l.recommendation, '');
    assertEqual(l.actions.length, 0);
    assertEqual(l.createdAt, 0);
  });

  test('toJSON returns expected shape', () => {
    const l = new Lesson();
    l.id = Lesson.uid();
    l.title = 'Test lesson';
    l.category = 'problem';
    l.actions.push(Action.fromJSON({ text: 'Action 1', done: false }));
    const json = l.toJSON();
    assertEqual(json.title, 'Test lesson');
    assertEqual(json.category, 'problem');
    assertEqual(json.actions.length, 1);
    assertEqual(json.actions[0].text, 'Action 1');
  });

  test('fromJSON(null) returns default', () => {
    const l = Lesson.fromJSON(null);
    assertEqual(l.title, '');
    assertEqual(l.category, 'success');
  });

  test('fromJSON(undefined) returns default', () => {
    const l = Lesson.fromJSON(undefined);
    assertEqual(l.title, '');
    assertEqual(l.category, 'success');
  });

  test('fromJSON with full data restores correctly', () => {
    const l = Lesson.fromJSON({
      id: 'test-id',
      title: 'Full lesson',
      category: 'problem',
      phase: 'measure',
      impact: 'high',
      owner: 'Mathias',
      description: 'Description text',
      rootCause: 'Root cause text',
      recommendation: 'Recommendation text',
      actions: [{ text: 'Action 1', done: true }],
      createdAt: 1000,
      updatedAt: 2000,
    });
    assertEqual(l.id, 'test-id');
    assertEqual(l.title, 'Full lesson');
    assertEqual(l.category, 'problem');
    assertEqual(l.phase, 'measure');
    assertEqual(l.impact, 'high');
    assertEqual(l.owner, 'Mathias');
    assertEqual(l.description, 'Description text');
    assertEqual(l.rootCause, 'Root cause text');
    assertEqual(l.recommendation, 'Recommendation text');
    assertEqual(l.actions.length, 1);
    assertEqual(l.actions[0].text, 'Action 1');
    assertEqual(l.actions[0].done, true);
    assertEqual(l.createdAt, 1000);
    assertEqual(l.updatedAt, 2000);
  });

  test('fromJSON with minimal data uses defaults', () => {
    const l = Lesson.fromJSON({ title: 'Minimal' });
    assertEqual(l.title, 'Minimal');
    assertEqual(l.category, 'success');
    assertEqual(l.impact, 'medium');
    assertEqual(l.phase, 'control');
  });

  test('fromJSON sanitizes invalid category', () => {
    const l = Lesson.fromJSON({ category: 'invalid' });
    assertEqual(l.category, 'success');
  });

  test('fromJSON sanitizes invalid impact', () => {
    const l = Lesson.fromJSON({ impact: 'extreme' });
    assertEqual(l.impact, 'medium');
  });

  test('uid generates unique ids', () => {
    const id1 = Lesson.uid();
    const id2 = Lesson.uid();
    assertEqual(typeof id1, 'string');
    assertEqual(id1.length > 0, true);
    assertEqual(id1 !== id2, true);
  });

  test('toJSON -> fromJSON round-trip', () => {
    const l = new Lesson();
    l.id = Lesson.uid();
    l.title = 'Round trip';
    l.category = 'improve';
    l.phase = 'control';
    l.impact = 'low';
    l.owner = 'Test';
    l.description = 'Description';
    l.rootCause = 'Cause';
    l.recommendation = 'Rec';
    l.actions.push(Action.fromJSON({ text: 'A1', done: false }));
    l.createdAt = 5000;

    const json = l.toJSON();
    const restored = Lesson.fromJSON(json);
    assertEqual(restored.title, 'Round trip');
    assertEqual(restored.category, 'improve');
    assertEqual(restored.phase, 'control');
    assertEqual(restored.impact, 'low');
    assertEqual(restored.owner, 'Test');
    assertEqual(restored.description, 'Description');
    assertEqual(restored.rootCause, 'Cause');
    assertEqual(restored.recommendation, 'Rec');
    assertEqual(restored.actions.length, 1);
    assertEqual(restored.actions[0].text, 'A1');
    assertEqual(restored.actions[0].done, false);
    assertEqual(restored.createdAt, 5000);
  });
});

suite('Lessons Learned Model — State', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.lessons.length, 0);
  });

  test('computeStats returns zeros for empty state', () => {
    const s = new State();
    const stats = s.computeStats();
    assertEqual(stats.total, 0);
    assertEqual(stats.success, 0);
    assertEqual(stats.problem, 0);
    assertEqual(stats.improve, 0);
    assertEqual(stats.openActions, 0);
  });

  test('computeStats counts categories correctly', () => {
    const s = new State();
    s.lessons.push(Lesson.fromJSON({ category: 'success' }));
    s.lessons.push(Lesson.fromJSON({ category: 'success' }));
    s.lessons.push(Lesson.fromJSON({ category: 'problem' }));
    s.lessons.push(Lesson.fromJSON({ category: 'improve' }));
    const stats = s.computeStats();
    assertEqual(stats.total, 4);
    assertEqual(stats.success, 2);
    assertEqual(stats.problem, 1);
    assertEqual(stats.improve, 1);
  });

  test('computeStats counts open actions', () => {
    const s = new State();
    s.lessons.push(Lesson.fromJSON({
      actions: [{ text: 'A1', done: true }, { text: 'A2', done: false }],
    }));
    s.lessons.push(Lesson.fromJSON({
      actions: [{ text: 'A3', done: false }],
    }));
    const stats = s.computeStats();
    assertEqual(stats.openActions, 2);
  });

  test('hasContent returns false for empty state', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
  });

  test('hasContent returns true when lessons exist', () => {
    const s = new State();
    s.lessons.push(Lesson.fromJSON({ title: 'Test' }));
    assertEqual(s.hasContent(), true);
  });

  test('toJSON returns serialized state', () => {
    const s = new State();
    s.lessons.push(Lesson.fromJSON({ title: 'Test', category: 'problem' }));
    const json = s.toJSON();
    assertEqual(json.lessons.length, 1);
    assertEqual(json.lessons[0].title, 'Test');
    assertEqual(json.lessons[0].category, 'problem');
  });

  test('fromJSON(null) returns default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.lessons.length, 0);
  });

  test('fromJSON(undefined) returns default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.lessons.length, 0);
  });

  test('fromJSON with data restores correctly', () => {
    const s = State.fromJSON({
      lessons: [
        { title: 'Lesson 1', category: 'success' },
        { title: 'Lesson 2', category: 'problem', actions: [{ text: 'A1', done: false }] },
      ],
    });
    assertEqual(s.lessons.length, 2);
    assertEqual(s.lessons[0].title, 'Lesson 1');
    assertEqual(s.lessons[0].category, 'success');
    assertEqual(s.lessons[1].title, 'Lesson 2');
    assertEqual(s.lessons[1].category, 'problem');
    assertEqual(s.lessons[1].actions.length, 1);
  });

  test('fromJSON filters non-array lessons', () => {
    const s = State.fromJSON({ lessons: 'invalid' });
    assertEqual(s.lessons.length, 0);
  });

  test('toJSON -> fromJSON round-trip is lossless', () => {
    const s = new State();
    s.lessons.push(Lesson.fromJSON({
      title: 'Test',
      category: 'improve',
      phase: 'analyze',
      impact: 'high',
      actions: [{ text: 'A1', done: true }],
    }));
    const json = s.toJSON();
    const restored = State.fromJSON(json);
    assertEqual(restored.lessons.length, 1);
    assertEqual(restored.lessons[0].title, 'Test');
    assertEqual(restored.lessons[0].category, 'improve');
    assertEqual(restored.lessons[0].phase, 'analyze');
    assertEqual(restored.lessons[0].impact, 'high');
    assertEqual(restored.lessons[0].actions.length, 1);
    assertEqual(restored.lessons[0].actions[0].text, 'A1');
    assertEqual(restored.lessons[0].actions[0].done, true);
  });
});
