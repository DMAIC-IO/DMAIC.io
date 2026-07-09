import { suite, test, assertEqual } from '../test-utils.js';
import {
  Factor,
  State,
  buildTerms,
  termLabel,
} from '../../js/modules/model-data-generator/model-data-generator-model.js';

suite('Model Data Generator — buildTerms', () => {
  test('3 factors, maxOrder 3 → 7 terms', () => {
    assertEqual(buildTerms(3, 3).length, 7);
  });

  test('2 factors → 3 terms (2 main + 1 interaction)', () => {
    assertEqual(buildTerms(2, 3).length, 3);
  });

  test('1 factor → 1 term', () => {
    assertEqual(buildTerms(1, 3).length, 1);
  });

  test('maxOrder clamped to factor count', () => {
    // 2 factors cannot have a 3-way term
    const terms = buildTerms(2, 3);
    assertEqual(terms.every(t => t.length <= 2), true);
  });

  test('contains exactly 3 main-effect (single-index) terms for 3 factors', () => {
    const terms = buildTerms(3, 3);
    const mains = terms.filter(t => t.length === 1).map(t => t[0]);
    assertEqual(mains.length, 3);
    assertEqual(mains.includes(0), true);
    assertEqual(mains.includes(1), true);
    assertEqual(mains.includes(2), true);
  });
});

suite('Model Data Generator — termLabel', () => {
  const factors = [
    new Factor('A', 0, 1),
    new Factor('B', 0, 1),
    new Factor('C', 0, 1),
  ];

  test('single index → factor name', () => {
    assertEqual(termLabel([0], factors), 'A');
  });

  test('multi index → joined with × (\\u00d7)', () => {
    assertEqual(termLabel([0, 1], factors), 'A × B');
  });

  test('falls back to X{n+1} when factor missing', () => {
    assertEqual(termLabel([5], factors), 'X6');
  });
});

suite('Model Data Generator — Factor', () => {
  test('constructor sets values', () => {
    const f = new Factor('Temp', 150, 250);
    assertEqual(f.name, 'Temp');
    assertEqual(f.min, 150);
    assertEqual(f.max, 250);
  });

  test('toJSON returns name/min/max', () => {
    const json = new Factor('X', 1, 9).toJSON();
    assertEqual(json.name, 'X');
    assertEqual(json.min, 1);
    assertEqual(json.max, 9);
  });

  test('fromJSON restores valid data', () => {
    const f = Factor.fromJSON({ name: 'Y', min: 2, max: 8 });
    assertEqual(f.name, 'Y');
    assertEqual(f.min, 2);
    assertEqual(f.max, 8);
  });

  test('fromJSON sanitises name to string', () => {
    assertEqual(Factor.fromJSON({ name: 42, min: 0, max: 1 }).name, '');
  });

  test('fromJSON sanitises non-numeric min/max to 0', () => {
    const f = Factor.fromJSON({ name: 'A', min: 'x', max: null });
    assertEqual(f.min, 0);
    assertEqual(f.max, 0);
  });

  test('fromJSON null → default factor', () => {
    const f = Factor.fromJSON(null);
    assertEqual(f.name, '');
    assertEqual(f.min, 0);
    assertEqual(f.max, 0);
  });
});

suite('Model Data Generator — State defaults', () => {
  test('three default factors with names', () => {
    const s = new State();
    assertEqual(s.factors.length, 3);
    assertEqual(s.factors[0].name, 'Temperatur');
    assertEqual(s.factors[1].name, 'Druck');
    assertEqual(s.factors[2].name, 'Zeit');
  });

  test('default factor ranges', () => {
    const s = new State();
    assertEqual(s.factors[0].min, 150);
    assertEqual(s.factors[0].max, 250);
    assertEqual(s.factors[1].min, 1);
    assertEqual(s.factors[1].max, 10);
    assertEqual(s.factors[2].min, 5);
    assertEqual(s.factors[2].max, 60);
  });

  test('default scalars', () => {
    const s = new State();
    assertEqual(s.maxOrder, 3);
    assertEqual(s.intercept, 50);
    assertEqual(s.yName, 'Y');
    assertEqual(s.samplingMethod, 'random');
    assertEqual(s.sampleSize, 100);
    assertEqual(s.noiseStd, 2);
    assertEqual(s.seed, 42);
  });

  test('terms built from defaults → 7 terms all beta 0', () => {
    const s = new State();
    assertEqual(s.terms.length, 7);
    assertEqual(s.terms.every(t => t.beta === 0), true);
  });
});

suite('Model Data Generator — State.rebuildTerms', () => {
  test('rebuild after adding a factor grows term count and resets betas', () => {
    const s = new State();
    s.terms[0].beta = 5;
    s.factors.push(new Factor('Faktor_4', 0, 100));
    s.rebuildTerms();
    // 4 factors, maxOrder 3 → C(4,1)+C(4,2)+C(4,3) = 4+6+4 = 14
    assertEqual(s.terms.length, 14);
    assertEqual(s.terms.every(t => t.beta === 0), true);
  });

  test('rebuild after removing a factor shrinks term count', () => {
    const s = new State();
    s.factors.splice(2, 1); // remove Zeit → 2 factors
    s.rebuildTerms();
    assertEqual(s.terms.length, 3);
  });
});

suite('Model Data Generator — State.generate', () => {
  test('random produces rows of requested size with factor + Y keys', () => {
    const s = new State();
    s.sampleSize = 50;
    const rows = s.generate();
    assertEqual(rows.length, 50);
    const keys = Object.keys(rows[0]);
    assertEqual(keys.includes('Temperatur'), true);
    assertEqual(keys.includes('Druck'), true);
    assertEqual(keys.includes('Zeit'), true);
    assertEqual(keys.includes('Y'), true);
  });

  test('sample size clamped to minimum 10', () => {
    const s = new State();
    s.sampleSize = 1;
    assertEqual(s.generate().length, 10);
  });

  test('same seed → deterministic output', () => {
    const a = new State(); a.seed = 123; a.noiseStd = 5;
    const b = new State(); b.seed = 123; b.noiseStd = 5;
    assertEqual(a.generate()[0].Y, b.generate()[0].Y);
  });

  test('zero noise makes Y deterministic from intercept (all betas 0)', () => {
    const s = new State();
    s.noiseStd = 0;
    s.intercept = 50;
    const rows = s.generate();
    assertEqual(rows.every(r => r.Y === 50), true);
  });

  test('lhs sampling produces requested size', () => {
    const s = new State();
    s.samplingMethod = 'lhs';
    s.sampleSize = 40;
    assertEqual(s.generate().length, 40);
  });

  test('fullfactorial sampling produces rows', () => {
    const s = new State();
    s.samplingMethod = 'fullfactorial';
    assertEqual(s.generate().length > 0, true);
  });

  test('custom Y name appears as row key', () => {
    const s = new State();
    s.yName = 'Output';
    assertEqual(Object.keys(s.generate()[0]).includes('Output'), true);
  });
});

suite('Model Data Generator — State.hasContent', () => {
  test('pristine default state has no content', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('non-zero beta counts as content', () => {
    const s = new State();
    s.terms[0].beta = 2;
    assertEqual(s.hasContent(), true);
  });

  test('changed intercept counts as content', () => {
    const s = new State();
    s.intercept = 100;
    assertEqual(s.hasContent(), true);
  });

  test('changed Y name counts as content', () => {
    const s = new State();
    s.yName = 'Response';
    assertEqual(s.hasContent(), true);
  });

  test('changed factor counts as content', () => {
    const s = new State();
    s.factors[0].name = 'Pressure';
    assertEqual(s.hasContent(), true);
  });
});

suite('Model Data Generator — State serialisation', () => {
  test('toJSON returns expected shape', () => {
    const s = new State();
    s.terms[0].beta = 3;
    s.terms[3].beta = -2;
    const json = s.toJSON();
    assertEqual(json.factors.length, 3);
    assertEqual(json.factors[0].name, 'Temperatur');
    assertEqual(json.intercept, 50);
    assertEqual(json.yName, 'Y');
    assertEqual(json.samplingMethod, 'random');
    assertEqual(json.betas['0'], 3);
    assertEqual(json.betas['3'], -2);
  });

  test('toJSON omits zero betas', () => {
    const json = new State().toJSON();
    assertEqual(Object.keys(json.betas).length, 0);
  });

  test('fromJSON null → default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.factors.length, 3);
    assertEqual(s.intercept, 50);
  });

  test('fromJSON undefined → default state', () => {
    assertEqual(State.fromJSON(undefined).factors.length, 3);
  });

  test('round-trip preserves factors, scalars and betas', () => {
    const original = new State();
    original.factors = [new Factor('A', 0, 10), new Factor('B', -5, 5)];
    original.intercept = 200;
    original.yName = 'Resp';
    original.samplingMethod = 'lhs';
    original.sampleSize = 250;
    original.noiseStd = 7;
    original.seed = 99;
    original.rebuildTerms();
    original.terms[0].beta = 4;
    original.terms[2].beta = -1.5; // interaction A×B

    const restored = State.fromJSON(original.toJSON());
    assertEqual(restored.factors.length, 2);
    assertEqual(restored.factors[0].name, 'A');
    assertEqual(restored.factors[1].min, -5);
    assertEqual(restored.intercept, 200);
    assertEqual(restored.yName, 'Resp');
    assertEqual(restored.samplingMethod, 'lhs');
    assertEqual(restored.sampleSize, 250);
    assertEqual(restored.noiseStd, 7);
    assertEqual(restored.seed, 99);
    assertEqual(restored.terms.length, 3);
    assertEqual(restored.terms[0].beta, 4);
    assertEqual(restored.terms[2].beta, -1.5);
  });

  test('fromJSON sanitises invalid scalars to defaults', () => {
    const s = State.fromJSON({ intercept: 'x', sampleSize: 'y', seed: null });
    assertEqual(s.intercept, 0);
    assertEqual(s.sampleSize, 100);
    assertEqual(s.seed, 42);
  });
});
