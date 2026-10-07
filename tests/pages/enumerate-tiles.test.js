import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import {
  enumerateTiles, projectModuleIds, loadTileModules, ALWAYS_LOADED_TILES,
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
    for (const id of ['zeg-timeline', 'project-charter', 'org-chart']) assertTrue(ids.includes(id), id);
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
    const builtin = enumerateTiles([], makeCtx({})).find(t => t.id === 'org-chart');
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

  test('loads tiles of used modules plus the always-loaded charter', async () => {
    const registry = {
      hasTile: (id) => id !== 'sipoc',
      loadTile: async () => tile,
    };
    const { tileModules, allLoaded } = await loadTileModules(registry, PHASES);
    assertDeepEqual(tileModules.map(m => m.moduleId), [...ALWAYS_LOADED_TILES, 'fmea']);
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
      assertDeepEqual(tileModules.map(m => m.moduleId), ['project-charter', 'sipoc']);
      assertEqual(allLoaded, false);
    } finally {
      console.error = original;
    }
  });
});
