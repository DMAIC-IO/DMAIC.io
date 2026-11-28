/**
 * D.Mike — Taschenrechner: Model.
 *
 * Rechenbereich, Eingabezeile, letztes Ergebnis, Speicher, Winkeleinheit, die
 * Datensätze des Statistik- und des Prozessbereichs und die
 * Spezifikationsgrenzen. Jede Taste ist ein Kommando; die Rechnungen stehen in
 * `calc.js`. Ohne DOM, ohne i18n.
 *
 * Gespeichert: `{ _schema, mode, expression, lastResult, memory, angleMode,
 * dataset, ssDataset, lsl, usl }`. Nicht endliche Ergebnisse (1÷0) liefern die
 * Kommandos zur Anzeige, gespeichert wird `null`.
 */
import {
  defineModel, command, list, number, text, oneOf, object, boolean,
} from '../../../core/model.js';
import { requireForm } from '../../../core/validate.js';
import { from0 } from './migrations.js';
import {
  INPUT_RE, evalExpression, leadingNumber, statOf, capabilityOf,
} from './calc.js';

/**
 * Die Kennwerte des Statistikbereichs (`calcStat`), je Taste `data-stat`.
 *
 * @typedef {object} StatKey
 * @property {string} mean  Mittelwert
 * @property {string} median  Median
 * @property {string} mode  Modalwert
 * @property {string} range  Spannweite
 * @property {string} stdS  Standardabweichung der Stichprobe
 * @property {string} stdP  Standardabweichung der Grundgesamtheit
 * @property {string} varS  Varianz der Stichprobe
 * @property {string} varP  Varianz der Grundgesamtheit
 * @property {string} sum  Summe
 * @property {string} min  kleinster Wert
 * @property {string} max  größter Wert
 * @property {string} count  Anzahl der Werte
 * @property {string} q1  unteres Quartil
 * @property {string} q3  oberes Quartil
 * @property {string} iqr  Quartilsabstand
 * @property {string} skew  Schiefe der Stichprobe
 */

/**
 * Die Kennwerte des Prozessbereichs (`calcSS`), je Taste `data-ss`.
 *
 * @typedef {object} CapabilityKey
 * @property {string} cp  Cp, mit σ innerhalb
 * @property {string} cpk  Cpk, mit σ innerhalb
 * @property {string} pp  Pp, mit Gesamtstreuung
 * @property {string} ppk  Ppk, mit Gesamtstreuung
 * @property {string} sigma  Sigma-Level (Z.bench), ohne 1,5-σ-Verschiebung
 * @property {string} dpmo  Fehler je Million
 * @property {string} yield  erwarteter Anteil gut in Prozent
 * @property {string} zscore  Z-Score zum Fehleranteil
 * @property {string} mean  Mittelwert
 * @property {string} std  Standardabweichung der Stichprobe
 * @property {string} ucl  obere Kontrollgrenze
 * @property {string} lcl  untere Kontrollgrenze
 */

/** @param {number} v @returns {number|null} die Zahl, wenn sie endlich ist */
const finite = (v) => (Number.isFinite(v) ? v : null);

/** @param {number|null|undefined} v @returns {boolean} eine Zahl, aber nicht endlich */
const infinite = (v) => v !== null && v !== undefined && !Number.isFinite(v);

/**
 * Ein Kennwert mit nicht endlichem Wert (oder Prozentanteil) trägt den Grund
 * `notFinite`; der Wert bleibt für die Anzeige stehen, gemerkt wird er nicht.
 * @template {{ value: number|null, percent?: number|null, reason: string|null }} T
 * @param {T} r @returns {T}
 */
const notFinite = (r) => (infinite(r.value) || infinite(r.percent) ? { ...r, reason: 'notFinite' } : r);

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** der aktive Rechenbereich: sci wissenschaftlich, stats Statistik, sixsigma Prozessfähigkeit */
    mode: oneOf(['sci', 'stats', 'sixsigma'], { default: 'sci' }),
    /** die Eingabezeile, so wie sie in der Anzeige steht */
    expression: text({ agentWrite: false }),
    /** das Ergebnis der letzten Rechnung; null, solange keines vorliegt */
    lastResult: number({ nullable: true, agentWrite: false }),
    /** der Speicherwert; 0 heißt leer */
    memory: number({ default: 0 }),
    /** die Winkeleinheit der Trigonometrie: DEG Grad, RAD Radiant */
    angleMode: oneOf(['DEG', 'RAD'], { default: 'DEG' }),
    /** die Werte des Statistikbereichs in Eingabereihenfolge */
    dataset: list(number()),
    /** die Werte des Prozessbereichs in Eingabereihenfolge */
    ssDataset: list(number()),
    /** die untere Spezifikationsgrenze; null heißt nicht gesetzt */
    lsl: number({ nullable: true }),
    /** die obere Spezifikationsgrenze; null heißt nicht gesetzt */
    usl: number({ nullable: true }),
  },
  view: {},
  commands: {
    inputText: command({
      params: { ch: text() },
      returns: text(),
      run({ ch }) {
        requireForm('ch', ch, INPUT_RE.test(ch), 'digits, . + - × ÷ ^ ( ) π e, or a number');
        this.append(ch);
        return this.expression;
      },
    }),
    inputFn: command({
      params: { fn: oneOf(['sin(', 'cos(', 'tan(', 'asin(', 'acos(', 'atan(', 'log(', 'ln(', 'sqrt(', 'cbrt(', 'exp(', 'fact(']) },
      returns: text(),
      run({ fn }) {
        if (this.lastResult !== null) {
          this.expression = '';
          this.lastResult = null;
        }
        this.expression += fn;
        return this.expression;
      },
    }),
    backspace: command({
      returns: text(),
      run() {
        this.expression = this.expression.slice(0, -1);
        return this.expression;
      },
    }),
    clear: command({
      run() { this.clearAll(); },
    }),
    memStore: command({
      returns: number(),
      run() {
        if (this.lastResult !== null) {
          this.memory = this.lastResult;
        } else {
          let v;
          try { v = evalExpression(this.expression, this.angleMode); } catch { v = 0; }
          this.memory = finite(v) ?? 0;
        }
        return this.memory;
      },
    }),
    memRecall: command({
      returns: text(),
      run() {
        this.append(String(this.memory));
        return this.expression;
      },
    }),
    switchMode: command({
      params: { m: oneOf(['sci', 'stats', 'sixsigma']) },
      returns: boolean(),
      run({ m }) {
        if (m === this.mode) return false;
        this.mode = m;
        this.clearAll();
        return true;
      },
    }),
    calculate: command({
      returns: object({
        value: number({ nullable: true }),
        reason: oneOf(['error', 'notFinite'], { nullable: true }),
        expression: text(),
      }),
      run() {
        const expression = this.expression;
        let value;
        try {
          value = evalExpression(expression, this.angleMode);
        } catch {
          return { value: null, reason: 'error', expression };
        }
        this.lastResult = finite(value);
        this.expression = '';
        return { value, reason: Number.isFinite(value) ? null : 'notFinite', expression };
      },
    }),
    calcStat: command({
      params: {
        type: oneOf(['mean', 'median', 'mode', 'range', 'stdS', 'stdP', 'varS', 'varP',
          'sum', 'min', 'max', 'count', 'q1', 'q3', 'iqr', 'skew']),
      },
      returns: object({
        value: number({ nullable: true }),
        modes: list(number(), { nullable: true }),
        reason: oneOf(['noData', 'noMode', 'needN2', 'needN3', 'notFinite'], { nullable: true }),
      }),
      run({ type }) {
        const r = statOf(this.dataset, type);
        this.lastResult = r.value === null ? null : finite(r.value);
        return notFinite(r);
      },
    }),
    calcSS: command({
      params: {
        type: oneOf(['cp', 'cpk', 'pp', 'ppk', 'sigma', 'dpmo', 'yield', 'zscore',
          'mean', 'std', 'ucl', 'lcl']),
      },
      returns: object({
        value: number({ nullable: true }),
        percent: number({ nullable: true }),
        reason: oneOf(['needData', 'needN2', 'needDataAndLimits', 'notFinite'], { nullable: true }),
      }),
      run({ type }) {
        const r = capabilityOf(this.ssDataset, this.lsl, this.usl, type);
        this.lastResult = r.value === null ? null : finite(r.value);
        return notFinite(r);
      },
    }),
    addData: command({
      returns: number({ nullable: true }),
      run() {
        const v = leadingNumber(this.expression);
        if (v === null || !Number.isFinite(v)) return null;
        this.dataset.push(v);
        this.expression = '';
        return v;
      },
    }),
    addDataValue: command({
      params: { value: number() },
      returns: number(),
      run({ value }) {
        this.dataset.push(value);
        this.expression = '';
        return value;
      },
    }),
    removeLast: command({
      run() { this.dataset.pop(); },
    }),
    clearData: command({
      run() {
        this.dataset = [];
        this.clearAll();
      },
    }),
    addSSData: command({
      returns: number({ nullable: true }),
      run() {
        const v = leadingNumber(this.expression);
        if (v === null || !Number.isFinite(v)) return null;
        this.ssDataset.push(v);
        this.expression = '';
        return v;
      },
    }),
    addSSDataValue: command({
      params: { value: number() },
      returns: number(),
      run({ value }) {
        this.ssDataset.push(value);
        this.expression = '';
        return value;
      },
    }),
    removeLastSS: command({
      run() { this.ssDataset.pop(); },
    }),
    clearSSData: command({
      run() {
        this.ssDataset = [];
        this.clearAll();
      },
    }),
  },
}) {
  /**
   * Inhalt hat der Rechner, sobald ein Wert, ein Ausdruck, ein Speicherwert
   * oder eine Grenze steht.
   * @returns {boolean}
   */
  hasContent() {
    return this.dataset.length > 0
      || this.ssDataset.length > 0
      || this.expression !== ''
      || this.memory !== 0
      || this.lsl !== null
      || this.usl !== null;
  }

  /** Leert Eingabezeile und letztes Ergebnis. */
  clearAll() {
    this.expression = '';
    this.lastResult = null;
  }

  /**
   * Hängt Text an die Eingabezeile. Nach einem Ergebnis beginnt eine Ziffer
   * oder ein Punkt neu, ein Operator rechnet mit dem Ergebnis weiter.
   * @param {string} ch
   */
  append(ch) {
    if (this.lastResult !== null && /[0-9.]/.test(ch)) {
      this.expression = '';
      this.lastResult = null;
    }
    if (this.lastResult !== null && /[+\-×÷^]/.test(ch)) {
      this.expression = String(this.lastResult);
      this.lastResult = null;
    }
    this.expression += ch;
  }
}
