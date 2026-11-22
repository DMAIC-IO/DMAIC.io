import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { mountTile, waitFor } from './tile-test-utils.js';
import { MODULES as manifest } from '../../js/modules/catalog.generated.js';
import fmeaTile from '../../js/modules/fmea/fmea.tile.js';
import ishikawaTile from '../../js/modules/ishikawa/tile/tile.js';
import charterTiles from '../../js/modules/project-charter/tile/tile.js';
import vocTile from '../../js/modules/voc-ctx-tree/voc-ctx-tree.tile.js';
import raciTile from '../../js/modules/raci-matrix/raci-matrix.tile.js';
import spcTile from '../../js/modules/control-chart/control-chart.tile.js';
import todoTile from '../../js/modules/todo/todo.tile.js';
import calendarTile from '../../js/modules/dmaic-calendar/tile/tile.js';
import stakeholderTile from '../../js/modules/stakeholder-analysis/stakeholder-analysis.tile.js';
import lessonsTile from '../../js/modules/lessons-learned/lessons-learned.tile.js';
import { todayISO, addDaysISO } from '../../js/core/local-date.js';
import { validateSchema, resolveSettings } from '../../js/pages/dashboard/tile-settings.js';
import { HOST_TILES } from '../../js/pages/dashboard/tiles/index.js';
import { I18n } from '../../js/core/i18n.js';
import capabilityTile from '../../js/modules/process-capability/tile/tile.js';
import attrSpcTile from '../../js/modules/attribute-control-chart/tile/tile.js';
import { customRefreshEvents, refreshTargets } from '../../js/pages/dashboard/enumerate-tiles.js';
import { disposeTile } from '../../js/pages/dashboard/tile-render.js';
import { createSource, registerReader, bumpWorksheetRevisions } from '../../js/core/source.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import { spySource } from '../helpers/sheet-source.js';
import { readWorksheetState } from '../helpers/legacy-worksheet-read.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { registerFitDirective } from '../../js/core/fit-directive.js';
import { registerRichTextDirective } from '../../js/core/rich-text-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { checkValue } from '../../js/core/model.js';
import controlChartWidget from '../../js/widgets/control-chart/schema.js';
import histogramWidget from '../../js/widgets/histogram-chart/schema.js';
import zegTile from '../../js/pages/dashboard/tiles/zeg-timeline.tile.js';
import sipocTile from '../../js/modules/sipoc/tile/tile.js';
import kanoTile from '../../js/modules/kano/kano.tile.js';
import { WIDGET_I18N } from '../widget-i18n.js';

const i18n = { t: (k) => k, getLanguage: () => 'en' };

const FMEA_STATE = {
  risks: [
    { failureMode: 'Critical fail', sev: '10', occ: '8', det: '7' },
    { failureMode: 'High fail', sev: '7', occ: '5', det: '4' },
    { failureMode: 'Medium fail', sev: '5', occ: '4', det: '3' },
    { failureMode: 'Low fail', sev: '2', occ: '2', det: '2' },
    { failureMode: 'Unrated', sev: '', occ: '', det: '' },
  ],
};

const ISHIKAWA_STATE = {
  problem: 'Scrap rate',
  experts: [{ id: 1, name: 'Anna', color: '#6366f1' }],
  rows: [
    { id: 1, parentId: null, name: 'A', category: 'man', status: 'open', ratings: { 1: 5 } },
    { id: 2, parentId: null, name: 'B', category: 'machine', status: 'testing', ratings: { 1: 4 } },
    { id: 3, parentId: null, name: 'C', category: 'method', status: 'confirmed', ratings: { 1: 3 } },
    { id: 4, parentId: null, name: 'D', category: 'material', status: 'open', ratings: { 1: 2 } },
  ],
};

/** Render a tile the way the host does, with optional setting overrides. */
async function render(tile, state, overrides = {}) {
  const settings = resolveSettings(validateSchema(tile.settings), overrides);
  return mountTile(tile, { tileId: 't', instanceId: 'i', state, settings, i18n, theme: 'light', chartManager: null, stateManager: null });
}

/** Call a tile's viewModel the way the host does, with optional setting overrides. */
function vmOf(tile, state, overrides = {}, extra = {}) {
  const settings = resolveSettings(validateSchema(tile.settings), overrides);
  return tile.viewModel({ tileId: 't', instanceId: 'i', state, settings, i18n, theme: 'light',
    chartManager: null, stateManager: null, ...extra });
}

/** A view model is plain display data: a JSON round trip leaves it unchanged. */
function assertPlain(vm) {
  assertDeepEqual(JSON.parse(JSON.stringify(vm)), vm, 'view model is plain JSON-like data');
}

suite('dashboard tiles: manifest', () => {
  const withTile = manifest.filter(e => typeof e.loadTile === 'function');

  test('modules with a tile declare loadTile', async () => {
    const ids = withTile.map(e => e.id);
    for (const id of ['fmea', 'ishikawa', 'project-charter', 'voc-ctx-tree', 'raci-matrix', 'control-chart',
      'todo', 'dmaic-calendar', 'stakeholder-analysis', 'lessons-learned', 'process-capability', 'attribute-control-chart',
      'sipoc', 'kano']) assertTrue(ids.includes(id), id);
  });

  test('every tile object loads, has template + viewModel, a valid size and schema', async () => {
    const sources = [
      ...withTile.map(e => ({ name: e.id, load: async () => (await e.loadTile()).default })),
      ...HOST_TILES.map(h => ({ name: h.id, load: async () => (await h.load()).default })),
    ];
    for (const src of sources) {
      const exported = await src.load();
      const tiles = Array.isArray(exported) ? exported : [exported];
      for (const [i, tile] of tiles.entries()) {
        const name = `${src.name}#${i}`;
        assertEqual(typeof tile.template, 'string', `${name}: template`);
        assertEqual(typeof tile.viewModel, 'function', `${name}: viewModel`);
        assertEqual(tile.render, undefined, `${name}: no render()`);
        if (tile.mount !== undefined) assertEqual(typeof tile.mount, 'function', `${name}: mount`);
        const res = await fetch(new URL(`../../${tile.template}`, import.meta.url));
        assertTrue(res.ok, `${name}: template file ${tile.template}`);
        const html = await res.text();
        assertTrue(!/x-html|\?\.|\?\?/.test(html), `${name}: template uses no x-html, ?. or ??`);
        if (Array.isArray(exported)) assertEqual(typeof tile.enumerate, 'function', `${name}: enumerate`);
        if (Array.isArray(exported)) {
          assertEqual(typeof tile.kind, 'string', `${name}: kind`);
          assertTrue(!tile.kind.includes('~'), `${name}: kind without "~"`);
        }
        for (const k of ['defaultW', 'defaultH', 'minW', 'minH']) {
          assertTrue(Number.isInteger(tile.size?.[k]), `${name}: size.${k}`);
        }
        const warnings = [];
        validateSchema(tile.settings, (m) => warnings.push(m));
        assertDeepEqual(warnings, [], `${name}: schema`);
      }
    }
  });

  test('tile kinds are unique across all modules (one byKind map for copies)', async () => {
    const seen = new Map();
    for (const e of withTile) {
      const exported = (await e.loadTile()).default;
      const tiles = Array.isArray(exported) ? exported : [exported];
      for (const tile of tiles) {
        const kind = Array.isArray(exported) ? tile.kind : e.id;
        assertTrue(!seen.has(kind), `kind "${kind}" of ${e.id} is also declared by ${seen.get(kind)}`);
        seen.set(kind, e.id);
      }
    }
  });

  test('tile files do not import the module shell directly', async () => {
    const shell = /from\s+['"][^'"]*(template-module|alpine)[^'"]*['"]/i;
    const files = [
      ...withTile.map(e => ({ name: e.id, url: new URL(`../../js/modules/${e.id}/${e.id}.tile.js`, import.meta.url) })),
      ...HOST_TILES.map(h => ({ name: h.id, url: new URL(`../../js/pages/dashboard/tiles/${h.id}.tile.js`, import.meta.url) })),
    ];
    for (const file of files) {
      const src = await (await fetch(file.url)).text();
      assertTrue(!shell.test(src), `${file.name}.tile.js imports the module shell`);
    }
  });

  test('tile files build no HTML imperatively (no h(), no createElement)', async () => {
    const usesH = /import\s*\{[^}]*\bh\b[^}]*\}\s*from\s*['"][^'"]*core\/dom\.js['"]/;
    const files = [
      ...withTile.map(e => ({ name: e.id, url: new URL(`../../js/modules/${e.id}/${e.id}.tile.js`, import.meta.url) })),
      ...HOST_TILES.map(h => ({ name: h.id, url: new URL(`../../js/pages/dashboard/tiles/${h.id}.tile.js`, import.meta.url) })),
    ];
    for (const file of files) {
      const src = await (await fetch(file.url)).text();
      assertTrue(!usesH.test(src), `${file.name}.tile.js imports h()`);
      assertTrue(!src.includes('createElement('), `${file.name}.tile.js calls createElement`);
    }
  });

  test('re-bindable tiles declare how to title another instance', async () => {
    assertEqual(spcTile.titlePrefix, 'SPC');
    assertEqual(attrSpcTile.titlePrefix, 'SPC');
    assertEqual(raciTile.titlePrefix, 'RACI');
    assertEqual(sipocTile.titlePrefix, 'SIPOC');
    assertEqual(kanoTile.titlePrefix, 'Kano');
    assertEqual(vocTile.titleKey, 'dashboard.vocTitle');
    assertDeepEqual(charterTiles.map(t => [t.kind, t.titleKey]), [
      ['project-charter', 'modules.project-charter.tiles.charter.title'],
      ['project-goals', 'modules.project-charter.tiles.goals.title'],
      ['org-chart', 'modules.project-charter.tiles.org.title'],
    ]);
  });
});

suite('dashboard tiles: fmea', () => {
  test('defaults show every rated risk and the legend', async () => {
    const host = (await render(fmeaTile, FMEA_STATE));
    assertEqual(host.querySelectorAll('.dashboard-fmea__top-item').length, 4);
    assertTrue(host.querySelector('.dashboard-fmea__legend') !== null);
  });

  test('topN limits the list', async () => {
    const host = (await render(fmeaTile, FMEA_STATE, { topN: 2 }));
    assertEqual(host.querySelectorAll('.dashboard-fmea__top-item').length, 2);
  });

  test('showLegend=false hides the legend', async () => {
    const host = (await render(fmeaTile, FMEA_STATE, { showLegend: false }));
    assertEqual(host.querySelector('.dashboard-fmea__legend'), null);
  });

  test('empty state without risks', async () => {
    const host = (await render(fmeaTile, { risks: [] }));
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.fmeaEmpty');
  });

  test('title prefix keeps the legacy title', async () => {
    assertEqual(fmeaTile.titlePrefix, 'FMEA');
  });

  test('RPN mode summary shows the S ≥ 9 count', async () => {
    const host = (await render(fmeaTile, FMEA_STATE));   // no method → RPN; one risk with S 10
    const flag = host.querySelector('.dashboard-fmea__flag-count');
    assertEqual(flag.textContent, 'dashboard.fmeaSevere: 1');
  });

  test('AP mode summary shows the H-without-action count', async () => {
    const host = (await render(fmeaTile, { method: 'ap', risks: [
      { failureMode: 'No action', sev: '9', occ: '10', det: '10' },
      { failureMode: 'Justified', sev: '9', occ: '10', det: '10', justification: 'ok' },
    ] }));
    assertEqual(host.querySelector('.dashboard-fmea__flag-count').textContent, 'dashboard.fmeaUnjustified: 1');
  });

  test('top list shows the CC/SC badge', async () => {
    const host = (await render(fmeaTile, { risks: [
      { failureMode: 'Flagged', sev: '10', occ: '8', det: '7', specialChar: 'CC' },
      { failureMode: 'Plain', sev: '7', occ: '5', det: '4' },
    ] }));
    const flags = host.querySelectorAll('.dashboard-fmea__top-flag');
    assertEqual(flags.length, 1);
    assertEqual(flags[0].textContent, 'CC');
  });

  test('viewModel: RPN summary, bar, legend and top list as display data', () => {
    const vm = vmOf(fmeaTile, FMEA_STATE);
    assertPlain(vm);
    assertDeepEqual(vm.summary.map(s => [s.label, s.value, s.modifier]), [
      ['dashboard.fmeaRisks: ', '5', ''],
      ['dashboard.fmeaMaxRPN: ', '560', ''],
      ['dashboard.fmeaSevere: ', '1', 'dashboard-fmea__flag-count'],
    ]);
    assertEqual(vm.summary[0].style, '');
    assertEqual(vm.summary[2].style, 'color:var(--fmea-cat-critical-text)');
    assertEqual(vm.segments.length, 4);
    assertEqual(vm.legend[0].dot, 'background:var(--fmea-cat-critical)');
    assertEqual(vm.legend[0].text, 'dashboard.fmeaCritical: 1');
    assertEqual(vm.top[0].badge, 'RPN 560');
    assertEqual(vm.top[0].flag, null);
    assertEqual(vmOf(fmeaTile, FMEA_STATE, { showLegend: false }).legend, null);
  });

  test('viewModel: AP mode shows the H count and AP badges', () => {
    const vm = vmOf(fmeaTile, { method: 'ap', risks: [{ failureMode: 'X', sev: '9', occ: '10', det: '10' }] });
    assertEqual(vm.summary[1].label, 'dashboard.fmeaApHigh: ');
    assertEqual(vm.summary[1].value, '1');
    assertEqual(vm.top[0].badge, 'AP H');
  });
});

suite('dashboard tiles: ishikawa', () => {
  test('defaults show every scored hypothesis and both legends', async () => {
    const host = (await render(ishikawaTile, ISHIKAWA_STATE));
    assertEqual(host.querySelectorAll('.dashboard-fmea__top-item').length, 4);
    assertEqual(host.querySelectorAll('.dashboard-fmea__legend').length, 2);
  });

  test('topN limits the list', async () => {
    const host = (await render(ishikawaTile, ISHIKAWA_STATE, { topN: 1 }));
    assertEqual(host.querySelectorAll('.dashboard-fmea__top-item').length, 1);
  });

  test('showLegend=false hides both legends', async () => {
    const host = (await render(ishikawaTile, ISHIKAWA_STATE, { showLegend: false }));
    assertEqual(host.querySelectorAll('.dashboard-fmea__legend').length, 0);
  });

  test('score: one decimal in the app language (de 5,0, en 5.0)', async () => {
    const en = await render(ishikawaTile, ISHIKAWA_STATE);
    assertEqual(en.querySelector('.dashboard-fmea__top-rpn').textContent, '5.0');
    const settings = resolveSettings(validateSchema(ishikawaTile.settings), {});
    const de = await mountTile(ishikawaTile, { tileId: 't', instanceId: 'i', state: ISHIKAWA_STATE, settings,
      i18n: { t: (k) => k, getLanguage: () => 'de' }, theme: 'light', chartManager: null, stateManager: null });
    assertEqual(de.querySelector('.dashboard-fmea__top-rpn').textContent, '5,0');
  });

  test('an unnamed cause shows — instead of its stableId', async () => {
    const state = { ...ISHIKAWA_STATE, rows: [{ id: 1, parentId: null, name: '', category: 'man', status: 'open', ratings: { 1: 5 } }] };
    const host = (await render(ishikawaTile, state));
    assertEqual(host.querySelector('.dashboard-fmea__top-desc').textContent, '—');
  });

  test('empty state without rows', async () => {
    const host = (await render(ishikawaTile, { rows: [] }));
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'modules.ishikawa.tileEmpty');
  });

  test('title prefix comes from i18n, not a literal', async () => {
    assertEqual(ishikawaTile.titlePrefix, undefined);
    assertEqual(ishikawaTile.titlePrefixKey, 'modules.ishikawa.tileTitlePrefix');
  });

  test('settings: topN 1..20 default 5, showLegend default on', async () => {
    assertDeepEqual(
      [ishikawaTile.settings.topN.min, ishikawaTile.settings.topN.max, ishikawaTile.settings.topN.default, ishikawaTile.settings.topN.step],
      [1, 20, 5, 1]);
    assertEqual(ishikawaTile.settings.showLegend.default, true);
  });

  test('old state with an orphan: the orphan is a main cause without category', async () => {
    const state = { ...ISHIKAWA_STATE, rows: [...ISHIKAWA_STATE.rows,
      { id: 9, parentId: 77, name: 'Orphan', category: 'man', status: 'open', ratings: { 1: 9 } }] };
    const vm = vmOf(ishikawaTile, state);
    assertEqual(vm.top[0].name, 'Orphan');
    assertEqual(vm.top[0].style, 'color:var(--color-text-secondary)');
    assertEqual(vm.summary[0].value, '5');
  });

  test('topN: 3 shows three entries', async () => {
    const host = (await render(ishikawaTile, ISHIKAWA_STATE, { topN: 3 }));
    assertEqual(host.querySelectorAll('.dashboard-fmea__top-item').length, 3);
  });

  test('colours come from the module variables, no hex literals', async () => {
    const host = (await render(ishikawaTile, ISHIKAWA_STATE));
    assertTrue(host.querySelector('.ishikawa-tile') !== null, 'wrapper .ishikawa-tile');
    const vm = vmOf(ishikawaTile, ISHIKAWA_STATE);
    assertTrue(!/#[0-9a-f]{3,6}/i.test(JSON.stringify([vm.segments, vm.legend, vm.top])), 'no hex in view model');
  });

  test('viewModel: problem, summary, both legends and scored list as display data', () => {
    const vm = vmOf(ishikawaTile, ISHIKAWA_STATE);
    assertEqual(vm.problem, 'Scrap rate');
    assertDeepEqual(vm.summary, [
      { label: 'modules.ishikawa.tileHypotheses: ', value: '4' },
      { label: 'modules.ishikawa.tileExperts: ', value: '1' },
    ]);
    assertDeepEqual(vm.segments[0], { key: 'man', style: 'width:25%;background:var(--ishikawa-cat-man)', title: 'modules.ishikawa.cat.man: 1' });
    assertDeepEqual(vm.legend.map(l => l.text), ['modules.ishikawa.cat.man: 1', 'modules.ishikawa.cat.machine: 1',
      'modules.ishikawa.cat.material: 1', 'modules.ishikawa.cat.method: 1']);
    assertDeepEqual(vm.statusLegend.map(l => l.text), ['modules.ishikawa.status.open: 2',
      'modules.ishikawa.status.testing: 1', 'modules.ishikawa.status.confirmed: 1']);
    assertEqual(vm.topLabel, 'modules.ishikawa.tileTopScored');
    assertDeepEqual(vm.top[0], { name: 'A', score: '5.0', style: 'color:var(--ishikawa-cat-man)' });
    const off = vmOf(ishikawaTile, ISHIKAWA_STATE, { showLegend: false });
    assertEqual(off.legend, null);
    assertEqual(off.statusLegend, null);
  });
});

suite('dashboard tiles: project-charter array', () => {
  if (!Alpine.version) Alpine.start();
  registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
  registerFitDirective(Alpine);
  registerRichTextDirective(Alpine);
  const [charterTile, goalsTile, orgTile] = charterTiles;
  const T = 'modules.project-charter.tiles';
  const ctxWith = (ids) => ({ i18n, findInstances: () => ids.map(instanceId => ({ instanceId, customName: '' })) });
  const goal = (id, description, achievementLevel) => ({ id, description, targetDate: '', metric: '', targetValue: '', achievementLevel });
  const node = (id, pid, title, extra = {}) => ({ id, pid, title, desc: '', ...extra });
  const STYLE = { nodeBg: '', nodeBorderColor: '', nodeBorderStyle: 'solid', nodeBorderWidth: 1, lineColor: '', lineStyle: 'solid', lineWidth: 2 };
  const orgState = (nodes, style = {}) => ({ orgChart: nodes, orgStyle: { ...STYLE, ...style } });

  test('exports charter, goals and org chart in that order with the former ids and sizes', async () => {
    assertDeepEqual(charterTiles.map(t => t.kind), ['project-charter', 'project-goals', 'org-chart']);
    assertDeepEqual(charterTile.size, { defaultW: 3, defaultH: 10, minW: 2, minH: 6 });
    assertDeepEqual(goalsTile.size, { defaultW: 3, defaultH: 10, minW: 2, minH: 6 });
    assertDeepEqual(orgTile.size, { defaultW: 6, defaultH: 10, minW: 3, minH: 6 });
  });

  test('templates sit under resources/ and no tile has mount()', async () => {
    assertDeepEqual(charterTiles.map(t => t.template), [
      'js/modules/project-charter/resources/tile.html',
      'js/modules/project-charter/resources/tile.goals.html',
      'js/modules/project-charter/resources/tile.org.html']);
    for (const t of charterTiles) assertEqual(t.mount, undefined);
  });

  test('has no settings', async () => {
    assertEqual(charterTile.settings, undefined);
  });

  test('each tile enumerates its fixed id for the first charter instance', async () => {
    assertDeepEqual(charterTile.enumerate(ctxWith(['c', 'd'])), [{ tileId: 'project-charter', instanceId: 'c', title: `${T}.charter.title` }]);
    assertDeepEqual(goalsTile.enumerate(ctxWith(['c'])), [{ tileId: 'project-goals', instanceId: 'c', title: `${T}.goals.title` }]);
    assertDeepEqual(orgTile.enumerate(ctxWith(['c'])), [{ tileId: 'org-chart', instanceId: 'c', title: `${T}.org.title` }]);
  });

  test('no charter instance gives no tiles', async () => {
    for (const t of charterTiles) assertDeepEqual(t.enumerate(ctxWith([])), []);
  });

  test('charter renders the problem via x-rich-text as <strong>, not raw **', async () => {
    const host = await render(charterTile, { problemStatement: '**bold** text' });
    const problem = host.querySelector('.pc-tile__problem');
    assertEqual(problem.querySelector('strong').textContent, 'bold');
    assertEqual(problem.textContent, 'bold text');
    assertEqual(host.querySelector('.pc-tile__problem-label').textContent, `${T}.charter.problemLabel`);
  });

  test('charter: empty problem shows the hint', async () => {
    assertEqual((await render(charterTile, { problemStatement: '' })).querySelector('.dashboard-area__empty').textContent,
      `${T}.charter.noProblem`);
  });

  test('charter: raw HTML in the problem stays text', async () => {
    const host = await render(charterTile, { _schema: { version: '1.0' }, problemStatement: '<img src=x onerror="bad()">' });
    assertEqual(host.querySelector('.pc-tile__problem img'), null);
    assertEqual(host.querySelector('.pc-tile__problem').textContent, '<img src=x onerror="bad()">');
  });

  test('goals: one row per goal, ZEG clamped, colour class from zegLevel like the module', async () => {
    const host = await render(goalsTile, { goals: [goal('a', 'A', 100), goal('b', '', 80), goal('c', 'C', 30), goal('d', 'D', 0)] });
    const rows = [...host.querySelectorAll('.pc-tile__goal')];
    assertEqual(rows.length, 4);
    assertTrue(rows[0].textContent.includes('100%'));
    assertDeepEqual(rows.map(r => [...r.classList].find(c => c.startsWith('pc__zeg-level--'))),
      ['pc__zeg-level--done', 'pc__zeg-level--high', 'pc__zeg-level--mid', 'pc__zeg-level--low']);
    assertTrue(rows[1].querySelector('.pc-tile__goal-desc').textContent.includes(`${T}.goals.unnamed`));
    assertEqual(rows[2].querySelector('.pc-tile__goal-bar-fill').style.width, '30%');
  });

  test('goals: empty state', async () => {
    assertEqual((await render(goalsTile, { goals: [] })).querySelector('.dashboard-area__empty').textContent, `${T}.goals.empty`);
  });

  test('org: empty state', async () => {
    assertEqual((await render(orgTile, { orgChart: [] })).querySelector('.dashboard-area__empty').textContent, `${T}.org.empty`);
  });

  test('org: one HTML node per entry inside x-fit, description cut at 38 characters', async () => {
    const long = 'x'.repeat(50);
    const host = await render(orgTile, orgState([node('a', null, 'A'), node('b', 'a', 'B', { desc: long }), node('c', 'a', 'C', { desc: 'short' })]));
    assertEqual(host.querySelectorAll('.pc-tile__org-node').length, 3);
    const descs = [...host.querySelectorAll('.pc-tile__org-node-desc')].map(e => e.textContent);
    assertDeepEqual(descs, [`${'x'.repeat(36)}…`, 'short']);
    assertTrue(host.querySelector('.pc-tile__org > .pc-tile__org-canvas') !== null);
    assertTrue(host.querySelector('.pc-tile__org-canvas .pc-tile__org-lines') !== null);
  });

  test('org: links follow the module layout (one per child), dashed style gives the module dash pattern', async () => {
    const vm = vmOf(orgTile, orgState([node('a', null, 'A'), node('b', 'a', 'B'), node('c', 'a', 'C')],
      { lineStyle: 'dashed', lineWidth: 3, lineColor: '#ff0000' }), {}, {});
    assertEqual(vm.orgLinks.links.length, 2);
    for (const l of vm.orgLinks.links) {
      assertEqual(l.dash, '8 4');
      assertEqual(l.width, 3);
      assertEqual(l.color, '#ff0000');
      assertEqual(l.shape, 'curve');
    }
    assertEqual(vmOf(orgTile, orgState([node('a', null, 'A'), node('b', 'a', 'B')], { lineStyle: 'dotted' })).orgLinks.links[0].dash, '2 4');
    const solid = vmOf(orgTile, orgState([node('a', null, 'A'), node('b', 'a', 'B')])).orgLinks.links[0];
    assertEqual(Object.hasOwn(solid, 'dash'), false);
    assertEqual(Object.values(solid).includes(undefined), false);
  });

  test('org: node own style beats the global orgStyle', async () => {
    const host = await render(orgTile, orgState([node('a', null, 'A', { bg: '#112233' }), node('b', 'a', 'B')],
      { nodeBg: '#445566', nodeBorderStyle: 'dashed' }));
    const [a, b] = host.querySelectorAll('.pc-tile__org-node');
    assertEqual(a.style.getPropertyValue('--pc-org-node-bg'), '#112233');
    assertEqual(b.style.getPropertyValue('--pc-org-node-bg'), '#445566');
    assertEqual(b.style.getPropertyValue('--pc-org-node-border-style'), 'dashed');
  });
});

const VOC_STATE = {
  vocs: Array.from({ length: 8 }, (_, i) => ({
    id: `v${i}`, text: `S${i}`, source: '',
    needs: [{ id: `n${i}`, drivers: [{ id: `d${i}`, type: 'ctq', requirements: [] }] }],
  })),
};

suite('dashboard tiles: voc', () => {
  test('enumerates one tile for the first instance only', async () => {
    const ctx = { i18n, findInstances: () => [{ instanceId: 'a' }, { instanceId: 'b' }] };
    assertDeepEqual(vocTile.enumerate(ctx), [{ tileId: 'voc-ctx-tree', instanceId: 'a', title: 'dashboard.vocTitle' }]);
    assertDeepEqual(vocTile.enumerate({ i18n, findInstances: () => [] }), []);
  });

  test('defaults: 6 statements + overflow line, legend shown', async () => {
    const host = (await render(vocTile, VOC_STATE));
    assertEqual(host.querySelectorAll('.dashboard-voc__item').length, 7);
    assertTrue(host.querySelector('.dashboard-voc__driver-legend') !== null);
  });

  test('topN limits the list and the overflow counts the rest', async () => {
    const host = (await render(vocTile, VOC_STATE, { topN: 2 }));
    const items = host.querySelectorAll('.dashboard-voc__item');
    assertEqual(items.length, 3);
    assertTrue(items[2].textContent.includes('+6'));
  });

  test('showLegend=false hides the legend, keeps the bar', async () => {
    const host = (await render(vocTile, VOC_STATE, { showLegend: false }));
    assertEqual(host.querySelector('.dashboard-voc__driver-legend'), null);
    assertTrue(host.querySelector('.dashboard-voc__driver-bar') !== null);
  });

  test('empty state without statements', async () => {
    const host = (await render(vocTile, { vocs: [] }));
    assertTrue(host.querySelector('.dashboard-area__empty') !== null);
  });

  test('viewModel: stats, driver bar, legend and statements as display data', () => {
    const vm = vmOf(vocTile, VOC_STATE);
    assertPlain(vm);
    assertDeepEqual(vm.stats, [
      { value: '8', label: ' VoC' },
      { value: '8', label: ' dashboard.vocNeeds' },
      { value: '8', label: ' dashboard.vocDrivers' },
      { value: '0', label: ' dashboard.vocReqs' },
    ]);
    assertDeepEqual(vm.segments, [{ key: 'ctq', style: 'width:100%;background:var(--color-voc-ctq, rgba(39,174,96,1))', title: 'CTQ: 8' }]);
    assertDeepEqual(vm.legend, [{ key: 'ctq', dot: 'background:var(--color-voc-ctq, rgba(39,174,96,1))', text: 'CTQ: 8' }]);
    assertEqual(vm.listLabel, 'dashboard.vocStatements');
    assertEqual(vm.items.length, 6);
    assertDeepEqual(vm.items[0], { quote: '„S0“', source: null });
    assertEqual(vm.more, '… +2');
  });

  test('viewModel: a statement with source gets a trailing space and the bracketed source', () => {
    const vm = vmOf(vocTile, { vocs: [{ id: 'v', text: 'Fast', source: 'Call' }] });
    assertDeepEqual(vm.items, [{ quote: '„Fast“ ', source: '(Call)' }]);
    assertEqual(vm.segments.length, 0);
    assertEqual(vm.legend, null);
  });

  test('a statement with source renders the same text as before', async () => {
    const host = await render(vocTile, { vocs: [{ id: 'v', text: 'Fast', source: 'Call' }] });
    const li = host.querySelector('.dashboard-voc__item');
    assertEqual(li.textContent, '„Fast“ (Call)');
    assertEqual(li.querySelector('.dashboard-area__muted').textContent, '(Call)');
  });
});

const RACI_STATE = {
  activities: ['A1', 'A2', 'A3', 'A4'],
  stakeholders: ['S1'],
  assignments: { '0:0': 'C', '1:0': 'I' }, // every activity misses R and A -> 8 warnings
};

suite('dashboard tiles: raci', () => {
  test('enumerates one tile per instance with the RACI prefix', async () => {
    const ctx = { i18n, findInstances: () => [{ instanceId: 'a', customName: 'Team' }, { instanceId: 'b', customName: '' }] };
    assertDeepEqual(raciTile.enumerate(ctx), [
      { tileId: 'raci:a', instanceId: 'a', title: 'RACI — Team' },
      { tileId: 'raci:b', instanceId: 'b', title: 'RACI — modules.raci-matrix.name' },
    ]);
  });

  test('defaults: 5 warnings + overflow line, legend shown', async () => {
    const host = (await render(raciTile, RACI_STATE));
    assertEqual(host.querySelectorAll('.dashboard-raci__warn-item').length, 5);
    assertTrue(host.querySelector('.dashboard-raci__warn-list').textContent.includes('+3'));
    assertTrue(host.querySelector('.dashboard-raci__legend') !== null);
  });

  test('topN limits the warnings', async () => {
    const host = (await render(raciTile, RACI_STATE, { topN: 2 }));
    assertEqual(host.querySelectorAll('.dashboard-raci__warn-item').length, 2);
    assertTrue(host.querySelector('.dashboard-raci__warn-list').textContent.includes('+6'));
  });

  test('showLegend=false hides the legend', async () => {
    assertEqual((await render(raciTile, RACI_STATE, { showLegend: false })).querySelector('.dashboard-raci__legend'), null);
  });

  test('empty state without activities and stakeholders', async () => {
    assertTrue((await render(raciTile, { activities: [], stakeholders: [], assignments: {} }))
      .querySelector('.dashboard-area__empty') !== null);
  });

  test('viewModel: summary, bar, legend and capped warnings as display data', () => {
    const vm = vmOf(raciTile, RACI_STATE);
    assertPlain(vm);
    assertDeepEqual(vm.summary, [
      { label: 'dashboard.raciActivities: ', value: '4' },
      { label: 'dashboard.raciStakeholders: ', value: '1' },
      { label: 'dashboard.raciCoverage: ', value: '50%' },
    ]);
    assertDeepEqual(vm.segments.map(s => s.title), ['C: 1', 'I: 1']);
    assertDeepEqual(vm.legend.map(l => l.text), ['C: 1', 'I: 1']);
    assertEqual(vm.warnLabel, 'dashboard.raciWarnings');
    assertEqual(vm.warnings.length, 5);
    assertDeepEqual(vm.warnings[0], { role: 'R', style: 'color:var(--color-error)', text: ' dashboard.raciMissing: A1' });
    assertEqual(vm.more, '… +3');
    assertEqual(vmOf(raciTile, RACI_STATE, { topN: 8 }).more, null);
  });
});

function fakeStateManager(values) {
  const ws = { sheets: [{ id: 's', name: 'S', state: { rowCount: values.length, columns: [{ id: 'c', name: 'Measure', values }] } }] };
  // Die Phasenliste, die der Leser für „bekannte Instanz“ braucht (wie readSync).
  return withStoredWorksheetReader({ get: (p) => (p === 'phases' ? { data: [{ instanceId: 'ws', moduleId: 'worksheet' }] } : null), getModuleState: (id) => (id === 'ws' ? ws : null) });
}
const SPC_STATE = { chartTypeId: 'i-mr', subgroupSize: 1, baselineCount: null,
  columnRef: { instanceId: 'ws', sheetId: 's', columnId: 'c' }, usl: null, lsl: null };

async function renderSpcTile(state, values, overrides = {}, cm = recordingChartManager()) {
  const host = document.createElement('div');
  document.body.append(host);
  const settings = resolveSettings(validateSchema(spcTile.settings), overrides);
  await mountTile(spcTile, { tileId: 'spc:x', instanceId: 'x', state, settings, i18n, theme: 'light',
    chartManager: cm, stateManager: fakeStateManager(values) }, host);
  host.remove();
  return { host, cm };
}

suite('dashboard tiles: spc', () => {
  test('enumerates per instance with the SPC prefix and refreshes on resize', async () => {
    const ctx = { i18n, findInstances: () => [{ instanceId: 'a', customName: 'Line' }] };
    assertDeepEqual(spcTile.enumerate(ctx), [{ tileId: 'spc:a', instanceId: 'a', title: 'SPC — Line' }]);
    assertDeepEqual(spcTile.refreshOn, ['state:saved', 'resize']);
  });

  test('renders a control chart and four stats with data', async () => {
    const { host, cm } = await renderSpcTile(SPC_STATE, [10, 10.2, 9.8, 10.1, 9.9, 10.3]);
    assertEqual(cm.made.length, 1);
    assertEqual(cm.made[0].type, 'control-chart');
    assertTrue(cm.made[0].el === host.querySelector('[data-tile-slot="chart"]'), 'chart goes into the chart slot');
    assertEqual(host.querySelectorAll('.dashboard-spc__stat').length, 4);
  });

  test('chart config: compact control chart with every element hidden', async () => {
    const { cm } = await renderSpcTile(SPC_STATE, [10, 10.2, 9.8, 10.1, 9.9, 10.3]);
    const { cfg } = cm.made[0];
    assertEqual(cfg.values.length, 6);
    assertEqual(cfg.showZones, true);
    assertTrue(cfg.violationIndices instanceof Set, 'violation indices as a Set');
    assertEqual(cfg.xLabel, 'modules.control-chart.xLabelSample');
    for (const k of ['showTitle', 'showXLabel', 'showYLabel', 'showXTicks', 'showYTicks', 'showLegend']) {
      assertEqual(cfg[k], false, k);
    }
  });

  test('empty state without column, no-data state with one point', async () => {
    let r = await renderSpcTile({ ...SPC_STATE, columnRef: null }, []);
    assertTrue(r.host.querySelector('.dashboard-area__empty') !== null);
    assertEqual(r.cm.made.length, 0);
    r = await renderSpcTile(SPC_STATE, [10]);
    assertTrue(r.host.querySelector('.dashboard-area__empty') !== null);
    assertEqual(r.cm.made.length, 0);
  });

  const SPC_VALUES = [10, 10.2, 9.8, 10.1, 9.9, 10.3];
  const spcVm = (state, values = SPC_VALUES, overrides = {}) =>
    vmOf(spcTile, state, overrides, { stateManager: fakeStateManager(values) });

  test('viewModel: header, stats, metrics and chart config as display data', () => {
    const vm = spcVm(SPC_STATE);
    assertPlain(vm);
    assertEqual(vm.empty, null);
    assertEqual(vm.typeLabel, 'I-MR');
    assertEqual(vm.colName, 'Measure');
    assertDeepEqual(vm.stats.map(s => s.label), ['CL', 'UCL', 'LCL', 'σ̂']);
    assertTrue(/^\d+\.\d{4}$/.test(vm.stats[0].value), vm.stats[0].value);
    assertEqual(vm.metrics.length, 1, 'no spec: violations only');
    assertDeepEqual(vm.metrics[0], { modifier: 'dashboard-spc__metric--ok', value: '0',
      label: 'dashboard.spcViolations', sub: 'dashboard.spcOf' });
    assertEqual(vm.chart.values.length, SPC_VALUES.length);
    assertDeepEqual(vm.chart.violationIndices, []);
    assertEqual(vm.chart.xOffset, 0);
    assertEqual(vm.chart.xMin, 0.5, 'x axis starts half a step before the first point');
    assertEqual(vm.chart.xMax, SPC_VALUES.length + 0.5, 'x axis ends half a step after the last point');
    assertEqual(vm.chart.baselineEnd, null);
  });

  test('viewModel: a spec limit adds the out-of-spec metric and Cpk', () => {
    const vm = spcVm({ ...SPC_STATE, usl: 10.25 });
    assertDeepEqual(vm.metrics[1], { modifier: 'dashboard-spc__metric--warn', value: '1',
      label: 'dashboard.spcOutOfSpec', sub: 'dashboard.spcOf' });
    assertEqual(vm.metrics[2].label, 'Cpk');
    assertTrue(/^dashboard-spc__metric--(ok|warn|bad)$/.test(vm.metrics[2].modifier), vm.metrics[2].modifier);
    assertEqual(vm.chart.usl, 10.25);
    assertEqual(vm.chart.lsl, null);
  });

  test('viewModel: empty, no-data and unknown chart type', () => {
    assertEqual(spcVm({ ...SPC_STATE, columnRef: null }).empty, 'dashboard.spcEmpty');
    assertEqual(spcVm(undefined).empty, 'dashboard.spcEmpty');
    assertEqual(spcVm(SPC_STATE, [10]).empty, 'dashboard.spcNoData');
    assertEqual(spcVm({ ...SPC_STATE, chartTypeId: 'no-such-type' }).empty, 'dashboard.spcNoData');
  });

  test('spec limits reach the chart, which marks out-of-spec points itself', async () => {
    const { cm } = await renderSpcTile({ ...SPC_STATE, usl: 10.25, lsl: 9.75 }, SPC_VALUES);
    assertEqual(cm.made[0].cfg.usl, 10.25);
    assertEqual(cm.made[0].cfg.lsl, 9.75);
  });

  // Point 7 (index 6) lies far above the limits of the first six.
  const SPC_SHIFT = [10, 10.2, 9.8, 10.1, 9.9, 10.3, 14, 10, 10.1, 9.9];

  test('a Nelson violation reaches the chart as an index', async () => {
    const { cm } = await renderSpcTile({ ...SPC_STATE, baselineCount: 6 }, SPC_SHIFT);
    assertTrue(cm.made[0].cfg.violationIndices.has(6));
    assertEqual(cm.made[0].cfg.baselineEnd, 6);
  });

  test('lastN shows the last points with shifted indices; figures stay on all points', async () => {
    const { cm } = await renderSpcTile({ ...SPC_STATE, baselineCount: 6 }, SPC_SHIFT, { lastN: 5 });
    const { cfg } = cm.made[0];
    assertEqual(cfg.values.length, 5);
    assertTrue(cfg.violationIndices.has(1));
    assertEqual(cfg.xOffset, 5, 'points keep their real sample numbers 6..10');
    assertEqual(cfg.xMin, 5.5);
    assertEqual(cfg.xMax, 10.5);
    assertEqual(cfg.baselineEnd, 1);
    const vm = spcVm({ ...SPC_STATE, baselineCount: 6 }, SPC_SHIFT, { lastN: 5 });
    assertEqual(vm.metrics[0].value, '1', 'violation count over all points');
  });

  test('xbar-r: the baseline marker counts subgroups', () => {
    const vm = spcVm({ ...SPC_STATE, chartTypeId: 'xbar-r', subgroupSize: 2, baselineCount: 4 },
      [10, 10.2, 9.8, 10.1, 9.9, 10.3, 10, 10.1]);
    assertEqual(vm.chart.values.length, 4);
    assertEqual(vm.chart.baselineEnd, 2);
  });

  test('showChart off: figures only, no chart slot', async () => {
    const { host, cm } = await renderSpcTile(SPC_STATE, SPC_VALUES, { showChart: false });
    assertEqual(cm.made.length, 0);
    assertEqual(host.querySelector('[data-tile-slot="chart"]'), null);
    assertEqual(host.querySelectorAll('.dashboard-spc__stat').length, 4);
    assertEqual(spcVm(SPC_STATE, SPC_VALUES, { showChart: false }).chart, null);
  });

  test('Kachel zeigt den Hinweis aus analysis.hint als de-Text', async () => {
    const UI = await (await fetch(new URL('../../js/modules/process-capability/resources/i18n/ui.de.json', import.meta.url))).json();
    const deI18n = { t: (k) => k, getLanguage: () => 'de', tf: () => (k) => UI[k] ?? k };
    const state = { columnRef: CAP_COL, params: { lsl: 9.5, usl: 10.5, subgroupMode: 'column' } };
    const vm = vmOf(capabilityTile, state, {}, { i18n: deI18n, stateManager: columnStateManager({ m: CAP_VALUES }) });
    assertEqual(vm.hint, UI.subgroupColumnMissing);
    assertTrue(typeof vm.hint === 'string' && !vm.hint.includes('subgroupColumnMissing'));
  });

  test('a second render and dispose destroy the previous chart', async () => {
    const cm = recordingChartManager();
    const host = document.createElement('div');
    const args = { tileId: 'spc:x', instanceId: 'x', state: SPC_STATE,
      settings: resolveSettings(validateSchema(spcTile.settings), {}), i18n, theme: 'light',
      chartManager: cm, stateManager: fakeStateManager(SPC_VALUES) };
    await mountTile(spcTile, args, host);
    await mountTile(spcTile, args, host);
    assertDeepEqual(cm.destroyed, [cm.made[0]]);
    spcTile.dispose(host, { tileId: 'spc:x' });
    assertDeepEqual(cm.destroyed, [cm.made[0], cm.made[1]]);
  });

  test('a chart that resolves after a newer render is destroyed (stale token)', async () => {
    const made = []; const destroyed = []; const pending = [];
    const cm = {
      create: (el, type, cfg) => new Promise(r => { const c = { cfg, config: { ...cfg } }; made.push(c); pending.push(() => r(c)); }),
      destroy: (c) => destroyed.push(c),
    };
    const host = document.createElement('div');
    const args = { tileId: 'spc:x', instanceId: 'x', state: SPC_STATE,
      settings: resolveSettings(validateSchema(spcTile.settings), {}), i18n, theme: 'light',
      chartManager: cm, stateManager: fakeStateManager(SPC_VALUES) };
    const first = mountTile(spcTile, args, host);
    await waitFor(() => pending.length === 1);
    const second = mountTile(spcTile, args, host);
    await waitFor(() => pending.length === 2);
    pending[1](); await second;
    pending[0](); await first;
    assertTrue(destroyed.includes(made[0]), 'stale chart destroyed');
    assertTrue(!destroyed.includes(made[1]), 'current chart kept');
  });
});

function zegStateManager(history, { completed = false, withSheet = false } = {}) {
  const sheet = { id: 'sheet_1', state: { columns: [{ id: 'c1', meta: { managedBy: 'zeg', managedRef: 'date' } }] } };
  // findZegSheet reads through the worksheet facade.
  return withStoredWorksheetReader({
    get: (k) => (k === 'phases' ? { data: withSheet ? [{ instanceId: 'w1', moduleId: 'worksheet' }] : [] }
      : k.startsWith('phaseAchievementHistory.') ? (history[k.split('.')[1]] || []) : null),
    getProjectCycle: () => 'dmaic',
    isCompleted: () => completed,
    listInstances: () => (withSheet ? [{ instanceId: 'w1' }] : []),
    getModuleState: (id) => (withSheet && id === 'w1' ? { sheets: [sheet] } : null),
  });
}

function fakeChartManager() {
  const made = []; const destroyed = [];
  return {
    made, destroyed,
    create: async (el, type, cfg) => { const c = { el, cfg, config: { ...cfg } }; made.push(c); return c; },
    destroy: (c) => { destroyed.push(c); },
  };
}

suite('dashboard tiles: zeg-timeline', () => {
  const args = (cm, sm, settings = { showLegend: true }) =>
    ({ tileId: 'zeg-timeline', instanceId: null, state: null, settings, i18n: { t: (k) => k, language: 'de' },
      theme: 'light', chartManager: cm, stateManager: sm });

  test('always enumerates one tile and refreshes on achievement changes', async () => {
    assertDeepEqual(zegTile.enumerate({ i18n, findInstances: () => [] }),
      [{ tileId: 'zeg-timeline', instanceId: null, title: 'dashboard.zegTimeline' }]);
    assertDeepEqual(zegTile.refreshOn, ['phase:achievement-changed']);
  });

  test('empty history shows the empty state and creates no chart', async () => {
    const host = document.createElement('div'); const cm = fakeChartManager();
    await mountTile(zegTile, args(cm, zegStateManager({})), host);
    assertTrue(host.querySelector('.dashboard-area__empty') !== null);
    assertEqual(cm.made.length, 0);
  });

  test('empty state and chart both offer the edit-data link', async () => {
    for (const hist of [{}, { define: [{ t: 1, v: 10 }] }]) {
      const host = document.createElement('div');
      await mountTile(zegTile, args(fakeChartManager(), zegStateManager(hist)), host);
      const link = host.querySelector('a[data-action="zeg-sheet"]');
      assertTrue(link !== null, `link missing (${Object.keys(hist).length ? 'chart' : 'empty'})`);
      assertEqual(link.getAttribute('href'), '#/action/zeg-sheet');
      assertTrue(link.textContent.includes('dashboard.zegSheet.edit'));
    }
  });

  test('read-only project without a ZEG sheet offers no edit-data link', async () => {
    for (const hist of [{}, { define: [{ t: 1, v: 10 }] }]) {
      const host = document.createElement('div');
      await mountTile(zegTile, args(fakeChartManager(), zegStateManager(hist, { completed: true })), host);
      assertEqual(host.querySelector('a[data-action="zeg-sheet"]'), null);
    }
    const host = document.createElement('div');
    await mountTile(zegTile, args(fakeChartManager(), zegStateManager({}, { completed: true, withSheet: true })), host);
    assertTrue(host.querySelector('a[data-action="zeg-sheet"]') !== null);
  });

  test('showLegend is passed to the chart', async () => {
    const host = document.createElement('div'); const cm = fakeChartManager();
    const sm = zegStateManager({ define: [{ t: 1, v: 10 }, { t: 2, v: 20 }] });
    await mountTile(zegTile, args(cm, sm, { showLegend: false }), host);
    assertEqual(cm.made[0].cfg.showLegend, false);
  });

  test('a second render destroys the first chart', async () => {
    const host = document.createElement('div'); const cm = fakeChartManager();
    const sm = zegStateManager({ define: [{ t: 1, v: 10 }] });
    await mountTile(zegTile, args(cm, sm), host);
    await mountTile(zegTile, args(cm, sm), host);
    assertDeepEqual(cm.destroyed, [cm.made[0]]);
  });

  test('a chart that resolves after a newer render is destroyed (stale token)', async () => {
    const host = document.createElement('div');
    const sm = zegStateManager({ define: [{ t: 1, v: 10 }] });
    const made = []; const destroyed = []; const pending = [];
    const cm = {
      create: (el, type, cfg) => new Promise(r => { const c = { cfg, config: { ...cfg } }; made.push(c); pending.push(() => r(c)); }),
      destroy: (c) => destroyed.push(c),
    };
    const first = mountTile(zegTile, args(cm, sm), host);
    await waitFor(() => pending.length === 1);
    const second = mountTile(zegTile, args(cm, sm), host);
    await waitFor(() => pending.length === 2);
    pending[1](); await second;
    pending[0](); await first;
    assertTrue(destroyed.includes(made[0]), 'stale chart destroyed');
    assertTrue(!destroyed.includes(made[1]), 'current chart kept');
  });

  test('dispose destroys the chart', async () => {
    const host = document.createElement('div'); const cm = fakeChartManager();
    await mountTile(zegTile, args(cm, zegStateManager({ define: [{ t: 1, v: 10 }] })), host);
    zegTile.dispose(host, { tileId: 'zeg-timeline' });
    assertDeepEqual(cm.destroyed, [cm.made[0]]);
  });

  test('a stored legend edit beats the showLegend setting (tile-bound manager)', async () => {
    const { createEditBoundChartManager, LABEL_EDIT_KEYS, TILE_EDIT_KEYS } =
      await import('../../js/core/chart/instance-chart-manager.js');
    const host = document.createElement('div'); document.body.appendChild(host);
    const base = fakeChartManager();
    const cm = createEditBoundChartManager(base, {
      read: () => ({ showLegend: false }), write: () => {}, keys: [...LABEL_EDIT_KEYS, ...TILE_EDIT_KEYS],
    });
    const sm = zegStateManager({ define: [{ t: 1, v: 10 }, { t: 2, v: 20 }] });
    await mountTile(zegTile, args(cm, sm, { showLegend: true }), host);
    assertEqual(base.made[0].cfg.showLegend, false);
    host.remove();
  });

  test('viewModel: chart config without functions, edit link flags', () => {
    const vm = vmOf(zegTile, null, { showLegend: false }, { stateManager: zegStateManager({ define: [{ t: 1, v: 10 }] }) });
    assertPlain(vm);
    assertEqual(vm.empty, null);
    assertEqual(vm.showEdit, true);
    assertEqual(vm.editLabel, 'dashboard.zegSheet.edit');
    assertEqual(vm.chart.showLegend, false);
    assertEqual(vm.chart.yMax, 100);
    assertEqual(vm.chart.xTickFormat, undefined);
  });

  test('viewModel: empty history and read-only project without sheet', () => {
    const vm = vmOf(zegTile, null, {}, { stateManager: zegStateManager({}, { completed: true }) });
    assertEqual(vm.empty, 'dashboard.noHistory');
    assertEqual(vm.chart, null);
    assertEqual(vm.showEdit, false);
  });

  test('mount adds the localized date tick format', async () => {
    const host = document.createElement('div'); const cm = fakeChartManager();
    await mountTile(zegTile, args(cm, zegStateManager({ define: [{ t: 1, v: 10 }] })), host);
    assertEqual(typeof cm.made[0].cfg.xTickFormat, 'function');
    assertEqual(cm.made[0].cfg.xTickFormat(Date.UTC(2026, 9, 14, 12)), '14.10.26');
  });
});

const TODO_STATE = {
  items: [
    { id: 'a', text: 'Past', owner: 'Ann', due: '2000-01-01', status: 'open' },
    { id: 'b', text: 'Future', owner: 'Bob', due: '2999-01-01', status: 'blocked' },
    { id: 'c', text: 'Undated', status: 'in-progress' },
    { id: 'd', text: 'Finished', due: '2000-01-01', status: 'done' },
  ],
};

suite('dashboard tiles: todo', () => {
  test('lists open items by due date and marks overdue ones', async () => {
    const host = (await render(todoTile, TODO_STATE));
    const items = [...host.querySelectorAll('.dashboard-fmea__top-item')];
    assertDeepEqual(items.map(li => li.querySelector('.dashboard-fmea__top-desc').textContent), ['Past', 'Future', 'Undated']);
    assertEqual(host.querySelectorAll('.dashboard-todo__overdue').length, 1);
  });

  test('topN caps the list', async () => {
    assertEqual((await render(todoTile, TODO_STATE, { topN: 1 })).querySelectorAll('.dashboard-fmea__top-item').length, 1);
  });

  test('showDone controls the done segment and count', async () => {
    const off = (await render(todoTile, TODO_STATE));
    assertEqual(off.querySelector('[data-status="done"]'), null);
    const on = (await render(todoTile, TODO_STATE, { showDone: true }));
    assertTrue(on.querySelector('.dashboard-fmea__bar-seg[data-status="done"]') !== null);
  });

  test('empty and missing state show the empty hint', async () => {
    for (const s of [{ items: [] }, undefined, null]) {
      assertEqual((await render(todoTile, s)).querySelector('.dashboard-area__empty').textContent, 'dashboard.todoEmpty');
    }
  });

  test('viewModel: summary, segments and next items as display data', () => {
    const vm = vmOf(todoTile, TODO_STATE);
    assertPlain(vm);
    assertDeepEqual(vm.summary.map(s => [s.status, s.label, s.count]), [
      ['open', 'modules.todo.status_open: ', '1'],
      ['in-progress', 'modules.todo.status_in-progress: ', '1'],
      ['blocked', 'modules.todo.status_blocked: ', '1'],
    ]);
    assertEqual(vm.segments[0].style, 'width:33.33333333333333%;background:var(--color-text-tertiary)');
    assertEqual(vm.nextLabel, 'dashboard.todoNextDue');
    assertDeepEqual(vm.next[0], { modifier: 'dashboard-todo__overdue', title: 'dashboard.todoOverdue',
      text: 'Past', owner: 'Ann', due: '2000-01-01' });
    assertDeepEqual(vm.next[2], { modifier: '', title: null, text: 'Undated', owner: null, due: '—' });
  });
});

suite('dashboard tiles: dmaic-calendar', () => {
  const t0 = todayISO();
  const CAL_STATE = { events: [
    { id: '1', title: 'Kickoff', date: t0, time: '10:00', duration: 60, desc: '', phase: 'define' },
    { id: '2', title: 'Review', date: addDaysISO(t0, 10), time: '09:00', duration: 60, desc: '', phase: 'measure' },
    { id: '3', title: 'Gate', date: addDaysISO(t0, 20), time: '09:00', duration: 60, desc: '', phase: 'analyze' },
    { id: '4', title: 'Past', date: addDaysISO(t0, -1), time: '09:00', duration: 60, desc: '', phase: 'define' },
  ] };

  test('Größe wie bisher', () => {
    assertDeepEqual(calendarTile.size, { defaultW: 3, defaultH: 10, minW: 2, minH: 6 });
  });

  test('Vorgabe 14 Tage: heute und +10', async () => {
    const host = await render(calendarTile, CAL_STATE);
    assertDeepEqual([...host.querySelectorAll('.dashboard-fmea__top-desc')].map((e) => e.textContent), ['Kickoff', 'Review']);
  });

  test('30 Tage nimmt +20 dazu; topN begrenzt', async () => {
    assertEqual((await render(calendarTile, CAL_STATE, { horizon: '30' })).querySelectorAll('.dashboard-fmea__top-item').length, 3);
    assertEqual((await render(calendarTile, CAL_STATE, { horizon: '30', topN: 1 })).querySelectorAll('.dashboard-fmea__top-item').length, 1);
  });

  test('Zusammenfassung, Hinweis, Leerzustand', async () => {
    assertEqual((await render(calendarTile, CAL_STATE, { horizon: '7' })).querySelector('.dashboard-fmea__summary').textContent,
      'modules.dmaic-calendar.tileSummary');
    assertTrue((await render(calendarTile, { events: [CAL_STATE.events[3]] })).querySelector('.dashboard-calendar__none') !== null);
    assertEqual((await render(calendarTile, undefined)).querySelector('.dashboard-area__empty').textContent, 'modules.dmaic-calendar.tileEmpty');
  });

  test('Einzahl mit echten Texten (de/en)', async () => {
    const real = new I18n('de');
    for (const lang of ['de', 'en']) {
      const global = await (await fetch(new URL(`../../i18n/${lang}.json`, import.meta.url))).json();
      const ui = await (await fetch(new URL(`../../js/modules/dmaic-calendar/resources/i18n/ui.${lang}.json`, import.meta.url))).json();
      real._cache.set(lang, { ...global, modules: { ...global.modules, 'dmaic-calendar': ui } });
    }
    const host = document.createElement('div');
    const one = { events: [CAL_STATE.events[0]] };
    const settings = resolveSettings(validateSchema(calendarTile.settings), {});
    await mountTile(calendarTile, { tileId: 'cal', state: one, settings, i18n: real }, host);
    assertEqual(host.querySelector('.dashboard-fmea__summary').textContent, '1 Termin in den nächsten 14 Tagen');
    real._lang = 'en';
    await mountTile(calendarTile, { tileId: 'cal', state: one, settings, i18n: real }, host);
    assertEqual(host.querySelector('.dashboard-fmea__summary').textContent, '1 event in the next 14 days');
  });

  test('Zeilen: Datum und Zeit, Titel, Phase', () => {
    const vm = vmOf(calendarTile, CAL_STATE);
    assertDeepEqual(vm.shown[0], { id: '1', when: `${t0} 10:00`, title: 'Kickoff', phase: 'phases.define' });
    assertEqual(vm.none, false);
    assertEqual(vmOf(calendarTile, { events: [CAL_STATE.events[3]] }).none, true);
  });

  test('ein Stand aus einer neueren Version zeigt den Leerzustand', async () => {
    const host = await render(calendarTile, { _schema: { version: '9.0' }, events: CAL_STATE.events });
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'modules.dmaic-calendar.tileEmpty');
  });
});

const SH_STATE = { stakeholders: [
  { id: 'a', name: 'CFO', role: 'Finance', power: 5, interest: 5, support: 'critic' },
  { id: 'b', name: 'Ops', power: 5, interest: 5, support: 'supporter' },
  { id: 'c', name: 'IT', power: 1, interest: 5, support: 'resistor' },
] };

suite('dashboard tiles: stakeholder-analysis', () => {
  test('matrix shows a count per quadrant, manage-closely first', async () => {
    const cells = [...(await render(stakeholderTile, SH_STATE)).querySelectorAll('.dashboard-stakeholder__cell')];
    assertEqual(cells.length, 4);
    assertEqual(cells[0].dataset.quadrant, 'manage-closely');
    assertEqual(cells[0].querySelector('strong').textContent, '2');
  });

  test('support row includes other only when present', async () => {
    assertTrue((await render(stakeholderTile, SH_STATE)).querySelector('[data-support="other"]') !== null);
    const noOther = { stakeholders: SH_STATE.stakeholders.slice(0, 2) };
    assertEqual((await render(stakeholderTile, noOther)).querySelector('[data-support="other"]'), null);
  });

  test('showCritics toggles the critic list', async () => {
    assertEqual((await render(stakeholderTile, SH_STATE)).querySelectorAll('.dashboard-stakeholder__critics li').length, 1);
    assertEqual((await render(stakeholderTile, SH_STATE, { showCritics: false })).querySelector('.dashboard-stakeholder__critics'), null);
  });

  test('empty state', async () => {
    assertEqual((await render(stakeholderTile, undefined)).querySelector('.dashboard-area__empty').textContent, 'dashboard.stakeholderEmpty');
  });

  test('viewModel: quadrant cells, support row and critics as display data', () => {
    const vm = vmOf(stakeholderTile, SH_STATE);
    assertPlain(vm);
    assertDeepEqual(vm.quadrants[0], { quadrant: 'manage-closely', modifier: 'dashboard-stakeholder__cell--manage-closely',
      count: '2', label: 'modules.stakeholder-analysis.quadManageClosely' });
    assertDeepEqual(vm.support.map(s => s.key), ['supporter', 'neutral', 'critic', 'other']);
    assertEqual(vm.support[0].label, 'modules.stakeholder-analysis.supportSupporter: ');
    assertEqual(vm.criticsLabel, 'dashboard.stakeholderCritics');
    assertDeepEqual(vm.critics, [{ name: 'CFO', role: 'Finance' }]);
    assertEqual(vmOf(stakeholderTile, SH_STATE, { showCritics: false }).criticsLabel, null);
  });
});

const LL_STATE = { lessons: [
  { id: 'a', title: 'Scope creep', category: 'problem', impact: 'high', actions: [{ text: 'x', done: false }, { text: 'y', done: false }] },
  { id: 'b', title: 'Daily standup', category: 'success', impact: 'medium', actions: [] },
  { id: 'c', title: 'Data access', category: 'improve', impact: 'high', actions: [{ text: 'x', done: false }] },
] };

suite('dashboard tiles: lessons-learned', () => {
  test('summary shows category counts and open actions (alerted when > 0)', async () => {
    const host = (await render(lessonsTile, LL_STATE));
    assertEqual(host.querySelector('[data-stat="openActions"] strong').textContent, '3');
    assertTrue(host.querySelector('.dashboard-lessons__open--alert') !== null);
  });

  test('lists high-impact lessons with open action counts; topN caps', async () => {
    const host = (await render(lessonsTile, LL_STATE));
    assertDeepEqual([...host.querySelectorAll('.dashboard-fmea__top-desc')].map(e => e.textContent), ['Scope creep', 'Data access']);
    assertEqual(host.querySelector('.dashboard-fmea__top-rpn').textContent, '2');
    assertEqual((await render(lessonsTile, LL_STATE, { topN: 1 })).querySelectorAll('.dashboard-fmea__top-item').length, 1);
  });

  test('no open actions: no alert', async () => {
    const done = { lessons: [{ id: 'z', title: 'z', impact: 'high', actions: [{ text: 'x', done: true }] }] };
    assertEqual((await render(lessonsTile, done)).querySelector('.dashboard-lessons__open--alert'), null);
  });

  test('empty state', async () => {
    assertEqual((await render(lessonsTile, null)).querySelector('.dashboard-area__empty').textContent, 'dashboard.lessonsEmpty');
  });

  test('viewModel: stats with alert modifier and the open-action list', () => {
    const vm = vmOf(lessonsTile, LL_STATE);
    assertPlain(vm);
    assertDeepEqual(vm.stats.map(s => s.key), ['success', 'problem', 'improve', 'openActions']);
    assertDeepEqual(vm.stats[3], { key: 'openActions', label: 'dashboard.lessonsOpenActions: ', value: '3',
      modifier: 'dashboard-lessons__open--alert' });
    assertEqual(vm.stats[0].modifier, '');
    assertEqual(vm.topLabel, 'dashboard.lessonsHighOpen');
    assertDeepEqual(vm.top, [{ title: 'Scope creep', open: '2' }, { title: 'Data access', open: '1' }]);
  });
});

/** Fake tile-bound chart manager: records creates and destroys. */
function recordingChartManager() {
  const made = []; const destroyed = [];
  return {
    made, destroyed,
    create: async (el, type, cfg) => { const c = { el, type, cfg, config: { ...cfg } }; made.push(c); return c; },
    update: () => {},
    destroy: (c) => { destroyed.push(c); },
  };
}

/** Render an async chart tile like the host, with optional setting overrides. */
async function renderChartTile(tile, state, overrides = {}, cm = recordingChartManager()) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const settings = resolveSettings(validateSchema(tile.settings), overrides);
  await mountTile(tile, { tileId: 't', instanceId: 'i', state, settings, i18n, theme: 'light', chartManager: cm, stateManager: null }, host);
  return { host, cm };
}

const CAP_VALUES = [9.8, 10.1, 10.0, 9.9, 10.2, 10.05, 9.95, 10.1, 9.85, 10.0];
const CAP_STATE = { embeddedValues: CAP_VALUES, params: { lsl: '9.5', usl: '10.5', target: '10' } };
const CAP_COL = { instanceId: 'w', sheetId: 's', columnId: 'm' };

suite('dashboard tiles: process-capability', () => {
  if (!Alpine.version) Alpine.start();
  registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });

  /** Render args: the worksheet reaches the derived `analysis` through the reader (`source`). */
  function capArgs(state, settings, cm, cols = {}) {
    const sm = columnStateManager(cols);
    return { tileId: 't', instanceId: 'i', state, settings, i18n, theme: 'light',
      chartManager: cm, stateManager: sm, source: createSource(sm) };
  }
  async function renderCap(state, overrides = {}, cm = recordingChartManager(), cols = {}) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const settings = resolveSettings(validateSchema(capabilityTile.settings), overrides);
    await mountTile(capabilityTile, capArgs(state, settings, cm, cols), host);
    await flush();
    return { host, cm };
  }
  const capVm = (state, overrides = {}, cols = {}) => vmOf(capabilityTile, state, overrides, { stateManager: columnStateManager(cols) });

  test('declares the Cpk prefix and refreshes on resize and worksheet changes', async () => {
    assertEqual(capabilityTile.titlePrefix, 'Cpk');
    assertDeepEqual(capabilityTile.refreshOn, ['state:saved', 'resize', 'worksheet:dataChanged']);
  });

  test('empty without data source, no-data without a spec limit', async () => {
    let { host, cm } = await renderCap({});
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.capabilityEmpty');
    assertEqual(cm.made.length, 0);
    host.remove();
    ({ host, cm } = await renderCap({ embeddedValues: CAP_VALUES }));
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.capabilityNoData');
    assertEqual(cm.made.length, 0);
    host.remove();
  });

  test('state undefined renders the empty state', async () => {
    const { host } = await renderCap(undefined);
    assertTrue(host.querySelector('.dashboard-area__empty') !== null);
    host.remove();
  });

  test('a deleted measurement column shows no-data, not a result', async () => {
    const state = { columnRef: CAP_COL, params: { lsl: 9.5, usl: 10.5 } };
    const vm = capVm(state, {}, { other: CAP_VALUES });
    assertEqual(vm.empty, 'dashboard.capabilityNoData');
    assertEqual(vm.chart, null);
    assertDeepEqual(vm.metrics, []);
    const { host, cm } = await renderCap(state, {}, recordingChartManager(), { other: CAP_VALUES });
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.capabilityNoData');
    assertEqual(cm.made.length, 0);
    host.remove();
  });

  test('a worksheet column drives the figures', async () => {
    const vm = capVm({ columnRef: CAP_COL, params: { lsl: 9.5, usl: 10.5 } }, {}, { m: CAP_VALUES });
    assertEqual(vm.empty, null);
    assertEqual(vm.stats[1].value, '10');
    assertEqual(vm.chart.data.length, CAP_VALUES.length);
  });

  test('figures: Cpk traffic light, Ppk, Cp for two-sided limits, PPM and n', async () => {
    const { host } = await renderCap(CAP_STATE);
    const labels = [...host.querySelectorAll('.dashboard-spc__metric-label')].map(e => e.textContent);
    assertDeepEqual(labels, ['Cpk', 'Ppk']);
    const cpk = host.querySelector('.dashboard-spc__metric');
    assertTrue(/dashboard-spc__metric--(ok|warn|bad)/.test(cpk.className));
    assertTrue(cpk.querySelector('.dashboard-spc__metric-sub').textContent.startsWith('Cp = '));
    const stats = [...host.querySelectorAll('.dashboard-spc__stat-label')].map(e => e.textContent);
    assertDeepEqual(stats, ['dashboard.capabilityPpm', 'n']);
    assertEqual(host.querySelectorAll('.dashboard-spc__stat-value')[1].textContent, '10');
    host.remove();
  });

  test('Cpk, Ppk and Cp in the app language (de: decimal comma)', async () => {
    const en = capVm(CAP_STATE).metrics;
    const de = vmOf(capabilityTile, CAP_STATE, {}, {
      stateManager: columnStateManager({}), i18n: { t: (k) => k, getLanguage: () => 'de' } }).metrics;
    assertTrue(/^\d+\.\d{2}$/.test(en[0].value), `en Cpk: ${en[0].value}`);
    assertEqual(de[0].value, en[0].value.replace('.', ','));
    assertEqual(de[0].sub, en[0].sub.replace('.', ','));
    assertEqual(de[1].value, en[1].value.replace('.', ','));
  });

  test('one-sided limit: no Cp line', async () => {
    const { host } = await renderCap({ embeddedValues: CAP_VALUES, params: { usl: '10.5' } });
    assertEqual(host.querySelector('.dashboard-spc__metric .dashboard-spc__metric-sub'), null);
    host.remove();
  });

  test('ppmBasis picks the PPM field', async () => {
    const value = (basis) => capVm(CAP_STATE, { ppmBasis: basis }).stats[0].value;
    assertEqual(value('observed'), '0');
    assertTrue(value('overall') !== '0', 'overall PPM is model-based, not 0');
    assertTrue(value('within') !== '0', 'within PPM is model-based, not 0');
    const { host } = await renderCap(CAP_STATE, { ppmBasis: 'observed' });
    assertEqual(host.querySelectorAll('.dashboard-spc__stat-value')[0].textContent, '0');
    host.remove();
  });

  test('histogram: compact flags, normal curve, spec ref lines', async () => {
    const { host, cm } = await renderCap(CAP_STATE);
    await waitFor(() => cm.made.length > 0);
    assertEqual(cm.made.length, 1);
    const { type, cfg } = cm.made[0];
    assertEqual(type, 'histogram');
    for (const k of ['showTitle', 'showXLabel', 'showYLabel', 'showXTicks', 'showYTicks', 'showLegend']) {
      assertEqual(cfg[k], false, k);
    }
    assertEqual(cfg.showNormalCurve, true);
    assertEqual(cfg.normalCurveColor, 'var(--color-info)');
    assertDeepEqual(cfg.refLines.map(l => l.label), ['common.sym.lsl', 'common.sym.usl', 'common.sym.target']);
    assertEqual(cfg.data.length, CAP_VALUES.length);
    host.remove();
  });

  test('non-finite capability indices show an em dash, not "Infinity"', async () => {
    const flat = { embeddedValues: [5, 5, 5, 5, 5, 5], params: { lsl: '4', usl: '6' } };
    const { host } = await renderCap(flat);
    const values = [...host.querySelectorAll('.dashboard-spc__metric-value')].map(e => e.textContent);
    for (const v of values) assertTrue(!/Infinity|NaN|–/.test(v), `no raw non-finite or en dash: ${v}`);
    assertTrue(values.includes('—'), 'em dash for the infinite index');
    assertTrue(!/Infinity/.test(host.textContent), 'no Infinity anywhere');
    host.remove();
  });

  test('histogram passes the capability axis titles (hidden by default)', async () => {
    const { host, cm } = await renderCap(CAP_STATE);
    await waitFor(() => cm.made.length > 0);
    const { cfg } = cm.made[0];
    assertEqual(cfg.xLabel, 'modules.process-capability.histogramXLabel');
    assertEqual(cfg.yLabel, 'modules.process-capability.histogramYLabel');
    assertEqual(cfg.showXLabel, false);
    assertEqual(cfg.showYLabel, false);
    host.remove();
  });

  test('showChart off: figures only, no chart', async () => {
    const { host, cm } = await renderCap(CAP_STATE, { showChart: false });
    assertEqual(cm.made.length, 0);
    assertEqual(host.querySelector('.dashboard-capability__plot'), null);
    assertTrue(host.querySelector('.dashboard-spc__metric') !== null);
    host.remove();
  });

  test('an analysis hint is shown under the figures', async () => {
    const { host } = await renderCap({ ...CAP_STATE, params: { ...CAP_STATE.params, withinMethod: 'pooled' } });
    assertEqual(host.querySelector('.dashboard-capability__hint').textContent,
      'modules.process-capability.methodFallbackHint');
    host.remove();
  });

  test('a second render and dispose destroy the previous chart', async () => {
    const cm = recordingChartManager();
    const { host } = await renderCap(CAP_STATE, {}, cm);
    await waitFor(() => cm.made.length === 1);
    await mountTile(capabilityTile, capArgs(CAP_STATE, resolveSettings(validateSchema(capabilityTile.settings), {}), cm), host);
    await waitFor(() => cm.made.length === 2);
    assertDeepEqual(cm.destroyed, [cm.made[0]]);
    disposeTile(capabilityTile, host, { tileId: 't' });
    assertDeepEqual(cm.destroyed, [cm.made[0], cm.made[1]]);
    host.remove();
  });

  test('a chart that resolves after a newer render is destroyed (stale token)', async () => {
    const made = []; const destroyed = []; const pending = [];
    const cm = {
      create: (el, type, cfg) => new Promise(r => { const c = { cfg, config: { ...cfg } }; made.push(c); pending.push(() => r(c)); }),
      update: () => {},
      destroy: (c) => destroyed.push(c),
    };
    const host = document.createElement('div');
    const args = capArgs(CAP_STATE, resolveSettings(validateSchema(capabilityTile.settings), {}), cm);
    await mountTile(capabilityTile, args, host);
    await waitFor(() => pending.length === 1);
    await mountTile(capabilityTile, args, host);
    await waitFor(() => pending.length === 2);
    pending[1](); await flush();
    pending[0](); await flush();
    assertTrue(destroyed.includes(made[0]), 'stale chart destroyed');
    assertTrue(!destroyed.includes(made[1]), 'current chart kept');
  });

  test('a failed chart create (null) keeps the figures', async () => {
    const cm = { create: async () => null, update: () => {}, destroy: () => {} };
    const { host } = await renderCap(CAP_STATE, {}, cm);
    assertTrue(host.querySelector('.dashboard-spc__metric') !== null);
    host.remove();
  });

  test('viewModel: metrics, stats and histogram config as display data', () => {
    const vm = capVm(CAP_STATE);
    assertPlain({ empty: vm.empty, hint: vm.hint, metrics: vm.metrics, stats: vm.stats });
    assertEqual(vm.empty, null);
    assertEqual(vm.hint, null);
    assertTrue(/^dashboard-spc__metric--(ok|warn|bad)$/.test(vm.metrics[0].modifier), vm.metrics[0].modifier);
    assertEqual(vm.metrics[0].label, 'Cpk');
    assertTrue(vm.metrics[0].sub.startsWith('Cp = '));
    assertDeepEqual({ ...vm.metrics[1], value: null }, { modifier: '', value: null, label: 'Ppk', sub: null });
    assertDeepEqual(vm.stats.map(s => s.label), ['dashboard.capabilityPpm', 'n']);
    assertEqual(vm.stats[1].value, '10');
    assertEqual(vm.chart.data.length, CAP_VALUES.length);
    assertEqual(vm.chart.binMethod, undefined);
    assertDeepEqual(vm.chart.refLines.map(l => l.label), ['common.sym.lsl', 'common.sym.usl', 'common.sym.target']);
    checkValue(histogramWidget.props.config, 'chart', vm.chart);
  });

  test('viewModel: empty and no-data states, showChart off', () => {
    const empty = capVm({});
    assertEqual(empty.empty, 'dashboard.capabilityEmpty');
    assertEqual(empty.hint, null);
    assertEqual(capVm({ embeddedValues: CAP_VALUES }).empty, 'dashboard.capabilityNoData');
    assertEqual(capVm(CAP_STATE, { showChart: false }).chart, null);
  });

  test('viewModel: derived threw ({ error }) counts as no analysis', () => {
    const boom = { columns: [{ id: 'm', get values() { throw new TypeError('boom'); } }] };
    const src = Object.freeze({ read: () => boom, list: () => [] });
    const vm = vmOf(capabilityTile, { columnRef: CAP_COL, params: { lsl: 9.5 } }, {}, { source: src });
    assertEqual(vm.empty, 'dashboard.capabilityNoData');
    assertEqual(vm.chart, null);
    assertDeepEqual(vm.stats, []);
    assertEqual(vm.hint, null);
  });
});

const ATTR_D = { instanceId: 'w', sheetId: 's', columnId: 'd' };
const ATTR_N = { instanceId: 'w', sheetId: 's', columnId: 'n' };

/** stateManager stand-in: one worksheet `w` in phase control, serving the given columns. */
function columnStateManager(cols) {
  const rowCount = Math.max(0, ...Object.values(cols).map((v) => v.length));
  return withStoredWorksheetReader({
    getModuleState: (id) => (id === 'w' ? {
      sheets: [{ id: 's', name: 'S', state: { rowCount, columns: Object.entries(cols).map(([cid, values]) => ({ id: cid, name: cid, type: 'numeric', values })) } }],
    } : null),
    get: (p) => {
      if (p === 'phases') return { control: [{ instanceId: 'w', moduleId: 'worksheet' }] };
      if (p === 'phases.control') return [{ instanceId: 'w', moduleId: 'worksheet' }];
      return null;
    },
  });
}

/** Render args of the attribute tile: the worksheet reaches the derived `analysis` through the reader (`source`). */
function attrArgs(state, cols, settings, cm) {
  const sm = columnStateManager(cols);
  return { tileId: 't', instanceId: 'i', state, settings, i18n, theme: 'light',
    chartManager: cm, stateManager: sm, source: createSource(sm) };
}

/** Tile view model with the worksheet behind the reader of its `stateManager`. */
function attrVm(state, cols, overrides = {}) {
  return vmOf(attrSpcTile, state, overrides, { stateManager: columnStateManager(cols) });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function renderAttr(state, cols, overrides = {}, cm = recordingChartManager()) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const settings = resolveSettings(validateSchema(attrSpcTile.settings), overrides);
  await mountTile(attrSpcTile, attrArgs(state, cols, settings, cm), host);
  await flush();
  return { host, cm };
}

const C_STATE = { chartTypeId: 'c', defectsRef: ATTR_D };
const C_STABLE = { d: [3, 4, 2, 5, 3, 4, 3, 2, 4, 3] };
const C_UNSTABLE = { d: [2, 2, 2, 2, 2, 2, 2, 2, 2, 30] };

suite('dashboard tiles: attribute-control-chart', () => {
  if (!Alpine.version) Alpine.start();
  registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });

  test('chart carries the module axis titles while the flags keep them hidden', async () => {
    const { host, cm } = await renderAttr(C_STATE, C_STABLE);
    await waitFor(() => cm.made.length > 0);
    const { cfg } = cm.made[0];
    assertEqual(cfg.editKey, undefined);
    assertEqual(cfg.xLabel, 'modules.attribute-control-chart.xLabelSample');
    assertEqual(cfg.yLabel, 'modules.attribute-control-chart.yLabel_c');
    assertEqual(cfg.showXLabel, false);
    assertEqual(cfg.showYLabel, false);
    host.remove();
  });

  test('refreshes on resize', async () => {
    assertDeepEqual(attrSpcTile.refreshOn, ['state:saved', 'resize', 'worksheet:dataChanged']);
    // The dashboard host subscribes to custom events and re-renders the placed tile (preload and later edits).
    assertDeepEqual(customRefreshEvents([{ tile: attrSpcTile }]), ['worksheet:dataChanged']);
    assertDeepEqual(refreshTargets([{ id: 'acc:i1', tile: attrSpcTile }, { id: 'spc:i1', tile: spcTile }], ['acc:i1', 'spc:i1'], 'worksheet:dataChanged'), ['acc:i1']);
  });

  test('empty without defects column, no-data with too few points or no size column', async () => {
    let { host } = await renderAttr({ chartTypeId: 'c' }, {});
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.attrSpcEmpty');
    host.remove();
    ({ host } = await renderAttr(C_STATE, { d: [3] }));
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.attrSpcNoData');
    host.remove();
    ({ host } = await renderAttr({ chartTypeId: 'p', defectsRef: ATTR_D }, { d: [1, 2, 3] }));
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.attrSpcNoData');
    host.remove();
  });

  test('state undefined renders the empty state', async () => {
    const { host } = await renderAttr(undefined, {});
    assertTrue(host.querySelector('.dashboard-area__empty') !== null);
    host.remove();
  });

  test('stable: ok badge, type badge, 0 violations of 10, CL/UCL/LCL', async () => {
    const { host } = await renderAttr(C_STATE, C_STABLE);
    assertEqual(host.querySelector('.dashboard-attr-spc__type').textContent, 'c');
    const badge = host.querySelector('.dashboard-attr-spc__badge');
    assertTrue(badge.classList.contains('dashboard-attr-spc__badge--ok'));
    assertEqual(badge.textContent, 'dashboard.attrSpcStable');
    assertEqual(host.querySelector('.dashboard-spc__metric-value').textContent, '0');
    const labels = [...host.querySelectorAll('.dashboard-spc__stat-label')].map(e => e.textContent);
    assertDeepEqual(labels, ['CL', 'UCL', 'LCL']);
    host.remove();
  });

  test('unstable: bad badge, violation count, chart marks the point', async () => {
    const { host, cm } = await renderAttr(C_STATE, C_UNSTABLE);
    assertTrue(host.querySelector('.dashboard-attr-spc__badge').classList.contains('dashboard-attr-spc__badge--bad'));
    assertEqual(host.querySelector('.dashboard-spc__metric-value').textContent, '1');
    await waitFor(() => cm.made.length > 0);
    const cfg = cm.made[0].cfg;
    assertEqual(cm.made[0].type, 'control-chart');
    assertEqual(cfg.editKey, undefined);
    assertTrue(cfg.violationIndices.has(9));
    assertEqual(cfg.showZones, true);
    for (const k of ['showTitle', 'showXLabel', 'showYLabel', 'showXTicks', 'showYTicks', 'showLegend']) {
      assertEqual(cfg[k], false, k);
    }
    host.remove();
  });

  test('variable limits: mean labelled UCL̄ / LCL̄, no zones', async () => {
    const { host, cm } = await renderAttr({ chartTypeId: 'p', defectsRef: ATTR_D, sizeRef: ATTR_N },
      { d: [2, 3, 1, 4, 3, 2], n: [50, 60, 40, 50, 70, 45] });
    const labels = [...host.querySelectorAll('.dashboard-spc__stat-label')].map(e => e.textContent);
    assertDeepEqual(labels, ['CL', 'UCL̄', 'LCL̄']);
    await waitFor(() => cm.made.length > 0);
    assertEqual(cm.made[0].cfg.showZones, false);
    assertEqual(cm.made[0].cfg.xOffset, 0, 'no window, no offset');
    host.remove();
  });

  test('lastN shows the last points with shifted indices; figures stay on all points', async () => {
    const { host, cm } = await renderAttr(C_STATE, C_UNSTABLE, { lastN: 4 });
    await waitFor(() => cm.made.length > 0);
    const cfg = cm.made[0].cfg;
    assertEqual(cfg.values.length, 4);
    assertTrue(cfg.violationIndices.has(3));
    assertEqual(cfg.xOffset, 6, 'points keep their real sample numbers 7..10');
    assertEqual(cfg.xMin, 6.5);
    assertEqual(cfg.xMax, 10.5);
    assertEqual(host.querySelector('.dashboard-spc__metric-sub').textContent, 'dashboard.spcOf');
    host.remove();
  });

  test('lastN drops violations and a baseline outside the window', async () => {
    const { cm } = await renderAttr({ ...C_STATE, baselineCount: 3 }, { d: [30, 2, 2, 2, 2, 2, 2, 2, 2, 2] }, { lastN: 5 });
    await waitFor(() => cm.made.length > 0);
    const cfg = cm.made[0].cfg;
    assertEqual(cfg.violationIndices.size, 0);
    assertEqual(cfg.baselineEnd, null);
  });

  test('showChart off: figures only', async () => {
    const { host, cm } = await renderAttr(C_STATE, C_STABLE, { showChart: false });
    assertEqual(cm.made.length, 0);
    assertTrue(host.querySelector('.dashboard-attr-spc__badge') !== null);
    host.remove();
  });

  test('a second render and dispose destroy the previous chart', async () => {
    const cm = recordingChartManager();
    const { host } = await renderAttr(C_STATE, C_STABLE, {}, cm);
    await waitFor(() => cm.made.length === 1);
    await mountTile(attrSpcTile, attrArgs(C_STATE, C_STABLE,
      resolveSettings(validateSchema(attrSpcTile.settings), {}), cm), host);
    await waitFor(() => cm.made.length === 2);
    assertDeepEqual(cm.destroyed, [cm.made[0]]);
    disposeTile(attrSpcTile, host, { tileId: 't' });
    assertDeepEqual(cm.destroyed, [cm.made[0], cm.made[1]]);
    host.remove();
  });

  test('a chart that resolves after a newer render is destroyed (stale token)', async () => {
    const made = []; const destroyed = []; const pending = [];
    const cm = {
      create: (el, type, cfg) => new Promise(r => { const c = { cfg, config: { ...cfg } }; made.push(c); pending.push(() => r(c)); }),
      update: () => {},
      destroy: (c) => destroyed.push(c),
    };
    const host = document.createElement('div');
    const args = attrArgs(C_STATE, C_STABLE, resolveSettings(validateSchema(attrSpcTile.settings), {}), cm);
    await mountTile(attrSpcTile, args, host);
    await waitFor(() => pending.length === 1);
    await mountTile(attrSpcTile, args, host);
    await waitFor(() => pending.length === 2);
    pending[1](); await flush();
    pending[0](); await flush();
    assertTrue(destroyed.includes(made[0]), 'stale chart destroyed');
    assertTrue(!destroyed.includes(made[1]), 'current chart kept');
  });

  test('viewModel: badge, metric, limits and windowed chart config', () => {
    const vm = attrVm(C_STATE, C_UNSTABLE);
    assertEqual(vm.empty, null);
    assertEqual(vm.type, 'c');
    assertEqual(vm.badgeModifier, 'dashboard-attr-spc__badge--bad');
    assertEqual(vm.badge, 'dashboard.attrSpcUnstable');
    assertDeepEqual(vm.metric, { modifier: 'dashboard-spc__metric--bad', value: '1',
      label: 'dashboard.spcViolations', sub: 'dashboard.spcOf' });
    assertDeepEqual([vm.clText, vm.uclLabel, vm.lclLabel], ['4.8000', 'UCL', 'LCL']);
    assertEqual(vm.chart.type, undefined);
    assertDeepEqual(vm.chart.violationIndices, [9]);
    assertEqual(vm.chart.showZones, true);
    assertEqual(vm.chart.editKey, undefined);
    assertEqual(vm.chart.showXLabel, false);
    assertEqual(vm.chart.yLabel, 'modules.attribute-control-chart.yLabel_c');
    assertTrue(Array.isArray(vm.chart.cl));
    checkValue(controlChartWidget.props.config, 'chart', vm.chart);
  });

  test('viewModel: derived threw ({ error }) counts as no analysis', () => {
    const boom = { columns: [{ id: 'd', get values() { throw new TypeError('boom'); } }] };
    const src = Object.freeze({ read: () => boom, list: () => [] });
    const vm = vmOf(attrSpcTile, C_STATE, {}, { source: src });
    assertEqual(typeof vm.analysis.error, 'string');
    assertEqual(vm.empty, 'dashboard.attrSpcNoData');
    assertDeepEqual(vm.signals, []);
    assertEqual(vm.stable, true);
    assertEqual(vm.variable, false);
    assertEqual(vm.type, '');
    assertEqual(vm.chart, null);
    assertEqual(vm.metric.sub, 'dashboard.spcOf');
    assertEqual(vm.clText, '—');
  });

  test('viewModel reads only through src.read (no facade members)', () => {
    const sm = columnStateManager(C_STABLE);
    const vm = vmOf(attrSpcTile, C_STATE, {}, { source: spySource(createSource(sm)) });
    assertEqual(vm.empty, null);
    assertEqual(vm.type, 'c');
  });

  test('mounted like the dashboard: not_loaded shows no-data; after load, the re-render (state:saved) shows the analysis', async () => {
    const sm = { get: (p) => (p === 'phases' ? { control: [{ instanceId: 'w', moduleId: 'worksheet' }] } : null) };
    let loaded = false;
    const stored = { sheets: [{ id: 's', name: 'S', state: { rowCount: 10, columns: [{ id: 'd', name: 'd', type: 'numeric', values: C_STABLE.d }] } }] };
    registerReader(sm, (id, o) => {
      if (!loaded) { const e = new Error('not_loaded: worksheet'); e.code = 'not_loaded'; throw e; }
      return readWorksheetState(stored, o);
    });
    const settings = resolveSettings(validateSchema(attrSpcTile.settings), { showChart: false });
    const args = { tileId: 't', instanceId: 'i', state: C_STATE, settings, i18n, theme: 'light',
      chartManager: recordingChartManager(), stateManager: sm };
    const host = document.createElement('div');
    document.body.appendChild(host);
    await mountTile(attrSpcTile, args, host);
    await flush();
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.attrSpcNoData');
    loaded = true;
    bumpWorksheetRevisions();
    await mountTile(attrSpcTile, args, host); // the dashboard's renderTile after state:saved
    await flush();
    assertEqual(host.querySelector('.dashboard-area__empty'), null);
    assertEqual(host.querySelector('.dashboard-attr-spc__type').textContent, 'c');
    host.remove();
  });

  test('viewModel: empty, no-data and showChart off', () => {
    assertEqual(attrVm({ chartTypeId: 'c' }, {}).empty, 'dashboard.attrSpcEmpty');
    assertEqual(attrVm(C_STATE, { d: [3] }).empty, 'dashboard.attrSpcNoData');
    const off = attrVm(C_STATE, C_STABLE, { showChart: false });
    assertEqual(off.chart, null);
    assertEqual(off.badgeModifier, 'dashboard-attr-spc__badge--ok');
  });
});

const SIPOC_STATE = {
  columns: {
    suppliers: ['Bakery', 'Mill'],
    inputs: ['Flour', 'Water', 'Yeast', 'Salt'],
    process: ['Knead', 'Bake'],
    outputs: ['A very long output description that must not widen the tile'],
    customers: [],
  },
};

suite('dashboard tiles: sipoc', () => {
  test('declares the SIPOC prefix and a wide default size', async () => {
    assertEqual(sipocTile.titlePrefix, 'SIPOC');
    assertDeepEqual(sipocTile.size, { defaultW: 6, defaultH: 10, minW: 4, minH: 6 });
  });

  test('empty state for an empty or undefined state', async () => {
    for (const state of [{}, undefined, { columns: { inputs: [] } }]) {
      const host = (await render(sipocTile, state));
      assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'modules.sipoc.tileEmpty');
    }
  });

  test('a stored state from a newer version shows the empty state instead of throwing', async () => {
    const host = (await render(sipocTile, { _schema: { version: '9.0' }, columns: { inputs: ['Flour'] } }));
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'modules.sipoc.tileEmpty');
  });

  test('a current-version state with a bad entry renders (repaired) instead of throwing', async () => {
    const host = (await render(sipocTile, { _schema: { version: '1.0' }, columns: { inputs: [42], outputs: ['Bread'] } }));
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'modules.sipoc.tileEmpty');
  });

  test('five columns in order with letter, name and count', async () => {
    const host = (await render(sipocTile, SIPOC_STATE));
    const cols = [...host.querySelectorAll('.dashboard-sipoc__col')];
    assertDeepEqual(cols.map(c => c.dataset.col), ['suppliers', 'inputs', 'process', 'outputs', 'customers']);
    assertDeepEqual(cols.map(c => c.querySelector('.dashboard-sipoc__letter').textContent), ['S', 'I', 'P', 'O', 'C']);
    assertEqual(cols[0].querySelector('.dashboard-sipoc__name').textContent, 'modules.sipoc.col.suppliers');
    assertDeepEqual(cols.map(c => c.querySelector('.dashboard-sipoc__count').textContent), ['2', '4', '2', '1', '0']);
  });

  test('default topN 3: first three entries and a "more" line', async () => {
    const host = (await render(sipocTile, SIPOC_STATE));
    const inputs = host.querySelector('[data-col="inputs"]');
    assertDeepEqual([...inputs.querySelectorAll('.dashboard-sipoc__item')].map(e => e.textContent), ['Flour', 'Water', 'Yeast']);
    assertEqual(inputs.querySelector('.dashboard-sipoc__more').textContent, 'modules.sipoc.tileMore');
    assertEqual(host.querySelector('[data-col="process"] .dashboard-sipoc__more'), null);
  });

  test('topN 4 shows all inputs, no "more" line', async () => {
    const host = (await render(sipocTile, SIPOC_STATE, { topN: 4 }));
    const inputs = host.querySelector('[data-col="inputs"]');
    assertEqual(inputs.querySelectorAll('.dashboard-sipoc__item').length, 4);
    assertEqual(inputs.querySelector('.dashboard-sipoc__more'), null);
  });

  test('every entry carries its full text as title', async () => {
    const host = (await render(sipocTile, SIPOC_STATE));
    const item = host.querySelector('[data-col="outputs"] .dashboard-sipoc__item');
    assertEqual(item.getAttribute('title'), SIPOC_STATE.columns.outputs[0]);
  });

  test('an empty column is marked as gap; the filled line appears', async () => {
    const host = (await render(sipocTile, SIPOC_STATE));
    const gaps = [...host.querySelectorAll('.dashboard-sipoc__col--gap')].map(c => c.dataset.col);
    assertDeepEqual(gaps, ['customers']);
    assertEqual(host.querySelector('[data-col="customers"] .dashboard-sipoc__gap').textContent, '—');
    assertEqual(host.querySelector('.dashboard-sipoc__filled').textContent, 'modules.sipoc.tileFilled');
  });

  test('all five filled: no gap, no filled line', async () => {
    const full = { columns: { ...SIPOC_STATE.columns, customers: ['Shop'] } };
    const host = (await render(sipocTile, full));
    assertEqual(host.querySelectorAll('.dashboard-sipoc__col--gap').length, 0);
    assertEqual(host.querySelector('.dashboard-sipoc__filled'), null);
  });

  test('viewModel: Scope der neuen Form (Model, Einstellungen, view-Glieder)', () => {
    const vm = vmOf(sipocTile, SIPOC_STATE);
    assertEqual(vm._templateTile, true);
    assertEqual(vm.settings.topN, 3);
    assertEqual(vm.empty, false);
    assertEqual(vm.filledText, 'modules.sipoc.tileFilled');
    assertDeepEqual(vm.columns[1], { key: 'inputs', letter: 'I', count: 4, top: ['Flour', 'Water', 'Yeast'], more: 1 });
    assertEqual(vm.colClass(vm.columns[4]), 'dashboard-sipoc__col--gap');
    assertEqual(vm.moreText(vm.columns[2]), '');
    assertEqual(vm.moreText(vm.columns[1]), 'modules.sipoc.tileMore');
  });

  test('viewModel: empty state', () => {
    const vm = vmOf(sipocTile, undefined);
    assertEqual(vm.empty, true);
    assertEqual(vm.filledText, '');
  });

  test('neue Form: Einstellung topN mit Beschriftungsliste und Hilfe-Schlüssel', () => {
    assertDeepEqual(sipocTile.settings.topN, {
      type: 'number', min: 1, max: 10, step: 1, default: 3,
      label: ['modules.sipoc.tile.settings.topN.label', 'dashboard.tileSettings.topN'],
      helpKey: 'modules.sipoc.tile.settings.topN.help',
    });
  });

  test('Spaltenköpfe tragen den Anker des Feldes columns', async () => {
    const host = (await render(sipocTile, SIPOC_STATE));
    const heads = [...host.querySelectorAll('.dashboard-sipoc__head')];
    assertEqual(heads.length, 5);
    assertTrue(heads.every((h) => h.dataset.helpKey === 'modules.sipoc.fields.columns.help'));
  });
});

/** Kano answer pairs (functional, dysfunctional) per category, from the Kano table. */
const KANO_ANS = { O: { f: 1, d: 5, w: null }, A: { f: 1, d: 3, w: null }, M: { f: 3, d: 5, w: null },
  I: { f: 3, d: 3, w: null }, R: { f: 5, d: 3, w: null }, Q: { f: 1, d: 1, w: null } };

/** Kano state: items i1..iN, respondents r1..rM, answers[r][i] = category letter. */
function kanoState(grid) {
  const itemIds = Object.keys(grid[Object.keys(grid)[0]] || {});
  return {
    items: itemIds.map(id => ({ id, nodeId: null, label: id.toUpperCase(), path: '', missing: false })),
    respondents: Object.keys(grid).map(id => ({ id, name: id })),
    answers: Object.fromEntries(Object.entries(grid).map(([rid, byItem]) =>
      [rid, Object.fromEntries(Object.entries(byItem).map(([iid, cat]) => [iid, cat ? { ...KANO_ANS[cat] } : { f: null, d: null, w: null }]))])),
  };
}

const KANO_STATE = kanoState({ r1: { i1: 'O', i2: 'M', i3: 'A' }, r2: { i1: 'O', i2: 'M', i3: 'A' } });

suite('dashboard tiles: kano', () => {
  test('declares the Kano prefix and refreshes on resize', async () => {
    assertEqual(kanoTile.titlePrefix, 'Kano');
    assertDeepEqual(kanoTile.refreshOn, ['state:saved', 'resize']);
  });

  test('empty without items, also for undefined state', async () => {
    for (const state of [{}, undefined]) {
      const { host, cm } = await renderChartTile(kanoTile, state);
      assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.kanoEmpty');
      assertEqual(cm.made.length, 0);
      host.remove();
    }
  });

  test('no data: items but no classified answer', async () => {
    const { host, cm } = await renderChartTile(kanoTile, kanoState({ r1: { i1: null, i2: null } }));
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.kanoNoData');
    assertEqual(cm.made.length, 0);
    host.remove();
  });

  test('bar and legend: one segment per present category in M, O, A order', async () => {
    const { host } = await renderChartTile(kanoTile, KANO_STATE);
    const segs = [...host.querySelectorAll('.dashboard-fmea__bar-seg')];
    assertDeepEqual(segs.map(s => s.dataset.cat), ['M', 'O', 'A']);
    assertTrue(segs[0].getAttribute('style').includes('var(--color-chart-1)'));
    assertTrue(segs[2].getAttribute('style').includes('var(--color-chart-3)'));
    const legend = [...host.querySelectorAll('.dashboard-fmea__legend-item')];
    assertDeepEqual(legend.map(l => l.dataset.cat), ['M', 'O', 'A']);
    assertTrue(legend[0].textContent.includes('modules.kano.catM'));
    assertTrue(legend[0].textContent.includes(': 1'));
    host.remove();
  });

  test('totals: completeness, items, respondents', async () => {
    const { host } = await renderChartTile(kanoTile, kanoState({ r1: { i1: 'O', i2: 'M' }, r2: { i1: 'O', i2: null } }));
    const values = [...host.querySelectorAll('.dashboard-kano__totals .dashboard-spc__stat-value')].map(e => e.textContent);
    assertDeepEqual(values, ['75 %', '2', '2']);
    host.remove();
  });

  test('Q warning above 10 %, none at or below', async () => {
    let { host } = await renderChartTile(kanoTile, kanoState({ r1: { i1: 'Q' }, r2: { i1: 'O' } }));
    assertEqual(host.querySelector('.dashboard-kano__warn').textContent, 'modules.kano.warnQShare');
    host.remove();
    ({ host } = await renderChartTile(kanoTile, KANO_STATE));
    assertEqual(host.querySelector('.dashboard-kano__warn'), null);
    host.remove();
  });

  test('scatter through the tile chart manager, every element hidden', async () => {
    const { host, cm } = await renderChartTile(kanoTile, KANO_STATE);
    assertEqual(cm.made.length, 1);
    assertEqual(cm.made[0].type, 'scatter');
    const cfg = cm.made[0].cfg;
    assertEqual(cfg.series.length, 3);
    assertEqual(cfg.refLines.length, 2);
    for (const k of ['showTitle', 'showXLabel', 'showYLabel', 'showXTicks', 'showYTicks', 'showLegend']) {
      assertEqual(cfg[k], false, k);
    }
    assertTrue(host.querySelector('.dashboard-kano__plot') !== null);
    host.remove();
  });

  test('no chart when no row has cs and ds (only R/Q answers)', async () => {
    const { host, cm } = await renderChartTile(kanoTile, kanoState({ r1: { i1: 'R', i2: 'Q' } }));
    assertEqual(cm.made.length, 0);
    assertEqual(host.querySelector('.dashboard-kano__plot'), null);
    assertTrue(host.querySelector('.dashboard-fmea__bar') !== null);
    host.remove();
  });

  test('showChart off: figures only', async () => {
    const { host, cm } = await renderChartTile(kanoTile, KANO_STATE, { showChart: false });
    assertEqual(cm.made.length, 0);
    assertTrue(host.querySelector('.dashboard-kano__totals') !== null);
    host.remove();
  });

  test('a second render and dispose destroy the previous chart', async () => {
    const cm = recordingChartManager();
    const { host } = await renderChartTile(kanoTile, KANO_STATE, {}, cm);
    await mountTile(kanoTile, { tileId: 't', instanceId: 'i', state: KANO_STATE,
      settings: resolveSettings(validateSchema(kanoTile.settings), {}), i18n, theme: 'light',
      chartManager: cm, stateManager: null }, host);
    assertDeepEqual(cm.destroyed, [cm.made[0]]);
    kanoTile.dispose(host, { tileId: 't' });
    assertDeepEqual(cm.destroyed, [cm.made[0], cm.made[1]]);
    host.remove();
  });

  test('a chart that resolves after a newer render is destroyed (stale token)', async () => {
    const made = []; const destroyed = []; const pending = [];
    const cm = {
      create: (el, type, cfg) => new Promise(r => { const c = { cfg, config: { ...cfg } }; made.push(c); pending.push(() => r(c)); }),
      destroy: (c) => destroyed.push(c),
    };
    const host = document.createElement('div');
    const args = { tileId: 't', instanceId: 'i', state: KANO_STATE,
      settings: resolveSettings(validateSchema(kanoTile.settings), {}), i18n, theme: 'light',
      chartManager: cm, stateManager: null };
    const first = mountTile(kanoTile, args, host);
    await waitFor(() => pending.length === 1);
    const second = mountTile(kanoTile, args, host);
    await waitFor(() => pending.length === 2);
    pending[1](); await second;
    pending[0](); await first;
    assertTrue(destroyed.includes(made[0]), 'stale chart destroyed');
    assertTrue(!destroyed.includes(made[1]), 'current chart kept');
  });

  test('viewModel: bar, legend, totals and chart config as display data', () => {
    const vm = vmOf(kanoTile, KANO_STATE);
    assertPlain({ ...vm, chart: null });
    assertEqual(vm.empty, null);
    assertDeepEqual(vm.bar.map(b => b.key), ['M', 'O', 'A']);
    assertEqual(vm.bar[0].title, 'modules.kano.catM: 1');
    assertTrue(vm.bar[0].style.endsWith(';background:var(--color-chart-1)'), vm.bar[0].style);
    assertDeepEqual(vm.legend[0], { key: 'M', dot: 'background:var(--color-chart-1)', text: 'modules.kano.catM: 1' });
    assertDeepEqual(vm.totals, [
      { label: 'dashboard.kanoCompleteness', value: '100 %' },
      { label: 'dashboard.kanoItems', value: '3' },
      { label: 'dashboard.kanoRespondents', value: '2' },
    ]);
    assertEqual(vm.warn, null);
    assertEqual(vm.chart.series.length, 3);
    assertEqual(vm.chart.refLines.length, 2);
    assertEqual(vm.chart.xLabel, 'modules.kano.chartX');
    assertEqual(vm.chart.yLabel, 'modules.kano.chartY');
    assertEqual(vm.chart.showLegend, false);
  });

  test('viewModel: no chart config with showChart off or without cs/ds rows', () => {
    assertEqual(vmOf(kanoTile, KANO_STATE, { showChart: false }).chart, null);
    assertEqual(vmOf(kanoTile, kanoState({ r1: { i1: 'R', i2: 'Q' } })).chart, null);
  });

  test('viewModel: empty and no-data states', () => {
    assertEqual(vmOf(kanoTile, undefined).empty, 'dashboard.kanoEmpty');
    assertEqual(vmOf(kanoTile, kanoState({ r1: { i1: null, i2: null } })).empty, 'dashboard.kanoNoData');
  });

  test('the totals label carries its full text as title', async () => {
    const { host } = await renderChartTile(kanoTile, KANO_STATE);
    const label = host.querySelector('.dashboard-kano__totals .dashboard-spc__stat-label');
    assertEqual(label.getAttribute('title'), 'dashboard.kanoCompleteness');
    host.remove();
  });
});
