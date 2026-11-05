/**
 * SIPOC in neuer Form: Kommandos, Endindex, Migration '0→1.0', Zusammenfassung.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { State, COL_KEYS } from '../../js/modules/sipoc/domain/model.js';
import { from0 } from '../../js/modules/sipoc/domain/migrations.js';
import { COLUMNS, columnSummary } from '../../js/modules/sipoc/domain/summary.js';

const filled = (cols) => State.fromJSON({ _schema: { version: '1.0' }, columns: { suppliers: [], inputs: [], process: [], outputs: [], customers: [], ...cols } });

suite('SIPOC — Konstanten', () => {
  test('fünf Spalten in Reihenfolge, Buchstaben SIPOC', () => {
    assertDeepEqual(COL_KEYS, ['suppliers', 'inputs', 'process', 'outputs', 'customers']);
    assertDeepEqual(COLUMNS.map((c) => c.key), COL_KEYS);
    assertEqual(COLUMNS.map((c) => c.letter).join(''), 'SIPOC');
  });
});

suite('SIPOC — addItem', () => {
  test('hängt getrimmt an und liefert den Index', () => {
    const s = new State();
    assertEqual(s.addItem({ col: 'suppliers', text: '  Mühle ' }), 0);
    assertEqual(s.addItem({ col: 'suppliers', text: 'Bäcker' }), 1);
    assertDeepEqual(s.columns.suppliers, ['Mühle', 'Bäcker']);
  });
  test('leerer Text wird abgelehnt, nichts angelegt', () => {
    const s = new State();
    assertThrows(() => s.addItem({ col: 'inputs', text: '   ' }), /^invalid text " {3}"; allowed: a non-empty text$/);
    assertDeepEqual(s.columns.inputs, []);
  });
  test('unbekannte Spalte wird abgelehnt', () => {
    assertThrows(() => new State().addItem({ col: 's', text: 'x' }),
      /^invalid col "s"; allowed: suppliers, inputs, process, outputs, customers$/);
  });
  test('fehlender Parameter', () => {
    assertThrows(() => new State().addItem({ col: 'inputs' }), /^missing argument "text" of addItem/);
  });
});

suite('SIPOC — setItem und removeItem', () => {
  test('setItem ersetzt getrimmt', () => {
    const s = filled({ inputs: ['Mehl'] });
    s.setItem({ col: 'inputs', idx: 0, text: ' Mehl Type 550 ' });
    assertDeepEqual(s.columns.inputs, ['Mehl Type 550']);
  });
  test('setItem: leerer Text abgelehnt, alter Eintrag bleibt', () => {
    const s = filled({ inputs: ['Mehl'] });
    assertThrows(() => s.setItem({ col: 'inputs', idx: 0, text: '' }), /allowed: a non-empty text$/);
    assertDeepEqual(s.columns.inputs, ['Mehl']);
  });
  test('Index ohne Eintrag wird abgelehnt', () => {
    const s = filled({ inputs: ['Mehl'] });
    assertThrows(() => s.setItem({ col: 'inputs', idx: 1, text: 'x' }), /^invalid idx 1; allowed: 0\.\.0$/);
    assertThrows(() => s.removeItem({ col: 'outputs', idx: 0 }), /^invalid idx 0; allowed: none, the collection is empty$/);
  });
  test('removeItem entfernt genau einen Eintrag', () => {
    const s = filled({ process: ['A', 'B', 'C'] });
    s.removeItem({ col: 'process', idx: 1 });
    assertDeepEqual(s.columns.process, ['A', 'C']);
  });
});

suite('SIPOC — moveItem mit Endindex', () => {
  test('in derselben Spalte nach unten: Endindex = Position danach', () => {
    const s = filled({ suppliers: ['A', 'B', 'C'] });
    s.moveItem({ fromCol: 'suppliers', fromIdx: 0, toCol: 'suppliers', toIdx: 2 });
    assertDeepEqual(s.columns.suppliers, ['B', 'C', 'A']);
  });
  test('in derselben Spalte nach oben', () => {
    const s = filled({ suppliers: ['A', 'B', 'C'] });
    s.moveItem({ fromCol: 'suppliers', fromIdx: 2, toCol: 'suppliers', toIdx: 0 });
    assertDeepEqual(s.columns.suppliers, ['C', 'A', 'B']);
  });
  test('eigene Spalte: Obergrenze länge − 1', () => {
    const s = filled({ suppliers: ['A', 'B'] });
    assertThrows(() => s.moveItem({ fromCol: 'suppliers', fromIdx: 0, toCol: 'suppliers', toIdx: 2 }),
      /^invalid toIdx 2; allowed: 0\.\.1$/);
    assertDeepEqual(s.columns.suppliers, ['A', 'B']);
  });
  test('fremde Spalte: Obergrenze länge (ans Ende), auch in leere Spalte', () => {
    const s = filled({ outputs: ['Pizza'], customers: ['Kunde'] });
    s.moveItem({ fromCol: 'outputs', fromIdx: 0, toCol: 'customers', toIdx: 1 });
    assertDeepEqual(s.columns.customers, ['Kunde', 'Pizza']);
    assertDeepEqual(s.columns.outputs, []);
    s.moveItem({ fromCol: 'customers', fromIdx: 0, toCol: 'outputs', toIdx: 0 });
    assertDeepEqual(s.columns.outputs, ['Kunde']);
  });
  test('fremde Spalte: hinter dem Ende abgelehnt', () => {
    const s = filled({ outputs: ['Pizza'] });
    assertThrows(() => s.moveItem({ fromCol: 'outputs', fromIdx: 0, toCol: 'customers', toIdx: 1 }),
      /^invalid toIdx 1; allowed: 0\.\.0$/);
  });
  test('Quelle ohne Eintrag abgelehnt', () => {
    assertThrows(() => filled({}).moveItem({ fromCol: 'process', fromIdx: 0, toCol: 'inputs', toIdx: 0 }),
      /^invalid fromIdx 0; allowed: none, the collection is empty$/);
  });
});

suite('SIPOC — Speichern und Laden', () => {
  test('toJSON: _schema zuerst, dann columns', () => {
    const json = filled({ inputs: ['Mehl'] }).toJSON();
    assertDeepEqual(Object.keys(json), ['_schema', 'columns']);
    assertEqual(json._schema.version, '1.0');
    assertDeepEqual(json.columns.inputs, ['Mehl']);
  });
  test('Rundlauf verlustfrei', () => {
    const json = filled({ process: ['A', 'B'], customers: ['K'] }).toJSON();
    assertDeepEqual(State.fromJSON(json).toJSON(), json);
  });
  test('Altstand ohne _schema läuft durch 0→1.0', () => {
    const s = State.fromJSON({ columns: { suppliers: ['Mühle', 3, null], inputs: 'kaputt' } });
    assertDeepEqual(s.columns, { suppliers: ['Mühle'], inputs: [], process: [], outputs: [], customers: [] });
  });
  test('nackte Spaltenkarte (Altformat) wird zu { columns }', () => {
    assertDeepEqual(State.fromJSON({ process: ['A'] }).columns.process, ['A']);
  });
  test('neuere Version wird abgelehnt', () => {
    assertThrows(() => State.fromJSON({ _schema: { version: '1.1' }, columns: {} }), /allowed: up to 1\.0/);
  });
  test('kein Objekt → leere Spalten', () => {
    assertDeepEqual(State.fromJSON(null).columns.suppliers, []);
    assertEqual(new State().hasContent(), false);
    assertTrue(filled({ outputs: ['x'] }).hasContent());
  });
});

suite('SIPOC — Migration 0→1.0', () => {
  test('nackte Map, fehlende Spalten, Nicht-Arrays, Nicht-Strings, fremde Schlüssel', () => {
    assertDeepEqual(from0({ suppliers: ['a', 1], inputs: 'x', fremd: true }),
      { columns: { suppliers: ['a'], inputs: [], process: [], outputs: [], customers: [] } });
  });
  test('kanonische Form bleibt, fremde Schlüssel fallen weg', () => {
    assertDeepEqual(from0({ columns: { process: ['p'] }, legacy: 1 }),
      { columns: { suppliers: [], inputs: [], process: ['p'], outputs: [], customers: [] } });
  });
  test('ohne Spaltenschlüssel: leere Spalten', () => {
    assertDeepEqual(from0({ irgendwas: 1 }).columns.customers, []);
  });
});

suite('SIPOC — columnSummary', () => {
  test('Anzahl, erste n, Rest; n < 1 oder keine Zahl zählt als 1', () => {
    const s = filled({ suppliers: ['a', 'b', 'c'] });
    const [sup, inp] = columnSummary(s, 2);
    assertDeepEqual(sup, { key: 'suppliers', letter: 'S', count: 3, top: ['a', 'b'], more: 1 });
    assertDeepEqual(inp, { key: 'inputs', letter: 'I', count: 0, top: [], more: 0 });
    assertEqual(columnSummary(s, 0)[0].top.length, 1);
    assertEqual(columnSummary(s, 'x')[0].top.length, 1);
  });
  test('top ist eine Kopie', () => {
    const s = filled({ suppliers: ['a'] });
    columnSummary(s, 3)[0].top.push('z');
    assertDeepEqual(s.columns.suppliers, ['a']);
  });
});
