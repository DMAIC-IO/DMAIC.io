/**
 * GLM-Regression: Migration '0→1.0' (domain/migrations.js) — die Fälle des
 * alten `fromJSON`, die Kopplung von Konfidenz und α, die Übernahme des
 * gespeicherten Modells aus den Projektschlüsseln und die Altinstanzen aus
 * Task 0 gegen das `read()` der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual, assertAlmostEqual, assertTrue } from '../../test-utils.js';
import { from0, recordFromLegacy } from '../../../js/modules/glm-regression/domain/migrations.js';
import { State } from '../../../js/modules/glm-regression/domain/model.js';
import { analyze } from '../../../js/modules/glm-regression/domain/analyze.js';
import { buildRecord } from '../../../js/modules/glm-regression/domain/record.js';
import { adoptProjectModels } from '../../../js/core/project-models.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { storedSource } from '../../helpers/stored-source.js';

setModelName(State, 'glm-regression');

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const r = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const plain = (v) => JSON.parse(JSON.stringify(v));
/** Übersetzer-Stub. */
const T = (k, p) => (p ? `«${k}:${JSON.stringify(p)}»` : `«${k}»`);

/** @param {string} path @returns {Promise<any>} */
async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

suite('glm-regression: Migration 0→1.0', () => {
  test('Spalten: leere Bezüge fallen; yKey und trialsKey werden Bezüge', () => {
    const out = from0({ colRefs: [r('a'), null, { instanceId: 'w', columnId: 'b' }], yKey: 'w|s|y', trialsKey: 'w|s|t' });
    assertDeepEqual(out.colRefs, [r('a')]);
    assertDeepEqual(out.yRef, r('y'));
    assertDeepEqual(out.trialsRef, r('t'));
    for (const bad of [null, 'w|s', 'w||y', 5]) {
      assertEqual(from0({ yKey: bad }).yRef, null, String(bad));
      assertEqual(from0({ trialsKey: bad }).trialsRef, null, String(bad));
    }
  });

  test('Verfahren, Reiter, Erfolgsklasse und Schwelle wie fromJSON', () => {
    const out = from0({ method: 'gamma', activeTab: 'bogus', successClass: '1', cutoff: 1.4 });
    assertDeepEqual([out.method, out.activeTab, out.successClass, out.cutoff], ['auto', 'model', null, 0.5]);
    const ok = from0({ method: 'negbin', activeTab: 'roc', successClass: 0, cutoff: 0 });
    assertDeepEqual([ok.method, ok.activeTab, ok.successClass, ok.cutoff], ['negbin', 'roc', 0, 0]);
    assertEqual(from0({ cutoff: -0.1 }).cutoff, 0.5);
  });

  test('Konfidenz/α: einer gültig → der andere als 1 − x; keiner → Vorgabe', () => {
    assertDeepEqual([from0({ confLevel: 0.9 }).confLevel, from0({ confLevel: 0.9 }).alpha], [0.9, 0.1]);
    assertDeepEqual([from0({ alpha: 0.01, confLevel: 2 }).confLevel, from0({ alpha: 0.01, confLevel: 2 }).alpha], [0.99, 0.01]);
    const both = from0({ confLevel: 0.9, alpha: 0.05 });
    assertDeepEqual([both.confLevel, both.alpha], [0.9, 0.05]);
    for (const json of [{}, { confLevel: null, alpha: null }, { confLevel: 0, alpha: 1 }]) {
      const out = from0(json);
      assertTrue(!('confLevel' in out) && !('alpha' in out), JSON.stringify(json));
    }
    const m = State.fromJSON({ confLevel: null }, { context: { ...CTX, confidenceLevel: 90 } });
    assertDeepEqual([m.confLevel, m.alpha], [0.9, 0.1]);
  });

  test('schlankes Ergebnis und fremde Schlüssel entfallen', () => {
    const out = from0({ result: { _slim: true }, fremd: 1 });
    assertTrue(!('result' in out) && !('fremd' in out));
    const m = State.fromJSON({ result: { converged: true } }, { context: CTX });
    assertTrue(!('result' in m.toJSON()));
  });

  test('savedModel wird modelRecord ohne id, Name und Besitzer; Familie und Terme bleiben', () => {
    const rec = recordFromLegacy({
      id: 'm', name: 'N', createdFromInstanceId: 'i', family: { name: 'negbin', link: 'log', theta: 2 }, terms: ['Intercept', 'A', 3],
      coef: [1, 'x'], factorSpec: [{ name: 'G', kind: 'categorical', levels: ['a', 'b'], reference: 'a' }, { name: 'A', kind: 'continuous', low: 1, high: 'x' }],
      fremd: 1,
    });
    assertDeepEqual(rec, {
      family: { name: 'negbin', link: 'log', theta: 2 }, terms: ['Intercept', 'A'], coef: [1, null],
      factorSpec: [{ name: 'G', kind: 'categorical', levels: ['a', 'b'], reference: 'a' }, { name: 'A', kind: 'continuous', low: 1, high: null }],
    });
    assertDeepEqual(recordFromLegacy({ family: { name: 'poisson' } }), {});
    // Eine Textspalte mit Zahlen: die Altform schrieb die Stufen als Zahlen.
    assertDeepEqual(recordFromLegacy({ factorSpec: [{ name: 'L', kind: 'categorical', levels: [1, 2, null], reference: 1 }] }).factorSpec,
      [{ name: 'L', kind: 'categorical', levels: ['1', '2'], reference: '1' }]);
    assertEqual(from0({}).modelRecord, null);
  });
});

suite('glm-regression: Altinstanzen aus Task 0 gegen das read() der Altform', () => {
  /** @returns {Promise<{ states: Record<string, any>, src: any, legacy: any, models: any }>} */
  async function load() {
    const fx = await fetchJson('./legacy-project.json');
    const legacy = await fetchJson('./legacy-read.json');
    const p = fx.projects[0];
    const { doc } = adoptProjectModels(plain({ phases: p.phases, moduleStates: p.moduleStates, models: p.models }), { phaseFor: () => 'improve' });
    const sheets = Object.fromEntries(Object.entries(doc.moduleStates).filter(([, s]) => Array.isArray(s?.sheets)));
    return { states: doc.moduleStates, src: storedSource(sheets), legacy, models: p.models };
  }
  const A = 'f4309ced-02f5-458f-a437-1d0b99aec268';
  const B = 'b89de374-73ea-4784-8bb2-a118084aaf72';
  const key = (/** @type {any} */ x) => (x ? `${x.instanceId}|${x.sheetId}|${x.columnId}` : null);

  /**
   * Zahlen bis auf Rundung gleich, sonst gleich.
   * @param {any} a @param {any} b @param {string} at
   */
  function near(a, b, at) {
    if (typeof a === 'number' && typeof b === 'number') { assertAlmostEqual(a, b, 1e-9 * Math.max(1, Math.abs(b)), at); return; }
    if (Array.isArray(b)) { assertEqual(a?.length, b.length, `${at} Länge`); b.forEach((v, i) => near(a[i], v, `${at}[${i}]`)); return; }
    if (b && typeof b === 'object') {
      assertDeepEqual(Object.keys(a ?? {}).sort(), Object.keys(b).sort(), `${at} Schlüssel`);
      for (const k of Object.keys(b)) near(a[k], b[k], `${at}.${k}`);
      return;
    }
    assertEqual(a, b, at);
  }

  test('Laden ohne Reparatur: jede Altinstanz migriert streng', async () => {
    const { states } = await load();
    for (const id of [A, B]) {
      const m = State.fromJSON(plain(states[id]), { context: CTX });
      assertEqual(m.toJSON()._schema.version, '1.0', id);
    }
  });

  test('Eingaben, Ergebnis, Tafel, Erfolgsklasse, Terme und Parameter wie die Altform', async () => {
    const { states, src, legacy } = await load();
    for (const id of [A, B]) {
      const m = State.fromJSON(plain(states[id]), { context: CTX });
      const d = evaluateDerived(m, src, undefined, T);
      const old = legacy[id];
      assertDeepEqual(plain(m.colRefs), old.colRefs, `${id} colRefs`);
      assertEqual(key(m.yRef), old.yKey, `${id} yKey`);
      assertEqual(key(m.trialsRef), old.trialsKey, `${id} trialsKey`);
      assertDeepEqual([m.method, m.confLevel, m.cutoff], [old.method, old.confLevel, old.cutoff], `${id} Parameter`);
      near(d.result, old.result, `${id} result`);
      near(d.classification, old.classification, `${id} classification`);
      assertDeepEqual(d.successClassInfo, old.successClass, `${id} successClass`);
      assertDeepEqual(d.activeParams, old.activeParams, `${id} activeParams`);
      assertDeepEqual(d.predictionTerms, old.predictionTerms, `${id} predictionTerms`);
      assertEqual(d.error, null, `${id} error`);
      assertEqual(old.errorMsg, '', `${id} errorMsg`);
      assertEqual(m.savedModelId, old.savedModelId, `${id} savedModelId`);
    }
  });

  test('α: (a) wie die Altform; (b) ohne gespeichertes α folgt es der Konfidenz (Abweichung)', async () => {
    const { states, legacy } = await load();
    assertEqual(State.fromJSON(plain(states[A]), { context: CTX }).alpha, legacy[A].alpha);
    assertTrue(!('alpha' in states[B]));
    assertEqual(legacy[B].alpha, 0.05);
    assertEqual(State.fromJSON(plain(states[B]), { context: CTX }).alpha, 0.1);
  });

  test('(a) trägt das gespeicherte Modell als Momentaufnahme, unverändert; Reiter und Schwelle bleiben', async () => {
    const { states, models } = await load();
    const m = State.fromJSON(plain(states[A]), { context: CTX });
    assertDeepEqual([m.activeTab, m.cutoff], ['diagnostics', 0.4]);
    const d = evaluateDerived(m, storedSource({}), ['savedModel'], T);
    const { createdFromInstanceId: _c, ...want } = /** @type {any} */ (Object.values(models)[0]);
    assertDeepEqual(plain(d.savedModel), plain(want));
  });

  test('(a) der neu gebaute Datensatz gleicht dem Altdatensatz bis auf Zeitpunkte', async () => {
    const { states, src, models } = await load();
    const m = State.fromJSON(plain(states[A]), { context: CTX });
    const rec = buildRecord(m, analyze(m, src), '2026-11-27T00:00:00.000Z');
    const { id: _i, name: _n, createdFromInstanceId: _c, createdAt, updatedAt: _u, ...old } = /** @type {any} */ (Object.values(models)[0]);
    const { createdAt: c2, updatedAt: u2, ...neu } = /** @type {any} */ (rec);
    assertEqual(c2, createdAt);
    assertEqual(u2, '2026-11-27T00:00:00.000Z');
    const { trainedAt: _t, ...oldSnap } = old.dataSnapshot;
    const { trainedAt, ...newSnap } = neu.dataSnapshot;
    assertEqual(trainedAt, '2026-11-27T00:00:00.000Z');
    near(plain({ ...neu, dataSnapshot: newSnap }), plain({ ...old, dataSnapshot: oldSnap }), 'record');
  });
});
