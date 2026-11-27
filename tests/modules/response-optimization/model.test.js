/**
 * Zielgrößenoptimierung: Model (domain/model.js) — Schema, das Kommando
 * `setSpec` mit Ablehnungen, die Invariante `specBounds` und die
 * Ableitungen über die gespeicherten Modelle der Besitzerinstanzen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../../test-utils.js';
import { State } from '../../../js/modules/response-optimization/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { ownersSource, docWithModels } from './owners.js';

setModelName(State, 'response-optimization');

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
/** Übersetzer-Stub. */
const T = (/** @type {string} */ k, /** @type {any} */ p) => (p ? `«${k}:${JSON.stringify(p)}»` : `«${k}»`);
const plain = (/** @type {any} */ v) => JSON.parse(JSON.stringify(v));

/**
 * Ein schlanker Modelldatensatz.
 * @param {string} id @param {Record<string, any>} [over]
 */
function rec(id, over = {}) {
  return {
    id, name: `Modell ${id}`, termSet: ['Intercept', 'A', 'B'], coef: [1, 2, 3], df: 5, rSqAdj: 0.9, lofPValue: null,
    factorSpec: [{ name: 'A', low: 0, high: 1 }, { name: 'B', low: 0, high: 2 }],
    spec: {
      predictors: [{ id: 'A', kind: 'continuous' }, { id: 'B', kind: 'continuous' }],
      terms: [{ id: 'A', factors: [{ id: 'A', degree: 1 }] }, { id: 'B', factors: [{ id: 'B', degree: 1 }] }],
    },
    dataSnapshot: { X: [[0, 0], [1, 2]], y: [4, 10, 7], factorSpec: [{ name: 'A', low: 0, high: 1 }, { name: 'B', low: 0, high: 2 }], termSet: ['Intercept', 'A', 'B'] },
    ...over,
  };
}

/** @param {any} json @param {any} src */
function derived(json, src) {
  const m = State.fromJSON(json, { context: CTX });
  return { m, d: evaluateDerived(m, src, undefined, T) };
}

suite('response-optimization: Schema und setSpec', () => {
  test('Vorgabe: keine Vorgaben, kein Optimum, kein Inhalt', () => {
    const m = new State(CTX);
    assertDeepEqual(plain(m.specs), {});
    assertEqual(m.optimization, null);
    assertEqual(m.hasContent(), false);
  });

  test('setSpec speichert nur den einen Schlüssel', () => {
    const m = new State(CTX);
    m.setSpec({ modelId: 'm1', key: 'lower', value: 2.5 });
    m.setSpec({ modelId: 'm1', key: 'kind', value: 'target' });
    m.setSpec({ modelId: 'm2', key: 'selected', value: true });
    assertDeepEqual(plain(m.specs), { m1: { lower: 2.5, kind: 'target' }, m2: { selected: true } });
    assertEqual(m.hasContent(), true);
  });

  test('setSpec lehnt Werte ab, die nicht zum Schlüssel passen', () => {
    const m = new State(CTX);
    assertThrows(() => m.setSpec({ modelId: 'm1', key: 'selected', value: 'ja' }));
    assertThrows(() => m.setSpec({ modelId: 'm1', key: 'kind', value: 'gross' }));
    assertThrows(() => m.setSpec({ modelId: 'm1', key: 'lower', value: 'zwei' }));
    assertThrows(() => m.setSpec({ modelId: 'm1', key: 'target', value: Infinity }));
    assertThrows(() => m.setSpec({ modelId: 'm1', key: 'weight', value: 0 }));
    assertThrows(() => m.setSpec({ modelId: 'm1', key: /** @type {any} */ ('shape'), value: 1 }));
    assertThrows(() => m.setSpec({ modelId: '', key: 'lower', value: 1 }));
    assertDeepEqual(plain(m.specs), {});
  });

  test('specBounds: Untergrenze nicht unter der gespeicherten Obergrenze wird abgelehnt', () => {
    const m = new State(CTX);
    m.setSpec({ modelId: 'm1', key: 'upper', value: 5 });
    assertThrows(() => m.setSpec({ modelId: 'm1', key: 'lower', value: 5 }));
    assertDeepEqual(plain(m.specs), { m1: { upper: 5 } });
    m.setSpec({ modelId: 'm1', key: 'lower', value: 4 });
    assertDeepEqual(plain(m.specs), { m1: { upper: 5, lower: 4 } });
  });

  test('specBounds repariert beim Laden: die Obergrenze entfällt', () => {
    const json = { _schema: { version: '1.0' }, specs: { a: { lower: 30, upper: 10, weight: 2 }, b: { lower: 1, upper: 2 } }, optimization: null };
    assertThrows(() => State.fromJSON(plain(json), { context: CTX }));
    const m = State.fromJSON(plain(json), { context: CTX, repair: true });
    assertDeepEqual(plain(m.specs), { a: { lower: 30, weight: 2 }, b: { lower: 1, upper: 2 } });
  });
});

suite('response-optimization: Ableitungen über die Besitzer', () => {
  test('Modelle in Projektreihenfolge mit Besitzer, R², Faktoren und Spanne', () => {
    const src = ownersSource(docWithModels([rec('m1'), rec('m2', { rSqAdj: 0.3 })]));
    const { d } = derived({}, src);
    assertDeepEqual(d.models.map((/** @type {any} */ x) => [x.id, x.instanceId, x.moduleId, x.rSqAdj, x.factorNames, x.yRange]), [
      ['m1', 'own-0', 'regression', 0.9, ['A', 'B'], [4, 10]],
      ['m2', 'own-1', 'regression', 0.3, ['A', 'B'], [4, 10]],
    ]);
    assertDeepEqual(d.selectableModels, [{ id: 'm1', name: 'Modell m1', instanceId: 'own-0' }, { id: 'm2', name: 'Modell m2', instanceId: 'own-1' }]);
    assertDeepEqual(d.unreadOwners, []);
  });

  test('wirksame Vorgaben: gespeicherte Schlüssel über der Saat aus den Trainingswerten', () => {
    const src = ownersSource(docWithModels([rec('m1'), rec('m2', { dataSnapshot: null })]));
    const { d } = derived({ _schema: { version: '1.0' }, specs: { m1: { kind: 'min', upper: 9 } }, optimization: null }, src);
    assertDeepEqual(d.effectiveSpecs, {
      m1: { selected: false, kind: 'min', lower: 4, upper: 9, target: 7, weight: 1 },
      m2: { selected: false, kind: 'max', lower: 0, upper: 1, target: 0.5, weight: 1 },
    });
  });

  test('Sperrgründe, canOptimize und fehlende Modelle', () => {
    const doc = docWithModels([rec('m1'), rec('m2', { rSqAdj: 0.3, lofPValue: 0.01 }), rec('m3', { factorSpec: [{ name: 'C', low: 0, high: 1 }] })]);
    const src = ownersSource(doc);
    const none = derived({}, src).d;
    assertDeepEqual([none.canOptimize, none.diagnosticReasons], [false, []]);

    const one = derived({ _schema: { version: '1.0' }, specs: { m1: { selected: true }, gone: { selected: true } }, optimization: null }, src).d;
    assertDeepEqual([one.canOptimize, one.diagnosticReasons, one.missingModels], [true, [], ['gone']]);

    const bad = derived({ _schema: { version: '1.0' }, specs: { m2: { selected: true }, m1: { selected: true }, m3: { selected: true } }, optimization: null }, src).d;
    assertEqual(bad.canOptimize, false);
    assertDeepEqual(bad.diagnosticReasons, [
      `«lowR2:${JSON.stringify({ name: 'Modell m2', value: '0.300' })}»`,
      `«lackOfFit:${JSON.stringify({ name: 'Modell m2', value: '0.010' })}»`,
      `«factorMismatch:${JSON.stringify({ name: 'Modell m3' })}»`,
    ]);
  });

  test('Ergebnis und veraltetes Ergebnis', () => {
    const opt = { modelRefs: ['m1', 'm9'], result: { xOpt: [0, 'a'], yPredictions: [1, null], dPerResponse: [1, 0], D: 0.5, factorNames: ['A', 'G'], modelNames: ['x', 'y'], iter: 3 } };
    const src = ownersSource(docWithModels([rec('m1')]));
    const { d } = derived({ _schema: { version: '1.0' }, specs: {}, optimization: opt }, src);
    assertDeepEqual(d.result, opt.result);
    assertEqual(d.resultStale, true);
    const ok = derived({ _schema: { version: '1.0' }, specs: {}, optimization: { ...opt, modelRefs: ['m1'] } }, src).d;
    assertEqual(ok.resultStale, false);
    assertEqual(derived({}, src).d.result, null);
  });

  test('ungelesene Besitzer: kein fehlendes Modell, kein veraltetes Ergebnis', () => {
    const doc = docWithModels([rec('m1')]);
    const src = ownersSource(doc, { unloaded: ['regression'] });
    const { d } = derived({ _schema: { version: '1.0' }, specs: { m1: { selected: true } }, optimization: { modelRefs: ['m1'], result: { xOpt: [], yPredictions: [], dPerResponse: [], D: 1, factorNames: [], modelNames: [], iter: 0 } } }, src);
    assertDeepEqual([d.models, d.unreadOwners, d.missingModels, d.resultStale, d.canOptimize], [[], ['own-0'], [], false, false]);
  });

  test('ein gewähltes Modell mit ungelesenem Besitzer sperrt das Optimieren der übrigen', () => {
    const doc = docWithModels([rec('m1')]);
    doc.phases.improve.push({ instanceId: 'glm-0', moduleId: 'glm-regression' });
    const src = ownersSource(doc, { unloaded: ['glm-regression'] });
    const both = derived({ _schema: { version: '1.0' }, specs: { m1: { selected: true }, g1: { selected: true } }, optimization: null }, src).d;
    assertDeepEqual([both.unreadOwners, both.canOptimize], [['glm-0'], false]);
    const onlyRead = derived({ _schema: { version: '1.0' }, specs: { m1: { selected: true }, g1: { selected: false } }, optimization: null }, src).d;
    assertEqual(onlyRead.canOptimize, true);
  });

  test('eine kopierte Besitzerinstanz mit derselben Modell-id zählt einmal', () => {
    const doc = docWithModels([rec('m1'), rec('m1', { name: 'Kopie' })]);
    const { d } = derived({}, ownersSource(doc));
    assertDeepEqual(d.selectableModels, [{ id: 'm1', name: 'Modell m1', instanceId: 'own-0' }]);
  });

  test('GLM-Modelle mit Familie und kategorialem Faktor sind wählbar', () => {
    const glm = rec('g1', {
      family: { name: 'binomial', link: 'logit' }, terms: ['Intercept', 'A'],
      factorSpec: [{ name: 'G', kind: 'categorical', levels: ['a', 'b'], reference: 'a' }],
      spec: { predictors: [{ id: 'G', kind: 'categorical', levels: ['a', 'b'], reference: 'a' }], terms: [] },
      dataSnapshot: { X: [[0], [1]], y: [0, 1], factorSpec: [{ name: 'G', kind: 'categorical', levels: ['a', 'b'], reference: 'a' }], termSet: ['Intercept', 'G_b'] },
    });
    const { d } = derived({}, ownersSource(docWithModels([glm], 'glm-regression')));
    assertDeepEqual(d.models.map((/** @type {any} */ x) => [x.id, x.moduleId, x.factorNames, x.yRange]), [['g1', 'glm-regression', ['G'], [0, 1]]]);
  });

  test('ohne Besitzer keine Modelle; andere Module werden nicht gelesen', () => {
    const doc = { phases: { data: [{ instanceId: 'ws', moduleId: 'worksheet' }] }, moduleStates: {} };
    const src = ownersSource(doc);
    const { d } = derived({}, src);
    assertDeepEqual([d.models, d.selectableModels, d.canOptimize], [[], [], false]);
    assertTrue(!src.reads.includes('ws'));
  });
});
