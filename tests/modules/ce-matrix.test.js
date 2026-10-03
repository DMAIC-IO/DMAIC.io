/**
 * D.Mike — C&E Matrix Model unit tests (ce-matrix.test.js)
 *
 * Tests the pure business logic / state in ce-matrix-model.js:
 * constructor defaults, toJSON/fromJSON roundtrip, sanitization,
 * weighted scoring (rowSum / colSum / grandTotal), add/remove with
 * score reindexing, and hasContent().
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/ce-matrix/ce-matrix-model.js';

suite('C&E Matrix Model — State defaults & serialization', () => {
  test('constructor seeds 3 inputs, 3 outputs, weights=1, empty scores', () => {
    const s = new State();
    assertEqual(s.inputs.length, 3);
    assertEqual(s.outputs.length, 3);
    assertEqual(s.inputs[0], 'Input 1');
    assertEqual(s.outputs[2], 'Output 3');
    assertEqual(s.weights.length, 3);
    assertEqual(s.weights[0], 1);
    assertEqual(Object.keys(s.scores).length, 0);
  });

  test('toJSON returns inputs, outputs, scores, weights', () => {
    const s = new State();
    s.setScore(0, 0, 5);
    const j = s.toJSON();
    assertEqual(Array.isArray(j.inputs), true);
    assertEqual(Array.isArray(j.outputs), true);
    assertEqual(Array.isArray(j.weights), true);
    assertEqual(typeof j.scores, 'object');
    assertEqual(j.scores['0-0'], 5);
  });

  test('toJSON returns independent copies (no aliasing)', () => {
    const s = new State();
    const j = s.toJSON();
    j.inputs.push('Mutated');
    j.scores['9-9'] = 1;
    assertEqual(s.inputs.length, 3);
    assertEqual(s.scores['9-9'], undefined);
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.inputs.length, 3);
    assertEqual(s.outputs.length, 3);
    assertEqual(s.weights.length, 3);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.inputs.length, 3);
    assertEqual(s.outputs.length, 3);
  });

  test('fromJSON restores data correctly', () => {
    const s = State.fromJSON({
      inputs: ['A', 'B'],
      outputs: ['X', 'Y', 'Z'],
      weights: [2, 3, 4],
      scores: { '0-0': 9, '1-2': 3 },
    });
    assertEqual(s.inputs.length, 2);
    assertEqual(s.outputs.length, 3);
    assertEqual(s.weights[1], 3);
    assertEqual(s.getScore(0, 0), 9);
    assertEqual(s.getScore(1, 2), 3);
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const s = new State();
    s.inputs = ['I1', 'I2'];
    s.outputs = ['O1', 'O2'];
    s.weights = [5, 7];
    s.setScore(0, 0, 9);
    s.setScore(1, 1, 4);
    const r = State.fromJSON(s.toJSON());
    assertEqual(r.inputs.join(','), 'I1,I2');
    assertEqual(r.outputs.join(','), 'O1,O2');
    assertEqual(r.weights.join(','), '5,7');
    assertEqual(r.getScore(0, 0), 9);
    assertEqual(r.getScore(1, 1), 4);
  });

  test('fromJSON clamps weights to 1..10 and defaults invalid to 1', () => {
    const s = State.fromJSON({
      inputs: ['A'], outputs: ['X', 'Y', 'Z'],
      weights: [0, 15, 'bad'],
      scores: {},
    });
    assertEqual(s.weights[0], 1);   // 0 → clamped to 1
    assertEqual(s.weights[1], 10);  // 15 → clamped to 10
    assertEqual(s.weights[2], 1);   // NaN → 1
  });

  test('fromJSON pads missing weights to output count', () => {
    const s = State.fromJSON({
      inputs: ['A'], outputs: ['X', 'Y', 'Z'],
      weights: [5],
      scores: {},
    });
    assertEqual(s.weights.length, 3);
    assertEqual(s.weights[0], 5);
    assertEqual(s.weights[1], 1);
    assertEqual(s.weights[2], 1);
  });

  test('fromJSON ignores malformed fields gracefully', () => {
    const s = State.fromJSON({ inputs: 'nope', outputs: 42, scores: 'x', weights: null });
    assertEqual(s.inputs.length, 3);
    assertEqual(s.outputs.length, 3);
    assertEqual(Object.keys(s.scores).length, 0);
  });
});

suite('C&E Matrix Model — score handling', () => {
  test('getScore returns 0 for unset cells', () => {
    const s = new State();
    assertEqual(s.getScore(0, 0), 0);
  });

  test('setScore stores integer value', () => {
    const s = new State();
    s.setScore(1, 2, 7);
    assertEqual(s.getScore(1, 2), 7);
    assertEqual(s.scores['1-2'], 7);
  });

  test('setScore accepts 10 on the default 0–10 scale (B1-015)', () => {
    const s = new State();
    assertEqual(s.scale, '0-10');
    assertEqual(s.setScore(0, 0, 10), true);
    assertEqual(s.getScore(0, 0), 10);
  });

  test('setScore rejects off-scale values instead of clamping', () => {
    const s = new State();
    s.setScore(0, 0, 4);
    assertEqual(s.setScore(0, 0, 15), false);
    assertEqual(s.getScore(0, 0), 4);
    assertEqual(s.setScore(0, 0, -5), false);
    assertEqual(s.getScore(0, 0), 4);
  });

  test('setScore with empty string deletes the cell', () => {
    const s = new State();
    s.setScore(0, 0, 5);
    s.setScore(0, 0, '');
    assertEqual(s.scores['0-0'], undefined);
    assertEqual(s.getScore(0, 0), 0);
  });

  test('setScore with NaN deletes the cell', () => {
    const s = new State();
    s.setScore(0, 0, 5);
    s.setScore(0, 0, 'abc');
    assertEqual(s.scores['0-0'], undefined);
  });

  test('getWeight returns 1 for missing index', () => {
    const s = new State();
    assertEqual(s.getWeight(99), 1);
  });
});

suite('C&E Matrix Model — weighted scoring', () => {
  function build() {
    const s = new State();
    s.inputs = ['I1', 'I2'];
    s.outputs = ['O1', 'O2', 'O3'];
    s.weights = [5, 10, 2];
    s.setScore(0, 0, 9); s.setScore(0, 1, 3); s.setScore(0, 2, 1);
    s.setScore(1, 0, 0); s.setScore(1, 1, 9); s.setScore(1, 2, 9);
    return s;
  }

  test('rowSum = Σ score·weight across outputs', () => {
    const s = build();
    // (9*5)+(3*10)+(1*2) = 45+30+2 = 77
    assertEqual(s.rowSum(0), 77);
    // (0*5)+(9*10)+(9*2) = 0+90+18 = 108
    assertEqual(s.rowSum(1), 108);
  });

  test('colSum = Σ score·weight across inputs', () => {
    const s = build();
    assertEqual(s.colSum(0), 45);   // (9+0)*5
    assertEqual(s.colSum(1), 120);  // (3+9)*10
    assertEqual(s.colSum(2), 20);   // (1+9)*2
  });

  test('grandTotal = Σ rowSums', () => {
    const s = build();
    assertEqual(s.grandTotal(), 185); // 77 + 108
  });

  test('empty matrix has zero sums', () => {
    const s = new State();
    assertEqual(s.rowSum(0), 0);
    assertEqual(s.colSum(0), 0);
    assertEqual(s.grandTotal(), 0);
  });
});

suite('C&E Matrix Model — add / remove with reindexing', () => {
  test('addInput appends "Input N+1"', () => {
    const s = new State();
    s.addInput();
    assertEqual(s.inputs.length, 4);
    assertEqual(s.inputs[3], 'Input 4');
  });

  test('addOutput appends output and weight 1', () => {
    const s = new State();
    s.addOutput();
    assertEqual(s.outputs.length, 4);
    assertEqual(s.outputs[3], 'Output 4');
    assertEqual(s.weights.length, 4);
    assertEqual(s.weights[3], 1);
  });

  test('removeInput keeps at least one row', () => {
    const s = new State();
    s.inputs = ['only'];
    s.removeInput(0);
    assertEqual(s.inputs.length, 1);
  });

  test('removeInput reindexes scores of rows below', () => {
    const s = new State();
    s.inputs = ['A', 'B', 'C'];
    s.setScore(0, 0, 1);
    s.setScore(1, 0, 2);
    s.setScore(2, 0, 3);
    s.removeInput(0);
    assertEqual(s.inputs.join(','), 'B,C');
    // old row1 (val 2) → row0, old row2 (val 3) → row1
    assertEqual(s.getScore(0, 0), 2);
    assertEqual(s.getScore(1, 0), 3);
  });

  test('removeOutput keeps at least one column', () => {
    const s = new State();
    s.outputs = ['only'];
    s.weights = [1];
    s.removeOutput(0);
    assertEqual(s.outputs.length, 1);
  });

  test('removeOutput reindexes scores and splices weight', () => {
    const s = new State();
    s.outputs = ['X', 'Y', 'Z'];
    s.weights = [2, 4, 6];
    s.setScore(0, 0, 1);
    s.setScore(0, 1, 2);
    s.setScore(0, 2, 3);
    s.removeOutput(0);
    assertEqual(s.outputs.join(','), 'Y,Z');
    assertEqual(s.weights.join(','), '4,6');
    // old col1 (val 2) → col0, old col2 (val 3) → col1
    assertEqual(s.getScore(0, 0), 2);
    assertEqual(s.getScore(0, 1), 3);
  });
});

suite('C&E Matrix Model — hasContent', () => {
  test('default state has content (seeded inputs/outputs)', () => {
    const s = new State();
    assertEqual(s.hasContent(), true);
  });

  test('empty inputs and outputs → no content', () => {
    const s = new State();
    s.inputs = [];
    s.outputs = [];
    assertEqual(s.hasContent(), false);
  });

  test('content when at least one input present', () => {
    const s = new State();
    s.inputs = ['A'];
    s.outputs = [];
    assertEqual(s.hasContent(), true);
  });
});

// ── Rating scale (finding B1-015) ───────────────────────────

suite('C&E Matrix Model — rating scale', () => {
  test('presets list their allowed ratings', () => {
    const s = new State();
    assertEqual(JSON.stringify(s.allowedScores()), '[0,1,2,3,4,5,6,7,8,9,10]');
    s.setScale('0-1-3-9');
    assertEqual(JSON.stringify(s.allowedScores()), '[0,1,3,9]');
    s.setScale('0-3-7-10');
    assertEqual(JSON.stringify(s.allowedScores()), '[0,3,7,10]');
  });

  test('a discrete scale rejects ratings between its steps', () => {
    const s = new State();
    s.setScale('0-1-3-9');
    assertEqual(s.setScore(0, 0, 5), false);
    assertEqual(s.scores['0-0'], undefined);
    assertEqual(s.setScore(0, 0, 9), true);
    assertEqual(s.getScore(0, 0), 9);
  });

  test('unknown scale ids are ignored', () => {
    const s = new State();
    assertEqual(s.setScale('0-5'), false);
    assertEqual(s.scale, '0-10');
  });

  test('switching scale keeps existing ratings and counts the off-scale ones', () => {
    const s = new State();
    s.setScore(0, 0, 10); s.setScore(0, 1, 7); s.setScore(1, 0, 5);
    s.setScale('0-3-7-10');
    assertEqual(s.getScore(1, 0), 5);
    assertEqual(s.offScaleCount(), 1);
    assertEqual(s.isOnScale(1, 0), false);
    assertEqual(s.isOnScale(0, 0), true);
  });

  test('book example (Melzer Fig 3.2): a 10 keeps Größe Halter ahead', () => {
    const s = new State();
    s.outputs = ['Y1', 'Y2', 'Y3', 'Y4'];
    s.weights = [7, 10, 5, 3];
    s.inputs = ['Größe Halter', 'Form der Substrate'];
    [10, 7, 10, 3].forEach((v, c) => s.setScore(0, c, v));
    [10, 7, 7, 7].forEach((v, c) => s.setScore(1, c, v));
    assertEqual(s.rowSum(0), 199);
    assertEqual(s.rowSum(1), 196);
  });

  test('scale round-trips; legacy data without scale loads as 0–10', () => {
    const s = new State();
    s.setScale('0-1-3-9');
    assertEqual(State.fromJSON(s.toJSON()).scale, '0-1-3-9');
    assertEqual(State.fromJSON({ inputs: ['a'], outputs: ['b'] }).scale, '0-10');
    assertEqual(State.fromJSON({ scale: 'bogus' }).scale, '0-10');
  });
});
