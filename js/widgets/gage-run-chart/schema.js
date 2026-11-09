/** Gage-Run-Diagramm (Typ `gage-run-chart`): ein Streifen mit Teilefeldern und Prüferserien. */
import { text, number, boolean, list, object } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };

export default chartWidget({
  name: 'gage-run-chart',
  type: 'gage-run-chart',
  keys: {
    panels: list(object({
      part: text(),
      series: list(object({ operator: text(), values: list(number()), mean: number({ nullable: true }) })),
    }), opt),
    operators: list(text(), opt),
    refValue: number({ ...opt, nullable: true }),
    refLabel: text(opt),
    sharedYMin: number({ ...opt, nullable: true }),
    sharedYMax: number({ ...opt, nullable: true }),
    showOperatorMean: boolean(opt),
    connectWithin: boolean(opt),
  },
});
