/**
 * Regelkarte (Typ `control-chart`). Grenzen als Liste: ein Wert gilt für alle Punkte.
 * `values` darf Lücken als `null` haben (kein Punkt, die Linie verbindet die Nachbarn,
 * die x-Lage bleibt am Index); Grenzlisten nicht.
 */
import { text, number, boolean, list } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };
const ed = { optional: true, editable: true };
const limits = list(number(), opt);

export default chartWidget({
  name: 'control-chart',
  type: 'control-chart',
  keys: {
    values: list(number({ nullable: true }), opt), cl: limits, ucl: limits, lcl: limits, sigma: limits,
    labels: list(text(), opt), xOffset: number(opt),
    violationIndices: list(number({ integer: true, min: 0 }), opt), excludedIndices: list(number({ integer: true, min: 0 }), opt),
    baselineEnd: number({ ...opt, nullable: true }), stageBoundaries: list(number(), opt), showZones: boolean(opt),
    usl: number({ ...opt, nullable: true }), lsl: number({ ...opt, nullable: true }),
    pointColor: text(ed), pointStroke: text({ ...ed, nullable: true }), pointSize: number({ ...ed, min: 0 }),
    pointStrokeWidth: number({ ...ed, min: 0 }), pointSymbol: text(ed),
  },
});
