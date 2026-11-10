/**
 * D.Mike — MSA Typ 5 (attributive Prüfmittelfähigkeit): Model.
 *
 * Merkmalsart, Gewichte, α, Regelwerk, Layout, Versuche je Prüfer, die
 * Spaltenbezüge (fünf einzelne, dazu die Bewertungsspalten des breiten
 * Layouts) und die positive Stufe. Keine Statistik, kein i18n; κ und
 * Wirksamkeit rechnet der view-Block aus Model und Arbeitsblatt.
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
