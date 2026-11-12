/** Kostenverlauf (Typ `cumulative-cost`): Geld links, Stunden rechts über einer Zeitachse. */
import { text, number, boolean, oneOf, list, object } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const pts = list(object({ t: number(), v: number() }), opt);

export default chartWidget({
  name: 'cumulative-cost-chart',
  type: 'cumulative-cost',
  keys: {
    mode: oneOf(['cumulative', 'rate'], opt),
    moneyPts: pts,
    hoursPts: pts,
    peakMoney: number(opt),
    peakHours: number(opt),
    xDomain: object({ min: number(), max: number() }, opt),
    ticks: list(number(), opt),
    tickLabels: list(text(), opt),
    stepDays: number(opt),
    moneyUnit: text(opt),
    hoursUnit: text(opt),
    moneyLabel: text(opt),
    hoursLabel: text(opt),
    now: number(opt),
    showToday: boolean(opt),
    lang: text(opt),
    layout: object({
      labelW: number(opt), padL: number(opt), padR: number(opt),
      padT: number(opt), padB: number(opt), innerH: number(opt),
    }, opt),
  },
});
