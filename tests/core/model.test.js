/**
 * Tests for core/model.js — Felder, Ansichtsfelder, toJSON/fromJSON, Typtexte.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import {
  defineModel, command, text, number, boolean, oneOf, index, idOf, list, record, object,
  defaultOf, checkValue, describeType, schemaOf, fieldSpec, defineState, stateSchemaOf,
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
