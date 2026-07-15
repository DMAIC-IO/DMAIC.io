/**
 * D.Mike — MSA Typ 4 Module (msa-typ4.js)
 * Measure phase: Linearity + bias analysis over the measurement range.
 * Spec: docs/modules/MSA-TYP4.md
 */

import { analyze } from '../../engines/msa-typ4-engine.js';

export default {
  id: 'msa-typ4',
  phase: 'measure',
  icon: 'trending-up',
  i18nKey: 'modules.msa-typ4',
  version: '1.0.0',

  _container: null,
  _context: null,
  _t: null,
  _result: null,
  _params: {
    name: '', unit: 'mm', norm: 'AIAG', pvMode: 'tolerance',
    tolerance: { LSL: NaN, USL: NaN }, sigmaP: NaN, alpha: 0.05,
  },
  _refColumn: null,
  _measColumn: null,
  _pickerRef: null,
  _pickerMeas: null,
  _exampleWorksheetId: null,
  _charts: [],
  _eventUnsubs: [],

  help: () => import('./msa-typ4-help.js'),

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._t = (key, vars) => context.i18n.t(key, vars);

    if (!document.getElementById('msa-typ4-css')) {
      const link = document.createElement('link');
      link.id = 'msa-typ4-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/msa-typ4/msa-typ4.css';
      document.head.appendChild(link);
    }

    const onModuleActivated = ({ instanceId }) => {
      if (instanceId === context.instanceId) {
        this._pickerRef?.refresh();
        this._pickerMeas?.refresh();
      }
    };
    context.eventBus.on('module:activated', onModuleActivated);
    this._eventUnsubs.push(() => context.eventBus.off('module:activated', onModuleActivated));

    container.innerHTML = '';
    this._render();
  },

  async destroy() {
    for (const u of this._eventUnsubs) u();
    this._eventUnsubs = [];
    this._pickerRef?.destroy();
    this._pickerMeas?.destroy();
    this._pickerRef = null;
    this._pickerMeas = null;
    this._destroyCharts();
    if (this._container) this._container.innerHTML = '';
  },

  onLanguageChange() { if (this._container) this._render(); },
  onThemeChange()    { if (this._container) this._render(); },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return {
      version: this.version,
      params: { ...this._params, tolerance: { ...this._params.tolerance } },
      refColumn: this._refColumn ? { ...this._refColumn } : null,
      measColumn: this._measColumn ? { ...this._measColumn } : null,
      exampleWorksheetId: this._exampleWorksheetId,
    };
  },

  setState(data) {
    if (!data || typeof data !== 'object') return;
    if (data.params) {
      this._params = {
        ...this._params,
        ...data.params,
        tolerance: { ...this._params.tolerance, ...(data.params.tolerance || {}) },
      };
    }
    this._refColumn = data.refColumn ?? null;
    this._measColumn = data.measColumn ?? null;
    this._exampleWorksheetId = data.exampleWorksheetId ?? null;
    if (this._container) this._render();
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    // Placeholder — Task 9+ fill in the split-panel structure.
    this._destroyCharts();
    this._container.innerHTML = `<section class="module-msa-typ4"><div class="module-msa-typ4__empty">${this._t('modules.msa-typ4.emptyState')}</div></section>`;
  },

  // ─── Charts ─────────────────────────────────────────────────

  _destroyCharts() {
    const cm = this._context?.chartManager;
    for (const c of this._charts) {
      try { if (cm) cm.destroy(c); } catch (_) { /* ignore */ }
    }
    this._charts = [];
  },
};
