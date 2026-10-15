/**
 * D.Mike — ChartManager.exportOffscreen
 *
 * Renders a chart into a hidden host only for the export, then removes it.
 */

import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import ChartManager from '../../../js/core/chart/chart-manager.js';

const i18n = { language: 'de', t: (k) => (k === 'chart.exportError' ? 'export-error-text' : k) };

/** Capture anchor clicks (downloads) while fn runs. */
async function captureDownloads(fn) {
  const names = [];
  const original = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { names.push(this.download); };
  try { await fn(); } finally { HTMLAnchorElement.prototype.click = original; }
  return names;
}

const DIAGRAM = {
  nodes: [{ id: 'a', x: 0, y: 0, w: 100, h: 40, lines: [{ text: 'A' }] }],
  links: [],
};

suite('ChartManager — exportOffscreen', () => {
  test('SVG export downloads under the given name and leaves no host behind', async () => {
    const manager = new ChartManager({ on() {} }, i18n);
    const before = document.body.childElementCount;
    const names = await captureDownloads(() => manager.exportOffscreen('node-diagram', DIAGRAM, 'svg', 'organigramm'));
    assertEqual(names.join(','), 'organigramm.svg');
    assertEqual(document.body.childElementCount, before, 'host removed');
    assertEqual(manager._charts.size, 0, 'chart destroyed');
  });

  test('PNG export downloads under the given name and leaves no host behind', async () => {
    const manager = new ChartManager({ on() {} }, i18n);
    const before = document.body.childElementCount;
    const names = await captureDownloads(() => manager.exportOffscreen('node-diagram', DIAGRAM, 'png', 'voc-ctx-tree'));
    assertEqual(names.join(','), 'voc-ctx-tree.png');
    assertEqual(document.body.childElementCount, before, 'host removed');
  });

  test('a failing type shows the export error and leaves no host behind', async () => {
    const manager = new ChartManager({ on() {} }, i18n);
    manager._loadType = async () => { throw new Error('boom'); };
    const notes = [];
    manager._notify = (msg, type) => notes.push(`${type}:${msg}`);
    const before = document.body.childElementCount;
    const original = console.error;
    console.error = () => {};
    let names;
    try {
      names = await captureDownloads(() => manager.exportOffscreen('node-diagram', DIAGRAM, 'svg', 'x'));
    } finally { console.error = original; }
    assertEqual(names.length, 0, 'no download');
    assertEqual(notes.join('|'), 'error:export-error-text');
    assertEqual(document.body.childElementCount, before, 'host removed');
  });
});
