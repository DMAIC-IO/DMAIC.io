/**
 * D.Mike — Correlation Module: Render Mixin (correlation-render.js)
 *
 * Extracted from correlation.js — contains all result rendering methods:
 *  - _renderPairwiseResults(result)
 *  - _renderMatrixResults(matrixResult)
 *  - _renderScatterPlot(result)
 *  - _renderMatrixScatterPlots(matrixResult)
 *  - _clearResults()
 *  - _cellPassesFilter(r, p)
 *  - _destroyCharts()
 *
 * Mixed into the module object via Object.assign — all `this` references
 * resolve to the module instance at call time.
 */

import { esc } from '../../core/html-utils.js';

/** @param {number} v @param {number} d */
function fmt(v, d = 4) {
  if (v == null) return '–';
  if (v === Infinity) return '∞';
  if (v === -Infinity) return '−∞';
  if (Number.isNaN(v)) return '–';
  return v.toFixed(d);
}
function fmtP(p) {
  if (p == null || !isFinite(p)) return '–';
  return p < 0.0001 ? '< 0.0001' : p.toFixed(4);
}

export const renderMethods = {

  _charts: [],

  // ─── Clear results ─────────────────────────────────────────

  _clearResults() {
    this._result = null;
    this._matrixResult = null;
    this._lastFingerprint = null;
    this._renderGen++;
    this._destroyCharts();
    const resultsEl = this._container?.querySelector('[data-ref="results"]');
    if (resultsEl) {
      resultsEl.innerHTML = '';
    }
    const errBox = this._container?.querySelector('[data-ref="error-box"]');
    if (errBox) {
      errBox.textContent = '';
      errBox.style.display = 'none';
    }
    this._save();
  },

  // ─── Render pairwise results (2 columns) ───────────────────

  async _renderPairwiseResults(result) {
    const t = (k, v) => this._context.i18n.t(`modules.correlation.${k}`, v);
    const resultsEl = this._container.querySelector('[data-ref="results"]');
    if (!resultsEl) return;

    const { pearson, spearman, kendall, recommendation, descriptive, diagnostics, n, df, confidenceLevel } = result;
    const confPct = Math.round(confidenceLevel * 100);

    const corrColor = (r) => {
      const a = Math.abs(r);
      if (a >= 0.7) return r > 0 ? 'var(--color-success)' : 'var(--color-error)';
      if (a >= 0.4) return 'var(--color-warning)';
      return 'var(--color-text-tertiary)';
    };

    const interpretR = (r) => {
      const a = Math.abs(r);
      const dir = r >= 0 ? 'pos' : 'neg';
      if (a >= 0.9) return t(`interpVeryStrong_${dir}`);
      if (a >= 0.7) return t(`interpStrong_${dir}`);
      if (a >= 0.5) return t(`interpModerate_${dir}`);
      if (a >= 0.3) return t(`interpWeak_${dir}`);
      return t('interpVeryWeak');
    };

    const recNames = { pearson: 'Pearson r', spearman: 'Spearman ρ', kendall: 'Kendall τ' };
    const recName = recNames[recommendation.best];
    const recTooltipParts = [`${t('recommendation')}: ${recName}`];
    for (const r of recommendation.reasons) {
      const ico = r.ok ? '✓' : '⚠';
      recTooltipParts.push(`${ico} ${t(r.key, r.params)}`);
    }
    const recTooltip = recTooltipParts.join('<br>');

    const renderCard = (method, label, rVal, stats, ciData, isRec) => {
      const col = corrColor(rVal);
      const interp = interpretR(rVal);
      const recClass = isRec ? ' result-card--recommended' : '';
      const badgeText = t('recommended');

      let statsHTML = '';
      for (const s of stats) {
        statsHTML += `<div class="corr__card-row"><span>${s.label}</span><span>${s.value}</span></div>`;
      }

      const toP = (v) => ((v + 1) / 2) * 100;

      return `
        <div class="corr__card${recClass}">
          <span class="result-card__badge">${badgeText}<span class="result-card__tooltip">${recTooltip}</span></span>
          <div class="corr__card-header" style="color:${col}">${label}</div>
          <div class="corr__card-body">
            <div class="corr__big-r" style="color:${col}">${fmt(rVal)}</div>
            <div class="corr__interpret-tag" style="background:${col}15;color:${col}">${interp}</div>
            ${statsHTML}
            <div class="corr__ci-wrap">
              <div class="corr__ci-label">${t('confidenceInterval')} ${confPct} %</div>
              <div class="corr__ci-track">
                <div class="corr__ci-zero"></div>
                <div class="corr__ci-fill" style="background:${col};left:${toP(ciData[0])}%;width:${toP(ciData[1]) - toP(ciData[0])}%"></div>
                <div class="corr__ci-point" style="left:${toP(rVal)}%"></div>
              </div>
              <div class="corr__ci-labels"><span>${fmt(ciData[0])}</span><span>${fmt(ciData[1])}</span></div>
            </div>
          </div>
        </div>
      `;
    };

    const pearsonCard = renderCard('pearson', 'Pearson r', pearson.r, [
      { label: t('pValue'), value: fmtP(pearson.p) },
      { label: t('tStat'), value: fmt(pearson.t) },
      { label: 'R²', value: `${fmt(pearson.r2)} (${(pearson.r2 * 100).toFixed(1)} %)` },
    ], pearson.ci, recommendation.best === 'pearson');

    const spearmanCard = renderCard('spearman', 'Spearman ρ', spearman.r, [
      { label: t('pValue'), value: fmtP(spearman.p) },
      { label: t('tStat'), value: fmt(spearman.t) },
      { label: 'ρ²', value: `${fmt(spearman.r2)} (${(spearman.r2 * 100).toFixed(1)} %)` },
    ], spearman.ci, recommendation.best === 'spearman');

    const kendallCard = renderCard('kendall', 'Kendall τ', kendall.tau, [
      { label: t('pValue'), value: fmtP(kendall.p) },
      { label: t('zStat'), value: fmt(kendall.z) },
      { label: t('concordant'), value: String(kendall.concordant) },
      { label: t('discordant'), value: String(kendall.discordant) },
    ], kendall.ci, recommendation.best === 'kendall');

    const normXColor = diagnostics.normX.normal ? 'var(--color-success)' : 'var(--color-warning)';
    const normYColor = diagnostics.normY.normal ? 'var(--color-success)' : 'var(--color-warning)';
    const monoColor = diagnostics.mono >= 0.85 ? 'var(--color-success)' : diagnostics.mono >= 0.7 ? 'var(--color-warning)' : 'var(--color-error)';
    const outlierColor = diagnostics.outliers === 0 ? 'var(--color-success)' : 'var(--color-warning)';

    resultsEl.innerHTML = `
      <div class="corr__cards">
        ${pearsonCard}
        ${spearmanCard}
        ${kendallCard}
      </div>

      <div class="dmike-split__output-section">${t('sectionScatter')}</div>
      <div class="corr__plot-wrap" data-ref="scatter-plot"></div>

      <div class="dmike-split__output-section">${t('sectionStats')}</div>
      <div class="corr__stats-grid">
        <div class="corr__stats-card">
          <div class="corr__stats-title">${t('descriptiveStats')}</div>
          <div class="corr__stat-row"><span>n</span><span>${n}</span></div>
          <div class="corr__stat-row"><span>${t('degreesOfFreedom')}</span><span>${df}</span></div>
          <div class="corr__stat-row"><span>${t('meanX')}</span><span>${fmt(descriptive.meanX, 3)}</span></div>
          <div class="corr__stat-row"><span>${t('meanY')}</span><span>${fmt(descriptive.meanY, 3)}</span></div>
          <div class="corr__stat-row"><span>${t('stdDevX')}</span><span>${fmt(descriptive.stdX, 3)}</span></div>
          <div class="corr__stat-row"><span>${t('stdDevY')}</span><span>${fmt(descriptive.stdY, 3)}</span></div>
          <div class="corr__stat-row"><span>${t('covariance')}</span><span>${fmt(descriptive.cov, 3)}</span></div>
        </div>
        <div class="corr__stats-card">
          <div class="corr__stats-title">${t('diagnostics')}</div>
          <div class="corr__stat-row"><span>${t('normalityX')}</span><span style="color:${normXColor}">${diagnostics.normX.label} (JB=${diagnostics.normX.jb.toFixed(2)})</span></div>
          <div class="corr__stat-row"><span>${t('normalityY')}</span><span style="color:${normYColor}">${diagnostics.normY.label} (JB=${diagnostics.normY.jb.toFixed(2)})</span></div>
          <div class="corr__stat-row"><span>${t('skewnessX')}</span><span>${fmt(diagnostics.skewX, 3)}</span></div>
          <div class="corr__stat-row"><span>${t('skewnessY')}</span><span>${fmt(diagnostics.skewY, 3)}</span></div>
          <div class="corr__stat-row"><span>${t('kurtosisX')}</span><span>${fmt(diagnostics.kurtX, 3)}</span></div>
          <div class="corr__stat-row"><span>${t('kurtosisY')}</span><span>${fmt(diagnostics.kurtY, 3)}</span></div>
          <div class="corr__stat-row"><span>${t('monotonicityIndex')}</span><span style="color:${monoColor}">${(diagnostics.mono * 100).toFixed(1)} %</span></div>
          <div class="corr__stat-row"><span>${t('outliers')}</span><span style="color:${outlierColor}">${diagnostics.outliers === 0 ? t('none') : diagnostics.outliers}</span></div>
        </div>
      </div>
    `;

    await this._renderScatterPlot(result);
  },

  /**
   * Check whether a matrix cell (i, j) passes the active filter.
   * @returns {boolean} true if the cell should be highlighted (passes filter)
   */
  _cellPassesFilter(r, p) {
    if (this._filterMinR == null && this._filterMaxP == null) return true;
    if (isNaN(r)) return false;
    if (this._filterMinR != null && Math.abs(r) < this._filterMinR) return false;
    if (this._filterMaxP != null && (p == null || p > this._filterMaxP)) return false;
    return true;
  },

  // ─── Render matrix results (3+ columns) ────────────────────

  async _renderMatrixResults(matrixResult) {
    this._renderGen++;
    this._destroyCharts();
    this._selectedPair = null;
    const t = (k, v) => this._context.i18n.t(`modules.correlation.${k}`, v);
    const resultsEl = this._container.querySelector('[data-ref="results"]');
    if (!resultsEl) return;

    const { names, matrix, ciMatrix, pMatrix, nMatrix } = matrixResult;
    const k = names.length;
    const method = this._matrixMethod;
    const mat = matrix[method];
    const ciMat = ciMatrix[method];
    const pMat = pMatrix[method];
    const confPct = Math.round(this._confidenceLevel * 100);

    const corrColor = (r) => {
      if (isNaN(r)) return 'var(--color-text-tertiary)';
      const a = Math.abs(r);
      if (a >= 0.7) return r > 0 ? 'var(--color-success)' : 'var(--color-error)';
      if (a >= 0.4) return 'var(--color-warning)';
      return 'var(--color-text-tertiary)';
    };

    const corrBg = (r) => {
      if (isNaN(r)) return 'transparent';
      const a = Math.abs(r);
      if (r > 0) return `rgba(34, 197, 94, ${a * 0.25})`;
      return `rgba(239, 68, 68, ${a * 0.25})`;
    };

    // Method toggle
    const methods = [
      { id: 'pearson', label: 'Pearson r' },
      { id: 'spearman', label: 'Spearman ρ' },
      { id: 'kendall', label: 'Kendall τ' },
    ];
    let toggleHTML = '<div class="btn-group corr__matrix-toggle">';
    for (const m of methods) {
      const active = m.id === method ? ' btn--active' : '';
      toggleHTML += `<button class="btn--segment corr__toggle-btn${active}" data-method="${m.id}">${m.label}</button>`;
    }
    toggleHTML += '</div>';

    // Filter bar
    let filterHTML = `<div class="corr__filter-bar">`;
    filterHTML += `<span class="corr__filter-label">${t('filter')}</span>`;
    filterHTML += `<label class="corr__filter-field">`;
    filterHTML += `<span>|r| ≥</span>`;
    filterHTML += `<input type="number" class="corr__filter-input" data-ref="filter-min-r" min="0" max="1" placeholder="–" value="${this._filterMinR != null ? this._filterMinR : ''}">`;
    filterHTML += `</label>`;
    filterHTML += `<label class="corr__filter-field">`;
    filterHTML += `<span>p ≤</span>`;
    filterHTML += `<input type="number" class="corr__filter-input" data-ref="filter-max-p" min="0" max="1" placeholder="–" value="${this._filterMaxP != null ? this._filterMaxP : ''}">`;
    filterHTML += `</label>`;
    filterHTML += `</div>`;

    // Matrix table
    let tableHTML = '<div class="corr__matrix-wrap"><table class="corr__matrix-table">';
    // Header row
    tableHTML += '<thead><tr><th></th>';
    for (let j = 0; j < k; j++) {
      tableHTML += `<th class="corr__matrix-header" data-col="${j}">${esc(names[j])}</th>`;
    }
    tableHTML += '</tr></thead><tbody>';

    for (let i = 0; i < k; i++) {
      tableHTML += `<tr data-row="${i}"><th class="corr__matrix-row-header" data-row="${i}">${esc(names[i])}</th>`;
      for (let j = 0; j < k; j++) {
        if (j > i) {
          tableHTML += `<td class="corr__matrix-cell corr__matrix-cell--empty" data-row="${i}" data-col="${j}"></td>`;
          continue;
        }
        const r = mat[i][j];
        const n = nMatrix[i][j];
        if (i === j) {
          tableHTML += `<td class="corr__matrix-cell corr__matrix-cell--diag" data-row="${i}" data-col="${j}">1</td>`;
        } else {
          const p = pMat[i][j];
          const passes = this._cellPassesFilter(r, p);
          const dimClass = passes ? '' : ' corr__matrix-cell--dimmed';
          const color = corrColor(r);
          const bg = passes ? corrBg(r) : 'transparent';
          const val = isNaN(r) ? '–' : fmt(r);
          const ci = ciMat[i][j];
          const ciStr = ci ? `[${fmt(ci[0], 3)}, ${fmt(ci[1], 3)}]` : '';
          const pStr = p != null ? fmtP(p) : '';
          const title = `n = ${n}`;
          tableHTML += `<td class="corr__matrix-cell${dimClass}" style="background:${bg};color:${color}" title="${title}" data-row="${i}" data-col="${j}">`;
          tableHTML += `<span class="corr__matrix-r">${val}</span>`;
          if (pStr) tableHTML += `<span class="corr__matrix-p">p = ${pStr}</span>`;
          if (ciStr) tableHTML += `<span class="corr__matrix-ci">${ciStr}</span>`;
          tableHTML += '</td>';
        }
      }
      tableHTML += '</tr>';
    }
    tableHTML += '</tbody></table></div>';

    // Legend
    const legendHTML = `
      <div class="corr__matrix-legend">
        <span class="corr__matrix-legend-item" style="color:var(--color-success)">● ${t('strongPositive')}</span>
        <span class="corr__matrix-legend-item" style="color:var(--color-warning)">● ${t('moderate')}</span>
        <span class="corr__matrix-legend-item" style="color:var(--color-text-tertiary)">● ${t('weak')}</span>
        <span class="corr__matrix-legend-item" style="color:var(--color-error)">● ${t('strongNegative')}</span>
      </div>
    `;

    // Scatter plot containers for upper triangle pairs (only those passing filter)
    const { pairs } = matrixResult;
    const filteredPairs = (pairs || []).filter(pair => {
      if (pair.x.length < 4) return false;
      const r = mat[pair.i][pair.j];
      const p = pMat[pair.i][pair.j];
      return this._cellPassesFilter(r, p);
    });
    let plotsHTML = '';
    if (filteredPairs.length > 0) {
      plotsHTML += `
        <div class="dmike-split__output-section-header">
          <div class="dmike-split__output-section">${t('sectionScatterMatrix')}</div>
          <button class="corr__collapse-all-btn" data-action="toggle-all-plots">${t('collapseAll')}</button>
        </div>`;
      plotsHTML += '<div class="corr__matrix-plots">';
      for (const pair of filteredPairs) {
        const r = mat[pair.i][pair.j];
        const rLabel = isNaN(r) ? '–' : fmt(r, 3);
        const p = pMat[pair.i][pair.j];
        const pLabel = p != null ? fmtP(p) : '–';
        const ci = ciMat[pair.i][pair.j];
        const ciLabel = ci ? `[${fmt(ci[0], 3)}, ${fmt(ci[1], 3)}]` : '';
        const color = corrColor(r);
        plotsHTML += `
          <div class="corr__matrix-plot-card" data-pair="${pair.i}-${pair.j}">
            <div class="corr__matrix-plot-header" data-action="toggle-plot">
              <span>${esc(names[pair.i])} ↔ ${esc(names[pair.j])}</span>
              <span class="corr__matrix-plot-header-right">
                <span class="corr__matrix-plot-r" style="color:${color}">r = ${rLabel}</span>
                ${ciLabel ? `<span class="corr__matrix-plot-meta">${confPct}% ${t('ciShort')} ${ciLabel}</span>` : ''}
                <span class="corr__matrix-plot-meta">| p = ${pLabel}</span>
                <span class="corr__matrix-plot-chevron">▼</span>
              </span>
            </div>
            <div class="corr__matrix-plot-area" data-ref="matrix-plot-${pair.i}-${pair.j}"></div>
          </div>`;
      }
      plotsHTML += '</div>';
    }

    resultsEl.innerHTML = `
      <div class="dmike-split__output-section">${t('sectionMatrix')}</div>
      <div class="corr__matrix-toolbar">${toggleHTML}${filterHTML}</div>
      ${tableHTML}
      ${legendHTML}
      ${plotsHTML}
    `;

    // Bind method toggle
    resultsEl.querySelectorAll('[data-method]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._matrixMethod = btn.dataset.method;
        this._save();
        this._renderMatrixResults(matrixResult);
      });
    });

    // Bind filter inputs
    const filterMinRInput = resultsEl.querySelector('[data-ref="filter-min-r"]');
    const filterMaxPInput = resultsEl.querySelector('[data-ref="filter-max-p"]');
    const applyFilter = () => {
      const rVal = filterMinRInput.value.trim();
      const pVal = filterMaxPInput.value.trim();
      this._filterMinR = rVal !== '' ? parseFloat(rVal) : null;
      this._filterMaxP = pVal !== '' ? parseFloat(pVal) : null;
      this._save();
      this._renderMatrixResults(matrixResult);
    };
    filterMinRInput.addEventListener('change', applyFilter);
    filterMaxPInput.addEventListener('change', applyFilter);

    // Bind matrix cross-highlight on hover
    const table = resultsEl.querySelector('.corr__matrix-table');
    if (table) {
      const allCells = table.querySelectorAll('[data-row], [data-col]');
      table.addEventListener('mouseover', (e) => {
        const cell = e.target.closest('[data-row][data-col]');
        if (!cell) return;
        const row = cell.dataset.row;
        const col = cell.dataset.col;
        allCells.forEach(c => {
          c.classList.toggle('corr__matrix--highlight', c.dataset.row === row || c.dataset.col === col);
        });
      });
      table.addEventListener('mouseleave', () => {
        allCells.forEach(c => c.classList.remove('corr__matrix--highlight'));
      });

      table.addEventListener('click', (e) => {
        const cell = e.target.closest('[data-row][data-col]');
        if (!cell) return;
        const row = parseInt(cell.dataset.row, 10);
        const col = parseInt(cell.dataset.col, 10);
        if (row === col || cell.classList.contains('corr__matrix-cell--empty')) return;
        const pairI = Math.max(row, col);
        const pairJ = Math.min(row, col);
        const pairKey = `${pairI}-${pairJ}`;
        const cards = resultsEl.querySelectorAll('.corr__matrix-plot-card');
        if (cards.length === 0) return;

        if (this._selectedPair === pairKey) {
          this._selectedPair = null;
          allCells.forEach(c => c.classList.remove('corr__matrix-cell--selected'));
          cards.forEach(c => { c.style.display = ''; });
        } else {
          this._selectedPair = pairKey;
          allCells.forEach(c => {
            const r2 = parseInt(c.dataset.row, 10);
            const c2 = parseInt(c.dataset.col, 10);
            const match = (r2 === pairI && c2 === pairJ) || (r2 === pairJ && c2 === pairI);
            c.classList.toggle('corr__matrix-cell--selected', match && !c.classList.contains('corr__matrix-cell--empty'));
          });
          cards.forEach(c => {
            const dp = c.dataset.pair;
            const match = dp === `${pairI}-${pairJ}` || dp === `${pairJ}-${pairI}`;
            c.style.display = match ? '' : 'none';
          });
        }
      });
    }

    // Bind plot card collapse/expand
    resultsEl.querySelectorAll('[data-action="toggle-plot"]').forEach(header => {
      header.addEventListener('click', () => {
        const card = header.closest('.corr__matrix-plot-card');
        card.classList.toggle('corr__matrix-plot-card--collapsed');
      });
    });

    // Bind collapse/expand all
    const toggleAllBtn = resultsEl.querySelector('[data-action="toggle-all-plots"]');
    if (toggleAllBtn) {
      toggleAllBtn.addEventListener('click', () => {
        const cards = resultsEl.querySelectorAll('.corr__matrix-plot-card');
        const allCollapsed = [...cards].every(c => c.classList.contains('corr__matrix-plot-card--collapsed'));
        cards.forEach(c => c.classList.toggle('corr__matrix-plot-card--collapsed', !allCollapsed));
        toggleAllBtn.textContent = allCollapsed ? t('collapseAll') : t('expandAll');
      });
    }

    // Render scatter plots
    await this._renderMatrixScatterPlots(matrixResult);
  },

  // ─── Scatter plots (SVG chart framework) ───────────────────

  async _renderScatterPlot(result) {
    this._destroyCharts();

    const t = (k, v) => this._context.i18n.t(`modules.correlation.${k}`, v);
    const plotEl = this._container.querySelector('[data-ref="scatter-plot"]');
    if (!plotEl || !result._x || !result._y) return;

    const x = result._x;
    const y = result._y;
    const nameX = result._nameX || 'X';
    const nameY = result._nameY || 'Y';

    const mx = result.descriptive.meanX;
    const my = result.descriptive.meanY;
    let num = 0, den = 0;
    for (let i = 0; i < x.length; i++) {
      num += (x[i] - mx) * (y[i] - my);
      den += (x[i] - mx) * (x[i] - mx);
    }
    const slope = den ? num / den : 0;
    const intercept = my - slope * mx;
    const xMin = Math.min(...x);
    const xMax = Math.max(...x);

    const chart = await this._context.chartManager.create(plotEl, 'scatter', {
      xLabel: nameX,
      yLabel: nameY,
      showLegend: true,
      series: [
        {
          name: t('dataPoints'),
          color: 'var(--color-chart-1)',
          markerSize: 4,
          strokeWidth: 0.75,
          x,
          y,
          symbol: 'circle',
        },
        {
          name: t('regressionLine'),
          color: 'rgba(0,0,0,0)',
          stroke: 'rgba(0,0,0,0)',
          markerSize: 0,
          x: [xMin, xMax],
          y: [slope * xMin + intercept, slope * xMax + intercept],
          connectLine: { show: true, dash: 'solid', width: 2, color: 'var(--color-error)', foreground: true },
        },
      ],
    });
    this._charts.push(chart);
  },

  /**
   * Render scatter plots for all unique pairs in the matrix (upper triangle).
   */
  async _renderMatrixScatterPlots(matrixResult) {
    const gen = this._renderGen;
    const t = (k, v) => this._context.i18n.t(`modules.correlation.${k}`, v);
    const { names, pairs } = matrixResult;

    for (const pair of pairs) {
      if (this._renderGen !== gen) return; // stale — a newer render has started
      const plotEl = this._container.querySelector(`[data-ref="matrix-plot-${pair.i}-${pair.j}"]`);
      if (!plotEl || pair.x.length < 4) continue;

      const x = pair.x;
      const y = pair.y;

      // Regression line
      let sumX = 0, sumY = 0;
      for (let n = 0; n < x.length; n++) { sumX += x[n]; sumY += y[n]; }
      const mx = sumX / x.length;
      const my = sumY / x.length;
      let num = 0, den = 0;
      for (let n = 0; n < x.length; n++) {
        num += (x[n] - mx) * (y[n] - my);
        den += (x[n] - mx) * (x[n] - mx);
      }
      const slope = den ? num / den : 0;
      const intercept = my - slope * mx;
      const xMin = Math.min(...x);
      const xMax = Math.max(...x);

      const chart = await this._context.chartManager.create(plotEl, 'scatter', {
        xLabel: names[pair.i],
        yLabel: names[pair.j],
        showLegend: false,
        series: [
          {
            name: t('dataPoints'),
            color: 'var(--color-chart-1)',
            markerSize: 4,
            strokeWidth: 0.75,
            x,
            y,
            symbol: 'circle',
          },
          {
            name: '',
            color: 'rgba(0,0,0,0)',
            stroke: 'rgba(0,0,0,0)',
            markerSize: 0,
            x: [xMin, xMax],
            y: [slope * xMin + intercept, slope * xMax + intercept],
            connectLine: { show: true, dash: 'solid', width: 2, color: 'var(--color-error)', foreground: true },
          },
        ],
      });
      this._charts.push(chart);
    }
  },

  _destroyCharts() {
    for (const chart of this._charts) {
      try { this._context.chartManager.destroy(chart); } catch { /* ignore */ }
    }
    this._charts = [];
  },
};
