/** Wahrscheinlichkeitsnetz (Typ `probability-plot`). */
import { text, number, boolean, list } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };

export default chartWidget({
  name: 'probability-plot-chart',
  type: 'probability-plot',
  keys: { data: list(number(), opt), distribution: text(opt) },
  series: {
    name: text(), values: list(number()),
    color: text(ed), visible: boolean(ed), markerSymbol: text(ed), markerSize: number({ ...ed, min: 0 }),
    markerStroke: text(ed), markerStrokeWidth: number({ ...ed, min: 0 }), lineColor: text(ed),
  },
});
