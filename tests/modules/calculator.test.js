/**
 * Unit tests for the Calculator module Model (calculator-model.js).
 * Covers State persistence + pure business logic: expression evaluation,
 * descriptive statistics, Six Sigma metrics, dataset management, input editing.
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import {
  State, evalExpression, factorial,
} from '../../js/modules/calculator/calculator-model.js';

// ── State: persistence ──────────────────────────────────────────

suite('Calculator Model — State defaults', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.mode, 'sci');
    assertEqual(s.expression, '');
    assertEqual(s.lastResult, null);
    assertEqual(s.memory, 0);
    assertEqual(s.angleMode, 'DEG');
    assertEqual(Array.isArray(s.dataset), true);
    assertEqual(s.dataset.length, 0);
    assertEqual(Array.isArray(s.ssDataset), true);
    assertEqual(s.ssDataset.length, 0);
    assertEqual(s.lsl, '');
    assertEqual(s.usl, '');
  });

  test('toJSON returns expected shape', () => {
    const s = new State();
    s.mode = 'stats';
    s.expression = '4+';
    s.lastResult = 8;
    s.memory = 42;
    s.angleMode = 'RAD';
    s.dataset = [1, 2, 3];
    s.ssDataset = [4, 5];
    s.lsl = '2';
    s.usl = '10';
    const j = s.toJSON();
    assertEqual(j.mode, 'stats');
    assertEqual(j.expression, '4+');
    assertEqual(j.lastResult, 8);
    assertEqual(j.memory, 42);
    assertEqual(j.angleMode, 'RAD');
    assertEqual(j.dataset.length, 3);
    assertEqual(j.ssDataset.length, 2);
    assertEqual(j.lsl, '2');
    assertEqual(j.usl, '10');
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s instanceof State, true);
    assertEqual(s.mode, 'sci');
    assertEqual(s.dataset.length, 0);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s instanceof State, true);
    assertEqual(s.angleMode, 'DEG');
  });

  test('fromJSON restores all fields', () => {
    const s = State.fromJSON({
      mode: 'sixsigma', expression: 'x', lastResult: 7, memory: 3,
      angleMode: 'RAD', dataset: [1, 2], ssDataset: [3], lsl: '0', usl: '9',
    });
    assertEqual(s.mode, 'sixsigma');
    assertEqual(s.expression, 'x');
    assertEqual(s.lastResult, 7);
    assertEqual(s.memory, 3);
    assertEqual(s.angleMode, 'RAD');
    assertEqual(s.dataset.length, 2);
    assertEqual(s.ssDataset.length, 1);
    assertEqual(s.lsl, '0');
    assertEqual(s.usl, '9');
  });

  test('fromJSON sanitizes invalid mode/angleMode', () => {
    const s = State.fromJSON({ mode: 'bogus', angleMode: 'GON' });
    assertEqual(s.mode, 'sci');
    assertEqual(s.angleMode, 'DEG');
  });

  test('fromJSON sanitizes non-array datasets', () => {
    const s = State.fromJSON({ dataset: 'nope', ssDataset: 5 });
    assertEqual(Array.isArray(s.dataset), true);
    assertEqual(s.dataset.length, 0);
    assertEqual(Array.isArray(s.ssDataset), true);
    assertEqual(s.ssDataset.length, 0);
  });

  test('fromJSON coerces lsl/usl to strings', () => {
    const s = State.fromJSON({ lsl: 2, usl: 10 });
    assertEqual(s.lsl, '2');
    assertEqual(s.usl, '10');
  });

  test('toJSON -> fromJSON round-trip is lossless', () => {
    const s = new State();
    s.mode = 'stats';
    s.expression = '12+34';
    s.lastResult = 46;
    s.memory = 99;
    s.angleMode = 'RAD';
    s.dataset = [10, 20, 30];
    s.ssDataset = [8, 10, 12];
    s.lsl = '4';
    s.usl = '16';
    const r = State.fromJSON(s.toJSON());
    assertEqual(r.mode, 'stats');
    assertEqual(r.expression, '12+34');
    assertEqual(r.lastResult, 46);
    assertEqual(r.memory, 99);
    assertEqual(r.angleMode, 'RAD');
    assertEqual(r.dataset.join(','), '10,20,30');
    assertEqual(r.ssDataset.join(','), '8,10,12');
    assertEqual(r.lsl, '4');
    assertEqual(r.usl, '16');
  });
});

suite('Calculator Model — hasContent', () => {
  test('fresh state has no content', () => {
    assertEqual(new State().hasContent(), false);
  });
  test('content when dataset has values', () => {
    const s = new State();
    s.dataset = [1];
    assertEqual(s.hasContent(), true);
  });
  test('content when ssDataset has values', () => {
    const s = new State();
    s.ssDataset = [1];
    assertEqual(s.hasContent(), true);
  });
  test('content when expression set', () => {
    const s = new State();
    s.expression = '5';
    assertEqual(s.hasContent(), true);
  });
  test('content when memory set', () => {
    const s = new State();
    s.memory = 7;
    assertEqual(s.hasContent(), true);
  });
});

// ── Expression evaluation ───────────────────────────────────────

suite('Calculator Model — evalExpression', () => {
  test('basic arithmetic', () => {
    assertEqual(evalExpression('12+34', 'DEG'), 46);
  });
  test('operator precedence', () => {
    assertEqual(evalExpression('2+3*4', 'DEG'), 14);
  });
  test('handles × and ÷ symbols', () => {
    assertEqual(evalExpression('6×7', 'DEG'), 42);
    assertEqual(evalExpression('8÷2', 'DEG'), 4);
  });
  test('power operator ^', () => {
    assertEqual(evalExpression('2^3', 'DEG'), 8);
  });
  test('decimals and signs', () => {
    assertEqual(evalExpression('0-1.5*2', 'DEG'), -3);
  });
  test('division by zero yields Infinity (not error)', () => {
    assertEqual(evalExpression('1/0', 'DEG'), Infinity);
  });
  test('pi and e constants', () => {
    assertAlmostEqual(evalExpression('(π+e)', 'DEG'), Math.PI + Math.E, 1e-9);
  });
  test('trig in DEG mode', () => {
    assertAlmostEqual(evalExpression('sin(90)', 'DEG'), 1, 1e-9);
    assertAlmostEqual(evalExpression('cos(0)', 'DEG'), 1, 1e-9);
    assertAlmostEqual(evalExpression('tan(45)', 'DEG'), 1, 1e-9);
  });
  test('trig in RAD mode', () => {
    assertAlmostEqual(evalExpression('sin(π/2)', 'RAD'), 1, 1e-9);
    assertAlmostEqual(evalExpression('cos(π)', 'RAD'), -1, 1e-9);
    assertAlmostEqual(evalExpression('tan(0)', 'RAD'), 0, 1e-9);
  });
  test('inverse trig in DEG mode', () => {
    assertAlmostEqual(evalExpression('asin(1)', 'DEG'), 90, 1e-9);
    assertAlmostEqual(evalExpression('acos(1)', 'DEG'), 0, 1e-9);
    assertAlmostEqual(evalExpression('atan(1)', 'DEG'), 45, 1e-9);
  });
  test('log, ln, sqrt, cbrt, exp', () => {
    assertAlmostEqual(evalExpression('log(100)', 'DEG'), 2, 1e-9);
    assertAlmostEqual(evalExpression('ln(e)', 'DEG'), 1, 1e-9);
    assertAlmostEqual(evalExpression('sqrt(16)', 'DEG'), 4, 1e-9);
    assertAlmostEqual(evalExpression('cbrt(27)', 'DEG'), 3, 1e-9);
    assertAlmostEqual(evalExpression('exp(1)', 'DEG'), Math.E, 1e-9);
  });
  test('factorial function', () => {
    assertEqual(evalExpression('fact(5)', 'DEG'), 120);
  });
  test('invalid expression throws', () => {
    let threw = false;
    try { evalExpression('sin(90)))', 'DEG'); } catch { threw = true; }
    assertEqual(threw, true);
  });
});

suite('Calculator Model — factorial', () => {
  test('0! and 1! = 1', () => {
    assertEqual(factorial(0), 1);
    assertEqual(factorial(1), 1);
  });
  test('5! = 120', () => {
    assertEqual(factorial(5), 120);
  });
  test('negative is NaN', () => {
    assertEqual(Number.isNaN(factorial(-1)), true);
  });
  test('>170 is Infinity', () => {
    assertEqual(factorial(171), Infinity);
  });
});

// ── Statistics ──────────────────────────────────────────────────

suite('Calculator Model — calcStat', () => {
  const ds = [10, 20, 30, 40, 50];
  function run(type, data = ds) {
    const s = new State();
    s.dataset = [...data];
    return s.calcStat(type);
  }

  test('mean', () => { assertAlmostEqual(run('mean').value, 30, 1e-9); });
  test('median', () => { assertAlmostEqual(run('median').value, 30, 1e-9); });
  test('range', () => { assertAlmostEqual(run('range').value, 40, 1e-9); });
  test('stdS (sample)', () => { assertAlmostEqual(run('stdS').value, 15.811388, 1e-5); });
  test('stdP (population)', () => { assertAlmostEqual(run('stdP').value, 14.142136, 1e-5); });
  test('varS', () => { assertAlmostEqual(run('varS').value, 250, 1e-6); });
  test('varP', () => { assertAlmostEqual(run('varP').value, 200, 1e-6); });
  test('sum', () => { assertAlmostEqual(run('sum').value, 150, 1e-9); });
  test('min', () => { assertEqual(run('min').value, 10); });
  test('max', () => { assertEqual(run('max').value, 50); });
  test('count', () => { assertEqual(run('count').value, 5); });
  test('q1', () => { assertAlmostEqual(run('q1').value, 20, 1e-9); });
  test('q3', () => { assertAlmostEqual(run('q3').value, 40, 1e-9); });
  test('iqr', () => { assertAlmostEqual(run('iqr').value, 20, 1e-9); });
  test('skew', () => { assertAlmostEqual(run('skew').value, 0, 1e-6); });

  test('empty dataset returns noData error (hard error — no soft flag)', () => {
    const r = run('mean', []);
    assertEqual(r.error, 'noData');
    assertEqual(r.soft, undefined);
  });
  test('stdS needs n>=2 — soft plain-text message with symbol', () => {
    const r = run('stdS', [5]);
    assertEqual(r.error, 'needN2');
    assertEqual(r.soft, true);
    assertEqual(r.symbol, 's');
  });
  test('varS needs n>=2 — soft plain-text message with symbol', () => {
    const r = run('varS', [5]);
    assertEqual(r.error, 'needN2');
    assertEqual(r.soft, true);
    assertEqual(r.symbol, 's²');
  });
  test('skew needs n>=3 — soft plain-text message with labelKey', () => {
    const r = run('skew', [1, 2]);
    assertEqual(r.error, 'needN3');
    assertEqual(r.soft, true);
    assertEqual(r.labelKey, 'statSkewness');
  });
  test('mode with no single mode — soft plain-text message with labelKey', () => {
    const r = run('mode', [1, 2, 3]);
    assertEqual(r.error, 'noMode');
    assertEqual(r.soft, true);
    assertEqual(r.labelKey, 'statMode');
  });
  test('mode returns joined modes string', () => {
    const r = run('mode', [1, 1, 2, 2]);
    assertEqual(r.text, '1, 2');
  });
});

// ── Six Sigma ───────────────────────────────────────────────────

suite('Calculator Model — calcSS', () => {
  function run(type, data = [8, 10, 12], lsl = '4', usl = '16') {
    const s = new State();
    s.ssDataset = [...data];
    s.lsl = lsl;
    s.usl = usl;
    return s.calcSS(type);
  }

  test('mean', () => { assertAlmostEqual(run('mean').value, 10, 1e-9); });
  test('std', () => { assertAlmostEqual(run('std').value, 2, 1e-9); });
  test('cp', () => { assertAlmostEqual(run('cp').value, 1, 1e-6); });
  test('cpk', () => { assertAlmostEqual(run('cpk').value, 1, 1e-6); });
  test('pp', () => { assertAlmostEqual(run('pp').value, 1.2247449, 1e-6); });
  test('ppk', () => { assertAlmostEqual(run('ppk').value, 1.2247449, 1e-6); });
  test('sigma', () => { assertAlmostEqual(run('sigma').value, 3, 1e-6); });
  test('dpmo', () => { assertAlmostEqual(run('dpmo').value, 2700, 50); });
  test('ucl', () => { assertAlmostEqual(run('ucl').value, 16, 1e-6); });
  test('lcl', () => { assertAlmostEqual(run('lcl').value, 4, 1e-6); });
  test('zscore', () => { assertAlmostEqual(run('zscore').value, 2.7821583, 1e-4); });
  test('yield returns percent text', () => {
    const r = run('yield');
    assertEqual(typeof r.text, 'string');
    assertEqual(r.text.includes('99.73'), true);
  });

  test('cp without data+limits errors', () => {
    const r = run('cp', [], '4', '16');
    assertEqual(r.error, 'needDataAndLimits');
  });
  test('std with n<2 errors', () => {
    const r = run('std', [10], '4', '16');
    assertEqual(r.error, 'needN2');
  });
  test('mean with no data errors', () => {
    const r = run('mean', [], '', '');
    assertEqual(r.error, 'needData');
  });
});

// ── Input editing & dataset management ──────────────────────────

suite('Calculator Model — input editing', () => {
  test('inputText appends to expression', () => {
    const s = new State();
    s.inputText('5');
    s.inputText('+');
    assertEqual(s.expression, '5+');
  });
  test('inputText after result clears on digit', () => {
    const s = new State();
    s.expression = '';
    s.lastResult = 46;
    s.inputText('7');
    assertEqual(s.expression, '7');
    assertEqual(s.lastResult, null);
  });
  test('inputText after result continues on operator', () => {
    const s = new State();
    s.lastResult = 46;
    s.inputText('×');
    assertEqual(s.expression, '46×');
    assertEqual(s.lastResult, null);
  });
  test('inputFn after result clears', () => {
    const s = new State();
    s.lastResult = 5;
    s.inputFn('sin(');
    assertEqual(s.expression, 'sin(');
    assertEqual(s.lastResult, null);
  });
  test('backspace removes last char', () => {
    const s = new State();
    s.expression = '12345';
    s.backspace();
    assertEqual(s.expression, '1234');
  });
  test('clearAll resets expression and lastResult', () => {
    const s = new State();
    s.expression = '99';
    s.lastResult = 12;
    s.clearAll();
    assertEqual(s.expression, '');
    assertEqual(s.lastResult, null);
  });
  test('toggleAngle flips DEG/RAD', () => {
    const s = new State();
    assertEqual(s.angleMode, 'DEG');
    s.toggleAngle();
    assertEqual(s.angleMode, 'RAD');
    s.toggleAngle();
    assertEqual(s.angleMode, 'DEG');
  });
  test('memStore from lastResult', () => {
    const s = new State();
    s.lastResult = 42;
    s.memStore();
    assertEqual(s.memory, 42);
  });
  test('memStore from expression', () => {
    const s = new State();
    s.expression = '6*7';
    s.memStore();
    assertEqual(s.memory, 42);
  });
  test('memStore from invalid expression sets 0', () => {
    const s = new State();
    s.expression = 'sin(';
    s.memStore();
    assertEqual(s.memory, 0);
  });
  test('switchMode sets mode and clears', () => {
    const s = new State();
    s.expression = '99';
    s.lastResult = 5;
    s.switchMode('stats');
    assertEqual(s.mode, 'stats');
    assertEqual(s.expression, '');
    assertEqual(s.lastResult, null);
  });
});

suite('Calculator Model — dataset management', () => {
  test('addDataPoint parses and pushes', () => {
    const s = new State();
    s.expression = '10';
    const v = s.addDataPoint();
    assertEqual(v, 10);
    assertEqual(s.dataset.join(','), '10');
    assertEqual(s.expression, '');
  });
  test('addDataPoint ignores invalid', () => {
    const s = new State();
    s.expression = 'abc';
    const v = s.addDataPoint();
    assertEqual(v, null);
    assertEqual(s.dataset.length, 0);
  });
  test('removeLastData pops', () => {
    const s = new State();
    s.dataset = [1, 2, 3];
    s.removeLastData();
    assertEqual(s.dataset.join(','), '1,2');
  });
  test('clearData empties dataset', () => {
    const s = new State();
    s.dataset = [1, 2];
    s.clearData();
    assertEqual(s.dataset.length, 0);
  });
  test('addSSDataPoint parses and pushes', () => {
    const s = new State();
    s.expression = '99';
    const v = s.addSSDataPoint();
    assertEqual(v, 99);
    assertEqual(s.ssDataset.join(','), '99');
    assertEqual(s.expression, '');
  });
  test('removeLastSSData pops', () => {
    const s = new State();
    s.ssDataset = [8, 10];
    s.removeLastSSData();
    assertEqual(s.ssDataset.join(','), '8');
  });
  test('clearSSData empties ssDataset', () => {
    const s = new State();
    s.ssDataset = [1, 2];
    s.clearSSData();
    assertEqual(s.ssDataset.length, 0);
  });
});
