/**
 * D.Mike — Dashboard tile enumeration (enumerate-tiles.js)
 *
 * Pure helper: merges the built-in static tile defs (DASHBOARD_TILES) with the
 * per-instance tiles each module contributes via its static `dashboardTile`
 * capability. Replaces the legacy inline _findAll / _buildDefs scanners.
 *
 * Returns a flat list of "tile descriptors" the host turns into DashboardGrid
 * tile-defs and add-menu entries:
 *   { id, instanceId|null, title, defaultW, defaultH, minW, minH,
 *     i18nTitle, builtin, module|null }
 *
 * `module` (null for built-ins) is the resolved registry default export, so the
 * host can dispatch render()/dispose() without re-resolving.
 */

import { DASHBOARD_TILES } from '../../ui/dashboard-tiles.js';

/**
 * @param {object} moduleRegistry  ModuleRegistry (getAll/get)
 * @param {object} ctx             kernel services container (i18n, stateManager, …)
 * @returns {Array<object>} tile descriptors
 */
export function enumerateTiles(moduleRegistry, ctx) {
  const titles = ctx.stateManager.get('dashboard.titles') || {};

  // 1. Built-in static tiles (title resolved lazily by the host via i18nTitle;
  //    a persisted custom title still wins here for parity with the legacy code).
  const builtins = DASHBOARD_TILES.map(def => ({
    id: def.id,
    instanceId: null,
    title: titles[def.id] || (def.i18nTitle ? ctx.i18n.t(def.i18nTitle) : def.id),
    i18nTitle: def.i18nTitle || '',
    defaultW: def.defaultW, defaultH: def.defaultH, minW: def.minW, minH: def.minH,
    builtin: true,
    module: null,
  }));

  // 2. Per-module tiles from each dashboardTile.enumerate().
  const moduleTiles = [];
  for (const mod of moduleRegistry.getAll()) {
    const dt = mod.dashboardTile;
    if (!dt || typeof dt.enumerate !== 'function') continue;
    const entries = dt.enumerate(ctx) || [];
    for (const e of entries) {
      moduleTiles.push({
        id: e.tileId,
        instanceId: e.instanceId ?? null,
        title: titles[e.tileId] || e.title,
        i18nTitle: '',
        defaultW: dt.defaultW, defaultH: dt.defaultH, minW: dt.minW, minH: dt.minH,
        builtin: false,
        module: mod,
      });
    }
  }

  return [...builtins, ...moduleTiles];
}
