/**
 * D.Mike — Histogramm: Model.
 *
 * Gespeichert werden Datensätze, Klassen und Konfidenzniveau; Reihen und
 * Kennzahlen rechnet der view-Block aus Model und Arbeitsblatt. Ansicht:
 * Statistik-Schalter und die Editor-Einstellungen des Diagramms.
 */
import { defineModel, command, text, number, boolean, oneOf, columnRef, datasets } from '../../../core/model.js';
import { CHART_COLORS_RGBA } from '../../../core/chart/chart-colors.js';
import histogramChart from '../../../widgets/histogram-chart/schema.js';
import { from0 } from './migrations.js';

/** @type {readonly ('auto'|'manual')[]} */
export const BIN_MODES = Object.freeze(['auto', 'manual']);

export const State = defineModel({
  version: '2.0',
  migrations: { '0→2.0': from0 },
  fields: {
    datasets: datasets({
      valueRef: columnRef({ types: ['numeric'], minCount: 1, required: true }),
      groupRef: columnRef({ group: true }),
    }, { multi: true, colors: CHART_COLORS_RGBA }),
    binMode: oneOf(['auto', 'manual'], { default: 'auto' }),
    binWidth: number({ exclusiveMin: 0, nullable: true }),
    confLevel: number({ exclusiveMin: 0, exclusiveMax: 100, step: 0.1, default: 95 }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    showStats: boolean({ default: true }),
    histogramChart: histogramChart.edits(),
  },
  invariants: {
    binWidthOnlyManual: {
      fields: ['binMode', 'binWidth'],
      test(m) { return m.binMode === 'manual' || m.binWidth === null; },
    },
  },
  commands: {
    setBinMode: command({
      params: { binMode: oneOf(['auto', 'manual']) },
      run({ binMode }) {
        if (binMode === 'auto') this.binWidth = null;
        this.binMode = binMode;
      },
    }),
  },
});
