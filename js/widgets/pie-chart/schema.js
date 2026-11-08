/** Tortendiagramm (Typ `pie`): Stücke mit Name, Wert und Farbe. */
import { text, number, boolean, list, object, oneOf } from '../../core/model.js';
import PieChart from '../../core/chart/types/pie.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };

export default chartWidget({
  name: 'pie-chart',
  type: 'pie',
  keys: {
    slices: list(object({ name: text(), value: number(), color: text(opt) }), opt),
    showLabels: boolean(ed), labelMode: oneOf(['percent', 'value', 'name', 'both'], ed),
    innerRadius: number({ ...ed, min: 0 }), padAngle: number({ ...ed, min: 0 }), startAngle: number(ed),
    explodeDistance: number({ ...ed, min: 0 }), strokeWidth: number({ ...ed, min: 0 }),
    sortSlices: oneOf(['none', 'asc', 'desc'], ed), centerLabel: text(ed), centerSub: text(ed),
  },
  editable: PieChart.editorKeys,
});
