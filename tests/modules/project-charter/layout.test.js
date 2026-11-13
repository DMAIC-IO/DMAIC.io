/**
 * Tests for modules/project-charter/domain/{tree,layout}.js — reine
 * Baumhelfer und die Organigramm-Anordnung für Modul und Kachel.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { childrenOf, subtreeIds, isDescendant, siblingsOf } from '../../../js/modules/project-charter/domain/tree.js';
import { layoutOrg, MODULE_LAYOUT, TILE_LAYOUT } from '../../../js/modules/project-charter/domain/layout.js';

const n = (id, pid = null) => ({ id, title: id, desc: '', pid });

// Pizza-Beispiel (examples/projects/charter-pizza-lieferzeit.json)
const PIZZA = [
  n('n1'), n('n2', 'n1'), n('n3', 'n2'), n('n4', 'n3'), n('n5', 'n3'), n('n6', 'n3'), n('n7', 'n2'),
];
// Einmal aus dem Altcode erzeugt: Modul (project-charter.js, VG 36, Wurzel y 60, Höhe 70),
// Kachel (project-charter-org-layout.js, VG 28, Wurzel y 0, Höhe 64).
const PIZZA_MODULE = {
  n1: { x: 396, y: 60 }, n2: { x: 396, y: 166 }, n3: { x: 264, y: 272 }, n4: { x: 0, y: 378 },
  n5: { x: 264, y: 378 }, n6: { x: 528, y: 378 }, n7: { x: 792, y: 272 },
};
const PIZZA_TILE = {
  n1: { x: 396, y: 0 }, n2: { x: 396, y: 92 }, n3: { x: 264, y: 184 }, n4: { x: 0, y: 276 },
  n5: { x: 264, y: 276 }, n6: { x: 528, y: 276 }, n7: { x: 792, y: 184 },
};
const xy = (positions) => Object.fromEntries(Object.entries(positions).map(([id, p]) => [id, { x: p.x, y: p.y }]));

suite('project-charter tree', () => {
  const t = [n('a'), n('b', 'a'), n('c', 'a'), n('d', 'b'), n('e')];
  test('childrenOf in Listenreihenfolge, null = Wurzeln', () => {
    assertDeepEqual(childrenOf(t, 'a').map((x) => x.id), ['b', 'c']);
    assertDeepEqual(childrenOf(t, null).map((x) => x.id), ['a', 'e']);
  });
  test('subtreeIds enthält den Knoten selbst und alle Nachfahren', () => {
    assertDeepEqual(subtreeIds(t, 'a').sort(), ['a', 'b', 'c', 'd']);
    assertDeepEqual(subtreeIds(t, 'e'), ['e']);
  });
  test('isDescendant: echte Nachfahren, nicht der Knoten selbst', () => {
    assertTrue(isDescendant(t, 'd', 'a'));
    assertEqual(isDescendant(t, 'a', 'a'), false);
    assertEqual(isDescendant(t, 'c', 'b'), false);
  });
  test('siblingsOf: Geschwister einschließlich des Knotens', () => {
    assertDeepEqual(siblingsOf(t, 'c').map((x) => x.id), ['b', 'c']);
    assertDeepEqual(siblingsOf(t, 'e').map((x) => x.id), ['a', 'e']);
    assertDeepEqual(siblingsOf(t, 'zz'), []);
  });
});

suite('project-charter layoutOrg', () => {
  test('Konstanten: Modul VG 36 / Wurzel 60, Kachel VG 28 / Wurzel 0', () => {
    assertEqual(MODULE_LAYOUT.vGap, 36);
    assertEqual(MODULE_LAYOUT.rootY, 60);
    assertEqual(TILE_LAYOUT.vGap, 28);
    assertEqual(TILE_LAYOUT.rootY, 0);
  });

  test('Wurzel liegt bei rootY, Kind darunter um Höhe + vGap', () => {
    const r = layoutOrg([n('a'), n('b', 'a')], { ...MODULE_LAYOUT, heights: { a: 50 } });
    assertEqual(r.positions.a.y, 60);
    assertEqual(r.positions.a.h, 50);
    assertEqual(r.positions.b.y, 60 + 50 + 36);
  });

  test('fehlende Höhe → fallbackH 70', () => {
    const r = layoutOrg([n('a')], { ...MODULE_LAYOUT });
    assertEqual(r.positions.a.h, 70);
    assertEqual(r.positions.a.w, 220);
  });

  test('Geschwister in Listenreihenfolge nebeneinander', () => {
    const r = layoutOrg([n('p'), n('x', 'p'), n('y', 'p'), n('z', 'p')], MODULE_LAYOUT);
    assertTrue(r.positions.x.x < r.positions.y.x && r.positions.y.x < r.positions.z.x);
    assertEqual(r.positions.y.x - r.positions.x.x, 220 + 44);
    const swapped = layoutOrg([n('p'), n('y', 'p'), n('x', 'p'), n('z', 'p')], MODULE_LAYOUT);
    assertTrue(swapped.positions.y.x < swapped.positions.x.x);
  });

  test('zwei Wurzeln nebeneinander', () => {
    const r = layoutOrg([n('a'), n('b')], MODULE_LAYOUT);
    assertEqual(r.positions.a.x, 0);
    assertEqual(r.positions.b.x, 220 + 44 * 2);
    assertEqual(r.positions.a.y, r.positions.b.y);
  });

  test('eingeklappter Knoten: Kinder fehlen in positions und links', () => {
    const r = layoutOrg([n('a'), n('b', 'a'), n('c', 'b')], { ...MODULE_LAYOUT, collapsed: ['a'] });
    assertDeepEqual(Object.keys(r.positions), ['a']);
    assertDeepEqual(r.links, []);
    const r2 = layoutOrg([n('a'), n('b', 'a'), n('c', 'b')], { ...MODULE_LAYOUT, collapsed: ['b'] });
    assertDeepEqual(Object.keys(r2.positions).sort(), ['a', 'b']);
    assertEqual(r2.links.length, 1);
  });

  test('links: Form der node-links, Endpunkte Mitte unten → Mitte oben', () => {
    const r = layoutOrg([n('a'), n('b', 'a')], { ...MODULE_LAYOUT, heights: { a: 50 } });
    assertDeepEqual(r.links, [{ from: 'a', to: 'b', shape: 'curve', x1: r.positions.a.x + 110, y1: 60 + 50, x2: r.positions.b.x + 110, y2: r.positions.b.y }]);
    assertTrue(!('color' in r.links[0]) && !('highlight' in r.links[0]));
  });

  test('width/height umschließen alle Knoten', () => {
    const r = layoutOrg(PIZZA, MODULE_LAYOUT);
    assertEqual(r.width, 792 + 220);
    assertEqual(r.height, 378 + 70);
    assertDeepEqual({ w: layoutOrg([], MODULE_LAYOUT).width, h: layoutOrg([], MODULE_LAYOUT).height }, { w: 0, h: 0 });
  });

  test('Pizza-Beispiel mit MODULE_LAYOUT = Positionen des Altcodes', () => {
    assertDeepEqual(xy(layoutOrg(PIZZA, MODULE_LAYOUT).positions), PIZZA_MODULE);
  });

  test('Pizza-Beispiel mit TILE_LAYOUT = Positionen der alten Kachel', () => {
    const r = layoutOrg(PIZZA, TILE_LAYOUT);
    assertDeepEqual(xy(r.positions), PIZZA_TILE);
    assertEqual(r.positions.n1.h, 64);
  });

  test('Höhen als Map oder Objekt', () => {
    const a = layoutOrg([n('a'), n('b', 'a')], { ...MODULE_LAYOUT, heights: new Map([['a', 40]]) });
    assertEqual(a.positions.b.y, 60 + 40 + 36);
  });
});
