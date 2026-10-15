/**
 * D.Mike — ChartBase: optional modebar and file-name override
 *
 * Offscreen exports and overlays need a chart without modebar and editor
 * panel, and a download name that does not come from the chart title.
 */

import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import ChartBase from '../../../js/core/chart/chart-base.js';

function mount(config) {
  const host = document.createElement('div');
  host.style.width = '400px';
  host.style.height = '300px';
  document.body.appendChild(host);
  const chart = new ChartBase(host, config, { language: 'de' });
  return { host, chart, done: () => { chart.destroy(); host.remove(); } };
}

suite('ChartBase — showModebar', () => {
  test('by default the modebar and the editor panel are in the DOM', () => {
    const { host, done } = mount({});
    assertTrue(!!host.querySelector('.dmike-chart-modebar'), 'modebar');
    assertTrue(!!host.querySelector('.dmike-chart-editor'), 'editor panel');
    done();
  });

  test('showModebar:false leaves out modebar and editor panel', () => {
    const { host, done } = mount({ showModebar: false });
    assertEqual(host.querySelector('.dmike-chart-modebar'), null, 'modebar');
    assertEqual(host.querySelector('.dmike-chart-editor'), null, 'editor panel');
    assertTrue(!!host.querySelector('.dmike-chart-svg-wrap svg'), 'svg still built');
    done();
  });
});

suite('ChartBase — fileName', () => {
  test('fileName overrides the title-derived name', () => {
    const { chart, done } = mount({ title: 'Mein Chart', fileName: 'organigramm' });
    assertEqual(chart._getFileName(), 'organigramm');
    done();
  });

  test('without fileName the sanitised title is used', () => {
    const { chart, done } = mount({ title: 'Mein Chart' });
    assertEqual(chart._getFileName(), 'Mein_Chart');
    done();
  });
});
