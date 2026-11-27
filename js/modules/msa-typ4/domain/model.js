/**
 * D.Mike — MSA Typ 4: Model.
 *
 * Gespeichert werden die sieben Eingaben (`params`, die Toleranz verschachtelt)
 * und die Bezüge auf Referenz- und Messwertspalte; Ansicht: das
 * Beispiel-Arbeitsblatt und die Editor-Einstellungen der vier Diagramme. Das
 * Ergebnis rechnet die Ableitung `result` aus Model und Arbeitsblatt.
 *
 * Gespeichert: `{ _schema, params: { name, unit, norm, pvMode, tolerance:
 * { LSL, USL }, sigmaP, alpha }, refColumn, measColumn, exampleWorksheetId,
 * linearityChart, pctBiasChart, perRefChart, residualChart }` — `params.*`,
 * `refColumn` und `measColumn` an den Pfaden der Altform.
 */
import { defineModel, object, text, number, oneOf, columnRef } from '../../../core/model.js';
import ScatterChart from '../../../widgets/scatter-chart/schema.js';
import { from0 } from './migrations.js';
import { readInputs, runEngine, toResult } from './analyze.js';

/** Bewertungsnormen. */
export const NORMS = ['AIAG', 'VDA5'];
/** Bezugsgrößen der Prozentwerte. */
export const PV_MODES = ['tolerance', 'sixSigma'];
/** Signifikanzniveaus. */
export const ALPHA_OPTIONS = [0.01, 0.05, 0.1];

/**
 * Die Schlüsselfläche von `instance.set` auf `params`, zugleich die Form von
 * `read().params`. Sätze je Schlüssel unter `types.Params.<schlüssel>`
 * (Punkt = Verschachtelung), dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {string} name  Bezeichnung des Merkmals
 * @property {string} unit  Maßeinheit
 * @property {'AIAG'|'VDA5'} norm  Bewertungsnorm
 * @property {'tolerance'|'sixSigma'} pvMode  Bezugsgröße der Prozessstreuung
 * @property {number|null} tolerance.LSL  untere Toleranzgrenze
 * @property {number|null} tolerance.USL  obere Toleranzgrenze
 * @property {number|null} sigmaP  Prozessstandardabweichung, wirkt nur bei sixSigma
 * @property {0.01|0.05|0.1} alpha  Signifikanzniveau
 */

/**
 * Das gerechnete Ergebnis (`analyze()` aus `engines/msa-typ4-engine.js`),
 * wie `read().result` es liefert — ohne `regression.ciBand`. Nicht endliche
 * Werte kommen als leer an. Lehnt die Engine die Eingaben ab, steht nur
 * `invalid` da.
 *
 * @typedef {object} Result
 * @property {boolean} ok  immer wahr, wenn ein Ergebnis da ist
 * @property {ReferencePoint[]} perReference  je Referenzwert
 * @property {Regression} regression  Gerade Bias über Referenzwert
 * @property {Kpi} kpi  Kennzahlen beider Normen
 * @property {ProcessVariation} pv  Bezugsgröße der Prozentwerte
 * @property {Interpretation} interpretation  Deutung als Satz
 * @property {Invalid} [invalid]  Ablehnung der Engine
 */

/**
 * @typedef {object} Invalid
 * @property {string} key  Textschlüssel des Grunds
 * @property {object|null} vars  Werte im Text
 */

/**
 * @typedef {object} ReferencePoint
 * @property {number} xRef  Referenzwert
 * @property {number} n  Wiederholungen
 * @property {number} mean  Mittelwert
 * @property {number} bias  Mittelwert minus Referenzwert
 * @property {number} sd  Standardabweichung
 * @property {number|null} tStat  Prüfgröße
 * @property {number} pValue  p-Wert
 * @property {number} percentBias  Bias in % der Bezugsgröße
 * @property {'green'|'yellow'|'red'} verdict  Ampel
 */

/**
 * @typedef {object} Regression
 * @property {number} slope  Steigung
 * @property {number} intercept  Achsenabschnitt
 * @property {number} seSlope  Standardfehler der Steigung
 * @property {number} seIntercept  Standardfehler des Achsenabschnitts
 * @property {number} tSlope  Prüfgröße der Steigung
 * @property {number} tIntercept  Prüfgröße des Achsenabschnitts
 * @property {number} pSlope  p-Wert der Steigung
 * @property {number} pIntercept  p-Wert des Achsenabschnitts
 * @property {number} MSE  mittleres Fehlerquadrat
 * @property {number} N  Anzahl Messwerte
 * @property {number} dfResid  Freiheitsgrade der Residuen
 * @property {number[]} ciSlope  Konfidenzintervall der Steigung
 * @property {number[]} ciIntercept  Konfidenzintervall des Achsenabschnitts
 */

/**
 * @typedef {object} Kpi
 * @property {KpiAiag} aiag  Kennzahlen nach AIAG
 * @property {KpiVda5} vda5  Kennzahlen nach VDA 5
 */

/**
 * @typedef {object} KpiAiag
 * @property {number} percentLinearity  %Linearität
 * @property {number} maxPercentBias  größter %Bias
 * @property {boolean} slopeSignificant  Steigung signifikant
 * @property {boolean} interceptSignificant  Achsenabschnitt signifikant
 * @property {Verdict} verdict  Urteil
 */

/**
 * @typedef {object} KpiVda5
 * @property {number} u_BI  Unsicherheit aus Bias und Linearität
 * @property {number} U  erweiterte Unsicherheit
 * @property {number|null} Q_MS_BI  Eignungskennwert
 * @property {Verdict} verdict  Urteil
 */

/**
 * @typedef {object} Verdict
 * @property {'green'|'yellow'|'red'} color  Ampel
 * @property {string} key  Textschlüssel des Urteils
 */

/**
 * @typedef {object} ProcessVariation
 * @property {'tolerance'|'sixSigma'} mode  Bezugsart
 * @property {number} value  Bezugsgröße
 * @property {'tolerance'|'sixSigma'} source  gleich mode
 */

/**
 * @typedef {object} Interpretation
 * @property {string} textKey  Textschlüssel der Deutung
 * @property {InterpretationParams} params  Werte im Satz
 */

/**
 * @typedef {object} InterpretationParams
 * @property {string} [pctLin]  %Linearität, nur AIAG
 * @property {string} [maxPctBias]  größter %Bias, nur AIAG
 * @property {string} [qMsBi]  Eignungskennwert, nur VDA 5
 */

/** Die Parameterpfade in der Reihenfolge der Altform; `sigmaP` wirkt nur bei sixSigma. */
const PARAM_KEYS = ['name', 'unit', 'norm', 'pvMode', 'tolerance.LSL', 'tolerance.USL', 'sigmaP', 'alpha'];

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    params: object({
      name: text(),
      unit: text({ default: 'mm' }),
      norm: oneOf(['AIAG', 'VDA5'], { default: 'AIAG' }),
      pvMode: oneOf(['tolerance', 'sixSigma'], { default: 'tolerance' }),
      tolerance: object({
        LSL: number({ nullable: true }),
        USL: number({ nullable: true }),
      }),
      sigmaP: number({ nullable: true }),
      alpha: oneOf([0.01, 0.05, 0.1], { default: 0.05 }),
    }),
    refColumn: columnRef({ types: ['numeric'] }),
    measColumn: columnRef({ types: ['numeric'] }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    linearityChart: ScatterChart.edits(),
    pctBiasChart: ScatterChart.edits(),
    perRefChart: ScatterChart.edits(),
    residualChart: ScatterChart.edits(),
  },
  invariants: {
    limitsOrder: {
      fields: ['params'],
      test(m) {
        const { LSL, USL } = m.params.tolerance;
        return LSL == null || USL == null || LSL < USL;
      },
      repair(m) {
        m._v.params = { ...m._v.params, tolerance: { ...m._v.params.tolerance, USL: null } };
      },
    },
  },
  derived: {
    /**
     * Die Studie aus beiden Spalten und den Parametern; null, solange eine
     * Spalte oder ein lesbares Wertepaar fehlt.
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result(src) { return toResult(runEngine(this.params, readInputs(this, src))); },
    /**
     * Die Parameter, die im aktuellen Zustand wirken: `sigmaP` nur bei der
     * Bezugsstreuung 6 · σP; die Toleranz wirkt immer (VDA 5 rechnet mit T).
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams() {
      return PARAM_KEYS.filter((k) => k !== 'sigmaP' || this.params.pvMode === 'sixSigma');
    },
    /**
     * Die Spalten-Slots: Referenz- und Messwertspalte.
     * @returns {('reference'|'measured')[]}
     */
    activeColumnSlots() { return ['reference', 'measured']; },
  },
}) {
  /** @returns {boolean} wahr bei einer Spalte, einem Namen, einer Grenze oder σP (steuert die Rückfrage vor dem Überschreiben) */
  hasContent() {
    const p = this.params;
    return Boolean(this.refColumn) || Boolean(this.measColumn) || Boolean(p.name)
      || p.tolerance.LSL != null || p.tolerance.USL != null || p.sigmaP != null;
  }
}
