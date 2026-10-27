/**
 * D.Mike — Test doubles for the doe-planner sub-viewmodels (doe-planner-vm-*.test.js).
 * Not a test file itself: the node runner only imports *.test.js.
 */
import { State } from '../../js/modules/doe-planner/doe-planner-model.js';

/** Translation stand-in: "key|{params}" keeps assertions language-free. */
export const t = (key, params) => (params ? `${key}|${JSON.stringify(params)}` : key);

/**
 * A module context with recording doubles. `modules` backs
 * stateManager.getModuleState, `store` backs stateManager.get/set.
 * @param {object} [overrides]
 * @returns {object}
 */
export function fakeContext(overrides = {}) {
  const ctx = {
    instanceId: 'doe-1',
    language: 'de',
    notes: [],
    confirms: [],
    emitted: [],
    confirmAnswer: true,
    modules: {},
    store: {},
    i18n: { getLanguage: () => 'de', t: (key) => key },
    notify(message, type) { ctx.notes.push({ message, type }); },
    dialog: { confirm: async (opts) => { ctx.confirms.push(opts); return ctx.confirmAnswer; } },
    eventBus: { emit(name, payload) { ctx.emitted.push({ name, payload }); }, on() {}, off() {} },
    stateManager: {
      getModuleState: (id) => ctx.modules[id] ?? null,
      setModuleState: (id, s) => { ctx.modules[id] = s; },
      removeModuleState: (id) => { delete ctx.modules[id]; },
      get: (path) => ctx.store[path],
      set: (path, v) => { ctx.store[path] = v; },
    },
    ...overrides,
  };
  return ctx;
}

/**
 * Attaches a sub-viewmodel like the shell does and records the calls.
 * @param {object} vm
 * @param {State} model
 * @returns {{saves: number, schedules: number, adopts: number, rev: number, ticks: Function[], watchers: Array<{getter: Function, cb: Function}>, flush: function(): void}}
 */
export function attach(vm, model) {
  const rec = { saves: 0, schedules: 0, adopts: 0, rev: 0, ticks: [], watchers: [] };
  vm.attach({
    model,
    save: () => { rec.saves += 1; },
    watch: (getter, cb) => { rec.watchers.push({ getter, cb }); },
    nextTick: (cb) => { rec.ticks.push(cb); },
    rev: () => rec.rev,
    schedule: () => { rec.schedules += 1; },
    adoptSignatures: () => { rec.adopts += 1; },
  });
  rec.flush = () => { while (rec.ticks.length) rec.ticks.shift()(); };
  return rec;
}

/** @returns {State} 2 factors (Temp 20/40 °C, Druck 1/5 bar), 1 response (Yield), full factorial */
export function plannedState() {
  const s = new State();
  s.addFactor('Temp', 'C', ['20', '40']);
  s.addFactor('Druck', 'bar', ['1', '5']);
  s.addResponse();
  s.responses[0].name = 'Yield';
  return s;
}

/**
 * Adds an unrandomised 2² design in standard order.
 * @param {State} s
 * @returns {State}
 */
export function withDesign(s) {
  s.design = {
    designType: 'full',
    codedMatrix: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    actualMatrix: [[20, 1], [40, 1], [20, 5], [40, 5]],
    runOrder: [1, 2, 3, 4], stdOrder: [1, 2, 3, 4], replicateIds: [1, 1, 1, 1],
    p: 0,
  };
  return s;
}

/**
 * Links a datasheet "ws-1"/"s-1" whose response column holds `values`; the
 * link matches the current design (staleness "bound").
 * @param {object} ctx fakeContext
 * @param {State} s
 * @param {Array<?number>} values
 */
export function linkWorksheet(ctx, s, values) {
  ctx.modules['ws-1'] = { sheets: [{ id: 's-1', name: 'Plan', state: { rowCount: values.length, columns: [{ id: 'c-y', values }] } }] };
  s.worksheetRef = {
    instanceId: 'ws-1', sheetId: 's-1', factorColumnIds: ['c-a', 'c-b'], responseColumnIds: ['c-y'],
    designSignature: s.designSignature(),
  };
}
