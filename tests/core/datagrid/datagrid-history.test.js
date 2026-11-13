/**
 * DataGrid-Verlauf (core/datagrid/datagrid-history.js) — Gruppen mit
 * begin/end, ohne Grid.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { History } from '../../../js/core/datagrid/datagrid-history.js';

suite('DataGrid History — Gruppen', () => {
  test('two actions between begin and end are one group entry', () => {
    const h = new History();
    h.begin();
    h.push({ type: 'a' });
    h.push({ type: 'b' });
    h.end();
    assertDeepEqual(h.undo(), { type: 'group', actions: [{ type: 'a' }, { type: 'b' }] });
    assertEqual(h.canUndo(), false);
  });

  test('empty group is dropped', () => {
    const h = new History();
    h.push({ type: 'x' });
    h.begin();
    h.end();
    assertEqual(h.peek()?.type, 'x');
    h.undo();
    assertEqual(h.canUndo(), false);
  });

  test('a single action in a group stays ungrouped', () => {
    const h = new History();
    h.begin();
    h.push({ type: 'a' });
    h.end();
    assertDeepEqual(h.undo(), { type: 'a' });
  });

  test('nested begin closes on outer end', () => {
    const h = new History();
    h.begin();
    h.push({ type: 'a' });
    h.begin();
    h.push({ type: 'b' });
    h.end();
    assertEqual(h.peek(), null, 'das innere end schließt nichts');
    h.push({ type: 'c' });
    h.end();
    assertDeepEqual(h.undo(), { type: 'group', actions: [{ type: 'a' }, { type: 'b' }, { type: 'c' }] });
    assertEqual(h.canUndo(), false);
  });

  test('end without begin does nothing', () => {
    const h = new History();
    h.end();
    h.push({ type: 'a' });
    h.push({ type: 'b' });
    assertEqual(h.undo().type, 'b');
    assertEqual(h.undo().type, 'a');
  });

  test('the first action of a group discards the redo entries', () => {
    const h = new History();
    h.push({ type: 'a' });
    h.undo();
    assertTrue(h.canRedo());
    h.begin();
    h.push({ type: 'b' });
    assertEqual(h.canRedo(), false);
    h.end();
    assertEqual(h.undo().type, 'b');
    assertEqual(h.canUndo(), false);
  });

  test('an open group with actions can be undone', () => {
    const h = new History();
    h.begin();
    h.push({ type: 'a' });
    h.push({ type: 'b' });
    assertTrue(h.canUndo());
    assertEqual(h.undo().type, 'group');
    assertTrue(h.canRedo());
    h.end();
    assertEqual(h.canUndo(), false, 'end legt nichts Zweites ab');
  });

  test('clear drops the collected actions, the group stays open', () => {
    const h = new History();
    h.begin();
    h.push({ type: 'a' });
    h.clear();
    h.push({ type: 'b' });
    h.push({ type: 'c' });
    h.end();
    assertDeepEqual(h.undo(), { type: 'group', actions: [{ type: 'b' }, { type: 'c' }] });
    assertEqual(h.canUndo(), false);
  });

  test('a group counts once against the depth', () => {
    const h = new History(2);
    h.push({ type: 'a' });
    h.begin();
    for (let i = 0; i < 5; i++) h.push({ type: `g${i}` });
    h.end();
    assertEqual(h.undo().type, 'group');
    assertEqual(h.undo().type, 'a');
  });
});
