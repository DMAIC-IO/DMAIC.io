/**
 * Survey builder: mounting the real module with the real template
 * (resources/view.html) and the German texts (resources/i18n/ui.de.json)
 * for the browser tests of the view parts. The questionnaire texts load
 * from the module's own language files through `#module-resources`, as in
 * the app. Dialog answers, notifications and `command:executed` events are
 * recorded.
 */
import { fakeChartManager } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import mod from '../../../js/modules/survey-builder/viewmodel/viewmodel.js';
import { SurveyModel } from '../../../js/modules/survey-builder/domain/model.js';
import { registerTablistDirective } from '../../../js/core/tablist.js';
import { registerFieldDirective } from '../../../js/core/field-directive.js';
import { registerCommandDirectives } from '../../../js/core/command-directives.js';
import { registerFileDropDirective } from '../../../js/core/file-drop-directive.js';
import { registerWidgetDirective } from '../../../js/core/widget-directive.js';
import { registerAsyncTaskDirectives } from '../../../js/core/async-task-directives.js';
import { WIDGETS } from '../../../js/widgets/registry.js';
import { WIDGET_I18N } from '../../widget-i18n.js';

const ID = 'survey-builder';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
export const INSTANCE = 'sb-1';
export const flush = () => new Promise((r) => setTimeout(r, 0));
export const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
/** Waits until `ok()` holds; two seconds at most. @param {() => boolean} ok */
export async function until(ok) {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
}
const mounted = [];
let prepared = false;
let HTML = '';
/** @type {any} */
let UI = null;
/** @type {any} */
let HELP = null;

/** @param {any} tree @param {string} path @returns {any} */
const at = (tree, path) => path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), tree);

/** Text under a dot path with `{name}` filled in; otherwise the key. */
function tr(key, params) {
  const v = at(UI, key);
  if (typeof v !== 'string') return params ? `${key}${JSON.stringify(params)}` : key;
  return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
}

/** German text of the module. @param {string} key @param {object} [params] @returns {string} */
export const de = (key, params) => tr(key, params);

/** @param {string} key help key without `modules.survey-builder.` @returns {any} the context help entry */
export const helpEntry = (key) => at(HELP, key);

/** @param {string} file under resources/ @returns {string} */
const resourceUrl = (file) => new URL(`../../../js/modules/${ID}/resources/${file}`, import.meta.url).href;

/** The module's language files in `#module-resources`, as the build lists them. */
function provideResources() {
  let el = document.getElementById('module-resources');
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/json';
    el.id = 'module-resources';
    el.textContent = '{}';
    document.head.append(el);
  }
  let list = {};
  try { list = JSON.parse(el.textContent || '{}'); } catch { list = {}; }
  list[ID] = { files: { 'i18n/ui.de.json': resourceUrl('i18n/ui.de.json'), 'i18n/ui.en.json': resourceUrl('i18n/ui.en.json') } };
  el.textContent = JSON.stringify(list);
}

async function prepare() {
  if (!prepared) {
    registerTablistDirective(Alpine);
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerCommandDirectives(Alpine);
    registerFileDropDirective(Alpine);
    registerAsyncTaskDirectives(Alpine, { i18n: { t: (k, p) => (p ? `${k}${JSON.stringify(p)}` : k) } });
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(resourceUrl('i18n/ui.de.json'), { cache: 'no-cache' })).json();
    HELP = await (await fetch(resourceUrl('i18n/context-help.de.json'), { cache: 'no-cache' })).json();
    HTML = await (await fetch(new URL(`../../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
    prepared = true;
  }
  provideResources();
  let tpl = document.querySelector(`template[data-tpl="${TPL_KEY}"]`);
  if (!tpl) {
    tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', TPL_KEY);
    document.body.append(tpl);
  }
  tpl.innerHTML = HTML;
}

/**
 * A stored state: the empty model with the given survey parts and fields.
 * @param {{ survey?: object } & Record<string, any>} [over]
 * @returns {any}
 */
export function stored(over = {}) {
  const base = new SurveyModel().toJSON();
  const { survey = {}, ...rest } = over;
  return { ...base, survey: { ...base.survey, id: 'sv-1', ...survey }, ...rest };
}

/**
 * Mounts the module.
 * @param {object|null} [model] stored state
 * @param {{ confirm?: boolean, chartManager?: (bus: any, i18n: any) => any, i18n?: (base: any) => any,
 *   instances?: any }} [opts]
 *   answer of the confirmation dialog; a real chart manager in place of the recording stand-in;
 *   a wrapper around the i18n of the context (to watch which keys are asked for);
 *   the instances service of the context (`list`, `read`, `interact`)
 */
export async function mount(model = null, { confirm = true, chartManager = null, i18n = (base) => base, instances = null } = {}) {
  await prepare();
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
  const handlers = [];
  const events = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { events.push([n, p]); for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  const states = { [INSTANCE]: model };
  const notes = [];
  const confirms = [];
  const context = {
    instances: instances ?? { list: () => [], read: async () => ({}), interact: async () => ({ ok: false, results: [] }) },
    instanceId: INSTANCE,
    stateManager: {
      get: (path) => {
        const phases = { define: [{ instanceId: INSTANCE, moduleId: ID, order: 0 }] };
        if (path === 'phases') return phases;
        return path.startsWith('phases.') ? phases[path.slice(7)] : undefined;
      },
      set: () => {},
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      isCompleted: () => false,
    },
    i18n: i18n({ t: (k, p) => (k.startsWith(`modules.${ID}.`) ? tr(k.slice(ID.length + 9), p) : k), tf: () => tr, getLanguage: () => 'de' }),
    eventBus: bus,
    notify: (msg, type) => notes.push([msg, type]),
    dialog: { confirm: async (opts) => { confirms.push(opts); return confirm; } },
    chartManager: null,
    theme: 'light',
    language: 'de',
  };
  context.chartManager = chartManager
    ? chartManager(bus, context.i18n)
    : { ...fakeChartManager(), renderSVG: () => '' };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await settle();
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  return {
    container, vm, notes, confirms, events, states, bus,
    /** How many handlers listen to an event. @param {string} name */
    listeners: (name) => handlers.filter(([n]) => n === name).length,
    /** Tears the module down, as a view switch does. */
    destroy: () => {
      const i = mounted.indexOf(container);
      if (i >= 0) mounted.splice(i, 1);
      Alpine.destroyTree(container);
      container.remove();
    },
    $: (s) => container.querySelector(s),
    $$: (s) => [...container.querySelectorAll(s)],
    /** Calls of a command so far, with their arguments. @param {string} name */
    calls: (name) => events.filter(([n, p]) => n === 'command:executed' && p.command === name).map(([, p]) => p.args),
  };
}

/** Types into a field and fires `input` and `change`. */
export function typeIn(el, v) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Picks an option of a `<select>` by value and fires `change`. */
export function pick(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
