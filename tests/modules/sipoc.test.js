import { suite, test, assertEqual } from '../test-utils.js';
import { State, COLUMNS } from '../../js/modules/sipoc/sipoc-model.js';

const COL_KEYS = ['suppliers', 'inputs', 'process', 'outputs', 'customers'];

suite('SIPOC Model — constants', () => {
  test('COLUMNS has the five SIPOC columns in order', () => {
    assertEqual(COLUMNS.map(c => c.key).join(','), COL_KEYS.join(','));
  });

  test('COLUMNS carry the S/I/P/O/C letters', () => {
    assertEqual(COLUMNS.map(c => c.letter).join(''), 'SIPOC');
  });
});

suite('SIPOC Model — State construction', () => {
  test('constructor creates five empty arrays', () => {
    const s = new State();
    for (const k of COL_KEYS) {
      assertEqual(Array.isArray(s.columns[k]), true);
      assertEqual(s.columns[k].length, 0);
    }
  });

  test('hasContent is false on a fresh state', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('hasContent is true once any column has an item', () => {
    const s = new State();
    s.columns.process.push('Step 1');
    assertEqual(s.hasContent(), true);
  });
});

suite('SIPOC Model — addItem', () => {
  test('addItem appends a trimmed value and returns true', () => {
    const s = new State();
    assertEqual(s.addItem('suppliers', '  Acme  '), true);
    assertEqual(s.columns.suppliers.length, 1);
    assertEqual(s.columns.suppliers[0], 'Acme');
  });

  test('addItem rejects empty / whitespace-only text', () => {
    const s = new State();
    assertEqual(s.addItem('inputs', ''), false);
    assertEqual(s.addItem('inputs', '   '), false);
    assertEqual(s.columns.inputs.length, 0);
  });

  test('addItem ignores unknown column', () => {
    const s = new State();
    assertEqual(s.addItem('nope', 'x'), false);
  });

  test('addItem preserves order across multiple adds', () => {
    const s = new State();
    s.addItem('process', 'A');
    s.addItem('process', 'B');
    s.addItem('process', 'C');
    assertEqual(s.columns.process.join(','), 'A,B,C');
  });
});

suite('SIPOC Model — setItem', () => {
  test('setItem replaces a value and returns true', () => {
    const s = new State();
    s.addItem('outputs', 'Old');
    assertEqual(s.setItem('outputs', 0, ' New '), true);
    assertEqual(s.columns.outputs[0], 'New');
  });

  test('setItem rejects empty text and leaves value unchanged', () => {
    const s = new State();
    s.addItem('outputs', 'Keep');
    assertEqual(s.setItem('outputs', 0, '   '), false);
    assertEqual(s.columns.outputs[0], 'Keep');
  });

  test('setItem ignores out-of-range index', () => {
    const s = new State();
    s.addItem('outputs', 'Keep');
    assertEqual(s.setItem('outputs', 5, 'X'), false);
    assertEqual(s.columns.outputs.join(','), 'Keep');
  });
});

suite('SIPOC Model — deleteItem', () => {
  test('deleteItem removes by index', () => {
    const s = new State();
    s.addItem('customers', 'A');
    s.addItem('customers', 'B');
    s.deleteItem('customers', 0);
    assertEqual(s.columns.customers.join(','), 'B');
  });

  test('deleteItem ignores out-of-range index', () => {
    const s = new State();
    s.addItem('customers', 'A');
    s.deleteItem('customers', 9);
    assertEqual(s.columns.customers.join(','), 'A');
  });
});

suite('SIPOC Model — moveItem (reorder)', () => {
  test('moveItem within a column moves to the top', () => {
    const s = new State();
    s.addItem('suppliers', 'First');
    s.addItem('suppliers', 'Second');
    s.addItem('suppliers', 'Third');
    // drag Third (idx 2) to idx 0
    s.moveItem('suppliers', 2, 'suppliers', 0);
    assertEqual(s.columns.suppliers.join(','), 'Third,First,Second');
  });

  test('moveItem corrects the drop index when moving downward in same column', () => {
    const s = new State();
    s.addItem('suppliers', 'A');
    s.addItem('suppliers', 'B');
    s.addItem('suppliers', 'C');
    // move A (idx 0) towards the end (dropIdx 3)
    s.moveItem('suppliers', 0, 'suppliers', 3);
    assertEqual(s.columns.suppliers.join(','), 'B,C,A');
  });

  test('moveItem across columns relocates the value', () => {
    const s = new State();
    s.addItem('suppliers', 'X');
    s.moveItem('suppliers', 0, 'inputs', 0);
    assertEqual(s.columns.suppliers.length, 0);
    assertEqual(s.columns.inputs.join(','), 'X');
  });
});

suite('SIPOC Model — serialization', () => {
  test('toJSON returns a { columns } shape with all five columns', () => {
    const s = new State();
    s.addItem('suppliers', 'Sup');
    const json = s.toJSON();
    assertEqual(typeof json.columns, 'object');
    for (const k of COL_KEYS) assertEqual(Array.isArray(json.columns[k]), true);
    assertEqual(json.columns.suppliers.join(','), 'Sup');
  });

  test('toJSON does not leak internal array references', () => {
    const s = new State();
    s.addItem('inputs', 'A');
    const json = s.toJSON();
    json.columns.inputs.push('mutated');
    assertEqual(s.columns.inputs.join(','), 'A');
  });

  test('fromJSON(null) returns a valid default state', () => {
    const s = State.fromJSON(null);
    for (const k of COL_KEYS) assertEqual(s.columns[k].length, 0);
  });

  test('fromJSON(undefined) returns a valid default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.hasContent(), false);
  });

  test('fromJSON restores the { columns } shape', () => {
    const s = State.fromJSON({ columns: { suppliers: ['A'], process: ['P1', 'P2'] } });
    assertEqual(s.columns.suppliers.join(','), 'A');
    assertEqual(s.columns.process.join(','), 'P1,P2');
    assertEqual(s.columns.inputs.length, 0);
  });

  test('fromJSON also accepts a bare columns object (legacy import)', () => {
    const s = State.fromJSON({ suppliers: ['A'], customers: ['C'] });
    assertEqual(s.columns.suppliers.join(','), 'A');
    assertEqual(s.columns.customers.join(','), 'C');
  });

  test('fromJSON ignores non-array column values', () => {
    const s = State.fromJSON({ columns: { suppliers: 'not-an-array', inputs: ['ok'] } });
    assertEqual(s.columns.suppliers.length, 0);
    assertEqual(s.columns.inputs.join(','), 'ok');
  });

  test('fromJSON keeps only string entries', () => {
    const s = State.fromJSON({ columns: { suppliers: ['a', 1, null, 'b'] } });
    assertEqual(s.columns.suppliers.join(','), 'a,b');
  });

  test('round-trip toJSON -> fromJSON is lossless', () => {
    const s = new State();
    s.addItem('suppliers', 'Lieferant Alpha');
    s.addItem('process', 'Schritt 1');
    s.addItem('process', 'Schritt 2');
    s.addItem('customers', 'Endkunde');
    const restored = State.fromJSON(s.toJSON());
    assertEqual(restored.columns.suppliers.join(','), 'Lieferant Alpha');
    assertEqual(restored.columns.process.join(','), 'Schritt 1,Schritt 2');
    assertEqual(restored.columns.customers.join(','), 'Endkunde');
  });
});
