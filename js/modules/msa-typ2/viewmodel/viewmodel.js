/**
 * D.Mike — MSA Typ 2 (Gage R&R): Viewmodel.
 *
 * Ein `computed analysis` rechnet aus Model und Arbeitsblatt (`ctx.data`);
 * Getter machen daraus Status, Kennzahlen, ANOVA- und Varianztabelle und die
 * Konfiguration der Diagramm-Widgets, das Messverlaufsdiagramm als Streifen.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { fmt, fmtP } from '../domain/format.js';
import { fromExample } from '../io/example.js';
import {
  readAnalysis, resultOf, analysisMessage, statusDetail, anovaRows, varCompRows,
  componentsChart, byPartChart, byOperatorChart, interactionChart, xbarChart, rChart, runStrips,
} from './present.js';

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

/** Statusklasse je Urteil. */
const KPI_CLASS = { pass: 'dmike-kpi--good', warn: 'dmike-kpi--warn', fail: 'dmike-kpi--bad' };

export default createModule({
  descriptor,
  Model: State,
  fromExample,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    return {
      computed: {
        /**
         * Gage R&R aus den drei Spalten und den Parametern; null, solange
         * Teile- oder Messwertspalte fehlen oder keine brauchbare Zeile da ist.
         * @returns {Result|null}
         */
        analysis() { return readAnalysis(this.model, ctx.data); },
      },

      /** Das Ergebnis, oder null bei fehlenden, abgelehnten oder gescheiterten Eingaben. */
      get result() { return resultOf(this.analysis); },
      /** Text der Fehlerzeile; leer ohne Ablehnung. */
      get analysisMessage() { return analysisMessage(this.analysis, this.t); },
      /** Typ 2 (mit Prüfern). */
      get isTyp2() { return this.result?.mode === 'typ2'; },

      /** Beschriftung der Option k = 6. */
      get kOption6() { return this.t('kOption6'); },
      /** Beschriftung der Option k = 5,15. */
      get kOption515() { return this.t('kOption515'); },

      /** Statusklasse des Gesamturteils. */
      get statusClass() { return KPI_CLASS[this.result?.grrStatus] ?? ''; },
      /** Urteil als Text. */
      get statusLabel() {
        const s = this.result?.grrStatus;
        return this.t({ pass: 'statusPass', fail: 'statusFail', warn: 'statusWarn' }[s] || 'statusWarn');
      },
      /** Verfahren als Abzeichen. */
      get typeLabel() { return this.t(this.result?.mode === 'typ3' ? 'typeLabelTyp3' : 'typeLabelTyp2'); },
      /** Teile, Prüfer, Wiederholungen, n und Bezug des Urteils. */
      get statusDetail() { return statusDetail(this.result, this.t); },
      /**
       * Trägt die %GRR-Kachel dieses Bezugs das Urteil?
       * @param {'tolerance'|'studyVar'} basis @returns {boolean}
       */
      isVerdictBasis(basis) { return Boolean(this.result && this.result.verdictBasis === basis); },
      /**
       * Statusklasse einer %GRR-Kachel: farbig nur auf dem wirksamen Bezug.
       * @param {'tolerance'|'studyVar'} basis @returns {string}
       */
      grrKpiClass(basis) { return this.isVerdictBasis(basis) ? (KPI_CLASS[this.result.grrStatus] ?? '') : ''; },
      /**
       * Unterzeile einer %GRR-Kachel: Grenzwert und Urteil auf dem wirksamen Bezug, sonst der Bezug.
       * @param {'tolerance'|'studyVar'} basis @returns {string}
       */
      grrKpiSub(basis) {
        if (this.isVerdictBasis(basis)) {
          const badge = this.t({ pass: 'capable', fail: 'notCapable', warn: 'condCapable' }[this.result.grrStatus] || 'condCapable');
          return `${this.t('threshold')}: < 10 % · ${badge}`;
        }
        return this.t(basis === 'tolerance' ? 'ofTolerance' : 'ofStudyVar');
      },
      /** Statusklasse der Kachel ndc. */
      get ndcClass() { return KPI_CLASS[this.result?.ndcStatus] ?? ''; },
      /** Unterzeile der Kachel ndc. */
      get ndcSub() {
        const badge = this.t(this.result?.ndcStatus === 'pass' ? 'capable' : 'notCapable');
        return `${this.t('threshold')}: ≥ 5 · ${badge}`;
      },
      /** %GRR (Studienstreuung), formatiert. */
      get grrStudyVarText() { return fmt(this.result?.varComp.grr.pctStudyVar, 4, ctx.context.language); },
      /** %GRR (Toleranz), formatiert. */
      get grrToleranceText() { return fmt(this.result?.varComp.grr.pctTolerance, 4, ctx.context.language); },
      /** %EV, formatiert. */
      get evText() { return fmt(this.result?.varComp.repeatability.pctStudyVar, 4, ctx.context.language); },
      /** %AV, formatiert. */
      get avText() { return fmt(this.result?.varComp.reproducibility.pctStudyVar, 4, ctx.context.language); },
      /** Hinweise der Studie. */
      get warnings() { return this.result?.warnings ?? []; },

      /** Es gibt eine historische Prozessstreuung (Spalte %Prozess). */
      get hasProcess() { return Boolean(this.result && this.result.varComp.grr.pctProcess != null); },
      /** Es gibt eine Toleranz (Spalte und Kachel %Toleranz). */
      get varCompHasTol() { return Boolean(this.result && this.result.varComp.grr.pctTolerance != null); },
      /** Zeilen der ANOVA-Tabelle. */
      get anovaRows() { return anovaRows(this.result, this.t, ctx.context.language); },
      /** Zeilen der Tabelle der Varianzkomponenten. */
      get varCompRows() { return varCompRows(this.result, this.t, ctx.context.language); },
      /** @param {number} v @returns {string} */
      fmt(v) { return fmt(v, 4, ctx.context.language); },
      /** @param {number} p @returns {string} */
      fmtP(p) { return fmtP(p, ctx.context.language); },

      /** Variationskomponenten (Balken). */
      get componentsChart() { return componentsChart(this.result, this.t); },
      /** Messwerte nach Teil. */
      get byPartChart() { return byPartChart(this.result, this.t); },
      /** Messwerte nach Prüfer; null bei Typ 3. */
      get byOperatorChart() { return byOperatorChart(this.result, this.t); },
      /** Wechselwirkung Teil × Prüfer; null bei Typ 3. */
      get interactionChart() { return interactionChart(this.result, this.t); },
      /** x̄-Karte. */
      get xbarChart() { return xbarChart(this.result); },
      /** R-Karte. */
      get rChart() { return rChart(this.result); },
      /** Messverlaufsdiagramm, ein Eintrag je Streifen. */
      get runStrips() { return runStrips(this.result, this.t); },
    };
  },
});
