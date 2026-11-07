/**
 * x-widget (core/widget-directive.js) — Einhängen, reaktive Eingaben, Isolation,
 * Fehlbindung, Abbau, verschachtelte Widgets, Wertbindung.
 */
import Alpine from '../../vendor/alpinejs/csp.js';
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { defineModel, defineWidget, list, number, object, text, oneOf } from '../../js/core/model.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';

const i18n = { t: (k, p) => (p ? `${k}:${p.message ?? JSON.stringify(p)}` : k), getLanguage: () => 'de' };
const flush = () => new Promise((r) => setTimeout(r, 0));
const probe = { alive: 0, runs: 0 };

const statList = defineWidget({ name: 'stat-list', props: { rows: list(object({ name: text(), mean: number() })), digits: number({ optional: true }) } });
const picker = defineWidget({ name: 'pick', value: oneOf(['a', 'b', 'c']) });
const panel = defineWidget({ name: 'panel', props: { rows: list(object({ name: text(), mean: number() })) } });
const leaky = defineWidget({ name: 'leaky' });

/** Imperativ: schreibt Zeilen als Text. */
function mountStatList(root, { props, effect }) {
  probe.alive++;
  effect(() => { probe.runs++; root.textContent = props.rows.map((r) => `${r.name}:${r.mean.toFixed(props.digits ?? 1)}`).join('|'); });
  return { destroy() { probe.alive--; } };
}
/** Imperativ mit Wert. */
function mountPick(root, { value, effect }) {
  const b = document.createElement('button');
  b.className = 'pick';
  b.addEventListener('click', () => value.set(b.dataset.next));
  root.append(b);
  effect(() => { b.textContent = value.get(); b.dataset.rejected = value.rejected.message; });
  return { destroy() {} };
}

const WIDGETS = {
  'stat-list': { schema: statList, mount: mountStatList },
  pick: { schema: picker, mount: mountPick },
  panel: { schema: panel, mount: () => ({ destroy() {} }), template: 'tests/panel.html', view: () => ({ label: 'panel-label' }) },
  leaky: { schema: leaky, mount: () => ({ destroy() {} }), template: 'tests/leaky.html', view: () => ({ own: 'own' }) },
};
const Doc = defineModel({ fields: { choice: oneOf(['a', 'b', 'c'], { default: 'a' }), values: list(number(), { default: [1, 2] }) } });

function templates() {
  for (const [key, html] of [['tests/panel.html', '<span class="label" x-text="label"></span><div x-widget="stat-list" x-widget-rows="props.rows"></div>'],
    ['tests/leaky.html', '<span x-text="hostOnly"></span>']]) {
    if (document.querySelector(`template[data-tpl="${key}"]`)) continue;
    const t = document.createElement('template');
    t.setAttribute('data-tpl', key);
    t.innerHTML = html;
    document.body.append(t);
  }
}

const SERVICES = { eventBus: null, stateManager: null, i18n, chartManager: null, instanceId: 'i1', moduleId: 'demo' };

/** Host wie createModule: `_ui` als nicht aufzählbarer Getter mit Diensten. `extra` nur einfache Werte. */
async function host(inner, extra = {}) {
  if (!Alpine.version) Alpine.start();
  registerWidgetDirective(Alpine, { i18n, widgets: WIDGETS });
  templates();
  const name = `wd${Math.random().toString(36).slice(2)}`;
  Alpine.data(name, () => {
    const comp = {
      model: new Doc(), moduleId: 'demo', hostOnly: 'LEAK', show: true, label: 'host-label', bad: false,
      get rows() { return this.bad ? 'kein array' : this.model.values.map((v, i) => ({ name: `R${i}`, mean: v })); },
      get badRows() { return 'kein array'; },
      items: [{ id: 1, rows: [{ name: 'i1', mean: 1 }] }, { id: 2, rows: [{ name: 'i2', mean: 2 }] }],
      ...extra,
    };
    Object.defineProperty(comp, '_ui', { enumerable: false, get() { return { services: SERVICES }; } });
    return comp;
  });
  const root = document.createElement('div');
  root.setAttribute('x-data', name);
  root.innerHTML = inner;
  document.body.append(root);
  Alpine.initTree(root);
  await flush();
  return { root, data: Alpine.$data(root) };
}

/**
 * Warnungen einsammeln, solange `fn` läuft. Alpine wirft Fehler seiner Ausdrücke
 * zusätzlich per setTimeout nach außen; die erwarteten fängt der Test ab, damit
 * der Lauf sie nicht als unbehandelte Seitenfehler zählt.
 */
async function withWarnings(fn) {
  const seen = [];
  const orig = console.warn;
  const origTimeout = window.setTimeout;
  console.warn = (...a) => { seen.push(a.map(String).join(' ')); };
  window.setTimeout = (cb, ...rest) => origTimeout(() => {
    try { cb(); } catch (err) { if (!/^Undefined variable/.test(String(err?.message))) throw err; }
  }, ...rest);
  try { await fn(); } finally { console.warn = orig; window.setTimeout = origTimeout; }
  return seen;
}

const ROWS = '<div x-widget="stat-list" x-widget-rows="rows"></div>';

suite('x-widget', () => {
  test('Einhängen und reaktive Eingabe (Getter)', async () => {
    const { root, data } = await host(ROWS);
    const w = root.querySelector('.widget-root');
    assertEqual(w.textContent, 'R0:1.0|R1:2.0');
    data.model.values = [3];
    await flush();
    assertEqual(w.textContent, 'R0:3.0');
    await withWarnings(async () => { data.bad = true; await flush(); });
    assertTrue(w.classList.contains('widget-root--error'));
    assertEqual(w.textContent, 'R0:3.0');
    data.bad = false;
    await flush();
    assertTrue(!w.classList.contains('widget-root--error'));
    root.remove();
  });

  test('optionale Eingabe', async () => {
    const a = await host('<div x-widget="stat-list" x-widget-rows="rows" x-widget-digits="digits"></div>', { digits: 2 });
    assertEqual(a.root.querySelector('.widget-root').textContent, 'R0:1.00|R1:2.00');
    a.root.remove();
    const b = await host(ROWS);
    assertEqual(b.root.querySelector('.widget-root').textContent, 'R0:1.0|R1:2.0');
    b.root.remove();
  });

  test('Schleifenvariable', async () => {
    const before = probe.alive;
    const { root, data } = await host('<template x-for="item in items" :key="item.id"><div class="row" x-widget="stat-list" x-widget-rows="item.rows"></div></template>');
    const texts = () => [...root.querySelectorAll('.row')].map((r) => r.textContent);
    assertEqual(texts().join(','), 'i1:1.0,i2:2.0');
    data.items.reverse();
    await flush();
    assertEqual(texts().join(','), 'i2:2.0,i1:1.0');
    assertEqual(probe.alive, before + 2);
    root.remove();
  });

  test('Isolation: Namen des Hosts fallen nicht durch', async () => {
    let ctx;
    const seen = await withWarnings(async () => { ctx = await host('<div x-widget="leaky"></div>'); });
    assertTrue(seen.some((m) => m.includes('Undefined variable: hostOnly')));
    assertTrue(!ctx.root.textContent.includes('LEAK'));
    ctx.root.remove();
  });

  test('Fehlbindung bricht die Geschwister nicht ab', async () => {
    let ctx;
    await withWarnings(async () => {
      ctx = await host('<div class="bad" x-widget="stat-list" x-widget-rows="badRows"></div><span class="after" x-text="label"></span>');
    });
    assertEqual(ctx.root.querySelector('.bad .widget-root--error').textContent,
      'common.widget.bindError:invalid stat-list.rows "kein array"; allowed: a list');
    assertEqual(ctx.root.querySelector('.after').textContent, 'host-label');
    ctx.root.remove();
  });

  test('fehlende Pflicht-Eingabe, unbekanntes Widget', async () => {
    let ctx;
    await withWarnings(async () => { ctx = await host('<div class="a" x-widget="stat-list"></div><div class="b" x-widget="nope"></div>'); });
    assertTrue(ctx.root.querySelector('.a .widget-root--error').textContent.includes('missing x-widget-rows'));
    assertTrue(ctx.root.querySelector('.b .widget-root--error').textContent.includes('unknown widget nope'));
    ctx.root.remove();
  });

  test('x-if-Abbau', async () => {
    const before = probe.alive;
    const { root, data } = await host(`<template x-if="show">${ROWS}</template>`);
    assertEqual(probe.alive, before + 1);
    data.show = false;
    await flush();
    assertEqual(probe.alive, before);
    const runs = probe.runs;
    data.model.values = [9];
    await flush();
    assertEqual(probe.runs, runs);
    root.remove();
  });

  test('verschachtelt, Isolation nach innen', async () => {
    const before = probe.alive;
    const { root, data } = await host('<template x-if="show"><div x-widget="panel" x-widget-rows="rows"></div></template>');
    assertEqual(root.querySelector('.label').textContent, 'panel-label');
    const inner = () => root.querySelector('.widget-root .widget-root').textContent;
    assertEqual(inner(), 'R0:1.0|R1:2.0');
    data.model.values = [5];
    await flush();
    assertEqual(inner(), 'R0:5.0');
    data.show = false;
    await flush();
    assertEqual(probe.alive, before);
    root.remove();
  });

  test('Wert über den prüfenden Setter', async () => {
    const { root, data } = await host('<div x-widget="pick" x-widget-value="model.choice"></div>');
    const b = root.querySelector('.pick');
    assertEqual(b.textContent, 'a');
    b.dataset.next = 'b';
    b.click();
    await flush();
    assertEqual(data.model.choice, 'b');
    assertEqual(b.textContent, 'b');
    b.dataset.next = 'zzz';
    b.click();
    await flush();
    assertEqual(data.model.choice, 'b');
    assertTrue(b.dataset.rejected.startsWith('common.inputRejected'));
    root.remove();
  });

  test('x-widget-value ohne value im Schema', async () => {
    let ctx;
    await withWarnings(async () => { ctx = await host('<div x-widget="stat-list" x-widget-rows="rows" x-widget-value="model.choice"></div>'); });
    assertTrue(ctx.root.querySelector('.widget-root--error').textContent.includes('stat-list takes no x-widget-value'));
    ctx.root.remove();
  });

  test('falscher x-widget-value-Pfad endet im Fehlerzustand', async () => {
    let ctx;
    await withWarnings(async () => {
      ctx = await host('<div class="a" x-widget="pick" x-widget-value="model.nope"></div><span class="after" x-text="label"></span>');
    });
    assertTrue(ctx.root.querySelector('.a .widget-root--error').textContent.includes('model.nope'));
    assertEqual(ctx.root.querySelector('.after').textContent, 'host-label');
    ctx.root.remove();
  });

  test('Wächter: eigener _x_dataStack an der Wurzel', async () => {
    const { root } = await host(ROWS);
    const w = root.querySelector('.widget-root');
    assertTrue(Array.isArray(w._x_dataStack));
    assertEqual(Alpine.$data(w).hostOnly, undefined);
    root.remove();
  });

  test('Neuaufbau ohne Lecks', async () => {
    const before = probe.alive;
    const { root } = await host(ROWS);
    for (let i = 0; i < 3; i++) {
      Alpine.destroyTree(root);
      root.innerHTML = ROWS;
      Alpine.initTree(root);
      await flush();
    }
    assertEqual(probe.alive, before + 1);
    Alpine.destroyTree(root);
    assertEqual(probe.alive, before);
    root.remove();
  });
});
