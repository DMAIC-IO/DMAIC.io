/**
 * DoE Planner: mounting the real module with the real template
 * (resources/view.html) and the German texts (resources/i18n/ui.de.json)
 * for the browser tests of the view parts. The store holds the planner and
 * worksheet states; the reader `ctx.source` reads them, `ctx.instances.list`
 * lists the worksheets of the phases. `partContext` gives a view part alone
 * a context whose `ctx.data` throws. Help badges are counted per input section.
 */
import Alpine from '../../../vendor/alpinejs/csp.js';
import mod from '../../../js/modules/doe-planner/viewmodel/viewmodel.js';
import { State } from '../../../js/modules/doe-planner/domain/model.js';
import { designSignature } from '../../../js/modules/doe-planner/domain/signatures.js';
import { snapshotOf } from '../../../js/modules/doe-planner/domain/experiment.js';
import { registerFieldDirective } from '../../../js/core/field-directive.js';
import { registerCommandDirectives } from '../../../js/core/command-directives.js';
import { registerWidgetDirective } from '../../../js/core/widget-directive.js';
import { installWorksheetRevisions } from '../../../js/core/worksheet-data.js';
import { buildInitialWorksheetState } from '../../../js/core/worksheet-sheets.js';
import { WIDGETS } from '../../../js/widgets/registry.js';
import { WIDGET_I18N } from '../../widget-i18n.js';
import { withStoredWorksheetReader } from '../../helpers/worksheet-reader.js';
import { storedSource } from '../../helpers/stored-source.js';

const ID = 'doe-planner';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
export const PLANNER = 'doe-1';
export const flush = () => new Promise((r) => setTimeout(r, 0));
export const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const mounted = [];
let prepared = false;
let HTML = '';
let UI = null;

/** Text under a dot path with `{name}` filled in; otherwise the key. */
function tr(key, params) {
  const v = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), UI);
  if (typeof v !== 'string') return params ? `${key}${JSON.stringify(params)}` : key;
  return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
}

/** German text of the module. @param {string} key @param {object} [params] @returns {string} */
export const de = (key, params) => tr(key, params);

async function prepare() {
  if (!prepared) {
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerCommandDirectives(Alpine);
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    HTML = await (await fetch(new URL(`../../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
    prepared = true;
  }
  // Other planner tests put a slim template under the same key: always the real one here.
  let tpl = document.querySelector(`template[data-tpl="${TPL_KEY}"]`);
  if (!tpl) {
    tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', TPL_KEY);
    document.body.append(tpl);
  }
  tpl.innerHTML = HTML;
}

/**
 * A worksheet state with one sheet of columns.
 * @param {string} name sheet name
 * @param {Record<string, any[]>} columns column name → values
 * @returns {any}
 */
export function worksheet(name, columns) {
  const st = buildInitialWorksheetState(name);
  const sheet = st.sheets[0];
  const entries = Object.entries(columns);
  const rowCount = entries.length ? Math.max(...entries.map(([, v]) => v.length)) : 0;
  sheet.name = name;
  sheet.state = {
    ...(sheet.state ?? {}),
    rowCount,
    columns: entries.map(([colName, values], i) => ({ id: `${name}-c${i}`, name: colName, type: 'numeric', format: {}, meta: null, formulas: [], values: [...values] })),
  };
  return st;
}

/**
 * The context of a view part alone (`optimalView(ctx)` …): the reader
 * `source` over the worksheet states, `instances.list` over them; reading
 * `ctx.data` throws, so a part that still reads through it fails.
 * @param {Record<string, any>} [worksheets] worksheet instance id → state
 * @returns {any}
 */
export function partContext(worksheets = {}) {
  return {
    source: storedSource(worksheets),
    get data() { throw new Error('ctx.data read'); },
    instances: {
      list: ({ modules } = {}) => Object.keys(worksheets)
        .map((instanceId) => ({ instanceId, moduleId: 'worksheet', phase: 'measure', title: '' }))
        .filter((i) => !modules || modules.includes(i.moduleId)),
    },
    notify: () => {},
  };
}

/**
 * A view part as a component with `extra` (model, texts …) as its own members.
 * @param {object} part what the view part returns
 * @param {object} extra
 * @returns {any}
 */
export function partOf(part, extra) {
  const { computed, ...rest } = Object.getOwnPropertyDescriptors(part);
  void computed;
  return Object.defineProperties({ ...extra }, rest);
}

/** A valid plan of two continuous factors and one response, without a design. @param {object} [over] */
export function plan(over = {}) {
  return {
    ...new State().toJSON(),
    doeName: 'Ofen',
    factors: [
      { id: 1, name: 'Temp', unit: 'C', kind: 'continuous', levels: ['20', '40'] },
      { id: 2, name: 'Druck', unit: 'bar', kind: 'continuous', levels: ['1', '5'] },
    ],
    responses: [{ name: 'Yield', unit: '%' }],
    ...over,
  };
}

/** Three continuous factors from 0 to 10. */
export const threeFactors = () => [
  { id: 1, name: 'A', unit: '', kind: 'continuous', levels: ['0', '10'] },
  { id: 2, name: 'B', unit: '', kind: 'continuous', levels: ['0', '10'] },
  { id: 3, name: 'C', unit: '', kind: 'continuous', levels: ['0', '10'] },
];

/**
 * Mounts the module in phase `improve`.
 * @param {object|null} [model] stored state of the planner
 * @param {Record<string, any>} [worksheets] worksheet instance id → state, in phase `measure`
 */
export async function mount(model = null, worksheets = {}) {
  await prepare();
  // Earlier mounts go for good: a preview grid keeps its selection and would take a later paste.
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
  installWorksheetRevisions(bus);
  const store = {
    states: { [PLANNER]: model, ...worksheets },
    phases: {
      measure: Object.keys(worksheets).map((id, order) => ({ instanceId: id, moduleId: 'worksheet', order })),
      improve: [{ instanceId: PLANNER, moduleId: ID, order: 0 }],
    },
  };
  const list = ({ modules } = {}) => Object.entries(store.phases)
    .flatMap(([phase, items]) => items.map((i) => ({ instanceId: i.instanceId, moduleId: i.moduleId, phase, title: '' })))
    .filter((i) => !modules || modules.includes(i.moduleId));
  const notes = [];
  const context = {
    instances: { list, read: async () => ({}), interact: async () => ({ ok: false, results: [] }) },
    instanceId: PLANNER,
    stateManager: withStoredWorksheetReader({
      get(path) {
        if (path === 'phases') return store.phases;
        if (path.startsWith('phases.')) return store.phases[path.slice(7)];
        return undefined;
      },
      set(path, value) { store.phases[path.slice(7)] = value; },
      getModuleState: (id) => store.states[id] ?? null,
      setModuleState: (id, s) => { store.states[id] = s; },
      removeModuleState: (id) => { delete store.states[id]; },
      getProjectCycle: () => 'dmaic',
      isCompleted: () => false,
    }),
    i18n: { t: (k, p) => (p ? `${k}${JSON.stringify(p)}` : k), tf: () => tr, getLanguage: () => 'de' },
    eventBus: bus,
    notify: (msg, type) => notes.push([msg, type]),
    dialog: { confirm: async () => true },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await settle();
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  return {
    container, vm, notes, store, events, bus, context,
    /** The module instance (history: `historyStep`). */
    module: mod,
    $: (s) => container.querySelector(s),
    $$: (s) => [...container.querySelectorAll(s)],
    /** Calls of a command so far, with their arguments. @param {string} name */
    calls: (name) => events.filter(([n, p]) => n === 'command:executed' && p.command === name).map(([, p]) => p.args),
    /** Lets the automatic runs finish. */
    done: async () => { await settle(); await vm()._asyncTaskHost.settle(5000); await settle(); },
    /** The column state of a sheet of a worksheet instance. @param {string} id @returns {any} */
    sheet: (id) => store.states[id].sheets[0].state,
    /** Tells the readers that a worksheet changed, as the worksheet does. @param {string} id */
    changed: (id) => bus.emit('worksheet:dataChanged', { instanceId: id }),
    /** `module:activated` events so far, their instance ids. */
    activated: () => events.filter(([n]) => n === 'module:activated').map(([, p]) => p.instanceId),
    /**
     * Replaces the start of the runs with a stand-in that records the calls.
     * @param {Record<string, any>} outcomes run name → outcome
     * @returns {Array<[string, any]>} the calls
     */
    stubRuns(outcomes) {
      const started = [];
      vm()._asyncTaskHost.start = async (name, args) => { started.push([name, args]); return outcomes[name] ?? { status: 'done', value: null }; };
      return started;
    },
    /** Adds a worksheet instance as the app does: state, phase entry, `module:added`. */
    addWorksheet(id, state) {
      store.states[id] = state;
      store.phases.measure = [...store.phases.measure, { instanceId: id, moduleId: 'worksheet', order: store.phases.measure.length }];
      bus.emit('module:added', { moduleId: 'worksheet', instanceId: id });
    },
  };
}

/**
 * The stored state with its design already made, so mounting waits for no
 * run (the automatic run only regenerates a pending design).
 * @param {object} model stored state without a source worksheet
 * @returns {object}
 */
export function designed(model) {
  const m = State.fromJSON(model);
  m.regenerate({ source: null });
  return m.toJSON();
}

/** Mounts with a current design; with a source the first design is made by the run. */
export async function ready(model, worksheets) {
  const h = await mount(model.sourceWorksheet ? model : designed(model), worksheets);
  await h.done();
  return h;
}

/** Instance id of the bound datasheet `bound` makes. */
export const DATASHEET = 'ws-doe';

/**
 * A stored state with its design and a bound datasheet of it: order
 * columns, one column per factor and per response. The response columns
 * hold `values` (per response, per row; empty without).
 * @param {object} model stored state without a source worksheet
 * @param {Array<Array<number|null>>|null} [values]
 * @returns {{ model: object, worksheets: Record<string, any> }}
 */
export function bound(model, values = null) {
  const json = designed(model);
  const d = json.design;
  const n = d.actualMatrix.length;
  /** @type {Record<string, any[]>} */
  const cols = { Lauf: [...d.runOrder], Std: [...d.stdOrder] };
  json.factors.forEach((f, fi) => { cols[f.name] = d.actualMatrix.map((row) => (f.kind === 'categorical' ? row[fi] : Number(row[fi]))); });
  json.responses.forEach((r, ri) => { cols[r.name] = values?.[ri] ? [...values[ri]] : new Array(n).fill(null); });
  const ws = worksheet('DoE', cols);
  const id = (i) => `DoE-c${i}`;
  const k = json.factors.length;
  json.worksheetRef = {
    instanceId: DATASHEET,
    sheetId: ws.sheets[0].id,
    factorColumnIds: json.factors.map((_, fi) => id(2 + fi)),
    responseColumnIds: json.responses.map((_, ri) => id(2 + k + ri)),
    meanColumnIds: [],
    lnVarColumnIds: [],
    runOrderColumnId: id(0),
    stdOrderColumnId: id(1),
    designSignature: designSignature({ design: d, factors: json.factors }),
    snapshot: snapshotOf({ doeName: json.doeName, designType: json.designType, factors: json.factors, responses: json.responses, options: json.options }, d),
  };
  return { model: json, worksheets: { [DATASHEET]: ws } };
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

/**
 * Help badges (elements with a non-empty `data-help-key`) of the input side,
 * per section: `name` before the first section title, then the key of the
 * section title they follow.
 * @param {HTMLElement} container
 * @returns {Record<string, number>}
 */
export function inputBadges(container) {
  const input = container.querySelector('.doe__input');
  const out = { name: 0 };
  let section = 'name';
  for (const el of input.querySelectorAll('*')) {
    // The EVOP project (toggle and bar) above the name counts on its own.
    if (el.closest('.doe__project-toggle, .doe__project-bar')) {
      if (el.getAttribute('data-help-key')) out.evop = (out.evop ?? 0) + 1;
      continue;
    }
    if (el.parentElement === input && el.classList.contains('dmike-split__section-title')) {
      // The key sits on an inner span right after the title text, not on the title.
      const keyed = el.querySelector('[data-help-key]') ?? el;
      section = keyed.getAttribute('data-help-key').replace('modules.doe-planner.', '').replace(/\.help$/, '');
      out[section] = 0;
    }
    const key = el.getAttribute('data-help-key');
    if (key) out[section] += 1;
  }
  return out;
}

/** Help badges of the output side. @param {HTMLElement} container @returns {number} */
export function outputBadges(container) {
  return [...container.querySelectorAll('.doe__output [data-help-key]')].filter((el) => el.getAttribute('data-help-key')).length;
}
