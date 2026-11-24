/**
 * D.Mike — Transformierte I-MR-Karte: Model.
 *
 * Gespeichert werden die Messwertspalte, die Art, λ zu bestimmen
 * (`lambdaMode`), und das vorgegebene λ (`lambdaManual`, wirkt nur im Modus
 * `manual`). Ansicht: die Editor-Einstellungen des Diagramms und das
 * Beispielblatt. Gerechnet wird nicht hier: Ergebnis und Punkte liefert der
 * auto-Task `analysis` des Viewmodels (`analyze.js`, die Schätzung von λ ist
 * zu teuer für eine Ableitung).
 */
import { defineModel, command, text, number, oneOf, columnRef } from '../../../core/model.js';
import controlChart from '../../../widgets/control-chart/schema.js';
import { from0 } from './migrations.js';

/** Die Arten, λ zu bestimmen: aus den Daten geschätzt oder von Hand gesetzt (gleich dem Literal im Schema). */
export const LAMBDA_MODES = Object.freeze(['auto', 'manual']);

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    columnRef: columnRef({ types: ['numeric'], minCount: 5 }),
    lambdaMode: oneOf(['auto', 'manual'], { default: 'auto' }),
    lambdaManual: number({ default: 0 }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    chart: controlChart.edits(),
  },
  derived: {
    /**
     * Die Parameterfelder, die im aktuellen Stand wirken: im Modus `manual`
     * auch `lambdaManual`.
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams() { return this.lambdaMode === 'manual' ? ['lambdaMode', 'lambdaManual'] : ['lambdaMode']; },
    /**
     * Die Spaltenfelder, die im aktuellen Stand wirken.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['columnRef']; },
  },
  commands: {
    /**
     * Wechselt die Art, λ zu bestimmen. Beim Wechsel auf `manual` übernimmt
     * es ein mitgegebenes λ (das geschätzte des letzten Ergebnisses) nach
     * `lambdaManual`; ohne λ bleibt der gespeicherte Wert. Ein Schritt.
     */
    setLambdaMode: command({
      params: { mode: oneOf(['auto', 'manual']), lambda: number({ nullable: true, optional: true }) },
      run({ mode, lambda }) {
        this.lambdaMode = mode;
        if (mode === 'manual' && lambda != null) this.lambdaManual = lambda;
      },
    }),
  },
});
