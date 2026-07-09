import { suite, test, assertEqual } from '../test-utils.js';
import { Cell, State, CATEGORIES, LEVELS } from '../../js/modules/triz-resources/triz-resources-model.js';

suite('TRIZ Resources Model — Cell', () => {
  test('constructor sets default values', () => {
    const c = new Cell();
    assertEqual(c.notes, '');
    assertEqual(c.status, 'unknown');
  });

  test('cycleStatus cycles through all four states', () => {
    const c = new Cell();
    assertEqual(c.status, 'unknown');
    c.cycleStatus(); assertEqual(c.status, 'unused');
    c.cycleStatus(); assertEqual(c.status, 'partial');
    c.cycleStatus(); assertEqual(c.status, 'full');
    c.cycleStatus(); assertEqual(c.status, 'unknown');
  });

  test('toJSON returns notes and status', () => {
    const c = new Cell();
    c.notes = 'test note';
    c.status = 'partial';
    const json = c.toJSON();
    assertEqual(json.notes, 'test note');
    assertEqual(json.status, 'partial');
  });

  test('fromJSON restores valid data', () => {
    const c = Cell.fromJSON({ notes: 'abc', status: 'full' });
    assertEqual(c.notes, 'abc');
    assertEqual(c.status, 'full');
  });

  test('fromJSON with null returns default cell', () => {
    const c = Cell.fromJSON(null);
    assertEqual(c.notes, '');
    assertEqual(c.status, 'unknown');
  });

  test('fromJSON with undefined returns default cell', () => {
    const c = Cell.fromJSON(undefined);
    assertEqual(c.notes, '');
    assertEqual(c.status, 'unknown');
  });

  test('fromJSON sanitises notes to string', () => {
    const c = Cell.fromJSON({ notes: 123, status: 'unused' });
    assertEqual(c.notes, '');
    assertEqual(c.status, 'unused');
  });

  test('fromJSON sanitises invalid status to unknown', () => {
    const c = Cell.fromJSON({ notes: 'x', status: 'invalid_status' });
    assertEqual(c.notes, 'x');
    assertEqual(c.status, 'unknown');
  });

  test('fromJSON empty object returns default cell', () => {
    const c = Cell.fromJSON({});
    assertEqual(c.notes, '');
    assertEqual(c.status, 'unknown');
  });
});

suite('TRIZ Resources Model — State', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.system, '');
    for (const cat of CATEGORIES) {
      for (const lvl of LEVELS) {
        const cell = s.cells[cat][lvl];
        assertEqual(cell.notes, '');
        assertEqual(cell.status, 'unknown');
      }
    }
  });

  test('constructor creates all 6 categories x 3 levels', () => {
    const s = new State();
    for (const cat of CATEGORIES) {
      for (const lvl of LEVELS) {
        assertEqual(s.cells[cat][lvl] instanceof Cell, true);
      }
    }
  });

  test('toJSON returns _schema, system, cells', () => {
    const s = new State();
    s.system = 'test-system';
    s.cells['substance']['sys'].notes = 'a note';
    const json = s.toJSON();
    assertEqual(json._schema.name, 'triz-resources');
    assertEqual(json._schema.version, '1.0');
    assertEqual(json.system, 'test-system');
    assertEqual(json.cells['substance']['sys'].notes, 'a note');
    assertEqual(json.cells['substance']['sys'].status, 'unknown');
  });

  test('toJSON does not leak internal _schema reference', () => {
    const s = new State();
    const json = s.toJSON();
    json._schema.version = 'hacked';
    assertEqual(s._schema.version, '1.0');
  });

  test('fromJSON restores full state', () => {
    const original = new State();
    original.system = 'my-system';
    original.cells['field']['super'].notes = 'note1';
    original.cells['field']['super'].cycleStatus();
    original.cells['time']['sub'].notes = 'note2';
    original.cells['time']['sub'].cycleStatus();
    original.cells['time']['sub'].cycleStatus();

    const json = original.toJSON();
    const restored = State.fromJSON(json);
    assertEqual(restored.system, 'my-system');
    assertEqual(restored.cells['field']['super'].notes, 'note1');
    assertEqual(restored.cells['field']['super'].status, 'unused');
    assertEqual(restored.cells['time']['sub'].notes, 'note2');
    assertEqual(restored.cells['time']['sub'].status, 'partial');
  });

  test('fromJSON with null returns default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.system, '');
    assertEqual(s.cells['substance']['sub'].status, 'unknown');
  });

  test('fromJSON with undefined returns default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.system, '');
  });

  test('fromJSON sanitises system to string', () => {
    const s = State.fromJSON({ system: 42 });
    assertEqual(s.system, '');
  });

  test('fromJSON preserves unknown _schema version gracefully', () => {
    const s = State.fromJSON({ _schema: { version: '0.5' } });
    assertEqual(s.cells['substance']['sub'].status, 'unknown');
  });

  test('round-trip toJSON → fromJSON preserves all cells', () => {
    const original = new State();
    original.system = 'test-roundtrip';
    for (const cat of CATEGORIES) {
      for (const lvl of LEVELS) {
        original.cells[cat][lvl].notes = `${cat}/${lvl} note`;
        original.cells[cat][lvl].status = 'full';
      }
    }
    const json = original.toJSON();
    const restored = State.fromJSON(json);
    assertEqual(restored.system, 'test-roundtrip');
    for (const cat of CATEGORIES) {
      for (const lvl of LEVELS) {
        assertEqual(restored.cells[cat][lvl].notes, `${cat}/${lvl} note`);
        assertEqual(restored.cells[cat][lvl].status, 'full');
      }
    }
  });
});
