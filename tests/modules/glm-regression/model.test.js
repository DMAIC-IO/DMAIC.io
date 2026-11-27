/**
 * GLM-Regression: Model (domain/model.js), Rechnung (domain/analyze.js) und
 * Datensatz (domain/record.js) — Schema und Vorgaben, Kommandos der
 * gekoppelten Konfidenz, Ableitungen, Gründe, gelöschte Spalte, Merker,
 * Schwelle ohne neuen Fit, Vorhersage mit Dezimalkomma, Ereignisse je Prädiktor.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue, assertAlmostEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/glm-regression/domain/model.js';
import { analyze, engineRuns, METHODS, predictFor, eventsPerPredictor, warningsOf, fixed } from '../../../js/modules/glm-regression/domain/analyze.js';
import { toNumber, fitDataOf } from '../../../js/modules/glm-regression/domain/columns.js';
import { buildRecord } from '../../../js/modules/glm-regression/domain/record.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import { storedSource } from '../../helpers/stored-source.js';

const T = (k, p) => (p ? `«${k}:${JSON.stringify(p)}»` : `«${k}»`);
const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const plain = (v) => JSON.parse(JSON.stringify(v));
const ref = (c) => ({ instanceId: 'ws', sheetId: 'sh', columnId: c });

const X1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const BIN = [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1];
const COUNT = [0, 1, 1, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 8, 9];
const GRP = ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b', 'a', 'b', 'a', 'b', 'a', 'b', 'a', 'b'];

/** Spalten des Testblatts; reaktiv genug: jedes Lesen baut den Stand neu. */
const COLS = {
  x1: { name: 'X1', type: 'numeric', values: X1 },
  bin: { name: 'Bin', type: 'numeric', values: BIN },
  count: { name: 'N', type: 'numeric', values: COUNT },
  grp: { name: 'G', type: 'text', values: GRP },
  three: { name: 'Drei', type: 'numeric', values: X1.map((v) => v % 3) },
  share: { name: 'Anteil', type: 'numeric', values: X1.map((v) => v / 20) },
  big: { name: 'Groß', type: 'numeric', values: X1.map((v) => v * 2) },
  trials: { name: 'Versuche', type: 'numeric', values: X1.map(() => 20) },
  zero: { name: 'Null', type: 'numeric', values: X1.map(() => 0.5) },
};
/** @param {Record<string, any>} [cols] */
function source(cols = COLS) {
  const state = { get columns() { return Object.entries(cols).map(([id, c]) => ({ id, ...c })); } };
  return storedSource({ ws: { sheets: [{ id: 'sh', name: 'S', state }] } });
}
const SRC = source();
/** @param {string[]} xs @param {string|null} y @param {object} [rest] */
const make = (xs, y, rest = {}) => State.fromJSON({ _schema: { version: '1.0' }, colRefs: xs.map(ref), yRef: y ? ref(y) : null, ...rest }, { context: CTX });
/** @param {any} m @param {string[]} [names] @param {any} [src] */
const derived = (m, names, src = SRC) => evaluateDerived(m, src, names, T);

suite('glm-regression: Model — Schema und Vorgaben', () => {
  test('Verfahren im Schema gleich denen der Rechnung; Textspalten als X wählbar', () => {
    assertDeepEqual([...State.schema.fields.method.values], [...METHODS]);
    const c = State.schema.fields.colRefs;
    assertEqual(c.item.nullable, false);
    assertDeepEqual([...c.item.types], ['numeric', 'currency', 'percent', 'text']);
    assertEqual(State.schema.fields.confLevel.agentWrite, false);
    assertEqual(State.schema.fields.alpha.agentWrite, false);
  });

  test('Vorgaben: Konfidenz/α aus dem Kontext, Schwelle 0,5, Verfahren auto, Reiter Modell', () => {
    const m = new State({ ...CTX, confidenceLevel: 90 });
    assertDeepEqual([m.confLevel, m.alpha], [0.9, 0.1]);
    const d = new State();
    assertDeepEqual([d.confLevel, d.alpha, d.cutoff, d.method, d.activeTab, d.successClass, d.trialsRef], [0.95, 0.05, 0.5, 'auto', 'model', null, null]);
    assertEqual(d.hasContent(), false);
    assertEqual(make([], null, { trialsRef: ref('trials') }).hasContent(), true);
  });

  test('Schwelle nur in [0; 1]', () => {
    const m = make([], null);
    for (const v of [-0.1, 1.1]) assertThrows(() => setFields(m, { cutoff: v }), /cutoff/);
    setFields(m, { cutoff: 1 });
    assertEqual(m.cutoff, 1);
  });
});

suite('glm-regression: Kommandos setConfLevel/setAlpha', () => {
  test('setConfLevel führt α mit, setAlpha die Konfidenz', () => {
    const m = make([], null);
    m.execute({ type: 'setConfLevel', value: 0.9 });
    assertDeepEqual([m.confLevel, m.alpha], [0.9, 0.1]);
    m.execute({ type: 'setAlpha', value: 0.01 });
    assertDeepEqual([m.confLevel, m.alpha], [0.99, 0.01]);
  });

  test('außerhalb (0; 1) abgelehnt, nichts geändert', () => {
    const m = make([], null);
    for (const v of [0, 1, 1.5, -0.2]) {
      assertThrows(() => m.execute({ type: 'setConfLevel', value: v }));
      assertThrows(() => m.execute({ type: 'setAlpha', value: v }));
    }
    assertDeepEqual([m.confLevel, m.alpha], [0.95, 0.05]);
  });
});

suite('glm-regression: Ableitungen', () => {
  test('ohne X oder Y: kein Ergebnis, kein Grund, keine Terme', () => {
    for (const m of [make([], 'bin'), make(['x1'], null)]) {
      const d = derived(m);
      assertDeepEqual([d.result, d.error, d.detection, d.classification, d.successClassInfo], [null, null, null, null, null]);
      assertDeepEqual(d.predictionTerms, []);
      assertEqual(d.canSaveModel, false);
    }
  });

  test('binär: Familie, Erfolgsklasse, Terme, Gleichung, Tafel, Speicherbarkeit', () => {
    const d = derived(make(['x1'], 'bin', { method: 'binomial' }));
    assertDeepEqual(d.result.family, { name: 'binomial', link: 'logit', theta: null });
    assertDeepEqual(d.successClassInfo, { success: 1, failure: 0 });
    assertDeepEqual(d.predictionTerms, ['X1']);
    assertTrue(d.result.equation.startsWith('logit(p) = '));
    assertEqual(d.classification.cutoff, 0.5);
    assertEqual(d.classification.tp + d.classification.fn + d.classification.fp + d.classification.tn, 16);
    assertDeepEqual(d.activeParams, ['method', 'confLevel', 'alpha', 'cutoff']);
    assertEqual(d.canSaveModel, true);
    assertEqual(d.detection, null);
  });

  test('Erfolgsklasse 0 kehrt die Vorzeichen um', () => {
    const a = derived(make(['x1'], 'bin', { method: 'binomial' })).result;
    const b = derived(make(['x1'], 'bin', { method: 'binomial', successClass: 0 }));
    assertDeepEqual(b.successClassInfo, { success: 0, failure: 1 });
    a.coefficients.forEach((c, i) => assertAlmostEqual(b.result.coefficients[i].estimate, -c.estimate, 1e-6));
  });

  test('Schwelle zählt nur die Tafel neu, ohne neuen Fit', () => {
    const m = make(['x1'], 'bin', { method: 'binomial' });
    const a = derived(m, ['classification']).classification;
    const runs = engineRuns();
    setFields(m, { cutoff: 0.9 });
    const b = derived(m, ['classification']).classification;
    assertEqual(engineRuns(), runs);
    assertEqual(b.cutoff, 0.9);
    assertTrue(b.tp + b.fp <= a.tp + a.fp);
  });

  test('Merker: zweimal lesen rechnet einmal; Methodenwechsel rechnet neu', () => {
    const m = make(['x1'], 'count', { method: 'poisson' });
    derived(m);
    const runs = engineRuns();
    derived(m);
    assertEqual(engineRuns(), runs);
    setFields(m, { method: 'negbin' });
    derived(m, ['result']);
    assertEqual(engineRuns(), runs + 1);
  });

  test('Poisson: Überdispersion, keine Tafel, kein ROC-Reiter', () => {
    const m = make(['x1'], 'count', { method: 'poisson', activeTab: 'roc' });
    const d = derived(m);
    assertEqual(d.result.family.name, 'poisson');
    assertTrue(d.result.overdispersion !== null);
    assertEqual(d.classification, null);
    assertEqual(d.effectiveTab, 'model');
    assertDeepEqual(d.activeParams, ['method', 'confLevel', 'alpha']);
    assertEqual(derived(make(['x1'], 'bin', { method: 'binomial', activeTab: 'roc' })).effectiveTab, 'roc');
  });

  test('Auto-Erkennung: binär und Zähldaten, mit Grund als Text', () => {
    const b = derived(make(['x1'], 'bin'));
    assertDeepEqual(b.detection, { reason: 'autoDetectBinary', family: 'binomial', message: '«autoDetectBinary»' });
    assertEqual(b.result.autoReason, 'autoDetectBinary');
    const c = derived(make(['x1'], 'count'));
    assertTrue(['autoDetectPoisson', 'autoDetectNegbin'].includes(c.detection.reason));
  });

  test('Textspalte als X wird kategorial mit Dummy-Term', () => {
    const d = derived(make(['x1', 'grp'], 'count', { method: 'poisson' }));
    assertDeepEqual(d.predictionTerms, ['X1', 'G[b]']);
  });

  test('Gründe: keine binäre Zielgröße, zu wenige Zeilen, Anteile, Versuchszahlen', () => {
    assertEqual(derived(make(['x1'], 'three', { method: 'binomial' })).error.reason, 'errorNotBinary');
    const few = source({ ...COLS, y3: { name: 'Y', type: 'numeric', values: [0, 1, null, null] } });
    assertEqual(derived(make(['x1'], 'y3', { method: 'binomial' }), undefined, few).error.reason, 'errorTooFew');
    assertEqual(derived(make(['x1'], 'big', { method: 'binomial', trialsRef: ref('trials') })).error.reason, 'errorProportionRange');
    const badTrials = source({ ...COLS, tr: { name: 'T', type: 'numeric', values: X1.map(() => 0.5) } });
    assertEqual(derived(make(['x1'], 'share', { method: 'binomial', trialsRef: ref('tr') }), undefined, badTrials).error.reason, 'errorTrialsInvalid');
    const e = derived(make(['x1'], 'three', { method: 'binomial' })).error;
    assertEqual(e.message, '«errorNotBinary»');
  });

  test('gruppiert binomial mit Versuchszahl: keine Erfolgsklasse, Tafel zählt Versuche', () => {
    const d = derived(make(['x1'], 'share', { method: 'binomial', trialsRef: ref('trials') }));
    assertEqual(d.error, null);
    assertEqual(d.successClassInfo, null);
    const c = d.classification;
    assertAlmostEqual(c.tp + c.fn + c.fp + c.tn, 16 * 20, 1e-6);
  });

  test('Versuchszahl auf Y oder unter den X (ohne Mount gesetzt) zählt nicht als Gewicht', () => {
    const plainFit = derived(make(['x1'], 'bin', { method: 'binomial' }));
    const onY = derived(make(['x1'], 'bin', { method: 'binomial', trialsRef: ref('bin') }));
    const onX = derived(make(['x1'], 'bin', { method: 'binomial', trialsRef: ref('x1') }));
    assertEqual(onY.error, null);
    assertDeepEqual(onY.classification, plainFit.classification);
    assertDeepEqual(onX.classification, plainFit.classification);
  });

  test('gelöschte Spalte: Bezug bleibt, Grund errColumnMissing, kein Ergebnis', () => {
    const cols = { ...COLS };
    const src = source(cols);
    const m = make(['x1'], 'bin', { method: 'binomial' });
    assertTrue(derived(m, undefined, src).result !== null);
    delete cols.x1;
    const d = derived(m, undefined, src);
    assertEqual(d.result, null);
    assertEqual(d.error.reason, 'errColumnMissing');
    assertDeepEqual(plain(m.colRefs), [ref('x1')]);
  });

  test('gespeichertes Modell: null ohne Datensatz, sonst mit id und Name', () => {
    assertEqual(derived(make([], null), ['savedModel']).savedModel, null);
    const m = make([], null, { savedModelId: 'm1', savedModelName: 'N', modelRecord: { terms: ['Intercept'], family: { name: 'poisson', link: 'log' } } });
    assertDeepEqual(derived(m, ['savedModel']).savedModel, { id: 'm1', name: 'N', terms: ['Intercept'], family: { name: 'poisson', link: 'log' } });
  });
});

suite('glm-regression: Hilfen der Rechnung', () => {
  test('toNumber wie coerceNumeric: Zahlentexte gelten, Leeres nicht', () => {
    assertDeepEqual(['3', 4, '', ' ', null, 'x', Number.NaN, '1e2'].map(toNumber), [3, 4, null, null, null, null, null, 100]);
  });

  test('fitDataOf: Zeilen ohne Y, ohne X-Wert oder mit Versuchszahl ≤ 0 fallen', () => {
    const fd = fitDataOf({
      xs: [{ name: 'A', type: 'numeric', values: [1, 2, null, 4, 5] }, { name: 'B', type: 'text', values: ['p', '', 'q', 'q', 'p'] }],
      y: { name: 'Y', type: 'numeric', values: [1, 0, 1, 'x', 0] },
      trials: { name: 'T', type: 'numeric', values: [5, 5, 5, 5, 0] },
    });
    assertDeepEqual(fd.y, [1]);
    assertDeepEqual(fd.xCols, [[1], ['p']]);
    assertDeepEqual(fd.weights, [5]);
    assertDeepEqual(fd.xIsCat, [false, true]);
  });

  test('Ereignisse je Prädiktor und Warnung warnFewEvents unter 10', () => {
    assertEqual(eventsPerPredictor([1, 0, 1, 1], null, 2), 1);
    assertEqual(eventsPerPredictor([0.5, 0.25], [4, 8], 2), 4);
    const d = derived(make(['x1'], 'bin', { method: 'binomial' }));
    const w = d.result.warningDetails.find((x) => x.code === 'warnFewEvents');
    assertTrue(Boolean(w));
    assertAlmostEqual(w.values.epv, 7, 1e-9);
    assertTrue(d.result.warnings.some((x) => x.startsWith('«warnFewEvents:{"epv":"7.0"}')));
    assertDeepEqual(warningsOf({ family: { name: 'poisson' }, n: 5, p: 2, iterations: 3 }).map((x) => x.code), ['warnSmallN']);
  });

  test('fixed: feste Stellen, Exponent bei sehr kleinen Werten, Komma im Deutschen', () => {
    assertEqual(fixed(-12.729004, 4, 'en'), '-12.7290');
    assertEqual(fixed(0.5, 4, 'de'), '0,5000');
    assertEqual(fixed(0.00001234, 2, 'en'), '1.23e-5');
    assertEqual(fixed(null, 4, 'en'), '–');
  });

  test('Vorhersage: Texte mit Dezimalkomma gelten, fehlender Term → null', () => {
    const m = make(['x1'], 'bin', { method: 'binomial' });
    const fit = analyze(m, SRC).fit;
    const a = predictFor(fit, { X1: 7.5 });
    const b = predictFor(fit, { X1: '7,5' });
    assertAlmostEqual(a.response, b.response, 1e-12);
    assertTrue(a.response > 0 && a.response < 1);
    assertEqual(predictFor(fit, {}), null);
    assertEqual(predictFor(null, { X1: 1 }), null);
  });

  test('Datensatz: Familie, Terme, kategoriale Stufen; createdAt bleibt', () => {
    const m = make(['x1', 'grp'], 'count', { method: 'poisson', modelRecord: { createdAt: 'alt' } });
    const rec = buildRecord(m, analyze(m, SRC), 'neu');
    assertDeepEqual(rec.family, { name: 'poisson', link: 'log' });
    assertDeepEqual(rec.terms, ['Intercept', 'X1', 'G[b]']);
    assertDeepEqual(rec.factorSpec[1], { name: 'G', kind: 'categorical', levels: ['a', 'b'], reference: 'a' });
    assertDeepEqual(rec.spec.predictors[1], { id: 'G', kind: 'categorical', levels: ['a', 'b'], reference: 'a' });
    assertEqual(rec.df, 16 - 3);
    assertDeepEqual([rec.createdAt, rec.updatedAt, rec.dataSnapshot.trainedAt], ['alt', 'neu', 'neu']);
    assertEqual(rec.responseSpec.sourceColumn, 'ws|sh|count');
    assertEqual(buildRecord(make([], null), analyze(make([], null), SRC), 'x'), null);
    // Der Datensatz passt ins Schema des Felds.
    setFields(m, { modelRecord: rec });
    assertEqual(m.modelRecord.terms.length, 3);
  });
});
