/**
 * Tests für js/ui/tile-kit.js — Settings-Fabriken, Verteilung, Chart im Slot.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { topN, showLegend, showChart, distribution, chartSlot } from '../../js/ui/tile-kit.js';

suite('tile-kit — Settings-Fabriken', () => {
  test('topN: Vorgaben gleich dem bisherigen Literal', () => {
    assertDeepEqual(topN(),
      { type: 'number', min: 1, max: 10, step: 1, default: 5, label: 'dashboard.tileSettings.topN' });
  });

  test('topN: default, max und label als Option', () => {
    assertDeepEqual(topN({ default: 3, max: 20, label: 'x.y' }),
      { type: 'number', min: 1, max: 20, step: 1, default: 3, label: 'x.y' });
  });

  test('showLegend und showChart', () => {
    assertDeepEqual(showLegend(), { type: 'boolean', default: true, label: 'dashboard.tileSettings.showLegend' });
    assertDeepEqual(showLegend({ default: false }),
      { type: 'boolean', default: false, label: 'dashboard.tileSettings.showLegend' });
    assertDeepEqual(showChart(), { type: 'boolean', default: true, label: 'dashboard.tileSettings.showChart' });
    assertDeepEqual(showChart({ default: false }),
      { type: 'boolean', default: false, label: 'dashboard.tileSettings.showChart' });
  });

  test('jeder Aufruf liefert ein frisches Objekt', () => {
    assertTrue(topN() !== topN());
  });
});

suite('tile-kit — distribution', () => {
  const parts = [
    { key: 'a', label: 'Alpha', count: 3, color: 'var(--c1)' },
    { key: 'b', label: 'Beta', count: 0, color: 'var(--c2)' },
    { key: 'c', label: 'Gamma', count: 1, color: 'var(--c3)' },
  ];

  test('Anteile an der Summe; Nullanteile fallen weg', () => {
    assertDeepEqual(distribution(parts), {
      segments: [
        { key: 'a', style: 'width:75%;background:var(--c1)', title: 'Alpha: 3' },
        { key: 'c', style: 'width:25%;background:var(--c3)', title: 'Gamma: 1' },
      ],
      legend: [
        { key: 'a', dot: 'background:var(--c1)', text: 'Alpha: 3' },
        { key: 'c', dot: 'background:var(--c3)', text: 'Gamma: 1' },
      ],
    });
  });

  test('eigenes total als Bezugsgröße', () => {
    const { segments, legend } = distribution(parts, { total: 8 });
    assertEqual(segments[0].style, 'width:37.5%;background:var(--c1)');
    assertEqual(segments[1].style, 'width:12.5%;background:var(--c3)');
    assertEqual(legend.length, 2);
  });

  test('total 0 ergibt zwei leere Listen', () => {
    assertDeepEqual(distribution(parts, { total: 0 }), { segments: [], legend: [] });
    assertDeepEqual(distribution(parts.map(p => ({ ...p, count: 0 }))), { segments: [], legend: [] });
    assertDeepEqual(distribution([]), { segments: [], legend: [] });
  });
});

/** Ein Wurzelelement mit Chart-Slot, ohne DOM. */
function fakeRoot() {
  const slot = { name: 'slot' };
  return {
    slot,
    querySelector: (sel) => (sel === '[data-tile-slot="chart"]' ? slot : null),
  };
}

/** chartManager, dessen create() erst auf Zuruf abschließt. */
function fakeManager() {
  const calls = [];
  const destroyed = [];
  let n = 0;
  return {
    calls,
    destroyed,
    pending: [],
    create(slot, type, config) {
      const chart = { id: ++n };
      calls.push({ slot, type, config, chart });
      return new Promise((resolve) => this.pending.push(() => resolve(chart)));
    },
    destroy(chart) { destroyed.push(chart); },
    /** Alle offenen create() abschließen und die Mikrotasks abwarten. */
    async flush() {
      for (const done of this.pending.splice(0)) done();
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

suite('tile-kit — chartSlot', () => {
  test('mount legt den Chart im Slot an; Vorgabe kopiert vm.chart', async () => {
    const { mount } = chartSlot('scatter');
    const root = fakeRoot();
    const cm = fakeManager();
    const vm = { chart: { series: [1] } };
    const p = mount(root, vm, { chartManager: cm });
    await cm.flush();
    await p;
    assertEqual(cm.calls.length, 1);
    assertEqual(cm.calls[0].slot, root.slot);
    assertEqual(cm.calls[0].type, 'scatter');
    assertDeepEqual(cm.calls[0].config, { series: [1] });
    assertTrue(cm.calls[0].config !== vm.chart);
    assertEqual(cm.destroyed.length, 0);
  });

  test('toConfig bekommt vm und args', async () => {
    let seen = null;
    const { mount } = chartSlot('line', (vm, args) => { seen = { vm, args }; return { x: vm.chart.x * 2 }; });
    const root = fakeRoot();
    const cm = fakeManager();
    const vm = { chart: { x: 2 } };
    const args = { chartManager: cm, extra: 1 };
    const p = mount(root, vm, args);
    await cm.flush();
    await p;
    assertEqual(seen.vm, vm);
    assertEqual(seen.args, args);
    assertDeepEqual(cm.calls[0].config, { x: 4 });
  });

  test('ohne vm.chart oder ohne chartManager: kein Chart', async () => {
    const { mount } = chartSlot('scatter');
    const cm = fakeManager();
    await mount(fakeRoot(), { chart: null }, { chartManager: cm });
    await mount(fakeRoot(), { chart: { a: 1 } }, {});
    assertEqual(cm.calls.length, 0);
  });

  test('neuerer Render verwirft den veralteten Chart; der alte fertige wird zerstört', async () => {
    const { mount, dispose } = chartSlot('scatter');
    const root = fakeRoot();
    const cm = fakeManager();
    const first = mount(root, { chart: { n: 1 } }, { chartManager: cm });
    const second = mount(root, { chart: { n: 2 } }, { chartManager: cm });
    await cm.flush();
    await Promise.all([first, second]);
    const [c1, c2] = cm.calls.map(c => c.chart);
    assertDeepEqual(cm.destroyed, [c1]);
    const third = mount(root, { chart: { n: 3 } }, { chartManager: cm });
    assertDeepEqual(cm.destroyed, [c1, c2]);
    await cm.flush();
    await third;
    dispose(root);
    assertDeepEqual(cm.destroyed, [c1, c2, cm.calls[2].chart]);
  });

  test('dispose vor Abschluss: der entstehende Chart wird verworfen', async () => {
    const { mount, dispose } = chartSlot('scatter');
    const root = fakeRoot();
    const cm = fakeManager();
    const p = mount(root, { chart: {} }, { chartManager: cm });
    dispose(root);
    assertEqual(cm.destroyed.length, 0);
    await cm.flush();
    await p;
    assertDeepEqual(cm.destroyed, [cm.calls[0].chart]);
    dispose(root);
    assertEqual(cm.destroyed.length, 1);
  });

  test('jeder Aufruf hat seine eigene Ablage', async () => {
    const a = chartSlot('scatter');
    const b = chartSlot('scatter');
    const root = fakeRoot();
    const cm = fakeManager();
    const p = a.mount(root, { chart: {} }, { chartManager: cm });
    await cm.flush();
    await p;
    b.dispose(root);
    assertEqual(cm.destroyed.length, 0);
    a.dispose(root);
    assertEqual(cm.destroyed.length, 1);
  });
});
