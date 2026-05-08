/**
 * D.Mike — Model Data Generator Module (model-data-generator.js)
 * Data phase: generates synthetic datasets from configurable regression models.
 * Supports factors with min/max ranges, interaction terms up to 5th order,
 * configurable beta coefficients, multiple sampling methods (Monte Carlo, LHS,
 * full factorial), noise injection, and seeded PRNG for reproducibility.
 */

import { DataGrid } from '../../core/datagrid/datagrid.js';
import { openGridInWorksheet } from '../../core/datagrid/datagrid-to-worksheet.js';
import { descriptiveStats } from '../../engines/normality-test-engine.js';

// ═══════════════════════════════════════════════════════════════
// Seeded PRNG — Mulberry32
// ═══════════════════════════════════════════════════════════════

/** @param {number} seed */
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller transform for normal variates */
function boxMuller(rng) {
  let u1;
  do { u1 = rng(); } while (u1 === 0);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
}

// ═══════════════════════════════════════════════════════════════
// Term builder — generates all interaction terms up to maxOrder
// ═══════════════════════════════════════════════════════════════

/**
 * Build all interaction terms from `nFactors` factors up to `maxOrder`.
 * Each term is an array of factor indices.
 * @param {number} nFactors
 * @param {number} maxOrder
 * @returns {number[][]}
 */
function buildTerms(nFactors, maxOrder) {
  const results = [];
  const mo = Math.min(maxOrder, nFactors);
  function recurse(start, cur) {
    if (cur.length > 0 && cur.length <= mo) results.push([...cur]);
    if (cur.length >= mo) return;
    for (let i = start; i < nFactors; i++) {
      cur.push(i);
      recurse(i + 1, cur);
      cur.pop();
    }
  }
  recurse(0, []);
  return results;
}

/**
 * Get human-readable label for a term.
 * @param {number[]} term
 * @param {{ name: string }[]} factors
 * @returns {string}
 */
function termLabel(term, factors) {
  if (term.length === 1) return factors[term[0]]?.name || `X${term[0] + 1}`;
  return term.map(i => factors[i]?.name || `X${i + 1}`).join(' \u00d7 ');
}

// ═══════════════════════════════════════════════════════════════
// Sampling methods
// ═══════════════════════════════════════════════════════════════

/**
 * Generate data rows using Monte Carlo random sampling.
 * @param {object[]} factors
 * @param {number[][]} terms
 * @param {Record<number,number>} betas
 * @param {number} intercept
 * @param {string} yName
 * @param {number} n
 * @param {number} noiseStd
 * @param {function} rng
 * @returns {object[]}
 */
function sampleRandom(factors, terms, betas, intercept, yName, n, noiseStd, rng) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = {};
    const xn = [];
    factors.forEach((f, fi) => {
      const v = f.min + rng() * (f.max - f.min);
      row[f.name] = v;
      xn.push(f.max !== f.min ? (v - f.min) / (f.max - f.min) : 0);
    });
    let y = intercept;
    terms.forEach((t, ti) => {
      y += (betas[ti] ?? 0) * t.reduce((a, fi) => a * xn[fi], 1);
    });
    y += boxMuller(rng) * noiseStd;
    row[yName] = y;
    rows.push(row);
  }
  return rows;
}

/**
 * Generate data rows using Latin Hypercube Sampling.
 */
function sampleLHS(factors, terms, betas, intercept, yName, n, noiseStd, rng) {
  const k = factors.length;
  const perms = [];
  for (let fi = 0; fi < k; fi++) {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    perms.push(p);
  }
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = {};
    const xn = [];
    factors.forEach((f, fi) => {
      const lo = perms[fi][i] / n;
      const hi = (perms[fi][i] + 1) / n;
      const u = lo + rng() * (hi - lo);
      const v = f.min + u * (f.max - f.min);
      row[f.name] = v;
      xn.push(f.max !== f.min ? (v - f.min) / (f.max - f.min) : 0);
    });
    let y = intercept;
    terms.forEach((t, ti) => {
      y += (betas[ti] ?? 0) * t.reduce((a, fi) => a * xn[fi], 1);
    });
    y += boxMuller(rng) * noiseStd;
    row[yName] = y;
    rows.push(row);
  }
  return rows;
}

/**
 * Generate data rows using full factorial design.
 */
function sampleFullFactorial(factors, terms, betas, intercept, yName, n, noiseStd, rng) {
  const levels = factors.length <= 4 ? 3 : 2;
  const lvlVals = factors.map(f => {
    const a = [];
    for (let l = 0; l < levels; l++) {
      a.push(f.min + (l / (levels - 1)) * (f.max - f.min));
    }
    return a;
  });

  function cartesian(arrs) {
    return arrs.reduce((acc, arr) => acc.flatMap(x => arr.map(y => [...x, y])), [[]]);
  }

  const combos = cartesian(lvlVals);
  const reps = Math.max(1, Math.round(n / combos.length));
  const rows = [];
  combos.forEach(combo => {
    for (let r = 0; r < reps; r++) {
      const row = {};
      const xn = [];
      combo.forEach((v, fi) => {
        row[factors[fi].name] = v;
        xn.push(factors[fi].max !== factors[fi].min
          ? (v - factors[fi].min) / (factors[fi].max - factors[fi].min) : 0);
      });
      let y = intercept;
      terms.forEach((t, ti) => {
        y += (betas[ti] ?? 0) * t.reduce((a, fi) => a * xn[fi], 1);
      });
      y += boxMuller(rng) * noiseStd;
      row[yName] = y;
      rows.push(row);
    }
  });
  return rows;
}

// ═══════════════════════════════════════════════════════════════
// Module export
// ═══════════════════════════════════════════════════════════════

export default {
  id: 'model-data-generator',
  phase: 'data',
  icon: 'function',
  i18nKey: 'modules.model-data-generator',
  version: '1.0.0',

  _container: null,
  _context: null,
  _factors: [],
  _maxOrder: 3,
  _intercept: 50,
  _betas: {},
  _terms: [],
  _yName: 'Y',
  _generatedData: null,
  _previewGrid: null,

  // ─── State defaults ────────────────────────────────────────
  _samplingMethod: 'random',
  _sampleSize: 100,
  _noiseStd: 2,
  _seed: 42,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('model-data-generator-css')) {
      const link = document.createElement('link');
      link.id = 'model-data-generator-css';
      link.rel = 'stylesheet';
      link.href = 'js/modules/model-data-generator/model-data-generator.css';
      document.head.appendChild(link);
    }

    // Initialize with defaults if no state loaded
    if (!this._factors.length) {
      this._factors = [
        { name: 'Temperatur', min: 150, max: 250 },
        { name: 'Druck', min: 1, max: 10 },
        { name: 'Zeit', min: 5, max: 60 },
      ];
    }
    this._rebuildTerms();
    this._render();
  },

  async destroy() {
    this._destroyPreviewGrid();
    this._container = null;
    this._context = null;
    this._generatedData = null;
  },

  _destroyPreviewGrid() {
    if (this._previewGrid) {
      try { this._previewGrid.destroy(); } catch (e) { /* ignore */ }
      this._previewGrid = null;
    }
  },

  onLanguageChange() { this._destroyPreviewGrid(); this._render(); },
  onThemeChange() { /* CSS variables handle theming */ },

  getState() {
    return {
      factors: this._factors,
      maxOrder: this._maxOrder,
      intercept: this._intercept,
      betas: { ...this._betas },
      yName: this._yName,
      samplingMethod: this._samplingMethod,
      sampleSize: this._sampleSize,
      noiseStd: this._noiseStd,
      seed: this._seed,
    };
  },

  setState(data) {
    if (!data) return;
    this._factors = data.factors || this._factors;
    this._maxOrder = data.maxOrder ?? this._maxOrder;
    this._intercept = data.intercept ?? this._intercept;
    this._betas = data.betas || {};
    this._yName = data.yName || 'Y';
    this._samplingMethod = data.samplingMethod || 'random';
    this._sampleSize = data.sampleSize ?? 100;
    this._noiseStd = data.noiseStd ?? 2;
    this._seed = data.seed ?? 42;
    this._rebuildTerms();
  },

  help: () => import('./model-data-generator-help.js'),

  // ─── Helpers ────────────────────────────────────────────────

  _t(key) { return this._context.i18n.t(`modules.model-data-generator.${key}`); },

  _esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },

  _rebuildTerms() {
    this._terms = buildTerms(this._factors.length, this._maxOrder);
  },

  // ─── Main Render ────────────────────────────────────────────

  _render() {
    this._destroyPreviewGrid();
    this._container.innerHTML = `
      <div class="module-mdg">
        <div class="mdg-content" id="mdg-content"></div>
      </div>`;
    this._renderModelTab(this._container.querySelector('#mdg-content'));
  },

  _renderFactorRows() {
    const list = this._container.querySelector('#mdg-factor-list');
    if (!list) return;
    list.innerHTML = '';
    this._factors.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'mdg-factor-grid mdg-factor-grid--row';
      row.innerHTML = `
        <input class="field mdg-inp" type="text" value="${this._esc(f.name)}" data-idx="${i}" data-field="name">
        <input class="field mdg-inp mdg-inp--center" type="number" value="${f.min}" data-idx="${i}" data-field="min">
        <input class="field mdg-inp mdg-inp--center" type="number" value="${f.max}" data-idx="${i}" data-field="max">
        ${this._factors.length > 1
          ? `<button class="btn btn--icon-sm btn--danger mdg-btn-remove" data-idx="${i}" title="Entfernen">\u00d7</button>`
          : '<span></span>'}`;
      list.appendChild(row);
    });

    // Event delegation for factor inputs
    list.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      const field = e.target.dataset.field;
      if (isNaN(idx) || !field) return;
      if (field === 'name') {
        this._factors[idx].name = e.target.value;
      } else {
        this._factors[idx][field] = parseFloat(e.target.value) || 0;
      }
      this._generatedData = null;
    });

    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.mdg-btn-remove');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      this._factors.splice(idx, 1);
      this._betas = {};
      this._generatedData = null;
      this._rebuildTerms();
      this._renderModelTab(this._container.querySelector('#mdg-content'));
    });
  },

  // ─── Tab: Model (Factors + Betas combined) ─────────────────

  _renderModelTab(container) {
    const t = (k) => this._t(k);
    this._rebuildTerms();

    container.innerHTML = `
      <div class="module-mdg-split dmike-split">
        <aside class="dmike-split__input mdg-input">
          <div class="dmike-split__section-title">${t('factorsTitle')}</div>
          <div class="mdg-factor-grid mdg-factor-grid--header">
            <span class="mdg-label">${t('factorName')}</span>
            <span class="mdg-label">Min</span>
            <span class="mdg-label">Max</span>
            <span></span>
          </div>
          <div id="mdg-factor-list"></div>
          <button class="btn btn--secondary mdg-btn-add" id="mdg-btn-add-factor">+ ${t('addFactor')}</button>

          <div class="dmike-split__section-title">${t('outputTitle')}</div>
          <input class="field mdg-inp" type="text" id="mdg-y-name" value="${this._esc(this._yName)}" placeholder="Y">

          <div class="dmike-split__section-title">${t('generateTitle')}</div>
          <div class="mdg-control-group">
            <label class="mdg-label">${t('samplingMethod')}</label>
            <select class="field mdg-inp mdg-select" id="mdg-sampling">
              <option value="random"${this._samplingMethod === 'random' ? ' selected' : ''}>${t('methodRandom')}</option>
              <option value="lhs"${this._samplingMethod === 'lhs' ? ' selected' : ''}>${t('methodLHS')}</option>
              <option value="fullfactorial"${this._samplingMethod === 'fullfactorial' ? ' selected' : ''}>${t('methodFullFactorial')}</option>
            </select>
          </div>
          <div class="mdg-triple-grid">
            <div class="mdg-control-group">
              <label class="mdg-label">${t('sampleSize')}</label>
              <input class="field mdg-inp mdg-inp--center" type="number" id="mdg-sample-size" value="${this._sampleSize}" min="10" max="100000">
            </div>
            <div class="mdg-control-group">
              <label class="mdg-label">${t('noise')} (\u03c3\u03b5)</label>
              <input class="field mdg-inp mdg-inp--center" type="number" id="mdg-noise" value="${this._noiseStd}" min="0">
            </div>
            <div class="mdg-control-group">
              <label class="mdg-label">Seed</label>
              <input class="field mdg-inp mdg-inp--center" type="number" id="mdg-seed" value="${this._seed}">
            </div>
          </div>

          <button class="dmike-btn-run" id="mdg-btn-generate-inline">\u25b6 ${t('generate')}</button>
        </aside>

        <main class="dmike-split__output mdg-output">
          <div class="dmike-split__output-section">${t('modelTitle')}</div>
          <p class="mdg-section__desc">${t('modelDesc')}</p>

          <div class="mdg-equation" id="mdg-equation"></div>

          <div class="dmike-split__output-section">${t('coefficients')}</div>

          <div class="mdg-group-label">${t('intercept')}</div>
          <div class="mdg-beta-grid">
            <div class="mdg-beta-item">
              <span class="mdg-beta-name">${t('intercept')}</span>
              <span class="mdg-beta-eq">\u03b2\u2080=</span>
              <input class="field mdg-inp mdg-beta-inp" type="number" id="mdg-intercept" value="${this._intercept}">
            </div>
          </div>

          <div id="mdg-beta-editor"></div>

          <div id="mdg-results-section" style="display:none">
            <div class="dmike-split__output-section">${t('statsTitle')}</div>
            <div class="dmike-kpi-strip" id="mdg-stats-grid"></div>

            <div class="dmike-split__output-section">${t('previewTitle')} <span id="mdg-row-count" class="mdg-row-count"></span></div>
            <div class="dmike-embedded-grid dmike-embedded-grid--md" id="mdg-data-table"></div>
          </div>
        </main>
      </div>`;

    this._renderFactorRows();
    this._renderEquation();
    this._renderBetaEditor();

    // ── Input panel events ──
    container.querySelector('#mdg-btn-add-factor').addEventListener('click', () => {
      this._factors.push({ name: `Faktor_${this._factors.length + 1}`, min: 0, max: 100 });
      this._betas = {};
      this._generatedData = null;
      this._rebuildTerms();
      this._renderModelTab(container);
    });

    container.querySelector('#mdg-y-name').addEventListener('input', (e) => {
      this._yName = e.target.value.trim() || 'Y';
      this._generatedData = null;
      this._renderEquation();
    });

    // ── Output panel events ──
    container.querySelector('#mdg-intercept').addEventListener('input', (e) => {
      this._intercept = parseFloat(e.target.value) || 0;
      this._generatedData = null;
      this._renderEquation();
    });

    container.querySelector('#mdg-btn-generate-inline').addEventListener('click', () => this._generate());

    // Restore previously generated data view if present
    if (this._generatedData && this._generatedData.length) {
      this._showResults();
    }

    // ── Generation settings events ──
    container.querySelector('#mdg-sampling').addEventListener('change', (e) => {
      this._samplingMethod = e.target.value;
    });
    container.querySelector('#mdg-sample-size').addEventListener('input', (e) => {
      this._sampleSize = parseInt(e.target.value) || 100;
    });
    container.querySelector('#mdg-noise').addEventListener('input', (e) => {
      this._noiseStd = parseFloat(e.target.value) || 0;
    });
    container.querySelector('#mdg-seed').addEventListener('input', (e) => {
      this._seed = parseInt(e.target.value) || 0;
    });
  },

  _renderEquation() {
    const el = this._container.querySelector('#mdg-equation');
    if (!el) return;

    let html = `<span class="mdg-eq-y">${this._esc(this._yName)}</span>`
      + `<span class="mdg-eq-op"> = </span>`
      + `<span class="mdg-eq-intercept">${this._intercept}</span>`;

    this._terms.forEach((t, i) => {
      const b = this._betas[i] ?? 0;
      if (b === 0) return;
      const v = t.map(fi => this._factors[fi]?.name || `X${fi + 1}`).join('\u00b7');
      const sign = b > 0 ? '+' : '\u2212';
      html += ` ${sign} ${Math.abs(b)}\u00b7${this._esc(v)}`;
    });

    html += `<span class="mdg-eq-eps"> + \u03b5</span>`;
    el.innerHTML = html;
  },

  _renderBetaEditor() {
    const wrap = this._container.querySelector('#mdg-beta-editor');
    if (!wrap) return;

    const grouped = {};
    this._terms.forEach((t, i) => {
      const order = t.length;
      const lbl = order === 1
        ? this._t('mainEffects')
        : `${order}-${this._t('wayInteractions')}`;
      if (!grouped[lbl]) grouped[lbl] = [];
      grouped[lbl].push({ term: t, idx: i });
    });

    let html = '';
    for (const [group, items] of Object.entries(grouped)) {
      html += `<div class="mdg-group-label">${this._esc(group)}</div><div class="mdg-beta-grid">`;
      items.forEach(({ term, idx }) => {
        const label = termLabel(term, this._factors);
        const val = this._betas[idx] ?? 0;
        html += `
          <div class="mdg-beta-item">
            <span class="mdg-beta-name" title="${this._esc(label)}">${this._esc(label)}</span>
            <span class="mdg-beta-eq">\u03b2=</span>
            <input class="field mdg-inp mdg-beta-inp" type="number" value="${val}" data-beta-idx="${idx}">
          </div>`;
      });
      html += '</div>';
    }
    wrap.innerHTML = html;

    // Event delegation for beta inputs
    wrap.addEventListener('input', (e) => {
      const idx = e.target.dataset.betaIdx;
      if (idx === undefined) return;
      this._betas[parseInt(idx)] = parseFloat(e.target.value) || 0;
      this._generatedData = null;
      this._renderEquation();
    });
  },

  // ─── Generate Data ─────────────────────────────────────────

  _generate() {
    this._rebuildTerms();
    const rng = mulberry32(this._seed);
    const n = Math.min(100000, Math.max(10, this._sampleSize));

    switch (this._samplingMethod) {
      case 'random':
        this._generatedData = sampleRandom(
          this._factors, this._terms, this._betas,
          this._intercept, this._yName, n, this._noiseStd, rng);
        break;
      case 'lhs':
        this._generatedData = sampleLHS(
          this._factors, this._terms, this._betas,
          this._intercept, this._yName, n, this._noiseStd, rng);
        break;
      case 'fullfactorial':
        this._generatedData = sampleFullFactorial(
          this._factors, this._terms, this._betas,
          this._intercept, this._yName, n, this._noiseStd, rng);
        break;
    }

    this._showResults();
  },

  _showResults() {
    const inline = this._container.querySelector('#mdg-results-section');
    if (inline) inline.style.display = '';

    this._renderStats();
    this._renderPreview();
  },

  // ─── Stats ─────────────────────────────────────────────────

  _renderStats() {
    if (!this._generatedData?.length) return;
    const sec = this._container.querySelector('#mdg-stats-section');
    if (sec) sec.style.display = '';

    const yv = this._generatedData.map(r => r[this._yName]);
    const ds = descriptiveStats(yv);

    const fmt = v => {
      if (Math.abs(v) >= 1e6 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(4);
      return v.toFixed(4);
    };

    const t = (k) => this._t(k);
    const grid = this._container.querySelector('#mdg-stats-grid');
    if (!grid) return;

    grid.innerHTML = [
      { l: 'N', v: ds.n },
      { l: t('statMean'), v: fmt(ds.mean) },
      { l: t('statStd'), v: fmt(ds.stdDev) },
      { l: 'Min', v: fmt(ds.min) },
      { l: 'Max', v: fmt(ds.max) },
    ].map(s => `
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${s.v}</div>
        <div class="dmike-kpi-label">${s.l}</div>
      </div>`).join('');
  },

  // ─── Preview (DataGrid) ────────────────────────────────────

  _renderPreview() {
    if (!this._generatedData?.length) return;
    const sec = this._container.querySelector('#mdg-preview-section');
    if (sec) sec.style.display = '';

    const countLabel = this._container.querySelector('#mdg-row-count');
    if (countLabel) countLabel.textContent = `(${this._generatedData.length} ${this._t('rows')})`;

    const wrap = this._container.querySelector('#mdg-data-table');
    if (!wrap) return;

    // Convert row-oriented data to column-oriented DataGrid format
    const colNames = Object.keys(this._generatedData[0]);
    const columns = colNames.map(name => ({
      name,
      type: 'numeric',
      values: this._generatedData.map(r => r[name]),
      format: { decimals: 4 },
    }));

    // Recreate the DataGrid
    this._destroyPreviewGrid();
    wrap.innerHTML = '';
    this._previewGrid = new DataGrid(wrap, {
      toast: this._context.notify || (() => {}),
      t: (key) => this._context.i18n.t(key),
      openInWorksheet: (grid) => {
        const name = this._context.i18n.t('modules.model-data-generator.name') || 'Generated Data';
        openGridInWorksheet(grid, this._context, {
          sheetName: name,
          navigate: true,
        });
      },
    });
    this._previewGrid.setData(columns);
  },

};
