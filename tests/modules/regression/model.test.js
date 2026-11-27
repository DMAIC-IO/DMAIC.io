/**
 * Regression: Model (domain/model.js) und Rechnung (domain/analyze.js) —
 * Schema und Vorgaben, Kommandos setTerm und importExperiment (offene
 * Vorgabe, Invariante, Rechnen der Vorgabe), Ableitungen, Heilung des Hinweises
 * beim Lesen, gelöschte Spalte, Merker, Vorhersage.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue, assertAlmostEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/regression/domain/model.js';
import {
  analyze, engineRuns, REG_TYPES, DEGREES, polyTermCount, predictAt, activeResultOf, degreeAvailability,
} from '../../../js/modules/regression/domain/analyze.js';
import { noticeBasis, toNumeric, numericOf, descriptorOf } from '../../../js/modules/regression/domain/columns.js';
import { pendingPresetFields } from '../../../js/modules/regression/domain/design-preset.js';
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

  test('Spaltenfelder: X als Liste nicht nullbarer Bezüge (auch Text als kategorialer Faktor), Y nullbar und nur Zahlarten', () => {
    const c = State.schema.fields.colRefs;
    assertEqual(c.kind, 'list');
    assertEqual(c.item.nullable, false);
    assertDeepEqual([...c.item.types], ['numeric', 'currency', 'percent', 'date', 'time', 'text']);
    assertDeepEqual([...State.schema.fields.yRef.types], ['numeric', 'currency', 'percent', 'date', 'time']);
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

suite('regression: Kommando importExperiment (Planer-Übergabe)', () => {
  const SOURCE = { experimentId: 'p1', sourceColumn: 'y', transform: 'identity' };
  const ARGS = { colRefs: [ref('x1'), ref('x2')], yRef: ref('y'), designTerms: ['M0', 'M1', 'I0_1', 'M0'], source: SOURCE };

  test('schreibt X, Y, Polynom, Quelle und die offene Vorgabe; Grad, Terme und Hinweis von vorher entfallen', () => {
    const m = make(['x1'], 'ey', { regType: 'power', excludedTerms: ['X1'], designNotice: { aliased: [], saturated: [], basis: 'b' } });
    m.execute({ type: 'importExperiment', ...ARGS });
    assertDeepEqual(plain(m.colRefs), [ref('x1'), ref('x2')]);
    assertDeepEqual(plain(m.yRef), ref('y'));
    assertEqual(m.regType, 'polynomial');
    assertDeepEqual(plain(m.excludedTerms), []);
    assertEqual(m.designNotice, null);
    assertDeepEqual(plain(m.activeImportSource), SOURCE);
    assertDeepEqual(plain(m.pendingDesignTerms), ['M0', 'M1', 'I0_1']);
    assertEqual(m.polyDegree, 1);
  });

  test('lehnt ab, ohne zu schreiben: keine X, doppelte X, Y unter den X, unbekannte Term-id, falsche Variante', () => {
    const cases = [
      [{ ...ARGS, colRefs: [] }, /colRefs/],
      [{ ...ARGS, colRefs: [ref('x1'), ref('x1')] }, /colRefs/],
      [{ ...ARGS, yRef: ref('x2') }, /yRef/],
      [{ ...ARGS, designTerms: ['M0', 'X9'] }, /designTerms/],
      [{ ...ARGS, source: { ...SOURCE, transform: 'log' } }, /transform/],
      [{ ...ARGS, source: { ...SOURCE, experimentId: '' } }, /experimentId/],
    ];
    for (const [args, re] of cases) {
      const m = make(['x1'], 'ey');
      const before = JSON.stringify(m.toJSON());
      assertThrows(() => m.execute({ type: 'importExperiment', ...args }), re);
      assertEqual(JSON.stringify(m.toJSON()), before);
    }
  });

  test('pendingDesignTerms ist für den Agenten nicht schreibbar und steht im gespeicherten Stand', () => {
    assertEqual(State.schema.fields.pendingDesignTerms.agentWrite, false);
    const m = make([], null);
    m.execute({ type: 'importExperiment', ...ARGS });
    const back = State.fromJSON(plain(m.toJSON()), { context: CTX });
    assertDeepEqual(plain(back.pendingDesignTerms), ['M0', 'M1', 'I0_1']);
  });

  test('Invariante: eine offene Vorgabe ohne Quelle — strenges Laden wirft, Heilen verwirft sie, Schreiben lehnt ab', () => {
    const bad = { _schema: { version: '1.0' }, colRefs: [ref('x1')], yRef: ref('y'), pendingDesignTerms: ['M0'], activeImportSource: null };
    assertThrows(() => State.fromJSON(plain(bad), { context: CTX }), /pendingNeedsSource/);
    const m = State.fromJSON(plain(bad), { repair: true, context: CTX });
    assertDeepEqual(plain(m.pendingDesignTerms), []);
    const n = make([], null);
    n.execute({ type: 'importExperiment', ...ARGS });
    assertThrows(() => setFields(n, { activeImportSource: null }), /activeImportSource|pendingNeedsSource/);
    assertDeepEqual(plain(n.activeImportSource), SOURCE);
  });

  test('releaseImport löst Quelle, Hinweis und offene Vorgabe; Spalten bleiben', () => {
    const m = make([], null);
    m.execute({ type: 'importExperiment', ...ARGS });
    m.execute({ type: 'releaseImport' });
    assertEqual(m.activeImportSource, null);
    assertDeepEqual(plain(m.pendingDesignTerms), []);
    assertEqual(m.colRefs.length, 2);
  });

  test('setTerm verwirft die offene Vorgabe', () => {
    const m = make([], null);
    m.execute({ type: 'importExperiment', ...ARGS });
    m.execute({ type: 'setTerm', term: 'X1²', included: false });
    assertDeepEqual(plain(m.pendingDesignTerms), []);
  });

  test('die offene Vorgabe geht mit lesbaren Daten auf: Grad, Terme, Hinweis mit Basis, Vorgabe leer', () => {
    const m = make([], null);
    m.execute({ type: 'importExperiment', ...ARGS });
    const f = pendingPresetFields(m, SRC);
    assertEqual(f.polyDegree, 2);
    assertDeepEqual([...f.excludedTerms].sort(), ['X1²', 'X2²']);
    assertDeepEqual(f.pendingDesignTerms, []);
    assertEqual(f.designNotice.basis, noticeBasis(m.colRefs, m.yRef, 2));
    setFields(m, f);
    assertDeepEqual(plain(derived(m, ['effectiveDesignNotice']).effectiveDesignNotice), { aliased: [], saturated: [] });
    assertEqual(derived(m, ['result']).result.coefficients.length, 4);
    assertEqual(pendingPresetFields(m, SRC), null);
  });

  test('ohne rechenbare Daten oder als Nicht-Polynom bleibt die Vorgabe offen', () => {
    const m = make([], null);
    m.execute({ type: 'importExperiment', ...ARGS, yRef: ref('few') });
    assertEqual(pendingPresetFields(m, SRC), null);
    const gone = make([], null);
    gone.execute({ type: 'importExperiment', ...ARGS, yRef: ref('weg') });
    assertEqual(pendingPresetFields(gone, SRC), null);
    const n = make([], null);
    n.execute({ type: 'importExperiment', ...ARGS });
    setFields(n, { regType: 'power' });
    assertEqual(pendingPresetFields(n, SRC), null);
    setFields(n, { regType: 'polynomial' });
    assertEqual(pendingPresetFields(n, SRC).polyDegree, 2);
  });

  test('experimentImports trägt je Option die Angaben des Kommandos', () => {
    const src = {
      ...SRC,
      list: () => [...SRC.list(), { instanceId: 'p1', moduleId: 'doe-planner' }],
      read: (id, o) => (id === 'p1' ? {
        experiment: {
          name: 'E', plannedTerms: { terms: ['M0', 'M1'] }, factors: [],
          runMatrix: { worksheetRef: { instanceId: 'ws1', sheetId: 's1' }, columnTags: { factors: ['x1', 'x2'] } },
          responseColumns: [{ name: 'Y', columnId: 'y' }],
        },
      } : SRC.read(id, o)),
    };
    const [opt] = derived(make([], null), ['experimentImports'], src).experimentImports;
    assertEqual(opt.key, 'p1|raw|0');
    assertDeepEqual(opt.args, { colRefs: [ref('x1'), ref('x2')], yRef: ref('y'), designTerms: ['M0', 'M1'], source: SOURCE });
    const m = make([], null);
    m.execute({ type: 'importExperiment', ...opt.args });
    assertDeepEqual(plain(m.pendingDesignTerms), ['M0', 'M1']);
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

  test('Textspalte ohne Planerkodierung: Stufen alphabetisch, Referenz die erste, Kodierung −1 … +1', () => {
    const col = { name: 'G', type: 'text', values: ['b', 'a', null, 'c', 'a'], coding: null };
    const d = descriptorOf(col);
    assertEqual(d.kind, 'categorical');
    assertDeepEqual(/** @type {any} */ (d).levels, ['a', 'b', 'c']);
    assertEqual(/** @type {any} */ (d).reference, 'a');
    assertDeepEqual(numericOf(col), [0, -1, null, 1, -1]);
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

// Referenz: ausgewogener Plan, x je Stufe gleich — x und der Effektkode der
// Gruppe sind orthogonal, die Kleinstquadrate haben eine geschlossene Form
// (wie R `lm(y ~ x + G, contrasts = list(G = contr.sum))`):
// b_x = Sxy/Sxx, b_G=B = (ȳ_B − ȳ_A)/2, b0 = ȳ − b_x·x̄.
suite('regression: Textspalte als kategorialer Faktor', () => {
  const XS = [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6];
  const GS = ['B', 'B', 'B', 'B', 'B', 'B', 'A', 'A', 'A', 'A', 'A', 'A'];
  const YS = [6.1, 7.9, 10.2, 11.8, 14.1, 16.3, 3.2, 4.8, 7.1, 9.0, 10.9, 13.1];
  const one = ['x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x'];
  const src = sheetSource({ x: XS, g: GS, y: YS, one }, { names: { x: 'X', g: 'G', y: 'Y', one: 'One' }, types: { g: 'text', one: 'text' } });
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

  test('Polynom Grad 1 mit X und G: Koeffizienten, SSE und R² wie die geschlossene Form', () => {
    const d = evaluateDerived(make(['x', 'g'], 'y'), src, undefined, T);
    assertEqual(d.error, null);
    const xm = mean(XS); const ym = mean(YS);
    const sxx = XS.reduce((s, x) => s + (x - xm) ** 2, 0);
    const bx = XS.reduce((s, x, i) => s + (x - xm) * (YS[i] - ym), 0) / sxx;
    const bg = (mean(YS.slice(0, 6)) - mean(YS.slice(6))) / 2;
    const b0 = ym - bx * xm;
    const fitted = XS.map((x, i) => b0 + bx * x + (GS[i] === 'B' ? bg : -bg));
    const sse = YS.reduce((s, y, i) => s + (y - fitted[i]) ** 2, 0);
    const sst = YS.reduce((s, y) => s + (y - ym) ** 2, 0);
    const coef = Object.fromEntries(d.result.coefficients.map((c) => [c.term, c.coeff]));
    assertAlmostEqual(coef.Intercept, b0, 1e-10);
    assertAlmostEqual(coef.X, bx, 1e-10);
    assertAlmostEqual(coef['G=B'], bg, 1e-10);
    assertAlmostEqual(d.result.R2, 1 - sse / sst, 1e-10);
    assertEqual(d.result.n, 12);
    assertDeepEqual(d.predictors.map((p) => [p.id, p.kind]), [['X', 'numeric'], ['G', 'categorical']]);
    assertDeepEqual(d.predictors[1].levels, ['A', 'B']);
    assertEqual(d.canSaveModel, true);
  });

  test('gespeichertes Modell trägt G als kategorialen Prädiktor mit Term und Grad', () => {
    const d = evaluateDerived(make(['x', 'g'], 'y'), src, ['result'], T);
    assertTrue(d.result !== null);
    const a = analyze(make(['x', 'g'], 'y'), src);
    assertDeepEqual(plain(a.poly.spec.predictors[1]), { id: 'G', kind: 'categorical', levels: ['A', 'B'], reference: 'A' });
    assertDeepEqual(plain(a.poly.spec.terms[1]), { id: 'G', factors: [{ id: 'G', degree: 1 }] });
  });

  test('Textspalte mit nur einer Stufe: Grund errCategoricalLevels statt stiller Verlust', () => {
    const d = evaluateDerived(make(['x', 'one'], 'y'), src, undefined, T);
    assertEqual(d.result, null);
    assertEqual(d.error.reason, 'errCategoricalLevels');
    assertDeepEqual(plain(d.error.params), { name: 'One' });
  });

  test('Nicht-Polynom mit kategorialem X: Grund je X errCategoricalNeedsPolynomial, die stetigen X rechnen', () => {
    const d = evaluateDerived(make(['x', 'g'], 'y', { regType: 'exponential' }), src, undefined, T);
    assertDeepEqual(d.perXKeys, ['ws1|s1|x']);
    assertEqual(d.error.reason, 'perX');
    assertDeepEqual(plain(d.error.perX), [{ name: 'G', reason: 'errCategoricalNeedsPolynomial', params: null }]);
  });
});
