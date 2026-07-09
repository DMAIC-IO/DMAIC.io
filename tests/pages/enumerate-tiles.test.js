import { suite, test, assertEqual } from '../test-utils.js';
import { enumerateTiles } from '../../js/pages/dashboard/enumerate-tiles.js';

const i18nEcho = { t: (k) => 'I:' + k };

function makeRegistry(mods) {
  return { getAll: () => mods, get: (id) => mods.find(m => m.id === id) || null };
}

function makeCtx(mods, phases, moduleStates = {}) {
  return {
    i18n: i18nEcho,
    moduleRegistry: makeRegistry(mods),
    stateManager: {
      get: (k) => (k === 'phases' ? phases : (k === 'dashboard.titles' ? {} : null)),
      getProjectCycle: () => 'dmaic',
      getModuleState: (id) => moduleStates[id] || null,
    },
  };
}

suite('enumerateTiles', () => {
  test('returns the built-in static tiles when no module contributes', () => {
    const ctx = makeCtx([], {});
    const tiles = enumerateTiles(ctx.moduleRegistry, ctx);
    const ids = tiles.map(t => t.id);
    assertEqual(ids.includes('zeg-timeline'), true);
    assertEqual(ids.includes('project-charter'), true);
    assertEqual(ids.includes('org-chart'), true);
    const org = tiles.find(t => t.id === 'org-chart');
    assertEqual(org.defaultW, 6);
  });

  test('merges per-instance tiles from a module dashboardTile.enumerate()', () => {
    const fmeaTile = {
      defaultW: 3, defaultH: 10, minW: 2, minH: 6,
      enumerate: (c) => {
        const phases = c.stateManager.get('phases') || {};
        const out = [];
        for (const list of Object.values(phases)) {
          for (const inst of list) {
            if (inst.moduleId === 'fmea') {
              out.push({ tileId: `fmea:${inst.instanceId}`, instanceId: inst.instanceId, title: `FMEA — ${inst.customName || 'FMEA'}` });
            }
          }
        }
        return out;
      },
      render() {},
    };
    const mods = [{ id: 'fmea', dashboardTile: fmeaTile }];
    const phases = { analyze: [{ moduleId: 'fmea', instanceId: 'i1', customName: 'Line A' }] };
    const ctx = makeCtx(mods, phases);
    const tiles = enumerateTiles(ctx.moduleRegistry, ctx);

    const fm = tiles.find(t => t.id === 'fmea:i1');
    assertEqual(!!fm, true);
    assertEqual(fm.instanceId, 'i1');
    assertEqual(fm.title, 'FMEA — Line A');
    assertEqual(fm.defaultW, 3);
    assertEqual(fm.minH, 6);
    assertEqual(fm.module.id, 'fmea');
  });

  test('fans out two instances from a single module dashboardTile.enumerate()', () => {
    const fmeaTile = {
      defaultW: 3, defaultH: 10, minW: 2, minH: 6,
      enumerate: (c) => {
        const phases = c.stateManager.get('phases') || {};
        const out = [];
        for (const list of Object.values(phases)) {
          for (const inst of list) {
            if (inst.moduleId === 'fmea') {
              out.push({ tileId: `fmea:${inst.instanceId}`, instanceId: inst.instanceId, title: `FMEA — ${inst.customName || 'FMEA'}` });
            }
          }
        }
        return out;
      },
      render() {},
    };
    const mods = [{ id: 'fmea', dashboardTile: fmeaTile }];
    const phases = {
      analyze: [
        { moduleId: 'fmea', instanceId: 'i1', customName: 'Line A' },
        { moduleId: 'fmea', instanceId: 'i2', customName: 'Line B' },
      ],
    };
    const ctx = makeCtx(mods, phases);
    const tiles = enumerateTiles(ctx.moduleRegistry, ctx);

    const fm1 = tiles.find(t => t.id === 'fmea:i1');
    const fm2 = tiles.find(t => t.id === 'fmea:i2');
    assertEqual(!!fm1, true);
    assertEqual(!!fm2, true);

    assertEqual(fm1.instanceId, 'i1');
    assertEqual(fm1.title, 'FMEA — Line A');
    assertEqual(fm1.defaultW, 3);
    assertEqual(fm1.module.id, 'fmea');

    assertEqual(fm2.instanceId, 'i2');
    assertEqual(fm2.title, 'FMEA — Line B');
    assertEqual(fm2.defaultW, 3);
    assertEqual(fm2.module.id, 'fmea');
  });

  test('applies a custom persisted title over the enumerate() default', () => {
    const tile = {
      defaultW: 3, defaultH: 10, minW: 2, minH: 6,
      enumerate: () => [{ tileId: 'fmea:i1', instanceId: 'i1', title: 'FMEA — Default' }],
      render() {},
    };
    const ctx = {
      i18n: i18nEcho,
      moduleRegistry: makeRegistry([{ id: 'fmea', dashboardTile: tile }]),
      stateManager: {
        get: (k) => (k === 'dashboard.titles' ? { 'fmea:i1': 'My FMEA' } : (k === 'phases' ? {} : null)),
        getProjectCycle: () => 'dmaic',
        getModuleState: () => null,
      },
    };
    const tiles = enumerateTiles(ctx.moduleRegistry, ctx);
    assertEqual(tiles.find(t => t.id === 'fmea:i1').title, 'My FMEA');
  });

  test('ignores modules without a dashboardTile descriptor', () => {
    const ctx = makeCtx([{ id: 'plain' }], {});
    const ids = enumerateTiles(ctx.moduleRegistry, ctx).map(t => t.id);
    assertEqual(ids.includes('plain'), false);
  });
});
