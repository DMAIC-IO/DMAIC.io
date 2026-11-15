/**
 * Tests for js/modules/survey-builder/domain/handover/{worksheet,voc,kano}.js —
 * the stacks the hand-overs send to the worksheet, the VoC tree and Kano.
 *
 * The Kano stacks run through a small interpreter that applies the steps to
 * a copy of what Kano reads, with the semantics of the kano actions
 * (`setItems` keeps only `id, nodeId, label, path, missing`, `removeItem`
 * takes the answers on the item along, `addRespondent` makes the first
 * respondent active, `setAnswer` creates the cell). The result is compared
 * with what the earlier hand-over wrote (`kanoStateFromSurvey`, frozen in
 * fixtures/legacy-oracles.json) up to ids, the `origin` marks of what was
 * handed over and `activeRespondentId`.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../../test-utils.js';
import { worksheetColumnsFor } from '../../../js/modules/survey-builder/domain/handover/worksheet.js';
import { vocStack, openTexts } from '../../../js/modules/survey-builder/domain/handover/voc.js';
import { kanoOwnEntries, kanoBackups, kanoStack } from '../../../js/modules/survey-builder/domain/handover/kano.js';
import { worksheetColumns } from '../../../js/modules/survey-builder/domain/stats.js';
import { treePhaseForCycle } from '../../../js/modules/voc-ctx-tree/voc-ctx-tree-phase.js';
import { defaultPhaseFor } from '../../../js/core/router/instance-ops.js';
import { CYCLES } from '../../../js/core/cycles/cycles.js';
import { MODULES } from '../../../js/modules/catalog.generated.js';
import { MIXED, copy, load, frozen } from './cases.js';

// ── Interpreter ─────────────────────────────────────────────────────────

const ITEM_FIELDS = ['id', 'nodeId', 'label', 'path', 'missing'];
let seq = 0;
const freshId = (prefix) => `${prefix}-${++seq}`;

/** A new kano instance as `module.add` leaves it. @returns {any} */
const emptyKano = () => ({
  source: { instanceId: null, level: 'need' }, options: { importance: true },
  items: [], respondents: [], answers: {}, activeRespondentId: null,
});

/**
 * @param {any} v
 * @param {Map<string, any>} results
 * @returns {any} v with every `{ $from, path }` replaced by the value it names
 */
function resolve(v, results) {
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.$from === 'string' && typeof v.path === 'string') {
    if (!results.has(v.$from)) throw new Error(`forward or unknown ref ${v.$from}`);
    return v.path.split('.').reduce((o, k) => o?.[k], results.get(v.$from));
  }
  if (Array.isArray(v)) return v.map((x) => resolve(x, results));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, results)]));
  return v;
}

/** @param {string} name @param {any} id @param {string[]} known */
function requireKnown(name, id, known) {
  if (!known.includes(id)) throw new Error(`unknown ${name} ${JSON.stringify(id)}`);
}

const KANO = {
  setSourceTree(s, id) { s.source.instanceId = id; },
  setImportance(s, on) { if (typeof on !== 'boolean') throw new Error('enabled'); s.options.importance = on; },
  removeRespondent(s, id) {
    requireKnown('respondent', id, s.respondents.map((r) => r.id));
    s.respondents = s.respondents.filter((r) => r.id !== id);
    delete s.answers[id];
    if (s.activeRespondentId === id) s.activeRespondentId = s.respondents[0]?.id ?? null;
  },
  removeItem(s, id) {
    requireKnown('item', id, s.items.map((i) => i.id));
    s.items = s.items.filter((i) => i.id !== id);
    for (const byItem of Object.values(s.answers)) delete byItem[id];
  },
  setItems(s, items) {
    const seen = new Set();
    s.items = items.map((raw) => {
      for (const k of Object.keys(raw)) if (!ITEM_FIELDS.includes(k)) throw new Error(`invalid item field ${k}`);
      if (typeof raw.id !== 'string' || !raw.id || seen.has(raw.id)) throw new Error('invalid item id');
      seen.add(raw.id);
      return { id: raw.id, nodeId: raw.nodeId ?? null, label: raw.label ?? '', path: raw.path ?? '', missing: raw.missing ?? false };
    });
    return s.items.length;
  },
  addRespondent(s, name) {
    if (typeof name !== 'string' || !name.trim()) throw new Error('the stack names every respondent');
    const id = freshId('resp');
    s.respondents.push({ id, name: name.trim() });
    if (!s.activeRespondentId) s.activeRespondentId = id;
    return id;
  },
  setAnswer(s, rid, iid, field, value) {
    requireKnown('respondent', rid, s.respondents.map((r) => r.id));
    requireKnown('item', iid, s.items.map((i) => i.id));
    if (!['f', 'd', 'w'].includes(field)) throw new Error('field');
    const max = field === 'w' ? 9 : 5;
    if (value !== null && !(Number.isInteger(value) && value >= 1 && value <= max)) throw new Error(`value ${value}`);
    s.answers[rid] ??= {};
    s.answers[rid][iid] ??= { f: null, d: null, w: null };
    s.answers[rid][iid][field] = value;
  },
};

/**
 * Applies a stack to a world, all or nothing.
 * @param {{ kano: Record<string, any>, surveys: Record<string, any>, trees: Record<string, any> }} world
 *   kano states, survey transfers and VoC trees by instance id
 * @param {any[]} stack
 * @returns {{ world: any, results: Map<string, any> }} the world after the stack (a copy)
 */
function run(world, stack) {
  const w = copy(world);
  const results = new Map();
  for (const raw of stack) {
    const op = resolve(raw, results);
    let result;
    if (op.op === 'module.add') {
      if (op.module === 'kano') {
        const instanceId = freshId('kano');
        w.kano[instanceId] = emptyKano();
        result = { instanceId, module: 'kano', phase: op.phase ?? 'default' };
      } else if (op.module === 'voc-ctx-tree') {
        if ('phase' in op) throw new Error('a new tree goes into the default phase');
        const instanceId = freshId('tree');
        w.trees[instanceId] = { vocs: [], activeVocId: null };
        result = { instanceId, module: 'voc-ctx-tree', phase: 'default' };
      } else throw new Error(`module.add ${op.module}`);
    } else if (op.op === 'instance.call') {
      if (!op.module) throw new Error('module is required');
      let value;
      if (op.module === 'kano') {
        const s = w.kano[op.instance];
        if (!s) throw new Error(`no kano ${op.instance}`);
        value = KANO[op.method](s, ...op.args);
      } else if (op.module === 'survey-builder') {
        const t = w.surveys[op.instance];
        if (!t) throw new Error(`no survey ${op.instance}`);
        if (op.method === 'setKanoTransfer') {
          const [{ questionId, instanceId, itemIds, respondentIds }] = op.args;
          if (!t.kanoQuestionIds.includes(questionId)) throw new Error(`no Kano question ${questionId}`);
          assertTrue(typeof instanceId === 'string', 'instance id resolved');
          assertTrue(respondentIds.every((x) => typeof x === 'string'), 'respondent ids resolved');
          const cur = t.kano[questionId] ?? { instanceId: null, byInstance: {} };
          t.kano[questionId] = { ...cur, byInstance: { ...cur.byInstance, [instanceId]: { itemIds, respondentIds } } };
        } else if (op.method === 'setKanoTarget') {
          const [{ questionId, instanceId }] = op.args;
          if (!t.kanoQuestionIds.includes(questionId)) throw new Error(`no Kano question ${questionId}`);
          assertTrue(instanceId === null || typeof instanceId === 'string', 'instance id resolved');
          t.kano[questionId] = { instanceId, byInstance: t.kano[questionId]?.byInstance ?? {} };
        } else if (op.method === 'markVocTaken') {
          const set = new Set(t.vocTree.responseKeys);
          op.args[0].keys.forEach((k) => set.add(k));
          t.vocTree.responseKeys = [...set];
        } else throw new Error(op.method);
      } else if (op.module === 'voc-ctx-tree') {
        const tree = w.trees[op.instance];
        if (op.method !== 'addVoc') throw new Error(op.method);
        const [text, source] = op.args;
        const id = freshId('voc');
        tree.vocs.push({ id, text: text.trim(), source: source.trim(), needs: [] });
        tree.activeVocId = id;
        value = id;
      }
      result = { instanceId: op.instance, method: op.method, value };
    }
    if (raw.id) results.set(raw.id, result);
  }
  return { world: w, results };
}

// ── Cases ───────────────────────────────────────────────────────────────

const S1 = 'survey-1';
const S2 = 'survey-2';
const label = (n) => `Befragte ${n}`;
const QA = { id: 'qA', type: 'kano', text: 'Merkmale', rows: [{ id: 'k1', text: 'Chat' }, { id: 'k2', text: 'Status' }], importance: true };
const QB = { id: 'qB', type: 'kano', text: 'Mehr', rows: [{ id: 'k3', text: 'Export' }], importance: false };
const RECIPIENTS = [{ id: 'rec-a', name: 'Anna' }, { id: 'rec-b', name: 'Bert' }];
/** Responses in the earlier form, as `legacyResponses` gives them. */
const RESPONSES = [
  { id: 'resp-a', recipientId: 'rec-a', answers: { qA: { k1: { f: 1, d: 5, w: 7 }, k2: { f: 2, d: 4, w: null } }, qB: { k3: { f: 4, d: 2, w: null } } } },
  { id: 'resp-b', recipientId: null, answers: { qA: { k1: { f: 3, d: 9, w: 12 } } } },
  { id: 'resp-c', recipientId: 'rec-b', answers: { qB: { k3: { f: 5, d: 1, w: 3 } } } },
  { id: 'resp-d', recipientId: 'rec-b', answers: { qA: 'kaputt' } },
];

/** A kano instance with hand-made entries and earlier hand-overs of qA and qB from S1 (and qB from S2). */
const OLD_KANO = Object.freeze({
  source: { instanceId: 'tree-x', level: 'driver' },
  options: { importance: false },
  items: [
    { id: 'm1', nodeId: 'n1', label: 'Von Hand', path: 'A › B', missing: true },
    { id: 'oA1', nodeId: null, label: 'Chat alt', path: '', missing: false, origin: { surveyInstanceId: S1, questionId: 'qA' } },
    { id: 'oB1', nodeId: null, label: 'Export alt', path: '', missing: false, origin: { surveyInstanceId: S1, questionId: 'qB' } },
    { id: 'm2', nodeId: null, label: 'Auch von Hand', path: '', missing: false },
    { id: 'o2B1', nodeId: null, label: 'Anderer Survey', path: '', missing: false, origin: { surveyInstanceId: S2, questionId: 'qB' } },
  ],
  respondents: [
    { id: 'man1', name: 'Hand' },
    { id: 'rA1', name: 'Alt A', origin: { surveyInstanceId: S1, questionId: 'qA' } },
    { id: 'rB1', name: 'Alt B', origin: { surveyInstanceId: S1, questionId: 'qB' } },
    { id: 'r2B1', name: 'Alt S2', origin: { surveyInstanceId: S2, questionId: 'qB' } },
  ],
  answers: {
    man1: { m1: { f: 1, d: 2, w: 3 }, oA1: { f: 2, d: 2, w: null }, oB1: { f: 4, d: 4, w: null } },
    rA1: { oA1: { f: 1, d: 1, w: null }, m2: { f: 5, d: 5, w: 9 } },
    rB1: { oB1: { f: 3, d: 3, w: null } },
    r2B1: { o2B1: { f: 2, d: 5, w: null } },
  },
  activeRespondentId: 'rA1',
});

/** @param {object} q @param {boolean} [anonymous] @returns {object} input of kanoStateFromSurvey */
const input = (q, anonymous = false, surveyInstanceId = S1) => ({
  surveyInstanceId, question: q, responses: RESPONSES, recipients: RECIPIENTS, anonymous, respondentLabel: label,
});

/** The earlier hand-overs one after the other, frozen. @returns {any[]} the kano state after each */
function legacyChain(key, start, inputs) {
  return frozen(`handover kano ${key}`, ({ kanoStateFromSurvey }) => {
    let s = start ? copy(start) : null;
    return inputs.map((i) => (s = kanoStateFromSurvey(s, i)));
  });
}

/**
 * A kano state with ids replaced by their position, without `origin` on
 * items (setItems drops it) and on respondents of a handed-over origin,
 * without empty answer maps and without `activeRespondentId`. An answer of
 * a respondent or on an item that is gone fails the comparison: a missing
 * remove step must not hide behind the canonical form.
 * @param {any} s @param {string[]} handed `<surveyInstanceId>:<questionId>`
 */
function canonKano(s, handed) {
  const items = new Map(s.items.map((it, i) => [it.id, `i${i}`]));
  const resps = new Map(s.respondents.map((r, i) => [r.id, `p${i}`]));
  const answers = {};
  for (const [rid, byItem] of Object.entries(s.answers)) {
    if (!resps.has(rid)) throw new Error(`answers of a respondent that is gone: ${rid}`);
    const kept = Object.entries(byItem);
    const dangling = kept.filter(([iid]) => !items.has(iid)).map(([iid]) => iid);
    if (dangling.length) throw new Error(`answers of ${rid} on items that are gone: ${dangling.join(', ')}`);
    if (kept.length) answers[resps.get(rid)] = Object.fromEntries(kept.map(([iid, a]) => [items.get(iid), a]));
  }
  return {
    source: s.source,
    options: s.options,
    items: s.items.map(({ origin, ...it }) => ({ ...it, id: items.get(it.id) })),
    respondents: s.respondents.map(({ origin, ...r }) => ({
      ...r, id: resps.get(r.id),
      ...(origin && !handed.includes(`${origin.surveyInstanceId}:${origin.questionId}`) ? { origin } : {}),
    })),
    answers,
  };
}

/**
 * One hand-over through the stack builders, as the task does it: read,
 * own entries, backups, stack — and run.
 * @param {any} world @param {{ survey: string, q: object, anonymous?: boolean }} h
 * @returns {{ world: any, stack: any[], kanoId: string }}
 */
function handOver(world, { survey, q, anonymous = false }) {
  const transfer = world.surveys[survey].kano[q.id];
  const kanoId = transfer?.instanceId && world.kano[transfer.instanceId] ? transfer.instanceId : null;
  const kanoRead = kanoId ? copy(world.kano[kanoId]) : null;
  const surveys = Object.entries(world.surveys)
    .map(([instanceId, t]) => ({ instanceId, transfers: { kano: t.kano }, kanoQuestionIds: t.kanoQuestionIds }));
  const backups = kanoId ? kanoBackups(kanoRead, surveys, kanoId) : [];
  const own = kanoId ? kanoOwnEntries(kanoRead, transfer.byInstance[kanoId], survey, q.id) : { itemIds: [], respondentIds: [] };
  const stack = kanoStack({
    kanoId, phase: 'measure', kanoRead, question: q, responses: RESPONSES, recipients: RECIPIENTS,
    anonymous, respondentLabel: label, surveyInstanceId: survey, backups, own,
  });
  const out = run(world, stack).world;
  return { world: out, stack, kanoId: out.surveys[survey].kano[q.id].instanceId };
}

/** @param {Record<string, any>} kano @param {Record<string, any>} [surveys] */
const worldOf = (kano, surveys = { [S1]: { kano: {}, vocTree: { responseKeys: [] }, kanoQuestionIds: ['qA', 'qB'] } }) => ({ kano, surveys, trees: {} });
/** Targets on kano-1 without references for `pairs`; `kanoQuestionIds` the survey's Kano questions. */
const linked = (pairs, kanoQuestionIds = ['qA', 'qB']) => ({
  kano: Object.fromEntries(pairs.map((q) => [q, { instanceId: 'kano-1', byInstance: {} }])),
  vocTree: { responseKeys: [] }, kanoQuestionIds,
});

suite('survey-builder handover — kanoStack gives the state of the earlier hand-over', () => {
  test('new instance', () => {
    const [want] = legacyChain('new', null, [input(QA)]);
    const { world, kanoId, stack } = handOver(worldOf({}), { survey: S1, q: QA });
    assertDeepEqual(canonKano(world.kano[kanoId], [`${S1}:qA`]), canonKano(want, [`${S1}:qA`]));
    assertEqual(world.kano[kanoId].respondents.length, 2, 'resp-a and resp-b answered qA, resp-d is no map');
  });

  test('new instance: module.add in the own phase, then setSourceTree(null) before anything else', () => {
    const { stack } = handOver(worldOf({}), { survey: S1, q: QA });
    assertDeepEqual(stack[0], { op: 'module.add', id: 'kano', module: 'kano', phase: 'measure' });
    assertDeepEqual(stack[1], { op: 'instance.call', module: 'kano', instance: { $from: 'kano', path: 'instanceId' }, method: 'setSourceTree', args: [null] });
    assertDeepEqual(stack[2].args, [true]);
    assertEqual(stack[2].method, 'setImportance');
    const [transfer, target] = stack.slice(-2);
    assertEqual(transfer.method, 'setKanoTransfer');
    assertEqual(transfer.instance, S1);
    assertDeepEqual(transfer.args[0].instanceId, { $from: 'kano', path: 'instanceId' });
    assertDeepEqual(transfer.args[0].respondentIds, [{ $from: 'r0', path: 'value' }, { $from: 'r1', path: 'value' }]);
    assertDeepEqual(target, {
      op: 'instance.call', module: 'survey-builder', instance: S1, method: 'setKanoTarget',
      args: [{ questionId: 'qA', instanceId: { $from: 'kano', path: 'instanceId' } }],
    }, 'the target follows the references');
  });

  test('a remembered instance that is gone: a new one, and the transfer points to it', () => {
    const w = worldOf({}, { [S1]: linked(['qA']) });
    const { world, kanoId, stack } = handOver(w, { survey: S1, q: QA });
    assertEqual(stack[0].op, 'module.add');
    assertTrue(kanoId !== 'kano-1' && Boolean(world.kano[kanoId]));
    assertEqual(world.surveys[S1].kano.qA.byInstance[kanoId].itemIds.length, 2);
  });

  test('existing instance with hand-made entries', () => {
    const [want] = legacyChain('existing', OLD_KANO, [input(QA)]);
    const { world } = handOver(worldOf({ 'kano-1': copy(OLD_KANO) }, { [S1]: linked(['qA']) }), { survey: S1, q: QA });
    assertDeepEqual(canonKano(world.kano['kano-1'], [`${S1}:qA`]), canonKano(want, [`${S1}:qA`]));
    assertEqual(world.kano['kano-1'].source.instanceId, 'tree-x', 'an existing source stays');
  });

  test('repeat hand-over', () => {
    const [, want] = legacyChain('repeat', OLD_KANO, [input(QA), input(QA)]);
    let w = worldOf({ 'kano-1': copy(OLD_KANO) }, { [S1]: linked(['qA']) });
    w = handOver(w, { survey: S1, q: QA }).world;
    w = handOver(w, { survey: S1, q: QA }).world;
    assertDeepEqual(canonKano(w.kano['kano-1'], [`${S1}:qA`]), canonKano(want, [`${S1}:qA`]));
  });

  test('importance: false keeps an existing instance as it is and switches a new one off', () => {
    const [wantOld] = legacyChain('importance false existing', OLD_KANO, [input(QB)]);
    const on = { ...copy(OLD_KANO), options: { importance: true } };
    const [wantOn] = legacyChain('importance false existing on', on, [input(QB)]);
    const [wantNew] = legacyChain('importance false new', null, [input(QB)]);
    const old = handOver(worldOf({ 'kano-1': copy(OLD_KANO) }, { [S1]: linked(['qB']) }), { survey: S1, q: QB });
    assertTrue(!old.stack.some((op) => op.method === 'setImportance'), 'no setImportance for an existing instance');
    assertDeepEqual(canonKano(old.world.kano['kano-1'], [`${S1}:qB`]), canonKano(wantOld, [`${S1}:qB`]));
    const kept = handOver(worldOf({ 'kano-1': on }, { [S1]: linked(['qB']) }), { survey: S1, q: QB });
    assertDeepEqual(canonKano(kept.world.kano['kano-1'], [`${S1}:qB`]), canonKano(wantOn, [`${S1}:qB`]));
    const fresh = handOver(worldOf({}), { survey: S1, q: QB });
    assertEqual(fresh.world.kano[fresh.kanoId].options.importance, false);
    assertDeepEqual(canonKano(fresh.world.kano[fresh.kanoId], [`${S1}:qB`]), canonKano(wantNew, [`${S1}:qB`]));
  });

  test('anonymous: respondents are "Befragte n" even with a recipient', () => {
    const [want] = legacyChain('anonymous', null, [input(QB, true)]);
    const { world, kanoId } = handOver(worldOf({}), { survey: S1, q: QB, anonymous: true });
    assertDeepEqual(world.kano[kanoId].respondents.map((r) => r.name), ['Befragte 1', 'Befragte 2']);
    assertDeepEqual(canonKano(world.kano[kanoId], [`${S1}:qB`]), canonKano(want, [`${S1}:qB`]));
  });

  test('a cell is written with all three fields, off-scale values as null', () => {
    const { stack } = handOver(worldOf({}), { survey: S1, q: QA });
    const cells = stack.filter((op) => op.method === 'setAnswer' && op.args[0].$from === 'r1');
    assertDeepEqual(cells.map((op) => [op.args[2], op.args[3]]), [['f', 3], ['d', null], ['w', null]]);
  });
});

suite('survey-builder handover — two Kano questions, earlier marks', () => {
  test('one survey: A, B, A — no duplicates, hand-made entries and their answers stay', () => {
    const want = legacyChain('ABA one survey', OLD_KANO, [input(QA), input(QB), input(QA)]);
    let w = worldOf({ 'kano-1': copy(OLD_KANO) }, { [S1]: linked(['qA', 'qB']) });
    const first = handOver(w, { survey: S1, q: QA });
    const backups = first.stack.slice(0, first.stack.findIndex((op) => op.module === 'kano'));
    assertTrue(backups.every((op) => op.method === 'setKanoTransfer'), 'only backups before the first Kano step');
    assertDeepEqual(backups.map((op) => op.args[0].questionId).sort(), ['qA', 'qB'], 'both questions backed up');
    assertDeepEqual(first.world.surveys[S1].kano.qB, { instanceId: 'kano-1', byInstance: { 'kano-1': { itemIds: ['oB1'], respondentIds: ['rB1'] } } });
    const handed = [`${S1}:qA`, `${S1}:qB`];
    w = first.world;
    assertDeepEqual(canonKano(w.kano['kano-1'], handed), canonKano(want[0], handed));
    w = handOver(w, { survey: S1, q: QB }).world;
    assertDeepEqual(canonKano(w.kano['kano-1'], handed), canonKano(want[1], handed));
    w = handOver(w, { survey: S1, q: QA }).world;
    const k = w.kano['kano-1'];
    assertDeepEqual(canonKano(k, handed), canonKano(want[2], handed));
    assertDeepEqual(k.items.map((i) => i.label), ['Von Hand', 'Auch von Hand', 'Anderer Survey', 'Export', 'Chat', 'Status']);
    assertDeepEqual(k.answers.man1.m1, { f: 1, d: 2, w: 3 });
    assertEqual(k.respondents.length, 2 + 2 + 2, 'man1, r2B1, two for qB, two for qA');
  });

  test('two surveys at the same instance: A of S1, B of S2, A of S1', () => {
    const inputs = [input(QA, false, S1), input(QB, false, S2), input(QA, false, S1)];
    const want = legacyChain('ABA two surveys', OLD_KANO, inputs);
    const surveys = { [S1]: linked(['qA', 'qB']), [S2]: linked(['qB']) };
    let w = worldOf({ 'kano-1': copy(OLD_KANO) }, surveys);
    const handed = [`${S1}:qA`, `${S2}:qB`];
    const first = handOver(w, { survey: S1, q: QA });
    assertDeepEqual(first.world.surveys[S2].kano.qB, { instanceId: 'kano-1', byInstance: { 'kano-1': { itemIds: ['o2B1'], respondentIds: ['r2B1'] } } });
    w = first.world;
    assertDeepEqual(canonKano(w.kano['kano-1'], handed), canonKano(want[0], handed));
    w = handOver(w, { survey: S2, q: QB }).world;
    assertDeepEqual(canonKano(w.kano['kano-1'], handed), canonKano(want[1], handed));
    w = handOver(w, { survey: S1, q: QA }).world;
    assertDeepEqual(canonKano(w.kano['kano-1'], handed), canonKano(want[2], handed));
    assertEqual(w.kano['kano-1'].items.filter((i) => i.label === 'Chat').length, 1);
  });
});

/** A Kano instance with one hand-made feature and respondent, answered. */
const HAND = Object.freeze({
  source: { instanceId: null, level: 'need' }, options: { importance: true },
  items: [{ id: 'h1', nodeId: null, label: 'Von Hand', path: '', missing: false }],
  respondents: [{ id: 'hr1', name: 'Hand' }],
  answers: { hr1: { h1: { f: 1, d: 2, w: 3 } } },
  activeRespondentId: 'hr1',
});

/**
 * The target select of a question changed, as `setKanoTarget` does it.
 * @param {any} world @param {string} survey @param {string} q @param {string|null} instanceId @returns {any}
 */
function retarget(world, survey, q, instanceId) {
  return run(world, [{ op: 'instance.call', module: 'survey-builder', instance: survey, method: 'setKanoTarget', args: [{ questionId: q, instanceId }] }]).world;
}

suite('survey-builder handover — one question, two Kano instances', () => {
  test('A, B, A: no duplicates in either, hand-made entries and their answers stay, references for both', () => {
    const s1 = { kano: { qA: { instanceId: 'kano-1', byInstance: {} } }, vocTree: { responseKeys: [] }, kanoQuestionIds: ['qA', 'qB'] };
    let w = worldOf({ 'kano-1': copy(HAND), 'kano-2': copy(HAND) }, { [S1]: s1 });
    w = handOver(w, { survey: S1, q: QA }).world;
    const afterA = copy(w.kano['kano-1']);
    w = retarget(w, S1, 'qA', 'kano-2');
    w = handOver(w, { survey: S1, q: QA }).world;
    const afterB = copy(w.kano['kano-2']);
    w = retarget(w, S1, 'qA', 'kano-1');
    const again = handOver(w, { survey: S1, q: QA });
    w = again.world;
    assertTrue(again.stack.some((op) => op.method === 'removeItem'), 'own features in kano-1 are replaced');
    for (const [id, before] of [['kano-1', afterA], ['kano-2', afterB]]) {
      const k = w.kano[id];
      assertDeepEqual(k.items.map((i) => i.label), ['Von Hand', 'Chat', 'Status'], `${id}: no duplicate`);
      assertEqual(k.respondents.length, 1 + 2, `${id}: Hand and the two who answered qA`);
      assertDeepEqual(k.answers.hr1, { h1: { f: 1, d: 2, w: 3 } }, `${id}: hand-made answer stays`);
      assertDeepEqual(canonKano(k, [`${S1}:qA`]), canonKano(before, [`${S1}:qA`]), `${id}: same as after its first hand-over`);
    }
    const t = w.surveys[S1].kano.qA;
    assertEqual(t.instanceId, 'kano-1');
    assertDeepEqual(Object.keys(t.byInstance).sort(), ['kano-1', 'kano-2']);
    assertDeepEqual(t.byInstance['kano-1'].itemIds, w.kano['kano-1'].items.slice(1).map((i) => i.id));
    assertDeepEqual(t.byInstance['kano-2'].itemIds, w.kano['kano-2'].items.slice(1).map((i) => i.id));
    assertDeepEqual(t.byInstance['kano-2'].respondentIds, w.kano['kano-2'].respondents.slice(1).map((r) => r.id));
  });

  test('a new instance: references and target point at it', () => {
    const s1 = { kano: { qA: { instanceId: 'kano-1', byInstance: {} } }, vocTree: { responseKeys: [] }, kanoQuestionIds: ['qA'] };
    let w = worldOf({ 'kano-1': copy(HAND) }, { [S1]: s1 });
    w = handOver(w, { survey: S1, q: QA }).world;
    w = retarget(w, S1, 'qA', null);
    const { world, kanoId } = handOver(w, { survey: S1, q: QA });
    assertTrue(kanoId !== 'kano-1' && Boolean(world.kano[kanoId]));
    assertDeepEqual(Object.keys(world.surveys[S1].kano.qA.byInstance).sort(), ['kano-1', kanoId].sort());
  });
});

suite('survey-builder handover — kanoOwnEntries and kanoBackups', () => {
  test('remembered ids that still occur; the origin marks only when none are remembered', () => {
    const read = copy(OLD_KANO);
    assertDeepEqual(kanoOwnEntries(read, { itemIds: ['m2', 'weg'], respondentIds: ['weg'] }, S1, 'qA'),
      { itemIds: ['m2'], respondentIds: [] });
    assertDeepEqual(kanoOwnEntries(read, { itemIds: [], respondentIds: [] }, S1, 'qA'),
      { itemIds: ['oA1'], respondentIds: ['rA1'] });
    assertDeepEqual(kanoOwnEntries(read, undefined, S2, 'qB'), { itemIds: ['o2B1'], respondentIds: ['r2B1'] });
  });

  test('skips survey instances that are gone and origins with filled lists', () => {
    const read = copy(OLD_KANO);
    const surveys = [{ instanceId: S1, kanoQuestionIds: ['qA', 'qB'], transfers: { kano: {
      qA: { instanceId: 'kano-1', byInstance: { 'kano-2': { itemIds: ['y'], respondentIds: [] } } },
      qB: { instanceId: 'kano-1', byInstance: { 'kano-1': { itemIds: ['x'], respondentIds: [] } } },
    } } }];
    assertDeepEqual(kanoBackups(read, surveys, 'kano-1'), [
      { instance: S1, questionId: 'qA', instanceId: 'kano-1', itemIds: ['oA1'], respondentIds: ['rA1'] },
    ], 'references for another instance do not count');
  });

  test('an empty reference list counts as missing', () => {
    const read = copy(OLD_KANO);
    const surveys = [{ instanceId: S2, kanoQuestionIds: ['qB'], transfers: { kano: {
      qB: { instanceId: 'kano-1', byInstance: { 'kano-1': { itemIds: [], respondentIds: [] } } },
    } } }];
    assertDeepEqual(kanoBackups(read, surveys, 'kano-1'), [
      { instance: S2, questionId: 'qB', instanceId: 'kano-1', itemIds: ['o2B1'], respondentIds: ['r2B1'] },
    ]);
  });

  test('backs up an origin whose question targets another instance or none', () => {
    const read = copy(OLD_KANO);
    const surveys = [{ instanceId: S1, kanoQuestionIds: ['qA', 'qB'], transfers: { kano: {
      qA: { instanceId: 'kano-2', byInstance: {} },
    } } }];
    assertDeepEqual(kanoBackups(read, surveys, 'kano-1'), [
      { instance: S1, questionId: 'qA', instanceId: 'kano-1', itemIds: ['oA1'], respondentIds: ['rA1'] },
      { instance: S1, questionId: 'qB', instanceId: 'kano-1', itemIds: ['oB1'], respondentIds: ['rB1'] },
    ]);
  });

  test('an old project with origin marks and a target on another instance is backed up without changing the target', () => {
    const s1 = { kano: { qA: { instanceId: 'kano-2', byInstance: {} }, qB: { instanceId: 'kano-1', byInstance: {} } },
      vocTree: { responseKeys: [] }, kanoQuestionIds: ['qA', 'qB'] };
    const w = worldOf({ 'kano-1': copy(OLD_KANO), 'kano-2': emptyKano() }, { [S1]: s1 });
    const { world, stack } = handOver(w, { survey: S1, q: QB });
    assertTrue(!stack.some((op) => op.method === 'setKanoTarget' && op.args[0].questionId === 'qA'), 'qA is not turned round');
    assertDeepEqual(world.surveys[S1].kano.qA, { instanceId: 'kano-2', byInstance: { 'kano-1': { itemIds: ['oA1'], respondentIds: ['rA1'] } } });
    assertEqual(world.surveys[S1].kano.qB.instanceId, 'kano-1');
    assertDeepEqual(world.kano['kano-2'], emptyKano(), 'the other instance is not touched');
  });

  test('skips an origin whose question changed its type (marker kept, no Kano question any more)', () => {
    const read = copy(OLD_KANO);
    const surveys = [{ instanceId: S2, kanoQuestionIds: [], transfers: { kano: { qB: { instanceId: 'kano-1', byInstance: {} } } } }];
    assertDeepEqual(kanoBackups(read, surveys, 'kano-1'), []);
  });

  test('an origin of a deleted question with its marker left behind: no backup, the own hand-over still works', () => {
    const w = worldOf({ 'kano-1': copy(OLD_KANO) }, { [S1]: linked(['qA', 'qB'], ['qA']) });
    const { world, stack } = handOver(w, { survey: S1, q: QA });
    assertTrue(!stack.some((op) => op.method === 'setKanoTransfer' && op.args[0].questionId === 'qB'), 'no backup of qB');
    assertEqual(world.surveys[S1].kano.qA.byInstance['kano-1'].itemIds.length, 2);
    assertDeepEqual(world.kano['kano-1'].items.filter((i) => i.label === 'Chat').length, 1);
  });

  test('a recipient whose name is only blanks gives "Befragte n"', () => {
    const stack = kanoStack({
      kanoId: null, phase: 'measure', kanoRead: null, question: QA,
      responses: [{ recipientId: 'rec-w', answers: { qA: { k1: { f: 1, d: 1, w: null } } } }],
      recipients: [{ id: 'rec-w', name: '   ' }], anonymous: false, respondentLabel: label, surveyInstanceId: S1,
      backups: [], own: { itemIds: [], respondentIds: [] },
    });
    assertDeepEqual(stack.filter((op) => op.method === 'addRespondent').map((op) => op.args), [['Befragte 1']]);
  });

  test('a stack whose remove step names a vanished id fails as a whole', () => {
    const w = worldOf({ 'kano-1': copy(OLD_KANO) }, { [S1]: linked(['qA']) });
    const stack = kanoStack({
      kanoId: 'kano-1', phase: 'measure', kanoRead: copy(OLD_KANO), question: QA, responses: RESPONSES, recipients: RECIPIENTS,
      anonymous: false, respondentLabel: label, surveyInstanceId: S1, backups: [], own: { itemIds: ['weg'], respondentIds: [] },
    });
    assertThrows(() => run(w, stack));
  });
});

// ── VoC ─────────────────────────────────────────────────────────────────

const ENTRIES = [{ text: 'Schneller bitte', name: 'Anna' }, { text: 'Mehr Farbe', name: '' }];
const KEYS = ['resp-a:q5', 'resp-b:q2:other'];

suite('survey-builder handover — vocStack', () => {
  for (const anonymous of [false, true]) {
    test(`text and source as before (${anonymous ? 'anonymous' : 'with names'})`, () => {
      const want = frozen(`handover voc ${anonymous ? 'anonymous' : 'named'}`,
        ({ vocsFromAnswers }) => vocsFromAnswers(copy(ENTRIES), 'Umfrage: Befragung', anonymous).map(({ text, source }) => ({ text, source })));
      const stack = vocStack({ treeId: 'tree-1', entries: ENTRIES, sourceLabel: 'Umfrage: Befragung', anonymous, surveyInstanceId: S1, keys: KEYS });
      const calls = stack.filter((op) => op.method === 'addVoc');
      assertDeepEqual(calls.map((op) => ({ text: op.args[0], source: op.args[1] })), want);
      if (anonymous) assertTrue(calls.every((op) => op.args[1] === 'Umfrage: Befragung'), 'no name');
    });
  }

  test('into an existing tree: one addVoc per entry, then markVocTaken', () => {
    const stack = vocStack({ treeId: 'tree-1', entries: ENTRIES, sourceLabel: 'Umfrage: Befragung', anonymous: false, surveyInstanceId: S1, keys: KEYS });
    assertDeepEqual(stack, [
      { op: 'instance.call', module: 'voc-ctx-tree', instance: 'tree-1', method: 'addVoc', args: ['Schneller bitte', 'Umfrage: Befragung, Anna'] },
      { op: 'instance.call', module: 'voc-ctx-tree', instance: 'tree-1', method: 'addVoc', args: ['Mehr Farbe', 'Umfrage: Befragung'] },
      { op: 'instance.call', module: 'survey-builder', instance: S1, method: 'markVocTaken', args: [{ keys: KEYS }] },
    ]);
  });

  test('without a tree: module.add without phase, the entries go into the new tree', () => {
    const stack = vocStack({ treeId: null, entries: ENTRIES, sourceLabel: 'Umfrage: Befragung', anonymous: false, surveyInstanceId: S1, keys: KEYS });
    assertDeepEqual(stack[0], { op: 'module.add', id: 'tree', module: 'voc-ctx-tree' });
    assertDeepEqual(stack[1].instance, { $from: 'tree', path: 'instanceId' });
    const { world } = run({ kano: {}, surveys: { [S1]: { kano: {}, vocTree: { responseKeys: ['old'] } } }, trees: {} }, stack);
    const [tree] = Object.values(world.trees);
    assertDeepEqual(tree.vocs.map((v) => v.text), ['Schneller bitte', 'Mehr Farbe']);
    assertDeepEqual(world.surveys[S1].vocTree.responseKeys, ['old', ...KEYS]);
  });

  test('openTexts: every visible free text and „Sonstiges“ text of all responses, filter aside', () => {
    const texts = openTexts(load(MIXED).toJSON());
    assertDeepEqual([...texts.entries()], [
      ['resp-a:q5', { text: 'Schneller bitte', name: 'Anna' }],
      ['resp-b:q1:other', { text: 'Behörde', name: '' }],
      ['resp-c:q2:other', { text: 'Brief', name: '' }],
    ], 'the „Sonstiges“ text of a hidden question (resp-a, q2) is left out');
  });
});

// ── Worksheet ───────────────────────────────────────────────────────────

const WS = {
  responseId: 'Antwort', submittedAt: 'Eingang', recipient: 'Empfänger', other: 'Sonstige', functional: 'funktional',
  dysfunctional: 'dysfunktional', importance: 'Wichtigkeit', category: 'Kategorie', question: 'Frage',
};

suite('survey-builder handover — worksheetColumnsFor', () => {
  for (const anonymous of [false, true]) {
    test(`the columns as before (${anonymous ? 'anonymous' : 'with names'})`, () => {
      const json = copy(MIXED);
      json.survey.anonymous = anonymous;
      const want = frozen(`handover worksheet ${anonymous ? 'anonymous' : 'named'}`, ({ Legacy }) => {
        const l = Legacy.fromJSON(copy(json));
        return worksheetColumns(copy(l.survey), copy(l.responses), copy(l.recipients), WS);
      });
      const got = worksheetColumnsFor(load(json).toJSON(), WS);
      assertDeepEqual(got, want);
      assertTrue(got.every((c) => c.values.length === json.responses.length), 'one row per response');
      assertEqual(got.some((c) => c.name === 'Empfänger'), !anonymous);
    });
  }
});

// ── Phase of a new tree ─────────────────────────────────────────────────

suite('survey-builder handover — a new tree goes where treePhaseForCycle put it', () => {
  const def = MODULES.find((m) => m.id === 'voc-ctx-tree');
  for (const cycle of Object.keys(CYCLES)) {
    test(cycle, () => assertEqual(defaultPhaseFor(def, cycle), treePhaseForCycle(cycle)));
  }
});
