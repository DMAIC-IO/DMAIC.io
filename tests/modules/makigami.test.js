/**
 * Unit tests for the Makigami module — Model + duration parser.
 * TDD spec written before the Model implementation (migration legacy → Alpine).
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import {
  parseDuration, formatDuration, canonicalize,
} from '../../js/modules/makigami/makigami-duration.js';
import {
  State,
  createDefaultMudaCategories,
  createDefaultTimeUnits,
} from '../../js/modules/makigami/makigami-model.js';

// ─── Duration parser ──────────────────────────────────────────

const UNITS = createDefaultTimeUnits();

suite('Makigami — duration parser', () => {
  test('empty input is valid and yields 0', () => {
    assertEqual(parseDuration('', UNITS).valid, true);
    assertEqual(parseDuration('', UNITS).seconds, 0);
    assertEqual(parseDuration(null, UNITS).valid, true);
  });

  test('single token', () => {
    assertEqual(parseDuration('45min', UNITS).seconds, 2700);
    assertEqual(parseDuration('45min', UNITS).valid, true);
  });

  test('multi token additive with 1d=28800s', () => {
    assertEqual(parseDuration('1d 5h 30min', UNITS).seconds, 28800 + 18000 + 1800);
    assertEqual(parseDuration('1h 1h', UNITS).seconds, 7200);
  });

  test('decimal comma and dot', () => {
    assertEqual(parseDuration('1,5h', UNITS).seconds, 5400);
    assertEqual(parseDuration('1.5h', UNITS).seconds, 5400);
  });

  test('invalid: no unit / unknown unit / negative', () => {
    assertEqual(parseDuration('5', UNITS).valid, false);
    assertEqual(parseDuration('5x', UNITS).valid, false);
    assertEqual(parseDuration('-1h', UNITS).valid, false);
  });

  test('no units configured → invalid', () => {
    assertEqual(parseDuration('1h', []).valid, false);
  });

  test('longest label wins (min over m)', () => {
    const u = [{ label: 'm', factorSeconds: 60 }, { label: 'min', factorSeconds: 60 }];
    assertEqual(parseDuration('5min', u).valid, true);
    assertEqual(parseDuration('5min', u).seconds, 300);
  });

  test('formatDuration greedy largest unit', () => {
    assertEqual(formatDuration(28800 + 18000 + 1800, UNITS), '1d 5h 30min');
    assertEqual(formatDuration(0, UNITS), '0s');
  });

  test('canonicalize valid roundtrips, invalid keeps text', () => {
    assertEqual(canonicalize('90min', UNITS).text, '1h 30min');
    assertEqual(canonicalize('90min', UNITS).valid, true);
    assertEqual(canonicalize('gibberish', UNITS).valid, false);
    assertEqual(canonicalize('gibberish', UNITS).text, 'gibberish');
  });
});

// ─── Model: defaults ──────────────────────────────────────────

suite('Makigami Model — defaults', () => {
  test('default factories', () => {
    assertEqual(createDefaultMudaCategories().length, 8);
    assertEqual(createDefaultTimeUnits().length, 4);
    assertEqual(createDefaultMudaCategories()[0].code, 'T');
    assertEqual(createDefaultTimeUnits()[3].factorSeconds, 28800);
  });

  test('constructor sets defaults', () => {
    const s = new State();
    assertEqual(s.title, '');
    assertEqual(s.roles.length, 0);
    assertEqual(s.steps.length, 0);
    assertEqual(s.mudaCategories.length, 8);
    assertEqual(s.timeUnits.length, 4);
    assertEqual(s.settingsOpen, false);
  });

  test('hasContent false when empty, true with roles or steps', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
    s.addRole();
    assertEqual(s.hasContent(), true);
    const s2 = new State();
    s2.addStep();
    assertEqual(s2.hasContent(), true);
  });
});

// ─── Model: serialization ─────────────────────────────────────

suite('Makigami Model — serialization', () => {
  test('toJSON shape matches legacy getState', () => {
    const s = new State();
    const j = s.toJSON();
    const keys = Object.keys(j).sort().join(',');
    assertEqual(keys, 'mudaCategories,roles,settingsOpen,steps,timeUnits,title');
  });

  test('fromJSON(null) → valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.roles.length, 0);
    assertEqual(s.mudaCategories.length, 8);
    assertEqual(s.timeUnits.length, 4);
  });

  test('fromJSON(undefined) → valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.timeUnits.length, 4);
  });

  test('fromJSON malformed → defaults', () => {
    const s = State.fromJSON({ roles: 'nope', steps: 42, title: 5 });
    assertEqual(s.roles.length, 0);
    assertEqual(s.steps.length, 0);
    assertEqual(s.title, '');
  });

  test('roundtrip lossless', () => {
    const s = new State();
    s.title = 'Order';
    s.addRole();
    s.roles[0].label = 'Customer';
    s.addStep();
    s.steps[0].title = 'Request';
    s.steps[0].processTime = '30min';
    s.steps[0].roleIds = [s.roles[0].id];
    const json = s.toJSON();
    const s2 = State.fromJSON(json);
    assertEqual(JSON.stringify(s2.toJSON()), JSON.stringify(json));
  });

  test('fromJSON restores steps with all fields', () => {
    const data = {
      title: 'X',
      roles: [{ id: 'r1', label: 'A' }],
      steps: [{
        id: 's1', title: 'T', description: 'D', roleIds: ['r1'],
        processTime: '1h', waitTime: '2h', mudaIds: ['muda-waiting'],
        notes: 'N', expanded: false,
      }],
    };
    const s = State.fromJSON(data);
    assertEqual(s.steps[0].title, 'T');
    assertEqual(s.steps[0].expanded, false);
    assertEqual(s.steps[0].roleIds[0], 'r1');
    assertEqual(s.steps[0].mudaIds[0], 'muda-waiting');
  });

  test('custom mudaCategories and timeUnits survive', () => {
    const data = {
      mudaCategories: [{ id: 'm1', code: 'X', label: 'Custom', color: '#123456' }],
      timeUnits: [{ id: 'u1', label: 'wk', factorSeconds: 144000 }],
    };
    const s = State.fromJSON(data);
    assertEqual(s.mudaCategories.length, 1);
    assertEqual(s.mudaCategories[0].code, 'X');
    assertEqual(s.timeUnits.length, 1);
    assertEqual(s.timeUnits[0].factorSeconds, 144000);
  });

  test('invalid time units are filtered', () => {
    const s = State.fromJSON({ timeUnits: [
      { id: 'u1', label: 'ok', factorSeconds: 60 },
      { id: 'u2', label: 'bad', factorSeconds: -5 },
      { id: 'u3', label: 'bad2', factorSeconds: 'x' },
    ] });
    assertEqual(s.timeUnits.length, 1);
  });
});

// ─── Model: business logic ────────────────────────────────────

suite('Makigami Model — business logic', () => {
  test('addRole / addStep', () => {
    const s = new State();
    s.addRole();
    s.addStep();
    assertEqual(s.roles.length, 1);
    assertEqual(s.steps.length, 1);
    assertEqual(s.steps[0].expanded, true);
    assertEqual(s.steps[0].roleIds.length, 0);
  });

  test('toggleParticipation on/off', () => {
    const s = new State();
    s.addRole();
    s.addStep();
    const rid = s.roles[0].id;
    const sid = s.steps[0].id;
    s.toggleParticipation(sid, rid);
    assertEqual(s.steps[0].roleIds.includes(rid), true);
    s.toggleParticipation(sid, rid);
    assertEqual(s.steps[0].roleIds.includes(rid), false);
  });

  test('toggleMuda on/off', () => {
    const s = new State();
    s.addStep();
    const sid = s.steps[0].id;
    s.toggleMuda(sid, 'muda-waiting');
    assertEqual(s.steps[0].mudaIds.includes('muda-waiting'), true);
    s.toggleMuda(sid, 'muda-waiting');
    assertEqual(s.steps[0].mudaIds.includes('muda-waiting'), false);
  });

  test('toggleStepExpanded', () => {
    const s = new State();
    s.addStep();
    const sid = s.steps[0].id;
    assertEqual(s.steps[0].expanded, true);
    s.toggleStepExpanded(sid);
    assertEqual(s.steps[0].expanded, false);
    s.toggleStepExpanded(sid);
    assertEqual(s.steps[0].expanded, true);
  });

  test('deleteRole removes role and its participation', () => {
    const s = new State();
    s.addRole();
    s.addStep();
    const rid = s.roles[0].id;
    s.toggleParticipation(s.steps[0].id, rid);
    s.deleteRole(rid);
    assertEqual(s.roles.length, 0);
    assertEqual(s.steps[0].roleIds.includes(rid), false);
  });

  test('deleteStep removes step', () => {
    const s = new State();
    s.addStep();
    s.addStep();
    const sid = s.steps[0].id;
    s.deleteStep(sid);
    assertEqual(s.steps.length, 1);
    assertEqual(s.steps.find(x => x.id === sid), undefined);
  });

  test('reorderSteps moves before target', () => {
    const s = new State();
    s.addStep(); s.addStep(); s.addStep();
    s.steps[0].title = 'A';
    s.steps[1].title = 'B';
    s.steps[2].title = 'C';
    // Drag C before A → C, A, B
    s.reorderSteps(s.steps[2].id, s.steps[0].id);
    assertEqual(s.steps.map(x => x.title).join(''), 'CAB');
  });

  test('reorderRoles moves before target', () => {
    const s = new State();
    s.addRole(); s.addRole(); s.addRole();
    s.roles[0].label = 'X';
    s.roles[1].label = 'Y';
    s.roles[2].label = 'Z';
    s.reorderRoles(s.roles[2].id, s.roles[0].id);
    assertEqual(s.roles.map(x => x.label).join(''), 'ZXY');
  });

  test('addMudaCategory / deleteMudaCategory drops references', () => {
    const s = new State();
    s.addStep();
    const sid = s.steps[0].id;
    const mid = s.mudaCategories[0].id;
    s.toggleMuda(sid, mid);
    s.deleteMudaCategory(mid);
    assertEqual(s.mudaCategories.find(m => m.id === mid), undefined);
    assertEqual(s.steps[0].mudaIds.includes(mid), false);
  });

  test('addTimeUnit / deleteTimeUnit', () => {
    const s = new State();
    s.addTimeUnit();
    assertEqual(s.timeUnits.length, 5);
    const uid = s.timeUnits[4].id;
    s.deleteTimeUnit(uid);
    assertEqual(s.timeUnits.length, 4);
  });

  test('resetSettings restores defaults and prunes stale muda refs', () => {
    const s = new State();
    s.addStep();
    s.mudaCategories.push({ id: 'custom-x', code: 'X', label: 'C', color: '#000' });
    s.toggleMuda(s.steps[0].id, 'custom-x');
    s.resetSettings();
    assertEqual(s.mudaCategories.length, 8);
    assertEqual(s.timeUnits.length, 4);
    assertEqual(s.steps[0].mudaIds.includes('custom-x'), false);
  });

  test('computeKPI sums process and wait, PCE', () => {
    const s = new State();
    s.addStep(); s.addStep();
    s.steps[0].processTime = '30min';
    s.steps[0].waitTime = '4h';
    s.steps[1].processTime = '1h';
    s.steps[1].waitTime = '1d';
    const kpi = s.computeKPI();
    assertEqual(kpi.process, 1800 + 3600); // 90min
    assertEqual(kpi.wait, 14400 + 28800);  // 12h
    assertEqual(kpi.lead, kpi.process + kpi.wait);
    assertAlmostEqual(kpi.pce, kpi.process / kpi.lead, 1e-9);
  });

  test('computeKPI ignores invalid durations', () => {
    const s = new State();
    s.addStep(); s.addStep();
    s.steps[0].processTime = 'gibberish';
    s.steps[1].processTime = '1h';
    assertEqual(s.computeKPI().process, 3600);
  });

  test('computeKPI pce null when lead is 0', () => {
    const s = new State();
    s.addStep();
    assertEqual(s.computeKPI().pce, null);
  });
});
