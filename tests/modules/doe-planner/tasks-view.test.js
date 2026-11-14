/**
 * DoE Planner: the runs of the viewmodel in the browser
 * (viewmodel/viewmodel.js) with the real module, a slim template and a
 * store with real worksheet states. `instances.interact` is a stand-in of
 * the agent layer: it records every stack and plays it on the store, all
 * or nothing; `failOn` makes one action fail.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import mod from '../../../js/modules/doe-planner/viewmodel/viewmodel.js';
import { State } from '../../../js/modules/doe-planner/domain/model.js';
import { setFields } from '../../../js/core/model.js';
import { configSignature } from '../../../js/modules/doe-planner/domain/signatures.js';
import { snapshotOf } from '../../../js/modules/doe-planner/domain/experiment.js';
import { generateDesign } from '../../../js/engines/doe-planner-engine.js';
import { uid } from '../../../js/core/uid.js';
import { buildInitialWorksheetState } from '../../../js/core/worksheet-sheets.js';

const ID = 'doe-planner';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const PLANNER = 'doe-1';
const flush = () => new Promise((r) => setTimeout(r, 0));
const mounted = [];

/** Texts with parameters visible; otherwise the key. */
const tf = (k, p) => (p ? `${k}${JSON.stringify(p)}` : k);

/** @param {any} v @returns {any} */
const clone = (v) => JSON.parse(JSON.stringify(v));

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="doePlanner"></div>';
  document.body.append(tpl);
}

/** A valid plan of two factors and the given responses, without a design. @param {object} [over] */
function plan(over = {}) {
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

/** A version-3 plan with a design as the earlier planner made it. */
function legacyPlan() {
  const factors = [
    { id: 1, name: 'Temp', unit: '°C', kind: 'continuous', levels: ['20', '60'] },
    { id: 2, name: 'Druck', unit: 'bar', kind: 'continuous', levels: ['1', '2'] },
  ];
  return {
    version: 3, doeName: 'Alt', designType: 'full', factors, responses: [{ name: 'Yield', unit: '%' }],
    options: { randomize: true, centerPoints: false, replicates: 1, alphaType: 'rotatable', ccdCenterPoints: 3,
      bbCenterPoints: 3, taguchiArray: '', optimalRuns: 0, optimalActiveTerms: null, forbiddenVertices: [] },
    selectedRes: null, selectedPBIdx: null,
    design: generateDesign(factors, { designType: 'full', randomize: true, replicates: 1, forbiddenVertices: [] }),
    previewEdits: null, previewDirty: false, worksheetRef: null, sourceWorksheet: null,
    evaluation: null, analysisResponseIdx: 0, fid: 2,
    projectMode: false, projectName: '', projectPhases: [], activePhaseIdx: -1,
  };
}

/**
 * The stand-in of the agent layer on a store: phases and module states.
 * @param {{ states: Record<string, any>, phases: Record<string, any[]>, bus: any }} store
 */
function agentLayer(store) {
  const stacks = [];
  let failOn = null;
  let counter = 0;
  /** @param {any} st @param {string} id */
  const column = (st, id) => {
    const c = st.columns.find((x) => x.id === id);
    if (!c) throw Object.assign(new Error(`unknown_column: ${id}`), { code: 'unknown_column' });
    return c;
  };
  async function interact(stack) {
    stacks.push(clone(stack));
    const states = clone(store.states);
    const phases = clone(store.phases);
    const byId = new Map();
    const results = [];
    const touched = new Set();
    const resolve = (v) => (v && typeof v === 'object' && '$from' in v
      ? v.path.split('.').reduce((o, k) => o?.[k], byId.get(v.$from)) : v);
    for (const action of stack) {
      if (failOn && failOn(action)) {
        results.push({ ok: false, id: action.id ?? null, error: 'unknown_column', message: 'unknown_column: x' });
        return { ok: false, error: 'stack_failed', results };
      }
      let result;
      if (action.op === 'module.add') {
        counter += 1;
        const instanceId = `${action.module === 'worksheet' ? 'ws' : 'reg'}-${counter}`;
        const list = phases[action.phase] ?? [];
        phases[action.phase] = [...list, { instanceId, moduleId: action.module, order: list.length }];
        states[instanceId] = action.module === 'worksheet' ? buildInitialWorksheetState('Sheet') : {};
        result = { instanceId, module: action.module, phase: action.phase };
      } else if (action.op === 'module.remove') {
        for (const p of Object.keys(phases)) phases[p] = phases[p].filter((i) => i.instanceId !== action.instance);
        delete states[action.instance];
        touched.add(action.instance);
        result = { instanceId: action.instance };
      } else {
        const target = resolve(action.instance);
        const [sheetId, ...rest] = action.args.map(resolve);
        let value = null;
        if (action.method !== 'importExperiment') {
          touched.add(target);
          const sh = states[target].sheets.find((s) => s.id === sheetId);
          if (!sh) throw new Error(`unknown_sheet: ${sheetId}`);
          sh.state = sh.state ?? { columns: [], rowCount: 0 };
          const st = sh.state;
          const pad = (c) => { while (c.values.length < st.rowCount) c.values.push(null); };
          switch (action.method) {
            case 'renameSheet': sh.name = rest[0]; break;
            case 'writeColumns': {
              const cols = rest[0];
              if (cols.some((c) => c.to === 'start')) st.columns = [];
              value = cols.map(({ to, ...c }) => {
                const next = { id: uid(), format: {}, meta: null, formulas: [], ...c, values: [...c.values] };
                st.columns.push(next);
                return next.id;
              });
              st.rowCount = Math.max(st.rowCount, ...st.columns.map((c) => c.values.length));
              st.columns.forEach(pad);
              break;
            }
            case 'setColumnRole': column(st, rest[0]).role = rest[1]; break;
            case 'setFormula': { const c = column(st, rest[0]); c.formulas[rest[1]] = rest[2]; break; }
            case 'setColumnMeta': column(st, rest[0]).meta = rest[1]; break;
            case 'addRows': st.rowCount += rest[0]; st.columns.forEach(pad); break;
            case 'setCells': { const c = column(st, rest[0]); rest[2].forEach((v, i) => { c.values[rest[1] + i] = v; }); break; }
            case 'renameColumn': column(st, rest[0]).name = rest[1]; break;
            case 'removeColumn': column(st, rest[0]); st.columns = st.columns.filter((c) => c.id !== rest[0]); break;
            default: throw new Error(`unexpected method ${action.method}`);
          }
        }
        result = { instanceId: target, method: action.method, value };
      }
      if (action.id) byId.set(action.id, result);
      results.push({ ok: true, id: action.id ?? null, result });
    }
    // Only the other instances: the planner's own state is saved by the module itself.
    for (const k of Object.keys(states)) if (k !== PLANNER) store.states[k] = states[k];
    for (const k of Object.keys(store.states)) if (!(k in states)) delete store.states[k];
    Object.assign(store.phases, phases);
    for (const id of touched) store.bus.emit('worksheet:dataChanged', { instanceId: id });
    store.bus.emit('module:added', { moduleId: 'worksheet', instanceId: 'any' });
    return { ok: true, results };
  }
  return { interact, stacks, fail(fn) { failOn = fn; } };
}

/**
 * Mounts the module. The store knows the phase `improve` with this planner.
 * @param {object|null} [model] stored state of the planner
 */
async function mount(model = null) {
  ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const handlers = [];
  const events = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { events.push([n, p]); for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  const store = {
    states: { [PLANNER]: model },
    phases: { improve: [{ instanceId: PLANNER, moduleId: ID, order: 0 }] },
    bus,
  };
  const layer = agentLayer(store);
  const notes = [];
  /** Instances as `ctx.instances.list` gives them; `hidden` leaves the planner out. */
  const listing = { hidden: false };
  const list = ({ modules } = {}) => Object.entries(store.phases)
    .flatMap(([phase, items]) => items.map((i) => ({ instanceId: i.instanceId, moduleId: i.moduleId, phase, title: '' })))
    .filter((i) => !modules || modules.includes(i.moduleId))
    .filter((i) => !(listing.hidden && i.instanceId === PLANNER));
  const context = {
    instances: { interact: layer.interact, list, read: async () => ({}) },
    instanceId: PLANNER,
    stateManager: {
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
    },
    i18n: { t: (k) => k, tf: () => tf, getLanguage: () => 'de' },
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
  await flush();
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  return {
    vm, notes, store, layer, events, listing,
    /** Runs of the command `regenerate` so far. */
    regenerates: () => events.filter(([n, p]) => n === 'command:executed' && p.command === 'regenerate').length,
    /** Starts a run and returns its outcome. */
    run: (name, args) => vm()._asyncTaskHost.start(name, args),
    /** Lets the automatic runs finish. */
    settle: async () => { await flush(); return vm()._asyncTaskHost.settle(5000); },
    /** The worksheet state of the bound datasheet. */
    sheet: () => {
      const ref = vm().model.worksheetRef;
      return store.states[ref.instanceId].sheets.find((s) => s.id === ref.sheetId).state;
    },
    /** Rebuilds the tree as a language switch does. */
    switchLanguage: async () => { mod.onLanguageChange(); await flush(); },
  };
}

/** Mounts `model` and lets the first design be made. */
async function ready(model) {
  const h = await mount(model);
  await h.settle();
  return h;
}

/** Mounted with a bound datasheet of the design. */
async function bound(model) {
  const h = await ready(model);
  const out = await h.run('createDatasheet');
  assertEqual(out.status, 'done', JSON.stringify(out));
  await h.settle();
  assertEqual(h.vm().staleness, 'bound');
  return h;
}

/** An optimal design of three factors. */
const optimalPlan = () => plan({
  designType: 'dopt',
  factors: [
    { id: 1, name: 'A', unit: '', kind: 'continuous', levels: ['0', '10'] },
    { id: 2, name: 'B', unit: '', kind: 'continuous', levels: ['0', '10'] },
    { id: 3, name: 'C', unit: '', kind: 'continuous', levels: ['0', '10'] },
  ],
  options: { ...new State().options, optimalRuns: 8 },
});

suite('doe-planner tasks: generate', () => {
  test('a factor change makes a design that fits the configuration', async () => {
    const h = await ready(plan());
    const vm = h.vm();
    assert(vm.model.design !== null, 'first design made');
    assertEqual(vm.pending, false);
    setFields(vm.model, { factors: [vm.model.factors[0], { ...vm.model.factors[1], levels: ['2', '8'] }] });
    assertEqual(vm.pending, true);
    await h.settle();
    assertEqual(vm.pending, false);
    assertEqual(vm.model.design.configSignature, configSignature(vm.model));
    assert(vm.model.design.actualMatrix.some((row) => row[1] === '8'), 'new level in the design');
  });

  test('mounting a migrated plan and switching the language regenerate nothing', async () => {
    const saved = legacyPlan();
    const h = await ready(saved);
    assertEqual(h.regenerates(), 0);
    assertEqual(h.vm().pending, false);
    assertDeepEqual(h.vm().model.design.codedMatrix, saved.design.codedMatrix);
    await h.switchLanguage();
    await h.settle();
    assertEqual(h.regenerates(), 0);
    assertDeepEqual(h.vm().model.design.codedMatrix, saved.design.codedMatrix);
  });
});

suite('doe-planner tasks: createDatasheet', () => {
  test('one stack: module.add, renameSheet, writeColumns, roles, formulas, metas last; the experiment follows', async () => {
    const h = await ready(plan({ options: { ...new State().options, replicates: 2 } }));
    const out = await h.run('createDatasheet');
    assertEqual(out.status, 'done', JSON.stringify(out));
    const stack = h.layer.stacks.at(-1);
    const kinds = stack.map((a) => (a.op === 'module.add' ? 'module.add' : a.method));
    assertDeepEqual(kinds.slice(0, 3), ['module.add', 'renameSheet', 'writeColumns']);
    const lastOf = (k) => kinds.lastIndexOf(k);
    const firstOf = (k) => kinds.indexOf(k);
    assert(firstOf('setColumnRole') > 2 && lastOf('setColumnRole') < firstOf('setFormula'), 'roles before formulas');
    assert(lastOf('setFormula') < firstOf('setColumnMeta'), 'formulas before metas');
    assertEqual(lastOf('setColumnMeta'), kinds.length - 1);
    const metas = stack.filter((a) => a.method === 'setColumnMeta').map((a) => a.args[2]);
    assert(metas.length > 0 && metas.every((m) => m.managedRef === `doe:${PLANNER}`), 'managedRef doe:<id>');
    const vm = h.vm();
    assertEqual(vm.model.worksheetRef.instanceId, out.value.instanceId);
    assertEqual(vm.model.worksheetRef.sheetId, out.value.sheetId);
    assertEqual(vm.staleness, 'bound');
    assert(vm.experiment !== null, 'experiment after the datasheet');
    assertEqual(vm.experiment.runMatrix.columnTags.factors.length, 2);
    assertEqual(vm.experiment.responseColumns[0].meanColumnId, vm.model.worksheetRef.meanColumnIds[0]);
  });

  test('a failing stack leaves worksheetRef unchanged and reports datasheetFailed', async () => {
    const h = await ready(plan());
    h.layer.fail((a) => a.method === 'setColumnMeta');
    const out = await h.run('createDatasheet');
    assertEqual(out.status, 'failed');
    assertEqual(h.vm().model.worksheetRef, null);
    assertDeepEqual(h.notes.at(-1), ['datasheetFailed', 'error']);
    assertEqual(Object.keys(h.store.states).length, 1);
  });

  test('a stale datasheet is removed first in the same stack', async () => {
    const h = await bound(plan());
    const old = h.vm().model.worksheetRef.instanceId;
    const vm = h.vm();
    setFields(vm.model, { factors: [vm.model.factors[0], { ...vm.model.factors[1], levels: ['2', '8'] }] });
    await h.settle();
    assertEqual(vm.staleness, 'stale');
    const out = await h.run('createDatasheet');
    assertEqual(out.status, 'done', JSON.stringify(out));
    assertDeepEqual(h.layer.stacks.at(-1)[0], { op: 'module.remove', instance: old });
    assertEqual(h.store.states[old], undefined);
    assertEqual(vm.staleness, 'bound');
  });
});

suite('doe-planner tasks: augment', () => {
  test('new runs: the design grows by runs, the snapshot keeps its replicate groups in step', async () => {
    const h = await bound(optimalPlan());
    const vm = h.vm();
    const n = vm.model.design.codedMatrix.length;
    const out = await h.run('augment', { runs: 3 });
    assertEqual(out.status, 'done', JSON.stringify(out));
    assertDeepEqual(out.value, { added: 3 });
    assertEqual(vm.model.design.codedMatrix.length, n + 3);
    assertEqual(h.sheet().rowCount, n + 3);
    assertDeepEqual(vm.model.worksheetRef.snapshot.replicateGroups, snapshotOf(vm.model, vm.model.design).replicateGroups);
    assertEqual(vm.staleness, 'bound');
    assertEqual(vm.pending, false);
    assertDeepEqual(h.notes.at(-1), [tf('augmentSuccess', { n: 3 }), 'success']);
  });

  test('a stack failing midway: nothing written, design and snapshot unchanged, augmentFailed', async () => {
    const h = await bound(optimalPlan());
    const vm = h.vm();
    const design = JSON.stringify(vm.model.design);
    const ref = JSON.stringify(vm.model.worksheetRef);
    const sheet = JSON.stringify(h.sheet());
    h.layer.fail((a) => a.method === 'setCells');
    const out = await h.run('augment', { runs: 2 });
    assertEqual(out.status, 'failed');
    assertEqual(JSON.stringify(vm.model.design), design);
    assertEqual(JSON.stringify(vm.model.worksheetRef), ref);
    assertEqual(JSON.stringify(h.sheet()), sheet);
    assertDeepEqual(h.notes.at(-1), ['augmentFailed', 'error']);
  });

  test('a factor column removed from the datasheet: no stack, augmentFailed', async () => {
    const h = await bound(optimalPlan());
    const vm = h.vm();
    const stacks = h.layer.stacks.length;
    const st = h.sheet();
    const gone = vm.model.worksheetRef.factorColumnIds[1];
    st.columns = st.columns.filter((c) => c.id !== gone);
    h.store.bus.emit('worksheet:dataChanged', { instanceId: vm.model.worksheetRef.instanceId });
    await flush();
    const ref = JSON.stringify(vm.model.worksheetRef);
    const out = await h.run('augment', { runs: 2 });
    assertEqual(out.status, 'failed');
    assertEqual(h.layer.stacks.length, stacks);
    assertEqual(JSON.stringify(vm.model.worksheetRef), ref);
    assertDeepEqual(h.notes.at(-1), ['augmentFailed', 'error']);
  });

  test('augment right after a rename: the rename is carried over first, the new runs stay bound', async () => {
    const h = await bound(optimalPlan());
    const vm = h.vm();
    const n = vm.model.design.codedMatrix.length;
    setFields(vm.model, { responses: [{ name: 'Ausbeute', unit: '%' }] });
    const out = await h.run('augment', { runs: 2 });
    assertEqual(out.status, 'done', JSON.stringify(out));
    await h.settle();
    assertEqual(vm.model.design.codedMatrix.length, n + 2);
    assertEqual(vm.staleness, 'bound');
    assertDeepEqual(vm.model.worksheetRef.snapshot.replicateGroups, snapshotOf(vm.model, vm.model.design).replicateGroups);
    assertEqual(vm.experiment.responseColumns[0].name, 'Ausbeute');
    const kinds = h.layer.stacks.slice(-2).map((st) => st.some((a) => a.method === 'addRows') ? 'augment' : st[0].method);
    assertDeepEqual(kinds, ['renameColumn', 'augment']);
  });

  test('blocked without an optimal design', async () => {
    const h = await bound(plan());
    const out = await h.run('augment', { runs: 2 });
    assertEqual(out.status, 'rejected');
    assertEqual(out.reason, 'needsOptimal');
  });
});

suite('doe-planner tasks: syncResponses', () => {
  test('renaming in a current datasheet: one renameColumn, the experiment follows', async () => {
    const h = await bound(plan());
    const vm = h.vm();
    const stacks = h.layer.stacks.length;
    setFields(vm.model, { responses: [{ name: 'Ausbeute', unit: '%' }] });
    await h.settle();
    assertEqual(h.layer.stacks.length, stacks + 1);
    const stack = h.layer.stacks.at(-1);
    assertDeepEqual(stack.map((a) => a.method), ['renameColumn']);
    assertEqual(stack[0].args[2], 'Ausbeute');
    assertEqual(vm.staleness, 'bound');
    assertEqual(vm.experiment.responseColumns[0].name, 'Ausbeute');
    const col = h.sheet().columns.find((c) => c.id === vm.model.worksheetRef.responseColumnIds[0]);
    assertEqual(col.name, 'Ausbeute');
  });

  test('adding a response appends its column and binds it', async () => {
    const h = await bound(plan());
    const vm = h.vm();
    setFields(vm.model, { responses: [...vm.model.responses, { name: 'Kosten', unit: 'EUR' }] });
    await h.settle();
    const ids = vm.model.worksheetRef.responseColumnIds;
    assertEqual(ids.length, 2);
    const col = h.sheet().columns.find((c) => c.id === ids[1]);
    assertEqual(col.name, 'Kosten');
    assertDeepEqual(vm.model.worksheetRef.meanColumnIds, []);
    assertEqual(vm.experiment.responseColumns[1].columnId, ids[1]);
  });

  test('a failing stack: syncFailed, sheet and snapshot unchanged', async () => {
    const h = await bound(plan());
    const vm = h.vm();
    const snapshot = JSON.stringify(vm.model.worksheetRef.snapshot);
    h.layer.fail((a) => a.method === 'renameColumn');
    setFields(vm.model, { responses: [{ name: 'Ausbeute', unit: '%' }] });
    await h.settle();
    assertDeepEqual(h.notes.at(-1), ['syncFailed', 'error']);
    assertEqual(JSON.stringify(vm.model.worksheetRef.snapshot), snapshot);
    assertEqual(h.sheet().columns.find((c) => c.id === vm.model.worksheetRef.responseColumnIds[0]).name, 'Yield');
  });

  test('a change that cannot be carried over: syncSkipped once per diverging state, no stack', async () => {
    const h = await bound(plan());
    const vm = h.vm();
    const stacks = h.layer.stacks.length;
    const skips = () => h.notes.filter(([msg]) => msg === 'syncSkipped').length;
    setFields(vm.model, { responses: [...vm.model.responses, { name: 'B', unit: '' }, { name: 'C', unit: '' }] });
    await h.settle();
    assertEqual(skips(), 1);
    assertDeepEqual(h.notes.at(-1), ['syncSkipped', 'warning']);
    // The run starts again on a change of the sheet; the same state is not reported again.
    h.store.bus.emit('worksheet:dataChanged', { instanceId: vm.model.worksheetRef.instanceId });
    await h.settle();
    assertEqual(skips(), 1);
    assertEqual(h.layer.stacks.length, stacks);
    setFields(vm.model, { responses: [...vm.model.responses, { name: 'D', unit: '' }] });
    await h.settle();
    assertEqual(skips(), 2);
  });

  test('renaming while the datasheet is stale: no stack, snapshot unchanged', async () => {
    const h = await bound(plan());
    const vm = h.vm();
    setFields(vm.model, { factors: [vm.model.factors[0], { ...vm.model.factors[1], levels: ['2', '8'] }] });
    await h.settle();
    assertEqual(vm.staleness, 'stale');
    const stacks = h.layer.stacks.length;
    const snapshot = JSON.stringify(vm.model.worksheetRef.snapshot);
    setFields(vm.model, { responses: [{ name: 'Ausbeute', unit: '%' }] });
    await h.settle();
    assertEqual(h.layer.stacks.length, stacks);
    assertEqual(JSON.stringify(vm.model.worksheetRef.snapshot), snapshot);
  });
});

suite('doe-planner tasks: transferToRegression', () => {
  test('the stack adds a regression in the planner phase and imports <id>|raw|<response>', async () => {
    const h = await bound(plan({ responses: [{ name: 'Yield', unit: '%' }, { name: 'Kosten', unit: '' }] }));
    const out = await h.run('transferToRegression', { response: 1 });
    assertEqual(out.status, 'done', JSON.stringify(out));
    const stack = h.layer.stacks.at(-1);
    assertDeepEqual(stack[0], { op: 'module.add', id: 'reg', module: 'regression', phase: 'improve' });
    assertDeepEqual(stack[1], {
      op: 'instance.call', module: 'regression', instance: { $from: 'reg', path: 'instanceId' },
      method: 'importExperiment', args: [`${PLANNER}|raw|1`],
    });
    assertEqual(out.value.instanceId, h.store.phases.improve.at(-1).instanceId);
  });

  test('a response outside the responses is rejected, nothing sent', async () => {
    const h = await bound(plan());
    const stacks = h.layer.stacks.length;
    const out = await h.run('transferToRegression', { response: 3 });
    assertEqual(out.status, 'rejected');
    assert(/response/.test(out.reason), out.reason);
    assertEqual(h.layer.stacks.length, stacks);
  });

  test('a planner in no phase: transferFailed, nothing sent', async () => {
    const h = await bound(plan());
    const stacks = h.layer.stacks.length;
    h.listing.hidden = true;
    const out = await h.run('transferToRegression', { response: 0 });
    assertEqual(out.status, 'failed');
    assertDeepEqual(h.notes.at(-1), ['transferFailed', 'error']);
    assertEqual(h.layer.stacks.length, stacks);
  });

  test('without a datasheet the run is blocked', async () => {
    const h = await ready(plan());
    const out = await h.run('transferToRegression', { response: 0 });
    assertEqual(out.status, 'rejected');
    assertEqual(out.reason, 'needsDatasheet');
  });
});
