/**
 * Tests for modules/triz-function-analysis/domain/model.js — Schema-Literale,
 * Reparatur beim Laden je Invariante, Kommandos (Ergebnis und Ablehnung),
 * Rückfrage beim Löschen und die Ableitungen gegen die Lesefläche der Altform.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State, impactOf } from '../../../js/modules/triz-function-analysis/domain/model.js';
import { KINDS, TYPES, LEVELS, TABS } from '../../../js/modules/triz-function-analysis/domain/analysis.js';
import { confirmOf, setFields } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';

const FIXTURES = new URL('../../fixtures/triz-function-analysis/', import.meta.url);
const EXAMPLE = new URL('../../../js/modules/triz-function-analysis/resources/examples/projects/triz-function-analysis-toothbrush.json', import.meta.url);
/** Leser ohne fremde Instanzen (die Ableitungen lesen nur das Model). */
const NO_SOURCE = { read: () => null, list: () => [] };
const SCHEMA = { _schema: { name: 'triz-function-analysis', version: '1.0' } };

/** @param {() => any} fn @returns {any} der geworfene Fehler oder null */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

const comp = (id, kind = 'system', over = {}) => ({ id, name: id.toUpperCase(), kind, note: '', cost: null, ...over });
const fn = (id, carrier, object, over = {}) => ({
  id, carrier, verb: '', object, parameter: '', type: 'useful', level: 'adequate', note: '', ...over,
});

/** Gespeicherter Stand 1.0, Felder überschreibbar. @param {object} [over] @returns {object} */
const saved = (over = {}) => ({
  ...SCHEMA,
  components: [],
  interactions: [],
  exclusions: [],
  functions: [],
  positions: {},
  labels: {},
  showRanks: false,
  activeTab: 'components',
  ...over,
});

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} json @returns {{ m: State, fields: string[] }} */
function repaired(json) {
  const fields = [];
  const m = State.fromJSON(json, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

/** Zahnbürste: Ziel t, System b und h, Supersystem g und p. @returns {State} */
function fixture() {
  return State.fromJSON(saved({
    components: [comp('t', 'target'), comp('b'), comp('h'), comp('g', 'supersystem'), comp('p', 'supersystem')],
    interactions: [{ a: 'b', b: 't' }, { a: 'b', b: 'g' }, { a: 'b', b: 'h' }],
    functions: [
      fn('f1', 'b', 't', { level: 'insufficient' }),
      fn('f2', 'b', 'g', { type: 'harmful', level: null }),
      fn('f3', 'h', 'b'),
    ],
    positions: { b: { x: 10, y: 20 } },
    labels: { f1: { x: 30, y: 40 } },
  }));
}

suite('triz-function-analysis Model — Schema', () => {
  test('Werte der Aufzählungen gleich KINDS/TYPES/LEVELS/TABS', () => {
    const { fields, view } = State.schema;
    assertDeepEqual([...fields.components.item.shape.kind.values], KINDS);
    assertDeepEqual([...fields.functions.item.shape.type.values], TYPES);
    assertDeepEqual([...fields.functions.item.shape.level.values], LEVELS);
    assertDeepEqual([...view.activeTab.values], TABS);
  });
  test('ein neues Model ist leer, ohne Inhalt, Reiter components', () => {
    const m = new State();
    assertDeepEqual([m.components, m.interactions, m.exclusions, m.functions], [[], [], [], []]);
    assertDeepEqual([m.positions, m.labels], [{}, {}]);
    assertEqual(m.showRanks, false);
    assertEqual(m.activeTab, 'components');
    assertEqual(m.hasContent(), false);
  });
  test('Rundreise erhält den gespeicherten Stand', () => {
    const j = JSON.parse(JSON.stringify(fixture().toJSON()));
    const again = State.fromJSON(j).toJSON();
    assertDeepEqual({ ...again, _schema: j._schema }, j);
    assertEqual(fixture().hasContent(), true);
  });
  test('Zeigen der Ränge allein ist kein Inhalt', () => {
    assertEqual(State.fromJSON(saved({ showRanks: true })).hasContent(), false);
  });
});

suite('triz-function-analysis Model — Reparatur beim Laden', () => {
  test('uniqueComponentIds: leere und doppelte ids entfallen, die erste bleibt', () => {
    const { m, fields } = repaired(saved({
      components: [comp('x', 'target'), comp(''), comp('x', 'system', { name: 'Zweites X' }), comp('y')],
      positions: { x: { x: 1, y: 2 } },
    }));
    assertDeepEqual(m.components.map((c) => [c.id, c.name]), [['x', 'X'], ['y', 'Y']]);
    assertDeepEqual(m.positions, { x: { x: 1, y: 2 } });
    assert(fields.includes('components'), 'gemeldet');
  });
  test('singleTarget: jedes weitere Ziel wird system', () => {
    const { m } = repaired(saved({ components: [comp('x', 'target'), comp('y', 'target'), comp('z', 'target')] }));
    assertDeepEqual(m.components.map((c) => c.kind), ['target', 'system', 'system']);
  });
  test('validPairs: Selbstpaar und unbekannte id entfallen, b<a wird sortiert, Doppelte entfallen', () => {
    const { m } = repaired(saved({
      components: [comp('x', 'target'), comp('y'), comp('z')],
      interactions: [{ a: 'y', b: 'x' }, { a: 'x', b: 'y' }, { a: 'x', b: 'x' }, { a: 'x', b: 'gone' }],
    }));
    assertDeepEqual(m.interactions, [{ a: 'x', b: 'y' }]);
  });
  test('validPairs: angekreuzt und ausgeschlossen → der Ausschluss entfällt', () => {
    const { m } = repaired(saved({
      components: [comp('x', 'target'), comp('y'), comp('z')],
      interactions: [{ a: 'x', b: 'y' }],
      exclusions: [{ a: 'z', b: 'x' }, { a: 'x', b: 'z' }, { a: 'y', b: 'x' }, { a: 'z', b: 'z' }, { a: 'z', b: 'gone' }],
    }));
    assertDeepEqual(m.exclusions, [{ a: 'x', b: 'z' }]);
    assertDeepEqual(m.interactions, [{ a: 'x', b: 'y' }]);
  });
  test('uniqueFunctionIds: leere und doppelte ids entfallen, Beschriftungslagen darauf auch', () => {
    const { m } = repaired(saved({
      components: [comp('x', 'target'), comp('y')],
      functions: [fn('f1', 'y', 'x'), fn('', 'y', 'x'), fn('f1', 'x', 'y'), fn('f2', 'x', 'y')],
      labels: { f1: { x: 5, y: 5 } },
    }));
    assertDeepEqual(m.functions.map((f) => [f.id, f.carrier]), [['f1', 'y'], ['f2', 'x']]);
    assertDeepEqual(m.labels, { f1: { x: 5, y: 5 } });
  });
  test('functionEnds: unbekanntes Ende wird leer, carrier === object → object leer', () => {
    const { m } = repaired(saved({
      components: [comp('x', 'target'), comp('y')],
      functions: [fn('f1', 'x', 'gone'), fn('f2', 'gone', 'y'), fn('f3', 'y', 'y')],
    }));
    assertDeepEqual(m.functions.map((f) => [f.id, f.carrier, f.object]), [['f1', 'x', ''], ['f2', '', 'y'], ['f3', 'y', '']]);
  });
  test('levelByType: harmful mit Stufe → null, useful ohne Stufe → adequate', () => {
    const { m } = repaired(saved({
      components: [comp('x', 'target'), comp('y')],
      functions: [fn('f1', 'x', 'y', { type: 'harmful', level: 'excessive' }), fn('f2', 'y', 'x', { level: null })],
    }));
    assertDeepEqual(m.functions.map((f) => [f.type, f.level]), [['harmful', null], ['useful', 'adequate']]);
  });
  test('Lagen auf unbekannte ids entfallen über den Schlüssel', () => {
    const { m } = repaired(saved({
      components: [comp('x', 'target')],
      functions: [fn('f1', 'x', '')],
      positions: { x: { x: 5, y: 6 }, gone: { x: 1, y: 1 } },
      labels: { f1: { x: 7, y: 8 }, gone: { x: 1, y: 1 } },
    }));
    assertDeepEqual(m.positions, { x: { x: 5, y: 6 } });
    assertDeepEqual(m.labels, { f1: { x: 7, y: 8 } });
  });
  test('ungültiger Reiter fällt still auf components', () => {
    assertEqual(State.fromJSON(saved({ activeTab: 'nope' })).activeTab, 'components');
  });
  test('strenges Laden lehnt ein zweites Ziel ab', () => {
    const e = thrown(() => State.fromJSON(saved({ components: [comp('x', 'target'), comp('y', 'target')] })));
    assert(e, 'Ablehnung');
    assertEqual(e.invariant, 'singleTarget');
  });
});

suite('triz-function-analysis Model — Komponenten', () => {
  test('addComponent liefert die id einer neuen Komponente ohne Kosten', () => {
    const m = new State();
    const id = m.addComponent({ kind: 'supersystem', name: 'Luft' });
    assertDeepEqual(m.components, [{ id, name: 'Luft', kind: 'supersystem', note: '', cost: null }]);
    const second = m.addComponent({ kind: 'system' });
    assertEqual(m.components.find((c) => c.id === second).name, '');
  });
  test('addComponent: ein zweites Ziel wird abgelehnt (param kind)', () => {
    const m = fixture();
    const before = m.components.length;
    const e = thrown(() => m.addComponent({ kind: 'target', name: 'Noch ein Ziel' }));
    assert(e, 'Ablehnung');
    assertEqual(e.param, 'kind');
    assertEqual(m.components.length, before);
  });
  test('setComponentKind: neues Ziel stuft das alte herab und liefert dessen id', () => {
    const m = fixture();
    assertEqual(m.setComponentKind({ id: 'h', kind: 'target' }), 't');
    assertDeepEqual(m.components.filter((c) => c.kind === 'target').map((c) => c.id), ['h']);
    assertEqual(m.components.find((c) => c.id === 't').kind, 'system');
    assertEqual(m.setComponentKind({ id: 'h', kind: 'target' }), null, 'schon das Ziel');
    assertEqual(m.setComponentKind({ id: 'g', kind: 'system' }), null);
    assertEqual(m.components.find((c) => c.id === 'g').kind, 'system');
  });
  test('setComponentKind: unbekannte Art wird abgelehnt', () => {
    const e = thrown(() => fixture().setComponentKind({ id: 'h', kind: 'bogus' }));
    assertEqual(e?.param, 'kind');
  });
  test('removeComponent löscht Paare, Ausschlüsse, Funktionen und Lagen', () => {
    const m = fixture();
    m.setPairState({ a: 't', b: 'p', state: 'excluded' });
    m.removeComponent({ id: 'b' });
    assertEqual(m.components.some((c) => c.id === 'b'), false);
    assertDeepEqual(m.interactions, []);
    assertDeepEqual(m.functions, []);
    assertDeepEqual(m.positions, {});
    assertDeepEqual(m.labels, {});
    m.removeComponent({ id: 'p' });
    assertDeepEqual(m.exclusions, []);
  });
  test('removeComponent fragt zurück, mit Zahl der Funktionen', () => {
    const m = fixture();
    assertDeepEqual(confirmOf(m, 'removeComponent', { id: 'b' }), { key: 'confirm.deleteUsed', params: { name: 'B', count: 3 } });
    assertDeepEqual(confirmOf(m, 'removeComponent', { id: 'p' }), { key: 'confirm.delete', params: { name: 'P', count: 0 } });
  });
  test('removeComponent fragt bei leerem Namen mit eigenem Text', () => {
    const m = fixture();
    const id = m.addComponent({ kind: 'system', name: '  ' });
    assertDeepEqual(confirmOf(m, 'removeComponent', { id }), { key: 'confirm.deleteUnnamed', params: { count: 0 } });
    m.addFunction({ carrier: id, object: 't' });
    assertDeepEqual(confirmOf(m, 'removeComponent', { id }), { key: 'confirm.deleteUsedUnnamed', params: { count: 1 } });
  });
  test('impactOf zählt Paare und Funktionen einer Komponente', () => {
    const m = fixture();
    assertDeepEqual(impactOf(m, 'b'), { interactions: 3, functions: 3 });
    assertDeepEqual(impactOf(m, 'p'), { interactions: 0, functions: 0 });
  });
  test('discardComponentIfEmpty entfernt nur leere, ungenutzte Komponenten', () => {
    const m = fixture();
    const id = m.addComponent({ kind: 'system', name: '  ' });
    assertEqual(m.discardComponentIfEmpty({ id }), true);
    assertEqual(m.components.some((c) => c.id === id), false);
    assertEqual(m.discardComponentIfEmpty({ id: 't' }), false, 'mit Namen bleibt sie');
  });
  test('discardComponentIfEmpty behält Komponenten mit Funktion oder angekreuztem Paar', () => {
    const m = fixture();
    setFields(m, { components: m.components.map((c) => (c.id === 'b' ? { ...c, name: '' } : c)) });
    assertEqual(m.discardComponentIfEmpty({ id: 'b' }), false);
    assertEqual(m.functions.length, 3);
    const lonely = m.addComponent({ kind: 'system' });
    m.setPairState({ a: lonely, b: 't', state: 'ticked' });
    assertEqual(m.discardComponentIfEmpty({ id: lonely }), false, 'angekreuztes Paar zählt als Nutzung');
  });
});

suite('triz-function-analysis Model — Paare', () => {
  test('setPairState setzt none, ticked und excluded, sortiert', () => {
    const m = fixture();
    m.setPairState({ a: 't', b: 'g', state: 'ticked' });
    assert(m.interactions.some((i) => i.a === 'g' && i.b === 't'), 'angekreuzt, sortiert');
    m.setPairState({ a: 'g', b: 't', state: 'excluded' });
    assertEqual(m.interactions.some((i) => i.a === 'g' && i.b === 't'), false);
    assertDeepEqual(m.exclusions, [{ a: 'g', b: 't' }]);
    m.setPairState({ a: 't', b: 'g', state: 'none' });
    assertDeepEqual(m.exclusions, []);
    m.setPairState({ a: 't', b: 'g', state: 'excluded' });
    m.setPairState({ a: 't', b: 'g', state: 'ticked' });
    assertDeepEqual(m.exclusions, []);
  });
  test('setPairState auf einem genutzten Paar wird abgelehnt (param state)', () => {
    const m = fixture();
    const e = thrown(() => m.setPairState({ a: 't', b: 'b', state: 'excluded' }));
    assertEqual(e?.param, 'state');
    assert(m.interactions.some((i) => i.a === 'b' && i.b === 't'), 'bleibt angekreuzt');
    assertDeepEqual(m.exclusions, []);
    m.setPairState({ a: 't', b: 'b', state: 'ticked' });
  });
  test('setPairState: Selbstpaar und unbekannte id werden abgelehnt', () => {
    const m = fixture();
    assertEqual(thrown(() => m.setPairState({ a: 'b', b: 'b', state: 'ticked' }))?.param, 'b');
    assertEqual(thrown(() => m.setPairState({ a: 'b', b: 'gone', state: 'ticked' }))?.param, 'b');
  });
});

suite('triz-function-analysis Model — Funktionen', () => {
  test('addFunction kreuzt das Paar an und hebt einen Ausschluss auf', () => {
    const m = fixture();
    m.setPairState({ a: 't', b: 'p', state: 'excluded' });
    const id = m.addFunction({ carrier: 'p', object: 't' });
    assertDeepEqual(m.functions.find((f) => f.id === id), fn(id, 'p', 't'));
    assert(m.interactions.some((i) => i.a === 'p' && i.b === 't'), 'angekreuzt');
    assertDeepEqual(m.exclusions, []);
  });
  test('addFunction: gleiche Enden werden abgelehnt', () => {
    assertEqual(thrown(() => fixture().addFunction({ carrier: 'b', object: 'b' }))?.param, 'object');
  });
  test('swapDirection tauscht Träger und Objekt', () => {
    const m = fixture();
    m.swapDirection({ id: 'f3' });
    const f = m.functions.find((x) => x.id === 'f3');
    assertDeepEqual([f.carrier, f.object], ['b', 'h']);
  });
  test('setFunctionType setzt die Stufe mit, gleiche Art behält sie', () => {
    const m = fixture();
    const f = () => m.functions.find((x) => x.id === 'f1');
    m.setFunctionType({ id: 'f1', type: 'useful' });
    assertEqual(f().level, 'insufficient');
    m.setFunctionType({ id: 'f1', type: 'harmful' });
    assertEqual(f().level, null);
    m.setFunctionType({ id: 'f1', type: 'useful' });
    assertEqual(f().level, 'adequate');
  });
  test('setFunctionLevel setzt die Stufe nützlicher Funktionen', () => {
    const m = fixture();
    m.setFunctionLevel({ id: 'f3', level: 'excessive' });
    assertEqual(m.functions.find((x) => x.id === 'f3').level, 'excessive');
  });
  test('setFunctionLevel bei harmful wird abgelehnt (param level)', () => {
    const m = fixture();
    const e = thrown(() => m.setFunctionLevel({ id: 'f2', level: 'excessive' }));
    assertEqual(e?.param, 'level');
    assertEqual(m.functions.find((x) => x.id === 'f2').level, null);
  });
  test('removeFunction löscht die Beschriftungslage und gibt das Paar frei', () => {
    const m = fixture();
    m.removeFunction({ id: 'f1' });
    assertEqual(m.functions.some((x) => x.id === 'f1'), false);
    assertEqual(m.labels.f1, undefined);
    m.setPairState({ a: 'b', b: 't', state: 'excluded' });
  });
});

suite('triz-function-analysis Model — Lage', () => {
  test('moveComponent rundet, lehnt x < 0 ab', () => {
    const m = fixture();
    m.moveComponent({ id: 't', x: 12.6, y: 0.4 });
    assertDeepEqual(m.positions.t, { x: 13, y: 0 });
    assertEqual(thrown(() => m.moveComponent({ id: 't', x: -1, y: 0 }))?.param, 'x');
    assertEqual(thrown(() => m.moveComponent({ id: 'gone', x: 1, y: 1 }))?.param, 'id');
  });
  test('moveLabel rundet, lehnt x < 0 ab', () => {
    const m = fixture();
    m.moveLabel({ id: 'f2', x: 50.4, y: 3.5 });
    assertDeepEqual(m.labels.f2, { x: 50, y: 4 });
    assertEqual(thrown(() => m.moveLabel({ id: 'f2', x: -3, y: 0 }))?.param, 'x');
    assertEqual(thrown(() => m.moveLabel({ id: 'gone', x: 1, y: 1 }))?.param, 'id');
  });
  test('resetLayout leert Lagen der Kästen und Beschriftungen', () => {
    const m = fixture();
    m.resetLayout();
    assertDeepEqual([m.positions, m.labels], [{}, {}]);
  });
});

suite('triz-function-analysis Model — Ableitungen', () => {
  test('Felder und derived gleich der Lesefläche der Altform (Zahnbürste)', async () => {
    const res = await fetch(new URL('toothbrush-read.json', FIXTURES), { cache: 'no-cache' });
    const expected = await res.json();
    const { openPairs, ranks, disadvantages, valueCost, ...stored } = expected;
    const fields = [];
    const m = State.fromJSON({ ...SCHEMA, ...stored }, { onRepair: (f) => fields.push(f) });
    assertDeepEqual(fields, []);
    const { _schema, activeTab, ...read } = m.toJSON();
    assertDeepEqual({ ...read, ...evaluateDerived(m, NO_SOURCE) }, expected);
    assertDeepEqual(Object.keys(evaluateDerived(m, NO_SOURCE)),
      ['openPairs', 'ranks', 'disadvantages', 'valueCost']);
  });
  test('das ausgelieferte Zahnbürsten-Beispiel lädt ohne Reparatur, derived gleich der Altform', async () => {
    const raw = await (await fetch(EXAMPLE, { cache: 'no-cache' })).json();
    const expected = await (await fetch(new URL('toothbrush-read.json', FIXTURES), { cache: 'no-cache' })).json();
    const strict = thrown(() => State.fromJSON(raw));
    assertEqual(strict, null, `strenges Laden: ${strict?.message}`);
    const fields = [];
    const m = State.fromJSON(raw, { repair: true, onRepair: (f) => fields.push(f) });
    assertDeepEqual(fields, []);
    assertEqual(m.components.length, raw.components.length);
    assertEqual(m.functions.length, raw.functions.length);
    assertEqual(m.components.length, 7);
    const { openPairs, ranks, disadvantages, valueCost, ...stored } = expected;
    const { _schema, activeTab, ...read } = m.toJSON();
    assertDeepEqual(read, stored);
    assertDeepEqual(evaluateDerived(m, NO_SOURCE), { openPairs, ranks, disadvantages, valueCost });
  });
  test('openPairs und ranks an einem kleinen Stand', () => {
    const m = fixture();
    m.setPairState({ a: 't', b: 'p', state: 'ticked' });
    const d = evaluateDerived(m, NO_SOURCE);
    assertDeepEqual(d.openPairs, [{ a: 'p', b: 't' }]);
    assertDeepEqual(d.ranks, [
      { functionId: 'f1', rank: 'basic', level: null },
      { functionId: 'f3', rank: 'auxiliary', level: 1 },
    ]);
  });
});
