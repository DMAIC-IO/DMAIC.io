/** Streudiagramm (Typ `scatter`). */
import { text, number, boolean, list } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };

export default chartWidget({
  name: 'scatter-chart',
  type: 'scatter',
  keys: { connectLine: boolean(opt) },
  series: {
    name: text(), x: list(number()), y: list(number()), labels: list(text(), opt),
    color: text(ed), visible: boolean(ed), symbol: text(ed), markerSize: number({ ...ed, min: 0 }),
    stroke: text(ed), strokeWidth: number({ ...ed, min: 0 }),
  },
});
