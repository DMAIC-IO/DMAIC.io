/**
 * D.Mike — Response Optimization Module (response-optimization.js)
 *
 * Improve phase. Reads stored regression models from `state.models[]`, lets the
 * user pick one or more and assign Derringer–Suich desirability functions
 * (max / min / target), then maximises the composite desirability D over the
 * factor box via multi-start Nelder–Mead (see response-optimization-engine.js).
 *
 * V0.4 minimum-viable scope: continuous factors, box constraints derived from
 * each model's factorSpec, no Pareto plot (deferred to a later slice). The
 * optimisation result lives at `state.optimizations[id]`; the module instance
 * only holds that id plus UI selections.
 */

import { listModels, getModel } from '../../core/models-store.js';
import {
  optimizeResponses, buildResponseSurface,
} from '../../engines/response-optimization-engine.js';
import { esc } from '../../core/html-utils.js';

/** Threshold below which we refuse to optimise — prevents recommending an action from a useless model. */
const MIN_R2_ADJ = 0.5;

/** Significance level for the lack-of-fit gate. p < α → model is rejected as
 *  misspecified and the optimise button stays disabled. Models without a
 *  computed lofPValue (no replicates available) are not gated by LoF. */
const LOF_ALPHA = 0.05;

const mod = {
  id: 'response-optimization',
  phase: 'improve',
  icon: 'target',
  i18nKey: 'modules.response-optimization',
  version: '0.1.0',

  _container: null,
  _context: null,
  /** Map: modelId → { selected: boolean, kind: 'max'|'min'|'target', lower, upper, target?, weight } */
  _specs: {},
  /** Persisted optimisation id in state.optimizations. */
  _optId: null,
  _eventUnsubs: [],

  help: () => import('./response-optimization-help.js'),

  // ─── Lifecycle ────────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('response-optimization-css')) {
      const link = document.createElement('link');
      link.id = 'response-optimization-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/response-optimization/response-optimization.css';
      document.head.appendChild(link);
    }

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._specs = saved.specs || {};
      this._optId = saved.optId || null;
    }

    // Re-render whenever the global state changes (new model saved, model
    // updated). Cheap because the module DOM is small.
    const onState = () => {
      if (!this._container) return;
      this._reconcileSpecs();
      this._render();
    };
    context.eventBus.on('state:saved', onState);
    this._eventUnsubs.push(() => context.eventBus.off('state:saved', onState));

    this._reconcileSpecs();
    this._render();
  },

  async destroy() {
    for (const u of this._eventUnsubs) u();
    this._eventUnsubs = [];
    this._container.innerHTML = '';
  },

  onLanguageChange() { this._render(); },
  onThemeChange()    { /* CSS variables drive theme */ },

  getState() {
    return {
      specs: this._specs,
      optId: this._optId,
    };
  },

  setState(data) {
    if (!data) return;
    this._specs = data.specs || {};
    this._optId = data.optId || null;
    if (this._container) {
      this._reconcileSpecs();
      this._render();
    }
  },

  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  // ─── Spec maintenance ─────────────────────────────────────────

  /**
   * Make sure every existing model has a default spec entry, and drop entries
   * for models that no longer exist. Called on init and on every state change.
   */
  _reconcileSpecs() {
    const models = listModels(this._context.stateManager);
    const knownIds = new Set(models.map(m => m.id));
    // Drop orphaned entries.
    for (const id of Object.keys(this._specs)) {
      if (!knownIds.has(id)) delete this._specs[id];
    }
    // Seed missing entries with a sensible default — max with [yMin, yMax]
    // estimated from the snapshot (median ± mad → [snapMin, snapMax]).
    for (const m of models) {
      if (this._specs[m.id]) continue;
      const ys = m.dataSnapshot?.y ?? [];
      const lo = ys.length ? Math.min(...ys) : 0;
      const hi = ys.length ? Math.max(...ys) : 1;
      this._specs[m.id] = {
        selected: false,
        kind: 'max',
        lower: lo,
        upper: hi,
        target: (lo + hi) / 2,
        weight: 1,
      };
    }
  },

  // ─── Render ───────────────────────────────────────────────────

  _render() {
    const t = (k, v) => this._context.i18n.t(`modules.response-optimization.${k}`, v);
    const models = listModels(this._context.stateManager);

    if (models.length === 0) {
      this._container.innerHTML = `
        <div class="ro dmike-split">
          <div class="ro__empty">
            <p>${t('emptyState')}</p>
          </div>
        </div>
      `;
      return;
    }

    const selectedIds = models.filter(m => this._specs[m.id]?.selected).map(m => m.id);
    const blockedReasons = this._diagnose(selectedIds);
    const canOptimize = selectedIds.length > 0 && blockedReasons.length === 0;

    this._container.innerHTML = `
      <div class="ro dmike-split">
        <div class="ro__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionModels')}</div>
          <div class="ro__model-list">
            ${models.map(m => this._renderModelRow(m)).join('')}
          </div>

          ${blockedReasons.length > 0 ? `
            <div class="ro__diagnostic">
              <strong>${t('diagnosticBlocked')}:</strong>
              <ul>${blockedReasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
            </div>
          ` : ''}

          <button class="btn btn--primary ro__optimize-btn"
                  data-action="optimize" type="button"
                  ${canOptimize ? '' : 'disabled'}>
            ${t('optimizeButton')}
          </button>
        </div>

        <div class="ro__output dmike-split__output">
          ${this._renderResult()}
        </div>
      </div>
    `;

    this._bindEvents();
  },

  /** Render one model row in the input list — selection checkbox + spec editor. */
  _renderModelRow(model) {
    const t = (k) => this._context.i18n.t(`modules.response-optimization.${k}`);
    const spec = this._specs[model.id] ?? {};
    const r2Class = (model.rSqAdj ?? 0) >= 0.8 ? 'ro__r2--good'
                  : (model.rSqAdj ?? 0) >= MIN_R2_ADJ ? 'ro__r2--warn'
                  : 'ro__r2--bad';
    const r2Text = model.rSqAdj != null ? model.rSqAdj.toFixed(3) : '—';

    return `
      <div class="ro__model-row" data-model-id="${esc(model.id)}">
        <label class="ro__model-head">
          <input type="checkbox" data-action="toggle-model" ${spec.selected ? 'checked' : ''}>
          <span class="ro__model-name">${esc(model.name)}</span>
          <span class="ro__r2 ${r2Class}" title="${esc(t('adjR2'))}">R²adj ${r2Text}</span>
        </label>
        ${spec.selected ? `
          <div class="ro__spec">
            <select class="field ro__spec-kind" data-action="kind">
              <option value="max"    ${spec.kind === 'max'    ? 'selected' : ''}>${t('goalMax')}</option>
              <option value="min"    ${spec.kind === 'min'    ? 'selected' : ''}>${t('goalMin')}</option>
              <option value="target" ${spec.kind === 'target' ? 'selected' : ''}>${t('goalTarget')}</option>
            </select>
            <label>${t('lower')} <input class="field field--num" type="number" step="any" data-action="lower" value="${spec.lower ?? ''}"></label>
            ${spec.kind === 'target' ? `<label>${t('target')} <input class="field field--num" type="number" step="any" data-action="target" value="${spec.target ?? ''}"></label>` : ''}
            <label>${t('upper')} <input class="field field--num" type="number" step="any" data-action="upper" value="${spec.upper ?? ''}"></label>
            <label>${t('weight')} <input class="field field--num" type="number" step="any" data-action="weight" value="${spec.weight ?? 1}"></label>
          </div>
        ` : ''}
      </div>
    `;
  },

  /** Result section: shown after a successful optimisation; persisted in state.optimizations. */
  _renderResult() {
    const t = (k, v) => this._context.i18n.t(`modules.response-optimization.${k}`, v);
    const opt = this._optId
      ? (this._context.stateManager.get('optimizations') ?? {})[this._optId]
      : null;
    if (!opt?.result) {
      return `<div class="ro__placeholder">${t('placeholderResult')}</div>`;
    }
    const { xOpt, yPredictions, dPerResponse, D } = opt.result;
    const factorNames = opt.result.factorNames ?? [];
    const modelNames  = opt.result.modelNames  ?? [];
    const dClass = D >= 0.8 ? 'dmike-kpi--good' : D >= 0.5 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';

    return `
      <div class="dmike-split__output-section">${t('resultTitle')}</div>

      <div class="dmike-kpi-strip">
        <div class="dmike-kpi ${dClass}" title="${esc(t('tipD'))}">
          <div class="dmike-kpi-value">${D.toFixed(3)}</div>
          <div class="dmike-kpi-label">D</div>
        </div>
      </div>

      <div class="dmike-split__output-section">${t('optimumPoint')}</div>
      <table class="dmike-table">
        <thead><tr><th>${t('factor')}</th><th>${t('value')}</th></tr></thead>
        <tbody>
          ${factorNames.map((n, i) => {
            const v = xOpt[i];
            const cell = (typeof v === 'number')
              ? v.toFixed(4)
              : esc(String(v ?? ''));
            return `<tr><td>${esc(n)}</td><td class="num">${cell}</td></tr>`;
          }).join('')}
        </tbody>
      </table>

      <div class="dmike-split__output-section">${t('predictions')}</div>
      <table class="dmike-table">
        <thead><tr><th>${t('model')}</th><th>${t('prediction')}</th><th>d</th></tr></thead>
        <tbody>
          ${modelNames.map((n, i) => `
            <tr>
              <td>${esc(n)}</td>
              <td class="num">${(yPredictions[i] ?? NaN).toFixed(4)}</td>
              <td class="num">${(dPerResponse[i] ?? NaN).toFixed(3)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${this._renderContourSection(opt)}
    `;
  },

  /**
   * Response-surface heatmap section. Visible only when the first selected
   * model has at least 2 continuous predictors. For mixed models, dropdowns
   * above the heatmap let the user pick which categorical level combination
   * to slice (defaults to the optimum's chosen levels).
   */
  _renderContourSection(opt) {
    const t = (k, v) => this._context.i18n.t(`modules.response-optimization.${k}`, v);
    const modelId = (opt.modelRefs ?? [])[0];
    const model = modelId ? getModel(this._context.stateManager, modelId) : null;
    if (!model?.spec) return '';

    const continuous  = model.spec.predictors.filter(p => p.kind === 'continuous');
    const categorical = model.spec.predictors.filter(p => p.kind === 'categorical');
    if (continuous.length < 2) return '';

    // Default sweep axes: first two continuous predictors.
    const xId = this._contourXId ?? continuous[0].id;
    const yId = this._contourYId ?? continuous[1].id;

    // Categorical fixings: prefer the user's dropdown selection, otherwise the
    // optimum's chosen level (so the heatmap shows the surface at the optimum
    // by default).
    const fixings = {};
    for (const p of categorical) {
      const fromUI = this._contourFixings?.[p.id];
      if (fromUI != null) {
        fixings[p.id] = fromUI;
      } else {
        const idxInOptimum = model.spec.predictors.findIndex(q => q.id === p.id);
        const optVal = opt.result?.xOpt?.[idxInOptimum];
        fixings[p.id] = (typeof optVal === 'string') ? optVal : (p.reference ?? p.levels?.[0]);
      }
    }

    let surface;
    try {
      surface = buildResponseSurface(model, { xId, yId, fixings, gridSize: 28 });
    } catch (e) {
      return `<div class="ro__placeholder">${esc(e.message)}</div>`;
    }

    // Mark the optimum if its categorical fixings match what we're showing.
    const optMatches = categorical.every(p => {
      const idx = model.spec.predictors.findIndex(q => q.id === p.id);
      return opt.result?.xOpt?.[idx] === fixings[p.id];
    });
    const xOptIdx = model.spec.predictors.findIndex(q => q.id === xId);
    const yOptIdx = model.spec.predictors.findIndex(q => q.id === yId);
    const xOptVal = optMatches && typeof opt.result?.xOpt?.[xOptIdx] === 'number' ? opt.result.xOpt[xOptIdx] : null;
    const yOptVal = optMatches && typeof opt.result?.xOpt?.[yOptIdx] === 'number' ? opt.result.xOpt[yOptIdx] : null;

    const fixingControls = categorical.map(p => `
      <label class="ro__contour-fix">
        <span>${esc(p.id)}</span>
        <select class="field" data-action="contour-fix" data-predictor="${esc(p.id)}">
          ${(p.levels || []).map(l => `<option value="${esc(l)}"${fixings[p.id] === l ? ' selected' : ''}>${esc(l)}</option>`).join('')}
        </select>
      </label>
    `).join('');

    const axisControls = continuous.length > 2 ? `
      <label class="ro__contour-fix">
        <span>X</span>
        <select class="field" data-action="contour-axis" data-axis="x">
          ${continuous.map(p => `<option value="${esc(p.id)}"${p.id === xId ? ' selected' : ''}>${esc(p.id)}</option>`).join('')}
        </select>
      </label>
      <label class="ro__contour-fix">
        <span>Y</span>
        <select class="field" data-action="contour-axis" data-axis="y">
          ${continuous.map(p => `<option value="${esc(p.id)}"${p.id === yId ? ' selected' : ''}>${esc(p.id)}</option>`).join('')}
        </select>
      </label>
    ` : '';

    return `
      <div class="dmike-split__output-section">${t('contourTitle')}</div>
      <div class="ro__contour-controls">${axisControls}${fixingControls}</div>
      <div class="ro__contour-host">${this._renderContourSVG(surface, { xLabel: xId, yLabel: yId, xOptVal, yOptVal })}</div>
    `;
  },

  /**
   * Inline SVG heatmap for a response-surface grid. Two-stop linear color
   * scale: cool (low ŷ) → warm (high ŷ). The optimum, when supplied, is
   * drawn as a filled circle.
   */
  _renderContourSVG(surface, opts = {}) {
    const W = 480, H = 360;
    const margin = { top: 16, right: 80, bottom: 36, left: 56 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    const N = surface.grid.length;
    const cellW = plotW / N;
    const cellH = plotH / N;

    let yMin = +Infinity, yMax = -Infinity;
    for (const row of surface.grid) for (const v of row) {
      if (Number.isFinite(v)) {
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    if (yMin === yMax) { yMin -= 0.5; yMax += 0.5; }

    // Color: linear interpolate hue 220 (cool blue) → 10 (warm red).
    const colorOf = (v) => {
      const t = Math.min(1, Math.max(0, (v - yMin) / (yMax - yMin)));
      const hue = 220 - t * 210;
      return `hsl(${hue.toFixed(0)}, 70%, 55%)`;
    };

    // Map a grid index to plot coordinates. Note: row 0 is yMin (bottom),
    // so we flip when rendering.
    const rectAt = (i, j, value) => {
      const x = margin.left + j * cellW;
      const y = margin.top + (N - 1 - i) * cellH;
      const c = Number.isFinite(value) ? colorOf(value) : 'var(--color-bg-secondary, #eee)';
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cellW.toFixed(2)}" height="${cellH.toFixed(2)}" fill="${c}" shape-rendering="crispEdges"/>`;
    };

    const cells = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) cells.push(rectAt(i, j, surface.grid[i][j]));

    // Axis ticks: 5 evenly spaced positions on each axis.
    const tickFmt = (v) => Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
    const xAxis = [0, 0.25, 0.5, 0.75, 1].map(t => {
      const v = surface.xRange[0] + t * (surface.xRange[1] - surface.xRange[0]);
      const x = margin.left + t * plotW;
      return `<text x="${x}" y="${margin.top + plotH + 14}" text-anchor="middle" font-size="10" fill="currentColor">${tickFmt(v)}</text>`;
    }).join('');
    const yAxis = [0, 0.25, 0.5, 0.75, 1].map(t => {
      const v = surface.yRange[0] + t * (surface.yRange[1] - surface.yRange[0]);
      const y = margin.top + plotH - t * plotH;
      return `<text x="${margin.left - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="currentColor">${tickFmt(v)}</text>`;
    }).join('');

    // Color-bar legend on the right.
    const legendX = margin.left + plotW + 16;
    const legendW = 14;
    const legend = Array.from({ length: 32 }, (_, k) => {
      const t = k / 31;
      const v = yMin + (1 - t) * (yMax - yMin);
      const y = margin.top + t * plotH;
      return `<rect x="${legendX}" y="${y}" width="${legendW}" height="${(plotH / 32).toFixed(2)}" fill="${colorOf(v)}" shape-rendering="crispEdges"/>`;
    }).join('');
    const legendTicks = [0, 0.5, 1].map(t => {
      const v = yMax - t * (yMax - yMin);
      const y = margin.top + t * plotH + 3;
      return `<text x="${legendX + legendW + 4}" y="${y}" font-size="10" fill="currentColor">${tickFmt(v)}</text>`;
    }).join('');

    // Optimum marker.
    let marker = '';
    if (Number.isFinite(opts.xOptVal) && Number.isFinite(opts.yOptVal)) {
      const tx = (opts.xOptVal - surface.xRange[0]) / (surface.xRange[1] - surface.xRange[0]);
      const ty = (opts.yOptVal - surface.yRange[0]) / (surface.yRange[1] - surface.yRange[0]);
      if (tx >= 0 && tx <= 1 && ty >= 0 && ty <= 1) {
        const cx = margin.left + tx * plotW;
        const cy = margin.top + plotH - ty * plotH;
        marker = `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="5" fill="white" stroke="black" stroke-width="1.5"/>`;
      }
    }

    return `
      <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px;height:auto;">
        ${cells}
        <rect x="${margin.left}" y="${margin.top}" width="${plotW}" height="${plotH}" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.5"/>
        ${xAxis}${yAxis}
        ${legend}${legendTicks}
        ${marker}
        <text x="${margin.left + plotW / 2}" y="${H - 4}" text-anchor="middle" font-size="11" fill="currentColor">${esc(opts.xLabel ?? 'X')}</text>
        <text x="14" y="${margin.top + plotH / 2}" transform="rotate(-90, 14, ${margin.top + plotH / 2})" text-anchor="middle" font-size="11" fill="currentColor">${esc(opts.yLabel ?? 'Y')}</text>
      </svg>
    `;
  },

  // ─── Diagnostic gate ──────────────────────────────────────────

  /**
   * Return human-readable reasons why the optimise button must stay disabled.
   * Empty array → optimisation is allowed.
   */
  _diagnose(selectedIds) {
    const t = (k, v) => this._context.i18n.t(`modules.response-optimization.${k}`, v);
    const reasons = [];
    if (selectedIds.length === 0) return reasons;

    const models = selectedIds.map(id => getModel(this._context.stateManager, id)).filter(Boolean);

    for (const m of models) {
      if ((m.rSqAdj ?? 0) < MIN_R2_ADJ) {
        reasons.push(t('lowR2', { name: m.name, value: (m.rSqAdj ?? 0).toFixed(3) }));
      }
      if (Number.isFinite(m.lofPValue) && m.lofPValue < LOF_ALPHA) {
        reasons.push(t('lackOfFit', { name: m.name, value: m.lofPValue.toFixed(3) }));
      }
    }

    // Factor compatibility: every selected model must share the same factor names.
    if (models.length > 1) {
      const ref = models[0].factorSpec.map(f => f.name).join('|');
      for (const m of models.slice(1)) {
        const cur = m.factorSpec.map(f => f.name).join('|');
        if (cur !== ref) {
          reasons.push(t('factorMismatch', { name: m.name }));
          break;
        }
      }
    }
    return reasons;
  },

  // ─── Events ───────────────────────────────────────────────────

  _bindEvents() {
    const c = this._container;

    c.querySelectorAll('.ro__model-row').forEach(row => {
      const modelId = row.dataset.modelId;

      const toggle = row.querySelector('[data-action="toggle-model"]');
      if (toggle) {
        toggle.addEventListener('change', (e) => {
          this._specs[modelId].selected = e.target.checked;
          this._save();
          this._render();
        });
      }

      for (const key of ['kind', 'lower', 'upper', 'target', 'weight']) {
        const el = row.querySelector(`[data-action="${key}"]`);
        if (!el) continue;
        el.addEventListener('change', (e) => {
          const v = key === 'kind' ? e.target.value : parseFloat(e.target.value);
          this._specs[modelId][key] = key === 'kind' ? v : (Number.isFinite(v) ? v : 0);
          this._save();
          if (key === 'kind') this._render(); // re-render to show/hide target field
        });
      }
    });

    const btn = c.querySelector('[data-action="optimize"]');
    if (btn) btn.addEventListener('click', () => this._runOptimize());

    // Contour-plot interactivity: categorical-fixing dropdown + X/Y axis swap.
    c.querySelectorAll('[data-action="contour-fix"]').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const id = e.target.dataset.predictor;
        this._contourFixings = { ...(this._contourFixings || {}), [id]: e.target.value };
        this._render();
      });
    });
    c.querySelectorAll('[data-action="contour-axis"]').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const which = e.target.dataset.axis;
        if (which === 'x') this._contourXId = e.target.value;
        else               this._contourYId = e.target.value;
        this._render();
      });
    });
  },

  // ─── Optimisation run ─────────────────────────────────────────

  _runOptimize() {
    const t = (k, v) => this._context.i18n.t(`modules.response-optimization.${k}`, v);
    const sm = this._context.stateManager;
    const selectedIds = Object.keys(this._specs).filter(id => this._specs[id]?.selected);
    const models = selectedIds.map(id => getModel(sm, id)).filter(Boolean);
    if (models.length === 0) return;

    const desirSpecs = models.map(m => {
      const s = this._specs[m.id];
      return {
        kind:   s.kind,
        lower:  s.lower,
        upper:  s.upper,
        target: s.target,
        weight: s.weight ?? 1,
      };
    });

    // Bounds taken from the first model's factorSpec — _diagnose() already
    // ensured all selected models share the same factor structure.
    const factorBounds = models[0].factorSpec.map(f => [f.low ?? -1, f.high ?? 1]);
    const factorNames  = models[0].factorSpec.map(f => f.name);

    let result;
    try {
      result = optimizeResponses(models, desirSpecs, factorBounds, { nStarts: 8, seed: 42, maxIter: 400 });
    } catch (e) {
      this._context.notify(e.message, 'error');
      return;
    }

    // Persist as a project-central optimisation record.
    const id = this._optId ?? (typeof crypto !== 'undefined' ? crypto.randomUUID() : `opt_${Date.now()}`);
    const all = sm.get('optimizations') ?? {};
    sm.set('optimizations', {
      ...all,
      [id]: {
        id,
        name: t('defaultName'),
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
        createdAt: this._optId ? (all[this._optId]?.createdAt ?? new Date().toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    this._optId = id;
    this._save();
    this._context.notify(t('optimizeSuccess', { D: result.D.toFixed(3) }), 'success');
    this._render();
  },
};

export default mod;
