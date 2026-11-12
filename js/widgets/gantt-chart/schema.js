/** Gantt-Diagramm (Typ `gantt`): ein Balken je Aufgabe auf einer Zeitachse. */
import { text, number, boolean, list, object } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };

export default chartWidget({
  name: 'gantt-chart',
  type: 'gantt',
  keys: {
    tasks: list(object({
      start: number(), end: number(), label: text(), status: text(opt), color: text(opt),
      responsible: text(opt), startDate: text(opt), endDate: text(opt),
    }), opt),
    xDomain: object({ minT: number(), maxT: number() }, opt),
    ticks: list(number(), opt),
    tickLabels: list(text(), opt),
    stepDays: number(opt),
    now: number(opt),
    showToday: boolean(opt),
    todayLabel: text(opt),
    layout: object({
      labelW: number(opt), padL: number(opt), padR: number(opt),
      padT: number(opt), padB: number(opt), rowH: number(opt),
    }, opt),
  },
});
