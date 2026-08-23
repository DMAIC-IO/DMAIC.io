/**
 * D.Mike — Response Optimization Module (response-optimization.js)
 *
 * Improve phase. Reads stored regression models from `state.models[]`, lets the
 * user pick one or more and assign Derringer-Suich desirability functions
 * (max / min / target), then maximises the composite desirability D over the
 * factor box via multi-start Nelder-Mead (see response-optimization-engine.js).
 *
 * Migrated to createModule + Alpine CSP. Business logic lives in State model;
 * view transforms in data-Fn; template in response-optimization.html.
 */

import { createModule } from '../../core/template-module.js';
import { listModels, getModel } from '../../core/models-store.js';
import {
  optimizeResponses, buildResponseSurface,
} from '../../engines/response-optimization-engine.js';
import { State } from './response-optimization-model.js';

/** Tick formatter for SVG axis labels. */
function tickFmt(v) {
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}

/** Color for a normalized value t in [0,1]: hue 220 (cool blue) → 10 (warm red). */
function colorOf(t) {
  const hue = 220 - t * 210;
  return `hsl(${  hue.toFixed(0)  }, 70%, 55%)`;
}

/**
 * Build the full SVG data structure for the contour heatmap.
 * Returns an object with arrays of cell/tick/legend objects suitable for x-for.
 * Called from data-Fn computed getter; result cached in this.contourSVG.
 *
 * @param {object} surface - from buildResponseSurface()
 * @param {object} opts - { xLabel, yLabel, xOptVal, yOptVal }
 * @returns {object}
 */
function buildContourSVGData(surface, opts) {
  const W = 480, H = 360;
  const margin = { top: 16, right: 80, bottom: 36, left: 56 };
  const plotW = W - margin.left - margin.right;
  const plotH = H - margin.top - margin.bottom;

  const N = surface.grid.length;
  const cellW = plotW / N;
  const cellH = plotH / N;

  let yMin = Infinity, yMax = -Infinity;
  for (const row of surface.grid) {
    for (const v of row) {
      if (Number.isFinite(v)) {
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
  }
  if (yMin === yMax) { yMin -= 0.5; yMax += 0.5; }

  // Grid cells
  const cells = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const value = surface.grid[i][j];
      const x = margin.left + j * cellW;
      const y = margin.top + (N - 1 - i) * cellH;
      const t = Number.isFinite(value)
        ? Math.min(1, Math.max(0, (value - yMin) / (yMax - yMin)))
        : null;
      const fill = t !== null ? colorOf(t) : 'var(--color-bg-secondary, #eee)';
      cells.push({ k: `${i  }_${  j}`, x: x.toFixed(2), y: y.toFixed(2), w: cellW.toFixed(2), h: cellH.toFixed(2), fill });
    }
  }

  // X axis ticks
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((tf, idx) => {
    const v = surface.xRange[0] + tf * (surface.xRange[1] - surface.xRange[0]);
    const x = margin.left + tf * plotW;
    return { k: `xt${  idx}`, x, y: margin.top + plotH + 14, label: tickFmt(v) };
  });

  // Y axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((tf, idx) => {
    const v = surface.yRange[0] + tf * (surface.yRange[1] - surface.yRange[0]);
    const y = margin.top + plotH - tf * plotH;
    return { k: `yt${  idx}`, x: margin.left - 6, y: y + 3, label: tickFmt(v) };
  });

  // Color bar legend
  const legendX = margin.left + plotW + 16;
  const legendW = 14;
  const segH = plotH / 32;
  const legendSegs = Array.from({ length: 32 }, (_, k) => {
    const tf = k / 31;
    const v = yMin + (1 - tf) * (yMax - yMin);
    const t = Math.min(1, Math.max(0, (v - yMin) / (yMax - yMin)));
    const y = margin.top + tf * plotH;
    return { k: `ls${  k}`, x: legendX, y, w: legendW, h: segH.toFixed(2), fill: colorOf(t) };
  });

  // Legend tick labels
  const legendTicks = [0, 0.5, 1].map((tf, idx) => {
    const v = yMax - tf * (yMax - yMin);
    const y = margin.top + tf * plotH + 3;
    return { k: `lt${  idx}`, x: legendX + legendW + 4, y, label: tickFmt(v) };
  });

  // Optimum marker
  let marker = null;
  if (Number.isFinite(opts.xOptVal) && Number.isFinite(opts.yOptVal)) {
    const tx = (opts.xOptVal - surface.xRange[0]) / (surface.xRange[1] - surface.xRange[0]);
    const ty = (opts.yOptVal - surface.yRange[0]) / (surface.yRange[1] - surface.yRange[0]);
    if (tx >= 0 && tx <= 1 && ty >= 0 && ty <= 1) {
      const cx = margin.left + tx * plotW;
      const cy = margin.top + plotH - ty * plotH;
      marker = { cx: cx.toFixed(2), cy: cy.toFixed(2) };
    }
  }

  return {
    viewBox: `0 0 ${  W  } ${  H}`,
    style: `width:100%;max-width:${  W  }px;height:auto;`,
    border: { x: margin.left, y: margin.top, w: plotW, h: plotH },
    cells,
    xTicks,
    yTicks,
    legendSegs,
    legendTicks,
    marker,
    xLabel: { x: margin.left + plotW / 2, y: H - 4, text: opts.xLabel ?? 'X' },
    yLabel: {
      x: 14,
      y: margin.top + plotH / 2,
      transform: `rotate(-90, 14, ${  margin.top + plotH / 2  })`,
      text: opts.yLabel ?? 'Y',
    },
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Create an SVG-namespaced element with the given attributes. */
function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const k in attrs) {
    if (attrs[k] != null) el.setAttribute(k, String(attrs[k]));
  }
  return el;
}

/**
 * Build a real, SVG-namespaced <svg> element for the contour heatmap from the
 * data produced by buildContourSVGData(). Built imperatively (createElementNS)
 * because Alpine's `x-for` clones <template> content in the HTML namespace,
 * which yields non-rendering <rect>/<text> nodes inside an inline <svg>.
 *
 * @param {object} d - the object returned by buildContourSVGData()
 * @returns {SVGSVGElement}
 */
function buildContourSVGElement(d) {
  const svg = svgEl('svg', { viewBox: d.viewBox, xmlns: SVG_NS });
  svg.setAttribute('style', d.style);

  // Grid cells (heatmap)
  for (const cell of d.cells) {
    svg.appendChild(svgEl('rect', {
      x: cell.x, y: cell.y, width: cell.w, height: cell.h,
      fill: cell.fill, 'shape-rendering': 'crispEdges',
    }));
  }

  // Plot border
  svg.appendChild(svgEl('rect', {
    x: d.border.x, y: d.border.y, width: d.border.w, height: d.border.h,
    fill: 'none', stroke: 'currentColor', 'stroke-width': '0.5', opacity: '0.5',
  }));

  // X axis ticks
  for (const tick of d.xTicks) {
    const t = svgEl('text', {
      x: tick.x, y: tick.y, 'text-anchor': 'middle',
      'font-size': '10', fill: 'currentColor',
    });
    t.textContent = tick.label;
    svg.appendChild(t);
  }

  // Y axis ticks
  for (const tick of d.yTicks) {
    const t = svgEl('text', {
      x: tick.x, y: tick.y, 'text-anchor': 'end',
      'font-size': '10', fill: 'currentColor',
    });
    t.textContent = tick.label;
    svg.appendChild(t);
  }

  // Color bar legend
  for (const seg of d.legendSegs) {
    svg.appendChild(svgEl('rect', {
      x: seg.x, y: seg.y, width: seg.w, height: seg.h,
      fill: seg.fill, 'shape-rendering': 'crispEdges',
    }));
  }

  // Legend tick labels
  for (const tick of d.legendTicks) {
    const t = svgEl('text', {
      x: tick.x, y: tick.y, 'font-size': '10', fill: 'currentColor',
    });
    t.textContent = tick.label;
    svg.appendChild(t);
  }

  // Optimum marker (circle)
  if (d.marker !== null) {
    svg.appendChild(svgEl('circle', {
      cx: d.marker.cx, cy: d.marker.cy, r: '5',
      fill: 'white', stroke: 'black', 'stroke-width': '1.5',
    }));
  }

  // Axis labels
  const xl = svgEl('text', {
    x: d.xLabel.x, y: d.xLabel.y, 'text-anchor': 'middle',
    'font-size': '11', fill: 'currentColor',
  });
  xl.textContent = d.xLabel.text;
  svg.appendChild(xl);

  const yl = svgEl('text', {
    x: d.yLabel.x, y: d.yLabel.y, transform: d.yLabel.transform,
    'text-anchor': 'middle', 'font-size': '11', fill: 'currentColor',
  });
  yl.textContent = d.yLabel.text;
  svg.appendChild(yl);

  return svg;
}

export default createModule({
  config: {
    id: 'response-optimization',
    engine: 'alpine',
    phase: 'improve',
    icon: 'module.response-optimization',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    /** Event bus unsubscribe functions. */
    const _unsubs = [];

    return {
      // ── Transient UI state (not persisted) ────────────────────
      /** Live list of models from models-store (refreshed on state:saved). */
      modelList: [],
      /** Computed diagnostic reasons for blocking optimisation. */
      diagnosticReasons: [],
      /** Whether the optimise button may be clicked. */
      canOptimize: false,
      /** The current optimisation result object (from state.optimizations[optId]). */
      currentOpt: null,
      /** Transient axis selection for contour plot. */
      contourXId: null,
      contourYId: null,
      /** Transient categorical fixing: { [predictorId]: string } */
      contourFixings: {},
      /** Computed SVG data for contour plot (null when not shown). */
      contourData: null,
      contourSVG: null,
      /** Render generation counter — invalidates stale rAF mount polls. */
      _renderGen: 0,

      // ── Alpine lifecycle ───────────────────────────────────────

      init() {
        // Initial refresh: reconcile specs first so entries exist for toggleModel
        const models = listModels(module._context.stateManager);
        this.model.reconcileSpecs(models);
        this.modelList = models;
        this._refreshDiagnostic();
        this._refreshResult();

        // Subscribe to state:saved so we pick up new / updated models.
        const onState = () => {
          this._reconcileAndRefresh();
        };
        module._context.eventBus.on('state:saved', onState);
        _unsubs.push(() => module._context.eventBus.off('state:saved', onState));
      },

      destroy() {
        for (const u of _unsubs) u();
        _unsubs.length = 0;
      },

      // ── Internal refresh helpers ───────────────────────────────

      _refreshModels() {
        const models = listModels(module._context.stateManager);
        this.model.reconcileSpecs(models);
        this.modelList = models;
        this._refreshDiagnostic();
      },

      _reconcileAndRefresh() {
        const models = listModels(module._context.stateManager);
        this.model.reconcileSpecs(models);
        this.modelList = models;
        this._refreshDiagnostic();
        this._refreshResult();
      },

      _refreshDiagnostic() {
        const selectedIds = this.model.selectedIds;
        const rawReasons = this.model.diagnose(
          selectedIds,
          this.modelList,
        );
        this.diagnosticReasons = rawReasons.map(r => {
          let text;
          if (r.type === 'lowR2') {
            text = _t('lowR2', { name: r.name, value: r.value.toFixed(3) });
          } else if (r.type === 'lackOfFit') {
            text = _t('lackOfFit', { name: r.name, value: r.value.toFixed(3) });
          } else if (r.type === 'factorMismatch') {
            text = _t('factorMismatch', { name: r.name });
          } else {
            text = r.type;
          }
          return { key: `${r.type  }_${  r.name}`, text };
        });
        this.canOptimize = selectedIds.length > 0 && rawReasons.length === 0;
      },

      _refreshResult() {
        const optId = this.model.optId;
        if (!optId) {
          this.currentOpt = null;
          this.contourData = null;
          this.contourSVG = null;
          return;
        }
        const all = module._context.stateManager.get('optimizations') ?? {};
        const opt = all[optId] ?? null;
        this.currentOpt = opt?.result ? opt : null;
        if (this.currentOpt) {
          this._refreshContour();
        } else {
          this.contourData = null;
          this.contourSVG = null;
        }
      },

      _refreshContour() {
        this._computeContour();
        // The contour host lives inside a nested x-if; mount imperatively.
        this._scheduleContourMount();
      },

      /**
       * Mount (or clear) the contour SVG into its [data-ref] anchor. The anchor
       * lives inside nested x-if/x-template, so it may not exist on the first
       * flush — poll a bounded number of animation frames, aborting if a newer
       * render started (alpine.md §6).
       */
      _scheduleContourMount() {
        const gen = ++this._renderGen;
        if (!this.contourSVG) { this._mountContour(gen); return; }
        let frames = 0;
        const tick = () => {
          if (gen !== this._renderGen) return; // superseded by a newer render
          const host = module._container?.querySelector('[data-ref="contour-host"]');
          if (host) { this._mountContour(gen, host); return; }
          if (frames++ < 30) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },

      _mountContour(gen, host) {
        if (gen !== this._renderGen) return;
        const anchor = host ?? module._container?.querySelector('[data-ref="contour-host"]');
        if (!anchor) return;
        anchor.replaceChildren();
        if (this.contourSVG) {
          anchor.appendChild(buildContourSVGElement(this.contourSVG));
        }
      },

      _computeContour() {
        const opt = this.currentOpt;
        if (!opt) { this.contourData = null; this.contourSVG = null; return; }

        const modelId = (opt.modelRefs ?? [])[0];
        const storedModel = modelId ? getModel(module._context.stateManager, modelId) : null;
        if (!storedModel?.spec) { this.contourData = null; this.contourSVG = null; return; }

        const continuous  = storedModel.spec.predictors.filter(p => p.kind === 'continuous');
        const categorical = storedModel.spec.predictors.filter(p => p.kind === 'categorical');
        if (continuous.length < 2) { this.contourData = null; this.contourSVG = null; return; }

        // Determine axis IDs
        const xId = this.contourXId ?? continuous[0].id;
        const yId = this.contourYId ?? continuous[1].id;
        if (this.contourXId === null) this.contourXId = xId;
        if (this.contourYId === null) this.contourYId = yId;

        // Build categorical fixings
        const fixings = {};
        for (const p of categorical) {
          const fromUI = this.contourFixings[p.id];
          if (fromUI != null) {
            fixings[p.id] = fromUI;
          } else {
            const idxInOpt = storedModel.spec.predictors.findIndex(q => q.id === p.id);
            const optVal = opt.result?.xOpt?.[idxInOpt];
            fixings[p.id] = (typeof optVal === 'string') ? optVal : (p.reference ?? p.levels?.[0]);
          }
        }

        // Build response surface
        let surface;
        try {
          surface = buildResponseSurface(storedModel, { xId, yId, fixings, gridSize: 28 });
        } catch (_e) {
          this.contourData = null;
          this.contourSVG = null;
          return;
        }

        // Optimum marker: show if categorical fixings match
        const optMatches = categorical.every(p => {
          const idx = storedModel.spec.predictors.findIndex(q => q.id === p.id);
          return opt.result?.xOpt?.[idx] === fixings[p.id];
        });
        const xOptIdx = storedModel.spec.predictors.findIndex(q => q.id === xId);
        const yOptIdx = storedModel.spec.predictors.findIndex(q => q.id === yId);
        const xOptVal = optMatches && typeof opt.result?.xOpt?.[xOptIdx] === 'number' ? opt.result.xOpt[xOptIdx] : null;
        const yOptVal = optMatches && typeof opt.result?.xOpt?.[yOptIdx] === 'number' ? opt.result.xOpt[yOptIdx] : null;

        // Build categorical fixing data for template
        const categoricalFixings = categorical.map(p => ({
          id: p.id,
          value: fixings[p.id],
          levels: p.levels || [],
        }));

        this.contourData = {
          continuousFactors: continuous,
          categoricalFixings,
          showAxisControls: continuous.length > 2,
        };

        this.contourSVG = buildContourSVGData(surface, {
          xLabel: xId,
          yLabel: yId,
          xOptVal,
          yOptVal,
        });
      },

      // ── View transforms ───────────────────────────────────────

      /** Whether a given model ID is selected. Used in template for x-show and :checked. */
      isSelected(modelId) {
        return Boolean(this.model.specs[modelId]?.selected);
      },

      /** Whether the spec for a model has a given kind. Used for :selected on option. */
      isKind(modelId, kind) {
        return this.model.specs[modelId]?.kind === kind;
      },

      /** Get a numeric spec value for a model. Used for :value on number inputs. */
      specVal(modelId, key) {
        const entry = this.model.specs[modelId];
        return entry != null ? entry[key] : '';
      },

      /** CSS class for R² badge. */
      r2Class(m) {
        const v = m.rSqAdj ?? 0;
        if (v >= 0.8) return 'ro__r2 ro__r2--good';
        if (v >= 0.5) return 'ro__r2 ro__r2--warn';
        return 'ro__r2 ro__r2--bad';
      },

      /** Formatted R² text. */
      r2Text(m) {
        const v = m.rSqAdj;
        return `R²adj ${  v != null ? v.toFixed(3) : '—'}`;
      },

      /** Diagnostic "blocked" label. */
      diagnosticBlockedLabel() {
        return `${_t('diagnosticBlocked')  }:`;
      },

      /** CSS class for composite desirability KPI. */
      dClass() {
        const opt = this.currentOpt;
        const D = opt?.result?.D ?? 0;
        if (D >= 0.8) return 'dmike-kpi dmike-kpi--good';
        if (D >= 0.5) return 'dmike-kpi dmike-kpi--warn';
        return 'dmike-kpi dmike-kpi--bad';
      },

      /** Formatted composite desirability value. */
      dValue() {
        const D = this.currentOpt?.result?.D;
        return D != null ? D.toFixed(3) : '';
      },

      /** Build table rows for the optimum factor point table. */
      optimumRows() {
        const opt = this.currentOpt;
        if (!opt?.result) return [];
        const { xOpt, factorNames } = opt.result;
        return (factorNames ?? []).map((n, i) => {
          const v = xOpt[i];
          const value = typeof v === 'number' ? v.toFixed(4) : String(v ?? '');
          return { name: n, value };
        });
      },

      /** Build table rows for the predictions table. */
      predictionRows() {
        const opt = this.currentOpt;
        if (!opt?.result) return [];
        const { yPredictions, dPerResponse, modelNames } = opt.result;
        return (modelNames ?? []).map((n, i) => ({
          model: n,
          prediction: (yPredictions[i] ?? NaN).toFixed(4),
          d: (dPerResponse[i] ?? NaN).toFixed(3),
        }));
      },

      // ── Event handlers ────────────────────────────────────────

      /** Toggle model selection checkbox. */
      toggleModel(modelId, event) {
        const entry = this.model.specs[modelId];
        if (!entry) return;
        entry.selected = event.target.checked;
        this._refreshDiagnostic();
      },

      /** Change desirability goal (max/min/target). Triggers re-render for target field. */
      setSpecKind(modelId, event) {
        const entry = this.model.specs[modelId];
        if (!entry) return;
        entry.kind = event.target.value;
        this._refreshDiagnostic();
      },

      /** Update a numeric spec field (lower/upper/target/weight). */
      setSpecNum(modelId, key, event) {
        const entry = this.model.specs[modelId];
        if (!entry) return;
        const v = parseFloat(event.target.value);
        entry[key] = Number.isFinite(v) ? v : 0;
      },

      /** Set a categorical fixing for the contour plot. */
      setContourFix(predictorId, event) {
        this.contourFixings = { ...this.contourFixings, [predictorId]: event.target.value };
        this._refreshContour();
      },

      /** Set contour X or Y axis. */
      setContourAxis(axis, event) {
        if (axis === 'x') this.contourXId = event.target.value;
        else this.contourYId = event.target.value;
        this._refreshContour();
      },

      /** Run the optimisation engine and persist the result. */
      runOptimize() {
        const sm = module._context.stateManager;
        const selectedIds = this.model.selectedIds;
        const models = selectedIds.map(id => getModel(sm, id)).filter(Boolean);
        if (models.length === 0) return;

        const desirSpecs = models.map(m => {
          const s = this.model.specs[m.id];
          return {
            kind:   s.kind,
            lower:  s.lower,
            upper:  s.upper,
            target: s.target,
            weight: s.weight ?? 1,
          };
        });

        const factorBounds = models[0].factorSpec.map(f => [f.low ?? -1, f.high ?? 1]);
        const factorNames  = models[0].factorSpec.map(f => f.name);

        let result;
        try {
          result = optimizeResponses(models, desirSpecs, factorBounds, { nStarts: 8, seed: 42, maxIter: 400 });
        } catch (e) {
          module._context.notify(e.message, 'error');
          return;
        }

        // Persist result as a project-central optimisation record.
        const id = this.model.optId ?? (typeof crypto !== 'undefined'
          ? crypto.randomUUID()
          : `opt_${  Date.now()}`);
        const all = sm.get('optimizations') ?? {};
        sm.set('optimizations', {
          ...all,
          [id]: {
            id,
            name: _t('defaultName'),
            modelRefs: selectedIds,
            desirability: desirSpecs.map((s, i) => ({ modelId: models[i].id, ...s })),
            factorOverrides: [],
            constraints: factorBounds.map((b, i) => ({ kind: 'box', factor: factorNames[i], low: b[0], high: b[1] })),
            result: {
              xOpt: result.xOpt,
              yPredictions: result.yPredictions,
              dPerResponse: result.dPerResponse,
              D: result.D,
              ciAtOpt: null,
              paretoFront: null,
              factorNames,
              modelNames: models.map(m => m.name),
              iter: result.iter,
            },
            createdAt: this.model.optId ? (all[this.model.optId]?.createdAt ?? new Date().toISOString()) : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });

        this.model.optId = id;

        // Reset transient contour state so it's re-derived from new result.
        this.contourXId = null;
        this.contourYId = null;
        this.contourFixings = {};

        module._context.notify(_t('optimizeSuccess', { D: result.D.toFixed(3) }), 'success');
        this._refreshResult();
        this._refreshDiagnostic();
      },
    };
  },

});

