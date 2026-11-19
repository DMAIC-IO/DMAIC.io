/** Knotendiagramm (Typ `node-diagram`): Kästen und Verbindungen an vorberechneten Orten; Beschriftungen sind ziehbar. */
import { text, number, boolean, oneOf, list, object } from '../../core/model.js';
import { chartWidget } from '../chart-parts.js';

const opt = { optional: true };

export default chartWidget({
  name: 'node-diagram',
  type: 'node-diagram',
  roles: ['moveLabel', 'select'],
  keys: {
    nodes: list(object({
      id: text(), x: number(), y: number(), w: number(), h: number(),
      shape: oneOf(['rect', 'ellipse', 'hexagon'], opt),
      fill: text(opt), stroke: text(opt), strokeWidth: number(opt), dash: text(opt),
      padY: number(opt), align: oneOf(['left', 'center'], opt), highlight: boolean(opt),
      lines: list(object({
        text: text(), weight: number(opt), color: text(opt), size: number(opt), muted: boolean(opt),
      }), opt),
    }), opt),
    links: list(object({
      id: text(opt), from: text(), to: text(),
      shape: oneOf(['straight', 'curve', 'elbow'], opt),
      x1: number(opt), y1: number(opt), x2: number(opt), y2: number(opt),
      offset: number(opt), via: object({ x: number(), y: number() }, opt),
      label: text(opt), arrow: oneOf(['end'], opt),
      style: oneOf(['solid', 'dashed', 'bold', 'wave'], opt),
      width: number(opt), dash: text(opt), color: text(opt), highlight: boolean(opt),
    }), opt),
    highlightClass: text(opt),
    padding: number(opt),
    origin: oneOf(['zero', 'auto', 'fit'], opt),
  },
});
