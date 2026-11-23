/** Boxplot (Typ `boxplot`): Gruppen mit Werten, Ausrichtung und Ausreißerdarstellung. */
import { text, number, boolean, oneOf, list, object } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };

export default chartWidget({
  name: 'boxplot-chart',
  type: 'boxplot',
  keys: {
    groups: list(object({ name: text(), values: list(number()), color: text(opt) }), opt),
    orientation: oneOf(['horizontal', 'vertical'], opt),
    showOutliers: boolean(ed), showMean: boolean(ed), boxHeight: number({ ...ed, min: 0 }),
    outlierSymbol: text(ed), outlierSize: number({ ...ed, min: 0 }), outlierColor: text({ ...ed, nullable: true }),
    outlierStroke: text({ ...ed, nullable: true }), outlierStrokeWidth: number({ ...ed, min: 0 }),
    boxColors: list(text({ nullable: true }), ed),
  },
});
