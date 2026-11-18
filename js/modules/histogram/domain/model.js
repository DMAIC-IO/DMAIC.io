/**
 * D.Mike — Histogramm: Model.
 *
 * Gespeichert werden Datensätze, Klassen und Konfidenzniveau. Die Reihen
 * baut der view-Block, die Kennzahlen die Ableitung `stats`, beide aus
 * Model und Arbeitsblatt. Ansicht: Statistik-Schalter und die
 * Editor-Einstellungen des Diagramms.
 */
import { defineModel, command, list, object, text, number, boolean, oneOf, columnRef, datasets } from '../../../core/model.js';
import { CHART_COLORS_RGBA } from '../../../core/chart/chart-colors.js';
import { computeSeriesStats } from '../../../core/stats-panel.js';
import histogramChart from '../../../widgets/histogram-chart/schema.js';
import { applyEdits } from '../../../core/chart-edits.js';
import { buildSeries, sourceColumns } from './analyze.js';
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
    // Einstellungen alter Stände ohne Namen, je Index der Reihe.
    legacySeries: list(object({
      fillColor: text({ optional: true }), borderColor: text({ optional: true }), borderWidth: number({ optional: true, min: 0 }),
      borderStyle: oneOf(['solid', 'dash', 'dot', 'none'], { optional: true }), pattern: text({ optional: true }), patternColor: text({ optional: true }),
      patternSolidity: number({ optional: true, min: 0, max: 1 }), visible: boolean({ optional: true }), showNormalCurve: boolean({ optional: true }),
    }), { default: [] }),
  },
  derived: {
    /**
     * Kennzahlen je sichtbarer Reihe (Konfidenzniveau in Prozent). Gerechnet
     * auf den Reihen nach den Editor-Einstellungen: im Editor ausgeblendete
     * Reihen fehlen. Leer, solange es keine Reihen gibt.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {{ name: string, color: string, stats: Record<string, number>|null, ci: Record<string, number[]> }[]}
     */
    stats(src) {
      const built = buildSeries(this, sourceColumns(src));
      if (!('series' in built)) return [];
      const shown = applyEdits({ series: built.series }, this.histogramChart ?? {}, histogramChart.editable, new Set()).series;
      return computeSeriesStats(
        shown.map((/** @type {any} */ r) => ({ name: r.name, values: r.values, color: r.fillColor, visible: r.visible })),
        this.confLevel / 100,
      );
    },
  },
  invariants: {
    binWidthOnlyManual: {
      fields: ['binMode', 'binWidth'],
      test(m) { return m.binMode === 'manual' || m.binWidth === null; },
    },
  },
  commands: {
    clearLegacySeries: command({
      params: {},
      run() { this.legacySeries = []; },
    }),
    setBinMode: command({
      params: { binMode: oneOf(['auto', 'manual']) },
      run({ binMode }) {
        if (binMode === 'auto') this.binWidth = null;
        this.binMode = binMode;
      },
    }),
  },
});
