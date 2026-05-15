/**
 * chart-manager.js — Public API for the D.Mike chart framework.
 * Modules interact exclusively with this class via context.chartManager.
 * Lazy-loads chart type modules on first use.
 */

/** @type {Object<string, function(): Promise>} */
const TYPE_MAP = {
  scatter:            () => import('./types/scatter.js'),
  histogram:          () => import('./types/histogram.js'),
  bar:                () => import('./types/bar.js'),
  boxplot:            () => import('./types/boxplot.js'),
  'individual-value-plot': () => import('./types/individual-value-plot.js'),
  'control-chart':    () => import('./types/control-chart.js'),
  'run-chart':        () => import('./types/run-chart.js'),
  'probability-plot': () => import('./types/probability-plot.js'),
  pareto:             () => import('./types/pareto.js'),
  pie:                () => import('./types/pie.js'),
  mosaic:             () => import('./types/mosaic.js'),
  heatmap:            () => import('./types/heatmap.js'),
};

export default class ChartManager {
  /**
   * @param {import('../event-bus.js').default} eventBus
   * @param {import('../i18n.js').default} i18n
   * @param {import('../state-manager.js').StateManager} [stateManager]
   */
  constructor(eventBus, i18n, stateManager) {
    /** @private */
    this._eventBus = eventBus;
    /** @private */
    this._i18n = i18n;
    /** @private */
    this._stateManager = stateManager || null;
    /** @private @type {Map<string, Function>} Cached constructors */
    this._ctorCache = new Map();
    /** @private @type {Set<import('./chart-base.js').default>} All live chart instances */
    this._charts = new Set();

    // React to theme changes — re-render all charts (colors re-resolved from CSS)
    this._eventBus.on('theme:changed', () => {
      this._charts.forEach((chart) => chart.render());
    });

    // React to language changes — update locale and re-render
    this._eventBus.on('language:changed', ({ lang }) => {
      this._charts.forEach((chart) => {
        chart.locale = lang;
        chart.render();
      });
    });
  }

  /**
   * Create a new chart inside a container element.
   * The chart type module is lazy-loaded on first use.
   * @param {HTMLElement} container - DOM element to render into
   * @param {string} type - Chart type: 'scatter' | 'histogram' | 'boxplot' | ...
   * @param {Object} config - Chart configuration (shared + type-specific)
   * @returns {Promise<import('./chart-base.js').default>} The chart instance
   */
  async create(container, type, config) {
    const Ctor = await this._loadType(type);
    const context = {
      i18n: this._i18n,
      language: this._i18n.language || 'de',
      theme: document.documentElement.getAttribute('data-theme') || 'light',
    };
    // Apply global font-size defaults from settings (user config overrides)
    const merged = Object.assign({}, this._getFontDefaults(), config);
    const chart = new Ctor(container, merged, context);
    this._charts.add(chart);
    return chart;
  }

  /**
   * Update an existing chart with new/changed config values.
   * @param {import('./chart-base.js').default} chart
   * @param {Object} configPatch - Partial config to merge
   */
  update(chart, configPatch) {
    chart.update(configPatch);
  }

  /**
   * Destroy a chart and free all resources.
   * @param {import('./chart-base.js').default} chart
   */
  destroy(chart) {
    chart.destroy();
    this._charts.delete(chart);
  }

  /**
   * Destroy all tracked charts (called on project reset / full import).
   */
  destroyAll() {
    this._charts.forEach((chart) => chart.destroy());
    this._charts.clear();
  }

  /**
   * Export a chart as PNG or SVG.
   * @param {import('./chart-base.js').default} chart
   * @param {'png'|'svg'} format
   * @returns {Promise<void>}
   */
  async exportImage(chart, format) {
    if (format === 'svg') {
      await chart.exportSVG();
    } else {
      await chart.exportPNG();
    }
  }

  /**
   * Export chart data as CSV or XLSX.
   * @param {import('./chart-base.js').default} chart
   * @param {'csv'|'xlsx'} format
   */
  exportData(chart, format) {
    if (format === 'xlsx') {
      chart.exportXLSX();
    } else {
      chart.exportCSV();
    }
  }

  /**
   * Read global chart defaults from settings (font sizes, background color).
   * @private
   * @returns {Object} Partial config merged before user config
   */
  _getFontDefaults() {
    if (!this._stateManager) return {};
    const defaults = {};
    const title = this._stateManager.get('settings.chartTitleSize');
    const label = this._stateManager.get('settings.chartLabelSize');
    const tick  = this._stateManager.get('settings.chartTickSize');
    const bg    = this._stateManager.get('settings.chartBgColor');
    if (title != null) defaults.titleSize = title;
    if (label != null) defaults.labelSize = label;
    if (tick  != null) defaults.tickSize  = tick;
    if (bg)            defaults.bgColor   = bg;
    const legend = this._stateManager.get('settings.chartShowLegend');
    if (legend != null) defaults.showLegend = legend;
    return defaults;
  }

  /**
   * Lazy-load a chart type constructor. Caches after first load.
   * @private
   * @param {string} type
   * @returns {Promise<Function>}
   */
  async _loadType(type) {
    if (this._ctorCache.has(type)) {
      return this._ctorCache.get(type);
    }
    const loader = TYPE_MAP[type];
    if (!loader) {
      throw new Error(`[ChartManager] Unknown chart type: "${type}". Available: ${Object.keys(TYPE_MAP).join(', ')}`);
    }
    const mod = await loader();
    const Ctor = mod.default;
    this._ctorCache.set(type, Ctor);
    return Ctor;
  }
}
