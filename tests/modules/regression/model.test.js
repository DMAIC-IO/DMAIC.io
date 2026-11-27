/**
 * Regression: Model (domain/model.js) und Rechnung (domain/analyze.js) —
 * Schema und Vorgaben, Kommando setTerm, Ableitungen, Heilung des Hinweises
 * beim Lesen, gelöschte Spalte, Merker, Vorhersage.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue, assertAlmostEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/regression/domain/model.js';
import {
  analyze, engineRuns, REG_TYPES, DEGREES, polyTermCount, predictAt, activeResultOf, degreeAvailability,
} from '../../../js/modules/regression/domain/analyze.js';
import { noticeBasis, toNumeric, numericOf, descriptorOf } from '../../../js/modules/regression/domain/columns.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import { storedSource } from '../../helpers/stored-source.js';
import { sheetSource } from '../../helpers/sheet-source.js';
import { runMultiRegression, predictValue } from '../../../js/engines/regression-engine.js';

const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
const T = (k, p) => (p ? `«${k}:${JSON.stringify(p)}»` : `«${k}»`);
const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const plain = (v) => JSON.parse(JSON.stringify(v));
const X1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const X2 = [2, 1, 4, 3, 6, 5, 8, 7, 10, 9];
const Y = X1.map((x, i) => 3 + 2 * x - 0.5 * X2[i] + [0.1, -0.2, 0.15, -0.05, 0.2, -0.1, 0.05, -0.15, 0.1, -0.1][i]);
const EXPY = X1.map((x, i) => 2 * Math.exp(0.3 * x) * (1 + [0.01, -0.02, 0.015, -0.005, 0.02, -0.01, 0.005, -0.015, 0.01, -0.01][i]));
const SHEET = { x1: X1, x2: X2, y: Y, ey: EXPY, few: [1, 2, null, null, null, null, null, null, null, null] };
const SRC = sheetSource(SHEET, { names: { x1: 'X1', x2: 'X2', y: 'Y', ey: 'EY' } });
/** @param {string[]} xs @param {string|null} y @param {object} [rest] */
const make = (xs, y, rest = {}) => State.fromJSON({ _schema: { version: '1.0' }, colRefs: xs.map(ref), yRef: y ? ref(y) : null, ...rest }, { context: CTX });
/** @param {any} m @param {string[]} [names] @param {any} [src] */
const derived = (m, names, src = SRC) => evaluateDerived(m, src, names, T);

suite('regression: Model — Schema und Vorgaben', () => {
  test('Typen und Grade im Schema gleich denen der Rechnung', () => {
    assertDeepEqual([...State.schema.fields.regType.values], [...REG_TYPES]);
    assertDeepEqual([...State.schema.fields.polyDegree.values], [...DEGREES]);
  });

  test('Spaltenfelder: X als Liste nicht nullbarer Bezüge, Y nullbar, gleiche Arten', () => {
    const c = State.schema.fields.colRefs;
    assertEqual(c.kind, 'list');
    assertEqual(c.item.nullable, false);
    assertDeepEqual([...c.item.types], ['numeric', 'currency', 'percent', 'date', 'time']);
    assertDeepEqual([...State.schema.fields.yRef.types], [...c.item.types]);
    assertEqual(new State().yRef, null);
  });

  test('Konfidenz und α aus dem Kontext als Anteil, gerundet; frisch ohne Spalten', () => {
    const m = new State({ ...CTX, confidenceLevel: 90 });
    assertEqual(m.confLevel, 0.9);
    assertEqual(m.alpha, 0.1);
    const odd = new State({ ...CTX, confidenceLevel: 99.99999 });
    assertEqual(odd.confLevel, 0.9999);
    assertEqual(odd.alpha, 0.0001);
    const d = new State();
    assertDeepEqual([d.confLevel, d.alpha, d.regType, d.polyDegree, d.activeTab, d.showCI, d.showPI], [0.95, 0.05, 'polynomial', 1, 'scatter', true, false]);
    assertDeepEqual(plain(d.colRefs), []);
    assertEqual(d.hasContent(), false);
  });

  test('Konfidenz und α strikt zwischen 0 und 1', () => {
    const m = new State();
    for (const v of [0, 1, 1.2, -0.1]) {
      assertThrows(() => setFields(m, { confLevel: v }), /confLevel/);
      assertThrows(() => setFields(m, { alpha: v }), /alpha/);
    }
    setFields(m, { confLevel: 0.99, alpha: 0.01 });
    assertDeepEqual([m.confLevel, m.alpha], [0.99, 0.01]);
  });

  test('Felder der Übernahme und des Modells sind für Agenten nicht schreibbar, die Momentaufnahme fehlt in read()', () => {
    const f = State.schema.fields;
    for (const k of ['designNotice', 'activeImportSource', 'savedModelId', 'savedModelName', 'modelRecord']) assertEqual(f[k].agentWrite, false, k);
    assertEqual(f.modelRecord.omitOnRead, true);
  });

  test('hasContent: eine Spalte, Y oder ein gespeichertes Modell', () => {
    assertTrue(make(['x1'], null).hasContent());
    assertTrue(make([], 'y').hasContent());
    assertTrue(State.fromJSON({ _schema: { version: '1.0' }, modelRecord: { df: 1 } }).hasContent());
  });
});

suite('regression: Kommando setTerm', () => {
  test('schließt aus und ein, ohne Doppelte; der Hinweis entfällt', () => {
    const m = make(['x1', 'x2'], 'y', { polyDegree: 2, designNotice: { aliased: [], saturated: ['X1·X2'], basis: 'b' } });
    m.execute({ type: 'setTerm', term: 'X1²', included: false });
    m.execute({ type: 'setTerm', term: 'X1²', included: false });
    assertDeepEqual(plain(m.excludedTerms), ['X1²']);
    assertEqual(m.designNotice, null);
    m.execute({ type: 'setTerm', term: 'X1²', included: true });
    assertDeepEqual(plain(m.excludedTerms), []);
  });

  test('lehnt leeren Term und Nicht-Wahrheitswert ab', () => {
    const m = make(['x1'], 'y');
    assertThrows(() => m.execute({ type: 'setTerm', term: '', included: true }), /term/);
    assertThrows(() => m.execute({ type: 'setTerm', term: 'X1', included: 'ja' }), /included/);
  });

  test('ein Term, den die Daten nicht kennen, bleibt gespeichert und wirkt nicht', () => {
    const m = make(['x1', 'x2'], 'y');
    m.execute({ type: 'setTerm', term: 'Unbekannt', included: false });
    const d = derived(m, ['result', 'terms']);
    assertDeepEqual(d.terms, ['X1', 'X2']);
    assertEqual(d.result.coefficients.length, 3);
  });
});

suite('regression: Ableitungen', () => {
  test('Polynom mit zwei X: gleiche Kennzahlen wie runMultiRegression', () => {
    const d = derived(make(['x1', 'x2'], 'y'));
    const ref0 = runMultiRegression([X1, X2], Y, 1, 0.95, ['X1', 'X2']);
    assertAlmostEqual(d.result.R2, ref0.R2, 1e-10);
    assertAlmostEqual(d.result.adjR2, ref0.adjR2, 1e-10);
    assertEqual(d.result.type, 'polynomial');
    assertEqual(d.result.n, 10);
    assertDeepEqual(d.terms, ['X1', 'X2']);
    assertDeepEqual(d.perXKeys, []);
    assertEqual(d.activeX, null);
    assertEqual(d.canSaveModel, true);
    assertDeepEqual(d.predictors.map((p) => p.id), ['X1', 'X2']);
    assertDeepEqual(d.activeParams, ['regType', 'polyDegree', 'confLevel', 'alpha']);
    assertEqual(d.error, null);
    assertEqual(d.result.anova.terms.length, 2);
  });

  test('Einzelmodelle: Schlüssel je X, das gespeicherte gilt, sonst das erste', () => {
    const m = make(['x1', 'x2'], 'ey', { regType: 'exponential' });
    let d = derived(m);
    assertDeepEqual(d.perXKeys, ['ws1|s1|x1', 'ws1|s1|x2']);
    assertEqual(d.activeX, 'ws1|s1|x1');
    assertEqual(d.result.type, 'exponential');
    assertEqual(d.canSaveModel, false);
    assertDeepEqual(d.activeParams, ['regType', 'confLevel', 'alpha']);
    assertDeepEqual(d.predictors, [{ id: 'single', label: 'X1', kind: 'single' }]);
    m.activeXKey = 'ws1|s1|x2';
    d = derived(m);
    assertEqual(d.activeX, 'ws1|s1|x2');
    m.activeXKey = 'weg';
    assertEqual(derived(m, ['activeX']).activeX, 'ws1|s1|x1');
  });

  test('Einzelmodell mit zu wenig Paaren: Grund je X neben dem Ergebnis', () => {
    const d = derived(make(['x1', 'few'], 'ey', { regType: 'exponential' }));
    assertDeepEqual(d.perXKeys, ['ws1|s1|x1']);
    assertEqual(d.error.reason, 'perX');
    assertDeepEqual(d.error.perX, [{ name: 'few', reason: 'errMinData', params: { n: 2 } }]);
    assertEqual(d.error.message, 'few: «errMinData:{"n":2}»');
  });

  test('Polynom mit zu wenig Paaren: Grund errMinData, kein Ergebnis', () => {
    const d = derived(make(['few'], 'y'));
    assertEqual(d.result, null);
    assertDeepEqual(plain(d.error), { reason: 'errMinData', params: { n: 2 }, perX: [], message: '«errMinData:{"n":2}»' });
    assertEqual(d.canSaveModel, false);
  });

  test('ohne X oder ohne Y: kein Ergebnis, kein Grund', () => {
    for (const m of [make([], 'y'), make(['x1'], null)]) {
      const d = derived(m);
      assertEqual(d.result, null);
      assertEqual(d.error, null);
      assertDeepEqual(d.terms, []);
    }
  });

  test('referenzierte Spalte gelöscht: Bezug bleibt, Grund errColumnMissing, keine Rechnung', () => {
    const sheet = { ...SHEET };
    const src = sheetSource(sheet, { names: { x1: 'X1', x2: 'X2', y: 'Y' } });
    const m = make(['x1', 'x2'], 'y');
    assertTrue(derived(m, ['result'], src).result !== null);
    delete sheet.x2;
    const d = derived(m, undefined, src);
    assertEqual(d.result, null);
    assertEqual(d.error.reason, 'errColumnMissing');
    assertEqual(m.colRefs.length, 2);
    delete sheet.y;
    assertEqual(derived(m, ['error'], src).error.reason, 'errColumnMissing');
  });

  test('vermengte Terme: Grund errAliasedTerms, die Terme stehen in terms', () => {
    const a = [-1, 1, -1, 1, -1, 1];
    const src = sheetSource({ a, b: [-1, -1, 1, 1, -1, 1], y: [1, 3, 2, 7, 1.1, 3.2] }, { names: { a: 'A', b: 'B', y: 'Y' } });
    const d = derived(make(['a', 'b'], 'y', { polyDegree: 2, excludedTerms: ['B²', 'A·B'] }), undefined, src);
    assertEqual(d.result, null);
    assertEqual(d.error.reason, 'errAliasedTerms');
    assertDeepEqual(d.error.params, { term: 'A²', with: 'Intercept' });
    assertDeepEqual(d.aliased, [{ term: 'A²', with: ['Intercept'] }]);
    assertTrue(d.terms.includes('A²'));
  });

  test('Grade: ein Grad über der Datenzahl fehlt', () => {
    const src = sheetSource({ a: [1, 2, 3, 4, 5], b: [2, 1, 3, 5, 4], y: [1, 2, 4, 3, 6] }, { names: { a: 'A', b: 'B', y: 'Y' } });
    const m = make(['a', 'b'], 'y');
    assertDeepEqual(derived(m, ['activeDegrees'], src).activeDegrees, [1]);
    const av = degreeAvailability(m, src);
    assertEqual(av.n, 5);
    assertDeepEqual(av.options.map((o) => [o.deg, o.terms, o.disabled]), [[1, 3, false], [2, 6, true], [3, 10, true]]);
    assertEqual(polyTermCount(2, 2), 6);
    m.polyDegree = 2;
    m.excludedTerms = ['A²', 'B²'];
    assertEqual(degreeAvailability(m, src).options[1].terms, 4);
    assertEqual(degreeAvailability(m, src).options[1].disabled, false);
  });

  test('Hinweis der Vorgabe: gilt nur zu X, Y, Grad und Polynom; kehrt mit dem Stand zurück', () => {
    const m = make(['x1', 'x2'], 'y', { polyDegree: 2 });
    setFields(m, { designNotice: { aliased: [{ term: 'X1²', with: ['X2²'] }], saturated: [], basis: noticeBasis(m.colRefs, m.yRef, 2) } });
    const shown = () => derived(m, ['effectiveDesignNotice']).effectiveDesignNotice;
    assertDeepEqual(shown(), { aliased: [{ term: 'X1²', with: ['X2²'] }], saturated: [] });
    m.regType = 'power';
    assertEqual(shown(), null);
    m.regType = 'polynomial';
    assertTrue(shown() !== null);
    m.polyDegree = 1;
    assertEqual(shown(), null);
    m.polyDegree = 2;
    setFields(m, { yRef: ref('ey') });
    assertEqual(shown(), null);
    setFields(m, { yRef: ref('y') });
    assertTrue(shown() !== null);
  });

  test('gespeichertes Modell: null ohne id oder ohne Datensatz, sonst id, Name und Datensatz', () => {
    const m = make([], null);
    assertEqual(derived(m, ['savedModel']).savedModel, null);
    setFields(m, { savedModelId: 'm1', savedModelName: 'Y — Modell' });
    assertEqual(derived(m, ['savedModel']).savedModel, null);
    setFields(m, { modelRecord: { coef: [1, 2], df: 3 } });
    assertDeepEqual(plain(derived(m, ['savedModel']).savedModel), { id: 'm1', name: 'Y — Modell', coef: [1, 2], df: 3 });
  });

  test('Merker: alle Ableitungen zusammen rufen die Engine einmal', () => {
    const m = make(['x1', 'x2'], 'y');
    const before = engineRuns();
    derived(m);
    derived(m);
    assertEqual(engineRuns() - before, 1);
    m.polyDegree = 2;
    derived(m, ['result']);
    assertEqual(engineRuns() - before, 2);
  });

  test('ohne Arbeitsblatt: kein Ergebnis (gelöschte Spalte)', () => {
    const d = derived(make(['x1'], 'y'), undefined, storedSource({}));
    assertEqual(d.result, null);
    assertEqual(d.error.reason, 'errColumnMissing');
  });
});

suite('regression: Spalten und Vorhersage', () => {
  test('Datum in Millisekunden, Zeit in Sekunden, Text zählt nicht', () => {
    assertEqual(toNumeric('2026-01-01', 'date'), Date.parse('2026-01-01'));
    assertEqual(toNumeric('1:02:03', 'time'), 3723);
    assertEqual(toNumeric('abc', 'numeric'), null);
    assertEqual(toNumeric(4, 'numeric'), 4);
  });

  test('kategoriale Planerspalte: als Zahl die Kodierung, als Prädiktor die Stufen', () => {
    const col = { name: 'G', type: 'text', values: ['a', 'b', null, 'x'], coding: { a: -1, b: 1 } };
    assertDeepEqual(numericOf(col), [-1, 1, null, null]);
    const d = descriptorOf(col);
    assertEqual(d.kind, 'categorical');
    assertDeepEqual(/** @type {any} */ (d).levels, ['a', 'b']);
  });

  test('Vorhersage liest Dezimalkomma; fehlender Wert → null', () => {
    const m = make(['x1', 'x2'], 'y');
    const r = activeResultOf(analyze(m, SRC), null);
    const a = predictAt(r, { X1: '2,5', X2: 3 });
    const b = predictAt(r, { X1: 2.5, X2: 3 });
    assertAlmostEqual(a.yHat, b.yHat, 1e-12);
    assertEqual(predictAt(r, { X1: '', X2: 3 }), null);
    assertEqual(predictAt(r, { X1: 'abc', X2: 3 }), null);
  });

  test('Vorhersage beim Einzelmodell wie predictValue, ohne Intervall', () => {
    const m = make(['x1'], 'ey', { regType: 'exponential' });
    const r = activeResultOf(analyze(m, SRC), null);
    const out = predictAt(r, { single: '4,0' });
    assertAlmostEqual(out.yHat, predictValue(r, 4).yHat, 1e-12);
    assertEqual(out.piLow, null);
  });
});
