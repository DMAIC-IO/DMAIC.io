/**
 * D.Mike — Histogram Module (histogram.js)
 *
 * Migrated to createModule + Alpine CSP. The Alpine template (histogram.html)
 * provides the declarative SHELL: split layout, binning/options inputs (x-model),
 * the DatasetPicker anchor and the output area with every [data-ref] anchor.
 *
 * Everything inside the output area is a module-owned imperative CHART TIER:
 *   - DatasetPicker        (multi-dataset value+group column picker)
 *   - the histogram SVG     (multi-series side-by-side bars, normal curves,
 *                            Pareto overlay, reference lines/areas, bar patterns)
 *   - the boxplot panel SVG
 *   - the statistics table  (shared computeSeriesStats + renderStatsTable)
 *   - the modebar           (zoom/pan/reset/export/editor-toggle)
 *   - the editor panel       (built from the SHARED chart-editor.js builders)
 *   - tooltips + wheel-zoom + drag-pan
 *
 * These render by hand (NOT chartManager — the chart type cannot express the
 * multi-series + Pareto + boxplot composite) and are the sanctioned chart-tier
 * exception to "no HTML in JS". They are mounted in the data-fn init() and
 * disposed in destroy(); the framework destroys+remounts the Alpine tree on
 * setState/onLanguageChange, re-running init() so the widgets rebuild.
 *
 * Persistence state + the pure binning engine live in histogram-model.js /
 * histogram-binning.js. The legacy histogram-editor.js mixin is folded into the
 * editorMethods of this data-fn (it uses the shared chart-editor builders).
 */

import { createModule } from '../../core/template-module.js';
import { State } from './histogram-model.js';

import { createModebar, exportSvgAsPNG, exportSvgAsFile } from '../../core/chart/modebar.js';
import {
  resolveColor, svgEl, svgText, generateTicks,
  linearScale, formatNum, dashArray,
} from '../../core/chart/chart-core.js';
import {
  parseRGBA, rgbaStr,
  edSection, edCheckboxRow, edSelectRow,
  edColorPair, edColorSwatch, edVisToggle, edExpandBtn,
  edTitleSection, edFontSizeSection, edAxisLabelSection, edAxisTickSection,
  edRefLinesSection, edRefAreasSection, edBgColorSection,
  openColorPicker,
} from '../../core/chart/chart-editor.js';

import { DatasetPicker, getColumnValues, getColumnName } from '../../ui/dataset-picker.js';
import { computeSeriesStats, renderStatsTable } from '../../core/stats-panel.js';
import { CHART_COLORS_RGBA, BORDER_COLORS } from '../../core/chart/chart-colors.js';
import { binAll, computeBoxStats, createBarPattern } from './histogram-binning.js';
import {
  provisionWorksheet, removeProvisionedWorksheet, csvPayloadToWorksheetState,
} from '../../core/examples-registry.js';

/**
 * Verzögert `fn`, bis `ms` Millisekunden ohne weiteren Aufruf vergangen sind.
 * Gleiche Ausdrucksform wie in `core/chart/chart-base.js` — dort ist der
 * Helfer nicht exportiert.
 *
 * Die zurückgegebene Funktion trägt eine `cancel()`-Methode, die einen noch
 * laufenden Timer verwirft. Ohne sie feuert ein kurz vor dem Teardown
 * ausgelöster Aufruf auch nach `destroy()` noch — und da die Instanz ihr DOM
 * über das Modul-Singleton `module._container` auflöst, schriebe er alte Daten
 * in ein bereits neu gemountetes SVG.
 *
 * @param {Function} fn Aufzurufende Funktion.
 * @param {number} ms Ruhezeit in Millisekunden.
 * @returns {Function & { cancel: () => void }} Entprellte Fassung von `fn`.
 */
function debounce(fn, ms) {
  let t;
  const debounced = function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  debounced.cancel = () => { clearTimeout(t); t = undefined; };
  return debounced;
}

const mod = createModule({
  config: {
    id: 'histogram',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.histogram',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    /** Module-scoped i18n for `modules.histogram.<key>` (with params). */
    const t = (k, v) => module._context.i18n.t(`modules.histogram.${k}`, v);

    return {
      // ── Input mirror values (kept in sync with model in init) ──
      binWidthInput: '',
      confLevelInput: '95',

      // ── Transient render state (never persisted) ──────────────
      _picker: null,
      _modebar: null,
      _seriesData: null,

      // ── Reactive tooltips (transient — line-model) ────────────
      // Each line: { name?, nameColor?, text?, color?, dim? }
      //   name (+ nameColor) → bold colored leading span; text → inline rest.
      tip:   { visible: false, left: 0, top: 0, lines: [] },
      bpTip: { visible: false, left: 0, top: 0, lines: [] },
      _editorOpen: false,
      _interactionMode: 'zoom',
      _viewState: null,
      _isPanning: false,
      _panStart: null,
      _unsubs: [],
      _plotting: false,
      _resizeObserver: null,
      _resizeDebounced: null,
      _lastRenderSize: null,
      _interactionsReady: false,
      _activeColorPicker: null,
      _exampleWorksheetId: null,
      // Rendering state kept across renders (tooltip / zoom-pan)
      _curBinData: null,
      _lastXScale: null,
      _lastYScale: null,
      _lastPa: null,
      _lastXTick: null,
      _boxplotHitAreas: null,
      _globalMoveHandler: null,
      _globalUpHandler: null,

      ctx() { return module._container; },

      // ── Column helpers ────────────────────────────────────────
      _getColumnValues(ref) { return getColumnValues(module._context?.stateManager, ref); },
      _getColumnName(ref) { return getColumnName(module._context?.stateManager, ref); },

      // ── Input handlers (bin mode / width / conf level) ────────
      binModeChanged() {
        if (this.model.binMode === 'auto') {
          this.model.binWidth = null;
          this.binWidthInput = '';
        }
        this._autoPlot();
      },
      binWidthChanged(event) {
        const v = parseFloat(event.target.value);
        this.model.binWidth = (v > 0) ? v : null;
        this.binWidthInput = this.model.binWidth != null ? String(this.model.binWidth) : '';
        this._autoPlot();
      },
      confLevelChanged(event) {
        const v = parseFloat(event.target.value);
        if (v > 0 && v < 100) this.model.confLevel = v;
        this.confLevelInput = String(this.model.confLevel);
        this._renderStats();
      },

      // ── Picker ────────────────────────────────────────────────
      _createPicker() {
        const pickerWrap = module._container?.querySelector('[data-ref="picker-wrap"]');
        if (!pickerWrap) return;
        if (this._picker) { this._picker.destroy(); this._picker = null; }

        this._picker = new DatasetPicker(pickerWrap, module._context, {
          multi: true,
          colors: CHART_COLORS_RGBA,
          slots: [
            { key: 'value', label: 'V', title: module._context.i18n.t('ui.datasetPicker.slotV'), types: ['numeric'], minCount: 1, required: true },
            { key: 'group', label: 'G', title: module._context.i18n.t('ui.datasetPicker.slotG'), group: true },
          ],
          onChange: (datasets) => {
            this.model.datasets = datasets.map(ds => ({
              valueRef: ds.value || null,
              groupRef: ds.group || null,
            }));
            this.model.seriesOverrides = [];
            this._autoPlot();
          },
        });

        // Restore saved refs
        if (this.model.datasets.some(ds => ds.valueRef || ds.groupRef)) {
          this._picker.value = this.model.datasets.map(ds => ({
            value: ds.valueRef,
            group: ds.groupRef,
          }));
        }
      },

      // ── Modebar ───────────────────────────────────────────────
      _createModebar() {
        if (this._modebar) { this._modebar.destroy(); this._modebar = null; }
        const chartWrap = module._container?.querySelector('[data-ref="chart-wrap"]');
        const editorPanel = module._container?.querySelector('[data-ref="editor-panel"]');
        if (!chartWrap) return;

        this._modebar = createModebar({
          onZoom: () => { this._interactionMode = 'zoom'; chartWrap.style.cursor = 'default'; },
          onPan: () => { this._interactionMode = 'pan'; chartWrap.style.cursor = 'grab'; },
          onReset: () => { this._viewState = null; this._renderChart(); },
          onExportPNG: () => {
            const svg = module._container?.querySelector('[data-ref="chart-svg"]');
            if (svg) exportSvgAsPNG(svg, 'histogram.png');
          },
          onExportSVG: () => {
            const svg = module._container?.querySelector('[data-ref="chart-svg"]');
            if (svg) exportSvgAsFile(svg, 'histogram.svg');
          },
          onEditorToggle: (open) => {
            this._editorOpen = open;
            if (editorPanel) editorPanel.classList.toggle('histogram__editor--open', open);
            if (open) this._buildEditor();
            setTimeout(() => this._renderChart(), 340);
          },
        });
        chartWrap.appendChild(this._modebar.el);
      },

      // ── Größenänderung der Zeichenfläche ──────────────────────

      /**
       * Legt einen entprellten `ResizeObserver` auf die Zeichenfläche
       * (`[data-ref="chart-wrap"]`) und zeichnet das Diagramm neu, sobald sich
       * deren Maße ändern.
       *
       * Ohne das bliebe die in `_renderChart()` einmalig aus
       * `getBoundingClientRect()` gesetzte `viewBox` stehen. Wird der Container
       * später breiter — etwa weil das 360 px breite Hilfe-Panel verschwindet —,
       * skaliert das Default-`preserveAspectRatio` das alte Bild mittig in die
       * neue Fläche: links und rechts bleibt ein leerer Rand statt eines neu
       * aufgebauten Diagramms. Boxplot-Streifen und Pareto-Sekundärachse hängen
       * am selben Durchlauf und werden dabei mitgezogen.
       *
       * Eine Rückkopplung ist ausgeschlossen: die beobachtete Fläche hat eine
       * feste Höhe und schneidet Überstehendes ab (`histogram.css`:
       * `.histogram__chart-wrap { height: 420px; overflow: hidden }`), das SVG
       * darin liegt auf `width/height: 100%`. `_renderChart()` kann die
       * gemessene Box also gar nicht verändern. Zusätzlich zeichnet der
       * Beobachter nur neu, wenn die Fläche vom Maßstab des letzten Durchlaufs
       * abweicht (`_lastRenderSize`).
       *
       * @private
       */
      _observeChartResize() {
        if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
        if (this._resizeDebounced) { this._resizeDebounced.cancel(); this._resizeDebounced = null; }
        if (typeof ResizeObserver === 'undefined') return;
        const wrap = module._container?.querySelector('[data-ref="chart-wrap"]');
        if (!wrap) return;
        this._resizeDebounced = debounce(() => {
          if (!this._seriesData) return;
          const rect = wrap.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;
          const last = this._lastRenderSize;
          if (last && Math.abs(last.w - rect.width) < 0.5 && Math.abs(last.h - rect.height) < 0.5) return;
          this._renderChart();
        }, 80);
        this._resizeObserver = new ResizeObserver(this._resizeDebounced);
        this._resizeObserver.observe(wrap);
      },

      // ── Zoom / pan / global mouse ─────────────────────────────
      _bindInteractionEvents() {
        const container = module._container;

        const onWheel = (e) => {
          const wrap = e.target.closest('[data-ref="chart-wrap"]');
          if (!wrap || !this._lastPa || !this._lastXScale) return;
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
          const rect = wrap.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const pa = this._lastPa;
          const frac = (mx - pa.x) / pa.w;
          if (!this._viewState) this._viewState = { xMin: this._lastXTick.min, xMax: this._lastXTick.max };
          const vs = this._viewState;
          const range = vs.xMax - vs.xMin;
          const center = vs.xMin + frac * range;
          const newRange = range / factor;
          vs.xMin = center - frac * newRange;
          vs.xMax = center + (1 - frac) * newRange;
          this._renderChart();
        };
        container.addEventListener('wheel', onWheel, { passive: false });
        this._unsubs.push(() => container.removeEventListener('wheel', onWheel, { passive: false }));

        const onDown = (e) => {
          if (this._interactionMode !== 'pan') return;
          const wrap = e.target.closest('[data-ref="chart-wrap"]');
          if (!wrap || !this._lastPa) return;
          this._isPanning = true;
          this._panStart = { x: e.clientX, vs: this._viewState ? { ...this._viewState } : { xMin: this._lastXTick.min, xMax: this._lastXTick.max } };
          wrap.style.cursor = 'grabbing';
          e.preventDefault();
        };
        container.addEventListener('mousedown', onDown);
        this._unsubs.push(() => container.removeEventListener('mousedown', onDown));

        this._globalMoveHandler = (e) => {
          if (!this._isPanning || !this._panStart) return;
          const dx = e.clientX - this._panStart.x;
          const pa = this._lastPa;
          if (!pa || pa.w <= 0) return;
          const range = this._panStart.vs.xMax - this._panStart.vs.xMin;
          const shift = -(dx / pa.w) * range;
          if (!this._viewState) this._viewState = {};
          this._viewState.xMin = this._panStart.vs.xMin + shift;
          this._viewState.xMax = this._panStart.vs.xMax + shift;
          this._renderChart();
        };
        this._globalUpHandler = () => {
          if (this._isPanning) {
            this._isPanning = false;
            const wrap = module._container?.querySelector('[data-ref="chart-wrap"]');
            if (wrap) wrap.style.cursor = this._interactionMode === 'pan' ? 'grab' : 'default';
          }
        };
        window.addEventListener('mousemove', this._globalMoveHandler);
        window.addEventListener('mouseup', this._globalUpHandler);
      },

      // ── Auto-plot ─────────────────────────────────────────────
      _autoPlot() {
        const hasData = this.model.datasets.some(d => d.valueRef);
        if (hasData) {
          this._plot();
        } else {
          this._seriesData = null;
          const placeholder = module._container?.querySelector('[data-ref="placeholder"]');
          const chartArea = module._container?.querySelector('[data-ref="chart-area"]');
          if (placeholder) placeholder.style.display = '';
          if (chartArea) chartArea.style.display = 'none';
        }
      },

      _showError(msg) {
        const errBox = module._container?.querySelector('[data-ref="error-box"]');
        if (errBox) {
          errBox.textContent = msg;
          errBox.style.display = 'block';
          setTimeout(() => { errBox.style.display = 'none'; }, 4000);
        }
      },

      // ── Plot (expand datasets → seriesData) ───────────────────
      _plot() {
        if (this._plotting) return;
        this._plotting = true;
        try {
          const errBox = module._container?.querySelector('[data-ref="error-box"]');
          if (errBox) errBox.style.display = 'none';

          if (this.model.datasets.length === 0) {
            this._showError(t('errNoSeries'));
            return;
          }

          const seriesData = [];
          const pushSeries = (name, values) => {
            const i = seriesData.length;
            seriesData.push({
              name, visible: true,
              fillColor: CHART_COLORS_RGBA[i % CHART_COLORS_RGBA.length],
              borderColor: BORDER_COLORS[i % BORDER_COLORS.length],
              borderWidth: 1, borderStyle: 'solid',
              pattern: '', patternColor: '', patternSolidity: 0.4,
              showNormalCurve: true, values,
            });
          };

          for (let i = 0; i < this.model.datasets.length; i++) {
            const ds = this.model.datasets[i];
            if (!ds.valueRef) continue;
            const rawVals = this._getColumnValues(ds.valueRef);
            const name = this._getColumnName(ds.valueRef);

            if (ds.groupRef) {
              const groupVals = this._getColumnValues(ds.groupRef);
              const buckets = new Map();
              const len = Math.min(rawVals.length, groupVals.length);
              for (let r = 0; r < len; r++) {
                const v = rawVals[r];
                const g = groupVals[r];
                if (v == null || typeof v !== 'number' || isNaN(v)) continue;
                if (g == null || g === '') continue;
                const key = String(g);
                let b = buckets.get(key);
                if (!b) { b = { level: g, values: [] }; buckets.set(key, b); }
                b.values.push(v);
              }
              if (buckets.size === 0) { this._showError(t('errNoGroupLevels', { n: i + 1 })); return; }
              let hasAny = false;
              for (const b of buckets.values()) {
                if (b.values.length < 2) continue;
                pushSeries(t('groupSeriesName', { col: name, level: String(b.level) }), b.values);
                hasAny = true;
              }
              if (!hasAny) { this._showError(t('errTooFew', { col: name })); return; }
            } else {
              const values = rawVals.filter(v => v != null && typeof v === 'number' && !isNaN(v));
              if (values.length < 2) { this._showError(t('errTooFew', { col: name })); return; }
              pushSeries(name, values);
            }
          }

          if (seriesData.length === 0) {
            this._seriesData = null;
            const placeholder = module._container?.querySelector('[data-ref="placeholder"]');
            const chartArea = module._container?.querySelector('[data-ref="chart-area"]');
            if (placeholder) placeholder.style.display = '';
            if (chartArea) chartArea.style.display = 'none';
            return;
          }

          const placeholder = module._container.querySelector('[data-ref="placeholder"]');
          const chartArea = module._container.querySelector('[data-ref="chart-area"]');
          if (placeholder) placeholder.style.display = 'none';
          if (chartArea) chartArea.style.display = '';

          // Apply saved series overrides
          const ovs = this.model.seriesOverrides;
          if (ovs) {
            for (let i = 0; i < seriesData.length && i < ovs.length; i++) {
              const ov = ovs[i];
              if (ov.fillColor) seriesData[i].fillColor = ov.fillColor;
              if (ov.borderColor) seriesData[i].borderColor = ov.borderColor;
              if (ov.borderWidth != null) seriesData[i].borderWidth = ov.borderWidth;
              if (ov.borderStyle) seriesData[i].borderStyle = ov.borderStyle;
              if (ov.pattern != null) seriesData[i].pattern = ov.pattern;
              if (ov.patternColor) seriesData[i].patternColor = ov.patternColor;
              if (ov.patternSolidity != null) seriesData[i].patternSolidity = ov.patternSolidity;
              if (ov.visible != null) seriesData[i].visible = ov.visible;
              if (ov.showNormalCurve != null) seriesData[i].showNormalCurve = ov.showNormalCurve;
            }
          }

          this._seriesData = seriesData;

          requestAnimationFrame(() => {
            this._renderChart();
            if (!this._interactionsReady) {
              this._setupChartInteractions();
              this._interactionsReady = true;
            }
            if (this._editorOpen) this._buildEditor();
          });

          this._syncOverrides();
        } finally {
          this._plotting = false;
        }
      },

      /** Mirror live series visual props back into the persisted overrides. */
      _syncOverrides() {
        this.model.seriesOverrides = this._seriesData
          ? this._seriesData.map(s => ({
              name: s.name, visible: s.visible, fillColor: s.fillColor,
              borderColor: s.borderColor, borderWidth: s.borderWidth, borderStyle: s.borderStyle,
              pattern: s.pattern, patternColor: s.patternColor, patternSolidity: s.patternSolidity,
              showNormalCurve: s.showNormalCurve,
            }))
          : [];
      },

      // ── Chart rendering (module-owned SVG) ────────────────────
      _renderChart() {
        const seriesData = this._seriesData;
        if (!seriesData || seriesData.length === 0) return;

        const svg = module._container.querySelector('[data-ref="chart-svg"]');
        const wrap = module._container.querySelector('[data-ref="chart-wrap"]');
        if (!svg || !wrap) return;
        const rect = wrap.getBoundingClientRect();
        const size = { w: rect.width, h: rect.height };
        if (size.w <= 0 || size.h <= 0) return;

        svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
        // Maßstab dieses Durchlaufs merken — der ResizeObserver zeichnet nur
        // neu, wenn die Fläche davon abweicht (siehe _observeChartResize).
        this._lastRenderSize = { w: size.w, h: size.h };
        svg.replaceChildren();

        const textColor = resolveColor('var(--color-text-primary)');
        const subColor = resolveColor('var(--color-text-secondary)');
        const gridColor = resolveColor('var(--color-border-secondary)');
        const frameColor = resolveColor('var(--color-border-primary)');

        const FONT_MAIN = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
        const FONT_MONO = "'SF Mono', 'Cascadia Code', Consolas, 'Liberation Mono', monospace";

        const styleEl = svgEl('style', {}, svg);
        styleEl.textContent = `text { font-family: ${FONT_MAIN}; } .tick-label { font-family: ${FONT_MONO}; }`;

        const cc = this.model.chartConfig;
        svg.style.background = cc.bgColor || '';

        const autoTitle = `${t('chartTitle')  }: ${  seriesData.filter(s => s.visible !== false).map(s => s.name).join(', ')}`;
        const chartTitle = cc.title || autoTitle;

        const margin = { top: cc.showTitle ? 48 : 32, right: 24, bottom: 58, left: 72 };

        const bw = this.model.binMode === 'manual' && this.model.binWidth ? this.model.binWidth : null;
        const binData = binAll(seriesData, bw);
        this._curBinData = binData;

        let visCount = 0;
        seriesData.forEach(s => { if (s.visible !== false) visCount++; });
        const hasPareto = this.model.showPareto && visCount === 1;

        let rMargin = margin.right;
        if (hasPareto) rMargin = 52 + 18;
        const pa = {
          x: margin.left, y: margin.top,
          w: size.w - margin.left - rMargin,
          h: size.h - margin.top - margin.bottom,
          totalW: size.w, totalH: size.h,
        };
        this._lastPa = pa;

        let maxCount = 0;
        let nBins = 0;
        for (const serBins of binData.bins) if (serBins.length > nBins) nBins = serBins.length;
        for (let bi = 0; bi < nBins; bi++) {
          binData.bins.forEach(serBins => { if (serBins[bi]) maxCount = Math.max(maxCount, serBins[bi].count); });
        }
        const yMax = maxCount * 1.12 || 1;

        let xTick = generateTicks(binData.globalMin, binData.globalMax);
        const yTick = generateTicks(0, yMax);
        if (this._viewState) xTick = generateTicks(this._viewState.xMin, this._viewState.xMax);
        this._lastXTick = xTick;

        const xScale = linearScale(xTick.min, xTick.max, pa.x, pa.x + pa.w);
        const yScale = linearScale(yTick.min, yTick.max, pa.y + pa.h, pa.y);
        this._lastXScale = xScale;
        this._lastYScale = yScale;

        const defs = svgEl('defs', {}, svg);
        const clipId = 'hist-clip';
        const clip = svgEl('clipPath', { id: clipId }, defs);
        svgEl('rect', { x: pa.x, y: pa.y, width: pa.w, height: pa.h }, clip);

        seriesData.forEach((s, si) => {
          if (s.pattern && s.pattern !== '') createBarPattern(defs, `bar-pat-${si}`, s);
        });

        const gridGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
        xTick.ticks.forEach(v => {
          const x = Math.round(xScale(v)) + 0.5;
          svgEl('line', { x1: x, y1: pa.y, x2: x, y2: pa.y + pa.h, stroke: gridColor, 'stroke-width': 1 }, gridGroup);
        });
        yTick.ticks.forEach(v => {
          const y = Math.round(yScale(v)) + 0.5;
          svgEl('line', { x1: pa.x, y1: y, x2: pa.x + pa.w, y2: y, stroke: gridColor, 'stroke-width': 1 }, gridGroup);
        });

        // Reference areas (behind bars)
        const areaGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
        (this.model.refAreas || []).forEach((area, idx) => {
          let ax, ay, aw, ah;
          if (area.dir === 'y') {
            ax = pa.x; aw = pa.w; ay = yScale(area.max); ah = yScale(area.min) - ay;
          } else {
            ay = pa.y; ah = pa.h; ax = xScale(area.min); aw = xScale(area.max) - ax;
          }
          svgEl('rect', { x: ax, y: ay, width: aw, height: ah, fill: area.color }, areaGroup);
          if (area.pattern && area.pattern !== '') {
            createBarPattern(defs, `area-pat-${idx}`, { pattern: area.pattern, patternColor: area.patternColor || 'rgba(100,100,100,1)', patternSolidity: area.patternSolidity || 0.4 });
            svgEl('rect', { x: ax, y: ay, width: aw, height: ah, fill: `url(#area-pat-${idx})` }, areaGroup);
          }
        });

        // Reference lines (behind bars)
        const refLineGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
        (this.model.refLines || []).forEach(line => {
          let attrs;
          if (line.dir === 'h') {
            const ly = yScale(line.value);
            attrs = { x1: pa.x, y1: ly, x2: pa.x + pa.w, y2: ly };
          } else {
            const lx = xScale(line.value);
            attrs = { x1: lx, y1: pa.y, x2: lx, y2: pa.y + pa.h };
          }
          attrs.stroke = line.color;
          attrs['stroke-width'] = line.width;
          const da = dashArray(line.dash, line.width);
          if (da !== 'none') attrs['stroke-dasharray'] = da;
          svgEl('line', attrs, refLineGroup);
        });

        // Histogram bars
        const barGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
        const visibleSeries = [];
        seriesData.forEach((s, si) => { if (s.visible !== false) visibleSeries.push(si); });

        for (let bi = 0; bi < nBins; bi++) {
          visibleSeries.forEach((si) => {
            const s = seriesData[si];
            const bins = binData.bins[si];
            if (!bins || !bins[bi]) return;
            const bin = bins[bi];
            const bx1 = xScale(bin.xMin);
            const bx2 = xScale(bin.xMax);
            let fullW = bx2 - bx1 - this.model.barGap;
            if (fullW < 1) fullW = 1;
            const barW = fullW;
            const barX = bx1 + this.model.barGap / 2;
            const barY = yScale(bin.count);
            let barH = yScale(0) - barY;
            if (barH < 0) barH = 0;

            const borderDash = dashArray(s.borderStyle || 'solid', s.borderWidth || 1);
            const rectAttrs = {
              x: barX, y: barY, width: barW, height: barH,
              fill: s.fillColor, stroke: s.borderColor || 'rgba(0,0,0,0.3)',
              'stroke-width': s.borderWidth || 1,
            };
            if (borderDash !== 'none') rectAttrs['stroke-dasharray'] = borderDash;
            svgEl('rect', rectAttrs, barGroup);

            if (s.pattern && s.pattern !== '') {
              svgEl('rect', {
                x: barX, y: barY, width: barW, height: barH,
                fill: `url(#bar-pat-${si})`, stroke: 'none', 'pointer-events': 'none',
              }, barGroup);
            }
          });

          // Single hit-area per bin covering the tallest bar
          let maxBinCount = 0;
          let binXMin = 0, binXMax = 0;
          visibleSeries.forEach((si) => {
            const bins = binData.bins[si];
            if (bins && bins[bi]) {
              if (bins[bi].count > maxBinCount) maxBinCount = bins[bi].count;
              binXMin = bins[bi].xMin;
              binXMax = bins[bi].xMax;
            }
          });
          if (maxBinCount > 0) {
            const hx1 = xScale(binXMin) + this.model.barGap / 2;
            const hx2 = xScale(binXMax) - this.model.barGap / 2;
            svgEl('rect', {
              x: hx1, y: yScale(maxBinCount), width: Math.max(1, hx2 - hx1), height: yScale(0) - yScale(maxBinCount),
              fill: 'transparent', 'data-bar': 'true', 'data-bi': bi, style: 'cursor:pointer',
            }, barGroup);
          }
        }

        // Normal distribution curves
        const curveGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
        visibleSeries.forEach(si => {
          const s = seriesData[si];
          if (!s.showNormalCurve || s.values.length < 3) return;
          const mean = s.values.reduce((a, b) => a + b, 0) / s.values.length;
          const variance = s.values.reduce((a, b) => a + (b - mean) ** 2, 0) / (s.values.length - 1);
          const std = Math.sqrt(variance);
          if (std === 0) return;
          const n = s.values.length;
          const bwLocal = binData.binWidth;
          const scale = n * bwLocal;
          const SQRT2PI = Math.sqrt(2 * Math.PI);
          const pdf = (x) => (1 / (std * SQRT2PI)) * Math.exp(-0.5 * ((x - mean) / std) ** 2) * scale;
          const steps = 120;
          const xMin = xTick.min, xMax = xTick.max;
          const dx = (xMax - xMin) / steps;
          const pts = [];
          for (let j = 0; j <= steps; j++) {
            const x = xMin + j * dx;
            pts.push(`${xScale(x)},${yScale(pdf(x))}`);
          }
          svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: s.borderColor, 'stroke-width': 2 }, curveGroup);
        });

        // Pareto line
        if (hasPareto && nBins > 0) {
          const si0 = visibleSeries[0];
          const bins0 = binData.bins[si0];
          let totalCount = 0;
          bins0.forEach(b => { totalCount += b.count; });
          if (totalCount > 0) {
            const paretoColor = 'rgba(192,57,43,1)';
            const paretoScale = linearScale(0, 100, pa.y + pa.h, pa.y);
            [0, 25, 50, 75, 100].forEach(v => {
              const y = paretoScale(v);
              svgEl('line', { x1: pa.x + pa.w, y1: y, x2: pa.x + pa.w + 5, y2: y, stroke: subColor, 'stroke-width': 1 }, svg);
              svgText(`${v}%`, { x: pa.x + pa.w + 10, y: y + 4, 'text-anchor': 'start', 'font-size': '11px', fill: paretoColor, 'class': 'tick-label' }, svg);
            });
            let cumPct = 0;
            const pts = [];
            for (let pi = 0; pi < bins0.length; pi++) {
              cumPct += (bins0[pi].count / totalCount) * 100;
              const cx = xScale((bins0[pi].xMin + bins0[pi].xMax) / 2);
              const cy = paretoScale(cumPct);
              pts.push(`${cx},${cy}`);
            }
            svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: paretoColor, 'stroke-width': 2 }, svgEl('g', { 'clip-path': `url(#${clipId})` }, svg));
            cumPct = 0;
            const markerGroup = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);
            for (let mi = 0; mi < bins0.length; mi++) {
              cumPct += (bins0[mi].count / totalCount) * 100;
              svgEl('circle', {
                cx: xScale((bins0[mi].xMin + bins0[mi].xMax) / 2), cy: paretoScale(cumPct),
                r: 2.5, fill: paretoColor, stroke: resolveColor('var(--color-bg-primary)'), 'stroke-width': 1.5,
              }, markerGroup);
            }
            const rLabelX = pa.x + pa.w + 42;
            svgText(t('paretoCumLabel'), {
              x: rLabelX, y: pa.y + pa.h / 2, 'text-anchor': 'middle', 'font-size': '11px', 'font-weight': '600', fill: paretoColor,
              transform: `rotate(90, ${rLabelX}, ${pa.y + pa.h / 2})`,
            }, svg);
          }
        }

        // Axes frame
        svgEl('rect', { x: pa.x, y: pa.y, width: pa.w, height: pa.h, fill: 'none', stroke: frameColor, 'stroke-width': 1 }, svg);

        if (cc.showXTicks) {
          xTick.ticks.forEach(v => {
            const x = xScale(v);
            svgEl('line', { x1: x, y1: pa.y + pa.h, x2: x, y2: pa.y + pa.h + 5, stroke: subColor, 'stroke-width': 1 }, svg);
            svgText(formatNum(v), { x, y: pa.y + pa.h + 18, 'text-anchor': 'middle', 'font-size': `${cc.tickSize  }px`, fill: subColor, 'class': 'tick-label' }, svg);
          });
        }
        if (cc.showYTicks) {
          yTick.ticks.forEach(v => {
            const y = yScale(v);
            svgEl('line', { x1: pa.x - 5, y1: y, x2: pa.x, y2: y, stroke: subColor, 'stroke-width': 1 }, svg);
            svgText(formatNum(v), { x: pa.x - 10, y: y + 4, 'text-anchor': 'end', 'font-size': `${cc.tickSize  }px`, fill: subColor, 'class': 'tick-label' }, svg);
          });
        }
        if (cc.showXLabel) {
          svgText(t('xLabel'), { x: pa.x + pa.w / 2, y: pa.y + pa.h + 46, 'text-anchor': 'middle', 'font-size': `${cc.labelSize  }px`, 'font-weight': '600', fill: textColor }, svg);
        }
        if (cc.showYLabel) {
          svgText(t('yLabel'), { x: 18, y: pa.y + pa.h / 2, 'text-anchor': 'middle', 'font-size': `${cc.labelSize  }px`, 'font-weight': '600', fill: textColor, transform: `rotate(-90, 18, ${pa.y + pa.h / 2})` }, svg);
        }
        if (cc.showTitle) {
          svgText(chartTitle, { x: pa.x + pa.w / 2, y: 26, 'text-anchor': 'middle', 'font-size': `${cc.titleSize  }px`, 'font-weight': '700', fill: textColor }, svg);
        }

        this._renderBoxplot();
        this._renderStats();
      },

      // ── Boxplot ───────────────────────────────────────────────
      _renderBoxplot() {
        const bpPanel = module._container?.querySelector('[data-ref="boxplot-panel"]');
        const bpSvg = module._container?.querySelector('[data-ref="boxplot-svg"]');
        if (!bpPanel || !bpSvg) return;

        if (!this.model.showBoxplot || !this._seriesData || !this._lastXScale) {
          bpPanel.style.display = 'none';
          bpSvg.replaceChildren();
          const cw = module._container?.querySelector('[data-ref="chart-wrap"]');
          if (cw) cw.classList.remove('histogram__chart-wrap--bp-open');
          return;
        }

        const BOX_H = 22, GAP = 6, PAD_TOP = 6, PAD_BOT = 4;
        const xScale = this._lastXScale;
        const pa = this._lastPa;

        const visibleSeries = [];
        this._seriesData.forEach((s, i) => { if (s.visible !== false) visibleSeries.push({ series: s, index: i }); });

        if (visibleSeries.length === 0) {
          bpPanel.style.display = 'none';
          bpSvg.replaceChildren();
          const cw2 = module._container?.querySelector('[data-ref="chart-wrap"]');
          if (cw2) cw2.classList.remove('histogram__chart-wrap--bp-open');
          return;
        }

        const totalH = PAD_TOP + visibleSeries.length * BOX_H + (visibleSeries.length - 1) * GAP + PAD_BOT;
        bpSvg.setAttribute('viewBox', `0 0 ${pa.totalW} ${totalH}`);
        bpSvg.setAttribute('width', pa.totalW);
        bpSvg.setAttribute('height', totalH);
        bpSvg.replaceChildren();
        bpPanel.style.display = '';
        const cwEl = module._container?.querySelector('[data-ref="chart-wrap"]');
        if (cwEl) cwEl.classList.add('histogram__chart-wrap--bp-open');

        this._boxplotHitAreas = [];

        visibleSeries.forEach((item, vi) => {
          const s = item.series;
          const stats = computeBoxStats(s.values);
          if (!stats) return;
          const cy = PAD_TOP + vi * (BOX_H + GAP) + BOX_H / 2;
          const boxTop = cy - BOX_H / 2 + 2;
          const boxBot = cy + BOX_H / 2 - 2;
          const boxH = boxBot - boxTop;

          const xQ1 = xScale(stats.q1), xQ3 = xScale(stats.q3), xMed = xScale(stats.median);
          const xMean = xScale(stats.mean), xWLo = xScale(stats.whiskerLo), xWHi = xScale(stats.whiskerHi);

          const fillC = parseRGBA(s.fillColor);
          fillC.a = 0.35;
          const fillColor = rgbaStr(fillC);
          const strokeColor = s.borderColor || s.fillColor;

          svgEl('line', { x1: xWLo, y1: cy, x2: xWHi, y2: cy, stroke: strokeColor, 'stroke-width': 1.2 }, bpSvg);
          svgEl('line', { x1: xWLo, y1: boxTop + 3, x2: xWLo, y2: boxBot - 3, stroke: strokeColor, 'stroke-width': 1.2 }, bpSvg);
          svgEl('line', { x1: xWHi, y1: boxTop + 3, x2: xWHi, y2: boxBot - 3, stroke: strokeColor, 'stroke-width': 1.2 }, bpSvg);
          svgEl('rect', { x: xQ1, y: boxTop, width: Math.max(xQ3 - xQ1, 1), height: boxH, fill: fillColor, stroke: strokeColor, 'stroke-width': 1.2, rx: 1 }, bpSvg);
          svgEl('line', { x1: xMed, y1: boxTop, x2: xMed, y2: boxBot, stroke: strokeColor, 'stroke-width': 2 }, bpSvg);
          const ds = 4;
          svgEl('path', { d: `M${xMean},${cy - ds}L${xMean + ds},${cy}L${xMean},${cy + ds}L${xMean - ds},${cy}Z`, fill: strokeColor, stroke: resolveColor('var(--color-bg-primary)'), 'stroke-width': 0.8 }, bpSvg);
          stats.outliers.forEach(ov => {
            svgEl('circle', { cx: xScale(ov), cy, r: 2.5, fill: 'none', stroke: strokeColor, 'stroke-width': 1.2 }, bpSvg);
          });
          this._boxplotHitAreas.push({ top: boxTop - 2, bottom: boxBot + 2, stats, series: s });
        });
      },

      // ── Statistics table ──────────────────────────────────────
      _renderStats() {
        const panel = module._container?.querySelector('[data-ref="stats-panel"]');
        if (!panel) return;
        if (!this.model.showStats || !this._seriesData) {
          panel.style.display = 'none';
          panel.replaceChildren();
          return;
        }
        const series = this._seriesData.map(s => ({ name: s.name, values: s.values, color: s.fillColor, visible: s.visible }));
        const seriesStats = computeSeriesStats(series, this.model.confLevel / 100);
        renderStatsTable(panel, seriesStats, {
          i18n: module._context.i18n, confLevel: this.model.confLevel, cssPrefix: 'dmike',
        });
      },

      // ── Chart interactions (tooltips) ─────────────────────────
      _setupChartInteractions() {
        const wrap = module._container?.querySelector('[data-ref="chart-wrap"]');
        const tooltip = module._container?.querySelector('[data-ref="tooltip"]');
        const bpPanel = module._container?.querySelector('[data-ref="boxplot-panel"]');
        const bpTooltip = module._container?.querySelector('[data-ref="boxplot-tooltip"]');
        if (!wrap || !tooltip) return;

        wrap.addEventListener('mousemove', (e) => {
          const rect = wrap.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const target = e.target;
          if (target.hasAttribute && target.hasAttribute('data-bar')) {
            const bi = Number(target.getAttribute('data-bi'));
            const seriesData = this._seriesData;
            const binDataLocal = this._curBinData;
            if (!seriesData || !binDataLocal) { this.tip = { ...this.tip, visible: false }; return; }

            const lines = [];
            let rangeText = '';
            for (const s of seriesData) {
              if (s.visible === false) continue;
              const si = seriesData.indexOf(s);
              const bins = binDataLocal.bins[si];
              if (bins && bins[bi]) {
                rangeText = `${t('tooltipRange')}: ${formatNum(bins[bi].xMin, 2)} – ${formatNum(bins[bi].xMax, 2)}`;
                break;
              }
            }
            if (rangeText) lines.push({ text: rangeText });
            seriesData.forEach((s, si) => {
              if (s.visible === false) return;
              const bins = binDataLocal.bins[si];
              const bin = bins ? bins[bi] : null;
              if (!bin) return;
              let totalN = 0;
              bins.forEach(b => { totalN += b.count; });
              const pct = totalN > 0 ? (bin.count / totalN * 100).toFixed(1) : '0.0';
              lines.push({ name: s.name, nameColor: s.fillColor, text: `: ${bin.count} (${pct}%)` });
            });
            let visCount = 0;
            seriesData.forEach(sd => { if (sd.visible !== false) visCount++; });
            if (this.model.showPareto && visCount === 1 && binDataLocal) {
              const si0 = seriesData.findIndex(sd => sd.visible !== false);
              if (si0 >= 0) {
                const bins0 = binDataLocal.bins[si0];
                let total = 0;
                bins0.forEach(b => { total += b.count; });
                if (total > 0) {
                  let cumCount = 0;
                  for (let ci = 0; ci <= bi; ci++) cumCount += bins0[ci].count;
                  lines.push({ text: `${t('tooltipCum')}: ${(cumCount / total * 100).toFixed(1)}%`, color: 'rgba(192,57,43,1)' });
                }
              }
            }
            this.tip = { visible: true, left: mx + 12, top: my - 10, lines };
          } else {
            this.tip = { ...this.tip, visible: false };
          }
        });
        wrap.addEventListener('mouseleave', () => { this.tip = { ...this.tip, visible: false }; });

        const chartMain = module._container?.querySelector('.histogram__chart-main');
        if (bpPanel && bpTooltip && chartMain) {
          bpPanel.addEventListener('mousemove', (e) => {
            if (!this._boxplotHitAreas || !this._boxplotHitAreas.length) return;
            const mainRect = chartMain.getBoundingClientRect();
            const mx = e.clientX - mainRect.left;
            const my = e.clientY - mainRect.top;
            const bpRect = bpPanel.getBoundingClientRect();
            const localY = e.clientY - bpRect.top;
            let hit = null;
            for (const area of this._boxplotHitAreas) {
              if (localY >= area.top && localY <= area.bottom) { hit = area; break; }
            }
            if (hit) {
              const st = hit.stats;
              const lines = [
                { name: hit.series.name, nameColor: hit.series.fillColor },
                { text: `Min: ${formatNum(st.min, 3)}` },
                { text: `Q1: ${formatNum(st.q1, 3)}` },
                { text: `${t('statMedian')}: ${formatNum(st.median, 3)}` },
                { text: `Q3: ${formatNum(st.q3, 3)}` },
                { text: `Max: ${formatNum(st.max, 3)}` },
                { text: `${t('statMean')}: ${formatNum(st.mean, 3)}` },
              ];
              if (st.outliers.length > 0) {
                lines.push({ text: `${t('tooltipOutliers')}: ${st.outliers.length}`, dim: true });
              }
              this.bpTip = { visible: true, left: mx + 12, top: my - 10, lines };
            } else {
              this.bpTip = { ...this.bpTip, visible: false };
            }
          });
          bpPanel.addEventListener('mouseleave', () => { this.bpTip = { ...this.bpTip, visible: false }; });
        }
      },

      // ── Editor panel (shared chart-editor builders) ───────────
      _buildEditor() {
        const inner = module._container?.querySelector('[data-ref="editor-inner"]');
        if (!inner || !this._seriesData) return;
        inner.replaceChildren();
        const te = (k) => module._context.i18n.t(`chart.editor.${k}`);
        const cc = this.model.chartConfig;
        const rerender = () => { this._renderChart(); this._syncOverrides(); };
        const rebuild = () => { this._buildEditor(); rerender(); };

        const s0 = edSection(t('edDisplay'));
        s0.appendChild(edCheckboxRow(t('showPareto'), this.model.showPareto, (v) => { this.model.showPareto = v; rerender(); }));
        s0.appendChild(edCheckboxRow(t('showBoxplot'), this.model.showBoxplot, (v) => { this.model.showBoxplot = v; rerender(); }));
        s0.appendChild(edCheckboxRow(t('showStats'), this.model.showStats, (v) => { this.model.showStats = v; rerender(); }));
        inner.appendChild(s0);

        inner.appendChild(edTitleSection(cc, rerender, te));
        inner.appendChild(edFontSizeSection(cc, rerender, te));
        inner.appendChild(edAxisLabelSection(cc, rerender, te));
        inner.appendChild(edAxisTickSection(cc, rerender, te));

        const s1 = edSection(t('edSeries'));
        this._seriesData.forEach((ser, i) => s1.appendChild(this._edSeriesItem(ser, i)));
        inner.appendChild(s1);

        const cpOpen = (e, color, cb) => { this._closeColorPicker(); const p = openColorPicker(e, color, cb); this._activeColorPicker = p; };

        inner.appendChild(edBgColorSection(cc, (patch) => {
          if (patch.bgColor !== undefined) cc.bgColor = patch.bgColor;
          this._renderChart();
          this._syncOverrides();
        }, cpOpen, te));

        inner.appendChild(edRefLinesSection(this.model.refLines, { onUpdate: rebuild, onOpenColorPicker: cpOpen }, te));
        inner.appendChild(edRefAreasSection(this.model.refAreas, { onUpdate: rebuild, onOpenColorPicker: cpOpen }, te));
      },

      _edSeriesItem(ser, _idx) {
        const i18n = module._context.i18n;
        const item = document.createElement('div');
        item.className = `dmike-chart-ed-series-item${ser.visible === false ? ' hidden' : ''}`;

        const header = document.createElement('div');
        header.className = 'dmike-chart-ed-series-header';

        const swatch = edColorSwatch(ser.fillColor, (e) => {
          this._closeColorPicker();
          const p = openColorPicker(e, ser.fillColor, (c) => { ser.fillColor = c; swatch.style.background = c; this._renderChart(); this._syncOverrides(); });
          this._activeColorPicker = p;
        });

        const nameInp = document.createElement('input');
        nameInp.value = ser.name;
        nameInp.addEventListener('change', () => { ser.name = nameInp.value; this._renderChart(); this._syncOverrides(); });

        const eyeBtn = edVisToggle(ser.visible !== false, () => {
          ser.visible = ser.visible === false;
          this._buildEditor(); this._renderChart(); this._syncOverrides();
        });

        header.appendChild(swatch);
        header.appendChild(nameInp);
        header.appendChild(eyeBtn);
        item.appendChild(header);

        const detail = document.createElement('div');
        detail.className = 'dmike-chart-ed-series-detail';

        detail.appendChild(edCheckboxRow(i18n.t('modules.histogram.edNormalCurve'), ser.showNormalCurve !== false, (v) => {
          ser.showNormalCurve = v; this._renderChart(); this._syncOverrides();
        }));

        detail.appendChild(edSelectRow(i18n.t('modules.histogram.edPattern'), [
          { value: '', label: '—' }, { value: '/', label: '/' }, { value: '\\', label: '\\' },
          { value: 'x', label: '×' }, { value: '-', label: '—' }, { value: '|', label: '|' },
          { value: '+', label: '+' }, { value: '.', label: '·' },
        ], ser.pattern || '', (v) => { ser.pattern = v; this._renderChart(); this._syncOverrides(); }));

        detail.appendChild(edSelectRow(i18n.t('modules.histogram.edBorderStyle'), [
          { value: 'solid', label: 'Solid' }, { value: 'dash', label: 'Dash' },
          { value: 'dot', label: 'Dot' }, { value: 'none', label: 'None' },
        ], ser.borderStyle || 'solid', (v) => { ser.borderStyle = v; this._renderChart(); this._syncOverrides(); }));

        const { el: bcRow, swatch: bcSwatch } = edColorPair(
          i18n.t('modules.histogram.edBorderColor'), ser.borderColor,
          (e) => {
            this._closeColorPicker();
            const p = openColorPicker(e, ser.borderColor, (c) => { ser.borderColor = c; bcSwatch.style.background = c; this._renderChart(); this._syncOverrides(); });
            this._activeColorPicker = p;
          },
        );
        detail.appendChild(bcRow);

        item.appendChild(detail);
        item.appendChild(edExpandBtn('Details', detail));
        return item;
      },

      _closeColorPicker() {
        if (this._activeColorPicker) { this._activeColorPicker.close(); this._activeColorPicker = null; }
      },

      // ── Lifecycle ─────────────────────────────────────────────
      init() {
        // Sync the input mirrors from the (possibly restored) model.
        this.binWidthInput = this.model.binWidth != null ? String(this.model.binWidth) : '';
        this.confLevelInput = String(this.model.confLevel);

        this._createPicker();
        this._createModebar();
        this._bindInteractionEvents();
        this._observeChartResize();

        const eb = module._context.eventBus;

        // Re-render on theme change so SVG colors refresh (legacy parity).
        const onTheme = () => { if (this._seriesData) this._renderChart(); };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Re-plot from current column refs when the worksheet data changes.
        // The DatasetPicker only refreshes its own option list and never
        // re-fires onChange, so the module must re-read values itself.
        const onData = () => this._autoPlot();
        eb.on('worksheet:dataChanged', onData);
        eb.on('state:saved', onData);
        this._unsubs.push(() => eb.off('worksheet:dataChanged', onData));
        this._unsubs.push(() => eb.off('state:saved', onData));

        // Auto-plot saved datasets.
        if (this.model.datasets.some(d => d.valueRef)) {
          requestAnimationFrame(() => this._autoPlot());
        }
      },

      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        if (this._picker) { this._picker.destroy(); this._picker = null; }
        this._closeColorPicker();
        if (this._modebar) { this._modebar.destroy(); this._modebar = null; }
        if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
        if (this._resizeDebounced) { this._resizeDebounced.cancel(); this._resizeDebounced = null; }
        this._lastRenderSize = null;
        if (this._globalMoveHandler) window.removeEventListener('mousemove', this._globalMoveHandler);
        if (this._globalUpHandler) window.removeEventListener('mouseup', this._globalUpHandler);
      },
    };
  },
});

/**
 * Custom loadExample. Histogram is often a secondary module on examples that
 * store a single `columnRef`/`colRef`/`seriesRefs` (process-capability, outlier-
 * test, distribution-fit, msa) or a CSV-shape dataset. Translate those into the
 * native datasets[] shape and provision a worksheet when needed, then route
 * through setState (which rebuilds the Alpine tree + re-runs init → auto-plot).
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = async function loadExample(payload) {
  if (!payload || !payload.data) return;
  const ctx = this._context;
  const ti = (k) => ctx.i18n.t(k);

  // confirm overwrite if the live model already has content
  const current = this.getState();
  const hasContent = current && Array.isArray(current.datasets) && current.datasets.some(d => d && d.valueRef);
  if (hasContent && ctx?.confirmPopout) {
    const ok = await ctx.confirmPopout(ti('moduleHelp.confirmOverwrite'), { danger: true });
    if (!ok) return;
  }

  let data = { ...payload.data };

  // CSV-shape payload → synthesize sourceWorksheetData + columnRef.
  if (!data.sourceWorksheetData && !data.datasets && !data.columnRef && Array.isArray(data.columns)) {
    const wsState = csvPayloadToWorksheetState(data, payload.meta);
    if (wsState) {
      data = {
        sourceWorksheetData: wsState,
        columnRef: { instanceId: '__source__', sheetId: wsState.activeSheetId, columnId: 'c-0' },
      };
    }
  }

  if (data.sourceWorksheetData) {
    const wsState = data.sourceWorksheetData;
    delete data.sourceWorksheetData;
    if (this._exampleWorksheetId) {
      removeProvisionedWorksheet(ctx, this._exampleWorksheetId);
      this._exampleWorksheetId = null;
    }
    const ref = provisionWorksheet(ctx, wsState);
    if (ref) {
      this._exampleWorksheetId = ref.instanceId;
      const rewrite = (r) => (r && r.instanceId === '__source__') ? { ...r, instanceId: ref.instanceId } : r;
      if (Array.isArray(data.datasets)) {
        data.datasets = data.datasets.map(d => ({ ...d, valueRef: rewrite(d.valueRef), groupRef: rewrite(d.groupRef) }));
      }
      if (data.columnRef) data.columnRef = rewrite(data.columnRef);
      if (data.colRef) data.colRef = rewrite(data.colRef);
      if (Array.isArray(data.seriesRefs)) data.seriesRefs = data.seriesRefs.map(rewrite);
    }
  }

  // Foreign-state translation: single columnRef/colRef/first seriesRef → one dataset.
  if (!Array.isArray(data.datasets)) {
    const singleRef = data.columnRef || data.colRef
      || (Array.isArray(data.seriesRefs) ? data.seriesRefs[0] : null)
      || (Array.isArray(data.colRefsK) ? data.colRefsK[0] : null);
    if (singleRef) data.datasets = [{ valueRef: singleRef, groupRef: null }];
  }

  this.setState(data);
  ctx.stateManager.setModuleState(ctx.instanceId, this.getState());

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  ctx.notify?.(ti('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
};

export default mod;
