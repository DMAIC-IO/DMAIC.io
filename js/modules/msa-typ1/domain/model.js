/**
 * D.Mike — MSA Typ 1: Model.
 *
 * Gespeichert werden die sieben Eingaben (`params`), der Bezug auf die
 * Messwertspalte und das Beispiel-Arbeitsblatt; Ansicht: die
 * Editor-Einstellungen von Verlaufsdiagramm und Histogramm. Das Ergebnis
 * rechnet die Ableitung `analysis` aus Model und Arbeitsblatt, `columnStats`
 * liefert µ und σ der Spalte für andere Module.
 *
 * Gespeichert: `{ _schema, params: { name, unit, ref, lsl, usl, k1, k2 },
 * columnRef, exampleWorksheetId, runChartEdits, histogramChart }` —
 * `params.name` und `columnRef` an den Pfaden der Altform.
 */
import { defineModel, object, text, number, oneOf, columnRef } from '../../../core/model.js';
import ScatterChart from '../../../widgets/scatter-chart/schema.js';
import HistogramChart from '../../../widgets/histogram-chart/schema.js';
import { from0 } from './migrations.js';
import { readValues, analyzeTyp1, columnStatsOf } from './analyze.js';

/** Zulässige Anteile der Toleranz k₁. */
export const K1_OPTIONS = [0.2, 0.15, 0.1];

/** Zulässige Streuungsfaktoren k₂. */
export const K2_OPTIONS = [3, 4, 6];

/**
 * Die Schlüsselfläche von `instance.set` auf `params`, zugleich die Form von
 * `read().params`. Sätze je Schlüssel unter `types.Params.<schlüssel>`,
 * dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {string} name  Bezeichnung des Merkmals
 * @property {string} unit  Maßeinheit
 * @property {number|null} ref  Referenzwert des Normals
 * @property {number|null} lsl  untere Toleranzgrenze, leer für einseitig
 * @property {number|null} usl  obere Toleranzgrenze, leer für einseitig
 * @property {0.2|0.15|0.1} k1  Anteil der Toleranz
 * @property {3|4|6} k2  Streuungsfaktor
 */

/**
 * Das gerechnete Ergebnis (`analyze()` aus `engines/msa-typ1-engine.js`),
 * wie `read().analysis` es liefert. Je Kennzahl ein Satz unter
 * `types.Result.<kennzahl>` — derselbe, den die Oberfläche an der Kennzahl
 * zeigt (Alt-Taste). Lehnt die Prüfung die Eingaben ab, steht nur `invalid` da.
 *
 * @typedef {object} Result
 * @property {'two-sided'|'one-sided'} mode  Toleranzart
 * @property {number} n  Anzahl der Messwerte
 * @property {number} xbar  Mittelwert
 * @property {number} sg  Standardabweichung
 * @property {number} xmin  kleinster Messwert
 * @property {number} xmax  größter Messwert
 * @property {number} range  Spannweite
 * @property {number} bias  Mittelwert minus Referenzwert
 * @property {BiasTest} biasTest  t-Test auf Bias
 * @property {number} resolution  erkannte Auflösung, 0 wenn unbestimmbar
 * @property {number} upperThreshold  Mittelwert + 3·sg
 * @property {number} lowerThreshold  Mittelwert − 3·sg
 * @property {Detail[]} details  je Messwert
 * @property {boolean} noSpread  alle Werte identisch
 * @property {ResultParams} params  die gerechneten Parameter als Zahlen
 * @property {number|null} T  Toleranz
 * @property {number|null} biasPercent  Bias in % der Toleranz
 * @property {number|null} Cg  Fähigkeitsindex
 * @property {number|null} Cgk  Fähigkeitsindex mit Bias
 * @property {'pass'|'warn'|'fail'|null} cgStatus  Urteil zu Cg
 * @property {'pass'|'warn'|'fail'|null} cgkStatus  Urteil zu Cgk
 * @property {'pass'|'warn'|'fail'|'none'} overall  Gesamturteil
 * @property {number|null} tolUsage  Toleranzausnutzung in %
 * @property {number|null} varEv  %Var(EV), gleich tolUsage
 * @property {number|null} varEvBias  %Var(EV+Bias)
 * @property {number|null} resPercent  Auflösung in % der Toleranz
 * @property {number|null} zoneHi  obere Grenze der k₁·T-Zone
 * @property {number|null} zoneLo  untere Grenze der k₁·T-Zone
 * @property {{ key: string, vars: object|null }} [invalid]  Ablehnung der Prüfung (Textschlüssel und Werte)
 */

/**
 * @typedef {object} BiasTest
 * @property {number|null} t  Prüfgröße
 * @property {number} df  Freiheitsgrade
 * @property {number|null} p  p-Wert
 */

/**
 * @typedef {object} Detail
 * @property {number} index  laufende Nummer ab 1
 * @property {number} value  Messwert
 * @property {number} deviation  Abweichung vom Referenzwert
 * @property {number} devFromMean  Betrag der Abweichung vom Mittelwert
 * @property {boolean} isOutlier  außerhalb Mittelwert ± 3·sg
 */

/**
 * @typedef {object} ResultParams
 * @property {number} ref  Referenzwert
 * @property {number|null} lsl  untere Toleranzgrenze
 * @property {number|null} usl  obere Toleranzgrenze
 * @property {number} k1  Anteil der Toleranz
 * @property {number} k2  Streuungsfaktor
 */

/**
 * Anzahl, Mittelwert und Standardabweichung der Messwertspalte.
 *
 * @typedef {object} ColumnStats
 * @property {number} n  Anzahl der numerischen Werte
 * @property {number} mean  Mittelwert
 * @property {number} stdDev  Standardabweichung (n − 1)
 */

/** Die sieben Parameter in der Reihenfolge der Altform. @type {(keyof Params)[]} */
const PARAM_KEYS = ['name', 'ref', 'unit', 'lsl', 'usl', 'k1', 'k2'];

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    params: object({
      name: text(),
      unit: text({ default: 'mm' }),
      ref: number({ nullable: true }),
      lsl: number({ nullable: true }),
      usl: number({ nullable: true }),
      k1: oneOf([0.2, 0.15, 0.1], { default: 0.2 }),
      k2: oneOf([3, 4, 6], { default: 3 }),
    }),
    columnRef: columnRef({ types: ['numeric'] }),
    exampleWorksheetId: text({ nullable: true }),
  },
  view: {
    runChartEdits: ScatterChart.edits(),
    histogramChart: HistogramChart.edits(),
  },
  invariants: {
    limitsOrder: {
      fields: ['params'],
      test(m) { return m.params.lsl == null || m.params.usl == null || m.params.lsl < m.params.usl; },
      repair(m) { m._v.params = { ...m._v.params, usl: null }; },
    },
  },
  derived: {
    /**
     * Die Studie aus Spalte und Parametern; null, solange Spalte oder Werte
     * fehlen.
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    analysis(src) { return analyzeTyp1(this.params, readValues(this, src)); },
    /**
     * Anzahl, Mittelwert und Standardabweichung der Messwertspalte, ab 2 Werten.
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {ColumnStats|null}
     */
    columnStats(src) { return columnStatsOf(readValues(this, src)); },
    /**
     * Die Schlüssel, die `instance.set` auf `params` annimmt: immer alle sieben.
     * @returns {(keyof Params)[]}
     */
    activeParams() { return [...PARAM_KEYS]; },
    /**
     * Die Spalten-Slots: nur die Messwertspalte.
     * @returns {'value'[]}
     */
    activeColumnSlots() { return ['value']; },
  },
}) {
  /** @returns {boolean} wahr bei Spalte, Name, Referenzwert oder einer Grenze (steuert die Rückfrage vor dem Überschreiben) */
  hasContent() {
    const p = this.params;
    return Boolean(this.columnRef) || Boolean(p.name) || p.ref != null || p.lsl != null || p.usl != null;
  }
}
