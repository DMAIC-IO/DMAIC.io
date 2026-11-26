/**
 * Tests for modules/lessons-learned/domain/lessons.js — Wertemengen gleich
 * den Schema-Literalen, Kennzahlen, hohe Wirkung mit offenen Maßnahmen,
 * Filter/Suche/Sortierung der Liste, Normalform eines Imports und die
 * Vorgabephase je Zyklus.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import {
  CATEGORIES, IMPACTS, statsOf, openHighImpact, shownLessons, toLesson, lastPhase,
} from '../../../js/modules/lessons-learned/domain/lessons.js';
import { State } from '../../../js/modules/lessons-learned/domain/model.js';

/** @param {object} l */
const lesson = (l) => ({
  id: '', title: '', category: 'success', phase: 'control', impact: 'medium', owner: '', description: '',
  rootCause: '', recommendation: '', actions: [], createdAt: 0, updatedAt: 0, ...l,
});

suite('lessons-learned lessons — Wertemengen', () => {
  test('Kategorien und Wirkungen gleich den Literalen im Schema (Feld und Kommandos)', () => {
    const shape = State.schema.fields.lessons.item.shape;
    assertDeepEqual([...shape.category.values], [...CATEGORIES]);
    assertDeepEqual([...shape.impact.values], [...IMPACTS]);
    for (const cmd of ['addLesson', 'updateLesson']) {
      assertDeepEqual([...State.schema.commands[cmd].params.category.values], [...CATEGORIES], cmd);
      assertDeepEqual([...State.schema.commands[cmd].params.impact.values], [...IMPACTS], cmd);
    }
  });
  test('Vorgabephase: letzte Phase des Zyklus', () => {
    assertEqual(lastPhase('dmaic'), 'control');
    assertEqual(lastPhase('dmadv'), 'verify');
    assertEqual(lastPhase('eightd'), 'recognize');
  });
});

suite('lessons-learned lessons — statsOf und openHighImpact', () => {
  test('leer: alles 0', () => {
    assertDeepEqual(statsOf([]), { total: 0, success: 0, problem: 0, improve: 0, openActions: 0 });
  });
  test('zählt je Kategorie und offene Maßnahmen über alle Erfahrungen', () => {
    const list = [
      lesson({ category: 'success', actions: [{ text: 'a', done: false }, { text: 'b', done: true }] }),
      lesson({ category: 'problem', actions: [{ text: 'c', done: false }] }),
      lesson({ category: 'problem' }),
      lesson({ category: 'improve', actions: [{ text: 'd', done: false }] }),
    ];
    assertDeepEqual(statsOf(list), { total: 4, success: 1, problem: 2, improve: 1, openActions: 3 });
  });
  test('hohe Wirkung mit mindestens einer offenen Maßnahme, gespeicherte Reihenfolge, begrenzt', () => {
    const list = [
      lesson({ id: 'a', impact: 'high', actions: [{ text: 'x', done: false }] }),
      lesson({ id: 'b', impact: 'high', actions: [{ text: 'x', done: true }] }),
      lesson({ id: 'c', impact: 'medium', actions: [{ text: 'x', done: false }] }),
      lesson({ id: 'd', impact: 'high' }),
      lesson({ id: 'e', impact: 'high', actions: [{ text: 'x', done: true }, { text: 'y', done: false }] }),
      lesson({ id: 'f', impact: 'high', actions: [{ text: 'x', done: false }] }),
    ];
    assertDeepEqual(openHighImpact(list, 5).map((l) => l.id), ['a', 'e', 'f']);
    assertDeepEqual(openHighImpact(list, 2).map((l) => l.id), ['a', 'e']);
  });
});

suite('lessons-learned lessons — shownLessons', () => {
  const LIST = [
    lesson({ id: 'a', title: 'Workshop', category: 'success', owner: 'Anna', createdAt: 1 }),
    lesson({ id: 'b', title: 'Engpass', category: 'problem', owner: 'Bernd', createdAt: 3 }),
    lesson({ id: 'c', title: 'Automatisierung', category: 'improve', description: 'Prozess verbessert', owner: 'Anna', createdAt: 2 }),
    lesson({ id: 'd', title: 'RC', rootCause: 'Kommunikationsproblem', recommendation: 'Mehr Meetings', createdAt: 0 }),
    lesson({ id: 'e', title: 'Ohne Zeit', createdAt: 0 }),
  ];
  const ids = (l) => l.map((x) => x.id);
  test('alle: die neueste zuerst, gleich alte in gespeicherter Reihenfolge', () => {
    assertDeepEqual(ids(shownLessons(LIST, 'all', '')), ['b', 'c', 'a', 'd', 'e']);
  });
  test('Filter je Kategorie', () => {
    assertDeepEqual(ids(shownLessons(LIST, 'success', '')), ['a', 'd', 'e']);
    assertDeepEqual(ids(shownLessons(LIST, 'problem', '')), ['b']);
    assertDeepEqual(ids(shownLessons(LIST, 'improve', '')), ['c']);
  });
  test('Suche über Titel, Beschreibung, Verantwortlich, Empfehlung und Ursache, ohne Groß/klein, getrimmt', () => {
    assertDeepEqual(ids(shownLessons(LIST, 'all', 'workshop')), ['a']);
    assertDeepEqual(ids(shownLessons(LIST, 'all', 'PROZESS')), ['c']);
    assertDeepEqual(ids(shownLessons(LIST, 'all', ' anna ')), ['c', 'a']);
    assertDeepEqual(ids(shownLessons(LIST, 'all', 'Kommunikations')), ['d']);
    assertDeepEqual(ids(shownLessons(LIST, 'all', 'Meetings')), ['d']);
    assertDeepEqual(ids(shownLessons(LIST, 'all', 'nichts')), []);
  });
  test('Filter und Suche zusammen; die Eingabeliste bleibt unverändert', () => {
    const before = ids(LIST);
    assertDeepEqual(ids(shownLessons(LIST, 'success', 'Anna')), ['a']);
    assertDeepEqual(ids(shownLessons(LIST, 'problem', 'Anna')), []);
    assertDeepEqual(ids(LIST), before);
  });
});

suite('lessons-learned lessons — toLesson', () => {
  test('Nicht-Objekte: null', () => {
    for (const v of [null, undefined, 5, 'x', [], true]) assertEqual(toLesson(v), null, JSON.stringify(v));
  });
  test('Normalform ohne id; Fremdwerte auf die Vorgaben, Phase bleibt als Text', () => {
    const out = toLesson({
      id: 'x', title: 'T', category: 'Methodik', impact: 'riesig', phase: 'verify', owner: 3,
      actions: [null, 'a', { text: 'b', done: 'ja', owner: 'X', dueDate: '+7d' }, { text: 'c', done: true }],
      createdAt: '-3d', updatedAt: NaN, extra: 1,
    });
    assertDeepEqual(out, {
      title: 'T', category: 'success', phase: 'verify', impact: 'medium', owner: '', description: '',
      rootCause: '', recommendation: '',
      actions: [{ text: '', done: false }, { text: '', done: false }, { text: 'b', done: false }, { text: 'c', done: true }],
      createdAt: 0, updatedAt: 0,
    });
  });
  test('ohne Phase: letzte Phase des Standardzyklus; Zahl-Phase ebenso', () => {
    assertEqual(toLesson({}).phase, 'control');
    assertEqual(toLesson({ phase: 3 }).phase, 'control');
  });
});
