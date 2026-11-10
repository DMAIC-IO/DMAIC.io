/**
 * D.Mike — MSA Typ 5 (attributive Prüfmittelfähigkeit): Viewmodel.
 *
 * `levels` (Stufen aus den Rohwerten der Bewertungsspalten) und `analysis`
 * (Kappa, Effektivität, Signal Detection) rechnen als `computed` aus Model und
 * Arbeitsblatt (`ctx.data`). Getter machen daraus Urteil, Kennzahlen,
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
  readLevels, readAnalysis, ratingRowsOf, resultOf, analysisMessage, warningEntries, swapPositive,
  verdictLabel, verdictSubline, interpretationText, referenceSourceLabel, criteriaRows, referenceNoteText,
  fleissKappaClass, kpiMeans, perAppraiserRows, pairRows, vsRefRows, perPartRows, disagreementRows,
  kappaChart, effectivenessChart, sdtChart, runStrips, heatmaps,
} from './present.js';

/**
 * Die Stufen der Bewertungen aus den Rohwerten der Bewertungsspalte(n).
 *
 * @typedef {object} Levels
 * @property {string[]} all  vorkommende Stufen, zahlenbewusst sortiert
 * @property {string|null} positive  wirksame positive Stufe (i. O.)
 * @property {string|null} negative  wirksame negative Stufe (n. i. O.), null bei nur einer Stufe
 */

/**
 * Das gerechnete Ergebnis (`analyze()` aus `engines/msa-typ5-engine.js`),
 * wie `read().analysis` es liefert. Weist die Engine die Eingaben ab, steht
 * nur `meta` da, mit dem Grund unter `meta.errors` — darum ist alles außer
 * `meta` optional. Passen im breiten Layout Spalten und Versuche nicht
 * zusammen, steht nur `invalid` da; scheitert die Rechnung, nur `error`.
 *
 * @typedef {object} Result
 * @property {Meta} [meta]  Rahmendaten, Warnungen, Fehler
 * @property {Object<string, AppraiserStats>} [perAppraiser]  je Prüfer
 * @property {BetweenAppraisers} [betweenAppraisers]  Übereinstimmung der Prüfer untereinander
 * @property {FleissKappa|null} [allVsReference]  alle Prüfer gegen die Referenz
 * @property {SignalDetection|null} [signalDetection]  Signalentdeckung, nur binär mit Referenz
 * @property {PartRow[]} [perPart]  je Teil, nach Problemgrad sortiert
 * @property {Object<string, Disagreement>} [disagreement]  Verwechslungen je Prüfer
 * @property {Overall} [overall]  Gesamtübereinstimmung
 * @property {Verdict} [verdict]  Urteil
 * @property {Interpretation} [interpretation]  Deutung als Satz
 * @property {{ key: string, vars: object|null }} [invalid]  Ablehnung der Eingaben (Textschlüssel und Werte)
 * @property {string} [error]  Meldung der gescheiterten Rechnung
 */

/**
 * @typedef {object} Meta
 * @property {'binary'|'nominal'|'ordinal'} [type]  Merkmalstyp
 * @property {string[]} [levels]  Stufen
 * @property {number} [parts]  Anzahl Teile
 * @property {number} [appraisers]  Anzahl Prüfer
 * @property {number} [reps]  höchste Versuchszahl
 * @property {'given'|'consensus'|'none'} [referenceSource]  Herkunft der Referenz
 * @property {string[]} [ambiguousParts]  Teile ohne eindeutigen Konsens
 * @property {Message[]} warnings  Hinweise
 * @property {Message[]} [errors]  Gründe ungültiger Eingaben
 */

/**
 * @typedef {object} Message
 * @property {string} code  Kennung
 * @property {object} params  Werte im Text
 */

/**
 * @typedef {object} AppraiserStats
 * @property {Rate} [repeatability]  Übereinstimmung mit sich selbst
 * @property {FleissKappa} [withinKappa]  κ innerhalb des Prüfers
 * @property {VsReference} [vsReference]  gegen die Referenz
 * @property {ConfusionMatrix} [confusionMatrix]  Kreuztabelle gegen die Referenz
 */

/**
 * @typedef {object} Rate
 * @property {number} agree  übereinstimmende Fälle
 * @property {number} total  Fälle
 * @property {number} rate  Anteil
 * @property {number[]} ci95  Intervall nach Wilson zum Niveau 1 − α
 */

/**
 * @typedef {object} FleissKappa
 * @property {number} kappa  κ
 * @property {number} se0  Standardfehler unter der Nullhypothese
 * @property {number} z  Prüfgröße
 * @property {number} p  p-Wert
 * @property {string} method  Verfahren
 */

/**
 * @typedef {object} VsReference
 * @property {Rate} [effectiveness]  Effektivität
 * @property {ErrorRate} [missRate]  Schlupf
 * @property {ErrorRate} [falseAlarmRate]  Fehlalarm
 * @property {BiasRate} [biasRate]  Neigung
 * @property {CohenKappa} [kappa]  Cohens κ gegen die Referenz
 * @property {FleissKappa} [fleissKappa]  Fleiss' κ mit der Referenz als Prüfer
 */

/**
 * @typedef {object} ErrorRate
 * @property {number} rate  Anteil
 * @property {number[]} ci95  Intervall zum Niveau 1 − α
 * @property {number} n  Fälle
 */

/**
 * @typedef {object} BiasRate
 * @property {number} value  Differenz
 */

/**
 * @typedef {object} CohenKappa
 * @property {number} kappa  κ
 * @property {number} se  Standardfehler
 * @property {number} se0  Standardfehler unter der Nullhypothese
 * @property {number} z  Prüfgröße
 * @property {number} p  p-Wert
 * @property {number[]} ci95  Intervall zum Niveau 1 − α
 * @property {string} method  Verfahren
 */

/**
 * @typedef {object} PairKappa
 * @property {number} kappa  κ
 * @property {number} se  Standardfehler
 * @property {number} se0  Standardfehler unter der Nullhypothese
 * @property {number} z  Prüfgröße
 * @property {number} p  p-Wert
 * @property {number[]} ci95  Intervall zum Niveau 1 − α
 * @property {string} method  Verfahren
 * @property {ConfusionMatrix} confusion  Kreuztabelle des Paars
 */

/**
 * @typedef {object} ConfusionMatrix
 * @property {string[]} rows  Zeilenstufen
 * @property {string[]} cols  Spaltenstufen
 * @property {number[][]} counts  Häufigkeiten
 */

/**
 * @typedef {object} BetweenAppraisers
 * @property {Object<string, PairKappa>} pairwiseCohenKappa  je Prüferpaar
 * @property {FleissKappa} fleissKappa  alle Prüfer zusammen
 */

/**
 * @typedef {object} SignalDetection
 * @property {Object<string, Detection>} perAppraiser  je Prüfer
 */

/**
 * @typedef {object} Detection
 * @property {number} dPrime  Trennschärfe d′
 * @property {number} criterion  Entscheidungsschwelle
 * @property {number} hitRate  Trefferquote
 * @property {number} falseAlarmRate  Fehlalarmquote
 */

/**
 * @typedef {object} PartRow
 * @property {string} part  Teil
 * @property {string|null} reference  Referenzurteil
 * @property {Object<string, string[]>} byAppraiser  Urteile je Prüfer
 * @property {number|null} vsRefErrors  Abweichungen von der Referenz
 * @property {number} mixedAppraisers  Prüfer mit wechselndem Urteil
 * @property {boolean} isDisputed  strittig
 */

/**
 * @typedef {object} Disagreement
 * @property {ConfusionPair[]} confusionPairs  Verwechslungen
 * @property {number} mixed  Teile mit wechselndem Urteil
 * @property {string[]} mixedParts  diese Teile
 */

/**
 * @typedef {object} ConfusionPair
 * @property {string} from  Referenzstufe
 * @property {string} to  vergebene Stufe
 * @property {number} count  Häufigkeit
 * @property {string[]} parts  betroffene Teile
 */

/**
 * @typedef {object} Overall
 * @property {AgreementShare} betweenAppraisers  Übereinstimmung aller Prüfer
 * @property {AgreementShare|null} allVsReference  alle Prüfer und Referenz
 */

/**
 * @typedef {object} AgreementShare
 * @property {number} agree  übereinstimmende Teile
 * @property {number} n  Teile
 * @property {number} rate  Anteil
 * @property {number[]} ci95  Intervall zum Niveau 1 − α
 */

/**
 * @typedef {object} Verdict
 * @property {'aiag'|'bosch'} ruleSet  Urteilsregel
 * @property {'good'|'marginal'|'unacceptable'} level  Urteil
 * @property {string|null} driver  ausschlaggebendes Kriterium
 * @property {string|null} driverAppraiser  ausschlaggebender Prüfer
 * @property {'missFaNotRated'|null} referenceNote  Hinweis zur Referenz
 * @property {Criterion[]} criteria  Kriterien des Urteils
 */

/**
 * @typedef {object} Criterion
 * @property {string} id  Kriterium
 * @property {number} value  Wert
 * @property {string} level  Urteil des Kriteriums
 * @property {string|null} appraiser  Prüfer, wenn je Prüfer
 * @property {Limits} limits  Grenzwerte
 * @property {'min'|'max'} direction  Richtung
 * @property {string} [source]  Quelle des κ, nur Bosch
 */

/**
 * @typedef {object} Limits
 * @property {number} good  Grenze gut
 * @property {number} marginal  Grenze bedingt
 */

/**
 * @typedef {object} Interpretation
 * @property {string} textKey  Textschlüssel der Deutung
 * @property {InterpretationParams} params  Werte im Satz
 */

/**
 * @typedef {object} InterpretationParams
 * @property {string} kappa  κ als Text
 * @property {string} minEff  kleinste Effektivität als Text
 * @property {string} driver  Auslöser als Text
 * @property {string} ruleSet  Urteilsregel als Text
 */

export default createModule({
  descriptor,
  Model: State,
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
      computed: {
        /**
         * Stufen der Bewertungen; leer, solange keine Bewertungsspalte gewählt ist.
         * @returns {Levels}
         */
        levels() { return readLevels(this.model, ctx.data); },
        /**
         * Die Analyse; null, solange Pflichtspalten fehlen oder keine Zeile entsteht.
         * @returns {Result|null}
         */
        analysis() { return readAnalysis(this.model, ctx.data); },
      },

      /** Die Zeilen der Analyse (für den Messverlauf), ohne Rechnung. */
      get ratingRows() { return ratingRowsOf(this.model, ctx.data); },
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
