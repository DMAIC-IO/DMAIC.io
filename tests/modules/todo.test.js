import { suite, test, assertEqual, assertArrayAlmostEqual } from '../test-utils.js';
import { Item, State, STATUSES, statusCounts, isOverdue, nextDueItems } from '../../js/modules/todo/todo-model.js';

suite('Todo Model — Item', () => {
  test('constructor sets default values', () => {
    const item = new Item();
    assertEqual(item.text, '');
    assertEqual(item.owner, '');
    assertEqual(item.due, '');
    assertEqual(item.status, 'open');
    assertEqual(item.cal, false);
    assertEqual(typeof item.id, 'string');
    assertEqual(item.id.length > 0, true);
  });

  test('toJSON returns expected shape', () => {
    const item = new Item();
    item.id = 'test-id';
    item.text = 'Test Aufgabe';
    item.owner = 'Max';
    item.due = '2026-12-31';
    item.status = 'in-progress';
    item.cal = true;

    const json = item.toJSON();
    assertEqual(json.id, 'test-id');
    assertEqual(json.text, 'Test Aufgabe');
    assertEqual(json.owner, 'Max');
    assertEqual(json.due, '2026-12-31');
    assertEqual(json.status, 'in-progress');
    assertEqual(json.cal, true);
  });

  test('fromJSON restores all fields', () => {
    const json = {
      id: 'restored-id',
      text: 'Restore Test',
      owner: 'Erika',
      due: '2026-06-15',
      status: 'done',
      cal: true,
    };
    const item = Item.fromJSON(json);
    assertEqual(item.id, 'restored-id');
    assertEqual(item.text, 'Restore Test');
    assertEqual(item.owner, 'Erika');
    assertEqual(item.due, '2026-06-15');
    assertEqual(item.status, 'done');
    assertEqual(item.cal, true);
  });

  test('fromJSON(null) returns valid default', () => {
    const item = Item.fromJSON(null);
    assertEqual(typeof item.id, 'string');
    assertEqual(item.text, '');
    assertEqual(item.owner, '');
    assertEqual(item.due, '');
    assertEqual(item.status, 'open');
    assertEqual(item.cal, false);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const item = Item.fromJSON(undefined);
    assertEqual(typeof item.id, 'string');
    assertEqual(item.status, 'open');
  });

  test('fromJSON sanitizes invalid status', () => {
    const item = Item.fromJSON({ status: 'invalid-status' });
    assertEqual(item.status, 'open');
  });

  test('fromJSON sanitizes non-string fields', () => {
    const item = Item.fromJSON({
      text: 123,
      owner: null,
      due: undefined,
      cal: 'not-boolean',
    });
    assertEqual(item.text, '');
    assertEqual(item.owner, '');
    assertEqual(item.due, '');
    assertEqual(item.cal, false);
  });

  test('toJSON → fromJSON round-trip', () => {
    const original = new Item();
    original.id = 'roundtrip-id';
    original.text = 'Roundtrip';
    original.owner = 'Tester';
    original.due = '2026-01-01';
    original.status = 'blocked';
    original.cal = true;

    const restored = Item.fromJSON(original.toJSON());
    assertEqual(restored.id, original.id);
    assertEqual(restored.text, original.text);
    assertEqual(restored.owner, original.owner);
    assertEqual(restored.due, original.due);
    assertEqual(restored.status, original.status);
    assertEqual(restored.cal, original.cal);
  });
});

suite('Todo Model — State', () => {
  test('constructor sets default values', () => {
    const state = new State();
    assertArrayAlmostEqual(state.items, []);
    assertEqual(state.filterStatus, 'all');
    assertEqual(state.filterOwner, 'all');
    assertEqual(state.search, '');
    assertEqual(state.sortCol, 'due');
    assertEqual(state.sortAsc, true);
  });

  test('toJSON returns expected shape', () => {
    const state = new State();
    state.items = [new Item()];
    state.items[0].id = 'item-1';
    state.items[0].text = 'Test';
    state.filterStatus = 'open';
    state.filterOwner = 'Max';
    state.search = 'query';
    state.sortCol = 'text';
    state.sortAsc = false;

    const json = state.toJSON();
    assertEqual(json.items.length, 1);
    assertEqual(json.items[0].id, 'item-1');
    assertEqual(json.filterStatus, 'open');
    assertEqual(json.filterOwner, 'Max');
    assertEqual(json.search, 'query');
    assertEqual(json.sortCol, 'text');
    assertEqual(json.sortAsc, false);
  });

  test('fromJSON restores all fields', () => {
    const json = {
      items: [
        { id: 'i1', text: 'A1', owner: 'Max', due: '2026-01-01', status: 'open', cal: false },
        { id: 'i2', text: 'A2', owner: 'Erika', due: '2026-12-31', status: 'done', cal: true },
      ],
      filterStatus: 'done',
      filterOwner: 'Erika',
      search: 'test',
      sortCol: 'owner',
      sortAsc: false,
    };
    const state = State.fromJSON(json);
    assertEqual(state.items.length, 2);
    assertEqual(state.items[0].text, 'A1');
    assertEqual(state.items[1].text, 'A2');
    assertEqual(state.items[1] instanceof Item, true);
    assertEqual(state.filterStatus, 'done');
    assertEqual(state.filterOwner, 'Erika');
    assertEqual(state.search, 'test');
    assertEqual(state.sortCol, 'owner');
    assertEqual(state.sortAsc, false);
  });

  test('fromJSON(null) returns valid default', () => {
    const state = State.fromJSON(null);
    assertArrayAlmostEqual(state.items, []);
    assertEqual(state.filterStatus, 'all');
    assertEqual(state.filterOwner, 'all');
    assertEqual(state.search, '');
    assertEqual(state.sortCol, 'due');
    assertEqual(state.sortAsc, true);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const state = State.fromJSON(undefined);
    assertArrayAlmostEqual(state.items, []);
    assertEqual(state.filterStatus, 'all');
  });

  test('fromJSON sanitizes invalid filter status', () => {
    const state = State.fromJSON({ filterStatus: 'invalid' });
    assertEqual(state.filterStatus, 'all');
  });

  test('fromJSON sanitizes non-array items', () => {
    const state = State.fromJSON({ items: 'not-array' });
    assertArrayAlmostEqual(state.items, []);
  });

  test('fromJSON sanitizes non-boolean sortAsc', () => {
    const state = State.fromJSON({ sortAsc: 'yes' });
    assertEqual(state.sortAsc, true);
  });

  test('toJSON → fromJSON round-trip', () => {
    const original = new State();
    original.items = [new Item()];
    original.items[0].id = 'rt-1';
    original.items[0].text = 'Roundtrip';
    original.filterStatus = 'in-progress';
    original.filterOwner = 'Max';
    original.search = 'query';
    original.sortCol = 'status';
    original.sortAsc = false;

    const restored = State.fromJSON(original.toJSON());
    assertEqual(restored.items.length, 1);
    assertEqual(restored.items[0].id, 'rt-1');
    assertEqual(restored.items[0].text, 'Roundtrip');
    assertEqual(restored.filterStatus, 'in-progress');
    assertEqual(restored.filterOwner, 'Max');
    assertEqual(restored.search, 'query');
    assertEqual(restored.sortCol, 'status');
    assertEqual(restored.sortAsc, false);
  });

  test('hasContent returns false for empty state', () => {
    const state = new State();
    assertEqual(state.hasContent(), false);
  });

  test('hasContent returns true when items exist', () => {
    const state = new State();
    state.items = [new Item()];
    assertEqual(state.hasContent(), true);
  });
});

suite('Todo Model — State.moveItem (Bug 007)', () => {
  const stateWith = (...ids) => {
    const state = new State();
    state.items = ids.map(id => Item.fromJSON({ id, text: id }));
    return state;
  };
  const ids = (state) => state.items.map(i => i.id);

  test('moves an item before the target (downwards)', () => {
    const state = stateWith('a', 'b', 'c', 'd');
    state.moveItem('a', 'c');
    assertEqual(ids(state).join(), 'b,a,c,d');
  });

  test('moves an item before the target (upwards)', () => {
    const state = stateWith('a', 'b', 'c', 'd');
    state.moveItem('d', 'b');
    assertEqual(ids(state).join(), 'a,d,b,c');
  });

  test('switches the list to manual order', () => {
    const state = stateWith('a', 'b');
    assertEqual(state.sortCol, 'due');
    state.moveItem('b', 'a');
    assertEqual(state.sortCol, 'manual');
  });

  test('takes over the displayed order before moving', () => {
    const state = stateWith('a', 'b', 'c', 'd');
    // Displayed (sorted) order differs from the stored one.
    state.moveItem('a', 'b', ['c', 'b', 'd', 'a']);
    assertEqual(ids(state).join(), 'c,a,b,d');
  });

  test('items missing from the displayed order (filtered out) keep their relative place at the end', () => {
    const state = stateWith('a', 'b', 'c', 'd');
    state.moveItem('d', 'c', ['d', 'c']);
    assertEqual(ids(state).join(), 'd,c,a,b');
  });

  test('unknown ids or a self-move leave the order unchanged', () => {
    const state = stateWith('a', 'b', 'c');
    state.moveItem('x', 'a');
    state.moveItem('a', 'x');
    state.moveItem('b', 'b');
    assertEqual(ids(state).join(), 'a,b,c');
  });

  test('manual order survives a JSON roundtrip', () => {
    const state = stateWith('a', 'b', 'c');
    state.moveItem('c', 'a');
    const restored = State.fromJSON(state.toJSON());
    assertEqual(ids(restored).join(), 'c,a,b');
    assertEqual(restored.sortCol, 'manual');
  });
});

suite('Todo Model — STATUSES', () => {
  test('STATUSES contains all valid statuses', () => {
    assertEqual(STATUSES.length, 4);
    assertEqual(STATUSES.includes('open'), true);
    assertEqual(STATUSES.includes('in-progress'), true);
    assertEqual(STATUSES.includes('done'), true);
    assertEqual(STATUSES.includes('blocked'), true);
  });
});

suite('Todo Model — dashboard helpers', () => {
  const mk = (status, due = '') => Item.fromJSON({ id: `${status}-${due}`, text: status, status, due });

  test('statusCounts counts every status, zero when absent', () => {
    assertEqual(JSON.stringify(statusCounts([mk('open'), mk('open'), mk('blocked')])),
      JSON.stringify({ open: 2, 'in-progress': 0, done: 0, blocked: 1 }));
  });

  test('isOverdue: past due and not done; malformed or missing due never overdue', () => {
    assertEqual(isOverdue(mk('open', '2026-10-09'), '2026-10-10'), true);
    assertEqual(isOverdue(mk('open', '2026-10-10'), '2026-10-10'), false);
    assertEqual(isOverdue(mk('done', '2026-01-01'), '2026-10-10'), false);
    assertEqual(isOverdue(mk('open', '09.10.2026'), '2026-10-10'), false);
    assertEqual(isOverdue(mk('open', ''), '2026-10-10'), false);
  });

  test('nextDueItems: not done, by due date, undated and malformed last in stored order, capped', () => {
    const items = [mk('open', ''), mk('open', '2026-12-01'), mk('done', '2026-01-01'),
      mk('blocked', '2026-11-01'), mk('in-progress', 'x'), mk('open', '2026-11-15')];
    assertEqual(nextDueItems(items, 10).map(i => i.due).join('|'), '2026-11-01|2026-11-15|2026-12-01||x');
    assertEqual(nextDueItems(items, 2).length, 2);
  });
});
