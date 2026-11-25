/** Verlaufsdiagramm (Typ `run-chart`): Werte in Reihenfolge mit Median. */
import { text, number, list } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };

export default chartWidget({
  name: 'run-chart',
  type: 'run-chart',
  keys: {
    values: list(number(), opt), median: number(opt),
    pointColor: text(ed), aboveColor: text(ed), pointStroke: text({ ...ed, nullable: true }),
    pointSize: number({ ...ed, min: 0 }), pointStrokeWidth: number({ ...ed, min: 0 }), pointSymbol: text(ed),
    lineColor: text(opt),
  },
});
