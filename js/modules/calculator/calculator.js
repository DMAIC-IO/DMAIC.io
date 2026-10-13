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
 *
 * @agent  Vollständig über das Viewmodel steuerbar: der Rechenbereich, die
 *   Eingabezeile, die Winkeleinheit, der Speicher, die beiden Datensätze, die
 *   Spezifikationsgrenzen und jede Rechnung samt ihrem Ergebnis. Bei der
 *   Oberfläche bleiben die Tastaturbedienung und das Umschalten der
 *   Winkeleinheit, für das es den absoluten Setzer gibt.
 */

import { createModule } from '../../core/template-module.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireEnum } from '../../core/agent/agent-argcheck.js';
import { State, evalExpression } from './calculator-model.js';

/** Die Rechenbereiche — dieselbe Menge wie `MODES` im Model. */
const MODES = ['sci', 'stats', 'sixsigma'];

/** Die Winkeleinheiten — dieselbe Menge wie `ANGLE_MODES` im Model. */
const ANGLE_MODES = ['DEG', 'RAD'];

// Die Funktionstasten, GENAU so, wie die Oberfläche sie schreibt: mit
// öffnender Klammer (`@click="inputFn('sqrt(')"`). Ein Prüfer, der 'sqrt'
// verlangte, wiese die Schreibweise ab, die das eigene Tastenfeld erzeugt.
const FN_TOKENS = [
  'sin(', 'cos(', 'tan(', 'asin(', 'acos(', 'atan(',
  'log(', 'ln(', 'sqrt(', 'cbrt(', 'exp(', 'fact(',
];

/** Die Kennwerte des Statistikbereichs — die `data-stat`-Werte der Vorlage. */
const STAT_TYPES = [
  'mean', 'median', 'mode', 'range', 'stdS', 'stdP', 'varS', 'varP',
  'sum', 'min', 'max', 'count', 'q1', 'q3', 'iqr', 'skew',
];

/** Die Kennwerte des Prozessbereichs — die `data-ss`-Werte der Vorlage. */
const SS_TYPES = [
  'cp', 'cpk', 'pp', 'ppk', 'sigma', 'dpmo', 'yield', 'zscore',
  'mean', 'std', 'ucl', 'lcl',
];

// Die Zeichen der Eingabezeile. Mehr als ein Zeichen ist erlaubt, weil der
// Speicherabruf eine ganze Zahl in die Zeile schreibt ('42', '-3.5', '1e-7').
const INPUT_RE = /^[0-9.+\-×÷^()πe]+$/;

// Eine Dezimalzahl, so wie sie `parseFloat` vollständig liest. Ohne das
// Vollmuster käme '0x10' durch, und `parseFloat('0x10')` ergäbe 0 — der
// gespeicherte Text und die Rechnung liefen auseinander.
const NUM_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Ein Zeichen oder eine Zahl für die Eingabezeile prüfen.
 * @param {any} value
 * @returns {string} der geprüfte Text
 * @throws {Error} wenn der Wert nicht aus den Zeichen der Eingabezeile besteht
 */
function requireInput(value) {
  if (typeof value !== 'string' || !INPUT_RE.test(value)) {
    throw new Error(`invalid ch ${JSON.stringify(value)}; allowed: digits, `
      + '. + - × ÷ ^ ( ) π e, or a number');
  }
  return value;
}

/**
 * Eine endliche Zahl prüfen. Eine Zeichenkette in Dezimalschreibweise wird
 * übernommen, weil die Oberfläche ihre Werte als Text aus der Eingabezeile
 * liest. Ein FEHLENDES Argument kommt als `undefined` an und wirft
 * (Ruling 55).
 * @param {string} name
 * @param {any} value
 * @returns {number} die geprüfte Zahl
 * @throws {Error} wenn der Wert keine endliche Zahl ist
 */
function requireFiniteNumber(name, value) {
  const n = typeof value === 'string' && NUM_RE.test(value.trim())
    ? Number(value.trim())
    : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new Error(`invalid ${name} ${JSON.stringify(value)}; allowed: a finite number`);
  }
  return n;
}

/**
 * Eine Spezifikationsgrenze prüfen. Der leere Text ist der dokumentierte
 * Leerwert und löscht die Grenze (Ruling 52); ein fehlendes Argument wirft.
 * @param {string} name
 * @param {any} value
 * @returns {string} die Grenze in der gespeicherten Textform
 * @throws {Error} wenn der Wert weder leer noch eine endliche Zahl ist
 */
function requireLimit(name, value) {
  const bad = () => new Error(`invalid ${name} ${JSON.stringify(value)}; `
    + 'allowed: a finite number, or "" to clear it');
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw bad();
    return String(value);
  }
  if (typeof value !== 'string') throw bad();
  const t = value.trim();
  if (t === '') return '';
  if (!NUM_RE.test(t)) throw bad();
  return t;
}

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
    icon: 'module.calculator',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...agentReadMixin(module),

      // ── Transient display state (not persisted) ───────────────
      exprText: '',
      resultText: '0',
      /** Icon name shown before resultText, or null for plain text (numbers,
       *  errors). Only the data-point confirmation case sets this — kept as
       *  its own field so setting resultText never has to embed a glyph. */
      resultIcon: null,
      isError: false,

      /** @type {(e:KeyboardEvent)=>void|null} */
      _keyHandler: null,

      // ── Display helpers ───────────────────────────────────────
      /** Push the model's current expression to the result line. */
      _syncDisplay() {
        this.isError = false;
        this.resultIcon = null;
        this.resultText = this.model.expression || '0';
      },
      _showResult(text) {
        this.isError = false;
        this.resultIcon = null;
        this.resultText = text;
      },
      _showError(msg) {
        this.isError = true;
        this.resultIcon = null;
        this.resultText = msg;
      },
      /** Like _showResult, but prefixed with a status icon (data-point
       *  confirmation only — numbers/errors never carry an icon). */
      _showResultWithIcon(icon, text) {
        this.isError = false;
        this.resultIcon = icon;
        this.resultText = text;
      },

      // ── Editing handlers ──────────────────────────────────────
      /**
       * Hängt ein Zeichen oder eine Zahl an die Eingabezeile an.
       * @agent
       * @param {string} ch das Zeichen, oder eine Zahl in Dezimalschreibweise.
       *   Jeder andere Wert ist ein Fehler.
       * @returns {string} die Eingabezeile nach dem Anhängen
       * @throws {Error} wenn der Wert nicht aus den Zeichen der Eingabezeile besteht
       */
      inputText(ch) {
        this.model.inputText(requireInput(ch));
        this._syncDisplay();
        return this.model.expression;
      },
      /**
       * Hängt eine Funktion samt öffnender Klammer an die Eingabezeile an.
       * @agent
       * @param {string} fn die Funktion, mit öffnender Klammer: sin(, cos(,
       *   tan(, asin(, acos(, atan(, log(, ln(, sqrt(, cbrt(, exp(, fact(.
       *   Jeder andere Wert ist ein Fehler.
       * @returns {string} die Eingabezeile nach dem Anhängen
       * @throws {Error} wenn `fn` keine dieser Funktionen ist
       */
      inputFn(fn) {
        requireEnum('fn', fn, FN_TOKENS);
        this.model.inputFn(fn);
        this._syncDisplay();
        return this.model.expression;
      },
      /**
       * Löscht das letzte Zeichen der Eingabezeile.
       * @agent
       * @returns {string} die Eingabezeile danach
       */
      backspace() {
        this.model.backspace();
        this._syncDisplay();
        return this.model.expression;
      },
      /**
       * Leert die Eingabezeile und das letzte Ergebnis.
       * @agent
       * @returns {void}
       */
      clear() {
        this.model.clearAll();
        this.exprText = '';
        this._showResult('0');
      },
      /**
       * Setzt die Winkeleinheit der trigonometrischen Funktionen.
       * @agent
       * @param {'DEG'|'RAD'} mode DEG rechnet in Grad, RAD in Radiant
       * @returns {void}
       * @throws {Error} wenn `mode` weder DEG noch RAD ist
       */
      setAngleMode(mode) {
        requireEnum('mode', mode, ANGLE_MODES);
        this.model.setAngleMode(mode);
      },
      /**
       * @noagent Umschaltung: das Ergebnis hängt allein am Vorzustand, ein
       * Agent setzt die Einheit darum absolut über `setAngleMode`. Eine
       * eigene Zuweisung steht hier nicht — die Taste geht durch denselben
       * Setzer.
       */
      toggleAngle() {
        this.setAngleMode(this.model.angleMode === 'DEG' ? 'RAD' : 'DEG');
      },
      /**
       * Legt den angezeigten Wert in den Speicher — das letzte Ergebnis,
       * sonst den gerechneten Wert der Eingabezeile.
       * @agent
       * @returns {number} der Wert, der nun im Speicher steht
       */
      memStore() {
        this.model.memStore();
        return this.model.memory;
      },
      /**
       * Setzt den Speicherwert.
       * @agent
       * @param {number} value der neue Speicherwert; 0 heißt leer. Ein Wert,
       *   der keine endliche Zahl ist, ist ein Fehler.
       * @returns {void}
       * @throws {Error} wenn `value` keine endliche Zahl ist
       */
      setMemory(value) {
        this.model.setMemory(requireFiniteNumber('value', value));
      },
      /**
       * Hängt den Speicherwert an die Eingabezeile an.
       * @agent
       * @returns {string} die Eingabezeile danach
       */
      memRecall() {
        // Bewusst NICHT über `this.inputText`: der Speicher kann einen Wert
        // tragen, den die Prüfung der Eingabezeile zu Recht ablehnt
        // (`Infinity` aus 1÷0). Die Prüfung schützt ein Agentenargument, kein
        // modulinternes Durchreichen.
        this.model.inputText(String(this.model.memory));
        this._syncDisplay();
        return this.model.expression;
      },
      /**
       * Wechselt den Rechenbereich und leert die Eingabezeile.
       * @agent
       * @param {'sci'|'stats'|'sixsigma'} m sci rechnet wissenschaftlich,
       *   stats wertet den Statistikdatensatz aus, sixsigma den
       *   Prozessdatensatz. Jeder andere Wert ist ein Fehler.
       * @returns {void}
       * @throws {Error} wenn `m` keiner dieser drei Bereiche ist
       */
      switchMode(m) {
        requireEnum('m', m, MODES);
        this.model.switchMode(m);
        this.exprText = '';
        this._showResult('0');
      },

      // ── Calculate (=) ─────────────────────────────────────────
      /**
       * Rechnet die Eingabezeile aus und merkt das Ergebnis.
       * @agent
       * @returns {string|null} das Ergebnis in Anzeigeform, oder null, wenn
       *   die Eingabezeile keinen rechenbaren Ausdruck enthält
       */
      calculate() {
        try {
          const result = evalExpression(this.model.expression, this.model.angleMode);
          this.exprText = `${this.model.expression  } =`;
          this._showResult(fmtCalc(result));
          this.model.lastResult = result;
          this.model.expression = '';
          return this.resultText;
        } catch {
          this._showError(this.t('error'));
          return null;
        }
      },

      // ── Statistics ────────────────────────────────────────────
      // Trotz des Namens eine Zustandsänderung: der Kennwert wird als
      // `lastResult` gemerkt, und das Feld ist persistiert. Als @noagent
      // wäre das ein Schreibweg, den ein Agent nicht nachvollziehen kann.
      /**
       * Rechnet einen Kennwert über den Statistikdatensatz und merkt ihn als
       * letztes Ergebnis.
       * @agent
       * @param {string} type der Kennwert: mean, median, mode, range, stdS,
       *   stdP, varS, varP, sum, min, max, count, q1, q3, iqr oder skew.
       *   Jeder andere Wert ist ein Fehler.
       * @returns {string|null} der Kennwert in Anzeigeform, oder null, wenn
       *   der Datensatz dafür zu klein ist oder keinen Modalwert hat
       * @throws {Error} wenn `type` keiner dieser Kennwerte ist
       */
      calcStat(type) {
        requireEnum('type', type, STAT_TYPES);
        const r = this.model.calcStat(type);
        this._applyResult(r);
        return r.error ? null : this.resultText;
      },

      // ── Six Sigma ─────────────────────────────────────────────
      /**
       * Rechnet einen Kennwert über den Prozessdatensatz und merkt ihn als
       * letztes Ergebnis.
       * @agent
       * @param {string} type der Kennwert: cp, cpk, pp, ppk, sigma, dpmo,
       *   yield, zscore, mean, std, ucl oder lcl. Jeder andere Wert ist ein
       *   Fehler.
       * @returns {string|null} der Kennwert in Anzeigeform, oder null, wenn
       *   der Datensatz zu klein ist oder die Spezifikationsgrenzen fehlen
       * @throws {Error} wenn `type` keiner dieser Kennwerte ist
       */
      calcSS(type) {
        requireEnum('type', type, SS_TYPES);
        const r = this.model.calcSS(type);
        this._applyResult(r);
        return r.error ? null : this.resultText;
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
      /**
       * Übernimmt die Eingabezeile als Wert in den Statistikdatensatz.
       * @agent
       * @returns {number|null} der übernommene Wert, oder null, wenn die
       *   Eingabezeile mit keiner Zahl beginnt
       */
      addData() {
        const v = this.model.addDataPoint();
        if (v !== null) {
          this.exprText = '';
          this._showResultWithIcon('status.ok', String(v));
        }
        return v;
      },
      /**
       * Hängt eine Zahl an den Statistikdatensatz an.
       * @agent
       * @param {number} value der Wert; eine Zahl in Dezimalschreibweise als
       *   Zeichenkette geht auch. Jeder andere Wert ist ein Fehler.
       * @returns {number} der angehängte Wert
       * @throws {Error} wenn `value` keine endliche Zahl ist
       */
      addDataValue(value) {
        const v = this.model.addDataValue(requireFiniteNumber('value', value));
        this.exprText = '';
        this._showResultWithIcon('status.ok', String(v));
        return v;
      },
      /**
       * Entfernt den letzten Wert des Statistikdatensatzes.
       * @agent
       * @returns {void}
       */
      removeLast() {
        this.model.removeLastData();
        this._showResult(this.t('removed'));
      },
      /**
       * Leert den Statistikdatensatz.
       * @agent
       * @returns {void}
       */
      clearData() {
        this.model.clearData();
        this.exprText = '';
        this._showResult('0');
      },
      /**
       * Übernimmt die Eingabezeile als Wert in den Prozessdatensatz.
       * @agent
       * @returns {number|null} der übernommene Wert, oder null, wenn die
       *   Eingabezeile mit keiner Zahl beginnt
       */
      addSSData() {
        const v = this.model.addSSDataPoint();
        if (v !== null) {
          this.exprText = '';
          this._showResultWithIcon('status.ok', String(v));
        }
        return v;
      },
      /**
       * Hängt eine Zahl an den Prozessdatensatz an.
       * @agent
       * @param {number} value der Wert; eine Zahl in Dezimalschreibweise als
       *   Zeichenkette geht auch. Jeder andere Wert ist ein Fehler.
       * @returns {number} der angehängte Wert
       * @throws {Error} wenn `value` keine endliche Zahl ist
       */
      addSSDataValue(value) {
        const v = this.model.addSSDataValue(requireFiniteNumber('value', value));
        this.exprText = '';
        this._showResultWithIcon('status.ok', String(v));
        return v;
      },
      /**
       * Entfernt den letzten Wert des Prozessdatensatzes.
       * @agent
       * @returns {void}
       */
      removeLastSS() {
        this.model.removeLastSSData();
        this._showResult(this.t('removed'));
      },
      /**
       * Leert den Prozessdatensatz.
       * @agent
       * @returns {void}
       */
      clearSSData() {
        this.model.clearSSData();
        this.exprText = '';
        this._showResult('0');
      },

      // ── Spec limits ───────────────────────────────────────────
      /**
       * Setzt die untere Spezifikationsgrenze.
       * @agent
       * @param {number|string} value die Grenze; der leere Text löscht sie.
       *   Ein Wert, der weder leer noch eine endliche Zahl ist, ist ein
       *   Fehler.
       * @returns {void}
       * @throws {Error} wenn `value` weder leer noch eine endliche Zahl ist
       */
      setLsl(value) {
        this.model.lsl = requireLimit('value', value);
      },
      /**
       * Setzt die obere Spezifikationsgrenze.
       * @agent
       * @param {number|string} value die Grenze; der leere Text löscht sie.
       *   Ein Wert, der weder leer noch eine endliche Zahl ist, ist ein
       *   Fehler.
       * @returns {void}
       * @throws {Error} wenn `value` weder leer noch eine endliche Zahl ist
       */
      setUsl(value) {
        this.model.usl = requireLimit('value', value);
      },

      // ── Keyboard ──────────────────────────────────────────────
      /** @noagent DOM event handler: packt ein Tastaturereignis aus und
       *  reicht es an die Aktionen weiter. */
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
      /** @noagent lifecycle, kein Zustandsweg. */
      init() {
        // Reflect restored state on mount (legacy setState → _updateDisplay).
        this.resultText = this.model.expression || '0';
        this._keyHandler = (e) => this.onKeydown(e);
        document.addEventListener('keydown', this._keyHandler);
      },
      /** @noagent lifecycle, kein Zustandsweg. */
      destroy() {
        if (this._keyHandler) {
          document.removeEventListener('keydown', this._keyHandler);
          this._keyHandler = null;
        }
      },
    };
  },
});
