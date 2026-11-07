/** Histogramm (Chart-Framework-Typ `histogram`). */
import { text, number, boolean, oneOf, list, object } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };

export default chartWidget({
  name: 'histogram-chart',
  type: 'histogram',
  keys: {
    data: list(number(), opt), bins: list(object({ x0: number(), x1: number(), count: number() }), opt), showNormalCurve: boolean(opt), binWidth: number({ ...opt, nullable: true, exclusiveMin: 0 }),
    barGap: number({ ...ed, min: 0 }), pareto: boolean(ed), boxplotStrip: boolean(ed),
  },
  series: {
    name: text(), values: list(number()),
    fillColor: text(ed), borderColor: text(ed), borderWidth: number({ ...ed, min: 0 }),
    borderStyle: oneOf(['solid', 'dash', 'dot', 'none'], ed), pattern: text(ed), patternColor: text(ed),
    patternSolidity: number({ ...ed, min: 0, max: 1 }), visible: boolean(ed), showNormalCurve: boolean(ed),
  },
});
