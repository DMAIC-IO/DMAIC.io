/** Mosaikdiagramm (Typ `mosaic`): Kategorien mit Gruppen als Anteile. */
import { text, number, boolean, list, object } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };
const groups = list(object({ name: text(), values: list(number()), color: text(opt) }), opt);

export default chartWidget({
  name: 'mosaic-chart',
  type: 'mosaic',
  keys: {
    categories: list(text(), opt), groups,
    showCellLabels: boolean(ed), columnGap: number({ ...ed, min: 0 }), segmentGap: number({ ...ed, min: 0 }),
  },
});
