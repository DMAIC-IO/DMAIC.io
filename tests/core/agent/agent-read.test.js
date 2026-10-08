/**
 * Tests for core/agent/agent-read.js — the read() projection from Spec §7
 * ("der Agent bekommt Umfang statt Masse, bis er gezielt nachfragt").
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { projectReadState } from '../../../js/core/agent/agent-read.js';

const SCHEMA = {
  title:   { type: 'string',   help: 'Titel der Sammlung', bulk: false },
  columns: { type: 'object[]', help: 'Spaltendefinitionen', bulk: false },
  rows:    { type: 'any[][]',  help: 'Datenzeilen',         bulk: true  },
};

function makeState(rowCount = 5) {
  return {
    title: 'Messreihe',
    columns: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    rows: Array.from({ length: rowCount }, (_, i) => [i, i * 2, i * 3]),
    _cursor: 4,
  };
}

suite('agent read projection', () => {
  test('without options the bulk field is replaced by a descriptor', () => {
    const out = projectReadState(makeState(5000), SCHEMA);
    assertEqual(out.title, 'Messreihe');
    assertEqual(out.rows.$bulk, true);
    assertEqual(out.rows.kind, 'table');
    assertEqual(out.rows.rowCount, 5000);
    assertDeepEqual(out.rows.columns, ['A', 'B', 'C']);
  });

  test('non-bulk fields always come through in full', () => {
    const out = projectReadState(makeState(), SCHEMA);
    assertEqual(out.columns.length, 3);
  });

  test('underscore-prefixed fields never appear', () => {
    const schemaWithPrivate = {
      ...SCHEMA,
      _cursor: { type: 'number', help: 'private', bulk: false },
    };
    const out = projectReadState(makeState(), schemaWithPrivate);
    assertEqual(Object.prototype.hasOwnProperty.call(out, '_cursor'), false);
  });

  test('a field absent from the schema never appears', () => {
    const out = projectReadState({ ...makeState(), secret: 1 }, SCHEMA);
    assertEqual(Object.prototype.hasOwnProperty.call(out, 'secret'), false);
  });

  test('fields: [bulk field] delivers the data in full', () => {
    const out = projectReadState(makeState(4), SCHEMA, { fields: ['rows'] });
    assertEqual(out.rows.length, 4);
    assertDeepEqual(out.rows[0], [0, 0, 0]);
  });

  test('rows narrows the requested bulk field and reports the range', () => {
    const out = projectReadState(makeState(10), SCHEMA, { fields: ['rows'], rows: { from: 2, to: 5 } });
    assertEqual(out.rows.length, 3);
    assertDeepEqual(out.rows[0], [2, 4, 6]);
    assertDeepEqual(out.rows$range, { from: 2, to: 5, rowCount: 10 });
  });

  test('a range beyond the data is clamped, not an error', () => {
    const out = projectReadState(makeState(3), SCHEMA, { fields: ['rows'], rows: { from: 1, to: 99 } });
    assertEqual(out.rows.length, 2);
    assertDeepEqual(out.rows$range, { from: 1, to: 3, rowCount: 3 });
  });

  test('rows without fields does not force bulk data out', () => {
    const out = projectReadState(makeState(10), SCHEMA, { rows: { from: 0, to: 2 } });
    assertEqual(out.rows.$bulk, true);
  });

  test('fields naming a non-bulk field is harmless', () => {
    const out = projectReadState(makeState(10), SCHEMA, { fields: ['title'] });
    assertEqual(out.title, 'Messreihe');
    assertEqual(out.rows.$bulk, true);
  });

  test('a bulk field that is not an array gets rowCount 0 and no columns', () => {
    const out = projectReadState({ rows: null }, { rows: { type: 'any[][]', help: '', bulk: true } });
    assertEqual(out.rows.rowCount, 0);
    assertDeepEqual(out.rows.columns, []);
  });

  test('without schema columns field remains empty', () => {
    const schema = { grid: { type: 'any[][]', help: '', bulk: true } };
    const out = projectReadState({ grid: [['x', 'y'], [1, 2]] }, schema);
    assertDeepEqual(out.grid.columns, []);
    assertEqual(out.grid.rowCount, 2);
  });

  test('the projection is a fresh object — mutating it does not touch the state', () => {
    const state = makeState(2);
    const out = projectReadState(state, SCHEMA, { fields: ['rows'] });
    out.rows.push([9, 9, 9]);
    assertEqual(state.rows.length, 2);
  });
});
