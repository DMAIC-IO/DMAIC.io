/**
 * Instance-bound chart manager: lays stored label edits over module configs,
 * allocates stable chart keys, and records edits from the chart editor.
 * DOM-free: the base manager and charts are fakes.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { reactive } from '@vue/reactivity';
import { createInstanceChartManager, createEditBoundChartManager, LABEL_EDIT_KEYS, TILE_EDIT_KEYS } from '../../../js/core/chart/instance-chart-manager.js';

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

/** ChartBase.editorKeys (kept literal: the node runner does not load chart classes). */
const BASE_EDITOR_KEYS = [
  'title', 'showTitle', 'xLabel', 'yLabel', 'showXLabel', 'showYLabel',
  'showLegend', 'titleSize', 'labelSize', 'tickSize', 'showXTicks', 'showYTicks',
  'bgColor', 'refLines', 'refAreas',
];

function fakeManager() {
  return {
    created: [],
    async editorKeys(type) {
      await Promise.resolve();
      return type === 'pareto' ? [...BASE_EDITOR_KEYS, 'refLineValue', 'maxItems'] : BASE_EDITOR_KEYS;
    },
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

  test('update through a reactive proxy of the chart keeps stored edits', async () => {
    // Alpine view models hold the chart in reactive data and pass what they
    // read back to update(). create() marks the chart non-reactive (Bug 14),
    // so that read is the chart itself, not a proxy.
    const store = fakeStore({ i1: { pie: { showLegend: false } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const vm = reactive({ _chart: null });
    vm._chart = await f.create({}, 'pie', { showLegend: true, data: 1 });
    const c = vm._chart;
    f.update(vm._chart, { showLegend: true, data: 2 });
    assertEqual(c.config.showLegend, false);
    assertEqual(c.config.data, 2);
  });

  test('create marks the chart non-reactive, also when the base manager does not', async () => {
    const f = createInstanceChartManager(fakeManager(), fakeStore(), 'i1');
    const c = await f.create({}, 'bar', { title: 'x' });
    assertEqual(c.__v_skip, true);
    const raw = await f.create({}, 'bar', { persistEdits: false });
    assertEqual(raw.__v_skip, true);
  });

  test('update of a chart not created by the facade passes through', () => {
    const f = createInstanceChartManager(fakeManager(), fakeStore(), 'i1');
    const c = fakeChart({ title: 'x' });
    f.update(c, { title: 'y' });
    assertEqual(c.config.title, 'y');
    assertTrue(c._autoLabels === undefined);
  });

  test('persistEdits:false — stored edits are not laid over and nothing is recorded', async () => {
    const store = fakeStore({ i1: { histogram: { title: 'Stored' } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const c = await f.create({}, 'histogram', { title: 'Model', persistEdits: false });
    assertEqual(c.config.title, 'Model');
    assertEqual(c._onLabelEdit, undefined);
    assertEqual(c._autoLabels, undefined);
    f.update(c, { title: 'Model 2' });
    assertEqual(c.config.title, 'Model 2');
    assertDeepEqual(store.data, { i1: { histogram: { title: 'Stored' } } });
  });

  test('persistEdits:false does not take the chart key from a bound chart', async () => {
    const store = fakeStore({ i1: { histogram: { title: 'Stored' } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    await f.create({}, 'histogram', { persistEdits: false });
    const bound = await f.create({}, 'histogram', { title: 'Auto' });
    assertEqual(bound.config.title, 'Stored');
  });
});

function boundStore(initial = {}) {
  const data = JSON.parse(JSON.stringify(initial));
  const writes = [];
  return {
    data, writes,
    read: (k) => data[k] ?? null,
    write: (k, key, v) => {
      writes.push([k, key, v]);
      data[k] ??= {};
      if (v === '' || v == null) delete data[k][key]; else data[k][key] = v;
    },
  };
}

suite('EditBoundChartManager', () => {
  const TILE_KEYS = [...LABEL_EDIT_KEYS, ...TILE_EDIT_KEYS];

  test('stored tick/legend edits override the config when listed', async () => {
    const s = boundStore({ histogram: { showYTicks: true, showLegend: true } });
    const f = createEditBoundChartManager(fakeManager(), { read: s.read, write: s.write, keys: TILE_KEYS });
    const c = await f.create({}, 'histogram', { showYTicks: false, showLegend: false, showXTicks: false });
    assertEqual(c.config.showYTicks, true);
    assertEqual(c.config.showLegend, true);
    assertEqual(c.config.showXTicks, false);
  });

  test('only listed keys are written', async () => {
    const s = boundStore();
    const f = createEditBoundChartManager(fakeManager(), { read: s.read, write: s.write, keys: TILE_KEYS });
    const c = await f.create({}, 'histogram', {});
    c._onLabelEdit('showYTicks', true);
    c._onLabelEdit('showXGrid', false);
    c._onLabelEdit('bgColor', 'red');
    assertDeepEqual(s.writes, [['histogram', 'showYTicks', true]]);
  });

  test('stored edits with unknown keys are ignored on create and update', async () => {
    const s = boundStore({ histogram: { bgColor: 'red', title: 'Mine' } });
    const f = createEditBoundChartManager(fakeManager(), { read: s.read, write: s.write, keys: TILE_KEYS });
    const c = await f.create({}, 'histogram', { bgColor: 'white' });
    assertEqual(c.config.bgColor, 'white');
    assertEqual(c.config.title, 'Mine');
    f.update(c, { bgColor: 'blue' });
    assertEqual(c.config.bgColor, 'blue');
  });

  test('isInside defaults to "attached": a detached chart frees its key', async () => {
    const s = boundStore();
    const f = createEditBoundChartManager(fakeManager(), { read: s.read, write: s.write, keys: TILE_KEYS });
    const a = await f.create({}, 'histogram', {});
    a.detach();
    const b = await f.create({}, 'histogram', {});
    b._onLabelEdit('title', 'B');
    assertDeepEqual(s.writes, [['histogram', 'title', 'B']]);
  });
});

suite('InstanceChartManager — editor keys', () => {
  test('module charts store tick and legend edits', async () => {
    const store = fakeStore();
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const c = await f.create({}, 'scatter', {});
    c._onLabelEdit('showLegend', false);
    c._onLabelEdit('showYTicks', false);
    c._onLabelEdit('xLabel', 'Mine');
    assertDeepEqual(store.data, { i1: { scatter: { showLegend: false, showYTicks: false, xLabel: 'Mine' } } });
  });

  test('editor settings are stored on _onEditorChange and laid over on create and update', async () => {
    const store = fakeStore();
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const c = await f.create({}, 'scatter', { titleSize: 15, data: 1 });
    c.config.titleSize = 22;
    c.config.bgColor = 'rgba(1,2,3,1)';
    c.config.refLines = [{ value: 5, label: 'LSL' }];
    c._onEditorChange(c);
    assertDeepEqual(store.data.i1.scatter, { titleSize: 22, bgColor: 'rgba(1,2,3,1)', refLines: [{ value: 5, label: 'LSL' }] });
    const d = await f.create({}, 'scatter', { titleSize: 15, data: 2 });
    c.destroy();
    const e = await f.create({}, 'scatter', { titleSize: 15, data: 3 });
    assertEqual(d.config.titleSize, 15);   // scatter#2: nothing stored
    assertEqual(e.config.titleSize, 22);
    assertEqual(e.config.bgColor, 'rgba(1,2,3,1)');
    assertDeepEqual(e.config.refLines, [{ value: 5, label: 'LSL' }]);
    f.update(e, { titleSize: 15, data: 4 });
    assertEqual(e.config.titleSize, 22);
    assertEqual(e.config.data, 4);
    assertDeepEqual(e.config.refLines, [{ value: 5, label: 'LSL' }]);
  });

  test('only changed keys are written; unchanged ones stay out of the store', async () => {
    const store = fakeStore();
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const c = await f.create({}, 'scatter', { titleSize: 15, labelSize: 12 });
    c.config.labelSize = 14;
    c._onEditorChange(c);
    c._onEditorChange(c);
    assertDeepEqual(store.data.i1.scatter, { labelSize: 14 });
  });

  test('stored values are clones: mutating the chart config leaves the store intact', async () => {
    const store = fakeStore({ i1: { scatter: { refLines: [{ value: 1 }] } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const c = await f.create({}, 'scatter', {});
    c.config.refLines.push({ value: 2 });
    c.config.refLines[0].value = 9;
    assertDeepEqual(store.data.i1.scatter.refLines, [{ value: 1 }]);
    c._onEditorChange(c);
    assertDeepEqual(store.data.i1.scatter.refLines, [{ value: 9 }, { value: 2 }]);
    c.config.refLines[1].value = 7;
    assertDeepEqual(store.data.i1.scatter.refLines, [{ value: 9 }, { value: 2 }]);
  });

  test('refLines supplied by the module are neither stored nor laid over', async () => {
    const store = fakeStore({ i1: { scatter: { refLines: [{ value: 1 }] } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const c = await f.create({}, 'scatter', { refLines: [{ value: 42 }] });
    assertDeepEqual(c.config.refLines, [{ value: 42 }]);
    c.config.refLines = [{ value: 43 }];
    c._onEditorChange(c);
    assertDeepEqual(store.data.i1.scatter.refLines, [{ value: 1 }]);
  });

  test('refAreas supplied in an update patch become module-owned', async () => {
    const store = fakeStore({ i1: { scatter: { refAreas: [{ from: 1, to: 2 }] } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const c = await f.create({}, 'scatter', {});
    assertDeepEqual(c.config.refAreas, [{ from: 1, to: 2 }]);
    f.update(c, { refAreas: [{ from: 5, to: 6 }] });
    assertDeepEqual(c.config.refAreas, [{ from: 5, to: 6 }]);
    c.config.refAreas = [];
    c._onEditorChange(c);
    assertDeepEqual(store.data.i1.scatter.refAreas, [{ from: 1, to: 2 }]);
  });

  test('aggregation and stacked are never stored (no editor keys)', async () => {
    const store = fakeStore({ i1: { bar: { aggregation: 'sum', stacked: true } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const c = await f.create({}, 'bar', { aggregation: 'mean', stacked: false });
    assertEqual(c.config.aggregation, 'mean');
    assertEqual(c.config.stacked, false);
    c.config.aggregation = 'count';
    c.config.stacked = true;
    c._onEditorChange(c);
    c._onLabelEdit('stacked', true);
    assertDeepEqual(store.data.i1.bar, { aggregation: 'sum', stacked: true });
  });

  test('type-specific editor keys come from manager.editorKeys', async () => {
    const store = fakeStore({ i1: { pareto: { maxItems: 5 }, scatter: { maxItems: 5 } } });
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const p = await f.create({}, 'pareto', { maxItems: 10 });
    const s = await f.create({}, 'scatter', { maxItems: 10 });
    assertEqual(p.config.maxItems, 5);
    assertEqual(s.config.maxItems, 10);
  });

  test('a label edit moves the baseline: no duplicate write on the following change', async () => {
    const store = fakeStore();
    const writes = [];
    const set = store.setChartEdit.bind(store);
    store.setChartEdit = (...a) => { writes.push(a.slice(2)); set(...a); };
    const f = createInstanceChartManager(fakeManager(), store, 'i1');
    const c = await f.create({}, 'scatter', { title: 'Auto' });
    c.config.title = 'Mine';
    c._onLabelEdit('title', 'Mine');
    c._onEditorChange(c);
    assertDeepEqual(writes, [['title', 'Mine']]);
  });
});

suite('EditBoundChartManager — keys as a function', () => {
  test('keys may be a (type) => Promise<keys> resolver', async () => {
    const s = boundStore({ histogram: { bgColor: 'red' } });
    const f = createEditBoundChartManager(fakeManager(), {
      read: s.read, write: s.write, keys: async (type) => (type === 'histogram' ? ['bgColor'] : []),
    });
    const c = await f.create({}, 'histogram', { bgColor: 'white' });
    assertEqual(c.config.bgColor, 'red');
  });

  test('tile charts (label and tile keys only) write nothing on _onEditorChange', async () => {
    const s = boundStore();
    const f = createEditBoundChartManager(fakeManager(), { read: s.read, write: s.write, keys: [...LABEL_EDIT_KEYS, ...TILE_EDIT_KEYS] });
    const c = await f.create({}, 'histogram', { showLegend: true });
    c.config.showLegend = false;
    c.config.bgColor = 'red';
    c._onEditorChange(c);
    assertDeepEqual(s.writes, []);
  });
});
