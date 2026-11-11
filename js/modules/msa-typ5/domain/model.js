/**
 * D.Mike — MSA Typ 5 (attributive Prüfmittelfähigkeit): Model.
 *
 * Merkmalsart, Gewichte, α, Regelwerk, Layout, Versuche je Prüfer, die
 * Spaltenbezüge (fünf einzelne, dazu die Bewertungsspalten des breiten
 * Layouts) und die positive Stufe. Keine Statistik, kein i18n; κ und
 * Wirksamkeit rechnen die Ableitungen `levels` und `analysis` aus Model und Arbeitsblatt.
 *
 * Gespeichert: `{ _schema, type, positiveLevel, weights, alpha, ruleSet,
 * layout, trials, part, appraiser, rating, reference, replicate, ratings,
 * exampleWorksheetId }`. Die Invariante `uniqueRatings` sichert, dass keine
 * Bewertungsspalte doppelt gewählt ist — beim Laden repariert (erstes
 * Vorkommen bleibt), beim Schreiben abgelehnt.
 */
import {
  defineModel, number, text, oneOf, list, map, columnRef,
} from '../../../core/model.js';
import ScatterChart from '../../../widgets/scatter-chart/schema.js';
import GageRunChart from '../../../widgets/gage-run-chart/schema.js';
import HeatmapChart from '../../../widgets/heatmap-chart/schema.js';
import { from0 } from './migrations.js';
import { readLevels, readAnalysis } from './read.js';

/** Zulässige Merkmalsarten. */
export const TYPE_OPTIONS = ['binary', 'nominal', 'ordinal'];
/** Zulässige Gewichte für ordinale Merkmale. */
export const WEIGHTS_OPTIONS = ['linear', 'quadratic'];
/** Zulässige Regelwerke: AIAG MSA 4. Auflage oder Bosch Heft 10. */
export const RULESET_OPTIONS = ['aiag', 'bosch'];
/** Zulässige Layouts: eine Bewertungsspalte (long) oder je Prüfer und Versuch eine (wide). */
export const LAYOUT_OPTIONS = ['long', 'wide'];
/** Zulässige Irrtumswahrscheinlichkeiten. */
export const ALPHA_OPTIONS = [0.01, 0.05, 0.1];

/** @param {{ instanceId: string, sheetId: string, columnId: string }} r @returns {string} */
const key = (r) => `${r.instanceId}|${r.sheetId}|${r.columnId}`;

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

export class State extends defineModel({
  version: '1.0',
  fields: {
    type: oneOf(['binary', 'nominal', 'ordinal'], { default: 'binary' }),
    positiveLevel: text({ nullable: true }),
    weights: oneOf(['linear', 'quadratic'], { default: 'quadratic' }),
    alpha: oneOf([0.01, 0.05, 0.1], { default: 0.05 }),
    ruleSet: oneOf(['aiag', 'bosch'], { default: 'aiag' }),
    layout: oneOf(['long', 'wide'], { default: 'long' }),
    trials: number({ integer: true, min: 1, default: 2 }),
    part: columnRef(),
    appraiser: columnRef(),
    rating: columnRef(),
    reference: columnRef(),
    replicate: columnRef(),
    ratings: list(columnRef({ nullable: false })),
    exampleWorksheetId: text({ nullable: true }),
  },
  view: {
    kappaEdits: ScatterChart.edits(),
    effectivenessEdits: ScatterChart.edits(),
    sdtEdits: ScatterChart.edits(),
    runStripEdits: map(number({ integer: true, min: 0 }), GageRunChart.edits()),
    heatmapEdits: map(number({ integer: true, min: 0 }), HeatmapChart.edits()),
  },
  migrations: { '0→1.0': from0 },
  derived: {
    /**
     * Stufen der Bewertungen; leer, solange keine Bewertungsspalte gewählt ist.
     * @param {any} data Arbeitsblattsicht
     * @this {import('./model.types.js').StateModel}
     * @returns {Levels}
     */
    levels(data) { return readLevels(this, data); },
    /**
     * Die Analyse; null, solange Pflichtspalten fehlen oder keine Zeile entsteht.
     * @param {any} data Arbeitsblattsicht
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    analysis(data) { return readAnalysis(this, data); },
  },
  invariants: {
    uniqueRatings: {
      fields: ['ratings'],
      test(m) { return new Set(m.ratings.map(key)).size === m.ratings.length; },
      repair(m) {
        const seen = new Set();
        m._v.ratings = m.ratings.filter((r) => {
          const k = key(r);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      },
    },
  },
}) {
  /** @returns {boolean} wahr bei einer Spalte, Bewertungsspalten oder positiver Stufe (steuert die Rückfrage vor dem Überschreiben) */
  hasContent() {
    return Boolean(this.part) || Boolean(this.appraiser) || Boolean(this.rating)
      || Boolean(this.reference) || Boolean(this.replicate) || this.ratings.length > 0
      || Boolean(this.positiveLevel);
  }
}
