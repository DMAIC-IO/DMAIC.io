/**
 * RACI-Matrix: die Kachel (tile/tile.js) ohne DOM. Prüft `enumerate` mit der
 * Kachel-Id `raci:<id>`, Größe, Präfix und Einstellungen samt Etikett, die
 * Anzeige-Daten gegen die Werte der Altkachel (gespeicherter Stand in
 * Altform, die Kachel migriert beim Lesen), `topN`, `showLegend`, den
 * Leerzustand und dass `multiA` nicht in der Liste steht.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import tile from '../../../js/modules/raci-matrix/tile/tile.js';
import descriptor from '../../../js/modules/raci-matrix/module.js';
import { validateSchema, resolveSettings } from '../../../js/pages/dashboard/tile-settings.js';

/** i18n wie im Dashboard ohne Texte: jeder Schlüssel steht für sich. */
const i18n = { t: (k) => k, getLanguage: () => 'de' };

/** Scope der Kachel zu einem gespeicherten Stand und Einstellungen. */
function vmOf(state, overrides = {}) {
  const settings = resolveSettings(validateSchema(tile.settings), overrides);
  return tile.viewModel({ tileId: 't', instanceId: 'i', state, settings, i18n, theme: 'light',
    chartManager: null, stateManager: null });
}

/** Stand der Altkachel-Tests: jede Aktivität ohne R und ohne A, 8 Warnungen. */
const RACI_STATE = {
  activities: ['A1', 'A2', 'A3', 'A4'],
  stakeholders: ['S1'],
  assignments: { '0:0': 'C', '1:0': 'I' },
};

/** Altprojekt der E2E-Fixture (ohne `_schema`). */
const LEGACY_STATE = {
  activities: [
    'Anforderungen aufnehmen',
    'Lieferantenbewertung für alle Zulieferer der Baugruppe Getriebegehäuse durchführen',
    'Prüfplan für Öl & Späne <Größe "M3"> freigeben',
    'Abschlussbericht schreiben',
  ],
  stakeholders: ['Projektleitung', 'Qualitätssicherung Werk Süd (Leitung Messtechnik)', 'Einkauf'],
  assignments: {
    '2:2': 'A', '0:1': 'A', '1:2': 'I', '0:0': 'R', '2:0': 'R', '1:1': 'A', '0:2': 'C', '2:1': 'A',
  },
};

suite('raci-matrix Kachel: Vertrag', () => {
  test('enumerate: eine Kachel je Instanz mit Id raci:<id>', () => {
    const ctx = { i18n, findInstances: () => [{ instanceId: 'a', customName: 'Team' }, { instanceId: 'b', customName: '' }] };
    assertDeepEqual(tile.enumerate(ctx), [
      { tileId: 'raci:a', instanceId: 'a', title: 'RACI — Team' },
      { tileId: 'raci:b', instanceId: 'b', title: 'RACI — modules.raci-matrix.name' },
    ]);
  });

  test('enumerate fragt nach den Instanzen dieses Moduls', () => {
    const asked = [];
    tile.enumerate({ i18n, findInstances: (id) => { asked.push(id); return []; } });
    assertDeepEqual(asked, ['raci-matrix']);
  });

  test('Größe, Präfix und Vorlage', () => {
    assertDeepEqual(tile.size, { defaultW: 3, defaultH: 10, minW: 2, minH: 6 });
    assertEqual(tile.titlePrefix, 'RACI');
    assertEqual(tile.template, 'js/modules/raci-matrix/resources/tile.html');
    assertEqual(tile.refreshOn, undefined);
  });

  test('Deskriptor: Phasen und Zyklen wie im Manifest, Lader für Modul und Kachel', () => {
    assertEqual(descriptor.id, 'raci-matrix');
    assertEqual(descriptor.icon, 'module.raci-matrix');
    assertEqual(descriptor.group, 'team');
    assertDeepEqual(descriptor.allowedPhases, ['define']);
    assertDeepEqual(descriptor.cycles, {
      dmaic: { phase: 'define', allowedPhases: ['define'] },
      dmadv: { phase: 'define', allowedPhases: ['define'] },
      eightd: { phase: 'team', allowedPhases: ['team'] },
    });
    assertEqual(typeof descriptor.load, 'function');
    assertEqual(typeof descriptor.tile, 'function');
  });

  test('Einstellungen: topN 1–20 (5), showLegend (an); Etikett über den Modulschlüssel', () => {
    const { topN, showLegend } = tile.settings;
    assertEqual(topN.type, 'number');
    assertEqual(topN.min, 1);
    assertEqual(topN.max, 20);
    assertEqual(topN.step, 1);
    assertEqual(topN.default, 5);
    assertDeepEqual(topN.label, ['modules.raci-matrix.tile.settings.topN.label', 'dashboard.tileSettings.topN']);
    assertEqual(topN.helpKey, 'modules.raci-matrix.tile.settings.topN.help');
    assertEqual(showLegend.type, 'boolean');
    assertEqual(showLegend.default, true);
    assertEqual(showLegend.helpKey, 'modules.raci-matrix.tile.settings.showLegend.help');
  });
});

suite('raci-matrix Kachel: Anzeige', () => {
  test('Zusammenfassung, Balken, Legende und Warnungen wie die Altkachel', () => {
    const vm = vmOf(RACI_STATE);
    assertEqual(vm.empty, null);
    assertDeepEqual(vm.summary, [
      { label: 'dashboard.raciActivities: ', value: '4' },
      { label: 'dashboard.raciStakeholders: ', value: '1' },
      { label: 'dashboard.raciCoverage: ', value: '50%' },
    ]);
    assertDeepEqual(vm.segments.map((s) => s.title), ['C: 1', 'I: 1']);
    assertDeepEqual(vm.segments.map((s) => s.style), ['width:50%;background:var(--color-accent)', 'width:50%;background:var(--color-success)']);
    assertDeepEqual(vm.legend.map((l) => l.text), ['C: 1', 'I: 1']);
    assertEqual(vm.warnLabel, 'dashboard.raciWarnings');
    assertEqual(vm.warnItems.length, 5);
    assertDeepEqual(vm.warnItems[0], { role: 'R', style: 'color:var(--color-error)', text: ' dashboard.raciMissing: A1' });
    assertDeepEqual(vm.warnItems[1], { role: 'A', style: 'color:var(--color-warning)', text: ' dashboard.raciMissing: A1' });
    assertEqual(vm.more, '… +3');
  });

  test('topN begrenzt die Liste, der Rest steht in „… +n“', () => {
    const two = vmOf(RACI_STATE, { topN: 2 });
    assertEqual(two.warnItems.length, 2);
    assertEqual(two.more, '… +6');
    const eight = vmOf(RACI_STATE, { topN: 8 });
    assertEqual(eight.warnItems.length, 8);
    assertEqual(eight.more, null);
  });

  test('showLegend aus: keine Legende, der Balken bleibt', () => {
    const vm = vmOf(RACI_STATE, { showLegend: false });
    assertEqual(vm.legend, null);
    assertEqual(vm.segments.length, 2);
  });

  test('Leerzustand ohne Aktivitäten und Beteiligte', () => {
    const vm = vmOf({ activities: [], stakeholders: [], assignments: {} });
    assertEqual(vm.empty, 'dashboard.raciEmpty');
    assertDeepEqual(vm.summary, []);
    assertDeepEqual(vm.segments, []);
    assertEqual(vm.warnLabel, null);
    assertDeepEqual(vm.warnItems, []);
    assertEqual(vm.more, null);
    assertEqual(vmOf(null).empty, 'dashboard.raciEmpty');
  });

  test('nur Beteiligte: kein Leerzustand, Abdeckung 0 %, keine Warnungen', () => {
    const vm = vmOf({ activities: [], stakeholders: ['S1'], assignments: {} });
    assertEqual(vm.empty, null);
    assertEqual(vm.summary[2].value, '0%');
    assertEqual(vm.warnLabel, null);
  });

  test('ohne Beteiligte fehlen jeder Aktivität R und A', () => {
    const vm = vmOf({ activities: ['X'], stakeholders: [], assignments: {} });
    assertDeepEqual(vm.warnItems.map((w) => w.role), ['R', 'A']);
  });

  test('Altprojekt: Abdeckung gerundet, multiA nicht in der Liste, Namen über die id', () => {
    const vm = vmOf(LEGACY_STATE);
    assertEqual(vm.summary[2].value, '67%');
    assertDeepEqual(vm.legend.map((l) => l.text), ['R: 2', 'A: 4', 'C: 1', 'I: 1']);
    assertDeepEqual(vm.warnItems.map((w) => [w.role, w.text]), [
      ['R', ' dashboard.raciMissing: Lieferantenbewertung für alle Zulieferer der Baugruppe Getriebegehäuse durchführen'],
      ['R', ' dashboard.raciMissing: Abschlussbericht schreiben'],
      ['A', ' dashboard.raciMissing: Abschlussbericht schreiben'],
    ]);
    assertEqual(vm.more, null);
  });

  test('verwaiste Schlüssel zählen weder in Abdeckung noch in Verteilung', () => {
    const vm = vmOf({ activities: ['A1'], stakeholders: ['S1'], assignments: { '0:0': 'R', '5:0': 'A', '0:7': 'C' } });
    assertEqual(vm.summary[2].value, '100%');
    assertDeepEqual(vm.legend.map((l) => l.text), ['R: 1']);
    assertTrue(vm.warnItems.every((w) => w.role === 'A'));
  });

  test('die derived warnings bleibt auf dem Scope', () => {
    assertDeepEqual(vmOf(LEGACY_STATE).warnings, [
      { activityId: 'a2', issues: ['noR'] },
      { activityId: 'a3', issues: ['multiA'] },
      { activityId: 'a4', issues: ['noR', 'noA'] },
    ]);
  });
});
