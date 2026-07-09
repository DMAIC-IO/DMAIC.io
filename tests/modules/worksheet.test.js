import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/worksheet/worksheet-model.js';

/**
 * The worksheet Model holds sheet metadata + opaque per-sheet DataGrid state
 * blobs. It must reproduce the legacy persistence shape exactly:
 *   { sheets:[{id,name,state}], activeSheetId, sheetCounter }
 * Per-sheet `state` is opaque (whatever DataGrid.getState() returns).
 */

function makeColState(values) {
  return {
    columns: [{ id: 'c1', name: '', shortName: 'C1', type: 'numeric', values: values || [] }],
    rowCount: (values || []).length,
    colWidths: {}, sortCol: null, sortDir: null, selection: null,
  };
}

suite('Worksheet Model — State construction', () => {
  test('constructor starts empty (no sheets — view seeds the first sheet)', () => {
    const s = new State();
    assertEqual(Array.isArray(s.sheets), true);
    assertEqual(s.sheets.length, 0);
    assertEqual(s.activeSheetId, null);
    assertEqual(s.sheetCounter, 0);
  });

  test('addSheet appends a sheet, bumps counter, sets active', () => {
    const s = new State();
    const sh = s.addSheet('Sheet');
    assertEqual(s.sheets.length, 1);
    assertEqual(s.sheetCounter, 1);
    assertEqual(sh.id, 'sheet_1');
    assertEqual(sh.name, 'Sheet');
    assertEqual(s.activeSheetId, 'sheet_1');
    assertEqual(sh.state, null);
  });

  test('addSheet without name uses numbered default name', () => {
    const s = new State();
    const sh = s.addSheet();
    assertEqual(sh.name, 'Sheet 1');
  });

  test('addSheet with copyFrom deep-copies source state', () => {
    const s = new State();
    const a = s.addSheet('A');
    a.state = makeColState([1, 2, 3]);
    const b = s.addSheet('B', 'sheet_1');
    assertEqual(b.state.columns[0].values.length, 3);
    // deep copy — mutating source does not affect copy
    a.state.columns[0].values.push(99);
    assertEqual(b.state.columns[0].values.length, 3);
  });
});

suite('Worksheet Model — sheet operations', () => {
  test('renameSheet trims and ignores empty', () => {
    const s = new State();
    s.addSheet('A');
    s.renameSheet('sheet_1', '  Renamed  ');
    assertEqual(s.sheets[0].name, 'Renamed');
    s.renameSheet('sheet_1', '   ');
    assertEqual(s.sheets[0].name, 'Renamed');
  });

  test('removeSheet refuses to remove the last sheet (returns false)', () => {
    const s = new State();
    s.addSheet('Only');
    const ok = s.removeSheet('sheet_1');
    assertEqual(ok, false);
    assertEqual(s.sheets.length, 1);
  });

  test('removeSheet drops sheet and re-points active', () => {
    const s = new State();
    s.addSheet('A'); s.addSheet('B'); s.addSheet('C');
    s.setActive('sheet_2');
    const ok = s.removeSheet('sheet_2');
    assertEqual(ok, true);
    assertEqual(s.sheets.length, 2);
    assertEqual(s.sheets.find(x => x.id === 'sheet_2'), undefined);
    // active was the removed one → re-pointed to a valid sheet
    assertEqual(s.sheets.some(x => x.id === s.activeSheetId), true);
  });

  test('setActive switches active sheet', () => {
    const s = new State();
    s.addSheet('A'); s.addSheet('B');
    s.setActive('sheet_1');
    assertEqual(s.activeSheetId, 'sheet_1');
  });

  test('duplicateSheet inserts a deep copy with (Copy) suffix', () => {
    const s = new State();
    const a = s.addSheet('A');
    a.state = makeColState([7, 8]);
    const dup = s.duplicateSheet('sheet_1', 'Copy');
    assertEqual(s.sheets.length, 2);
    assertEqual(dup.name, 'A (Copy)');
    assertEqual(dup.state.columns[0].values.length, 2);
    assertEqual(s.activeSheetId, dup.id);
  });

  test('insertSheetBefore inserts a blank sheet at index', () => {
    const s = new State();
    s.addSheet('A'); s.addSheet('B');
    const ins = s.insertSheetBefore('sheet_2');
    const idx = s.sheets.findIndex(x => x.id === ins.id);
    const bIdx = s.sheets.findIndex(x => x.id === 'sheet_2');
    assertEqual(idx, bIdx - 1);
    assertEqual(ins.state, null);
    assertEqual(s.activeSheetId, ins.id);
  });

  test('getActiveSheet returns the active sheet', () => {
    const s = new State();
    s.addSheet('A'); s.addSheet('B');
    s.setActive('sheet_1');
    assertEqual(s.getActiveSheet().id, 'sheet_1');
  });
});

suite('Worksheet Model — hasContent', () => {
  test('empty single sheet → no content', () => {
    const s = new State();
    s.addSheet('Sheet');
    assertEqual(s.hasContent(), false);
  });

  test('single sheet with default empty columns → no content', () => {
    const s = new State();
    const sh = s.addSheet('Sheet');
    sh.state = makeColState([null, '', null]);
    assertEqual(s.hasContent(), false);
  });

  test('single sheet with a real value → has content', () => {
    const s = new State();
    const sh = s.addSheet('Sheet');
    sh.state = makeColState([null, 42, null]);
    assertEqual(s.hasContent(), true);
  });

  test('more than one sheet → has content', () => {
    const s = new State();
    s.addSheet('A'); s.addSheet('B');
    assertEqual(s.hasContent(), true);
  });
});

suite('Worksheet Model — serialization', () => {
  test('toJSON reproduces legacy shape', () => {
    const s = new State();
    const a = s.addSheet('A');
    a.state = makeColState([1, 2]);
    s.addSheet('B');
    const json = s.toJSON();
    assertEqual(Array.isArray(json.sheets), true);
    assertEqual(json.sheets.length, 2);
    assertEqual(json.sheets[0].id, 'sheet_1');
    assertEqual(json.sheets[0].name, 'A');
    assertEqual(json.sheets[0].state.columns[0].values[0], 1);
    assertEqual(json.activeSheetId, 'sheet_2');
    assertEqual(json.sheetCounter, 2);
  });

  test('fromJSON(null) → valid empty default', () => {
    const s = State.fromJSON(null);
    assertEqual(s instanceof State, true);
    assertEqual(s.sheets.length, 0);
    assertEqual(s.activeSheetId, null);
    assertEqual(s.sheetCounter, 0);
  });

  test('fromJSON(undefined) → valid empty default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.sheets.length, 0);
  });

  test('fromJSON(malformed) → valid empty default', () => {
    const s = State.fromJSON({ sheets: 'nope', activeSheetId: 5, sheetCounter: 'x' });
    assertEqual(Array.isArray(s.sheets), true);
    assertEqual(s.sheets.length, 0);
    assertEqual(s.sheetCounter, 0);
  });

  test('fromJSON restores sheets and opaque state blobs', () => {
    const data = {
      sheets: [
        { id: 'sheet_1', name: 'A', state: makeColState([3, 4]) },
        { id: 'sheet_2', name: 'B', state: null },
      ],
      activeSheetId: 'sheet_2',
      sheetCounter: 2,
    };
    const s = State.fromJSON(data);
    assertEqual(s.sheets.length, 2);
    assertEqual(s.sheets[0].name, 'A');
    assertEqual(s.sheets[0].state.columns[0].values[1], 4);
    assertEqual(s.activeSheetId, 'sheet_2');
    assertEqual(s.sheetCounter, 2);
  });

  test('sheetCounter defaults to sheet count when missing', () => {
    const s = State.fromJSON({
      sheets: [{ id: 'sheet_1', name: 'A', state: null }, { id: 'sheet_2', name: 'B', state: null }],
      activeSheetId: 'sheet_1',
    });
    assertEqual(s.sheetCounter, 2);
  });

  test('activeSheetId defaults to first sheet when missing/invalid', () => {
    const s = State.fromJSON({
      sheets: [{ id: 'sheet_7', name: 'A', state: null }],
      sheetCounter: 7,
    });
    assertEqual(s.activeSheetId, 'sheet_7');
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const s = new State();
    const a = s.addSheet('First');
    a.state = makeColState([1, 2, 3]);
    s.addSheet('Second');
    s.setActive('sheet_1');
    const round = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(round.toJSON()), JSON.stringify(s.toJSON()));
  });
});
