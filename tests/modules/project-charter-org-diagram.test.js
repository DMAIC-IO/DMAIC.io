/**
 * D.Mike — Project charter: org chart as node-diagram config
 */

import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { buildOrgDiagram } from '../../js/modules/project-charter/project-charter-org-diagram.js';

const NW = 220;
const STYLE = { nodeBg: '', nodeBorderColor: '', nodeBorderStyle: 'solid', nodeBorderWidth: 1, lineColor: '', lineWidth: 2, lineStyle: 'dashed' };

function org() {
  return [
    { id: 'r', pid: null, title: 'Sponsor', desc: 'Dr. Meier', _x: 100, _y: 60 },
    { id: 'c', pid: 'r', title: 'PL', desc: '', _x: 0, _y: 200 },
    { id: 'h', pid: 'r', title: 'Hidden', desc: '', _x: 300, _y: 200, _h: true },
    { id: 'g', pid: 'h', title: 'Grandchild', desc: '', _x: 300, _y: 320, _h: true },
  ];
}
const HEIGHTS = new Map([['r', 80], ['c', 60]]);

suite('buildOrgDiagram', () => {
  test('hidden nodes and their links are dropped', () => {
    const { nodes, links } = buildOrgDiagram(org(), STYLE, HEIGHTS, { selectedId: null, width: NW });
    assertDeepEqual(nodes.map((n) => n.id), ['r', 'c']);
    assertDeepEqual(links.map((l) => `${l.from}>${l.to}`), ['r>c']);
  });

  test('curve endpoints: parent bottom-centre to child top-centre, using heights', () => {
    const { links } = buildOrgDiagram(org(), STYLE, HEIGHTS, { selectedId: null, width: NW });
    const l = links[0];
    assertEqual(l.shape, 'curve');
    assertDeepEqual([l.x1, l.y1, l.x2, l.y2], [100 + 110, 60 + 80, 0 + 110, 200]);
  });

  test('line style from orgStyle; solid has no dash', () => {
    const { links } = buildOrgDiagram(org(), STYLE, HEIGHTS, { selectedId: null, width: NW });
    assertEqual(links[0].dash, '8 4');
    assertEqual(links[0].width, 2);
    assertEqual(links[0].color, undefined, 'unset colour → theme default');
    const solid = buildOrgDiagram(org(), { ...STYLE, lineStyle: 'solid' }, HEIGHTS, { selectedId: null, width: NW });
    assertEqual(solid.links[0].dash, undefined);
  });

  test('per-node style beats orgStyle', () => {
    const nodes = org();
    nodes[1].bg = '#ffeeee';
    nodes[1].borderColor = '#aa0000';
    nodes[1].borderWidth = 3;
    nodes[1].borderStyle = 'dotted';
    const style = { ...STYLE, nodeBg: '#eeeeee', nodeBorderColor: '#333333', nodeBorderWidth: 2 };
    const d = buildOrgDiagram(nodes, style, HEIGHTS, { selectedId: null, width: NW });
    const [root, child] = d.nodes;
    assertDeepEqual([root.fill, root.stroke, root.strokeWidth, root.dash], ['#eeeeee', '#333333', 2, undefined]);
    assertDeepEqual([child.fill, child.stroke, child.strokeWidth, child.dash], ['#ffeeee', '#aa0000', 3, '2 4']);
  });

  test('title 13/600, description muted 11, org text metrics', () => {
    const { nodes } = buildOrgDiagram(org(), STYLE, HEIGHTS, { selectedId: null, width: NW });
    assertDeepEqual(nodes[0].lines, [
      { text: 'Sponsor', size: 13, weight: 600 },
      { text: 'Dr. Meier', size: 11, muted: true },
    ]);
    assertDeepEqual(nodes[1].lines, [{ text: 'PL', size: 13, weight: 600 }], 'no empty description line');
    assertDeepEqual([nodes[0].padX, nodes[0].padY, nodes[0].lineHeight], [12, 8, 18]);
    assertDeepEqual([nodes[0].x, nodes[0].y, nodes[0].w, nodes[0].h], [100, 60, NW, 80]);
  });

  test('links touching the selected node are highlighted', () => {
    const sel = buildOrgDiagram(org(), STYLE, HEIGHTS, { selectedId: 'c', width: NW });
    assertTrue(sel.links[0].highlight, 'child selected');
    const none = buildOrgDiagram(org(), STYLE, HEIGHTS, { selectedId: null, width: NW });
    assertTrue(!none.links[0].highlight, 'nothing selected');
  });

  test('a node without measured height falls back to 70 px', () => {
    const { nodes } = buildOrgDiagram(org(), STYLE, new Map(), { selectedId: null, width: NW });
    assertEqual(nodes[0].h, 70);
  });
});
