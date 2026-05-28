/**
 * D.Mike — Shared Statistics Panel (stats-panel.js)
 *
 * Reusable statistics table component for chart modules.
 * Renders a table with descriptive statistics (N, Mean, StdDev, Min, Max,
 * Median, Variance, Range, Skewness, Kurtosis) plus optional confidence
 * intervals for Mean, StdDev, and Variance.
 *
 * Usage:
 *   import { computeSeriesStats, renderStatsTable } from '../../core/stats-panel.js';
 *
 *   const series = [
 *     { name: 'Col A', values: [1,2,3], color: '#f00', visible: true },
 *   ];
 *   const stats = computeSeriesStats(series);
 *   renderStatsTable(panelEl, stats, { confLevel: 95, i18n });
 */

import { descriptiveStats } from '../engines/normality-test-engine.js';
import { tInv } from '../engines/math-utils.js';
import { chiSquaredInv } from '../engines/process-capability-engine.js';
import { esc, escAttr } from './html-utils.js';

// ─── Helpers ────────────────────────────────────────────────

/**
 * Interpolated percentile on a pre-sorted array.
 * @param {number[]} sorted - Ascending sorted numbers
 * @param {number} p - Percentile (0–100)
 * @returns {number}
 */
function percentile(sorted, p) {
  const n = sorted.length;
  const k = (p / 100) * (n - 1);
  const f = Math.floor(k);
  const c = k - f;
  if (f + 1 < n) return sorted[f] + c * (sorted[f + 1] - sorted[f]);
  return sorted[f];
}

/**
 * Format CI bound: 4 significant digits, scientific notation for very small values.
 * @param {number} v
 * @returns {string}
 */
function fmtCI(v) {
  if (v == null || !isFinite(v)) return '–';
  const abs = Math.abs(v);
  if (abs === 0) return '0';
  if (abs < 0.001 || abs >= 1e6) return v.toPrecision(4);
  return v.toFixed(4);
}

// ─── Statistics Computation ─────────────────────────────────

/**
 * Compute descriptive statistics for a single numeric array.
 * @param {number[]} values - Raw numeric values
 * @returns {Object|null} Stats object or null if empty
 */
export function computeStats(values) {
  if (!values || values.length === 0) return null;
  const ds = descriptiveStats(values);
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    n: ds.n,
    mean: ds.mean,
    stddev: ds.stdDev,
    variance: ds.variance,
    seMean: ds.n > 0 ? ds.stdDev / Math.sqrt(ds.n) : 0,
    median: ds.median,
    min: ds.min,
    max: ds.max,
    range: ds.max - ds.min,
    q1: percentile(sorted, 25),
    q3: percentile(sorted, 75),
    skewness: ds.skewness,
    kurtosis: ds.kurtosis,
  };
}

/**
 * Compute confidence intervals for mean, variance, and stddev.
 * @param {Object} stats - Result from computeStats()
 * @param {number} confLevel - Confidence level as fraction (e.g. 0.95)
 * @returns {Object} CI bounds: { mean: [lo,hi], variance: [lo,hi], stddev: [lo,hi] }
 */
export function computeCI(stats, confLevel) {
  const ci = {};
  if (!stats || stats.n < 2 || stats.variance <= 0) return ci;

  const n = stats.n;
  const df = n - 1;
  const alpha = 1 - confLevel;

  // Mean CI: x̄ ± t * s / √n
  const tCrit = tInv(1 - alpha / 2, df);
  const mE = tCrit * stats.stddev / Math.sqrt(n);
  ci.mean = [stats.mean - mE, stats.mean + mE];

  // Variance CI: (n-1)s² / χ²_{1-α/2} .. (n-1)s² / χ²_{α/2}
  const chi2Upper = chiSquaredInv(1 - alpha / 2, df);
  const chi2Lower = chiSquaredInv(alpha / 2, df);
  const ss = df * stats.variance;
  if (chi2Upper > 0 && isFinite(chi2Upper) && chi2Lower > 0 && isFinite(chi2Lower)) {
    ci.variance = [ss / chi2Upper, ss / chi2Lower];
    ci.stddev = [Math.sqrt(ci.variance[0]), Math.sqrt(ci.variance[1])];
  }

  return ci;
}

/**
 * Compute stats + CI for an array of series.
 * @param {Array<{name:string, values:number[], color:string, visible?:boolean}>} series
 * @param {number} [confLevel=0.95] - Confidence level as fraction
 * @returns {Array<{name:string, color:string, stats:Object|null, ci:Object}>}
 */
export function computeSeriesStats(series, confLevel = 0.95) {
  return series
    .filter(s => s.visible !== false)
    .map(s => {
      const stats = computeStats(s.values);
      const ci = stats ? computeCI(stats, confLevel) : {};
      return { name: s.name, color: s.color, stats, ci };
    });
}

// ─── Column Definitions ─────────────────────────────────────

/**
 * Default column set for the statistics table.
 * Each entry: { key, i18nKey, ci? }
 * Modules can pass a subset via options.columns.
 */
const DEFAULT_COLUMNS = [
  { key: 'n',        i18nKey: 'n',        ci: false },
  { key: 'mean',     i18nKey: 'mean',     ci: true  },
  { key: 'stddev',   i18nKey: 'stddev',   ci: true  },
  { key: 'min',      i18nKey: 'min',      ci: false },
  { key: 'max',      i18nKey: 'max',      ci: false },
  { key: 'median',   i18nKey: 'median',   ci: false },
  { key: 'variance', i18nKey: 'variance', ci: true  },
  { key: 'range',    i18nKey: 'range',    ci: false },
  { key: 'skewness', i18nKey: 'skewness', ci: false },
  { key: 'kurtosis', i18nKey: 'kurtosis', ci: false },
];

// ─── Rendering ──────────────────────────────────────────────

/**
 * Render a statistics table into a container element.
 *
 * @param {HTMLElement} container - The panel element to render into
 * @param {Array} seriesStats - Result from computeSeriesStats()
 * @param {Object} options
 * @param {Object} options.i18n - i18n instance with .t() method
 * @param {number} [options.confLevel=95] - Confidence level as percentage (for label)
 * @param {Array}  [options.columns] - Column subset (default: all 10 columns)
 * @param {string} [options.cssPrefix='dmike'] - CSS class prefix for BEM overrides
 */
export function renderStatsTable(container, seriesStats, options = {}) {
  if (!container) return;

  if (!seriesStats || seriesStats.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = '';
  const i18n = options.i18n;
  const t = (k, params) => i18n ? i18n.t(`common.statsPanel.${k}`, params) : k;
  const confPct = options.confLevel ?? 95;
  const cols = options.columns || DEFAULT_COLUMNS;
  const prefix = options.cssPrefix || 'dmike';

  const ciTitle = escAttr(t('ciTitle', { n: confPct }));

  let html = `<table class="dmike-table ${prefix}-stats-table"><thead><tr>`;
  html += `<th>${t('series')}</th>`;
  cols.forEach(c => {
    html += `<th>${t(c.i18nKey)}</th>`;
  });
  html += '</tr></thead><tbody>';

  seriesStats.forEach(s => {
    html += '<tr>';
    html += `<td><span class="${prefix}-stats-color" style="background:${s.color}"></span>${esc(s.name)}</td>`;

    if (s.stats) {
      cols.forEach(c => {
        const val = s.stats[c.key];
        const valStr = c.key === 'n' ? val : (val != null ? val.toFixed(4) : '–');
        let cell = `${valStr}`;
        if (c.ci) {
          const bounds = s.ci[c.key];
          if (bounds && isFinite(bounds[0]) && isFinite(bounds[1])) {
            cell += ` <span class="${prefix}-stats-ci" title="${ciTitle}">[${fmtCI(bounds[0])};&nbsp;${fmtCI(bounds[1])}]</span>`;
          }
        }
        html += `<td>${cell}</td>`;
      });
    } else {
      cols.forEach(() => {
        html += '<td>–</td>';
      });
    }
    html += '</tr>';
  });

  html += '</tbody></table>';

  container.innerHTML = html;
}
