/**
 * D.Mike — RACI Matrix Model unit tests (raci-matrix.test.js)
 *
 * Tests the pure business logic / state in raci-matrix-model.js:
 * constructor defaults, toJSON/fromJSON roundtrip & sanitization,
 * role get/set/cycle, add/remove activity+stakeholder with assignment
 * reindexing, moveActivity reindexing, rename, validation, hasContent().
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { State, ROLES } from '../../js/modules/raci-matrix/raci-matrix-model.js';

suite('RACI Matrix Model — defaults & serialization', () => {
  test('constructor seeds empty activities, stakeholders, assignments', () => {
    const s = new State();
    assertEqual(s.activities.length, 0);
    assertEqual(s.stakeholders.length, 0);
    assertEqual(Object.keys(s.assignments).length, 0);
  });

  test('ROLES export is R,A,C,I', () => {
    assertEqual(ROLES.join(''), 'RACI');
  });

  test('toJSON returns activities, stakeholders, assignments', () => {
    const s = new State();
    s.addActivity('Task');
    s.addStakeholder('Person');
    s.setRole(0, 0, 'R');
    const j = s.toJSON();
    assertEqual(Array.isArray(j.activities), true);
    assertEqual(Array.isArray(j.stakeholders), true);
    assertEqual(typeof j.assignments, 'object');
    assertEqual(j.activities[0], 'Task');
    assertEqual(j.stakeholders[0], 'Person');
    assertEqual(j.assignments['0:0'], 'R');
  });

  test('toJSON returns independent copies (no aliasing)', () => {
    const s = new State();
    s.addActivity('A');
    const j = s.toJSON();
    j.activities.push('Mutated');
    j.assignments['9:9'] = 'I';
    assertEqual(s.activities.length, 1);
    assertEqual(s.assignments['9:9'], undefined);
  });

  test('fromJSON(null) returns valid empty default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.activities.length, 0);
    assertEqual(s.stakeholders.length, 0);
    assertEqual(Object.keys(s.assignments).length, 0);
  });

  test('fromJSON(undefined) returns valid empty default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.activities.length, 0);
    assertEqual(s.stakeholders.length, 0);
  });

  test('fromJSON restores data', () => {
    const s = State.fromJSON({
      activities: ['T1', 'T2'],
      stakeholders: ['P1'],
      assignments: { '0:0': 'R', '1:0': 'A' },
    });
    assertEqual(s.activities.length, 2);
    assertEqual(s.stakeholders.length, 1);
    assertEqual(s.getRole(0, 0), 'R');
    assertEqual(s.getRole(1, 0), 'A');
  });

  test('fromJSON sanitizes invalid fields to defaults', () => {
    const s = State.fromJSON({ activities: 'nope', stakeholders: 42, assignments: 'x' });
    assertEqual(Array.isArray(s.activities), true);
    assertEqual(s.activities.length, 0);
    assertEqual(Array.isArray(s.stakeholders), true);
    assertEqual(s.stakeholders.length, 0);
    assertEqual(typeof s.assignments, 'object');
    assertEqual(Object.keys(s.assignments).length, 0);
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const s = new State();
    s.addActivity('Task A');
    s.addActivity('Task B');
    s.addStakeholder('Person X');
    s.setRole(0, 0, 'A');
    s.setRole(1, 0, 'C');
    const r = State.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    assertEqual(r.activities.join(','), 'Task A,Task B');
    assertEqual(r.stakeholders.join(','), 'Person X');
    assertEqual(r.getRole(0, 0), 'A');
    assertEqual(r.getRole(1, 0), 'C');
  });
});

suite('RACI Matrix Model — roles', () => {
  test('key formats a:s', () => {
    const s = new State();
    assertEqual(s.key(2, 3), '2:3');
  });

  test('getRole returns empty string when unset', () => {
    const s = new State();
    assertEqual(s.getRole(0, 0), '');
  });

  test('setRole stores and clears', () => {
    const s = new State();
    s.setRole(0, 0, 'R');
    assertEqual(s.getRole(0, 0), 'R');
    s.setRole(0, 0, '');
    assertEqual(s.getRole(0, 0), '');
    assertEqual(s.assignments['0:0'], undefined);
  });

  test('cycleRole cycles empty → R → A → C → I → empty', () => {
    const s = new State();
    assertEqual(s.getRole(0, 0), '');
    s.cycleRole(0, 0); assertEqual(s.getRole(0, 0), 'R');
    s.cycleRole(0, 0); assertEqual(s.getRole(0, 0), 'A');
    s.cycleRole(0, 0); assertEqual(s.getRole(0, 0), 'C');
    s.cycleRole(0, 0); assertEqual(s.getRole(0, 0), 'I');
    s.cycleRole(0, 0); assertEqual(s.getRole(0, 0), '');
  });
});

suite('RACI Matrix Model — add / rename', () => {
  test('addActivity trims and pushes; ignores empty', () => {
    const s = new State();
    s.addActivity('  Task  ');
    s.addActivity('   ');
    s.addActivity('');
    assertEqual(s.activities.length, 1);
    assertEqual(s.activities[0], 'Task');
  });

  test('addStakeholder trims and pushes; ignores empty', () => {
    const s = new State();
    s.addStakeholder('  Person ');
    s.addStakeholder('  ');
    assertEqual(s.stakeholders.length, 1);
    assertEqual(s.stakeholders[0], 'Person');
  });

  test('renameActivity commits trimmed non-empty changed value', () => {
    const s = new State();
    s.addActivity('Old');
    s.renameActivity(0, '  New  ');
    assertEqual(s.activities[0], 'New');
    s.renameActivity(0, '   ');
    assertEqual(s.activities[0], 'New');
    s.renameActivity(0, 'New');
    assertEqual(s.activities[0], 'New');
  });

  test('renameStakeholder commits trimmed non-empty value', () => {
    const s = new State();
    s.addStakeholder('Old');
    s.renameStakeholder(0, 'New');
    assertEqual(s.stakeholders[0], 'New');
  });
});

suite('RACI Matrix Model — remove with reindexing', () => {
  test('removeActivity drops row and reindexes assignments', () => {
    const s = State.fromJSON({
      activities: ['A0', 'A1', 'A2'],
      stakeholders: ['S0'],
      assignments: { '0:0': 'R', '2:0': 'A' },
    });
    s.removeActivity(1);
    assertEqual(s.activities.join(','), 'A0,A2');
    assertEqual(s.getRole(0, 0), 'R'); // A0 unchanged
    assertEqual(s.getRole(1, 0), 'A'); // A2 shifted from idx 2 → 1
  });

  test('removeActivity drops assignments belonging to the removed row', () => {
    const s = State.fromJSON({
      activities: ['X', 'Y', 'Z'],
      stakeholders: ['S'],
      assignments: { '0:0': 'R', '2:0': 'R' },
    });
    s.removeActivity(0);
    assertEqual(s.activities.join(','), 'Y,Z');
    assertEqual(s.getRole(0, 0), ''); // Y had nothing
    assertEqual(s.getRole(1, 0), 'R'); // Z shifted 2 → 1
  });

  test('removeStakeholder drops column and reindexes assignments', () => {
    const s = State.fromJSON({
      activities: ['Task'],
      stakeholders: ['S0', 'S1', 'S2'],
      assignments: { '0:0': 'R', '0:2': 'A' },
    });
    s.removeStakeholder(1);
    assertEqual(s.stakeholders.join(','), 'S0,S2');
    assertEqual(s.getRole(0, 0), 'R');
    assertEqual(s.getRole(0, 1), 'A'); // S2 shifted 2 → 1
  });
});

suite('RACI Matrix Model — moveActivity', () => {
  test('move upward reindexes assignments', () => {
    const s = State.fromJSON({
      activities: ['First', 'Second', 'Third'],
      stakeholders: ['P'],
      assignments: { '0:0': 'R', '1:0': 'R', '2:0': 'R' },
    });
    s.moveActivity(2, 0);
    assertEqual(s.activities.join(','), 'Third,First,Second');
    assertEqual(s.getRole(0, 0), 'R');
    assertEqual(s.getRole(1, 0), 'R');
    assertEqual(s.getRole(2, 0), 'R');
  });

  test('move downward reindexes assignments', () => {
    const s = State.fromJSON({
      activities: ['A0', 'A1', 'A2'],
      stakeholders: ['P'],
      assignments: { '0:0': 'R', '1:0': 'A', '2:0': 'C' },
    });
    s.moveActivity(0, 2);
    assertEqual(s.activities.join(','), 'A1,A2,A0');
    assertEqual(s.getRole(0, 0), 'A'); // A1
    assertEqual(s.getRole(1, 0), 'C'); // A2
    assertEqual(s.getRole(2, 0), 'R'); // A0
  });

  test('move to same index is a no-op', () => {
    const s = State.fromJSON({
      activities: ['A', 'B'],
      stakeholders: ['P'],
      assignments: { '0:0': 'R' },
    });
    s.moveActivity(1, 1);
    assertEqual(s.activities.join(','), 'A,B');
    assertEqual(s.getRole(0, 0), 'R');
  });
});

suite('RACI Matrix Model — validation', () => {
  test('warns noR and noA when a row has no roles', () => {
    const s = State.fromJSON({
      activities: ['Task'],
      stakeholders: ['P1', 'P2'],
      assignments: {},
    });
    const w = s.validate();
    assertEqual(w.length, 1);
    assertEqual(w[0].aIdx, 0);
    assertEqual(w[0].issues.includes('noR'), true);
    assertEqual(w[0].issues.includes('noA'), true);
  });

  test('warns multiA when two A in same row', () => {
    const s = State.fromJSON({
      activities: ['Task'],
      stakeholders: ['P1', 'P2'],
      assignments: { '0:0': 'A', '0:1': 'A' },
    });
    const w = s.validate();
    assertEqual(w.length, 1);
    assertEqual(w[0].issues.includes('multiA'), true);
  });

  test('no warnings when R and exactly one A assigned', () => {
    const s = State.fromJSON({
      activities: ['Task'],
      stakeholders: ['P1', 'P2'],
      assignments: { '0:0': 'R', '0:1': 'A' },
    });
    const w = s.validate();
    assertEqual(w.length, 0);
  });
});

suite('RACI Matrix Model — hasContent', () => {
  test('false when empty', () => {
    assertEqual(new State().hasContent(), false);
  });
  test('true when an activity exists', () => {
    const s = new State();
    s.addActivity('Task');
    assertEqual(s.hasContent(), true);
  });
  test('true when a stakeholder exists', () => {
    const s = new State();
    s.addStakeholder('Person');
    assertEqual(s.hasContent(), true);
  });
});
