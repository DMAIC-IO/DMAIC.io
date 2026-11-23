/**
 * Tortendiagramm: Migration der Altform (domain/migrations.js), samt
 * Golden-Fixture der Exporte.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/pie-chart/domain/model.js';
import { from0 } from '../../../js/modules/pie-chart/domain/migrations.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const plain = (v) => JSON.parse(JSON.stringify(v));

const WS = '5b1e2c3d-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const col = (c) => ({ instanceId: WS, sheetId: 'sheet_1', columnId: c });

/** Vollständiges altes `chartConfig` mit den alten Vorgaben. */
const OLD_DEFAULTS = {
  showTitle: true, title: '', titleSize: 15, showLegend: true, showLabels: true,
  labelMode: 'both', labelSize: 11, innerRadius: 0, padAngle: 0.8, startAngle: -90,
  explodeDistance: 12, strokeColor: 'rgba(255,255,255,1)', strokeWidth: 2,
  sortSlices: 'none', centerLabel: '', centerSub: '', bgColor: null,
};

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
const LEGACY = {
  valueRef: col('col_pie_anz'),
  labelRef: col('col_pie_art'),
  chartConfig: {
    ...OLD_DEFAULTS,
    title: 'Modelltitel', labelMode: 'percent', innerRadius: 0.4,
    sortSlices: 'desc', centerLabel: 'Σ', bgColor: '#fff8e1',
  },
  exampleWorksheetId: null,
};

const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);

/** @param {string} file @returns {Promise<any>} */
async function fetchJSON(file) {
  const res = await fetch(new URL(file, FIXTURES), { cache: 'no-cache' });
  return res.json();
}

suite('pie-chart: Migration', () => {
  test('Altfixture: eine Zeile value/label, Darstellung nur mit Abweichungen', () => {
    const m = State.fromJSON(LEGACY);
    assertDeepEqual(plain(m.datasets), [{ value: col('col_pie_anz'), label: col('col_pie_art') }]);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {
      title: 'Modelltitel', centerLabel: 'Σ', bgColor: '#fff8e1',
      labelMode: 'percent', sortSlices: 'desc', innerRadius: 0.4,
    });
  });

  test('unprüfbare Bezüge entfallen; nur label bleibt; beide leer → Vorgabe', () => {
    assertDeepEqual(from0({ valueRef: ref('a'), labelRef: { instanceId: 'w' } }).datasets, [{ value: ref('a'), label: null }]);
    assertDeepEqual(from0({ valueRef: null, labelRef: ref('b') }).datasets, [{ value: null, label: ref('b') }]);
    assertDeepEqual(from0({ valueRef: { instanceId: 'w', sheetId: 's', columnId: 'c', extra: 1 } }).datasets, [{ value: ref('c'), label: null }]);
    assertDeepEqual(from0({ valueRef: { instanceId: 'w', columnId: 'c' } }).datasets, [{ value: { instanceId: 'w', columnId: 'c' }, label: null }]);
    assertEqual(from0({ valueRef: null, labelRef: null }).datasets, undefined);
    assertEqual(from0({ valueRef: {}, labelRef: 'x' }).datasets, undefined);
    const m = State.fromJSON({ valueRef: null, labelRef: null });
    assertDeepEqual(plain(m.datasets), plain(new State().datasets));
    assertEqual(m.hasContent(), false);
    const onlyLabel = State.fromJSON({ labelRef: ref('b') });
    assertDeepEqual(plain(onlyLabel.datasets), [{ value: null, label: ref('b') }]);
  });

  test('chartConfig: Vorgaben entfallen', () => {
    assertDeepEqual(from0({ chartConfig: OLD_DEFAULTS }).chart, {});
    assertDeepEqual(from0({}).chart, {});
    assertDeepEqual(from0({ chartConfig: 'kaputt' }).chart, {});
  });

  test('Texte, Schalter, Zahlen ungleich Vorgabe', () => {
    assertDeepEqual(from0({ chartConfig: {
      title: 'T', centerLabel: 'C', centerSub: 'S', bgColor: '#123456',
      showTitle: false, showLegend: false, showLabels: false,
      labelMode: 'name', sortSlices: 'asc', labelSize: 14,
      innerRadius: 0.5, padAngle: 2, startAngle: 0, explodeDistance: 0, strokeWidth: 1,
    } }).chart, {
      title: 'T', centerLabel: 'C', centerSub: 'S', bgColor: '#123456',
      showTitle: false, showLegend: false, showLabels: false,
      labelMode: 'name', sortSlices: 'asc', labelSize: 14,
      innerRadius: 0.5, padAngle: 2, explodeDistance: 0, strokeWidth: 1, startAngle: 0,
    });
  });

  test('Klemmen: labelSize auf 6–48, Abstände auf ≥ 0', () => {
    assertDeepEqual(from0({ chartConfig: { labelSize: 60, innerRadius: -1 } }).chart, { labelSize: 48 });
    assertDeepEqual(from0({ chartConfig: { labelSize: 2, padAngle: -3, explodeDistance: -1, strokeWidth: -2 } }).chart,
      { labelSize: 6, padAngle: 0, explodeDistance: 0, strokeWidth: 0 });
  });

  test('ungültige Werte entfallen einzeln', () => {
    assertDeepEqual(from0({ chartConfig: {
      labelMode: 'pct', sortSlices: 'value-desc', showLegend: 'nein', labelSize: Number.NaN,
      startAngle: '0', innerRadius: Infinity, title: '', centerLabel: 5, bgColor: '',
    } }).chart, {});
  });

  test('titleSize, strokeColor, slices und Fremdschlüssel entfallen', () => {
    const out = from0({ slices: [{ name: 'A', value: 1 }], fremd: 2, chartConfig: { titleSize: 20, strokeColor: '#000000', fremd: 1 } });
    assertDeepEqual(out, { chart: {} });
    const m = State.fromJSON({ valueRef: ref('a'), slices: [], chartConfig: { titleSize: 20, strokeColor: '#000', fremd: 1 } });
    assertDeepEqual(plain(m.chart), {});
  });

  test('exampleWorksheetId bleibt, Nicht-Text entfällt', () => {
    assertEqual(State.fromJSON({ exampleWorksheetId: 'ws-9' }).exampleWorksheetId, 'ws-9');
    assertEqual(State.fromJSON({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
  });

  test('Golden-Fixture v0.3.0_single_project: Instanz inst-pie', async () => {
    const json = await fetchJSON('v0.3.0_single_project.json');
    const m = State.fromJSON(json.moduleStates['inst-pie']);
    assertDeepEqual(plain(m.datasets), [{ value: null, label: { instanceId: 'inst-worksheet', sheetId: 'sheet-1', columnId: 'col-charge' } }]);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {
      title: 'Anteile pro Charge', labelMode: 'percent',
      padAngle: 0.005, explodeDistance: 0, strokeWidth: 1, startAngle: 0,
    });
    assertEqual(m.hasContent(), true);
  });
});
