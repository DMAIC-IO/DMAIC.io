/** Pareto-Diagramm (Typ `pareto`): Einträge oder Kategorien mit Gruppen, Sammelposten, Summenlinie. */
import { text, number, boolean, list, object } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };
const groups = list(object({ name: text(), values: list(number()), color: text(opt) }), opt);

export default chartWidget({
  name: 'pareto-chart',
  type: 'pareto',
  keys: {
    items: list(object({ name: text(), value: number(), color: text(opt) }), opt),
    categories: list(text(), opt), groups,
    rightYLabel: text(opt),
    otherLabel: text(opt), otherCountTemplate: text(opt),
    refLineValue: number({ ...ed, min: 0 }), maxItems: number({ ...ed, integer: true, min: 1 }), otherBucket: boolean(ed),
    cumDotSymbol: text(ed), cumDotSize: number({ ...ed, min: 0 }), cumDotFill: text(ed),
    cumDotStroke: text(ed), cumDotStrokeWidth: number({ ...ed, min: 0 }),
  },
});
