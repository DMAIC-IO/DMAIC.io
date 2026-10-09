/**
 * D.Mike — Dashboard tile enumeration (enumerate-tiles.js)
 *
 * Loads the tile files of the modules used in the project and turns them,
 * and the host tile files, into a flat list of tile descriptors the host maps
 * to DashboardGrid tile defs:
 *   { id, instanceId|null, title, i18nTitle, defaultW, defaultH, minW, minH,
 *     moduleId|null, tile }
 * Contract: docs/DASHBOARD.md.
 */

import { HOST_TILES } from './tiles/index.js';

/**
 * Distinct module ids of all instances in the project.
 * @param {object|undefined} phases  stateManager.get('phases')
 * @returns {string[]}
 */
export function projectModuleIds(phases) {
  const ids = new Set();
  for (const list of Object.values(phases || {})) {
    for (const inst of (list || [])) if (inst?.moduleId) ids.add(inst.moduleId);
  }
  return [...ids];
}

/**
 * Instances of one module across all phases.
 * @param {object|undefined} phases  stateManager.get('phases')
 * @param {string} moduleId
 * @returns {Array<{instanceId: string, customName: string, phase: string}>}
 */
export function findInstances(phases, moduleId) {
  const out = [];
  for (const [phase, list] of Object.entries(phases || {})) {
    for (const inst of (list || [])) {
      if (inst?.moduleId === moduleId) out.push({ instanceId: inst.instanceId, customName: inst.customName || '', phase });
    }
  }
  return out;
}

/**
 * Normalise a tile file's default export to a list of tile objects. Array
 * elements must define enumerate() (default enumeration would collide).
 * @param {object|object[]|null|undefined} exported
 * @returns {object[]}
 */
export function tileObjects(exported) {
  if (!exported) return [];
  if (!Array.isArray(exported)) return [exported];
  return exported.filter((t, i) => {
    if (typeof t?.enumerate === 'function') return true;
    console.warn(`[dashboard] tile #${i} of an array export has no enumerate() and is skipped`);
    return false;
  });
}

/**
 * Events after which a tile re-renders (contract field `refreshOn`).
 * @param {object} tile
 * @returns {string[]}
 */
export function refreshEventsOf(tile) {
  const r = tile?.refreshOn;
  return Array.isArray(r) && r.length && r.every(e => typeof e === 'string') ? r : ['state:saved'];
}

/**
 * Load the tile files of every module used in the project and all host
 * tile files. One entry per tile object —
 * array exports are flattened; host tiles carry `moduleId: null`. A failing
 * tile file is skipped; `allLoaded` tells the caller whether pruning stored
 * settings is safe.
 * @param {{hasTile: function, loadTile: function}} registry
 * @param {object|undefined} phases
 * @param {Array<{id: string, load: function}>} [hostTiles]
 * @returns {Promise<{tileModules: Array<{moduleId: string|null, tile: object}>, allLoaded: boolean}>}
 */
export async function loadTileModules(registry, phases, hostTiles = HOST_TILES) {
  const ids = projectModuleIds(phases).filter(id => registry.hasTile(id));
  const jobs = [
    ...ids.map(id => ({ moduleId: id, label: id, run: () => registry.loadTile(id) })),
    ...hostTiles.map(h => ({ moduleId: null, label: h.id, run: async () => (await h.load()).default })),
  ];
  const results = await Promise.allSettled(jobs.map(j => j.run()));
  const tileModules = [];
  let allLoaded = true;
  results.forEach((result, i) => {
    const job = jobs[i];
    const tiles = result.status === 'fulfilled' ? tileObjects(result.value) : [];
    if (tiles.length) {
      tiles.forEach(tile => tileModules.push({ moduleId: job.moduleId, tile }));
    } else {
      allLoaded = false;
      console.error(`[dashboard] tile file of "${job.label}" failed to load`, result.reason);
    }
  });
  return { tileModules, allLoaded };
}

/**
 * Default enumeration: one tile per instance of the module.
 * @param {string} moduleId
 * @param {object} tile
 * @param {object} ctx
 * @returns {Array<{tileId: string, instanceId: string, title: string}>}
 */
function defaultEntries(moduleId, tile, ctx) {
  return findInstances(ctx.stateManager.get('phases'), moduleId).map(inst => {
    const label = inst.customName || ctx.i18n.t(`modules.${moduleId}.name`);
    return {
      tileId: `${moduleId}:${inst.instanceId}`,
      instanceId: inst.instanceId,
      title: tile.titlePrefix ? `${tile.titlePrefix} — ${label}` : label,
    };
  });
}

/**
 * @param {Array<{moduleId: string|null, tile: object}>} tileModules  from loadTileModules
 * @param {object} ctx  kernel services container (i18n, stateManager, …)
 * @returns {Array<object>} tile descriptors
 */
export function enumerateTiles(tileModules, ctx) {
  const titles = ctx.stateManager.get('dashboard.titles') || {};

  const enumCtx = { ...ctx, findInstances: (id) => findInstances(ctx.stateManager.get('phases'), id) };
  const moduleTiles = [];
  for (const { moduleId, tile } of tileModules) {
    const entries = typeof tile.enumerate === 'function'
      ? (tile.enumerate(enumCtx) || [])
      : defaultEntries(moduleId, tile, ctx);
    for (const e of entries) {
      moduleTiles.push({
        id: e.tileId,
        instanceId: e.instanceId ?? null,
        title: titles[e.tileId] || e.title,
        i18nTitle: '',
        defaultW: tile.size.defaultW, defaultH: tile.size.defaultH,
        minW: tile.size.minW, minH: tile.size.minH,
        moduleId,
        tile,
      });
    }
  }

  return moduleTiles;
}
