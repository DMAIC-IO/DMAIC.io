/**
 * D.Mike — Attributtest: Model.
 *
 * Gespeichert werden Testart, Eingabeart, Richtung, α, die Optionen der
 * Testarten, die Zusammenfassung (Zahlen) und die Spaltenbezüge je Rolle.
 * Testarten mit eigenen Feldern (Kreuztabelle, McNemar-Tafel,
 * Äquivalenzgrenzen) behalten sie über einen Wechsel; Testarten, die ein Feld
 * teilen (x/n für einen Anteil und eine Rate, x1/x2 der Zwei-Stichproben-Tests),
 * nutzen seinen Wert gewollt gemeinsam. Welche Felder im Stand wirken, sagt
 * `activeParams`. Das Ergebnis rechnet die Ableitung `result` aus Model und
 * Arbeitsblatt.
 */
import {
  defineModel, command, text, number, boolean, oneOf, object, list, columnRef, index,
} from '../../../core/model.js';
import { roundTo } from '../../../core/number-format.js';
import { requireForm } from '../../../core/validate.js';
import { from0 } from './migrations.js';
import { analyze, eventOptionsOf } from './analyze.js';
import { toReadResult } from './format.js';
import { effectiveEvent } from './event.js';

/** @typedef {import('./report.js').Result} Result */

/** Mindestanzahl Zeilen und Spalten der Kreuztabelle. */
export const MIN_DIM = 2;

/** Die Kreuztabelle eines frischen Stands. */
const defaultTable = () => ({ rows: ['A', 'B'], cols: ['X', 'Y'], counts: [[null, null], [null, null]] });
/** Die McNemar-Anzahlen eines frischen Stands. */
const defaultPairCounts = () => [[null, null], [null, null]];

/**
 * Hat die Kreuztabelle die gültige Form (mindestens 2 × 2, je Zeile eine
 * Anzahl je Spalte)?
 * @param {{ rows: readonly string[], cols: readonly string[], counts: readonly (readonly (number|null)[])[] }} t
 * @returns {boolean}
 */
function tableShapeOk(t) {
  return t.rows.length >= MIN_DIM && t.cols.length >= MIN_DIM && t.counts.length === t.rows.length
    && t.counts.every((row) => row.length === t.cols.length);
}

/**
 * Ist die McNemar-Tafel 2 × 2?
 * @param {readonly (readonly (number|null)[])[]} c @returns {boolean}
 */
const pairsShapeOk = (c) => c.length === 2 && c.every((row) => row.length === 2);

/** @param {any} m @param {string} k */
const isKind = (m, k) => m.testKind === k;
/** Testarten mit den Eingaben eines Anteils (Äquivalenz folgt der Stichprobenzahl). @param {any} m */
const oneSample = (m) => isKind(m, 'one') || (isKind(m, 'equiv') && m.equiv.samples === 1);
/** Testarten mit den Eingaben zweier Anteile. @param {any} m */
const twoSample = (m) => isKind(m, 'two') || (isKind(m, 'equiv') && m.equiv.samples === 2);

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    testKind: oneOf(['one', 'two', 'equiv', 'mcnemar', 'rate1', 'rate2', 'assoc'], { default: 'two' }),
    inputMode: oneOf(['summary', 'columns'], { default: 'summary' }),
    direction: oneOf(['two-sided', 'greater', 'less'], { default: 'two-sided' }),
    alpha: number({
      exclusiveMin: 0, exclusiveMax: 1,
      // Aus dem Konfidenzniveau; auf den erlaubten Bereich geklemmt.
      default: (c) => Math.min(0.9999, Math.max(0.0001, roundTo(1 - c.confidenceLevel / 100, 4))),
    }),
    p0: number({ nullable: true, exclusiveMin: 0, exclusiveMax: 1, default: 0.5 }),
    pooled: boolean(),
    ratePooled: boolean(),
    equiv: object({
      samples: oneOf([1, 2], { default: 2 }),
      symmetric: boolean({ default: true }),
      delta: number({ nullable: true }),
      lower: number({ nullable: true }),
      upper: number({ nullable: true }),
    }),
    exposurePerRow: number({ nullable: true, exclusiveMin: 0, default: 1 }),
    summary: object({
      x: number({ nullable: true, integer: true, min: 0 }),
      n: number({ nullable: true, integer: true, min: 0 }),
      x1: number({ nullable: true, integer: true, min: 0 }),
      n1: number({ nullable: true, integer: true, min: 0 }),
      x2: number({ nullable: true, integer: true, min: 0 }),
      n2: number({ nullable: true, integer: true, min: 0 }),
      t: number({ nullable: true, exclusiveMin: 0 }),
      t1: number({ nullable: true, exclusiveMin: 0 }),
      t2: number({ nullable: true, exclusiveMin: 0 }),
      lambda0: number({ nullable: true, exclusiveMin: 0 }),
      diff0: number({ nullable: true, default: 0 }),
      pairs: object({
        labels: object({ before: text(), after: text() }),
        counts: list(list(number({ nullable: true, integer: true, min: 0 })), {
          default: [[null, null], [null, null]],
        }),
      }),
      table: object({
        rows: list(text(), { default: ['A', 'B'] }),
        cols: list(text(), { default: ['X', 'Y'] }),
        counts: list(list(number({ nullable: true, integer: true, min: 0 })), {
          default: [[null, null], [null, null]],
        }),
      }),
    }),
    colRefs: object({
      response: columnRef({ minCount: 2 }),
      group: columnRef({ minCount: 2 }),
      rowVar: columnRef({ minCount: 2 }),
      colVar: columnRef({ minCount: 2 }),
      counts: columnRef({ minCount: 2 }),
      before: columnRef({ minCount: 2 }),
      after: columnRef({ minCount: 2 }),
    }),
    eventValue: text({ nullable: true }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
  },
  derived: {
    /**
     * Die Felder, die im aktuellen Stand wirken (Pfade wie `summary.x`).
     * Die Richtung wirkt beim Zusammenhangstest nur bei einer 2×2-Tabelle.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams(src) {
      const m = this;
      const params = ['testKind', 'inputMode', 'alpha'];
      const summary = m.inputMode === 'summary';
      if (isKind(m, 'equiv')) {
        params.push('equiv.samples', 'equiv.symmetric',
          ...(m.equiv.symmetric ? ['equiv.delta'] : ['equiv.lower', 'equiv.upper']));
      }
      if (oneSample(m)) {
        params.push(...(summary ? ['summary.x', 'summary.n'] : ['eventValue']), 'p0');
      } else if (twoSample(m)) {
        params.push(...(summary ? ['summary.x1', 'summary.n1', 'summary.x2', 'summary.n2'] : ['eventValue']));
      } else if (isKind(m, 'mcnemar')) {
        params.push(...(summary ? ['summary.pairs.labels.before', 'summary.pairs.labels.after'] : ['eventValue']));
      } else if (isKind(m, 'rate1')) {
        params.push(...(summary ? ['summary.x', 'summary.t'] : ['exposurePerRow']), 'summary.lambda0');
      } else if (isKind(m, 'rate2')) {
        params.push(...(summary ? ['summary.x1', 'summary.t1', 'summary.x2', 'summary.t2'] : ['exposurePerRow']),
          'summary.diff0', 'ratePooled');
      }
      if (showsDirection(m, src)) params.push('direction');
      if (isKind(m, 'two')) params.push('pooled');
      return params;
    },
    /**
     * Die Spaltenrollen, die im aktuellen Stand wirken; leer bei Eingabe als
     * Zusammenfassung.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeColumnSlots() {
      const m = this;
      if (m.inputMode !== 'columns') return [];
      const slots = [];
      if (oneSample(m) || twoSample(m)) slots.push('response');
      if (isKind(m, 'rate1') || isKind(m, 'rate2')) slots.push('counts');
      if (isKind(m, 'mcnemar')) slots.push('before', 'after');
      if (twoSample(m) || isKind(m, 'rate2')) slots.push('group');
      if (isKind(m, 'assoc')) slots.push('rowVar', 'colVar');
      return slots;
    },
    /**
     * Die Werte, die als Ereigniswert in Frage kommen: im Spaltenmodus die
     * verschiedenen Werte der Antwortspalte (McNemar: beider Paarspalten),
     * natürlich sortiert; sonst leer.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    eventValueOptions(src) {
      return eventOptionsOf(this, src);
    },
    /**
     * Der Ereigniswert, mit dem die Rechnung rechnet: der gespeicherte, wenn
     * er unter `eventValueOptions` ist, sonst deren letzter; ohne Optionen der
     * gespeicherte. Weicht er vom gespeicherten ab, wirkt dieser nicht.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {string|null}
     */
    effectiveEventValue(src) {
      return effectiveEvent(this.eventValue, eventOptionsOf(this, src));
    },
    /**
     * Der Testbericht mit `status: 'ok'`; ohne Ergebnis `status:
     * 'insufficient'` mit dem Grund als Schlüssel und als Text.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @param {unknown} _d
     * @param {(key: string) => string} t Übersetzer des Moduls
     * @this {import('./model.types.js').StateModel}
     * @returns {Result}
     */
    result(src, _d, t) {
      const a = analyze(this, src);
      if (a.status === 'ok') return toReadResult(a.report);
      return { status: 'insufficient', reason: a.reason, hint: a.hint, message: t(a.reason) };
    },
  },
  invariants: {
    tableShape: {
      fields: ['summary'],
      test(m) { return tableShapeOk(m.summary.table); },
      repair(m) { m._v.summary.table = defaultTable(); },
    },
    pairsShape: {
      fields: ['summary'],
      test(m) { return pairsShapeOk(m.summary.pairs.counts); },
      repair(m) { m._v.summary.pairs.counts = defaultPairCounts(); },
    },
  },
  commands: {
    setTableCell: command({
      params: {
        row: index('summary.table.rows', { existing: true }),
        col: index('summary.table.cols', { existing: true }),
        value: number({ nullable: true, integer: true, min: 0 }),
      },
      run({ row, col, value }) {
        const counts = this.summary.table.counts.map((r) => [...r]);
        counts[row][col] = value;
        this.summary.table.counts = counts;
      },
    }),
    setTableRowName: command({
      params: { row: index('summary.table.rows', { existing: true }), name: text() },
      run({ row, name }) {
        const rows = [...this.summary.table.rows];
        rows[row] = name;
        this.summary.table.rows = rows;
      },
    }),
    setTableColName: command({
      params: { col: index('summary.table.cols', { existing: true }), name: text() },
      run({ col, name }) {
        const cols = [...this.summary.table.cols];
        cols[col] = name;
        this.summary.table.cols = cols;
      },
    }),
    setPairCell: command({
      params: {
        row: index('summary.pairs.counts', { existing: true }),
        col: index('summary.pairs.counts', { existing: true }),
        value: number({ nullable: true, integer: true, min: 0 }),
      },
      run({ row, col, value }) {
        const counts = this.summary.pairs.counts.map((r) => [...r]);
        counts[row][col] = value;
        this.summary.pairs.counts = counts;
      },
    }),
    addRow: command({
      run() {
        const t = this.summary.table;
        t.rows = [...t.rows, String.fromCharCode(65 + t.rows.length)];
        t.counts = [...t.counts.map((r) => [...r]), t.cols.map(() => null)];
      },
    }),
    addCol: command({
      run() {
        const t = this.summary.table;
        const n = t.cols.length;
        t.cols = [...t.cols, n < 3 ? 'XYZ'[n] : `C${n + 1}`];
        t.counts = t.counts.map((r) => [...r, null]);
      },
    }),
    removeRow: command({
      params: { row: index('summary.table.rows', { existing: true }) },
      run({ row }) {
        const t = this.summary.table;
        requireForm('row', row, t.rows.length > MIN_DIM, `removing only while more than ${MIN_DIM} rows remain`);
        t.rows = t.rows.filter((_, i) => i !== row);
        t.counts = t.counts.filter((_, i) => i !== row).map((r) => [...r]);
      },
    }),
    removeCol: command({
      params: { col: index('summary.table.cols', { existing: true }) },
      run({ col }) {
        const t = this.summary.table;
        requireForm('col', col, t.cols.length > MIN_DIM, `removing only while more than ${MIN_DIM} columns remain`);
        t.cols = t.cols.filter((_, j) => j !== col);
        t.counts = t.counts.map((r) => r.filter((_, j) => j !== col));
      },
    }),
    checkEquivalence: command({
      run() {
        this.testKind = 'equiv';
        this.equiv.samples = 2;
      },
    }),
  },
}) {
  /**
   * Inhalt hat die Instanz, sobald eine Anzahl, eine Grenze, ein Δ₀ ≠ 0, eine
   * Zelle der Tafeln oder ein Spaltenbezug steht.
   * @returns {boolean}
   */
  hasContent() {
    const s = this.summary;
    const filled = (v) => v !== null && v !== undefined;
    const keys = ['x', 'n', 'x1', 'n1', 'x2', 'n2', 't', 't1', 't2', 'lambda0'];
    return keys.some((k) => filled(s[k]))
      || [this.equiv.delta, this.equiv.lower, this.equiv.upper].some(filled)
      || (filled(s.diff0) && s.diff0 !== 0)
      || s.table.counts.some((row) => row.some(filled))
      || s.pairs.counts.some((row) => row.some(filled))
      || Object.values(this.colRefs).some(Boolean);
  }
}

/**
 * Wirkt die Richtung im Stand? Nicht bei Äquivalenz; beim Zusammenhangstest
 * nur, wenn das Ergebnis eine 2×2-Tabelle ist.
 * @param {any} m @param {any} src @returns {boolean}
 */
export function showsDirection(m, src) {
  if (isKind(m, 'equiv')) return false;
  if (!isKind(m, 'assoc')) return true;
  const a = analyze(m, src);
  const t = a.status === 'ok' ? a.report.table : null;
  return !!t && t.cols.length === 2 && t.rows.length === 2;
}
