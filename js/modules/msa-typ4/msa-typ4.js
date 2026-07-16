/**
 * DMAIC.io — MSA Typ 4 Module (msa-typ4.js)
 * Measure phase: Linearity + bias analysis over the measurement range.
 *
 * Data source: two columns from a Worksheet module
 *   (reference value, measured value).
 *
 * Migrated to createModule + Alpine CSP. The Model (msa-typ4-model.js) holds
 * only the raw inputs (name/unit/norm/pvMode/tolerance/sigmaP/alpha + two
 * column references); the linearity result is derived transiently in the view
 * from those inputs plus the live worksheet column values via the shared
 * engine. ColumnPickers and the SVG charts are mounted imperatively (they
 * are not pure-template concerns).
 *
 * Spec: docs/modules/MSA-TYP4.md
 */

import { createModule } from '../../core/template-module.js';
import { State } from './msa-typ4-model.js';
import { analyze } from '../../engines/msa-typ4-engine.js';
import { ColumnPicker, getColumnValues } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';

/** @param {number} v @param {number} d @returns {string} */
function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '–'; }

/** @param {number} p @returns {string} */
function fmtP(p) {
  if (p == null || !Number.isFinite(p)) return '–';
  if (p < 0.001) return '< 0.001';
  return p.toFixed(3);
}

const mod = createModule({
  config: {
    id: 'msa-typ4',
    engine: 'alpine',
    phase: 'measure',
    icon: 'trending-up',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      result: null,
      errorMsg: '',
      _pickerRef: null,
      _pickerMeas: null,
      _charts: [],
      _unsubs: [],
      _debTimer: null,
      _renderGen: 0,
      _lastRef: null,
      _lastMeas: null,

      // ── View transformations ──────────────────────────────────

      fmt,
      fmtP,

      isTolerance() { return this.model.params.pvMode === 'tolerance'; },
      isAiag()      { return this.model.params.norm !== 'VDA5'; },
      isVda()       { return this.model.params.norm === 'VDA5'; },

      /** Current-norm KPI block (AIAG or VDA5). */
      _currentKpi() {
        if (!this.result) return null;
        return this.isVda() ? this.result.kpi.vda5 : this.result.kpi.aiag;
      },

      currentVerdictColor() {
        const k = this._currentKpi();
        return k ? k.verdict.color : 'green';
      },

      interpretationClass() {
        return `msa-typ4__interp msa-typ4__interp--${this.currentVerdictColor()}`;
      },

      interpretationText() {
        if (!this.result) return '';
        const i = this.result.interpretation;
        return _t(i.textKey, i.params);
      },

      kpiModClass(color) {
        const map = { green: 'dmike-kpi--good', yellow: 'dmike-kpi--warn', red: 'dmike-kpi--bad' };
        return map[color] || '';
      },

      /**
       * Compose the KPI-strip tiles for the currently selected norm. Kept in a
       * single data-fn to avoid conditional-branch soup in the template.
       * @returns {Array<{ key:string, mod:string, label:string, value:string, sub:string }>}
       */
      kpiTiles() {
        const r = this.result;
        if (!r) return [];
        const isVda = this.isVda();
        const tiles = [];
        if (isVda) {
          const k = r.kpi.vda5;
          const mod = this.kpiModClass(k.verdict.color);
          tiles.push(
            { key: 'uBi',   mod, label: _t('kpi.uBi'),   value: fmt(k.u_BI, 4), sub: '' },
            { key: 'u',     mod, label: _t('kpi.u'),     value: fmt(k.U, 4),    sub: '' },
            { key: 'qmsbi', mod, label: _t('kpi.qMsBi'), value: `${fmt(k.Q_MS_BI, 2)} %`, sub: _t(k.verdict.key) },
          );
        } else {
          const k = r.kpi.aiag;
          const mod = this.kpiModClass(k.verdict.color);
          const slopeMod = k.slopeSignificant ? 'dmike-kpi--bad' : 'dmike-kpi--good';
          const intMod   = k.interceptSignificant ? 'dmike-kpi--bad' : 'dmike-kpi--good';
          tiles.push(
            { key: 'lin',   mod, label: _t('kpi.percentLinearity'), value: `${fmt(k.percentLinearity, 2)} %`, sub: _t(k.verdict.key) },
            { key: 'slope', mod: slopeMod, label: _t('kpi.slope'),     value: fmt(r.regression.slope, 4),     sub: `p = ${fmtP(r.regression.pSlope)}` },
            { key: 'int',   mod: intMod,   label: _t('kpi.intercept'), value: fmt(r.regression.intercept, 4), sub: `p = ${fmtP(r.regression.pIntercept)}` },
          );
        }
        // %Bias-Peak wird aus dem AIAG-Block gelesen — auch im VDA-Modus sinnvoll.
        tiles.push({
          key: 'maxBias', mod: '',
          label: _t('kpi.maxPercentBias'),
          value: `${fmt(r.kpi.aiag.maxPercentBias, 2)} %`,
          sub: '',
        });
        return tiles;
      },

      /** Per-reference table rows (view-formatted). */
      tableRows() {
        const r = this.result;
        if (!r || !r.perReference) return [];
        return r.perReference.map((p) => ({
          key: `${p.xRef}`,
          rowClass: `msa-typ4__row--${p.verdict}`,
          xRef: fmt(p.xRef, 3),
          n: p.n,
          mean: fmt(p.mean, 4),
          bias: fmt(p.bias, 4),
          percentBias: `${fmt(p.percentBias, 2)} %`,
          tStat: fmt(p.tStat, 2),
          pValue: fmtP(p.pValue),
        }));
      },

      // ── Analysis (controller — needs context + live worksheet data) ──

      parseNum(s) {
        if (s == null || s === '') return NaN;
        return parseFloat(String(s).replace(',', '.').trim());
      },

      /**
       * Build aligned {reference, measured} arrays from the two selected
       * worksheet columns, dropping rows where either value is missing/non-numeric.
       * @returns {{reference:number[], measured:number[]} | null}
       */
      _buildDataArrays() {
        const sm = module._context.stateManager;
        const rawRef = getColumnValues(sm, this.model.refColumn);
        const rawMeas = getColumnValues(sm, this.model.measColumn);

        const reference = [], measured = [];
        const len = Math.min(rawRef.length, rawMeas.length);
        for (let i = 0; i < len; i++) {
          const r = typeof rawRef[i] === 'number' ? rawRef[i]
                    : parseFloat(String(rawRef[i] ?? '').replace(',', '.'));
          const m = typeof rawMeas[i] === 'number' ? rawMeas[i]
                    : parseFloat(String(rawMeas[i] ?? '').replace(',', '.'));
          if (!Number.isFinite(r) || !Number.isFinite(m)) continue;
          reference.push(r);
          measured.push(m);
        }
        if (reference.length === 0) return null;
        return { reference, measured };
      },

      /**
       * Run analysis if both columns are selected; otherwise silently clear
       * results (mirrors msa-typ1/msa-typ2 auto-analysis behaviour).
       */
      runAnalysis() {
        this.errorMsg = '';
        if (!this.model.refColumn || !this.model.measColumn) return this.clearResults();
        const data = this._buildDataArrays();
        if (!data) return this.clearResults();

        this._lastRef = data.reference;
        this._lastMeas = data.measured;

        const p = this.model.params;
        const flat = {
          pvMode: p.pvMode,
          LSL: this.parseNum(p.tolerance.LSL),
          USL: this.parseNum(p.tolerance.USL),
          sigmaP: this.parseNum(p.sigmaP),
          alpha: this.parseNum(p.alpha),
          norm: p.norm,
        };
        const res = analyze(data.reference, data.measured, flat);
        if (!res.ok) return this.clearResults();

        this.result = res;
        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderCharts(res, gen));
      },

      scheduleAnalysis() {
        clearTimeout(this._debTimer);
        this._debTimer = setTimeout(() => this.runAnalysis(), 600);
      },

      clearResults() {
        this.result = null;
        this._destroyCharts();
      },

      // ── SVG charts (imperative via chartManager) ──────────────

      async _renderCharts(res, gen) {
        this._destroyCharts();
        await this._renderLinearityChart(res, gen);
        if (gen !== this._renderGen) return;
        await this._renderPctBiasChart(res, gen);
        if (gen !== this._renderGen) return;
        await this._renderPerRefDotChart(res, gen);
        if (gen !== this._renderGen) return;
        // Residuen-Chart erst rendern, wenn der Anwender <details> öffnet.
        const det = module._container.querySelector('[data-ref="residuals-details"]');
        if (!det) return;
        if (det.open) {
          await this._renderResidualChart(res, gen);
        } else if (!det.__msa4Bound) {
          det.__msa4Bound = true;
          det.addEventListener('toggle', () => {
            if (det.open) this._renderResidualChart(this.result, ++this._renderGen);
          }, { once: true });
        }
      },

      /**
       * Linearitäts-Plot: Bias-Punkte, Regressionsgerade und 95 %-KI-Band
       * über den Messbereich. KI-Band wird über errorBars.bandShow der
       * Fit-Serie realisiert (deltas relativ zu ŷ).
       */
      async _renderLinearityChart(res, gen) {
        const host = module._container.querySelector('[data-ref="chart-linearity"]');
        if (!host) return;
        const ref = this._lastRef, meas = this._lastMeas;
        if (!ref || !meas || ref.length === 0) return;

        // Einzel-Bias-Punkte
        const biasX = ref.slice();
        const biasY = ref.map((x, i) => meas[i] - x);

        // Regressionsgerade + KI-Band als Deltas relativ zum Fit
        const xMin = Math.min(...ref);
        const xMax = Math.max(...ref);
        const steps = 40;
        const fitX = new Array(steps + 1);
        const fitY = new Array(steps + 1);
        const yPlus = new Array(steps + 1);
        const yMinus = new Array(steps + 1);
        for (let i = 0; i <= steps; i++) {
          const x = xMin + (xMax - xMin) * (i / steps);
          const yhat = res.regression.slope * x + res.regression.intercept;
          const [lo, hi] = res.regression.ciBand(x);
          fitX[i] = x;
          fitY[i] = yhat;
          yPlus[i] = Math.max(0, hi - yhat);
          yMinus[i] = Math.max(0, yhat - lo);
        }

        const chart = await module._context.chartManager.create(host, 'scatter', {
          showLegend: true,
          xLabel: _t('labels.referenceColumn'),
          yLabel: _t('table.bias'),
          series: [
            {
              name: _t('table.bias'),
              color: 'var(--color-accent)',
              x: biasX, y: biasY,
              symbol: 'circle', strokeWidth: 1.5,
            },
            {
              name: 'Fit',
              color: 'var(--color-info)',
              x: fitX, y: fitY,
              markerSize: 0,
              connectLine: { show: true, width: 1.5, dash: 'solid', color: 'var(--color-info)' },
              errorBars: {
                show: true, bandShow: true, yMode: 'absolute',
                yPlus, yMinus,
                // Helles CSS-Variable statt rgba() → per Memory feedback_svg_rgba
                // wird das SVG-fill-Attribut ohne fill-opacity befüllt.
                bandColor: 'var(--color-accent-light)',
              },
            },
          ],
          refLines: [
            { dir: 'h', value: 0, label: '0', dash: 'dash', width: 1, color: 'var(--color-text-secondary)' },
          ],
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      /**
       * %Bias-Plot mit ±5 %-Toleranzband. Vorzeichenbehafteter %Bias =
       * percentBias * sign(bias) (percentBias speichert |bias| relativ zu PV).
       */
      async _renderPctBiasChart(res, gen) {
        const host = module._container.querySelector('[data-ref="chart-pctbias"]');
        if (!host) return;
        if (!res.perReference || res.perReference.length === 0) return;

        const xs = res.perReference.map(p => p.xRef);
        const ys = res.perReference.map(p => (Number.isFinite(p.percentBias) ? p.percentBias * Math.sign(p.bias) : 0));

        const chart = await module._context.chartManager.create(host, 'scatter', {
          showLegend: true,
          xLabel: _t('labels.referenceColumn'),
          yLabel: _t('table.percentBias'),
          series: [
            {
              name: _t('table.percentBias'),
              color: 'var(--color-warning)',
              x: xs, y: ys,
              symbol: 'circle', strokeWidth: 1.5,
            },
          ],
          refLines: [
            { dir: 'h', value: 0,  label: '0',    dash: 'dash', width: 1,   color: 'var(--color-text-secondary)' },
            { dir: 'h', value: 5,  label: '+5 %', dash: 'dot',  width: 1.2, color: 'var(--color-success)' },
            { dir: 'h', value: -5, label: '−5 %', dash: 'dot',  width: 1.2, color: 'var(--color-success)' },
          ],
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      /**
       * Dot-Plot: Messwerte je Referenzpunkt sowie Zellenmittelwert
       * (Diamond-Marker). Zeigt visuell, wo Bias und Streuung sitzen.
       */
      async _renderPerRefDotChart(res, gen) {
        const host = module._container.querySelector('[data-ref="chart-per-ref"]');
        if (!host) return;
        const ref = this._lastRef, meas = this._lastMeas;
        if (!ref || !meas || ref.length === 0) return;

        const meanX = res.perReference.map(p => p.xRef);
        const meanY = res.perReference.map(p => p.mean);

        const chart = await module._context.chartManager.create(host, 'scatter', {
          showLegend: true,
          xLabel: _t('labels.referenceColumn'),
          yLabel: _t('labels.measuredColumn'),
          series: [
            {
              name: _t('labels.measuredColumn'),
              color: 'var(--color-accent)',
              x: ref.slice(), y: meas.slice(),
              symbol: 'circle', strokeWidth: 1.5,
            },
            {
              name: _t('table.mean'),
              color: 'var(--color-text-primary)',
              x: meanX, y: meanY,
              symbol: 'diamond', strokeWidth: 1.5, markerSize: 10,
            },
          ],
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      /**
       * Residuen-Chart: Residuum = bias(i) − ŷ(x_i) über ŷ. Erlaubt
       * visuelle Prüfung der Modell-Restfehler (Muster ⇒ Nicht-Linearität).
       */
      async _renderResidualChart(res, gen) {
        const host = module._container.querySelector('[data-ref="chart-residuals"]');
        if (!host || !res) return;
        const ref = this._lastRef, meas = this._lastMeas;
        if (!ref || !meas || ref.length === 0) return;

        const xs = new Array(ref.length);
        const ys = new Array(ref.length);
        for (let i = 0; i < ref.length; i++) {
          const b = meas[i] - ref[i];
          const yhat = res.regression.slope * ref[i] + res.regression.intercept;
          xs[i] = yhat;
          ys[i] = b - yhat;
        }

        const chart = await module._context.chartManager.create(host, 'scatter', {
          showLegend: true,
          xLabel: 'ŷ',
          yLabel: _t('charts.residuals'),
          series: [
            {
              name: _t('charts.residuals'),
              color: 'var(--color-accent)',
              x: xs, y: ys,
              symbol: 'circle', strokeWidth: 1.5,
            },
          ],
          refLines: [
            { dir: 'h', value: 0, label: '0', dash: 'dash', width: 1, color: 'var(--color-text-secondary)' },
          ],
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      _destroyCharts() {
        const cm = module._context?.chartManager;
        for (const c of this._charts) {
          try { if (cm) cm.destroy(c); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      // ── ColumnPickers (imperative widgets) ────────────────────

      _mountPickers() {
        const wrapRef = module._container.querySelector('[data-ref="picker-ref"]');
        if (wrapRef) {
          this._pickerRef?.destroy();
          this._pickerRef = new ColumnPicker(wrapRef, module._context, {
            mode: 'single',
            types: ['numeric'],
            onChange: (ref) => { this.model.refColumn = ref; this.runAnalysis(); },
          });
          if (this.model.refColumn) this._pickerRef.value = this.model.refColumn;
        }
        const wrapMeas = module._container.querySelector('[data-ref="picker-meas"]');
        if (wrapMeas) {
          this._pickerMeas?.destroy();
          this._pickerMeas = new ColumnPicker(wrapMeas, module._context, {
            mode: 'single',
            types: ['numeric'],
            onChange: (ref) => { this.model.measColumn = ref; this.runAnalysis(); },
          });
          if (this.model.measColumn) this._pickerMeas.value = this.model.measColumn;
        }
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      init() {
        // Fresh per-instance collections (the data() object is shared by Alpine.data).
        this._charts = [];
        this._unsubs = [];

        // Ensure module-scoped CSS is loaded (msa-typ4.css is not statically
        // linked from index.dist.html — matches the legacy pattern).
        if (!document.getElementById('msa-typ4-css')) {
          const link = document.createElement('link');
          link.id = 'msa-typ4-css';
          link.rel = 'stylesheet';
          link.href = new URL('js/modules/msa-typ4/msa-typ4.css', document.baseURI).href;
          document.head.appendChild(link);
        }

        this._mountPickers();

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) {
            this._pickerRef?.refresh();
            this._pickerMeas?.refresh();
          }
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        // Re-run analysis whenever underlying worksheet data changes (cell
        // edits don't change the column selection, so the ColumnPicker's own
        // refresh() wouldn't catch them).
        const onDataChange = () => this.runAnalysis();
        eb.on('state:saved', onDataChange);
        eb.on('worksheet:dataChanged', onDataChange);
        this._unsubs.push(() => eb.off('state:saved', onDataChange));
        this._unsubs.push(() => eb.off('worksheet:dataChanged', onDataChange));

        const onTheme = () => {
          if (this.result) this._renderCharts(this.result, ++this._renderGen);
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Recompute results from restored state.
        this.runAnalysis();
      },

      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        clearTimeout(this._debTimer);
        this._pickerRef?.destroy();
        this._pickerMeas?.destroy();
        this._pickerRef = null;
        this._pickerMeas = null;
        this._destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: MSA-Typ4 examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `refColumn.instanceId` / `measColumn.instanceId`. On load we provision a
 * fresh worksheet, rewrite the placeholders, then apply state (which re-runs
 * the analysis on the new data).
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, instanceId) {
      let out = data;
      for (const key of ['refColumn', 'measColumn']) {
        const r = out[key];
        if (r && r.instanceId === '__source__') {
          out = { ...out, [key]: { ...r, instanceId } };
        }
      }
      return out;
    },
  });
};

export default mod;
