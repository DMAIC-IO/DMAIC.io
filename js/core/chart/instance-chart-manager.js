/**
 * D.Mike — Edit-bound chart manager.
 *
 * Wraps the shared ChartManager so chart-editor edits of a configured set of
 * config keys are stored through a binding and laid over the caller's config
 * whenever it creates or updates the chart, so they survive re-plots and
 * reloads. Two bindings exist: per module instance (every editor key of the
 * chart type, `static editorKeys`; see createInstanceChartManager and
 * stateManager.chartEdits) and per dashboard tile (labels, ticks, legend;
 * see ChartManager#forTile).
 *
 * Edits reach the binding two ways: label, tick and legend switches report
 * one key at a time (`chart._onLabelEdit`); every other editor setting is
 * found by comparing the chart config with a snapshot taken at the last
 * create/update/write (`chart._onEditorChange`). `refLines`/`refAreas` the
 * module itself supplies stay the module's: never laid over, never stored.
 * Every other method and property is inherited from the shared manager.
 */

/** Config keys whose chart-editor edits are persisted for module charts. */
export const LABEL_EDIT_KEYS = ['title', 'showTitle', 'xLabel', 'yLabel', 'showXLabel', 'showYLabel'];

/** Extra keys persisted for dashboard tile charts (see ChartManager.forTile). */
export const TILE_EDIT_KEYS = ['showXTicks', 'showYTicks', 'showLegend'];

/** Keys the editor reports one by one through `_onLabelEdit`. */
const REPORTED_KEYS = new Set([...LABEL_EDIT_KEYS, ...TILE_EDIT_KEYS]);

/**
 * Editor keys a module may supply itself. When the create config or an
 * update patch carries one, it belongs to the module for that chart.
 */
export const MODULE_OWNED_KEYS = ['refLines', 'refAreas'];

/**
 * Chart property holding a getter for the chart's binding record. A getter,
 * not the record itself: Alpine view models keep the chart in reactive data
 * and hand a proxy of it to update(), which a Map lookup would miss; a
 * function read through that proxy comes back unwrapped.
 */
const META = Symbol('editBinding');

/** The entries of `obj` whose key is listed. */
function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && k in obj) out[k] = obj[k];
  return out;
}

/** Deep copy of a JSON value; undefined stays undefined. */
function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/** Do two JSON values serialise alike? */
function sameJSON(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Is a node still in the document? Nodes without isConnected count as attached. */
function isAttached(node) {
  return !!node && (!('isConnected' in node) || node.isConnected);
}

/**
 * Wrap the shared manager so chart-editor edits of the listed config keys are
 * stored through `write` and laid over the caller's config on create/update.
 * @param {import('./chart-manager.js').default} manager - shared manager
 * @param {{ read: (chartKey: string) => object|null,
 *           write: (chartKey: string, key: string, value: any) => void,
 *           keys: string[] | ((type: string) => string[]|Promise<string[]>),
 *           isInside?: (node: Node) => boolean }} binding
 *   `keys` lists the persisted config keys, or resolves them per chart type.
 *   `isInside` decides whether a chart root still belongs to the owner's view
 *   (default: attached to the document).
 * @returns {import('./chart-manager.js').default} facade with the manager's API
 */
export function createEditBoundChartManager(manager, { read, write, keys, isInside = isAttached }) {
  const keysFor = async (type) => {
    const list = await (typeof keys === 'function' ? keys(type) : keys);
    return new Set(Array.isArray(list) ? list : LABEL_EDIT_KEYS);
  };
  /**
   * live chart -> { key, allowed, owned, baseline }: chart key, persisted
   * keys, module-owned keys, snapshot of the persisted keys since the last
   * create/update/write.
   * @type {Map<object, {key: string, allowed: Set<string>, owned: Set<string>, baseline: object}>}
   */
  const metaOf = new Map();
  /** creates still awaiting their chart: { key, container } */
  const reserved = new Set();
  const facade = Object.create(manager);

  /** Stored edits for this chart, as clones, without module-owned keys. */
  function overlay(meta) {
    const stored = read(meta.key) || {};
    const out = {};
    for (const k of meta.allowed) {
      if (k in stored && !meta.owned.has(k)) out[k] = clone(stored[k]);
    }
    return out;
  }

  /** Module-owned keys a config or patch supplies. */
  function ownedIn(config) {
    return MODULE_OWNED_KEYS.filter(k => config && config[k] !== undefined);
  }

  function snapshot(chart, meta) {
    meta.baseline = clone(pick(chart.config, meta.allowed));
  }

  /** A chart is live until destroyed or until its root left the owner's view. */
  function isLive(chart) {
    const root = chart._card || chart._wrap;
    return !!(chart._svg && root && root.parentNode && isInside(root));
  }

  function allocateKey(base, container) {
    for (const [chart] of metaOf) if (!isLive(chart)) metaOf.delete(chart);
    // A pending create is superseded by this one when it targets the same
    // container or one that has left the owner's view (re-render before it
    // resolved), so its key is free to take.
    const pending = [...reserved]
      .filter(r => r.container !== container && isInside(r.container))
      .map(r => r.key);
    const used = new Set([...[...metaOf.values()].map(m => m.key), ...pending]);
    let key = base;
    for (let n = 2; used.has(key); n++) key = `${base}#${n}`;
    return key;
  }

  /** Hook the edit callbacks of a freshly created chart. */
  function bind(chart, meta) {
    chart._onLabelEdit = (k, value) => {
      if (!meta.allowed.has(k) || meta.owned.has(k)) return;
      write(meta.key, k, value);
      if ((value === '' || value == null) && k in chart._autoLabels) {
        chart.config[k] = chart._autoLabels[k];
      }
      meta.baseline[k] = clone(chart.config[k]);
    };
    chart._onEditorChange = () => {
      for (const k of meta.allowed) {
        if (REPORTED_KEYS.has(k) || meta.owned.has(k)) continue;
        const value = chart.config[k];
        if (sameJSON(value, meta.baseline[k])) continue;
        write(meta.key, k, clone(value));
        meta.baseline[k] = clone(value);
      }
    };
  }

  /**
   * Create a chart; stored edits win over the caller's config.
   * The chart key is `config.editKey || type`, suffixed `#2`, `#3`, ... while
   * another live chart of this owner holds it. The key is reserved before
   * anything is awaited, so parallel creates get distinct keys.
   * `config.persistEdits === false` bypasses the binding entirely (see the
   * histogram module, whose model stores every setting): no stored edits are
   * laid over, nothing is recorded, and no chart key is allocated.
   * @param {HTMLElement} container
   * @param {string} type
   * @param {object} [config]
   * @returns {Promise<object|null>} the chart, or null when creation failed
   */
  facade.create = async function create(container, type, config = {}) {
    if (config.persistEdits === false) return manager.create(container, type, config);
    const key = allocateKey(config.editKey || type, container);
    const slot = { key, container };
    reserved.add(slot);
    try {
      const meta = { key, allowed: await keysFor(type), owned: new Set(ownedIn(config)), baseline: {} };
      const chart = await manager.create(container, type, { ...config, ...overlay(meta) });
      if (!chart) return chart;
      metaOf.set(chart, meta);
      chart[META] = () => meta;
      chart._autoLabels = pick(config, LABEL_EDIT_KEYS);
      snapshot(chart, meta);
      bind(chart, meta);
      return chart;
    } finally {
      reserved.delete(slot);
    }
  };

  /**
   * Update a chart (or a reactive proxy of it); stored edits stay on top of the patch. Module-owned keys
   * in the patch become owned for this chart from now on.
   * @param {object|null} chart
   * @param {object} configPatch
   */
  facade.update = function update(chart, configPatch) {
    const found = chart ? (metaOf.get(chart) ?? chart[META]?.()) : undefined;
    const meta = found && [...metaOf.values()].includes(found) ? found : undefined;
    if (meta === undefined) { manager.update(chart, configPatch); return; }
    for (const k of ownedIn(configPatch)) meta.owned.add(k);
    Object.assign(chart._autoLabels, pick(configPatch, LABEL_EDIT_KEYS));
    manager.update(chart, { ...configPatch, ...overlay(meta) });
    snapshot(chart, meta);
  };

  return facade;
}

/**
 * Chart manager bound to one module instance: edits of every editor key of
 * the chart type (`manager.editorKeys(type)`, falling back to the label keys)
 * are stored in stateManager.chartEdits[instanceId][chartKey].
 * @param {import('./chart-manager.js').default} manager - shared manager
 * @param {{ getChartEdits: Function, setChartEdit: Function }} stateManager
 * @param {string} instanceId
 * @param {Node} [moduleRoot] - the instance's container. Charts count as live
 *   while inside it, so a module whose container the workspace detached (a
 *   hidden phase) keeps distinct keys. Without it, "inside the document" is used.
 * @returns {import('./chart-manager.js').default}
 */
export function createInstanceChartManager(manager, stateManager, instanceId, moduleRoot) {
  const inRoot = moduleRoot && typeof moduleRoot.contains === 'function';
  return createEditBoundChartManager(manager, {
    read: (chartKey) => stateManager.getChartEdits(instanceId, chartKey),
    write: (chartKey, key, value) => stateManager.setChartEdit(instanceId, chartKey, key, value),
    keys: (type) => manager.editorKeys?.(type) ?? LABEL_EDIT_KEYS,
    isInside: (node) => !!node && (inRoot ? moduleRoot.contains(node) : isAttached(node)),
  });
}
