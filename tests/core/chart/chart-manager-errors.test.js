/**
 * D.Mike — ChartManager error handling
 *
 * A chart type that throws (constructor error, unknown/unloadable type) must
 * not break the calling module: create() resolves null, the container shows an
 * i18n'd placeholder, and the manager tracks no chart. A later successful
 * create into the same container removes the placeholder.
 */

import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import ChartManager from '../../../js/core/chart/chart-manager.js';
import ChartBase from '../../../js/core/chart/chart-base.js';

const eventBus = { on() {} };
const i18n = { language: 'de', t: (key) => (key === 'chart.renderError' ? 'render-error-text' : key) };

function makeManager(loadType) {
  const manager = new ChartManager(eventBus, i18n);
  manager._loadType = loadType;
  return manager;
}

function makeContainer() {
  const div = document.createElement('div');
  div.innerHTML = '<svg></svg>';
  return div;
}

/** Silence the expected console.error while fn runs. */
async function quietly(fn) {
  const original = console.error;
  console.error = () => {};
  try { return await fn(); } finally { console.error = original; }
}

suite('ChartManager — failing charts', () => {
  test('a throwing constructor resolves null and leaves a placeholder', async () => {
    const manager = makeManager(async () => class { constructor() { throw new Error('boom'); } });
    const div = makeContainer();
    const chart = await quietly(() => manager.create(div, 'x', {}));
    assertEqual(chart, null);
    const msg = div.querySelector('.chart-render-error');
    assertTrue(!!msg, 'placeholder rendered');
    assertEqual(msg.textContent, 'render-error-text');
    assertEqual(div.querySelector('svg'), null, 'stale chart content removed');
    assertEqual(manager._charts.size, 0);
  });

  test('an unloadable type resolves null and leaves a placeholder', async () => {
    const manager = makeManager(async () => { throw new Error('unknown type'); });
    const div = makeContainer();
    const chart = await quietly(() => manager.create(div, 'nope', {}));
    assertEqual(chart, null);
    assertTrue(!!div.querySelector('.chart-render-error'), 'placeholder rendered');
    assertEqual(manager._charts.size, 0);
  });

  test('a successful create removes an earlier placeholder', async () => {
    let fail = true;
    const manager = makeManager(async () => class {
      constructor() { if (fail) throw new Error('boom'); }
      destroy() {}
    });
    const div = makeContainer();
    await quietly(() => manager.create(div, 'x', {}));
    fail = false;
    const chart = await manager.create(div, 'x', {});
    assertTrue(chart !== null, 'chart created');
    assertEqual(div.querySelector('.chart-render-error'), null);
    assertEqual(manager._charts.size, 1);
  });

  test('destroy() and update() accept the null a failed create returns', () => {
    const manager = makeManager(async () => class {});
    manager.destroy(null);
    manager.update(null, { title: 'x' });
    assertEqual(manager._charts.size, 0);
  });
});

/** A real chart whose render throws while config.boom is set. */
class BoomChart extends ChartBase {
  render() {
    if (this.config.boom) throw new Error('boom');
    return super.render();
  }
}

function makeSizedContainer() {
  const div = document.createElement('div');
  div.style.cssText = 'width: 400px; height: 300px;';
  document.body.appendChild(div);
  return div;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

suite('ChartBase — render errors', () => {
  test('an update that throws leaves a placeholder, a later good update removes it', async () => {
    const manager = makeManager(async () => BoomChart);
    const div = makeSizedContainer();
    try {
      const chart = await manager.create(div, 'x', {});
      await nextFrame();
      await quietly(() => manager.update(chart, { boom: true }));
      const msg = div.querySelector('.chart-render-error');
      assertTrue(!!msg, 'placeholder rendered after a throwing update');
      assertEqual(msg.textContent, 'render-error-text');
      manager.update(chart, { boom: false });
      assertEqual(div.querySelector('.chart-render-error'), null, 'placeholder removed');
      assertTrue(div.querySelector('svg').childElementCount > 0, 'chart drawn again');
      manager.destroy(chart);
    } finally { div.remove(); }
  });

  test('a deferred first render that throws leaves a placeholder', async () => {
    const manager = makeManager(async () => BoomChart);
    const div = makeSizedContainer();
    const original = console.error;
    console.error = () => {};
    try {
      const chart = await manager.create(div, 'x', { boom: true });
      assertTrue(chart !== null, 'constructor itself succeeds');
      await nextFrame();
      await nextFrame();
      assertTrue(!!div.querySelector('.chart-render-error'), 'placeholder rendered');
      manager.destroy(chart);
    } finally { console.error = original; div.remove(); }
  });
});
