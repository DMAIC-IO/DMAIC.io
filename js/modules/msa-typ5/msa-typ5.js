/**
 * DMAIC.io — MSA Typ 5 Module (msa-typ5.js)
 * Measure phase: Attribute Measurement System Analysis.
 * Fünf Prüfer x Teile x Wiederholungen mit binärem / nominalem / ordinalem
 * Merkmal — Kappa-basierte Übereinstimmung, Effektivität, Signal Detection.
 *
 * Spec: docs/superpowers/specs/2026-07-15-msa-typ5-design.md
 */

import { analyze } from '../../engines/msa-typ5-engine.js';
import { ColumnPicker, getColumnValues } from '../../ui/column-picker.js';
import {
  provisionWorksheet as _provisionWorksheet,
  removeProvisionedWorksheet as _removeProvisionedWorksheet,
} from '../../core/examples-registry.js';

export default {
  id: 'msa-typ5',
  phase: 'measure',
  icon: 'check-square',
  i18nKey: 'modules.msa-typ5',
  version: '1.0.0',

  _container: null,
  _context: null,
  _t: null,
  _result: null,
  _params: {
    type: 'binary',
    positiveLevel: null,
    ordinalOrder: null,
    weights: 'quadratic',
    alpha: 0.05,
  },
  _columnRefs: {
    part: null, appraiser: null, rating: null, reference: null, replicate: null,
  },
  _pickers: {
    part: null, appraiser: null, rating: null, reference: null, replicate: null,
  },
  _exampleWorksheetId: null,
  _charts: [],
  _eventUnsubs: [],

  help: () => import('./msa-typ5-help.js'),

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._t = (key, vars) => context.i18n.t(key, vars);

    if (!document.getElementById('msa-typ5-css')) {
      const link = document.createElement('link');
      link.id = 'msa-typ5-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/msa-typ5/msa-typ5.css';
      document.head.appendChild(link);
    }

    container.innerHTML = `
      <section class="module-msa-typ5">
        <div class="module-msa-typ5__empty">${this._t('modules.msa-typ5.emptyState')}</div>
      </section>
    `;
  },

  async destroy() {
    for (const u of this._eventUnsubs) u();
    this._eventUnsubs = [];
    this._destroyCharts();
    for (const p of Object.values(this._pickers)) p?.destroy?.();
    this._pickers = { part: null, appraiser: null, rating: null, reference: null, replicate: null };
    if (this._container) this._container.innerHTML = '';
  },

  onLanguageChange() { if (this._container) this._render(); },
  onThemeChange()    { if (this._container) this._render(); },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return {
      version: this.version,
      params: { ...this._params },
      columns: {
        part:      this._columnRefs.part      ? { ...this._columnRefs.part }      : null,
        appraiser: this._columnRefs.appraiser ? { ...this._columnRefs.appraiser } : null,
        rating:    this._columnRefs.rating    ? { ...this._columnRefs.rating }    : null,
        reference: this._columnRefs.reference ? { ...this._columnRefs.reference } : null,
        replicate: this._columnRefs.replicate ? { ...this._columnRefs.replicate } : null,
      },
      exampleWorksheetId: this._exampleWorksheetId,
    };
  },

  setState(data) {
    if (!data || typeof data !== 'object') return;
    if (data.params)  this._params      = { ...this._params, ...data.params };
    if (data.columns) this._columnRefs  = { ...this._columnRefs, ...data.columns };
    if (data.exampleWorksheetId !== undefined) this._exampleWorksheetId = data.exampleWorksheetId;
    if (this._container) this._render();
  },

  // ─── Render (placeholder — Task 10+ füllen das Split-Panel) ─

  _render() {
    this._container.innerHTML = `
      <section class="module-msa-typ5">
        <div class="module-msa-typ5__empty">${this._t('modules.msa-typ5.emptyState')}</div>
      </section>
    `;
  },

  _destroyCharts() {
    const cm = this._context?.chartManager;
    for (const c of this._charts) {
      try { if (cm) cm.destroy(c); } catch (_) { /* ignore */ }
    }
    this._charts = [];
  },
};
