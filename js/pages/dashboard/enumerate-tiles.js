/**
 * D.Mike — Dashboard tile enumeration (enumerate-tiles.js)
 *
 * Loads the tile files of the modules used in the project and turns them,
 * together with the built-in static tiles (DASHBOARD_TILES), into a flat list
 * of tile descriptors the host maps to DashboardGrid tile defs:
 *   { id, instanceId|null, title, i18nTitle, defaultW, defaultH, minW, minH,
 *     builtin, moduleId|null, tile|null }
 * Contract: docs/DASHBOARD.md.
 */

import { DASHBOARD_TILES } from '../../ui/dashboard-tiles.js';

/**
 * Tiles loaded even without an instance. The charter keeps its empty state on
 * a fresh project (temporary, until its built-in twin is removed).
 */
export const ALWAYS_LOADED_TILES = ['project-charter'];

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
 * Load the tile files of every module used in the project (plus
 * ALWAYS_LOADED_TILES). A failing tile file is skipped; `allLoaded` tells the
 * caller whether pruning stored settings is safe.
 * @param {{hasTile: function, loadTile: function}} registry
 * @param {object|undefined} phases
 * @returns {Promise<{tileModules: Array<{moduleId: string, tile: object}>, allLoaded: boolean}>}
 */
export async function loadTileModules(registry, phases) {
  const ids = [...new Set([...ALWAYS_LOADED_TILES, ...projectModuleIds(phases)])]
    .filter(id => registry.hasTile(id));
  const results = await Promise.allSettled(ids.map(id => registry.loadTile(id)));
  const tileModules = [];
  let allLoaded = true;
  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value) {
      tileModules.push({ moduleId: ids[i], tile: result.value });
    } else {
      allLoaded = false;
      console.error(`[dashboard] tile file of "${ids[i]}" failed to load`, result.reason);
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
  const phases = ctx.stateManager.get('phases') || {};
  const out = [];
  for (const list of Object.values(phases)) {
    for (const inst of (list || [])) {
      if (inst.moduleId !== moduleId) continue;
      const label = inst.customName || ctx.i18n.t(`modules.${moduleId}.name`);
      out.push({
        tileId: `${moduleId}:${inst.instanceId}`,
        instanceId: inst.instanceId,
        title: tile.titlePrefix ? `${tile.titlePrefix} — ${label}` : label,
      });
    }
  }
  return out;
}

/**
 * @param {Array<{moduleId: string, tile: object}>} tileModules  from loadTileModules
 * @param {object} ctx  kernel services container (i18n, stateManager, …)
 * @returns {Array<object>} tile descriptors
 */
export function enumerateTiles(tileModules, ctx) {
  const titles = ctx.stateManager.get('dashboard.titles') || {};

  const builtins = DASHBOARD_TILES.map(def => ({
    id: def.id,
    instanceId: null,
    title: titles[def.id] || (def.i18nTitle ? ctx.i18n.t(def.i18nTitle) : def.id),
    i18nTitle: def.i18nTitle || '',
    defaultW: def.defaultW, defaultH: def.defaultH, minW: def.minW, minH: def.minH,
    builtin: true,
    moduleId: null,
    tile: null,
  }));

  const moduleTiles = [];
  for (const { moduleId, tile } of tileModules) {
    const entries = typeof tile.enumerate === 'function'
      ? (tile.enumerate(ctx) || [])
      : defaultEntries(moduleId, tile, ctx);
    for (const e of entries) {
      moduleTiles.push({
        id: e.tileId,
        instanceId: e.instanceId ?? null,
        title: titles[e.tileId] || e.title,
        i18nTitle: '',
        defaultW: tile.size.defaultW, defaultH: tile.size.defaultH,
        minW: tile.size.minW, minH: tile.size.minH,
        builtin: false,
        moduleId,
        tile,
      });
    }
  }

  return [...builtins, ...moduleTiles];
}
