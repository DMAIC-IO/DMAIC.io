/**
 * D.Mike — Konturdiagramm: Model.
 *
 * Gespeichert werden das Regressionsmodell (Form, Koeffizienten oder eigene
 * Formel), Achsenbereiche und Beschriftungen und die drei Spalten der
 * Messpunkte. Fläche, Formelfehler und Messpunkte sind Ableitungen aus Model
 * und Arbeitsblatt. Ansicht: die Editor-Einstellungen des Diagramms.
 */
import { defineModel, list, number, text, oneOf, columnRef, datasets } from '../../../core/model.js';
import contourChart from '../../../widgets/contour-chart/schema.js';
import { validateFormula } from './formula.js';
import { sampleSurface } from './surface.js';
import { from0 } from './migrations.js';

/** @type {readonly ('quadratic'|'interaction'|'custom')[]} */
export const MODEL_TYPES = Object.freeze(['quadratic', 'interaction', 'custom']);

/**
 * @typedef {object} SurfacePoint
 * @property {number} x  Lage in x
 * @property {number} y  Lage in y
 * @property {number} z  Wert der Fläche
 */

/**
 * @typedef {object} Surface
 * @property {number} zMin  kleinster Wert
 * @property {number} zMax  größter Wert
 * @property {number} range  Spannweite zMax − zMin
 * @property {SurfacePoint} optimum  Lage des größten Werts
 */

/**
 * @typedef {object} FormulaError
 * @property {string} code  Fehlerart der Formel (z. B. UNKNOWN_FUNCTION, SYNTAX)
 * @property {string} [token]  das beanstandete Wort
 */

/**
 * @typedef {object} DataPoint
 * @property {number} x  Wert der x-Spalte
 * @property {number} y  Wert der y-Spalte
 * @property {number} z  Wert der z-Spalte
 */

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    modelType: oneOf(['quadratic', 'interaction', 'custom'], { default: 'quadratic' }),
    b: list(number(), { default: [50, 8, 5, -3, -2, 1.5] }),
    customFormula: text({ default: '50 + 8*x + 5*y - 3*x*x - 2*y*y + 1.5*x*y' }),
    xLabel: text(),
    yLabel: text(),
    zLabel: text(),
    xMin: number({ default: -3 }),
    xMax: number({ default: 3 }),
    yMin: number({ default: -3 }),
    yMax: number({ default: 3 }),
    datasets: datasets({
      x: columnRef({ types: ['numeric'] }),
      y: columnRef({ types: ['numeric'] }),
      z: columnRef({ types: ['numeric'] }),
    }, { multi: false }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    chartEdits: contourChart.edits(),
  },
  derived: {
    /**
     * Fehler der eigenen Formel; null, wenn sie gilt oder das Modell keine
     * eigene Formel nutzt.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {FormulaError|null}
     */
    formulaError() {
      if (this.modelType !== 'custom') return null;
      const r = validateFormula(this.customFormula);
      if (r.ok) return null;
      const { code, token } = /** @type {{ code: string, token?: string }} */ (r);
      return token === undefined ? { code } : { code, token };
    },
    /**
     * Die Felder, die für die gewählte Modellform gelten.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams() {
      return ['modelType', this.modelType === 'custom' ? 'customFormula' : 'b',
        'xLabel', 'yLabel', 'zLabel', 'xMin', 'xMax', 'yMin', 'yMax', 'datasets'];
    },
    /**
     * Kennzahlen der abgetasteten Fläche (Rasterauflösung der
     * Editor-Einstellungen); null bei einem Fehler der eigenen Formel oder
     * wenn die Fläche keine endlichen Grenzen hat.
     *
     * @param {any} _data Arbeitsblattsicht
     * @param {{ formulaError: FormulaError|null }} d
     * @this {import('./model.types.js').StateModel}
     * @returns {Surface|null}
     */
    surface(_data, d) {
      if (d.formulaError) return null;
      const { zMin, zMax, optimum } = sampleSurface(this);
      if (!Number.isFinite(zMin) || !Number.isFinite(zMax)) return null;
      return { zMin, zMax, range: zMax - zMin, optimum };
    },
    /**
     * Die Messpunkte aus den drei Spalten: nur Zeilen mit drei endlichen
     * Zahlen. Leer, solange eine Spalte fehlt.
     *
     * @param {any} data Arbeitsblattsicht
     * @this {import('./model.types.js').StateModel}
     * @returns {DataPoint[]}
     */
    dataPoints(data) {
      const row = this.datasets[0];
      if (!row?.x || !row?.y || !row?.z) return [];
      const xs = data.values(row.x) ?? [];
      const ys = data.values(row.y) ?? [];
      const zs = data.values(row.z) ?? [];
      const n = Math.min(xs.length, ys.length, zs.length);
      const out = [];
      for (let i = 0; i < n; i++) {
        const x = xs[i], y = ys[i], z = zs[i];
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) out.push({ x, y, z });
      }
      return out;
    },
  },
  derivedBulk: ['dataPoints'],
  invariants: {
    coefficientCount: {
      fields: ['b'],
      test(m) { return m.b.length === 6; },
      repair(m) {
        const b = m._v.b;
        m._v.b = [0, 1, 2, 3, 4, 5].map((i) => (Number.isFinite(b[i]) ? b[i] : 0));
      },
    },
    axisOrder: {
      fields: ['xMin', 'xMax', 'yMin', 'yMax'],
      test(m) { return m.xMin < m.xMax && m.yMin < m.yMax; },
    },
  },
}) {
  /**
   * Das Konturdiagramm hat immer ein zeichenbares Modell (die Vorgaben).
   * @returns {boolean} immer wahr
   */
  hasContent() {
    return true;
  }
}
