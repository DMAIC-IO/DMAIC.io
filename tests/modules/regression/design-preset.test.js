/**
 * Regression: Übernahme aus dem Versuchsplaner (domain/design-preset.js) und
 * Modelldatensatz (domain/record.js) — die Fälle der Altform
 * (`applyDesignTerms`, `listExperimentImports`, `computeLoFPValue`) und der
 * Datensatz gegen das gespeicherte Modell der Altinstanz aus Task 0.
 */
import { suite, test, assertEqual, assertDeepEqual, assertAlmostEqual, assertTrue } from '../../test-utils.js';
import { experimentOptions, presetFromColumns } from '../../../js/modules/regression/domain/design-preset.js';
import { buildRecord, lofPValueOf, plannerExperiments } from '../../../js/modules/regression/domain/record.js';
import { analyze } from '../../../js/modules/regression/domain/analyze.js';
import { State } from '../../../js/modules/regression/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { storedSource } from '../../helpers/stored-source.js';

const T = (k, p) => (p ? `«${k}:${JSON.stringify(p)}»` : `«${k}»`);
const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const plain = (v) => JSON.parse(JSON.stringify(v));
const ref = (c) => ({ instanceId: 'ws', sheetId: 'sh', columnId: c });

/**
 * Ein Arbeitsblatt mit den Spalten und die Bezüge.
 * @param {any[]} xs Spalten X ({ id, name, values, … })
 * @param {any} y Spalte Y
 */
function sheet(xs, y) {
  const src = storedSource({ ws: { sheets: [{ id: 'sh', name: 'S', state: { columns: [...xs, y] } }] } });
  return { src, refs: { colRefs: xs.map((c) => ref(c.id)), yRef: ref(y.id) } };
}
const num = (id, name, values) => ({ id, name, type: 'numeric', values });

/**
 * Die Vorgabe anwenden und das Model danach (wie `importExperiment`).
 * @param {any[]} xs @param {any} y @param {string[]} terms
 */
function presetState(xs, y, terms) {
  const { src, refs } = sheet(xs, y);
  const p = presetFromColumns(terms, src, refs);
  const m = State.fromJSON({ _schema: { version: '1.0' }, ...refs, polyDegree: p.polyDegree, excludedTerms: p.excludedTerms }, { context: CTX });
  return { p, m, src, d: () => evaluateDerived(m, src, undefined, T) };
}

const BOOK_Y = [91.87, 90.85, 93.13, 93.09, 91.82, 92.90, 93.52, 92.37, 93.39, 92.58,
  94.99, 93.52, 95.20, 94.82, 93.97, 94.23, 94.16, 94.15, 92.80, 93.51];
const BOOK_TIME = [3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4];
const BOOK_CLEANER = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

suite('regression: Vorgabe aus dem Versuch', () => {
  test('Buchbeispiel (Melzer 2019, 14.5): Time·Cleaner bleibt, p ≈ 0,030', () => {
    const { p, d } = presetState([num('t', 'Time', BOOK_TIME), num('c', 'Cleaner', BOOK_CLEANER)], num('y', 'Yield', BOOK_Y), ['M0', 'M1', 'I0_1']);
    assertEqual(p.polyDegree, 2);
    assertDeepEqual([...p.excludedTerms].sort(), ['Cleaner²', 'Time²']);
    assertDeepEqual(p.notice, { aliased: [], saturated: [] });
    const row = d().result.coefficients.find((c) => c.term === 'Time·Cleaner');
    assertAlmostEqual(row.pval, 0.0304, 0.0005);
  });

  test('2-Faktor-CCD, 13 Läufe: volles quadratisches Modell', () => {
    const a = [-1, 1, -1, 1, -1.414, 1.414, 0, 0, 0, 0, 0, 0, 0];
    const b = [-1, -1, 1, 1, 0, 0, -1.414, 1.414, 0, 0, 0, 0, 0];
    const y = a.map((v, i) => 10 + v + 2 * b[i] - v * v + 0.5 * v * b[i] + 0.1 * Math.sin(i));
    const { p, d } = presetState([num('a', 'A', a), num('b', 'B', b)], num('y', 'Y', y), ['M0', 'M1', 'Q0', 'Q1', 'I0_1']);
    assertEqual(p.polyDegree, 2);
    assertDeepEqual(p.excludedTerms, []);
    assertTrue(d().result !== null);
  });

  test('2^(4-1) Res IV mit Wiederholung: vermengte 2FI ausgeschlossen, mit Hinweis', () => {
    const rows = [];
    for (let r = 0; r < 2; r++) for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) rows.push([a, b, c, a * b * c]);
    const cols = ['A', 'B', 'C', 'D'].map((n, j) => num(n.toLowerCase(), n, rows.map((r) => r[j])));
    const y = rows.map((r, i) => 5 + r[0] + r[1] * r[2] + 0.01 * i);
    const { p } = presetState(cols, num('y', 'Y', y), ['M0', 'M1', 'M2', 'M3', 'I0_1', 'I0_2', 'I0_3', 'I1_2', 'I1_3', 'I2_3']);
    assertDeepEqual(p.notice.aliased, [
      { term: 'B·C', with: ['A·D'] },
      { term: 'B·D', with: ['A·C'] },
      { term: 'C·D', with: ['A·B'] },
    ]);
    assertTrue(p.excludedTerms.includes('C·D'));
    assertTrue(!p.excludedTerms.includes('A·B'));
  });

  test('2^2 ohne Wiederholung: Wechselwirkung wegen Sättigung gekürzt; zurückgeholt → errInsufficientDf', () => {
    const { p, m, d } = presetState([num('a', 'A', [-1, 1, -1, 1]), num('b', 'B', [-1, -1, 1, 1])], num('y', 'Y', [10, 14, 11, 21]), ['M0', 'M1', 'I0_1']);
    assertDeepEqual(p.notice.saturated, ['A·B']);
    assertTrue(p.excludedTerms.includes('A·B'));
    m.execute({ type: 'setTerm', term: 'A·B', included: true });
    assertEqual(d().error.reason, 'errInsufficientDf');
  });

  test('PB 12 Läufe / 11 Faktoren: alle 2FI raus, der letzte Haupteffekt gekürzt', () => {
    const seed = [1, 1, -1, 1, 1, 1, -1, -1, -1, 1, -1];
    const rows = [];
    for (let r = 0; r < 11; r++) rows.push(seed.map((_, j) => seed[(j - r + 11) % 11]));
    rows.push(new Array(11).fill(-1));
    const names = 'ABCDEFGHJKL'.split('');
    const cols = names.map((n, j) => num(`x${j}`, n, rows.map((r) => r[j])));
    const y = rows.map((r, i) => r[0] + 0.5 * r[1] + 0.01 * i);
    const terms = [];
    for (let i = 0; i < 11; i++) terms.push(`M${i}`);
    for (let i = 0; i < 11; i++) for (let j = i + 1; j < 11; j++) terms.push(`I${i}_${j}`);
    const { p, d } = presetState(cols, num('y', 'Y', y), terms);
    assertDeepEqual(p.notice.saturated, ['L']);
    assertEqual(d().result.coefficients.some((c) => c.term.includes('·')), false);
  });

  test('fehlende Y-Zeilen: Rang und Freiheitsgrade über die gefilterten Zeilen', () => {
    const { p } = presetState(
      [num('a', 'A', [-1, 1, -1, 1, -1, 1, -1, 1]), num('b', 'B', [-1, -1, 1, 1, -1, -1, 1, 1])],
      num('y', 'Y', [1, 3, 2, 7, 1.2, 3.1, null, null]), ['M0', 'M1', 'I0_1']);
    assertDeepEqual(p.notice.saturated, []);
  });

  test('kategorial mit 3 Stufen: Sättigung zählt die Indikatorspalten', () => {
    const gCol = { id: 'g', name: 'G', type: 'text', values: ['a', 'b', 'c', 'a', 'b', 'c'], meta: { categoricalCoding: { a: 1, b: 2, c: 3 } } };
    const { p } = presetState([num('x', 'X', [-1, -1, -1, 1, 1, 1]), gCol], num('y', 'Y', [1, 2, 3, 4, 6, 9]), ['M0', 'M1', 'I0_1']);
    assertDeepEqual(p.notice.saturated, ['X·G']);
  });

  test('ohne Y, unter drei Zeilen oder ohne Terme: keine Vorgabe (offen wie die Altform)', () => {
    const { src, refs } = sheet([num('a', 'A', [1, 2])], num('y', 'Y', [1, 2]));
    assertEqual(presetFromColumns(['M0'], src, refs), null);
    assertEqual(presetFromColumns(['M0'], src, { ...refs, yRef: null }), null);
    assertEqual(presetFromColumns([], src, refs), null);
  });
});

suite('regression: Übernahme-Optionen', () => {
  /** @param {any} plannedTerms @param {any[]} factors @param {object} [extra] */
  const experiment = (plannedTerms, factors, extra = {}) => ({
    name: 'E', plannedTerms, factors,
    runMatrix: { worksheetRef: { instanceId: 'ws-1', sheetId: 'sheet-1' }, columnTags: { factors: ['f0', 'f1'] } },
    responseColumns: [{ name: 'Y', columnId: 'r' }],
    ...extra,
  });

  test('geplante Terme werden übernommen; alter Datensatz: Haupteffekte + 2FI + Quadrate stetiger Faktoren', () => {
    const neu = experimentOptions([{ plannerId: 'p1', experiment: experiment({ linear: true, terms: ['M0', 'M1', 'I0_1'] }, [{ kind: 'continuous' }, { kind: 'continuous' }]) }]);
    assertDeepEqual(neu[0].designTerms, ['M0', 'M1', 'I0_1']);
    const alt = experimentOptions([{ plannerId: 'p1', experiment: experiment({ linear: true }, [{ kind: 'continuous' }, { kind: 'categorical' }]) }]);
    assertDeepEqual(alt[0].designTerms, ['M0', 'M1', 'Q0', 'I0_1']);
  });

  test('Schlüssel und Quelle je Variante; Planer ohne Versuch bietet nichts', () => {
    const exp = experiment({ linear: true, terms: ['M0', 'M1'] }, [{ kind: 'continuous' }, { kind: 'continuous' }], {
      responseColumns: [{ name: 'Y', columnId: 'r', meanColumnId: 'rm', lnVarColumnId: 'rl' }],
    });
    const opts = experimentOptions([{ plannerId: 'p0', experiment: null }, { plannerId: 'p1', experiment: exp }]);
    assertDeepEqual(opts.map((o) => o.key), ['p1|raw|0', 'p1|mean|0', 'p1|lnvar|0']);
    assertDeepEqual(opts.map((o) => o.label), ['E — Y', 'E — Y (Mean)', 'E — Y (lnVar)']);
    const mean = opts[1];
    assertDeepEqual([mean.experimentId, mean.sourceColumn, mean.transform], ['p1', 'rm', 'mean']);
    assertDeepEqual(mean.yRef, { instanceId: 'ws-1', sheetId: 'sheet-1', columnId: 'rm' });
    assertDeepEqual(mean.factorRefs.map((r) => r.columnId), ['f0', 'f1']);
  });

  test('Planer über den Leser: ein nicht lesbarer zählt als unbekannt', () => {
    const src = {
      list: () => [{ instanceId: 'p1', moduleId: 'doe-planner' }, { instanceId: 'p2', moduleId: 'doe-planner' }, { instanceId: 'w', moduleId: 'worksheet' }],
      read: (id) => { if (id === 'p2') throw Object.assign(new Error('not_loaded'), { code: 'not_loaded' }); return { experiment: { name: 'E' } }; },
      ensureLoaded: async () => true,
    };
    assertDeepEqual(plannerExperiments(/** @type {any} */ (src)), [
      { plannerId: 'p1', experiment: { name: 'E' }, loaded: true },
      { plannerId: 'p2', experiment: null, loaded: false },
    ]);
    const m = State.fromJSON({ _schema: { version: '1.0' }, activeImportSource: { experimentId: 'p2', sourceColumn: 'c', transform: 'identity' } });
    assertEqual(evaluateDerived(m, /** @type {any} */ (src), ['importMissing']).importMissing, false);
    const gone = State.fromJSON({ _schema: { version: '1.0' }, activeImportSource: { experimentId: 'weg', sourceColumn: 'c', transform: 'identity' } });
    assertEqual(evaluateDerived(gone, /** @type {any} */ (src), ['importMissing']).importMissing, true);
  });

  test('Lack-of-Fit über die Wiederholungsgruppen des verknüpften Planers; sonst null', () => {
    const exp = { replicateGroups: [[0, 1], [2, 3]] };
    const r = { yHat: [1, 1, 3, 3, 5], dfRes: 3 };
    const y = [0.9, 1.2, 2.8, 3.1, 5];
    const map = new Map([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]);
    assertEqual(typeof lofPValueOf('p1', [{ plannerId: 'p1', experiment: exp }], r, y, map), 'number');
    assertEqual(lofPValueOf('weg', [{ plannerId: 'p1', experiment: exp }], r, y, map), null);
    assertEqual(lofPValueOf('p1', [{ plannerId: 'p1', experiment: null }], r, y, map), null);
    assertEqual(lofPValueOf(null, [], r, y, map), null);
  });
});

suite('regression: Modelldatensatz', () => {
  /** @param {string} path @returns {Promise<any>} */
  async function fetchJson(path) {
    const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  }

  test('gleiche Daten → gleicher Datensatz wie das gespeicherte Modell der Altform (bis auf Zeitpunkte)', async () => {
    const fx = await fetchJson('./legacy-project.json');
    const p = fx.projects[0];
    const id = '1e9f66c8-6e81-47f1-876b-8796bbf550a5';
    const sheets = Object.fromEntries(Object.entries(p.moduleStates).filter(([, s]) => Array.isArray(/** @type {any} */ (s)?.sheets)));
    const src = storedSource(sheets);
    const m = State.fromJSON(plain(p.moduleStates[id]), { context: CTX });
    const r = analyze(m, src).poly;
    const rec = buildRecord(m, src, r, [], '2026-11-27T00:00:00.000Z');
    const { id: _i, name: _n, createdFromInstanceId: _c, createdAt: _a, updatedAt: _u, ...old } = /** @type {any} */ (Object.values(p.models)[0]);
    const { createdAt, updatedAt, ...neu } = /** @type {any} */ (rec);
    assertEqual(createdAt, '2026-11-27T00:00:00.000Z');
    assertEqual(updatedAt, '2026-11-27T00:00:00.000Z');
    const { trainedAt: _t, ...oldSnap } = old.dataSnapshot;
    const { trainedAt, ...newSnap } = neu.dataSnapshot;
    assertEqual(trainedAt, '2026-11-27T00:00:00.000Z');
    assertDeepEqual(plain({ ...neu, dataSnapshot: newSnap, coef: null }), plain({ ...old, dataSnapshot: oldSnap, coef: null }));
    neu.coef.forEach((c, i) => assertAlmostEqual(c, old.coef[i], 1e-9));
  });

  test('Aktualisieren behält createdAt', () => {
    const src = sheet([num('a', 'A', [1, 2, 3, 4, 5])], num('y', 'Y', [2, 4, 5, 8, 10]));
    const m = State.fromJSON({ _schema: { version: '1.0' }, ...src.refs, modelRecord: { createdAt: 'alt' } }, { context: CTX });
    const rec = buildRecord(m, src.src, analyze(m, src.src).poly, [], 'neu');
    assertEqual(rec.createdAt, 'alt');
    assertEqual(rec.updatedAt, 'neu');
    assertDeepEqual(rec.responseSpec, { sourceColumn: 'ws|sh|y', transform: 'identity', aggregateOver: null });
  });
});
