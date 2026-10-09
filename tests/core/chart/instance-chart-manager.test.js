/**
 * Instance-bound chart manager: lays stored label edits over module configs,
 * allocates stable chart keys, and records edits from the chart editor.
 * DOM-free: the base manager and charts are fakes.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { createInstanceChartManager } from '../../../js/core/chart/instance-chart-manager.js';

function fakeChart(config) {
  const root = { parentNode: {} };
  return {
    config: { ...config }, _svg: {}, _card: root, renders: 0,
    render() { this.renders++; },
    update(patch) { Object.assign(this.config, patch); this.render(); },
    destroy() { this._svg = null; root.parentNode = null; },
    detach() { root.parentNode = null; },
  };
}

function fakeManager() {
  return {
    created: [],
    other() { return 'inherited'; },
    async create(_container, type, config) {
      await Promise.resolve();
      if (type === 'broken') return null;
      const c = fakeChart(config);
      c._card.parentNode = _container || {};
      if (_container && 'isConnected' in _container) c._card.isConnected = _container.isConnected;
      this.created.push(c); return c;
    },
    update(chart, patch) { if (chart) chart.update(patch); },
  };
}

function fakeStore(initial = {}) {
  const data = JSON.parse(JSON.stringify(initial));
  return {
    data,
    getChartEdits(i, k) { return data[i]?.[k] ?? null; },
    setChartEdit(i, k, key, v) {
      data[i] ??= {}; data[i][k] ??= {};
      if (v === '' || v == null) delete data[i][k][key]; else data[i][k][key] = v;
    },
  };
}

suite('InstanceChartManager', () => {
  test('stored edits override module config; other methods are inherited', async () => {
    const store = fakeStore({ i1: { scatter: { xLabel: 'Mine' } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const c = await f.create({}, 'scatter', { xLabel: 'Auto', yLabel: 'AutoY' });
    assertEqual(c.config.xLabel, 'Mine');
    assertEqual(c.config.yLabel, 'AutoY');
    assertDeepEqual(c._autoLabels, { xLabel: 'Auto', yLabel: 'AutoY' });
    assertEqual(f.other(), 'inherited');
  });

  test('editKey is used instead of type', async () => {
    const store = fakeStore({ i1: { xbar: { title: 'T' } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const a = await f.create({}, 'scatter', { editKey: 'xbar' });
    const b = await f.create({}, 'scatter', { editKey: 'r' });
    assertEqual(a.config.title, 'T');
    assertEqual(b.config.title, undefined);
  });

  test('same base key among live charts gets #2, #3', async () => {
    const store = fakeStore({ i1: { 'scatter#2': { title: 'Second' } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const a = await f.create({}, 'scatter', {});
    const b = await f.create({}, 'scatter', {});
    assertEqual(a.config.title, undefined);
    assertEqual(b.config.title, 'Second');
  });

  test('destroyed or detached chart frees its key', async () => {
    const store = fakeStore({ i1: { scatter: { title: 'One' } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const a = await f.create({}, 'scatter', {});
    a.destroy();
    const b = await f.create({}, 'scatter', {});
    assertEqual(b.config.title, 'One');
    b.detach();   // module cleared its container without destroy()
    const c = await f.create({}, 'scatter', {});
    assertEqual(c.config.title, 'One');
  });

  test('parallel creates get distinct keys', async () => {
    const store = fakeStore({ i1: { scatter: { title: 'A' }, 'scatter#2': { title: 'B' } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const [a, b] = await Promise.all([f.create({}, 'scatter', {}), f.create({}, 'scatter', {})]);
    assertEqual(a.config.title, 'A');
    assertEqual(b.config.title, 'B');
  });

  test('a newer create in the same container takes over the pending key', async () => {
    const store = fakeStore({ i1: { scatter: { title: 'A' } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const el = {};
    // A module re-renders before its previous create resolved; the stale
    // chart is discarded, the newer one must still carry the stored edits.
    const [stale, fresh] = await Promise.all([f.create(el, 'scatter', {}), f.create(el, 'scatter', {})]);
    stale.destroy();
    assertEqual(fresh.config.title, 'A');
  });

  test('a pending create whose container left the document frees its key', async () => {
    const store = fakeStore({ i1: { scatter: { title: 'A' } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const oldEl = { isConnected: true };
    const newEl = { isConnected: true };
    // The module's template replaced its plot element while a create into
    // the old one was still pending; the chart in the new element is the real one.
    const stalePromise = f.create(oldEl, 'scatter', {});
    oldEl.isConnected = false;
    const fresh = await f.create(newEl, 'scatter', {});
    (await stalePromise).destroy();
    assertEqual(fresh.config.title, 'A');
  });

  test('charts of a module in a hidden phase keep distinct keys', async () => {
    // The workspace detaches the module containers of hidden phases; their
    // modules keep re-rendering there (theme switch, worksheet edits).
    const store = fakeStore({ i1: { 'control-chart': { title: 'I' }, 'control-chart#2': { title: 'MR' } } });
    const moduleRoot = { isConnected: false, contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; } };
    const elI = { parentNode: moduleRoot, isConnected: false };
    const elMR = { parentNode: moduleRoot, isConnected: false };
    const f = createInstanceChartManager(fakeManager(), store, 'i1', moduleRoot);
    const i = await f.create(elI, 'control-chart', {});
    const mr = await f.create(elMR, 'control-chart', {});
    assertEqual(i.config.title, 'I');
    assertEqual(mr.config.title, 'MR');
    store.data.i1.scatter = { title: 'A' };
    store.data.i1['scatter#2'] = { title: 'B' };
    const [c, d] = await Promise.all([f.create({ parentNode: moduleRoot, isConnected: false }, 'scatter', {}),
      f.create({ parentNode: moduleRoot, isConnected: false }, 'scatter', {})]);
    assertEqual(c.config.title, 'A');
    assertEqual(d.config.title, 'B');
  });

  test('a container replaced inside the module root frees its pending key', async () => {
    const store = fakeStore({ i1: { scatter: { title: 'A' } } });
    const moduleRoot = { contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; } };
    const oldEl = { parentNode: moduleRoot };
    const newEl = { parentNode: moduleRoot };
    const f = createInstanceChartManager(fakeManager(), store, 'i1', moduleRoot);
    const stalePromise = f.create(oldEl, 'scatter', {});
    oldEl.parentNode = null;   // template swapped the plot element
    const fresh = await f.create(newEl, 'scatter', {});
    (await stalePromise).destroy();
    assertEqual(fresh.config.title, 'A');
  });

  test('failed create frees its reserved key', async () => {
    const store = fakeStore({ i1: { broken: { title: 'X' } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    assertEqual(await f.create({}, 'broken', {}), null);
    assertEqual(await f.create({}, 'broken', {}), null);
  });

  test('_onLabelEdit stores the edit under the chart key', async () => {
    const store = fakeStore();
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    await f.create({}, 'scatter', {});
    const b = await f.create({}, 'scatter', {});
    b.config.yLabel = 'Edited';
    b._onLabelEdit('yLabel', 'Edited');
    assertDeepEqual(store.data.i1['scatter#2'], { yLabel: 'Edited' });
  });

  test('clearing a text field restores the automatic value', async () => {
    const store = fakeStore({ i1: { scatter: { xLabel: 'Mine' } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const c = await f.create({}, 'scatter', { xLabel: 'ColumnX' });
    c.config.xLabel = '';
    c._onLabelEdit('xLabel', '');
    assertEqual(c.config.xLabel, 'ColumnX');
    assertEqual(store.getChartEdits('i1', 'scatter').xLabel, undefined);
  });

  test('update keeps stored edits and refreshes automatic values', async () => {
    const store = fakeStore({ i1: { bar: { title: 'Mine' } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const c = await f.create({}, 'bar', { title: 'Auto1', data: 1 });
    f.update(c, { title: 'Auto2', data: 2 });
    assertEqual(c.config.title, 'Mine');
    assertEqual(c.config.data, 2);
    assertEqual(c._autoLabels.title, 'Auto2');
  });

  test('update of a chart not created by the facade passes through', () => {
    const f = createInstanceChartManager(fakeManager(), fakeStore(), 'i1');
    const c = fakeChart({ title: 'x' });
    f.update(c, { title: 'y' });
    assertEqual(c.config.title, 'y');
    assertTrue(c._autoLabels === undefined);
  });
});
