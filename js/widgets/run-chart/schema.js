/** Verlaufsdiagramm (Typ `run-chart`): Werte in Reihenfolge mit Median. */
import { text, number, list } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };

export default chartWidget({
  name: 'run-chart',
  type: 'run-chart',
  keys: { values: list(number(), opt), median: number(opt), pointColor: text(opt), lineColor: text(opt) },
});
