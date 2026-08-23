/**
 * D.Mike — Model Data Generator Module (model-data-generator.js)
 *
 * Data phase: generates synthetic datasets from configurable regression models.
 * Supports factors with min/max ranges, interaction terms up to 5th order,
 * configurable beta coefficients, multiple sampling methods (Monte Carlo, LHS,
 * full factorial), noise injection and a seeded PRNG for reproducibility.
 *
 * View-only module (Alpine CSP). All state and computation live in the Model
 * (model-data-generator-model.js); this file holds the view transformations,
 * event handlers and the imperative DataGrid preview mount.
 */

import { createModule } from '../../core/template-module.js';
import { DataGrid } from '../../core/datagrid/datagrid.js';
import { openGridInWorksheet } from '../../core/datagrid/datagrid-to-worksheet.js';
import { descriptiveStats } from '../../engines/normality-test-engine.js';
import { State, Factor, termLabel } from './model-data-generator-model.js';

export default createModule({
  config: {
    id: 'model-data-generator',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.model-data-generator',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient UI state (not persisted) ────────────────────
      generatedData: null,
      resultsVisible: false,
      statKpis: [],
      rowCountText: '',
      _grid: null,

      // ── View transformations ──────────────────────────────────

      /** Equation tail: one styled span per non-zero term. */
      equationParts() {
        const parts = [];
        this.model.terms.forEach(term => {
          const b = term.beta;
          if (b === 0) return;
          const vars = term.indices
            .map(fi => this.model.factors[fi]?.name || `X${fi + 1}`)
            .join('·');
          const sign = b > 0 ? '+' : '−';
          parts.push(` ${sign} ${Math.abs(b)}·${vars}`);
        });
        return parts;
      },

      /** Beta inputs grouped by interaction order (main effects, 2-way, …). */
      betaGroups() {
        const grouped = new Map();
        this.model.terms.forEach((term, idx) => {
          const order = term.indices.length;
          const label = order === 1 ? _t('mainEffects') : `${order}-${_t('wayInteractions')}`;
          if (!grouped.has(label)) grouped.set(label, []);
          grouped.get(label).push({
            idx,
            label: termLabel(term.indices, this.model.factors),
            term,
          });
        });
        return Array.from(grouped, ([label, items]) => ({ label, items }));
      },

      // ── Event handlers ────────────────────────────────────────

      addFactor() {
        this.model.factors.push(new Factor(`Faktor_${this.model.factors.length + 1}`, 0, 100));
        this.model.rebuildTerms();
        this._resetResults();
      },

      removeFactor(i) {
        this.model.factors.splice(i, 1);
        this.model.rebuildTerms();
        this._resetResults();
      },

      generate() {
        const rows = this.model.generate();
        this.generatedData = rows;
        this._computeStats(rows);
        this.rowCountText = `(${rows.length} ${_t('rows')})`;
        this.resultsVisible = true;
        // Mount after Alpine flushes x-show so the grid measures a visible container.
        this.$nextTick(() => this._mountGrid());
      },

      // ── Internal helpers ──────────────────────────────────────

      _resetResults() {
        this.generatedData = null;
        this.resultsVisible = false;
        this._destroyGrid();
      },

      _computeStats(rows) {
        const yv = rows.map(r => r[this.model.yName]);
        const ds = descriptiveStats(yv);
        const fmt = v =>
          (Math.abs(v) >= 1e6 || (Math.abs(v) < 0.001 && v !== 0))
            ? v.toExponential(4)
            : v.toFixed(4);
        this.statKpis = [
          { label: 'N', value: ds.n },
          { label: _t('statMean'), value: fmt(ds.mean) },
          { label: _t('statStd'), value: fmt(ds.stdDev) },
          { label: 'Min', value: fmt(ds.min) },
          { label: 'Max', value: fmt(ds.max) },
        ];
      },

      _mountGrid() {
        // Note: `$el` inside an event handler is the clicked element, not the
        // component root — query from the stable module host container instead.
        const wrap = module._container.querySelector('#mdg-data-table');
        if (!wrap || !this.generatedData?.length) return;
        this._destroyGrid();
        wrap.replaceChildren();

        const ctx = module._context;
        const colNames = Object.keys(this.generatedData[0]);
        const columns = colNames.map(name => ({
          name,
          type: 'numeric',
          values: this.generatedData.map(r => r[name]),
          format: { decimals: 4 },
        }));

        this._grid = new DataGrid(wrap, {
          toast: ctx.notify || (() => {}),
          t: (key) => ctx.i18n.t(key),
          openInWorksheet: (grid) => {
            const name = ctx.i18n.t('modules.model-data-generator.name') || 'Generated Data';
            openGridInWorksheet(grid, ctx, { sheetName: name, navigate: true });
          },
        });
        this._grid.setData(columns);
      },

      _destroyGrid() {
        if (this._grid) {
          try { this._grid.destroy(); } catch { /* ignore */ }
          this._grid = null;
        }
      },

      destroy() {
        this._destroyGrid();
      },
    };
  },
});
