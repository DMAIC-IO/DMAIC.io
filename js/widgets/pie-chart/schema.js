/** Tortendiagramm (Typ `pie`): Stücke mit Name, Wert und Farbe. */
import { text, number, boolean, list, object, oneOf } from '../../core/model.js';
import PieChart from '../../core/chart/types/pie.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };

export default chartWidget({
  name: 'pie-chart',
  type: 'pie',
  keys: {
    slices: list(object({ name: text(), value: number(), color: text(opt) }), opt),
    showLabels: boolean(opt), labelMode: oneOf(['percent', 'value', 'name', 'both'], opt),
    innerRadius: number({ ...opt, min: 0 }), padAngle: number({ ...opt, min: 0 }), startAngle: number(opt),
    explodeDistance: number({ ...opt, min: 0 }), strokeWidth: number({ ...opt, min: 0 }),
    sortSlices: oneOf(['none', 'asc', 'desc'], opt), centerLabel: text(opt), centerSub: text(opt),
  },
  editable: PieChart.editorKeys,
});
