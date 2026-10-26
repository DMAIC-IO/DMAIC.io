/**
 * ChartManager — Diagramme sind nicht reaktiv (Bug 14).
 *
 * Alpine-Viewmodels halten Diagramme in reaktiven Daten und reichen sie an
 * destroy() weiter. Ohne Markierung käme dort ein Proxy an, `_charts.delete`
 * verfehlte das Rohobjekt, und das Diagramm bliebe für die Sitzung im Set.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { reactive } from '@vue/reactivity';
import ChartManager from '../../../js/core/chart/chart-manager.js';
import { createInstanceChartManager } from '../../../js/core/chart/instance-chart-manager.js';

const eventBus = { on() {} };
const i18n = { language: 'de', t: (key) => key };

class FakeChart {
  constructor(container, config) { this.container = container; this.config = config; this.destroyed = false; }
  render() {}
  update(patch) { Object.assign(this.config, patch); }
  destroy() { this.destroyed = true; }
}

function makeManager() {
  const manager = new ChartManager(eventBus, i18n);
  manager._loadType = async () => FakeChart;
  return manager;
}

suite('ChartManager — Diagramme in reaktiven Daten', () => {
  test('create() gibt ein als nicht reaktiv markiertes Diagramm zurück', async () => {
    const chart = await makeManager().create(document.createElement('div'), 'bar', {});
    assertEqual(chart.__v_skip, true);
  });

  test('destroy() über ein in reaktiven Daten gehaltenes Diagramm entfernt es aus _charts', async () => {
    const manager = makeManager();
    const vm = reactive({ _chart: null });
    vm._chart = await manager.create(document.createElement('div'), 'bar', {});
    assertEqual(manager._charts.size, 1);
    manager.destroy(vm._chart);
    assertEqual(manager._charts.size, 0);
  });

  test('die Instanz-Fassade gibt dasselbe markierte Diagramm zurück; destroy leert _charts', async () => {
    const manager = makeManager();
    const cm = createInstanceChartManager(manager, { getChartEdits: () => null, setChartEdit() {} }, 'i1');
    const vm = reactive({ _charts: [] });
    vm._charts.push(await cm.create(document.createElement('div'), 'bar', {}));
    assertTrue(vm._charts[0].__v_skip === true);
    cm.destroy(vm._charts[0]);
    assertEqual(manager._charts.size, 0);
  });
});
