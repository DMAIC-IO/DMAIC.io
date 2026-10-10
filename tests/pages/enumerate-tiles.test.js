import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import {
  enumerateTiles, projectModuleIds, loadTileModules,
  findInstances, tileObjects, refreshEventsOf,
  kindOf, copyId, copyDescriptor, sourceChoices, COPY_SEP,
  customRefreshEvents, refreshTargets,
} from '../../js/pages/dashboard/enumerate-tiles.js';

const i18nEcho = { t: (k) => `I:${k}` };
const SIZE = { defaultW: 3, defaultH: 10, minW: 2, minH: 6 };

function makeCtx(phases, titles = {}, { tileSettings = {}, layout = null } = {}) {
  const values = { phases, 'dashboard.titles': titles, 'dashboard.tileSettings': tileSettings, 'dashboard.layout': layout };
  return { i18n: i18nEcho, stateManager: { get: (k) => values[k] ?? null } };
}

const PHASES = {
  analyze: [
    { moduleId: 'fmea', instanceId: 'i1', customName: 'Line A' },
    { moduleId: 'fmea', instanceId: 'i2' },
    { moduleId: 'sipoc', instanceId: 's1' },
  ],
  improve: null,
};

suite('enumerateTiles', () => {
  test('default enumeration: one tile per instance with prefixed title and size', () => {
    const tile = { size: SIZE, titlePrefix: 'FMEA', render() {} };
    const tiles = enumerateTiles([{ moduleId: 'fmea', tile }], makeCtx(PHASES));
    assertDeepEqual(tiles.map(t => t.id), ['fmea:i1', 'fmea:i2']);
    assertEqual(tiles[0].title, 'FMEA — Line A');
    assertEqual(tiles[1].title, 'FMEA — I:modules.fmea.name');
    assertEqual(tiles[0].instanceId, 'i1');
    assertEqual(tiles[0].moduleId, 'fmea');
    assertTrue(tiles[0].tile === tile);
    assertEqual(tiles[0].defaultW, 3);
    assertEqual(tiles[0].minH, 6);
  });

  test('without titlePrefix the label is the title', () => {
    const tiles = enumerateTiles([{ moduleId: 'fmea', tile: { size: SIZE, render() {} } }], makeCtx(PHASES));
    assertEqual(tiles[0].title, 'Line A');
  });

  test('a custom enumerate replaces the default', () => {
    const tile = { size: SIZE, render() {}, enumerate: () => [{ tileId: 'x', instanceId: 'i1', title: 'X' }] };
    const tiles = enumerateTiles([{ moduleId: 'fmea', tile }], makeCtx(PHASES));
    assertDeepEqual(tiles.map(t => [t.id, t.title]), [['x', 'X']]);
  });

  test('a persisted custom title wins', () => {
    const tile = { size: SIZE, titlePrefix: 'FMEA', render() {} };
    const tiles = enumerateTiles([{ moduleId: 'fmea', tile }], makeCtx(PHASES, { 'fmea:i2': 'Mine' }));
    assertEqual(tiles.find(t => t.id === 'fmea:i2').title, 'Mine');
  });

  test('host tiles enumerate with a null moduleId', () => {
    const tile = { size: SIZE, render() {}, enumerate: () => [{ tileId: 'zeg-timeline', instanceId: null, title: 'Z' }] };
    const [d] = enumerateTiles([{ moduleId: null, tile }], makeCtx({}));
    assertEqual(d.id, 'zeg-timeline');
    assertEqual(d.moduleId, null);
    assertEqual(d.instanceId, null);
  });
});

suite('projectModuleIds', () => {
  test('distinct ids, tolerant of null lists', () => {
    assertDeepEqual(projectModuleIds(PHASES), ['fmea', 'sipoc']);
    assertDeepEqual(projectModuleIds(undefined), []);
  });
});

suite('loadTileModules', () => {
  const tile = { render() {} };

  test('loads tiles of used modules only', async () => {
    const registry = {
      hasTile: (id) => id === 'project-charter' || id === 'fmea',
      loadTile: async () => tile,
    };
    const { tileModules, allLoaded } = await loadTileModules(registry, PHASES, []);
    assertDeepEqual(tileModules.map(m => m.moduleId), ['fmea']);
    assertTrue(allLoaded);
  });

  test('a failing tile file is skipped and reported via allLoaded', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const registry = {
        hasTile: () => true,
        loadTile: async (id) => { if (id === 'fmea') throw new Error('net'); return tile; },
      };
      const { tileModules, allLoaded } = await loadTileModules(registry, PHASES, []);
      assertDeepEqual(tileModules.map(m => m.moduleId), ['sipoc']);
      assertEqual(allLoaded, false);
    } finally {
      console.error = original;
    }
  });
});

suite('findInstances', () => {
  test('lists instances of one module across phases, tolerant of null lists', () => {
    assertDeepEqual(findInstances(PHASES, 'fmea'), [
      { instanceId: 'i1', customName: 'Line A', phase: 'analyze' },
      { instanceId: 'i2', customName: '', phase: 'analyze' },
    ]);
    assertDeepEqual(findInstances(undefined, 'fmea'), []);
  });
});

suite('tileObjects', () => {
  test('wraps a single tile', () => {
    const t = { size: SIZE, render() {} };
    assertDeepEqual(tileObjects(t), [t]);
  });

  test('keeps array elements with enumerate, drops others with a warning', () => {
    const a = { size: SIZE, render() {}, enumerate: () => [] };
    const b = { size: SIZE, render() {} };
    const warn = console.warn; const seen = [];
    console.warn = (m) => seen.push(m);
    try { assertDeepEqual(tileObjects([a, b]), [a]); } finally { console.warn = warn; }
    assertEqual(seen.length, 1);
  });

  test('null export yields no tiles', () => {
    assertDeepEqual(tileObjects(null), []);
  });
});

suite('refreshEventsOf', () => {
  test('defaults to state:saved', () => {
    assertDeepEqual(refreshEventsOf({}), ['state:saved']);
    assertDeepEqual(refreshEventsOf({ refreshOn: [] }), ['state:saved']);
  });

  test('uses an explicit list', () => {
    assertDeepEqual(refreshEventsOf({ refreshOn: ['resize', 'phase:achievement-changed'] }),
      ['resize', 'phase:achievement-changed']);
  });
});

suite('refresh wiring', () => {
  const zeg = { size: SIZE, render() {}, refreshOn: ['phase:achievement-changed'] };
  const spc = { size: SIZE, render() {}, refreshOn: ['state:saved', 'resize', 'custom:spc'] };
  const plain = { size: SIZE, render() {} };

  test('customRefreshEvents lists the distinct custom events of the loaded tiles', () => {
    const tms = [{ moduleId: null, tile: zeg }, { moduleId: 'control-chart', tile: spc }, { moduleId: 'fmea', tile: plain }, { moduleId: null, tile: zeg }];
    assertDeepEqual(customRefreshEvents(tms), ['phase:achievement-changed', 'custom:spc']);
  });

  test('refreshTargets picks placed tiles listening to the event, copies included', () => {
    const descriptors = [
      { id: 'spc:i1', tile: spc }, { id: 'spc~x', tile: spc },
      { id: 'spc:i2', tile: spc }, { id: 'fmea:i1', tile: plain },
    ];
    assertDeepEqual(refreshTargets(descriptors, ['spc:i1', 'spc~x', 'fmea:i1'], 'custom:spc'), ['spc:i1', 'spc~x']);
  });
});

suite('loadTileModules with arrays and host tiles', () => {
  const t1 = { kind: 't1', size: SIZE, render() {}, enumerate: () => [] };
  const t2 = { kind: 't2', size: SIZE, render() {}, enumerate: () => [] };
  const zeg = { size: SIZE, render() {}, enumerate: () => [] };
  const registry = {
    hasTile: (id) => id === 'fmea',
    loadTile: async () => [t1, t2],
  };

  test('flattens array exports and always loads host tiles', async () => {
    const host = [{ id: 'zeg-timeline', load: async () => ({ default: zeg }) }];
    const { tileModules, allLoaded } = await loadTileModules(registry, PHASES, host);
    assertTrue(allLoaded);
    assertDeepEqual(tileModules.map(m => [m.moduleId, m.tile]), [['fmea', t1], ['fmea', t2], [null, zeg]]);
  });

  test('a failing host tile is skipped and clears allLoaded', async () => {
    const host = [{ id: 'zeg-timeline', load: async () => { throw new Error('chunk'); } }];
    const err = console.error; console.error = () => {};
    try {
      const { tileModules, allLoaded } = await loadTileModules(registry, PHASES, host);
      assertEqual(allLoaded, false);
      assertEqual(tileModules.length, 2);
    } finally { console.error = err; }
  });
});

suite('enumerate context', () => {
  test('enumerate receives findInstances bound to the project phases', () => {
    let got = null;
    const tile = { size: SIZE, render() {}, enumerate: (ctx) => { got = ctx.findInstances('fmea'); return []; } };
    enumerateTiles([{ moduleId: 'fmea', tile }], makeCtx(PHASES));
    assertDeepEqual(got.map(i => i.instanceId), ['i1', 'i2']);
  });
});

const FMEA_TILE = { size: SIZE, titlePrefix: 'FMEA', render() {} };
const FMEA_TM = { moduleId: 'fmea', tile: FMEA_TILE, kind: 'fmea' };

function silenceWarn(fn) {
  const warn = console.warn;
  const msgs = [];
  console.warn = (m) => msgs.push(m);
  try { fn(); } finally { console.warn = warn; }
  return msgs;
}

suite('enumerate-tiles: kinds', () => {
  test('single export uses the module id, array elements their own kind', () => {
    assertEqual(kindOf('fmea', {}, false), 'fmea');
    assertEqual(kindOf('project-charter', { kind: 'project-goals' }, true), 'project-goals');
    assertEqual(kindOf(null, {}, false), null);
  });

  test('array element without kind or with "~" is not duplicable (warns)', () => {
    let a; let b;
    const msgs = silenceWarn(() => {
      a = kindOf('project-charter', {}, true);
      b = kindOf('project-charter', { kind: `a${COPY_SEP}b` }, true);
    });
    assertEqual(a, null);
    assertEqual(b, null);
    assertEqual(msgs.length, 2);
  });

  test('the warning for a tile object is printed once, not on every render', () => {
    const tile = {};
    const msgs = silenceWarn(() => {
      kindOf('project-charter', tile, true);
      kindOf('project-charter', tile, true);
    });
    assertEqual(msgs.length, 1);
  });

  test('loadTileModules attaches the kind to each tile object', async () => {
    const goals = { kind: 'project-goals', size: SIZE, render() {}, enumerate: () => [] };
    const registry = {
      hasTile: () => true,
      loadTile: async (id) => (id === 'fmea' ? FMEA_TILE : [goals]),
    };
    const phases = { define: [{ moduleId: 'fmea', instanceId: 'i1' }, { moduleId: 'project-charter', instanceId: 'c1' }] };
    const { tileModules } = await loadTileModules(registry, phases, []);
    assertDeepEqual(tileModules.map(m => [m.moduleId, m.kind]), [['fmea', 'fmea'], ['project-charter', 'project-goals']]);
  });

  test('copyId is "<kind>~<uid>" and unique', () => {
    const a = copyId('fmea');
    const b = copyId('fmea');
    assertTrue(a.startsWith(`fmea${COPY_SEP}`) && a.length > 5);
    assertTrue(a !== b);
  });
});

suite('enumerate-tiles: source', () => {
  test('a stored _source re-binds a base tile and retitles it', () => {
    const tiles = enumerateTiles([FMEA_TM], makeCtx(PHASES, {}, { tileSettings: { 'fmea:i1': { _source: 'i2' } } }));
    const t = tiles.find(x => x.id === 'fmea:i1');
    assertEqual(t.instanceId, 'i2');
    assertEqual(t.baseInstanceId, 'i1');
    assertEqual(t.title, 'FMEA — I:modules.fmea.name');
    assertEqual(t.kind, 'fmea');
    assertEqual(t.isCopy, false);
  });

  test('a _source of a deleted instance falls back to the enumerated one', () => {
    const tiles = enumerateTiles([FMEA_TM], makeCtx(PHASES, {}, { tileSettings: { 'fmea:i1': { _source: 'gone' } } }));
    const t = tiles.find(x => x.id === 'fmea:i1');
    assertEqual(t.instanceId, 'i1');
    assertEqual(t.title, 'FMEA — Line A');
  });

  test('without a kind a stored _source is ignored', () => {
    const tiles = enumerateTiles([{ ...FMEA_TM, kind: null }],
      makeCtx(PHASES, {}, { tileSettings: { 'fmea:i1': { _source: 'i2' } } }));
    assertEqual(tiles.find(x => x.id === 'fmea:i1').instanceId, 'i1');
  });

  test('a re-bound singleton with titleKey keeps its fixed title', () => {
    const goals = {
      kind: 'project-goals', titleKey: 'dashboard.goalsTitle', size: SIZE, render() {},
      enumerate: () => [{ tileId: 'project-goals', instanceId: 'c1', title: 'I:dashboard.goalsTitle' }],
    };
    const phases = { define: [{ moduleId: 'project-charter', instanceId: 'c1' }, { moduleId: 'project-charter', instanceId: 'c2', customName: 'Other' }] };
    const [t] = enumerateTiles([{ moduleId: 'project-charter', tile: goals, kind: 'project-goals' }],
      makeCtx(phases, {}, { tileSettings: { 'project-goals': { _source: 'c2' } } }));
    assertEqual(t.instanceId, 'c2');
    assertEqual(t.title, 'I:dashboard.goalsTitle');
  });

  test('a user title wins over the re-bound title', () => {
    const tiles = enumerateTiles([FMEA_TM],
      makeCtx(PHASES, { 'fmea:i1': 'Mine' }, { tileSettings: { 'fmea:i1': { _source: 'i2' } } }));
    assertEqual(tiles.find(x => x.id === 'fmea:i1').title, 'Mine');
  });

  test('sourceChoices lists every instance with its phase', () => {
    const phases = { define: [{ moduleId: 'fmea', instanceId: 'a', customName: 'Line' }], improve: [{ moduleId: 'fmea', instanceId: 'b', customName: 'Line' }] };
    assertDeepEqual(sourceChoices(phases, 'fmea', i18nEcho), [
      { id: 'a', text: 'Line (I:phases.define)' },
      { id: 'b', text: 'Line (I:phases.improve)' },
    ]);
    assertDeepEqual(sourceChoices(PHASES, 'fmea', i18nEcho)[1], { id: 'i2', text: 'I:modules.fmea.name (I:phases.analyze)' });
  });
});

suite('enumerate-tiles: copies', () => {
  test('copies are enumerated from "~" layout ids, bound to their _source', () => {
    const ctx = makeCtx(PHASES, {}, {
      layout: [{ tileId: 'fmea:i1' }, { tileId: 'fmea~c1' }],
      tileSettings: { 'fmea~c1': { _source: 'i1', topN: 2 } },
    });
    const c = enumerateTiles([FMEA_TM], ctx).find(x => x.id === 'fmea~c1');
    assertEqual(c.instanceId, 'i1');
    assertEqual(c.baseInstanceId, null);
    assertEqual(c.isCopy, true);
    assertEqual(c.kind, 'fmea');
    assertEqual(c.title, 'FMEA — Line A');
    assertTrue(c.tile === FMEA_TILE);
    assertEqual(c.defaultW, 3);
  });

  test('a copy with a deleted, missing source or an unloaded kind is skipped', () => {
    const ctx = makeCtx(PHASES, {}, {
      layout: [{ tileId: 'fmea~c1' }, { tileId: 'fmea~c2' }, { tileId: 'ishikawa~c3' }],
      tileSettings: { 'fmea~c1': { _source: 'gone' }, 'fmea~c2': {}, 'ishikawa~c3': { _source: 'i1' } },
    });
    assertDeepEqual(enumerateTiles([FMEA_TM], ctx).filter(x => x.isCopy), []);
  });

  test('a user title wins for a copy', () => {
    const ctx = makeCtx(PHASES, { 'fmea~c1': 'Mine' }, {
      layout: [{ tileId: 'fmea~c1' }], tileSettings: { 'fmea~c1': { _source: 'i2' } },
    });
    assertEqual(enumerateTiles([FMEA_TM], ctx).find(x => x.id === 'fmea~c1').title, 'Mine');
  });

  test('copyDescriptor binds a new copy, or returns null for a gone instance', () => {
    const ctx = makeCtx(PHASES);
    const d = copyDescriptor(FMEA_TM, 'fmea~new', 'i2', ctx);
    assertEqual(d.id, 'fmea~new');
    assertEqual(d.instanceId, 'i2');
    assertEqual(d.title, 'FMEA — I:modules.fmea.name');
    assertEqual(copyDescriptor(FMEA_TM, 'fmea~new', 'gone', ctx), null);
  });
});
