/**
 * Boxplot: Migration der Altform (domain/migrations.js), samt Vorbelegung der
 * Diagrammempfehlung und Golden-Fixture der Exporte.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/boxplot/domain/model.js';
import { from0 } from '../../../js/modules/boxplot/domain/migrations.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { buildPrefill } from '../../../js/modules/chart-suggestion/domain/prefill.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const row = (value, group = null) => ({ value, group });
const plain = (v) => JSON.parse(JSON.stringify(v));

const WS = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b';
const col = (c) => ({ instanceId: WS, sheetId: 'sheet_1', columnId: c });

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
const LEGACY = {
  seriesRefs: [col('col_bp_a'), col('col_bp_b')],
  groupRefs: [col('col_bp_g'), null],
  showMean: false, showOutliers: false, showStats: true, confLevel: 90,
  refLines: [{ dir: 'v', value: 30, label: 'Ziel', dash: 'dash', width: 1.5, color: 'rgba(192,57,43,1)' }],
  refAreas: [], bgColor: '#fff8e1', boxColors: ['#aa3355'],
  exampleWorksheetId: null,
};

const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);

/** @param {string} file @returns {Promise<any>} */
async function fetchJSON(file) {
  const res = await fetch(new URL(file, FIXTURES), { cache: 'no-cache' });
  return res.json();
}

suite('boxplot: Migration', () => {
  test('Altfixture: Zeilen, Konfidenz, Darstellung nur mit Abweichungen, Bezugslinie in Vollform', () => {
    const m = State.fromJSON(LEGACY);
    assertDeepEqual(plain(m.datasets), [row(col('col_bp_a'), col('col_bp_g')), row(col('col_bp_b'))]);
    assertEqual(m.confLevel, 90);
    assertEqual(m.showStats, true);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {
      showMean: false, showOutliers: false, bgColor: '#fff8e1', boxColors: ['#aa3355'],
      refLines: [{ dir: 'v', value: 30, label: 'Ziel', dash: 'dash', width: 1.5, color: 'rgba(192,57,43,1)' }],
    });
    assertEqual(m.hasContent(), true);
  });

  test('Altform mode: grouped mit und ohne groupRef, ungültiger valueRef', () => {
    assertDeepEqual(from0({ mode: 'grouped', valueRef: ref('a'), groupRef: ref('g') }).datasets, [row(ref('a'), ref('g'))]);
    assertDeepEqual(from0({ mode: 'grouped', valueRef: ref('a') }).datasets, [row(ref('a'))]);
    assertEqual(from0({ mode: 'grouped', valueRef: { instanceId: 'w', columnId: 'a' }, groupRef: ref('g') }).datasets, undefined);
    const m = State.fromJSON({ mode: 'grouped', valueRef: ref('a'), groupRef: ref('g'), seriesRefs: [ref('x')] });
    assertDeepEqual(plain(m.datasets), [row(ref('a'), ref('g'))]);
  });

  test('seriesRefs: ungültige Einträge fallen heraus, groupRefs folgt dem gefilterten Index', () => {
    const out = from0({ seriesRefs: [null, ref('a'), 'x', ref('b')], groupRefs: [ref('ga'), ref('gb')] });
    assertDeepEqual(out.datasets, [row(ref('a'), ref('ga')), row(ref('b'), ref('gb'))]);
  });

  test('Bezüge: ohne sheetId entfällt, Zahlen werden Text, leere Liste ergibt die Vorgabe', () => {
    const out = from0({ seriesRefs: [{ instanceId: 'w', columnId: 'a' }, { instanceId: 'w', sheetId: 's', columnId: 7 }], groupRefs: [{ instanceId: 'w', columnId: 'g' }] });
    assertDeepEqual(out.datasets, [row({ instanceId: 'w', sheetId: 's', columnId: '7' })]);
    assertEqual(from0({ seriesRefs: [{ instanceId: '', sheetId: 's', columnId: 'c' }] }).datasets, undefined);
    assertDeepEqual(plain(State.fromJSON({ seriesRefs: [] }).datasets), plain(new State().datasets));
  });

  test('Vorbelegung der Diagrammempfehlung: zwei Reihen mit gleicher Gruppe bzw. ohne', () => {
    const c = (id, role) => ({ id, name: id, role, type: role === 'continuous' ? 'numeric' : 'text', values: [1, 2], roleConfirmed: false });
    const withGroup = buildPrefill('boxplot', [c('a', 'continuous'), c('b', 'continuous'), c('g', 'categorical')], 'w', 's');
    assertEqual(withGroup.target, 'boxplot');
    const m = State.fromJSON(withGroup.state);
    assertDeepEqual(plain(m.datasets), [row(ref('a'), ref('g')), row(ref('b'), ref('g'))]);
    assertEqual(m.confLevel, 95);
    assertDeepEqual(plain(m.chart), {});
    const without = buildPrefill('boxplot', [c('a', 'continuous'), c('b', 'continuous')], 'w', 's');
    assertDeepEqual(plain(State.fromJSON(without.state).datasets), [row(ref('a')), row(ref('b'))]);
  });

  test('confLevel: endliche Zahl > 0 bleibt (ohne Obergrenze), sonst Vorgabe 95', () => {
    assertEqual(State.fromJSON({ confLevel: 90 }).confLevel, 90);
    assertEqual(State.fromJSON({ confLevel: 150 }).confLevel, 150);
    for (const bad of [0, -1, NaN, Infinity, null, '90']) assertEqual(State.fromJSON({ confLevel: bad }).confLevel, 95, String(bad));
    assertEqual(State.fromJSON({}).confLevel, 95);
    assertEqual(Object.hasOwn(from0({}), 'confLevel'), false);
  });

  test('Schalter: nur false gilt als aus', () => {
    assertDeepEqual(from0({ showMean: false, showOutliers: false }).chart, { showMean: false, showOutliers: false });
    assertDeepEqual(from0({ showMean: true, showOutliers: 0 }).chart, {});
    assertEqual(State.fromJSON({ showStats: false }).showStats, false);
    for (const v of [true, 0, '', null, undefined]) assertEqual(State.fromJSON({ showStats: v }).showStats, true, String(v));
  });

  test('Darstellungsfelder: Vorgaben entfallen', () => {
    assertDeepEqual(from0({ showMean: true, showOutliers: true, refLines: [], refAreas: [], bgColor: null, boxColors: [] }).chart, {});
  });

  test('boxColors: Lücken werden null, ohne Text entfällt die Liste', () => {
    assertDeepEqual(from0({ boxColors: [null, '', '#123456', 7] }).chart.boxColors, [null, null, '#123456', null]);
    assertEqual(from0({ boxColors: [null, ''] }).chart.boxColors, undefined);
    assertEqual(from0({ boxColors: 'rot' }).chart.boxColors, undefined);
    const m = State.fromJSON({ boxColors: [undefined, '#abc'] });
    assertDeepEqual(plain(m.chart.boxColors), [null, '#abc']);
  });

  test('refLines/refAreas: ohne dir senkrecht bzw. x, fremde Schlüssel entfallen, Ungültiges einzeln heraus', () => {
    const out = from0({
      refLines: [{ axis: 'y', value: 13.5, label: 'USL', color: '#d62728', style: 'dashed' }, { dir: 'h', value: 1 }, { dir: 'h', value: 'x' }, null],
      refAreas: [{ min: 1, max: 2, opacity: 0.2 }, { dir: 'y', min: 3, max: 4 }, { axis: 'x', from: 1, to: 2 }],
    });
    assertDeepEqual(out.chart.refLines, [{ dir: 'v', value: 13.5, label: 'USL', color: '#d62728' }, { dir: 'h', value: 1 }]);
    assertDeepEqual(out.chart.refAreas, [{ dir: 'x', min: 1, max: 2 }, { dir: 'y', min: 3, max: 4 }]);
  });

  test('exampleWorksheetId bleibt, Fremdschlüssel entfallen', () => {
    const m = loadModel(State, { seriesRefs: [ref('a')], exampleWorksheetId: 'ws-9', mode: 'single', foo: 1 });
    assertEqual(m.exampleWorksheetId, 'ws-9');
    const json = plain(m.toJSON());
    for (const k of ['seriesRefs', 'groupRefs', 'mode', 'valueRef', 'groupRef', 'foo', 'showMean', 'boxColors']) assertTrue(!(k in json), k);
  });

  test('Golden-Fixture v0.3.0_single_project: Instanz inst-boxplot', async () => {
    const json = await fetchJSON('v0.3.0_single_project.json');
    const m = State.fromJSON(json.moduleStates['inst-boxplot']);
    assertDeepEqual(plain(m.datasets), [row(
      { instanceId: 'inst-worksheet', sheetId: 'sheet-1', columnId: 'col-time' },
      { instanceId: 'inst-worksheet', sheetId: 'sheet-1', columnId: 'col-charge' },
    )]);
    assertEqual(m.confLevel, 95);
    assertEqual(m.showStats, true);
    assertDeepEqual(plain(m.chart), {
      boxColors: ['#1f77b4', '#ff7f0e', '#2ca02c'],
      refLines: [{ dir: 'v', value: 13.5, label: 'USL', color: '#d62728' }],
    });
    assertEqual(m.hasContent(), true);
  });
});
