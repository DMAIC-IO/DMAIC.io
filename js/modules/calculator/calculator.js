/**
 * D.Mike — Scientific Calculator Module (calculator.js)
 * Data phase: scientific calculator with three modes —
 * Scientific, Statistics, and Six Sigma (Cp/Cpk/DPMO).
 */

import { normalCDF, normalQuantile } from '../../engines/math-utils.js';
import {
  mean, std as stdSample, variance, median, skewness,
} from '../../engines/distribution-fit-engine.js';

// ═══════════════════════════════════════════════════════════════
// Math helpers
// ═══════════════════════════════════════════════════════════════

/** @param {number} n */
function factorial(n) {
  n = Math.round(n);
  if (n < 0) return NaN;
  if (n <= 1) return 1;
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** Aliases for validated engine functions */
const normCDF = (z) => normalCDF(z);
const normInv = (p) => normalQuantile(p);

// Descriptive stats (not in engines)
function stdPop(d)    { const m = mean(d); return Math.sqrt(d.reduce((a, v) => a + (v - m) ** 2, 0) / d.length); }
function quantile(d, q) {
  const s = [...d].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
}
function modeCalc(d, noModeLabel) {
  const freq = {};
  d.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
  const maxF = Math.max(...Object.values(freq));
  const modes = Object.keys(freq).filter(k => freq[k] === maxF);
  return modes.length === d.length ? noModeLabel : modes.join(', ');
}

/** Format a numeric result for display */
function fmt(v) {
  if (typeof v === 'string') return v;
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) < 0.0001 || Math.abs(v) >= 1e8
    ? v.toExponential(6)
    : parseFloat(v.toPrecision(8)).toString();
}

// ═══════════════════════════════════════════════════════════════
// Expression evaluator
// ═══════════════════════════════════════════════════════════════

/**
 * @param {string} expr  Raw display expression
 * @param {string} angleMode  'DEG' or 'RAD'
 * @returns {number}
 */
function evalExpression(expr, angleMode) {
  const toRad  = angleMode === 'DEG' ? Math.PI / 180 : 1;
  const fromRad = angleMode === 'DEG' ? 180 / Math.PI : 1;

  let s = expr
    .replace(/π/g, `(${Math.PI})`)
    .replace(/(?<![a-z])e(?![a-z(])/gi, `(${Math.E})`)
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\^/g, '**');

  s = s.replace(/sin\(([^)]+)\)/g,  (_, a) => `Math.sin(${toRad}*(${a}))`);
  s = s.replace(/cos\(([^)]+)\)/g,  (_, a) => `Math.cos(${toRad}*(${a}))`);
  s = s.replace(/tan\(([^)]+)\)/g,  (_, a) => `Math.tan(${toRad}*(${a}))`);
  s = s.replace(/asin\(([^)]+)\)/g, (_, a) => `(${fromRad}*Math.asin(${a}))`);
  s = s.replace(/acos\(([^)]+)\)/g, (_, a) => `(${fromRad}*Math.acos(${a}))`);
  s = s.replace(/atan\(([^)]+)\)/g, (_, a) => `(${fromRad}*Math.atan(${a}))`);
  s = s.replace(/log\(([^)]+)\)/g,  'Math.log10($1)');
  s = s.replace(/ln\(([^)]+)\)/g,   'Math.log($1)');
  s = s.replace(/sqrt\(([^)]+)\)/g, 'Math.sqrt($1)');
  s = s.replace(/cbrt\(([^)]+)\)/g, 'Math.cbrt($1)');
  s = s.replace(/exp\(([^)]+)\)/g,  'Math.exp($1)');
  s = s.replace(/fact\(([^)]+)\)/g, '___fact($1)');

  // Safety — only allow math chars
  if (/[^0-9+\-*/().eE_ ,Matghsqrlocibnxpf]/.test(s.replace(/___fact/g, ''))) {
    throw new Error('invalid');
  }

  const ___fact = factorial;
  const result = new Function('Math', '___fact', `"use strict"; return (${s})`)(Math, ___fact);
  if (typeof result !== 'number' || isNaN(result)) throw new Error('error');
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Module export
// ═══════════════════════════════════════════════════════════════

export default {
  id: 'calculator',
  phase: 'data',
  icon: 'calculator',
  i18nKey: 'modules.calculator',
  version: '1.0.0',

  _container: null,
  _context: null,
  _mode: 'sci',        // 'sci' | 'stats' | 'sixsigma'
  _expression: '',
  _lastResult: null,
  _memory: 0,
  _angleMode: 'DEG',
  _dataset: [],
  _ssDataset: [],

  // DOM refs
  _els: {},

  /** @param {string} key */
  _t(key) {
    return this._context.i18n.t(`modules.calculator.${key}`);
  },

  // ── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    // Load module CSS
    if (!document.getElementById('calculator-css')) {
      const link = document.createElement('link');
      link.id = 'calculator-css';
      link.rel = 'stylesheet';
      link.href = 'js/modules/calculator/calculator.css';
      document.head.appendChild(link);
    }

    this._render();
    this._bindEvents();
  },

  async destroy() {
    this._container.innerHTML = '';
    this._els = {};
  },

  onLanguageChange() {
    this._render();
    this._bindEvents();
  },

  onThemeChange() { /* CSS custom properties handle this */ },

  getState() {
    return {
      mode: this._mode,
      expression: this._expression,
      lastResult: this._lastResult,
      memory: this._memory,
      angleMode: this._angleMode,
      dataset: [...this._dataset],
      ssDataset: [...this._ssDataset],
      lsl: this._els.lsl ? this._els.lsl.value : '',
      usl: this._els.usl ? this._els.usl.value : '',
    };
  },

  setState(data) {
    if (!data) return;
    this._mode = data.mode || 'sci';
    this._expression = data.expression || '';
    this._lastResult = data.lastResult ?? null;
    this._memory = data.memory || 0;
    this._angleMode = data.angleMode || 'DEG';
    this._dataset = data.dataset || [];
    this._ssDataset = data.ssDataset || [];

    this._render();
    this._bindEvents();

    // Restore spec limits
    if (data.lsl && this._els.lsl) this._els.lsl.value = data.lsl;
    if (data.usl && this._els.usl) this._els.usl.value = data.usl;

    // Update display
    this._updateDisplay();
    this._renderDataValues(this._dataset, 'data-display', 'data-count');
    this._renderDataValues(this._ssDataset, 'ss-data-display', 'ss-data-count');
  },

  help: () => import('./calculator-help.js'),

  // ── Rendering ──────────────────────────────────────────────

  _render() {
    const t = (k) => this._t(k);
    const modeActive = (m) => this._mode === m ? 'module-calculator__tab--active' : '';

    this._container.innerHTML = `
      <div class="module-calculator">
        <div class="module-calculator__wrap">

          <div class="module-calculator__tabs">
            <button class="module-calculator__tab ${modeActive('sci')}" data-mode="sci">${t('modeSci')}</button>
            <button class="module-calculator__tab ${modeActive('stats')}" data-mode="stats">${t('modeStats')}</button>
            <button class="module-calculator__tab ${modeActive('sixsigma')}" data-mode="sixsigma">${t('modeSixSigma')}</button>
          </div>

          <div class="module-calculator__display">
            <div class="module-calculator__expr" data-ref="expr"></div>
            <div class="module-calculator__result" data-ref="display">0</div>
            <div class="module-calculator__info">
              <span data-ref="angle-mode">${this._angleMode}</span>
              <span class="module-calculator__mem" data-ref="mem-ind">${this._memory !== 0 ? 'M' : ''}</span>
            </div>
          </div>

          <!-- SCIENTIFIC -->
          <div data-panel="sci" class="${this._mode !== 'sci' ? 'module-calculator__panel--hidden' : ''}">
            <div class="module-calculator__grid module-calculator__grid--5col">
              ${this._renderSciKeys()}
            </div>
          </div>

          <!-- STATISTICS -->
          <div data-panel="stats" class="${this._mode !== 'stats' ? 'module-calculator__panel--hidden' : ''}">
            <div class="module-calculator__data-panel">
              <label class="module-calculator__data-label">${t('datasetLabel')}</label>
              <div class="module-calculator__data-display" data-ref="data-display">
                <span class="module-calculator__val--empty">${t('noData')}</span>
              </div>
              <div class="module-calculator__data-count" data-ref="data-count">n = 0</div>
            </div>
            <div class="module-calculator__grid module-calculator__grid--4col">
              ${this._renderStatsKeys()}
            </div>
          </div>

          <!-- SIX SIGMA -->
          <div data-panel="sixsigma" class="${this._mode !== 'sixsigma' ? 'module-calculator__panel--hidden' : ''}">
            <div class="module-calculator__data-panel">
              <label class="module-calculator__data-label">${t('processDataLabel')}</label>
              <div class="module-calculator__data-display" data-ref="ss-data-display">
                <span class="module-calculator__val--empty">${t('noData')}</span>
              </div>
              <div class="module-calculator__data-count" data-ref="ss-data-count">n = 0</div>
            </div>
            <div class="module-calculator__cpk-inputs">
              <input type="number" class="field field--num" data-ref="lsl" placeholder="${t('lslPlaceholder')}">
              <input type="number" class="field field--num" data-ref="usl" placeholder="${t('uslPlaceholder')}">
            </div>
            <div class="module-calculator__grid module-calculator__grid--4col">
              ${this._renderSixSigmaKeys()}
            </div>
          </div>

        </div>
      </div>
    `;

    // Cache refs
    this._els = {};
    this._container.querySelectorAll('[data-ref]').forEach(el => {
      this._els[el.dataset.ref] = el;
    });
  },

  /** Render scientific mode buttons */
  _renderSciKeys() {
    const fn = (label, expr) => `<button class="module-calculator__key module-calculator__key--fn" data-fn="${expr}">${label}</button>`;
    const num = (n) => `<button class="module-calculator__key module-calculator__key--num" data-text="${n}">${n}</button>`;
    const op = (label, ch) => `<button class="module-calculator__key module-calculator__key--op" data-text="${ch}">${label}</button>`;
    const t = (k) => this._t(k);

    return [
      fn('sin', 'sin('), fn('cos', 'cos('), fn('tan', 'tan('), fn('log', 'log('), fn('ln', 'ln('),
      fn('sin⁻¹', 'asin('), fn('cos⁻¹', 'acos('), fn('tan⁻¹', 'atan('), fn('√', 'sqrt('), fn('∛', 'cbrt('),
      fn('eˣ', 'exp('), fn('π', 'π'), fn('e', 'e'), op('xʸ', '^'), fn('n!', 'fact('),
      fn('(', '('), fn(')', ')'),
      `<button class="module-calculator__key module-calculator__key--fn" data-action="toggle-angle">${t('degRad')}</button>`,
      `<button class="module-calculator__key module-calculator__key--fn" data-action="mem-store">MS</button>`,
      `<button class="module-calculator__key module-calculator__key--fn" data-action="mem-recall">MR</button>`,

      num('7'), num('8'), num('9'), op('/', '÷'),
      `<button class="module-calculator__key module-calculator__key--danger" data-action="clear">AC</button>`,

      num('4'), num('5'), num('6'), op('×', '×'),
      `<button class="module-calculator__key module-calculator__key--danger" data-action="backspace">⌫</button>`,

      num('1'), num('2'), num('3'), op('−', '-'),
      `<button class="module-calculator__key module-calculator__key--act" data-action="calculate">=</button>`,

      `<button class="module-calculator__key module-calculator__key--num module-calculator__key--wide" data-text="0">0</button>`,
      num('.'), op('+', '+'),
    ].join('');
  },

  /** Render statistics mode buttons */
  _renderStatsKeys() {
    const num = (n) => `<button class="module-calculator__key module-calculator__key--num" data-text="${n}">${n}</button>`;
    const stat = (label, fn) => `<button class="module-calculator__key module-calculator__key--stat" data-stat="${fn}">${label}</button>`;
    const t = (k) => this._t(k);

    return [
      num('7'), num('8'), num('9'),
      `<button class="module-calculator__key module-calculator__key--danger" data-action="backspace">⌫</button>`,

      num('4'), num('5'), num('6'),
      `<button class="module-calculator__key module-calculator__key--act" data-action="add-data">${t('addValue')}</button>`,

      num('1'), num('2'), num('3'),
      `<button class="module-calculator__key module-calculator__key--danger" data-action="clear-data">${t('clearData')}</button>`,

      num('0'), num('.'), num('-'),
      `<button class="module-calculator__key module-calculator__key--danger" data-action="remove-last">${t('removeLast')}</button>`,

      stat(`x̄ ${t('statMean')}`, 'mean'),
      stat(`x̃ ${t('statMedian')}`, 'median'),
      stat(t('statMode'), 'mode'),
      stat(t('statRange'), 'range'),

      stat(`s (${t('statSample')})`, 'stdS'),
      stat(`σ (${t('statPopulation')})`, 'stdP'),
      stat(`s² ${t('statVariance')}`, 'varS'),
      stat(`σ² ${t('statVariance')}`, 'varP'),

      stat(`Σ ${t('statSum')}`, 'sum'),
      stat('Min', 'min'),
      stat('Max', 'max'),
      stat(`n ${t('statCount')}`, 'count'),

      stat('Q1', 'q1'),
      stat('Q3', 'q3'),
      stat('IQR', 'iqr'),
      stat(t('statSkewness'), 'skew'),
    ].join('');
  },

  /** Render Six Sigma mode buttons */
  _renderSixSigmaKeys() {
    const num = (n) => `<button class="module-calculator__key module-calculator__key--num" data-text="${n}">${n}</button>`;
    const stat = (label, fn) => `<button class="module-calculator__key module-calculator__key--stat" data-ss="${fn}">${label}</button>`;
    const t = (k) => this._t(k);

    return [
      num('7'), num('8'), num('9'),
      `<button class="module-calculator__key module-calculator__key--danger" data-action="backspace">⌫</button>`,

      num('4'), num('5'), num('6'),
      `<button class="module-calculator__key module-calculator__key--act" data-action="add-ss-data">${t('addValue')}</button>`,

      num('1'), num('2'), num('3'),
      `<button class="module-calculator__key module-calculator__key--danger" data-action="clear-ss-data">${t('clearData')}</button>`,

      num('0'), num('.'), num('-'),
      `<button class="module-calculator__key module-calculator__key--danger" data-action="remove-last-ss">${t('removeLast')}</button>`,

      stat('Cp', 'cp'), stat('Cpk', 'cpk'), stat('Pp', 'pp'), stat('Ppk', 'ppk'),
      stat('Sigma-Level', 'sigma'), stat('DPMO', 'dpmo'), stat('Yield %', 'yield'), stat('Z-Score', 'zscore'),
      stat(`x̄ ${t('statMean')}`, 'mean'), stat(`σ ${t('statStdDev')}`, 'std'), stat('UCL', 'ucl'), stat('LCL', 'lcl'),
    ].join('');
  },

  // ── Event Binding ──────────────────────────────────────────

  _bindEvents() {
    const wrap = this._container.querySelector('.module-calculator__wrap');
    if (!wrap) return;

    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      // Text input
      if (btn.dataset.text !== undefined) {
        this._inputText(btn.dataset.text);
        return;
      }

      // Function input (sci)
      if (btn.dataset.fn !== undefined) {
        // π and e are text, not function wrappers
        if (btn.dataset.fn === 'π' || btn.dataset.fn === 'e' ||
            btn.dataset.fn === '(' || btn.dataset.fn === ')') {
          this._inputText(btn.dataset.fn);
        } else {
          this._inputFn(btn.dataset.fn);
        }
        return;
      }

      // Stat function
      if (btn.dataset.stat) {
        this._calcStat(btn.dataset.stat);
        return;
      }

      // Six Sigma function
      if (btn.dataset.ss) {
        this._calcSS(btn.dataset.ss);
        return;
      }

      // Mode switch
      if (btn.dataset.mode) {
        this._switchMode(btn.dataset.mode);
        return;
      }

      // Actions
      const action = btn.dataset.action;
      if (!action) return;

      switch (action) {
        case 'calculate':    this._calculate(); break;
        case 'clear':        this._clearAll(); break;
        case 'backspace':    this._backspace(); break;
        case 'toggle-angle': this._toggleAngle(); break;
        case 'mem-store':    this._memStore(); break;
        case 'mem-recall':   this._memRecall(); break;
        case 'add-data':     this._addDataPoint(); break;
        case 'clear-data':   this._clearData(); break;
        case 'remove-last':  this._removeLastData(); break;
        case 'add-ss-data':  this._addSSDataPoint(); break;
        case 'clear-ss-data':this._clearSSData(); break;
        case 'remove-last-ss':this._removeLastSSData(); break;
      }
    });

    // Keyboard
    this._keyHandler = (e) => {
      // Don't capture when typing in spec-limit inputs
      if (e.target.tagName === 'INPUT') return;

      if (e.key === 'Enter') {
        if (this._mode === 'stats') this._addDataPoint();
        else if (this._mode === 'sixsigma') this._addSSDataPoint();
        else this._calculate();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        this._clearAll();
      } else if (e.key === 'Backspace') {
        this._backspace();
        e.preventDefault();
      } else if (/^[0-9.+\-*/()^]$/.test(e.key)) {
        const map = { '*': '×', '/': '÷' };
        this._inputText(map[e.key] || e.key);
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  },

  // ── Calculator Logic ───────────────────────────────────────

  _inputText(ch) {
    if (this._lastResult !== null && /[0-9.]/.test(ch)) {
      this._expression = '';
      this._lastResult = null;
    }
    if (this._lastResult !== null && /[+\-×÷^]/.test(ch)) {
      this._expression = String(this._lastResult);
      this._lastResult = null;
    }
    this._expression += ch;
    this._updateDisplay();
  },

  _inputFn(fn) {
    if (this._lastResult !== null) {
      this._expression = '';
      this._lastResult = null;
    }
    this._expression += fn;
    this._updateDisplay();
  },

  _backspace() {
    this._expression = this._expression.slice(0, -1);
    this._updateDisplay();
  },

  _clearAll() {
    this._expression = '';
    this._lastResult = null;
    if (this._els.expr) this._els.expr.textContent = '';
    if (this._els.display) {
      this._els.display.textContent = '0';
      this._els.display.classList.remove('module-calculator__result--error');
    }
  },

  _updateDisplay() {
    if (!this._els.display) return;
    this._els.display.classList.remove('module-calculator__result--error');
    this._els.display.textContent = this._expression || '0';
  },

  _toggleAngle() {
    this._angleMode = this._angleMode === 'DEG' ? 'RAD' : 'DEG';
    if (this._els['angle-mode']) this._els['angle-mode'].textContent = this._angleMode;
  },

  _memStore() {
    if (this._lastResult !== null) {
      this._memory = this._lastResult;
    } else {
      try { this._memory = evalExpression(this._expression, this._angleMode); } catch { this._memory = 0; }
    }
    if (this._els['mem-ind']) this._els['mem-ind'].textContent = 'M';
  },

  _memRecall() {
    this._inputText(String(this._memory));
  },

  _calculate() {
    try {
      const result = evalExpression(this._expression, this._angleMode);
      if (this._els.expr) this._els.expr.textContent = this._expression + ' =';
      const formatted = Number.isInteger(result) ? String(result)
        : Math.abs(result) < 0.0001 || Math.abs(result) >= 1e10
          ? result.toExponential(8)
          : parseFloat(result.toPrecision(12)).toString();
      if (this._els.display) this._els.display.textContent = formatted;
      this._lastResult = result;
      this._expression = '';
    } catch {
      if (this._els.display) {
        this._els.display.textContent = this._t('error');
        this._els.display.classList.add('module-calculator__result--error');
      }
    }
  },

  _switchMode(m) {
    this._mode = m;
    this._container.querySelectorAll('.module-calculator__tab').forEach(tab => {
      tab.classList.toggle('module-calculator__tab--active', tab.dataset.mode === m);
    });
    this._container.querySelectorAll('[data-panel]').forEach(panel => {
      panel.classList.toggle('module-calculator__panel--hidden', panel.dataset.panel !== m);
    });
    this._clearAll();
  },

  // ── Data management ────────────────────────────────────────

  _renderDataValues(data, displayRef, countRef) {
    const dd = this._els[displayRef];
    const dc = this._els[countRef];
    if (!dd || !dc) return;

    if (data.length === 0) {
      dd.innerHTML = `<span class="module-calculator__val--empty">${this._t('noData')}</span>`;
      dc.textContent = 'n = 0';
    } else {
      dd.innerHTML = data.map(v => `<span class="module-calculator__val">${v}</span>`).join('');
      dc.textContent = `n = ${data.length}`;
      dd.scrollTop = dd.scrollHeight;
    }
  },

  _addDataPoint() {
    const v = parseFloat(this._expression);
    if (!isNaN(v)) {
      this._dataset.push(v);
      this._renderDataValues(this._dataset, 'data-display', 'data-count');
      this._expression = '';
      if (this._els.display) this._els.display.textContent = `✓ ${v}`;
      if (this._els.expr) this._els.expr.textContent = '';
    }
  },

  _removeLastData() {
    this._dataset.pop();
    this._renderDataValues(this._dataset, 'data-display', 'data-count');
    if (this._els.display) this._els.display.textContent = this._t('removed');
  },

  _clearData() {
    this._dataset = [];
    this._renderDataValues(this._dataset, 'data-display', 'data-count');
    this._clearAll();
  },

  _addSSDataPoint() {
    const v = parseFloat(this._expression);
    if (!isNaN(v)) {
      this._ssDataset.push(v);
      this._renderDataValues(this._ssDataset, 'ss-data-display', 'ss-data-count');
      this._expression = '';
      if (this._els.display) this._els.display.textContent = `✓ ${v}`;
      if (this._els.expr) this._els.expr.textContent = '';
    }
  },

  _removeLastSSData() {
    this._ssDataset.pop();
    this._renderDataValues(this._ssDataset, 'ss-data-display', 'ss-data-count');
    if (this._els.display) this._els.display.textContent = this._t('removed');
  },

  _clearSSData() {
    this._ssDataset = [];
    this._renderDataValues(this._ssDataset, 'ss-data-display', 'ss-data-count');
    this._clearAll();
  },

  // ── Statistics calculations ────────────────────────────────

  _showError(msg) {
    if (this._els.display) {
      this._els.display.textContent = msg;
      this._els.display.classList.add('module-calculator__result--error');
    }
  },

  _calcStat(type) {
    if (this._dataset.length === 0) {
      this._showError(this._t('noData'));
      return;
    }
    const d = this._dataset;
    let result, label;

    switch (type) {
      case 'mean':   result = mean(d); label = 'x̄'; break;
      case 'median': result = median(d); label = 'x̃'; break;
      case 'mode':   result = modeCalc(d, this._t('noMode')); label = this._t('statMode'); break;
      case 'range':  result = Math.max(...d) - Math.min(...d); label = this._t('statRange'); break;
      case 'stdS':   if (d.length < 2) { result = this._t('needN2'); } else { result = stdSample(d); } label = 's'; break;
      case 'stdP':   result = stdPop(d); label = 'σ'; break;
      case 'varS':   if (d.length < 2) { result = this._t('needN2'); } else { result = stdSample(d) ** 2; } label = 's²'; break;
      case 'varP':   result = stdPop(d) ** 2; label = 'σ²'; break;
      case 'sum':    result = d.reduce((a, b) => a + b, 0); label = 'Σ'; break;
      case 'min':    result = Math.min(...d); label = 'Min'; break;
      case 'max':    result = Math.max(...d); label = 'Max'; break;
      case 'count':  result = d.length; label = 'n'; break;
      case 'q1':     result = quantile(d, 0.25); label = 'Q1'; break;
      case 'q3':     result = quantile(d, 0.75); label = 'Q3'; break;
      case 'iqr':    result = quantile(d, 0.75) - quantile(d, 0.25); label = 'IQR'; break;
      case 'skew':   if (d.length < 3) { result = this._t('needN3'); } else { result = skewness(d); } label = this._t('statSkewness'); break;
    }

    if (this._els.expr) this._els.expr.textContent = label;
    if (this._els.display) {
      this._els.display.classList.remove('module-calculator__result--error');
      this._els.display.textContent = fmt(result);
    }
    this._lastResult = typeof result === 'number' ? result : null;
  },

  // ── Six Sigma calculations ─────────────────────────────────

  _calcSS(type) {
    const d = this._ssDataset;
    const lsl = this._els.lsl ? parseFloat(this._els.lsl.value) : NaN;
    const usl = this._els.usl ? parseFloat(this._els.usl.value) : NaN;
    const hasLimits = !isNaN(lsl) && !isNaN(usl);
    const hasData = d.length >= 2;

    let result, label;

    switch (type) {
      case 'mean':
        if (!d.length) { this._showError(this._t('needData')); return; }
        result = mean(d); label = 'x̄'; break;
      case 'std':
        if (!hasData) { this._showError(this._t('needN2')); return; }
        result = stdSample(d); label = 'σ'; break;
      case 'cp':
        if (!hasData || !hasLimits) { this._showError(this._t('needDataAndLimits')); return; }
        result = (usl - lsl) / (6 * stdSample(d)); label = 'Cp'; break;
      case 'cpk':
        if (!hasData || !hasLimits) { this._showError(this._t('needDataAndLimits')); return; }
        { const m = mean(d), s = stdSample(d);
          result = Math.min((usl - m) / (3 * s), (m - lsl) / (3 * s)); }
        label = 'Cpk'; break;
      case 'pp':
        if (!hasData || !hasLimits) { this._showError(this._t('needDataAndLimits')); return; }
        result = (usl - lsl) / (6 * stdPop(d)); label = 'Pp'; break;
      case 'ppk':
        if (!hasData || !hasLimits) { this._showError(this._t('needDataAndLimits')); return; }
        { const m = mean(d), s = stdPop(d);
          result = Math.min((usl - m) / (3 * s), (m - lsl) / (3 * s)); }
        label = 'Ppk'; break;
      case 'sigma':
        if (!hasData || !hasLimits) { this._showError(this._t('needDataAndLimits')); return; }
        { const m = mean(d), s = stdSample(d);
          const cpk = Math.min((usl - m) / (3 * s), (m - lsl) / (3 * s));
          result = cpk * 3; }
        label = 'Sigma'; break;
      case 'dpmo':
        if (!hasData || !hasLimits) { this._showError(this._t('needDataAndLimits')); return; }
        { const m = mean(d), s = stdSample(d);
          const pBelow = normCDF((lsl - m) / s);
          const pAbove = 1 - normCDF((usl - m) / s);
          result = Math.round((pBelow + pAbove) * 1e6); }
        label = 'DPMO'; break;
      case 'yield':
        if (!hasData || !hasLimits) { this._showError(this._t('needDataAndLimits')); return; }
        { const m = mean(d), s = stdSample(d);
          const pOK = normCDF((usl - m) / s) - normCDF((lsl - m) / s);
          result = (pOK * 100).toFixed(4) + '%'; }
        label = 'Yield'; break;
      case 'zscore':
        if (!hasData || !hasLimits) { this._showError(this._t('needDataAndLimits')); return; }
        { const m = mean(d), s = stdSample(d);
          const pBelow = normCDF((lsl - m) / s);
          const pAbove = 1 - normCDF((usl - m) / s);
          const defectRate = pBelow + pAbove;
          result = -normInv(defectRate); }
        label = 'Z-Score'; break;
      case 'ucl':
        if (!hasData) { this._showError(this._t('needN2')); return; }
        result = mean(d) + 3 * stdSample(d); label = 'UCL'; break;
      case 'lcl':
        if (!hasData) { this._showError(this._t('needN2')); return; }
        result = mean(d) - 3 * stdSample(d); label = 'LCL'; break;
    }

    if (this._els.expr) this._els.expr.textContent = label;
    if (this._els.display) {
      this._els.display.classList.remove('module-calculator__result--error');
      this._els.display.textContent = fmt(result);
    }
    this._lastResult = typeof result === 'number' ? result : null;
  },
};
