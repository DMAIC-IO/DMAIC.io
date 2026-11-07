/**
 * Tests for core/model.js — Felder, Ansichtsfelder, toJSON/fromJSON, Typtexte.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { getPhaseIds } from '../../js/core/cycles/cycles.js';
import {
  defineModel, command, text, number, boolean, oneOf, index, idOf, list, record, object,
  defaultOf, checkValue, describeType, schemaOf, fieldSpec, defineState, stateSchemaOf,
  currentOf, confirmOf, commandDefOf, fromAttr, defineForm,
  defineSettings, isSettings, readSettings,
  columnRef, rewriteColumnRefs, readModel, date, time, phase, activeContext, setCommandObserver, setModelContext, contextOf, checkContext, DEFAULT_CONTEXT,
} from '../../js/core/model.js';

const COLS = ['suppliers', 'inputs'];

const Board = defineModel({
  fields: {
    title: text(),
    alpha: number({ exclusiveMin: 0, exclusiveMax: 1, nullable: true, default: null }),
    columns: record(COLS, list(text())),
    events: list(object({ id: text(), note: text({ optional: true }) }), { bulk: true }),
    selected: index('events', { existing: true, nullable: true, default: null }),
    focusId: idOf('events', { nullable: true, default: null }),
  },
  view: { mode: oneOf(['month', 'week']), expanded: boolean() },
});

suite('defineModel — Vorgabewerte und Accessoren', () => {
  test('neue Instanz trägt die Vorgabewerte', () => {
    const m = new Board();
    assertEqual(m.title, '');
    assertEqual(m.alpha, null);
    assertDeepEqual(m.columns, { suppliers: [], inputs: [] });
    assertEqual(m.mode, 'month');
    assertEqual(m.expanded, false);
  });

  test('Vorgabewerte sind je Instanz frisch', () => {
    const a = new Board(); const b = new Board();
    a.columns.suppliers.push('x');
    assertDeepEqual(b.columns.suppliers, []);
  });

  test('Werte liegen in _v; Object.keys sieht nur _v', () => {
    assertDeepEqual(Object.keys(new Board()), ['_v']);
  });

  test('Setter prüft und normalisiert', () => {
    const m = new Board();
    m.alpha = '0.1';
    assertEqual(m.alpha, 0.1);
    assertThrows(() => { m.alpha = 1; }, /^invalid alpha 1; allowed: a number greater than 0 and less than 1$/);
    assertEqual(m.alpha, 0.1, 'abgelehnter Wert lässt das Feld unverändert');
    assertThrows(() => { m.title = 7; }, /^invalid title 7; allowed: any string, "" clears it$/);
  });

  test('Ansichtsfeld prüft ebenso', () => {
    const m = new Board();
    assertThrows(() => { m.mode = 'year'; }, /^invalid mode "year"; allowed: month, week$/);
  });

  test('verschachtelte Namen in der Meldung', () => {
    const m = new Board();
    assertThrows(() => { m.columns = { suppliers: ['a', 3], inputs: [] }; },
      /^invalid columns\.suppliers\[1\] 3; allowed: any string/);
    assertThrows(() => { m.columns = { suppliers: [] }; },
      /^missing key "inputs" of columns; expected: suppliers, inputs$/);
    assertThrows(() => { m.columns = { suppliers: [], inputs: [], extra: [] }; },
      /^unknown columns key "extra"; available: suppliers, inputs$/);
  });

  test('index und idOf lesen ihre Grenze über den Pfad', () => {
    const m = new Board();
    assertThrows(() => { m.selected = 0; }, /^invalid selected 0; allowed: none, the collection is empty$/);
    m.events = [{ id: 'e1' }, { id: 'e2', note: 'n' }];
    m.selected = 1;
    assertEqual(m.selected, 1);
    m.focusId = 'e2';
    assertThrows(() => { m.focusId = 'e9'; }, /^unknown focusId "e9"; available: e1, e2$/);
  });

  test('object: optionaler Schlüssel darf fehlen, Pflichtschlüssel nicht', () => {
    const m = new Board();
    assertThrows(() => { m.events = [{ note: 'x' }]; },
      /^missing key "id" of events\[0\]; expected: id, \[note\]$/);
  });
});

suite('defineModel — toJSON / fromJSON', () => {
  test('Rundlauf erhält Inhalt und Ansicht', () => {
    const m = new Board();
    m.title = 'T'; m.mode = 'week'; m.columns = { suppliers: ['a'], inputs: [] };
    const json = m.toJSON();
    assertDeepEqual(Object.keys(json),
      ['_schema', 'title', 'alpha', 'columns', 'events', 'selected', 'focusId', 'mode', 'expanded']);
    assertDeepEqual(Board.fromJSON(json).toJSON(), json);
  });

  test('toJSON ist eine Kopie', () => {
    const m = new Board();
    m.toJSON().columns.suppliers.push('x');
    assertDeepEqual(m.columns.suppliers, []);
  });

  test('fehlende Schlüssel → Vorgabewert, unbekannte Schlüssel → ignoriert', () => {
    const m = Board.fromJSON({ title: 'T', legacyKey: 1 });
    assertEqual(m.title, 'T');
    assertDeepEqual(m.columns, { suppliers: [], inputs: [] });
  });

  test('ungültiges Inhaltsfeld wirft (streng)', () => {
    assertThrows(() => Board.fromJSON({ title: 5 }), /^invalid title 5/);
  });

  test('repair: ungültiges Inhaltsfeld → Vorgabewert, Rest bleibt', () => {
    const m = Board.fromJSON({ title: 5, columns: { suppliers: ['a'], inputs: [] } }, { repair: true });
    assertEqual(m.title, '');
    assertDeepEqual(m.columns.suppliers, ['a']);
  });

  test('ungültiges Ansichtsfeld → still Vorgabewert (D11)', () => {
    const m = Board.fromJSON({ mode: 'year', title: 'T' });
    assertEqual(m.mode, 'month');
    assertEqual(m.title, 'T');
  });

  test('kein Objekt → Vorgabewerte', () => {
    assertEqual(Board.fromJSON(null).title, '');
  });
});

suite('defineModel — fromJSON unabhängig von der Feldreihenfolge', () => {
  const Early = defineModel({
    fields: {
      sel: index('items', { existing: true, nullable: true, default: null }),
      items: list(object({ id: text() })),
      focus: idOf('items', { nullable: true, default: null }),
    },
    view: { cursor: index('items', { existing: true, nullable: true, default: null }) },
  });
  const make = () => {
    const m = new Early();
    m.items = [{ id: 'a' }, { id: 'b' }];
    m.sel = 1; m.focus = 'b'; m.cursor = 0;
    return m.toJSON();
  };

  test('streng: abhängiges Feld vor seinem Ziel überlebt den Rundlauf', () => {
    const json = make();
    assertDeepEqual(Early.fromJSON(json).toJSON(), json);
  });

  test('repair: abhängige Felder bleiben erhalten', () => {
    const json = make();
    assertDeepEqual(Early.fromJSON(json, { repair: true }).toJSON(), json);
  });

  test('echt ungültiger Verweis wirft streng, fällt bei repair/Ansicht zurück', () => {
    const json = { ...make(), sel: 7, cursor: 9 };
    assertThrows(() => Early.fromJSON(json), /^invalid sel 7/);
    const m = Early.fromJSON(json, { repair: true });
    assertEqual(m.sel, null);
    assertEqual(m.cursor, null);
  });
});

suite('defineModel — hasContent, Schema, Typtexte', () => {
  test('hasContent: nur Inhaltsfelder zählen', () => {
    const m = new Board();
    assertEqual(m.hasContent(), false);
    m.mode = 'week';
    assertEqual(m.hasContent(), false, 'Ansichtsfeld ist kein Inhalt');
    m.title = 'x';
    assertEqual(m.hasContent(), true);
  });

  test('Schema bleibt lesbar und eingefroren', () => {
    const s = schemaOf(Board);
    assertDeepEqual(Object.keys(s.fields), ['title', 'alpha', 'columns', 'events', 'selected', 'focusId']);
    assertDeepEqual(Object.keys(s.view), ['mode', 'expanded']);
    assertTrue(Object.isFrozen(s.fields.title));
    assertEqual(schemaOf(new Board()), s);
    assertEqual(fieldSpec(new Board(), 'mode'), s.view.mode);
    assertEqual(schemaOf({}), null);
  });

  test('Unterklasse erbt Schema und Accessoren', () => {
    class State extends Board { shout() { return this.title.toUpperCase(); } }
    const m = State.fromJSON({ title: 'ab' });
    assertEqual(m.shout(), 'AB');
    assertTrue(m instanceof State);
  });

  test('Feld und Ansichtsfeld mit gleichem Namen ist ein Fehler', () => {
    assertThrows(() => defineModel({ fields: { a: text() }, view: { a: text() } }), /^defineModel: a is both a field and a view field$/);
  });

  test('describeType', () => {
    assertEqual(describeType(text()), 'string');
    assertEqual(describeType(number({ nullable: true })), 'number|null');
    assertEqual(describeType(oneOf(['a', 'b'])), "'a'|'b'");
    assertEqual(describeType(list(oneOf(['a', 'b']))), "Array<'a'|'b'>");
    assertEqual(describeType(record(COLS, list(text()))), "Record<'suppliers'|'inputs', string[]>");
    assertEqual(describeType(object({ id: text(), n: number({ optional: true }) })), '{ id: string, n?: number }');
    assertEqual(describeType(index('events')), 'number');
    assertEqual(describeType(idOf('events')), 'string');
  });

  test('defaultOf und checkValue sind auch einzeln nutzbar', () => {
    assertDeepEqual(defaultOf(record(COLS, number())), { suppliers: 0, inputs: 0 });
    assertEqual(checkValue(oneOf([1, 2]), 'n', '2'), 2);
  });
});

suite('defineModel — text-Optionen trim und nonEmpty', () => {
  const Note = defineModel({
    fields: { title: text() },
    commands: {
      rename: command({
        params: { title: text({ trim: true, nonEmpty: true }) },
        run({ title }) { this.title = title; return title; },
      }),
    },
  });

  test('trim: run sieht den getrimmten Text', () => {
    const m = new Note();
    assertEqual(m.rename({ title: '  Teig  ' }), 'Teig');
    assertEqual(m.title, 'Teig');
  });

  test('nonEmpty: leerer Text nach trim wird abgelehnt, nichts geschrieben', () => {
    const m = new Note();
    assertThrows(() => m.rename({ title: '   ' }), /^invalid title " {3}"; allowed: a non-empty text$/);
    assertThrows(() => m.rename({ title: '' }), /^invalid title ""; allowed: a non-empty text$/);
    assertEqual(m.title, '');
  });

  test('kein Text bleibt der bekannte Fehler', () => {
    assertThrows(() => new Note().rename({ title: 7 }), /^invalid title 7; allowed: any string, "" clears it$/);
  });

  test('ohne Optionen unverändert: Leerzeichen bleiben, "" erlaubt', () => {
    assertEqual(checkValue(text(), 'x', '  a '), '  a ');
    assertEqual(checkValue(text(), 'x', ''), '');
  });

  test('describeType bleibt string', () => {
    assertEqual(describeType(text({ trim: true, nonEmpty: true })), 'string');
  });
});

const Ui = defineState({
  tab: oneOf(['a', 'b']),
  drafts: record(COLS, text()),
  editDraft: object({ text: text() }),
  preview: object({ group: oneOf(COLS), index: number({ integer: true, min: 0 }) }, { nullable: true }),
});

suite('defineState — UI-State', () => {
  test('create() liefert die Vorgabewerte, je Aufruf frisch', () => {
    const a = Ui.create();
    const b = Ui.create();
    assertDeepEqual(a, { tab: 'a', drafts: { suppliers: '', inputs: '' }, editDraft: { text: '' }, preview: null });
    a.drafts.suppliers = 'x';
    assertEqual(b.drafts.suppliers, '');
  });

  test('_schema ist nicht aufzählbar, nichts wird gespeichert', () => {
    const s = Ui.create();
    assertDeepEqual(Object.keys(s), ['tab', 'drafts', 'editDraft', 'preview']);
    assertEqual(s._schema, Ui.schema);
    assertEqual(JSON.stringify(s).includes('_schema'), false);
    assertEqual(s.toJSON, undefined);
  });

  test('Schreiben ist ungeprüft', () => {
    const s = Ui.create();
    s.tab = 'z';
    assertEqual(s.tab, 'z');
  });

  test('Rückgabe und Schema sind eingefroren', () => {
    assertTrue(Object.isFrozen(Ui));
    assertTrue(Object.isFrozen(Ui.schema));
    assertTrue(Object.isFrozen(Ui.schema.fields));
  });

  test('index, idOf (auch verschachtelt) und _schema werden abgelehnt', () => {
    assertThrows(() => defineState({ sel: index('events') }), /^defineState: sel uses index\/idOf/);
    assertThrows(() => defineState({ ids: list(idOf('events')) }), /^defineState: ids uses index\/idOf/);
    assertThrows(() => defineState({ _schema: text() }), /^defineState: _schema is a reserved name$/);
  });

  test('stateSchemaOf und fieldSpec erkennen den State', () => {
    const s = Ui.create();
    assertEqual(stateSchemaOf(s), Ui.schema);
    assertEqual(fieldSpec(s, 'tab'), Ui.schema.fields.tab);
    assertEqual(fieldSpec(s, 'nope'), undefined);
    assertEqual(stateSchemaOf(new Board()), null);
    assertEqual(stateSchemaOf({ _schema: { fields: {} } }), null, 'nur Schemata aus defineState');
    assertEqual(stateSchemaOf(null), null);
    assertEqual(fieldSpec(new Board(), 'title'), Board.schema.fields.title, 'Model wie bisher');
  });
});

const ParamBoard = defineModel({
  fields: { columns: record(['a', 'b'], list(text())) },
  commands: {
    setItem: command({
      params: { col: oneOf(['a', 'b']), idx: index('columns[col]', { existing: true }), text: text({ trim: true, nonEmpty: true }) },
      run({ col, idx, text: t }) { this.columns[col][idx] = t; },
    }),
  },
});

suite('model err.param', () => {
  const paramOf = (fn) => { try { fn(); } catch (e) { return e.param; } return 'no throw'; };

  test('checkValue: oberster Name auch bei verschachteltem Wert', () => {
    assertEqual(paramOf(() => checkValue(record(['a'], list(text())), 'columns', { a: [7] })), 'columns');
  });

  test('Kommando: der Parameter, an dem die Prüfung scheitert', () => {
    const m = ParamBoard.fromJSON({ columns: { a: ['x'], b: [] } });
    assertEqual(paramOf(() => m.setItem({ col: 'a', idx: 0, text: '  ' })), 'text');
    assertEqual(paramOf(() => m.setItem({ col: 'a', idx: 5, text: 'y' })), 'idx');
    assertEqual(paramOf(() => m.setItem({ col: 'c', idx: 0, text: 'y' })), 'col');
    assertEqual(paramOf(() => m.setItem({ col: 'a', text: 'y' })), 'idx');
    assertEqual(paramOf(() => m.setItem({ col: 'a', idx: 0, text: 'y', extra: 1 })), 'extra');
  });
});

let confirmCalls = 0;
const Hooked = defineModel({
  fields: { items: list(text()) },
  commands: {
    setItem: command({
      params: { idx: index('items', { existing: true }), text: text() },
      current({ idx }) { return { text: this.items[idx] }; },
      run({ idx, text: t }) { this.items[idx] = t; },
    }),
    removeItem: command({
      params: { idx: index('items', { existing: true }) },
      confirm({ idx }) {
        confirmCalls += 1;
        return this.items[idx] === 'wichtig' ? { key: 'confirm.removeImportant', params: { idx } } : null;
      },
      run({ idx }) { this.items.splice(idx, 1); },
    }),
    leak: command({ params: { idx: number() }, current() { return { idx: 1, extra: 2 }; }, run() {} }),
  },
});

suite('command: current und confirm', () => {
  test('current/confirm müssen Funktionen sein', () => {
    assertThrows(() => command({ run() {}, current: 1 }), /^command: current must be a function$/);
    assertThrows(() => command({ run() {}, confirm: 'x' }), /^command: confirm must be a function$/);
  });

  test('die Definition behält die Haken nur, wenn angegeben', () => {
    const { setItem, removeItem } = Hooked.schema.commands;
    assertEqual(typeof setItem.current, 'function');
    assertEqual(setItem.confirm, undefined);
    assertEqual(typeof removeItem.confirm, 'function');
    assertTrue(!('current' in removeItem));
  });

  test('commandDefOf: liefert die Definition, unbekannt wirft', () => {
    assertEqual(commandDefOf(Hooked, 'setItem'), Hooked.schema.commands.setItem);
    assertThrows(() => commandDefOf(Hooked, 'nope'), /^unknown command "nope"; available: setItem, removeItem, leak$/);
  });

  test('currentOf: Werte zum aktuellen Stand, ohne current {}', () => {
    const m = Hooked.fromJSON({ items: ['a', 'wichtig'] });
    assertDeepEqual(currentOf(m, 'setItem', { idx: 1 }), { text: 'wichtig' });
    assertDeepEqual(currentOf(m, 'removeItem', { idx: 0 }), {});
  });

  test('currentOf: fremder Rückgabeschlüssel und unbekanntes Kommando werfen', () => {
    const m = new Hooked();
    assertThrows(() => currentOf(m, 'leak', {}), /^unknown leak current key "extra"; available: idx$/);
    assertThrows(() => currentOf(m, 'nope', {}), /^unknown command "nope"; available: setItem, removeItem, leak$/);
  });

  test('confirmOf: prüft erst, fragt dann', () => {
    const m = Hooked.fromJSON({ items: ['a', 'wichtig'] });
    confirmCalls = 0;
    assertDeepEqual(confirmOf(m, 'removeItem', { idx: 1 }), { key: 'confirm.removeImportant', params: { idx: 1 } });
    assertEqual(confirmOf(m, 'removeItem', { idx: 0 }), null);
    assertEqual(confirmCalls, 2);
    assertThrows(() => confirmOf(m, 'removeItem', { idx: 9 }), /^invalid idx 9; allowed: 0\.\.1$/);
    assertEqual(confirmCalls, 2, 'ungültige Argumente: confirm wird nicht gerufen');
    assertEqual(confirmOf(m, 'setItem', { idx: 0, text: 'x' }), null);
  });

  test('direkter Aufruf fragt nie', () => {
    const m = Hooked.fromJSON({ items: ['wichtig'] });
    confirmCalls = 0;
    m.removeItem({ idx: 0 });
    assertEqual(confirmCalls, 0);
    assertDeepEqual([...m.items], []);
  });
});

suite('fromAttr', () => {
  test('Wandlung je Feldart', () => {
    assertEqual(fromAttr(index('x'), '3'), 3);
    assertEqual(fromAttr(index('x'), 'drei'), 'drei');
    assertEqual(fromAttr(number(), '2.5'), 2.5);
    assertEqual(fromAttr(number(), '2,5'), '2,5');
    assertEqual(fromAttr(boolean(), 'true'), true);
    assertEqual(fromAttr(boolean(), 'false'), false);
    assertEqual(fromAttr(boolean(), 'ja'), 'ja');
    assertEqual(fromAttr(oneOf([1, 2]), '2'), '2');
    assertEqual(fromAttr(text(), ' a '), ' a ');
    assertEqual(fromAttr(idOf('items'), 'x-1'), 'x-1');
    assertEqual(fromAttr(text({ nullable: true }), ''), null);
  });

  test('object, list, record kommen nicht aus einem Attribut', () => {
    assertThrows(() => fromAttr(list(text()), '[]'), /^fromAttr: list cannot come from an attribute$/);
    assertThrows(() => fromAttr(record(['a'], text()), '{}'), /^fromAttr: record cannot come from an attribute$/);
    assertThrows(() => fromAttr(object({ a: text() }), '{}'), /^fromAttr: object cannot come from an attribute$/);
  });
});

suite('defineForm', () => {
  test('eingefroren, ohne Abbildungen 1:1', () => {
    const F = defineForm({ fields: { a: text(), b: number() } });
    assertTrue(Object.isFrozen(F) && Object.isFrozen(F.schema) && Object.isFrozen(F.schema.fields));
    assertDeepEqual(Object.keys(F.schema.fields), ['a', 'b']);
    assertDeepEqual(F.fromParams({ a: 'x', b: 1 }), { a: 'x', b: 1 });
    assertDeepEqual(F.toParams({ a: 'x', b: 1 }, { col: 'c' }), { a: 'x', b: 1 });
  });

  test('eigene Abbildungen', () => {
    const G = defineForm({
      fields: { a: text() },
      fromParams: (p) => ({ a: p.x }),
      toParams: (v, fixed) => ({ x: v.a, col: fixed.col }),
    });
    assertDeepEqual(G.fromParams({ x: 'q' }), { a: 'q' });
    assertDeepEqual(G.toParams({ a: 'q' }, { col: 'c' }), { x: 'q', col: 'c' });
  });

  test('index/idOf und Nicht-Funktionen werden abgelehnt', () => {
    assertThrows(() => defineForm({ fields: { i: index('items') } }), /^defineForm: i uses index\/idOf/);
    assertThrows(() => defineForm({ fields: { r: object({ id: idOf('items') }) } }), /^defineForm: r uses index\/idOf/);
    assertThrows(() => defineForm({ fields: {}, toParams: 1 }), /^defineForm: toParams must be a function$/);
    assertThrows(() => defineForm({ fields: {}, fromParams: 'x' }), /^defineForm: fromParams must be a function$/);
  });
});

suite('defineSettings / readSettings', () => {
  test('erlaubte Arten, eingefroren, erkennbar', () => {
    const S = defineSettings({
      topN: number({ integer: true, min: 1, max: 10, default: 3 }),
      view: oneOf(['bar', 'list']),
      showLegend: boolean({ default: true }),
    });
    assertDeepEqual(Object.keys(S.schema.fields), ['topN', 'view', 'showLegend']);
    assertTrue(Object.isFrozen(S) && Object.isFrozen(S.schema) && Object.isFrozen(S.schema.fields));
    assertTrue(isSettings(S));
    assertTrue(!isSettings({ schema: { fields: {} } }));
  });

  test('Ablehnungen', () => {
    assertThrows(() => defineSettings({ title: text() }), /^defineSettings: title is text; allowed: number, oneOf, boolean$/);
    assertThrows(() => defineSettings({ items: list(text()) }), /^defineSettings: items is list; allowed: number, oneOf, boolean$/);
    assertThrows(() => defineSettings({ _source: oneOf(['a']) }), /^defineSettings: _source — names starting with "_" belong to the host$/);
    assertThrows(() => defineSettings({ n: number({ default: 1 }) }), /^defineSettings: n needs finite min <= max$/);
    assertThrows(() => defineSettings({ n: number({ min: 5, max: 1, default: 3 }) }), /^defineSettings: n needs finite min <= max$/);
    assertThrows(() => defineSettings({ n: number({ min: 1, max: 10 }) }), /^defineSettings: n default — /);
    assertThrows(() => defineSettings({ n: number({ min: 1, max: 10, default: 11 }) }), /^defineSettings: n default — /);
    assertThrows(() => defineSettings({ v: oneOf([1, 2]) }), /^defineSettings: v values must be strings$/);
    assertThrows(() => defineSettings({ b: boolean({ nullable: true }) }), /^defineSettings: b may not be nullable or optional$/);
  });

  test('readSettings: gültige Werte, sonst still die Vorgabe', () => {
    const S = defineSettings({ topN: number({ integer: true, min: 1, max: 10, default: 3 }), view: oneOf(['bar', 'list']) });
    assertDeepEqual(readSettings(S, { topN: 4, view: 'list' }), { topN: 4, view: 'list' });
    assertDeepEqual(readSettings(S, { topN: 11, view: 'pie', extra: 1 }), { topN: 3, view: 'bar' });
    assertDeepEqual(readSettings(S, { topN: 2.5 }), { topN: 3, view: 'bar' });
    assertDeepEqual(readSettings(S, undefined), { topN: 3, view: 'bar' });
    assertDeepEqual(readSettings(S, 'kaputt'), { topN: 3, view: 'bar' });
  });
});

suite('Feldarten date, time, phase', () => {
  test('date: echtes Kalenderdatum, empty erlaubt leer, optional nicht', () => {
    assertEqual(checkValue(date(), 'd', '2026-02-28'), '2026-02-28');
    assertThrows(() => checkValue(date(), 'd', '2026-02-31'), /^invalid d "2026-02-31"; allowed: a date YYYY-MM-DD$/);
    assertThrows(() => checkValue(date(), 'd', ''), /invalid d ""/);
    assertEqual(checkValue(date({ empty: true }), 'd', ''), '');
    assertThrows(() => checkValue(date({ optional: true }), 'd', ''), /invalid d ""/);
    assertThrows(() => checkValue(date(), 'd', 20260228), /invalid d/);
  });

  test('time: HH:MM, mit step auf dem Raster', () => {
    assertEqual(checkValue(time(), 't', '23:59'), '23:59');
    assertThrows(() => checkValue(time(), 't', '24:00'), /^invalid t "24:00"; allowed: a time HH:MM$/);
    assertThrows(() => checkValue(time(), 't', '9:00'), /invalid t/);
    assertEqual(checkValue(time({ step: 5 }), 't', '09:05'), '09:05');
    assertThrows(() => checkValue(time({ step: 5 }), 't', '09:03'), /^invalid t "09:03"; allowed: a time HH:MM on a 5-minute grid$/);
  });

  test('phase: jede Phase irgendeines Zyklus ist gültig', () => {
    assertEqual(checkValue(phase(), 'p', 'define'), 'define');
    assertEqual(checkValue(phase(), 'p', 'containment'), 'containment');
    assertThrows(() => checkValue(phase(), 'p', 'data'), /invalid p "data"/);
    assertEqual(checkValue(phase({ nullable: true }), 'p', null), null);
  });

  test('Vorgaben: date leer, time 00:00 oder default, phase aus dem Kontext', () => {
    assertEqual(defaultOf(date()), '');
    assertEqual(defaultOf(time()), '00:00');
    assertEqual(defaultOf(time({ default: '09:00' })), '09:00');
    assertEqual(defaultOf(phase()), 'define');
    assertEqual(defaultOf(phase(), { cycle: 'eightd' }), 'prepare');
  });

  test('describeType: string', () => {
    assertEqual(describeType(date()), 'string');
    assertEqual(describeType(time({ step: 5 })), 'string');
    assertEqual(describeType(phase({ nullable: true })), 'string|null');
  });

  test('fromAttr: Text bleibt Text', () => {
    assertEqual(fromAttr(date(), '2026-01-02'), '2026-01-02');
    assertEqual(fromAttr(time(), '09:00'), '09:00');
    assertEqual(fromAttr(phase(), 'measure'), 'measure');
  });
});

suite('ModelContext', () => {
  const Ctx = defineModel({
    fields: { p: phase() },
    commands: {
      firstPhase: command({ params: {}, run() { return defaultOf(phase(), this.context); } }),
    },
  });

  test('ohne Kontext gilt der Vorgabezyklus', () => {
    const m = new Ctx();
    assertDeepEqual({ ...m.context }, { cycle: 'dmaic', confidenceLevel: 95, power: 80 });
    assertDeepEqual({ ...contextOf(m) }, { ...DEFAULT_CONTEXT });
  });

  test('setModelContext setzt und aktualisiert, nicht aufzählbar', () => {
    const m = new Ctx();
    setModelContext(m, { cycle: 'eightd' });
    assertEqual(m.context.cycle, 'eightd');
    assertEqual(m.firstPhase({}), 'prepare');
    setModelContext(m, { cycle: 'dmadv' });
    assertEqual(m.context.cycle, 'dmadv');
    assertTrue(!Object.keys(m).includes('_ctx'));
    assertTrue(!('_ctx' in m.toJSON()));
  });

  test('unbekannter Schlüssel oder Zyklus wirft', () => {
    assertThrows(() => checkContext({ cycle: 'dmaic', user: 'x' }), /unknown context key "user"; available: cycle/);
    assertThrows(() => checkContext({ cycle: 'six' }), /invalid context\.cycle "six"/);
    assertThrows(() => checkContext({}), /missing key "cycle" of context/);
  });

  test('context ist ein reservierter Name', () => {
    assertThrows(() => defineModel({ fields: { context: text() } }), /context is a reserved name/);
  });

  test('Kommando-Parameter sehen den Kontext (phase-Vorgabe beim Setzen über Setter egal)', () => {
    const m = Ctx.fromJSON({ p: 'team' });
    assertEqual(m.p, 'team');
  });
});

const Axis = defineModel({
  fields: { label: text() },
  view: { from: number({ integer: true, min: 0, max: 23, default: 6 }), to: number({ integer: true, min: 1, max: 24, default: 22 }) },
  invariants: { order: { fields: ['from', 'to'], test(m) { return m.from < m.to; } } },
  commands: {
    setRange: command({ params: { from: number({ integer: true }), to: number({ integer: true }) }, run({ from, to }) { this.to = to; this.from = from; } }),
    widen: command({ params: {}, run() { this.from = 20; this.to = 23; } }),
  },
});
const Budget = defineModel({
  fields: { min: number(), max: number({ default: 10 }) },
  invariants: { minMax: { fields: ['min', 'max'], test(m) { return m.min <= m.max; } } },
});

suite('Invarianten', () => {
  const errOf = (fn) => { try { fn(); } catch (e) { return e; } return null; };

  test('Setter: Verletzung setzt zurück und wirft mit param und invariant', () => {
    const m = new Axis();
    const err = errOf(() => { m.from = 22; });
    assertEqual(err.param, 'from');
    assertEqual(err.invariant, 'order');
    assertTrue(/^invalid from 22; allowed: a value that keeps order$/.test(err.message));
    assertEqual(m.from, 6);
    m.from = 21;
    assertEqual(m.from, 21);
  });

  test('Kommando: Zwischenstand erlaubt, Ende geprüft', () => {
    const m = new Axis();
    m.setRange({ from: 23, to: 24 });
    assertEqual(m.from, 23);
    assertEqual(m.to, 24);
  });

  test('Kommando mit Verletzung rollt alle Felder zurück, Beobachter schweigt', () => {
    const m = new Axis();
    const seen = [];
    setCommandObserver(m, (name) => seen.push(name));
    const err = errOf(() => m.setRange({ from: 10, to: 9 }));
    assertEqual(err.param, 'from');
    assertEqual(err.invariant, 'order');
    assertEqual(m.from, 6);
    assertEqual(m.to, 22);
    assertDeepEqual(seen, []);
  });

  test('Kommando, das gültig endet', () => {
    const m = new Axis();
    m.widen({});
    assertEqual(m.from, 20);
  });

  test('Laden: verletzte Ansichtsfelder fallen still auf die Vorgabe', () => {
    const m = Axis.fromJSON({ label: 'x', from: 20, to: 8 });
    assertEqual(m.from, 6);
    assertEqual(m.to, 22);
    assertEqual(m.label, 'x');
  });

  test('Laden: verletzter Inhalt wirft, mit repair Vorgabe', () => {
    assertThrows(() => Budget.fromJSON({ min: 5, max: 1 }), /^invalid min 5; allowed: a value that keeps minMax$/);
    const m = Budget.fromJSON({ min: 5, max: 1 }, { repair: true });
    assertEqual(m.min, 0);
    assertEqual(m.max, 10);
  });

  test('Definition: unbekanntes Feld, fehlender Test, verletzte Vorgabe werfen', () => {
    assertThrows(() => defineModel({ fields: { a: number() }, invariants: { x: { fields: ['b'], test() { return true; } } } }),
      /unknown invariant x field "b"; available: a/);
    assertThrows(() => defineModel({ fields: { a: number() }, invariants: { x: { fields: ['a'] } } }), /invariant x needs a test function/);
    assertThrows(() => defineModel({ fields: { a: number() }, invariants: { x: { fields: ['a'], test(m) { return m.a > 0; } } } }),
      /invariant x fails on the defaults/);
  });

  test('Schema nennt die Invarianten', () => {
    assertDeepEqual(Object.keys(Axis.schema.invariants), ['order']);
    assertDeepEqual([...Axis.schema.invariants.order.fields], ['from', 'to']);
  });
});

suite('activeContext', () => {
  test('Zyklus des Projekts, sonst Vorgabe', () => {
    assertDeepEqual(activeContext({ getProjectCycle: () => 'eightd' }), { cycle: 'eightd', confidenceLevel: 95, power: 80 });
    assertDeepEqual(activeContext({ getProjectCycle: () => 'unbekannt' }), { cycle: 'dmaic', confidenceLevel: 95, power: 80 });
    assertDeepEqual(activeContext(undefined), { cycle: 'dmaic', confidenceLevel: 95, power: 80 });
  });
});

suite('Feldart columnRef', () => {
  const ref = { instanceId: 'ws1', sheetId: 's1', columnId: 'c1' };

  test('Form: Strings, sheetId optional, keine Zusatzschlüssel', () => {
    assertDeepEqual(checkValue(columnRef(), 'c', ref), ref);
    assertDeepEqual(checkValue(columnRef(), 'c', { instanceId: 'ws1', columnId: 'c1' }), { instanceId: 'ws1', columnId: 'c1' });
    assertThrows(() => checkValue(columnRef(), 'c', { ...ref, extra: 1 }),
      /^invalid c .*; allowed: a column reference \{ instanceId, sheetId\?, columnId \}$/);
    assertThrows(() => checkValue(columnRef(), 'c', { instanceId: 'ws1' }), /invalid c/);
    assertThrows(() => checkValue(columnRef(), 'c', { instanceId: 1, columnId: 'c1' }), /invalid c/);
    assertThrows(() => checkValue(columnRef(), 'c', 'ws1|s1|c1'), /invalid c/);
  });

  test('null erlaubt und Vorgabe; abschaltbar', () => {
    assertEqual(checkValue(columnRef(), 'c', null), null);
    assertEqual(defaultOf(columnRef()), null);
    assertThrows(() => checkValue(columnRef({ nullable: false }), 'c', null), /invalid c/);
  });

  test('Kopie, nicht dasselbe Objekt', () => {
    const out = checkValue(columnRef(), 'c', ref);
    assertTrue(out !== ref);
  });

  test('Optionen stehen im Schema', () => {
    const s = columnRef({ types: ['numeric'], minCount: 3 });
    assertDeepEqual([...s.types], ['numeric']);
    assertEqual(s.minCount, 3);
    assertEqual(columnRef().types, null);
    assertEqual(columnRef().minCount, 0);
  });

  test('list(columnRef) prüft jeden Eintrag', () => {
    const s = list(columnRef({ nullable: false }));
    assertDeepEqual(checkValue(s, 'k', [ref, ref]), [ref, ref]);
    assertThrows(() => checkValue(s, 'k', [ref, null]), /invalid k\[1\]/);
  });

  test('describeType', () => {
    assertEqual(describeType(columnRef()), '{ instanceId: string, sheetId?: string, columnId: string }|null');
    assertEqual(describeType(list(columnRef({ nullable: false }))), '{ instanceId: string, sheetId?: string, columnId: string }[]');
  });

  test('fromAttr verboten, keine Kachel-Einstellung', () => {
    assertThrows(() => fromAttr(columnRef(), 'x'), /fromAttr: columnRef cannot come from an attribute/);
    assertThrows(() => defineSettings({ c: columnRef() }), /defineSettings: c is columnRef/);
  });

  test('defineModel: Feld, fromJSON, toJSON', () => {
    const M = defineModel({ fields: { colRef1: columnRef({ types: ['numeric'] }), colRefsK: list(columnRef({ nullable: false })) } });
    const m = M.fromJSON({ colRef1: ref, colRefsK: [ref] });
    assertDeepEqual(m.toJSON().colRef1, ref);
    assertThrows(() => { m.colRef1 = { instanceId: 'x' }; }, /invalid colRef1/);
    assertEqual(new M().hasContent(), false);
    assertEqual(m.hasContent(), true);
  });
});

suite('rewriteColumnRefs', () => {
  const M = defineModel({
    fields: {
      one: columnRef(),
      many: list(columnRef({ nullable: false })),
      pair: object({ x: columnRef(), label: text() }),
      byKey: record(['a', 'b'], columnRef()),
      other: text(),
    },
    view: { seen: columnRef() },
  });
  const src = (c) => ({ instanceId: '__source__', sheetId: 's', columnId: c });

  test('ersetzt from durch to, verschachtelt; Fremdes bleibt', () => {
    const data = {
      one: src('a'), many: [src('b'), { instanceId: 'keep', columnId: 'c' }],
      pair: { x: src('d'), label: '__source__' }, byKey: { a: src('e'), b: null },
      other: '__source__', seen: src('f'), unknown: src('g'),
    };
    const out = rewriteColumnRefs(M, data, '__source__', 'ws9');
    assertEqual(out.one.instanceId, 'ws9');
    assertDeepEqual(out.many.map((r) => r.instanceId), ['ws9', 'keep']);
    assertEqual(out.pair.x.instanceId, 'ws9');
    assertEqual(out.pair.label, '__source__');
    assertEqual(out.byKey.a.instanceId, 'ws9');
    assertEqual(out.byKey.b, null);
    assertEqual(out.other, '__source__');
    assertEqual(out.seen.instanceId, 'ws9');
    assertEqual(out.unknown.instanceId, '__source__');
    assertEqual(data.one.instanceId, '__source__', 'Eingabe unverändert');
  });

  test('fehlende und kaputte Werte bleiben stehen', () => {
    const out = rewriteColumnRefs(M, { one: null, many: 'x' }, '__source__', 'ws9');
    assertDeepEqual(out, { one: null, many: 'x' });
  });
});

suite('Vorgaben aus dem Kontext', () => {
  const Stats = defineModel({
    fields: {
      alpha: number({ exclusiveMin: 0, exclusiveMax: 1, default: (c) => Number((1 - c.confidenceLevel / 100).toFixed(4)) }),
      powerGoal: number({ min: 0.5, max: 0.99, default: (c) => c.power / 100 }),
      note: text(),
    },
  });
  const ctx90 = { cycle: 'dmaic', confidenceLevel: 90, power: 90 };

  test('activeContext liest die Einstellungen; fehlend oder ungültig → 95/80', () => {
    const sm = (conf, power) => ({ getProjectCycle: () => 'dmaic', get: (k) => ({ 'settings.confidenceLevel': conf, 'settings.power': power })[k] });
    assertDeepEqual(activeContext(sm(90, 85)), { cycle: 'dmaic', confidenceLevel: 90, power: 85 });
    assertDeepEqual(activeContext(sm(undefined, null)), { cycle: 'dmaic', confidenceLevel: 95, power: 80 });
    assertDeepEqual(activeContext(sm('90', NaN)), { cycle: 'dmaic', confidenceLevel: 95, power: 80 });
    assertDeepEqual(activeContext(sm(0, 100)), { cycle: 'dmaic', confidenceLevel: 95, power: 80 });
  });

  test('checkContext: Einstellungen optional, geprüft', () => {
    assertDeepEqual({ ...checkContext({ cycle: 'dmadv' }) }, { cycle: 'dmadv', confidenceLevel: 95, power: 80 });
    assertThrows(() => checkContext({ cycle: 'dmaic', confidenceLevel: 120 }), /invalid context\.confidenceLevel 120/);
    assertThrows(() => checkContext({ cycle: 'dmaic', power: 'x' }), /invalid context\.power "x"/);
  });

  test('default als Funktion: ohne Kontext die Vorgabe, mit Kontext daraus', () => {
    const m = new Stats();
    assertEqual(m.alpha, 0.05);
    assertEqual(m.powerGoal, 0.8);
    const n = new Stats(ctx90);
    assertEqual(n.alpha, 0.1);
    assertEqual(n.powerGoal, 0.9);
    assertEqual(n.context.confidenceLevel, 90);
    assertEqual(defaultOf(Stats.schema.fields.alpha, { ...DEFAULT_CONTEXT, confidenceLevel: 99 }), 0.01);
  });

  test('ungültiger Rückgabewert wirft mit Feldnamen', () => {
    const Bad = defineModel({ fields: { alpha: number({ min: 0, max: 1, default: (c) => (c.power > 90 ? 2 : 0.5) }) } });
    assertEqual(new Bad().alpha, 0.5);
    assertThrows(() => new Bad({ cycle: 'dmaic', power: 95 }), /invalid alpha 2/);
    assertThrows(() => defineModel({ fields: { a: number({ min: 0, max: 1, default: () => 5 }) } }), /invalid a 5/);
  });

  test('fromJSON füllt fehlende Felder aus dem Kontext, gespeicherte bleiben', () => {
    assertEqual(Stats.fromJSON({ note: 'x' }, { context: ctx90 }).alpha, 0.1);
    assertEqual(Stats.fromJSON({ alpha: 0.05 }, { context: ctx90 }).alpha, 0.05);
    assertEqual(readModel(Stats, { note: 'x' }, ctx90).powerGoal, 0.9);
  });

  test('hasContent vergleicht gegen die Vorgaben des Kontexts', () => {
    assertEqual(new Stats(ctx90).hasContent(), false);
    const m = new Stats(ctx90);
    setModelContext(m, { cycle: 'dmaic' });
    assertEqual(m.hasContent(), true, 'α 0.10 weicht von der Vorgabe 0.05 ab');
  });

  test('hasContent: phase() unter DMADV auf seiner Vorgabe ist kein Inhalt', () => {
    const P = defineModel({ fields: { at: phase() } });
    const m = new P({ cycle: 'dmadv' });
    assertEqual(m.at, getPhaseIds('dmadv')[0]);
    assertEqual(m.hasContent(), false);
  });

  test('describeType nennt keine default-Funktion', () => {
    assertTrue(!JSON.stringify(describeType(Stats.schema.fields.alpha)).includes('default'));
  });
});
