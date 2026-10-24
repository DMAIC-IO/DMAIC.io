/**
 * D.Mike — Test doubles for the survey-builder sub-viewmodels (survey-vm-*.test.js).
 * Not a test file itself: the node runner only imports *.test.js.
 */

/** Translation stand-in: "key|{params}" keeps assertions language-free. */
export const t = (key, params) => (params ? `${key}|${JSON.stringify(params)}` : key);

/**
 * A module context with recording doubles.
 * @param {object} [overrides]
 * @returns {object} context; `notes`, `confirms`, `emitted`, `charts` record calls
 */
export function fakeContext(overrides = {}) {
  const handlers = new Map();
  const ctx = {
    instanceId: 'sb-1',
    notes: [],
    confirms: [],
    emitted: [],
    confirmAnswer: true,
    i18n: { getLanguage: () => 'de', t: (key) => key },
    notify(message, type) { ctx.notes.push({ message, type }); },
    dialog: { confirm: async (opts) => { ctx.confirms.push(opts); return ctx.confirmAnswer; } },
    eventBus: {
      handlers,
      on(evt, fn) { handlers.set(evt, [...(handlers.get(evt) || []), fn]); },
      off(evt, fn) { handlers.set(evt, (handlers.get(evt) || []).filter((f) => f !== fn)); },
      emit(evt, payload) {
        ctx.emitted.push({ evt, payload });
        for (const fn of handlers.get(evt) || []) fn(payload);
      },
    },
    charts: { created: [], destroyed: [] },
    chartManager: {
      async create(host, type, config) { const c = { host, type, config }; ctx.charts.created.push(c); return c; },
      destroy(c) { ctx.charts.destroyed.push(c); },
    },
    stateManager: { get: () => ({}), getModuleState: () => null, setModuleState: () => {} },
    ...overrides,
  };
  return ctx;
}

/**
 * Attaches a sub-viewmodel like the shell does and records its watches.
 * @param {object} vm sub-viewmodel
 * @param {object} model a State
 * @returns {{watches: Array<{getter: Function, callback: Function}>, ticks: Function[]}}
 */
export function attach(vm, model) {
  const rec = { watches: [], ticks: [] };
  vm.attach({
    model,
    watch: (getter, callback) => { rec.watches.push({ getter, callback }); },
    nextTick: (cb) => { rec.ticks.push(cb); },
  });
  return rec;
}
