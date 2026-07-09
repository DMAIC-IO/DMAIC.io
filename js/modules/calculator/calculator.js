/**
 * D.Mike — Scientific Calculator Module (calculator.js)
 * Data phase: scientific calculator with three modes —
 * Scientific, Statistics, and Six Sigma (Cp/Cpk/DPMO).
 *
 * Migrated to createModule + Alpine CSP. The Model (calculator-model.js) holds
 * the persisted state (mode, expression, lastResult, memory, angleMode,
 * datasets, spec limits) plus all pure computation logic. The data-fn owns the
 * transient display strings (expr line, result line, error flag), display
 * formatting, event handlers, and the keyboard listener.
 */

import { createModule } from '../../core/template-module.js';
import { State, evalExpression } from './calculator-model.js';

/** Format a stat/Six-Sigma numeric result for display. */
function fmt(v) {
  if (typeof v === 'string') return v;
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) < 0.0001 || Math.abs(v) >= 1e8
    ? v.toExponential(6)
    : parseFloat(v.toPrecision(8)).toString();
}

/** Format a calculator (=) result for display. */
function fmtCalc(result) {
  return Number.isInteger(result) ? String(result)
    : Math.abs(result) < 0.0001 || Math.abs(result) >= 1e10
      ? result.toExponential(8)
      : parseFloat(result.toPrecision(12)).toString();
}

export default createModule({
  config: {
    id: 'calculator',
    engine: 'alpine',
    phase: 'data',
    icon: 'calculator',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(_module, _t) {
    return {
      // ── Transient display state (not persisted) ───────────────
      exprText: '',
      resultText: '0',
      isError: false,

      /** @type {(e:KeyboardEvent)=>void|null} */
      _keyHandler: null,

      // ── Display helpers ───────────────────────────────────────
      /** Push the model's current expression to the result line. */
      _syncDisplay() {
        this.isError = false;
        this.resultText = this.model.expression || '0';
      },
      _showResult(text) {
        this.isError = false;
        this.resultText = text;
      },
      _showError(msg) {
        this.isError = true;
        this.resultText = msg;
      },

      // ── Editing handlers ──────────────────────────────────────
      inputText(ch) {
        this.model.inputText(ch);
        this._syncDisplay();
      },
      inputFn(fn) {
        this.model.inputFn(fn);
        this._syncDisplay();
      },
      backspace() {
        this.model.backspace();
        this._syncDisplay();
      },
      clear() {
        this.model.clearAll();
        this.exprText = '';
        this._showResult('0');
      },
      toggleAngle() {
        this.model.toggleAngle();
      },
      memStore() {
        this.model.memStore();
      },
      memRecall() {
        this.inputText(String(this.model.memory));
      },
      switchMode(m) {
        this.model.switchMode(m);
        this.exprText = '';
        this._showResult('0');
      },

      // ── Calculate (=) ─────────────────────────────────────────
      calculate() {
        try {
          const result = evalExpression(this.model.expression, this.model.angleMode);
          this.exprText = `${this.model.expression  } =`;
          this._showResult(fmtCalc(result));
          this.model.lastResult = result;
          this.model.expression = '';
        } catch {
          this._showError(this.t('error'));
        }
      },

      // ── Statistics ────────────────────────────────────────────
      calcStat(type) {
        const r = this.model.calcStat(type);
        this._applyResult(r);
      },

      // ── Six Sigma ─────────────────────────────────────────────
      calcSS(type) {
        const r = this.model.calcSS(type);
        this._applyResult(r);
      },

      /** Render a {value|text|error, symbol|labelKey} result object.
       *
       * `r.soft === true` marks informational sub-messages (needN2, needN3,
       * noMode) that legacy rendered as plain text WITHOUT the error styling.
       * Only genuine errors (noData, and all Six Sigma errors) use the red
       * error class via _showError.
       */
      _applyResult(r) {
        if (r.error) {
          if (r.soft) {
            // Plain-text display — same as a normal result, just no numeric value.
            const label = r.symbol || (r.labelKey ? this.t(r.labelKey) : '');
            this.exprText = label;
            this._showResult(this.t(r.error));
            this.model.lastResult = null;
          } else {
            this._showError(this.t(r.error));
            this.model.lastResult = null;
          }
          return;
        }
        const label = r.symbol || (r.labelKey ? this.t(r.labelKey) : '');
        this.exprText = label;
        if (typeof r.value === 'number') {
          this._showResult(fmt(r.value));
          this.model.lastResult = r.value;
        } else {
          this._showResult(r.text);
          this.model.lastResult = null;
        }
      },

      // ── Dataset handlers ──────────────────────────────────────
      addData() {
        const v = this.model.addDataPoint();
        if (v !== null) {
          this.exprText = '';
          this._showResult(`✓ ${  v}`);
        }
      },
      removeLast() {
        this.model.removeLastData();
        this._showResult(this.t('removed'));
      },
      clearData() {
        this.model.clearData();
        this.exprText = '';
        this._showResult('0');
      },
      addSSData() {
        const v = this.model.addSSDataPoint();
        if (v !== null) {
          this.exprText = '';
          this._showResult(`✓ ${  v}`);
        }
      },
      removeLastSS() {
        this.model.removeLastSSData();
        this._showResult(this.t('removed'));
      },
      clearSSData() {
        this.model.clearSSData();
        this.exprText = '';
        this._showResult('0');
      },

      // ── Keyboard ──────────────────────────────────────────────
      onKeydown(e) {
        // Don't capture when typing in spec-limit inputs
        if (e.target.tagName === 'INPUT') return;

        if (e.key === 'Enter') {
          if (this.model.mode === 'stats') this.addData();
          else if (this.model.mode === 'sixsigma') this.addSSData();
          else this.calculate();
          e.preventDefault();
        } else if (e.key === 'Escape') {
          this.clear();
        } else if (e.key === 'Backspace') {
          this.backspace();
          e.preventDefault();
        } else if (/^[0-9.+\-*/()^]$/.test(e.key)) {
          const map = { '*': '×', '/': '÷' };
          this.inputText(map[e.key] || e.key);
        }
      },

      // ── Lifecycle (per Alpine component instance) ─────────────
      init() {
        // Reflect restored state on mount (legacy setState → _updateDisplay).
        this.resultText = this.model.expression || '0';
        this._keyHandler = (e) => this.onKeydown(e);
        document.addEventListener('keydown', this._keyHandler);
      },
      destroy() {
        if (this._keyHandler) {
          document.removeEventListener('keydown', this._keyHandler);
          this._keyHandler = null;
        }
      },
    };
  },
});
