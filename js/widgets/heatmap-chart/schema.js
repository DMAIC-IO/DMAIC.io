/** Heatmap (Typ `heatmap`): Zellwerte je Zeile und Spalte; fehlende Zellen als `null`. */
import { text, number, boolean, list, object } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };

export default chartWidget({
  name: 'heatmap-chart',
  type: 'heatmap',
  keys: {
    xCategories: list(text(), opt), yCategories: list(text(), opt),
    cells: list(list(number({ nullable: true })), opt),
    valueLabel: text(opt), squareCells: boolean(opt),
    plotMargins: object({ top: number(), right: number(), bottom: number(), left: number() }, opt),
    colorScheme: text(ed), showCellLabels: boolean(ed), cellGap: number({ ...ed, min: 0 }),
    valueDecimals: number({ ...ed, integer: true, min: 0 }),
  },
});
