/**
 * FMEA: die Kachel (tile/tile.js) ohne DOM. Prüft Vertrag (ohne eigenes
 * `enumerate`: Standardaufzählung `fmea:<instanceId>`, „FMEA — <Name>“),
 * Größe, Einstellungen samt Etikett und die Anzeige-Daten gegen die Literale
 * der Altkachel (dashboard-tiles.test.js; Stand in Altform, die Kachel
 * migriert beim Lesen).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import tile from '../../../js/modules/fmea/tile/tile.js';
import descriptor from '../../../js/modules/fmea/module.js';
import { validateSchema, resolveSettings } from '../../../js/pages/dashboard/tile-settings.js';
import { enumerateTiles } from '../../../js/pages/dashboard/enumerate-tiles.js';
import { LEGACY_STATE } from './legacy.js';

const i18n = { t: (k) => k, getLanguage: () => 'de' };

/** Scope der Kachel zu einem gespeicherten Stand und Einstellungen. */
function vmOf(state, overrides = {}) {
  const settings = resolveSettings(validateSchema(tile.settings), overrides);
  return tile.viewModel({ tileId: 't', instanceId: 'i', state, settings, i18n, theme: 'light',
    chartManager: null, stateManager: null });
}

/** Stand der Altkachel-Tests (ohne method → RPN). */
const FMEA_STATE = {
  risks: [
    { failureMode: 'Critical fail', sev: '10', occ: '8', det: '7' },
    { failureMode: 'High fail', sev: '7', occ: '5', det: '4' },
    { failureMode: 'Medium fail', sev: '5', occ: '4', det: '3' },
    { failureMode: 'Low fail', sev: '2', occ: '2', det: '2' },
    { failureMode: 'Unrated', sev: '', occ: '', det: '' },
  ],
};

suite('fmea Kachel: Vertrag', () => {
  test('ohne eigenes enumerate: Standardaufzählung fmea:<id>, Titel FMEA — <Name>', () => {
    assertEqual(tile.enumerate, undefined);
    const phases = { analyze: [{ instanceId: 'a', moduleId: 'fmea', customName: 'Lieferung' }, { instanceId: 'b', moduleId: 'fmea' }] };
    const sm = { get: (k) => (k === 'phases' ? phases : undefined) };
    const out = enumerateTiles([{ moduleId: 'fmea', tile, kind: null }], { stateManager: sm, i18n });
    assertDeepEqual(out.map((d) => [d.id, d.instanceId]), [['fmea:a', 'a'], ['fmea:b', 'b']]);
    assertEqual(out[0].title, 'FMEA — Lieferung');
    assertTrue(out[1].title.startsWith('FMEA — '), out[1].title);
  });
  test('Größe, Präfix, Vorlage, kein refreshOn', () => {
    assertDeepEqual(tile.size, { defaultW: 3, defaultH: 10, minW: 2, minH: 6 });
    assertEqual(tile.titlePrefix, 'FMEA');
    assertEqual(tile.template, 'js/modules/fmea/resources/tile.html');
    assertEqual(tile.refreshOn, undefined);
  });
  test('Deskriptor: Phasen und Zyklen wie im Manifest', () => {
    assertEqual(descriptor.id, 'fmea');
    assertEqual(descriptor.icon, 'module.fmea');
    assertEqual(descriptor.phase, 'analyze');
    assertEqual(descriptor.group, 'causes');
    assertDeepEqual(descriptor.cycles, {
      dmaic: { phase: 'analyze' },
      dmadv: { phase: 'analyze', allowedPhases: ['analyze', 'design'] },
      eightd: { phase: 'prevent', allowedPhases: ['rootcause', 'corrective', 'prevent'] },
    });
    assertEqual(typeof descriptor.load, 'function');
    assertEqual(typeof descriptor.tile, 'function');
  });
  test('Einstellungen: topN 1–10 (5), showLegend (an); Etikett mit Rückfall auf dashboard.tileSettings', () => {
    const { topN, showLegend } = tile.settings;
    assertEqual(topN.type, 'number');
    assertEqual(topN.min, 1);
    assertEqual(topN.max, 10);
    assertEqual(topN.default, 5);
    assertDeepEqual(topN.label, ['modules.fmea.tile.settings.topN.label', 'dashboard.tileSettings.topN']);
    assertEqual(topN.helpKey, 'modules.fmea.tile.settings.topN.help');
    assertEqual(showLegend.default, true);
    assertDeepEqual(showLegend.label, ['modules.fmea.tile.settings.showLegend.label', 'dashboard.tileSettings.showLegend']);
  });
});

suite('fmea Kachel: Anzeige wie die Altkachel', () => {
  test('RPN: Zusammenfassung, Balken, Legende, Liste', () => {
    const vm = vmOf(FMEA_STATE);
    assertDeepEqual(vm.summary.map((s) => [s.label, s.value, s.modifier]), [
      ['dashboard.fmeaRisks: ', '5', ''],
      ['dashboard.fmeaMaxRPN: ', '560', ''],
      ['dashboard.fmeaSevere: ', '1', 'dashboard-fmea__flag-count'],
    ]);
    assertEqual(vm.summary[0].style, '');
    assertEqual(vm.summary[2].style, 'color:var(--fmea-cat-critical-text)');
    assertEqual(vm.segments.length, 4);
    assertEqual(vm.legend[0].dot, 'background:var(--fmea-cat-critical)');
    assertEqual(vm.legend[0].text, 'dashboard.fmeaCritical: 1');
    assertEqual(vm.legend.length, 5);
    assertEqual(vm.topLabel, 'dashboard.fmeaTopRisks');
    assertEqual(vm.top.length, 4);
    assertDeepEqual(vm.top[0], { desc: 'Critical fail', flag: null, badge: 'RPN 560', style: 'color:var(--fmea-cat-critical-text)' });
  });
  test('topN begrenzt, showLegend aus', () => {
    assertEqual(vmOf(FMEA_STATE, { topN: 2 }).top.length, 2);
    assertEqual(vmOf(FMEA_STATE, { showLegend: false }).legend, null);
  });
  test('Leerzustand, auch ohne Stand', () => {
    for (const st of [{ risks: [] }, null]) {
      const vm = vmOf(st);
      assertEqual(vm.empty, 'dashboard.fmeaEmpty');
      assertDeepEqual(vm.summary, []);
      assertDeepEqual(vm.segments, []);
      assertEqual(vm.legend, null);
      assertEqual(vm.topLabel, null);
    }
  });
  test('AP: Zahl H, H ohne Maßnahme, AP-Abzeichen', () => {
    const vm = vmOf({ method: 'ap', risks: [
      { failureMode: 'No action', sev: '9', occ: '10', det: '10' },
      { failureMode: 'Justified', sev: '9', occ: '10', det: '10', justification: 'ok' },
    ] });
    assertDeepEqual(vm.summary.map((s) => [s.label, s.value]), [
      ['dashboard.fmeaRisks: ', '2'], ['dashboard.fmeaApHigh: ', '2'], ['dashboard.fmeaUnjustified: ', '1'],
    ]);
    assertEqual(vm.top[0].badge, 'AP H');
    assertDeepEqual(vm.segments.map((s) => s.title), ['dashboard.fmeaApHigh: 2']);
  });
  test('CC/SC in der Liste', () => {
    const vm = vmOf({ risks: [
      { failureMode: 'Flagged', sev: '10', occ: '8', det: '7', specialChar: 'CC' },
      { failureMode: 'Plain', sev: '7', occ: '5', det: '4' },
    ] });
    assertDeepEqual(vm.top.map((r) => r.flag), ['CC', null]);
  });
  test('Altprojekt: S 15 auf 10 geklemmt (A9) — RPN 216, 60 und 343, zwei Risiken mit S ≥ 9', () => {
    const vm = vmOf(LEGACY_STATE);
    assertDeepEqual(vm.summary.map((s) => s.value), ['3', '343', '2']);
    assertDeepEqual(vm.top.map((r) => r.badge), ['RPN 343', 'RPN 216', 'RPN 60']);
    assertDeepEqual(vm.legend.map((l) => l.text), ['dashboard.fmeaCritical: 2', 'dashboard.fmeaMedium: 1']);
  });
  test('die Ableitungen bleiben auf dem Scope (kein Getter gleichen Namens)', () => {
    const vm = vmOf(LEGACY_STATE);
    assertEqual(vm.stats.kind, 'rpn');
    assertEqual(vm.riskRatings.length, 3);
  });
});
