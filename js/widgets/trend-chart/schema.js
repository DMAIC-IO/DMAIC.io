/** Trend-Diagramm (Typ `trend`): eine Linie je Reihe über geordnete Zustände, Skala 0 bis 9. */
import { text, number, list, object } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };

export default chartWidget({
  name: 'trend-chart',
  type: 'trend',
  keys: {
    series: list(object({
      sid: text(), name: text(), color: text(),
      points: list(object({ x: number(), y: number({ nullable: true }) })),
    }), opt),
    xLabels: list(object({ date: text(), name: text() }), opt),
    xCount: number({ ...opt, integer: true, min: 1 }),
    layout: object({
      padT: number(opt), padR: number(opt), padB: number(opt), padL: number(opt),
    }, opt),
    hiddenSeries: list(text(), ed),
  },
});
