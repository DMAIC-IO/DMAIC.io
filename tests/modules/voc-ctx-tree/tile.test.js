/**
 * VoC → CTx-Baum: die Kachel (tile/tile.js) ohne DOM. Prüft `enumerate` mit
 * der alten Kachel-Id `voc-ctx-tree` (erste Instanz), Größe, Titel und
 * Einstellungen samt Etikett, die Anzeige-Daten gegen die Werte der
 * Altkachel (gespeicherter Stand in Altform, die Kachel migriert beim
 * Lesen), `topN`, `showLegend` und den Leerzustand.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import tile from '../../../js/modules/voc-ctx-tree/tile/tile.js';
import { validateSchema, resolveSettings } from '../../../js/pages/dashboard/tile-settings.js';

/** i18n wie im Dashboard ohne Texte: jeder Schlüssel steht für sich. */
const i18n = { t: (k) => k, getLanguage: () => 'de' };

/** Scope der Kachel zu einem gespeicherten Stand und Einstellungen. */
function vmOf(state, overrides = {}) {
  const settings = resolveSettings(validateSchema(tile.settings), overrides);
  return tile.viewModel({ tileId: 'voc-ctx-tree', instanceId: 'i', state, settings, i18n, theme: 'light',
    chartManager: null, stateManager: null });
}

/** Altform ohne `_schema`: zwei Stimmen, eine Art xyz (wird ctq). */
const OLD = {
  vocs: [
    { id: 'a', text: 'Kalt', source: 'Umfrage', needs: [
      { id: 'n1', text: 'Heiß', drivers: [
        { id: 'd1', text: 'T', type: 'ctq', requirements: [{ id: 'r1', text: 'x' }, { id: 'r2', text: 'y' }] },
        { id: 'd2', text: 'Z', type: 'ctd', requirements: [] },
        { id: 'd3', text: 'Q', type: 'xyz', requirements: [] },
      ] },
    ] },
    { id: 'b', text: '', source: '' },
  ],
  activeVocId: 'a',
  styles: {},
};

suite('voc-ctx-tree Kachel: Vertrag', () => {
  test('enumerate: eine Kachel mit der festen Id für die erste Instanz', () => {
    assertDeepEqual(tile.enumerate({ i18n, findInstances: () => [{ instanceId: 'x' }, { instanceId: 'y' }] }),
      [{ tileId: 'voc-ctx-tree', instanceId: 'x', title: 'dashboard.vocTitle' }]);
    assertDeepEqual(tile.enumerate({ i18n, findInstances: () => [] }), []);
  });
  test('Größe, Titel und Einstellungen wie bisher, Etikett der Anzahl unverändert', () => {
    assertDeepEqual(tile.size, { defaultW: 3, defaultH: 10, minW: 2, minH: 6 });
    assertEqual(tile.titleKey, 'dashboard.vocTitle');
    assertEqual(tile.settings.topN.min, 1);
    assertEqual(tile.settings.topN.max, 20);
    assertEqual(tile.settings.topN.default, 6);
    assertEqual(tile.settings.showLegend.default, true);
    assertEqual(tile.refreshOn, undefined);
  });
});

suite('voc-ctx-tree Kachel: Anzeige', () => {
  test('Zahlen, Balken, Legende und Aussagen wie die Altkachel', () => {
    const vm = vmOf(OLD);
    assertEqual(vm.empty, null);
    assertDeepEqual(vm.stats.map((s) => s.value), ['2', '1', '3', '2']);
    assertDeepEqual(vm.segments.map((s) => s.key), ['ctq', 'ctd']);
    assertEqual(vm.segments[0].style, 'width:66.66666666666666%;background:var(--vct-tile-ctq)');
    assertDeepEqual(vm.legend.map((l) => l.text), ['CTQ: 2', 'CTD: 1']);
    assertEqual(vm.listLabel, 'dashboard.vocStatements');
    assertDeepEqual(vm.items, [{ quote: '„Kalt“ ', source: '(Umfrage)' }, { quote: '„—“', source: null }]);
    assertEqual(vm.more, null);
  });
  test('topN kürzt die Liste, showLegend aus blendet die Legende aus', () => {
    const vm = vmOf(OLD, { topN: 1, showLegend: false });
    assertEqual(vm.items.length, 1);
    assertEqual(vm.more, '… +1');
    assertEqual(vm.legend, null);
  });
  test('leer: Leertext, keine Zahlen, kein Balken, keine Liste', () => {
    const vm = vmOf({});
    assertEqual(vm.empty, 'dashboard.vocEmpty');
    assertDeepEqual(vm.stats, []);
    assertDeepEqual(vm.segments, []);
    assertEqual(vm.legend, null);
    assertEqual(vm.listLabel, null);
  });
});
