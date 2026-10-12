import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import manifest from '../../js/modules/manifest.js';
import fmeaTile from '../../js/modules/fmea/fmea.tile.js';
import ishikawaTile from '../../js/modules/ishikawa/ishikawa.tile.js';
import charterTiles, { charterTile, goalsTile, orgTile } from '../../js/modules/project-charter/project-charter.tile.js';
import vocTile from '../../js/modules/voc-ctx-tree/voc-ctx-tree.tile.js';
import raciTile from '../../js/modules/raci-matrix/raci-matrix.tile.js';
import spcTile from '../../js/modules/control-chart/control-chart.tile.js';
import todoTile from '../../js/modules/todo/todo.tile.js';
import calendarTile from '../../js/modules/dmaic-calendar/dmaic-calendar.tile.js';
import stakeholderTile from '../../js/modules/stakeholder-analysis/stakeholder-analysis.tile.js';
import lessonsTile from '../../js/modules/lessons-learned/lessons-learned.tile.js';
import { todayISO, addDaysISO } from '../../js/core/local-date.js';
import { validateSchema, resolveSettings } from '../../js/pages/dashboard/tile-settings.js';
import { HOST_TILES } from '../../js/pages/dashboard/tiles/index.js';
import { I18n } from '../../js/core/i18n.js';
import capabilityTile from '../../js/modules/process-capability/process-capability.tile.js';
import attrSpcTile from '../../js/modules/attribute-control-chart/attribute-control-chart.tile.js';
import zegTile from '../../js/pages/dashboard/tiles/zeg-timeline.tile.js';
import sipocTile from '../../js/modules/sipoc/sipoc.tile.js';
import kanoTile from '../../js/modules/kano/kano.tile.js';

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

  test('modules with a tile declare loadTile', () => {
    const ids = withTile.map(e => e.id);
    for (const id of ['fmea', 'ishikawa', 'project-charter', 'voc-ctx-tree', 'raci-matrix', 'control-chart',
      'todo', 'dmaic-calendar', 'stakeholder-analysis', 'lessons-learned', 'process-capability', 'attribute-control-chart',
      'sipoc', 'kano']) assertTrue(ids.includes(id), id);
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
      });
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

  test('re-bindable tiles declare how to title another instance', () => {
    assertEqual(spcTile.titlePrefix, 'SPC');
    assertEqual(attrSpcTile.titlePrefix, 'SPC');
    assertEqual(raciTile.titlePrefix, 'RACI');
    assertEqual(sipocTile.titlePrefix, 'SIPOC');
    assertEqual(kanoTile.titlePrefix, 'Kano');
    assertEqual(vocTile.titleKey, 'dashboard.vocTitle');
    assertDeepEqual(charterTiles.map(t => [t.kind, t.titleKey]), [
      ['project-charter', 'dashboard.charterTitle'],
      ['project-goals', 'dashboard.goalsTitle'],
      ['org-chart', 'dashboard.orgChartTitle'],
    ]);
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

  test('RPN mode summary shows the S ≥ 9 count', () => {
    const host = render(fmeaTile, FMEA_STATE);   // no method → RPN; one risk with S 10
    const flag = host.querySelector('.dashboard-fmea__flag-count');
    assertEqual(flag.textContent, 'dashboard.fmeaSevere: 1');
  });

  test('AP mode summary shows the H-without-action count', () => {
    const host = render(fmeaTile, { method: 'ap', risks: [
      { failureMode: 'No action', sev: '9', occ: '10', det: '10' },
      { failureMode: 'Justified', sev: '9', occ: '10', det: '10', justification: 'ok' },
    ] });
    assertEqual(host.querySelector('.dashboard-fmea__flag-count').textContent, 'dashboard.fmeaUnjustified: 1');
  });

  test('top list shows the CC/SC badge', () => {
    const host = render(fmeaTile, { risks: [
      { failureMode: 'Flagged', sev: '10', occ: '8', det: '7', specialChar: 'CC' },
      { failureMode: 'Plain', sev: '7', occ: '5', det: '4' },
    ] });
    const flags = host.querySelectorAll('.dashboard-fmea__top-flag');
    assertEqual(flags.length, 1);
    assertEqual(flags[0].textContent, 'CC');
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

function zegStateManager(history, { completed = false, withSheet = false } = {}) {
  const sheet = { id: 'sheet_1', state: { columns: [{ meta: { managedBy: 'zeg', managedRef: 'date' } }] } };
  return {
    get: (k) => (k.startsWith('phaseAchievementHistory.') ? (history[k.split('.')[1]] || []) : null),
    getProjectCycle: () => 'dmaic',
    isCompleted: () => completed,
    listInstances: () => (withSheet ? [{ instanceId: 'w1' }] : []),
    getModuleState: (id) => (withSheet && id === 'w1' ? { sheets: [sheet] } : null),
  };
}

function fakeChartManager() {
  const made = []; const destroyed = [];
  return {
    made, destroyed,
    create: async (el, type, cfg) => { const c = { el, cfg }; made.push(c); return c; },
    destroy: (c) => { destroyed.push(c); },
  };
}

suite('dashboard tiles: zeg-timeline', () => {
  const args = (cm, sm, settings = { showLegend: true }) =>
    ({ tileId: 'zeg-timeline', instanceId: null, state: null, settings, i18n: { t: (k) => k, language: 'de' },
      theme: 'light', chartManager: cm, stateManager: sm });

  test('always enumerates one tile and refreshes on achievement changes', () => {
    assertDeepEqual(zegTile.enumerate({ i18n, findInstances: () => [] }),
      [{ tileId: 'zeg-timeline', instanceId: null, title: 'dashboard.zegTimeline' }]);
    assertDeepEqual(zegTile.refreshOn, ['phase:achievement-changed']);
  });

  test('empty history shows the empty state and creates no chart', async () => {
    const host = document.createElement('div'); const cm = fakeChartManager();
    await zegTile.render(host, args(cm, zegStateManager({})));
    assertTrue(host.querySelector('.dashboard-area__empty') !== null);
    assertEqual(cm.made.length, 0);
  });

  test('empty state and chart both offer the edit-data link', async () => {
    for (const hist of [{}, { define: [{ t: 1, v: 10 }] }]) {
      const host = document.createElement('div');
      await zegTile.render(host, args(fakeChartManager(), zegStateManager(hist)));
      const link = host.querySelector('a[data-action="zeg-sheet"]');
      assertTrue(link !== null, `link missing (${Object.keys(hist).length ? 'chart' : 'empty'})`);
      assertEqual(link.getAttribute('href'), '#/action/zeg-sheet');
      assertTrue(link.textContent.includes('dashboard.zegSheet.edit'));
    }
  });

  test('read-only project without a ZEG sheet offers no edit-data link', async () => {
    for (const hist of [{}, { define: [{ t: 1, v: 10 }] }]) {
      const host = document.createElement('div');
      await zegTile.render(host, args(fakeChartManager(), zegStateManager(hist, { completed: true })));
      assertEqual(host.querySelector('a[data-action="zeg-sheet"]'), null);
    }
    const host = document.createElement('div');
    await zegTile.render(host, args(fakeChartManager(), zegStateManager({}, { completed: true, withSheet: true })));
    assertTrue(host.querySelector('a[data-action="zeg-sheet"]') !== null);
  });

  test('showLegend is passed to the chart', async () => {
    const host = document.createElement('div'); const cm = fakeChartManager();
    const sm = zegStateManager({ define: [{ t: 1, v: 10 }, { t: 2, v: 20 }] });
    await zegTile.render(host, args(cm, sm, { showLegend: false }));
    assertEqual(cm.made[0].cfg.showLegend, false);
  });

  test('a second render destroys the first chart', async () => {
    const host = document.createElement('div'); const cm = fakeChartManager();
    const sm = zegStateManager({ define: [{ t: 1, v: 10 }] });
    await zegTile.render(host, args(cm, sm));
    await zegTile.render(host, args(cm, sm));
    assertDeepEqual(cm.destroyed, [cm.made[0]]);
  });

  test('a chart that resolves after a newer render is destroyed (stale token)', async () => {
    const host = document.createElement('div');
    const sm = zegStateManager({ define: [{ t: 1, v: 10 }] });
    const made = []; const destroyed = []; const pending = [];
    const cm = {
      create: (el, type, cfg) => new Promise(r => { const c = { cfg }; made.push(c); pending.push(() => r(c)); }),
      destroy: (c) => destroyed.push(c),
    };
    const first = zegTile.render(host, args(cm, sm));
    const second = zegTile.render(host, args(cm, sm));
    pending[1](); await second;
    pending[0](); await first;
    assertTrue(destroyed.includes(made[0]), 'stale chart destroyed');
    assertTrue(!destroyed.includes(made[1]), 'current chart kept');
  });

  test('dispose destroys the chart', async () => {
    const host = document.createElement('div'); const cm = fakeChartManager();
    await zegTile.render(host, args(cm, zegStateManager({ define: [{ t: 1, v: 10 }] })));
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
    await zegTile.render(host, args(cm, sm, { showLegend: true }));
    assertEqual(base.made[0].cfg.showLegend, false);
    host.remove();
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
  test('lists open items by due date and marks overdue ones', () => {
    const host = render(todoTile, TODO_STATE);
    const items = [...host.querySelectorAll('.dashboard-fmea__top-item')];
    assertDeepEqual(items.map(li => li.querySelector('.dashboard-fmea__top-desc').textContent), ['Past', 'Future', 'Undated']);
    assertEqual(host.querySelectorAll('.dashboard-todo__overdue').length, 1);
  });

  test('topN caps the list', () => {
    assertEqual(render(todoTile, TODO_STATE, { topN: 1 }).querySelectorAll('.dashboard-fmea__top-item').length, 1);
  });

  test('showDone controls the done segment and count', () => {
    const off = render(todoTile, TODO_STATE);
    assertEqual(off.querySelector('[data-status="done"]'), null);
    const on = render(todoTile, TODO_STATE, { showDone: true });
    assertTrue(on.querySelector('.dashboard-fmea__bar-seg[data-status="done"]') !== null);
  });

  test('empty and missing state show the empty hint', () => {
    for (const s of [{ items: [] }, undefined, null]) {
      assertEqual(render(todoTile, s).querySelector('.dashboard-area__empty').textContent, 'dashboard.todoEmpty');
    }
  });
});

suite('dashboard tiles: dmaic-calendar', () => {
  const t0 = todayISO();
  const CAL_STATE = { events: [
    { id: '1', title: 'Kickoff', date: t0, time: '10:00', duration: 60, phase: 'define' },
    { id: '2', title: 'Review', date: addDaysISO(t0, 10), time: '09:00', duration: 60, phase: 'measure' },
    { id: '3', title: 'Gate', date: addDaysISO(t0, 20), time: '09:00', duration: 60, phase: 'analyze' },
    { id: '4', title: 'Past', date: addDaysISO(t0, -1), time: '09:00', duration: 60, phase: 'define' },
  ] };

  test('default horizon (14 days) lists today and +10', () => {
    const host = render(calendarTile, CAL_STATE);
    assertDeepEqual([...host.querySelectorAll('.dashboard-fmea__top-desc')].map(e => e.textContent), ['Kickoff', 'Review']);
  });

  test('horizon 30 adds +20; topN caps', () => {
    assertEqual(render(calendarTile, CAL_STATE, { horizon: '30' }).querySelectorAll('.dashboard-fmea__top-item').length, 3);
    assertEqual(render(calendarTile, CAL_STATE, { horizon: '30', topN: 1 }).querySelectorAll('.dashboard-fmea__top-item').length, 1);
  });

  test('summary names count and horizon', () => {
    assertEqual(render(calendarTile, CAL_STATE, { horizon: '7' }).querySelector('.dashboard-fmea__summary').textContent,
      'dashboard.calendarSummary');
  });

  test('summary uses the singular for exactly one upcoming event (real de/en strings)', async () => {
    const real = new I18n('de');
    for (const lang of ['de', 'en']) {
      real._cache.set(lang, await (await fetch(new URL(`../../i18n/${lang}.json`, import.meta.url))).json());
    }
    const host = document.createElement('div');
    const one = { events: [CAL_STATE.events[0]] };
    const settings = resolveSettings(validateSchema(calendarTile.settings), {});
    calendarTile.render(host, { state: one, settings, i18n: real });
    assertEqual(host.querySelector('.dashboard-fmea__summary').textContent, '1 Termin in den nächsten 14 Tagen');
    real._lang = 'en';
    calendarTile.render(host, { state: one, settings, i18n: real });
    assertEqual(host.querySelector('.dashboard-fmea__summary').textContent, '1 event in the next 14 days');
  });

  test('no upcoming events shows a hint; no events at all the empty state', () => {
    assertTrue(render(calendarTile, { events: [CAL_STATE.events[3]] }).querySelector('.dashboard-calendar__none') !== null);
    assertEqual(render(calendarTile, undefined).querySelector('.dashboard-area__empty').textContent, 'dashboard.calendarEmpty');
  });
});

const SH_STATE = { stakeholders: [
  { id: 'a', name: 'CFO', role: 'Finance', power: 5, interest: 5, support: 'critic' },
  { id: 'b', name: 'Ops', power: 5, interest: 5, support: 'supporter' },
  { id: 'c', name: 'IT', power: 1, interest: 5, support: 'resistor' },
] };

suite('dashboard tiles: stakeholder-analysis', () => {
  test('matrix shows a count per quadrant, manage-closely first', () => {
    const cells = [...render(stakeholderTile, SH_STATE).querySelectorAll('.dashboard-stakeholder__cell')];
    assertEqual(cells.length, 4);
    assertEqual(cells[0].dataset.quadrant, 'manage-closely');
    assertEqual(cells[0].querySelector('strong').textContent, '2');
  });

  test('support row includes other only when present', () => {
    assertTrue(render(stakeholderTile, SH_STATE).querySelector('[data-support="other"]') !== null);
    const noOther = { stakeholders: SH_STATE.stakeholders.slice(0, 2) };
    assertEqual(render(stakeholderTile, noOther).querySelector('[data-support="other"]'), null);
  });

  test('showCritics toggles the critic list', () => {
    assertEqual(render(stakeholderTile, SH_STATE).querySelectorAll('.dashboard-stakeholder__critics li').length, 1);
    assertEqual(render(stakeholderTile, SH_STATE, { showCritics: false }).querySelector('.dashboard-stakeholder__critics'), null);
  });

  test('empty state', () => {
    assertEqual(render(stakeholderTile, undefined).querySelector('.dashboard-area__empty').textContent, 'dashboard.stakeholderEmpty');
  });
});

const LL_STATE = { lessons: [
  { id: 'a', title: 'Scope creep', category: 'problem', impact: 'high', actions: [{ text: 'x', done: false }, { text: 'y', done: false }] },
  { id: 'b', title: 'Daily standup', category: 'success', impact: 'medium', actions: [] },
  { id: 'c', title: 'Data access', category: 'improve', impact: 'high', actions: [{ text: 'x', done: false }] },
] };

suite('dashboard tiles: lessons-learned', () => {
  test('summary shows category counts and open actions (alerted when > 0)', () => {
    const host = render(lessonsTile, LL_STATE);
    assertEqual(host.querySelector('[data-stat="openActions"] strong').textContent, '3');
    assertTrue(host.querySelector('.dashboard-lessons__open--alert') !== null);
  });

  test('lists high-impact lessons with open action counts; topN caps', () => {
    const host = render(lessonsTile, LL_STATE);
    assertDeepEqual([...host.querySelectorAll('.dashboard-fmea__top-desc')].map(e => e.textContent), ['Scope creep', 'Data access']);
    assertEqual(host.querySelector('.dashboard-fmea__top-rpn').textContent, '2');
    assertEqual(render(lessonsTile, LL_STATE, { topN: 1 }).querySelectorAll('.dashboard-fmea__top-item').length, 1);
  });

  test('no open actions: no alert', () => {
    const done = { lessons: [{ id: 'z', title: 'z', impact: 'high', actions: [{ text: 'x', done: true }] }] };
    assertEqual(render(lessonsTile, done).querySelector('.dashboard-lessons__open--alert'), null);
  });

  test('empty state', () => {
    assertEqual(render(lessonsTile, null).querySelector('.dashboard-area__empty').textContent, 'dashboard.lessonsEmpty');
  });
});

/** Fake tile-bound chart manager: records creates and destroys. */
function recordingChartManager() {
  const made = []; const destroyed = [];
  return {
    made, destroyed,
    create: async (el, type, cfg) => { const c = { el, type, cfg }; made.push(c); return c; },
    destroy: (c) => { destroyed.push(c); },
  };
}

/** Render an async chart tile like the host, with optional setting overrides. */
async function renderChartTile(tile, state, overrides = {}, cm = recordingChartManager()) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const settings = resolveSettings(validateSchema(tile.settings), overrides);
  await tile.render(host, { tileId: 't', instanceId: 'i', state, settings, i18n, theme: 'light', chartManager: cm, stateManager: null });
  return { host, cm };
}

const CAP_VALUES = [9.8, 10.1, 10.0, 9.9, 10.2, 10.05, 9.95, 10.1, 9.85, 10.0];
const CAP_STATE = { embeddedValues: CAP_VALUES, params: { lsl: '9.5', usl: '10.5', target: '10' } };

suite('dashboard tiles: process-capability', () => {
  test('declares the Cpk prefix and refreshes on resize', () => {
    assertEqual(capabilityTile.titlePrefix, 'Cpk');
    assertDeepEqual(capabilityTile.refreshOn, ['state:saved', 'resize']);
  });

  test('empty without data source, no-data without a spec limit', async () => {
    let { host, cm } = await renderChartTile(capabilityTile, {});
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.capabilityEmpty');
    assertEqual(cm.made.length, 0);
    host.remove();
    ({ host, cm } = await renderChartTile(capabilityTile, { embeddedValues: CAP_VALUES }));
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.capabilityNoData');
    assertEqual(cm.made.length, 0);
    host.remove();
  });

  test('state undefined renders the empty state', async () => {
    const { host } = await renderChartTile(capabilityTile, undefined);
    assertTrue(host.querySelector('.dashboard-area__empty') !== null);
    host.remove();
  });

  test('figures: Cpk traffic light, Ppk, Cp for two-sided limits, PPM and n', async () => {
    const { host } = await renderChartTile(capabilityTile, CAP_STATE);
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

  test('one-sided limit: no Cp line', async () => {
    const { host } = await renderChartTile(capabilityTile, { embeddedValues: CAP_VALUES, params: { usl: '10.5' } });
    assertEqual(host.querySelector('.dashboard-spc__metric .dashboard-spc__metric-sub'), null);
    host.remove();
  });

  test('ppmBasis picks the PPM field', async () => {
    const values = async (basis) => {
      const { host } = await renderChartTile(capabilityTile, CAP_STATE, { ppmBasis: basis });
      const v = host.querySelectorAll('.dashboard-spc__stat-value')[0].textContent;
      host.remove();
      return v;
    };
    assertEqual(await values('observed'), '0');
    assertTrue((await values('overall')) !== '0', 'overall PPM is model-based, not 0');
  });

  test('histogram: compact flags, normal curve, spec ref lines', async () => {
    const { host, cm } = await renderChartTile(capabilityTile, CAP_STATE);
    assertEqual(cm.made.length, 1);
    const { type, cfg } = cm.made[0];
    assertEqual(type, 'histogram');
    for (const k of ['showTitle', 'showXLabel', 'showYLabel', 'showXTicks', 'showYTicks', 'showLegend']) {
      assertEqual(cfg[k], false, k);
    }
    assertEqual(cfg.showNormalCurve, true);
    assertDeepEqual(cfg.refLines.map(l => l.label), ['LSL', 'USL', 'Target']);
    assertEqual(cfg.data.length, CAP_VALUES.length);
    host.remove();
  });

  test('non-finite capability indices show an em dash, not "Infinity"', async () => {
    const flat = { embeddedValues: [5, 5, 5, 5, 5, 5], params: { lsl: '4', usl: '6' } };
    const { host } = await renderChartTile(capabilityTile, flat);
    const values = [...host.querySelectorAll('.dashboard-spc__metric-value')].map(e => e.textContent);
    for (const v of values) assertTrue(!/Infinity|NaN|–/.test(v), `no raw non-finite or en dash: ${v}`);
    assertTrue(values.includes('—'), 'em dash for the infinite index');
    assertTrue(!/Infinity/.test(host.textContent), 'no Infinity anywhere');
    host.remove();
  });

  test('histogram passes the histogram module axis titles (hidden by default)', async () => {
    const { host, cm } = await renderChartTile(capabilityTile, CAP_STATE);
    const { cfg } = cm.made[0];
    assertEqual(cfg.xLabel, 'modules.histogram.xLabel');
    assertEqual(cfg.yLabel, 'modules.histogram.yLabel');
    assertEqual(cfg.showXLabel, false);
    assertEqual(cfg.showYLabel, false);
    host.remove();
  });

  test('showChart off: figures only, no chart', async () => {
    const { host, cm } = await renderChartTile(capabilityTile, CAP_STATE, { showChart: false });
    assertEqual(cm.made.length, 0);
    assertEqual(host.querySelector('.dashboard-capability__plot'), null);
    assertTrue(host.querySelector('.dashboard-spc__metric') !== null);
    host.remove();
  });

  test('an analysis hint is shown under the figures', async () => {
    const { host } = await renderChartTile(capabilityTile, { ...CAP_STATE, params: { ...CAP_STATE.params, withinMethod: 'pooled' } });
    assertEqual(host.querySelector('.dashboard-capability__hint').textContent,
      'modules.process-capability.methodFallbackHint');
    host.remove();
  });

  test('a second render and dispose destroy the previous chart', async () => {
    const cm = recordingChartManager();
    const { host } = await renderChartTile(capabilityTile, CAP_STATE, {}, cm);
    await capabilityTile.render(host, { tileId: 't', instanceId: 'i', state: CAP_STATE,
      settings: resolveSettings(validateSchema(capabilityTile.settings), {}), i18n, theme: 'light', chartManager: cm, stateManager: null });
    assertDeepEqual(cm.destroyed, [cm.made[0]]);
    capabilityTile.dispose(host, { tileId: 't' });
    assertDeepEqual(cm.destroyed, [cm.made[0], cm.made[1]]);
    host.remove();
  });

  test('a chart that resolves after a newer render is destroyed (stale token)', async () => {
    const made = []; const destroyed = []; const pending = [];
    const cm = {
      create: (el, type, cfg) => new Promise(r => { const c = { cfg }; made.push(c); pending.push(() => r(c)); }),
      destroy: (c) => destroyed.push(c),
    };
    const host = document.createElement('div');
    const args = { tileId: 't', instanceId: 'i', state: CAP_STATE,
      settings: resolveSettings(validateSchema(capabilityTile.settings), {}), i18n, theme: 'light', chartManager: cm, stateManager: null };
    const first = capabilityTile.render(host, args);
    const second = capabilityTile.render(host, args);
    await Promise.resolve(); await Promise.resolve();
    pending[1](); await second;
    pending[0](); await first;
    assertTrue(destroyed.includes(made[0]), 'stale chart destroyed');
    assertTrue(!destroyed.includes(made[1]), 'current chart kept');
  });

  test('a failed chart create (null) keeps the figures', async () => {
    const cm = { create: async () => null, destroy: () => {} };
    const { host } = await renderChartTile(capabilityTile, CAP_STATE, {}, cm);
    assertTrue(host.querySelector('.dashboard-spc__metric') !== null);
    host.remove();
  });
});

const ATTR_D = { instanceId: 'w', sheetId: 's', columnId: 'd' };
const ATTR_N = { instanceId: 'w', sheetId: 's', columnId: 'n' };

/** stateManager stand-in that serves worksheet columns to getColumnValues. */
function columnStateManager(cols) {
  return {
    getModuleState: (id) => (id === 'w' ? {
      sheets: [{ id: 's', name: 'S', state: { columns: Object.entries(cols).map(([cid, values]) => ({ id: cid, name: cid, values })) } }],
    } : null),
    get: () => null,
  };
}

async function renderAttr(state, cols, overrides = {}, cm = recordingChartManager()) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const settings = resolveSettings(validateSchema(attrSpcTile.settings), overrides);
  await attrSpcTile.render(host, { tileId: 't', instanceId: 'i', state, settings, i18n, theme: 'light',
    chartManager: cm, stateManager: columnStateManager(cols) });
  return { host, cm };
}

const C_STATE = { chartTypeId: 'c', defectsRef: ATTR_D };
const C_STABLE = { d: [3, 4, 2, 5, 3, 4, 3, 2, 4, 3] };
const C_UNSTABLE = { d: [2, 2, 2, 2, 2, 2, 2, 2, 2, 30] };

suite('dashboard tiles: attribute-control-chart', () => {
  test('chart carries the module axis titles while the flags keep them hidden', async () => {
    const { host, cm } = await renderAttr(C_STATE, C_STABLE);
    const { cfg } = cm.made[0];
    assertEqual(cfg.xLabel, 'modules.attribute-control-chart.xLabelSample');
    assertEqual(cfg.yLabel, 'modules.attribute-control-chart.yLabel_c');
    assertEqual(cfg.showXLabel, false);
    assertEqual(cfg.showYLabel, false);
    host.remove();
  });

  test('refreshes on resize', () => {
    assertDeepEqual(attrSpcTile.refreshOn, ['state:saved', 'resize']);
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
    const cfg = cm.made[0].cfg;
    assertEqual(cm.made[0].type, 'control-chart');
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
    assertEqual(cm.made[0].cfg.showZones, false);
    host.remove();
  });

  test('lastN shows the last points with shifted indices; figures stay on all points', async () => {
    const { host, cm } = await renderAttr(C_STATE, C_UNSTABLE, { lastN: 4 });
    const cfg = cm.made[0].cfg;
    assertEqual(cfg.values.length, 4);
    assertTrue(cfg.violationIndices.has(3));
    assertEqual(host.querySelector('.dashboard-spc__metric-sub').textContent, 'dashboard.spcOf');
    host.remove();
  });

  test('lastN drops violations and a baseline outside the window', async () => {
    const { cm } = await renderAttr({ ...C_STATE, baselineCount: 3 }, { d: [30, 2, 2, 2, 2, 2, 2, 2, 2, 2] }, { lastN: 5 });
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
    await attrSpcTile.render(host, { tileId: 't', instanceId: 'i', state: C_STATE,
      settings: resolveSettings(validateSchema(attrSpcTile.settings), {}), i18n, theme: 'light',
      chartManager: cm, stateManager: columnStateManager(C_STABLE) });
    assertDeepEqual(cm.destroyed, [cm.made[0]]);
    attrSpcTile.dispose(host, { tileId: 't' });
    assertDeepEqual(cm.destroyed, [cm.made[0], cm.made[1]]);
    host.remove();
  });

  test('a chart that resolves after a newer render is destroyed (stale token)', async () => {
    const made = []; const destroyed = []; const pending = [];
    const cm = {
      create: (el, type, cfg) => new Promise(r => { const c = { cfg }; made.push(c); pending.push(() => r(c)); }),
      destroy: (c) => destroyed.push(c),
    };
    const host = document.createElement('div');
    const args = { tileId: 't', instanceId: 'i', state: C_STATE,
      settings: resolveSettings(validateSchema(attrSpcTile.settings), {}), i18n, theme: 'light',
      chartManager: cm, stateManager: columnStateManager(C_STABLE) };
    const first = attrSpcTile.render(host, args);
    const second = attrSpcTile.render(host, args);
    await Promise.resolve(); await Promise.resolve();
    pending[1](); await second;
    pending[0](); await first;
    assertTrue(destroyed.includes(made[0]), 'stale chart destroyed');
    assertTrue(!destroyed.includes(made[1]), 'current chart kept');
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
  test('declares the SIPOC prefix and a wide default size', () => {
    assertEqual(sipocTile.titlePrefix, 'SIPOC');
    assertDeepEqual(sipocTile.size, { defaultW: 6, defaultH: 10, minW: 4, minH: 6 });
  });

  test('empty state for an empty or undefined state', () => {
    for (const state of [{}, undefined, { columns: { inputs: [] } }]) {
      const host = render(sipocTile, state);
      assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.sipocEmpty');
    }
  });

  test('five columns in order with letter, name and count', () => {
    const host = render(sipocTile, SIPOC_STATE);
    const cols = [...host.querySelectorAll('.dashboard-sipoc__col')];
    assertDeepEqual(cols.map(c => c.dataset.col), ['suppliers', 'inputs', 'process', 'outputs', 'customers']);
    assertDeepEqual(cols.map(c => c.querySelector('.dashboard-sipoc__letter').textContent), ['S', 'I', 'P', 'O', 'C']);
    assertEqual(cols[0].querySelector('.dashboard-sipoc__name').textContent, 'modules.sipoc.col.suppliers');
    assertDeepEqual(cols.map(c => c.querySelector('.dashboard-sipoc__count').textContent), ['2', '4', '2', '1', '0']);
  });

  test('default topN 3: first three entries and a "more" line', () => {
    const host = render(sipocTile, SIPOC_STATE);
    const inputs = host.querySelector('[data-col="inputs"]');
    assertDeepEqual([...inputs.querySelectorAll('.dashboard-sipoc__item')].map(e => e.textContent), ['Flour', 'Water', 'Yeast']);
    assertEqual(inputs.querySelector('.dashboard-sipoc__more').textContent, 'dashboard.sipocMore');
    assertEqual(host.querySelector('[data-col="process"] .dashboard-sipoc__more'), null);
  });

  test('topN 4 shows all inputs, no "more" line', () => {
    const host = render(sipocTile, SIPOC_STATE, { topN: 4 });
    const inputs = host.querySelector('[data-col="inputs"]');
    assertEqual(inputs.querySelectorAll('.dashboard-sipoc__item').length, 4);
    assertEqual(inputs.querySelector('.dashboard-sipoc__more'), null);
  });

  test('every entry carries its full text as title', () => {
    const host = render(sipocTile, SIPOC_STATE);
    const item = host.querySelector('[data-col="outputs"] .dashboard-sipoc__item');
    assertEqual(item.getAttribute('title'), SIPOC_STATE.columns.outputs[0]);
  });

  test('an empty column is marked as gap; the filled line appears', () => {
    const host = render(sipocTile, SIPOC_STATE);
    const gaps = [...host.querySelectorAll('.dashboard-sipoc__col--gap')].map(c => c.dataset.col);
    assertDeepEqual(gaps, ['customers']);
    assertEqual(host.querySelector('[data-col="customers"] .dashboard-sipoc__gap').textContent, '—');
    assertEqual(host.querySelector('.dashboard-sipoc__filled').textContent, 'dashboard.sipocFilled');
  });

  test('all five filled: no gap, no filled line', () => {
    const full = { columns: { ...SIPOC_STATE.columns, customers: ['Shop'] } };
    const host = render(sipocTile, full);
    assertEqual(host.querySelectorAll('.dashboard-sipoc__col--gap').length, 0);
    assertEqual(host.querySelector('.dashboard-sipoc__filled'), null);
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
  test('declares the Kano prefix and refreshes on resize', () => {
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
    await kanoTile.render(host, { tileId: 't', instanceId: 'i', state: KANO_STATE,
      settings: resolveSettings(validateSchema(kanoTile.settings), {}), i18n, theme: 'light',
      chartManager: cm, stateManager: null });
    assertDeepEqual(cm.destroyed, [cm.made[0]]);
    kanoTile.dispose(host, { tileId: 't' });
    assertDeepEqual(cm.destroyed, [cm.made[0], cm.made[1]]);
    host.remove();
  });

  test('a chart that resolves after a newer render is destroyed (stale token)', async () => {
    const made = []; const destroyed = []; const pending = [];
    const cm = {
      create: (el, type, cfg) => new Promise(r => { const c = { cfg }; made.push(c); pending.push(() => r(c)); }),
      destroy: (c) => destroyed.push(c),
    };
    const host = document.createElement('div');
    const args = { tileId: 't', instanceId: 'i', state: KANO_STATE,
      settings: resolveSettings(validateSchema(kanoTile.settings), {}), i18n, theme: 'light',
      chartManager: cm, stateManager: null };
    const first = kanoTile.render(host, args);
    const second = kanoTile.render(host, args);
    await Promise.resolve(); await Promise.resolve();
    pending[1](); await second;
    pending[0](); await first;
    assertTrue(destroyed.includes(made[0]), 'stale chart destroyed');
    assertTrue(!destroyed.includes(made[1]), 'current chart kept');
  });
});
