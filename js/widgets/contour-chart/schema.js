/** Konturdiagramm (Typ `contour`): Gitter mit Zeile 0 oben, fehlende Werte als `null`, Messpunkte, Darstellung. */
import { text, number, boolean, oneOf, list, object } from '../../core/model.js';
import ContourChart from '../../core/chart/types/contour.js';
import { chartWidget } from '../chart-parts.js';

export { CONTOUR_DEFAULTS } from '../../core/chart/contour-defaults.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };

export default chartWidget({
  name: 'contour-chart',
  type: 'contour',
  keys: {
    grid: list(list(number({ nullable: true })), opt),
    xRange: list(number(), opt), yRange: list(number(), opt),
    zLabel: text(opt),
    points: list(object({ x: number(), y: number(), z: number() }), opt),
    colorScheme: oneOf(['viridis', 'plasma', 'thermal', 'green', 'grayscale'], ed),
    numLevels: number({ ...ed, integer: true, min: 4, max: 20 }),
    gridRes: oneOf([40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200], ed),
    showLines: boolean(ed), showLabels: boolean(ed), showDataPoints: boolean(ed),
    markerSymbol: text(ed), markerSize: number({ ...ed, min: 2, max: 24 }),
    markerColor: text(ed), markerStroke: text(ed),
    markerStrokeWidth: number({ ...ed, min: 0, max: 6 }),
    markerStrokeDash: oneOf(['solid', 'dash', 'dot', 'dashdot', 'longdash'], ed),
  },
  editable: ContourChart.editorKeys.filter((k) => k !== 'showLegend'),
});
