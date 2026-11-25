/** Multi-Vari-Diagramm (Typ `multi-vari`): Streifen mit Feldern, Gruppen und Serien. */
import { text, number, boolean, list, object } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };

export default chartWidget({
  name: 'multi-vari-chart',
  type: 'multi-vari',
  keys: {
    panels: list(object({
      panelLevel: text(),
      groups: list(object({
        level: text(),
        mean: number({ nullable: true }),
        series: list(object({ level: text(), values: list(number()), mean: number() })),
      })),
    }), opt),
    seriesLevels: list(text(), opt),
    rowLabel: text(opt),
    refValue: number({ ...opt, nullable: true }),
    refLabel: text(opt),
    sharedYMin: number({ ...opt, nullable: true }),
    sharedYMax: number({ ...opt, nullable: true }),
    showPoints: boolean(opt),
    connectMeans: boolean(opt),
    showGroupMean: boolean(opt),
    pointSize: number({ ...ed, min: 0 }), pointStrokeWidth: number({ ...ed, min: 0 }),
  },
});
