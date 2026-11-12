/**
 * Tests for core/choice-group.js — Knopfgruppen mit x-set (Model, UI-State)
 * und x-param (Formularfeld).
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { defineModel, defineState, command, oneOf, number, text, index, list, record, object, idOf } from '../../js/core/model.js';

const Doc = defineModel({
  fields: { size: oneOf([7, 14, 30], { default: 14 }) },
  view: {
    mode: oneOf(['month', 'week']),
    from: number({ integer: true, min: 0, max: 23, default: 6 }),
    to: number({ integer: true, min: 1, max: 24, default: 22 }),
  },
  invariants: { order: { fields: ['from', 'to'], test(m) { return m.from < m.to; } } },
  commands: {
    tag: command({ params: { label: text({ trim: true, nonEmpty: true }), color: oneOf(['red', 'blue']) }, run() {} }),
  },
});
const Ui = defineState({ tab: oneOf(['a', 'b']) });


const Pick = defineModel({
  fields: { rows: record(['a', 'b'], list(text()), { default: { a: ['x', 'y'], b: ['z'] } }) },
  commands: {
    pick: command({
      params: { col: oneOf(['a', 'b']), idx: index('rows[col]', { existing: true }) },
      run() {},
    }),
  },
});

/** Kästchen-Gruppe: eine Liste von ids als Parameter, Startwerte aus `current`. */
const Links = defineModel({
  fields: {
    items: list(object({ id: number({ integer: true }) }), { default: [{ id: 1 }, { id: 3 }, { id: 5 }] }),
    picked: list(number({ integer: true }), { default: [3] }),
    tags: list(object({ key: text() }), { default: [{ key: 'a' }, { key: 'b' }] }),
  },
  commands: {
    link: command({
      params: { ids: list(idOf('items')) },
      current() { return { ids: [...this.picked] }; },
      run({ ids }) { this.picked = ids; },
    }),
    tag: command({ params: { keys: list(idOf('tags', { key: 'key' })) }, run() {} }),
  },
});

const I18N = { t: (k) => k, getLanguage: () => 'de' };
const flush = () => new Promise((r) => setTimeout(r, 0));
let n = 0;

async function mount(html, extra = {}) {
  registerFieldDirective(Alpine, { i18n: I18N });
  registerCommandDirectives(Alpine);
  if (!Alpine.version) Alpine.start();
  const name = `groupTest${++n}`;
  const model = new (extra.useModel ?? Doc)();
  Alpine.data(name, () => {
    const comp = { model, state: Ui.create(), moduleId: 'gt', ...extra };
    Object.defineProperty(comp, '_ui', {
      enumerable: false,
      get() { return { model: this.model, notify: () => {}, dialog: null, i18n: I18N, moduleId: 'gt', instanceId: 'i1', forms: {} }; },
    });
    return comp;
  });
  const host = document.createElement('div');
  host.innerHTML = `<div x-data="${name}">${html}</div>`;
  document.body.append(host);
  Alpine.initTree(host);
  await flush();
  const vm = Alpine.$data(host.firstElementChild);
  return { host, vm, $: (s) => host.querySelector(s), $$: (s) => [...host.querySelectorAll(s)] };
}

const checked = (opts) => opts.map((o) => (o.type === 'radio' ? String(o.checked) : o.getAttribute('aria-checked')));

suite('x-set an einer Knopfgruppe', () => {
  test('Model-Ansichtsfeld: Klick schreibt, Zustand folgt', async () => {
    const { host, vm, $$ } = await mount(
      '<div role="radiogroup" x-set="model.mode"><button type="button" role="radio" value="month">M</button><button type="button" role="radio" value="week">W</button></div>');
    const opts = $$('[role="radio"]');
    assertDeepEqual(checked(opts), ['true', 'false']);
    opts[1].click();
    assertEqual(vm.model.mode, 'week');
    await flush();
    assertDeepEqual(checked(opts), ['false', 'true']);
    opts[1].click();
    assertEqual(vm.model.mode, 'week');
    assertEqual(host.querySelector('[role="radiogroup"]').getAttribute('data-help-key'), 'modules.gt.fields.mode.help');
    host.remove();
  });

  test('Reiter in einer tablist: aria-selected und roving tabindex statt aria-checked', async () => {
    const { host, vm, $$ } = await mount(
      '<div role="tablist" x-set="model.mode"><button type="button" role="tab" value="month">M</button><button type="button" role="tab" value="week">W</button></div>');
    const tabs = $$('[role="tab"]');
    assertDeepEqual(tabs.map((t) => t.getAttribute('aria-selected')), ['true', 'false']);
    assertDeepEqual(tabs.map((t) => t.getAttribute('tabindex')), ['0', '-1']);
    assertTrue(tabs.every((t) => !t.hasAttribute('aria-checked')), 'kein aria-checked an Reitern');
    tabs[1].click();
    assertEqual(vm.model.mode, 'week');
    await flush();
    assertDeepEqual(tabs.map((t) => t.getAttribute('aria-selected')), ['false', 'true']);
    assertDeepEqual(tabs.map((t) => t.getAttribute('tabindex')), ['-1', '0']);
    vm.model.mode = 'month';
    await flush();
    assertDeepEqual(tabs.map((t) => t.getAttribute('aria-selected')), ['true', 'false']);
    host.remove();
  });

  test('Zahlenwerte aus value, UI-State', async () => {
    const { host, vm, $$ } = await mount(
      '<div x-set="model.size"><button role="radio" value="7"></button><button role="radio" value="30"></button></div>'
      + '<div class="st" x-set="state.tab"><button role="radio" value="a"></button><button role="radio" value="b"></button></div>');
    $$('[value="30"]')[0].click();
    assertEqual(vm.model.size, 30);
    $$('.st [value="b"]')[0].click();
    assertEqual(vm.state.tab, 'b');
    assertEqual(host.querySelector('.st').getAttribute('data-help-key'), 'modules.gt.state.tab.help');
    host.remove();
  });

  test('input type=radio: checked und gemeinsames name', async () => {
    const { host, vm, $$ } = await mount(
      '<div x-set="model.mode"><input type="radio" value="month"><input type="radio" value="week"></div>');
    const [m, w] = $$('input');
    assertTrue(m.checked);
    assertEqual(m.name, 'i1-model.mode');
    assertEqual(w.name, 'i1-model.mode');
    w.checked = true;
    w.dispatchEvent(new Event('change', { bubbles: true }));
    assertEqual(vm.model.mode, 'week');
    host.remove();
  });

  test('Option aus x-for wird erfasst', async () => {
    const { host, vm, $$ } = await mount(
      '<div x-set="model.mode"><template x-for="v in modes" :key="v"><button role="radio" :value="v"></button></template></div>',
      { modes: ['month', 'week'] });
    await flush();
    const opts = $$('[role="radio"]');
    assertEqual(opts.length, 2);
    assertDeepEqual(checked(opts), ['true', 'false']);
    opts[1].click();
    assertEqual(vm.model.mode, 'week');
    host.remove();
  });

  test('Ablehnung durch Invariante: markiert die Gruppe, Wert bleibt', async () => {
    const { host, vm, $ } = await mount('<div class="g" x-set="model.from"><button role="radio" value="6"></button><button role="radio" value="23"></button></div>');
    vm.model.to = 10;
    $('[value="23"]').click();
    assertEqual(vm.model.from, 6);
    assertEqual($('.g').getAttribute('aria-invalid'), 'true');
    assertEqual($('.g').title, 'modules.gt.invariants.order');
    host.remove();
  });

  test('unbekannter Wert oder einzelnes Eingabefeld wirft beim Einbau', () => {
    registerFieldDirective(Alpine, { i18n: I18N });
    const name = `groupErr${++n}`;
    Alpine.data(name, () => ({ model: new Doc(), moduleId: 'gt' }));
    const build = (html) => { const h = document.createElement('div'); h.innerHTML = `<div x-data="${name}">${html}</div>`; return h; };
    assertThrows(() => Alpine.initTree(build('<div x-set="model.mode"><button role="radio" value="year"></button></div>')), /invalid mode "year"/);
    assertThrows(() => Alpine.initTree(build('<select x-set="model.mode"></select>')), /x-set="model\.mode" binds a group of options; use x-field on <select>/);
  });
});

suite('x-param an einer Knopfgruppe', () => {
  test('setzt den Formularwert, Ablehnung und Fokus an der Gruppe', async () => {
    const { host, $, $$ } = await mount(
      '<form x-command-form="tag"><input x-param="label"><div class="g" role="radiogroup" x-param="color">'
      + '<button type="button" role="radio" value="red"></button><button type="button" role="radio" value="blue"></button></div></form>');
    const [red, blue] = $$('[role="radio"]');
    assertDeepEqual(checked([red, blue]), ['true', 'false']);
    assertEqual($('.g').getAttribute('data-help-key'), 'modules.gt.actions.tag.params.color');
    blue.click();
    await flush();
    assertDeepEqual(checked([red, blue]), ['false', 'true']);
    host.remove();
  });

  test('abgelehnter Wert bleibt nicht im Formular', async () => {
    const { host, $, $$ } = await mount(
      '<form x-command-form="pick"><select x-param="col"><option value="a"></option><option value="b"></option></select>'
      + '<div class="g" x-param="idx"><button type="button" role="radio" value="0"></button><button type="button" role="radio" value="1"></button></div></form>',
      { useModel: Pick });
    const [zero, one] = $$('[role="radio"]');
    const sel = $('select');
    sel.value = 'b';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    one.click();
    await flush();
    assertDeepEqual(checked([zero, one]), ['true', 'false']);
    assertEqual($('.g').getAttribute('aria-invalid'), 'true');
    host.remove();
  });
});

suite('x-param an einer Gruppe von Kästchen (Listenparameter)', () => {
  const BOXES = '<form x-command-form="link"><div class="g" x-param="ids">'
    + '<input type="checkbox" value="1"><input type="checkbox" value="3"><input type="checkbox" value="5"></div>'
    + '<button type="submit">ok</button></form>';
  const submit = async ($) => { $('form').requestSubmit(); for (let i = 0; i < 3; i++) await flush(); };

  test('Startwert aus current, Kästchen sammeln die gewählten ids als Zahlen in Dokumentreihenfolge', async () => {
    const { host, vm, $, $$ } = await mount(BOXES, { useModel: Links });
    const boxes = $$('input[type="checkbox"]');
    assertDeepEqual(boxes.map((b) => b.checked), [false, true, false]);
    assertEqual($('.g').getAttribute('data-help-key'), 'modules.gt.actions.link.params.ids');
    boxes[2].click();
    boxes[0].click();
    await flush();
    await submit($);
    assertDeepEqual(vm.model.picked, [1, 3, 5]);
    boxes[1].click();
    await flush();
    await submit($);
    assertDeepEqual(vm.model.picked, [1, 5]);
    assertDeepEqual(boxes.map((b) => b.checked), [true, false, true]);
    host.remove();
  });

  test('alle abgewählt: leere Liste; Text-ids bleiben Text', async () => {
    const a = await mount(BOXES, { useModel: Links });
    a.$$('input[type="checkbox"]')[1].click();
    await flush();
    await submit(a.$);
    assertDeepEqual(a.vm.model.picked, []);
    a.host.remove();
    const b = await mount('<form x-command-form="tag"><div class="g" x-param="keys"><input type="checkbox" value="a"><input type="checkbox" value="b"></div></form>', { useModel: Links });
    const boxes = b.$$('input[type="checkbox"]');
    boxes[1].click();
    await flush();
    assertDeepEqual(boxes.map((x) => x.checked), [false, true]);
    assertEqual(b.$('.g').getAttribute('aria-invalid'), null);
    b.host.remove();
  });

  test('Option aus x-for wird erfasst; unbekannte id wirft beim Einbau', async () => {
    const { host, $$ } = await mount('<form x-command-form="link"><div class="g" x-param="ids">'
      + '<template x-for="it in model.items" :key="it.id"><label><input type="checkbox" :value="it.id"></label></template></div></form>', { useModel: Links });
    await flush();
    assertDeepEqual($$('input[type="checkbox"]').map((x) => x.checked), [false, true, false]);
    host.remove();
    const name = `groupTestBad${++n}`;
    Alpine.data(name, () => {
      const comp = { model: new Links(), moduleId: 'gt' };
      Object.defineProperty(comp, '_ui', { enumerable: false, get() { return { model: this.model, notify: () => {}, dialog: null, i18n: I18N, moduleId: 'gt', instanceId: 'i1', forms: {} }; } });
      return comp;
    });
    const bad = document.createElement('div');
    bad.innerHTML = `<div x-data="${name}"><form x-command-form="link"><div x-param="ids"><input type="checkbox" value="9"></div></form></div>`;
    assertThrows(() => Alpine.initTree(bad), /unknown ids "9"/);
  });
});

