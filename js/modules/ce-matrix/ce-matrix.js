/**
 * D.Mike — C&E Matrix Module (ce-matrix.js)
 * Cause and Effect (X-Y) Matrix for scoring process inputs against outputs.
 * DMAIC phase: Analyze.
 *
 * Migrated to createModule + Alpine CSP. The Model (ce-matrix-model.js) holds
 * the persisted state (inputs, outputs, scores, weights) plus all weighted-scoring
 * business logic. The data-fn owns the view transforms (color scale → cell styles),
 * the input/weight/score event handlers, the export handlers, and the imperative
 * export-dropdown widget (mounted per Alpine instance in init/destroy).
 *
 * Spec: docs/modules/CE-MATRIX.md
 */

import { createModule } from '../../core/template-module.js';
import {
  downloadFile, ensureXLSX, XLSX, createExportDropdown,
  exportTableAsPNG, exportTableAsSVG,
} from '../../core/export-utils.js';
import { State } from './ce-matrix-model.js';

// ─── Color scale (green → yellow → red) — view only ───────────

const COLOR_STOPS = [
  { p: 0,    r: 34,  g: 197, b: 94  },
  { p: 0.35, r: 132, g: 204, b: 22  },
  { p: 0.55, r: 234, g: 179, b: 8   },
  { p: 0.75, r: 249, g: 115, b: 22  },
  { p: 1,    r: 239, g: 68,  b: 68  },
];

/** Linear-interpolate the gradient at a 0..1 ratio. */
function lerpColor(ratio) {
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const a = COLOR_STOPS[i], b = COLOR_STOPS[i + 1];
    if (ratio >= a.p && ratio <= b.p) {
      const t = (ratio - a.p) / (b.p - a.p);
      return {
        r: Math.round(a.r + (b.r - a.r) * t),
        g: Math.round(a.g + (b.g - a.g) * t),
        b: Math.round(a.b + (b.b - a.b) * t),
      };
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1];
}

/** Background color (translucent) for a value within [min,max]. */
function colorForValue(val, min, max) {
  if (max === min) return 'transparent';
  const { r, g, b } = lerpColor((val - min) / (max - min));
  return `rgba(${r},${g},${b},.18)`;
}

/** Text color for a value within [min,max]. */
function textColorForValue(val, min, max) {
  if (max === min) return 'var(--color-text-tertiary)';
  const { r, g, b } = lerpColor((val - min) / (max - min));
  return `rgb(${r},${g},${b})`;
}

export default createModule({
  config: {
    id: 'ce-matrix',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'grid',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Static view data ──────────────────────────────────────
      weightOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],

      /** Toolbar "+ Label" text (single text node — mirrors legacy `+ ${t(key)}`). */
      addLabel(key) { return `+ ${  _t(key)}`; },

      /** @type {{el:HTMLElement,destroy:function}|null} */
      _exportDropdown: null,

      /** @type {any} live Pareto chart of Row Sums (right of the matrix). */
      _paretoChart: null,
      _paretoRaf: 0,

      // ── Score display ─────────────────────────────────────────
      /** Raw stored score for an input (empty string when unset). */
      scoreDisplay(r, c) {
        const v = this.model.scores[this.model.key(r, c)];
        return v !== undefined ? v : '';
      },

      // ── Cell coloring (row / col sums) ────────────────────────
      rowSumStyle(r) {
        const sums = this.model.inputs.map((_, i) => this.model.rowSum(i));
        const min = Math.min(...sums);
        const max = Math.max(...sums);
        const v = this.model.rowSum(r);
        return `background:${  colorForValue(v, min, max)  };color:${  textColorForValue(v, min, max)}`;
      },
      colSumStyle(c) {
        const sums = this.model.outputs.map((_, i) => this.model.colSum(i));
        const min = Math.min(...sums);
        const max = Math.max(...sums);
        const v = this.model.colSum(c);
        return `background:${  colorForValue(v, min, max)  };color:${  textColorForValue(v, min, max)}`;
      },

      // ── Event handlers ────────────────────────────────────────
      scoreInput(r, c, event) {
        this.model.setScore(r, c, event.target.value);
      },
      inputNameChanged(r, event) {
        this.model.inputs[r] = event.target.value;
      },
      outputNameChanged(c, event) {
        this.model.outputs[c] = event.target.value;
      },
      weightChanged(c, event) {
        this.model.weights[c] = parseInt(event.target.value, 10);
      },
      addInput() {
        this.model.addInput();
      },
      addOutput() {
        this.model.addOutput();
      },
      removeInput(r) {
        this.model.removeInput(r);
      },
      removeOutput(c) {
        this.model.removeOutput(c);
      },

      // ── Export ────────────────────────────────────────────────
      _exportCSV() {
        const m = this.model;
        const sep = ';';
        let csv = 'sep=;\n';
        csv += `"${this.t('weight')}"${  sep  }${m.weights.join(sep)  }${sep  }\n`;
        csv += `${sep + m.outputs.map(o => `"${o.replace(/"/g, '""')}"`).join(sep) + sep  }"${this.t('rowSum')}"\n`;
        for (let r = 0; r < m.inputs.length; r++) {
          csv += `"${m.inputs[r].replace(/"/g, '""')}"`;
          for (let c = 0; c < m.outputs.length; c++) csv += sep + m.getScore(r, c);
          csv += `${sep + m.rowSum(r)  }\n`;
        }
        csv += `"${this.t('colSum')}"`;
        for (let c = 0; c < m.outputs.length; c++) csv += sep + m.colSum(c);
        csv += '\n';
        downloadFile(csv, 'ce-matrix.csv', 'text/csv;charset=utf-8');
        module._context.notify('CSV ✓', 'success');
      },

      async _exportXLSX() {
        const m = this.model;
        try { await ensureXLSX(); } catch { module._context.notify?.('XLSX library not loaded'); return; }
        const rows = [];
        rows.push([this.t('weight'), ...m.weights, '']);
        rows.push(['', ...m.outputs, this.t('rowSum')]);
        for (let r = 0; r < m.inputs.length; r++) {
          const row = [m.inputs[r]];
          for (let c = 0; c < m.outputs.length; c++) row.push(m.getScore(r, c));
          row.push(m.rowSum(r));
          rows.push(row);
        }
        const footRow = [this.t('colSum')];
        for (let c = 0; c < m.outputs.length; c++) footRow.push(m.colSum(c));
        rows.push(footRow);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'C&E Matrix');
        XLSX.writeFile(wb, 'ce-matrix.xlsx');
        module._context.notify('Excel ✓', 'success');
      },

      _exportJSON() {
        const json = JSON.stringify(this.model.toJSON(), null, 2);
        downloadFile(json, 'ce-matrix.json', 'application/json');
        module._context.notify('JSON ✓', 'success');
      },

      _buildTableDescriptor() {
        const m = this.model;
        const cells = [];
        for (let r = 0; r < m.inputs.length; r++) {
          const row = [];
          for (let c = 0; c < m.outputs.length; c++) {
            const v = m.scores[m.key(r, c)];
            row.push(v !== undefined ? v : '');
          }
          cells.push(row);
        }
        return {
          outputs: [...m.outputs],
          inputs: [...m.inputs],
          weights: [...m.weights],
          weightLabel: this.t('weight'),
          cells,
          rowSums: m.inputs.map((_, r) => m.rowSum(r)),
          colSums: m.outputs.map((_, c) => m.colSum(c)),
          grandTotal: m.grandTotal(),
          rowSumLabel: this.t('rowSum'),
          colSumLabel: this.t('colSum'),
          cellBg: (v, min, max) => colorForValue(v, min, max),
          cellFg: (v, min, max) => textColorForValue(v, min, max),
        };
      },

      async _exportImage(format) {
        const td = this._buildTableDescriptor();
        if (format === 'png') {
          exportTableAsPNG(td, 'ce-matrix.png');
          module._context.notify('PNG ✓', 'success');
        } else {
          await exportTableAsSVG(td, 'ce-matrix.svg');
          module._context.notify('SVG ✓', 'success');
        }
      },

      // ── Pareto (Row Sums, live) ───────────────────────────────

      /** Build {name,value}[] from current inputs + row sums. */
      _paretoItems() {
        const m = this.model;
        return m.inputs.map((name, r) => ({
          name: (name && String(name).trim()) || `Input ${r + 1}`,
          value: Math.max(0, m.rowSum(r) || 0),
        }));
      },

      /** Recreate the chart with current items. Called on model changes. */
      async _renderPareto() {
        const host = this.$el.querySelector('[data-ref="pareto-host"]');
        if (!host) return;
        const cm = module._context.chartManager;

        if (this._paretoChart) {
          try { cm.destroy(this._paretoChart); } catch { /* ignore */ }
          this._paretoChart = null;
        }
        host.replaceChildren();

        this._paretoChart = await cm.create(host, 'pareto', {
          title: this.t('paretoTitle'),
          yLabel: this.t('paretoYLabel'),
          items: this._paretoItems(),
          showLegend: false,
        });
      },

      /** rAF-debounced re-render so rapid keystrokes don't thrash the chart. */
      _schedulePareto() {
        if (this._paretoRaf) cancelAnimationFrame(this._paretoRaf);
        this._paretoRaf = requestAnimationFrame(() => {
          this._paretoRaf = 0;
          this._renderPareto();
        });
      },

      // ── Lifecycle (per Alpine instance) ───────────────────────
      init() {
        const anchor = this.$el.querySelector('.ce-matrix__export-anchor');
        if (anchor) {
          this._exportDropdown = createExportDropdown(
            ['xlsx', 'csv', 'json', 'png', 'svg'],
            (fmt) => {
              if (fmt === 'csv')  this._exportCSV();
              if (fmt === 'xlsx') this._exportXLSX();
              if (fmt === 'json') this._exportJSON();
              if (fmt === 'png')  this._exportImage('png');
              if (fmt === 'svg')  this._exportImage('svg');
            }
          );
          anchor.replaceWith(this._exportDropdown.el);
        }

        this.$nextTick(() => this._renderPareto());
        this.$watch('model.inputs',  () => this._schedulePareto());
        this.$watch('model.outputs', () => this._schedulePareto());
        this.$watch('model.weights', () => this._schedulePareto());
        this.$watch('model.scores',  () => this._schedulePareto());
      },
      destroy() {
        if (this._exportDropdown) {
          this._exportDropdown.destroy();
          this._exportDropdown = null;
        }
        if (this._paretoRaf) { cancelAnimationFrame(this._paretoRaf); this._paretoRaf = 0; }
        if (this._paretoChart) {
          try { module._context.chartManager.destroy(this._paretoChart); } catch { /* ignore */ }
          this._paretoChart = null;
        }
      },
    };
  },
});
