/**
 * D.Mike — VoC → CTx tree: diagram layout for the image export
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { buildTreeDiagram } from '../../js/modules/voc-ctx-tree/voc-ctx-tree-diagram.js';
import { DEFAULT_COLORS } from '../../js/modules/voc-ctx-tree/voc-ctx-tree-model.js';
import { parseRGBA, rgbaStr } from '../../js/core/chart/chart-editor.js';

const LABELS = { source: 'Quelle', badgeNeed: 'BEDARF', badgeReq: 'ANF', target: 'Ziel', measurement: 'Messung' };
const STYLES = { borderWidth: 2, colors: { ...DEFAULT_COLORS } };

function voc(extraNeeds = []) {
  return {
    text: 'Schnell', source: 'Umfrage',
    needs: [
      { text: 'Pünktlich', drivers: [{ type: 'ctq', text: 'Lieferzeit',
        requirements: [{ text: '< 30 min', target: '30', measure: 'Stoppuhr' }] }] },
      ...extraNeeds,
    ],
  };
}

const alpha = (rgba, a) => rgbaStr({ ...parseRGBA(rgba), a });

suite('buildTreeDiagram — layout', () => {
  test('no VoC → null', () => {
    assertEqual(buildTreeDiagram(null, STYLES, LABELS), null);
  });

  test('one node per item, indented 36 px per level from PAD 20', () => {
    const { nodes } = buildTreeDiagram(voc(), STYLES, LABELS);
    assertEqual(nodes.length, 4);
    assertDeepEqual(nodes.map((n) => n.x), [20, 56, 92, 128]);
    assertTrue(nodes.every((n) => n.w === 280), 'node width 280');
  });

  test('heights and vertical stacking: padding, badge, 16 px lines, 8 px gap', () => {
    const { nodes } = buildTreeDiagram(voc(), STYLES, LABELS);
    // root: 2 lines → 6·2 + 14 + 4 + 2·16 = 62
    assertEqual(nodes[0].y, 20);
    assertEqual(nodes[0].h, 62);
    assertEqual(nodes[1].y, 20 + 62 + 8);
  });

  test('sub-lines for source, target and measurement are muted size 10', () => {
    const { nodes } = buildTreeDiagram(voc(), STYLES, LABELS);
    assertDeepEqual(nodes[0].lines, [
      { text: '„Schnell“', size: 12 },
      { text: 'Quelle: Umfrage', size: 10, muted: true },
    ]);
    assertDeepEqual(nodes[3].lines.slice(1), [
      { text: 'Ziel: 30', size: 10, muted: true },
      { text: 'Messung: Stoppuhr', size: 10, muted: true },
    ]);
  });

  test('long texts wrap at the 7 px char estimate (35 chars per line)', () => {
    const long = voc();
    long.needs[0].text = 'Die Lieferung kommt jeden Tag zur vereinbarten Zeit an';
    const { nodes } = buildTreeDiagram(long, STYLES, LABELS);
    assertTrue(nodes[1].lines.length >= 2, 'wrapped');
    assertTrue(nodes[1].lines.every((l) => l.text.length <= 35), 'each line fits');
  });
});

suite('buildTreeDiagram — links and colours', () => {
  test('each node links to the nearest preceding node one level up', () => {
    const { nodes, links } = buildTreeDiagram(voc([{ text: 'Freundlich', drivers: [] }]), STYLES, LABELS);
    const pairs = links.map((l) => `${nodes.findIndex((n) => n.id === l.from)}>${nodes.findIndex((n) => n.id === l.to)}`);
    assertDeepEqual(pairs, ['0>1', '1>2', '2>3', '0>4']);
    assertTrue(links.every((l) => l.shape === 'elbow' && l.dash === '4 3' && l.width === 1.5), 'link style');
  });

  test('links take the parent stroke colour', () => {
    const { links } = buildTreeDiagram(voc(), STYLES, LABELS);
    assertEqual(links[0].color, alpha(DEFAULT_COLORS.voc, 1));
    assertEqual(links[2].color, alpha(DEFAULT_COLORS.ctq, 1));
  });

  test('node colours from styles.colors: stroke alpha 1, fill alpha 0.08, badge = stroke', () => {
    const { nodes } = buildTreeDiagram(voc(), STYLES, LABELS);
    assertEqual(nodes[2].stroke, alpha(DEFAULT_COLORS.ctq, 1));
    assertEqual(nodes[2].fill, alpha(DEFAULT_COLORS.ctq, 0.08));
    assertEqual(nodes[2].strokeWidth, 2);
    assertDeepEqual(nodes.map((n) => n.badge.text), ['VOC', 'BEDARF', 'CTQ', 'ANF']);
    assertEqual(nodes[2].badge.color, nodes[2].stroke);
  });
});
