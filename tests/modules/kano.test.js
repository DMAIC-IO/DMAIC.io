/**
 * D.Mike — Kano Model Tests (kano.test.js)
 * Persistierter Zustand: CRUD, Antwortpflege, Serialisierung.
 * Spec: docs/superpowers/specs/2026-07-25-kano-modul-design.md
 */

import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { State } from '../../js/modules/kano/kano-model.js';

function filled() {
  const s = new State();
  s.setItems([{ id: 'i1', nodeId: 'n1', label: 'A', path: 'p', missing: false }]);
  const r = s.addRespondent('Kunde A');
  s.setAnswer(r, 'i1', 'f', 1);
  s.setAnswer(r, 'i1', 'd', 5);
  s.setAnswer(r, 'i1', 'w', 7);
  return s;
}

suite('kano-model — Defaults', () => {
  test('frischer State ist leer und auf Ebene need', () => {
    const s = new State();
    assertEqual(s.source.level, 'need');
    assertEqual(s.source.instanceId, null);
    assertEqual(s.options.importance, true);
    assertEqual(s.hasContent(), false);
  });
});

suite('kano-model — Befragte', () => {
  test('addRespondent setzt den ersten als aktiv', () => {
    const s = new State();
    const id = s.addRespondent('Kunde A');
    assertEqual(s.activeRespondentId, id);
    assertEqual(s.hasContent(), true);
  });

  test('deleteRespondent entfernt auch dessen Antworten', () => {
    const s = filled();
    const id = s.respondents[0].id;
    s.deleteRespondent(id);
    assertEqual(s.respondents.length, 0);
    assertEqual(s.answers[id], undefined);
    assertEqual(s.activeRespondentId, null);
  });

  test('deleteRespondent wählt einen verbleibenden aktiv', () => {
    const s = new State();
    const a = s.addRespondent('A');
    s.addRespondent('B');
    s.deleteRespondent(s.activeRespondentId === a ? a : s.respondents[1].id);
    assertEqual(s.respondents.some(r => r.id === s.activeRespondentId), true);
  });
});

suite('kano-model — Items und Antworten', () => {
  test('deleteItem entfernt die Antworten aller Befragten', () => {
    const s = filled();
    const r = s.respondents[0].id;
    s.deleteItem('i1');
    assertEqual(s.items.length, 0);
    assertEqual(s.answers[r].i1, undefined);
  });

  test('setAnswer legt fehlende Ebenen an', () => {
    const s = new State();
    s.setAnswer('r1', 'i1', 'f', 3);
    assertEqual(s.answerOf('r1', 'i1').f, 3);
  });

  test('setAnswer akzeptiert null zum Zurücksetzen', () => {
    const s = filled();
    const r = s.respondents[0].id;
    s.setAnswer(r, 'i1', 'f', null);
    assertEqual(s.answerOf(r, 'i1').f, null);
  });

  test('answerOf liefert immer ein Objekt, nie undefined', () => {
    assertDeepEqual(new State().answerOf('x', 'y'), { f: null, d: null, w: null });
  });
});

suite('kano-model — Serialisierung', () => {
  test('toJSON/fromJSON Rundlauf', () => {
    const s = filled();
    const back = State.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    assertDeepEqual(back.toJSON(), s.toJSON());
  });

  test('fromJSON mit null/leer liefert Defaults', () => {
    assertEqual(State.fromJSON(null).source.level, 'need');
    assertEqual(State.fromJSON({}).items.length, 0);
  });

  test('fromJSON verwirft unbekannte Ebene', () => {
    assertEqual(State.fromJSON({ source: { level: 'quatsch' } }).source.level, 'need');
  });

  test('fromJSON verwirft Antworten zu unbekannten IDs', () => {
    const s = State.fromJSON({
      items: [{ id: 'i1', nodeId: null, label: 'A', path: '', missing: false }],
      respondents: [{ id: 'r1', name: 'A' }],
      answers: { r1: { i1: { f: 1, d: 5, w: null }, geist: { f: 2, d: 2, w: 2 } }, phantom: {} },
    });
    assertDeepEqual(Object.keys(s.answers), ['r1']);
    assertDeepEqual(Object.keys(s.answers.r1), ['i1']);
  });

  test('fromJSON hält activeRespondentId gültig', () => {
    const s = State.fromJSON({ respondents: [{ id: 'r1', name: 'A' }], activeRespondentId: 'weg' });
    assertEqual(s.activeRespondentId, 'r1');
  });
});
