/**
 * D.Mike — Modelldaten-Generator: Model.
 *
 * Gespeichert sind die Faktoren mit ihrem Bereich, die höchste
 * Wechselwirkungsordnung, die Koeffizienten je Term (dünn: nur β ≠ 0, nach
 * Termindex), Achsenabschnitt, Name der Ausgabe, Stichprobenverfahren,
 * Umfang, Rauschen und Startwert. Die erzeugten Zeilen sind nie gespeichert:
 * sie folgen deterministisch aus diesem Stand (`rowsOf`). Ohne DOM, ohne i18n.
 */
import {
  defineModel, command, list, object, number, text, oneOf, map, index, unchecked,
} from '../../../core/model.js';
import { requireIndex, requireNumber, requireText, requireForm } from '../../../core/validate.js';
import { finiteOrNull } from '../../../core/agent/agent-results.js';
import { from0, from1_0 } from './migrations.js';
import { buildTerms, termLabel, rowsOf, summaryOf } from './sample.js';

/** Die Vorgabefaktoren; zugleich die Grundlage von `hasContent`. */
const DEFAULT_FACTORS = Object.freeze([
  Object.freeze({ name: 'Temperatur', min: 150, max: 250 }),
  Object.freeze({ name: 'Druck', min: 1, max: 10 }),
  Object.freeze({ name: 'Zeit', min: 5, max: 60 }),
]);

/**
 * Zahl der Terme eines Stands.
 * @param {{ factors: ReadonlyArray<unknown>, maxOrder: number }} m @returns {number}
 */
export function termCountOf(m) {
  return buildTerms(m.factors.length, m.maxOrder).length;
}

/**
 * Ein Term des Modells mit seinem Koeffizienten.
 *
 * @typedef {object} Term
 * @property {number} index  Termindex, die Adresse für setBeta
 * @property {string} label  Name des Terms, z. B. „A × B“
 * @property {number} order  Ordnung (1 Haupteffekt, 2 Zweifach-Wechselwirkung, …)
 * @property {number} beta  Koeffizient β, 0 wenn nicht gesetzt
 */

/**
 * Die Zusammenfassung der erzeugten Y-Werte.
 *
 * @typedef {object} Generated
 * @property {number} n  Zahl der erzeugten Zeilen
 * @property {number|null} mean  Mittelwert von Y
 * @property {number|null} sd  Standardabweichung von Y
 * @property {number|null} min  kleinster Y-Wert
 * @property {number|null} max  größter Y-Wert
 */

export class State extends defineModel({
  version: '1.1',
  migrations: { '0→1.0': from0, '1.0→1.1': from1_0 },
  fields: {
    /** die Faktoren mit Name und Bereich; die Position ist die Adresse */
    factors: list(object({ name: text(), min: number(), max: number() }), {
      default: [
        { name: 'Temperatur', min: 150, max: 250 },
        { name: 'Druck', min: 1, max: 10 },
        { name: 'Zeit', min: 5, max: 60 },
      ],
    }),
    /** höchste Wechselwirkungsordnung der Terme */
    maxOrder: number({ integer: true, min: 0, default: 3, agentWrite: false }),
    /** Koeffizienten je Termindex, nur β ≠ 0 */
    betas: map(number({ integer: true, min: 0 }), number()),
    /** Achsenabschnitt β₀ */
    intercept: number({ default: 50 }),
    /** Name der Ausgabespalte */
    yName: text({ default: 'Y' }),
    /** Stichprobenverfahren */
    samplingMethod: oneOf(['random', 'lhs', 'fullfactorial'], { default: 'random' }),
    /** Zahl der Zeilen (beim Vollfaktorplan ein Richtwert) */
    sampleSize: number({ integer: true, min: 10, max: 100000, default: 100 }),
    /** Standardabweichung des Rauschens σε */
    noiseStd: number({ min: 0, default: 2 }),
    /** Startwert des Zufallsgenerators */
    seed: number({ integer: true, default: 42 }),
  },
  invariants: {
    factorRange: {
      fields: ['factors'],
      test(m) { return m.factors.every((f) => f.min <= f.max); },
      repair(m) {
        m._v.factors = m._v.factors.map((f) => (f.min <= f.max ? f : { ...f, min: f.max, max: f.min }));
      },
    },
    factorCount: {
      fields: ['factors'],
      test(m) { return m.factors.length >= 1; },
      repair(m) { m._v.factors = DEFAULT_FACTORS.map((f) => ({ ...f })); },
    },
    betaKeys: {
      fields: ['betas', 'factors', 'maxOrder'],
      test(m) {
        const count = termCountOf(m);
        return Object.entries(m.betas).every(([k, v]) => Number(k) < count && v !== 0);
      },
      repair(m) {
        const count = termCountOf(m._v);
        m._v.betas = Object.fromEntries(Object.entries(m._v.betas).filter(([k, v]) => Number(k) < count && v !== 0));
      },
    },
  },
  commands: {
    addFactor: command({
      returns: number({ integer: true }),
      run() {
        this.factors = [...this.factors, { name: `Faktor_${this.factors.length + 1}`, min: 0, max: 100 }];
        this.betas = {};
        return this.factors.length - 1;
      },
    }),
    removeFactor: command({
      params: { index: index('factors', { existing: true }) },
      run({ index: i }) {
        requireForm('index', i, this.factors.length > 1, 'none, the last factor stays');
        this.betas = {};
        this.factors = this.factors.filter((_, k) => k !== i);
      },
    }),
    setFactor: command({
      params: { index: index('factors', { existing: true }), key: oneOf(['name', 'min', 'max']), value: unchecked() },
      run({ index: i, key, value }) {
        const f = this.factors[i];
        /** @type {string|number} */
        let v;
        if (key === 'name') {
          v = requireText('value', value);
          requireForm('value', v, v.trim() !== '', 'a non-empty name');
          const taken = this.factors.some((g, k) => k !== i && g.name === v) || this.yName === v;
          requireForm('value', v, !taken, 'a name no other factor or Y uses');
        } else if (key === 'min') {
          v = requireNumber('value', value, { max: f.max });
        } else {
          v = requireNumber('value', value, { min: f.min });
        }
        this.factors = this.factors.map((g, k) => (k === i ? { ...g, [key]: v } : g));
      },
    }),
    setBeta: command({
      params: { index: number({ integer: true, min: 0 }), value: unchecked() },
      run({ index: i, value }) {
        requireIndex('index', i, termCountOf(this), { existing: true });
        const v = requireNumber('value', value);
        const next = { ...this.betas };
        if (v === 0) delete next[String(i)];
        else next[String(i)] = v;
        this.betas = next;
      },
    }),
  },
  derived: {
    /**
     * Alle Terme des Modells mit ihren Koeffizienten, auch die Nullen.
     * @this {import('./model.types.js').StateModel}
     * @returns {Term[]}
     */
    terms() {
      return buildTerms(this.factors.length, this.maxOrder).map((indices, i) => ({
        index: i,
        label: termLabel(indices, this.factors),
        order: indices.length,
        beta: this.betas[String(i)] ?? 0,
      }));
    },
    /**
     * Die Zusammenfassung der erzeugten Y-Werte.
     * @this {import('./model.types.js').StateModel}
     * @returns {Generated}
     */
    generated() {
      const { columns } = rowsOf(this);
      const s = summaryOf(columns[columns.length - 1]);
      return { n: s.n, mean: finiteOrNull(s.mean), sd: finiteOrNull(s.sd), min: finiteOrNull(s.min), max: finiteOrNull(s.max) };
    },
  },
}) {
  /**
   * Inhalt hat der Generator wie in der Altform: Achsenabschnitt, Ausgabename,
   * ein Koeffizient oder die Faktoren weichen von der Vorgabe ab.
   * @returns {boolean}
   */
  hasContent() {
    if (this.intercept !== 50 || this.yName !== 'Y') return true;
    if (Object.keys(this.betas).length > 0) return true;
    if (this.factors.length !== DEFAULT_FACTORS.length) return true;
    return this.factors.some((f, i) => f.name !== DEFAULT_FACTORS[i].name
      || f.min !== DEFAULT_FACTORS[i].min || f.max !== DEFAULT_FACTORS[i].max);
  }
}
