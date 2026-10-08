import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import manifest from '../../js/modules/manifest.js';
import fmeaTile from '../../js/modules/fmea/fmea.tile.js';
import ishikawaTile from '../../js/modules/ishikawa/ishikawa.tile.js';
import charterTiles, { charterTile, goalsTile, orgTile } from '../../js/modules/project-charter/project-charter.tile.js';
import vocTile from '../../js/modules/voc-ctx-tree/voc-ctx-tree.tile.js';
import raciTile from '../../js/modules/raci-matrix/raci-matrix.tile.js';
import spcTile from '../../js/modules/control-chart/control-chart.tile.js';
import { validateSchema, resolveSettings } from '../../js/pages/dashboard/tile-settings.js';
import { HOST_TILES } from '../../js/pages/dashboard/tiles/index.js';

const i18n = { t: (k) => k };

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
  experts: [{ id: 'e1' }],
  rows: [
    { id: 'r1', parentId: null, name: 'A', category: 'man', status: 'open', ratings: { e1: 5 } },
    { id: 'r2', parentId: null, name: 'B', category: 'machine', status: 'testing', ratings: { e1: 4 } },
    { id: 'r3', parentId: null, name: 'C', category: 'method', status: 'confirmed', ratings: { e1: 3 } },
    { id: 'r4', parentId: null, name: 'D', category: 'material', status: 'open', ratings: { e1: 2 } },
  ],
};

/** Render a tile the way the host does, with optional setting overrides. */
function render(tile, state, overrides = {}) {
  const host = document.createElement('div');
  const settings = resolveSettings(validateSchema(tile.settings), overrides);
  tile.render(host, { tileId: 't', instanceId: 'i', state, settings, i18n, theme: 'light', chartManager: null, stateManager: null });
  return host;
}

suite('dashboard tiles: manifest', () => {
  const withTile = manifest.filter(e => typeof e.loadTile === 'function');

  test('fmea, ishikawa, project-charter, voc-ctx-tree, raci-matrix and control-chart declare a tile', () => {
    const ids = withTile.map(e => e.id);
    for (const id of ['fmea', 'ishikawa', 'project-charter', 'voc-ctx-tree', 'raci-matrix', 'control-chart']) assertTrue(ids.includes(id), id);
  });

  test('every tile object loads, renders and has a valid size and schema', async () => {
    const sources = [
      ...withTile.map(e => ({ name: e.id, load: async () => (await e.loadTile()).default })),
      ...HOST_TILES.map(h => ({ name: h.id, load: async () => (await h.load()).default })),
    ];
    for (const src of sources) {
      const exported = await src.load();
      const tiles = Array.isArray(exported) ? exported : [exported];
      tiles.forEach((tile, i) => {
        const name = `${src.name}#${i}`;
        assertEqual(typeof tile.render, 'function', `${name}: render`);
        if (Array.isArray(exported)) assertEqual(typeof tile.enumerate, 'function', `${name}: enumerate`);
        for (const k of ['defaultW', 'defaultH', 'minW', 'minH']) {
          assertTrue(Number.isInteger(tile.size?.[k]), `${name}: size.${k}`);
        }
        const warnings = [];
        validateSchema(tile.settings, (m) => warnings.push(m));
        assertDeepEqual(warnings, [], `${name}: schema`);
      });
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
});

suite('dashboard tiles: fmea', () => {
  test('defaults show every rated risk and the legend', () => {
    const host = render(fmeaTile, FMEA_STATE);
    assertEqual(host.querySelectorAll('.dashboard-fmea__top-item').length, 4);
    assertTrue(host.querySelector('.dashboard-fmea__legend') !== null);
  });

  test('topN limits the list', () => {
    const host = render(fmeaTile, FMEA_STATE, { topN: 2 });
    assertEqual(host.querySelectorAll('.dashboard-fmea__top-item').length, 2);
  });

  test('showLegend=false hides the legend', () => {
    const host = render(fmeaTile, FMEA_STATE, { showLegend: false });
    assertEqual(host.querySelector('.dashboard-fmea__legend'), null);
  });

  test('empty state without risks', () => {
    const host = render(fmeaTile, { risks: [] });
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.fmeaEmpty');
  });

  test('title prefix keeps the legacy title', () => {
    assertEqual(fmeaTile.titlePrefix, 'FMEA');
  });
});

suite('dashboard tiles: ishikawa', () => {
  test('defaults show every scored hypothesis and both legends', () => {
    const host = render(ishikawaTile, ISHIKAWA_STATE);
    assertEqual(host.querySelectorAll('.dashboard-fmea__top-item').length, 4);
    assertEqual(host.querySelectorAll('.dashboard-fmea__legend').length, 2);
  });

  test('topN limits the list', () => {
    const host = render(ishikawaTile, ISHIKAWA_STATE, { topN: 1 });
    assertEqual(host.querySelectorAll('.dashboard-fmea__top-item').length, 1);
  });

  test('showLegend=false hides both legends', () => {
    const host = render(ishikawaTile, ISHIKAWA_STATE, { showLegend: false });
    assertEqual(host.querySelectorAll('.dashboard-fmea__legend').length, 0);
  });

  test('empty state without rows', () => {
    const host = render(ishikawaTile, { rows: [] });
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.ishikawaEmpty');
  });

  test('title prefix keeps the legacy title', () => {
    assertEqual(ishikawaTile.titlePrefix, 'Ishikawa');
  });
});

suite('dashboard tiles: project-charter array', () => {
  const ctxWith = (ids) => ({ i18n, findInstances: () => ids.map(instanceId => ({ instanceId, customName: '' })) });

  test('exports charter, goals and org chart in that order', () => {
    assertDeepEqual(charterTiles, [charterTile, goalsTile, orgTile]);
  });

  test('has no settings', () => {
    assertEqual(charterTile.settings, undefined);
  });

  test('each tile enumerates its fixed id for the first charter instance', () => {
    assertDeepEqual(charterTile.enumerate(ctxWith(['c'])), [{ tileId: 'project-charter', instanceId: 'c', title: 'dashboard.charterTitle' }]);
    assertDeepEqual(goalsTile.enumerate(ctxWith(['c'])), [{ tileId: 'project-goals', instanceId: 'c', title: 'dashboard.goalsTitle' }]);
    assertDeepEqual(orgTile.enumerate(ctxWith(['c'])), [{ tileId: 'org-chart', instanceId: 'c', title: 'dashboard.orgChartTitle' }]);
  });

  test('no charter instance gives no tiles', () => {
    for (const t of charterTiles) assertDeepEqual(t.enumerate(ctxWith([])), []);
  });

  test('org chart is wide by default', () => {
    assertDeepEqual(orgTile.size, { defaultW: 6, defaultH: 10, minW: 3, minH: 6 });
  });

  test('goals render one row per goal with clamped ZEG', () => {
    const host = render(goalsTile, { goals: [{ description: 'A', achievementLevel: 150 }, { achievementLevel: 30 }] });
    const rows = host.querySelectorAll('.dashboard-charter__goal');
    assertEqual(rows.length, 2);
    assertTrue(rows[0].textContent.includes('100%'));
  });

  test('goals and org chart show empty states', () => {
    assertTrue(render(goalsTile, { goals: [] }).querySelector('.dashboard-area__empty') !== null);
    assertTrue(render(orgTile, { orgChart: [] }).querySelector('.dashboard-area__empty') !== null);
  });

  test('org chart draws one node per entry', () => {
    const host = render(orgTile, { orgChart: [{ id: 'a', pid: null, title: 'A' }, { id: 'b', pid: 'a', title: 'B' }] });
    assertEqual(host.querySelectorAll('.dashboard-org__node').length, 2);
  });
});

const VOC_STATE = {
  vocs: Array.from({ length: 8 }, (_, i) => ({
    id: `v${i}`, text: `S${i}`, source: '',
    needs: [{ id: `n${i}`, drivers: [{ id: `d${i}`, type: 'ctq', requirements: [] }] }],
  })),
};

suite('dashboard tiles: voc', () => {
  test('enumerates one tile for the first instance only', () => {
    const ctx = { i18n, findInstances: () => [{ instanceId: 'a' }, { instanceId: 'b' }] };
    assertDeepEqual(vocTile.enumerate(ctx), [{ tileId: 'voc-ctx-tree', instanceId: 'a', title: 'dashboard.vocTitle' }]);
    assertDeepEqual(vocTile.enumerate({ i18n, findInstances: () => [] }), []);
  });

  test('defaults: 6 statements + overflow line, legend shown', () => {
    const host = render(vocTile, VOC_STATE);
    assertEqual(host.querySelectorAll('.dashboard-voc__item').length, 7);
    assertTrue(host.querySelector('.dashboard-voc__driver-legend') !== null);
  });

  test('topN limits the list and the overflow counts the rest', () => {
    const host = render(vocTile, VOC_STATE, { topN: 2 });
    const items = host.querySelectorAll('.dashboard-voc__item');
    assertEqual(items.length, 3);
    assertTrue(items[2].textContent.includes('+6'));
  });

  test('showLegend=false hides the legend, keeps the bar', () => {
    const host = render(vocTile, VOC_STATE, { showLegend: false });
    assertEqual(host.querySelector('.dashboard-voc__driver-legend'), null);
    assertTrue(host.querySelector('.dashboard-voc__driver-bar') !== null);
  });

  test('empty state without statements', () => {
    const host = render(vocTile, { vocs: [] });
    assertTrue(host.querySelector('.dashboard-area__empty') !== null);
  });
});

const RACI_STATE = {
  activities: ['A1', 'A2', 'A3', 'A4'],
  stakeholders: ['S1'],
  assignments: { '0:0': 'C', '1:0': 'I' }, // every activity misses R and A -> 8 warnings
};

suite('dashboard tiles: raci', () => {
  test('enumerates one tile per instance with the RACI prefix', () => {
    const ctx = { i18n, findInstances: () => [{ instanceId: 'a', customName: 'Team' }, { instanceId: 'b', customName: '' }] };
    assertDeepEqual(raciTile.enumerate(ctx), [
      { tileId: 'raci:a', instanceId: 'a', title: 'RACI — Team' },
      { tileId: 'raci:b', instanceId: 'b', title: 'RACI — modules.raci-matrix.name' },
    ]);
  });

  test('defaults: 5 warnings + overflow line, legend shown', () => {
    const host = render(raciTile, RACI_STATE);
    assertEqual(host.querySelectorAll('.dashboard-raci__warn-item').length, 5);
    assertTrue(host.querySelector('.dashboard-raci__warn-list').textContent.includes('+3'));
    assertTrue(host.querySelector('.dashboard-raci__legend') !== null);
  });

  test('topN limits the warnings', () => {
    const host = render(raciTile, RACI_STATE, { topN: 2 });
    assertEqual(host.querySelectorAll('.dashboard-raci__warn-item').length, 2);
    assertTrue(host.querySelector('.dashboard-raci__warn-list').textContent.includes('+6'));
  });

  test('showLegend=false hides the legend', () => {
    assertEqual(render(raciTile, RACI_STATE, { showLegend: false }).querySelector('.dashboard-raci__legend'), null);
  });

  test('empty state without activities and stakeholders', () => {
    assertTrue(render(raciTile, { activities: [], stakeholders: [], assignments: {} })
      .querySelector('.dashboard-area__empty') !== null);
  });
});

function fakeStateManager(values) {
  const ws = { sheets: [{ id: 's', name: 'S', state: { columns: [{ id: 'c', name: 'Measure', values }] } }] };
  return { get: () => null, getModuleState: (id) => (id === 'ws' ? ws : null) };
}
const SPC_STATE = { chartTypeId: 'i-mr', subgroupSize: 1, baselineCount: null,
  columnRef: { instanceId: 'ws', sheetId: 's', columnId: 'c' }, usl: null, lsl: null };

function renderSpcTile(state, values) {
  const host = document.createElement('div');
  host.style.width = '300px';
  document.body.append(host);
  spcTile.render(host, { tileId: 'spc:x', instanceId: 'x', state, settings: {}, i18n, theme: 'light',
    chartManager: null, stateManager: fakeStateManager(values) });
  host.remove();
  return host;
}

suite('dashboard tiles: spc', () => {
  test('enumerates per instance with the SPC prefix and refreshes on resize', () => {
    const ctx = { i18n, findInstances: () => [{ instanceId: 'a', customName: 'Line' }] };
    assertDeepEqual(spcTile.enumerate(ctx), [{ tileId: 'spc:a', instanceId: 'a', title: 'SPC — Line' }]);
    assertDeepEqual(spcTile.refreshOn, ['state:saved', 'resize']);
  });

  test('renders sparkline and four stats with data', () => {
    const host = renderSpcTile(SPC_STATE, [10, 10.2, 9.8, 10.1, 9.9, 10.3]);
    assertTrue(host.querySelector('.dashboard-spc__sparkline') !== null);
    assertEqual(host.querySelectorAll('.dashboard-spc__stat').length, 4);
  });

  test('sparkline width follows the host width', () => {
    const host = renderSpcTile(SPC_STATE, [10, 10.2, 9.8, 10.1, 9.9, 10.3]);
    assertEqual(host.querySelector('.dashboard-spc__sparkline').getAttribute('width'), '284');
  });

  test('empty state without column, no-data state with one point', () => {
    assertTrue(renderSpcTile({ ...SPC_STATE, columnRef: null }, []).querySelector('.dashboard-area__empty') !== null);
    assertTrue(renderSpcTile(SPC_STATE, [10]).querySelector('.dashboard-area__empty') !== null);
  });
});
