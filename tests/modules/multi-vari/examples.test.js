/**
 * D.Mike — Multi-Vari: Beispiele der Modulablage.
 *
 * Die drei Beispiele liegen unter `resources/examples/`; ihre Projektdateien
 * behalten die flache Altform. `fromExample` übersetzt sie in die Form des
 * Models, dann hängt `rewriteColumnRefs` die Spalten um — erst danach zeigen
 * die Spaltenwähler auf das bereitgestellte Arbeitsblatt. Die Rechnung
 * (`analyze`) liefert je Beispiel die Kennzahlen, auf die der Katalogtext
 * verweist (Balance, leere Zellen, Löwenanteil, Darstellungsgrenze).
 */

import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertAlmostEqual } from '../../test-utils.js';
import { rewriteColumnRefs } from '../../../js/core/model.js';
import { State } from '../../../js/modules/multi-vari/domain/model.js';
import { analyze, pickLargestTerm } from '../../../js/modules/multi-vari/domain/analysis.js';
import { fromExample } from '../../../js/modules/multi-vari/io/example.js';

const BASE = '../../../js/modules/multi-vari/resources/examples/';

async function fetchJson(relPath) {
  const url = new URL(relPath, import.meta.url);
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

function sheetColumns(worksheetJson) {
  return Object.fromEntries(worksheetJson.sheets[0].state.columns.map(c => [c.id, c]));
}

function termPercent(terms, id) {
  const t = terms.find(x => x.id === id);
  assertTrue(!!t, `term ${id} not found in ${JSON.stringify(terms.map(x => x.id))}`);
  return t.percent;
}

/**
 * Den Ladeweg des Moduls nachbilden: Projektdatei, fromExample, Spalten
 * umhängen, Model laden, dann aus dem Arbeitsblatt rechnen.
 * @param {string} name Beispiel-Id
 */
async function load(name) {
  const data = await fetchJson(`${BASE}projects/${name}.json`);
  const ws = await fetchJson(`${BASE}${data.sourceWorksheetFile}`);
  const out = fromExample(data, { id: name }, { csvToWorksheet: () => null });
  assertEqual(out.sourceWorksheetData, undefined, 'Arbeitsblatt kommt aus der Registry, nicht aus fromExample');
  const rewritten = rewriteColumnRefs(State, out, '__source__', 'ws1');
  const model = State.fromJSON(rewritten);
  const cols = sheetColumns(ws);
  const pick = (ref) => {
    assertEqual(ref.instanceId, 'ws1', 'Spaltenbezug zeigt auf das Arbeitsblatt');
    const c = cols[ref.columnId];
    assertTrue(!!c, `Spalte ${ref.columnId} fehlt im Arbeitsblatt`);
    return { values: c.values, name: c.name };
  };
  assertTrue(model.measurement !== null, 'Messwertspalte gesetzt');
  const run = analyze({
    measurement: pick(model.measurement),
    factors: model.factors.map(f => pick(f.ref)),
    modelForm: model.modelForm, estimator: model.estimator,
  });
  return { model, run, ws, cols };
}

/** Gesamtmittel je Beispiel (Mittel der Messwertspalte). */
const GRAND = { spritzguss: 2.2191666666666667, abfuellanlage: 501.42142857142863, pressen: 10.043948717948714 };
const PRESSEN = { n: 78, largest: 'B', warnings: ['tooManySeriesLevels'] };

const IDS = ['multi-vari-spritzguss', 'multi-vari-abfuellanlage', 'multi-vari-pressen'];

suite('multi-vari Beispiele: Ablage und Katalog', () => {
  test('die drei Beispiele stehen in der Modulablage, nicht im Gesamtkatalog', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map(e => e.id), IDS);
    own.examples.forEach((e) => {
      assertEqual(e.type, 'project');
      assertEqual(e.format, 'json');
      assertEqual(e.file, `projects/${e.id}.json`);
      assertEqual(typeof e.title.de, 'string');
      assertEqual(typeof e.title.en, 'string');
      assertEqual(typeof e.description.de, 'string');
      assertEqual(typeof e.description.en, 'string');
    });
    const abfuell = own.examples.find(e => e.id === 'multi-vari-abfuellanlage');
    assertTrue(abfuell.description.de.includes('fehlenden Kombination'));
    assertTrue(abfuell.description.en.includes('missing combination'));
    const catalog = await fetchJson('../../../examples/index.json');
    assertEqual(catalog.examples.filter(e => IDS.includes(e.id)).length, 0);
  });
});

suite('fromExample: flache Altform wird zur Form des Models', () => {
  test('Spaltenbezüge zeigen nach dem Umhängen auf das Arbeitsblatt', async () => {
    const { model } = await load('multi-vari-spritzguss');
    assertEqual(model.measurement.columnId, 'c-wand');
    assertDeepEqual(model.factors.map(f => f.ref.columnId), ['c-schicht', 'c-nest', 'c-teil']);
    assertEqual(new Set(model.factors.map(f => f.id)).size, 3);
    assertEqual(model.modelForm, 'nested');
    assertEqual(model.estimator, 'anova');
  });

  test('Fremdes und Leeres: eigene Form geht durch, Arbeitsblatt bleibt erhalten', () => {
    const own = State.fromJSON({ factorRows: [{ id: 'a', ref: null }, { id: 'b', ref: null }] }).toJSON();
    assertDeepEqual(fromExample(own, {}, { csvToWorksheet: () => null }), own);
    const ws = { sheets: [] };
    const out = fromExample({ columnRefs: {}, sourceWorksheetData: ws }, {}, { csvToWorksheet: () => null });
    assertEqual(out.sourceWorksheetData, ws);
  });
});

suite('multi-vari-spritzguss: Rechnung', () => {
  test('24 Zeilen, balanciert, ohne Warnung; größter Anteil am Werkzeugnest', async () => {
    const { run, cols } = await load('multi-vari-spritzguss');
    assertEqual(cols['c-schicht'].values.length, 24);
    assertEqual(run.error, null);
    const { result } = run;
    assertEqual(result.n, 24);
    assertEqual(result.droppedRows, 0);
    assertTrue(result.balanced, 'expected the Spritzguss design to be balanced');
    assertDeepEqual(result.warnings, [], `expected no warnings, got ${JSON.stringify(result.warnings)}`);
    result.vc.terms.forEach(t => assertTrue(!t.clamped, `expected no clamped term, got ${t.id}`));
    const terms = result.vc.terms;
    assertAlmostEqual(termPercent(terms, 'A'), 32.830205887049246, 1e-6, 'Schicht (A) percent');
    assertAlmostEqual(termPercent(terms, 'B(A)'), 64.98096171823687, 1e-6, 'Werkzeugnest (B(A)) percent');
    assertAlmostEqual(termPercent(terms, 'C(AB)'), 1.9425887503192203, 1e-6, 'Teil (C(AB)) percent');
    assertAlmostEqual(termPercent(terms, 'Error'), 0.24624364439468407, 1e-6, 'Error percent');
    assertEqual(pickLargestTerm(terms).id, 'B(A)');
    assertAlmostEqual(result.grandMean, GRAND.spritzguss, 1e-9, 'Gesamtmittel');
  });
});

suite('multi-vari-abfuellanlage: Rechnung', () => {
  test('14 Zeilen, unbalanciert mit einer leeren Zelle, REML konvergiert', async () => {
    const { run, cols } = await load('multi-vari-abfuellanlage');
    assertEqual(cols['c-maschine'].values.length, 14);
    const rows = cols['c-maschine'].values.map((_, i) => [
      cols['c-maschine'].values[i], cols['c-schicht'].values[i], cols['c-charge'].values[i],
    ]);
    assertTrue(!rows.some(([m, s, c]) => m === 'M2' && s === 'Spät' && c === 'C2'), 'expected (M2, Spät, C2) to be entirely absent');
    assertEqual(run.error, null);
    const { result } = run;
    assertEqual(result.n, 14);
    assertEqual(result.droppedRows, 0);
    assertTrue(result.balanced === false, 'expected the Abfüllanlage design to be unbalanced');
    assertDeepEqual([...result.warnings].sort(), ['aliasedTerms', 'emptyCells', 'unbalanced']);
    assertTrue(result.vc.converged, 'expected the REML fit to converge');
    const terms = result.vc.terms;
    assertAlmostEqual(termPercent(terms, 'A'), 81.49270013066668, 1e-6, 'Maschine (A) percent');
    assertAlmostEqual(termPercent(terms, 'B'), 1.1794200669283021, 1e-6, 'Schicht (B) percent');
    assertAlmostEqual(termPercent(terms, 'C'), 15.5764816784071, 1e-6, 'Charge (C) percent');
    assertAlmostEqual(termPercent(terms, 'Error'), 0.581584478430451, 1e-6, 'Error percent');
    assertEqual(pickLargestTerm(terms).id, 'A');
    assertAlmostEqual(result.grandMean, GRAND.abfuellanlage, 1e-9, 'Gesamtmittel');
  });
});

suite('multi-vari-pressen: Darstellungsgrenze', () => {
  test('13 Pressen als zweiter Faktor: nicht darstellbar, Kennzahlen bleiben', async () => {
    const { run } = await load('multi-vari-pressen');
    assertEqual(run.error, null);
    const { result } = run;
    assertEqual(result.renderable, false);
    assertEqual(result.n, PRESSEN.n);
    assertAlmostEqual(result.grandMean, GRAND.pressen, 1e-9, 'Gesamtmittel');
    assertTrue(!!result.vc, 'Varianzkomponenten bleiben trotz Darstellungsgrenze');
    assertEqual(pickLargestTerm(result.vc.terms).id, PRESSEN.largest);
    assertDeepEqual([...result.warnings].sort(), PRESSEN.warnings);
  });
});
