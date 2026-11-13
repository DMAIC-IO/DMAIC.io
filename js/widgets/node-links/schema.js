/** Knotenlinien (Typ `node-diagram`): zeichnet nur die Verbindungslinien; die Knoten setzt die Vorlage als HTML. */
import { text, number, boolean, oneOf, list, object } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };

export default chartWidget({
  name: 'node-links',
  type: 'node-diagram',
  keys: {
    links: list(object({
      from: text(), to: text(),
      shape: oneOf(['straight', 'curve', 'elbow'], opt),
      x1: number(opt), y1: number(opt), x2: number(opt), y2: number(opt),
      color: text(opt), width: number(opt), dash: text(opt), highlight: boolean(opt),
    }), opt),
    highlightClass: text(opt),
    padding: number(opt),
    origin: oneOf(['zero', 'auto', 'fit'], opt),
  },
});
