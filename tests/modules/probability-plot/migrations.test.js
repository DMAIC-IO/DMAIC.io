/**
 * Wahrscheinlichkeitsnetz: Migration der Altform (domain/migrations.js), samt
 * Vorbelegung der Diagrammempfehlung und Golden-Fixture der Exporte.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/probability-plot/domain/model.js';
import { from0, legacySeriesFrom } from '../../../js/modules/probability-plot/domain/migrations.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { buildPrefill } from '../../../js/modules/chart-suggestion/domain/prefill.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const row = (valueRef, groupRef = null) => ({ valueRef, groupRef });
const plain = (v) => JSON.parse(JSON.stringify(v));

const WS = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
const col = (c) => ({ instanceId: WS, sheetId: 'sheet_1', columnId: c });

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
const LEGACY = {
  datasets: [row(col('col_pp_a'), col('col_pp_g')), row(col('col_pp_b'))],
  seriesOverrides: [
    { name: 'Linie Eins', color: '#aa3355', visible: true },
    { name: 'A — g2', visible: false },
    { name: 'B', lineColor: '#336699', markerSymbol: 'square', visible: true },
  ],
  refLines: [{ dir: 'v', value: 18, label: 'Ziel', dash: 'dash', width: 1.5, color: 'rgba(192,57,43,1)' }],
  refAreas: [], bgColor: '#fff8e1', showStats: true, confLevel: 90,
  exampleWorksheetId: null,
};

const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);

/** @param {string} file @returns {Promise<any>} */
async function fetchJSON(file) {
  const res = await fetch(new URL(file, FIXTURES), { cache: 'no-cache' });
  return res.json();
}

suite('probability-plot: Migration', () => {
  test('Altfixture: Zeilen, Konfidenz, Darstellung in chart, Reihen-Einstellungen je Index', () => {
    const m = State.fromJSON(LEGACY);
    assertDeepEqual(plain(m.datasets), [row(col('col_pp_a'), col('col_pp_g')), row(col('col_pp_b'))]);
    assertEqual(m.confLevel, 90);
    assertEqual(m.showStats, true);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {
      bgColor: '#fff8e1',
      refLines: [{ dir: 'v', value: 18, label: 'Ziel', dash: 'dash', width: 1.5, color: 'rgba(192,57,43,1)' }],
    });
    assertDeepEqual(plain(m.legacySeries), [
      { name: 'Linie Eins', color: '#aa3355', visible: true },
      { name: 'A — g2', visible: false },
      { name: 'B', lineColor: '#336699', markerSymbol: 'square', visible: true },
    ]);
    assertEqual(m.hasContent(), true);
  });

  test('datasets: Nicht-Objekt wird leere Zeile, ungültiger Bezug und Bezug ohne sheetId werden null, Zeilen bleiben', () => {
    const out = from0({ datasets: [7, null, { valueRef: 'x', groupRef: ref('g') }, { valueRef: { instanceId: 'w', columnId: 'a' } }, { valueRef: { instanceId: 'w', sheetId: 's', columnId: 3 } }] });
    assertDeepEqual(out.datasets, [
      row(null), row(null), row(null, ref('g')), row(null),
      row({ instanceId: 'w', sheetId: 's', columnId: '3' }),
    ]);
    assertDeepEqual(from0({ datasets: [{ valueRef: { instanceId: '', sheetId: 's', columnId: 'c' } }] }).datasets, [row(null)]);
  });

  test('datasets: leere Liste ergibt die Vorgabe, datasets geht vor columnRef', () => {
    assertEqual(from0({ datasets: [] }).datasets, undefined);
    assertDeepEqual(plain(State.fromJSON({ datasets: [] }).datasets), [row(null)]);
    assertDeepEqual(from0({ datasets: [row(ref('a'))], columnRef: ref('b') }).datasets, [row(ref('a'))]);
    assertDeepEqual(from0({ datasets: [], columnRef: ref('b') }).datasets, undefined);
  });

  test('Altform columnRef wird eine Zeile ohne Gruppe', () => {
    assertDeepEqual(from0({ columnRef: ref('a') }).datasets, [row(ref('a'))]);
    assertDeepEqual(from0({ columnRef: { instanceId: 'w', columnId: 'a' } }).datasets, [row(null)]);
    assertEqual(from0({ columnRef: null }).datasets, undefined);
  });

  test('Vorbelegung der Diagrammempfehlung: { columnRef } ergibt eine Zeile valueRef', () => {
    const c = (id, role) => ({ id, name: id, role, type: role === 'continuous' ? 'numeric' : 'text', values: [1, 2], roleConfirmed: false });
    const prefill = buildPrefill('probability-plot', [c('a', 'continuous'), c('b', 'continuous'), c('g', 'categorical')], 'w', 's');
    assertEqual(prefill.target, 'probability-plot');
    assertDeepEqual(Object.keys(prefill.state), ['columnRef']);
    const m = State.fromJSON(prefill.state);
    assertDeepEqual(plain(m.datasets), [row(ref('a'))]);
    assertEqual(m.confLevel, 95);
    assertEqual(m.showStats, true);
    assertDeepEqual(plain(m.chart), {});
    assertDeepEqual(plain(m.legacySeries), []);
  });

  test('seriesOverrides → legacySeries: Name, leere Texte, ungültige Zahl, Fremdschlüssel, Index-Lücke', () => {
    assertDeepEqual(legacySeriesFrom([
      { name: '', color: '', lineColor: '#1', markerSymbol: 'square', markerStroke: '', markerSize: -1, markerStrokeWidth: 2, visible: 'ja', foo: 1 },
      null,
      { markerSize: 'x', markerStrokeWidth: Infinity, visible: false },
      { name: 'C', markerSize: 0, color: 7 },
    ]), [
      { lineColor: '#1', markerSymbol: 'square', markerStrokeWidth: 2 },
      {},
      { visible: false },
      { name: 'C', markerSize: 0 },
    ]);
    assertDeepEqual(legacySeriesFrom([{ name: '' }, { foo: 1 }, 3]), []);
    assertDeepEqual(legacySeriesFrom('x'), []);
    assertEqual(Object.hasOwn(from0({ seriesOverrides: [{ name: '' }] }), 'legacySeries'), false);
    assertDeepEqual(plain(State.fromJSON({ seriesOverrides: [{ name: '' }] }).legacySeries), []);
  });

  test('confLevel: endliche Zahl > 0 bleibt (ohne Obergrenze), sonst Vorgabe 95', () => {
    assertEqual(State.fromJSON({ confLevel: 90 }).confLevel, 90);
    assertEqual(State.fromJSON({ confLevel: 150 }).confLevel, 150);
    for (const bad of [0, -1, NaN, Infinity, null, '90']) assertEqual(State.fromJSON({ confLevel: bad }).confLevel, 95, String(bad));
    assertEqual(State.fromJSON({}).confLevel, 95);
    assertEqual(Object.hasOwn(from0({}), 'confLevel'), false);
  });

  test('showStats: Boolean bleibt, null/fehlend ergibt die Vorgabe, sonst Boolean(v)', () => {
    assertEqual(State.fromJSON({ showStats: false }).showStats, false);
    assertEqual(State.fromJSON({ showStats: 0 }).showStats, false);
    assertEqual(State.fromJSON({ showStats: 1 }).showStats, true);
    assertEqual(State.fromJSON({ showStats: null }).showStats, true);
    assertEqual(State.fromJSON({}).showStats, true);
    assertEqual(Object.hasOwn(from0({ showStats: null }), 'showStats'), false);
  });

  test('bgColor leer oder null entfällt', () => {
    assertDeepEqual(from0({ bgColor: '' }).chart, {});
    assertDeepEqual(from0({ bgColor: null }).chart, {});
    assertDeepEqual(from0({ bgColor: 5 }).chart, {});
  });

  test('refLines/refAreas: Ungültiges fällt einzeln heraus, leer entfällt', () => {
    const out = from0({
      refLines: [{ dir: 'h', value: 1 }, { dir: 'h', value: 'x' }, { value: 2 }, null],
      refAreas: [{ dir: 'y', min: 3, max: 4 }, { dir: 'z', min: 1, max: 2 }],
    });
    assertDeepEqual(out.chart.refLines, [{ dir: 'h', value: 1 }]);
    assertDeepEqual(out.chart.refAreas, [{ dir: 'y', min: 3, max: 4 }]);
    assertDeepEqual(from0({ refLines: [{ value: 1 }], refAreas: [] }).chart, {});
  });

  test('exampleWorksheetId bleibt, Fremdschlüssel entfallen', () => {
    const m = loadModel(State, { datasets: [row(ref('a'))], exampleWorksheetId: 'ws-9', columnRef: ref('b'), seriesOverrides: [{ name: 'X' }], foo: 1, markerColor: '#1' });
    assertEqual(m.exampleWorksheetId, 'ws-9');
    const json = plain(m.toJSON());
    for (const k of ['columnRef', 'seriesOverrides', 'refLines', 'refAreas', 'bgColor', 'foo', 'markerColor']) assertTrue(!(k in json), k);
  });

  test('Golden-Fixture v0.3.0_single_project: Instanz inst-probplot', async () => {
    const json = await fetchJSON('v0.3.0_single_project.json');
    const m = State.fromJSON(json.moduleStates['inst-probplot']);
    assertDeepEqual(plain(m.datasets), [row({ instanceId: 'inst-worksheet', sheetId: 'sheet-1', columnId: 'col-time' })]);
    assertEqual(m.confLevel, 95);
    assertEqual(m.showStats, true);
    assertDeepEqual(plain(m.chart), {});
    assertDeepEqual(plain(m.legacySeries), []);
    const out = plain(m.toJSON());
    for (const k of ['markerColor', 'lineColor', 'markerSymbol', 'markerSize', 'markerStroke', 'markerStrokeWidth', 'columnRef']) assertTrue(!(k in out), k);
    assertEqual(m.hasContent(), true);
  });
});
