/**
 * Reine Spaltenfunktionen über den Leser (core/source-columns.js) — DOM-frei.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import {
  readColumn, columnLabel, numericValues, readSheet, readSheets, columnOptions, listColumns,
} from '../../js/core/source-columns.js';
import { storedSource } from '../helpers/stored-source.js';

const sheet = (values) => ({ sheets: [{ id: 's1', state: { rowCount: values.length, columns: [{ id: 'c1', name: 'Gewicht', shortName: 'G', values }] } }] });
const REF = { instanceId: 'ws1', sheetId: 's1', columnId: 'c1' };

suite('source-columns: readColumn', () => {
  test('readColumn liefert Kopf und Werte', () => {
    const src = storedSource({ ws1: sheet([1, '2,5', '', null, 'x', 3, '4']) });
    const col = readColumn(src, REF);
    assertDeepEqual(col.values, [1, '2,5', '', null, 'x', 3, '4']);
    assertEqual(col.name, 'Gewicht');
    assertEqual(col.shortName, 'G');
    assertEqual(col.roleConfirmed, false);
  });

  test('readColumn → null: ohne sheetId, unbekannte Instanz, unbekannte Spalte, not_loaded', () => {
    const src = storedSource({ ws1: sheet([1]) });
    assertEqual(readColumn(src, { instanceId: 'ws1', columnId: 'c1' }), null);
    assertEqual(readColumn(src, { ...REF, instanceId: 'nope' }), null);
    assertEqual(readColumn(src, { ...REF, columnId: 'nope' }), null);
    assertEqual(readColumn(src, null), null);
    const notLoaded = { read() { throw Object.assign(new Error('not_loaded'), { code: 'not_loaded' }); }, list: () => [] };
    assertEqual(readColumn(notLoaded, REF), null);
  });

  test('columnLabel: name, shortName, ?', () => {
    assertEqual(columnLabel({ name: 'A', shortName: 'B' }), 'A');
    assertEqual(columnLabel({ name: '', shortName: 'B' }), 'B');
    assertEqual(columnLabel({}), '?');
  });
});

suite('source-columns: numericValues', () => {
  test('Dezimalkomma zählt, Wahrheitswerte, Leerwerte, Text und Infinity fallen heraus', () => {
    assertDeepEqual(numericValues(['4', '2,5', true, false, '', null, 'x', 7, Infinity]), [4, 2.5, 7]);
  });
});

suite('source-columns: readSheet, readSheets', () => {
  const states = {
    ws1: { sheets: [
      { id: 's1', name: 'Eins', state: { rowCount: 3, columns: [
        { id: 'c1', name: 'Fehler', type: 'numeric', values: [1, 2, 3] },
        { id: 'c2', name: '', shortName: 'K', type: 'text', values: ['a', 'b'] },
      ] } },
      { id: 's2', name: 'Zwei', state: { rowCount: 1, columns: [{ id: 'c3', name: 'Z', type: 'numeric', values: [9] }] } },
    ] },
  };

  test('readSheet: Zeilenzahl und Köpfe samt meta', () => {
    const src = storedSource(states);
    const out = readSheet(src, { instanceId: 'ws1', sheetId: 's1' });
    assertEqual(out.id, 's1');
    assertEqual(out.name, 'Eins');
    assertEqual(out.rowCount, 3);
    assertDeepEqual(out.columns.map((c) => [c.id, c.name, c.type]), [['c1', 'Fehler', 'numeric'], ['c2', 'K', 'text']]);
    assertEqual(out.columns[0].meta, null);
  });

  test('readSheet: meta bleibt erhalten', () => {
    const meta = { lock: true, managedBy: 'doe-planner' };
    const src = storedSource({ ws1: { sheets: [{ id: 's1', name: 'E', state: { rowCount: 1, columns: [{ id: 'c1', name: 'A', type: 'numeric', values: [1], meta }] } }] } });
    assertDeepEqual(readSheet(src, { instanceId: 'ws1', sheetId: 's1' }).columns[0].meta, meta);
  });

  test('readSheet → null: ohne sheetId, unbekanntes Blatt, unbekannte Instanz', () => {
    const src = storedSource(states);
    assertEqual(readSheet(src, { instanceId: 'ws1' }), null);
    assertEqual(readSheet(src, { instanceId: 'ws1', sheetId: 'nope' }), null);
    assertEqual(readSheet(src, { instanceId: 'nope', sheetId: 's1' }), null);
    assertEqual(readSheet(src, null), null);
  });

  test('readSheets: Blätter mit Zeilenzahl, sonst null', () => {
    const src = storedSource(states);
    assertDeepEqual(readSheets(src, 'ws1'), [{ id: 's1', name: 'Eins', rowCount: 3 }, { id: 's2', name: 'Zwei', rowCount: 1 }]);
    assertEqual(readSheets(src, 'nope'), null);
    assertEqual(readSheets(src, null), null);
  });
});

suite('source-columns: columnOptions, listColumns', () => {
  const states = {
    ws1: { sheets: [{ id: 's1', name: 'Blatt', state: { rowCount: 3, columns: [
      { id: 'c1', name: 'Fehler', type: 'numeric', values: [1, 2, 3] },
      { id: 'c2', name: 'Text', type: 'text', values: ['a', 'b'] },
      { id: 'c3', name: '', shortName: 'K', type: 'numeric', values: [4] },
    ] } }] },
  };

  test('columnOptions: nur passende { key, name }', () => {
    const src = storedSource(states);
    assertDeepEqual(columnOptions(src, { types: ['numeric'], minCount: 2 }), [{ key: 'ws1|s1|c1', name: 'Fehler' }]);
    assertDeepEqual(columnOptions(src, { types: ['numeric'] }).map((c) => c.name), ['Fehler', 'K']);
  });

  test('listColumns: Felder von discoverColumns', () => {
    const [c] = listColumns(storedSource(states), { types: ['numeric'], minCount: 2 });
    assertDeepEqual(c, {
      instanceId: 'ws1', sheetId: 's1', sheetName: 'Blatt', columnId: 'c1',
      columnName: 'Fehler', shortName: '?', type: 'numeric', valueCount: 3,
    });
  });
});
