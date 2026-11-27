/**
 * Kano: die Kachel (tile/tile.js) ohne DOM — Vertrag (Größe, Titel,
 * Einstellung), Balken, Kennzahlen, Warnung und Diagramm gegen die Werte der
 * Altkachel (gespeicherter Stand in Altform, die Kachel migriert beim Lesen),
 * `showChart` und die beiden Leerzustände.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import tile from '../../../js/modules/kano/tile/tile.js';
import { validateSchema, resolveSettings } from '../../../js/pages/dashboard/tile-settings.js';

/** i18n wie im Dashboard ohne Texte: jeder Schlüssel steht für sich, Parameter angehängt. */
const i18n = { t: (k, p) => (p ? `${k}${JSON.stringify(p)}` : k), getLanguage: () => 'de' };

/** Scope der Kachel zu einem gespeicherten Stand und Einstellungen. */
function vmOf(state, overrides = {}) {
  const settings = resolveSettings(validateSchema(tile.settings), overrides);
  return tile.viewModel({ tileId: 'kano:k', instanceId: 'k', state, settings, i18n, theme: 'light',
    chartManager: null, stateManager: null });
}

const ans = (f, d, w = null) => ({ f, d, w });
/** Altform ohne `_schema` wie in dashboard-status-tiles-wave3.spec.js: i1 → O, i2 → M, i3 → A. */
const OLD = {
  source: { instanceId: null, level: 'need' },
  options: { importance: false },
  items: ['i1', 'i2', 'i3'].map((id) => ({ id, nodeId: null, label: id.toUpperCase(), path: '', missing: false })),
  respondents: [{ id: 'r1', name: 'R1' }, { id: 'r2', name: 'R2' }],
  answers: {
    r1: { i1: ans(1, 5), i2: ans(3, 5), i3: ans(1, 3) },
    r2: { i1: ans(1, 5), i2: ans(3, 5), i3: ans(1, 3) },
  },
  activeRespondentId: 'r1',
};

suite('kano Kachel: Vertrag', () => {
  test('Größe, Titelpräfix und Einstellung wie bisher, kein refreshOn', () => {
    assertDeepEqual(tile.size, { defaultW: 3, defaultH: 10, minW: 2, minH: 6 });
    assertEqual(tile.titlePrefix, 'Kano');
    assertEqual(tile.settings.showChart.default, true);
    assertDeepEqual(Object.keys(tile.settings), ['showChart']);
    assertEqual(tile.refreshOn, undefined);
  });
});

suite('kano Kachel: Anzeige', () => {
  test('Balken, Legende und Kennzahlen wie die Altkachel', () => {
    const vm = vmOf(OLD);
    assertEqual(vm.empty, null);
    assertDeepEqual(vm.segments.map((s) => s.key), ['M', 'O', 'A']);
    assertDeepEqual(vm.legend.map((l) => l.key), ['M', 'O', 'A']);
    assertTrue(vm.legend[0].text.startsWith('modules.kano.catM'), vm.legend[0].text);
    assertDeepEqual(vm.totals, [
      { label: 'dashboard.kanoCompleteness', value: '100 %' },
      { label: 'dashboard.kanoItems', value: '3' },
      { label: 'dashboard.kanoRespondents', value: '2' },
    ]);
    assertEqual(vm.warn, null);
  });
  test('Diagramm: eine Reihe je Merkmal, Achsen und Titel aus; mit showChart aus null', () => {
    const vm = vmOf(OLD);
    assertEqual(vm.chart.series.length, 3);
    assertDeepEqual([vm.chart.showTitle, vm.chart.showXTicks, vm.chart.showLegend], [false, false, false]);
    assertEqual(vm.chart.xLabel, 'modules.kano.chartX');
    assertEqual(vm.chart.moduleRefLines.length, 2);
    assertEqual(vmOf(OLD, { showChart: false }).chart, null);
  });
  test('Warnung über dem Q-Schwellwert mit Anteil in Prozent', () => {
    const vm = vmOf({ ...OLD, respondents: [...OLD.respondents, { id: 'r3', name: 'R3' }],
      answers: { ...OLD.answers, r3: { i1: ans(1, 1), i2: ans(1, 1), i3: ans(1, 1) } } });
    assertEqual(vm.warn, 'modules.kano.warnQShare{"share":"33 %"}');
  });
  test('Leerzustände: ohne Merkmale, ohne klassifizierte Antwort', () => {
    assertEqual(vmOf({}).empty, 'dashboard.kanoEmpty');
    assertDeepEqual(vmOf({}).segments, []);
    assertEqual(vmOf({ ...OLD, answers: {} }).empty, 'dashboard.kanoNoData');
    assertEqual(vmOf({ ...OLD, answers: {} }).chart, null);
  });
});
