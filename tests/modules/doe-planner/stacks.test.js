/**
 * Tests for js/modules/doe-planner/domain/stacks.js — the stacks that
 * extend a bound datasheet and keep its response columns in step.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { augmentStack, responseSyncStack, responseSyncPlan } from '../../../js/modules/doe-planner/domain/stacks.js';

const hard = (reason, extra = {}) => ({ lock: 'hard', managedBy: 'doe-planner', managedRef: 'doe:p1', reason, ...extra });
const soft = { lock: 'soft', managedBy: 'doe-planner', managedRef: 'doe:p1', reason: 'replicate-aggregate' };

const REF = Object.freeze({
  instanceId: 'ws1',
  sheetId: 'sheet_1',
  runOrderColumnId: 'run',
  stdOrderColumnId: 'std',
  factorColumnIds: ['fa', 'fm'],
  responseColumnIds: ['y1', 'y2'],
  meanColumnIds: ['m1', 'm2'],
  lnVarColumnIds: ['v1', 'v2'],
});

/** Columns as the worksheet reads them, in sheet order. */
const COLUMNS = Object.freeze([
  { id: 'run', name: 'RunOrder', meta: hard('run-order') },
  { id: 'std', name: 'StdOrder', meta: hard('group-id') },
  { id: 'blk', name: 'Block', meta: hard('block-column') },
  { id: 'rep', name: 'Replicate', meta: hard('replicate-id') },
  { id: 'fa', name: 'Temp', meta: hard('design-factor') },
  { id: 'fm', name: 'Material', meta: hard('design-factor', { categoricalCoding: { Stahl: -1, Kupfer: 1 } }) },
  { id: 'y1', name: 'Yield', meta: null },
  { id: 'y2', name: 'Cost', meta: null },
  { id: 'm1', name: 'Yield Mean', meta: soft },
  { id: 'v1', name: 'Yield lnVar', meta: soft },
  { id: 'm2', name: 'Cost Mean', meta: soft },
  { id: 'v2', name: 'Cost lnVar', meta: soft },
  { id: 'own', name: 'Notiz', meta: null },
]);

/** @param {string} method @param {any[]} args */
const call = (method, args) => ({ op: 'instance.call', module: 'worksheet', instance: 'ws1', method, args });

/** @param {any} meta @returns {any} meta without its lock */
const unlocked = (meta) => { const { lock, ...rest } = meta; return rest; };

suite('doe-planner domain — augmentStack', () => {
  const rows = [[150, 'Stahl'], [200, 'Kupfer']];

  test('hebt die Sperren auf, hängt Zeilen an, schreibt Werte und Formeln, setzt die Sperren wieder', () => {
    const stack = augmentStack(REF, COLUMNS, rows, 4);
    const locked = COLUMNS.filter((c) => c.meta && c.meta.lock);
    assertDeepEqual(stack, [
      ...locked.map((c) => call('setColumnMeta', ['sheet_1', c.id, unlocked(c.meta)])),
      call('addRows', ['sheet_1', 2]),
      call('setCells', ['sheet_1', 'run', 4, [5, 6]]),
      call('setCells', ['sheet_1', 'std', 4, [5, 6]]),
      call('setCells', ['sheet_1', 'blk', 4, [1, 1]]),
      call('setCells', ['sheet_1', 'rep', 4, [1, 1]]),
      call('setCells', ['sheet_1', 'fa', 4, [150, 200]]),
      call('setCells', ['sheet_1', 'fm', 4, ['Stahl', 'Kupfer']]),
      call('setFormula', ['sheet_1', 'm1', 4, "=AVERAGEIF('StdOrder'; 'StdOrder'[5]; 'Yield')"]),
      call('setFormula', ['sheet_1', 'm1', 5, "=AVERAGEIF('StdOrder'; 'StdOrder'[6]; 'Yield')"]),
      call('setFormula', ['sheet_1', 'v1', 4, "=LN(VARIF('StdOrder'; 'StdOrder'[5]; 'Yield'))"]),
      call('setFormula', ['sheet_1', 'v1', 5, "=LN(VARIF('StdOrder'; 'StdOrder'[6]; 'Yield'))"]),
      call('setFormula', ['sheet_1', 'm2', 4, "=AVERAGEIF('StdOrder'; 'StdOrder'[5]; 'Cost')"]),
      call('setFormula', ['sheet_1', 'm2', 5, "=AVERAGEIF('StdOrder'; 'StdOrder'[6]; 'Cost')"]),
      call('setFormula', ['sheet_1', 'v2', 4, "=LN(VARIF('StdOrder'; 'StdOrder'[5]; 'Cost'))"]),
      call('setFormula', ['sheet_1', 'v2', 5, "=LN(VARIF('StdOrder'; 'StdOrder'[6]; 'Cost'))"]),
      ...locked.map((c) => call('setColumnMeta', ['sheet_1', c.id, c.meta])),
    ]);
  });

  test('erste Aktionen ohne lock, letzte mit dem alten meta', () => {
    const stack = augmentStack(REF, COLUMNS, rows, 4);
    const locked = COLUMNS.filter((c) => c.meta && c.meta.lock).length;
    stack.slice(0, locked).forEach((a) => {
      assertEqual(a.method, 'setColumnMeta');
      assertTrue(!('lock' in a.args[2]));
    });
    stack.slice(-locked).forEach((a) => {
      assertEqual(a.method, 'setColumnMeta');
      assertDeepEqual(a.args[2], COLUMNS.find((c) => c.id === a.args[1]).meta);
    });
  });

  test('ohne neue Zeilen null; ohne Wiederholungsspalten keine Formeln', () => {
    assertEqual(augmentStack(REF, COLUMNS, [], 4), null);
    const ref = { ...REF, meanColumnIds: [], lnVarColumnIds: [] };
    const cols = COLUMNS.filter((c) => !['m1', 'v1', 'm2', 'v2'].includes(c.id));
    const stack = augmentStack(ref, cols, rows, 4);
    assertEqual(stack.filter((a) => a.method === 'setFormula').length, 0);
    assertEqual(stack.filter((a) => a.method === 'setColumnMeta').length, 12);
  });

  test('verändert seine Argumente nicht', () => {
    const cols = COLUMNS.map((c) => Object.freeze({ ...c, meta: c.meta && Object.freeze({ ...c.meta }) }));
    const frozenRows = Object.freeze(rows.map((r) => Object.freeze([...r])));
    augmentStack(REF, Object.freeze(cols), frozenRows, 4);
  });
});

suite('doe-planner domain — responseSyncStack', () => {
  const before = [{ name: 'Yield', unit: '%' }, { name: 'Cost', unit: '€' }];

  test('unverändert → null', () => {
    assertEqual(responseSyncStack(REF, before, before.map((r) => ({ ...r }))), null);
  });

  test('Umbenennen → genau ein renameColumn', () => {
    const stack = responseSyncStack(REF, before, [{ name: 'Ausbeute', unit: '%' }, before[1]]);
    assertDeepEqual(stack, [call('renameColumn', ['sheet_1', 'y1', 'Ausbeute'])]);
  });

  test('ein geleerter Name nimmt den Vorgabenamen', () => {
    const stack = responseSyncStack(REF, before, [before[0], { name: '', unit: '€' }]);
    assertDeepEqual(stack, [call('renameColumn', ['sheet_1', 'y2', 'Y2'])]);
  });

  test('neue Zielgröße → angehängte Spalte mit meta: null', () => {
    const stack = responseSyncStack(REF, before, [...before, { name: 'Zeit', unit: 's' }]);
    assertEqual(stack.length, 2);
    const [write, role] = stack;
    assertEqual(write.method, 'writeColumns');
    assertEqual(write.id, 'response:2');
    assertDeepEqual(write.args, ['sheet_1', [{ to: 'append', name: 'Zeit', type: 'numeric', values: [], format: { decimals: 4 }, unit: 's' }]]);
    assertTrue(!('meta' in write.args[1][0]));
    assertDeepEqual(role, call('setColumnRole', ['sheet_1', { $from: 'response:2', path: 'value.0' }, 'continuous']));
  });

  test('entfernte Zielgröße → removeColumn samt ihren Hilfsspalten', () => {
    const stack = responseSyncStack(REF, before, [before[1]]);
    assertDeepEqual(stack, [
      call('removeColumn', ['sheet_1', 'y1']),
      call('removeColumn', ['sheet_1', 'm1']),
      call('removeColumn', ['sheet_1', 'v1']),
    ]);
  });

  test('der Plan nennt die Spalten der Zielgrößen danach', () => {
    const plan = responseSyncPlan(REF, before, [before[1], { name: 'Zeit', unit: 's' }]);
    assertDeepEqual(plan.responseColumnIds, ['y2', { $from: 'response:1', path: 'value.0' }]);
    assertDeepEqual(plan.meanColumnIds, ['m2', null]);
    assertDeepEqual(plan.lnVarColumnIds, ['v2', null]);
    const same = responseSyncPlan(REF, before, before);
    assertDeepEqual(same.stack, []);
    assertDeepEqual(same.responseColumnIds, ['y1', 'y2']);
  });
});
