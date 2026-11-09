/**
 * Tests for core/field-path.js — Grammatik der Pfade von x-field/x-set und
 * die Schlüsselfelder, auf die ein idOf zeigt.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import { parseFieldPath, keyFieldsOf, resolveTarget } from '../../js/core/field-path.js';
import { defineModel, command, idOf, list, map, number, object, text } from '../../js/core/model.js';

suite('parseFieldPath', () => {
  test('Wurzel, Namen, Klammern, Feld', () => {
    assertDeepEqual(parseFieldPath('model.alpha'), { root: 'model', steps: [], field: 'alpha' });
    assertDeepEqual(parseFieldPath('item.text'), { root: 'item', steps: [], field: 'text' });
    assertDeepEqual(parseFieldPath('model.items[i].text'),
      { root: 'model', steps: [{ kind: 'name', name: 'items' }, { kind: 'index', ref: 'i' }], field: 'text' });
    assertDeepEqual(parseFieldPath('model.risks[2].actions[j].owner'), {
      root: 'model',
      steps: [{ kind: 'name', name: 'risks' }, { kind: 'index', at: 2 }, { kind: 'name', name: 'actions' }, { kind: 'index', ref: 'j' }],
      field: 'owner',
    });
  });
  test('Pfad darf auf [..] enden (Map-Eintrag)', () => {
    assertDeepEqual(parseFieldPath('model.scores[r]'),
      { root: 'model', steps: [{ kind: 'name', name: 'scores' }], field: { kind: 'index', ref: 'r' } });
    assertDeepEqual(parseFieldPath('model.scores[r][c]'),
      { root: 'model', steps: [{ kind: 'name', name: 'scores' }, { kind: 'index', ref: 'r' }], field: { kind: 'index', ref: 'c' } });
    assertDeepEqual(parseFieldPath('model.scores[3]').field, { kind: 'index', at: 3 });
  });
  test('ungültige Pfade werfen', () => {
    assertThrows(() => parseFieldPath('model'), /invalid field path "model"; expected <root>\.<field>/);
    assertThrows(() => parseFieldPath('model.items[i + 1].text'), /invalid field path/);
    assertThrows(() => parseFieldPath('.text'), /invalid field path/);
  });
});

suite('keyFieldsOf', () => {
  test('idOf in Feldern und Kommando-Parametern, verschachtelt', () => {
    const M = defineModel({
      fields: { risks: list(object({ id: text(), actions: list(object({ uid: text(), text: text() })) })) },
      commands: {
        setRisk: command({ params: { id: idOf('risks') }, run() {} }),
        setAction: command({ params: { risk: idOf('risks'), action: idOf('risks[risk].actions', { key: 'uid' }) }, run() {} }),
      },
    });
    const keys = keyFieldsOf(M.schema);
    assertDeepEqual([...keys.get('risks')], ['id']);
    assertDeepEqual([...keys.get('risks[].actions')], ['uid']);
  });
});

const Alpine = { raw: (x) => x, $data: (el) => el.data };
const Maps = defineModel({
  fields: {
    scores: map(text(), map(text(), number({ min: 0, max: 9 }))),
    flat: map(text(), number({ min: 0, max: 9 })),
    byNum: map(number({ integer: true, min: 0 }), text()),
    items: list(object({ id: text(), name: text() })),
    concepts: list(object({ id: text(), picks: map(idOf('items'), text()) })),
  },
});
const mk = (data = {}) => {
  const model = new Maps();
  model.items = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  model.concepts = [{ id: 'k1', picks: {} }];
  return { model, el: { data: { model, ...data } } };
};
const target = (el, expr) => resolveTarget(Alpine, el, expr);

suite('resolveTarget: Map-Einträge', () => {
  test('oberste Ebene: lesen, schreiben, neuer Schlüssel legt an', () => {
    const { model, el } = mk({ r: 'a' });
    const t = target(el, 'model.flat[r]');
    assertEqual(t.get(), undefined);
    t.set(4);
    assertDeepEqual({ ...model.flat }, { a: 4 });
    assertEqual(t.get(), 4);
    el.data.r = 'z';
    t.set(5);
    assertDeepEqual({ ...model.flat }, { a: 4, z: 5 });
  });
  test('Map in Map: model.scores[r][c]', () => {
    const { model, el } = mk({ r: 'x', c: 'y' });
    const t = target(el, 'model.scores[r][c]');
    t.set(7);
    assertEqual(model.scores.x.y, 7);
    assertEqual(t.get(), 7);
  });
  test('Map in Listeneintrag: model.concepts[i].picks[p]', () => {
    const { model, el } = mk({ i: 0, p: 'b' });
    const t = target(el, 'model.concepts[i].picks[p]');
    t.set('hoch');
    assertDeepEqual({ ...model.concepts[0].picks }, { b: 'hoch' });
    assertEqual(t.get(), 'hoch');
  });
  test('Zahlschlüssel: [i] mit i = 3 trifft Eintrag "3"', () => {
    const { model, el } = mk({ i: 3 });
    const t = target(el, 'model.byNum[i]');
    t.set('drei');
    assertDeepEqual(Object.keys(model.byNum), ['3']);
    assertEqual(t.get(), 'drei');
    t.set('noch drei');
    assertDeepEqual(Object.keys(model.byNum), ['3']);
    assertEqual(target(el, 'model.byNum[3]').get(), 'noch drei');
  });
  test('Ablehnung: ungültiger Schlüssel und Wert, Model unverändert', () => {
    const { model, el } = mk({ p: 'nope', q: 'a' });
    assertThrows(() => target(el, 'model.concepts[0].picks[p]').set('x'), /key/);
    assertThrows(() => target(el, 'model.flat[q]').set(99), /flat/);
    assertDeepEqual({ ...model.flat }, {});
    assertDeepEqual({ ...model.concepts[0].picks }, {});
    el.data.i = 1.5;
    assertThrows(() => target(el, 'model.byNum[i]').set('x'), /key/);
    assertDeepEqual({ ...model.byNum }, {});
  });
  test('Schlüssel __proto__ wird abgelehnt, Model unverändert', () => {
    const { model, el } = mk({ k: '__proto__' });
    assertThrows(() => target(el, 'model.flat[k]').set(1), /key/);
    assertEqual(Object.getPrototypeOf(model.flat), Object.getPrototypeOf({}));
    assertDeepEqual(Object.keys(model.flat), []);
  });
  test('Hilfe-Anker ist der des Map-Feldes', () => {
    const { el } = mk({ p: 'a' });
    assertEqual(target(el, 'model.concepts[0].picks[p]').helpKey, 'fields.concepts.picks.help');
    assertEqual(target(el, 'model.flat[p]').helpKey, 'fields.flat.help');
    assertEqual(target(el, 'model.flat[p]').kind, 'model');
  });
  test('Eintragswurzel mit Schritten bleibt verboten', () => {
    const { model, el } = mk({ p: 'a' });
    el.data.c = model.concepts[0];
    assertThrows(() => target(el, 'c.picks[p]'), /only c\.<field> is supported for an entry/);
  });
  test('Pfad endet auf [..] ohne Map davor', () => {
    const { el } = mk({ i: 0 });
    assertThrows(() => target(el, 'model.items[i]'), /does not match the schema/);
    assertThrows(() => target(el, 'model.items[i].name[i]'), /does not match the schema/);
  });
});

const Nested = defineModel({
  fields: {
    m: map(text(), object({ label: text(), sub: map(text(), number()) })),
    mm: map(text(), map(text(), number())),
  },
});

suite('resolveTarget: Map-Zwischenschritte', () => {
  test('fehlender Eintrag mit object-Wert wird nicht angelegt, klarer Fehler, Model unverändert', () => {
    const model = new Nested();
    const el = { data: { model, k: 'x', p: 'q' } };
    const t = target(el, 'model.m[k].sub[p]');
    assertThrows(() => t.set(1), /entry \[x\] is missing/);
    assertDeepEqual({ ...model.m }, {});
    assertEqual(t.get(), undefined);
  });
  test('fehlender Zwischeneintrag einer Map von Maps wird weiter angelegt', () => {
    const model = new Nested();
    const el = { data: { model, k: 'x', p: 'q' } };
    target(el, 'model.mm[k][p]').set(2);
    assertDeepEqual(JSON.parse(JSON.stringify(model.mm)), { x: { q: 2 } });
  });
  test('Map-Eintrag gefolgt von einem Namen wird abgelehnt', () => {
    assertThrows(() => resolveTarget(Alpine, { data: { model: new Nested(), k: 'a' } }, 'model.m[k].label'),
      /a map entry can only be the last step/);
  });
});

const Capped = defineModel({
  fields: {
    rows: list(object({ id: text(), n: number() })),
    flat: map(text(), number()),
  },
  invariants: {
    rowsCap: { fields: ['rows'], test(m) { return m.rows.every((r) => r.n <= 10); } },
    flatCap: { fields: ['flat'], test(m) { return Object.values(m.flat).every((v) => v <= 10); } },
  },
});

suite('resolveTarget: Invarianten', () => {
  test('x-field in Listeneintrag verletzt Invariante → alter Wert, Fehler mit invariant', () => {
    const model = new Capped();
    model.rows = [{ id: 'a', n: 1 }];
    const el = { data: { model, row: model.rows[0] } };
    const t = target(el, 'row.n');
    t.set(5);
    assertEqual(model.rows[0].n, 5);
    let err = null;
    try { target(el, 'row.n').set(11); } catch (e) { err = e; }
    assertEqual(err.invariant, 'rowsCap');
    assertEqual(model.rows[0].n, 5);
    let err2 = null;
    el.data.i = 0;
    try { target(el, 'model.rows[i].n').set(12); } catch (e) { err2 = e; }
    assertEqual(err2.invariant, 'rowsCap');
    assertEqual(model.rows[0].n, 5);
  });
  test('x-field auf Map-Eintrag verletzt Invariante → Eintrag wie vorher (auch: neuer Schlüssel wieder entfernt)', () => {
    const model = new Capped();
    const el = { data: { model, k: 'a' } };
    target(el, 'model.flat[k]').set(3);
    let err = null;
    try { target(el, 'model.flat[k]').set(50); } catch (e) { err = e; }
    assertEqual(err.invariant, 'flatCap');
    assertDeepEqual({ ...model.flat }, { a: 3 });
    el.data.k = 'neu';
    assertThrows(() => target(el, 'model.flat[k]').set(50), /flatCap|flat/);
    assertDeepEqual({ ...model.flat }, { a: 3 });
  });
});
