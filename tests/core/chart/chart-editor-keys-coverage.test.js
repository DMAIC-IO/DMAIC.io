/**
 * D.Mike — every chart-level editor setting is listed in the type's editorKeys.
 *
 * Module charts persist chart-editor edits only for the keys in
 * `Ctor.editorKeys` (instance-chart-manager.js). A setting the editor writes
 * to another top-level config key is silently lost on reload. This guard
 * opens the editor of every chart type, changes each form control once and
 * checks that every top-level config key that changed is listed.
 *
 * Keys that carry the module's data (series, groups, …) are excluded: edits
 * nested inside them belong to the module, not to the chart key list.
 */
import { suite, test, assertDeepEqual } from '../../test-utils.js';

const vals = [9.8, 10.1, 10.0, 9.9, 10.3, 10.2, 9.7, 10.0, 10.1, 9.9];

/** type -> { load, config, dataKeys } */
const FIXTURES = {
  scatter: {
    load: () => import('../../../js/core/chart/types/scatter.js'),
    config: { series: [{ name: 'S', x: [1, 2, 3], y: [3, 4, 6] }] },
    dataKeys: ['series'],
  },
  histogram: {
    load: () => import('../../../js/core/chart/types/histogram.js'),
    config: { data: vals, showNormalCurve: true },
    dataKeys: ['data'],
  },
  bar: {
    load: () => import('../../../js/core/chart/types/bar.js'),
    config: { categories: ['A', 'B', 'C'], groups: [{ name: 'G', values: [1, 2, 3] }] },
    dataKeys: ['categories', 'groups'],
  },
  boxplot: {
    load: () => import('../../../js/core/chart/types/boxplot.js'),
    config: { groups: [{ name: 'A', values: vals }] },
    dataKeys: ['groups'],
  },
  'individual-value-plot': {
    load: () => import('../../../js/core/chart/types/individual-value-plot.js'),
    config: { groups: [{ name: 'A', values: vals }, { name: 'B', values: vals.map(v => v + 1) }] },
    dataKeys: ['groups'],
  },
  'control-chart': {
    load: () => import('../../../js/core/chart/types/control-chart.js'),
    config: { values: vals, cl: 10, ucl: 10.6, lcl: 9.4, sigma: 0.2 },
    dataKeys: ['values'],
  },
  'run-chart': {
    load: () => import('../../../js/core/chart/types/run-chart.js'),
    config: { values: vals },
    dataKeys: ['values'],
  },
  'probability-plot': {
    load: () => import('../../../js/core/chart/types/probability-plot.js'),
    config: { data: vals },
    dataKeys: ['data', 'series'],
  },
  pareto: {
    load: () => import('../../../js/core/chart/types/pareto.js'),
    config: { items: [{ name: 'A', value: 5 }, { name: 'B', value: 3 }, { name: 'C', value: 1 }] },
    dataKeys: ['items'],
  },
  pie: {
    load: () => import('../../../js/core/chart/types/pie.js'),
    config: { slices: [{ label: 'A', value: 2 }, { label: 'B', value: 3 }] },
    dataKeys: ['slices'],
  },
  mosaic: {
    load: () => import('../../../js/core/chart/types/mosaic.js'),
    config: { categories: ['a', 'b'], groups: [{ name: 'X', values: [3, 1] }, { name: 'Y', values: [6, 1] }] },
    dataKeys: ['categories', 'groups'],
  },
  heatmap: {
    load: () => import('../../../js/core/chart/types/heatmap.js'),
    config: { xCategories: ['a', 'b'], yCategories: ['x', 'y'], cells: [[1, 2], [3, 4]] },
    dataKeys: ['xCategories', 'yCategories', 'cells'],
  },
};

function mount(Ctor, config) {
  const host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const chart = new Ctor(host, JSON.parse(JSON.stringify(config)), { language: 'de' });
  chart.render();
  chart._editorOpen = true;
  chart._buildEditor();
  return { host, chart };
}

/** Top-level config as key -> JSON string (functions and DOM left out). */
function shape(config) {
  const out = {};
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === 'function') continue;
    try { out[k] = JSON.stringify(v); } catch { out[k] = String(v); }
  }
  return out;
}

/** Change one form control the way a user would. */
function poke(el) {
  if (el.type === 'checkbox' || el.type === 'radio') {
    el.checked = !el.checked;
  } else if (el.tagName === 'SELECT') {
    const opts = [...el.options].filter(o => !o.disabled);
    const next = opts.find(o => o.value !== el.value);
    if (!next) return false;
    el.value = next.value;
  } else if (el.type === 'number' || el.type === 'range') {
    const cur = Number(el.value);
    const max = el.max !== '' ? Number(el.max) : Infinity;
    el.value = String(Number.isFinite(cur) && cur + 1 <= max ? cur + 1 : (el.min !== '' ? Number(el.min) : 3));
  } else if (el.type === 'color') {
    el.value = el.value === '#123456' ? '#654321' : '#123456';
  } else {
    el.value = (el.value || '') + 'x';
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/** Changed top-level keys after poking every control of the open editor. */
function changedKeys(chart) {
  const changed = new Set();
  for (let i = 0; i < 400; i++) {
    const controls = [...(chart._editorInner?.querySelectorAll('input, select, textarea') || [])];
    if (i >= controls.length) break;
    const before = shape(chart.config);
    if (!poke(controls[i])) continue;
    const after = shape(chart.config);
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (before[k] !== after[k]) changed.add(k);
    }
  }
  return changed;
}

suite('Chart editor — every chart-level setting is an editor key', () => {
  for (const [type, fx] of Object.entries(FIXTURES)) {
    test(`${type}: changed config keys are listed in editorKeys`, async () => {
      const Ctor = (await fx.load()).default;
      const { host, chart } = mount(Ctor, fx.config);
      try {
        const allowed = new Set(Ctor.editorKeys);
        const missing = [...changedKeys(chart)]
          .filter(k => !allowed.has(k) && !fx.dataKeys.includes(k))
          .sort();
        assertDeepEqual(missing, [], `${type}: editor keys not persisted: ${missing.join(", ")}`);
      } finally {
        chart.destroy();
        host.remove();
      }
    });
  }
});
