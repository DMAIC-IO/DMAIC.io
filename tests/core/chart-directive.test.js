/**
 * Direktive x-chart (core/chart-directive.js) — im Browser (Alpine).
 */
import Alpine from '../../vendor/alpinejs/csp.js';
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { registerChartDirective } from '../../js/core/chart-directive.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Manager, dessen create erst auf Zuruf fertig wird. */
function fakeManager() {
  const calls = [];
  const pending = [];
  let n = 0;
  return {
    calls,
    pending,
    create(el, type, config) {
      calls.push(['create', type, config]);
      return new Promise((resolve) => pending.push(() => resolve({ id: ++n, type })));
    },
    update(chart, config) { calls.push(['update', chart.id, config]); },
    destroy(chart) { calls.push(['destroy', chart.id]); },
    async settle() { while (pending.length) pending.shift()(); await flush(); },
  };
}

let seq = 0;
async function mount(html, spec, manager) {
  if (!Alpine.version) Alpine.start();
  registerChartDirective(Alpine);
  const name = `chartTest${++seq}`;
  Alpine.data(name, () => {
    const comp = { moduleId: 'demo', box: { spec, show: true }, get plot() { return this.box.spec; } };
    Object.defineProperty(comp, '_ui', { enumerable: false, get() { return { chartManager: manager }; } });
    return comp;
  });
  const host = document.createElement('div');
  host.innerHTML = `<div x-data="${name}">${html}</div>`;
  document.body.append(host);
  Alpine.initTree(host);
  await flush();
  return { host, data: () => Alpine.$data(host.firstElementChild) };
}

suite('x-chart', () => {
  test('Einbau mit editKey <modulId>:<Ausdruck>, update bei gleichem Typ', async () => {
    const m = fakeManager();
    const { data, host } = await mount('<div x-chart="plot"></div>', { type: 'scatter', config: { a: 1 } }, m);
    await m.settle();
    assertDeepEqual(m.calls[0], ['create', 'scatter', { a: 1, editKey: 'demo:plot' }]);
    data().box.spec = { type: 'scatter', config: { a: 2 } };
    await flush();
    assertDeepEqual(m.calls[1], ['update', 1, { a: 2, editKey: 'demo:plot' }]);
    host.remove();
  });

  test('editKey im config gewinnt', async () => {
    const m = fakeManager();
    const { host } = await mount('<div x-chart="plot"></div>', { type: 'scatter', config: { editKey: 'hyptest:x' } }, m);
    await m.settle();
    assertEqual(m.calls[0][2].editKey, 'hyptest:x');
    host.remove();
  });

  test('anderer Typ → abbauen und neu erzeugen; null → abbauen', async () => {
    const m = fakeManager();
    const { data, host } = await mount('<div x-chart="plot"></div>', { type: 'scatter', config: {} }, m);
    await m.settle();
    data().box.spec = { type: 'histogram', config: {} };
    await flush();
    await m.settle();
    assertDeepEqual(m.calls.slice(1).map((c) => c.slice(0, 2)), [['destroy', 1], ['create', 'histogram']]);
    data().box.spec = null;
    await flush();
    assertDeepEqual(m.calls.at(-1), ['destroy', 2]);
    host.remove();
  });

  test('überholtes create wird verworfen', async () => {
    const m = fakeManager();
    const { data, host } = await mount('<div x-chart="plot"></div>', { type: 'scatter', config: {} }, m);
    data().box.spec = { type: 'histogram', config: {} };
    await flush();
    await m.settle();
    const kinds = m.calls.map((c) => c.slice(0, 2).join(':'));
    assertDeepEqual(kinds, ['create:scatter', 'create:histogram', 'destroy:1']);
    host.remove();
  });

  test('Abbau mit dem Element (x-if)', async () => {
    const m = fakeManager();
    const { data, host } = await mount('<template x-if="box.show"><div x-chart="plot"></div></template>', { type: 'scatter', config: {} }, m);
    await m.settle();
    data().box.show = false;
    await flush();
    assertDeepEqual(m.calls.at(-1), ['destroy', 1]);
    host.remove();
  });

  test('unbekannter Name wirft beim Einbau', async () => {
    let caught = null;
    const onErr = (e) => { caught = e.error ?? e.reason; e.preventDefault?.(); };
    window.addEventListener('error', onErr);
    try {
      await mount('<div x-chart="nope"></div>', null, fakeManager());
    } catch (err) { caught = err; }
    window.removeEventListener('error', onErr);
    assertTrue(caught !== null && /x-chart="nope"/.test(String(caught?.message ?? caught)), String(caught));
  });
});
