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
import { h } from './dom.js';

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
/** Module-level defaults populated by `configureStatsPanel()` at bootstrap.
 *  Lets every `renderStatsTable()` caller inherit glossary wiring without
 *  threading it through five module call sites. */
const _config = {
  /** @type {?Set<string>} known glossary IDs (null = unknown, render all) */
  glossaryIds: null,
  /** @type {boolean} respects settings.glossary.inlineLinksEnabled */
  glossaryEnabled: true,
};

/**
 * Configure module-wide defaults for glossary wiring. Call once at app
 * bootstrap after the GlossaryRegistry has warmed; callers can still
 * override per-render via the same option keys.
 *
 * @param {object} opts
 * @param {Iterable<string>=} opts.glossaryIds       known glossary term IDs
 * @param {boolean=}          opts.glossaryEnabled   master toggle (default true)
 */
export function configureStatsPanel({ glossaryIds, glossaryEnabled } = {}) {
  if (glossaryIds !== undefined) _config.glossaryIds = new Set(glossaryIds);
  if (glossaryEnabled !== undefined) _config.glossaryEnabled = Boolean(glossaryEnabled);
}

const DEFAULT_COLUMNS = [
  { key: 'n',        i18nKey: 'n',        ci: false },
  { key: 'mean',     i18nKey: 'mean',     ci: true,  glossaryTerm: 'mittelwert' },
  { key: 'stddev',   i18nKey: 'stddev',   ci: true,  glossaryTerm: 'standardabweichung' },
  { key: 'min',      i18nKey: 'min',      ci: false },
  { key: 'max',      i18nKey: 'max',      ci: false },
  { key: 'median',   i18nKey: 'median',   ci: false, glossaryTerm: 'median' },
  { key: 'variance', i18nKey: 'variance', ci: true,  glossaryTerm: 'varianz' },
  { key: 'range',    i18nKey: 'range',    ci: false, glossaryTerm: 'spannweite' },
  { key: 'skewness', i18nKey: 'skewness', ci: false, glossaryTerm: 'schiefe' },
  { key: 'kurtosis', i18nKey: 'kurtosis', ci: false, glossaryTerm: 'kurtosis' },
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
    container.replaceChildren();
    return;
  }

  container.style.display = '';
  const i18n = options.i18n;
  const t = (k, params) => i18n ? i18n.t(`common.statsPanel.${k}`, params) : k;
  const confPct = options.confLevel ?? 95;
  const cols = options.columns || DEFAULT_COLUMNS;
  const prefix = options.cssPrefix || 'dmike';

  const ciTitle = t('ciTitle', { n: confPct });

  // Glossary inline-link policy:
  //   - Skip wrapping if a known set is provided and the term isn't in it,
  //     so we don't render dead links for terms whose entry doesn't exist yet.
  //   - Skip wrapping if the global toggle is off.
  //   - Per-call options override module-wide `_config` set via configureStatsPanel().
  //
  // The wrapper emits ONLY the marker span — the hover button (and its
  // icon, aria-label, etc.) is appended at runtime by augmentGlossaryTerms()
  // in core/glossary-inline.js. Keeps source-of-truth for presentation
  // in one place, so visual tweaks don't need to touch every emitter.
  const glossaryIds = options.glossaryIds instanceof Set ? options.glossaryIds : _config.glossaryIds;
  const glossaryEnabled = options.glossaryEnabled !== undefined ? Boolean(options.glossaryEnabled) : _config.glossaryEnabled;
  /** @returns {Node} a text node, or a `.glossary-term` marker span. */
  const wrapHeader = (label, termId) => {
    if (!termId || !glossaryEnabled) return document.createTextNode(label);
    if (glossaryIds && !glossaryIds.has(termId)) return document.createTextNode(label);
    return h('span', { class: 'glossary-term', 'data-glossary-term': termId }, label);
  };

  const headRow = h('tr', null, h('th', null, t('series')));
  cols.forEach(c => {
    headRow.append(h('th', null, wrapHeader(t(c.i18nKey), c.glossaryTerm)));
  });

  const body = h('tbody');
  seriesStats.forEach(s => {
    const row = h('tr', null,
      h('td', null,
        h('span', { class: `${prefix}-stats-color`, style: `background:${s.color}` }),
        s.name,
      ),
    );

    if (s.stats) {
      cols.forEach(c => {
        const val = s.stats[c.key];
        const valStr = c.key === 'n' ? String(val) : (val != null ? val.toFixed(4) : '–');
        const cell = h('td', null, valStr);
        if (c.ci) {
          const bounds = s.ci[c.key];
          if (bounds && isFinite(bounds[0]) && isFinite(bounds[1])) {
            // U+00A0 (non-breaking space) matches the legacy `&nbsp;` byte-for-byte.
            cell.append(
              ' ',
              h('span', { class: `${prefix}-stats-ci`, title: ciTitle },
                `[${fmtCI(bounds[0])}; ${fmtCI(bounds[1])}]`),
            );
          }
        }
        row.append(cell);
      });
    } else {
      cols.forEach(() => row.append(h('td', null, '–')));
    }
    body.append(row);
  });

  const table = h('table', { class: `dmike-table ${prefix}-stats-table` },
    h('thead', null, headRow),
    body,
  );

  container.replaceChildren(table);
}
