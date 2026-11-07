/**
 * Tests für createTile (js/core/template-tile.js).
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { createTile, tileSettingsOf, TEMPLATE_TILE } from '../../js/core/template-tile.js';
import { defineModel, defineSettings, number, oneOf, boolean, text, list } from '../../js/core/model.js';

const Doc = defineModel({ fields: { items: list(text()) } });
const Settings = defineSettings({
  topN: number({ integer: true, min: 1, max: 10, default: 3 }),
  ratio: number({ min: 0, max: 1, default: 0.5 }),
  view: oneOf(['bar', 'list']),
  showLegend: boolean({ default: true }),
});
const descriptor = { id: 'demo-tile' };
const i18n = { t: (k, p) => (p ? `${k}|${JSON.stringify(p)}` : k) };

suite('createTile: Vertrag', () => {
  test('Template, Größe, Präfix und Hooks werden durchgereicht', () => {
    const mount = () => {}; const dispose = () => {}; const enumerate = () => []; const refreshOn = ['x'];
    const tile = createTile({ descriptor, Model: Doc, size: { defaultW: 4 }, titlePrefix: 'Demo', mount, dispose, enumerate, refreshOn });
    assertEqual(tile.template, 'js/modules/demo-tile/resources/tile.html');
    assertDeepEqual(tile.size, { defaultW: 4 });
    assertEqual(tile.titlePrefix, 'Demo');
    assertTrue(tile.mount === mount && tile.dispose === dispose && tile.enumerate === enumerate && tile.refreshOn === refreshOn);
    assertEqual(tile.settings, undefined);
  });

  test('Prüfungen', () => {
    assertThrows(() => createTile({ Model: Doc }), /^createTile: descriptor with id required$/);
    assertThrows(() => createTile({ descriptor }), /^createTile\(demo-tile\): Model required$/);
    assertThrows(() => createTile({ descriptor, Model: Doc, Settings: { schema: { fields: {} } } }), /^createTile\(demo-tile\): Settings must come from defineSettings$/);
    assertThrows(() => createTile({ descriptor, Model: Doc, view: {} }), /^createTile\(demo-tile\): view must be a function$/);
  });
});

suite('createTile: Einstellungen', () => {
  test('Übersetzung in die Felder des Dialogs', () => {
    const base = 'modules.demo-tile.tile.settings';
    assertDeepEqual(tileSettingsOf('demo-tile', Settings), {
      topN: { type: 'number', min: 1, max: 10, step: 1, default: 3, label: [`${base}.topN.label`, 'dashboard.tileSettings.topN'], helpKey: `${base}.topN.help` },
      ratio: { type: 'number', min: 0, max: 1, default: 0.5, label: [`${base}.ratio.label`, 'dashboard.tileSettings.ratio'], helpKey: `${base}.ratio.help` },
      view: { type: 'select', options: ['bar', 'list'], optionLabels: { bar: `${base}.view.options.bar`, list: `${base}.view.options.list` }, default: 'bar', label: [`${base}.view.label`, 'dashboard.tileSettings.view'], helpKey: `${base}.view.help` },
      showLegend: { type: 'boolean', default: true, label: [`${base}.showLegend.label`, 'dashboard.tileSettings.showLegend'], helpKey: `${base}.showLegend.help` },
    });
    assertDeepEqual(createTile({ descriptor, Model: Doc, Settings }).settings, tileSettingsOf('demo-tile', Settings));
  });
});

suite('createTile: Scope', () => {
  let seenCtx = null;
  const tile = createTile({
    descriptor, Model: Doc, Settings,
    view(ctx) {
      seenCtx = ctx;
      return {
        get top() { return this.model.items.slice(0, this.settings.topN); },
        get count() { return this.top.length; },
        label() { return this.t('label', { n: this.count }); },
      };
    },
  });

  test('model eingefroren, settings geprüft, Getter sehen this, Marke nicht aufzählbar', async () => {
    const vm = await tile.viewModel({ tileId: 't', instanceId: 'i1', state: { items: ['a', 'b', 'c', 'd'] }, settings: { topN: 2, view: 'pie' }, i18n, theme: 'dark' });
    assertTrue(Object.isFrozen(vm.model));
    assertDeepEqual({ ...vm.settings }, { topN: 2, ratio: 0.5, view: 'bar', showLegend: true });
    assertDeepEqual(vm.top, ['a', 'b']);
    assertEqual(vm.count, 2);
    assertEqual(vm.label(), 'modules.demo-tile.label|{"n":2}');
    assertEqual(vm[TEMPLATE_TILE], true);
    assertEqual(TEMPLATE_TILE, '_templateTile');
    assertTrue(!Object.keys(vm).includes(TEMPLATE_TILE));
    assertDeepEqual(Object.keys(seenCtx).sort(), ['data', 'i18n', 'instanceId', 'moduleId', 'theme']);
    assertTrue(seenCtx.i18n === i18n);
    assertEqual(seenCtx.theme, 'dark');
    assertEqual(seenCtx.instanceId, 'i1');
    assertEqual(seenCtx.moduleId, 'demo-tile');
  });

  test('kaputter Zustand: leeres Model statt Fehler', async () => {
    const vm = await tile.viewModel({ tileId: 't', instanceId: null, state: { _schema: { version: '9.0' } }, settings: {}, i18n });
    assertDeepEqual([...vm.model.items], []);
    assertEqual(seenCtx.instanceId, null);
  });

  test('t über i18n.tf, wenn vorhanden', async () => {
    const tf = (prefix) => (k) => `tf:${prefix}:${k}`;
    const vm = await tile.viewModel({ tileId: 't', state: {}, settings: {}, i18n: { t: (k) => k, tf } });
    assertEqual(vm.t('x'), 'tf:modules.demo-tile:x');
  });

  test('ohne view und Settings: nur model, settings {}, t', async () => {
    const plain = createTile({ descriptor, Model: Doc });
    const vm = await plain.viewModel({ tileId: 't', state: {}, settings: {}, i18n });
    assertDeepEqual(Object.keys(vm).sort(), ['model', 'moduleId', 'settings', 't']);
    assertDeepEqual({ ...vm.settings }, {});
  });
});

suite('createTile: Kontext', () => {
  test('das Model der Kachel kennt den Zyklus des Projekts', () => {
    const Plan = defineModel({ fields: { items: list(text()) } });
    let seen = null;
    const tile = createTile({ descriptor, Model: Plan, view() { return { get cycle() { seen = this.model.context.cycle; return seen; } }; } });
    const vm = tile.viewModel({ state: {}, settings: {}, i18n, stateManager: { getProjectCycle: () => 'eightd' } });
    assertEqual(vm.cycle, 'eightd');
    const vm2 = tile.viewModel({ state: {}, settings: {}, i18n });
    assertEqual(vm2.cycle, 'dmaic');
  });

  test('Vorgaben der Kachel kommen aus den Einstellungen', () => {
    const Stats = defineModel({ fields: { alpha: number({ exclusiveMin: 0, exclusiveMax: 1, default: (c) => Number((1 - c.confidenceLevel / 100).toFixed(4)) }) } });
    const t = createTile({ descriptor, Model: Stats, view() { return { get a() { return this.model.alpha; } }; } });
    const vm = t.viewModel({ state: {}, settings: {}, i18n, stateManager: { getProjectCycle: () => 'dmaic', get: (k) => (k === 'settings.confidenceLevel' ? 90 : undefined) } });
    assertEqual(vm.a, 0.1);
  });
});

suite('createTile: Daten und Diagramm-Manager', () => {
  let seen = null;
  const tile = createTile({ descriptor, Model: Doc, view(ctx) { seen = ctx; return {}; } });

  test('ctx.data aus args.data, moduleId lesend, _ui.chartManager nicht aufzählbar', () => {
    const data = { values: () => [1], numeric: () => [1], name: () => 'A', columns: () => [] };
    const cm = { create() {}, destroy() {} };
    const vm = tile.viewModel({ state: {}, settings: {}, i18n, data, chartManager: cm });
    assertTrue(seen.data === data);
    assertEqual(vm.moduleId, 'demo-tile');
    assertThrows(() => { 'use strict'; vm.moduleId = 'x'; }, /read only|Cannot assign/);
    assertTrue(vm._ui.chartManager === cm);
    assertTrue(!Object.keys(vm).includes('_ui'));
  });

  test('ohne args.data: jeder Bezug null, keine Spalten', () => {
    tile.viewModel({ state: {}, settings: {}, i18n });
    const ref = { instanceId: 'w', sheetId: 's', columnId: 'c' };
    assertEqual(seen.data.values(ref), null);
    assertEqual(seen.data.numeric(ref), null);
    assertEqual(seen.data.name(ref), null);
    assertDeepEqual(seen.data.columns({}), []);
  });

  test('ohne chartManager: _ui.chartManager null', () => {
    const vm = tile.viewModel({ state: {}, settings: {}, i18n });
    assertEqual(vm._ui.chartManager, null);
  });
});
