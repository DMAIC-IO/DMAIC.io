import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { State } from '../../js/modules/sample-size/sample-size-model.js';

// ─── Constructor defaults ────────────────────────────────────────────────────

suite('Sample Size Model — constructor defaults', () => {
  test('category defaults to variance', () => {
    assertEqual(new State().category, 'variance');
  });

  test('testType defaults to one', () => {
    assertEqual(new State().testType, 'one');
  });

  test('direction defaults to two-sided', () => {
    assertEqual(new State().direction, 'two-sided');
  });

  test('alpha defaults to null', () => {
    assertEqual(new State().alpha, null);
  });

  test('power defaults to null', () => {
    assertEqual(new State().power, null);
  });

  test('sigma0 defaults to empty string', () => {
    assertEqual(new State().sigma0, '');
  });

  test('sigmaAlt defaults to empty string', () => {
    assertEqual(new State().sigmaAlt, '');
  });

  test('ratio defaults to empty string', () => {
    assertEqual(new State().ratio, '');
  });

  test('delta defaults to empty string', () => {
    assertEqual(new State().delta, '');
  });

  test('sigma defaults to empty string', () => {
    assertEqual(new State().sigma, '');
  });
});

// ─── toJSON ──────────────────────────────────────────────────────────────────

suite('Sample Size Model — toJSON', () => {
  test('toJSON returns expected shape with defaults', () => {
    const j = new State().toJSON();
    assertEqual(j.category, 'variance');
    assertEqual(j.testType, 'one');
    assertEqual(j.direction, 'two-sided');
    assertEqual(j.alpha, null);
    assertEqual(j.power, null);
    assertEqual(j.sigma0, '');
    assertEqual(j.sigmaAlt, '');
    assertEqual(j.ratio, '');
    assertEqual(j.delta, '');
    assertEqual(j.sigma, '');
  });

  test('toJSON serializes all fields', () => {
    const s = new State();
    s.category = 'mean';
    s.testType = 'two';
    s.direction = 'greater';
    s.alpha = 0.05;
    s.power = 0.8;
    s.sigma0 = '1.5';
    s.sigmaAlt = '2.0';
    s.ratio = '3';
    s.delta = '0.5';
    s.sigma = '1.2';
    const j = s.toJSON();
    assertEqual(j.category, 'mean');
    assertEqual(j.testType, 'two');
    assertEqual(j.direction, 'greater');
    assertEqual(j.alpha, 0.05);
    assertEqual(j.power, 0.8);
    assertEqual(j.sigma0, '1.5');
    assertEqual(j.sigmaAlt, '2.0');
    assertEqual(j.ratio, '3');
    assertEqual(j.delta, '0.5');
    assertEqual(j.sigma, '1.2');
  });

  test('toJSON has exactly the legacy getState() keys', () => {
    const j = new State().toJSON();
    const keys = Object.keys(j).sort();
    assertEqual(JSON.stringify(keys), JSON.stringify([
      'alpha', 'category', 'delta', 'direction', 'power', 'ratio',
      'sigma', 'sigma0', 'sigmaAlt', 'testType'
    ]));
  });
});

// ─── fromJSON ────────────────────────────────────────────────────────────────

suite('Sample Size Model — fromJSON robustness', () => {
  test('fromJSON(null) returns valid default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.category, 'variance');
    assertEqual(s.testType, 'one');
    assertEqual(s.direction, 'two-sided');
    assertEqual(s.alpha, null);
    assertEqual(s.power, null);
    assertEqual(s.sigma0, '');
  });

  test('fromJSON(undefined) returns valid default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.category, 'variance');
    assertEqual(s.sigma, '');
  });

  test('fromJSON restores all fields', () => {
    const s = State.fromJSON({
      category: 'mean',
      testType: 'two',
      direction: 'less',
      alpha: 0.1,
      power: 0.9,
      sigma0: '1.5',
      sigmaAlt: '2.0',
      ratio: '3',
      delta: '0.5',
      sigma: '1.2',
    });
    assertEqual(s.category, 'mean');
    assertEqual(s.testType, 'two');
    assertEqual(s.direction, 'less');
    assertAlmostEqual(s.alpha, 0.1, 1e-9);
    assertAlmostEqual(s.power, 0.9, 1e-9);
    assertEqual(s.sigma0, '1.5');
    assertEqual(s.sigmaAlt, '2.0');
    assertEqual(s.ratio, '3');
    assertEqual(s.delta, '0.5');
    assertEqual(s.sigma, '1.2');
  });

  test('fromJSON sanitizes invalid category to variance', () => {
    const s = State.fromJSON({ category: 'invalid' });
    assertEqual(s.category, 'variance');
  });

  test('fromJSON sanitizes invalid testType to one', () => {
    const s = State.fromJSON({ testType: 'three' });
    assertEqual(s.testType, 'one');
  });

  test('fromJSON sanitizes invalid direction to two-sided', () => {
    const s = State.fromJSON({ direction: 'sideways' });
    assertEqual(s.direction, 'two-sided');
  });

  test('fromJSON keeps null alpha', () => {
    const s = State.fromJSON({ alpha: null });
    assertEqual(s.alpha, null);
  });

  test('fromJSON keeps null power', () => {
    const s = State.fromJSON({ power: null });
    assertEqual(s.power, null);
  });

  test('fromJSON coerces non-string sigma0 to string', () => {
    const s = State.fromJSON({ sigma0: 1.5 });
    assertEqual(s.sigma0, '1.5');
  });

  test('fromJSON keeps empty string inputs', () => {
    const s = State.fromJSON({ sigma0: '', sigmaAlt: '', ratio: '', delta: '', sigma: '' });
    assertEqual(s.sigma0, '');
    assertEqual(s.sigmaAlt, '');
    assertEqual(s.ratio, '');
    assertEqual(s.delta, '');
    assertEqual(s.sigma, '');
  });

  test('fromJSON handles missing optional fields', () => {
    const s = State.fromJSON({});
    assertEqual(s.category, 'variance');
    assertEqual(s.testType, 'one');
    assertEqual(s.alpha, null);
  });
});

// ─── round-trip ──────────────────────────────────────────────────────────────

suite('Sample Size Model — round-trip', () => {
  test('toJSON → fromJSON is lossless for full state', () => {
    const s = new State();
    s.category = 'mean';
    s.testType = 'two';
    s.direction = 'greater';
    s.alpha = 0.05;
    s.power = 0.8;
    s.sigma0 = '1.5';
    s.sigmaAlt = '2.0';
    s.ratio = '3';
    s.delta = '0.5';
    s.sigma = '1.2';
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(s2.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('toJSON → fromJSON preserves null alpha/power', () => {
    const s = new State();
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.alpha, null);
    assertEqual(s2.power, null);
  });

  test('matches legacy getState() shape from example file', () => {
    const legacyState = {
      category: 'variance',
      testType: 'one',
      direction: 'less',
      alpha: 0.05,
      power: 0.8,
      sigma0: '1.5',
      sigmaAlt: '1.0',
      ratio: '',
      delta: '',
      sigma: '',
    };
    const s = State.fromJSON(legacyState);
    assertEqual(JSON.stringify(s.toJSON()), JSON.stringify(legacyState));
  });
});

// ─── hasContent ──────────────────────────────────────────────────────────────

suite('Sample Size Model — hasContent', () => {
  test('empty state has no content', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('sigma0 set means content', () => {
    const s = new State();
    s.sigma0 = '1.5';
    assertEqual(s.hasContent(), true);
  });

  test('sigmaAlt set means content', () => {
    const s = new State();
    s.sigmaAlt = '2.0';
    assertEqual(s.hasContent(), true);
  });

  test('ratio set means content', () => {
    const s = new State();
    s.ratio = '3';
    assertEqual(s.hasContent(), true);
  });

  test('delta set means content', () => {
    const s = new State();
    s.delta = '0.5';
    assertEqual(s.hasContent(), true);
  });

  test('sigma set means content', () => {
    const s = new State();
    s.sigma = '1.2';
    assertEqual(s.hasContent(), true);
  });

  test('only changing category/direction/alpha/power does not make content', () => {
    const s = new State();
    s.category = 'mean';
    s.direction = 'greater';
    s.alpha = 0.05;
    s.power = 0.8;
    assertEqual(s.hasContent(), false);
  });
});
