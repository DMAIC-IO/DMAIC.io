/**
 * Tests for modules/triz-function-analysis/interaction/move-node.js — Geste
 * `move` für die Kästen des Funktionsmodells.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { isGesture } from '../../../js/core/interaction/define.js';
import { moveNode } from '../../../js/modules/triz-function-analysis/interaction/move-node.js';

const host = (components = []) => ({ model: { components }, state: { dragPreview: null } });

suite('triz-function-analysis Geste move-node', () => {
  test('ist eine move-Geste auf .tfa__node', () => {
    assertTrue(isGesture(moveNode));
    assertEqual(moveNode.kind, 'move');
    assertEqual(moveNode.handle, '.tfa__node');
  });

  test('start liest id und Lage aus den Daten des Kastens', () => {
    const el = { dataset: { id: 'c1', tfaX: '120', tfaY: '40' } };
    assertDeepEqual(moveNode.start(el), { id: 'c1', x: 120, y: 40 });
  });

  test('locate addiert den Zeigerweg', () => {
    const from = { id: 'c1', x: 100, y: 50 };
    assertDeepEqual(moveNode.locate({ x: 230, y: 95 }, { origin: { x: 200, y: 100 } }, from), { id: 'c1', x: 130, y: 45 });
  });

  test('step geht je Richtung 10 px', () => {
    const p = { id: 'c1', x: 50, y: 50 };
    assertDeepEqual(moveNode.step(p, { x: 1, y: 0 }), { id: 'c1', x: 60, y: 50 });
    assertDeepEqual(moveNode.step(p, { x: -1, y: 0 }), { id: 'c1', x: 40, y: 50 });
    assertDeepEqual(moveNode.step(p, { x: 0, y: 1 }), { id: 'c1', x: 50, y: 60 });
    assertDeepEqual(moveNode.step(p, { x: 0, y: -1 }), { id: 'c1', x: 50, y: 40 });
  });

  test('clamp rundet und klemmt auf mindestens 0', () => {
    assertDeepEqual(moveNode.clamp({ id: 'c1', x: -7.4, y: 12.6 }), { id: 'c1', x: 0, y: 13 });
  });

  test('toCommand liefert moveComponent', () => {
    assertDeepEqual(moveNode.toCommand({ id: 'c1', x: 1, y: 2 }, { id: 'c1', x: 30, y: 40 }),
      ['moveComponent', { id: 'c1', x: 30, y: 40 }]);
  });

  test('preview setzt und räumt dragPreview', () => {
    const h = host();
    moveNode.preview.call(h, { id: 'c1', x: 5, y: 6, extra: 1 });
    assertDeepEqual(h.state.dragPreview, { id: 'c1', x: 5, y: 6 });
    moveNode.preview.call(h, null);
    assertEqual(h.state.dragPreview, null);
  });

  test('announce nennt Name und Lage, leerer Name → unnamed', () => {
    const t = (k, p) => (p ? `${k}|${p.name}|${p.x}|${p.y}` : k);
    const h = host([{ id: 'c1', name: 'Bürste' }, { id: 'c2', name: '  ' }]);
    assertEqual(moveNode.announce.call(h, { id: 'c1', x: 3, y: 4 }, t), 'modules.triz-function-analysis.announce.move|Bürste|3|4');
    assertEqual(moveNode.announce.call(h, { id: 'c2', x: 3, y: 4 }, t), 'modules.triz-function-analysis.announce.move|modules.triz-function-analysis.unnamed|3|4');
  });
});
