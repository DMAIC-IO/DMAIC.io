import { suite, test, assertEqual } from '../test-utils.js';
import { State, MAX_CRITERIA } from '../../js/modules/pairwise-comparison/pairwise-comparison-model.js';

suite('Pairwise Comparison Model — defaults', () => {
  test('constructor sets defaults', () => {
    const s = new State();
    assertEqual(s.criteria.length, 0);
    assertEqual(s.matrix.length, 0);
    assertEqual(s.pairs.length, 0);
    assertEqual(s.currentPair, 0);
    assertEqual(s.viewPhase, 'input');
  });
  test('hasContent false when empty', () => {
    assertEqual(new State().hasContent(), false);
  });
  test('hasContent true with a criterion', () => {
    const s = new State();
    s.addCriterion('A');
    assertEqual(s.hasContent(), true);
  });
});

suite('Pairwise Comparison Model — addCriterion', () => {
  test('adds a trimmed criterion', () => {
    const s = new State();
    assertEqual(s.addCriterion('  Quality  '), 'ok');
    assertEqual(s.criteria[0], 'Quality');
  });
  test('rejects empty', () => {
    const s = new State();
    assertEqual(s.addCriterion('   '), 'empty');
    assertEqual(s.criteria.length, 0);
  });
  test('rejects duplicate', () => {
    const s = new State();
    s.addCriterion('A');
    assertEqual(s.addCriterion('A'), 'duplicate');
    assertEqual(s.criteria.length, 1);
  });
  test('rejects when at max', () => {
    const s = new State();
    for (let i = 0; i < MAX_CRITERIA; i++) s.addCriterion('C' + i);
    assertEqual(s.criteria.length, MAX_CRITERIA);
    assertEqual(s.addCriterion('overflow'), 'max');
    assertEqual(s.criteria.length, MAX_CRITERIA);
  });
  test('adding invalidates prior comparison', () => {
    const s = new State();
    s.addCriterion('A'); s.addCriterion('B'); s.addCriterion('C');
    s.startComparison();
    assertEqual(s.pairs.length, 3);
    s.addCriterion('D');
    assertEqual(s.matrix.length, 0);
    assertEqual(s.pairs.length, 0);
    assertEqual(s.currentPair, 0);
  });
});

suite('Pairwise Comparison Model — removeCriterion', () => {
  test('removes by index', () => {
    const s = new State();
    s.addCriterion('A'); s.addCriterion('B');
    s.removeCriterion(0);
    assertEqual(s.criteria.length, 1);
    assertEqual(s.criteria[0], 'B');
  });
  test('ignores out-of-range index', () => {
    const s = new State();
    s.addCriterion('A');
    s.removeCriterion(5);
    assertEqual(s.criteria.length, 1);
  });
  test('removing invalidates comparison', () => {
    const s = new State();
    s.addCriterion('A'); s.addCriterion('B'); s.addCriterion('C');
    s.startComparison();
    s.removeCriterion(0);
    assertEqual(s.pairs.length, 0);
  });
});

suite('Pairwise Comparison Model — comparison flow', () => {
  test('startComparison needs MIN_CRITERIA', () => {
    const s = new State();
    s.addCriterion('A'); s.addCriterion('B');
    assertEqual(s.startComparison(), false);
    assertEqual(s.viewPhase, 'input');
  });
  test('startComparison builds matrix and pairs', () => {
    const s = new State();
    s.addCriterion('A'); s.addCriterion('B'); s.addCriterion('C');
    assertEqual(s.startComparison(), true);
    assertEqual(s.viewPhase, 'compare');
    assertEqual(s.matrix.length, 3);
    assertEqual(s.matrix[0].length, 3);
    assertEqual(s.pairs.length, 3);
  });
  test('choose records win/loss and advances', () => {
    const s = new State();
    s.addCriterion('A'); s.addCriterion('B'); s.addCriterion('C');
    s.startComparison();
    s.choose(0, 1);
    assertEqual(s.matrix[0][1], 1);
    assertEqual(s.matrix[1][0], 0);
    assertEqual(s.currentPair, 1);
  });
  test('chooseTie records 0.5 both ways', () => {
    const s = new State();
    s.addCriterion('A'); s.addCriterion('B'); s.addCriterion('C');
    s.startComparison();
    s.chooseTie(0, 1);
    assertEqual(s.matrix[0][1], 0.5);
    assertEqual(s.matrix[1][0], 0.5);
    assertEqual(s.currentPair, 1);
  });
  test('completing all pairs switches to results', () => {
    const s = new State();
    s.addCriterion('A'); s.addCriterion('B'); s.addCriterion('C');
    s.startComparison();
    s.choose(s.pairs[0][0], s.pairs[0][1]);
    s.choose(s.pairs[1][0], s.pairs[1][1]);
    s.choose(s.pairs[2][0], s.pairs[2][1]);
    assertEqual(s.currentPair, 3);
    assertEqual(s.viewPhase, 'results');
  });
  test('choose past end is a no-op', () => {
    const s = new State();
    s.addCriterion('A'); s.addCriterion('B'); s.addCriterion('C');
    s.startComparison();
    s.choose(s.pairs[0][0], s.pairs[0][1]);
    s.choose(s.pairs[1][0], s.pairs[1][1]);
    s.choose(s.pairs[2][0], s.pairs[2][1]);
    const snap = JSON.stringify(s.matrix);
    s.choose(0, 1);
    assertEqual(JSON.stringify(s.matrix), snap);
    assertEqual(s.currentPair, 3);
  });
});

suite('Pairwise Comparison Model — scores and ranking', () => {
  test('scores sum rows ignoring diagonal', () => {
    const s = new State();
    s.criteria = ['A', 'B', 'C'];
    s.matrix = [[0, 1, 1], [0, 0, 0.5], [0, 0.5, 0]];
    assertEqual(JSON.stringify(s.scores), JSON.stringify([2, 0.5, 0.5]));
    assertEqual(s.maxScore, 2);
  });
  test('ranked sorts by score desc', () => {
    const s = new State();
    s.criteria = ['A', 'B', 'C'];
    s.matrix = [[0, 1, 1], [0, 0, 0.5], [0, 0.5, 0]];
    const r = s.ranked;
    assertEqual(r[0].name, 'A');
    assertEqual(r[0].score, 2);
  });
  test('pairCount = n*(n-1)/2', () => {
    const s = new State();
    s.criteria = ['A', 'B', 'C', 'D'];
    assertEqual(s.pairCount, 6);
  });
});

suite('Pairwise Comparison Model — cycleCell', () => {
  test('cycles 0 -> 0.5 -> 1 -> 0 and mirrors', () => {
    const s = new State();
    s.criteria = ['A', 'B'];
    s.matrix = [[0, 0], [0, 0]];
    s.cycleCell(0, 1);
    assertEqual(s.matrix[0][1], 0.5);
    assertEqual(s.matrix[1][0], 0.5);
    s.cycleCell(0, 1);
    assertEqual(s.matrix[0][1], 1);
    assertEqual(s.matrix[1][0], 0);
    s.cycleCell(0, 1);
    assertEqual(s.matrix[0][1], 0);
    assertEqual(s.matrix[1][0], 1);
  });
});

suite('Pairwise Comparison Model — persistence', () => {
  test('toJSON keys match legacy getState', () => {
    const s = new State();
    s.addCriterion('A'); s.addCriterion('B'); s.addCriterion('C');
    s.startComparison();
    const keys = Object.keys(s.toJSON()).sort();
    assertEqual(JSON.stringify(keys), JSON.stringify(['criteria', 'currentPair', 'matrix', 'pairs', 'viewPhase']));
  });
  test('fromJSON(null) returns default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.criteria.length, 0);
    assertEqual(s.viewPhase, 'input');
  });
  test('fromJSON(undefined) returns default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.viewPhase, 'input');
  });
  test('fromJSON restores example shape', () => {
    const data = { criteria: ['X', 'Y', 'Z'], matrix: [], pairs: [], currentPair: 0, viewPhase: 'input' };
    const s = State.fromJSON(data);
    assertEqual(s.criteria.length, 3);
    assertEqual(s.criteria[1], 'Y');
    assertEqual(s.hasContent(), true);
  });
  test('toJSON -> fromJSON round-trip', () => {
    const s = new State();
    s.addCriterion('A'); s.addCriterion('B'); s.addCriterion('C');
    s.startComparison();
    s.choose(s.pairs[0][0], s.pairs[0][1]);
    const j = s.toJSON();
    const s2 = State.fromJSON(j);
    assertEqual(JSON.stringify(s2.toJSON()), JSON.stringify(j));
  });
  test('fromJSON sanitizes invalid viewPhase', () => {
    const s = State.fromJSON({ viewPhase: 'bogus' });
    assertEqual(s.viewPhase, 'input');
  });
  test('fromJSON filters non-string criteria', () => {
    const s = State.fromJSON({ criteria: ['A', 5, null, 'B'] });
    assertEqual(JSON.stringify(s.criteria), JSON.stringify(['A', 'B']));
  });
});
