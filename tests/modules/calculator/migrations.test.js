/**
 * Tests for modules/calculator/domain/migrations.js — '0→1.0' übernimmt jeden
 * Stand des alten `State.fromJSON`: Bereich (`ss` wird `sixsigma`, sonst
 * unbekannt `sci`), Winkeleinheit, `lastResult`/`memory` nur endlich, die
 * Datensätze nur ihre Zahlen, die Grenzen als Zahl oder `null`; unbekannte
 * Schlüssel entfallen. Dazu das Golden-Fixture und das Altprojekt aus den
 * E2E-Fixtures, beide ohne Reparatur.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/calculator/domain/migrations.js';
import { State } from '../../../js/modules/calculator/domain/model.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'calculator');

const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const plain = (v) => JSON.parse(JSON.stringify(v));
const DEFAULTS = {
  mode: 'sci', expression: '', lastResult: null, memory: 0, angleMode: 'DEG',
  dataset: [], ssDataset: [], lsl: null, usl: null,
};

/** @param {URL} url @returns {Promise<any>} */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${url}: HTTP ${res.status}`);
  return res.json();
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(plain(j), { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

/** Zustände des Altprojekts aus den E2E-Fixtures (ohne `_schema`). */
const LEGACY_A = {
  mode: 'ss', expression: '(12.4+13.1+11.8)/3', lastResult: 12.433333333333334, memory: 0, angleMode: 'DEG',
  dataset: [12.4, 13.1, 11.8, 14.2, 12.9],
  ssDataset: [12.4, 13.1, 11.8, 14.2, 12.9, 13.5, 12.1, 14.8, 11.5, 13.0], lsl: '10', usl: '13.5',
};
const LEGACY_B = {
  mode: 'sixsigma', expression: '2^3', lastResult: null, memory: 42, angleMode: 'RAD',
  dataset: [3, 'x', 5], ssDataset: [9.5, 10.25, 11], lsl: '', usl: 7,
};

suite('calculator Migration 0→1.0', () => {
  test('leer, null, Nicht-Objekt → Vorgaben', () => {
    for (const v of [undefined, null, 'x', 3, [], {}]) assertDeepEqual(from0(v), DEFAULTS);
  });
  test('Bereich: ss wird sixsigma, unbekannt sci, gültige bleiben', () => {
    assertEqual(from0({ mode: 'ss' }).mode, 'sixsigma');
    assertEqual(from0({ mode: 'turbo' }).mode, 'sci');
    for (const m of ['sci', 'stats', 'sixsigma']) assertEqual(from0({ mode: m }).mode, m);
  });
  test('Winkeleinheit: unbekannt DEG', () => {
    assertEqual(from0({ angleMode: 'GRAD' }).angleMode, 'DEG');
    assertEqual(from0({ angleMode: 'RAD' }).angleMode, 'RAD');
  });
  test('Ausdruck nur als Text', () => {
    assertEqual(from0({ expression: 5 }).expression, '');
    assertEqual(from0({ expression: '1+' }).expression, '1+');
  });
  test('lastResult und memory nur als endliche Zahl', () => {
    assertEqual(from0({ lastResult: '5' }).lastResult, null);
    assertEqual(from0({ lastResult: 7 }).lastResult, 7);
    assertEqual(from0({ lastResult: Infinity }).lastResult, null);
    assertEqual(from0({ memory: '3' }).memory, 0);
    assertEqual(from0({ memory: NaN }).memory, 0);
    assertEqual(from0({ memory: 3 }).memory, 3);
  });
  test('Datensätze: Nicht-Listen leer, nur Zahlen bleiben', () => {
    assertDeepEqual(from0({ dataset: 'x', ssDataset: { a: 1 } }).dataset, []);
    assertDeepEqual(from0({ dataset: [1, 'a', null, 2, Infinity] }).dataset, [1, 2]);
    assertDeepEqual(from0({ ssDataset: [4, '5', 6] }).ssDataset, [4, 6]);
  });
  test('Grenzen: leer/fehlend null, Text und Zahl als Zahl, Handtext null', () => {
    const f = (v) => from0({ lsl: v }).lsl;
    assertEqual(f(undefined), null);
    assertEqual(f(null), null);
    assertEqual(f(''), null);
    assertEqual(f('10'), 10);
    assertEqual(f('13.5'), 13.5);
    assertEqual(f('-3'), -3);
    assertEqual(f('1e5'), 100000);
    assertEqual(f('.5'), 0.5);
    assertEqual(f(7), 7);
    assertEqual(f(-0.25), -0.25);
    assertEqual(f('5abc'), null);
    assertEqual(f(Infinity), null);
    assertEqual(from0({ usl: '9.5' }).usl, 9.5);
  });
  test('unbekannte Schlüssel entfallen', () => {
    assertDeepEqual(Object.keys(from0({ foo: 1, _ui: {} })), Object.keys(DEFAULTS));
  });
});

suite('calculator Migration — Altprojekt und Golden-Fixture', () => {
  test('Altprojekt (a): ss → sixsigma, Grenzen als Zahl, ohne Reparatur', () => {
    const { m, fields } = repaired(LEGACY_A);
    assertDeepEqual(fields, []);
    assertEqual(m.mode, 'sixsigma');
    assertEqual(m.expression, '(12.4+13.1+11.8)/3');
    assertEqual(m.lastResult, 12.433333333333334);
    assertDeepEqual(plain(m.dataset), LEGACY_A.dataset);
    assertDeepEqual(plain(m.ssDataset), LEGACY_A.ssDataset);
    assertEqual(m.lsl, 10);
    assertEqual(m.usl, 13.5);
  });
  test('Altprojekt (b): Nicht-Zahl-Eintrag entfällt, leere Grenze null, ohne Reparatur', () => {
    const { m, fields } = repaired(LEGACY_B);
    assertDeepEqual(fields, []);
    assertEqual(m.mode, 'sixsigma');
    assertEqual(m.angleMode, 'RAD');
    assertEqual(m.memory, 42);
    assertDeepEqual(plain(m.dataset), [3, 5]);
    assertEqual(m.lsl, null);
    assertEqual(m.usl, 7);
  });
  test('Golden-Fixture v0.3.0 lädt im Prozessbereich, ohne Reparatur', async () => {
    const doc = await fetchJSON(new URL('v0.3.0_single_project.json', FIXTURES));
    const s = doc.moduleStates['inst-calc'];
    const { m, fields } = repaired(s);
    assertDeepEqual(fields, []);
    assertEqual(m.mode, 'sixsigma');
    assertEqual(m.lsl, 10);
    assertEqual(m.usl, 13.5);
    assertEqual(m.ssDataset.length, 10);
    assertEqual(m.toJSON()._schema.version, '1.0');
  });
});
