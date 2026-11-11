/**
 * D.Mike — MSA Typ 2 (Gage R&R): Viewmodel.
 *
 * Die Ableitung `analysis` (Model) rechnet aus Model und Arbeitsblatt;
 * Getter machen daraus Status, Kennzahlen, ANOVA- und Varianztabelle und die
 * Konfiguration der Diagramm-Widgets, das Messverlaufsdiagramm als Streifen.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { fmt, fmtP } from '../domain/format.js';
import { fromExample } from '../io/example.js';
import {
  resultOf, analysisMessage, statusDetail, anovaRows, varCompRows,
  componentsChart, byPartChart, byOperatorChart, interactionChart, xbarChart, rChart, runStrips,
} from './present.js';

/** Statusklasse je Urteil. */
const KPI_CLASS = { pass: 'dmike-kpi--good', warn: 'dmike-kpi--warn', fail: 'dmike-kpi--bad' };

export default createModule({
  descriptor,
  Model: State,
  fromExample,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    return {
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
