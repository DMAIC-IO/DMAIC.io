/**
 * Tests für createTile (js/core/template-tile.js).
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { createTile, tileSettingsOf, TEMPLATE_TILE } from '../../js/core/template-tile.js';
import { defineModel, defineSettings, number, oneOf, boolean, text, list } from '../../js/core/model.js';
import { registerReader } from '../../js/core/source-reader.js';

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

  test('kind, titleKey und template: drei Kacheln aus einem Modul', () => {
    const tiles = ['a', 'b', 'c'].map((k) => createTile({
      descriptor, Model: Doc, kind: k, titleKey: `demo.title.${k}`, template: `tile-${k}.html`,
    }));
    assertDeepEqual(tiles.map((t) => t.kind), ['a', 'b', 'c']);
    assertDeepEqual(tiles.map((t) => t.titleKey), ['demo.title.a', 'demo.title.b', 'demo.title.c']);
    assertEqual(tiles[1].template, 'js/modules/demo-tile/resources/tile-b.html');
    const plain = createTile({ descriptor, Model: Doc });
    assertTrue(!('kind' in plain) && !('titleKey' in plain));
    assertEqual(plain.template, 'js/modules/demo-tile/resources/tile.html');
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
    assertDeepEqual(Object.keys(seenCtx).sort(), ['i18n', 'instanceId', 'moduleId', 'source', 'theme']);
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

  test('ctx.source aus args.source, moduleId lesend, _ui.services.chartManager nicht aufzählbar', () => {
    const source = Object.freeze({ read: () => ({ rowCount: 1 }), list: () => [] });
    const cm = { create() {}, destroy() {} };
    const vm = tile.viewModel({ state: {}, settings: {}, i18n, source, chartManager: cm });
    assertTrue(seen.source === source);
    assertTrue(!('data' in seen), 'ctx.data gibt es in der Kachel nicht mehr');
    assertEqual(vm.moduleId, 'demo-tile');
    assertThrows(() => { 'use strict'; vm.moduleId = 'x'; }, /read only|Cannot assign/);
    assertTrue(vm._ui.services.chartManager === cm);
    assertTrue(!Object.keys(vm).includes('_ui'));
  });

  test('ohne stateManager: read wirft not_loaded, list ist leer', () => {
    tile.viewModel({ state: {}, settings: {}, i18n });
    let err = null;
    try { seen.source.read('w', {}); } catch (e) { err = e; }
    assertEqual(err?.code, 'not_loaded');
    assertDeepEqual(seen.source.list(), []);
  });

  test('mit stateManager: der Leser kommt aus createSource', () => {
    const sm = { get: (p) => (p === 'phases' ? { measure: [{ instanceId: 'w', moduleId: 'worksheet' }] } : undefined), getProjectCycle: () => 'dmaic' };
    registerReader(sm, (id) => ({ instanceId: id, rowCount: 4 }));
    tile.viewModel({ state: {}, settings: {}, i18n, stateManager: sm });
    assertEqual(seen.source.read('w', {}).rowCount, 4);
    assertDeepEqual(seen.source.list(), [{ instanceId: 'w', moduleId: 'worksheet', phase: 'measure' }]);
  });

  test('ensureLoaded: eine Kachel ohne geladenes Fremdmodul liest nach dem Nachladen die Daten', async () => {
    let loaded = false;
    const sm = { get: (p) => (p === 'phases' ? { define: [{ instanceId: 't1', moduleId: 'todo' }] } : undefined), getProjectCycle: () => 'dmaic' };
    registerReader(sm, () => {
      if (!loaded) throw Object.assign(new Error('not_loaded'), { code: 'not_loaded' });
      return { items: ['a'] };
    }, async () => { const fresh = !loaded; loaded = true; return fresh; });
    const reading = createTile({ descriptor, Model: Doc, view(ctx) {
      return {
        get items() { try { return ctx.source.read('t1').items; } catch (e) { return /** @type {any} */ (e).code; } },
        ensure() { return ctx.source.ensureLoaded('t1'); },
      };
    } });
    const first = reading.viewModel({ state: {}, settings: {}, i18n, stateManager: sm });
    assertEqual(first.items, 'not_loaded');
    assertEqual(await first.ensure(), true, 'erst jetzt geladen');
    assertEqual(await first.ensure(), false, 'schon geladen');
    assertDeepEqual(reading.viewModel({ state: {}, settings: {}, i18n, stateManager: sm }).items, ['a']);
  });

  test('ensureLoaded ohne Lader oder ohne stateManager lehnt mit not_loaded ab', async () => {
    const sm = { get: () => undefined, getProjectCycle: () => 'dmaic' };
    registerReader(sm, () => ({}));
    tile.viewModel({ state: {}, settings: {}, i18n, stateManager: sm });
    let err = null;
    try { await seen.source.ensureLoaded('x'); } catch (e) { err = e; }
    assertEqual(err?.code, 'not_loaded');
    tile.viewModel({ state: {}, settings: {}, i18n });
    err = null;
    try { await seen.source.ensureLoaded('x'); } catch (e) { err = e; }
    assertEqual(err?.code, 'not_loaded');
  });

  test('ohne chartManager: _ui.services.chartManager null', () => {
    const vm = tile.viewModel({ state: {}, settings: {}, i18n });
    assertEqual(vm._ui.services.chartManager, null);
  });
});

suite('createTile: derived', () => {
  let calls = 0;
  const Sheet = defineModel({
    fields: { items: list(text()) },
    derived: {
      total(src) { calls += 1; return src.read('ws1', {}).rowCount; },
      twice(_src, d) { return d.total * 2; },
      broken() { throw new Error('kaputt'); },
    },
  });
  const sm = { get: () => undefined, getProjectCycle: () => 'dmaic' };
  registerReader(sm, (id) => ({ instanceId: id, rowCount: 12 }));

  test('ein Getter je derived, einmal je viewModel()-Aufruf ausgewertet', () => {
    const tile = createTile({ descriptor, Model: Sheet, view() { return { get label() { return `n=${this.total}`; } }; } });
    calls = 0;
    const vm = tile.viewModel({ state: {}, settings: {}, i18n, stateManager: sm });
    assertEqual(vm.total, 12);
    assertEqual(vm.total, 12);
    assertEqual(vm.label, 'n=12');
    assertEqual(calls, 1);
    assertEqual(vm.twice, 24, 'd liest andere derived');
    calls = 0;
    tile.viewModel({ state: {}, settings: {}, i18n, stateManager: sm }).total;
    assertEqual(calls, 1, 'neues Rendern rechnet neu');
  });

  test('Kachel: Ableitung bekommt t des Moduls', () => {
    const Lbl = defineModel({ fields: { items: list(text()) }, derived: { label(_s, _d, t) { return t('greet'); } } });
    const tile = createTile({ descriptor, Model: Lbl });
    const tf = { t: (k) => k, tf: (prefix) => (k) => (prefix === 'modules.demo-tile' && k === 'greet' ? 'Hallo' : `?${prefix}.${k}`) };
    const vm = tile.viewModel({ state: {}, settings: {}, i18n: tf, stateManager: sm });
    assertEqual(vm.label, 'Hallo');
  });

  test('ein werfendes derived ergibt { error }', () => {
    const tile = createTile({ descriptor, Model: Sheet });
    const vm = tile.viewModel({ state: {}, settings: {}, i18n, stateManager: sm });
    assertDeepEqual(vm.broken, { error: 'kaputt' });
  });

  test('ohne Leser: derived liest not_loaded als { error }', () => {
    const tile = createTile({ descriptor, Model: Sheet });
    const vm = tile.viewModel({ state: {}, settings: {}, i18n });
    assertTrue(/not_loaded/.test(vm.total.error));
  });

  test('ein Memo je viewModel(): gemeinsame Abhängigkeit läuft einmal, ungelesene gar nicht', () => {
    let base = 0;
    let unread = 0;
    const Shared = defineModel({
      fields: { items: list(text()) },
      derived: {
        analysis() { base += 1; return { n: 3 }; },
        result(_src, d) { return d.analysis.n + 1; },
        points(_src, d) { return d.analysis.n * 2; },
        idle() { unread += 1; return 0; },
      },
    });
    const tile = createTile({ descriptor, Model: Shared });
    const vm = tile.viewModel({ state: {}, settings: {}, i18n, stateManager: sm });
    assertEqual(vm.result, 4);
    assertEqual(vm.points, 6);
    assertEqual(vm.analysis.n, 3);
    assertEqual(base, 1, 'analysis einmal je viewModel()');
    assertEqual(unread, 0, 'ein ungelesener Getter kostet nichts');
    tile.viewModel({ state: {}, settings: {}, i18n, stateManager: sm }).points;
    assertEqual(base, 2, 'neues Rendern rechnet neu');
  });

  test('ein derived mit dem Namen eines Kern-Schlüssels des Scopes wirft', () => {
    for (const name of ['model', 'settings', 't', 'moduleId', '_ui', '_templateTile']) {
      const Bad = defineModel({ fields: { items: list(text()) }, derived: { [name]() { return 1; } } });
      assertThrows(() => createTile({ descriptor, Model: Bad }), new RegExp(`^createTile\\(demo-tile\\): ${name} collides with derived$`));
    }
  });

  test('ein view-Glied mit dem Namen eines derived wirft', () => {
    const tile = createTile({ descriptor, Model: Sheet, view() { return { get total() { return 0; } }; } });
    assertThrows(() => tile.viewModel({ state: {}, settings: {}, i18n, stateManager: sm }), /^createTile\(demo-tile\): total collides with derived$/);
  });
});
