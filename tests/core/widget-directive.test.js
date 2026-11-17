/**
 * x-widget (core/widget-directive.js) — Einhängen, reaktive Eingaben, Isolation,
 * Fehlbindung, Abbau, verschachtelte Widgets, Wertbindung.
 */
import Alpine from '../../vendor/alpinejs/csp.js';
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { defineModel, defineWidget, command, list, map, number, object, text, oneOf, table } from '../../js/core/model.js';
import { TableData } from '../../js/core/table-data.js';
import { registerWidgetDirective, widgetForKind } from '../../js/core/widget-directive.js';

const i18n = { t: (k, p) => (p ? `${k}:${p.message ?? JSON.stringify(p)}` : k), getLanguage: () => 'de' };
const flush = () => new Promise((r) => setTimeout(r, 0));
const probe = { alive: 0, runs: 0 };
/** Wurzeln, die `host` angelegt hat: nur Warnungen zu diesen Elementen oder zu `x-widget="…"` gehören den Tests. */
const hosted = [];

const statList = defineWidget({ name: 'stat-list', props: { rows: list(object({ name: text(), mean: number() })), digits: number({ optional: true }) } });
const picker = defineWidget({ name: 'pick', value: oneOf(['a', 'b', 'c']) });
const panel = defineWidget({ name: 'panel', props: { rows: list(object({ name: text(), mean: number() })) } });
const leaky = defineWidget({ name: 'leaky' });
const editor = defineWidget({ name: 'ed', props: { legacyEditKey: text({ optional: true }) }, value: object({ title: text({ trim: true, nonEmpty: true }) }) });
const boom = defineWidget({ name: 'boom', props: { n: number() } });

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

/** Imperativ mit Objektwert: zeigt Titel und Schlüssel, `.set` über Klick. */
function mountEd(root, { props, value, effect }) {
  const b = document.createElement('button');
  b.className = 'ed';
  b.addEventListener('click', () => value.set(JSON.parse(b.dataset.next)));
  root.append(b);
  effect(() => { const v = value.get(); b.textContent = `${v === undefined ? 'undef' : v.title}|${props.legacyEditKey ?? ''}`; b.dataset.rejected = value.rejected.message; });
  return { destroy() {} };
}

/** Imperativ: wirft bei n = 13 (TypeError) beziehungsweise n = 14 (Error). */
function mountBoom(root, { props, effect }) {
  effect(() => {
    if (props.n === 13) null.x = 1;
    if (props.n === 14) throw new Error('kaputt');
    root.textContent = `n${props.n}`;
  });
  return { destroy() {} };
}

const WIDGETS = {
  boom: { schema: boom, mount: mountBoom },
  ed: { schema: editor, mount: mountEd },
  'stat-list': { schema: statList, mount: mountStatList },
  pick: { schema: picker, mount: mountPick },
  panel: { schema: panel, mount: () => ({ destroy() {} }), template: 'tests/panel.html', view: () => ({ label: 'panel-label' }) },
  leaky: { schema: leaky, mount: () => ({ destroy() {} }), template: 'tests/leaky.html', view: () => ({ own: 'own' }) },
};
const Doc = defineModel({ view: { stripEdits: map(number({ integer: true, min: 0 }), object({ title: text({ trim: true, nonEmpty: true }) })) }, fields: { choice: oneOf(['a', 'b', 'c'], { default: 'a' }), values: list(number(), { default: [1, 2] }) } });

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
      explode: false,
      get throwing() { if (this.explode) throw new Error('getter kaputt'); return 5; },
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
  hosted.push(root);
  Alpine.initTree(root);
  await flush();
  return { root, data: Alpine.$data(root) };
}

/**
 * Warnungen einsammeln, solange `fn` läuft. Alpine wirft Fehler seiner Ausdrücke
 * zusätzlich per setTimeout nach außen; die erwarteten fängt der Test ab, damit
 * der Lauf sie nicht als unbehandelte Seitenfehler zählt. Gesammelt werden nur
 * Warnungen der Direktive (`x-widget="…"`) und solche, die ein Element der
 * gehosteten Wurzeln nennen; alles andere geht unverändert weiter.
 */
async function withWarnings(fn) {
  const seen = [];
  const orig = console.warn;
  const origTimeout = window.setTimeout;
  const mine = (a) => /x-widget="/.test(String(a[0])) || a.some((x) => x instanceof Node && hosted.some((r) => r.contains(x)));
  console.warn = (...a) => { if (mine(a)) seen.push(a.map(String).join(' ')); else orig.apply(console, a); };
  window.setTimeout = (cb, ...rest) => origTimeout(() => {
    try { cb(); } catch (err) { if (!(/^Undefined variable/.test(String(err?.message)) && err.el instanceof Node && hosted.some((r) => r.contains(err.el)))) throw err; }
  }, ...rest);
  try { await fn(); } finally { console.warn = orig; window.setTimeout = origTimeout; }
  return seen;
}

/**
 * Test-Widgets nur für die Dauer von `fn` in die gemeinsame Registry legen; danach durch inerte Einträge ersetzen
 * (passen auf keine Feldart) und die i18n dieser Datei wiederherstellen.
 * @param {Record<string, any>} extra @param {() => Promise<void>} fn
 */
async function withWidgets(extra, fn) {
  if (!Alpine.version) Alpine.start();
  registerWidgetDirective(Alpine, { i18n, widgets: extra });
  try { await fn(); } finally {
    const inert = { schema: { forKind: null }, mount() {} };
    registerWidgetDirective(Alpine, { i18n, widgets: Object.fromEntries(Object.keys(extra).map((k) => [k, inert])) });
  }
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

  test('Map-Eintrag in x-for: lesen, anlegen, ablehnen, Schleifenpfad als Eingabe', async () => {
    const { root, data } = await host('<template x-for="(s, i) in strips" :key="s.key"><div class="row" x-widget="ed" x-widget-legacy-edit-key="s.legacyEditKey" x-widget-value="model.stripEdits[i]"></div></template>',
      { strips: [{ key: 'a', legacyEditKey: 'k0' }, { key: 'b', legacyEditKey: 'k1' }] });
    const [b0, b1] = [...root.querySelectorAll('.ed')];
    assertEqual(b0.textContent, 'undef|k0');
    assertEqual(b1.textContent, 'undef|k1');
    b1.dataset.next = JSON.stringify({ title: 'X' });
    b1.click();
    await flush();
    assertEqual(JSON.stringify(data.model.stripEdits['1']), '{"title":"X"}');
    assertEqual(data.model.stripEdits['0'], undefined);
    assertEqual(b1.textContent, 'X|k1');
    b0.dataset.next = JSON.stringify({ title: '   ' });
    b0.click();
    await flush();
    assertEqual(data.model.stripEdits['0'], undefined);
    assertEqual(Object.keys(data.model.stripEdits).join(','), '1');
    assertTrue(b0.dataset.rejected.startsWith('common.inputRejected'));
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

  test('werfender Effect hält Alpine nicht an', async () => {
    const { root, data } = await host('<div class="b" x-widget="boom" x-widget-n="n"></div><span class="after" x-text="label"></span>', { n: 1 });
    const w = root.querySelector('.b .widget-root');
    assertEqual(w.textContent, 'n1');
    for (const bad of [13, 14]) {
      const seen = await withWarnings(async () => { data.n = bad; await flush(); });
      assertTrue(w.classList.contains('widget-root--error'));
      assertTrue(seen.some((m) => m.includes('x-widget="boom"')));
      data.label = `after-${bad}`;
      await flush();
      assertEqual(root.querySelector('.after').textContent, `after-${bad}`);
    }
    data.n = 2;
    await flush();
    assertEqual(w.textContent, 'n2');
    assertTrue(!w.classList.contains('widget-root--error'));
    root.remove();
  });

  test('werfender Getter einer Eingabe beim Wiederlauf hält Alpine nicht an', async () => {
    const { root, data } = await host('<div class="b" x-widget="boom" x-widget-n="throwing"></div><span class="after" x-text="label"></span>');
    const w = root.querySelector('.b .widget-root');
    assertEqual(w.textContent, 'n5');
    const seen = await withWarnings(async () => { data.explode = true; await flush(); });
    assertTrue(w.classList.contains('widget-root--error'));
    assertTrue(seen.some((m) => m.includes('getter kaputt')));
    data.label = 'after-getter';
    await flush();
    assertEqual(root.querySelector('.after').textContent, 'after-getter');
    data.explode = false;
    await flush();
    assertTrue(!w.classList.contains('widget-root--error'));
    root.remove();
  });

  test('Mount-Fehler gibt Eingabe- und Mount-Effekte frei: genau eine Warnung', async () => {
    const runs = { n: 0 };
    let ctx;
    let seen;
    await withWidgets({
      mfail: {
        schema: defineWidget({ name: 'mfail', props: { n: number() } }),
        mount(root, { props, effect }) {
          effect(() => { runs.n++; root.textContent = `n${props.n}`; });
          throw new Error('mount kaputt');
        },
      },
    }, async () => {
      seen = await withWarnings(async () => {
        ctx = await host('<div class="m" x-widget="mfail" x-widget-n="n"></div>', { n: 1 });
        const base = runs.n;
        ctx.data.n = 2;
        await flush();
        ctx.data.n = 'kein Zahl';
        await flush();
        ctx.data.n = 3;
        await flush();
        assertEqual(runs.n, base);
      });
    });
    assertEqual(seen.length, 1, seen.join(' | '));
    assertTrue(seen[0].includes('mount kaputt'));
    assertTrue(ctx.root.querySelector('.m .widget-root--error').textContent.includes('mount kaputt'));
    ctx.root.remove();
  });

  test('Fehlbindung beim Einhängen: eine Warnung, danach keine weiteren', async () => {
    let ctx;
    const seen = await withWarnings(async () => {
      ctx = await host('<div class="b" x-widget="boom" x-widget-n="v"></div>', { v: 'x' });
      ctx.data.v = 'y';
      await flush();
      ctx.data.v = 4;
      await flush();
    });
    assertEqual(seen.length, 1, seen.join(' | '));
    assertTrue(ctx.root.querySelector('.b .widget-root--error') !== null);
    ctx.root.remove();
  });

  test('NaN und Infinity als Eingabe: Meldung mit Feldname statt null', async () => {
    let ctx;
    await withWarnings(async () => {
      ctx = await host('<div class="a" x-widget="boom" x-widget-n="nan"></div><div class="b" x-widget="stat-list" x-widget-rows="inf"></div>',
        { nan: NaN, inf: [{ name: 'a', mean: Infinity }] });
    });
    const a = ctx.root.querySelector('.a .widget-root--error').textContent;
    assertTrue(a.includes('boom.n') && a.includes('NaN') && a.includes('finite'), a);
    const b = ctx.root.querySelector('.b .widget-root--error').textContent;
    assertTrue(b.includes('stat-list.rows[0].mean') && b.includes('Infinity'), b);
    ctx.root.remove();
  });

  test('Eingabe wird tief geklont, nicht geteilt', async () => {
    const rows = [{ name: 'a', mean: 1 }];
    let got;
    await withWidgets({
      grab: {
        schema: defineWidget({ name: 'grab', props: { rows: list(object({ name: text(), mean: number() })) } }),
        mount(root, { props, effect }) { effect(() => { got = props.rows; }); return { destroy() {} }; },
      },
    }, async () => {
      const ctx = await host('<div x-widget="grab" x-widget-rows="rows"></div>', { rows });
      assertTrue(Alpine.raw(got) !== Alpine.raw(ctx.data.rows));
      assertTrue(Alpine.raw(got)[0] !== Alpine.raw(ctx.data.rows)[0]);
      assertEqual(got[0].mean, 1);
      ctx.root.remove();
    });
  });

  test('Crash-Zustand hängt nicht von der Mount-Reihenfolge ab', async () => {
    for (const order of [['a', 'b'], ['b', 'a']]) {
      await withWidgets({
        order: {
          schema: defineWidget({ name: 'order', props: { n: number() } }),
          mount(root, { props, effect }) {
            for (const k of order) effect(() => { if (k === 'a' && props.n === 13) throw new Error('a kaputt'); });
            return { destroy() {} };
          },
        },
      }, async () => {
        const { root, data } = await host('<div class="o" x-widget="order" x-widget-n="n"></div>', { n: 1 });
        const w = root.querySelector('.o .widget-root');
        await withWarnings(async () => { data.n = 13; await flush(); });
        assertTrue(w.classList.contains('widget-root--error'), order.join());
        data.n = 2;
        await flush();
        assertTrue(!w.classList.contains('widget-root--error'), order.join());
        root.remove();
      });
    }
  });

  test('Fehler einer Eingabe lässt andere Eingaben nicht neu laufen', async () => {
    const calls = { a: 0 };
    await withWidgets({
      two: {
        schema: defineWidget({ name: 'two', props: { a: number(), b: number() } }),
        mount(root, { props, effect }) {
          effect(() => { root.textContent = `a${props.a}`; });
          return { destroy() {} };
        },
      },
    }, async () => {
      const { root, data } = await host('<div class="t" x-widget="two" x-widget-a="ctr.a" x-widget-b="b"></div>', {
        b: 1, ctr: { v: 1, get a() { calls.a++; return this.v; } },
      });
      data.ctr.v = 2; // Wiederlauf: ab hier liest der Effekt der Eingabe `a` den Fehlerzustand
      await flush();
      const base = calls.a;
      await withWarnings(async () => { data.b = 'bad'; await flush(); });
      assertTrue(root.querySelector('.t .widget-root--error') !== null);
      await withWarnings(async () => { data.b = 2; await flush(); });
      assertTrue(root.querySelector('.t .widget-root--error') === null);
      assertEqual(calls.a, base);
      root.remove();
    });
  });

  test('Abbau während des Einhängens: Widget wird trotzdem zerstört', async () => {
    const before = probe.alive;
    await withWidgets({
      selfdestroy: {
        schema: defineWidget({ name: 'selfdestroy' }),
        mount(root) {
          probe.alive++;
          Alpine.destroyTree(root.parentElement);
          return { destroy() { probe.alive--; } };
        },
      },
    }, async () => {
      const { root } = await host('<div x-widget="selfdestroy"></div>');
      assertEqual(probe.alive, before);
      root.remove();
    });
  });

  test('Crash im Erstlauf, danach Erfolg: Fehlerklasse weg', async () => {
    await withWidgets({
      flaky: {
        schema: defineWidget({ name: 'flaky', props: { n: number() } }),
        mount(root, { props, effect }) {
          effect(() => { if (props.n === 13) throw new Error('erst kaputt'); root.textContent = `n${props.n}`; });
          return { destroy() {} };
        },
      },
    }, async () => {
      let ctx;
      await withWarnings(async () => { ctx = await host('<div class="f" x-widget="flaky" x-widget-n="n"></div>', { n: 13 }); });
      const w = ctx.root.querySelector('.f .widget-root');
      assertTrue(w.classList.contains('widget-root--error'));
      ctx.data.n = 2;
      await flush();
      assertEqual(w.textContent, 'n2');
      assertTrue(!w.classList.contains('widget-root--error'));
      ctx.root.remove();
    });
  });

  test('tiefe Reaktivität: Änderung in verschachtelten Zeilen erreicht das Widget', async () => {
    const { root, data } = await host('<div class="d" x-widget="stat-list" x-widget-rows="box.rows"></div>',
      { box: { rows: [{ name: 'a', mean: 1 }] } });
    const w = root.querySelector('.d .widget-root');
    assertEqual(w.textContent, 'a:1.0');
    data.box.rows[0].mean = 7;
    await flush();
    assertEqual(w.textContent, 'a:7.0');
    data.box.rows.push({ name: 'b', mean: 2 });
    await flush();
    assertEqual(w.textContent, 'a:7.0|b:2.0');
    root.remove();
  });

  test('Schlüssel mit undefined fallen weg (wie beim JSON-Klon)', async () => {
    let got;
    await withWidgets({
      undef: {
        schema: defineWidget({ name: 'undef', props: { o: object({ a: number(), b: number({ optional: true }) }) } }),
        mount(root, { props, effect }) { effect(() => { got = props.o; }); return { destroy() {} }; },
      },
    }, async () => {
      const ctx = await host('<div x-widget="undef" x-widget-o="o"></div>', { o: { a: 1, b: undefined } });
      assertEqual(Object.hasOwn(got, 'b'), false);
      ctx.root.remove();
    });
  });

  test('nicht kopierbarer Wert: Meldung nennt Feld und Wert', async () => {
    let ctx;
    await withWarnings(async () => { ctx = await host('<div class="a" x-widget="boom" x-widget-n="bad"></div>', { bad: { f() {} } }); });
    const m = ctx.root.querySelector('.a .widget-root--error').textContent;
    assertTrue(m.includes('invalid boom.n.f') && m.includes('allowed: plain data'), m);
    ctx.root.remove();
  });

  test('Crash im Mount, Erfolg vor dem Ende des Mounts: showError nach dem Mount räumt die Klasse', async () => {
    await withWidgets({
      early: {
        schema: defineWidget({ name: 'early', props: { n: number() } }),
        mount(root, { props, effect }) {
          const run = effect(() => { if (props.n === 13) throw new Error('im Mount kaputt'); });
          props.n = 2;
          run();
          return { destroy() {} };
        },
      },
    }, async () => {
      let ctx;
      await withWarnings(async () => { ctx = await host('<div class="e" x-widget="early" x-widget-n="n"></div>', { n: 13 }); });
      assertTrue(!ctx.root.querySelector('.e .widget-root').classList.contains('widget-root--error'));
      ctx.root.remove();
    });
  });

  test('Registry-Eintrag ohne Schema oder ohne mount: definierte Meldung statt TypeError', async () => {
    if (!Alpine.version) Alpine.start();
    registerWidgetDirective(Alpine, { i18n, widgets: { 'no-schema': { mount() {} }, 'no-mount': { schema: statList } } });
    let ctx;
    await withWarnings(async () => {
      ctx = await host('<div class="a" x-widget="no-schema"></div><div class="b" x-widget="no-mount" x-widget-rows="values"></div>');
    });
    assertTrue(ctx.root.querySelector('.a .widget-root--error').textContent.includes('widget no-schema has no schema'));
    assertTrue(ctx.root.querySelector('.b .widget-root--error').textContent.includes('widget no-mount has no mount function'));
    ctx.root.remove();
  });

  test('widgetForKind überspringt Einträge ohne Schema', () => {
    assertEqual(widgetForKind({ x: { mount() {} }, y: { schema: { forKind: 'columnRef' } } }, { kind: 'columnRef' }), 'y');
  });

  test('Zeichenkettenliterale in x-widget-<prop>', async () => {
    await withWidgets({
      lit: {
        schema: defineWidget({ name: 'lit', props: { label: text(), mode: oneOf(['a', 'b']) } }),
        mount(root, { props, effect }) { effect(() => { root.textContent = `${props.label}|${props.mode}`; }); },
      },
    }, async () => {
      let ctx;
      await withWarnings(async () => {
        ctx = await host('<div class="l" x-widget="lit" x-widget-label="\'hallo\'" x-widget-mode="\'a\'"></div>'
          + '<div class="p" x-widget="lit" x-widget-label="name" x-widget-mode="\'b\'"></div>', { name: 'pfad' });
      });
      assertEqual(ctx.root.querySelector('.l').textContent, 'hallo|a');
      assertEqual(ctx.root.querySelector('.p').textContent, 'pfad|b');
      ctx.root.remove();
      let bad;
      const seen = await withWarnings(async () => {
        bad = await host('<div class="x" x-widget="lit" x-widget-label="\'t\'" x-widget-mode="\'c\'"></div>');
      });
      assertTrue(bad.root.querySelector('.x .widget-root--error, .x.widget-root--error') !== null);
      assertTrue(seen.some((m) => m.includes('allowed')));
      bad.root.remove();
    });
  });
  test('command: nur Kommandos des Hosts, unbekannter Name → { ok: false } ohne Ausnahme', async () => {
    let cmd = null;
    const Counter = defineModel({
      fields: { n: number({ integer: true, default: 0 }) },
      commands: { bump: command({ params: { by: number({ integer: true }) }, run({ by }) { this.n += by; return this.n; } }) },
    });
    const vmCalls = [];
    await withWidgets({
      cmdw: { schema: defineWidget({ name: 'cmdw' }), mount(root, { command: c }) { cmd = c; return { destroy() {} }; } },
    }, async () => {
      if (!Alpine.version) Alpine.start();
      const name = `wc${Math.random().toString(36).slice(2)}`;
      Alpine.data(name, () => {
        const comp = { model: new Counter(), ping(args) { vmCalls.push(args); return 'pong'; } };
        Object.defineProperty(comp, '_ui', {
          enumerable: false,
          get() {
            return { model: this.model, i18n, dialog: null, moduleId: 'demo', component: this, services: SERVICES, vmCommands: { ping: { params: {} } } };
          },
        });
        return comp;
      });
      const root = document.createElement('div');
      root.setAttribute('x-data', name);
      root.innerHTML = '<div x-widget="cmdw"></div>';
      document.body.append(root);
      hosted.push(root);
      Alpine.initTree(root);
      await flush();
      assertEqual(typeof cmd, 'function');
      const data = Alpine.$data(root);
      const r1 = await cmd('bump', { by: 2 });
      assertEqual(r1.ok, true);
      assertEqual(r1.result, 2);
      assertEqual(data.model.n, 2);
      const r2 = await cmd('ping', {});
      assertEqual(r2.ok, true);
      assertEqual(vmCalls.length, 1);
      let r3; let r4;
      const seen = await withWarnings(async () => {
        r3 = await cmd('nope', {});
        r4 = await cmd('toJSON', {});
      });
      assertEqual(r3.ok, false);
      assertEqual(r4.ok, false);
      assertEqual(seen.filter((m) => m.includes('unknown command')).length, 2);
      const r5 = await cmd('bump', { by: 'x' });
      assertEqual(r5.ok, false, 'ungültige Argumente: abgelehnt, keine Ausnahme');
      assertEqual(data.model.n, 2);
      root.remove();
    });
  });

  test('command ohne Model im Host (Kachel): { ok: false }', async () => {
    let cmd = null;
    await withWidgets({
      cmdt: { schema: defineWidget({ name: 'cmdt' }), mount(root, { command: c }) { cmd = c; return { destroy() {} }; } },
    }, async () => {
      const { root } = await host('<div x-widget="cmdt"></div>');
      let r;
      await withWarnings(async () => { r = await cmd('bump', { by: 1 }); });
      assertEqual(r.ok, false);
      root.remove();
    });
  });

  test('Prop table(): nur TableData, Identität, kein Kopieren', async () => {
    const seen = [];
    await withWidgets({
      grid: { schema: defineWidget({ name: 'grid', props: { data: table() } }), mount(root, { props, effect }) { effect(() => { seen.push(Alpine.raw(props.data)); }); return { destroy() {} }; } },
    }, async () => {
      const t = TableData.fromJSON({ rowCount: 2, columns: [[1, 2]] });
      const ok = await host('<div x-widget="grid" x-widget-data="tbl"></div>', { tbl: t });
      assertTrue(seen.length > 0 && seen[0] === t);
      ok.root.remove();
      let bad;
      await withWarnings(async () => { bad = await host('<div x-widget="grid" x-widget-data="tbl"></div>', { tbl: { rowCount: 0, columns: [] } }); });
      assertTrue(bad.root.querySelector('.widget-root--error').textContent.includes('expected a TableData'));
      bad.root.remove();
    });
  });
});
