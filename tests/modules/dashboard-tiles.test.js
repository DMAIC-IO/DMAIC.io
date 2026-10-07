import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import manifest from '../../js/modules/manifest.js';
import fmeaTile from '../../js/modules/fmea/fmea.tile.js';
import ishikawaTile from '../../js/modules/ishikawa/ishikawa.tile.js';
import charterTile from '../../js/modules/project-charter/project-charter.tile.js';
import { validateSchema, resolveSettings } from '../../js/pages/dashboard/tile-settings.js';

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
  tile.render(host, { tileId: 't', instanceId: 'i', state, settings, i18n, theme: 'light', chartManager: null });
  return host;
}

suite('dashboard tiles: manifest', () => {
  const withTile = manifest.filter(e => typeof e.loadTile === 'function');

  test('fmea, ishikawa and project-charter declare a tile', () => {
    const ids = withTile.map(e => e.id);
    for (const id of ['fmea', 'ishikawa', 'project-charter']) assertTrue(ids.includes(id), id);
  });

  test('every tile file loads, renders and has a valid size and schema', async () => {
    for (const entry of withTile) {
      const tile = (await entry.loadTile()).default;
      assertEqual(typeof tile.render, 'function', `${entry.id}: render`);
      for (const k of ['defaultW', 'defaultH', 'minW', 'minH']) {
        assertTrue(Number.isInteger(tile.size?.[k]), `${entry.id}: size.${k}`);
      }
      const warnings = [];
      validateSchema(tile.settings, (m) => warnings.push(m));
      assertDeepEqual(warnings, [], `${entry.id}: schema`);
    }
  });

  test('tile files do not import the module shell directly', async () => {
    const shell = /from\s+['"][^'"]*(template-module|alpine)[^'"]*['"]/i;
    for (const entry of withTile) {
      const url = new URL(`../../js/modules/${entry.id}/${entry.id}.tile.js`, import.meta.url);
      const src = await (await fetch(url)).text();
      assertTrue(!shell.test(src), `${entry.id}.tile.js imports the module shell`);
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

suite('dashboard tiles: project-charter', () => {
  const ctx = (phases) => ({ i18n, stateManager: { get: (k) => (k === 'phases' ? phases : null) } });

  test('has no settings', () => {
    assertEqual(charterTile.settings, undefined);
  });

  test('enumerate returns the fixed id when an instance exists', () => {
    assertDeepEqual(charterTile.enumerate(ctx({ define: [{ moduleId: 'project-charter', instanceId: 'c1' }] })),
      [{ tileId: 'project-charter', instanceId: 'c1', title: 'dashboard.charterTitle' }]);
  });

  test('enumerate returns nothing without an instance', () => {
    assertDeepEqual(charterTile.enumerate(ctx({ define: [] })), []);
  });
});
