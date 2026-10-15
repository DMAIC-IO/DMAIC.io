/**
 * D.Mike — Edit-bound chart manager.
 *
 * Wraps the shared ChartManager so chart-editor edits of a configured set of
 * config keys are stored through a binding and laid over the caller's config
 * whenever it creates or updates the chart, so they survive re-plots and
 * reloads. Two bindings exist: per module instance (labels only, see
 * createInstanceChartManager; stateManager.chartEdits) and per dashboard tile
 * (labels, ticks, legend; see ChartManager#forTile).
 * Every other method and property is inherited from the shared manager.
 */

/** Config keys whose chart-editor edits are persisted for module charts. */
export const LABEL_EDIT_KEYS = ['title', 'showTitle', 'xLabel', 'yLabel', 'showXLabel', 'showYLabel'];

/** Extra keys persisted for dashboard tile charts (see ChartManager.forTile). */
export const TILE_EDIT_KEYS = ['showXTicks', 'showYTicks', 'showLegend'];

/** The entries of `obj` whose key is listed. */
function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && k in obj) out[k] = obj[k];
  return out;
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
 *           keys: string[],
 *           isInside?: (node: Node) => boolean }} binding
 *   `isInside` decides whether a chart root still belongs to the owner's view
 *   (default: attached to the document).
 * @returns {import('./chart-manager.js').default} facade with the manager's API
 */
export function createEditBoundChartManager(manager, { read, write, keys, isInside = isAttached }) {
  const allowed = new Set(keys);
  /** @type {Map<object, string>} live chart -> chart key */
  const keyOf = new Map();
  /** creates still awaiting their chart: { key, container } */
  const reserved = new Set();
  const facade = Object.create(manager);
  const storedEdits = (key) => pick(read(key) || {}, keys);

  /** A chart is live until destroyed or until its root left the owner's view. */
  function isLive(chart) {
    const root = chart._card || chart._wrap;
    return !!(chart._svg && root && root.parentNode && isInside(root));
  }

  function allocateKey(base, container) {
    for (const [chart] of keyOf) if (!isLive(chart)) keyOf.delete(chart);
    // A pending create is superseded by this one when it targets the same
    // container or one that has left the owner's view (re-render before it
    // resolved), so its key is free to take.
    const pending = [...reserved]
      .filter(r => r.container !== container && isInside(r.container))
      .map(r => r.key);
    const used = new Set([...keyOf.values(), ...pending]);
    let key = base;
    for (let n = 2; used.has(key); n++) key = `${base}#${n}`;
    return key;
  }

  /**
   * Create a chart; stored edits win over the caller's config.
   * The chart key is `config.editKey || type`, suffixed `#2`, `#3`, ... while
   * another live chart of this owner holds it.
   * `config.persistEdits === false` bypasses the binding entirely (see the
   * histogram module, whose model stores every setting): no stored edits are
   * laid over, nothing is recorded, and no chart key is allocated.
   */
  facade.create = async function create(container, type, config = {}) {
    if (config.persistEdits === false) return manager.create(container, type, config);
    const key = allocateKey(config.editKey || type, container);
    const slot = { key, container };
    reserved.add(slot);
    try {
      const chart = await manager.create(container, type, { ...config, ...storedEdits(key) });
      if (!chart) return chart;
      keyOf.set(chart, key);
      chart._autoLabels = pick(config, keys);
      chart._onLabelEdit = (k, value) => {
        if (!allowed.has(k)) return;
        write(key, k, value);
        if ((value === '' || value == null) && k in chart._autoLabels) {
          chart.config[k] = chart._autoLabels[k];
        }
      };
      return chart;
    } finally {
      reserved.delete(slot);
    }
  };

  /** Update a chart; stored edits stay on top of the patch. */
  facade.update = function update(chart, configPatch) {
    const key = chart ? keyOf.get(chart) : undefined;
    if (key === undefined) { manager.update(chart, configPatch); return; }
    Object.assign(chart._autoLabels, pick(configPatch, keys));
    manager.update(chart, { ...configPatch, ...storedEdits(key) });
  };

  return facade;
}

/**
 * Chart manager bound to one module instance: label edits are stored in
 * stateManager.chartEdits[instanceId][chartKey].
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
    keys: LABEL_EDIT_KEYS,
    isInside: (node) => !!node && (inRoot ? moduleRoot.contains(node) : isAttached(node)),
  });
}
