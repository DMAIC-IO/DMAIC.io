/** Einzelwertdiagramm (Typ `individual-value-plot`): Gruppen mit Werten, Mittel- und Medianmarken. */
import { text, number, boolean, list, object } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };

export default chartWidget({
  name: 'individual-value-plot-chart',
  type: 'individual-value-plot',
  keys: {
    groups: list(object({ name: text(), values: list(number()), color: text(opt) }), opt),
    showMean: boolean(ed), showMedian: boolean(ed), connectMeans: boolean(ed), showOverallMean: boolean(ed),
    jitter: number({ ...ed, min: 0, max: 1 }),
  },
});
