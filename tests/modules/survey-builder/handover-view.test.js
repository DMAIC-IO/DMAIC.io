/**
 * Survey builder: the hand-overs of the results tab in the browser — to a
 * worksheet, to the VoC tree and to Kano — with the real module and the real
 * template. `instances` is a stand-in of the core service: it lists what the
 * test puts in, records every `read` and every stack in order and answers
 * the stacks as given (a Kano read stack with the given Kano state, a write
 * stack with results or a failure). Nothing is applied: what the survey
 * remembers it may only remember through the stack.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { mount, settle, until, pick, de, INSTANCE } from './view-harness.js';
import { MIXED, copy, load } from './cases.js';
import { createInstances } from '../../../js/core/instances.js';
import mod from '../../../js/modules/survey-builder/viewmodel/viewmodel.js';
import { worksheetColumnsFor } from '../../../js/modules/survey-builder/domain/handover/worksheet.js';
import { NO_SOURCE } from '../../../js/core/source-reader.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** MIXED on the results tab, without filter and grouping. @returns {any} */
function mixed() {
  const json = copy(MIXED);
  json.ui = { ...json.ui, tab: 'results', filter: null, groupBy: null };
  return json;
}

/** What Kano reads: an own entry of q4 from the earlier hand-over, one of another survey, one made by hand. */
const KANO_READ = Object.freeze({
  items: [
    { id: 'it-own', nodeId: null, label: 'Chat', path: '', missing: false },
    { id: 'it-other', nodeId: null, label: 'Fremd', path: '', missing: false },
    { id: 'it-hand', nodeId: null, label: 'Von Hand', path: '', missing: false },
  ],
  respondents: [
    { id: 'rs-own', name: 'Anna' },
    { id: 'rs-other', name: 'Xaver' },
  ],
  options: { importance: true },
  source: { instanceId: null, level: 'need' },
});

/** MIXED on the results tab with the references of the earlier hand-over of q4 to kano-1. @returns {any} */
function remembered() {
  const state = load(mixed()).toJSON();
  state.transfers.kano.q4 = { instanceId: 'kano-1', byInstance: { 'kano-1': { itemIds: ['it-own'], respondentIds: ['rs-own'] } } };
  return state;
}

/**
 * The stand-in of the instances service.
 * @param {{ kano?: any[], trees?: any[], surveys?: any[], reads?: Record<string, any>, readErrors?: Record<string, Error>,
 *   kanoRead?: any, failWrite?: boolean }} [opts] `readErrors`: what `read` of an instance throws
 */
function fakeInstances({ kano = [], trees = [], surveys = [{ instanceId: INSTANCE, phase: 'define' }], reads = {}, readErrors = {}, kanoRead = KANO_READ, failWrite = false } = {}) {
  /** @type {any[]} */
  const log = [];
  /** @type {Record<string, any[]>} */
  const lists = { kano, 'voc-ctx-tree': trees, 'survey-builder': surveys };
  /** @type {{ onReadStack: null|(() => void) }} */
  const hooks = { onReadStack: null };
  /** @param {any} a @param {number} i @returns {any} */
  const resultOf = (a, i) => {
    if (a.op === 'module.add') return { instanceId: `${a.module}-new`, module: a.module, phase: a.phase };
    const instanceId = typeof a.instance === 'string' ? a.instance : `${a.module}-new`;
    const value = a.id === 'write' ? a.args[0].columns.map((/** @type {any} */ _c, /** @type {number} */ j) => `col-${j}`) : `v${i}`;
    return { instanceId, method: a.method, value };
  };
  return {
    log,
    lists,
    hooks,
    /** @returns {any[][]} the stacks so far */
    stacks: () => log.filter((e) => e[0] === 'interact').map((e) => e[1]),
    /** @param {{ modules?: string[] }} [o] */
    list: ({ modules = Object.keys(lists) } = {}) => modules.flatMap((m) => (lists[m] ?? []).map((i) => ({ moduleId: m, title: '', phase: 'define', ...i }))),
    /** @param {string} id @param {any} opts */
    read: async (id, opts) => {
      log.push(['read', id, copy(opts)]);
      await flush();
      if (readErrors[id]) throw readErrors[id];
      if (!(id in reads)) throw Object.assign(new Error('unknown_instance'), { code: 'unknown_instance' });
      return copy(reads[id]);
    },
    /** @param {any[]} stack */
    interact: async (stack) => {
      log.push(['interact', copy(stack)]);
      await flush();
      if (stack.length === 1 && stack[0].method === 'read') {
        hooks.onReadStack?.();
        return { ok: true, results: [{ ok: true, id: null, result: { instanceId: stack[0].instance, method: 'read', value: copy(kanoRead) } }] };
      }
      if (failWrite) {
        return { ok: false, results: [{ ok: false, id: null, error: 'call_failed', message: 'unknown item it-own' }], rolledBack: true };
      }
      return { ok: true, results: stack.map((a, i) => ({ ok: true, id: a.id ?? null, result: resultOf(a, i) })) };
    },
  };
}

/** @param {any} h mounted module @param {string} name @param {object} args */
const start = (h, name, args) => h.vm()._asyncTaskHost.start(name, args);

/** @param {any} h @returns {any} the model as stored */
const json = (h) => JSON.parse(JSON.stringify(h.vm().model.toJSON()));

suite('survey-builder handover: worksheet', () => {
  test('toWorksheet sends the worksheetWrite plan with the roles and returns the instance', async () => {
    const fake = fakeInstances();
    const h = await mount(mixed(), { instances: fake });
    const out = await start(h, 'toWorksheet', {});
    assertDeepEqual(out, { status: 'done', value: { instanceId: 'worksheet-new' } });
    const stacks = fake.stacks();
    assertEqual(stacks.length, 1, 'one stack');
    const stack = stacks[0];
    assertDeepEqual(stack[0], { op: 'module.add', id: 'ws', module: 'worksheet', phase: 'define' });
    const rename = stack.find((/** @type {any} */ a) => a.method === 'renameSheet');
    assertDeepEqual(rename.args, [{ id: 'sheet_1', name: 'Befragung' }]);
    const write = stack.find((/** @type {any} */ a) => a.method === 'writeColumns');
    const strings = Object.fromEntries(['responseId', 'submittedAt', 'recipient', 'other', 'functional', 'dysfunctional', 'importance', 'category', 'question']
      .map((k) => [k, de(`ws.${k}`)]));
    const columns = worksheetColumnsFor(json(h), strings);
    assertDeepEqual(write.args[0].columns.map((/** @type {any} */ c) => [c.name, c.type, c.values]), columns.map((c) => [c.name, c.type, c.values]));
    const roles = stack.filter((/** @type {any} */ a) => a.method === 'setColumnRole').map((/** @type {any} */ a) => a.args[0].role);
    assertDeepEqual(roles, columns.map((c) => c.role), 'the confirmed role of every column');
    assertTrue(h.notes.some(([m, t]) => m === de('worksheetCreated', { name: 'Befragung' }) && t === 'success'), 'reported with the sheet name');
  });

  test('the button starts toWorksheet', async () => {
    const fake = fakeInstances();
    const h = await mount(mixed(), { instances: fake });
    const btn = /** @type {HTMLButtonElement} */ (h.$('[data-ref="toWorksheet"]'));
    assert(btn, 'button present');
    btn.click();
    await until(() => fake.stacks().length === 1);
    assertEqual(fake.stacks().length, 1);
  });

  test('a failed stack reports handoverFailed once and is warned once', async () => {
    const fake = fakeInstances({ failWrite: true });
    const h = await mount(mixed(), { instances: fake });
    const warned = [];
    const warn = console.warn;
    console.warn = (...args) => { warned.push(args); };
    let out;
    try {
      out = await start(h, 'toWorksheet', {});
    } finally {
      console.warn = warn;
    }
    assertEqual(out.status, 'failed');
    assertEqual(warned.length, 1, `one warning: ${JSON.stringify(warned.map((w) => String(w[0])))}`);
    assertEqual(h.notes.filter(([m, t]) => m === de('handoverFailed') && t === 'error').length, 1);
  });
});

suite('survey-builder handover: VoC tree', () => {
  test('an unknown key is turned down before any stack', async () => {
    const fake = fakeInstances({ trees: [{ instanceId: 'tree-1', phase: 'define' }] });
    const h = await mount(mixed(), { instances: fake });
    const out = await start(h, 'takeToVocTree', { keys: ['resp-a:nope'] });
    assertEqual(out.status, 'failed');
    assertTrue(out.error.message.includes('keys[0]'), `names keys[0]: ${out.error.message}`);
    assertEqual(fake.log.length, 0, 'nothing sent');
  });

  test('the ticked answers go to the first tree; the selection empties; the mark only through the stack', async () => {
    const fake = fakeInstances({ trees: [{ instanceId: 'tree-1', phase: 'define' }, { instanceId: 'tree-2', phase: 'define' }] });
    const h = await mount(mixed(), { instances: fake });
    const before = json(h).transfers;
    const box = /** @type {HTMLInputElement} */ (h.$('[data-answer-key="resp-c:q2:other"] [data-ref="vocCheck"]'));
    assert(box, 'checkbox at the „Sonstiges“ answer');
    box.click();
    await settle();
    assertDeepEqual(h.vm().state.vocSelected, ['resp-c:q2:other']);
    const btn = /** @type {HTMLButtonElement} */ (h.$('[data-ref="takeToVoc"]'));
    assertEqual(btn.disabled, false, 'enabled with a selection');
    btn.click();
    await until(() => h.vm().state.vocSelected.length === 0);
    const stacks = fake.stacks();
    assertEqual(stacks.length, 1);
    assertDeepEqual(stacks[0], [
      { op: 'instance.call', module: 'voc-ctx-tree', instance: 'tree-1', method: 'addVoc', args: [{ text: 'Brief', source: de('vocSource', { title: 'Befragung' }) }] },
      { op: 'instance.call', module: 'survey-builder', instance: INSTANCE, method: 'markVocTaken', args: [{ keys: ['resp-c:q2:other'] }] },
    ]);
    assertDeepEqual(h.vm().state.vocSelected, []);
    assertDeepEqual(json(h).transfers, before, 'the own model is written only by the stack');
    assertTrue(h.notes.some(([m, t]) => m === de('vocTaken', { count: 1 }) && t === 'success'));
  });

  test('without a tree the stack adds one; the result names it', async () => {
    const fake = fakeInstances();
    const h = await mount(mixed(), { instances: fake });
    const out = await start(h, 'takeToVocTree', { keys: ['resp-a:q5'] });
    assertDeepEqual(out, { status: 'done', value: { taken: 1, instanceId: 'voc-ctx-tree-new' } });
    const stack = fake.stacks()[0];
    assertDeepEqual(stack[0], { op: 'module.add', id: 'tree', module: 'voc-ctx-tree' });
    assertDeepEqual(stack[1].args, [{ text: 'Schneller bitte', source: `${de('vocSource', { title: 'Befragung' })}, Anna` }]);
  });

  test('a taken answer shows its mark', async () => {
    const h = await mount(mixed(), { instances: fakeInstances() });
    const mark = /** @type {HTMLElement} */ (h.$('[data-answer-key="resp-a:q5"] [data-ref="vocTaken"]'));
    assert(mark, 'mark present');
    assert(mark.style.display !== 'none', 'shown for a taken answer');
    const other = /** @type {HTMLElement} */ (h.$('[data-answer-key="resp-c:q2:other"] [data-ref="vocTaken"]'));
    assertEqual(other.style.display, 'none', 'hidden for an answer not taken');
  });
});

suite('survey-builder handover: Kano', () => {
  test('reads Kano, then writes; the other surveys are not read', async () => {
    const fake = fakeInstances({
      kano: [{ instanceId: 'kano-1', phase: 'measure' }],
      surveys: [{ instanceId: INSTANCE, phase: 'define' }, { instanceId: 'sb-2', phase: 'measure' }],
    });
    const h = await mount(remembered(), { instances: fake });
    const before = json(h).transfers;
    const out = await start(h, 'handOverToKano', { questionId: 'q4' });
    assertDeepEqual(out, { status: 'done', value: { instanceId: 'kano-1' } });
    assertDeepEqual(fake.log.map((e) => (e[0] === 'read' ? `read ${e[1]}` : `interact ${e[1].length === 1 && e[1][0].method === 'read' ? 'read' : 'write'}`)),
      ['interact read', 'interact write']);
    assertDeepEqual(fake.log[0][1], [{
      op: 'instance.call', module: 'kano', instance: 'kano-1', method: 'read', args: [{ fields: ['items', 'respondents', 'options', 'source'] }],
    }]);
    const write = fake.log[1][1];
    assertEqual(write[0].module, 'kano', 'no backups before the Kano steps');
    assertTrue(write.some((/** @type {any} */ a) => a.method === 'removeItem' && a.args[0].id === 'it-own'), 'own item replaced');
    assertTrue(write.some((/** @type {any} */ a) => a.method === 'removeRespondent' && a.args[0].id === 'rs-own'), 'own respondent replaced');
    assertTrue(!write.some((/** @type {any} */ a) => a.method === 'removeItem' && a.args[0].id !== 'it-own'), 'foreign items stay');
    assertTrue(write.filter((/** @type {any} */ a) => a.module === 'kano').every((/** @type {any} */ a) => a.op !== 'instance.call'
      || (a.args.length === 1 && typeof a.args[0] === 'object')), 'one object argument per Kano command');
    const [transfer, target] = write.slice(-2);
    assertEqual(transfer.method, 'setKanoTransfer');
    assertEqual(transfer.instance, INSTANCE);
    assertEqual(transfer.args[0].instanceId, 'kano-1');
    assertDeepEqual(target, { op: 'instance.call', module: 'survey-builder', instance: INSTANCE, method: 'setKanoTarget',
      args: [{ questionId: 'q4', instanceId: 'kano-1' }] });
    assertDeepEqual(json(h).transfers, before, 'the own model is written only by the stack');
    assertTrue(h.notes.some(([m, t]) => m === de('kanoHandedOver') && t === 'success'));
  });

  test('the references for the target are the own entries; those for another instance are not', async () => {
    const state = load(mixed()).toJSON();
    state.transfers.kano.q4 = { instanceId: 'kano-1', byInstance: {
      'kano-1': { itemIds: ['it-hand'], respondentIds: [] },
      'kano-2': { itemIds: ['it-own'], respondentIds: ['rs-own'] },
    } };
    const fake = fakeInstances({ kano: [{ instanceId: 'kano-1', phase: 'define' }, { instanceId: 'kano-2', phase: 'define' }] });
    const h = await mount(state, { instances: fake });
    const out = await start(h, 'handOverToKano', { questionId: 'q4' });
    assertEqual(out.status, 'done');
    const write = fake.stacks()[1];
    assertDeepEqual(write.filter((/** @type {any} */ a) => a.method === 'removeItem').map((/** @type {any} */ a) => a.args[0].id), ['it-hand']);
    assertTrue(!write.some((/** @type {any} */ a) => a.method === 'removeRespondent'), 'no respondent of its own here');
    assertEqual(write[0].module, 'kano', 'the stack starts at Kano');
  });

  test('a remembered instance that was deleted: a new one is added, setSourceTree without a tree first', async () => {
    const fake = fakeInstances({ kano: [] });
    const h = await mount(mixed(), { instances: fake });
    assertEqual(json(h).transfers.kano.q4.instanceId, 'kano-1', 'remembered');
    const out = await start(h, 'handOverToKano', { questionId: 'q4' });
    assertDeepEqual(out, { status: 'done', value: { instanceId: 'kano-new' } });
    assertEqual(fake.log.filter((e) => e[0] === 'read').length, 0, 'nothing to read');
    const stacks = fake.stacks();
    assertEqual(stacks.length, 1, 'only the write stack');
    const stack = stacks[0];
    assertDeepEqual(stack[0], { op: 'module.add', id: 'kano', module: 'kano', phase: 'define' });
    assertDeepEqual(stack[1], { op: 'instance.call', module: 'kano', instance: { $from: 'kano', path: 'instanceId' }, method: 'setSourceTree', args: [{ instanceId: null }] });
    assertDeepEqual(stack[2], { op: 'instance.set', module: 'kano', instance: { $from: 'kano', path: 'instanceId' }, values: { options: { importance: true } } });
    const [transfer, target] = stack.slice(-2);
    assertDeepEqual(transfer.args[0].instanceId, { $from: 'kano', path: 'instanceId' }, 'the references are for the new instance');
    assertEqual(target.method, 'setKanoTarget');
    assertDeepEqual(target.args[0], { questionId: 'q4', instanceId: { $from: 'kano', path: 'instanceId' } }, 'the target points at the new instance');
  });

  test('a stack that fails: handoverFailed, own model unchanged', async () => {
    const fake = fakeInstances({ kano: [{ instanceId: 'kano-1', phase: 'define' }], failWrite: true });
    const h = await mount(mixed(), { instances: fake });
    const before = json(h);
    const out = await start(h, 'handOverToKano', { questionId: 'q4' });
    assertEqual(out.status, 'failed');
    assertEqual(h.notes.filter(([m, t]) => m === de('handoverFailed') && t === 'error').length, 1, 'reported once');
    assertTrue(!h.notes.some(([m]) => m === de('kanoHandedOver')), 'no success');
    assertDeepEqual(json(h), before);
  });

  test('the view torn down between reading and writing: the write stack still goes, with setKanoTransfer', async () => {
    const fake = fakeInstances({ kano: [{ instanceId: 'kano-1', phase: 'define' }] });
    const h = await mount(mixed(), { instances: fake });
    fake.hooks.onReadStack = () => h.destroy();
    const out = await start(h, 'handOverToKano', { questionId: 'q4' });
    assertEqual(out.status, 'cancelled', 'the run of the torn-down view is cancelled');
    await until(() => fake.stacks().length === 2);
    const write = fake.stacks()[1];
    assert(write, 'write stack sent');
    const [transfer, target] = write.slice(-2);
    assertEqual(transfer.method, 'setKanoTransfer');
    assertEqual(transfer.instance, INSTANCE);
    assertEqual(target.method, 'setKanoTarget');
    await until(() => h.notes.some(([m]) => m === de('kanoHandedOver')));
    assertTrue(h.notes.some(([m, t]) => m === de('kanoHandedOver') && t === 'success'), 'still reported');
  });

  test('a torn-down view whose write fails still reports handoverFailed once', async () => {
    const fake = fakeInstances({ kano: [{ instanceId: 'kano-1', phase: 'define' }], failWrite: true });
    const h = await mount(mixed(), { instances: fake });
    fake.hooks.onReadStack = () => h.destroy();
    await start(h, 'handOverToKano', { questionId: 'q4' });
    await until(() => h.notes.some(([m]) => m === de('handoverFailed')));
    await settle();
    assertEqual(h.notes.filter(([m, t]) => m === de('handoverFailed') && t === 'error').length, 1);
  });

  test('a stack builder that throws after the Kano read (view torn down): handoverFailed once, cause warned, nothing written', async () => {
    const fake = fakeInstances({ kano: [{ instanceId: 'kano-1', phase: 'define' }], kanoRead: { ...KANO_READ, items: [null] } });
    const h = await mount(mixed(), { instances: fake });
    const warned = [];
    const warn = console.warn;
    console.warn = (...args) => { warned.push(args); };
    try {
      fake.hooks.onReadStack = () => h.destroy();
      await start(h, 'handOverToKano', { questionId: 'q4' });
      await until(() => h.notes.some(([m]) => m === de('handoverFailed')));
      await settle();
    } finally {
      console.warn = warn;
    }
    assertEqual(h.notes.filter(([m, t]) => m === de('handoverFailed') && t === 'error').length, 1, 'reported once');
    assertTrue(warned.some((w) => String(w[0]).includes('handOverToKano failed') && w[1] instanceof Error), 'the cause is warned');
    assertEqual(fake.stacks().length, 1, 'only the read stack, no write stack');
  });

  test('the button hands the question over and renews the target list', async () => {
    const fake = fakeInstances({ kano: [{ instanceId: 'kano-1', phase: 'define' }] });
    const h = await mount(mixed(), { instances: fake });
    const rev = h.vm().state.kanoRev;
    const btn = /** @type {HTMLButtonElement} */ (h.$('[data-action="handOverKano"]'));
    assert(btn, 'button present');
    btn.click();
    await until(() => h.vm().state.kanoRev > rev);
    assertEqual(fake.stacks().length, 2);
    assertTrue(h.vm().state.kanoRev > rev, 'kanoRev counted up');
  });
});

suite('survey-builder handover: Kano target list', () => {
  /** @param {any} h @returns {string[][]} value and label of each option */
  const options = (h) => [...h.$('[data-ref="kanoTarget"]').options].map((/** @type {HTMLOptionElement} */ o) => [o.value, o.textContent.trim()]);

  test('a Kano instance added elsewhere shows up without further ado', async () => {
    const fake = fakeInstances({ kano: [] });
    const h = await mount(mixed(), { instances: fake });
    assertDeepEqual(options(h), [['', de('kanoNew')]]);
    fake.lists.kano.push({ instanceId: 'kano-7', phase: 'define' });
    h.bus.emit('module:added', { moduleId: 'kano', phase: 'define', instanceId: 'kano-7' });
    await settle();
    assertDeepEqual(options(h), [['', de('kanoNew')], ['kano-7', de('kanoExisting', { n: 1 })]]);
  });

  test('a deleted remembered instance leaves the list at once; the select falls back to „new“', async () => {
    const fake = fakeInstances({ kano: [{ instanceId: 'kano-1', phase: 'define' }] });
    const h = await mount(mixed(), { instances: fake });
    const select = /** @type {HTMLSelectElement} */ (h.$('[data-ref="kanoTarget"]'));
    assertEqual(select.value, 'kano-1', 'the remembered target is chosen');
    fake.lists.kano.length = 0;
    h.bus.emit('module:removed', { moduleId: 'kano', phase: 'define', instanceId: 'kano-1' });
    await settle();
    assertDeepEqual(options(h), [['', de('kanoNew')]]);
    assertEqual(select.value, '');
  });

  test('choosing a target runs setKanoTarget', async () => {
    const fake = fakeInstances({ kano: [{ instanceId: 'kano-1', phase: 'define' }, { instanceId: 'kano-2', phase: 'define' }] });
    const h = await mount(mixed(), { instances: fake });
    pick(h.$('[data-ref="kanoTarget"]'), 'kano-2');
    await settle();
    assertDeepEqual(h.calls('setKanoTarget'), [{ questionId: 'q4', instanceId: 'kano-2' }]);
    pick(h.$('[data-ref="kanoTarget"]'), '');
    await settle();
    assertDeepEqual(h.calls('setKanoTarget')[1], { questionId: 'q4', instanceId: null });
  });

  test('after destroy no listener is left on the bus', async () => {
    const h = await mount(mixed(), { instances: fakeInstances() });
    assertTrue(h.listeners('module:added') > 0 && h.listeners('module:removed') > 0, 'listening while mounted');
    h.destroy();
    assertEqual(h.listeners('module:added'), 0);
    assertEqual(h.listeners('module:removed'), 0);
  });
});

suite('survey-builder handover: reading another survey', () => {
  test('read of a survey that is not mounted and stored in the earlier form gives the new form', async () => {
    const saved = copy(MIXED);
    assertEqual(saved.transfers.kano.q4, 'kano-1', 'the earlier text form');
    const cache = new Map([['sb-2', saved]]);
    const stateManager = {
      get: (/** @type {string} */ path) => (path === 'phases' ? { define: [{ instanceId: 'sb-2', moduleId: 'survey-builder', order: 0 }] } : undefined),
      getProjectCycle: () => 'dmaic',
      getModuleState: (/** @type {string} */ id) => cache.get(id) ?? null,
      setModuleState: (/** @type {string} */ id, /** @type {any} */ state) => { cache.set(id, copy(state)); },
      isCompleted: () => false,
    };
    const svc = createInstances({
      stateManager,
      moduleRegistry: { loadModule: async () => mod },
      workspace: { getLiveViewmodel: () => null, isPending: () => false, whenInstanceReady: async () => null },
      eventBus: { emit: () => {}, on: () => {}, off: () => {} },
      createSource: () => NO_SOURCE,
    });
    const r = /** @type {any} */ (await svc.read('sb-2', { fields: ['transfers', 'survey'] }));
    assertDeepEqual(r.transfers.kano, { q4: { instanceId: 'kano-1', byInstance: {} } });
    assertEqual(r.survey.sections[1].questions[1].type, 'kano');
  });
});
