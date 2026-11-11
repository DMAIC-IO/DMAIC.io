/**
 * D.Mike — MSA Typ 2 (Gage R&R): Model.
 *
 * Die drei Spaltenbezüge (Prüfeinheit, Prüfer, Messwert), die Grenzen, α,
 * Studienfaktor k, Urteilsgrundlage und historisches σ. Keine Statistik, kein
 * i18n; das Ergebnis rechnet die Ableitung `analysis` aus Model und Arbeitsblatt.
 * Ein leerer Prüfer führt zu Typ 3 (ohne Prüfer).
 *
 * Gespeichert: `{ _schema, part, operator, measurement, lsl, usl, alpha, k,
 * verdictBasis, sigmaHist, exampleWorksheetId }`. Die Invariante `limitsOrder`
 * sichert LSL < USL — beim Laden repariert (USL entfällt), beim Schreiben
 * abgelehnt.
 */
import {
  defineModel, number, text, oneOf, map, columnRef,
} from '../../../core/model.js';
import BarChart from '../../../widgets/bar-chart/schema.js';
import ScatterChart from '../../../widgets/scatter-chart/schema.js';
import BoxplotChart from '../../../widgets/boxplot-chart/schema.js';
import GageRunChart from '../../../widgets/gage-run-chart/schema.js';
import { from0 } from './migrations.js';
import { roundTo } from '../../../core/number-format.js';
import { readAnalysis } from './data.js';

/** Zulässige Studienfaktoren (6 = Standard, 5,15 = AIAG 3. Auflage). */
export const K_OPTIONS = [6, 5.15];

/** Zulässige Urteilsgrundlagen ('auto' = Toleranz, sobald beide Grenzen gesetzt sind). */
export const VERDICT_BASES = ['auto', 'tolerance', 'studyVar'];

/**
 * Das gerechnete Ergebnis (`analyze()` aus `engines/msa-typ2-engine.js`);
 * ohne Prüferspalte die Typ-3-Form mit derselben Schlüsselmenge. Lehnt die
 * Prüfung die Daten ab, steht nur `invalid` da; scheitert die Rechnung, nur
 * `error`.
 *
 * @typedef {object} Result
 * @property {'typ2'|'typ3'} mode  Verfahren
 * @property {number} n  Messwerte
 * @property {number} p  Teile
 * @property {number} o  Prüfer
 * @property {number} r  Wiederholungen
 * @property {string[]} partLabels  Teile
 * @property {string[]} operatorLabels  Prüfer
 * @property {number} grandMean  Gesamtmittel
 * @property {Anova} anova  ANOVA-Tabelle
 * @property {boolean} interactionSignificant  Wechselwirkung signifikant
 * @property {boolean} interactionPooled  Wechselwirkung gepoolt
 * @property {number} alpha  Signifikanzniveau
 * @property {VarComp} varComp  Varianzkomponenten
 * @property {number} ndc  Anzahl unterscheidbarer Kategorien
 * @property {'tolerance'|'studyVar'} verdictBasis  wirksamer Bezug des Urteils
 * @property {number} pctGRRVerdict  %GRR, auf dem das Urteil beruht
 * @property {'pass'|'warn'|'fail'} grrStatus  Urteil %GRR
 * @property {'pass'|'fail'} ndcStatus  Urteil ndc
 * @property {object} cellData  Messwerte je Teil (und Prüfer)
 * @property {object} cellMeans  Mittelwerte je Teil (und Prüfer)
 * @property {object} cellRanges  Spannweiten je Teil (und Prüfer)
 * @property {Object<string, number>} partMeans  Mittelwert je Teil
 * @property {Object<string, number>} operatorMeans  Mittelwert je Prüfer
 * @property {ControlLimits} controlChart  Grenzen der x̄-R-Karte
 * @property {ResultParams} params  gerechnete Parameter
 * @property {string[]} warnings  Hinweise
 * @property {{ key: string, vars: object|null }} [invalid]  Ablehnung der Prüfung (Textschlüssel und Werte)
 * @property {string} [error]  Meldung der gescheiterten Rechnung
 */

/**
 * @typedef {object} Anova
 * @property {AnovaRow} part  Teile
 * @property {AnovaRow|null} operator  Prüfer, leer bei Typ 3
 * @property {AnovaRow|null} interact  Wechselwirkung, leer wenn gepoolt
 * @property {AnovaRow} equip  Wiederholbarkeit (Messgerät)
 * @property {AnovaRow} total  gesamt
 */

/**
 * @typedef {object} AnovaRow
 * @property {number} ss  Quadratsumme
 * @property {number} df  Freiheitsgrade
 * @property {number} [ms]  mittleres Quadrat
 * @property {number} [f]  F-Wert
 * @property {number} [pValue]  p-Wert
 */

/**
 * @typedef {object} VarComp
 * @property {VarCompEntry} repeatability  Wiederholbarkeit (EV)
 * @property {VarCompEntry} reproducibility  Reproduzierbarkeit (AV)
 * @property {VarCompEntry} operator  Prüfer
 * @property {VarCompEntry} interact  Teil × Prüfer
 * @property {VarCompEntry} grr  Messsystem (GRR)
 * @property {VarCompEntry} part  Teile (PV)
 * @property {VarCompEntry} total  gesamt (TV)
 */

/**
 * @typedef {object} VarCompEntry
 * @property {number} variance  Varianz σ²
 * @property {number} sigma  Standardabweichung σ
 * @property {number} studyVar  Studienstreuung k·σ
 * @property {number} pctContribution  % Beitrag
 * @property {number} pctStudyVar  % Studienstreuung
 * @property {number|null} pctTolerance  % Toleranz
 * @property {number|null} pctProcess  % Prozessstreuung
 */

/**
 * @typedef {object} ControlLimits
 * @property {number} xbarCL  Mittellinie x̄
 * @property {number} xbarUCL  obere Grenze x̄
 * @property {number} xbarLCL  untere Grenze x̄
 * @property {number} rCL  Mittellinie R
 * @property {number} rUCL  obere Grenze R
 * @property {number} rLCL  untere Grenze R
 * @property {number} rBar  mittlere Spannweite
 * @property {number} A2  Faktor A₂
 * @property {number} D3  Faktor D₃
 * @property {number} D4  Faktor D₄
 */

/**
 * @typedef {object} ResultParams
 * @property {number} alpha  Signifikanzniveau
 * @property {number} studyVarMultiplier  Streuungsfaktor k
 * @property {number|null} tolerance  Toleranz
 * @property {number} lsl  untere Grenze, ohne Wert wenn leer
 * @property {number} usl  obere Grenze, ohne Wert wenn leer
 * @property {'tolerance'|'studyVar'} [verdictBasis]  gewählter Bezug, fehlt bei auto
 * @property {number|null} historicalSigma  historische Streuung
 */

export class State extends defineModel({
  version: '1.0',
  fields: {
    part: columnRef(),
    operator: columnRef(),
    measurement: columnRef({ types: ['numeric'] }),
    lsl: number({ nullable: true }),
    usl: number({ nullable: true }),
    alpha: number({
      exclusiveMin: 0,
      exclusiveMax: 1,
      // Aus dem Konfidenzniveau; auf den erlaubten Bereich geklemmt.
      default: (c) => Math.min(0.9999, Math.max(0.0001, roundTo((100 - c.confidenceLevel) / 100, 4))),
    }),
    k: oneOf(K_OPTIONS, { default: 6 }),
    verdictBasis: oneOf(VERDICT_BASES, { default: 'auto' }),
    sigmaHist: number({ nullable: true, exclusiveMin: 0 }),
    exampleWorksheetId: text({ nullable: true }),
  },
  view: {
    componentsEdits: BarChart.edits(),
    byPartEdits: ScatterChart.edits(),
    byOperatorEdits: BoxplotChart.edits(),
    interactionEdits: ScatterChart.edits(),
    xbarEdits: ScatterChart.edits(),
    rEdits: ScatterChart.edits(),
    runStripEdits: map(number({ integer: true, min: 0 }), GageRunChart.edits()),
  },
  migrations: { '0→1.0': from0 },
  derived: {
    /**
     * Gage R&R aus den drei Spalten und den Parametern; null, solange
     * Teile- oder Messwertspalte fehlen oder keine brauchbare Zeile da ist.
     * @param {any} data Arbeitsblattsicht
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    analysis(data) { return readAnalysis(this, data); },
  },
  invariants: {
    limitsOrder: {
      fields: ['lsl', 'usl'],
      test(m) { return m.lsl == null || m.usl == null || m.lsl < m.usl; },
      repair(m) { m._v.usl = null; },
    },
  },
}) {
  /** @returns {boolean} wahr bei einer Spalte oder einer gesetzten Grenze (steuert die Rückfrage vor dem Überschreiben) */
  hasContent() {
    return Boolean(this.part) || Boolean(this.operator) || Boolean(this.measurement)
      || this.lsl != null || this.usl != null;
  }
}
