/** Balkendiagramm (Typ `bar`): Kategorien mit Gruppen, gestapelt oder gruppiert. */
import { text, number, boolean, list, object } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const groups = list(object({ name: text(), values: list(number()), color: text(opt) }), opt);

export default chartWidget({
  name: 'bar-chart',
  type: 'bar',
  keys: { categories: list(text(), opt), groups, stacked: boolean(opt), barGap: number(opt), categoryGap: number(opt) },
});
