import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import {
  enumerateTiles, projectModuleIds, loadTileModules,
  findInstances, tileObjects, refreshEventsOf,
} from '../../js/pages/dashboard/enumerate-tiles.js';

const i18nEcho = { t: (k) => `I:${k}` };
const SIZE = { defaultW: 3, defaultH: 10, minW: 2, minH: 6 };

function makeCtx(phases, titles = {}) {
  return {
    i18n: i18nEcho,
    stateManager: {
      get: (k) => (k === 'phases' ? phases : (k === 'dashboard.titles' ? titles : null)),
    },
  };
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
  test('keeps the built-in static tiles', () => {
    const ids = enumerateTiles([], makeCtx({})).map(t => t.id);
    assertDeepEqual(ids, ['zeg-timeline']);
  });

  test('default enumeration: one tile per instance with prefixed title and size', () => {
    const tile = { size: SIZE, titlePrefix: 'FMEA', render() {} };
    const tiles = enumerateTiles([{ moduleId: 'fmea', tile }], makeCtx(PHASES)).filter(t => !t.builtin);
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
    const tiles = enumerateTiles([{ moduleId: 'fmea', tile: { size: SIZE, render() {} } }], makeCtx(PHASES))
      .filter(t => !t.builtin);
    assertEqual(tiles[0].title, 'Line A');
  });

  test('a custom enumerate replaces the default', () => {
    const tile = { size: SIZE, render() {}, enumerate: () => [{ tileId: 'x', instanceId: 'i1', title: 'X' }] };
    const tiles = enumerateTiles([{ moduleId: 'fmea', tile }], makeCtx(PHASES)).filter(t => !t.builtin);
    assertDeepEqual(tiles.map(t => [t.id, t.title]), [['x', 'X']]);
  });

  test('a persisted custom title wins', () => {
    const tile = { size: SIZE, titlePrefix: 'FMEA', render() {} };
    const tiles = enumerateTiles([{ moduleId: 'fmea', tile }], makeCtx(PHASES, { 'fmea:i2': 'Mine' }));
    assertEqual(tiles.find(t => t.id === 'fmea:i2').title, 'Mine');
  });

  test('built-ins carry null moduleId and tile', () => {
    const builtin = enumerateTiles([], makeCtx({})).find(t => t.id === 'zeg-timeline');
    assertEqual(builtin.moduleId, null);
    assertEqual(builtin.tile, null);
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
      const { tileModules, allLoaded } = await loadTileModules(registry, PHASES);
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

suite('loadTileModules with arrays and host tiles', () => {
  const t1 = { size: SIZE, render() {}, enumerate: () => [] };
  const t2 = { size: SIZE, render() {}, enumerate: () => [] };
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
