/**
 * D.Mike — Instance-bound chart manager.
 *
 * Wraps the shared ChartManager for one module instance. Title and axis-title
 * edits made in the chart editor are stored per instance and chart key
 * (stateManager.chartEdits) and laid over the module's config whenever the
 * module creates or updates the chart, so they survive re-plots and reloads.
 * Every other method and property is inherited from the shared manager.
 */

/** Config keys whose chart-editor edits are persisted. */
export const LABEL_EDIT_KEYS = ['title', 'showTitle', 'xLabel', 'yLabel', 'showXLabel', 'showYLabel'];

function pickLabels(config) {
  const out = {};
  for (const k of LABEL_EDIT_KEYS) if (config && k in config) out[k] = config[k];
  return out;
}

/** A chart is live until destroyed or until its root left the DOM. */
function isLive(chart) {
  const root = chart._card || chart._wrap;
  return !!(chart._svg && root && root.parentNode);
}

/**
 * @param {import('./chart-manager.js').default} manager - shared manager
 * @param {{ getChartEdits: Function, setChartEdit: Function }} stateManager
 * @param {string} instanceId
 * @returns {import('./chart-manager.js').default} facade with the manager's API
 */
export function createInstanceChartManager(manager, stateManager, instanceId) {
  /** @type {Map<object, string>} live chart → chart key */
  const keyOf = new Map();
  /** keys reserved by creates still awaiting their chart */
  const reserved = new Set();
  const facade = Object.create(manager);

  function allocateKey(base) {
    for (const [chart] of keyOf) if (!isLive(chart)) keyOf.delete(chart);
    const used = new Set([...keyOf.values(), ...reserved]);
    let key = base;
    for (let n = 2; used.has(key); n++) key = `${base}#${n}`;
    return key;
  }

  /**
   * Create a chart; stored edits win over the module config.
   * The chart key is `config.editKey || type`, suffixed `#2`, `#3`, … while
   * another live chart of this instance holds it.
   */
  facade.create = async function create(container, type, config = {}) {
    const key = allocateKey(config.editKey || type);
    reserved.add(key);
    try {
      const edits = stateManager.getChartEdits(instanceId, key) || {};
      const chart = await manager.create(container, type, { ...config, ...edits });
      if (!chart) return chart;
      keyOf.set(chart, key);
      chart._autoLabels = pickLabels(config);
      chart._onLabelEdit = (k, value) => {
        stateManager.setChartEdit(instanceId, key, k, value);
        if ((value === '' || value == null) && k in chart._autoLabels) {
          chart.config[k] = chart._autoLabels[k];
        }
      };
      return chart;
    } finally {
      reserved.delete(key);
    }
  };

  /** Update a chart; stored edits stay on top of the patch. */
  facade.update = function update(chart, configPatch) {
    const key = chart ? keyOf.get(chart) : undefined;
    if (key === undefined) { manager.update(chart, configPatch); return; }
    Object.assign(chart._autoLabels, pickLabels(configPatch));
    const edits = stateManager.getChartEdits(instanceId, key) || {};
    manager.update(chart, { ...configPatch, ...edits });
  };

  return facade;
}
