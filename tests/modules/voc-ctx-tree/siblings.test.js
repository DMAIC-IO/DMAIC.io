/**
 * Geste Umsortieren des VoC → CTx-Baums (interaction/siblings.js): Position
 * am Abzeichen mit Art, Elternkette und Geschwister-ids, Bereich nur in der
 * Ausgangsgruppe, Vorschau im UI-State, Kommando „an die Stelle von“.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { isGesture } from '../../../js/core/interaction/define.js';
import { siblingsGesture, startAt } from '../../../js/modules/voc-ctx-tree/interaction/siblings.js';

/**
 * Eine Gruppe mit Elementen (ohne DOM) und ein Griff im Element `at`.
 * @param {string} key @param {string[]} ids @param {number} at @param {Record<string, string>} node dataset des Knotens
 */
function fixture(key, ids, at, node) {
  /** @type {any} */
  const group = {
    dataset: { reorderGroup: key },
    hasAttribute: (a) => a === 'data-reorder-closed',
    querySelectorAll: () => items,
    getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: ids.length * 10 }),
  };
  /** @type {any[]} */
  const items = ids.map((id, i) => ({
    dataset: { id, reorderIndex: String(i) },
    closest: (sel) => (sel === '[data-reorder-group]' ? group : null),
    getBoundingClientRect: () => ({ left: 0, right: 100, top: i * 10, bottom: i * 10 + 10, width: 100, height: 10 }),
  }));
  const nodeEl = { dataset: node };
  /** @type {any} */
  const handle = {
    closest(sel) {
      if (sel === '[data-id]' || sel === '[data-reorder-index]') return items[at];
      if (sel === '[data-reorder-group]') return group;
      if (sel === '[data-drag-type]') return nodeEl;
      return null;
    },
  };
  /** @type {any} */
  const root = { querySelectorAll: () => [group] };
  return { group, items, handle, root };
}

const ctxOf = (root) => ({ root, axis: 'y', listIndexAt: (items, p) => {
  const i = items.findIndex((el) => { const r = el.getBoundingClientRect(); return p.y < r.top + r.height / 2; });
  return i < 0 ? items.length : i;
} });

suite('voc-ctx-tree — Geste Umsortieren', () => {
  test('ist eine geprüfte Geste mit Griff .vct__drag-handle auf der y-Achse', () => {
    assertTrue(isGesture(siblingsGesture));
    assertEqual(siblingsGesture.kind, 'reorder');
    assertEqual(siblingsGesture.handle, '.vct__drag-handle');
    assertEqual(siblingsGesture.axis, 'y');
  });

  test('start liest Gruppe, Index, Art, Elternkette und die Geschwister', () => {
    const need = fixture('need:v1', ['n1', 'n2'], 1, { dragType: 'need', vocId: 'v1', needId: 'n2' });
    assertDeepEqual(startAt(need.handle), { group: 'need:v1', index: 1, kind: 'need', id: 'n2', vocId: 'v1', ids: ['n1', 'n2'] });
    const drv = fixture('driver:n1', ['d1', 'd2', 'd3'], 0, { dragType: 'driver', vocId: 'v1', needId: 'n1', drvId: 'd1' });
    assertDeepEqual(startAt(drv.handle), { group: 'driver:n1', index: 0, kind: 'driver', id: 'd1', vocId: 'v1', needId: 'n1', ids: ['d1', 'd2', 'd3'] });
    const req = fixture('req:d1', ['r1', 'r2'], 0, { dragType: 'req', vocId: 'v1', needId: 'n1', drvId: 'd1', reqId: 'r1' });
    assertDeepEqual(startAt(req.handle), { group: 'req:d1', index: 0, kind: 'req', id: 'r1', vocId: 'v1', needId: 'n1', drvId: 'd1', ids: ['r1', 'r2'] });
  });

  test('locate nur in der Ausgangsgruppe: außerhalb keine Position; Endindex ohne das gezogene Element', () => {
    const f = fixture('driver:n1', ['d1', 'd2', 'd3'], 0, { dragType: 'driver', vocId: 'v1', needId: 'n1', drvId: 'd1' });
    const from = startAt(f.handle);
    const ctx = ctxOf(f.root);
    assertEqual(siblingsGesture.locate({ x: 50, y: 40 }, ctx, from), null);
    assertEqual(siblingsGesture.locate({ x: 150, y: 5 }, ctx, from), null);
    assertDeepEqual(siblingsGesture.locate({ x: 50, y: 29 }, ctx, from), { group: 'driver:n1', index: 2 });
    assertDeepEqual(siblingsGesture.locate({ x: 50, y: 2 }, ctx, from), { group: 'driver:n1', index: 0 });
    const other = { ...from, group: 'driver:n9' };
    assertEqual(siblingsGesture.locate({ x: 50, y: 5 }, ctx, other), null);
  });

  test('clamp: am Ausgangsplatz die Startposition selbst, sonst die Startposition mit neuem Index; fremde Gruppe null', () => {
    const f = fixture('need:v1', ['n1', 'n2', 'n3'], 2, { dragType: 'need', vocId: 'v1', needId: 'n3' });
    const from = startAt(f.handle);
    const ctx = ctxOf(f.root);
    assertTrue(siblingsGesture.clamp({ group: 'need:v1', index: 5 }, ctx, from) === from);
    assertTrue(siblingsGesture.clamp({ group: 'need:v1', index: 2 }, ctx, from) === from);
    assertDeepEqual(siblingsGesture.clamp({ group: 'need:v1', index: 0 }, ctx, from), { ...from, index: 0 });
    assertEqual(siblingsGesture.clamp({ group: 'need:v9', index: 0 }, ctx, from), null);
  });

  test('preview: das Ziel ist der Geschwisterknoten am Endindex, am Ausgangsplatz keins, null räumt auf', () => {
    const host = { state: { dropTarget: null } };
    const from = { group: 'need:v1', index: 0, kind: 'need', id: 'n1', vocId: 'v1', ids: ['n1', 'n2', 'n3'] };
    siblingsGesture.preview.call(host, { ...from, index: 2 });
    assertEqual(host.state.dropTarget, 'n3');
    siblingsGesture.preview.call(host, from);
    assertEqual(host.state.dropTarget, null);
    siblingsGesture.preview.call(host, { ...from, index: 1 });
    siblingsGesture.preview.call(host, null);
    assertEqual(host.state.dropTarget, null);
  });

  test('toCommand: reorderNodes mit Elternkette je Ebene und der id am Endindex', () => {
    const need = { group: 'need:v1', index: 0, kind: 'need', id: 'n1', vocId: 'v1', ids: ['n1', 'n2', 'n3'] };
    assertDeepEqual(siblingsGesture.toCommand(need, { ...need, index: 2 }),
      ['reorderNodes', { kind: 'need', vocId: 'v1', fromId: 'n1', toId: 'n3' }]);
    const drv = { group: 'driver:n1', index: 2, kind: 'driver', id: 'd3', vocId: 'v1', needId: 'n1', ids: ['d1', 'd2', 'd3'] };
    assertDeepEqual(siblingsGesture.toCommand(drv, { ...drv, index: 0 }),
      ['reorderNodes', { kind: 'driver', vocId: 'v1', fromId: 'd3', toId: 'd1', needId: 'n1' }]);
    const req = { group: 'req:d1', index: 0, kind: 'req', id: 'r1', vocId: 'v1', needId: 'n1', drvId: 'd1', ids: ['r1', 'r2'] };
    assertDeepEqual(siblingsGesture.toCommand(req, { ...req, index: 1 }),
      ['reorderNodes', { kind: 'req', vocId: 'v1', fromId: 'r1', toId: 'r2', needId: 'n1', drvId: 'd1' }]);
  });
});
