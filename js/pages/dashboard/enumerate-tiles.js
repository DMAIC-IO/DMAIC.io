/**
 * D.Mike — Dashboard tile enumeration (enumerate-tiles.js)
 *
 * Loads the tile files of the modules used in the project and turns them,
 * and the host tile files, into a flat list of tile descriptors the host maps
 * to DashboardGrid tile defs:
 *   { id, instanceId|null, baseInstanceId|null, title, i18nTitle, defaultW,
 *     defaultH, minW, minH, moduleId|null, tile, kind|null, isCopy }
 * `instanceId` is the effective instance (re-bound via `_source`), so the
 * host renders it unchanged. Copies have ids "<kind>~<uid>".
 * Contract: docs/DASHBOARD.md.
 */

import { HOST_TILES } from './tiles/index.js';
import { uid } from '../../core/uid.js';
import { SOURCE_KEY } from './tile-settings.js';

/** Separator between kind and uid in a copy's tile id. */
export const COPY_SEP = '~';

/**
 * Stable, instance-independent kind of a module tile object. A single-object
 * export has the module id as kind; array elements must declare `kind`.
 * @param {string|null} moduleId  null for host tiles
 * @param {object} tile
 * @param {boolean} fromArray  whether the tile came from an array export
 * @returns {string|null} kind, or null when the tile is not re-bindable
 */
export function kindOf(moduleId, tile, fromArray) {
  if (!moduleId) return null;
  const kind = fromArray ? tile?.kind : moduleId;
  if (typeof kind !== 'string' || kind === '') {
    console.warn(`[dashboard] a tile of "${moduleId}" declares no kind and cannot be re-bound or duplicated`);
    return null;
  }
  if (kind.includes(COPY_SEP)) {
    console.warn(`[dashboard] tile kind "${kind}" must not contain "${COPY_SEP}"`);
    return null;
  }
  return kind;
}

/**
 * New tile id for a copy.
 * @param {string} kind
 * @returns {string} "<kind>~<uid>"
 */
export function copyId(kind) {
  return `${kind}${COPY_SEP}${uid()}`;
}

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
 * Label of an instance: its custom name or the module name.
 * @param {{customName: string}} inst
 * @param {string} moduleId
 * @param {{t: function}} i18n
 * @returns {string}
 */
function instanceLabel(inst, moduleId, i18n) {
  return inst.customName || i18n.t(`modules.${moduleId}.name`);
}

/**
 * Options of the source select: every instance of the module, labelled
 * "<label> (<phase>)" so equally named instances stay distinguishable.
 * @param {object|undefined} phases
 * @param {string} moduleId
 * @param {{t: function}} i18n
 * @returns {Array<{id: string, text: string}>}
 */
export function sourceChoices(phases, moduleId, i18n) {
  return findInstances(phases, moduleId).map(inst => ({
    id: inst.instanceId,
    text: `${instanceLabel(inst, moduleId, i18n)} (${i18n.t(`phases.${inst.phase}`)})`,
  }));
}

/**
 * Default title of a tile bound to `inst` (re-bound base tiles and copies):
 * a fixed `titleKey` wins, else "<titlePrefix> — <label>" or the label.
 * @param {object} tile
 * @param {string} moduleId
 * @param {{customName: string}} inst
 * @param {{t: function}} i18n
 * @returns {string}
 */
function sourceTitle(tile, moduleId, inst, i18n) {
  if (tile.titleKey) return i18n.t(tile.titleKey);
  const label = instanceLabel(inst, moduleId, i18n);
  return tile.titlePrefix ? `${tile.titlePrefix} — ${label}` : label;
}

/**
 * Assemble a tile descriptor.
 * @param {string} id
 * @param {{moduleId: string|null, tile: object, kind?: string|null}} tm
 * @param {{instanceId: string|null, baseInstanceId: string|null, title: string, isCopy: boolean}} bound
 * @returns {object}
 */
function descriptor(id, tm, bound) {
  return {
    id,
    instanceId: bound.instanceId ?? null,
    baseInstanceId: bound.baseInstanceId ?? null,
    title: bound.title,
    i18nTitle: '',
    defaultW: tm.tile.size.defaultW, defaultH: tm.tile.size.defaultH,
    minW: tm.tile.size.minW, minH: tm.tile.size.minH,
    moduleId: tm.moduleId,
    tile: tm.tile,
    kind: tm.kind ?? null,
    isCopy: bound.isCopy,
  };
}

/**
 * Descriptor of a copy bound to `sourceInstanceId`.
 * @param {{moduleId: string, tile: object, kind: string}} tm
 * @param {string} id  copy tile id ("<kind>~<uid>")
 * @param {string|undefined} sourceInstanceId
 * @param {object} ctx  kernel services container (i18n, stateManager)
 * @returns {object|null} null when the source instance does not exist
 */
export function copyDescriptor(tm, id, sourceInstanceId, ctx) {
  const inst = findInstances(ctx.stateManager.get('phases'), tm.moduleId)
    .find(i => i.instanceId === sourceInstanceId);
  if (!inst) return null;
  const titles = ctx.stateManager.get('dashboard.titles') || {};
  return descriptor(id, tm, {
    instanceId: inst.instanceId,
    baseInstanceId: null,
    title: titles[id] || sourceTitle(tm.tile, tm.moduleId, inst, ctx.i18n),
    isCopy: true,
  });
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
 * @returns {Promise<{tileModules: Array<{moduleId: string|null, tile: object, kind: string|null}>, allLoaded: boolean}>}
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
      const fromArray = Array.isArray(result.value);
      tiles.forEach(tile => tileModules.push({ moduleId: job.moduleId, tile, kind: kindOf(job.moduleId, tile, fromArray) }));
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
    const label = instanceLabel(inst, moduleId, ctx.i18n);
    return {
      tileId: `${moduleId}:${inst.instanceId}`,
      instanceId: inst.instanceId,
      title: tile.titlePrefix ? `${tile.titlePrefix} — ${label}` : label,
    };
  });
}

/**
 * @param {Array<{moduleId: string|null, tile: object, kind?: string|null}>} tileModules  from loadTileModules
 * @param {object} ctx  kernel services container (i18n, stateManager, …)
 * @returns {Array<object>} tile descriptors (base tiles, then copies)
 */
export function enumerateTiles(tileModules, ctx) {
  const titles = ctx.stateManager.get('dashboard.titles') || {};
  const settings = ctx.stateManager.get('dashboard.tileSettings') || {};
  const phases = ctx.stateManager.get('phases');

  const enumCtx = { ...ctx, findInstances: (id) => findInstances(ctx.stateManager.get('phases'), id) };
  const out = [];
  for (const tm of tileModules) {
    const { moduleId, tile } = tm;
    const entries = typeof tile.enumerate === 'function'
      ? (tile.enumerate(enumCtx) || [])
      : defaultEntries(moduleId, tile, ctx);
    const instances = tm.kind ? findInstances(phases, moduleId) : [];
    for (const e of entries) {
      const base = e.instanceId ?? null;
      const wanted = settings[e.tileId]?.[SOURCE_KEY];
      const rebound = base && wanted !== base ? instances.find(i => i.instanceId === wanted) : null;
      out.push(descriptor(e.tileId, tm, {
        instanceId: rebound ? rebound.instanceId : base,
        baseInstanceId: base,
        title: titles[e.tileId] || (rebound ? sourceTitle(tile, moduleId, rebound, ctx.i18n) : e.title),
        isCopy: false,
      }));
    }
  }

  // Copies exist only as "<kind>~<uid>" layout entries plus their settings.
  const layout = ctx.stateManager.get('dashboard.layout');
  const byKind = new Map(tileModules.filter(tm => tm.kind).map(tm => [tm.kind, tm]));
  const copyIds = new Set((Array.isArray(layout) ? layout : [])
    .map(l => l?.tileId)
    .filter(id => typeof id === 'string' && id.includes(COPY_SEP)));
  for (const id of copyIds) {
    const tm = byKind.get(id.slice(0, id.indexOf(COPY_SEP)));
    const copy = tm ? copyDescriptor(tm, id, settings[id]?.[SOURCE_KEY], ctx) : null;
    if (copy) out.push(copy);
  }
  return out;
}
