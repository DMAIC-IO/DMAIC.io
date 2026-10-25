/**
 * D.Mike — Test doubles for the ishikawa sub-viewmodels (ishikawa-vm-*.test.js).
 * Not a test file itself: the node runner only imports *.test.js.
 */
import { EventBus } from '../../js/core/event-bus.js';

/** Translation stand-in: "key|{params}" keeps assertions language-free. */
export const t = (key, params) => (params ? `${key}|${JSON.stringify(params)}` : key);

/** @returns {object} a chart host stand-in that records height and clearing */
export function fakeHost() {
  return {
    style: { height: '' },
    cleared: 0,
    replaceChildren() { this.cleared += 1; },
    classList: { toggled: [], toggle(name, on) { this.toggled.push([name, on]); } },
    focus() { this.focused = true; },
  };
}

/**
 * A container whose querySelector answers from a map of selectors.
 * @param {Record<string, object>} [hosts]
 * @returns {{hosts: Record<string, object>, querySelector: function(string): ?object}}
 */
export function fakeContainer(hosts = {}) {
  return { hosts, querySelector: (sel) => hosts[sel] ?? null };
}

/**
 * A module context with recording doubles.
 * @param {object} [overrides]
 * @returns {object} context; `notes`, `confirms`, `shown`, `forms`, `charts` record calls
 */
export function fakeContext(overrides = {}) {
  const ctx = {
    instanceId: 'ish-1',
    language: 'de',
    notes: [],
    confirms: [],
    shown: [],
    forms: [],
    confirmAnswer: true,
    i18n: { getLanguage: () => 'de', t: (key) => key },
    notify(message, type) { ctx.notes.push({ message, type }); },
    dialog: {
      confirm: async (opts) => { ctx.confirms.push(opts); return ctx.confirmAnswer; },
      show: (opts) => { ctx.shown.push(opts); return { close() {}, setTitle() {} }; },
      form: (opts) => { ctx.forms.push(opts); },
    },
    charts: { created: [], destroyed: [] },
    chartManager: {
      async create(host, type, config) {
        const c = { host, type, config, render() {} };
        ctx.charts.created.push(c);
        return c;
      },
      destroy(c) { ctx.charts.destroyed.push(c); },
    },
    ...overrides,
  };
  return ctx;
}

/**
 * Attaches a sub-viewmodel like the shell does: a real EventBus, recorded ticks.
 * @param {object} vm sub-viewmodel
 * @param {object} model a State
 * @param {{events?: EventBus, refs?: Record<string, object>}} [opts]
 * @returns {{events: EventBus, ticks: Function[], flush: function(): void}}
 */
export function attach(vm, model, opts = {}) {
  const events = opts.events ?? new EventBus();
  const ticks = [];
  vm.attach({
    model,
    events,
    watch: () => {},
    nextTick: (cb) => { ticks.push(cb); },
    ref: (name) => (opts.refs ?? {})[name] ?? null,
  });
  return { events, ticks, flush: () => { while (ticks.length) ticks.shift()(); } };
}
