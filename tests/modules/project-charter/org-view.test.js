/**
 * Project charter: Organigramm und Stil-Panel im Browser (viewmodel/org.js,
 * viewmodel/style.js) mit dem echten Modul, der echten Vorlage und Attrappen
 * für stateManager, Event-Bus, Dialog und Meldungen. Prüft Anlegen über das
 * Formular, Ein-/Ausklappen, Zoom am Rad, Einpassen, Neu-Einpassen bei
 * Breitenänderung, den Farbwähler des Stil-Panels (Entwurf, ein Schritt im
 * Verlauf) und den Bearbeiten-Dialog, der „erben“ stehen lässt.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import mod from '../../../js/modules/project-charter/viewmodel/viewmodel.js';
import { setFields } from '../../../js/core/model.js';
import { registerFieldDirective } from '../../../js/core/field-directive.js';
import { registerCommandDirectives } from '../../../js/core/command-directives.js';
import { registerWidgetDirective } from '../../../js/core/widget-directive.js';
import { WIDGETS } from '../../../js/widgets/registry.js';
import { WIDGET_I18N } from '../../widget-i18n.js';

/** @param {unknown} v @param {string} [msg] */
const assertFalse = (v, msg) => assertTrue(!v, msg);
const ID = 'project-charter';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
/** Wartet, bis `ok()` gilt; höchstens zwei Sekunden. */
async function until(ok) {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
}
const mounted = [];
let ready = false;
/** Deutsche Texte des Moduls. */
let UI = null;

/** Text unter einem Punkt-Pfad, Parameter `{name}` eingesetzt; sonst der Schlüssel. */
function tr(key, params) {
  const v = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), UI);
  if (typeof v !== 'string') return key;
  return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
}

async function ensureTemplate() {
  if (ready) return;
  registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
  registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
  registerCommandDirectives(Alpine);
  if (!Alpine.version) Alpine.start();
  UI = await (await fetch(new URL(`../../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
  // Modul-CSS: Rahmenbreiten wirken auf die gemessenen Knotenhöhen.
  if (!document.querySelector('style[data-test-css="project-charter"]')) {
    const css = document.createElement('style');
    css.dataset.testCss = 'project-charter';
    css.textContent = await (await fetch(new URL(`../../../js/modules/${ID}/resources/style.css`, import.meta.url), { cache: 'no-cache' })).text();
    document.head.append(css);
  }
  if (!document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) {
    const html = await (await fetch(new URL(`../../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
    const tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', TPL_KEY);
    tpl.innerHTML = html;
    document.body.append(tpl);
  }
  ready = true;
}

/**
 * Attrappe des Dialog-Dienstes: `form` leiht den Inhalt aus und gibt ihn beim
 * Schließen zurück; `confirm` antwortet mit `answer`.
 */
function fakeDialog() {
  const d = {
    open: null,
    answer: true,
    async confirm() { return d.answer; },
    show(opts) { return { close: () => opts.onClose?.(), setTitle() {} }; },
    form(opts) {
      return new Promise((resolve) => {
        const body = document.createElement('div');
        document.body.append(body);
        const home = opts.content.parentNode;
        const next = opts.content.nextSibling;
        body.append(opts.content);
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          home.insertBefore(opts.content, next);
          body.remove();
          d.open = null;
          resolve(result);
        };
        const api = {
          confirm: () => { if (!settled && !(opts.onConfirm && opts.onConfirm(body) === false)) finish(true); },
          cancel: () => finish(false),
        };
        d.open = { opts, body, api };
        opts.onMount?.(body, { confirm: api.confirm, cancel: api.cancel });
      });
    },
  };
  return d;
}

/**
 * Modul einhängen, 1000 px breit.
 * @param {object|null} [model] gespeicherter Zustand der Instanz
 */
async function mount(model = null) {
  await ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  document.querySelectorAll('.dmike-chart-ed-cp-overlay, .dmike-chart-ed-cp-popup').forEach((el) => el.remove());
  const states = { 'pc-1': model };
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  const dialog = fakeDialog();
  const context = {
    instanceId: 'pc-1',
    stateManager: {
      get: () => undefined,
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
    },
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: bus,
    notify: () => {},
    dialog,
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:0;top:0;width:1000px;';
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await settle();
  await frame();
  await settle();
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  return {
    container, vm, states, dialog,
    $: (s) => container.querySelector(s),
    $$: (s) => [...container.querySelectorAll(s)],
  };
}

/** Text in ein Feld und `change`. */
function typeIn(el, v) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

const node = (id, title, pid = null, extra = {}) => ({ id, title, desc: '', pid, ...extra });
const STYLE = { nodeBg: '', nodeBorderColor: '', nodeBorderStyle: 'solid', nodeBorderWidth: 1, lineColor: '', lineStyle: 'solid', lineWidth: 2 };
/** r ─┬─ a ─── a1, └─ b */
const TREE = {
  _schema: { version: '1.0' }, problemStatement: '', goals: [], orgStyle: STYLE,
  orgChart: [node('r', 'Sponsor'), node('a', 'PL', 'r'), node('b', 'QM', 'r'), node('a1', 'Team', 'a')],
};
/** Fünf Wurzeln nebeneinander: breiter als das Fenster. */
const WIDE = { ...TREE, orgChart: ['w1', 'w2', 'w3', 'w4', 'w5'].map((id) => node(id, id)) };

const nodeEl = (h, id) => h.$(`.pc__org-node[data-id="${id}"]`);
const nodeIds = (h) => h.$$('.pc__org-node').map((el) => el.dataset.id);

suite('project-charter org: Knoten', () => {
  test('Knoten rendern mit Griff-Vertrag: tabindex, data-id, data-parent-id, data-child-count', async () => {
    const h = await mount(TREE);
    assertDeepEqual(nodeIds(h), ['r', 'a', 'b', 'a1']);
    const r = nodeEl(h, 'r');
    assertEqual(r.getAttribute('tabindex'), '0');
    assertFalse(r.hasAttribute('data-parent-id'), 'Wurzel ohne data-parent-id');
    assertEqual(r.dataset.childCount, '2');
    assertEqual(nodeEl(h, 'a1').dataset.parentId, 'a');
    assertTrue(r.closest('[data-org-root]') !== null, 'Knoten liegen im data-org-root');
    assertEqual(h.$('.pc__org-node-desc'), null, 'leerer Untertitel rendert nichts');
  });

  test('Anlegen über das Formular: Wurzel, dann Kind unter einem eingeklappten Knoten klappt ihn auf', async () => {
    const h = await mount();
    h.$('.pc__org-add-btn').click();
    await settle();
    assertTrue(h.dialog.open !== null, 'Dialog offen');
    typeIn(h.dialog.open.body.querySelector('[data-field="title"]'), 'Sponsor');
    h.dialog.open.api.confirm();
    await settle();
    assertEqual(h.vm().model.orgChart.length, 1);
    const root = h.vm().model.orgChart[0];
    assertEqual(root.pid, null);
    assertEqual(h.vm().state.selectedId, root.id, 'neuer Knoten gewählt');

    h.vm().model.addOrgNode({ title: 'PL', parentId: root.id });
    await settle();
    h.vm().toggleCollapse(root.id);
    await settle();
    assertDeepEqual([...h.vm().state.collapsed], [root.id]);
    nodeEl(h, root.id).querySelector('[data-action="add"]').click();
    await settle();
    typeIn(h.dialog.open.body.querySelector('[data-field="title"]'), 'QM');
    h.dialog.open.api.confirm();
    await settle();
    assertEqual(h.vm().model.orgChart.length, 3);
    assertEqual(h.vm().model.orgChart[2].pid, root.id);
    assertDeepEqual([...h.vm().state.collapsed], [], 'Elternknoten aufgeklappt');
    assertEqual(h.$$('.pc__org-node').length, 3);
  });

  test('Einklappen blendet Nachfahren aus und zeigt die Anzahl der Kinder', async () => {
    const h = await mount(TREE);
    const toggle = nodeEl(h, 'r').querySelector('[data-action="toggle"]');
    toggle.click();
    await settle();
    assertDeepEqual(nodeIds(h), ['r']);
    assertEqual(nodeEl(h, 'r').querySelector('[data-action="toggle"]').textContent.trim(), '2');
    assertEqual(nodeEl(h, 'r').dataset.childCount, '2', 'Anzahl zählt auch ausgeblendete Kinder');
    nodeEl(h, 'r').querySelector('[data-action="toggle"]').click();
    await settle();
    assertDeepEqual(nodeIds(h), ['r', 'a', 'b', 'a1']);
    assertEqual(nodeEl(h, 'b').querySelector('[data-action="toggle"]'), null, 'Blatt ohne Umschalter');
  });

  test('eine Linie je sichtbarer Verbindung, Hervorhebung am gewählten Knoten', async () => {
    const h = await mount(TREE);
    const cfg = h.vm().orgLinks;
    assertEqual(cfg.links.length, 3);
    assertEqual(cfg.highlightClass, 'pc__org-line--hl');
    assertEqual(cfg.padding, 0);
    assertEqual(cfg.origin, 'zero');
    assertTrue(cfg.links.every((l) => l.highlight === false));
    h.vm().state.selectedId = 'a';
    assertDeepEqual(h.vm().orgLinks.links.filter((l) => l.highlight).map((l) => `${l.from}>${l.to}`).sort(), ['a>a1', 'r>a']);
  });

  test('Höhen werden nach dem Rendern gemessen', async () => {
    const h = await mount(TREE);
    await until(() => Object.keys(h.vm().state.heights).length === 4);
    const measured = h.vm().state.heights.r;
    assertEqual(measured, nodeEl(h, 'r').offsetHeight);
    assertTrue(measured > 0, 'gemessene Höhe');
  });
});

suite('project-charter org: Höhen nach Stiländerung', () => {
  test('globale Rahmenbreite 1 → 8 misst die Knoten neu', async () => {
    const h = await mount(TREE);
    await until(() => Object.keys(h.vm().state.heights).length === 4);
    const before = h.vm().state.heights.r;
    setFields(h.vm().model, { orgStyle: { ...STYLE, nodeBorderWidth: 8 } });
    await until(() => h.vm().state.heights.r !== before);
    assertEqual(h.vm().state.heights.r, before + 14, 'zweimal 7 px mehr Rahmen');
    assertEqual(h.vm().state.heights.r, nodeEl(h, 'r').offsetHeight);
  });

  test('eigene Rahmenbreite eines Knotens misst ihn neu', async () => {
    const h = await mount(TREE);
    await until(() => Object.keys(h.vm().state.heights).length === 4);
    const before = h.vm().state.heights.b;
    h.vm().model.setOrgNodeBorderWidth({ id: 'b', value: 6 });
    await until(() => h.vm().state.heights.b !== before);
    assertEqual(h.vm().state.heights.b, before + 10);
  });
});

suite('project-charter org: Ansicht', () => {
  test('Rad zoomt um den Zeiger (0,92 / 1,08)', async () => {
    const h = await mount(TREE);
    const s = h.vm().state;
    const wrap = h.$('[data-ref="orgWrap"]');
    const rect = wrap.getBoundingClientRect();
    const z0 = s.zoom;
    const px0 = s.pan.x;
    const mx = 300;
    wrap.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: rect.left + mx, clientY: rect.top + 50, bubbles: true, cancelable: true }));
    await settle();
    const z1 = Math.min(3, z0 * 1.08);
    assertTrue(Math.abs(s.zoom - z1) < 1e-9, `zoom ${s.zoom}`);
    assertTrue(Math.abs(s.pan.x - (mx - (mx - px0) * (z1 / z0))) < 1e-6, `pan.x ${s.pan.x}`);
    assertTrue(s.userAdjusted, 'Nutzereingriff');
    wrap.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: rect.left + mx, clientY: rect.top + 50, bubbles: true, cancelable: true }));
    await settle();
    assertTrue(Math.abs(s.zoom - z1 * 0.92) < 1e-9);
  });

  test('fit(): nur horizontal, Zoom ≤ 1, gibt die Automatik frei', async () => {
    const h = await mount(WIDE);
    const s = h.vm().state;
    s.userAdjusted = true;
    s.zoom = 2.5;
    h.vm().fit();
    await settle();
    assertTrue(s.zoom <= 1, `zoom ${s.zoom}`);
    assertTrue(s.zoom < 1, 'breites Organigramm wird verkleinert');
    assertFalse(s.userAdjusted);
    const small = await mount(TREE);
    small.vm().fit();
    assertEqual(small.vm().state.zoom, 1, 'schmales Organigramm bleibt bei 1');
  });

  test('Breitenänderung ohne Nutzereingriff passt neu ein, nach Verschieben nicht', async () => {
    const h = await mount(WIDE);
    const s = h.vm().state;
    const before = s.zoom;
    h.container.style.width = '700px';
    await until(() => s.zoom !== before);
    assertTrue(s.zoom < before, `neu eingepasst: ${before} → ${s.zoom}`);

    const wrap = h.$('[data-ref="orgWrap"]');
    const r = wrap.getBoundingClientRect();
    const ev = (type, x) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, button: 0, clientX: r.left + x, clientY: r.bottom - 10 });
    wrap.dispatchEvent(ev('pointerdown', 20));
    wrap.dispatchEvent(ev('pointermove', 80));
    wrap.dispatchEvent(ev('pointerup', 80));
    await settle();
    assertTrue(s.userAdjusted, 'Verschieben ist ein Nutzereingriff');
    const pan = s.pan.x;
    const zoom = s.zoom;
    h.container.style.width = '900px';
    for (let i = 0; i < 5; i++) { await frame(); await settle(); }
    assertEqual(s.zoom, zoom);
    assertEqual(s.pan.x, pan);
  });

  test('Fenster wächst mit dem Inhalt (min. 420)', async () => {
    const deep = { ...TREE, orgChart: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((id, i) => node(id, id, i ? `d${i}` : null)) };
    const h = await mount(deep);
    const wrap = h.$('[data-ref="orgWrap"]');
    assertTrue(wrap.clientHeight > 500, `Höhe ${wrap.clientHeight}`);
    const empty = await mount();
    assertEqual(empty.vm().wrapStyle.height, '', 'leer: Grundhöhe aus dem CSS');
  });
});

suite('project-charter org: Stil', () => {
  test('Farbwähler ziehen ändert nur den Entwurf, Schließen schreibt einmal (ein Verlaufsschritt)', async () => {
    const h = await mount(TREE);
    const s = h.vm().state;
    assertFalse(mod.historyCan('undo'));
    h.$('.pc__org-modebar [data-action="editor"]').click();
    await settle();
    assertTrue(s.editorOpen);
    h.$('[data-ref="orgEditorInner"] [data-style-key="nodeBg"]').click();
    await settle();
    const slider = document.querySelector('.dmike-chart-ed-cp-popup .dmike-chart-ed-cp-r input, .dmike-chart-ed-cp-popup input.dmike-chart-ed-cp-r, .dmike-chart-ed-cp-popup .dmike-chart-ed-cp-r');
    assertTrue(slider !== null, 'Farbwähler offen');
    const hex = document.querySelector('.dmike-chart-ed-cp-hex-input');
    for (const v of ['ff0000ff', '00ff00ff', '0000ffff']) {
      hex.value = v;
      hex.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await settle();
    assertEqual(s.styleDraft?.key, 'nodeBg');
    assertEqual(s.styleDraft?.value, 'rgba(0,0,255,1.00)');
    assertEqual(h.vm().model.orgStyle.nodeBg, '', 'Model unverändert während des Ziehens');
    assertFalse(mod.historyCan('undo'), 'kein Schritt während des Ziehens');
    assertEqual(h.$('.pc__org-section').style.getPropertyValue('--pc-org-node-bg'), 'rgba(0,0,255,1.00)', 'Vorschau über die Variable');

    document.querySelector('.dmike-chart-ed-cp-overlay').click();
    await settle();
    assertEqual(s.styleDraft, null);
    assertEqual(h.vm().model.orgStyle.nodeBg, 'rgba(0,0,255,1.00)');
    assertTrue(mod.historyCan('undo'));
    assertTrue(mod.historyStep('undo'));
    await settle();
    assertEqual(h.vm().model.orgStyle.nodeBg, '');
    assertFalse(mod.historyCan('undo'), 'genau ein Schritt');
  });

  test('Rahmen- und Linienstil über x-field, Linienart als Variable', async () => {
    const h = await mount(TREE);
    h.vm().state.editorOpen = true;
    await settle();
    const sel = h.$('[data-ref="orgEditorInner"] select[data-style-key="lineStyle"]');
    sel.value = 'dotted';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    assertEqual(h.vm().model.orgStyle.lineStyle, 'dotted');
    assertEqual(h.$('.pc__org-section').style.getPropertyValue('--pc-org-line-dasharray'), '2 4');
    const width = h.$('[data-ref="orgEditorInner"] [data-style-key="nodeBorderWidth"]');
    typeIn(width, '3');
    await settle();
    assertEqual(h.vm().model.orgStyle.nodeBorderWidth, 3);
    assertEqual(h.$('.pc__org-section').style.getPropertyValue('--pc-org-node-border-width'), '3px');
  });

  test('Bearbeiten-Dialog ohne Änderung lässt den Stil auf „erben“; nur Titel ändern ebenso', async () => {
    const styled = { ...TREE, orgStyle: { ...STYLE, nodeBorderStyle: 'dashed', nodeBorderWidth: 3, nodeBg: 'rgb(1, 2, 3)' } };
    const h = await mount(styled);
    nodeEl(h, 'a').querySelector('[data-action="edit"]').click();
    await settle();
    const body = h.dialog.open.body;
    assertEqual(body.querySelector('[data-field="title"]').value, 'PL');
    assertEqual(body.querySelector('[data-field="bg"]').value, '');
    assertEqual(body.querySelector('[data-field="borderStyle"]').value, '');
    // Geerbt wird angezeigt, was gilt: der globale Stil.
    const style = body.querySelector('[data-field="borderStyle"]');
    assertEqual(style.options[style.selectedIndex].textContent, 'Global (Gestrichelt)');
    assertEqual(body.querySelector('[data-field="borderWidth"]').value, '0');
    const hint = body.querySelector('[data-field="borderWidth-hint"]');
    assertEqual(hint.textContent, 'Global (3)');
    assertTrue(hint.style.display !== 'none', 'Hinweis sichtbar');
    assertEqual(body.querySelector('[data-field="bg"]').placeholder, 'Global (rgb(1, 2, 3))');
    assertEqual(body.querySelector('[data-field="borderColor"]').placeholder, 'Global (Farbschema)');
    h.dialog.open.api.confirm();
    await settle();
    assertEqual(h.dialog.open, null, 'Dialog zu');
    const keys = () => Object.keys(h.vm().model.toJSON().orgChart.find((n) => n.id === 'a'));
    assertDeepEqual(keys().sort(), ['desc', 'id', 'pid', 'title']);

    nodeEl(h, 'a').querySelector('[data-action="edit"]').click();
    await settle();
    typeIn(h.dialog.open.body.querySelector('[data-field="title"]'), 'Projektleitung');
    h.dialog.open.api.confirm();
    await settle();
    const a = h.vm().model.toJSON().orgChart.find((n) => n.id === 'a');
    assertEqual(a.title, 'Projektleitung');
    assertEqual(a.bg ?? '', '');
    assertEqual(a.borderStyle ?? '', '');
    assertEqual(a.borderWidth ?? 0, 0);
  });

  test('Farbe im Bearbeiten-Dialog: Wähler schreibt ins Feld, Speichern setzt den Knotenstil', async () => {
    const h = await mount(TREE);
    nodeEl(h, 'b').querySelector('[data-action="edit"]').click();
    await settle();
    const body = h.dialog.open.body;
    body.querySelector('[data-field="bg-swatch"]').click();
    const hex = document.querySelector('.dmike-chart-ed-cp-hex-input');
    hex.value = 'ff0000ff';
    hex.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.dmike-chart-ed-cp-overlay').click();
    await settle();
    assertEqual(body.querySelector('[data-field="bg"]').value, 'rgba(255,0,0,1.00)');
    h.dialog.open.api.confirm();
    await settle();
    assertEqual(h.vm().model.orgChart.find((n) => n.id === 'b').bg, 'rgba(255,0,0,1.00)');
    assertEqual(nodeEl(h, 'b').style.getPropertyValue('--pc-org-node-bg'), 'rgba(255,0,0,1.00)');
  });

  test('Löschen fragt nach; Ablehnen lässt den Knoten stehen', async () => {
    const h = await mount(TREE);
    h.dialog.answer = false;
    nodeEl(h, 'a').querySelector('[data-action="del"]').click();
    await settle();
    assertEqual(h.vm().model.orgChart.length, 4);
    h.dialog.answer = true;
    nodeEl(h, 'a').querySelector('[data-action="del"]').click();
    await settle();
    assertDeepEqual(nodeIds(h), ['r', 'b']);
  });
});
