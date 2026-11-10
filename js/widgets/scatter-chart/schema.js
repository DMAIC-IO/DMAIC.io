/** Streudiagramm (Typ `scatter`). */
import { text, number, boolean, list, object, oneOf } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };

export default chartWidget({
  name: 'scatter-chart',
  type: 'scatter',
  keys: { xTicks: list(number(), opt), xTickLabels: list(text(), opt), xAxis: oneOf(['number', 'date'], opt) },
  series: {
    name: text(), x: list(number()), y: list(number({ nullable: true })), labels: list(text(), opt),
    connectLine: object({ show: boolean(), dash: text(opt), width: number(opt), color: text(opt) }, opt),
    sizes: list(number({ nullable: true }), opt), sizeValues: list(number(), opt), sizeLabel: text(opt),
    errorBars: object({
      show: boolean(),
      yMode: oneOf(['none', 'absolute', 'relative', 'percent'], opt),
      yPlus: list(number({ nullable: true }), opt),
      yMinus: list(number({ nullable: true }), opt),
      bandShow: boolean(opt),
      bandColor: text(opt),
    }, opt),
    color: text(ed), visible: boolean(ed), symbol: text(ed), markerSize: number({ ...ed, min: 0 }),
    stroke: text(ed), strokeWidth: number({ ...ed, min: 0 }),
  },
});
