/**
 * D.Mike — ChartManager.renderSVG
 *
 * SVG-Text aus Typ und Konfiguration über einen kurzlebigen Host.
 */

import { suite, test, assertEqual, assertTrue, assertThrows } from '../../test-utils.js';
import ChartManager from '../../../js/core/chart/chart-manager.js';

const i18n = { language: 'de', t: (k) => k };
const A = { id: 'a', x: 0, y: 0, w: 100, h: 40, lines: [{ text: 'A' }] };
const B = { id: 'b', x: 0, y: 100, w: 100, h: 40, lines: [{ text: 'B' }] };

suite('ChartManager — renderSVG', () => {
  test('liefert SVG-Text mit Hintergrund und ohne Trefferflächen, Host danach entfernt', async () => {
    const manager = new ChartManager({ on() {} }, i18n);
    const before = document.body.childElementCount;
    const svg = await manager.renderSVG('node-diagram', {
      nodes: [A, B], links: [{ from: 'a', to: 'b', shape: 'curve' }], padding: 30,
    });
    assertTrue(svg.startsWith('<svg'), 'beginnt mit <svg');
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const first = doc.documentElement.firstElementChild;
    assertEqual(first.tagName, 'rect');
    assertEqual(first.getAttribute('width'), '100%');
    assertTrue(!svg.includes('transparent'), 'keine Trefferflächen');
    assertEqual(document.body.childElementCount, before, 'Host entfernt');
    assertEqual(manager._charts.size, 0, 'Diagramm zerstört');
  });

  test('ein Typ, der nicht lädt, wirft und hinterlässt keinen Host', async () => {
    const manager = new ChartManager({ on() {} }, i18n);
    const before = document.body.childElementCount;
    const original = console.error;
    console.error = () => {};
    let err = null;
    try { await manager.renderSVG('gibt-es-nicht', {}); } catch (e) { err = e; } finally { console.error = original; }
    assertTrue(err !== null, 'wirft');
    assertEqual(document.body.childElementCount, before, 'Host entfernt');
  });
});
