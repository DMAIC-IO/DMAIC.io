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

/** @param {string} method @param {object} cmd the command object */
const call = (method, cmd) => ({ op: 'instance.call', module: 'worksheet', instance: 'ws1', method, args: [cmd] });

/** @param {any} meta @returns {any} meta without its lock */
const unlocked = (meta) => { const { lock, ...rest } = meta; return rest; };

suite('doe-planner domain — augmentStack', () => {
  const rows = [[150, 'Stahl'], [200, 'Kupfer']];

  test('hebt die Sperren auf, hängt Zeilen an, schreibt Werte und Formeln, setzt die Sperren wieder', () => {
    const stack = augmentStack(REF, COLUMNS, rows, 4);
    const locked = COLUMNS.filter((c) => c.meta && c.meta.lock);
    assertDeepEqual(stack, [
      ...locked.map((c) => call('setColumnMeta', { sheetId: 'sheet_1', columnId: c.id, meta: unlocked(c.meta) })),
      call('addRows', { sheetId: 'sheet_1', count: 2 }),
      call('setCells', { sheetId: 'sheet_1', columnId: 'run', startRow: 4, values: [5, 6] }),
      call('setCells', { sheetId: 'sheet_1', columnId: 'std', startRow: 4, values: [5, 6] }),
      call('setCells', { sheetId: 'sheet_1', columnId: 'blk', startRow: 4, values: [1, 1] }),
      call('setCells', { sheetId: 'sheet_1', columnId: 'rep', startRow: 4, values: [1, 1] }),
      call('setCells', { sheetId: 'sheet_1', columnId: 'fa', startRow: 4, values: [150, 200] }),
      call('setCells', { sheetId: 'sheet_1', columnId: 'fm', startRow: 4, values: ['Stahl', 'Kupfer'] }),
      call('setFormula', { sheetId: 'sheet_1', columnId: 'm1', row: 4, formula: "=AVERAGEIF('StdOrder'; 'StdOrder'[5]; 'Yield')" }),
      call('setFormula', { sheetId: 'sheet_1', columnId: 'm1', row: 5, formula: "=AVERAGEIF('StdOrder'; 'StdOrder'[6]; 'Yield')" }),
      call('setFormula', { sheetId: 'sheet_1', columnId: 'v1', row: 4, formula: "=LN(VARIF('StdOrder'; 'StdOrder'[5]; 'Yield'))" }),
      call('setFormula', { sheetId: 'sheet_1', columnId: 'v1', row: 5, formula: "=LN(VARIF('StdOrder'; 'StdOrder'[6]; 'Yield'))" }),
      call('setFormula', { sheetId: 'sheet_1', columnId: 'm2', row: 4, formula: "=AVERAGEIF('StdOrder'; 'StdOrder'[5]; 'Cost')" }),
      call('setFormula', { sheetId: 'sheet_1', columnId: 'm2', row: 5, formula: "=AVERAGEIF('StdOrder'; 'StdOrder'[6]; 'Cost')" }),
      call('setFormula', { sheetId: 'sheet_1', columnId: 'v2', row: 4, formula: "=LN(VARIF('StdOrder'; 'StdOrder'[5]; 'Cost'))" }),
      call('setFormula', { sheetId: 'sheet_1', columnId: 'v2', row: 5, formula: "=LN(VARIF('StdOrder'; 'StdOrder'[6]; 'Cost'))" }),
      ...locked.map((c) => call('setColumnMeta', { sheetId: 'sheet_1', columnId: c.id, meta: c.meta })),
    ]);
  });

  test('erste Aktionen ohne lock, letzte mit dem alten meta', () => {
    const stack = augmentStack(REF, COLUMNS, rows, 4);
    const locked = COLUMNS.filter((c) => c.meta && c.meta.lock).length;
    stack.slice(0, locked).forEach((a) => {
      assertEqual(a.method, 'setColumnMeta');
      assertTrue(!('lock' in a.args[0].meta));
    });
    stack.slice(-locked).forEach((a) => {
      assertEqual(a.method, 'setColumnMeta');
      assertDeepEqual(a.args[0].meta, COLUMNS.find((c) => c.id === a.args[0].columnId).meta);
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
  const SHEET = { columns: COLUMNS, names: { meanSuffix: 'Mean', lnVarSuffix: 'lnVar' } };
  /** @param {string} id @returns {any} the meta of that column */
  const relock = (id) => COLUMNS.find((c) => c.id === id).meta;

  test('unverändert → null; nur die Einheit geändert → null', () => {
    assertEqual(responseSyncStack(REF, before, before.map((r) => ({ ...r })), SHEET), null);
    assertEqual(responseSyncStack(REF, before, [{ name: 'Yield', unit: 'g' }, before[1]], SHEET), null);
  });

  test('Umbenennen → renameColumn der Spalte und ihrer Hilfsspalten', () => {
    const stack = responseSyncStack(REF, before, [{ name: 'Ausbeute', unit: '%' }, before[1]], SHEET);
    assertDeepEqual(stack, [
      call('renameColumn', { sheetId: 'sheet_1', columnId: 'y1', name: 'Ausbeute' }),
      call('setColumnMeta', { sheetId: 'sheet_1', columnId: 'm1', meta: unlocked(relock('m1')) }),
      call('renameColumn', { sheetId: 'sheet_1', columnId: 'm1', name: 'Ausbeute Mean' }),
      call('setColumnMeta', { sheetId: 'sheet_1', columnId: 'm1', meta: relock('m1') }),
      call('setColumnMeta', { sheetId: 'sheet_1', columnId: 'v1', meta: unlocked(relock('v1')) }),
      call('renameColumn', { sheetId: 'sheet_1', columnId: 'v1', name: 'Ausbeute lnVar' }),
      call('setColumnMeta', { sheetId: 'sheet_1', columnId: 'v1', meta: relock('v1') }),
    ]);
  });

  test('Umbenennen ohne Hilfsspalten → genau ein renameColumn', () => {
    const ref = { ...REF, meanColumnIds: [], lnVarColumnIds: [] };
    const stack = responseSyncStack(ref, before, [{ name: 'Ausbeute', unit: '%' }, before[1]], SHEET);
    assertDeepEqual(stack, [call('renameColumn', { sheetId: 'sheet_1', columnId: 'y1', name: 'Ausbeute' })]);
  });

  test('ein geleerter Name nimmt den Vorgabenamen', () => {
    const ref = { ...REF, meanColumnIds: [], lnVarColumnIds: [] };
    const stack = responseSyncStack(ref, before, [before[0], { name: '', unit: '€' }], SHEET);
    assertDeepEqual(stack, [call('renameColumn', { sheetId: 'sheet_1', columnId: 'y2', name: 'Y2' })]);
  });

  test('Umsortieren oder mehrere Änderungen zugleich → null', () => {
    assertEqual(responseSyncStack(REF, before, [before[1], before[0]], SHEET), null);
    assertEqual(responseSyncPlan(REF, before, [before[1], before[0]], SHEET), null);
    assertEqual(responseSyncStack(REF, before, [before[1], { name: 'Zeit', unit: 's' }], SHEET), null);
    assertEqual(responseSyncStack(REF, before, [{ name: 'Zeit', unit: 's' }, ...before], SHEET), null);
    assertEqual(responseSyncStack(REF, before, [], SHEET), null);
  });

  test('neue Zielgröße → angehängte Spalte mit meta: null', () => {
    const stack = responseSyncStack(REF, before, [...before, { name: 'Zeit', unit: 's' }], SHEET);
    assertEqual(stack.length, 2);
    const [write, role] = stack;
    assertEqual(write.method, 'writeColumns');
    assertEqual(write.id, 'response:2');
    assertDeepEqual(write.args, [{ sheetId: 'sheet_1', columns: [{ to: 'append', name: 'Zeit', type: 'numeric', values: [], format: { decimals: 4 }, unit: 's' }] }]);
    assertTrue(!('meta' in write.args[0].columns[0]));
    assertDeepEqual(role, call('setColumnRole', { sheetId: 'sheet_1', columnId: { $from: 'response:2', path: 'value.0' }, role: 'continuous' }));
  });

  test('entfernte Zielgröße → removeColumn samt ihren Hilfsspalten', () => {
    const stack = responseSyncStack(REF, before, [before[1]], SHEET);
    assertDeepEqual(stack, [
      call('removeColumn', { sheetId: 'sheet_1', columnId: 'y1' }),
      call('removeColumn', { sheetId: 'sheet_1', columnId: 'm1' }),
      call('removeColumn', { sheetId: 'sheet_1', columnId: 'v1' }),
    ]);
  });

  test('eine von zwei gleichen Zielgrößen entfernt → null (unklar welche)', () => {
    const blank = [{ name: '', unit: '' }, { name: '', unit: '' }];
    assertEqual(responseSyncStack(REF, blank, [{ name: '', unit: '' }], SHEET), null);
    assertEqual(responseSyncPlan(REF, blank, [{ name: '', unit: '' }], SHEET), null);
    const twins = [{ name: 'A', unit: '' }, { name: 'A', unit: '' }];
    assertEqual(responseSyncStack(REF, twins, [{ name: 'A', unit: '' }], SHEET), null);
  });

  test('zweite Zielgröße entfernt → Spalte der Position 1', () => {
    const ab = [{ name: 'A', unit: '' }, { name: 'B', unit: '' }];
    assertDeepEqual(responseSyncStack(REF, ab, [{ name: 'A', unit: '' }], SHEET), [
      call('removeColumn', { sheetId: 'sheet_1', columnId: 'y2' }),
      call('removeColumn', { sheetId: 'sheet_1', columnId: 'm2' }),
      call('removeColumn', { sheetId: 'sheet_1', columnId: 'v2' }),
    ]);
  });

  test('der Plan nennt die Spalten der Zielgrößen danach', () => {
    const added = responseSyncPlan(REF, before, [...before, { name: 'Zeit', unit: 's' }], SHEET);
    assertDeepEqual(added.responseColumnIds, ['y1', 'y2', { $from: 'response:2', path: 'value.0' }]);
    assertDeepEqual(added.meanColumnIds, ['m1', 'm2', null]);
    assertDeepEqual(added.lnVarColumnIds, ['v1', 'v2', null]);
    const removed = responseSyncPlan(REF, before, [before[1]], SHEET);
    assertDeepEqual(removed.responseColumnIds, ['y2']);
    assertDeepEqual(removed.meanColumnIds, ['m2']);
    const same = responseSyncPlan(REF, before, before, SHEET);
    assertDeepEqual(same.stack, []);
    assertDeepEqual(same.responseColumnIds, ['y1', 'y2']);
  });
});

suite('doe-planner domain — Merkmale ohne Nullwerte', () => {
  /** @param {any[]} stack */
  const metas = (stack) => stack.filter((a) => a.method === 'setColumnMeta').map((a) => a.args[0].meta);
  const noNull = (meta) => Object.values(meta).every((v) => v !== null && v !== undefined);

  test('kein gesendetes meta enthält null, auch nicht aus alten Blättern mit managedRef: null', () => {
    const old = COLUMNS.map((c) => (c.meta ? { ...c, meta: { ...c.meta, managedRef: null } } : c));
    const aug = augmentStack(REF, old, [[150, 'Stahl']], 4);
    const ren = responseSyncStack(REF, [{ name: 'Yield' }, { name: 'Cost' }], [{ name: 'Y' }, { name: 'Cost' }], { columns: old, names: { meanSuffix: 'Mean', lnVarSuffix: 'lnVar' } });
    const all = [...metas(aug), ...metas(ren)];
    assertTrue(all.length > 0);
    for (const m of all) assertTrue(noNull(m), JSON.stringify(m));
    assertTrue(all.every((m) => !('managedRef' in m)));
  });
});
