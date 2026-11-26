/**
 * Tests for modules/calculator/domain/model.js — Schema und Vorgaben,
 * gespeicherter Stand '1.0', jedes Kommando samt Ablehnung, `switchMode` ohne
 * Änderung beim aktiven Bereich, nicht endliche Ergebnisse (angezeigt, als
 * `null` gemerkt), `hasContent`, Lesefläche und Agentenkatalog. Dazu die
 * Fälle der alten Model-Suite (Eingabe, Speicher, Datensätze).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/calculator/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { evaluateDerived } from '../../../js/core/derived.js';

setModelName(State, 'calculator');

const SCHEMA = { _schema: { name: 'calculator', version: '1.0' } };
const EMPTY = {
  ...SCHEMA, mode: 'sci', expression: '', lastResult: null, memory: 0, angleMode: 'DEG',
  dataset: [], ssDataset: [], lsl: null, usl: null,
};
const plain = (v) => JSON.parse(JSON.stringify(v));
const json = (v) => JSON.stringify(v);
/** @param {object} j @returns {any} */
const load = (j) => State.fromJSON(plain(j));
/** @returns {any} */
const fresh = () => new State();
/** @param {any} m @param {string} s */
function type(m, s) { for (const ch of s) m.inputText({ ch }); }

/** @param {() => any} fn @returns {any} */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** Erwartet eine Ablehnung mit `param`, Stand unverändert. */
function expectRejected(m, fn, param) {
  const before = json(m.toJSON());
  const err = thrown(fn);
  assertTrue(err instanceof Error, 'keine Ablehnung');
  assertEqual(err.param, param, err.message);
  assertEqual(json(m.toJSON()), before, 'Stand verändert');
  return err;
}

suite('calculator Model — Schema und Vorgaben', () => {
  test('neun Felder, kein Ansichtsfeld, alle Kommandos der Altform ohne Setter', () => {
    assertDeepEqual(Object.keys(State.schema.fields), [
      'mode', 'expression', 'lastResult', 'memory', 'angleMode', 'dataset', 'ssDataset', 'lsl', 'usl',
    ]);
    assertDeepEqual(Object.keys(State.schema.view), []);
    assertDeepEqual(Object.keys(State.schema.commands), [
      'inputText', 'inputFn', 'backspace', 'clear', 'memStore', 'memRecall', 'switchMode', 'calculate',
      'calcStat', 'calcSS', 'addData', 'addDataValue', 'removeLast', 'clearData',
      'addSSData', 'addSSDataValue', 'removeLastSS', 'clearSSData',
    ]);
  });
  test('Vorgaben wie die Altform (Grenzen null statt leer)', () => {
    assertEqual(json(fresh().toJSON()), json(EMPTY));
  });
  test('Ausdruck und letztes Ergebnis schreibt nur ein Kommando', () => {
    assertEqual(State.schema.fields.expression.agentWrite, false);
    assertEqual(State.schema.fields.lastResult.agentWrite, false);
  });
  test('gespeicherter Stand 1.0 lädt streng, Rundweg verlustfrei', () => {
    const j = { ...EMPTY, mode: 'stats', expression: '4+', lastResult: 8, memory: 42, angleMode: 'RAD', dataset: [1, 2, 3], ssDataset: [4, 5], lsl: 2, usl: 10 };
    assertEqual(json(load(j).toJSON()), json(j));
    assertTrue(thrown(() => load({ ...j, lsl: 'abc' })) instanceof Error);
  });
});

suite('calculator Model — Eingabe', () => {
  test('inputText hängt an und liefert die Zeile', () => {
    const m = fresh();
    assertEqual(m.inputText({ ch: '1' }), '1');
    type(m, '2+3');
    assertEqual(m.expression, '12+3');
  });
  test('nach einem Ergebnis: Ziffer beginnt neu, Operator rechnet weiter', () => {
    const m = fresh();
    type(m, '2+3');
    m.calculate({});
    m.inputText({ ch: '7' });
    assertEqual(m.expression, '7');
    assertEqual(m.lastResult, null);
    m.calculate({});
    m.inputText({ ch: '×' });
    assertEqual(m.expression, '7×');
  });
  test('inputFn nach einem Ergebnis beginnt neu', () => {
    const m = fresh();
    type(m, '4');
    m.calculate({});
    assertEqual(m.inputFn({ fn: 'sqrt(' }), 'sqrt(');
    assertEqual(m.lastResult, null);
  });
  test('Ablehnungen: Zeichen außerhalb der Tasten, Funktion ohne Klammer, fehlendes Argument', () => {
    const m = fresh();
    const e = expectRejected(m, () => m.inputText({ ch: 'a' }), 'ch');
    assertTrue(e.message.includes('allowed: digits'), e.message);
    expectRejected(m, () => m.inputText({ ch: 'Infinity' }), 'ch');
    expectRejected(m, () => m.inputFn({ fn: 'sqrt' }), 'fn');
    expectRejected(m, () => m.inputText({}), 'ch');
  });
  test('backspace und clear', () => {
    const m = fresh();
    type(m, '123');
    assertEqual(m.backspace({}), '12');
    m.calculate({});
    m.clear({});
    assertEqual(m.expression, '');
    assertEqual(m.lastResult, null);
  });
});

suite('calculator Model — Rechnen', () => {
  test('calculate merkt das Ergebnis und leert die Zeile', () => {
    const m = fresh();
    type(m, '12+3');
    assertDeepEqual(m.calculate({}), { value: 15, reason: null, expression: '12+3' });
    assertEqual(m.lastResult, 15);
    assertEqual(m.expression, '');
  });
  test('unrechenbar: Grund error, nichts ändert sich', () => {
    const m = fresh();
    type(m, '2+(');
    const before = json(m.toJSON());
    assertDeepEqual(m.calculate({}), { value: null, reason: 'error', expression: '2+(' });
    assertEqual(json(m.toJSON()), before);
  });
  test('1÷0: Unendlich im Ergebnis, gemerkt wird null', () => {
    const m = fresh();
    type(m, '1÷0');
    assertEqual(m.calculate({}).value, Infinity);
    assertEqual(m.lastResult, null);
    assertEqual(m.expression, '');
    assertEqual(m.memStore({}), 0);
  });
  test('Winkeleinheit wirkt', () => {
    const m = fresh();
    m.inputFn({ fn: 'sin(' });
    type(m, '90)');
    assertEqual(m.calculate({}).value, 1);
  });
});

suite('calculator Model — Speicher', () => {
  test('memStore aus dem letzten Ergebnis', () => {
    const m = fresh();
    type(m, '6×7');
    m.calculate({});
    assertEqual(m.memStore({}), 42);
  });
  test('memStore aus der Zeile, unrechenbar 0', () => {
    const m = fresh();
    type(m, '2+3');
    assertEqual(m.memStore({}), 5);
    m.clear({});
    type(m, '2+(');
    assertEqual(m.memStore({}), 0);
  });
  test('memRecall hängt den Speicher an, auch Exponentenform', () => {
    const m = load({ ...EMPTY, memory: 1e-7 });
    assertEqual(m.memRecall({}), '1e-7');
  });
});

suite('calculator Model — Bereich', () => {
  test('switchMode wechselt und leert', () => {
    const m = fresh();
    type(m, '5');
    assertEqual(m.switchMode({ m: 'stats' }), true);
    assertEqual(m.mode, 'stats');
    assertEqual(m.expression, '');
  });
  test('gleicher Bereich: keine Änderung', () => {
    const m = fresh();
    type(m, '5');
    const before = json(m.toJSON());
    assertEqual(m.switchMode({ m: 'sci' }), false);
    assertEqual(json(m.toJSON()), before);
  });
  test('Ablehnung', () => {
    const m = fresh();
    const e = expectRejected(m, () => m.switchMode({ m: 'turbo' }), 'm');
    assertTrue(e.message.includes('allowed: sci, stats, sixsigma'), e.message);
  });
});

suite('calculator Model — Datensätze', () => {
  test('addData liest den Zahlanfang, leert die Zeile', () => {
    const m = fresh();
    type(m, '12.5+3');
    assertEqual(m.addData({}), 12.5);
    assertDeepEqual(plain(m.dataset), [12.5]);
    assertEqual(m.expression, '');
  });
  test('addData ohne Zahl ändert nichts', () => {
    const m = fresh();
    type(m, '(3');
    const before = json(m.toJSON());
    assertEqual(m.addData({}), null);
    assertEqual(json(m.toJSON()), before);
  });
  test('addDataValue, removeLast, clearData', () => {
    const m = fresh();
    assertEqual(m.addDataValue({ value: 4 }), 4);
    m.addDataValue({ value: 6 });
    m.removeLast({});
    assertDeepEqual(plain(m.dataset), [4]);
    type(m, '9');
    m.clearData({});
    assertDeepEqual(plain(m.dataset), []);
    assertEqual(m.expression, '');
  });
  test('addDataValue lehnt Nichtzahlen ab', () => {
    const m = fresh();
    expectRejected(m, () => m.addDataValue({ value: 'viel' }), 'value');
    expectRejected(m, () => m.addSSDataValue({ value: Infinity }), 'value');
  });
  test('Prozessdatensatz entsprechend', () => {
    const m = fresh();
    type(m, '-3');
    assertEqual(m.addSSData({}), -3);
    m.addSSDataValue({ value: 5 });
    m.removeLastSS({});
    assertDeepEqual(plain(m.ssDataset), [-3]);
    m.clearSSData({});
    assertDeepEqual(plain(m.ssDataset), []);
  });
});

suite('calculator Model — Kennwerte', () => {
  test('calcStat merkt eine Zahl, sonst null', () => {
    const m = load({ ...EMPTY, dataset: [10, 20, 30, 40, 50] });
    assertDeepEqual(m.calcStat({ type: 'mean' }), { value: 30, modes: null, reason: null });
    assertEqual(m.lastResult, 30);
    m.dataset = [1, 1, 2, 2];
    assertDeepEqual(plain(m.calcStat({ type: 'mode' })), { value: null, modes: [1, 2], reason: null });
    assertEqual(m.lastResult, null);
    m.dataset = [];
    assertEqual(m.calcStat({ type: 'mean' }).reason, 'noData');
  });
  test('calcSS mit Grenzen, ohne Grenzen ein Grund', () => {
    const m = load({ ...EMPTY, ssDataset: [9, 11], lsl: 1, usl: 19 });
    assertAlmostEqualStr(m.calcSS({ type: 'cp' }).value, 1.692);
    assertTrue(m.lastResult !== null);
    m.usl = null;
    assertEqual(m.calcSS({ type: 'cp' }).reason, 'needDataAndLimits');
    assertEqual(m.lastResult, null);
  });
  test('Yield liefert Prozent, merkt kein Ergebnis', () => {
    const m = load({ ...EMPTY, ssDataset: [8, 10, 12], lsl: 4, usl: 16 });
    const r = m.calcSS({ type: 'yield' });
    assertEqual(r.value, null);
    assertTrue(r.percent > 99.7 && r.percent < 99.8);
    assertEqual(m.lastResult, null);
  });
  test('Cp bei σ = 0: Unendlich im Ergebnis, gemerkt null', () => {
    const m = load({ ...EMPTY, ssDataset: [5, 5, 5], lsl: 1, usl: 9 });
    assertEqual(m.calcSS({ type: 'cp' }).value, Infinity);
    assertEqual(m.lastResult, null);
  });
  test('Ablehnung unbekannter Kennwerte', () => {
    const m = fresh();
    expectRejected(m, () => m.calcStat({ type: 'mittel' }), 'type');
    expectRejected(m, () => m.calcSS({ type: 'cpq' }), 'type');
  });
});

/** @param {number} v @param {number} exp */
function assertAlmostEqualStr(v, exp) { assertEqual(Number(v.toPrecision(4)), exp); }

suite('calculator Model — Inhalt, Lesefläche, Katalog', () => {
  test('hasContent wie die Altform', () => {
    assertEqual(fresh().hasContent(), false);
    assertEqual(load({ ...EMPTY, dataset: [1] }).hasContent(), true);
    assertEqual(load({ ...EMPTY, ssDataset: [1] }).hasContent(), true);
    assertEqual(load({ ...EMPTY, expression: '1' }).hasContent(), true);
    assertEqual(load({ ...EMPTY, memory: 3 }).hasContent(), true);
    assertEqual(load({ ...EMPTY, lsl: 0 }).hasContent(), true);
    assertEqual(load({ ...EMPTY, mode: 'stats', angleMode: 'RAD' }).hasContent(), false);
  });
  test('read() liefert die neun Felder, Grenzen als Zahl oder null', () => {
    const m = load({ ...EMPTY, lsl: 1.5, dataset: [2] });
    const r = readSchemaModel(schemaAgentEntry(State), m, undefined, evaluateDerived(m, /** @type {any} */ (undefined)));
    assertDeepEqual(Object.keys(r).sort(), ['angleMode', 'dataset', 'expression', 'lastResult', 'lsl', 'memory', 'mode', 'ssDataset', 'usl']);
    assertEqual(r.lsl, 1.5);
    assertEqual(r.usl, null);
  });
  test('Katalog: keine Setter der Altform', () => {
    const names = Object.keys(State.schema.commands);
    for (const n of ['setAngleMode', 'setMemory', 'setLsl', 'setUsl', 'toggleAngle']) assertTrue(!names.includes(n), n);
  });
});
