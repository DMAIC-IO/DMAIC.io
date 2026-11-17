/**
 * Arbeitsblatt: Model in der Zielform (Felder, Vorgaben, Invarianten).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../../test-utils.js';
import { WorksheetModel, newSheetState } from '../../../js/modules/worksheet/domain/model.js';
import { TableData } from '../../../js/core/table-data.js';
import { START_ROW_COUNT, COLUMN_TYPES, DATE_FORMATS, TIME_FORMATS } from '../../../js/core/datagrid/datagrid-utils.js';
import { inferRole, ALL_ROLES } from '../../../js/core/datagrid/datagrid-roles.js';
import { COLUMN_SHAPE, FORMAT_KEYS } from '../../../js/modules/worksheet/domain/columns.js';

const V = { version: '1.0' };

/**
 * Eine Spalte in der Zielform.
 * @param {string} id @param {object} [over] @returns {object}
 */
function col(id, over = {}) {
  return {
    id, name: id, shortName: id, type: 'numeric', unit: null, role: 'continuous', roleManual: false, format: {}, meta: null, ...over,
  };
}

/**
 * Ein gespeicherter Stand der Version 1.0 mit einem Blatt.
 * @param {object} [over] @returns {any}
 */
function saved1(over = {}) {
  return {
    _schema: V,
    sheets: [{
      id: 's1', name: 'Blatt',
      columns: [col('a'), col('b', { type: 'text', role: 'freeText' })],
      formulas: {},
      data: { rowCount: 2, columns: [[1, 2], ['x', 'y']] },
    }],
    sheetCounter: 1,
    activeSheetId: 's1',
    gridView: {},
    ...over,
  };
}

/** @param {any} json @returns {any} */
const clone = (json) => JSON.parse(JSON.stringify(json));

suite('worksheet: Model', () => {
  test('Version 1.0, Inhaltsfelder sind für Agenten nicht beschreibbar', () => {
    const { fields, view, version } = WorksheetModel.schema;
    assertEqual(version, '1.0');
    assertEqual(fields.sheets.agentWrite, false);
    assertEqual(fields.sheetCounter.agentWrite, false);
    assertDeepEqual(Object.keys(view).sort(), ['activeSheetId', 'gridView']);
  });

  test('newSheetState: fünf Startspalten C1–C5, START_ROW_COUNT leere Zeilen', () => {
    const s = newSheetState('Blatt', 'sheet_7');
    assertEqual(s.id, 'sheet_7');
    assertEqual(s.name, 'Blatt');
    assertDeepEqual(s.columns.map(c => c.shortName), ['C1', 'C2', 'C3', 'C4', 'C5']);
    assertEqual(new Set(s.columns.map(c => c.id)).size, 5);
    assertTrue(s.columns.every(c => c.type === 'numeric' && c.role === 'continuous' && c.roleManual === false
      && c.unit === null && c.meta === null && c.name === ''));
    assertTrue(s.data instanceof TableData);
    assertEqual(s.data.rowCount, START_ROW_COUNT);
    assertEqual(s.data.columns.length, 5);
    assertDeepEqual(s.formulas, {});
  });

  test('neues Model: ein Blatt, aktiv, ohne Inhalt', () => {
    const m = new WorksheetModel();
    assertEqual(m.sheets.length, 1);
    assertEqual(m.activeSheetId, m.sheets[0].id);
    assertEqual(m.sheetCounter, 1);
    assertEqual(m.hasContent(), false);
  });

  test('hasContent: ein Wert, eine Formel oder ein zweites Blatt zählen', () => {
    const withValue = WorksheetModel.fromJSON(saved1());
    assertEqual(withValue.hasContent(), true);
    const empty = saved1();
    empty.sheets[0].data.columns = [[null, null], [null, '']];
    assertEqual(WorksheetModel.fromJSON(empty).hasContent(), false);
    const formula = clone(empty);
    formula.sheets[0].formulas = { a: { 0: '=1' } };
    assertEqual(WorksheetModel.fromJSON(formula).hasContent(), true);
    const two = clone(empty);
    two.sheets.push({ ...clone(empty.sheets[0]), id: 's2' });
    assertEqual(WorksheetModel.fromJSON(two).hasContent(), true);
  });

  test('toJSON → fromJSON gibt denselben Stand', () => {
    const m = WorksheetModel.fromJSON(saved1({ gridView: { s1: { colWidths: { a: 120 }, selection: null } } }));
    const json = m.toJSON();
    assertDeepEqual(WorksheetModel.fromJSON(clone(json)).toJSON(), json);
    assertDeepEqual(json.sheets[0].data, { rowCount: 2, columns: [[1, 2], ['x', 'y']] });
  });

  test('gridView: Auswahl mit extraCols (R7)', () => {
    const sel = { startCol: 0, startRow: 0, endCol: 1, endRow: 1, activeCol: 0, activeRow: 0, extraCols: [3] };
    const m = WorksheetModel.fromJSON(saved1({ gridView: { s1: { colWidths: {}, selection: sel } } }));
    assertDeepEqual(m.gridView.s1.selection, sel);
  });
});

suite('worksheet: Invarianten', () => {
  test('doppelte Blatt-Id wirft', () => {
    const json = saved1();
    json.sheets.push(clone(json.sheets[0]));
    assertThrows(() => WorksheetModel.fromJSON(json), /sheets/);
  });

  test('doppelte Blatt-Id: repair behält beide Blätter, das zweite bekommt eine neue Id', () => {
    const json = saved1();
    json.sheets.push({ ...clone(json.sheets[0]), name: 'Zwei' });
    const m = WorksheetModel.fromJSON(json, { repair: true });
    assertEqual(m.sheets.length, 2);
    assertEqual(m.sheets[0].id, 's1');
    assertTrue(m.sheets[1].id !== 's1' && m.sheets[1].id !== '');
    assertEqual(m.sheets[1].name, 'Zwei');
  });

  test('doppelte Spalten-Id je Blatt wirft', () => {
    const json = saved1();
    json.sheets[0].columns[1].id = 'a';
    assertThrows(() => WorksheetModel.fromJSON(json), /sheets/);
  });

  test('leere Blattliste wird mit repair geheilt (ein Blatt, aktiv)', () => {
    const json = saved1({ sheets: [], activeSheetId: '' });
    assertThrows(() => WorksheetModel.fromJSON(clone(json)), /sheets/);
    const m = WorksheetModel.fromJSON(json, { repair: true });
    assertEqual(m.sheets.length, 1);
    assertEqual(m.sheets[0].columns.length, 5);
    assertEqual(m.activeSheetId, m.sheets[0].id);
  });

  test('unbekanntes activeSheetId wird geheilt: erstes Blatt', () => {
    const json = saved1({ activeSheetId: 'gibt-es-nicht' });
    const strict = WorksheetModel.fromJSON(clone(json));
    assertEqual(strict.activeSheetId, 's1');
    assertEqual(WorksheetModel.fromJSON(json, { repair: true }).activeSheetId, 's1');
  });

  test('data.columns.length !== columns.length wirft', () => {
    const json = saved1();
    json.sheets[0].data.columns.pop();
    assertThrows(() => WorksheetModel.fromJSON(json), /sheets/);
  });

  test('data.columns.length !== columns.length: repair füllt mit leeren Spalten auf', () => {
    const json = saved1();
    json.sheets[0].data.columns.pop();
    const m = WorksheetModel.fromJSON(json, { repair: true });
    assertDeepEqual(m.sheets[0].data.columns, [[1, 2], [null, null]]);
  });

  test('Text in einer Zahlenspalte wirft streng, repair macht ihn zu null', () => {
    const json = saved1();
    json.sheets[0].data.columns[0] = [1, 'zwei'];
    assertThrows(() => WorksheetModel.fromJSON(clone(json)), /sheets/);
    const m = WorksheetModel.fromJSON(json, { repair: true });
    assertDeepEqual(m.sheets[0].data.columns[0], [1, null]);
    assertDeepEqual(m.sheets[0].data.columns[1], ['x', 'y']);
  });

  test('Formelzellen sind von der Typprüfung ausgenommen', () => {
    const json = saved1();
    json.sheets[0].data.columns[0] = [1, 'Text aus IF'];
    json.sheets[0].formulas = { a: { 1: '=IF(C1[1]>0;"Text aus IF";0)' } };
    const m = WorksheetModel.fromJSON(json);
    assertEqual(m.sheets[0].data.columns[0][1], 'Text aus IF');
  });

  test('Typen: Zahl in Datum/Zeit, Wahrheitswert in binary und alles in text passen', () => {
    const json = saved1();
    json.sheets[0].columns = [
      col('d', { type: 'date', role: 'date' }), col('t', { type: 'time', role: 'date' }),
      col('b', { type: 'binary', role: 'categorical' }), col('x', { type: 'text', role: 'freeText' }),
    ];
    json.sheets[0].data = { rowCount: 2, columns: [['2025-01-01', 45000], ['8:00', 0.5], [1, true], [3, false]] };
    const m = WorksheetModel.fromJSON(json);
    assertDeepEqual(m.sheets[0].data.columns, [['2025-01-01', 45000], ['8:00', 0.5], [1, true], [3, false]]);
  });

  test('fehlende Rolle wird mit repair zu inferRole', () => {
    const json = saved1();
    json.sheets[0].columns[1].role = null;
    json.sheets[0].data.columns[1] = ['x', 'x'];
    assertThrows(() => WorksheetModel.fromJSON(clone(json)), /sheets/);
    const m = WorksheetModel.fromJSON(json, { repair: true });
    assertEqual(m.sheets[0].columns[1].role, inferRole({ type: 'text', values: ['x', 'x'] }));
    assertEqual(m.sheets[0].columns[0].role, 'continuous');
  });

  test('repair verliert keine gültigen Daten anderer Blätter', () => {
    const json = saved1();
    json.sheets.push({ ...clone(json.sheets[0]), id: 's2' });
    json.sheets[1].data.columns[0] = ['kaputt', 5];
    const m = WorksheetModel.fromJSON(json, { repair: true });
    assertDeepEqual(m.sheets.map(s => s.id), ['s1', 's2']);
    assertDeepEqual(m.sheets[0].data.columns[0], [1, 2]);
    assertDeepEqual(m.sheets[1].data.columns[0], [null, 5]);
  });

  test('cellsFitType gilt nur beim Laden (onLoad, R9), currencySymbol ist ein Format-Schlüssel (R10)', () => {
    assertEqual(WorksheetModel.schema.invariants.cellsFitType.onLoad, true);
    const json = saved1();
    json.sheets[0].columns[0] = col('a', { type: 'currency', format: { decimals: 2, currencySymbol: '$' } });
    assertDeepEqual(WorksheetModel.fromJSON(json).sheets[0].columns[0].format, { decimals: 2, currencySymbol: '$' });
  });
});

suite('worksheet: Listen im Schema-Literal gleich der Engine', () => {
  // Das Schema-Literal-Gate verlangt Literale; hier die Gleichheit mit den Quellen.
  const commands = WorksheetModel.schema.commands;
  test('Spaltentypen: COLUMN_SHAPE.type und setColumnType = Object.keys(COLUMN_TYPES)', () => {
    assertDeepEqual(COLUMN_SHAPE.type.values, Object.keys(COLUMN_TYPES));
    assertDeepEqual(commands.setColumnType.params.columnType.values, Object.keys(COLUMN_TYPES));
  });
  test('Rollen: COLUMN_SHAPE.role und setColumnRole = ALL_ROLES', () => {
    assertDeepEqual(COLUMN_SHAPE.role.values, ALL_ROLES);
    assertDeepEqual(commands.setColumnRole.params.role.values, ALL_ROLES);
  });
  test('Formate: Datum, Zeit und Format-Schlüssel', () => {
    assertDeepEqual(COLUMN_SHAPE.format.shape.dateFormat.values, Object.keys(DATE_FORMATS));
    assertDeepEqual(COLUMN_SHAPE.format.shape.timeFormat.values, Object.keys(TIME_FORMATS));
    assertDeepEqual(commands.setColumnFormat.params.key.values, [...FORMAT_KEYS]);
  });
});
