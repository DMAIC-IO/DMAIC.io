/**
 * D.Mike — MSA Typ 5 (attributive Prüfmittelfähigkeit): Viewmodel.
 *
 * `levels` (Stufen aus den Rohwerten der Bewertungsspalten) und `analysis`
 * (Kappa, Effektivität, Signal Detection) liefern die Ableitungen des Models. Getter machen daraus Urteil, Kennzahlen,
 * Tabellen und die Konfiguration der Diagramm-Widgets; Messverlauf und
 * Konfusions-Heatmaps als Liste je Streifen bzw. je Vergleich.
 */
import { createModule } from '../../../core/template-module.js';
import { command } from '../../../core/model.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { fmt, fmtPct, verdictClass } from '../domain/format.js';
import { fromExample } from '../io/example.js';
import { UiState } from './state.js';
import {
  ratingRowsOf, resultOf, analysisMessage, warningEntries, swapPositive,
  verdictLabel, verdictSubline, interpretationText, referenceSourceLabel, criteriaRows, referenceNoteText,
  fleissKappaClass, kpiMeans, perAppraiserRows, pairRows, vsRefRows, perPartRows, disagreementRows,
  kappaChart, effectivenessChart, sdtChart, runStrips, heatmaps,
} from './present.js';

export default createModule({
  descriptor,
  Model: State,
  history: true,
  State: UiState,
  fromExample,
  commands: {
    swapPositive: command({
      params: {},
      run() { swapPositive(this); },
    }),
  },
  /** @type {import('./state.types.js').MsaTyp5ViewFn} */
  view(ctx) {
    /** @returns {string} App-Sprache */
    const lang = () => ctx.context.language;
    return {
      /** Die Zeilen der Analyse (für den Messverlauf), ohne Rechnung. */
      get ratingRows() { return ratingRowsOf(this.model, ctx.source); },
      /** Das Ergebnis der Engine, oder null bei fehlenden, abgelehnten oder gescheiterten Eingaben. */
      get result() { return resultOf(this.analysis); },
      /** Es gibt ein Urteil (sonst steht `analysisMessage` an seiner Stelle). */
      get hasVerdict() { return Boolean(this.result?.verdict); },
      /** Text an Stelle des Ergebnisses; leer mit Urteil. */
      get analysisMessage() { return analysisMessage(this.analysis, this.model, this.t); },
      /** Hinweise der Engine. */
      get warnings() { return warningEntries(this.result, this.t); },

      // ── Stufen-Panel ──
      /** Es gibt Stufen. */
      get hasLevels() { return this.levels.all.length > 0; },
      /** Binäres Merkmal mit Stufen. */
      get showBinaryLevels() { return this.model.type === 'binary' && this.hasLevels; },
      /** Binäres Merkmal mit zwei Stufen: positive und negative lassen sich tauschen. */
      get canSwap() { return this.showBinaryLevels && this.levels.negative != null; },
      /** Nominales oder ordinales Merkmal mit Stufen. */
      get showLevelList() { return this.model.type !== 'binary' && this.hasLevels; },
      /** Ordinales Merkmal mit Stufen. */
      get showOrdinalHint() { return this.model.type === 'ordinal' && this.hasLevels; },
      /** Wirksame positive Stufe oder Strich. */
      get positiveText() { return this.levels.positive ?? '—'; },
      /** Wirksame negative Stufe oder Strich. */
      get negativeText() { return this.levels.negative ?? '—'; },
      /**
       * Beschriftung einer α-Option.
       * @param {number} a @returns {string}
       */
      alphaLabel(a) { return fmt(a, 2, lang()); },

      // ── Urteil und Kennzahlen ──
      /** Klasse des Urteilskastens. */
      get verdictClass() { return this.hasVerdict ? verdictClass(this.result.verdict.level) : ''; },
      /** Urteil als Text. */
      get verdictLabel() { return verdictLabel(this.result?.verdict?.level, this.t); },
      /** Unterzeile des Urteils. */
      get verdictSubline() { return verdictSubline(this.result, this.t, lang()); },
      /** Deutung als Satz. */
      get interpretationText() { return interpretationText(this.result, this.t, lang()); },
      /** Herkunft der Referenz. */
      get referenceSourceLabel() { return referenceSourceLabel(this.result, this.t); },
      /** Urteilsregel der Tabelle gegen die Referenz ist Bosch (Ergebnis, sonst Einstellung). */
      get isBosch() { return (this.result?.verdict?.ruleSet ?? this.model.ruleSet) === 'bosch'; },
      /** Fleiss κ, formatiert. */
      get fleissKappaText() { return fmt(this.result?.betweenAppraisers?.fleissKappa?.kappa, 3, lang()); },
      /** Klasse der Kachel Fleiss κ. */
      get fleissKappaClass() { return fleissKappaClass(this.result); },
      /** Verfahren von Fleiss κ. */
      get fleissMethod() { return this.result?.betweenAppraisers?.fleissKappa?.method || ''; },
      /** Ø Wiederholbarkeit, formatiert. */
      get meanRepeatabilityText() { return fmtPct(kpiMeans(this.result).repeatability, lang()); },
      /** Ø Effektivität, formatiert. */
      get meanEffectivenessText() { return fmtPct(kpiMeans(this.result).effectiveness, lang()); },
      /** Ø κ gegen die Referenz, formatiert. */
      get meanKappaVsRefText() { return fmt(kpiMeans(this.result).kappaVsRef, 3, lang()); },
      /** Anteil der Teile, bei denen alle Prüfer einig sind. */
      get overallBetweenRate() { return fmtPct(this.result?.overall?.betweenAppraisers?.rate, lang()); },
      /** Einige / alle Teile. */
      get overallBetweenSub() {
        const o = this.result?.overall?.betweenAppraisers;
        return o ? `${o.agree} / ${o.n}` : '';
      },
      /** Es gibt die Kennzahl „alle einig und richtig“. */
      get hasOverallVsRef() { return Boolean(this.result?.overall?.allVsReference); },
      /** Anteil der Teile, bei denen alle Prüfer einig und richtig sind. */
      get overallVsRefRate() { return fmtPct(this.result?.overall?.allVsReference?.rate, lang()); },
      /** Einige und richtige / alle Teile. */
      get overallVsRefSub() {
        const o = this.result?.overall?.allVsReference;
        return o ? `${o.agree} / ${o.n}` : '';
      },

      // ── Tabellen ──
      /** Zeilen der Kriterientabelle. */
      get criteriaRows() { return criteriaRows(this.result, this.t, lang()); },
      /** Hinweis zur Referenz unter der Kriterientabelle. */
      get referenceNoteText() { return referenceNoteText(this.result, this.t); },
      /** Zeilen der Prüfertabelle. */
      get perAppraiserRows() { return perAppraiserRows(this.result, lang()); },
      /** Titel der Paartabelle. */
      get pairTableTitle() { return `${this.t('table.pair')} — ${this.t('table.cohenKappa')}`; },
      /** Zeilen der Paartabelle. */
      get pairRows() { return pairRows(this.result, lang()); },
      /** Zeilen der Tabelle gegen die Referenz. */
      get vsRefRows() { return vsRefRows(this.result, lang()); },
      /** Kopf der κ-Spalte gegen die Referenz. */
      get vsRefKappaHeader() { return this.t(this.result?.verdict?.ruleSet === 'bosch' ? 'table.fleissKappa' : 'table.cohenKappa'); },
      /** Prüfer-Spalten der Teile-Tabelle. */
      get partAppraisers() { return Object.keys(this.result?.perAppraiser || {}); },
      /** Zeilen der Teile-Tabelle, auf Wunsch nur die strittigen. */
      get perPartRows() { return perPartRows(this.result, this.state.onlyDisputed); },
      /** Es gibt strittige Teile. */
      get hasDisputedParts() { return (this.result?.perPart || []).some((/** @type {any} */ r) => r.isDisputed); },
      /** Zeilen der Verwechslungstabelle. */
      get disagreementRows() { return disagreementRows(this.result, this.t); },

      // ── Diagramme ──
      /** Cohen κ je Prüferpaar mit Intervall. */
      get kappaChart() { return kappaChart(this.result, this.t, lang()); },
      /** Effektivität je Prüfer; null ohne Referenz. */
      get effectivenessChart() { return effectivenessChart(this.result, this.t); },
      /** Signal Detection; null außer binär mit Referenz. */
      get sdtChart() { return sdtChart(this.result, this.t); },
      /** Messverlauf, ein Eintrag je Streifen; leer bei nominalen Klassen. */
      get runStrips() { return runStrips(this.result, this.ratingRows, this.model.type, this.levels, this.t); },
      /** Konfusions-Heatmaps, erst gegen die Referenz, dann je Paar. */
      get heatmaps() { return heatmaps(this.result, this.t); },
    };
  },
});
