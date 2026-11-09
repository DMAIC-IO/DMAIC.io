/**
 * D.Mike — MSA Typ 2 (Gage R&R): Model.
 *
 * Die drei Spaltenbezüge (Prüfeinheit, Prüfer, Messwert), die Grenzen, α,
 * Studienfaktor k, Urteilsgrundlage und historisches σ. Keine Statistik, kein
 * i18n; das Ergebnis rechnet der view-Block aus Model und Arbeitsblatt.
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

/** Zulässige Studienfaktoren (6 = Standard, 5,15 = AIAG 3. Auflage). */
export const K_OPTIONS = [6, 5.15];

/** Zulässige Urteilsgrundlagen ('auto' = Toleranz, sobald beide Grenzen gesetzt sind). */
export const VERDICT_BASES = ['auto', 'tolerance', 'studyVar'];

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
      default: (c) => Math.min(0.9999, Math.max(0.0001, Number(((100 - c.confidenceLevel) / 100).toFixed(4)))),
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
