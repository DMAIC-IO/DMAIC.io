/**
 * Regression: Migration '0→1.0' (domain/migrations.js) — die Fälle des alten
 * `fromJSON`, fehlend gegen `null`, die Übernahme des gespeicherten Modells
 * aus den Projektschlüsseln und die Altinstanzen aus Task 0 gegen das
 * `read()` der Altform.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertAlmostEqual, assertTrue } from '../../test-utils.js';
import { from0, recordFromLegacy } from '../../../js/modules/regression/domain/migrations.js';
import { State } from '../../../js/modules/regression/domain/model.js';
import { noticeBasis } from '../../../js/modules/regression/domain/columns.js';
import { adoptProjectModels } from '../../../js/core/project-models.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { storedSource } from '../../helpers/stored-source.js';

setModelName(State, 'regression');

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

suite('regression: Migration 0→1.0', () => {
  test('Spalten: leere und unvollständige Bezüge fallen; yKey wird ein Bezug', () => {
    const out = from0({ colRefs: [r('a'), null, { instanceId: 'w', columnId: 'b' }], yKey: 'w|s|y' });
    assertDeepEqual(out.colRefs, [r('a')]);
    assertDeepEqual(out.yRef, r('y'));
    for (const bad of [null, 'w|s', 'w||y', 5, 'a|b|c|d']) assertEqual(from0({ yKey: bad }).yRef, null, String(bad));
  });

  test('Enums wie fromJSON: unbekannt → Vorgabe der Altform', () => {
    const out = from0({ regType: 'cubic', polyDegree: 4, activeTab: 'bogus' });
    assertEqual(out.regType, 'polynomial');
    assertEqual(out.polyDegree, 1);
    assertEqual(out.activeTab, 'scatter');
    const ok = from0({ regType: 'power', polyDegree: 3, activeTab: 'ss-pie' });
    assertDeepEqual([ok.regType, ok.polyDegree, ok.activeTab], ['power', 3, 'ss-pie']);
  });

  test('Konfidenz/α: null → 0,95/0,05, fehlend oder außerhalb (0; 1) → Vorgabe', () => {
    assertDeepEqual([from0({ confLevel: null, alpha: null }).confLevel, from0({ confLevel: null, alpha: null }).alpha], [0.95, 0.05]);
    const missing = from0({});
    assertTrue(!('confLevel' in missing) && !('alpha' in missing));
    const out = from0({ confLevel: 1.5, alpha: 0 });
    assertTrue(!('confLevel' in out) && !('alpha' in out));
    assertDeepEqual([from0({ confLevel: 0.9, alpha: 0.1 }).confLevel, from0({ confLevel: 0.9, alpha: 0.1 }).alpha], [0.9, 0.1]);
    const m = State.fromJSON({ confLevel: 1.5 }, { context: { ...CTX, confidenceLevel: 90 } });
    assertEqual(m.confLevel, 0.9);
    assertEqual(m.alpha, 0.1);
  });

  test('Schalter wie fromJSON: showCI an, showPI und Sortierung aus', () => {
    const out = from0({});
    assertDeepEqual([out.showCI, out.showPI, out.coefSortByP], [true, false, false]);
    const on = from0({ showCI: false, showPI: true, coefSortByP: true });
    assertDeepEqual([on.showCI, on.showPI, on.coefSortByP], [false, true, true]);
  });

  test('Hinweis bekommt die Basis des Altstands; ohne Listen entfällt er', () => {
    const json = { colRefs: [r('a')], yKey: 'w|s|y', polyDegree: 2, designNotice: { aliased: [{ term: 'A²', with: ['Intercept'] }, { with: [] }], saturated: ['B', 3] } };
    const out = from0(json);
    assertDeepEqual(out.designNotice, { aliased: [{ term: 'A²', with: ['Intercept'] }], saturated: ['B'], basis: noticeBasis([r('a')], r('y'), 2) });
    assertEqual(from0({ designNotice: { aliased: 'x' } }).designNotice, null);
  });

  test('Übernahmequelle: unbekannte Variante → identity; unvollständig → null', () => {
    assertDeepEqual(from0({ activeImportSource: { experimentId: 'p', sourceColumn: 'c', transform: 'log' } }).activeImportSource,
      { experimentId: 'p', sourceColumn: 'c', transform: 'identity' });
    assertEqual(from0({ activeImportSource: { experimentId: 'p' } }).activeImportSource, null);
  });

  test('Ergebnisse und offene Vorgabe entfallen, fremde Schlüssel auch', () => {
    const out = from0({ result: { R2: 1 }, perXResults: {}, designTerms: ['M0'], fremd: 1 });
    for (const k of ['result', 'perXResults', 'designTerms', 'fremd']) assertTrue(!(k in out), k);
    const m = State.fromJSON({ result: { R2: 1 }, designTerms: ['M0'] }, { context: CTX });
    assertTrue(!('result' in m.toJSON()) && !('designTerms' in m.toJSON()));
  });

  test('savedModel wird modelRecord ohne id, Name und Besitzer; unbekannte Schlüssel fallen', () => {
    const rec = recordFromLegacy({ id: 'm', name: 'N', createdFromInstanceId: 'i', coef: [1, 'x'], df: 3, dataHash: 'ab', fremd: 1, spec: 5 });
    assertDeepEqual(rec, { coef: [1, null], df: 3, dataHash: 'ab', spec: null });
    assertEqual(from0({}).modelRecord, null);
  });
});

suite('regression: Altinstanzen aus Task 0 gegen das read() der Altform', () => {
  /** @returns {Promise<{ states: Record<string, any>, src: any, legacy: any, models: any }>} */
  async function load() {
    const fx = await fetchJson('./legacy-project.json');
    const legacy = await fetchJson('./legacy-read.json');
    const p = fx.projects[0];
    const { doc } = adoptProjectModels(plain({ phases: p.phases, moduleStates: p.moduleStates, models: p.models }), { phaseFor: () => 'improve' });
    const sheets = Object.fromEntries(Object.entries(doc.moduleStates).filter(([, s]) => Array.isArray(s?.sheets)));
    return { states: doc.moduleStates, src: storedSource(sheets), legacy, models: p.models };
  }
  const REG = ['1e9f66c8-6e81-47f1-876b-8796bbf550a5', 'd10fc479-6ba2-4f14-9d65-424142cd9b19',
    '4074bc8b-f117-45b0-9f19-5f5548131036', 'b7d4e2a0-4444-4c1d-9e2f-0a1b2c3d4e5f'];

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
    for (const id of REG) {
      const m = State.fromJSON(plain(states[id]), { context: CTX });
      assertEqual(m.toJSON()._schema.version, '1.0', id);
    }
  });

  test('Eingaben, Konfidenz, Ergebnis, Terme, Grade und Speicherbarkeit wie die Altform', async () => {
    const { states, src, legacy } = await load();
    for (const id of REG) {
      const m = State.fromJSON(plain(states[id]), { context: CTX });
      const d = evaluateDerived(m, src, undefined, T);
      const old = legacy[id];
      assertDeepEqual(plain(m.colRefs), old.colRefs, `${id} colRefs`);
      assertEqual(m.yRef ? `${m.yRef.instanceId}|${m.yRef.sheetId}|${m.yRef.columnId}` : null, old.yKey, `${id} yKey`);
      assertDeepEqual([m.regType, m.polyDegree, m.confLevel, m.alpha], [old.regType, old.polyDegree, old.confLevel, old.alpha], `${id} Parameter`);
      assertDeepEqual(plain(m.excludedTerms), old.excludedTerms, `${id} excludedTerms`);
      near(d.result, old.result, `${id} result`);
      assertDeepEqual(d.terms, old.terms, `${id} terms`);
      assertDeepEqual(d.activeDegrees, old.activeDegrees, `${id} activeDegrees`);
      assertDeepEqual(d.perXKeys, old.perXKeys, `${id} perXKeys`);
      assertEqual(d.activeX, old.activeXKey, `${id} activeX`);
      assertDeepEqual(d.predictors, old.predictors, `${id} predictors`);
      assertEqual(d.canSaveModel, old.canSaveModel, `${id} canSaveModel`);
      assertEqual(d.error, null, `${id} error`);
      assertDeepEqual(d.effectiveDesignNotice, old.designNotice, `${id} designNotice`);
      assertEqual(m.savedModelId, old.savedModelId, `${id} savedModelId`);
    }
  });

  test('(a) trägt das gespeicherte Modell als Momentaufnahme, unverändert', async () => {
    const { states, models } = await load();
    const id = REG[0];
    const m = State.fromJSON(plain(states[id]), { context: CTX });
    const d = evaluateDerived(m, storedSource({}), ['savedModel'], T);
    const { createdFromInstanceId: _c, ...want } = /** @type {any} */ (Object.values(models)[0]);
    assertDeepEqual(plain(d.savedModel), plain(want));
  });

  test('(d) offene Vorgabe entfällt, Reiter „bogus“ wird scatter', async () => {
    const { states } = await load();
    const raw = states[REG[3]];
    assert(Array.isArray(raw.designTerms));
    const m = State.fromJSON(plain(raw), { context: CTX });
    assertEqual(m.activeTab, 'scatter');
    assertTrue(!('designTerms' in m.toJSON()));
    assertEqual(m.yRef, null);
  });
});
